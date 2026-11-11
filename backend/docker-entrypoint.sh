#!/bin/sh
# Prepara la base de datos y arranca Gunicorn. Todas las credenciales llegan por variables de entorno.
set -eu

echo "Esperando a PostgreSQL en ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}..."
python - <<'PY'
import os, sys, time
import psycopg

for intento in range(60):
    try:
        psycopg.connect(
            host=os.environ.get("POSTGRES_HOST", "db"),
            port=os.environ.get("POSTGRES_PORT", "5432"),
            dbname=os.environ.get("POSTGRES_DB", "sigeser"),
            user=os.environ.get("POSTGRES_USER", "sigeser"),
            password=os.environ["POSTGRES_PASSWORD"],
            connect_timeout=3,
        ).close()
        sys.exit(0)
    except psycopg.OperationalError:
        time.sleep(2)
print("PostgreSQL no respondió a tiempo.", file=sys.stderr)
sys.exit(1)
PY

python manage.py migrate --noinput
python manage.py createcachetable
python manage.py collectstatic --noinput --verbosity 0
python manage.py crear_admin

if [ "${SIGESER_CARGAR_DEMO:-0}" = "1" ]; then
  python manage.py cargar_demo
fi

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "${GUNICORN_WORKERS:-3}" \
  --timeout 30 \
  --worker-tmp-dir /dev/shm \
  --no-control-socket \
  --access-logfile -
