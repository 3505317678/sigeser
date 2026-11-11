# SIGESER

Sistema de gestión de órdenes de servicio técnico. Registra el recorrido completo de un equipo en el taller: recepción, diagnóstico, aprobación del presupuesto, reparación con repuestos del inventario, verificación de calidad y entrega, con comprobantes en PDF, panel de control, reportes y auditoría.

Componentes multimedia: evidencia fotográfica del equipo (desde archivos, la cámara del teléfono o la cámara web) con comparación del antes y el después, notas de voz y sonidos del equipo con onda de audio en vivo, diagrama interactivo de las partes del equipo, comprobante de recepción con fotos y código QR, videotutoriales con subtítulos por rol, barra de avance animada, marca e ilustraciones vectoriales propias.

Versión 1.2, noviembre de 2026. Autores: Andrés Felipe Cohecha Mosquera y Diego Andrés Villamizar Soler (Universidad Cooperativa de Colombia, Villavicencio).

## Arquitectura

```
Navegador ──HTTP──▶ Nginx 1.30 (contenedor "web", único puerto publicado)
                     ├── /           SPA React 19 + TypeScript (archivos estáticos)
                     ├── /static/    archivos de la documentación OpenAPI
                     └── /api/       proxy inverso ──▶ Gunicorn + Django 5.2 LTS (contenedor "backend")
                                                         │  monolito modular: core, usuarios, tecnicos, clientes,
                                                         │  ordenes, reparacion, inventario, reportes
                                                         ▼
                                                      PostgreSQL 16 (contenedor "db", red interna)
```

| Capa | Tecnología |
|---|---|
| Interfaz | React 19, TypeScript 7, Vite 8, React Router 7, TanStack Query 5, Recharts 3, Bootstrap Icons |
| API | Django 5.2 LTS, Django REST Framework 3.18, drf-spectacular (OpenAPI 3), django-filter |
| Datos | PostgreSQL 16 (psycopg 3) |
| Seguridad | Sesión con cookie HttpOnly + CSRF, Argon2id, control de acceso por roles, auditoría |
| Documentos | ReportLab (comprobantes y reportes PDF con código QR), CSV |
| Multimedia | Pillow (validación y procesamiento de fotos), MediaDevices API (cámara web), video WebM/MP4 con subtítulos WebVTT, SVG |
| Despliegue | Docker Compose, Gunicorn 26, Nginx 1.30 |

Las decisiones de arquitectura están en [`docs/decisiones`](docs/decisiones).

## Requisitos

- Docker Desktop (Windows 10/11 con WSL 2, macOS) o Docker Engine con Compose v2 (Linux).
- 4 GB de RAM libres y el puerto 8080 disponible (u otro, configurable en `SIGESER_PUERTO`).
- VS Code (recomendado) y, para el modo de desarrollo del frontend, Node.js 22 o posterior.

## Ejecución desde el código (VS Code)

1. Abra Docker Desktop y espere a que indique que el motor está en ejecución.
2. En VS Code: **Archivo → Abrir carpeta…** y elija la carpeta `sigeser` (la que contiene `docker-compose.yml`).
3. Solo la primera vez, cree la configuración local a partir de la plantilla y reemplace los valores `cambie-...`
   (clave de Django, contraseña de la base de datos y contraseñas iniciales):

   ```powershell
   Copy-Item .env.example .env
   code .env
   ```

4. Abra la terminal integrada (**Terminal → Nueva terminal**) y levante el sistema:

   ```powershell
   docker compose up -d --build
   ```

   La primera construcción tarda varios minutos; las migraciones de la base de datos se aplican solas al arrancar el backend.
5. Abra <http://localhost:8080> (o el puerto definido en `SIGESER_PUERTO` del `.env`).

Las mismas acciones están como tareas de VS Code (**Terminal → Ejecutar tarea…**): *SIGESER: levantar*, *SIGESER: detener*, *SIGESER: registros del backend* y *SIGESER: frontend en modo desarrollo*.

