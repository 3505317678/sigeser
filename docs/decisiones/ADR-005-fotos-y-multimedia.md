# ADR-005: Evidencia fotográfica y contenido multimedia

- Estado: aceptada
- Fecha: noviembre de 2026

## Contexto

La retroalimentación del curso señaló que el proyecto debía incorporar componentes multimedia con un propósito en el sistema, no solo en la documentación. En los talleres, buena parte de los reclamos se refieren al estado en que llegó el equipo («ese rayón no lo tenía»), algo que el texto libre del campo «Estado físico» no prueba. Además, cada rol necesita aprender a usar el sistema sin depender de una capacitación presencial.

## Decisión

1. **Fotos del equipo (RF-33).** Recepción y el técnico asignado adjuntan fotos a la orden desde archivos, la cámara del teléfono o la cámara web (`getUserMedia`). El servidor:
   - valida el contenido real con Pillow (JPEG, PNG o WebP; máximo 8 MB y 40 millones de píxeles, contra bombas de descompresión);
   - corrige la orientación y vuelve a codificar la imagen como JPEG, lo que elimina los metadatos EXIF (incluida la ubicación GPS) y cualquier contenido ajeno a la imagen;
   - guarda una versión de hasta 1920 px y una miniatura de 480 px con nombres aleatorios en un volumen de Docker (`medios`), fuera de la carpeta pública de Nginx;
   - sirve las imágenes solo por la API, con el mismo control de acceso de la orden (un técnico no ve fotos de órdenes ajenas).

   Las fotos son evidencia: no se editan ni se borran, y cada carga queda en la auditoría. La etapa (recepción, diagnóstico, reparación o entrega) se deduce del estado de la orden. Las fotos de recepción y un código QR con el enlace a la orden se imprimen en el comprobante de recepción.
2. **Videotutoriales (RF-34).** Videos cortos por tarea, grabados con Playwright sobre el sistema real, en WebM y MP4, con subtítulos WebVTT y portada, servidos como archivos estáticos por Nginx. La sección de ayuda muestra solo los videos de lo que el rol puede hacer.
3. **Identidad visual y movimiento.** Marca propia en SVG, ilustraciones vectoriales en el ingreso y en los estados vacíos, y animaciones con propósito (avance de la orden, alertas de stock), todas desactivadas cuando el usuario pide reducir el movimiento.

## Alternativas consideradas

- Guardar las imágenes en PostgreSQL (`bytea`): simplifica el respaldo, pero aumenta el tamaño de la base y de cada copia, y pasa cada imagen por el ORM. Para un taller con pocas fotos por orden, el sistema de archivos es más simple y eficiente.
- Almacenamiento en la nube (S3 u otro): agrega costo, credenciales y dependencia de internet, contrario a ADR-004.
- Servir las fotos directamente con Nginx desde una carpeta pública: más rápido, pero cualquiera con la URL las vería; las fotos contienen datos de clientes (Ley 1581 de 2012).
- Videos en una plataforma externa (YouTube): requiere internet en el taller y saca el contenido del sistema.

## Consecuencias

- El respaldo del sistema ahora incluye dos partes: la base de datos (`pg_dump`) y el volumen de fotos (ver README).
- Cada foto ocupa en promedio entre 150 y 400 KB después de procesarla; con el límite de 12 fotos por orden, 1000 órdenes con fotos ocupan del orden de 2 a 5 GB.
- La política de permisos del navegador permite la cámara solo al propio sitio (`camera=(self)`). La cámara web requiere HTTPS o `localhost`.
- Se agrega una dependencia de producción (Pillow) que se revisa con pip-audit.
