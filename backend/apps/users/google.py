from django.conf import settings
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


class GoogleSignInUnavailable(Exception):
    """Google sign-in is not configured or Google's keys could not be fetched."""


class InvalidGoogleCredential(Exception):
    """The ID token is forged, expired, for another app, or unverified."""


def verify_google_credential(credential):
    """Return the claims of a Google ID token issued for this app.

    verify_oauth2_token checks the signature against Google's published keys,
    the expiry, the issuer and that the audience is our client ID.
    """
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    if not client_id:
        raise GoogleSignInUnavailable()

    try:
        claims = id_token.verify_oauth2_token(
            credential, google_requests.Request(), audience=client_id
        )
    except TransportError as exc:
        raise GoogleSignInUnavailable() from exc
    except (ValueError, GoogleAuthError) as exc:
        raise InvalidGoogleCredential() from exc

    if not claims.get("sub") or not claims.get("email"):
        raise InvalidGoogleCredential()
    # Without a verified email we cannot trust which address the account owns.
    if claims.get("email_verified") is not True:
        raise InvalidGoogleCredential()

    return claims
