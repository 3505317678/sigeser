"""Crea el administrador inicial a partir de variables de entorno (sin credenciales en el código)."""
import os

from django.core.management.base import BaseCommand, CommandError

from apps.usuarios.models import Rol, Usuario


class Command(BaseCommand):
    help = "Crea el usuario administrador definido en SIGESER_ADMIN_CORREO y SIGESER_ADMIN_CONTRASENA si no existe."

    def handle(self, *args, **options):
        correo = os.environ.get("SIGESER_ADMIN_CORREO")
        contrasena = os.environ.get("SIGESER_ADMIN_CONTRASENA")
        nombre = os.environ.get("SIGESER_ADMIN_NOMBRE", "Administrador SIGESER")
        if not correo or not contrasena:
            self.stdout.write("SIGESER_ADMIN_CORREO o SIGESER_ADMIN_CONTRASENA no definidos: no se crea administrador.")
            return
        if len(contrasena) < 12:
            raise CommandError("La contraseña del administrador debe tener al menos 12 caracteres.")
        if Usuario.objects.filter(correo=correo.lower()).exists():
            self.stdout.write(f"El administrador {correo} ya existe.")
            return
        Usuario.objects.create_user(correo, nombre, Rol.objects.get(nombre="Administrador"), contrasena)
        self.stdout.write(self.style.SUCCESS(f"Administrador {correo} creado."))
