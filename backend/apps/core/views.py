from django.db import connection
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import RegistroAuditoria
from .permisos import TienePermiso
from .serializers import RegistroAuditoriaSerializer


@extend_schema(responses=dict)
@api_view(["GET"])
@permission_classes([AllowAny])
def salud(request):
    """Comprobación de vida para Docker: responde 200 si la base de datos atiende."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return Response({"estado": "ok"})


class FiltroAuditoria(filters.FilterSet):
    desde = filters.DateFilter(field_name="fecha", lookup_expr="date__gte")
    hasta = filters.DateFilter(field_name="fecha", lookup_expr="date__lte")

    class Meta:
        model = RegistroAuditoria
        fields = ["accion", "entidad", "usuario"]


class AuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RegistroAuditoria.objects.select_related("usuario")
    serializer_class = RegistroAuditoriaSerializer
    permission_classes = [TienePermiso]
    permisos_por_accion = {"list": ["auditoria.ver"], "retrieve": ["auditoria.ver"]}
    filterset_class = FiltroAuditoria
    search_fields = ["accion", "entidad"]
