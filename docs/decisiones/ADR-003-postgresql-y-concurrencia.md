# ADR-003: PostgreSQL con bloqueo de fila para inventario y estados

- Estado: aceptada
- Fecha: noviembre de 2026

## Contexto

Dos técnicos pueden consumir al mismo tiempo la última unidad de un repuesto, y dos usuarios pueden intentar cambiar a la vez el estado de la misma orden. El stock nunca puede quedar negativo (RN-05) y cada transición debe respetar la Tabla 13.

## Decisión

PostgreSQL 16. Las operaciones de inventario y los cambios de estado se ejecutan en `transaction.atomic()` y bloquean la fila afectada con `SELECT ... FOR UPDATE`. Además, restricciones `CHECK` en la base de datos impiden stock y costos negativos aunque un error de programación saltara la validación de la aplicación.

## Alternativas consideradas

- SQLite: no ofrece bloqueo de fila ni concurrencia de escritura adecuada para varios usuarios.
- MongoDB u otra base NoSQL: el dominio es relacional (órdenes, clientes, equipos, repuestos, historial) y requiere transacciones e integridad referencial.
- Control optimista por versión: válido, pero obliga a reintentos en la interfaz; con el volumen del taller el bloqueo pesimista es más simple y no limita el rendimiento.

## Consecuencias

- La prueba `test_rnf11_concurrencia_ultima_unidad` lanza dos hilos sobre la última unidad: solo uno la obtiene y el stock queda en cero.
- Las restricciones de la base de datos son una segunda línea de defensa.
