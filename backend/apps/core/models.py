from django.conf import settings
from django.db import models


class RegistroAuditoria(models.Model):
    """RNF-07: registro de acciones críticas (quién, qué, sobre qué, cuándo y desde dónde)."""

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    accion = models.CharField(max_length=60)
    entidad = models.CharField(max_length=60)
    entidad_id = models.BigIntegerField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    detalle = models.JSONField(null=True, blank=True)
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "auditoria"
        ordering = ["-fecha"]
        indexes = [
            models.Index(fields=["entidad", "entidad_id"], name="idx_auditoria_entidad"),
            models.Index(fields=["fecha"], name="idx_auditoria_fecha"),
        ]

    def __str__(self):
        return f"{self.fecha:%Y-%m-%d %H:%M} {self.accion} {self.entidad}#{self.entidad_id}"
