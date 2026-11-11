"""Configuración para las pruebas automatizadas."""
import os

os.environ.setdefault("DJANGO_DEBUG", "1")

from .settings import *  # noqa: E402,F401,F403

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
LOGGING = {"version": 1, "disable_existing_loggers": True}

import tempfile  # noqa: E402

MEDIA_ROOT = tempfile.mkdtemp(prefix="sigeser-pruebas-")
