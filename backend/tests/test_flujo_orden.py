"""UC-07 a UC-18: flujo completo de una orden y reglas de negocio RN-01 a RN-13."""
import re
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.core.models import RegistroAuditoria
from apps.inventario.models import MovimientoInventario


@pytest.mark.django_db
class TestFlujoCompleto:
    def test_ciclo_feliz_de_recepcion_a_entrega(self, nueva_orden, api_tecnico, api_recepcion, repuesto):
        o = nueva_orden()
        assert re.fullmatch(r"OS-\d{4}-\d{5}", o["codigo"])  # RN-02
        oid = o["id"]
        r = api_tecnico.post(f"/api/v1/ordenes/{oid}/diagnostico",
                             {"descripcion": "Disco con sectores dañados", "solucion_propuesta": "Cambiar por SSD",
                              "costo_estimado": "90000"}, format="json")
        assert r.data["estado"] == "PENDIENTE_APROBACION"
        r = api_recepcion.post(f"/api/v1/ordenes/{oid}/aprobacion", {"aprobado": True}, format="json")
        assert r.data["estado"] == "EN_REPARACION"
        r = api_tecnico.post(f"/api/v1/ordenes/{oid}/actividades", {"descripcion": "Cambio de disco", "horas_empleadas": "2"},
                             format="json")
        assert r.status_code == 201
        r = api_tecnico.post(f"/api/v1/ordenes/{oid}/repuestos", {"repuesto": repuesto.pk, "cantidad": 1}, format="json")
        assert r.status_code == 201 and r.data["total_orden"] == "255000.00"
        r = api_tecnico.post(f"/api/v1/ordenes/{oid}/enviar-verificacion", {}, format="json")
        assert r.data["estado"] == "EN_VERIFICACION"
        r = api_tecnico.post(f"/api/v1/ordenes/{oid}/verificacion", {"aprobada": True}, format="json")
        assert r.data["estado"] == "LISTA_PARA_ENTREGA"
        r = api_recepcion.post(f"/api/v1/ordenes/{oid}/entrega", {"recibido_por": "Pedro Pérez"}, format="json")
        assert r.data["estado"] == "ENTREGADA" and r.data["fecha_entrega"]
        assert Decimal(r.data["total"]) == Decimal("255000")  # RF-19: 90 000 + 165 000
        estados = [h["estado_nuevo"] for h in r.data["historial"]]
        assert estados == ["RECIBIDA", "EN_DIAGNOSTICO", "PENDIENTE_APROBACION", "EN_REPARACION",
                           "EN_VERIFICACION", "LISTA_PARA_ENTREGA", "ENTREGADA"]
        for tipo in ("recepcion", "entrega"):
            pdf = api_recepcion.get(f"/api/v1/ordenes/{oid}/comprobante?tipo={tipo}")
            assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
        assert RegistroAuditoria.objects.filter(accion="ORDEN_CAMBIO_ESTADO", entidad_id=oid).count() == 6

    def test_verificacion_rechazada_vuelve_a_reparacion(self, orden_en_reparacion, api_tecnico):
        oid = orden_en_reparacion["id"]
        api_tecnico.post(f"/api/v1/ordenes/{oid}/actividades", {"descripcion": "Ajuste", "horas_empleadas": "1"}, format="json")
        api_tecnico.post(f"/api/v1/ordenes/{oid}/enviar-verificacion", {}, format="json")
        r = api_tecnico.post(f"/api/v1/ordenes/{oid}/verificacion", {"aprobada": False, "observacion": "Sigue fallando"}, format="json")
        assert r.data["estado"] == "EN_REPARACION"

    def test_espera_y_reanudacion(self, orden_en_reparacion, api_tecnico):
        oid = orden_en_reparacion["id"]
        assert api_tecnico.post(f"/api/v1/ordenes/{oid}/espera", {}, format="json").data["estado"] == "EN_ESPERA_REPUESTOS"
        assert api_tecnico.post(f"/api/v1/ordenes/{oid}/reanudar").data["estado"] == "EN_REPARACION"


