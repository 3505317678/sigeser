"""Errores de dominio y formato uniforme de respuestas de error de la API."""
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler


class ErrorDominio(Exception):
    """Violación de una regla de negocio. Se responde con 409 Conflict por defecto."""

    codigo = "regla_negocio"
    estado_http = status.HTTP_409_CONFLICT

    def __init__(self, mensaje, **datos):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.datos = datos


class TransicionInvalida(ErrorDominio):
    codigo = "transicion_invalida"


class StockInsuficiente(ErrorDominio):
    codigo = "stock_insuficiente"


class OrdenCerrada(ErrorDominio):
    codigo = "orden_cerrada"


class OperacionNoPermitida(ErrorDominio):
    codigo = "operacion_no_permitida"
    estado_http = status.HTTP_403_FORBIDDEN


def manejador_excepciones(exc, context):
    if isinstance(exc, ErrorDominio):
        return Response({"detail": exc.mensaje, "codigo": exc.codigo, **exc.datos}, status=exc.estado_http)
    respuesta = exception_handler(exc, context)
    if respuesta is None:
        return None
    if isinstance(exc, ValidationError):
        # 422: los datos tienen el formato correcto pero no cumplen las validaciones.
        datos = respuesta.data if isinstance(respuesta.data, dict) else {"errores": respuesta.data}
        respuesta.data = {"detail": "Los datos enviados no son válidos.", "errores": datos}
        respuesta.status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    return respuesta
