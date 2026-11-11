/**
 * Catálogo de videotutoriales (RF-34). Cada video tiene subtítulos en WebVTT y se muestra solo a los roles
 * que pueden hacer lo que enseña. Los videos se graban con Playwright sobre el sistema real (pruebas-e2e).
 */
export interface Tutorial {
  id: string
  titulo: string
  descripcion: string
  rol: string
  /** El usuario ve el tutorial si tiene alguno de estos permisos; vacío significa todos. */
  permisos: string[]
  duracion: string
  pasos: string[]
}

export const RUTA_TUTORIALES = '/tutoriales'

export const TUTORIALES: Tutorial[] = [
  {
    id: 'primeros-pasos',
    titulo: 'Primeros pasos en SIGESER',
    descripcion: 'Cómo ingresar, moverse por el menú, cambiar la contraseña y cerrar la sesión.',
    rol: 'Todos los roles',
    permisos: [],
    duracion: '0:28',
    pasos: ['Ingrese con su correo y contraseña.', 'Use el menú lateral para cambiar de módulo.', 'Cambie su contraseña con el icono de llave.', 'Cierre la sesión al terminar.'],
  },
  {
    id: 'registrar-orden',
    titulo: 'Registrar una orden con fotos del equipo',
    descripcion: 'Buscar o registrar al cliente, elegir el equipo, describir la falla, tomar las fotos y entregar el comprobante con código QR.',
    rol: 'Recepción',
    permisos: ['ordenes.crear'],
    duracion: '0:39',
    pasos: ['Busque al cliente por documento o nombre.', 'Elija el equipo y describa la falla.', 'Tome o elija las fotos del estado físico.', 'Registre la orden y descargue el comprobante.'],
  },
  {
    id: 'diagnostico',
    titulo: 'Diagnosticar un equipo y registrar el presupuesto',
    descripcion: 'El técnico inicia el diagnóstico, documenta la falla con fotos y registra la solución y el costo.',
    rol: 'Técnico',
    permisos: ['reparacion.registrar'],
    duracion: '0:38',
    pasos: ['Abra la orden desde Mis órdenes.', 'Pulse Iniciar diagnóstico.', 'Agregue fotos de la falla.', 'Registre el diagnóstico con el presupuesto.'],
  },
  {
    id: 'reparacion',
    titulo: 'Reparar: actividades, repuestos y espera de repuestos',
    descripcion: 'Registrar el trabajo, usar repuestos del inventario y poner la orden en espera cuando falta una pieza.',
    rol: 'Técnico',
    permisos: ['reparacion.registrar'],
    duracion: '0:40',
    pasos: ['Registre cada actividad con sus horas.', 'Agregue los repuestos usados.', 'Si falta una pieza, pulse Esperar repuestos.', 'Envíe la orden a verificación.'],
  },
  {
    id: 'entrega',
    titulo: 'Aprobación del cliente y entrega del equipo',
    descripcion: 'Registrar la respuesta del cliente al presupuesto y entregar el equipo con su comprobante.',
    rol: 'Recepción',
    permisos: ['ordenes.aprobacion', 'ordenes.entregar'],
    duracion: '0:29',
    pasos: ['Registre si el cliente aprueba el presupuesto.', 'Cuando la orden esté lista, pulse Entregar equipo.', 'Escriba quién recibe y descargue el comprobante de entrega.'],
  },
  {
    id: 'inventario',
    titulo: 'Inventario: entradas, ajustes y kardex',
    descripcion: 'Registrar la compra de repuestos, corregir el stock con un ajuste y consultar el kardex.',
    rol: 'Administración',
    permisos: ['inventario.gestionar'],
    duracion: '0:26',
    pasos: ['Abra el repuesto en Inventario.', 'Registre una entrada con el número de factura.', 'Use Ajuste con un número negativo para retirar unidades.', 'Revise el kardex del repuesto.'],
  },
  {
    id: 'reportes',
    titulo: 'Panel, reportes y auditoría',
    descripcion: 'Leer el panel del taller, generar el reporte de un periodo y consultar quién hizo cada cambio.',
    rol: 'Administración',
    permisos: ['reportes.ver', 'auditoria.ver'],
    duracion: '0:19',
    pasos: ['Revise el panel al iniciar el día.', 'Genere el reporte del periodo y expórtelo.', 'Consulte la auditoría por usuario o acción.'],
  },
]
