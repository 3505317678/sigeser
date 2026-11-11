from django.conf import settings
from django.db import models
from django.utils import timezone


class Repuesto(models.Model):
    codigo = models.CharField(max_length=30, unique=True)
    nombre = models.CharField(max_length=120)
    categoria = models.CharField(max_length=60, blank=True)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    stock_actual = models.IntegerField(default=0)
    stock_minimo = models.IntegerField(default=0)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "repuestos"
        ordering = ["nombre"]
        constraints = [
            models.CheckConstraint(condition=models.Q(stock_actual__gte=0), name="ck_repuesto_stock"),
            models.CheckConstraint(condition=models.Q(stock_minimo__gte=0), name="ck_repuesto_minimo"),
            models.CheckConstraint(condition=models.Q(precio_unitario__gte=0), name="ck_repuesto_precio"),
        ]

    def __str__(self):
        return f"{self.codigo} · {self.nombre}"

    def esta_bajo_minimo(self):
        return self.stock_actual <= self.stock_minimo


class RepuestoUtilizado(models.Model):
    orden = models.ForeignKey("ordenes.OrdenServicio", on_delete=models.PROTECT, related_name="repuestos_utilizados")
    repuesto = models.ForeignKey(Repuesto, on_delete=models.PROTECT, related_name="usos")
    cantidad = models.IntegerField()
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "repuestos_orden"
        ordering = ["fecha", "id"]
        constraints = [models.CheckConstraint(condition=models.Q(cantidad__gt=0), name="ck_repuesto_orden_cantidad")]
        indexes = [models.Index(fields=["orden"], name="idx_repuestos_orden")]

    def subtotal(self):
        return self.cantidad * self.precio_unitario


class TipoMovimiento(models.TextChoices):
    ENTRADA = "ENTRADA", "Entrada"
    SALIDA = "SALIDA", "Salida"
    AJUSTE = "AJUSTE", "Ajuste"
    DEVOLUCION = "DEVOLUCION", "Devolución"


class MovimientoInventario(models.Model):
    repuesto = models.ForeignKey(Repuesto, on_delete=models.PROTECT, related_name="movimientos")
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    orden = models.ForeignKey("ordenes.OrdenServicio", null=True, blank=True, on_delete=models.PROTECT, related_name="movimientos")
    tipo = models.CharField(max_length=15, choices=TipoMovimiento.choices)
    cantidad = models.IntegerField(help_text="Positiva si aumenta el stock, negativa si lo disminuye")
    stock_resultante = models.IntegerField()
    motivo = models.CharField(max_length=200, blank=True)
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "movimientos_inventario"
        ordering = ["-fecha", "-id"]
        constraints = [
            models.CheckConstraint(condition=models.Q(tipo__in=TipoMovimiento.values), name="ck_movimiento_tipo"),
            models.CheckConstraint(condition=~models.Q(cantidad=0), name="ck_movimiento_cantidad"),
        ]
        indexes = [models.Index(fields=["repuesto", "fecha"], name="idx_movimiento_repuesto_fecha")]
