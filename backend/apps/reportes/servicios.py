"""Indicadores del dashboard y reportes por período (RF-30 y RF-31). Solo consultan; no guardan datos."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Count, DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.inventario.models import RepuestoUtilizado
from apps.inventario.servicios import repuestos_bajo_minimo
from apps.ordenes.models import EstadoOrden, HistorialEstado, OrdenServicio
from apps.tecnicos.models import Tecnico

CERO = Value(Decimal("0"), output_field=DecimalField(max_digits=14, decimal_places=2))


def _subtotal_repuestos():
    return Coalesce(Sum(ExpressionWrapper(F("repuestos_utilizados__cantidad") * F("repuestos_utilizados__precio_unitario"),
                                          output_field=DecimalField(max_digits=14, decimal_places=2))), CERO)


def ingresos(qs):
    mano_obra = qs.aggregate(t=Coalesce(Sum("costo_mano_obra"), CERO))["t"]
    repuestos = RepuestoUtilizado.objects.filter(orden__in=qs).aggregate(
        t=Coalesce(Sum(ExpressionWrapper(F("cantidad") * F("precio_unitario"),
                                         output_field=DecimalField(max_digits=14, decimal_places=2))), CERO))["t"]
    return mano_obra, repuestos


def condicion_vencida():
    hoy = timezone.localdate()
    return Q(fecha_estimada_entrega__lt=hoy) & ~Q(estado__in=[*EstadoOrden.FINALES, EstadoOrden.LISTA_PARA_ENTREGA])


def dashboard():
    activas = OrdenServicio.objects.exclude(estado__in=EstadoOrden.FINALES)
    conteo = dict(activas.values_list("estado").annotate(n=Count("id")).values_list("estado", "n"))
    por_estado = [{"estado": e.value, "nombre": e.label, "total": conteo.get(e.value, 0)}
                  for e in EstadoOrden if e not in EstadoOrden.FINALES]
    inicio_mes = timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    entregadas_mes = OrdenServicio.objects.filter(estado=EstadoOrden.ENTREGADA, fecha_entrega__gte=inicio_mes)
    mo, rep = ingresos(entregadas_mes)
    carga = (Tecnico.objects.select_related("usuario")
             .annotate(activas=Count("ordenes", filter=~Q(ordenes__estado__in=EstadoOrden.FINALES)),
                       en_reparacion=Count("ordenes", filter=Q(ordenes__estado=EstadoOrden.EN_REPARACION)))
             .order_by("-activas"))
    vencidas = activas.filter(condicion_vencida()).select_related("cliente").order_by("fecha_estimada_entrega")
    return {
        "ordenes_activas": activas.count(),
        "por_estado": por_estado,
        "vencidas_total": vencidas.count(),
        "vencidas": [{"id": o.id, "codigo": o.codigo, "cliente": o.cliente.nombre,
                      "fecha_estimada_entrega": o.fecha_estimada_entrega, "estado": o.estado} for o in vencidas[:5]],
        "entregadas_mes": entregadas_mes.count(),
        "ingresos_mes": str(mo + rep),
        "carga_tecnicos": [{"id": t.id, "nombre": t.usuario.nombre_completo, "activas": t.activas,
                            "en_reparacion": t.en_reparacion, "disponible": t.disponible} for t in carga],
        "alertas_stock": [{"id": r.id, "codigo": r.codigo, "nombre": r.nombre, "stock_actual": r.stock_actual,
                           "stock_minimo": r.stock_minimo} for r in repuestos_bajo_minimo()[:8]],
    }


def periodo(desde, hasta):
    """Reporte entre dos fechas (incluidas)."""
    recibidas = OrdenServicio.objects.filter(fecha_recepcion__date__gte=desde, fecha_recepcion__date__lte=hasta)
    entregadas = OrdenServicio.objects.filter(estado=EstadoOrden.ENTREGADA, fecha_entrega__date__gte=desde,
                                              fecha_entrega__date__lte=hasta)
    canceladas = HistorialEstado.objects.filter(estado_nuevo=EstadoOrden.CANCELADA, fecha__date__gte=desde,
                                                fecha__date__lte=hasta).count()
    promedio = entregadas.aggregate(p=Avg(F("fecha_entrega") - F("fecha_recepcion")))["p"]
    mo, rep = ingresos(entregadas)
    top = (RepuestoUtilizado.objects.filter(fecha__date__gte=desde, fecha__date__lte=hasta)
           .values("repuesto__codigo", "repuesto__nombre")
           .annotate(total_cantidad=Sum("cantidad"),
                     valor=Sum(ExpressionWrapper(F("cantidad") * F("precio_unitario"),
                                                 output_field=DecimalField(max_digits=14, decimal_places=2))))
           .order_by("-total_cantidad")[:10])
    por_tecnico = (entregadas.filter(tecnico__isnull=False).values("tecnico__usuario__nombre_completo")
                   .annotate(entregadas=Count("id")).order_by("-entregadas"))
    serie_r = dict(recibidas.annotate(d=TruncDate("fecha_recepcion")).values("d").annotate(n=Count("id")).values_list("d", "n"))
    serie_e = dict(entregadas.annotate(d=TruncDate("fecha_entrega")).values("d").annotate(n=Count("id")).values_list("d", "n"))
    dias = []
    d = desde
    while d <= hasta:
        dias.append({"fecha": d.isoformat(), "recibidas": serie_r.get(d, 0), "entregadas": serie_e.get(d, 0)})
        d += timedelta(days=1)
    return {
        "desde": desde.isoformat(), "hasta": hasta.isoformat(),
        "recibidas": recibidas.count(), "entregadas": entregadas.count(), "canceladas": canceladas,
        "tiempo_promedio_horas": round(promedio.total_seconds() / 3600, 1) if promedio else None,
        "ingresos_mano_obra": str(mo), "ingresos_repuestos": str(rep), "ingresos_total": str(mo + rep),
        "repuestos_mas_usados": [{"codigo": t["repuesto__codigo"], "nombre": t["repuesto__nombre"],
                                  "cantidad": t["total_cantidad"], "valor": str(t["valor"])} for t in top],
        "por_tecnico": [{"tecnico": t["tecnico__usuario__nombre_completo"], "entregadas": t["entregadas"]} for t in por_tecnico],
        "serie_diaria": dias,
        "detalle_entregadas": [
            {"codigo": o.codigo, "cliente": o.cliente.nombre, "tecnico": o.tecnico.usuario.nombre_completo if o.tecnico else "",
             "fecha_recepcion": timezone.localtime(o.fecha_recepcion).strftime("%Y-%m-%d"),
             "fecha_entrega": timezone.localtime(o.fecha_entrega).strftime("%Y-%m-%d"),
             "mano_obra": str(o.costo_mano_obra), "repuestos": str(o.rep), "total": str(o.costo_mano_obra + o.rep)}
            for o in entregadas.select_related("cliente", "tecnico__usuario").annotate(rep=_subtotal_repuestos()).order_by("fecha_entrega")
        ],
    }
