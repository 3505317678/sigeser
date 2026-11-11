from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clientes.models import Cliente, Equipo
from apps.inventario.models import Repuesto
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Rol, Usuario

CONTRASENA = "Clave.Segura-2026"


@pytest.fixture(autouse=True)
def cache_limpia():
    """El limitador de tasa guarda su historial en la caché; cada prueba parte de cero."""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


def crear_usuario(correo, rol, nombre=None):
    return Usuario.objects.create_user(correo, nombre or correo.split("@")[0].title(), Rol.objects.get(nombre=rol), CONTRASENA)


def cliente_api(usuario=None):
    c = APIClient()
    if usuario:
        c.force_login(usuario)
    return c


@pytest.fixture
def admin(db):
    return crear_usuario("admin@test.co", "Administrador", "Ana Administradora")


@pytest.fixture
def recepcionista(db):
    return crear_usuario("recepcion@test.co", "Recepcionista", "Rosa Recepción")


@pytest.fixture
def tecnico(db):
    u = crear_usuario("tecnico@test.co", "Técnico", "Tomás Técnico")
    return Tecnico.objects.create(usuario=u, especialidad="Portátiles")


@pytest.fixture
def otro_tecnico(db):
    u = crear_usuario("otro@test.co", "Técnico", "Olga Otra")
    return Tecnico.objects.create(usuario=u, especialidad="Celulares")


@pytest.fixture
def api_admin(admin):
    return cliente_api(admin)


@pytest.fixture
def api_recepcion(recepcionista):
    return cliente_api(recepcionista)


@pytest.fixture
def api_tecnico(tecnico):
    return cliente_api(tecnico.usuario)


@pytest.fixture
def api_otro_tecnico(otro_tecnico):
    return cliente_api(otro_tecnico.usuario)


@pytest.fixture
def cliente(db):
    return Cliente.objects.create(tipo_documento="CC", numero_documento="1122334455", nombre="Pedro Pérez",
                                  telefono="3101234567", autoriza_datos=True, fecha_autorizacion=timezone.now())


@pytest.fixture
def equipo(cliente):
    return Equipo.objects.create(cliente=cliente, tipo="Portátil", marca="Lenovo", modelo="IdeaPad 3", serial="SN123")


@pytest.fixture
def repuesto(admin):
    from apps.inventario import servicios

    r = Repuesto.objects.create(codigo="SSD-480", nombre="SSD 480 GB", categoria="Almacenamiento",
                                precio_unitario=Decimal("165000"), stock_minimo=2)
    servicios.registrar_movimiento(r.pk, "ENTRADA", 5, admin, "Compra inicial")
    r.refresh_from_db()
    return r


@pytest.fixture
def nueva_orden(api_recepcion, cliente, equipo, tecnico):
    """Crea una orden por la API y la asigna al técnico."""

    def _crear(asignar=True):
        datos = {"cliente": cliente.pk, "equipo": equipo.pk, "falla_reportada": "No enciende",
                 "prioridad": "ALTA", "fecha_estimada_entrega": (timezone.localdate() + timedelta(days=3)).isoformat()}
        r = api_recepcion.post("/api/v1/ordenes", datos, format="json")
        assert r.status_code == 201, r.data
        if asignar:
            r = api_recepcion.post(f"/api/v1/ordenes/{r.data['id']}/asignar-tecnico", {"tecnico": tecnico.pk}, format="json")
            assert r.status_code == 200, r.data
        return r.data

    return _crear


@pytest.fixture
def orden_en_reparacion(nueva_orden, api_tecnico, api_recepcion):
    o = nueva_orden()
    r = api_tecnico.post(f"/api/v1/ordenes/{o['id']}/diagnostico",
                         {"descripcion": "Disco dañado", "solucion_propuesta": "Cambiar disco", "costo_estimado": "90000"},
                         format="json")
    assert r.status_code == 200, r.data
    r = api_recepcion.post(f"/api/v1/ordenes/{o['id']}/aprobacion", {"aprobado": True}, format="json")
    assert r.status_code == 200 and r.data["estado"] == "EN_REPARACION", r.data
    return r.data
