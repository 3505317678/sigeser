# Imagen del backend de SIGESER (Django + Gunicorn).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Las dependencias se instalan antes de copiar el código para aprovechar la caché de capas.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Usuario sin privilegios: un fallo en la aplicación no da acceso de root al contenedor.
RUN groupadd --system sigeser && useradd --system --gid sigeser --home-dir /app --no-create-home sigeser

COPY --chown=sigeser:sigeser . .
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/staticfiles /app/media && chown sigeser:sigeser /app/staticfiles /app/media

USER sigeser
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/salud', timeout=4)"

ENTRYPOINT ["./docker-entrypoint.sh"]
