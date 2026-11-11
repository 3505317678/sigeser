from django.conf import settings
from django.db import models


class Tecnico(models.Model):
    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="tecnico")
    especialidad = models.CharField(max_length=80)
    telefono = models.CharField(max_length=20, blank=True)
    disponible = models.BooleanField(default=True)

    class Meta:
        db_table = "tecnicos"
        ordering = ["usuario__nombre_completo"]

    def __str__(self):
        return self.usuario.nombre_completo

    def ordenes_activas(self):
        from apps.ordenes.models import EstadoOrden

        return self.ordenes.exclude(estado__in=EstadoOrden.FINALES).count()
