import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ErrorApi } from '../api/cliente'
import { EscenaTaller } from '../componentes/EscenaTaller'
import { Logo } from '../componentes/Logo'
import { Aviso, Boton, Campo, mensajeError } from '../componentes/ui'
import { useSesion } from '../sesion/Sesion'

const FLUJO = [
  ['Recepción', 'El equipo llega al mostrador y se entrega el comprobante.'],
  ['Diagnóstico', 'El técnico identifica la falla y estima el costo.'],
  ['Aprobación', 'El cliente acepta o rechaza el presupuesto.'],
  ['Reparación', 'Se registran el trabajo y los repuestos usados.'],
  ['Verificación', 'Pruebas de funcionamiento antes de entregar.'],
  ['Entrega', 'El cliente recibe su equipo con el comprobante de entrega.'],
]

export function Ingreso() {
  const { usuario, ingresar } = useSesion()
  const navegar = useNavigate()
  const estado = useLocation().state as { desde?: string; mensaje?: string; aviso?: string } | null
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  if (usuario) return <Navigate to={estado?.desde ?? '/'} replace />

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await ingresar(correo.trim(), contrasena)
      navegar(estado?.desde ?? '/', { replace: true })
    } catch (err) {
      setError(err)
      setContrasena('')
    } finally {
      setEnviando(false)
    }
  }

  const errorCampo = error instanceof ErrorApi ? error : null

  return (
    <div className="ingreso">
      <section className="ingreso__marca" aria-label="SIGESER">
        <div>
          <h1 className="ingreso__titulo">
            <Logo variante="clara" tamano={72} animada />
            SIGESER
          </h1>
          <p>Gestión de órdenes de servicio técnico, desde que el equipo llega al mostrador hasta que vuelve a manos del cliente.</p>
        </div>
        <EscenaTaller />
        <ol className="ingreso__flujo" aria-label="Etapas de una orden de servicio">
          {FLUJO.map(([paso, detalle]) => (
            <li key={paso}>
              <strong>{paso}</strong>
              <span>{detalle}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="ingreso__formulario">
        <form className="formulario" onSubmit={enviar} noValidate>
          <div className="pila pila--compacta">
            <h2>Ingresar</h2>
            <p className="texto-2">Use el correo y la contraseña que le asignó el administrador.</p>
          </div>
          {estado?.mensaje && !error && <Aviso tono="exito">{estado.mensaje}</Aviso>}
          {estado?.aviso && !error && <Aviso tono="info">{estado.aviso}</Aviso>}
          {error !== null && <Aviso tono="error">{mensajeError(error)}</Aviso>}
          <Campo etiqueta="Correo electrónico" obligatorio error={errorCampo?.campo('correo')}>
            <input
              className="control"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Contraseña" obligatorio error={errorCampo?.campo('contrasena')}>
            <input
              className="control"
              type={ver ? 'text' : 'password'}
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
          </Campo>
          <label className="casilla pequeno">
            <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
            Mostrar contraseña
          </label>
          <Boton type="submit" variante="primario" bloque cargando={enviando} disabled={!correo || !contrasena}>
            Ingresar
          </Boton>
          <p className="pequeno texto-3">
            Por seguridad, la cuenta se bloquea 15 minutos después de 5 intentos fallidos seguidos.
          </p>
        </form>
      </section>
    </div>
  )
}
