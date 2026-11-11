"""Procesamiento seguro de las fotos de las órdenes (RF-33, RNF-06).

Cada imagen recibida se abre con Pillow, se valida el formato real (no la extensión ni el Content-Type que envía el
navegador), se corrige la orientación y se vuelve a codificar como JPEG. Volver a codificar elimina los metadatos
EXIF (incluida la ubicación GPS del teléfono) y cualquier contenido ajeno a la imagen que viniera dentro del archivo.
"""
import uuid
from io import BytesIO

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps, UnidentifiedImageError

from rest_framework.exceptions import ValidationError

FORMATOS_PERMITIDOS = {"JPEG", "PNG", "WEBP"}
LADO_MAXIMO = 1920
LADO_MINIATURA = 480
# Protección contra «bombas de descompresión»: imágenes pequeñas en bytes pero enormes al decodificarlas.
Image.MAX_IMAGE_PIXELS = 40_000_000


def _invalida(mensaje):
    return ValidationError({"archivo": [mensaje]})


def _a_jpeg(imagen, lado, calidad):
    copia = imagen.copy()
    copia.thumbnail((lado, lado), Image.Resampling.LANCZOS)
    salida = BytesIO()
    copia.save(salida, format="JPEG", quality=calidad, optimize=True, progressive=True)
    return salida.getvalue(), copia.size


def procesar(archivo):
    """Devuelve (jpeg_completo, jpeg_miniatura, ancho, alto). Lanza ValidationError (400) si el archivo no es una imagen válida."""
    if archivo.size > settings.FOTOS_TAMANO_MAXIMO:
        megas = settings.FOTOS_TAMANO_MAXIMO // (1024 * 1024)
        raise _invalida(f"La foto supera el tamaño máximo de {megas} MB.")
    try:
        with Image.open(archivo) as prueba:
            formato = prueba.format
            prueba.verify()  # detecta archivos truncados o manipulados
        if formato not in FORMATOS_PERMITIDOS:
            raise _invalida("Solo se aceptan fotos JPEG, PNG o WebP.")
        archivo.seek(0)
        with Image.open(archivo) as original:
            imagen = ImageOps.exif_transpose(original)
            if imagen.mode in ("RGBA", "LA", "P"):
                imagen = imagen.convert("RGBA")
                fondo = Image.new("RGB", imagen.size, (255, 255, 255))
                fondo.paste(imagen, mask=imagen.getchannel("A"))
                imagen = fondo
            elif imagen.mode != "RGB":
                imagen = imagen.convert("RGB")
            completo, (ancho, alto) = _a_jpeg(imagen, LADO_MAXIMO, 85)
            miniatura, _ = _a_jpeg(imagen, LADO_MINIATURA, 78)
    except ValidationError:
        raise
    except Image.DecompressionBombError as exc:
        raise _invalida("La imagen tiene demasiados píxeles.") from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise _invalida("El archivo no es una imagen válida.") from exc
    return completo, miniatura, ancho, alto


def guardar(orden_id, completo, miniatura):
    """Guarda los dos archivos con nombres aleatorios (nunca el nombre que envía el usuario)."""
    nombre = uuid.uuid4().hex
    ruta = default_storage.save(f"fotos/{orden_id}/{nombre}.jpg", ContentFile(completo))
    ruta_min = default_storage.save(f"fotos/{orden_id}/{nombre}-min.jpg", ContentFile(miniatura))
    return ruta, ruta_min


def borrar(*rutas):
    for ruta in rutas:
        if ruta and default_storage.exists(ruta):
            default_storage.delete(ruta)
