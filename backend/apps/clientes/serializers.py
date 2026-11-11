from django.utils import timezone
from rest_framework import serializers

from .models import Cliente, Equipo


class EquipoSerializer(serializers.ModelSerializer):
    total_ordenes = serializers.IntegerField(source="ordenes.count", read_only=True)

    class Meta:
        model = Equipo
        fields = ["id", "cliente", "tipo", "marca", "modelo", "serial", "descripcion", "creado_en", "total_ordenes"]
        read_only_fields = ["cliente", "creado_en"]


class ClienteSerializer(serializers.ModelSerializer):
    equipos = EquipoSerializer(many=True, read_only=True)

    class Meta:
        model = Cliente
        fields = ["id", "tipo_documento", "numero_documento", "nombre", "telefono", "correo", "direccion",
                  "autoriza_datos", "fecha_autorizacion", "activo", "creado_en", "equipos"]
        read_only_fields = ["fecha_autorizacion", "activo", "creado_en"]

    def validate_numero_documento(self, value):
        value = value.strip()
        if not value.replace("-", "").isalnum():
            raise serializers.ValidationError("Use solo letras, números y guiones.")
        return value

    def validate_autoriza_datos(self, value):
        # RNF-09 / Ley 1581 de 2012: sin autorización del titular no se registran sus datos.
        if not value:
            raise serializers.ValidationError("Se requiere la autorización del titular para el tratamiento de sus datos.")
        return value

    def create(self, validated):
        validated["fecha_autorizacion"] = timezone.now()
        return super().create(validated)


class ClienteListaSerializer(serializers.ModelSerializer):
    total_equipos = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cliente
        fields = ["id", "tipo_documento", "numero_documento", "nombre", "telefono", "correo", "activo", "total_equipos"]