| Acción | Comando |
|---|---|
| Ver el estado de los servicios | `docker compose ps` |
| Ver los registros del backend | `docker compose logs -f backend` |
| Detener (los datos se conservan) | `docker compose down` |
| Frontend con recarga en vivo, contra el sistema en Docker | `cd frontend; npm install; $env:SIGESER_API_URL="http://localhost:8080"; npx vite --port 5173` |

### Primera instalación asistida (opcional)

`iniciar.ps1` (Windows) e `iniciar.sh` (Linux o macOS) hacen el paso 3 automáticamente: generan el `.env` con secretos aleatorios, eligen un puerto libre entre 8080 y 8099 y ejecutan `docker compose up -d --build`.

## Usuarios de demostración

Con `SIGESER_CARGAR_DEMO=1` (valor por defecto) se cargan usuarios por rol, 20 clientes, 16 repuestos y 70 órdenes en todos los estados. Las contraseñas están en el archivo `.env` (`SIGESER_ADMIN_CONTRASENA` y `SIGESER_DEMO_CONTRASENA`).

| Rol | Correo | Qué puede hacer |
|---|---|---|
| Administrador | admin@sigeser.local | Todo, excepto el trabajo técnico; usuarios, roles, reportes y auditoría |
| Recepcionista | recepcion@sigeser.local | Clientes, equipos, registro, asignación, aprobación, entrega y cancelación de órdenes |
| Técnico | carlos.rodriguez@sigeser.local, andrea.martinez@sigeser.local, julian.herrera@sigeser.local | Sus órdenes asignadas: diagnóstico, actividades, repuestos y verificación |

Cambie la contraseña del administrador desde la aplicación (icono de llave) después del primer ingreso. Para un uso real, ponga `SIGESER_CARGAR_DEMO=0` antes del primer inicio.

## Operación

| Tarea | Comando |
|---|---|
| Detener | `docker compose stop` |
| Iniciar de nuevo | `docker compose start` |
| Ver registros | `docker compose logs -f backend` |
| Estado de los servicios | `docker compose ps` |
| Actualizar tras cambiar el código | `docker compose up -d --build` |
| Restablecer la contraseña de un usuario | `docker compose exec backend python manage.py changepassword correo@dominio` |
| Borrar todo, incluidas la base de datos y las fotos | `docker compose down -v` |

### Respaldo y restauración

```sh
# Respaldo (formato comprimido de PostgreSQL)
docker compose exec -T db pg_dump -U sigeser -d sigeser -Fc > respaldo-sigeser.dump

# Restauración sobre la base existente
docker compose exec -T db pg_restore -U sigeser -d sigeser --clean --if-exists < respaldo-sigeser.dump
```

Las fotos de las órdenes están en el volumen `medios`, no en la base de datos. Respáldelas junto con la base:

```sh
# Respaldo de las fotos
docker compose cp backend:/app/media ./respaldo-fotos

# Restauración (y devolución de los archivos al usuario del backend)
docker compose cp ./respaldo-fotos/. backend:/app/media
docker compose exec -u root backend chown -R sigeser:sigeser /app/media
```

Guarde los respaldos fuera del equipo (por ejemplo, en un disco externo o almacenamiento en la nube) y pruebe la restauración periódicamente.

### Uso desde otros equipos de la red del taller

Agregue la IP del computador que ejecuta SIGESER a `DJANGO_ALLOWED_HOSTS` en `.env` (por ejemplo `localhost,127.0.0.1,192.168.1.20`), ejecute `docker compose up -d` y abra `http://192.168.1.20:8080` desde los otros equipos.

## Configuración (`.env`)

