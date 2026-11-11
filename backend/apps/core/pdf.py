"""Generador de documentos PDF (servicio transversal del diagrama de componentes)."""
from html import escape
from io import BytesIO

from django.conf import settings
from django.utils import timezone
from django.core.files.storage import default_storage
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

AZUL = colors.HexColor("#1E3A8A")
GRIS = colors.HexColor("#E5E7EB")


def _estilos():
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle("t", parent=base["Title"], fontSize=16, textColor=AZUL, spaceAfter=4),
        "sub": ParagraphStyle("s", parent=base["Normal"], fontSize=9, textColor=colors.HexColor("#475569")),
        "h": ParagraphStyle("h", parent=base["Heading3"], fontSize=11, textColor=AZUL, spaceBefore=10, spaceAfter=4),
        "n": ParagraphStyle("n", parent=base["Normal"], fontSize=9.5, leading=13),
    }


def _tabla(filas, anchos, encabezado=True):
    t = Table(filas, colWidths=anchos, repeatRows=1 if encabezado else 0)
    estilo = [
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    if encabezado:
        estilo += [("BACKGROUND", (0, 0), (-1, 0), GRIS), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]
    t.setStyle(TableStyle(estilo))
    return t


def _p(texto, estilo):
    """Paragraph interpreta un mini-lenguaje de marcado: el texto del usuario se escapa para que no inyecte etiquetas."""
    return Paragraph(escape(str(texto or "—"), quote=False).replace("\n", "<br/>"), estilo)


def _qr(texto, lado=3.2 * cm):
    """Código QR vectorial (sin dependencias nuevas: ReportLab lo dibuja)."""
    widget = QrCodeWidget(texto, barLevel="M")
    x0, y0, x1, y1 = widget.getBounds()
    dibujo = Drawing(lado, lado, transform=[lado / (x1 - x0), 0, 0, lado / (y1 - y0), 0, 0])
    dibujo.add(widget)
    return dibujo


def _galeria(rutas, ancho_total=17 * cm, columnas=4):
    """Miniaturas de las fotos en una fila; cada imagen conserva su proporción."""
    celda = ancho_total / columnas
    imagenes = []
    for ruta in rutas[:columnas]:
        with default_storage.open(ruta, "rb") as f:
            datos = BytesIO(f.read())
        img = Image(datos)
        escala = min((celda - 8) / img.imageWidth, (celda - 8) / img.imageHeight)
        img.drawWidth, img.drawHeight = img.imageWidth * escala, img.imageHeight * escala
        imagenes.append(img)
    imagenes += [""] * (columnas - len(imagenes))
    t = Table([imagenes], colWidths=[celda] * columnas)
    t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return t


def documento(titulo, subtitulo, secciones, qr=None):
    """secciones: lista de (titulo, filas, anchos_cm, encabezado), (titulo, texto) o (titulo, {"fotos": rutas}).

    qr: texto (por ejemplo, la dirección de la orden en SIGESER) que se imprime como código QR junto al título.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=1.6 * cm, bottomMargin=1.6 * cm, title=titulo, author=settings.EMPRESA_NOMBRE)
    e = _estilos()
    cabecera = [_p(settings.EMPRESA_NOMBRE, e["sub"]), _p(titulo, e["titulo"]), _p(subtitulo, e["sub"])]
    if qr:
        nota = _p("Escanee el código para abrir la orden en SIGESER.", e["sub"])
        t = Table([[cabecera, [_qr(qr), nota]]], colWidths=[13 * cm, 4 * cm])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        historia = [t, Spacer(1, 6)]
    else:
        historia = [*cabecera, Spacer(1, 6)]
    for sec in secciones:
        historia.append(_p(sec[0], e["h"]))
        if isinstance(sec[1], dict):
            historia.append(_galeria(sec[1]["fotos"]))
        elif isinstance(sec[1], str):
            historia.append(_p(sec[1], e["n"]))
        else:
            filas, anchos, encabezado = sec[1], sec[2], sec[3]
            filas = [[_p(c, e["n"]) for c in fila] for fila in filas]
            historia.append(_tabla(filas, [a * cm for a in anchos], encabezado))
    historia += [Spacer(1, 14), _p(f"Generado por SIGESER el {timezone.localtime():%d/%m/%Y %H:%M}.", e["sub"])]
    doc.build(historia)
    return buffer.getvalue()


def comprobante_orden(orden, tipo, url_orden=None):
    """RF-13: comprobante de recepción o de entrega de la orden."""
    cliente, equipo = orden.cliente, orden.equipo
    datos = [
        ["Cliente", cliente.nombre], ["Documento", f"{cliente.tipo_documento} {cliente.numero_documento}"],
        ["Teléfono", cliente.telefono], ["Equipo", f"{equipo.tipo} {equipo.marca} {equipo.modelo}"],
        ["Serial", equipo.serial or "—"],
        ["Fecha de recepción", timezone.localtime(orden.fecha_recepcion).strftime("%d/%m/%Y %H:%M")],
    ]
    secciones = [("Datos de la orden", datos, [4.5, 12.5], False),
                 ("Falla reportada", orden.falla_reportada),
                 ("Accesorios recibidos", orden.accesorios or "Ninguno"),
                 ("Estado físico", orden.estado_fisico or "Sin observaciones")]
    if tipo == "recepcion":
        fotos = [f.miniatura.name for f in orden.fotos.filter(etapa="RECEPCION")]
        if fotos:
            secciones.append(("Fotos del equipo al recibirlo", {"fotos": fotos}))
        if orden.fecha_estimada_entrega:
            secciones.append(("Fecha estimada de entrega", orden.fecha_estimada_entrega.strftime("%d/%m/%Y")))
        secciones.append(("Condiciones", "Conserve este comprobante: se solicitará para retirar el equipo. "
                          "Sus datos se tratan conforme a la Ley 1581 de 2012 y a la autorización otorgada."))
        titulo = f"Comprobante de recepción {orden.codigo}"
    else:
        filas = [["Repuesto", "Cantidad", "Precio unitario", "Subtotal"]]
        for uso in orden.repuestos_utilizados.select_related("repuesto"):
            filas.append([uso.repuesto.nombre, uso.cantidad, f"$ {uso.precio_unitario:,.2f}", f"$ {uso.subtotal():,.2f}"])
        if len(filas) > 1:
            secciones.append(("Repuestos utilizados", filas, [7.5, 2.5, 3.5, 3.5], True))
        diag = getattr(orden, "diagnostico", None) if hasattr(orden, "diagnostico") else None
        if diag:
            secciones.append(("Trabajo realizado", diag.solucion_propuesta))
        secciones.append(("Totales", [["Mano de obra", f"$ {orden.costo_mano_obra:,.2f}"],
                                      ["Repuestos", f"$ {orden.total_repuestos():,.2f}"],
                                      ["Total", f"$ {orden.calcular_total():,.2f}"]], [12, 5], False))
        entrega = timezone.localtime(orden.fecha_entrega).strftime("%d/%m/%Y %H:%M") if orden.fecha_entrega else "—"
        secciones.append(("Entrega", f"Recibido por: {orden.recibido_por or '—'}. Fecha: {entrega}."))
        titulo = f"Comprobante de entrega {orden.codigo}"
    return documento(titulo, f"Estado: {orden.get_estado_display()}", secciones, qr=url_orden)
