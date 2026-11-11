from rest_framework import serializers

from apps.usuarios.models import Usuario

from .models import Tecnico


class TecnicoSerializer(serializers.ModelSerializer):
    usuario = serializers.PrimaryKeyRelatedField(queryset=Usuario.objects.filter(activo=True))
    nombre = serializers.CharField(source="usuario.nombre_completo", read_only=True)
    correo = serializers.CharField(source="usuario.correo", read_only=True)
    ordenes_activas = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tecnico
        fields = ["id", "usuario", "nombre", "correo", "especialidad", "telefono", "disponible", "ordenes_activas"]

    def validate_usuario(self, usuario):
        if not usuario.rol.permisos.filter(codigo="reparacion.registrar").exists():
            raise serializers.ValidationError("El usuario debe tener un rol con permiso de reparación (rol Técnico).")
        return usuario
