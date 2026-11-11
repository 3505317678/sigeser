import type { Accion, EstadoOrden, Prioridad } from '../api/tipos'

export const NOMBRE_ESTADO: Record<EstadoOrden, string> = {
  RECIBIDA: 'Recibida',
  EN_DIAGNOSTICO: 'En diagnóstico',
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
  EN_ESPERA_REPUESTOS: 'En espera de repuestos',
  EN_REPARACION: 'En reparación',
  EN_VERIFICACION: 'En verificación',
  LISTA_PARA_ENTREGA: 'Lista para entrega',
  ENTREGADA: 'Entregada',
  CANCELADA: 'Cancelada',
}

/** Orden en que se muestran los estados activos en el tablero y en los filtros. */
export const ESTADOS_ACTIVOS: EstadoOrden[] = [
  'RECIBIDA',
  'EN_DIAGNOSTICO',
  'PENDIENTE_APROBACION',
  'EN_ESPERA_REPUESTOS',
  'EN_REPARACION',
  'EN_VERIFICACION',
  'LISTA_PARA_ENTREGA',
]

export const ESTADOS_FINALES: EstadoOrden[] = ['ENTREGADA', 'CANCELADA']

/**
 * Pasos del flujo principal (Tabla 13). La espera de repuestos es un desvío de la reparación,
 * por eso en el riel se representa sobre el paso "En reparación".
 */
export const PASOS_RIEL: { estado: EstadoOrden; nombre: string }[] = [
  { estado: 'RECIBIDA', nombre: 'Recibida' },
  { estado: 'EN_DIAGNOSTICO', nombre: 'Diagnóstico' },
  { estado: 'PENDIENTE_APROBACION', nombre: 'Aprobación' },
  { estado: 'EN_REPARACION', nombre: 'Reparación' },
  { estado: 'EN_VERIFICACION', nombre: 'Verificación' },
  { estado: 'LISTA_PARA_ENTREGA', nombre: 'Lista' },
  { estado: 'ENTREGADA', nombre: 'Entregada' },
]

export function pasoDelRiel(estado: EstadoOrden): number {
  if (estado === 'EN_ESPERA_REPUESTOS') return PASOS_RIEL.findIndex((p) => p.estado === 'EN_REPARACION')
  return PASOS_RIEL.findIndex((p) => p.estado === estado)
}

export const NOMBRE_PRIORIDAD: Record<Prioridad, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta' }

export interface DefinicionAccion {
  etiqueta: string
  icono: string
  /** Las acciones de avance se muestran destacadas; las de gestión, como secundarias. */
  tipo: 'avance' | 'gestion' | 'peligro'
}

export const ACCIONES: Record<Accion, DefinicionAccion> = {
  iniciar_diagnostico: { etiqueta: 'Iniciar diagnóstico', icono: 'play-circle', tipo: 'avance' },
  registrar_diagnostico: { etiqueta: 'Registrar diagnóstico', icono: 'clipboard2-pulse', tipo: 'avance' },
  registrar_aprobacion: { etiqueta: 'Registrar respuesta del cliente', icono: 'person-check', tipo: 'avance' },
  registrar_actividad: { etiqueta: 'Registrar actividad', icono: 'tools', tipo: 'avance' },
  agregar_repuesto: { etiqueta: 'Agregar repuesto', icono: 'cpu', tipo: 'avance' },
  enviar_verificacion: { etiqueta: 'Enviar a verificación', icono: 'send-check', tipo: 'avance' },
  verificar: { etiqueta: 'Registrar verificación', icono: 'patch-check', tipo: 'avance' },
  reanudar: { etiqueta: 'Reanudar reparación', icono: 'arrow-repeat', tipo: 'avance' },
  registrar_entrega: { etiqueta: 'Entregar equipo', icono: 'box-arrow-right', tipo: 'avance' },
  poner_en_espera: { etiqueta: 'Esperar repuestos', icono: 'hourglass-split', tipo: 'gestion' },
  asignar_tecnico: { etiqueta: 'Asignar técnico', icono: 'person-gear', tipo: 'gestion' },
  cancelar: { etiqueta: 'Cancelar orden', icono: 'x-octagon', tipo: 'peligro' },
}

export const ORDEN_ACCIONES = Object.keys(ACCIONES) as Accion[]
