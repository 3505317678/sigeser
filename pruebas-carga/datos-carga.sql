
BEGIN;

-- Clientes y equipos adicionales
WITH nombres AS (
  SELECT ARRAY['María','José','Luis','Ana','Carlos','Diana','Jorge','Paola','Andrés','Sandra','Camilo','Natalia',
               'Óscar','Juliana','Ricardo','Valentina','Héctor','Claudia','Felipe','Laura'] AS n,
         ARRAY['Gómez','Rodríguez','Martínez','Herrera','Castillo','Ramírez','Moreno','Ruiz','Torres','Vargas',
               'Suárez','Ortiz','Rojas','Mejía','Gutiérrez','Peña','Cárdenas','Díaz','Ospina','Beltrán'] AS a
)
INSERT INTO clientes (tipo_documento, numero_documento, nombre, telefono, correo, direccion, autoriza_datos,
                      fecha_autorizacion, activo, creado_en)
SELECT 'CC', (52000000 + g)::text,
       n[1 + (g % 20)] || ' ' || a[1 + ((g / 20) % 20)] || ' ' || a[1 + ((g * 7) % 20)],
       '31' || lpad(((g * 7919) % 100000000)::text, 8, '0'), '', 'Villavicencio', true, now(), true,
       now() - make_interval(days => 730 - (g % 700))
FROM nombres, generate_series(1, 480) AS g;

INSERT INTO equipos (cliente_id, tipo, marca, modelo, serial, descripcion, creado_en)
SELECT c.id,
       (ARRAY['Portátil','Celular','Impresora','Tableta','Computador de escritorio'])[1 + (c.id % 5)],
       (ARRAY['Lenovo','Samsung','HP','Apple','Dell','Xiaomi','Epson','Asus'])[1 + (c.id % 8)],
       'Modelo ' || (c.id % 37), 'SC' || lpad(c.id::text, 8, '0'), '', c.creado_en
FROM clientes c
WHERE NOT EXISTS (SELECT 1 FROM equipos e WHERE e.cliente_id = c.id);

-- Órdenes históricas hasta completar 10 000
CREATE TEMP TABLE _ref AS
SELECT (SELECT array_agg(id ORDER BY id) FROM equipos) AS equipos,
       (SELECT array_agg(cliente_id ORDER BY id) FROM equipos) AS clientes,
       (SELECT array_agg(id ORDER BY id) FROM tecnicos) AS tecnicos,
       (SELECT id FROM usuarios WHERE correo = 'recepcion@sigeser.local') AS recepcion,
       (SELECT 10000 - count(*) FROM ordenes_servicio) AS faltan;

CREATE TEMP TABLE _nuevas AS
SELECT g,
       1 + floor(random() * array_length(r.equipos, 1))::int AS i_eq,
       1 + floor(random() * array_length(r.tecnicos, 1))::int AS i_tec,
       now() - make_interval(days => 15 + floor(random() * 715)::int, hours => floor(random() * 9)::int) AS recepcion,
       CASE WHEN random() < 0.96 THEN 'ENTREGADA' ELSE 'CANCELADA' END AS estado
FROM _ref r, generate_series(1, (SELECT faltan FROM _ref)) AS g;

INSERT INTO ordenes_servicio (codigo, estado, prioridad, falla_reportada, accesorios, estado_fisico, fecha_recepcion,
                              fecha_estimada_entrega, costo_mano_obra, fecha_entrega, recibido_por, motivo_cancelacion,
                              cliente_id, equipo_id, tecnico_id)
SELECT 'OS-' || extract(year FROM n.recepcion)::int || '-' || lpad((90000 + n.g)::text, 5, '0'),
       n.estado,
       (ARRAY['BAJA','MEDIA','MEDIA','ALTA'])[1 + (n.g % 4)],
       (ARRAY['No enciende','Pantalla rota','No carga','Se calienta y se apaga','Muy lento','Atasca el papel'])[1 + (n.g % 6)],
       'Ninguno', 'Buen estado', n.recepcion, (n.recepcion + interval '4 days')::date,
       CASE WHEN n.estado = 'ENTREGADA' THEN (40000 + (n.g % 9) * 10000) ELSE 0 END,
       CASE WHEN n.estado = 'ENTREGADA' THEN n.recepcion + make_interval(hours => (20 + (n.g % 140))::int) END,
       CASE WHEN n.estado = 'ENTREGADA' THEN 'Titular del equipo' ELSE '' END,
       CASE WHEN n.estado = 'CANCELADA' THEN 'El cliente retiró el equipo' ELSE '' END,
       r.clientes[n.i_eq], r.equipos[n.i_eq], r.tecnicos[n.i_tec]
FROM _nuevas n, _ref r;

-- Historial: recepción y estado final de cada orden sintética
INSERT INTO historial_estados (estado_anterior, estado_nuevo, observacion, fecha, usuario_id, orden_id)
SELECT '', 'RECIBIDA', 'Equipo recibido', o.fecha_recepcion, r.recepcion, o.id
FROM ordenes_servicio o, _ref r WHERE o.codigo ~ '^OS-\d{4}-9\d{4}$';

INSERT INTO historial_estados (estado_anterior, estado_nuevo, observacion, fecha, usuario_id, orden_id)
SELECT CASE WHEN o.estado = 'ENTREGADA' THEN 'LISTA_PARA_ENTREGA' ELSE 'RECIBIDA' END, o.estado, '',
       COALESCE(o.fecha_entrega, o.fecha_recepcion + interval '3 hours'), r.recepcion, o.id
FROM ordenes_servicio o, _ref r WHERE o.codigo ~ '^OS-\d{4}-9\d{4}$';

-- Repuestos usados en 6 de cada 10 órdenes entregadas (al precio vigente del catálogo)
INSERT INTO repuestos_orden (cantidad, precio_unitario, fecha, orden_id, repuesto_id)
SELECT 1 + (o.id % 2), p.precio_unitario, o.fecha_recepcion + interval '1 day', o.id, p.id
FROM ordenes_servicio o
JOIN LATERAL (SELECT id, precio_unitario FROM repuestos ORDER BY (id * 31 + o.id) % 97 LIMIT 1) p ON true
WHERE o.codigo ~ '^OS-\d{4}-9\d{4}$' AND o.estado = 'ENTREGADA' AND o.id % 10 < 6;

COMMIT;

ANALYZE;

SELECT (SELECT count(*) FROM ordenes_servicio) AS ordenes, (SELECT count(*) FROM clientes) AS clientes,
       (SELECT count(*) FROM historial_estados) AS historial, (SELECT count(*) FROM repuestos_orden) AS repuestos_usados;
