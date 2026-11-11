from django.conf import settings
from django.contrib.auth import login, logout, update_session_auth_hash
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core import auditoria
from apps.core.permisos import TienePermiso

from .models import Permiso, Rol, Usuario
from .serializers import (CambioContrasenaSerializer, LoginSerializer, PerfilSerializer, PermisoSerializer,
                          RolSerializer, UsuarioSerializer)

MENSAJE_GENERICO = "Correo o contraseña incorrectos. Tras varios intentos fallidos la cuenta se bloquea temporalmente."
# Hash de referencia: se verifica aunque el correo no exista para que el tiempo de respuesta no lo delate.
_HASH_SENUELO = make_password("contrasena-senuelo-no-valida")


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Entrega la cookie CSRF que la SPA debe reenviar en la cabecera X-CSRFToken."""

    permission_classes = [AllowAny]

    @extend_schema(responses={204: None})
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class LoginView(APIView):
    """UC-01 / Figura 4: autenticación con bloqueo por intentos y límite de tasa por IP."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(request=LoginSerializer, responses={200: PerfilSerializer, 401: None, 429: None})
    def post(self, request):
        # La vista no exige sesión, así que la protección CSRF se aplica de forma explícita.
        SessionAuthentication().enforce_csrf(request)
        datos = LoginSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        correo = datos.validated_data["correo"].lower()
        contrasena = datos.validated_data["contrasena"]
        ahora = timezone.now()

        with transaction.atomic():
            usuario = Usuario.objects.select_for_update().select_related("rol").filter(correo=correo).first()
            valido = check_password(contrasena, usuario.password if usuario else _HASH_SENUELO)
            if not usuario or not usuario.activo or usuario.esta_bloqueado(ahora) or not valido:
                if usuario and usuario.activo and not usuario.esta_bloqueado(ahora):
                    usuario.intentos_fallidos += 1
                    if usuario.intentos_fallidos >= settings.LOGIN_MAX_INTENTOS:
                        usuario.bloqueado_hasta = ahora + settings.LOGIN_BLOQUEO
                        usuario.intentos_fallidos = 0
                        auditoria.registrar("CUENTA_BLOQUEADA", "usuario", usuario.pk, usuario=usuario, request=request)
                    usuario.save(update_fields=["intentos_fallidos", "bloqueado_hasta"])
                auditoria.registrar("LOGIN_FALLIDO", "usuario", usuario.pk if usuario else None,
                                    usuario=usuario, request=request, detalle={"correo": correo})
                return Response({"detail": MENSAJE_GENERICO}, status=status.HTTP_401_UNAUTHORIZED)

            usuario.intentos_fallidos = 0
            usuario.bloqueado_hasta = None
            usuario.save(update_fields=["intentos_fallidos", "bloqueado_hasta"])
        login(request, usuario)  # rota el identificador de sesión y actualiza ultimo_acceso
        auditoria.registrar("LOGIN_EXITOSO", "usuario", usuario.pk, usuario=usuario, request=request)
        return Response(PerfilSerializer(usuario).data)


class LogoutView(APIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        auditoria.registrar("LOGOUT", "usuario", request.user.pk, request=request)
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PerfilView(APIView):
    @extend_schema(responses=PerfilSerializer)
    def get(self, request):
        return Response(PerfilSerializer(request.user).data)


class CambioContrasenaView(APIView):
    """RF-05."""

    @extend_schema(request=CambioContrasenaSerializer, responses={204: None})
    def post(self, request):
        datos = CambioContrasenaSerializer(data=request.data, context={"request": request})
        datos.is_valid(raise_exception=True)
        request.user.set_password(datos.validated_data["contrasena_nueva"])
        request.user.save(update_fields=["password"])
        update_session_auth_hash(request, request.user)
        auditoria.registrar("CONTRASENA_CAMBIADA", "usuario", request.user.pk, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UsuarioViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """RF-03 y RF-04. No hay borrado físico: los usuarios se desactivan."""

    queryset = Usuario.objects.select_related("rol").all()
    serializer_class = UsuarioSerializer
    permission_classes = [TienePermiso]
    permisos_por_accion = {"*": ["usuarios.gestionar"]}
    filterset_fields = ["rol", "activo"]
    search_fields = ["nombre_completo", "correo"]

    def perform_create(self, serializer):
        u = serializer.save()
        auditoria.registrar("USUARIO_CREADO", "usuario", u.pk, request=self.request, detalle={"rol": u.rol.nombre})

    def perform_update(self, serializer):
        u = serializer.save()
        auditoria.registrar("USUARIO_ACTUALIZADO", "usuario", u.pk, request=self.request,
                            detalle={"campos": sorted(k for k in self.request.data.keys() if k != "contrasena"),
                                     "contrasena_restablecida": "contrasena" in self.request.data})

    def _cambiar_activo(self, request, activo):
        u = self.get_object()
        if u.pk == request.user.pk and not activo:
            return Response({"detail": "No puede desactivar su propia cuenta."}, status=status.HTTP_409_CONFLICT)
        u.activo = activo
        u.save(update_fields=["activo"])
        auditoria.registrar("USUARIO_ACTIVADO" if activo else "USUARIO_DESACTIVADO", "usuario", u.pk, request=request)
        return Response(self.get_serializer(u).data)

    @action(detail=True, methods=["post"])
    def desactivar(self, request, pk=None):
        return self._cambiar_activo(request, False)

    @action(detail=True, methods=["post"])
    def activar(self, request, pk=None):
        return self._cambiar_activo(request, True)

    @action(detail=True, methods=["post"])
    def desbloquear(self, request, pk=None):
        u = self.get_object()
        u.bloqueado_hasta = None
        u.intentos_fallidos = 0
        u.save(update_fields=["bloqueado_hasta", "intentos_fallidos"])
        auditoria.registrar("USUARIO_DESBLOQUEADO", "usuario", u.pk, request=request)
        return Response(self.get_serializer(u).data)


class RolViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                 mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = Rol.objects.prefetch_related("permisos").all()
    serializer_class = RolSerializer
    permission_classes = [TienePermiso]
    permisos_por_accion = {"list": ["usuarios.gestionar", "tecnicos.gestionar"], "retrieve": ["usuarios.gestionar"],
                           "create": ["usuarios.gestionar"], "update": ["usuarios.gestionar"],
                           "partial_update": ["usuarios.gestionar"]}
    pagination_class = None

    def perform_create(self, serializer):
        r = serializer.save()
        auditoria.registrar("ROL_CREADO", "rol", r.pk, request=self.request, detalle={"nombre": r.nombre})

    def perform_update(self, serializer):
        r = serializer.save()
        auditoria.registrar("ROL_ACTUALIZADO", "rol", r.pk, request=self.request,
                            detalle={"permisos": sorted(p.codigo for p in r.permisos.all())})


class PermisoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Permiso.objects.all()
    serializer_class = PermisoSerializer
    permission_classes = [TienePermiso]
    permisos_por_accion = {"*": ["usuarios.gestionar"]}
    pagination_class = None
