import { useEffect, useRef } from 'react'
import type { EstadoOrden } from '../../api/tipos'
import { PASOS_RIEL, pasoDelRiel } from '../../dominio/ordenes'
import { lanzarConfeti } from '../../util/celebracion'

/** Estados que se celebran cuando la orden llega a ellos mientras el usuario la está viendo. */
const ESTADOS_META: EstadoOrden[] = ['LISTA_PARA_ENTREGA', 'ENTREGADA']

function porcentajeAvance(estado: EstadoOrden): number {
  if (estado === 'ENTREGADA') return 100
  const paso = Math.max(0, pasoDelRiel(estado))
  return Math.round((paso / (PASOS_RIEL.length - 1)) * 100)
}

/**
 * Barra animada del avance de la reparación. Cuando la orden cambia a «Lista para entrega» o «Entregada»
 * en la pantalla abierta, lanza la celebración. No celebra al abrir una orden que ya estaba en ese estado.
 */
export function ProgresoOrden({ estado }: { estado: EstadoOrden }) {
  const estadoAnterior = useRef(estado)
  const porcentaje = porcentajeAvance(estado)

  useEffect(() => {
    if (estadoAnterior.current !== estado && ESTADOS_META.includes(estado)) lanzarConfeti()
    estadoAnterior.current = estado
  }, [estado])

  return (
    <div className="progreso">
      <div className="progreso__texto">
        <span>Avance de la reparación</span>
        <strong>{porcentaje} %</strong>
      </div>
      <div
        className={`progreso__pista${estado === 'EN_ESPERA_REPUESTOS' ? ' progreso__pista--pausa' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
        aria-label="Avance de la reparación"
      >
        <div className="progreso__barra" style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  )
}
