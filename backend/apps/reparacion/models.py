from django.db import models
from django.utils import timezone


class Diagnostico(models.Model):
    orden = models.OneToOneField("ordenes.OrdenServicio", on_delete=models.CASCADE, related_name="diagnostico")
    tecnico = models.ForeignKey("tecnicos.Tecnico", on_delete=models.PROTECT, related_name="diagnosticos")
    descripcion = models.TextField()
    causa_probable = models.TextField(blank=True)
    solucion_propuesta = models.TextField()
    costo_estimado = models.DecimalField(max_digits=12, decimal_places=2)
    aprobado = models.BooleanField(null=True, blank=True)
    fecha_respuesta = models.DateTimeField(null=True, blank=True)
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "diagnosticos"
        constraints = [models.CheckConstraint(condition=models.Q(costo_estimado__gte=0), name="ck_diag_costo")]


class ActividadReparacion(models.Model):
    orden = models.ForeignKey("ordenes.OrdenServicio", on_delete=models.CASCADE, related_name="actividades")
    tecnico = models.ForeignKey("tecnicos.Tecnico", on_delete=models.PROTECT, related_name="actividades")
    descripcion = models.TextField()
    fecha_inicio = models.DateTimeField(default=timezone.now)
    fecha_fin = models.DateTimeField(null=True, blank=True)
    horas_empleadas = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        db_table = "actividades_reparacion"
        ordering = ["fecha_inicio", "id"]
        constraints = [models.CheckConstraint(condition=models.Q(horas_empleadas__gte=0), name="ck_actividad_horas")]
