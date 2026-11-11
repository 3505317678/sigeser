from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.utils import timezone


class Permiso(models.Model):
    """Permiso atómico, por ejemplo «ordenes.crear»."""

    codigo = models.CharField(max_length=60, unique=True)
    descripcion = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "permisos"
        ordering = ["codigo"]

    def __str__(self):
        return self.codigo


class Rol(models.Model):
    nombre = models.CharField(max_length=50, unique=True)
    descripcion = models.CharField(max_length=200, blank=True)
    permisos = models.ManyToManyField(Permiso, db_table="rol_permisos", related_name="roles", blank=True)

    class Meta:
        db_table = "roles"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class UsuarioManager(BaseUserManager):
    def create_user(self, correo, nombre_completo, rol, password=None, **extra):
        if not correo:
            raise ValueError("El correo es obligatorio")
        usuario = self.model(correo=self.normalize_email(correo).lower(), nombre_completo=nombre_completo, rol=rol, **extra)
        usuario.set_password(password)
        usuario.save(using=self._db)
        return usuario


class Usuario(AbstractBaseUser):
    """Cuenta de acceso. La contraseña solo se guarda como hash Argon2id (RNF-01)."""

    password = models.CharField("hash de la contraseña", max_length=255, db_column="password_hash")
    last_login = models.DateTimeField("último acceso", blank=True, null=True, db_column="ultimo_acceso")
    rol = models.ForeignKey(Rol, on_delete=models.PROTECT, related_name="usuarios")
    nombre_completo = models.CharField(max_length=120)
    correo = models.EmailField(max_length=254, unique=True)
    activo = models.BooleanField(default=True)
    intentos_fallidos = models.PositiveSmallIntegerField(default=0)
    bloqueado_hasta = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "correo"
    EMAIL_FIELD = "correo"
    REQUIRED_FIELDS = ["nombre_completo"]

    objects = UsuarioManager()

    class Meta:
        db_table = "usuarios"
        ordering = ["nombre_completo"]

    def __str__(self):
        return self.nombre_completo

    @property
    def is_active(self):
        return self.activo

    def esta_bloqueado(self, ahora=None):
        return bool(self.bloqueado_hasta and self.bloqueado_hasta > (ahora or timezone.now()))

    def permisos(self):
        if not hasattr(self, "_cache_permisos"):
            self._cache_permisos = set(self.rol.permisos.values_list("codigo", flat=True)) if self.rol_id else set()
        return self._cache_permisos

    def tiene_permiso(self, codigo):
        return self.activo and codigo in self.permisos()
