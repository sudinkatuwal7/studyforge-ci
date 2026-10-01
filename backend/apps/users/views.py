
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import AuthenticationFailed, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework.permissions import AllowAny, IsAuthenticated

from .serializers import PublicUserSerializer, RegisterSerializer

from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from django.conf import settings



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
        response.set_cookie(
            key="studyforge_refresh",
            value=serializer.validated_data["refresh"],
            max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            httponly=True,
            secure=not settings.DEBUG,
            samesite="Lax",
            path="/api/v1/auth/",
      )
        return response
       
    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'
        
@method_decorator(csrf_protect, name="dispatch")
class RefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'

    def post(self, request):
        refresh_token = request.COOKIES.get("studyforge_refresh")
        if not refresh_token:
            raise AuthenticationFailed("Refresh token is missing or invalid.")

        serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
        serializer.is_valid(raise_exception=True)

        return Response({"access": serializer.validated_data["access"]})
@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get("studyforge_refresh")

        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                # Still clear the cookie if the token is expired or invalid.
                pass

        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(
            "studyforge_refresh",
            path="/api/v1/auth/",
            samesite="Lax",
        )
        return response

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"user": PublicUserSerializer(request.user).data})