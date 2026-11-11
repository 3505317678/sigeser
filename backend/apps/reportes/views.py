import csv
from datetime import date, timedelta
from io import StringIO

from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core import auditoria
from apps.core.pdf import documento
from apps.core.permisos import requiere

from . import servicios

PARAMS = [OpenApiParameter("desde", date), OpenApiParameter("hasta", date)]


def _rango(request):
    hoy = timezone.localdate()
    try:
        hasta = date.fromisoformat(request.query_params.get("hasta") or hoy.isoformat())
        desde = date.fromisoformat(request.query_params.get("desde") or (hasta - timedelta(days=29)).isoformat())
    except ValueError:
        raise ValidationError({"fechas": "Use el formato AAAA-MM-DD."})
    if desde > hasta:
        raise ValidationError({"desde": "La fecha inicial debe ser anterior a la final."})
    if (hasta - desde).days > 366:
        raise ValidationError({"hasta": "El período máximo es de un año."})
    return desde, hasta


@extend_schema(responses=dict)
@api_view(["GET"])
@permission_classes([requiere("reportes.ver")])
def dashboard(request):
    return Response(servicios.dashboard())


@extend_schema(parameters=PARAMS, responses=dict)
@api_view(["GET"])
@permission_classes([requiere("reportes.ver")])
def periodo(request):
    desde, hasta = _rango(request)
    return Response(servicios.periodo(desde, hasta))


@extend_schema(parameters=PARAMS + [OpenApiParameter("formato", str, enum=["csv", "pdf"])],
               responses={(200, "text/csv"): bytes, (200, "application/pdf"): bytes})
@api_view(["GET"])
@permission_classes([requiere("reportes.ver")])
def exportar(request):
    """RF-32: exporta el reporte del período en CSV o PDF."""
    desde, hasta = _rango(request)
    formato = request.query_params.get("formato", "csv")
    r = servicios.periodo(desde, hasta)
    nombre = f"reporte-sigeser-{desde}-a-{hasta}"
    auditoria.registrar("REPORTE_EXPORTADO", "reporte", None, request=request,
                        detalle={"formato": formato, "desde": str(desde), "hasta": str(hasta)})
    if formato == "pdf":
        resumen = [["Indicador", "Valor"], ["Órdenes recibidas", r["recibidas"]], ["Órdenes entregadas", r["entregadas"]],
                   ["Órdenes canceladas", r["canceladas"]],
                   ["Tiempo promedio de atención (horas)", r["tiempo_promedio_horas"] if r["tiempo_promedio_horas"] is not None else "—"],
                   ["Ingresos por mano de obra", f"$ {float(r['ingresos_mano_obra']):,.2f}"],
                   ["Ingresos por repuestos", f"$ {float(r['ingresos_repuestos']):,.2f}"],
                   ["Ingresos totales", f"$ {float(r['ingresos_total']):,.2f}"]]
        top = [["Código", "Repuesto", "Cantidad", "Valor"]] + [
            [t["codigo"], t["nombre"], t["cantidad"], f"$ {float(t['valor']):,.2f}"] for t in r["repuestos_mas_usados"]]
        secciones = [("Resumen", resumen, [11, 6], True)]
        if len(top) > 1:
            secciones.append(("Repuestos más utilizados", top, [3, 8, 2.5, 3.5], True))
        if r["por_tecnico"]:
            secciones.append(("Órdenes entregadas por técnico",
                              [["Técnico", "Entregadas"]] + [[t["tecnico"], t["entregadas"]] for t in r["por_tecnico"]], [12, 5], True))
        pdf = documento(f"Reporte de servicios del {desde:%d/%m/%Y} al {hasta:%d/%m/%Y}", "Período consultado", secciones)
        resp = HttpResponse(pdf, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="{nombre}.pdf"'
        return resp
    buffer = StringIO()
    w = csv.writer(buffer)
    w.writerow(["Código", "Cliente", "Técnico", "Fecha de recepción", "Fecha de entrega", "Mano de obra", "Repuestos", "Total"])
    for o in r["detalle_entregadas"]:
        w.writerow([o["codigo"], o["cliente"], o["tecnico"], o["fecha_recepcion"], o["fecha_entrega"],
                    o["mano_obra"], o["repuestos"], o["total"]])
    resp = HttpResponse("﻿" + buffer.getvalue(), content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="{nombre}.csv"'
    return resp
