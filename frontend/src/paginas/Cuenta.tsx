import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, ErrorApi } from '../api/cliente'
import { Aviso, Boton, Campo, Encabezado, mensajeError, Vacio } from '../componentes/ui'
import { useSesion } from '../sesion/Sesion'
import { useTitulo } from '../util/hooks'

const MINIMO = 12

export function Cuenta() {
  useTitulo('Cambiar contraseña')
  const { usuario } = useSesion()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [errorLocal, setErrorLocal] = useState('')
  const cambiar = useMutation({
    mutationFn: () => api.post('/auth/cambiar-contrasena', { contrasena_actual: actual, contrasena_nueva: nueva }),
    onSuccess: () => {
      setActual('')
      setNueva('')
      setConfirmacion('')
    },
  })
  const e = cambiar.error instanceof ErrorApi ? cambiar.error : null

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    setErrorLocal('')
    if (nueva.length < MINIMO) return setErrorLocal(`La nueva contraseña debe tener al menos ${MINIMO} caracteres.`)
    if (nueva !== confirmacion) return setErrorLocal('La confirmación no coincide con la nueva contraseña.')
    cambiar.mutate()
  }

  return (
    <>
      <Encabezado titulo="Cambiar contraseña" descripcion={`Cuenta ${usuario?.correo}, rol ${usuario?.rol}.`} />
      <section className="panel" style={{ maxWidth: 560 }}>
        {cambiar.isSuccess ? (
          <Vacio icono="shield-check" titulo="Contraseña actualizada" accion={<Link to="/">Volver al inicio</Link>}>
            La usará la próxima vez que ingrese. Las demás sesiones abiertas con la contraseña anterior se cerraron.
          </Vacio>
        ) : (
          <form className="panel__cuerpo formulario" onSubmit={enviar} noValidate>
            {cambiar.error && (!e || Object.keys(e.errores).length === 0) && <Aviso tono="error">{mensajeError(cambiar.error)}</Aviso>}
            <Campo etiqueta="Contraseña actual" obligatorio error={e?.campo('contrasena_actual')}>
              <input className="control" type="password" autoComplete="current-password" value={actual} onChange={(ev) => setActual(ev.target.value)} />
            </Campo>
            <Campo
              etiqueta="Nueva contraseña"
              obligatorio
              error={e?.campo('contrasena_nueva') ?? (errorLocal && nueva.length < MINIMO ? errorLocal : undefined)}
              ayuda={`Mínimo ${MINIMO} caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.`}
            >
              <input className="control" type="password" autoComplete="new-password" value={nueva} onChange={(ev) => setNueva(ev.target.value)} />
            </Campo>
            <Campo etiqueta="Confirme la nueva contraseña" obligatorio error={errorLocal && nueva.length >= MINIMO ? errorLocal : undefined}>
              <input className="control" type="password" autoComplete="new-password" value={confirmacion} onChange={(ev) => setConfirmacion(ev.target.value)} />
            </Campo>
            <div className="formulario__acciones">
              <Boton type="submit" variante="primario" cargando={cambiar.isPending} disabled={!actual || !nueva || !confirmacion}>
                Cambiar contraseña
              </Boton>
            </div>
          </form>
        )}
      </section>
    </>
  )
}
