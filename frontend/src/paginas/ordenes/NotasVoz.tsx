import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subirArchivo } from '../../api/cliente'
import type { NotaVoz, OrdenDetalle } from '../../api/tipos'
import { useNotificar } from '../../componentes/Notificaciones'
import { Boton, Icono, mensajeError } from '../../componentes/ui'
import { formatoFechaHora } from '../../util/formato'

/** Duración máxima de una nota (igual que AUDIOS_DURACION_MAXIMA_S en el backend). */
const DURACION_MAXIMA_S = 120
/** Formatos que admite el backend, en orden de preferencia; el navegador usa el primero que soporte. */
const FORMATOS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']

function mmss(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Notas de voz de la orden (RF-37): el técnico o la recepción graban una observación o el sonido anormal del
 * equipo con el micrófono. Mientras se graba se dibuja la onda de audio en vivo (Web Audio API, AnalyserNode).
 */
export function NotasVoz({ orden }: { orden: OrdenDetalle }) {
  const puedeGrabar = orden.acciones.includes('grabar_nota_voz')
  const notas = orden.notas_voz ?? []

  return (
    <section className="panel" aria-labelledby="t-notas-voz">
      <div className="panel__cabecera">
        <h2 id="t-notas-voz">Notas de voz y sonidos del equipo</h2>
      </div>
      <div className="panel__cuerpo pila">
        {puedeGrabar && <Grabadora ordenId={orden.id} />}
        {notas.length === 0 ? (
          <p className="texto-2 pequeno">
            Aún no hay grabaciones. Grabe una observación o acerque el micrófono al equipo para registrar ruidos del ventilador, el
            disco o las bisagras.
          </p>
        ) : (
          <ul className="notas-voz" aria-label={`${notas.length} notas de voz`}>
            {notas.map((n) => (
              <ItemNota key={n.id} nota={n} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function ItemNota({ nota }: { nota: NotaVoz }) {
  return (
    <li className="nota-voz aparecer">
      <div className="nota-voz__cabecera">
        <Icono nombre="mic-fill" />
        <strong>{nota.descripcion || 'Nota de voz'}</strong>
        <span className={`galeria__etapa etapa-${nota.etapa}`}>{nota.etapa_nombre}</span>
      </div>
      <audio controls preload="none" src={nota.url}>
        Su navegador no puede reproducir audio.
      </audio>
      <span className="pequeno texto-3">
        {mmss(nota.duracion_ms)} · {nota.grabada_por_nombre} · {formatoFechaHora(nota.fecha)} ·{' '}
        <a href={nota.url} download>
          Descargar
        </a>
      </span>
    </li>
  )
}

type Estado = 'inactiva' | 'grabando' | 'lista' | 'enviando'

function Grabadora({ ordenId }: { ordenId: number }) {
  const [estado, setEstado] = useState<Estado>('inactiva')
  const [ms, setMs] = useState(0)
  const [grabacion, setGrabacion] = useState<{ blob: Blob; url: string; ms: number } | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const recursos = useRef<{ grabador?: MediaRecorder; flujo?: MediaStream; contexto?: AudioContext; analizador?: AnalyserNode; reloj?: number }>({})
  const cola = useQueryClient()
  const notificar = useNotificar()

  const liberar = () => {
    const r = recursos.current
    if (r.reloj) clearInterval(r.reloj)
    r.flujo?.getTracks().forEach((t) => t.stop()) // apaga el micrófono
    void r.contexto?.close()
    recursos.current = {}
  }
  // Si el usuario sale de la orden mientras graba, se apaga el micrófono.
  useEffect(() => liberar, [])

  // La onda se dibuja cuando el canvas ya está en pantalla (después de que React muestra el estado «grabando»).
  useEffect(() => {
    const analizador = recursos.current.analizador
    const canvas = lienzo.current
    const ctx = canvas?.getContext('2d')
    if (estado !== 'grabando' || !analizador || !canvas || !ctx) return
    const datos = new Uint8Array(analizador.fftSize)
    let cuadro = 0
    const pintar = () => {
      analizador.getByteTimeDomainData(datos)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.lineWidth = 2
      ctx.strokeStyle = '#1d6b6b'
      ctx.beginPath()
      datos.forEach((v, i) => {
        const x = (i / (datos.length - 1)) * canvas.width
        const y = (v / 255) * canvas.height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      cuadro = requestAnimationFrame(pintar)
    }
    pintar()
    return () => cancelAnimationFrame(cuadro)
  }, [estado])

  const iniciar = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador no permite grabar audio.')
      return
    }
    let flujo: MediaStream
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('No se pudo usar el micrófono. Revise que esté conectado y que el navegador tenga permiso.')
      return
    }
    const tipo = FORMATOS.find((f) => MediaRecorder.isTypeSupported(f))
    const grabador = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined)
    const partes: Blob[] = []
    const inicio = Date.now()
    grabador.ondataavailable = (e) => e.data.size > 0 && partes.push(e.data)
    grabador.onstop = () => {
      const duracion = Date.now() - inicio
      const blob = new Blob(partes, { type: grabador.mimeType })
      liberar()
      setGrabacion({ blob, url: URL.createObjectURL(blob), ms: duracion })
      setEstado('lista')
    }
    const contexto = new AudioContext()
    const analizador = contexto.createAnalyser()
    analizador.fftSize = 1024
    contexto.createMediaStreamSource(flujo).connect(analizador)
    recursos.current = {
      grabador,
      flujo,
      contexto,
      analizador,
      reloj: window.setInterval(() => {
        const transcurrido = Date.now() - inicio
        setMs(transcurrido)
        if (transcurrido >= DURACION_MAXIMA_S * 1000 && grabador.state === 'recording') grabador.stop()
      }, 200),
    }
    grabador.start()
    setMs(0)
    setEstado('grabando')
  }

  const detener = () => recursos.current.grabador?.stop()

  const descartar = () => {
    if (grabacion) URL.revokeObjectURL(grabacion.url)
    setGrabacion(null)
    setDescripcion('')
    setEstado('inactiva')
  }

  const guardar = async () => {
    if (!grabacion) return
    setEstado('enviando')
    const extension = grabacion.blob.type.includes('mp4') ? 'm4a' : grabacion.blob.type.includes('ogg') ? 'ogg' : 'webm'
    const formulario = new FormData()
    formulario.append('archivo', grabacion.blob, `nota.${extension}`)
    formulario.append('duracion_ms', String(grabacion.ms))
    formulario.append('descripcion', descripcion.trim())
    try {
      await subirArchivo<NotaVoz>(`/ordenes/${ordenId}/notas-voz`, formulario)
      notificar('Nota de voz guardada en la orden.')
      descartar()
      await cola.invalidateQueries({ queryKey: ['orden', ordenId] })
    } catch (e) {
      setError(mensajeError(e))
      setEstado('lista')
    }
  }

  return (
    <div className={`grabadora grabadora--${estado}`}>
      {estado === 'inactiva' && (
        <Boton icono="mic" onClick={iniciar}>
          Grabar nota de voz
        </Boton>
      )}
      {estado === 'grabando' && (
        <div className="grabadora__vivo">
          <span className="grabadora__punto" aria-hidden="true" />
          <span className="grabadora__tiempo" aria-live="off">
            {mmss(ms)} / {mmss(DURACION_MAXIMA_S * 1000)}
          </span>
          <canvas ref={lienzo} width={320} height={48} className="grabadora__onda" aria-label="Onda de audio en vivo" />
          <Boton variante="peligro" icono="stop-fill" onClick={detener}>
            Detener
          </Boton>
        </div>
      )}
      {(estado === 'lista' || estado === 'enviando') && grabacion && (
        <div className="grabadora__revision">
          <audio controls src={grabacion.url} />
          <label className="campo">
            <span className="campo__etiqueta">Descripción (opcional)</span>
            <input
              className="control"
              maxLength={200}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej.: ruido metálico del ventilador al encender"
            />
          </label>
          <div className="fila">
            <Boton variante="primario" icono="cloud-upload" cargando={estado === 'enviando'} onClick={guardar}>
              Guardar en la orden
            </Boton>
            <Boton variante="fantasma" onClick={descartar} disabled={estado === 'enviando'}>
              Descartar
            </Boton>
          </div>
        </div>
      )}
      {error && (
        <p className="campo__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
