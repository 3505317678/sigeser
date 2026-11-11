"""Servicio de auditoría (interfaz IAuditoria del diagrama de componentes)."""
from django.conf import settings

from .models import RegistroAuditoria

CAMPOS_PROHIBIDOS = {"password", "contrasena", "contrasena_actual", "contrasena_nueva", "password_hash"}


def ip_de(request):
    """IP del cliente. La cabecera X-Real-IP solo se acepta si hay un proxy de confianza (Nginx) que la reescribe."""
    if request is None:
        return None
    if settings.NUM_PROXIES > 0 and request.META.get("HTTP_X_REAL_IP"):
        return request.META["HTTP_X_REAL_IP"]
    return request.META.get("REMOTE_ADDR")


def registrar(accion, entidad, entidad_id=None, usuario=None, request=None, detalle=None):
    """Guarda un evento. Nunca almacena contraseñas aunque lleguen en el detalle."""
    if detalle:
        detalle = {k: v for k, v in detalle.items() if k not in CAMPOS_PROHIBIDOS}
    if usuario is None and request is not None and getattr(request, "user", None) and request.user.is_authenticated:
        usuario = request.user
    return RegistroAuditoria.objects.create(
        usuario=usuario if (usuario and getattr(usuario, "pk", None)) else None,
        accion=accion,
        entidad=entidad,
        entidad_id=entidad_id,
        ip=ip_de(request),
        detalle=detalle or None,
    )