| Variable | Descripción |
|---|---|
| `DJANGO_SECRET_KEY` | Clave aleatoria de al menos 40 caracteres. El backend no arranca con el valor de ejemplo. |
| `DJANGO_ALLOWED_HOSTS` | Nombres o IP con los que se accede al sistema, separados por comas. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Orígenes adicionales de confianza (solo si la interfaz se sirve desde otro dominio). |
| `DJANGO_USAR_HTTPS` | `1` cuando se publica con HTTPS: activa cookies `Secure` y HSTS. |
| `SESSION_MINUTOS_INACTIVIDAD` | Minutos de inactividad tras los cuales se cierra la sesión (30). |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Credenciales de la base de datos. |
| `SIGESER_ADMIN_CORREO`, `SIGESER_ADMIN_NOMBRE`, `SIGESER_ADMIN_CONTRASENA` | Administrador inicial; se crea solo si no existe. |
| `SIGESER_CARGAR_DEMO`, `SIGESER_DEMO_CONTRASENA` | Datos y usuarios de demostración. |
| `SIGESER_PUERTO` | Puerto local de la aplicación (8080). |
| `LOGIN_MAX_INTENTOS`, `LOGIN_MINUTOS_BLOQUEO`, `LOGIN_LIMITE_POR_IP` | Opcionales: 5 intentos, 15 minutos y `10/min` por defecto. |
| `FOTOS_TAMANO_MAXIMO_MB`, `FOTOS_MAXIMO_POR_ORDEN` | Opcionales: 8 MB por foto y 12 fotos por orden. Nginx acepta hasta 10 MB en la carga de fotos. |

## Seguridad

