"""RNF-02: control de acceso por roles según la matriz de la Tabla 4."""
import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestMatrizDePermisos:
    @pytest.mark.parametrize("url", ["/api/v1/ordenes", "/api/v1/clientes", "/api/v1/repuestos", "/api/v1/reportes/dashboard"])
    def test_anonimo_recibe_401(self, url):
        assert APIClient().get(url).status_code == 401

    @pytest.mark.parametrize("url,esperado_admin,esperado_recepcion,esperado_tecnico", [
        ("/api/v1/usuarios", 200, 403, 403),
        ("/api/v1/auditoria", 200, 403, 403),
        ("/api/v1/reportes/dashboard", 200, 403, 403),
        ("/api/v1/clientes", 200, 200, 200),
        ("/api/v1/repuestos", 200, 200, 200),
        ("/api/v1/tecnicos", 200, 200, 403),
        ("/api/v1/ordenes", 200, 200, 200),
    ])
    def test_lectura_por_rol(self, url, esperado_admin, esperado_recepcion, esperado_tecnico,
                             api_admin, api_recepcion, api_tecnico):
        assert api_admin.get(url).status_code == esperado_admin
        assert api_recepcion.get(url).status_code == esperado_recepcion
        assert api_tecnico.get(url).status_code == esperado_tecnico

    def test_tecnico_no_puede_crear_ordenes_ni_clientes(self, api_tecnico, cliente, equipo):
        r = api_tecnico.post("/api/v1/ordenes", {"cliente": cliente.pk, "equipo": equipo.pk, "falla_reportada": "x"}, format="json")
        assert r.status_code == 403
        r = api_tecnico.post("/api/v1/clientes", {}, format="json")
        assert r.status_code == 403

    def test_recepcion_no_registra_diagnostico(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        r = api_recepcion.post(f"/api/v1/ordenes/{o['id']}/diagnostico",
                               {"descripcion": "x", "solucion_propuesta": "y", "costo_estimado": "1"}, format="json")
        assert r.status_code == 403

    def test_tecnico_solo_ve_sus_ordenes(self, nueva_orden, api_tecnico, api_otro_tecnico):
        o = nueva_orden()
        assert api_tecnico.get(f"/api/v1/ordenes/{o['id']}").status_code == 200
        assert api_otro_tecnico.get(f"/api/v1/ordenes/{o['id']}").status_code == 404
        assert api_otro_tecnico.get("/api/v1/ordenes").data["count"] == 0

    def test_admin_no_registra_trabajo_tecnico(self, nueva_orden, api_admin):
        o = nueva_orden()
        r = api_admin.post(f"/api/v1/ordenes/{o['id']}/iniciar-diagnostico")
        assert r.status_code == 403

    def test_acciones_disponibles_dependen_del_rol(self, nueva_orden, api_recepcion, api_tecnico):
        o = nueva_orden()
        acciones_recepcion = api_recepcion.get(f"/api/v1/ordenes/{o['id']}").data["acciones"]
        acciones_tecnico = api_tecnico.get(f"/api/v1/ordenes/{o['id']}").data["acciones"]
        assert "cancelar" in acciones_recepcion and "registrar_diagnostico" not in acciones_recepcion
        assert "registrar_diagnostico" in acciones_tecnico and "cancelar" not in acciones_tecnico

    def test_usuario_desactivado_pierde_acceso(self, api_recepcion, recepcionista):
        recepcionista.activo = False
        recepcionista.save()
        assert api_recepcion.get("/api/v1/ordenes").status_code in (401, 403)


@pytest.mark.django_db
class TestGestionUsuarios:
    def test_admin_crea_usuario_con_contrasena_valida(self, api_admin):
        from apps.usuarios.models import Rol

        rol = Rol.objects.get(nombre="Recepcionista").pk
        r = api_admin.post("/api/v1/usuarios", {"nombre_completo": "Nuevo", "correo": "NUEVO@test.co", "rol": rol,
                                                 "contrasena": "123"}, format="json")
        assert r.status_code == 422
        r = api_admin.post("/api/v1/usuarios", {"nombre_completo": "Nuevo", "correo": "NUEVO@test.co", "rol": rol,
                                                 "contrasena": "Clave-Muy-Segura-1"}, format="json")
        assert r.status_code == 201 and r.data["correo"] == "nuevo@test.co"
        assert "contrasena" not in r.data

    def test_no_hay_borrado_fisico_de_usuarios(self, api_admin, recepcionista):
        assert api_admin.delete(f"/api/v1/usuarios/{recepcionista.pk}").status_code == 405
        r = api_admin.post(f"/api/v1/usuarios/{recepcionista.pk}/desactivar")
        assert r.status_code == 200 and r.data["activo"] is False

    def test_admin_no_puede_desactivarse_a_si_mismo(self, api_admin, admin):
        assert api_admin.post(f"/api/v1/usuarios/{admin.pk}/desactivar").status_code == 409


@pytest.mark.django_db
class TestGestionRoles:
    """RF-04: el administrador ajusta los permisos de cada rol, sin poder dejar el sistema sin administración."""

    def test_editar_permisos_de_un_rol_y_queda_auditado(self, api_admin, recepcionista):
        from apps.core.models import RegistroAuditoria
        from apps.usuarios.models import Rol

        rol = Rol.objects.get(nombre="Recepcionista")
        nuevos = sorted(rol.permisos.values_list("codigo", flat=True)) + ["reportes.ver"]
        r = api_admin.patch(f"/api/v1/roles/{rol.pk}", {"permisos": nuevos}, format="json")
        assert r.status_code == 200 and "reportes.ver" in r.data["permisos"]
        assert RegistroAuditoria.objects.filter(accion="ROL_ACTUALIZADO", entidad_id=rol.pk).exists()
        # el cambio aplica de inmediato a los usuarios de ese rol
        from rest_framework.test import APIClient

        c = APIClient()
        c.force_login(recepcionista)
        assert c.get("/api/v1/reportes/dashboard").status_code == 200

    def test_no_se_puede_quitar_la_gestion_de_usuarios_al_unico_rol_que_la_tiene(self, api_admin):
        from apps.usuarios.models import Rol

        rol = Rol.objects.get(nombre="Administrador")
        sin_gestion = [c for c in rol.permisos.values_list("codigo", flat=True) if c != "usuarios.gestionar"]
        r = api_admin.patch(f"/api/v1/roles/{rol.pk}", {"permisos": sin_gestion}, format="json")
        assert r.status_code == 422 and "permisos" in r.data["errores"]
        assert rol.permisos.filter(codigo="usuarios.gestionar").exists()

    def test_recepcion_no_puede_editar_roles(self, api_recepcion):
        from apps.usuarios.models import Rol

        rol = Rol.objects.get(nombre="Recepcionista")
        assert api_recepcion.patch(f"/api/v1/roles/{rol.pk}", {"permisos": []}, format="json").status_code == 403
