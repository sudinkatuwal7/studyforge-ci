"""Django settings for StudyForge."""

import os
from pathlib import Path

from datetime import timedelta

from dotenv import load_dotenv

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
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "studyforge"),
            "USER": os.environ.get("POSTGRES_USER", "studyforge"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "studyforge_dev"),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
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

# Broker used to publish jobs to the standalone processing workers.
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
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
