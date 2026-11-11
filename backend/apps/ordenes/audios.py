"""Validación y almacenamiento de las notas de voz de las órdenes (RF-37).

El técnico graba con el micrófono una observación o el sonido anormal del equipo (ventilador, disco, bisagra). El
navegador entrega el audio en WebM/Opus (Chrome, Edge, Firefox) o MP4/AAC (Safari). El servidor:
- no confía en la extensión ni en el Content-Type: identifica el contenedor por su firma (primeros bytes);
- limita el tamaño y la duración, y guarda el archivo con un nombre aleatorio fuera de la carpeta pública;
- lo entrega solo por la API, a quien puede ver la orden, con el tipo MIME fijado por el servidor.
"""
import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from rest_framework.exceptions import ValidationError

# Firma del contenedor → (tipo MIME que se enviará, extensión con que se guarda)
FORMATOS = {
    "webm": ("audio/webm", "webm"),
    "ogg": ("audio/ogg", "ogg"),
    "mp4": ("audio/mp4", "m4a"),
}


def _invalido(mensaje):
    return ValidationError({"archivo": [mensaje]})


def detectar_formato(cabecera: bytes):
    """Devuelve 'webm', 'ogg', 'mp4' o None según la firma del archivo."""
    if cabecera.startswith(b"\x1a\x45\xdf\xa3"):  # EBML: Matroska/WebM
        return "webm"
    if cabecera.startswith(b"OggS"):
        return "ogg"
    if len(cabecera) >= 12 and cabecera[4:8] == b"ftyp":  # ISO BMFF: MP4/M4A
        return "mp4"
    return None


def validar(archivo, duracion_ms):
    """Valida el archivo y la duración informada por el navegador; devuelve (bytes, formato)."""
    if archivo.size > settings.AUDIOS_TAMANO_MAXIMO:
        raise _invalido(f"La nota de voz supera el tamaño máximo de {settings.AUDIOS_TAMANO_MAXIMO // (1024 * 1024)} MB.")
    if not 500 <= duracion_ms <= settings.AUDIOS_DURACION_MAXIMA * 1000:
        raise ValidationError({"duracion_ms": [f"La nota debe durar entre medio segundo y {settings.AUDIOS_DURACION_MAXIMA} segundos."]})
    contenido = archivo.read()
    formato = detectar_formato(contenido[:16])
    if formato is None:
        raise _invalido("El archivo no es un audio válido (se admite WebM, Ogg o MP4).")
    return contenido, formato


def guardar(orden_id, contenido, formato):
    return default_storage.save(f"audios/{orden_id}/{uuid.uuid4().hex}.{FORMATOS[formato][1]}", ContentFile(contenido))
