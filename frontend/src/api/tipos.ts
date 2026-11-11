/**
 * Tipos de la API. Los modelos se derivan del contrato OpenAPI generado por el backend
 * (npm run tipos), así el frontend y la API no se desincronizan en silencio.
 */
import type { components } from './esquema'

type S = components['schemas']

export type EstadoOrden = S['EstadoOrdenEnum']
export type Prioridad = S['PrioridadEnum']
export type TipoDocumento = S['TipoDocumentoEnum']
export type Perfil = S['Perfil']
export type OrdenLista = S['OrdenLista']
export type Historial = S['Historial']
export type Actividad = S['Actividad']
export type RepuestoUtilizado = S['RepuestoUtilizado']
export type Cliente = S['Cliente']
export type ClienteLista = S['ClienteLista']
export type Equipo = S['Equipo']
export type Repuesto = S['Repuesto']
export type Tecnico = S['Tecnico']
export type Usuario = S['Usuario']
export type Rol = S['Rol']
export type Permiso = S['Permiso']
export type RegistroAuditoria = S['RegistroAuditoria']
export type Foto = S['Foto']

export interface Diagnostico {
  id: number
  tecnico: number
  tecnico_nombre: string
  descripcion: string
  causa_probable: string
  solucion_propuesta: string
  costo_estimado: string
  aprobado: boolean | null
  fecha_respuesta: string | null
  fecha: string
}

export type Accion =
  | 'asignar_tecnico'
  | 'iniciar_diagnostico'
  | 'registrar_diagnostico'
  | 'registrar_aprobacion'
  | 'registrar_actividad'
  | 'agregar_repuesto'
  | 'poner_en_espera'
  | 'enviar_verificacion'
  | 'reanudar'
  | 'verificar'
  | 'registrar_entrega'
  | 'cancelar'

/** Nota de voz o grabación del sonido del equipo (RF-37). */
export interface NotaVoz {
  id: number
  etapa: Foto['etapa']
  etapa_nombre: string
  descripcion: string
  tipo_mime: string
  duracion_ms: number
  tamano_bytes: number
  fecha: string
  grabada_por_nombre: string
  url: string
}

export type OrdenDetalle = Omit<S['OrdenDetalle'], 'diagnostico' | 'acciones'> & {
  diagnostico: Diagnostico | null
  /** 'subir_foto' y 'grabar_nota_voz' no son pasos del flujo: habilitan la evidencia multimedia. */
  acciones: (Accion | 'subir_foto' | 'grabar_nota_voz')[]
  notas_voz: NotaVoz[]
}

export interface Movimiento {
  id: number
  repuesto: number
  repuesto_nombre: string
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'DEVOLUCION'
  cantidad: number
  stock_resultante: number
  motivo: string
  fecha: string
  usuario_nombre: string
  orden_codigo: string | null
}

export interface Paginado<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Dashboard {
  ordenes_activas: number
  por_estado: { estado: EstadoOrden; nombre: string; total: number }[]
  vencidas_total: number
  vencidas: { id: number; codigo: string; cliente: string; fecha_estimada_entrega: string; estado: EstadoOrden }[]
  entregadas_mes: number
  ingresos_mes: string
  carga_tecnicos: { id: number; nombre: string; activas: number; en_reparacion: number; disponible: boolean }[]
  alertas_stock: { id: number; codigo: string; nombre: string; stock_actual: number; stock_minimo: number }[]
}

export interface ReportePeriodo {
  desde: string
  hasta: string
  recibidas: number
  entregadas: number
  canceladas: number
  tiempo_promedio_horas: number | null
  ingresos_mano_obra: string
  ingresos_repuestos: string
  ingresos_total: string
  repuestos_mas_usados: { codigo: string; nombre: string; cantidad: number; valor: string }[]
  por_tecnico: { tecnico: string; entregadas: number }[]
  serie_diaria: { fecha: string; recibidas: number; entregadas: number }[]
  detalle_entregadas: {
    codigo: string
    cliente: string
    tecnico: string
    fecha_recepcion: string
    fecha_entrega: string
    mano_obra: string
    repuestos: string
    total: string
  }[]
}
