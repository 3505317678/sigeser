from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Sum
from django.utils import timezone


class EstadoOrden(models.TextChoices):
    RECIBIDA = "RECIBIDA", "Recibida"
    EN_DIAGNOSTICO = "EN_DIAGNOSTICO", "En diagnóstico"
    PENDIENTE_APROBACION = "PENDIENTE_APROBACION", "Pendiente de aprobación"
    EN_ESPERA_REPUESTOS = "EN_ESPERA_REPUESTOS", "En espera de repuestos"
    EN_REPARACION = "EN_REPARACION", "En reparación"
    EN_VERIFICACION = "EN_VERIFICACION", "En verificación"
    LISTA_PARA_ENTREGA = "LISTA_PARA_ENTREGA", "Lista para entrega"
    ENTREGADA = "ENTREGADA", "Entregada"
    CANCELADA = "CANCELADA", "Cancelada"


EstadoOrden.FINALES = (EstadoOrden.ENTREGADA, EstadoOrden.CANCELADA)


class Prioridad(models.TextChoices):
    BAJA = "BAJA", "Baja"
    MEDIA = "MEDIA", "Media"
    ALTA = "ALTA", "Alta"


class OrdenServicio(models.Model):
    codigo = models.CharField(max_length=20, unique=True)
    cliente = models.ForeignKey("clientes.Cliente", on_delete=models.PROTECT, related_name="ordenes")
    equipo = models.ForeignKey("clientes.Equipo", on_delete=models.PROTECT, related_name="ordenes")
    tecnico = models.ForeignKey("tecnicos.Tecnico", null=True, blank=True, on_delete=models.PROTECT, related_name="ordenes")
    estado = models.CharField(max_length=30, choices=EstadoOrden.choices, default=EstadoOrden.RECIBIDA)
    prioridad = models.CharField(max_length=10, choices=Prioridad.choices, default=Prioridad.MEDIA)
    falla_reportada = models.TextField()
    accesorios = models.TextField(blank=True)
    estado_fisico = models.TextField(blank=True)
    fecha_recepcion = models.DateTimeField(default=timezone.now)
    fecha_estimada_entrega = models.DateField(null=True, blank=True)
    costo_mano_obra = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    fecha_entrega = models.DateTimeField(null=True, blank=True)
    recibido_por = models.CharField(max_length=150, blank=True)
    motivo_cancelacion = models.TextField(blank=True)

    class Meta:
        db_table = "ordenes_servicio"
        ordering = ["-fecha_recepcion"]
        constraints = [
            models.CheckConstraint(condition=models.Q(estado__in=EstadoOrden.values), name="ck_orden_estado"),
            models.CheckConstraint(condition=models.Q(prioridad__in=Prioridad.values), name="ck_orden_prioridad"),
            models.CheckConstraint(condition=models.Q(costo_mano_obra__gte=0), name="ck_orden_mano_obra"),
        ]
        indexes = [
            models.Index(fields=["estado"], name="idx_orden_estado"),
            models.Index(fields=["tecnico", "estado"], name="idx_orden_tecnico_estado"),
            models.Index(fields=["fecha_recepcion"], name="idx_orden_fecha"),
        ]

    def __str__(self):
        return self.codigo

    @property
    def cerrada(self):
        return self.estado in EstadoOrden.FINALES

    @property
    def vencida(self):
        return bool(
            self.fecha_estimada_entrega
            and not self.cerrada
            and self.estado != EstadoOrden.LISTA_PARA_ENTREGA
            and self.fecha_estimada_entrega < timezone.localdate()
        )

    def total_repuestos(self):
        total = self.repuestos_utilizados.aggregate(t=Sum(F("cantidad") * F("precio_unitario")))["t"]
        return total or Decimal("0")

    def calcular_total(self):
        """RF-19: mano de obra + suma de (cantidad × precio unitario) de los repuestos."""
        return self.costo_mano_obra + self.total_repuestos()


class HistorialEstado(models.Model):
    orden = models.ForeignKey(OrdenServicio, on_delete=models.CASCADE, related_name="historial")
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    estado_anterior = models.CharField(max_length=30, choices=EstadoOrden.choices, blank=True)
    estado_nuevo = models.CharField(max_length=30, choices=EstadoOrden.choices)
    observacion = models.TextField(blank=True)
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "historial_estados"
        ordering = ["fecha", "id"]
        indexes = [models.Index(fields=["orden", "fecha"], name="idx_historial_orden_fecha")]


class EtapaFoto(models.TextChoices):
    RECEPCION = "RECEPCION", "Recepción"
    DIAGNOSTICO = "DIAGNOSTICO", "Diagnóstico"
    REPARACION = "REPARACION", "Reparación"
    ENTREGA = "ENTREGA", "Entrega"

    @classmethod
    def para_estado(cls, estado):
        """La etapa de la foto se deduce del estado de la orden en el momento de tomarla."""
        if estado == EstadoOrden.RECIBIDA:
            return cls.RECEPCION
        if estado in (EstadoOrden.EN_DIAGNOSTICO, EstadoOrden.PENDIENTE_APROBACION):
            return cls.DIAGNOSTICO
        if estado in (EstadoOrden.EN_ESPERA_REPUESTOS, EstadoOrden.EN_REPARACION, EstadoOrden.EN_VERIFICACION):
            return cls.REPARACION
        return cls.ENTREGA


class FotoOrden(models.Model):
    """Evidencia fotográfica del equipo (RF-33). Las fotos son evidencia: no se editan ni se eliminan."""

    orden = models.ForeignKey(OrdenServicio, on_delete=models.CASCADE, related_name="fotos")
    etapa = models.CharField(max_length=20, choices=EtapaFoto.choices)
    descripcion = models.CharField(max_length=200, blank=True)
    archivo = models.FileField(max_length=200)
    miniatura = models.FileField(max_length=200)
    ancho = models.PositiveIntegerField()
    alto = models.PositiveIntegerField()
    tamano_bytes = models.PositiveIntegerField()
    subida_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "fotos_orden"
        ordering = ["fecha", "id"]
        constraints = [
            models.CheckConstraint(condition=models.Q(etapa__in=EtapaFoto.values), name="ck_foto_etapa"),
            models.CheckConstraint(condition=models.Q(ancho__gt=0, alto__gt=0), name="ck_foto_dimensiones"),
        ]
        indexes = [models.Index(fields=["orden", "fecha"], name="idx_foto_orden_fecha")]


class NotaVoz(models.Model):
    """Nota de voz o grabación del sonido anormal del equipo (RF-37). Es evidencia: no se edita ni se elimina."""

    orden = models.ForeignKey(OrdenServicio, on_delete=models.CASCADE, related_name="notas_voz")
    etapa = models.CharField(max_length=20, choices=EtapaFoto.choices)
    descripcion = models.CharField(max_length=200, blank=True)
    archivo = models.FileField(max_length=200)
    tipo_mime = models.CharField(max_length=20)
    duracion_ms = models.PositiveIntegerField()
    tamano_bytes = models.PositiveIntegerField()
    grabada_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "notas_voz_orden"
        ordering = ["fecha", "id"]
        constraints = [
            models.CheckConstraint(condition=models.Q(etapa__in=EtapaFoto.values), name="ck_nota_voz_etapa"),
            models.CheckConstraint(condition=models.Q(duracion_ms__gt=0), name="ck_nota_voz_duracion"),
        ]
        indexes = [models.Index(fields=["orden", "fecha"], name="idx_nota_voz_orden_fecha")]

    def __str__(self):
        return f"Nota de voz {self.pk} de {self.orden_id}"
