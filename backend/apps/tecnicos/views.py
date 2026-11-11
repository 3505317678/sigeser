from django.db.models import Count, Q
from rest_framework import mixins, viewsets

from apps.core import auditoria
from apps.core.permisos import TienePermiso
from apps.ordenes.models import EstadoOrden

from .models import Tecnico
from .serializers import TecnicoSerializer


class TecnicoViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """RF-06 y RF-07."""

    serializer_class = TecnicoSerializer
    permission_classes = [TienePermiso]
    permisos_por_accion = {"list": ["tecnicos.ver", "tecnicos.gestionar"], "retrieve": ["tecnicos.ver", "tecnicos.gestionar"],
                           "create": ["tecnicos.gestionar"], "update": ["tecnicos.gestionar"],
                           "partial_update": ["tecnicos.gestionar"]}
    filterset_fields = ["disponible"]
    search_fields = ["usuario__nombre_completo", "especialidad"]
    pagination_class = None

    def get_queryset(self):
        return Tecnico.objects.select_related("usuario").annotate(
            ordenes_activas=Count("ordenes", filter=~Q(ordenes__estado__in=EstadoOrden.FINALES))
        ).order_by("usuario__nombre_completo", "id")

    def perform_create(self, serializer):
        t = serializer.save()
        auditoria.registrar("TECNICO_CREADO", "tecnico", t.pk, request=self.request)

    def perform_update(self, serializer):
        t = serializer.save()
        auditoria.registrar("TECNICO_ACTUALIZADO", "tecnico", t.pk, request=self.request,
                            detalle={"disponible": t.disponible})
