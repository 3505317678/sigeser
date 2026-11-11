import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icono } from './ui'

type Tono = 'exito' | 'error' | 'aviso'
interface Notificacion {
  id: number
  tono: Tono
  texto: string
}

interface ApiNotificaciones {
  notificar: (texto: string, tono?: Tono) => void
}

const Contexto = createContext<ApiNotificaciones | null>(null)
const DURACION_MS = 5000

export function ProveedorNotificaciones({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Notificacion[]>([])
  const siguiente = useRef(1)

  const cerrar = useCallback((id: number) => setLista((l) => l.filter((n) => n.id !== id)), [])

  const notificar = useCallback(
    (texto: string, tono: Tono = 'exito') => {
      const id = siguiente.current++
      setLista((l) => [...l.slice(-3), { id, tono, texto }])
      window.setTimeout(() => cerrar(id), tono === 'error' ? DURACION_MS * 2 : DURACION_MS)
    },
    [cerrar],
  )

  const valor = useMemo(() => ({ notificar }), [notificar])
  const iconos: Record<Tono, string> = { exito: 'check-circle-fill', error: 'x-circle-fill', aviso: 'exclamation-triangle-fill' }

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="notificaciones" aria-live="polite" aria-atomic="false">
        {lista.map((n) => (
          <div key={n.id} className={`notificacion notificacion--${n.tono}`} role={n.tono === 'error' ? 'alert' : 'status'}>
            <Icono nombre={iconos[n.tono]} />
            <p>{n.texto}</p>
            <button type="button" onClick={() => cerrar(n.id)} aria-label="Cerrar notificación">
              <Icono nombre="x-lg" />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  )
}

export function useNotificar() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useNotificar debe usarse dentro de ProveedorNotificaciones')
  return ctx.notificar
}
