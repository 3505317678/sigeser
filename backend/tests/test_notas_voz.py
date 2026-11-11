"""RF-37: notas de voz y grabaciones del sonido del equipo (formato real, límites, permisos y entrega segura)."""
import os

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.core.models import RegistroAuditoria
from apps.ordenes.audios import detectar_formato

# Cabeceras mínimas de cada contenedor: el servidor identifica el formato por estos bytes, no por la extensión.
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 60
OGG = b"OggS" + b"\x00" * 60
MP4 = b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 60


def audio(contenido=WEBM, nombre="nota.webm", tipo="audio/webm"):
    return SimpleUploadedFile(nombre, contenido, content_type=tipo)


def grabar(api, orden_id, archivo=None, duracion_ms=4200, descripcion="Ruido del ventilador"):
    datos = {"archivo": archivo or audio(), "duracion_ms": duracion_ms, "descripcion": descripcion}
    return api.post(f"/api/v1/ordenes/{orden_id}/notas-voz", datos, format="multipart")


@pytest.mark.parametrize("cabecera,esperado", [(WEBM, "webm"), (OGG, "ogg"), (MP4, "mp4"), (b"<?php echo 1;", None),
                                               (b"%PDF-1.7", None), (b"", None)])
def test_detecta_el_formato_por_la_firma(cabecera, esperado):
    assert detectar_formato(cabecera[:16]) == esperado


@pytest.mark.django_db
class TestNotasDeVoz:
    def test_el_tecnico_graba_una_nota_y_queda_en_el_detalle(self, nueva_orden, api_tecnico):
        o = nueva_orden()
        api_tecnico.post(f"/api/v1/ordenes/{o['id']}/iniciar-diagnostico", format="json")
        r = grabar(api_tecnico, o["id"])
        assert r.status_code == 201, r.data
        assert r.data["etapa"] == "DIAGNOSTICO" and r.data["tipo_mime"] == "audio/webm"
        assert r.data["duracion_ms"] == 4200 and r.data["descripcion"] == "Ruido del ventilador"
        detalle = api_tecnico.get(f"/api/v1/ordenes/{o['id']}").data
        assert [n["id"] for n in detalle["notas_voz"]] == [r.data["id"]]
        assert "grabar_nota_voz" in detalle["acciones"]
        assert RegistroAuditoria.objects.filter(accion="ORDEN_NOTA_VOZ", entidad_id=o["id"]).exists()

    def test_el_audio_se_entrega_con_el_tipo_fijado_por_el_servidor(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        # El navegador declara un tipo falso: el servidor usa la firma del archivo (MP4) y no lo que se envió.
        r = grabar(api_recepcion, o["id"], audio(MP4, "nota.webm", "text/html"))
        assert r.status_code == 201 and r.data["tipo_mime"] == "audio/mp4"
        respuesta = api_recepcion.get(r.data["url"])
        assert respuesta.status_code == 200 and respuesta["Content-Type"] == "audio/mp4"
        assert respuesta["Cache-Control"] == "private, max-age=86400"
        assert b"".join(respuesta.streaming_content) == MP4

    @pytest.mark.parametrize("contenido", [b"<?php system($_GET['c']); ?>", b"%PDF-1.7 falso", b"MZ\x90\x00 ejecutable"])
    def test_rechaza_archivos_que_no_son_audio(self, nueva_orden, api_recepcion, contenido):
        o = nueva_orden()
        r = grabar(api_recepcion, o["id"], audio(contenido, "nota.webm"))
        assert r.status_code == 422

    @pytest.mark.parametrize("duracion", [0, 100, 121_000])
    def test_rechaza_duraciones_fuera_de_rango(self, nueva_orden, api_recepcion, duracion):
        o = nueva_orden()
        assert grabar(api_recepcion, o["id"], duracion_ms=duracion).status_code == 422

    @override_settings(AUDIOS_TAMANO_MAXIMO=50)
    def test_rechaza_audios_demasiado_grandes(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        assert grabar(api_recepcion, o["id"]).status_code == 422

    def test_otro_tecnico_no_escucha_ni_graba_en_una_orden_ajena(self, nueva_orden, api_recepcion, api_otro_tecnico):
        o = nueva_orden()
        nota = grabar(api_recepcion, o["id"]).data
        assert api_otro_tecnico.get(nota["url"]).status_code == 404
        assert grabar(api_otro_tecnico, o["id"]).status_code == 404

    def test_una_nota_no_se_puede_pedir_desde_otra_orden(self, nueva_orden, api_recepcion):
        o1, o2 = nueva_orden(), nueva_orden()
        nota = grabar(api_recepcion, o1["id"]).data
        assert api_recepcion.get(f"/api/v1/ordenes/{o2['id']}/notas-voz/{nota['id']}/audio").status_code == 404

    def test_no_se_graban_notas_en_una_orden_cerrada(self, nueva_orden, api_recepcion):
        o = nueva_orden()
        api_recepcion.post(f"/api/v1/ordenes/{o['id']}/cancelar", {"motivo": "El cliente desistió"}, format="json")
        assert grabar(api_recepcion, o["id"]).status_code == 409
        assert "grabar_nota_voz" not in api_recepcion.get(f"/api/v1/ordenes/{o['id']}").data["acciones"]

    @override_settings(AUDIOS_MAXIMO_POR_ORDEN=1)
    def test_limite_por_orden_sin_archivos_huerfanos(self, nueva_orden, api_recepcion, settings):
        o = nueva_orden()
        assert grabar(api_recepcion, o["id"]).status_code == 201
        assert grabar(api_recepcion, o["id"]).status_code == 409
        assert len(os.listdir(os.path.join(settings.MEDIA_ROOT, "audios", str(o["id"])))) == 1

    def test_el_rol_sin_permiso_no_puede_grabar(self, nueva_orden, api_recepcion, recepcionista):
        from apps.usuarios.models import Permiso

        recepcionista.rol.permisos.remove(Permiso.objects.get(codigo="ordenes.fotos"))
        o = nueva_orden()
        assert grabar(api_recepcion, o["id"]).status_code == 403
