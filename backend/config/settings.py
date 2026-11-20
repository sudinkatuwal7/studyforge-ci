"""Django settings for StudyForge."""

import os
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from datetime import timedelta

from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

# Local development: load backend/.env if present. Production should set
# process environment (e.g. /etc/studyforge.env) instead of committing secrets.
load_dotenv(BASE_DIR / ".env")


def _env_bool(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


def _env_csv(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-studyforge-local-development-only",
)

# Default on for local. Set DJANGO_DEBUG=0 in production.
DEBUG = _env_bool("DJANGO_DEBUG", "1")

ALLOWED_HOSTS = _env_csv(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1,host.docker.internal",
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.knowledge",
    "apps.users.apps.UsersConfig",
    "apps.courses",
    "apps.conversations.apps.ConversationsConfig",
    "apps.documents.apps.DocumentsConfig",
    "apps.notes",
    "apps.quizzes.apps.QuizzesConfig",
    "apps.agent.apps.AgentConfig",
]
AUTH_USER_MODEL = "users.User"
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

AUTH_USER_MODEL = "users.User"

# Default is the Docker Compose Postgres database. Set DATABASE_ENGINE=sqlite3
# to keep using the local SQLite file.
if os.environ.get("DATABASE_ENGINE", "postgresql") == "sqlite3":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    _postgres_options = {"connect_timeout": int(os.environ.get("POSTGRES_CONNECT_TIMEOUT", "3"))}
    if os.environ.get("POSTGRES_SSLMODE"):
        _postgres_options["sslmode"] = os.environ["POSTGRES_SSLMODE"]
    if os.environ.get("POSTGRES_SSLROOTCERT"):
        _postgres_options["sslrootcert"] = os.environ["POSTGRES_SSLROOTCERT"]
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "studyforge"),
            "USER": os.environ.get("POSTGRES_USER", "studyforge"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "studyforge_dev"),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "OPTIONS": _postgres_options,
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = Path(os.environ.get("STATIC_ROOT", str(BASE_DIR / "staticfiles")))

