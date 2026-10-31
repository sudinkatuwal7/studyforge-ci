from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import (
    AuthenticationFailed,
    TokenBackendError,
    TokenError,
)
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.state import token_backend
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from .google import (
    GoogleSignInUnavailable,
    InvalidGoogleCredential,
    verify_google_credential,
)
from .serializers import (
    GoogleLoginSerializer,
    PublicUserSerializer,
    RegisterSerializer,
)


User = get_user_model()

REFRESH_COOKIE = "studyforge_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth/"


def set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response):
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, samesite="Lax")


def revoke_all_sessions_if_reused(refresh_token):
    """Blacklist every refresh token of a user whose used-up token came back.

    Rotation makes each refresh token single-use, so a genuine but blacklisted
    token means two parties hold copies of one login. We cannot tell which one
    is the attacker, so every session of that user ends.
    """
    try:
        # Checks signature and expiry, so a forged token cannot sign anyone out.
        payload = token_backend.decode(refresh_token, verify=True)
    except TokenBackendError:
        return

    if payload.get("token_type") != "refresh":
        return
    if not BlacklistedToken.objects.filter(token__jti=payload.get("jti")).exists():
        return

    active = OutstandingToken.objects.filter(
        user_id=payload.get("user_id"),
        blacklistedtoken__isnull=True,
    )
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in active],
        ignore_conflicts=True,
    )


@ensure_csrf_cookie
def csrf_cookie(request):
    return JsonResponse({"status": "ok"})


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response(
            {"user": PublicUserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TokenObtainPairSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        response = Response(
            {
                "access": serializer.validated_data["access"],
                "user": PublicUserSerializer(serializer.user).data,
            },
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, serializer.validated_data["refresh"])
        return response

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'


GOOGLE_FAILED = "Google sign-in failed."
GOOGLE_UNAVAILABLE = "Google sign-in is not available right now."
EMAIL_TAKEN = "An account with this email already exists."
ACCOUNT_DEACTIVATED = "This account has been deactivated."


@method_decorator(csrf_protect, name="dispatch")
class GoogleLoginView(APIView):
    """Sign in or sign up with a Google ID token from Google Identity Services.

    Accounts are matched by Google's permanent "sub" id, never by email, so a
    changed Google email still reaches the same account. An email that already
    belongs to an unlinked account is refused rather than linked: registration
    does not verify email ownership, so linking would let whoever registered
    that address first keep access to the Google user's account.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'

    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            claims = verify_google_credential(serializer.validated_data["credential"])
        except GoogleSignInUnavailable:
            return Response(
                {"detail": GOOGLE_UNAVAILABLE},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except InvalidGoogleCredential:
            return Response(
                {"detail": GOOGLE_FAILED},
                status=status.HTTP_401_UNAUTHORIZED,
                headers={"WWW-Authenticate": self.get_authenticate_header(request)},
            )

        user = User.objects.filter(google_sub=claims["sub"]).first()
        if user is None:
            user = self.create_user(claims)
            if user is None:
                return Response({"detail": EMAIL_TAKEN}, status=status.HTTP_409_CONFLICT)

        # RefreshToken.for_user does not check is_active, so check it here.
        if not user.is_active:
            return Response(
                {"detail": ACCOUNT_DEACTIVATED},
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = RefreshToken.for_user(user)
        response = Response(
            {
                "access": str(refresh.access_token),
                "user": PublicUserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, str(refresh))
        return response

    def create_user(self, claims):
        """Create the Google user, or return None if the email is taken."""
        email = claims["email"].strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            return None

        try:
            with transaction.atomic():
                # No password: create_user stores an unusable one.
                return User.objects.create_user(
                    email=email,
                    first_name=claims.get("given_name", "")[:150],
                    last_name=claims.get("family_name", "")[:150],
                    google_sub=claims["sub"],
                )
        except IntegrityError:
            # A concurrent request created this Google user or took the email.
            return User.objects.filter(google_sub=claims["sub"]).first()


@method_decorator(csrf_protect, name="dispatch")
class RefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'

    def post(self, request):
        refresh_token = request.COOKIES.get(REFRESH_COOKIE)
        if not refresh_token:
            raise AuthenticationFailed("Refresh token is missing or invalid.")

        revoke_all_sessions_if_reused(refresh_token)
        serializer = TokenRefreshSerializer(data={"refresh": refresh_token})

        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, User.DoesNotExist, AuthenticationFailed):
            response = Response(
                {"detail": "Refresh token is missing or invalid."},
                status=status.HTTP_401_UNAUTHORIZED,
                headers={
                    "WWW-Authenticate": self.get_authenticate_header(request)
                },
            )
            clear_refresh_cookie(response)
            return response

        # The rotated refresh token goes only in the HttpOnly cookie, never the body.
        response = Response({"access": serializer.validated_data["access"]})
        set_refresh_cookie(response, serializer.validated_data["refresh"])
        return response


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get(REFRESH_COOKIE)

        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                # Still clear the cookie if the token is expired or invalid.
                pass

        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"user": PublicUserSerializer(request.user).data})
