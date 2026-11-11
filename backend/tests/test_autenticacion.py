"""RF-01, RF-02, RF-05, RNF-01, RNF-03 y RNF-04."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.core.models import RegistroAuditoria

from .conftest import CONTRASENA

URL = "/api/v1/auth/login"


def cliente_con_csrf():
    c = APIClient(enforce_csrf_checks=True)
    c.get("/api/v1/auth/csrf")
    return c, c.cookies["sigeser_csrf"].value


def login(c, token, correo, contrasena):
    return c.post(URL, {"correo": correo, "contrasena": contrasena}, format="json", HTTP_X_CSRFTOKEN=token)


@pytest.mark.django_db
class TestLogin:
    def test_login_correcto_devuelve_perfil_y_permisos(self, recepcionista):
        c, t = cliente_con_csrf()
        r = login(c, t, "recepcion@test.co", CONTRASENA)
        assert r.status_code == 200
        assert r.data["rol"] == "Recepcionista"
        assert "ordenes.crear" in r.data["permisos"]
        assert "usuarios.gestionar" not in r.data["permisos"]

    def test_cookie_de_sesion_httponly_y_samesite(self, recepcionista):
        c, t = cliente_con_csrf()
        login(c, t, "recepcion@test.co", CONTRASENA)
        cookie = c.cookies["sigeser_sesion"]
        assert cookie["httponly"] is True
        assert cookie["samesite"] == "Lax"

    def test_contrasena_incorrecta_mensaje_generico(self, recepcionista):
        c, t = cliente_con_csrf()
        r_mala = login(c, t, "recepcion@test.co", "incorrecta")
        r_inexistente = login(c, t, "nadie@test.co", "incorrecta")
        assert r_mala.status_code == r_inexistente.status_code == 401
        assert r_mala.data["detail"] == r_inexistente.data["detail"]  # no revela qué correos existen

    def test_login_sin_csrf_es_rechazado(self, recepcionista):
        c = APIClient(enforce_csrf_checks=True)
        r = c.post(URL, {"correo": "recepcion@test.co", "contrasena": CONTRASENA}, format="json")
        assert r.status_code == 403

    def test_bloqueo_tras_cinco_intentos_fallidos(self, recepcionista):
        c, t = cliente_con_csrf()
        for _ in range(5):
            assert login(c, t, "recepcion@test.co", "incorrecta").status_code == 401
        recepcionista.refresh_from_db()
        assert recepcionista.bloqueado_hasta > timezone.now() + timedelta(minutes=14)
        # con la cuenta bloqueada, ni la contraseña correcta permite entrar
        assert login(c, t, "recepcion@test.co", CONTRASENA).status_code == 401
        assert RegistroAuditoria.objects.filter(accion="CUENTA_BLOQUEADA", entidad_id=recepcionista.pk).exists()

    def test_bloqueo_expira(self, recepcionista):
        recepcionista.bloqueado_hasta = timezone.now() - timedelta(seconds=1)
        recepcionista.save()
        c, t = cliente_con_csrf()
        assert login(c, t, "recepcion@test.co", CONTRASENA).status_code == 200

    def test_usuario_desactivado_no_entra(self, recepcionista):
        recepcionista.activo = False
        recepcionista.save()
        c, t = cliente_con_csrf()
        assert login(c, t, "recepcion@test.co", CONTRASENA).status_code == 401

    def test_limite_de_tasa_por_ip(self, recepcionista, monkeypatch):
        monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"login": "3/min"})
        c, t = cliente_con_csrf()
        codigos = [login(c, t, "nadie@test.co", "x").status_code for _ in range(4)]
        assert codigos == [401, 401, 401, 429]

    def test_falsificar_x_forwarded_for_no_evade_el_limite(self, recepcionista, monkeypatch):
        monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"login": "3/min"})
        c, t = cliente_con_csrf()
        codigos = [
            c.post(URL, {"correo": "nadie@test.co", "contrasena": "x"}, format="json",
                   HTTP_X_CSRFTOKEN=t, HTTP_X_FORWARDED_FOR=f"10.0.0.{i}").status_code
            for i in range(4)
        ]
        assert codigos[-1] == 429

    @pytest.mark.parametrize("proxies,ip_esperada", [(0, "127.0.0.1"), (1, "190.85.10.20")])
    def test_ip_de_auditoria_solo_confia_en_el_proxy(self, recepcionista, settings, proxies, ip_esperada):
        settings.NUM_PROXIES = proxies
        c, t = cliente_con_csrf()
        c.post(URL, {"correo": "recepcion@test.co", "contrasena": "mala"}, format="json",
               HTTP_X_CSRFTOKEN=t, HTTP_X_REAL_IP="190.85.10.20")
        assert RegistroAuditoria.objects.get(accion="LOGIN_FALLIDO").ip == ip_esperada


@pytest.mark.django_db
class TestContrasenas:
    def test_se_guarda_con_argon2(self, recepcionista):
        assert recepcionista.password.startswith("argon2$argon2id$")
        assert CONTRASENA not in recepcionista.password

    def test_cambio_de_contrasena(self, api_recepcion, recepcionista):
        r = api_recepcion.post("/api/v1/auth/cambiar-contrasena",
                               {"contrasena_actual": CONTRASENA, "contrasena_nueva": "Otra.Clave-Larga-99"}, format="json")
        assert r.status_code == 204
        recepcionista.refresh_from_db()
        assert recepcionista.check_password("Otra.Clave-Larga-99")

    def test_cambio_cierra_las_otras_sesiones_y_conserva_la_actual(self, recepcionista):
        actual, otra = APIClient(), APIClient()
        actual.force_login(recepcionista)
        otra.force_login(recepcionista)
        r = actual.post("/api/v1/auth/cambiar-contrasena",
                        {"contrasena_actual": CONTRASENA, "contrasena_nueva": "Otra.Clave-Larga-99"}, format="json")
        assert r.status_code == 204
        assert actual.get("/api/v1/auth/yo").status_code == 200
        assert otra.get("/api/v1/auth/yo").status_code == 401

    def test_cambio_rechaza_contrasena_corta_o_actual_incorrecta(self, api_recepcion):
        r = api_recepcion.post("/api/v1/auth/cambiar-contrasena",
                               {"contrasena_actual": "mala", "contrasena_nueva": "corta"}, format="json")
        assert r.status_code == 422

    def test_logout_cierra_la_sesion(self, api_recepcion):
        assert api_recepcion.post("/api/v1/auth/logout").status_code == 204
        assert api_recepcion.get("/api/v1/auth/yo").status_code == 401

    def test_auditoria_no_guarda_contrasenas(self, recepcionista):
        c, t = cliente_con_csrf()
        login(c, t, "recepcion@test.co", "Mi-Clave-Secreta-123")
        for registro in RegistroAuditoria.objects.all():
            assert "Mi-Clave-Secreta-123" not in str(registro.detalle)