- Contraseñas con Argon2id y mínimo de 12 caracteres; bloqueo de la cuenta durante 15 minutos tras 5 intentos fallidos; límite de 10 intentos de ingreso por minuto por IP en Django y de 20 en Nginx.
- Sesión en cookie `HttpOnly` y `SameSite=Lax`, protección CSRF en todas las operaciones que modifican datos y cierre por inactividad.
- Control de acceso por roles con denegación por defecto, verificado en la API en cada petición; la interfaz solo oculta lo que el rol no puede hacer.
- Registro de auditoría de ingresos, cambios de estado, movimientos de inventario y administración de usuarios, sin datos de contraseñas.
- Cabeceras de seguridad: CSP estricta, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`.
- Contenedores con sistema de archivos de solo lectura, sin escalamiento de privilegios y backend sin usuario root; PostgreSQL y Gunicorn no se publican fuera de la red interna.
- Secretos solo en variables de entorno; el archivo `.env` no se incluye en el código fuente.
- Fotos: se valida el contenido real de cada imagen (no la extensión), se rechazan las bombas de descompresión, se vuelven a codificar para eliminar los metadatos EXIF (incluida la ubicación GPS), se guardan con nombres aleatorios fuera de la carpeta pública y solo se sirven por la API a quien puede ver la orden. No se pueden editar ni borrar.
- La cámara web se habilita solo para el propio sitio (`Permissions-Policy: camera=(self)`) y el video nunca sale del navegador: solo se envía la foto que el usuario captura.

Para publicar el sistema en internet, ubique Nginx detrás de un certificado TLS (por ejemplo, Let's Encrypt en un proxy delante del contenedor `web`), ponga `DJANGO_USAR_HTTPS=1` y ajuste `DJANGO_ALLOWED_HOSTS` al dominio.

## Videotutoriales

La sección **Videotutoriales** del menú tiene siete videos cortos (de 19 a 40 segundos) con subtítulos en español, filtrados por lo que puede hacer cada rol. Se graban sobre el sistema real con `node pruebas-e2e/grabar-tutoriales.cjs frontend/public/tutoriales` y quedan dentro de la imagen de Nginx, así que funcionan sin internet.

## Documentación de la API

Con la sesión iniciada como administrador: <http://localhost:8080/api/docs> (Swagger UI). El esquema OpenAPI está en `/api/schema`.

## Desarrollo local

Backend (requiere PostgreSQL accesible y las variables de entorno de `.env.example`):

```sh
cd backend
python -m venv .venv && . .venv/bin/activate      # en Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export DJANGO_DEBUG=1 POSTGRES_PASSWORD=... SIGESER_ADMIN_CORREO=... SIGESER_ADMIN_CONTRASENA=...
python manage.py migrate && python manage.py createcachetable && python manage.py crear_admin
python manage.py runserver 127.0.0.1:8001
```

Frontend (en otra terminal; el servidor de Vite reenvía `/api` al backend):

```sh
cd frontend
npm ci
npm run dev            # http://localhost:8080
```

Si cambia la API, regenere el contrato y los tipos: `python manage.py spectacular --file ../frontend/src/api/openapi.yaml` y luego `npm run tipos`.

## Pruebas

| Tipo | Comando | Resultado de la versión 1.1 |
|---|---|---|
| Backend (unitarias, integración y API) | `cd backend && pytest --cov=apps` | 101 pruebas correctas, 94 % de cobertura |
| Frontend (componentes y cliente HTTP) | `cd frontend && npm test` | 17 pruebas correctas |
| Extremo a extremo (Playwright) | `node pruebas-e2e/flujo-completo.cjs ./evidencia` | 11 de 11 pasos correctos (incluye fotos, comprobante con QR y videotutoriales) |
| Carga (RNF-10) | `python pruebas-carga/carga.py --usuarios 15 --duracion 120` | p95 de 208 ms con 10 000 órdenes |
| Análisis estático | `bandit -r apps config -x "apps/*/migrations,tests"` | 0 hallazgos |
| Dependencias | `pip-audit -r requirements.txt` y `npm audit` | 0 vulnerabilidades conocidas |

Las pruebas de extremo a extremo y de carga se ejecutan contra el sistema desplegado y leen las contraseñas del entorno. Los datos para la prueba de carga se generan con `pruebas-carga/datos-carga.sql`.

## Estructura

```
sigeser/
├── backend/            API Django (apps por módulo, pruebas en tests/)
├── frontend/           SPA React + TypeScript y configuración de Nginx
├── pruebas-e2e/        Prueba de extremo a extremo, grabación de videotutoriales y fotos de prueba
├── pruebas-carga/      Prueba de carga (RNF-10) y datos sintéticos
├── docs/decisiones/    Registros de decisiones de arquitectura (ADR)
├── docker-compose.yml
├── .env.example
├── iniciar.ps1         Inicio en Windows
└── iniciar.sh          Inicio en Linux o macOS
```

## Limitaciones conocidas

- El selector de repuestos de una orden carga hasta 100 repuestos activos; con un catálogo mayor debe reemplazarse por una búsqueda incremental.
- No envía notificaciones al cliente por correo o mensaje de texto; el contacto se hace con los datos registrados.
- La configuración incluida publica el sistema por HTTP para uso local; HTTPS requiere certificado y la configuración descrita en Seguridad.
- Está diseñado para un solo taller (una sede, un inventario).

## Solución de problemas

| Síntoma | Qué hacer |
|---|---|
| `docker` no se reconoce o Docker no responde | Abra Docker Desktop y espere a que el motor esté en ejecución. |
| El puerto 8080 está ocupado (por ejemplo, por el Apache que instala PostgreSQL de EnterpriseDB) | Cambie `SIGESER_PUERTO` en `.env` (por ejemplo, a 8090), ajuste `DJANGO_CSRF_TRUSTED_ORIGINS` al mismo puerto y ejecute `docker compose up -d`. |
| «Usar la cámara» no muestra imagen | Permita la cámara en el navegador. Desde otro equipo de la red, la cámara web exige HTTPS; use «Elegir fotos», que en el teléfono abre también la cámara. |
| El backend queda "unhealthy" | Revise `docker compose logs backend`; suele indicar una variable faltante en `.env`. |
| "DJANGO_SECRET_KEY debe ser un valor aleatorio" | Reemplace el valor de ejemplo por uno aleatorio o borre `.env` y vuelva a ejecutar el script de inicio. |
| Error 400 al abrir desde otro equipo | Agregue esa IP o nombre a `DJANGO_ALLOWED_HOSTS`. |
| Olvidó la contraseña del administrador | `docker compose exec backend python manage.py changepassword admin@sigeser.local` |
