"""RF-33: permiso para adjuntar fotos del equipo. Lo reciben los roles que tienen contacto con el equipo."""
from django.db import migrations

CODIGO = "ordenes.fotos"
ROLES = ["Administrador", "Recepcionista", "Técnico"]


def cargar(apps, schema_editor):
    Permiso = apps.get_model("usuarios", "Permiso")
    Rol = apps.get_model("usuarios", "Rol")
    permiso, _ = Permiso.objects.update_or_create(codigo=CODIGO, defaults={"descripcion": "Adjuntar fotos del equipo a las órdenes"})
    for rol in Rol.objects.filter(nombre__in=ROLES):
        rol.permisos.add(permiso)


def quitar(apps, schema_editor):
    apps.get_model("usuarios", "Permiso").objects.filter(codigo=CODIGO).delete()


class Migration(migrations.Migration):
    dependencies = [("usuarios", "0002_roles_y_permisos_iniciales")]
    operations = [migrations.RunPython(cargar, quitar)]
