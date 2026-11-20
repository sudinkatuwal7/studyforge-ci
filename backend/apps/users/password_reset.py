"""Public password reset endpoints with email, browser, and global limits."""

import binascii
import hashlib
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import caches
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


User = get_user_model()
logger = logging.getLogger(__name__)

REQUEST_MESSAGE = "If an eligible account exists, we will email a password reset link."
EMAIL_NOT_FOUND = {
    "code": "EMAIL_NOT_FOUND",
    "detail": "No account found with that email address.",
}
INVALID_LINK = {
    "code": "INVALID_RESET_LINK",
    "detail": "This reset link is invalid or expired.",
}
RESET_REQUEST_LIMITED = {
    "code": "RESET_REQUEST_LIMITED",
    "detail": "Too many password reset requests. Please try again later.",
}
RESET_WINDOW_SECONDS = 60 * 60
EMAIL_REQUEST_LIMIT = 3
BROWSER_REQUEST_LIMIT = 10
GLOBAL_REQUEST_LIMIT = 300
GLOBAL_WINDOW_SECONDS = 60
RESET_BROWSER_COOKIE = "studyforge_reset_browser"
RESET_BROWSER_COOKIE_SALT = "studyforge.password-reset.browser"
RESET_BROWSER_COOKIE_MAX_AGE = 2 * RESET_WINDOW_SECONDS
RESET_BROWSER_COOKIE_PATH = "/api/v1/auth/"


class ResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class ResetLinkSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=128)
    token = serializers.CharField(max_length=128)


class ResetConfirmSerializer(ResetLinkSerializer):
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)


def get_reset_browser_id(request):
    return request.get_signed_cookie(
        RESET_BROWSER_COOKIE,
        default=None,
        salt=RESET_BROWSER_COOKIE_SALT,
        max_age=RESET_BROWSER_COOKIE_MAX_AGE,
    )


def _consume_limit(kind, value, limit, window_seconds):
    digest = hashlib.sha256(f"{kind}:{value}".encode("utf-8")).hexdigest()
    key = f"password-reset:{kind}:{digest}"
    cache = caches["password_reset"]
    for _ in range(2):
        if cache.add(key, 1, timeout=window_seconds):
            return True
        try:
            return cache.incr(key) <= limit
        except ValueError:
            # The key expired between add() and incr(). Try a new window.
            continue
    return False


def _consume_email_limit(email):
    return _consume_limit("email", email, EMAIL_REQUEST_LIMIT, RESET_WINDOW_SECONDS)


def _consume_browser_limit(browser_id):
    return _consume_limit("browser", browser_id, BROWSER_REQUEST_LIMIT, RESET_WINDOW_SECONDS)


def _consume_global_limit():
    return _consume_limit("global", "reset-request", GLOBAL_REQUEST_LIMIT, GLOBAL_WINDOW_SECONDS)


def _eligible(user):
    return user is not None and user.is_active and user.has_usable_password()


def _user_from_uid(uid, *, for_update=False):
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        query = User.objects.select_for_update() if for_update else User.objects
        return query.filter(pk=user_id).first()
    except (TypeError, ValueError, OverflowError, UnicodeDecodeError, binascii.Error):
        return None


def _invalid_link_response():
    response = Response(INVALID_LINK, status=status.HTTP_400_BAD_REQUEST)
    response["Cache-Control"] = "no-store"
    return response


def _send_email(subject, body, recipient, *, purpose):
    try:
        accepted = send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [recipient])
    except Exception as exc:
        # Never log the recipient, body, link, or transport exception text.
        logger.error("Password reset %s email failed (%s).", purpose, type(exc).__name__)
        return False
    if accepted != 1:
        logger.error("Password reset %s email failed (not accepted).", purpose)
        return False
    return True


class _NoStoreAPIView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


@method_decorator(csrf_protect, name="dispatch")
class PasswordResetRequestView(_NoStoreAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        browser_id = get_reset_browser_id(request)
        if browser_id is None:
            return Response(RESET_REQUEST_LIMITED, status=status.HTTP_429_TOO_MANY_REQUESTS)

        try:
            if not _consume_browser_limit(browser_id) or not _consume_global_limit():
                return Response(RESET_REQUEST_LIMITED, status=status.HTTP_429_TOO_MANY_REQUESTS)
        except Exception:
            logger.warning("Password reset rate limiting is unavailable.")
            return Response(RESET_REQUEST_LIMITED, status=status.HTTP_429_TOO_MANY_REQUESTS)

        serializer = ResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        try:
            # Count every valid address, including ones without an account.
            allowed = _consume_email_limit(email)
        except Exception:
            # A broken rate-limit store fails closed before account lookup.
            logger.warning("Password reset rate limiting is unavailable.")
            return Response(RESET_REQUEST_LIMITED, status=status.HTTP_429_TOO_MANY_REQUESTS)

        users = list(User.objects.filter(email__iexact=email)[:2])
        if not users:
            return Response(EMAIL_NOT_FOUND, status=status.HTTP_404_NOT_FOUND)

        # Normal account creation prevents case-only duplicates. If legacy data
        # contains them, do not choose an arbitrary account for the reset link.
        if len(users) > 1:
            logger.warning("Password reset email lookup is ambiguous.")
            return Response({"detail": REQUEST_MESSAGE})

        user = users[0]

        if allowed:
            if _eligible(user):
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = default_token_generator.make_token(user)
                link = f"{settings.PASSWORD_RESET_FRONTEND_URL}/reset-password/{uid}/{token}"
                _send_email(
                    "Reset your StudyForge password",
                    "Use this link to reset your StudyForge password. "
                    "It expires in 60 minutes and works once.\n\n"
                    f"{link}\n\n"
                    "If you did not request this, you can ignore this email.",
                    user.email,
                    purpose="request",
                )

        return Response({"detail": REQUEST_MESSAGE})


@method_decorator(csrf_protect, name="dispatch")
class PasswordResetValidateView(_NoStoreAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = _user_from_uid(serializer.validated_data["uid"])
        if not _eligible(user) or not default_token_generator.check_token(
            user, serializer.validated_data["token"]
        ):
            return _invalid_link_response()

        return Response({"valid": True})


@method_decorator(csrf_protect, name="dispatch")
class PasswordResetConfirmView(_NoStoreAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            user = _user_from_uid(serializer.validated_data["uid"], for_update=True)
            if not _eligible(user) or not default_token_generator.check_token(
                user, serializer.validated_data["token"]
            ):
                return _invalid_link_response()

            try:
                validate_password(serializer.validated_data["new_password"], user=user)
            except DjangoValidationError as exc:
                return Response(
                    {"new_password": exc.messages},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.set_password(serializer.validated_data["new_password"])
            user.save(update_fields=["password"])
            outstanding = OutstandingToken.objects.filter(
                user=user,
                blacklistedtoken__isnull=True,
            )
            BlacklistedToken.objects.bulk_create(
                [BlacklistedToken(token=token) for token in outstanding],
                ignore_conflicts=True,
            )
            recipient = user.email

        _send_email(
            "Your StudyForge password was reset",
            "Your StudyForge password was reset. "
            "If you did not make this change, contact StudyForge support.",
            recipient,
            purpose="confirmation",
        )
        return Response({"detail": "Your password has been reset."})
