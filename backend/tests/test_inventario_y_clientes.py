"""RF-08 a RF-11, RF-23, RF-26 a RF-29, RN-05 a RN-07, RNF-09 y RNF-11."""
import threading
from decimal import Decimal

import pytest
from django.db import IntegrityError, connection, transaction

from apps.inventario.models import Repuesto


@pytest.mark.django_db
class TestInventario:
    def test_rn05_stock_insuficiente_responde_409(self, orden_en_reparacion, api_tecnico, repuesto):
        r = api_tecnico.post(f"/api/v1/ordenes/{orden_en_reparacion['id']}/repuestos",
                             {"repuesto": repuesto.pk, "cantidad": 6}, format="json")
        assert r.status_code == 409 and r.data["stock_disponible"] == 5
        repuesto.refresh_from_db()
        assert repuesto.stock_actual == 5

    def test_rn06_alerta_de_stock_bajo(self, orden_en_reparacion, api_tecnico, api_admin, repuesto):
        r = api_tecnico.post(f"/api/v1/ordenes/{orden_en_reparacion['id']}/repuestos",
                             {"repuesto": repuesto.pk, "cantidad": 3}, format="json")
        assert r.data["alerta_stock_bajo"] is True
        alertas = api_admin.get("/api/v1/repuestos/alertas").data
        assert [a["codigo"] for a in alertas] == ["SSD-480"]

    def test_rn07_precio_historico_en_la_orden(self, orden_en_reparacion, api_tecnico, api_admin, repuesto):
        oid = orden_en_reparacion["id"]
        api_tecnico.post(f"/api/v1/ordenes/{oid}/repuestos", {"repuesto": repuesto.pk, "cantidad": 1}, format="json")
        api_admin.patch(f"/api/v1/repuestos/{repuesto.pk}", {"precio_unitario": "200000"}, format="json")
        orden = api_admin.get(f"/api/v1/ordenes/{oid}").data
        assert orden["repuestos"][0]["precio_unitario"] == "165000.00"

    def test_kardex_registra_cada_movimiento(self, orden_en_reparacion, api_tecnico, api_admin, repuesto):
        api_tecnico.post(f"/api/v1/ordenes/{orden_en_reparacion['id']}/repuestos",
                         {"repuesto": repuesto.pk, "cantidad": 1}, format="json")
        api_admin.post(f"/api/v1/repuestos/{repuesto.pk}/movimientos/registrar",
                       {"tipo": "AJUSTE", "cantidad": -1, "motivo": "Unidad defectuosa"}, format="json")
        movs = api_admin.get(f"/api/v1/repuestos/{repuesto.pk}/movimientos").data["results"]
        assert [(m["tipo"], m["cantidad"], m["stock_resultante"]) for m in movs] == [
            ("AJUSTE", -1, 3), ("SALIDA", -1, 4), ("ENTRADA", 5, 5)]

    def test_ajuste_no_deja_stock_negativo(self, api_admin, repuesto):
        r = api_admin.post(f"/api/v1/repuestos/{repuesto.pk}/movimientos/registrar",
                           {"tipo": "AJUSTE", "cantidad": -10, "motivo": "Conteo físico"}, format="json")
        assert r.status_code == 409

    def test_salida_manual_no_permitida(self, api_admin, repuesto):
        r = api_admin.post(f"/api/v1/repuestos/{repuesto.pk}/movimientos/registrar",
                           {"tipo": "SALIDA", "cantidad": -1, "motivo": "x"}, format="json")
        assert r.status_code == 422

    def test_restriccion_check_en_la_base_de_datos(self, repuesto):
        with pytest.raises(IntegrityError), transaction.atomic():
            Repuesto.objects.filter(pk=repuesto.pk).update(stock_actual=-1)

    def test_crear_repuesto_con_stock_inicial(self, api_admin):
        r = api_admin.post("/api/v1/repuestos", {"codigo": "ram-8", "nombre": "RAM 8 GB", "precio_unitario": "120000",
                                                  "stock_minimo": 2, "stock_inicial": 7}, format="json")
        assert r.status_code == 201 and r.data["codigo"] == "RAM-8" and r.data["stock_actual"] == 7

    def test_tecnico_no_administra_inventario(self, api_tecnico, repuesto):
        r = api_tecnico.post(f"/api/v1/repuestos/{repuesto.pk}/movimientos/registrar",
                             {"tipo": "ENTRADA", "cantidad": 1, "motivo": "x"}, format="json")
        assert r.status_code == 403


