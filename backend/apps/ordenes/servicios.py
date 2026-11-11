"""Ciclo de vida de la orden de servicio (interfaz IOrdenes).

La máquina de estados implementa la Tabla 13 del documento y las reglas de negocio RN-01 a RN-13.
Cada cambio de estado se ejecuta en una transacción, bloquea la orden y deja registro en el historial
y en la auditoría.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core import auditoria
from apps.core.excepciones import ErrorDominio, OperacionNoPermitida, OrdenCerrada, TransicionInvalida
from apps.inventario import servicios as inventario

from .models import EstadoOrden as E
from . import audios
from . import fotos as procesador_fotos
from .models import EtapaFoto, FotoOrden, HistorialEstado, NotaVoz, OrdenServicio

TRANSICIONES = {
    E.RECIBIDA: {E.EN_DIAGNOSTICO, E.CANCELADA},
    E.EN_DIAGNOSTICO: {E.PENDIENTE_APROBACION, E.CANCELADA},
    E.PENDIENTE_APROBACION: {E.EN_REPARACION, E.EN_ESPERA_REPUESTOS, E.LISTA_PARA_ENTREGA, E.CANCELADA},
    E.EN_ESPERA_REPUESTOS: {E.EN_REPARACION, E.CANCELADA},
    E.EN_REPARACION: {E.EN_ESPERA_REPUESTOS, E.EN_VERIFICACION},
    E.EN_VERIFICACION: {E.LISTA_PARA_ENTREGA, E.EN_REPARACION},
    E.LISTA_PARA_ENTREGA: {E.ENTREGADA},
    E.ENTREGADA: set(),
    E.CANCELADA: set(),
}


def _bloquear(orden):
    return OrdenServicio.objects.select_for_update().get(pk=orden.pk)


def _diagnostico(orden):
    return getattr(orden, "diagnostico", None) if hasattr(orden, "diagnostico") else None


def _validar_reglas(orden, nuevo):
    """Reglas que dependen de los datos de la orden, además de la tabla de transiciones."""
    diag = _diagnostico(orden)
    if nuevo == E.EN_REPARACION and not (diag and diag.aprobado is True):
        raise TransicionInvalida("No se puede iniciar la reparación sin un diagnóstico aprobado por el cliente (RN-04).")
    if orden.estado == E.PENDIENTE_APROBACION and nuevo == E.EN_ESPERA_REPUESTOS and not (diag and diag.aprobado is True):
        raise TransicionInvalida("El presupuesto debe estar aprobado antes de esperar repuestos.")
    if orden.estado == E.PENDIENTE_APROBACION and nuevo == E.LISTA_PARA_ENTREGA and not (diag and diag.aprobado is False):
        raise TransicionInvalida("Solo una orden con presupuesto rechazado pasa a entrega sin reparar (RN-12).")
    if nuevo == E.PENDIENTE_APROBACION and not diag:
        raise TransicionInvalida("Debe registrar el diagnóstico antes de solicitar la aprobación.")
    if nuevo == E.EN_VERIFICACION and not orden.actividades.exists():
        raise TransicionInvalida("Registre al menos una actividad de reparación antes de enviarla a verificación.")
    if nuevo == E.ENTREGADA and not orden.recibido_por:
        raise TransicionInvalida("Indique quién recibe el equipo.")


def cambiar_estado(orden, nuevo, usuario, observacion="", request=None):
    """RF-15 y RN-03: aplica una transición permitida. Debe llamarse dentro de una transacción."""
    anterior = orden.estado
    if orden.cerrada:
        raise OrdenCerrada("La orden está cerrada y no se puede modificar (RN-09).")
    if nuevo not in TRANSICIONES[anterior]:
        raise TransicionInvalida(
            f"No se permite pasar de {E(anterior).label} a {E(nuevo).label}.",
            estado_actual=anterior,
            permitidos=sorted(TRANSICIONES[anterior]),
        )
    _validar_reglas(orden, nuevo)
    orden.estado = nuevo
    orden.save(update_fields=["estado"])
    HistorialEstado.objects.create(
        orden=orden, usuario=usuario, estado_anterior=anterior, estado_nuevo=nuevo, observacion=observacion
    )
    auditoria.registrar("ORDEN_CAMBIO_ESTADO", "orden", orden.pk, usuario=usuario, request=request,
                        detalle={"codigo": orden.codigo, "de": anterior, "a": nuevo})
    return orden


def exigir_tecnico_asignado(orden, usuario):
    """RN-10: un técnico solo trabaja en sus órdenes asignadas."""
    tecnico = getattr(usuario, "tecnico", None) if hasattr(usuario, "tecnico") else None
    if not tecnico or orden.tecnico_id != tecnico.pk:
        raise OperacionNoPermitida("La orden no está asignada a usted.")
    return tecnico


def exigir_abierta(orden):
    if orden.cerrada:
        raise OrdenCerrada("La orden está cerrada y no se puede modificar (RN-09).")


# --------------------------------------------------------------------------- recepción
@transaction.atomic
def crear_orden(datos, usuario, request=None):
    """RF-12, RN-01 y RN-02: crea la orden en estado RECIBIDA con código OS-AAAA-NNNNN."""
    equipo = datos["equipo"]
    cliente = datos["cliente"]
    if not cliente.activo:
        raise ErrorDominio("El cliente está desactivado.")
    if not datos.get("falla_reportada", "").strip():
        raise ErrorDominio("La falla reportada es obligatoria (RN-01).")
    ahora = timezone.now()
    orden = OrdenServicio.objects.create(
        codigo=f"TMP-{ahora.timestamp():.6f}"[-20:], cliente=cliente, equipo=equipo,
        prioridad=datos.get("prioridad") or "MEDIA", falla_reportada=datos["falla_reportada"].strip(),
        accesorios=datos.get("accesorios", ""), estado_fisico=datos.get("estado_fisico", ""),
        fecha_estimada_entrega=datos.get("fecha_estimada_entrega"), fecha_recepcion=ahora,
        tecnico=datos.get("tecnico"),
    )
    orden.codigo = f"OS-{timezone.localtime(ahora).year}-{orden.pk:05d}"
    orden.save(update_fields=["codigo"])
    HistorialEstado.objects.create(orden=orden, usuario=usuario, estado_anterior="", estado_nuevo=E.RECIBIDA,
                                   observacion="Equipo recibido")
    auditoria.registrar("ORDEN_CREADA", "orden", orden.pk, usuario=usuario, request=request,
                        detalle={"codigo": orden.codigo})
    return orden


@transaction.atomic
def asignar_tecnico(orden, tecnico, usuario, request=None):
    """RF-14: asigna o reasigna el técnico responsable."""
    orden = _bloquear(orden)
    exigir_abierta(orden)
    if not tecnico.disponible or not tecnico.usuario.activo:
        raise ErrorDominio("El técnico no está disponible.")
    anterior = orden.tecnico
    orden.tecnico = tecnico
    orden.save(update_fields=["tecnico"])
    auditoria.registrar("ORDEN_TECNICO_ASIGNADO", "orden", orden.pk, usuario=usuario, request=request,
                        detalle={"codigo": orden.codigo, "anterior": str(anterior) if anterior else None,
                                 "nuevo": str(tecnico)})
    return orden


# --------------------------------------------------------------------------- diagnóstico y aprobación
@transaction.atomic
def iniciar_diagnostico(orden, usuario, request=None):
    orden = _bloquear(orden)
    exigir_tecnico_asignado(orden, usuario)
    return cambiar_estado(orden, E.EN_DIAGNOSTICO, usuario, "Inicio del diagnóstico", request)


@transaction.atomic
def registrar_diagnostico(orden, datos, usuario, request=None):
    """RF-20: guarda el diagnóstico y deja la orden pendiente de aprobación del cliente."""
    from apps.reparacion.models import Diagnostico

    orden = _bloquear(orden)
    tecnico = exigir_tecnico_asignado(orden, usuario)
    if orden.estado == E.RECIBIDA:
        cambiar_estado(orden, E.EN_DIAGNOSTICO, usuario, "Inicio del diagnóstico", request)
    if orden.estado == E.PENDIENTE_APROBACION:
        diag = orden.diagnostico
        if diag.aprobado is not None:
            raise ErrorDominio("El cliente ya respondió; el diagnóstico no se puede modificar.")
    elif orden.estado != E.EN_DIAGNOSTICO:
        raise TransicionInvalida("La orden no está en etapa de diagnóstico.")
    diag, _ = Diagnostico.objects.update_or_create(
        orden=orden,
        defaults={"tecnico": tecnico, "descripcion": datos["descripcion"], "causa_probable": datos.get("causa_probable", ""),
                  "solucion_propuesta": datos["solucion_propuesta"], "costo_estimado": datos["costo_estimado"],
                  "fecha": timezone.now()},
    )
    orden.costo_mano_obra = datos["costo_estimado"]
    orden.save(update_fields=["costo_mano_obra"])
    if orden.estado == E.EN_DIAGNOSTICO:
        cambiar_estado(orden, E.PENDIENTE_APROBACION, usuario, "Diagnóstico registrado; se espera la respuesta del cliente", request)
    return diag


@transaction.atomic
def registrar_aprobacion(orden, aprobado, usuario, observacion="", esperar_repuestos=False, request=None):
    """RF-21 y RN-12: registra la respuesta del cliente al presupuesto."""
    orden = _bloquear(orden)
    if orden.estado != E.PENDIENTE_APROBACION:
        raise TransicionInvalida("La orden no está pendiente de aprobación.")
    diag = orden.diagnostico
    diag.aprobado = aprobado
    diag.fecha_respuesta = timezone.now()
    diag.save(update_fields=["aprobado", "fecha_respuesta"])
    if aprobado:
        destino = E.EN_ESPERA_REPUESTOS if esperar_repuestos else E.EN_REPARACION
        nota = observacion or "Presupuesto aprobado por el cliente"
    else:
        destino = E.LISTA_PARA_ENTREGA
        nota = observacion or "Presupuesto rechazado; se devuelve el equipo sin reparar"
    cambiar_estado(orden, destino, usuario, nota, request)
    return orden


# --------------------------------------------------------------------------- reparación
@transaction.atomic
def registrar_actividad(orden, datos, usuario, request=None):
    """RF-22."""
    from apps.reparacion.models import ActividadReparacion

    orden = _bloquear(orden)
    tecnico = exigir_tecnico_asignado(orden, usuario)
    if orden.estado != E.EN_REPARACION:
        raise TransicionInvalida("Solo se registran actividades en una orden en reparación.")
    actividad = ActividadReparacion.objects.create(
        orden=orden, tecnico=tecnico, descripcion=datos["descripcion"], horas_empleadas=datos["horas_empleadas"],
        fecha_inicio=datos.get("fecha_inicio") or timezone.now(), fecha_fin=datos.get("fecha_fin"),
    )
    auditoria.registrar("ORDEN_ACTIVIDAD", "orden", orden.pk, usuario=usuario, request=request,
                        detalle={"codigo": orden.codigo, "horas": str(actividad.horas_empleadas)})
    return actividad


@transaction.atomic
def agregar_repuesto(orden, repuesto_id, cantidad, usuario, request=None):
    """RF-23: el técnico asignado registra un repuesto; el inventario se descuenta en la misma transacción."""
    orden = _bloquear(orden)
    exigir_tecnico_asignado(orden, usuario)
    if orden.estado != E.EN_REPARACION:
        raise TransicionInvalida("Solo se registran repuestos en una orden en reparación.")
    uso, bajo_minimo = inventario.consumir_para_orden(orden, repuesto_id, cantidad, usuario, request)
    return uso, bajo_minimo


@transaction.atomic
def quitar_repuesto(orden, uso, usuario, request=None):
    orden = _bloquear(orden)
    exigir_tecnico_asignado(orden, usuario)
    if orden.estado != E.EN_REPARACION:
        raise TransicionInvalida("Solo se modifican repuestos en una orden en reparación.")
    inventario.devolver_de_orden(uso, usuario, f"Repuesto retirado de la orden {orden.codigo}", request)


@transaction.atomic
def poner_en_espera(orden, usuario, observacion="", request=None):
    """RF-24: la orden espera repuestos (extiende UC-13 cuando no hay stock)."""
    orden = _bloquear(orden)
    exigir_tecnico_asignado(orden, usuario)
    return cambiar_estado(orden, E.EN_ESPERA_REPUESTOS, usuario, observacion or "En espera de repuestos", request)


@transaction.atomic
def reanudar_reparacion(orden, usuario, request=None):
    orden = _bloquear(orden)
    exigir_tecnico_asignado(orden, usuario)
    return cambiar_estado(orden, E.EN_REPARACION, usuario, "Repuestos disponibles; se reanuda la reparación", request)


@transaction.atomic
def enviar_a_verificacion(orden, usuario, costo_mano_obra=None, request=None):
    orden = _bloquear(orden)
    exigir_tecnico_asignado(orden, usuario)
    if costo_mano_obra is not None:
        if Decimal(costo_mano_obra) < 0:
            raise ErrorDominio("El costo de mano de obra no puede ser negativo.")
        orden.costo_mano_obra = costo_mano_obra
        orden.save(update_fields=["costo_mano_obra"])
    return cambiar_estado(orden, E.EN_VERIFICACION, usuario, "Reparación terminada; pasa a control de calidad", request)


@transaction.atomic
def verificar(orden, aprobada, usuario, observacion="", request=None):
    """RF-25: control de calidad. Si no supera la verificación, vuelve a reparación."""
    orden = _bloquear(orden)
    exigir_tecnico_asignado(orden, usuario)
    destino = E.LISTA_PARA_ENTREGA if aprobada else E.EN_REPARACION
    nota = observacion or ("Verificación aprobada" if aprobada else "No superó la verificación")
    return cambiar_estado(orden, destino, usuario, nota, request)


# --------------------------------------------------------------------------- cierre
@transaction.atomic
def registrar_entrega(orden, recibido_por, usuario, observacion="", request=None):
    """RF-17 y RN-08."""
    orden = _bloquear(orden)
    if not recibido_por.strip():
        raise ErrorDominio("Indique el nombre de quien recibe el equipo.")
    orden.recibido_por = recibido_por.strip()[:150]
    orden.fecha_entrega = timezone.now()
    orden.save(update_fields=["recibido_por", "fecha_entrega"])
    return cambiar_estado(orden, E.ENTREGADA, usuario, observacion or f"Entregado a {orden.recibido_por}", request)


@transaction.atomic
def cancelar(orden, motivo, usuario, request=None):
    """RF-18 y RN-13: cancela con motivo y devuelve al inventario los repuestos ya registrados."""
    orden = _bloquear(orden)
    if not motivo.strip():
        raise ErrorDominio("El motivo de la cancelación es obligatorio.")
    for uso in list(orden.repuestos_utilizados.select_related("repuesto")):
        inventario.devolver_de_orden(uso, usuario, f"Devolución por cancelación de la orden {orden.codigo}", request)
    orden.motivo_cancelacion = motivo.strip()
    orden.save(update_fields=["motivo_cancelacion"])
    return cambiar_estado(orden, E.CANCELADA, usuario, motivo.strip(), request)


# --------------------------------------------------------------------------- evidencia fotográfica
def subir_foto(orden, archivo, descripcion, usuario, request=None):
    """RF-33: adjunta una foto del equipo. La imagen se procesa fuera de la transacción (es la parte lenta)."""
    from django.conf import settings

    exigir_abierta(orden)
    completo, miniatura, ancho, alto = procesador_fotos.procesar(archivo)
    rutas = procesador_fotos.guardar(orden.pk, completo, miniatura)
    try:
        with transaction.atomic():
            orden = _bloquear(orden)
            exigir_abierta(orden)
            if orden.fotos.count() >= settings.FOTOS_MAXIMO_POR_ORDEN:
                raise ErrorDominio(f"La orden ya tiene el máximo de {settings.FOTOS_MAXIMO_POR_ORDEN} fotos.")
            foto = FotoOrden.objects.create(
                orden=orden, etapa=EtapaFoto.para_estado(orden.estado), descripcion=descripcion.strip(),
                archivo=rutas[0], miniatura=rutas[1], ancho=ancho, alto=alto, tamano_bytes=len(completo),
                subida_por=usuario,
            )
            auditoria.registrar("ORDEN_FOTO", "orden", orden.pk, usuario=usuario, request=request,
                                detalle={"codigo": orden.codigo, "foto": foto.pk, "etapa": foto.etapa})
    except Exception:
        procesador_fotos.borrar(*rutas)  # sin registro en la base no deben quedar archivos huérfanos
        raise
    return foto


def subir_nota_voz(orden, archivo, duracion_ms, descripcion, usuario, request=None):
    """RF-37: adjunta una nota de voz o la grabación del sonido del equipo."""
    from django.conf import settings

    exigir_abierta(orden)
    contenido, formato = audios.validar(archivo, duracion_ms)
    ruta = audios.guardar(orden.pk, contenido, formato)
    try:
        with transaction.atomic():
            orden = _bloquear(orden)
            exigir_abierta(orden)
            if orden.notas_voz.count() >= settings.AUDIOS_MAXIMO_POR_ORDEN:
                raise ErrorDominio(f"La orden ya tiene el máximo de {settings.AUDIOS_MAXIMO_POR_ORDEN} notas de voz.")
            nota = NotaVoz.objects.create(
                orden=orden, etapa=EtapaFoto.para_estado(orden.estado), descripcion=descripcion.strip(), archivo=ruta,
                tipo_mime=audios.FORMATOS[formato][0], duracion_ms=duracion_ms, tamano_bytes=len(contenido),
                grabada_por=usuario,
            )
            auditoria.registrar("ORDEN_NOTA_VOZ", "orden", orden.pk, usuario=usuario, request=request,
                                detalle={"codigo": orden.codigo, "nota": nota.pk, "segundos": round(duracion_ms / 1000)})
    except Exception:
        procesador_fotos.borrar(ruta)  # sin registro en la base no deben quedar archivos huérfanos
        raise
    return nota


# --------------------------------------------------------------------------- acciones disponibles
def acciones_disponibles(orden, usuario):
    """Lista las acciones que el usuario puede ejecutar ahora; la interfaz solo muestra esas."""
    acciones = []
    p = usuario.tiene_permiso
    estado = orden.estado
    es_asignado = bool(getattr(usuario, "tecnico", None) and orden.tecnico_id == usuario.tecnico.pk) if hasattr(usuario, "tecnico") else False
    tecnico_ok = p("reparacion.registrar") and es_asignado
    if not orden.cerrada and p("ordenes.asignar"):
        acciones.append("asignar_tecnico")
    if tecnico_ok and estado == E.RECIBIDA:
        acciones.append("iniciar_diagnostico")
    if tecnico_ok and (estado in (E.RECIBIDA, E.EN_DIAGNOSTICO) or
                       (estado == E.PENDIENTE_APROBACION and getattr(_diagnostico(orden), "aprobado", None) is None)):
        acciones.append("registrar_diagnostico")
    if p("ordenes.aprobacion") and estado == E.PENDIENTE_APROBACION:
        acciones.append("registrar_aprobacion")
    if tecnico_ok and estado == E.EN_REPARACION:
        acciones += ["registrar_actividad", "agregar_repuesto", "poner_en_espera", "enviar_verificacion"]
    if tecnico_ok and estado == E.EN_ESPERA_REPUESTOS:
        acciones.append("reanudar")
    if tecnico_ok and estado == E.EN_VERIFICACION:
        acciones.append("verificar")
    if p("ordenes.entregar") and estado == E.LISTA_PARA_ENTREGA:
        acciones.append("registrar_entrega")
    if p("ordenes.fotos") and not orden.cerrada:
        acciones += ["subir_foto", "grabar_nota_voz"]
    if p("ordenes.cancelar") and E.CANCELADA in TRANSICIONES[estado]:
        acciones.append("cancelar")
    return acciones