@pytest.mark.django_db
class TestReglasDeNegocio:
    def test_rn01_falla_obligatoria(self, api_recepcion, cliente, equipo):
        r = api_recepcion.post("/api/v1/ordenes", {"cliente": cliente.pk, "equipo": equipo.pk, "falla_reportada": ""}, format="json")
        assert r.status_code == 422

    def test_fecha_estimada_no_puede_ser_pasada(self, api_recepcion, cliente, equipo):
        ayer = (timezone.localdate() - timedelta(days=1)).isoformat()
        r = api_recepcion.post("/api/v1/ordenes", {"cliente": cliente.pk, "equipo": equipo.pk, "falla_reportada": "x",
                                                    "fecha_estimada_entrega": ayer}, format="json")
        assert r.status_code == 422

    def test_rn03_no_se_entrega_una_orden_sin_terminar(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        r = api_recepcion.post(f"/api/v1/ordenes/{o['id']}/entrega", {"recibido_por": "X"}, format="json")
        assert r.status_code == 409 and r.data["codigo"] == "transicion_invalida"

    def test_rn04_no_se_repara_sin_aprobacion(self, nueva_orden, api_tecnico):
        from apps.core.excepciones import TransicionInvalida
        from apps.ordenes import servicios
        from apps.ordenes.models import EstadoOrden, OrdenServicio

        o = nueva_orden()
        api_tecnico.post(f"/api/v1/ordenes/{o['id']}/diagnostico",
                         {"descripcion": "x", "solucion_propuesta": "y", "costo_estimado": "1"}, format="json")
        orden = OrdenServicio.objects.get(pk=o["id"])
        with pytest.raises(TransicionInvalida):
            servicios.cambiar_estado(orden, EstadoOrden.EN_REPARACION, orden.tecnico.usuario)

    def test_rn09_orden_entregada_no_se_modifica(self, nueva_orden, api_recepcion, api_tecnico):
        o = nueva_orden()
        r = api_recepcion.post(f"/api/v1/ordenes/{o['id']}/cancelar", {"motivo": "El cliente desiste"}, format="json")
        assert r.data["estado"] == "CANCELADA"
        r = api_recepcion.patch(f"/api/v1/ordenes/{o['id']}", {"prioridad": "BAJA"}, format="json")
        assert r.status_code == 409 and r.data["codigo"] == "orden_cerrada"
        r = api_recepcion.post(f"/api/v1/ordenes/{o['id']}/asignar-tecnico", {"tecnico": 1}, format="json")
        assert r.status_code in (409, 422)

    def test_rn10_tecnico_no_asignado_no_trabaja_la_orden(self, nueva_orden, api_otro_tecnico, otro_tecnico):
        from apps.ordenes import servicios
        from apps.core.excepciones import OperacionNoPermitida
        from apps.ordenes.models import OrdenServicio

        o = nueva_orden()
        with pytest.raises(OperacionNoPermitida):
            servicios.iniciar_diagnostico(OrdenServicio.objects.get(pk=o["id"]), otro_tecnico.usuario)

    def test_rn12_presupuesto_rechazado_pasa_a_entrega_sin_reparar(self, nueva_orden, api_tecnico, api_recepcion):
        o = nueva_orden()
        api_tecnico.post(f"/api/v1/ordenes/{o['id']}/diagnostico",
                         {"descripcion": "x", "solucion_propuesta": "y", "costo_estimado": "300000"}, format="json")
        r = api_recepcion.post(f"/api/v1/ordenes/{o['id']}/aprobacion", {"aprobado": False}, format="json")
        assert r.data["estado"] == "LISTA_PARA_ENTREGA"
        assert r.data["diagnostico"]["aprobado"] is False

    def test_rn13_cancelar_devuelve_repuestos_al_inventario(self, orden_en_reparacion, api_tecnico, api_recepcion, repuesto):
        oid = orden_en_reparacion["id"]
        api_tecnico.post(f"/api/v1/ordenes/{oid}/repuestos", {"repuesto": repuesto.pk, "cantidad": 2}, format="json")
        repuesto.refresh_from_db()
        assert repuesto.stock_actual == 3
        api_tecnico.post(f"/api/v1/ordenes/{oid}/espera", {}, format="json")
        r = api_recepcion.post(f"/api/v1/ordenes/{oid}/cancelar", {"motivo": "No llegó el repuesto"}, format="json")
        assert r.data["estado"] == "CANCELADA"
        repuesto.refresh_from_db()
        assert repuesto.stock_actual == 5
        assert MovimientoInventario.objects.filter(orden_id=oid, tipo="DEVOLUCION").exists()

    def test_enviar_a_verificacion_exige_actividades(self, orden_en_reparacion, api_tecnico):
        r = api_tecnico.post(f"/api/v1/ordenes/{orden_en_reparacion['id']}/enviar-verificacion", {}, format="json")
        assert r.status_code == 409

    def test_filtros_y_paginacion(self, nueva_orden, api_recepcion):
        for _ in range(3):
            nueva_orden()
        r = api_recepcion.get("/api/v1/ordenes?estado=RECIBIDA&tamano=2")
        assert r.data["count"] == 3 and len(r.data["results"]) == 2
        assert api_recepcion.get("/api/v1/ordenes?estado=ENTREGADA").data["count"] == 0
