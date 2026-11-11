import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react'
import { Boton } from './ui'

interface DialogoProps {
  abierto: boolean
  titulo: string
  descripcion?: ReactNode
  alCerrar: () => void
  children: ReactNode
  /** Si se define, el cuerpo es un formulario y el botón principal lo envía. */
  alEnviar?: () => void
  textoEnviar?: string
  varianteEnviar?: 'primario' | 'peligro-solido'
  enviando?: boolean
  ancho?: boolean
  pie?: ReactNode
}

/**
 * Diálogo modal sobre el elemento nativo <dialog>: el navegador gestiona el foco atrapado,
 * la tecla Escape y la capa de fondo, lo que lo hace accesible sin dependencias adicionales.
 */
export function Dialogo({
  abierto,
  titulo,
  descripcion,
  alCerrar,
  children,
  alEnviar,
  textoEnviar = 'Guardar',
  varianteEnviar = 'primario',
  enviando = false,
  ancho = false,
  pie,
}: DialogoProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitulo = useId()
  const idDescripcion = useId()

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (abierto && !dialogo.open) dialogo.showModal()
    if (!abierto && dialogo.open) dialogo.close()
  }, [abierto])

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!enviando) alEnviar?.()
  }

  const contenido = (
    <>
      <div className="dialogo__cuerpo">{children}</div>
      <div className="dialogo__pie">
        {pie ?? (
          <>
            <Boton onClick={alCerrar} disabled={enviando}>
              {alEnviar ? 'Cancelar' : 'Cerrar'}
            </Boton>
            {alEnviar && (
              <Boton type="submit" variante={varianteEnviar} cargando={enviando}>
                {textoEnviar}
              </Boton>
            )}
          </>
        )}
      </div>
    </>
  )

  return (
    <dialog
      ref={ref}
      className={`dialogo${ancho ? ' dialogo--ancho' : ''}`}
      aria-labelledby={idTitulo}
      aria-describedby={descripcion ? idDescripcion : undefined}
      onCancel={(e) => {
        e.preventDefault()
        if (!enviando) alCerrar()
      }}
    >
      {abierto && (
        <>
          <div className="dialogo__cabecera">
            <div>
              <h2 id={idTitulo}>{titulo}</h2>
              {descripcion && <p id={idDescripcion}>{descripcion}</p>}
            </div>
            <Boton variante="fantasma" icono="x-lg" aria-label="Cerrar" onClick={alCerrar} disabled={enviando} />
          </div>
          {alEnviar ? (
            <form onSubmit={enviar} noValidate>
              {contenido}
            </form>
          ) : (
            contenido
          )}
        </>
      )}
    </dialog>
  )
}
