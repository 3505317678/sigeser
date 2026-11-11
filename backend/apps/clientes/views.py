from django.db.models import Count
from django_filters import rest_framework as filters
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core import auditoria
from apps.core.permisos import TienePermiso

from .models import Cliente, Equipo
from .serializers import ClienteListaSerializer, ClienteSerializer, EquipoSerializer


class FiltroCliente(filters.FilterSet):
    documento = filters.CharFilter(field_name="numero_documento")

    class Meta:
        model = Cliente
        fields = ["tipo_documento", "activo", "documento"]


class ClienteViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """RF-08 y RF-09. Sin borrado físico (RN-11)."""

    permission_classes = [TienePermiso]
    lectura = ["clientes.ver", "clientes.gestionar"]
    permisos_por_accion = {"list": lectura, "retrieve": lectura, "equipos": lectura, "create": ["clientes.gestionar"],
                           "update": ["clientes.gestionar"], "partial_update": ["clientes.gestionar"],
                           "agregar_equipo": ["clientes.gestionar"], "desactivar": ["clientes.gestionar"]}
    filterset_class = FiltroCliente
    search_fields = ["nombre", "numero_documento", "telefono", "correo"]
    ordering_fields = ["nombre", "creado_en"]

    def get_queryset(self):
        qs = Cliente.objects.all()
        if self.action == "list":
            # Meta.ordering no se aplica a consultas con GROUP BY: el orden se fija explícitamente.
            return qs.annotate(total_equipos=Count("equipos")).order_by("nombre", "id")
        return qs.prefetch_related("equipos")

    def get_serializer_class(self):
        return ClienteListaSerializer if self.action == "list" else ClienteSerializer

    def perform_create(self, serializer):
        c = serializer.save()
        auditoria.registrar("CLIENTE_CREADO", "cliente", c.pk, request=self.request)

    def perform_update(self, serializer):
        c = serializer.save()
        auditoria.registrar("CLIENTE_ACTUALIZADO", "cliente", c.pk, request=self.request,
                            detalle={"campos": sorted(self.request.data.keys())})

    @action(detail=True, methods=["post"], url_path="equipos", serializer_class=EquipoSerializer)
    def agregar_equipo(self, request, pk=None):
        cliente = self.get_object()
        s = EquipoSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        equipo = s.save(cliente=cliente)
        auditoria.registrar("EQUIPO_CREADO", "equipo", equipo.pk, request=request, detalle={"cliente": cliente.pk})
        return Response(EquipoSerializer(equipo).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def desactivar(self, request, pk=None):
        c = self.get_object()
        c.activo = False
        c.save(update_fields=["activo"])
        auditoria.registrar("CLIENTE_DESACTIVADO", "cliente", c.pk, request=request)
        return Response(ClienteSerializer(c).data)


class EquipoViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """RF-10 y RF-11."""

    queryset = Equipo.objects.select_related("cliente")
    serializer_class = EquipoSerializer
    permission_classes = [TienePermiso]
    lectura = ["clientes.ver", "clientes.gestionar"]
    permisos_por_accion = {"list": lectura, "retrieve": lectura, "historial": lectura,
                           "update": ["clientes.gestionar"], "partial_update": ["clientes.gestionar"]}
    filterset_fields = ["cliente"]
    search_fields = ["serial", "marca", "modelo"]

    def perform_update(self, serializer):
        e = serializer.save()
        auditoria.registrar("EQUIPO_ACTUALIZADO", "equipo", e.pk, request=self.request)

    @action(detail=True, methods=["get"])
    def historial(self, request, pk=None):
        from apps.ordenes.serializers import OrdenListaSerializer

        equipo = self.get_object()
        ordenes = equipo.ordenes.select_related("cliente", "equipo", "tecnico__usuario").order_by("-fecha_recepcion")
        return Response(OrdenListaSerializer(ordenes, many=True).data)
