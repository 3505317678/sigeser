# ADR-001: Monolito modular con Django

- Estado: aceptada
- Fecha: noviembre de 2026

## Contexto

SIGESER atiende a un solo taller con pocos usuarios simultáneos (recepción, tres a cinco técnicos y un administrador). El equipo de desarrollo es de dos personas y el sistema debe poder ejecutarse en un computador del taller. Los módulos (órdenes, reparación, inventario, reportes) comparten datos y transacciones: consumir un repuesto en una orden debe descontar el inventario en la misma operación.

## Decisión

Un monolito modular en Django 5.2 LTS: cada módulo es una aplicación de Django con sus modelos, servicios de dominio, serializadores y vistas. La lógica de negocio vive en `servicios.py` de cada módulo; las vistas solo validan la entrada, verifican permisos y delegan. Los módulos se comunican por llamadas a servicios, no por acceso directo a los modelos de otro módulo cuando hay reglas de por medio.

## Alternativas consideradas

- Microservicios: aislarían los módulos, pero obligarían a transacciones distribuidas para la operación orden-inventario, multiplicarían la infraestructura y el esfuerzo de operación, sin un beneficio real para un solo taller.
- Monolito sin estructura modular: más rápido al inicio, pero mezcla responsabilidades y dificulta las pruebas y el mantenimiento.

## Consecuencias

- Una sola transacción de base de datos cubre las operaciones que tocan varios módulos (por ejemplo, RN-05 y RN-13).
- Despliegue simple: un contenedor de aplicación.
- Si el sistema creciera a varias sedes con equipos independientes, los límites entre aplicaciones permiten extraer un módulo (por ejemplo, reportes) sin reescribir el resto.
