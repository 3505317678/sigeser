import { useState, type KeyboardEvent, type ReactNode } from 'react'
import type { OrdenDetalle } from '../../api/tipos'
import { Icono, Insignia } from '../../componentes/ui'
import { PARTES, partesSospechosas, tipoDiagrama, type TipoDiagrama } from '../../dominio/partes'

/**
 * Diagrama interactivo de partes del equipo (RF-36). Es un SVG con una vista externa y otra de componentes
 * internos: cada parte se puede seleccionar con el ratón, el tacto o el teclado, y las partes relacionadas con
 * la falla reportada o el diagnóstico se resaltan con una animación.
 */

/** Dibujo de cada parte (coordenadas del viewBox 0 0 400 300). */
const FORMAS: Record<TipoDiagrama, Record<string, ReactNode>> = {
  portatil: {
    pantalla: <rect x={92} y={32} width={216} height={126} rx={4} />,
    camara: <circle cx={200} cy={25} r={5} />,
    bisagras: (
      <>
        <rect x={108} y={164} width={34} height={10} rx={3} />
        <rect x={258} y={164} width={34} height={10} rx={3} />
      </>
    ),
    teclado: <polygon points="88,184 312,184 322,214 78,214" />,
    touchpad: <rect x={165} y={221} width={70} height={22} rx={4} />,
    puertos: (
      <>
        <rect x={36} y={228} width={16} height={10} rx={2} />
        <rect x={348} y={228} width={16} height={10} rx={2} />
      </>
    ),
    ventilador: <circle cx={94} cy={204} r={17} />,
    placa: <rect x={120} y={183} width={118} height={42} rx={3} />,
    ram: (
      <>
        <rect x={246} y={183} width={34} height={16} rx={2} />
        <rect x={246} y={203} width={34} height={16} rx={2} />
      </>
    ),
    disco: <rect x={288} y={183} width={36} height={38} rx={3} />,
    bateria: <rect x={80} y={229} width={240} height={17} rx={3} />,
  },
  celular: {
    pantalla: <rect x={153} y={30} width={94} height={240} rx={8} />,
    camara_frontal: <circle cx={200} cy={39} r={5} />,
    botones: (
      <>
        <rect x={255} y={80} width={5} height={26} rx={2} />
        <rect x={255} y={116} width={5} height={42} rx={2} />
      </>
    ),
    puerto: <rect x={185} y={276} width={30} height={7} rx={3} />,
    altavoz: (
      <>
        <rect x={185} y={20} width={30} height={4} rx={2} />
        <rect x={160} y={277} width={18} height={5} rx={2} />
      </>
    ),
    placa: <rect x={160} y={30} width={80} height={72} rx={6} />,
    camara_trasera: <rect x={166} y={36} width={32} height={44} rx={10} />,
    bateria: <rect x={160} y={110} width={80} height={150} rx={8} />,
  },
}

/** Contorno del equipo, que no es seleccionable. */
const CUERPO: Record<TipoDiagrama, ReactNode> = {
  portatil: (
    <>
      <rect x={80} y={18} width={240} height={150} rx={10} />
      <polygon points="58,174 342,174 372,252 28,252" />
    </>
  ),
  celular: <rect x={145} y={14} width={110} height={272} rx={20} />,
}

export function DiagramaEquipo({ orden }: { orden: OrdenDetalle }) {
  const tipo = tipoDiagrama(orden.equipo_resumen ?? '')
  const [interna, setInterna] = useState(false)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  if (!tipo) return null

  const sospechosas = partesSospechosas(tipo, orden.falla_reportada, orden.diagnostico?.descripcion, orden.diagnostico?.causa_probable)
  const visibles = PARTES[tipo].filter((p) => p.interna === interna)
  const parte = PARTES[tipo].find((p) => p.id === seleccion) ?? null

  const elegir = (id: string) => setSeleccion((actual) => (actual === id ? null : id))
  const conTeclado = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      elegir(id)
    }
  }

  return (
    <section className="panel" aria-labelledby="t-diagrama">
      <div className="panel__cabecera">
        <h2 id="t-diagrama">Diagrama del equipo</h2>
        <div className="segmentado" role="group" aria-label="Vista del diagrama">
          <button type="button" aria-pressed={!interna} onClick={() => { setInterna(false); setSeleccion(null) }}>
            Vista externa
          </button>
          <button type="button" aria-pressed={interna} onClick={() => { setInterna(true); setSeleccion(null) }}>
            Componentes internos
          </button>
        </div>
      </div>
      <div className="panel__cuerpo diagrama">
        <svg viewBox="0 0 400 300" className={`diagrama__svg${interna ? ' diagrama__svg--interna' : ''}`} role="group" aria-label={`Partes del equipo, ${interna ? 'componentes internos' : 'vista externa'}`}>
          <g className="diagrama__cuerpo">{CUERPO[tipo]}</g>
          {visibles.map((p) => (
            <g
              key={p.id}
              className={`parte${sospechosas.has(p.id) ? ' parte--sospechosa' : ''}${seleccion === p.id ? ' parte--activa' : ''}`}
              tabIndex={0}
              role="button"
              aria-pressed={seleccion === p.id}
              aria-label={`${p.nombre}${sospechosas.has(p.id) ? ', posible falla' : ''}`}
              onClick={() => elegir(p.id)}
              onKeyDown={conTeclado(p.id)}
            >
              <title>{p.nombre}</title>
              {FORMAS[tipo][p.id]}
            </g>
          ))}
        </svg>

        <div className="diagrama__info" aria-live="polite">
          {parte ? (
            <>
              <strong className="diagrama__nombre">{parte.nombre}</strong>
              {sospechosas.has(parte.id) && (
                <Insignia tono="aviso">
                  <Icono nombre="exclamation-triangle" /> Relacionada con la falla reportada
                </Insignia>
              )}
              <p className="texto-2">{parte.descripcion}</p>
              <span className="pequeno texto-3">Fallas frecuentes</span>
              <ul className="diagrama__fallas">
                {parte.fallas.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <strong>Seleccione una parte</strong>
              <p className="texto-2 pequeno">
                Las partes resaltadas en ámbar coinciden con la falla reportada{orden.diagnostico ? ' o el diagnóstico' : ''}.
              </p>
              <ul className="diagrama__leyenda">
                {PARTES[tipo]
                  .filter((p) => sospechosas.has(p.id))
                  .map((p) => (
                    <li key={p.id}>
                      <button type="button" className="diagrama__enlace" onClick={() => { setInterna(p.interna); setSeleccion(p.id) }}>
                        {p.nombre}
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
