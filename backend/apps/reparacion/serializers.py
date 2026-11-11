from rest_framework import serializers

from .models import ActividadReparacion, Diagnostico


class DiagnosticoSerializer(serializers.ModelSerializer):
    tecnico_nombre = serializers.CharField(source="tecnico.usuario.nombre_completo", read_only=True)

    class Meta:
        model = Diagnostico
        fields = ["id", "tecnico", "tecnico_nombre", "descripcion", "causa_probable", "solucion_propuesta",
                  "costo_estimado", "aprobado", "fecha_respuesta", "fecha"]
        read_only_fields = ["tecnico", "aprobado", "fecha_respuesta", "fecha"]

    def validate_costo_estimado(self, v):
        if v < 0:
            raise serializers.ValidationError("El costo no puede ser negativo.")
        return v


class ActividadSerializer(serializers.ModelSerializer):
    tecnico_nombre = serializers.CharField(source="tecnico.usuario.nombre_completo", read_only=True)

    class Meta:
        model = ActividadReparacion
        fields = ["id", "tecnico", "tecnico_nombre", "descripcion", "fecha_inicio", "fecha_fin", "horas_empleadas"]
        read_only_fields = ["tecnico"]

    def validate_horas_empleadas(self, v):
        if v <= 0 or v > 200:
            raise serializers.ValidationError("Indique un tiempo entre 0 y 200 horas.")
        return v