# Private uploads: no public media route is registered.
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media")))
DOCUMENT_STORAGE_BACKEND = os.environ.get("DOCUMENT_STORAGE_BACKEND", "filesystem").strip().lower()
if DOCUMENT_STORAGE_BACKEND not in {"filesystem", "s3"}:
    raise ImproperlyConfigured("DOCUMENT_STORAGE_BACKEND must be filesystem or s3.")
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
if DOCUMENT_STORAGE_BACKEND == "s3":
    from botocore.config import Config

    bucket = os.environ.get("DOCUMENT_STORAGE_BUCKET", "").strip()
    region = os.environ.get("DOCUMENT_STORAGE_REGION", "").strip()
    endpoint = os.environ.get("DOCUMENT_STORAGE_ENDPOINT_URL", "").strip()
    access_key = os.environ.get("DOCUMENT_STORAGE_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("DOCUMENT_STORAGE_SECRET_ACCESS_KEY", "").strip()
    if not bucket or not region or bool(access_key) != bool(secret_key):
        raise ImproperlyConfigured("S3 storage needs a bucket, region, and a complete credential pair if keys are used.")
    if endpoint:
        parsed = urlsplit(endpoint)
        if not parsed.netloc or parsed.scheme not in {"https", "http"} or parsed.username or parsed.password:
            raise ImproperlyConfigured("DOCUMENT_STORAGE_ENDPOINT_URL is invalid.")
        if parsed.scheme == "http" and not _env_bool("DOCUMENT_STORAGE_ALLOW_HTTP"):
            raise ImproperlyConfigured("S3 storage requires HTTPS unless local HTTP is explicitly enabled.")
    addressing_style = os.environ.get("DOCUMENT_STORAGE_ADDRESSING_STYLE", "path" if endpoint else "auto").strip()
    if addressing_style not in {"auto", "path", "virtual"}:
        raise ImproperlyConfigured("DOCUMENT_STORAGE_ADDRESSING_STYLE is invalid.")
    options = {
        "bucket_name": bucket,
        "region_name": region,
        "default_acl": None,
        "querystring_auth": True,
        "file_overwrite": False,
        "client_config": Config(
            connect_timeout=int(os.environ.get("DOCUMENT_STORAGE_CONNECT_TIMEOUT", "3")),
            read_timeout=int(os.environ.get("DOCUMENT_STORAGE_READ_TIMEOUT", "10")),
            retries={"max_attempts": 2},
            s3={"addressing_style": addressing_style},
        ),
    }
    if endpoint:
        options["endpoint_url"] = endpoint
    if access_key:
        options.update(access_key=access_key, secret_key=secret_key)
    if os.environ.get("DOCUMENT_STORAGE_SESSION_TOKEN"):
        options["security_token"] = os.environ["DOCUMENT_STORAGE_SESSION_TOKEN"]
    if os.environ.get("DOCUMENT_STORAGE_CA_BUNDLE"):
        options["verify"] = os.environ["DOCUMENT_STORAGE_CA_BUNDLE"]
    STORAGES["default"] = {"BACKEND": "storages.backends.s3.S3Storage", "OPTIONS": options}

# Broker used to publish jobs to the standalone processing workers.
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
if _env_bool("STUDYFORGE_REQUIRE_SECURE_CONNECTIONS"):
    if DEBUG or not os.environ.get("DJANGO_SECRET_KEY") or not os.environ.get("DJANGO_ALLOWED_HOSTS") or not os.environ.get("POSTGRES_PASSWORD"):
        raise ImproperlyConfigured("Production Django requires DEBUG off, a secret key, allowed hosts, and a database password from the environment.")
    if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql" or _postgres_options.get("sslmode") != "verify-full":
        raise ImproperlyConfigured("Production PostgreSQL requires POSTGRES_SSLMODE=verify-full.")
    if not CELERY_BROKER_URL.startswith("rediss://"):
        raise ImproperlyConfigured("Production Redis requires a rediss:// broker URL.")
    if parse_qs(urlsplit(CELERY_BROKER_URL).query).get("ssl_cert_reqs") != ["required"]:
        raise ImproperlyConfigured("Production Redis requires ssl_cert_reqs=required.")
    if DOCUMENT_STORAGE_BACKEND != "s3":
        raise ImproperlyConfigured("Production document storage requires S3.")
    if not os.environ.get("PROCESSING_SERVICE_TOKEN"):
        raise ImproperlyConfigured("Production Django requires PROCESSING_SERVICE_TOKEN.")
    if os.environ.get("DOCUMENT_STORAGE_ENDPOINT_URL", "").startswith("http://"):
        raise ImproperlyConfigured("Production document storage requires HTTPS.")
# Gemini query embeddings for knowledge retrieval.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "gemini-embedding-2")
EMBEDDING_DIMENSION = int(os.environ.get("EMBEDDING_DIMENSION", "768"))
# Disabled until a cosine-similarity cutoff is calibrated on labeled queries.
_retrieval_min_similarity = os.environ.get("RETRIEVAL_MIN_COSINE_SIMILARITY", "").strip()
RETRIEVAL_MIN_COSINE_SIMILARITY = (
    float(_retrieval_min_similarity) if _retrieval_min_similarity else None
)
PROCESSING_SERVICE_TOKEN = os.environ.get("PROCESSING_SERVICE_TOKEN", "")
# OAuth client ID from Google Cloud; Google sign-in is refused while it is empty.
GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")

CELERY_BROKER_CONNECTION_TIMEOUT = 3
CELERY_BROKER_TRANSPORT_OPTIONS = {
    "socket_connect_timeout": 3,
    "socket_timeout": 3,
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
}
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    # Each refresh issues a new refresh token and blacklists the one just used.
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    # A password change immediately rejects access tokens issued before it.
    "CHECK_REVOKE_TOKEN": True,
}

# A reset link is built from this configured origin, never from the request Host.
# Only local development may use HTTP; deployments must configure an HTTPS origin.
PASSWORD_RESET_FRONTEND_URL = os.environ.get(
    "PASSWORD_RESET_FRONTEND_URL",
    "http://localhost:5173" if DEBUG else "",
).strip().rstrip("/")
_reset_frontend = urlsplit(PASSWORD_RESET_FRONTEND_URL)
if (
    not _reset_frontend.netloc
    or _reset_frontend.path
    or _reset_frontend.query
    or _reset_frontend.fragment
    or _reset_frontend.username
    or _reset_frontend.password
    or not (
        _reset_frontend.scheme == "https"
        or (
            DEBUG
            and _reset_frontend.scheme == "http"
            and _reset_frontend.hostname in {"localhost", "127.0.0.1", "::1"}
        )
    )
):
    raise ImproperlyConfigured("PASSWORD_RESET_FRONTEND_URL must be a trusted HTTPS origin.")
PASSWORD_RESET_TIMEOUT = 60 * 60

EMAIL_BACKEND = os.environ.get(
    "DJANGO_EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = _env_bool("EMAIL_USE_TLS")
EMAIL_USE_SSL = _env_bool("EMAIL_USE_SSL")
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "StudyForge <no-reply@localhost>")

# Redis makes request limits consistent across production workers. The dedicated
# cache uses expiring keys, so unrecognized addresses do not grow a database table.
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "password_reset": (
        {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "studyforge-password-reset",
        }
        if DEBUG
        else {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": os.environ.get("PASSWORD_RESET_CACHE_URL", CELERY_BROKER_URL),
            "KEY_PREFIX": "studyforge_password_reset",
        }
    ),
}
CORS_ALLOWED_ORIGINS = _env_csv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173",
)
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = _env_csv(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:5173",
)

# Harden cookies and HTTPS assumptions when DEBUG is off (production / HTTPS).
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
