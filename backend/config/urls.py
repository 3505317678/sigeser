from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from apps.clientes.views import ClienteViewSet, EquipoViewSet
from apps.core.views import AuditoriaViewSet, salud
from apps.inventario.views import RepuestoViewSet
from apps.ordenes.views import OrdenViewSet
from apps.reportes import views as reportes
from apps.tecnicos.views import TecnicoViewSet
from apps.usuarios import views as usuarios

router = DefaultRouter(trailing_slash=False)
router.register("usuarios", usuarios.UsuarioViewSet, basename="usuario")
router.register("roles", usuarios.RolViewSet, basename="rol")
router.register("permisos", usuarios.PermisoViewSet, basename="permiso")
router.register("tecnicos", TecnicoViewSet, basename="tecnico")
router.register("clientes", ClienteViewSet, basename="cliente")
router.register("equipos", EquipoViewSet, basename="equipo")
router.register("ordenes", OrdenViewSet, basename="orden")
router.register("repuestos", RepuestoViewSet, basename="repuesto")
router.register("auditoria", AuditoriaViewSet, basename="auditoria")

api_v1 = [
    path("salud", salud, name="salud"),
    path("auth/csrf", usuarios.CsrfView.as_view(), name="auth-csrf"),
    path("auth/login", usuarios.LoginView.as_view(), name="auth-login"),
    path("auth/logout", usuarios.LogoutView.as_view(), name="auth-logout"),
    path("auth/yo", usuarios.PerfilView.as_view(), name="auth-yo"),
    path("auth/cambiar-contrasena", usuarios.CambioContrasenaView.as_view(), name="auth-cambiar-contrasena"),
    path("reportes/dashboard", reportes.dashboard, name="reporte-dashboard"),
    path("reportes/periodo", reportes.periodo, name="reporte-periodo"),
    path("reportes/exportar", reportes.exportar, name="reporte-exportar"),
    path("", include(router.urls)),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
    path("api/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
