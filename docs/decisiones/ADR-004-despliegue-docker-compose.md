# ADR-004: Despliegue con Docker Compose y Nginx como única puerta de entrada

- Estado: aceptada
- Fecha: noviembre de 2026

## Contexto

El sistema debe instalarse en el computador del taller o en un servidor pequeño sin pasos manuales propensos a error, y debe poder demostrarse en la sustentación con el mismo comportamiento que en producción.

## Decisión

Tres contenedores definidos en `docker-compose.yml`: Nginx (sirve la SPA, aplica cabeceras de seguridad y reenvía `/api`), el backend Django con Gunicorn y PostgreSQL. Solo Nginx publica un puerto. El backend se ejecuta sin usuario root y con sistema de archivos de solo lectura; Nginx reescribe las cabeceras de IP de origen y Django confía en ellas solo si `DJANGO_NUM_PROXIES` indica que hay un proxy delante. Los scripts `iniciar.ps1` e `iniciar.sh` generan los secretos aleatorios en `.env`.

## Alternativas consideradas

- Instalación directa (Python, Node y PostgreSQL en el equipo): más pasos, dependencias del sistema operativo y diferencias entre equipos.
- Plataforma en la nube administrada (PaaS): agrega costo mensual y dependencia de conexión a internet para un taller que opera en local.

## Consecuencias

- Un solo comando instala y actualiza el sistema; el mismo despliegue se usó en las pruebas de extremo a extremo y de carga.
- Publicarlo en internet exige agregar TLS delante de Nginx y activar `DJANGO_USAR_HTTPS`.
