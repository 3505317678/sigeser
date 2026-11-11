from rest_framework import serializers

from .models import RegistroAuditoria


class RegistroAuditoriaSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.nombre_completo", default=None, read_only=True)

    class Meta:
        model = RegistroAuditoria
        fields = ["id", "fecha", "usuario", "usuario_nombre", "accion", "entidad", "entidad_id", "ip", "detalle"]
