"""Configuración de SIGESER.

Todos los valores sensibles o dependientes del entorno se leen de variables de entorno
(RNF-08): nunca se escriben secretos en el código.
"""
from datetime import timedelta
from pathlib import Path
import os

from django.core.exceptions import ImproperlyConfigured
from django.core.management.utils import get_random_secret_key

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name, default=None, required=False):
    value = os.environ.get(name, default)
    if required and not value:
        raise ImproperlyConfigured(f"Falta la variable de entorno {name}")
    return value


def env_bool(name, default=False):
    return str(os.environ.get(name, default)).lower() in {"1", "true", "yes", "si"}


DEBUG = env_bool("DJANGO_DEBUG", False)
# En producción la clave es obligatoria. En desarrollo, si no se define, se genera una aleatoria en cada
# arranque (las sesiones se invalidan al reiniciar), de modo que nunca existe una clave fija en el repositorio.
SECRET_KEY = env("DJANGO_SECRET_KEY", required=not DEBUG) or get_random_secret_key()
if not DEBUG and (SECRET_KEY.startswith("cambie") or len(SECRET_KEY) < 40):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY debe ser un valor aleatorio de al menos 40 caracteres.")
ALLOWED_HOSTS = [h.strip() for h in env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]
CSRF_TRUSTED_ORIGINS = [o.strip() for o in env("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:8080").split(",") if o.strip()]

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    "apps.core",
    "apps.usuarios",
    "apps.tecnicos",
    "apps.clientes",
    "apps.ordenes",
    "apps.reparacion",
    "apps.inventario",
    "apps.reportes",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.CabecerasSeguridadMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "sigeser"),
        "USER": env("POSTGRES_USER", "sigeser"),
        "PASSWORD": env("POSTGRES_PASSWORD", required=True),
        "HOST": env("POSTGRES_HOST", "localhost"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}

# Caché compartida por todos los procesos de Gunicorn: la usa el límite de tasa del login.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "cache_sigeser",
    }
}

AUTH_USER_MODEL = "usuarios.Usuario"

# RNF-01: Argon2id como algoritmo principal; PBKDF2 queda como respaldo.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
     "OPTIONS": {"user_attributes": ("correo", "nombre_completo")}},
]

# RNF-03: sesión en el servidor, cookie HttpOnly, SameSite y expiración por inactividad.
SESSION_COOKIE_AGE = int(env("SESSION_MINUTOS_INACTIVIDAD", "30")) * 60
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_NAME = "sigeser_sesion"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_NAME = "sigeser_csrf"
CSRF_COOKIE_HTTPONLY = False  # la SPA debe leerlo para enviarlo en la cabecera X-CSRFToken

# RNF-05: en producción con HTTPS se activan cookies seguras y HSTS.
USAR_HTTPS = env_bool("DJANGO_USAR_HTTPS", False)
NUM_PROXIES = int(env("DJANGO_NUM_PROXIES", "0"))
SESSION_COOKIE_SECURE = USAR_HTTPS
CSRF_COOKIE_SECURE = USAR_HTTPS
SECURE_SSL_REDIRECT = False  # la redirección a HTTPS la hace Nginx
# Solo se cree en X-Forwarded-Proto cuando hay un proxy de confianza que la reescribe (Nginx).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if NUM_PROXIES > 0 else None
SECURE_HSTS_SECONDS = 31536000 if USAR_HTTPS else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = USAR_HTTPS
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# RF-01 y RNF-04: política de bloqueo de cuentas.
LOGIN_MAX_INTENTOS = int(env("LOGIN_MAX_INTENTOS", "5"))
LOGIN_MINUTOS_BLOQUEO = int(env("LOGIN_MINUTOS_BLOQUEO", "15"))
LOGIN_BLOQUEO = timedelta(minutes=LOGIN_MINUTOS_BLOQUEO)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.core.autenticacion.SesionAutenticacion"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.paginacion.PaginacionEstandar",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_RATES": {"login": env("LOGIN_LIMITE_POR_IP", "10/min")},
    # Cantidad de proxies de confianza delante de Django. Con 0 se ignora X-Forwarded-For (un cliente podría
    # falsificarlo para evadir el límite de intentos); con Nginx delante es 1 y Nginx reescribe la cabecera.
    "NUM_PROXIES": NUM_PROXIES,
    "EXCEPTION_HANDLER": "apps.core.excepciones.manejador_excepciones",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "API de SIGESER",
    "DESCRIPTION": "Sistema de Gestión y Seguimiento de Servicios Técnicos",
    "VERSION": "1.2.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {"EstadoOrdenEnum": "apps.ordenes.models.EstadoOrden"},
}

LANGUAGE_CODE = "es-co"
TIME_ZONE = "America/Bogota"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Fotos de las órdenes (RF-33). Se guardan fuera de la carpeta pública y solo se sirven por la API con permisos.
MEDIA_ROOT = env("SIGESER_MEDIA_ROOT", str(BASE_DIR / "media"))
FOTOS_TAMANO_MAXIMO = int(env("FOTOS_TAMANO_MAXIMO_MB", "8")) * 1024 * 1024
FOTOS_MAXIMO_POR_ORDEN = int(env("FOTOS_MAXIMO_POR_ORDEN", "12"))
# Notas de voz (RF-37): tamaño máximo, duración máxima en segundos y cantidad por orden.
AUDIOS_TAMANO_MAXIMO = int(env("AUDIOS_TAMANO_MAXIMO_MB", "5")) * 1024 * 1024
AUDIOS_DURACION_MAXIMA = int(env("AUDIOS_DURACION_MAXIMA_S", "120"))
AUDIOS_MAXIMO_POR_ORDEN = int(env("AUDIOS_MAXIMO_POR_ORDEN", "10"))
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# RNF-07: los registros técnicos van a la salida estándar del contenedor, sin datos sensibles.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "{asctime} {levelname} {name} {message}", "style": "{"}},
    "handlers": {"consola": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["consola"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
}

EMPRESA_NOMBRE = env("EMPRESA_NOMBRE", "Servicio Técnico SIGESER")
