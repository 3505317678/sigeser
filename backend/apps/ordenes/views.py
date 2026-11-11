from django.db.models import Q
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.core import auditoria
from apps.core.excepciones import ErrorDominio
from apps.core.pdf import comprobante_orden
from apps.core.permisos import TienePermiso
from apps.inventario.models import RepuestoUtilizado
from apps.reparacion.serializers import ActividadSerializer, DiagnosticoSerializer

from . import servicios
from .models import EstadoOrden, FotoOrden, NotaVoz, OrdenServicio
from .serializers import (AgregarRepuestoSerializer, AprobacionSerializer, AsignarTecnicoSerializer,
                          CancelarSerializer, EntregaSerializer, EnviarVerificacionSerializer, FotoSerializer, NotaVozSerializer, ObservacionSerializer,
                          OrdenCrearSerializer, OrdenDetalleSerializer, OrdenEditarSerializer, OrdenListaSerializer,
                          RepuestoUtilizadoSerializer, SubirFotoSerializer, SubirNotaVozSerializer,
                          VerificacionSerializer)

LECTURA = ["ordenes.ver_todas", "ordenes.ver_asignadas"]
TECNICO = ["reparacion.registrar"]


class FiltroOrden(filters.FilterSet):
    estado = filters.MultipleChoiceFilter(choices=EstadoOrden.choices)
    desde = filters.DateFilter(field_name="fecha_recepcion", lookup_expr="date__gte")
    hasta = filters.DateFilter(field_name="fecha_recepcion", lookup_expr="date__lte")
    codigo = filters.CharFilter(lookup_expr="icontains")
    vencidas = filters.BooleanFilter(method="filtrar_vencidas")
    activas = filters.BooleanFilter(method="filtrar_activas")

    class Meta:
        model = OrdenServicio
        fields = ["estado", "tecnico", "cliente", "equipo", "prioridad", "codigo"]

    def filtrar_vencidas(self, qs, name, value):
        hoy = timezone.localdate()
        cond = Q(fecha_estimada_entrega__lt=hoy) & ~Q(estado__in=[*EstadoOrden.FINALES, EstadoOrden.LISTA_PARA_ENTREGA])
        return qs.filter(cond) if value else qs.exclude(cond)

    def filtrar_activas(self, qs, name, value):
        return qs.exclude(estado__in=EstadoOrden.FINALES) if value else qs.filter(estado__in=EstadoOrden.FINALES)


class OrdenViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                   mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """UC-07 a UC-18. Las transiciones de estado se hacen solo con las acciones, nunca editando el estado."""

    permission_classes = [TienePermiso]
    permisos_por_accion = {
        "list": LECTURA, "retrieve": LECTURA, "comprobante": LECTURA,
        "create": ["ordenes.crear"], "update": ["ordenes.crear"], "partial_update": ["ordenes.crear"],
        "asignar_tecnico": ["ordenes.asignar"], "aprobacion": ["ordenes.aprobacion"],
        "entrega": ["ordenes.entregar"], "cancelar": ["ordenes.cancelar"],
        "iniciar_diagnostico": TECNICO, "diagnostico": TECNICO, "actividades": TECNICO, "repuestos": TECNICO,
        "devolver_repuesto": TECNICO, "espera": TECNICO, "reanudar": TECNICO, "enviar_verificacion": TECNICO,
        "verificacion": TECNICO,
        "fotos": LECTURA, "foto_imagen": LECTURA, "subir_foto": ["ordenes.fotos"],
        "notas_voz": LECTURA, "nota_voz_audio": LECTURA, "grabar_nota_voz": ["ordenes.fotos"],
    }
    filterset_class = FiltroOrden
    search_fields = ["codigo", "cliente__nombre", "cliente__numero_documento", "equipo__serial", "equipo__marca"]
    ordering_fields = ["fecha_recepcion", "fecha_estimada_entrega", "prioridad", "codigo"]

    def get_queryset(self):
        qs = OrdenServicio.objects.select_related("cliente", "equipo", "tecnico__usuario")
        if getattr(self, "swagger_fake_view", False):  # generación del esquema OpenAPI
            return qs.none()
        u = self.request.user
        if not u.tiene_permiso("ordenes.ver_todas"):
            # RN-10 / Tabla 4: el técnico solo ve las órdenes asignadas a él.
            qs = qs.filter(tecnico__usuario=u)
        if self.action != "list":
            qs = qs.select_related("diagnostico__tecnico__usuario").prefetch_related(
                "historial__usuario", "actividades__tecnico__usuario", "repuestos_utilizados__repuesto",
                "fotos__subida_por", "notas_voz__grabada_por")
        return qs

    def get_serializer_class(self):
        return {"list": OrdenListaSerializer, "create": OrdenCrearSerializer,
                "update": OrdenEditarSerializer, "partial_update": OrdenEditarSerializer}.get(self.action, OrdenDetalleSerializer)

    def _detalle(self, orden, estado_http=status.HTTP_200_OK):
        orden = self.get_queryset().get(pk=orden.pk)
        return Response(OrdenDetalleSerializer(orden, context={"request": self.request}).data, status=estado_http)

    def _datos(self, serializer_class):
        s = serializer_class(data=self.request.data)
        s.is_valid(raise_exception=True)
        return s.validated_data

    def create(self, request, *args, **kwargs):
        orden = servicios.crear_orden(self._datos(OrdenCrearSerializer), request.user, request)
        return self._detalle(orden, status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        orden = self.get_object()
        servicios.exigir_abierta(orden)
        s = OrdenEditarSerializer(orden, data=request.data, partial=kwargs.get("partial", False))
        s.is_valid(raise_exception=True)
        s.save()
        auditoria.registrar("ORDEN_ACTUALIZADA", "orden", orden.pk, request=request, detalle={"campos": sorted(s.validated_data)})
        return self._detalle(orden)

    @extend_schema(request=AsignarTecnicoSerializer, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"], url_path="asignar-tecnico")
    def asignar_tecnico(self, request, pk=None):
        orden = self.get_object()
        servicios.asignar_tecnico(orden, self._datos(AsignarTecnicoSerializer)["tecnico"], request.user, request)
        return self._detalle(orden)

    @extend_schema(request=None, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"], url_path="iniciar-diagnostico")
    def iniciar_diagnostico(self, request, pk=None):
        orden = self.get_object()
        servicios.iniciar_diagnostico(orden, request.user, request)
        return self._detalle(orden)

    @extend_schema(request=DiagnosticoSerializer, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"])
    def diagnostico(self, request, pk=None):
        orden = self.get_object()
        servicios.registrar_diagnostico(orden, self._datos(DiagnosticoSerializer), request.user, request)
        return self._detalle(orden)

    @extend_schema(request=AprobacionSerializer, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"])
    def aprobacion(self, request, pk=None):
        orden = self.get_object()
        d = self._datos(AprobacionSerializer)
        servicios.registrar_aprobacion(orden, d["aprobado"], request.user, d["observacion"], d["esperar_repuestos"], request)
        return self._detalle(orden)

    @extend_schema(request=ActividadSerializer, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"])
    def actividades(self, request, pk=None):
        orden = self.get_object()
        servicios.registrar_actividad(orden, self._datos(ActividadSerializer), request.user, request)
        return self._detalle(orden, status.HTTP_201_CREATED)

    @extend_schema(request=AgregarRepuestoSerializer, responses=RepuestoUtilizadoSerializer)
    @action(detail=True, methods=["post"])
    def repuestos(self, request, pk=None):
        """UC-13 / Figura 6. Responde 409 con el stock disponible si no alcanza."""
        orden = self.get_object()
        d = self._datos(AgregarRepuestoSerializer)
        uso, bajo_minimo = servicios.agregar_repuesto(orden, d["repuesto"].pk, d["cantidad"], request.user, request)
        orden.refresh_from_db()
        datos = RepuestoUtilizadoSerializer(uso).data
        datos.update({"alerta_stock_bajo": bajo_minimo, "total_orden": str(orden.calcular_total())})
        return Response(datos, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"], url_path=r"repuestos/(?P<uso_id>\d+)/devolver")
    def devolver_repuesto(self, request, pk=None, uso_id=None):
        orden = self.get_object()
        uso = get_object_or_404(RepuestoUtilizado, pk=uso_id, orden=orden)
        servicios.quitar_repuesto(orden, uso, request.user, request)
        return self._detalle(orden)

    @extend_schema(request=ObservacionSerializer, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"])
    def espera(self, request, pk=None):
        orden = self.get_object()
        servicios.poner_en_espera(orden, request.user, self._datos(ObservacionSerializer)["observacion"], request)
        return self._detalle(orden)

    @extend_schema(request=None, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"])
    def reanudar(self, request, pk=None):
        orden = self.get_object()
        servicios.reanudar_reparacion(orden, request.user, request)
        return self._detalle(orden)

    @extend_schema(request=EnviarVerificacionSerializer, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"], url_path="enviar-verificacion")
    def enviar_verificacion(self, request, pk=None):
        orden = self.get_object()
        d = self._datos(EnviarVerificacionSerializer)
        servicios.enviar_a_verificacion(orden, request.user, d.get("costo_mano_obra"), request)
        return self._detalle(orden)

    @extend_schema(request=VerificacionSerializer, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"])
    def verificacion(self, request, pk=None):
        orden = self.get_object()
        d = self._datos(VerificacionSerializer)
        servicios.verificar(orden, d["aprobada"], request.user, d["observacion"], request)
        return self._detalle(orden)

    @extend_schema(request=EntregaSerializer, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"])
    def entrega(self, request, pk=None):
        orden = self.get_object()
        d = self._datos(EntregaSerializer)
        servicios.registrar_entrega(orden, d["recibido_por"], request.user, d["observacion"], request)
        return self._detalle(orden)

    @extend_schema(request=CancelarSerializer, responses=OrdenDetalleSerializer)
    @action(detail=True, methods=["post"])
    def cancelar(self, request, pk=None):
        orden = self.get_object()
        servicios.cancelar(orden, self._datos(CancelarSerializer)["motivo"], request.user, request)
        return self._detalle(orden)

    @extend_schema(responses=FotoSerializer(many=True))
    @action(detail=True, methods=["get"], parser_classes=[MultiPartParser], pagination_class=None)  # solo esta ruta acepta multipart
    def fotos(self, request, pk=None):
        """RF-33: evidencia fotográfica del equipo, en orden cronológico."""
        orden = self.get_object()
        return Response(FotoSerializer(orden.fotos.select_related("subida_por"), many=True).data)

    @extend_schema(request={"multipart/form-data": SubirFotoSerializer}, responses={201: FotoSerializer})
    @fotos.mapping.post
    def subir_foto(self, request, pk=None):
        orden = self.get_object()
        d = self._datos(SubirFotoSerializer)
        foto = servicios.subir_foto(orden, d["archivo"], d["descripcion"], request.user, request)
        return Response(FotoSerializer(foto).data, status=status.HTTP_201_CREATED)

    @extend_schema(parameters=[OpenApiParameter("tamano", str, enum=["completa", "miniatura"])],
                   responses={(200, "image/jpeg"): bytes})
    @action(detail=True, methods=["get"], url_path=r"fotos/(?P<foto_id>\d+)/imagen")
    def foto_imagen(self, request, pk=None, foto_id=None):
        """Sirve la imagen solo a quien puede ver la orden; las fotos nunca quedan en una carpeta pública."""
        orden = self.get_object()
        foto = get_object_or_404(FotoOrden, pk=foto_id, orden=orden)
        ruta = foto.miniatura.name if request.query_params.get("tamano") == "miniatura" else foto.archivo.name
        try:
            archivo = default_storage.open(ruta, "rb")
        except FileNotFoundError as exc:
            raise Http404 from exc
        respuesta = FileResponse(archivo, content_type="image/jpeg")
        respuesta["Cache-Control"] = "private, max-age=86400"
        respuesta["Content-Disposition"] = f'inline; filename="{orden.codigo}-foto-{foto.pk}.jpg"'
        return respuesta

    @extend_schema(responses=NotaVozSerializer(many=True))
    @action(detail=True, methods=["get"], url_path="notas-voz", parser_classes=[MultiPartParser], pagination_class=None)
    def notas_voz(self, request, pk=None):
        """RF-37: notas de voz y grabaciones de sonido del equipo, en orden cronológico."""
        orden = self.get_object()
        return Response(NotaVozSerializer(orden.notas_voz.select_related("grabada_por"), many=True).data)

    @extend_schema(request={"multipart/form-data": SubirNotaVozSerializer}, responses={201: NotaVozSerializer})
    @notas_voz.mapping.post
    def grabar_nota_voz(self, request, pk=None):
        orden = self.get_object()
        d = self._datos(SubirNotaVozSerializer)
        nota = servicios.subir_nota_voz(orden, d["archivo"], d["duracion_ms"], d["descripcion"], request.user, request)
        return Response(NotaVozSerializer(nota).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={(200, "audio/webm"): bytes})
    @action(detail=True, methods=["get"], url_path=r"notas-voz/(?P<nota_id>\d+)/audio")
    def nota_voz_audio(self, request, pk=None, nota_id=None):
        """Entrega el audio solo a quien puede ver la orden, con el tipo MIME que fijó el servidor."""
        orden = self.get_object()
        nota = get_object_or_404(NotaVoz, pk=nota_id, orden=orden)
        try:
            archivo = default_storage.open(nota.archivo.name, "rb")
        except FileNotFoundError as exc:
            raise Http404 from exc
        respuesta = FileResponse(archivo, content_type=nota.tipo_mime)
        respuesta["Cache-Control"] = "private, max-age=86400"
        respuesta["Content-Disposition"] = f'inline; filename="{orden.codigo}-nota-{nota.pk}"'
        return respuesta

    @extend_schema(parameters=[OpenApiParameter("tipo", str, enum=["recepcion", "entrega"])],
                   responses={(200, "application/pdf"): bytes})
    @action(detail=True, methods=["get"])
    def comprobante(self, request, pk=None):
        """UC-18 / RF-13: comprobante PDF de recepción o de entrega."""
        orden = self.get_object()
        tipo = request.query_params.get("tipo", "recepcion")
        if tipo not in ("recepcion", "entrega"):
            raise ErrorDominio("El tipo debe ser recepcion o entrega.")
        if tipo == "entrega" and orden.estado != EstadoOrden.ENTREGADA:
            raise ErrorDominio("El comprobante de entrega se genera cuando la orden está entregada.")
        pdf = comprobante_orden(orden, tipo, request.build_absolute_uri(f"/ordenes/{orden.pk}"))
        respuesta = HttpResponse(pdf, content_type="application/pdf")
        respuesta["Content-Disposition"] = f'inline; filename="{orden.codigo}-{tipo}.pdf"'
        return respuesta
