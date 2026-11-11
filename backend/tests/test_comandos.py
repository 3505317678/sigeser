"""Comandos de arranque: administrador inicial y datos de demostración (sin credenciales en el código)."""
import pytest
from django.core.management import CommandError, call_command

from apps.inventario.models import Repuesto
from apps.ordenes.models import EstadoOrden, OrdenServicio
from apps.usuarios.models import Usuario


@pytest.mark.django_db
class TestCrearAdmin:
    def test_sin_variables_no_crea_nada(self, monkeypatch):
        monkeypatch.delenv("SIGESER_ADMIN_CORREO", raising=False)
        monkeypatch.delenv("SIGESER_ADMIN_CONTRASENA", raising=False)
        call_command("crear_admin")
        assert not Usuario.objects.exists()

    def test_rechaza_contrasena_corta(self, monkeypatch):
        monkeypatch.setenv("SIGESER_ADMIN_CORREO", "admin@empresa.co")
        monkeypatch.setenv("SIGESER_ADMIN_CONTRASENA", "corta")
        with pytest.raises(CommandError):
            call_command("crear_admin")

    def test_crea_una_sola_vez(self, monkeypatch):
        monkeypatch.setenv("SIGESER_ADMIN_CORREO", "Admin@Empresa.co")
        monkeypatch.setenv("SIGESER_ADMIN_CONTRASENA", "Clave-Larga-Segura-1")
        call_command("crear_admin")
        call_command("crear_admin")
        admin = Usuario.objects.get()
        assert admin.correo == "admin@empresa.co" and admin.rol.nombre == "Administrador"
        assert admin.check_password("Clave-Larga-Segura-1")


@pytest.mark.django_db
class TestCargarDemo:
    def test_exige_contrasena_de_demo(self, admin, monkeypatch):
        monkeypatch.delenv("SIGESER_DEMO_CONTRASENA", raising=False)
        with pytest.raises(CommandError):
            call_command("cargar_demo")

    def test_exige_administrador(self, monkeypatch):
        monkeypatch.setenv("SIGESER_DEMO_CONTRASENA", "Demo-Clave-Larga-1")
        with pytest.raises(CommandError):
            call_command("cargar_demo")

    def test_carga_ordenes_coherentes_por_el_flujo_real(self, admin, monkeypatch):
        monkeypatch.setenv("SIGESER_DEMO_CONTRASENA", "Demo-Clave-Larga-1")
        call_command("cargar_demo", ordenes=40)
        assert OrdenServicio.objects.count() == 40
        estados = set(OrdenServicio.objects.values_list("estado", flat=True))
        assert {EstadoOrden.ENTREGADA, EstadoOrden.EN_REPARACION, EstadoOrden.RECIBIDA, EstadoOrden.CANCELADA} <= estados
        # el inventario nunca queda negativo y las entregadas tienen fecha y receptor
        assert not Repuesto.objects.filter(stock_actual__lt=0).exists()
        entregadas = OrdenServicio.objects.filter(estado=EstadoOrden.ENTREGADA)
        assert not entregadas.filter(fecha_entrega__isnull=True).exists()
        assert not entregadas.filter(recibido_por="").exists()
        # las fechas retroactivas respetan el orden recepción < entrega
        for o in entregadas:
            assert o.fecha_entrega > o.fecha_recepcion

    def test_no_duplica_si_ya_hay_ordenes(self, admin, monkeypatch):
        monkeypatch.setenv("SIGESER_DEMO_CONTRASENA", "Demo-Clave-Larga-1")
        call_command("cargar_demo", ordenes=20)
        call_command("cargar_demo", ordenes=20)
        assert OrdenServicio.objects.count() == 20
