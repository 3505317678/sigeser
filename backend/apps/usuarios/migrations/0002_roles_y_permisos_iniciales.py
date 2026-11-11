"""Carga los permisos y los tres roles definidos en la Tabla 4 del documento."""
from django.db import migrations

PERMISOS = {
    "usuarios.gestionar": "Crear, editar y desactivar usuarios; administrar roles",
    "auditoria.ver": "Consultar el registro de auditoría",
    "tecnicos.gestionar": "Registrar y actualizar técnicos",
    "tecnicos.ver": "Consultar técnicos y su carga de trabajo",
    "clientes.gestionar": "Registrar y editar clientes y equipos",
    "clientes.ver": "Consultar clientes, equipos e historial",
    "ordenes.crear": "Registrar y editar órdenes de servicio",
    "ordenes.asignar": "Asignar o reasignar técnicos",
    "ordenes.ver_todas": "Consultar todas las órdenes",
    "ordenes.ver_asignadas": "Consultar solo las órdenes asignadas",
    "ordenes.aprobacion": "Registrar la respuesta del cliente al presupuesto",
    "ordenes.entregar": "Registrar la entrega del equipo",
    "ordenes.cancelar": "Cancelar órdenes de servicio",
    "reparacion.registrar": "Registrar diagnóstico, actividades, repuestos y verificación",
    "inventario.gestionar": "Administrar repuestos y movimientos de inventario",
    "inventario.ver": "Consultar existencias",
    "reportes.ver": "Consultar el dashboard y generar reportes",
}

RECEPCIONISTA = ["tecnicos.ver", "clientes.gestionar", "clientes.ver", "ordenes.crear", "ordenes.asignar",
                 "ordenes.ver_todas", "ordenes.aprobacion", "ordenes.entregar", "ordenes.cancelar", "inventario.ver"]
TECNICO = ["clientes.ver", "ordenes.ver_asignadas", "reparacion.registrar", "inventario.ver"]
# El administrador hereda la recepción (generalización de actores) y no registra trabajo técnico.
ADMINISTRADOR = [c for c in PERMISOS if c not in ("reparacion.registrar", "ordenes.ver_asignadas")]

ROLES = {
    "Administrador": ("Configura el sistema y supervisa la operación", ADMINISTRADOR),
    "Recepcionista": ("Atiende la recepción y entrega de equipos", RECEPCIONISTA),
    "Técnico": ("Diagnostica y repara los equipos asignados", TECNICO),
}


def cargar(apps, schema_editor):
    Permiso = apps.get_model("usuarios", "Permiso")
    Rol = apps.get_model("usuarios", "Rol")
    objetos = {c: Permiso.objects.update_or_create(codigo=c, defaults={"descripcion": d})[0] for c, d in PERMISOS.items()}
    for nombre, (descripcion, codigos) in ROLES.items():
        rol, _ = Rol.objects.update_or_create(nombre=nombre, defaults={"descripcion": descripcion})
        rol.permisos.set([objetos[c] for c in codigos])


class Migration(migrations.Migration):
    dependencies = [("usuarios", "0001_initial")]
    operations = [migrations.RunPython(cargar, migrations.RunPython.noop)]
