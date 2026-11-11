from rest_framework import serializers

from .models import MovimientoInventario, Repuesto, TipoMovimiento


class RepuestoSerializer(serializers.ModelSerializer):
    bajo_minimo = serializers.SerializerMethodField()

    class Meta:
        model = Repuesto
        fields = ["id", "codigo", "nombre", "categoria", "precio_unitario", "stock_actual", "stock_minimo", "activo", "bajo_minimo"]
        read_only_fields = ["stock_actual", "activo"]

    def get_bajo_minimo(self, obj) -> bool:
        return obj.esta_bajo_minimo()

    def validate_codigo(self, v):
        return v.strip().upper()

    def validate(self, attrs):
        for campo in ("precio_unitario", "stock_minimo"):
            if campo in attrs and attrs[campo] < 0:
                raise serializers.ValidationError({campo: "No puede ser negativo."})
        return attrs


class RepuestoCrearSerializer(RepuestoSerializer):
    stock_inicial = serializers.IntegerField(min_value=0, default=0, write_only=True)

    class Meta(RepuestoSerializer.Meta):
        fields = RepuestoSerializer.Meta.fields + ["stock_inicial"]


class MovimientoSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.nombre_completo", read_only=True)
    orden_codigo = serializers.CharField(source="orden.codigo", default=None, read_only=True)
    repuesto_nombre = serializers.CharField(source="repuesto.nombre", read_only=True)

    class Meta:
        model = MovimientoInventario
        fields = ["id", "repuesto", "repuesto_nombre", "tipo", "cantidad", "stock_resultante", "motivo", "fecha",
                  "usuario_nombre", "orden_codigo"]


class RegistrarMovimientoSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(choices=[(TipoMovimiento.ENTRADA, "Entrada"), (TipoMovimiento.AJUSTE, "Ajuste"),
                                            (TipoMovimiento.DEVOLUCION, "Devolución")])
    cantidad = serializers.IntegerField(min_value=-100000, max_value=100000)
    motivo = serializers.CharField(max_length=200)
