import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FOTOS_MAXIMO_MB, FOTOS_TIPOS, validarFoto, type FotoElegida } from '../dominio/fotos'
import { Aviso, Boton, Icono } from './ui'

interface SelectorFotosProps {
  fotos: FotoElegida[]
  alCambiar: (fotos: FotoElegida[]) => void
  maximo: number
  /** Texto inicial de la descripción de cada foto nueva (se puede editar foto por foto). */
  descripcionInicial?: string
}

/**
 * Selección de fotos con tres entradas: el explorador de archivos, la cámara del teléfono (atributo capture)
 * y la cámara web del computador (getUserMedia). Muestra una vista previa de cada foto antes de enviarla.
 */
export function SelectorFotos({ fotos, alCambiar, maximo, descripcionInicial = '' }: SelectorFotosProps) {
  const idEntrada = useId()
  const entrada = useRef<HTMLInputElement>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [camara, setCamara] = useState(false)
  const archivos = useMemo(() => fotos.map((f) => f.archivo), [fotos])
  const vistas = useMemo(() => archivos.map((a) => URL.createObjectURL(a)), [archivos])
  useEffect(() => () => vistas.forEach((u) => URL.revokeObjectURL(u)), [vistas])

  const agregar = (nuevas: File[]) => {
    const problemas: string[] = []
    const validas = nuevas.filter((f) => {
      const error = validarFoto(f)
      if (error) problemas.push(error)
      return !error
    })
    const cupo = maximo - fotos.length
    if (validas.length > cupo) problemas.push(`Solo se pueden agregar ${Math.max(cupo, 0)} foto(s) más.`)
    setErrores(problemas)
    alCambiar([...fotos, ...validas.slice(0, Math.max(cupo, 0)).map((archivo) => ({ archivo, descripcion: descripcionInicial }))])
  }

  return (
    <div className="selector-fotos">
      <div className="fila">
        <Boton icono="images" onClick={() => entrada.current?.click()} disabled={fotos.length >= maximo}>
          Elegir fotos
        </Boton>
        {'mediaDevices' in navigator && (
          <Boton icono="camera" onClick={() => setCamara(true)} disabled={fotos.length >= maximo}>
            Usar la cámara
          </Boton>
        )}
        <span className="pequeno texto-3">
          {fotos.length} de {maximo}. JPEG, PNG o WebP de hasta {FOTOS_MAXIMO_MB} MB.
        </span>
      </div>
      <input
        ref={entrada}
        id={idEntrada}
        className="solo-lector"
        type="file"
        accept={FOTOS_TIPOS.join(',')}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(ev) => {
          agregar(Array.from(ev.target.files ?? []))
          ev.target.value = ''
        }}
      />
      {errores.length > 0 && (
        <Aviso tono="error">
          {errores.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </Aviso>
      )}
      {camara && (
        <Camara
          alCapturar={(f) => agregar([f])}
          alCerrar={() => setCamara(false)}
        />
      )}
      {fotos.length > 0 && (
        <ul className="selector-fotos__lista" aria-label="Fotos seleccionadas">
          {vistas.map((vista, i) => (
            <li key={vista} className="aparecer">
              <img src={vista} alt={`Vista previa ${i + 1}`} />
              <input
                className="control"
                maxLength={200}
                placeholder="Qué muestra la foto"
                aria-label={`Descripción de la foto ${i + 1}`}
                value={fotos[i]?.descripcion ?? ''}
                onChange={(ev) => alCambiar(fotos.map((f, j) => (j === i ? { ...f, descripcion: ev.target.value } : f)))}
              />
              <Boton
                pequeno
                variante="fantasma"
                icono="x-lg"
                aria-label={`Quitar la foto ${i + 1}`}
                onClick={() => alCambiar(fotos.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Cámara web del computador. El video nunca sale del navegador: solo se envía la foto que el usuario captura. */
function Camara({ alCapturar, alCerrar }: { alCapturar: (f: File) => void; alCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [destello, setDestello] = useState(false)

  useEffect(() => {
    const estado: { flujo: MediaStream | null; cancelado: boolean } = { flujo: null, cancelado: false }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (estado.cancelado) return s.getTracks().forEach((t) => t.stop())
        estado.flujo = s
        if (video.current) video.current.srcObject = s
      })
      .catch(() => setError('No fue posible usar la cámara. Revise que el navegador tenga permiso o elija las fotos desde archivos.'))
    return () => {
      estado.cancelado = true
      estado.flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const capturar = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const lienzo = document.createElement('canvas')
    lienzo.width = v.videoWidth
    lienzo.height = v.videoHeight
    lienzo.getContext('2d')?.drawImage(v, 0, 0)
    lienzo.toBlob(
      (blob) => {
        if (!blob) return
        alCapturar(new File([blob], `camara-${Date.now()}.jpg`, { type: 'image/jpeg' }))
        setDestello(true)
        setTimeout(() => setDestello(false), 300)
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div className="camara" role="group" aria-label="Cámara">
      {error ? (
        <Aviso tono="error">{error}</Aviso>
      ) : (
        <div className={`camara__visor${destello ? ' camara__visor--destello' : ''}`}>
          <video ref={video} autoPlay playsInline muted aria-label="Vista de la cámara" />
        </div>
      )}
      <div className="fila">
        {!error && (
          <Boton variante="primario" icono="camera-fill" onClick={capturar}>
            Tomar foto
          </Boton>
        )}
        <Boton variante="fantasma" onClick={alCerrar}>
          <Icono nombre="x-lg" /> Cerrar la cámara
        </Boton>
      </div>
    </div>
  )
}
