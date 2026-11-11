"""RF-07, RF-30, RF-31 y RF-32."""
import pytest
from django.utils import timezone


@pytest.mark.django_db
class TestReportes:
    def _entregar(self, nueva_orden, api_tecnico, api_recepcion, repuesto):
        o = nueva_orden()
        oid = o["id"]
        api_tecnico.post(f"/api/v1/ordenes/{oid}/diagnostico",
                         {"descripcion": "x", "solucion_propuesta": "y", "costo_estimado": "50000"}, format="json")
        api_recepcion.post(f"/api/v1/ordenes/{oid}/aprobacion", {"aprobado": True}, format="json")
        api_tecnico.post(f"/api/v1/ordenes/{oid}/actividades", {"descripcion": "a", "horas_empleadas": "1"}, format="json")
        api_tecnico.post(f"/api/v1/ordenes/{oid}/repuestos", {"repuesto": repuesto.pk, "cantidad": 1}, format="json")
        api_tecnico.post(f"/api/v1/ordenes/{oid}/enviar-verificacion", {}, format="json")
        api_tecnico.post(f"/api/v1/ordenes/{oid}/verificacion", {"aprobada": True}, format="json")
        api_recepcion.post(f"/api/v1/ordenes/{oid}/entrega", {"recibido_por": "Cliente"}, format="json")

    def test_dashboard(self, nueva_orden, api_admin, api_tecnico, api_recepcion, repuesto):
        nueva_orden()
        self._entregar(nueva_orden, api_tecnico, api_recepcion, repuesto)
        d = api_admin.get("/api/v1/reportes/dashboard").data
        assert d["ordenes_activas"] == 1 and d["entregadas_mes"] == 1
        assert d["ingresos_mes"] == "215000.00"
        assert sum(e["total"] for e in d["por_estado"]) == 1
        assert d["carga_tecnicos"][0]["activas"] == 1

    def test_reporte_por_periodo(self, nueva_orden, api_admin, api_tecnico, api_recepcion, repuesto):
        self._entregar(nueva_orden, api_tecnico, api_recepcion, repuesto)
        hoy = timezone.localdate().isoformat()
        r = api_admin.get(f"/api/v1/reportes/periodo?desde={hoy}&hasta={hoy}").data
        assert (r["recibidas"], r["entregadas"], r["ingresos_total"]) == (1, 1, "215000.00")
        assert r["repuestos_mas_usados"][0] == {"codigo": "SSD-480", "nombre": "SSD 480 GB", "cantidad": 1, "valor": "165000.00"}
        assert r["tiempo_promedio_horas"] is not None

    def test_exportar_csv_y_pdf(self, nueva_orden, api_admin, api_tecnico, api_recepcion, repuesto):
        self._entregar(nueva_orden, api_tecnico, api_recepcion, repuesto)
        csv = api_admin.get("/api/v1/reportes/exportar?formato=csv")
        assert csv.status_code == 200 and csv["Content-Type"].startswith("text/csv")
        assert "OS-" in csv.content.decode("utf-8-sig")
        pdf = api_admin.get("/api/v1/reportes/exportar?formato=pdf")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    def test_rango_invalido(self, api_admin):
        assert api_admin.get("/api/v1/reportes/periodo?desde=2026-12-01&hasta=2026-01-01").status_code == 422
        assert api_admin.get("/api/v1/reportes/periodo?desde=fecha").status_code == 422


@pytest.mark.django_db
def test_documentacion_openapi(api_admin):
    r = api_admin.get("/api/schema")
    assert r.status_code == 200
    assert b"/api/v1/ordenes" in r.content


@pytest.mark.django_db
def test_pdf_escapa_marcado_del_usuario(nueva_orden, api_recepcion, cliente):
    """Un nombre con etiquetas no debe inyectar marcado en el PDF ni romper su generación."""
    cliente.nombre = '<font color="red">Ana</font> <b>& Cía'
    cliente.save()
    o = nueva_orden(asignar=False)
    pdf = api_recepcion.get(f"/api/v1/ordenes/{o['id']}/comprobante?tipo=recepcion")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


@pytest.mark.django_db
def test_cabeceras_de_seguridad(api_admin):
    r = api_admin.get("/api/v1/ordenes")
    assert r["X-Frame-Options"] == "DENY"
    assert r["X-Content-Type-Options"] == "nosniff"
    assert "default-src 'none'" in r["Content-Security-Policy"]
