from rest_framework.authentication import SessionAuthentication


class SesionAutenticacion(SessionAuthentication):
    """Sesión de Django con CSRF obligatorio; responde 401 (no 403) cuando no hay sesión."""

    def authenticate_header(self, request):
        return 'Session realm="sigeser"'
