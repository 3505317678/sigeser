import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Cargando, Vacio } from '../componentes/ui'
import { useSesion } from './Sesion'

/**
 * Exige sesión iniciada. Si no la hay, envía al ingreso:
 * - tras cerrar sesión, sin recordar la página (el siguiente usuario no debe aterrizar en la del anterior);
 * - si la sesión expiró o se entró por un enlace, recordando la página para volver a ella después de ingresar.
 */
export function RequiereSesion({ children }: { children: ReactNode }) {
  const { usuario, cargando, motivoSalida } = useSesion()
  const ubicacion = useLocation()
  if (cargando) return <Cargando texto="Verificando la sesión…" />
  if (!usuario) {
    const estado =
      motivoSalida === 'voluntaria'
        ? { mensaje: 'Cerró la sesión correctamente.' }
        : {
            desde: ubicacion.pathname + ubicacion.search,
            aviso: motivoSalida === 'expirada' ? 'Su sesión terminó. Ingrese de nuevo para continuar donde estaba.' : undefined,
          }
    return <Navigate to="/ingresar" replace state={estado} />
  }
  return <>{children}</>
}

/**
 * Oculta una vista a quien no tiene el permiso. Es solo una ayuda de interfaz:
 * la autorización real la aplica siempre la API en cada petición.
 */
export function RequierePermiso({ permisos, children }: { permisos: string[]; children: ReactNode }) {
  const { puede } = useSesion()
  if (!puede(...permisos)) {
    return (
      <Vacio icono="shield-lock" titulo="Esta sección no está disponible para su rol">
        Si necesita acceso, solicítelo al administrador del sistema.
      </Vacio>
    )
  }
  return <>{children}</>
}
