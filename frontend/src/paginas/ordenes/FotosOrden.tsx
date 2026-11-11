import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Foto, OrdenDetalle } from '../../api/tipos'
import { Dialogo } from '../../componentes/Dialogo'
import { useNotificar } from '../../componentes/Notificaciones'
import { SelectorFotos } from '../../componentes/SelectorFotos'
import { ComparadorFotos } from './ComparadorFotos'
import { FOTOS_MAXIMO_POR_ORDEN, subirFotos, type FotoElegida } from '../../dominio/fotos'
import { Aviso, Boton, Icono, mensajeError } from '../../componentes/ui'
import { formatoFechaHora } from '../../util/formato'

/** Panel de evidencia fotográfica de la orden (RF-33): galería por etapa, carga y visor ampliado. */
export function FotosOrden({ orden }: { orden: OrdenDetalle }) {
  const [subiendo, setSubiendo] = useState(false)
  const [visor, setVisor] = useState<number | null>(null)
  const puedeSubir = orden.acciones.includes('subir_foto')
  const fotos = orden.fotos
  const lleno = fotos.length >= FOTOS_MAXIMO_POR_ORDEN

  return (
    <section className="panel" aria-labelledby="t-fotos">
      <div className="panel__cabecera">
        <h2 id="t-fotos">Fotos del equipo</h2>
        {puedeSubir && (
          <Boton pequeno icono="camera" onClick={() => setSubiendo(true)} disabled={lleno} title={lleno ? 'La orden tiene el máximo de fotos.' : undefined}>
            Agregar fotos
          </Boton>
        )}
      </div>
      {fotos.length === 0 ? (
        <div className="vacio vacio--ilustrado">
          <IlustracionFotos />
          <strong>Aún no hay fotos</strong>
          <p className="texto-2">
            {puedeSubir
              ? 'Fotografíe el equipo al recibirlo: los rayones, golpes y accesorios quedan como evidencia ante cualquier reclamo.'
              : 'Las fotos que tomen la recepción y el técnico aparecerán aquí.'}
          </p>
        </div>
      ) : (
        <ul className="galeria panel__cuerpo" aria-label={`${fotos.length} fotos`}>
          {fotos.map((f, i) => (
            <li key={f.id} className="aparecer" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <button type="button" className="galeria__foto" onClick={() => setVisor(i)} aria-label={`Ampliar foto ${i + 1}: ${f.descripcion || f.etapa_nombre}`}>
                <img src={f.url_miniatura} alt="" loading="lazy" width={240} height={180} />
                <span className={`galeria__etapa etapa-${f.etapa}`}>{f.etapa_nombre}</span>
              </button>
              {f.descripcion && <span className="pequeno texto-2 galeria__texto">{f.descripcion}</span>}
            </li>
          ))}
        </ul>
      )}
      <ComparadorFotos fotos={fotos} />
      {subiendo && <DialogoSubirFotos orden={orden} alCerrar={() => setSubiendo(false)} />}
      {visor !== null && <VisorFotos fotos={fotos} inicial={visor} alCerrar={() => setVisor(null)} />}
    </section>
  )
}

