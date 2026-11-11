import {
  cloneElement,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { EstadoOrden, Prioridad } from '../api/tipos'
import { ErrorApi } from '../api/cliente'
import { NOMBRE_ESTADO, NOMBRE_PRIORIDAD } from '../dominio/ordenes'
import { formatoFecha } from '../util/formato'

export function Icono({ nombre, etiqueta }: { nombre: string; etiqueta?: string }) {
  return etiqueta ? (
    <i className={`bi bi-${nombre}`} role="img" aria-label={etiqueta} />
  ) : (
    <i className={`bi bi-${nombre}`} aria-hidden="true" />
  )
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'peligro-solido' | 'fantasma'

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  icono?: string
  cargando?: boolean
  pequeno?: boolean
  bloque?: boolean
}

export function Boton({
  variante = 'secundario',
  icono,
  cargando = false,
  pequeno = false,
  bloque = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...resto
}: BotonProps) {
  const clases = [
    'boton',
    `boton--${variante}`,
    pequeno && 'boton--pequeno',
    bloque && 'boton--bloque',
    !children && 'boton--icono',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={clases} disabled={disabled || cargando} aria-busy={cargando || undefined} {...resto}>
      {cargando ? <span className="giro" aria-hidden="true" /> : icono && <Icono nombre={icono} />}
      {children}
    </button>
  )
}

interface CampoProps {
  etiqueta: string
  error?: string
  ayuda?: string
  obligatorio?: boolean
  children: ReactElement<Record<string, unknown>>
}

/** Envuelve un control y le asocia etiqueta, ayuda y error accesibles (aria-describedby / aria-invalid). */
export function Campo({ etiqueta, error, ayuda, obligatorio, children }: CampoProps) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const describe = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describe,
        required: obligatorio,
      })
    : children
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
        {obligatorio && (
          <span className="campo__obligatorio" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {ayuda && (
        <span id={idAyuda} className="campo__ayuda">
          {ayuda}
        </span>
      )}
      {error && (
        <span id={idError} className="campo__error">
          <Icono nombre="exclamation-circle" />
          {error}
        </span>
      )}
    </div>
  )
}

export function InsigniaEstado({ estado }: { estado: EstadoOrden }) {
  return <span className={`insignia estado-${estado}`}>{NOMBRE_ESTADO[estado]}</span>
}

export function Insignia({ tono, children }: { tono: 'exito' | 'aviso' | 'error' | 'info' | 'neutro'; children: ReactNode }) {
  return <span className={`insignia tono-${tono}`}>{children}</span>
}

export function InsigniaPrioridad({ prioridad }: { prioridad: Prioridad }) {
  return (
    <span className={`prioridad prioridad--${prioridad}`}>
      {prioridad === 'ALTA' && <Icono nombre="exclamation-triangle-fill" />}
      {NOMBRE_PRIORIDAD[prioridad]}
    </span>
  )
}

export function FechaEstimada({ fecha, vencida }: { fecha?: string | null; vencida?: boolean }) {
  if (!fecha) return <span className="texto-3">Sin fecha</span>
  return vencida ? (
    <span className="vencida">
      <Icono nombre="alarm" />
      {formatoFecha(fecha)}
      <span className="solo-lector"> (vencida)</span>
    </span>
  ) : (
    <span>{formatoFecha(fecha)}</span>
  )
}

export function Encabezado({
  titulo,
  descripcion,
  acciones,
  migas,
}: {
  titulo: ReactNode
  descripcion?: ReactNode
  acciones?: ReactNode
  migas?: ReactNode
}) {
  return (
    <header className="encabezado">
      <div>
        {migas && <nav aria-label="Ruta de navegación" className="migas">{migas}</nav>}
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {acciones && <div className="encabezado__acciones">{acciones}</div>}
    </header>
  )
}

export function Vacio({ icono = 'inbox', titulo, children, accion }: { icono?: string; titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="vacio">
      <Icono nombre={icono} />
      <h3>{titulo}</h3>
      {children && <p>{children}</p>}
      {accion}
    </div>
  )
}

export function FilasCargando({ columnas, filas = 6 }: { columnas: number; filas?: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: columnas }, (_, j) => (
            <td key={j}>
              <span className="esqueleto" style={{ width: `${55 + ((i + j) % 4) * 10}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando-pagina" role="status">
      <span className="fila">
        <span className="giro" aria-hidden="true" />
        {texto}
      </span>
    </div>
  )
}

export function mensajeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.message
  return 'Ocurrió un error inesperado. Recargue la página e intente de nuevo.'
}

export function AvisoError({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  return (
    <div className="aviso aviso--error" role="alert">
      <Icono nombre="exclamation-octagon" />
      <div className="pila pila--compacta" style={{ flex: 1 }}>
        <p>{mensajeError(error)}</p>
        {reintentar && (
          <div>
            <Boton pequeno icono="arrow-clockwise" onClick={reintentar}>
              Intentar de nuevo
            </Boton>
          </div>
        )}
      </div>
    </div>
  )
}

export function Aviso({ tono, icono, children }: { tono: 'info' | 'aviso' | 'exito' | 'error'; icono?: string; children: ReactNode }) {
  const iconos = { info: 'info-circle', aviso: 'exclamation-triangle', exito: 'check-circle', error: 'exclamation-octagon' }
  return (
    <div className={`aviso aviso--${tono}`} role={tono === 'error' ? 'alert' : 'status'}>
      <Icono nombre={icono ?? iconos[tono]} />
      <div>{children}</div>
    </div>
  )
}

export function Paginacion({
  pagina,
  total,
  tamano,
  alCambiar,
}: {
  pagina: number
  total: number
  tamano: number
  alCambiar: (pagina: number) => void
}) {
  const paginas = Math.max(1, Math.ceil(total / tamano))
  if (total === 0) return null
  const desde = (pagina - 1) * tamano + 1
  const hasta = Math.min(pagina * tamano, total)
  return (
    <nav className="paginacion" aria-label="Paginación">
      <span>
        {desde}–{hasta} de {total}
      </span>
      <div className="paginacion__botones">
        <Boton pequeno icono="chevron-left" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
          Anterior
        </Boton>
        <Boton pequeno disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>
          Siguiente
          <Icono nombre="chevron-right" />
        </Boton>
      </div>
    </nav>
  )
}
