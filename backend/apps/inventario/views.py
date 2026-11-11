from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core import auditoria
from apps.core.permisos import TienePermiso

from . import servicios
from .models import MovimientoInventario, Repuesto, TipoMovimiento
from .serializers import MovimientoSerializer, RegistrarMovimientoSerializer, RepuestoCrearSerializer, RepuestoSerializer

LECTURA = ["inventario.ver", "inventario.gestionar"]


class RepuestoViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                      mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """RF-26 a RF-29. Los repuestos se desactivan, no se eliminan."""

    queryset = Repuesto.objects.all()
    permission_classes = [TienePermiso]
    permisos_por_accion = {"list": LECTURA, "retrieve": LECTURA, "movimientos": LECTURA, "alertas": LECTURA,
                           "create": ["inventario.gestionar"], "update": ["inventario.gestionar"],
                           "partial_update": ["inventario.gestionar"], "registrar_movimiento": ["inventario.gestionar"],
                           "desactivar": ["inventario.gestionar"], "activar": ["inventario.gestionar"]}
    filterset_fields = ["categoria", "activo"]
    search_fields = ["codigo", "nombre", "categoria"]
    ordering_fields = ["nombre", "stock_actual", "precio_unitario"]

    def get_serializer_class(self):
        return RepuestoCrearSerializer if self.action == "create" else RepuestoSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        stock_inicial = serializer.validated_data.pop("stock_inicial", 0)
        r = serializer.save(stock_actual=0)
        auditoria.registrar("REPUESTO_CREADO", "repuesto", r.pk, request=self.request, detalle={"codigo": r.codigo})
        if stock_inicial:
            servicios.registrar_movimiento(r.pk, TipoMovimiento.ENTRADA, stock_inicial, self.request.user,
                                           "Inventario inicial", self.request)
        serializer.instance.refresh_from_db()

    def perform_update(self, serializer):
        r = serializer.save()
        auditoria.registrar("REPUESTO_ACTUALIZADO", "repuesto", r.pk, request=self.request,
                            detalle={"campos": sorted(serializer.validated_data)})

    @extend_schema(request=RegistrarMovimientoSerializer, responses=RepuestoSerializer)
    @action(detail=True, methods=["post"], url_path="movimientos/registrar")
    def registrar_movimiento(self, request, pk=None):
        repuesto = self.get_object()
        s = RegistrarMovimientoSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        repuesto, _ = servicios.registrar_movimiento(repuesto.pk, d["tipo"], d["cantidad"], request.user, d["motivo"], request)
        return Response(RepuestoSerializer(repuesto).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def movimientos(self, request, pk=None):
        """RF-28: kardex del repuesto."""
        repuesto = self.get_object()
        qs = MovimientoInventario.objects.filter(repuesto=repuesto).select_related("usuario", "orden", "repuesto")
        pagina = self.paginate_queryset(qs)
        return self.get_paginated_response(MovimientoSerializer(pagina, many=True).data)

    @action(detail=False, methods=["get"])
    def alertas(self, request):
        """RF-29: repuestos con stock igual o inferior al mínimo."""
        return Response(RepuestoSerializer(servicios.repuestos_bajo_minimo(), many=True).data)

    def _activo(self, activo):
        r = self.get_object()
        r.activo = activo
        r.save(update_fields=["activo"])
        auditoria.registrar("REPUESTO_ACTIVADO" if activo else "REPUESTO_DESACTIVADO", "repuesto", r.pk, request=self.request)
        return Response(RepuestoSerializer(r).data)

    @action(detail=True, methods=["post"])
    def desactivar(self, request, pk=None):
        return self._activo(False)

    @action(detail=True, methods=["post"])
    def activar(self, request, pk=None):
        return self._activo(True)
