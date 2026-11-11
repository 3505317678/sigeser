"""RF-33: evidencia fotográfica del equipo (carga segura, permisos, metadatos y límites)."""
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from apps.core.models import RegistroAuditoria
from apps.ordenes.models import FotoOrden


def imagen(formato="JPEG", tamano=(1200, 900), exif_gps=False, nombre="foto.jpg", modo="RGB"):
    buffer = BytesIO()
    img = Image.new(modo, tamano, (30, 90, 80) if modo == "RGB" else (30, 90, 80, 128))
    opciones = {}
    if exif_gps:
        exif = Image.Exif()
        exif[0x0112] = 6  # orientación: girada 90°
        exif[0x8825] = {1: "N", 2: (4.0, 8.0, 30.0)}  # GPSInfo
        opciones["exif"] = exif
    img.save(buffer, format=formato, **opciones)
    return SimpleUploadedFile(nombre, buffer.getvalue(), content_type="image/jpeg")


def subir(api, orden_id, archivo, descripcion="Rayón en la tapa"):
    return api.post(f"/api/v1/ordenes/{orden_id}/fotos", {"archivo": archivo, "descripcion": descripcion}, format="multipart")


@pytest.mark.django_db
class TestCargaDeFotos:
    def test_recepcion_sube_foto_y_queda_en_el_detalle(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        r = subir(api_recepcion, o["id"], imagen())
        assert r.status_code == 201, r.data
        assert r.data["etapa"] == "RECEPCION" and r.data["descripcion"] == "Rayón en la tapa"
        assert r.data["subida_por_nombre"] == "Rosa Recepción"
        detalle = api_recepcion.get(f"/api/v1/ordenes/{o['id']}").data
        assert [f["id"] for f in detalle["fotos"]] == [r.data["id"]]
        assert "subir_foto" in detalle["acciones"]
        assert RegistroAuditoria.objects.filter(accion="ORDEN_FOTO", entidad_id=o["id"]).exists()

    def test_la_imagen_se_reescala_y_se_genera_miniatura(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        r = subir(api_recepcion, o["id"], imagen(tamano=(4000, 3000)))
        assert (r.data["ancho"], r.data["alto"]) == (1920, 1440)
        completa = api_recepcion.get(r.data["url"])
        assert completa.status_code == 200 and completa["Content-Type"] == "image/jpeg"
        assert completa["Cache-Control"] == "private, max-age=86400"
        miniatura = Image.open(BytesIO(b"".join(api_recepcion.get(r.data["url_miniatura"]).streaming_content)))
        assert max(miniatura.size) == 480

    def test_se_eliminan_los_metadatos_y_se_corrige_la_orientacion(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        r = subir(api_recepcion, o["id"], imagen(tamano=(800, 600), exif_gps=True))
        assert (r.data["ancho"], r.data["alto"]) == (600, 800)  # la orientación EXIF se aplicó a los píxeles
        guardada = Image.open(BytesIO(b"".join(api_recepcion.get(r.data["url"]).streaming_content)))
        assert not guardada.getexif()  # sin GPS ni ningún otro metadato del teléfono

    @pytest.mark.parametrize("formato,nombre", [("PNG", "foto.png"), ("WEBP", "foto.webp")])
    def test_acepta_png_y_webp_y_los_convierte_a_jpeg(self, nueva_orden, api_recepcion, formato, nombre):
        o = nueva_orden()
        r = subir(api_recepcion, o["id"], imagen(formato=formato, nombre=nombre, modo="RGBA"))
        assert r.status_code == 201, r.data
        foto = FotoOrden.objects.get(pk=r.data["id"])
        assert foto.archivo.name.endswith(".jpg") and nombre not in foto.archivo.name  # nombre aleatorio

    def test_el_tecnico_asignado_sube_fotos_del_diagnostico(self, nueva_orden, api_tecnico):
        o = nueva_orden()
        api_tecnico.post(f"/api/v1/ordenes/{o['id']}/iniciar-diagnostico", format="json")
        r = subir(api_tecnico, o["id"], imagen(), "Condensador inflado")
        assert r.status_code == 201 and r.data["etapa"] == "DIAGNOSTICO"


@pytest.mark.django_db
class TestSeguridadDeFotos:
    @pytest.mark.parametrize("contenido,nombre", [
        (b"<?php system($_GET['c']); ?>", "foto.jpg"),
        (b"%PDF-1.7 documento", "foto.png"),
        (b"\xff\xd8\xff\xe0 truncado", "foto.jpg"),
        (b"GIF89a\x01\x00\x01\x00\x00\x00\x00;", "foto.gif"),
    ])
    def test_rechaza_archivos_que_no_son_imagenes_permitidas(self, nueva_orden, api_recepcion, contenido, nombre):
        o = nueva_orden()
        r = subir(api_recepcion, o["id"], SimpleUploadedFile(nombre, contenido, content_type="image/jpeg"))
        assert r.status_code == 422 and "archivo" in r.data["errores"]
        assert not FotoOrden.objects.exists()

    @override_settings(FOTOS_TAMANO_MAXIMO=50 * 1024)
    def test_rechaza_fotos_que_superan_el_tamano_maximo(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        grande = BytesIO()
        Image.effect_noise((800, 800), 90).convert("RGB").save(grande, format="PNG")
        r = subir(api_recepcion, o["id"], SimpleUploadedFile("g.png", grande.getvalue()))
        assert r.status_code == 422 and "tamaño máximo" in r.data["errores"]["archivo"][0]

    def test_rechaza_bombas_de_descompresion(self, nueva_orden, api_recepcion, monkeypatch):
        monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1000)  # 2× el límite produce DecompressionBombError
        o = nueva_orden()
        r = subir(api_recepcion, o["id"], imagen(tamano=(100, 100)))
        assert r.status_code == 422

    def test_otro_tecnico_no_ve_ni_sube_fotos_de_una_orden_ajena(self, nueva_orden, api_recepcion, api_otro_tecnico):
        o = nueva_orden()
        foto = subir(api_recepcion, o["id"], imagen()).data
        assert api_otro_tecnico.get(foto["url"]).status_code == 404
        assert subir(api_otro_tecnico, o["id"], imagen()).status_code == 404

    def test_sin_sesion_no_hay_acceso_a_las_imagenes(self, nueva_orden, api_recepcion):
        from rest_framework.test import APIClient

        o = nueva_orden()
        foto = subir(api_recepcion, o["id"], imagen()).data
        assert APIClient().get(foto["url"]).status_code in (401, 403)

    def test_una_foto_no_se_puede_pedir_desde_otra_orden(self, nueva_orden, api_recepcion):
        o1, o2 = nueva_orden(), nueva_orden()
        foto = subir(api_recepcion, o1["id"], imagen()).data
        assert api_recepcion.get(f"/api/v1/ordenes/{o2['id']}/fotos/{foto['id']}/imagen").status_code == 404

    def test_no_se_suben_fotos_a_una_orden_cerrada(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        api_recepcion.post(f"/api/v1/ordenes/{o['id']}/cancelar", {"motivo": "El cliente desistió"}, format="json")
        r = subir(api_recepcion, o["id"], imagen())
        assert r.status_code == 409
        assert "subir_foto" not in api_recepcion.get(f"/api/v1/ordenes/{o['id']}").data["acciones"]

    @override_settings(FOTOS_MAXIMO_POR_ORDEN=2)
    def test_limite_de_fotos_por_orden_sin_archivos_huerfanos(self, nueva_orden, api_recepcion, settings):
        import os

        o = nueva_orden()
        assert subir(api_recepcion, o["id"], imagen()).status_code == 201
        assert subir(api_recepcion, o["id"], imagen()).status_code == 201
        assert subir(api_recepcion, o["id"], imagen()).status_code == 409
        carpeta = os.path.join(settings.MEDIA_ROOT, "fotos", str(o["id"]))
        assert len(os.listdir(carpeta)) == 4  # 2 fotos × (completa + miniatura); el intento rechazado no dejó archivos

    def test_el_rol_sin_permiso_no_puede_subir(self, nueva_orden, api_recepcion, recepcionista):
        from apps.usuarios.models import Permiso

        recepcionista.rol.permisos.remove(Permiso.objects.get(codigo="ordenes.fotos"))
        o = nueva_orden()
        assert subir(api_recepcion, o["id"], imagen()).status_code == 403


@pytest.mark.django_db
def test_comprobante_de_recepcion_incluye_fotos_y_codigo_qr(nueva_orden, api_recepcion):
    import base64
    import re
    import zlib

    o = nueva_orden()
    subir(api_recepcion, o["id"], imagen())
    r = api_recepcion.get(f"/api/v1/ordenes/{o['id']}/comprobante?tipo=recepcion")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert b"/Subtype /Image" in r.content  # la miniatura de la foto de recepción
    # El texto del PDF está comprimido: se buscan la nota del QR y la sección de fotos en los flujos descomprimidos.
    texto = b""
    for datos in re.findall(rb"stream\r?\n(.*?)endstream", r.content, re.S):
        datos = datos.strip()
        try:
            if datos.endswith(b"~>"):  # ReportLab codifica los flujos en ASCII85 antes de comprimirlos
                datos = base64.a85decode(datos[:-2])
            texto += zlib.decompress(datos)
        except (zlib.error, ValueError):
            pass
    assert b"Escanee el c" in texto and b"Fotos del equipo al recibirlo" in texto
