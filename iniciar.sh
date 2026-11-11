#!/bin/sh
# Inicia SIGESER en Linux o macOS con Docker.
# La primera vez crea el archivo .env con secretos aleatorios y muestra las credenciales iniciales.
# Uso: ./iniciar.sh
set -eu
cd "$(dirname "$0")"

secreto() {
  # $1 = cantidad de bytes aleatorios del generador del sistema
  head -c "$1" /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n'
}

command -v docker >/dev/null 2>&1 || { echo "No se encontró Docker. Instálelo y vuelva a intentarlo." >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker no está en ejecución." >&2; exit 1; }

if [ ! -f .env ]; then
  clave_admin=$(secreto 12)
  clave_demo=$(secreto 12)
  sed -e "s|cambie-esta-clave-por-un-valor-aleatorio-largo|$(secreto 48)|" \
      -e "s|cambie-esta-contrasena-de-base-de-datos|$(secreto 24)|" \
      -e "s|cambie-esta-contrasena-de-administrador|${clave_admin}|" \
      -e "s|cambie-esta-contrasena-de-demostracion|${clave_demo}|" \
      .env.example > .env
  chmod 600 .env
  echo ""
  echo "Se creó el archivo .env con secretos aleatorios. Guarde estas credenciales:"
  echo "  Administrador:  admin@sigeser.local  /  ${clave_admin}"
  echo "  Usuarios demo:  recepcion@, carlos.rodriguez@, andrea.martinez@, julian.herrera@sigeser.local  /  ${clave_demo}"
  echo ""
fi

puerto=$(sed -n 's/^SIGESER_PUERTO=\([0-9]*\).*/\1/p' .env | head -n 1)
puerto=${puerto:-8080}

echo "Construyendo e iniciando los contenedores..."
docker compose up -d --build

printf "Esperando a que el sistema responda"
i=0
while [ $i -lt 90 ]; do
  if curl -fsS "http://localhost:${puerto}/api/v1/salud" >/dev/null 2>&1; then
    echo ""
    echo "SIGESER está listo en http://localhost:${puerto}"
    exit 0
  fi
  printf "."
  sleep 2
  i=$((i + 1))
done
echo ""
echo "El sistema no respondió a tiempo. Revise: docker compose logs backend" >&2
exit 1
