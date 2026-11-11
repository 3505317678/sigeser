import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Encabezado, Icono, Insignia, Vacio } from '../componentes/ui'
import { RUTA_TUTORIALES, TUTORIALES, type Tutorial } from '../dominio/tutoriales'
import { useSesion } from '../sesion/Sesion'
import { useTitulo } from '../util/hooks'

/** Centro de ayuda (RF-34): videotutoriales con subtítulos, filtrados por lo que el rol puede hacer. */
export function Ayuda() {
  useTitulo('Videotutoriales')
  const { puede } = useSesion()
  const [parametros, setParametros] = useSearchParams()
  const visibles = TUTORIALES.filter((t) => t.permisos.length === 0 || puede(...t.permisos))
  const actual = visibles.find((t) => t.id === parametros.get('video')) ?? visibles[0]

  if (!actual) return <Vacio icono="play-btn" titulo="No hay videotutoriales para su rol" />

  return (
    <>
      <Encabezado
        titulo="Videotutoriales"
        descripcion="Videos cortos grabados sobre el sistema real. Tienen subtítulos y puede pausarlos para seguir cada paso."
      />
      <div className="ayuda">
        <section className="panel ayuda__reproductor" aria-labelledby="t-video">
          <Reproductor key={actual.id} tutorial={actual} />
          <div className="panel__cuerpo pila pila--compacta">
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <h2 id="t-video">{actual.titulo}</h2>
              <Insignia tono="info">{actual.rol}</Insignia>
            </div>
            <p className="texto-2">{actual.descripcion}</p>
            <h3 className="pequeno">En este video</h3>
            <ol className="ayuda__pasos">
              {actual.pasos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </div>
        </section>

        <nav className="ayuda__lista" aria-label="Lista de videotutoriales">
          {visibles.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tarjeta-video${t.id === actual.id ? ' tarjeta-video--actual' : ''}`}
              aria-current={t.id === actual.id ? 'true' : undefined}
              onClick={() => setParametros({ video: t.id })}
            >
              <span className="tarjeta-video__miniatura">
                <img src={`${RUTA_TUTORIALES}/${t.id}.jpg`} alt="" loading="lazy" width={160} height={100} />
                <Icono nombre={t.id === actual.id ? 'play-circle-fill' : 'play-circle'} />
                {t.duracion && <span className="tarjeta-video__duracion">{t.duracion}</span>}
              </span>
              <span className="tarjeta-video__texto">
                <strong>{t.titulo}</strong>
                <span className="pequeno texto-3">{t.rol}</span>
              </span>
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}

function Reproductor({ tutorial }: { tutorial: Tutorial }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <Vacio icono="camera-video-off" titulo="El video no está disponible">
        Verifique que la instalación incluya la carpeta de tutoriales.
      </Vacio>
    )
  }
  return (
    <video
      className="ayuda__video"
      controls
      preload="metadata"
      poster={`${RUTA_TUTORIALES}/${tutorial.id}.jpg`}
      onError={() => setError(true)}
    >
      <source src={`${RUTA_TUTORIALES}/${tutorial.id}.webm`} type="video/webm" />
      <source src={`${RUTA_TUTORIALES}/${tutorial.id}.mp4`} type="video/mp4" onError={() => setError(true)} />
      <track kind="captions" src={`${RUTA_TUTORIALES}/${tutorial.id}.vtt`} srcLang="es" label="Español" default />
      Su navegador no puede reproducir este video.
    </video>
  )
}
