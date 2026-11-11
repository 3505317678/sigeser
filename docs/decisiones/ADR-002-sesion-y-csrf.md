# ADR-002: Autenticación por sesión con cookie HttpOnly y CSRF

- Estado: aceptada
- Fecha: noviembre de 2026

## Contexto

La interfaz es una SPA servida desde el mismo origen que la API (Nginx reenvía `/api`). Se requiere cierre por inactividad de 30 minutos (RF-02), bloqueo tras intentos fallidos (RF-01) y poder invalidar sesiones al cambiar la contraseña o desactivar un usuario.

## Decisión

Sesiones de Django en cookie `HttpOnly` y `SameSite=Lax`, con protección CSRF de Django en todas las peticiones que modifican datos (cabecera `X-CSRFToken`). La vista de ingreso exige CSRF de forma explícita, usa un mensaje de error genérico y una verificación señuelo para no revelar qué correos existen. Contraseñas con Argon2id.

## Alternativas consideradas

- JWT en `localStorage`: expone el token a cualquier script inyectado (XSS) y no permite revocar sesiones antes de que expire el token sin una lista de revocación.
- JWT en cookie: devuelve el problema de CSRF y agrega la gestión de renovación de tokens, sin ventaja en un despliegue de mismo origen.

## Consecuencias

- El JavaScript nunca accede al identificador de sesión.
- Cerrar sesión, cambiar la contraseña o desactivar un usuario invalida sus sesiones de inmediato.
- Si en el futuro hubiera clientes móviles nativos, se agregaría un esquema de tokens para ellos sin cambiar el de la web.
