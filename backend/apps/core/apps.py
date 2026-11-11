from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"
    verbose_name = "Núcleo"

    def ready(self):
        from . import esquema  # noqa: F401  registra la extensión OpenAPI de autenticación
