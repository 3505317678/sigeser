"""Control de acceso basado en roles (RBAC). Se valida en el servidor en cada petición (RNF-02)."""
from rest_framework.permissions import BasePermission


class TienePermiso(BasePermission):
    """Exige los códigos de permiso que la vista declara en `permisos_por_accion`.

    Ejemplo en una vista: permisos_por_accion = {"list": ["clientes.ver"], "create": ["clientes.gestionar"]}
    Una acción que no esté en el diccionario se niega por defecto (deny by default).
    """

    message = "Su rol no tiene permiso para realizar esta acción."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.activo):
            return False
        accion = getattr(view, "action", None) or request.method.lower()
        requeridos = getattr(view, "permisos_por_accion", {}).get(accion)
        if requeridos is None:
            requeridos = getattr(view, "permisos_por_accion", {}).get("*")
        if requeridos is None:
            return False
        return any(user.tiene_permiso(codigo) for codigo in requeridos) if requeridos else True


def requiere(*codigos):
    """Para vistas basadas en funciones o APIView: permiso fijo."""

    class _Permiso(BasePermission):
        message = TienePermiso.message

        def has_permission(self, request, view):
            u = request.user
            return bool(u and u.is_authenticated and u.activo and any(u.tiene_permiso(c) for c in codigos))

    return _Permiso
