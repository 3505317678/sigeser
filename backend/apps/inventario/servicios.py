"""Servicios de inventario (interfaz IInventario).

Toda operación que cambia el stock bloquea la fila del repuesto (SELECT ... FOR UPDATE) dentro de una
transacción, de modo que dos operaciones simultáneas nunca dejan el stock negativo (RN-05, RNF-11).
"""
from django.db import transaction
from django.db.models import F

from apps.core import auditoria
from apps.core.excepciones import ErrorDominio, StockInsuficiente

from .models import MovimientoInventario, Repuesto, RepuestoUtilizado, TipoMovimiento


def _mover(repuesto_id, cantidad, tipo, usuario, motivo="", orden=None, request=None):
    """Aplica un movimiento con signo sobre el stock. Debe llamarse dentro de una transacción."""
    repuesto = Repuesto.objects.select_for_update().get(pk=repuesto_id)
    nuevo_stock = repuesto.stock_actual + cantidad
    if nuevo_stock < 0:
        raise StockInsuficiente(
            f"Stock insuficiente de {repuesto.nombre}: hay {repuesto.stock_actual} y se requieren {-cantidad}.",
            stock_disponible=repuesto.stock_actual,
        )
    Repuesto.objects.filter(pk=repuesto.pk).update(stock_actual=F("stock_actual") + cantidad)
    repuesto.refresh_from_db(fields=["stock_actual"])
    movimiento = MovimientoInventario.objects.create(
        repuesto=repuesto, usuario=usuario, orden=orden, tipo=tipo, cantidad=cantidad,
        stock_resultante=repuesto.stock_actual, motivo=motivo[:200],
    )
    auditoria.registrar(
        f"INVENTARIO_{tipo}", "repuesto", repuesto.pk, usuario=usuario, request=request,
        detalle={"cantidad": cantidad, "stock_resultante": repuesto.stock_actual, "orden": orden.codigo if orden else None},
    )
    return repuesto, movimiento


@transaction.atomic
def registrar_movimiento(repuesto_id, tipo, cantidad, usuario, motivo, request=None):
    """RF-27: entradas, ajustes y devoluciones manuales. La cantidad de un ajuste puede ser negativa."""
    if tipo == TipoMovimiento.SALIDA:
        raise ErrorDominio("Las salidas se registran desde la orden de servicio que consume el repuesto.")
    if cantidad == 0:
        raise ErrorDominio("La cantidad no puede ser cero.")
    if tipo in (TipoMovimiento.ENTRADA, TipoMovimiento.DEVOLUCION) and cantidad < 0:
        raise ErrorDominio("Las entradas y devoluciones deben tener cantidad positiva.")
    if not motivo.strip():
        raise ErrorDominio("El motivo del movimiento es obligatorio.")
    return _mover(repuesto_id, cantidad, tipo, usuario, motivo, request=request)


@transaction.atomic
def consumir_para_orden(orden, repuesto_id, cantidad, usuario, request=None):
    """RF-23 y RN-05 a RN-07: descuenta stock, registra la salida y guarda el precio vigente."""
    if cantidad <= 0:
        raise ErrorDominio("La cantidad debe ser mayor que cero.")
    repuesto, _ = _mover(repuesto_id, -cantidad, TipoMovimiento.SALIDA, usuario,
                         motivo=f"Consumo en la orden {orden.codigo}", orden=orden, request=request)
    if not repuesto.activo:
        raise ErrorDominio("El repuesto está desactivado.")
    uso = RepuestoUtilizado.objects.create(
        orden=orden, repuesto=repuesto, cantidad=cantidad, precio_unitario=repuesto.precio_unitario
    )
    return uso, repuesto.esta_bajo_minimo()


@transaction.atomic
def devolver_de_orden(uso, usuario, motivo, request=None):
    """Devuelve al inventario un repuesto registrado por error o al cancelar la orden (RN-13)."""
    _mover(uso.repuesto_id, uso.cantidad, TipoMovimiento.DEVOLUCION, usuario,
           motivo=motivo or f"Devolución de la orden {uso.orden.codigo}", orden=uso.orden, request=request)
    uso.delete()


def repuestos_bajo_minimo():
    return Repuesto.objects.filter(activo=True, stock_actual__lte=F("stock_minimo")).order_by("stock_actual")
