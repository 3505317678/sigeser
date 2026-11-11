class CabecerasSeguridadMiddleware:
    """Cabeceras de seguridad para las respuestas de la API (Nginx agrega las de la SPA)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("Cache-Control", "no-store")
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if response.get("Content-Type", "").startswith("application/pdf"):
            return response  # el visor de PDF del navegador no admite una CSP restrictiva
        if request.path.startswith("/api/docs"):
            response.setdefault("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'")
        else:
            response.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        return response
