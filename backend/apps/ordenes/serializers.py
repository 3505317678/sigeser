from rest_framework import serializers

from apps.clientes.models import Cliente, Equipo
from apps.inventario.models import Repuesto, RepuestoUtilizado
from apps.reparacion.serializers import ActividadSerializer, DiagnosticoSerializer
from apps.tecnicos.models import Tecnico

from .models import FotoOrden, HistorialEstado, NotaVoz, OrdenServicio, Prioridad


class HistorialSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.nombre_completo", read_only=True)

    class Meta:
        model = HistorialEstado
        fields = ["id", "estado_anterior", "estado_nuevo", "observacion", "fecha", "usuario_nombre"]


class FotoSerializer(serializers.ModelSerializer):
    etapa_nombre = serializers.CharField(source="get_etapa_display", read_only=True)
    subida_por_nombre = serializers.CharField(source="subida_por.nombre_completo", read_only=True)
    url = serializers.SerializerMethodField()
    url_miniatura = serializers.SerializerMethodField()

    class Meta:
        model = FotoOrden
        fields = ["id", "etapa", "etapa_nombre", "descripcion", "ancho", "alto", "tamano_bytes", "fecha",
                  "subida_por_nombre", "url", "url_miniatura"]

    def get_url(self, f) -> str:
        return f"/api/v1/ordenes/{f.orden_id}/fotos/{f.pk}/imagen"

    def get_url_miniatura(self, f) -> str:
        return f"/api/v1/ordenes/{f.orden_id}/fotos/{f.pk}/imagen?tamano=miniatura"


class SubirFotoSerializer(serializers.Serializer):
    archivo = serializers.FileField()
    descripcion = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class NotaVozSerializer(serializers.ModelSerializer):
    etapa_nombre = serializers.CharField(source="get_etapa_display", read_only=True)
    grabada_por_nombre = serializers.CharField(source="grabada_por.nombre_completo", read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = NotaVoz
        fields = ["id", "etapa", "etapa_nombre", "descripcion", "tipo_mime", "duracion_ms", "tamano_bytes", "fecha",
                  "grabada_por_nombre", "url"]

    def get_url(self, n) -> str:
        return f"/api/v1/ordenes/{n.orden_id}/notas-voz/{n.pk}/audio"


class SubirNotaVozSerializer(serializers.Serializer):
    archivo = serializers.FileField()
    duracion_ms = serializers.IntegerField(min_value=0)
    descripcion = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class RepuestoUtilizadoSerializer(serializers.ModelSerializer):
    codigo = serializers.CharField(source="repuesto.codigo", read_only=True)
    nombre = serializers.CharField(source="repuesto.nombre", read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = RepuestoUtilizado
        fields = ["id", "repuesto", "codigo", "nombre", "cantidad", "precio_unitario", "subtotal", "fecha"]


class OrdenListaSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source="cliente.nombre", read_only=True)
    equipo_resumen = serializers.CharField(source="equipo.__str__", read_only=True)
    tecnico_nombre = serializers.CharField(source="tecnico.usuario.nombre_completo", default=None, read_only=True)
    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)
    vencida = serializers.BooleanField(read_only=True)

    class Meta:
        model = OrdenServicio
        fields = ["id", "codigo", "cliente", "cliente_nombre", "equipo", "equipo_resumen", "tecnico", "tecnico_nombre",
                  "estado", "estado_nombre", "prioridad", "fecha_recepcion", "fecha_estimada_entrega", "fecha_entrega", "vencida"]


class OrdenDetalleSerializer(OrdenListaSerializer):
    cliente_documento = serializers.SerializerMethodField()
    cliente_telefono = serializers.CharField(source="cliente.telefono", read_only=True)
    equipo_serial = serializers.CharField(source="equipo.serial", read_only=True)
    historial = HistorialSerializer(many=True, read_only=True)
    actividades = ActividadSerializer(many=True, read_only=True)
    repuestos = RepuestoUtilizadoSerializer(source="repuestos_utilizados", many=True, read_only=True)
    fotos = FotoSerializer(many=True, read_only=True)
    notas_voz = NotaVozSerializer(many=True, read_only=True)
    diagnostico = serializers.SerializerMethodField()
    total_repuestos = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    acciones = serializers.SerializerMethodField()

    class Meta(OrdenListaSerializer.Meta):
        fields = OrdenListaSerializer.Meta.fields + [
            "cliente_documento", "cliente_telefono", "equipo_serial", "falla_reportada", "accesorios", "estado_fisico",
            "costo_mano_obra", "total_repuestos", "total", "recibido_por", "motivo_cancelacion",
            "diagnostico", "historial", "actividades", "repuestos", "fotos", "notas_voz", "acciones"]

    def get_cliente_documento(self, o) -> str:
        return f"{o.cliente.tipo_documento} {o.cliente.numero_documento}"

    def get_diagnostico(self, o) -> dict | None:
        return DiagnosticoSerializer(o.diagnostico).data if hasattr(o, "diagnostico") else None

    def get_total_repuestos(self, o) -> str:
        return str(o.total_repuestos())

    def get_total(self, o) -> str:
        return str(o.calcular_total())

    def get_acciones(self, o) -> list[str]:
        from .servicios import acciones_disponibles

        return acciones_disponibles(o, self.context["request"].user)


class OrdenCrearSerializer(serializers.Serializer):
    cliente = serializers.PrimaryKeyRelatedField(queryset=Cliente.objects.filter(activo=True))
    equipo = serializers.PrimaryKeyRelatedField(queryset=Equipo.objects.all())
    falla_reportada = serializers.CharField(max_length=4000)
    accesorios = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    estado_fisico = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    prioridad = serializers.ChoiceField(choices=Prioridad.choices, default=Prioridad.MEDIA)
    fecha_estimada_entrega = serializers.DateField(required=False, allow_null=True)
    tecnico = serializers.PrimaryKeyRelatedField(queryset=Tecnico.objects.filter(disponible=True), required=False, allow_null=True)

    def validate(self, attrs):
        from django.utils import timezone

        f = attrs.get("fecha_estimada_entrega")
        if f and f < timezone.localdate():
            raise serializers.ValidationError({"fecha_estimada_entrega": "La fecha estimada no puede estar en el pasado."})
        return attrs


class OrdenEditarSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrdenServicio
        fields = ["prioridad", "fecha_estimada_entrega", "accesorios", "estado_fisico", "falla_reportada"]


class AsignarTecnicoSerializer(serializers.Serializer):
    tecnico = serializers.PrimaryKeyRelatedField(queryset=Tecnico.objects.select_related("usuario"))


class AprobacionSerializer(serializers.Serializer):
    aprobado = serializers.BooleanField()
    esperar_repuestos = serializers.BooleanField(default=False)
    observacion = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class ObservacionSerializer(serializers.Serializer):
    observacion = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class VerificacionSerializer(serializers.Serializer):
    aprobada = serializers.BooleanField()
    observacion = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class EnviarVerificacionSerializer(serializers.Serializer):
    costo_mano_obra = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=0)


class EntregaSerializer(serializers.Serializer):
    recibido_por = serializers.CharField(max_length=150)
    observacion = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class CancelarSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=1000)


class AgregarRepuestoSerializer(serializers.Serializer):
    repuesto = serializers.PrimaryKeyRelatedField(queryset=Repuesto.objects.filter(activo=True))
    cantidad = serializers.IntegerField(min_value=1, max_value=1000)
