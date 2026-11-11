from django.db import models


class TipoDocumento(models.TextChoices):
    CC = "CC", "Cédula de ciudadanía"
    CE = "CE", "Cédula de extranjería"
    NIT = "NIT", "NIT"
    PAS = "PAS", "Pasaporte"


class Cliente(models.Model):
    tipo_documento = models.CharField(max_length=10, choices=TipoDocumento.choices)
    numero_documento = models.CharField(max_length=20)
    nombre = models.CharField(max_length=150)
    telefono = models.CharField(max_length=20)
    correo = models.EmailField(max_length=254, blank=True)
    direccion = models.CharField(max_length=200, blank=True)
    autoriza_datos = models.BooleanField(default=False)
    fecha_autorizacion = models.DateTimeField(null=True, blank=True)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "clientes"
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(fields=["tipo_documento", "numero_documento"], name="uk_cliente_documento"),
        ]
        indexes = [
            models.Index(fields=["nombre"], name="idx_cliente_nombre"),
            models.Index(fields=["telefono"], name="idx_cliente_telefono"),
        ]

    def __str__(self):
        return f"{self.nombre} ({self.tipo_documento} {self.numero_documento})"


class Equipo(models.Model):
    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT, related_name="equipos")
    tipo = models.CharField(max_length=40)
    marca = models.CharField(max_length=60)
    modelo = models.CharField(max_length=60)
    serial = models.CharField(max_length=80, blank=True)
    descripcion = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "equipos"
        ordering = ["-creado_en"]
        indexes = [models.Index(fields=["serial"], name="idx_equipo_serial")]

    def __str__(self):
        return f"{self.tipo} {self.marca} {self.modelo}"