@pytest.mark.django_db(transaction=True)
def test_rnf11_concurrencia_ultima_unidad(admin, tecnico, cliente, equipo):
    """Dos técnicos consumen al mismo tiempo la última unidad: solo una operación debe confirmarse."""
    from apps.core.excepciones import StockInsuficiente
    from apps.inventario import servicios as inv
    from apps.ordenes import servicios as srv
    from apps.ordenes.models import EstadoOrden, OrdenServicio
    from apps.reparacion.models import Diagnostico

    repuesto = Repuesto.objects.create(codigo="ULT-1", nombre="Última unidad", precio_unitario=Decimal("1000"))
    inv.registrar_movimiento(repuesto.pk, "ENTRADA", 1, admin, "Compra")
    ordenes = []
    for _ in range(2):
        o = srv.crear_orden({"cliente": cliente, "equipo": equipo, "falla_reportada": "x", "tecnico": tecnico}, admin)
        Diagnostico.objects.create(orden=o, tecnico=tecnico, descripcion="x", solucion_propuesta="y",
                                   costo_estimado=Decimal("0"), aprobado=True)
        OrdenServicio.objects.filter(pk=o.pk).update(estado=EstadoOrden.EN_REPARACION)
        ordenes.append(OrdenServicio.objects.get(pk=o.pk))

    barrera = threading.Barrier(2)
    resultados = []

    def consumir(orden):
        try:
            barrera.wait()
            inv.consumir_para_orden(orden, repuesto.pk, 1, tecnico.usuario)
            resultados.append("ok")
        except StockInsuficiente:
            resultados.append("sin_stock")
        finally:
            connection.close()

    hilos = [threading.Thread(target=consumir, args=(o,)) for o in ordenes]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    repuesto.refresh_from_db()
    assert sorted(resultados) == ["ok", "sin_stock"]
    assert repuesto.stock_actual == 0


@pytest.mark.django_db
class TestClientes:
    DATOS = {"tipo_documento": "CC", "numero_documento": "99887766", "nombre": "Lucía Díaz", "telefono": "3209876543"}

    def test_rnf09_sin_autorizacion_de_datos_no_se_registra(self, api_recepcion):
        r = api_recepcion.post("/api/v1/clientes", {**self.DATOS, "autoriza_datos": False}, format="json")
        assert r.status_code == 422 and "autoriza_datos" in r.data["errores"]

    def test_registro_guarda_fecha_de_autorizacion(self, api_recepcion):
        r = api_recepcion.post("/api/v1/clientes", {**self.DATOS, "autoriza_datos": True}, format="json")
        assert r.status_code == 201 and r.data["fecha_autorizacion"]

    def test_documento_duplicado(self, api_recepcion, cliente):
        r = api_recepcion.post("/api/v1/clientes", {**self.DATOS, "numero_documento": cliente.numero_documento,
                                                     "autoriza_datos": True}, format="json")
        assert r.status_code == 422

    def test_busqueda_por_documento_nombre_o_telefono(self, api_recepcion, cliente):
        assert api_recepcion.get("/api/v1/clientes?documento=1122334455").data["count"] == 1
        assert api_recepcion.get("/api/v1/clientes?search=pérez").data["count"] == 1
        assert api_recepcion.get("/api/v1/clientes?search=3101234567").data["count"] == 1

    def test_equipos_e_historial(self, api_recepcion, cliente, nueva_orden):
        r = api_recepcion.post(f"/api/v1/clientes/{cliente.pk}/equipos",
                               {"tipo": "Celular", "marca": "Samsung", "modelo": "A54"}, format="json")
        assert r.status_code == 201
        o = nueva_orden()
        historial = api_recepcion.get(f"/api/v1/equipos/{o['equipo']}/historial").data
        assert [h["codigo"] for h in historial] == [o["codigo"]]
