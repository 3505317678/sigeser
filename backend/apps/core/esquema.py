"""Describe en OpenAPI la autenticación por sesión propia de SIGESER (cookie HttpOnly + cabecera CSRF)."""
from django.conf import settings
from drf_spectacular.extensions import OpenApiAuthenticationExtension


class SesionAutenticacionEsquema(OpenApiAuthenticationExtension):
    target_class = "apps.core.autenticacion.SesionAutenticacion"
    name = "cookieAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": settings.SESSION_COOKIE_NAME,
            "description": "Cookie de sesión obtenida en POST /api/v1/auth/login. Las operaciones que modifican datos "
                           "exigen además la cabecera X-CSRFToken con el valor de la cookie "
                           f"{settings.CSRF_COOKIE_NAME}.",
        }