function DialogoSubirFotos({ orden, alCerrar }: { orden: OrdenDetalle; alCerrar: () => void }) {
  const [fotos, setFotos] = useState<FotoElegida[]>([])
  const [avance, setAvance] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cola = useQueryClient()
  const notificar = useNotificar()
  const cupo = FOTOS_MAXIMO_POR_ORDEN - orden.fotos.length

  const enviar = async () => {
    if (fotos.length === 0) return setError('Elija o tome al menos una foto.')
    setError(null)
    setAvance(0)
    const resultado = await subirFotos(orden.id, fotos, setAvance)
    cola.invalidateQueries({ queryKey: ['orden', orden.id] })
    setAvance(null)
    if (resultado.error) {
      setFotos(fotos.slice(resultado.subidas))
      setError(`${resultado.subidas > 0 ? `Se guardaron ${resultado.subidas} foto(s). ` : ''}${mensajeError(resultado.error)}`)
      return
    }
    notificar(resultado.subidas === 1 ? 'Foto guardada en la orden.' : `${resultado.subidas} fotos guardadas en la orden.`)
    alCerrar()
  }

  return (
    <Dialogo
      abierto
      ancho
      titulo={`Agregar fotos a ${orden.codigo}`}
      descripcion="Las fotos quedan como evidencia: no se pueden editar ni borrar. Se eliminan los datos de ubicación del teléfono."
      alCerrar={alCerrar}
      alEnviar={enviar}
      textoEnviar={avance === null ? 'Guardar fotos' : `Subiendo ${Math.min(avance + 1, fotos.length)} de ${fotos.length}…`}
      enviando={avance !== null}
    >
      <div className="formulario">
        <SelectorFotos fotos={fotos} alCambiar={setFotos} maximo={cupo} />
        {fotos.length > 0 && (
          <p className="pequeno texto-3">
            Describa cada foto si muestra algo puntual, por ejemplo «Rayón en la tapa» o «Condensador inflado en la placa».
          </p>
        )}
        {avance !== null && (
          <progress className="progreso" max={fotos.length} value={avance} aria-label="Avance de la carga">
            {avance} de {fotos.length}
          </progress>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  )
}

/** Visor ampliado con navegación por teclado (← →) y por botones. */
function VisorFotos({ fotos, inicial, alCerrar }: { fotos: Foto[]; inicial: number; alCerrar: () => void }) {
  const [i, setI] = useState(inicial)
  const foto = fotos[i]
  const mover = useCallback((paso: number) => setI((actual) => (actual + paso + fotos.length) % fotos.length), [fotos.length])

  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowRight') mover(1)
      if (ev.key === 'ArrowLeft') mover(-1)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [mover])

  return (
    <Dialogo
      abierto
      ancho
      titulo={`Foto ${i + 1} de ${fotos.length}`}
      descripcion={`${foto.etapa_nombre}${foto.descripcion ? `: ${foto.descripcion}` : ''}`}
      alCerrar={alCerrar}
      pie={
        <div className="visor__pie">
          <span className="pequeno texto-2">
            <Icono nombre="person" /> {foto.subida_por_nombre}, {formatoFechaHora(foto.fecha)} · {foto.ancho} × {foto.alto} px
          </span>
          <div className="fila">
            <Boton icono="chevron-left" onClick={() => mover(-1)} disabled={fotos.length < 2} aria-label="Foto anterior" />
            <Boton icono="chevron-right" onClick={() => mover(1)} disabled={fotos.length < 2} aria-label="Foto siguiente" />
            <Boton onClick={alCerrar}>Cerrar</Boton>
          </div>
        </div>
      }
    >
      <figure className="visor" key={foto.id}>
        <img src={foto.url} alt={foto.descripcion || `Foto del equipo en la etapa ${foto.etapa_nombre}`} width={foto.ancho} height={foto.alto} />
      </figure>
    </Dialogo>
  )
}

/** Ilustración vectorial propia del estado vacío: cámara sobre la mesa del taller. */
function IlustracionFotos() {
  return (
    <svg className="ilustracion" viewBox="0 0 160 110" aria-hidden="true">
      <rect x="10" y="88" width="140" height="8" rx="4" fill="var(--c-base-100)" />
      <rect x="38" y="34" width="84" height="54" rx="10" fill="var(--c-base-700)" />
      <rect x="58" y="26" width="30" height="12" rx="4" fill="var(--c-base-800)" />
      <circle cx="80" cy="61" r="19" fill="var(--c-base-50)" />
      <circle cx="80" cy="61" r="13" fill="var(--c-base-600)" />
      <circle cx="75" cy="56" r="4" fill="var(--c-base-50)" opacity="0.8" />
      <rect x="104" y="42" width="10" height="6" rx="2" fill="var(--c-senal)" />
      <path d="M128 22 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4z" fill="var(--c-senal)" className="ilustracion__brillo" />
    </svg>
  )
}
