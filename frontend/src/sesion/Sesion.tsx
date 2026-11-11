import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ErrorApi, EVENTO_SESION_EXPIRADA } from '../api/cliente'
import type { Perfil } from '../api/tipos'

/** Por qué terminó la última sesión: decide a dónde se vuelve y qué mensaje ve el usuario en el ingreso. */
export type MotivoSalida = 'voluntaria' | 'expirada' | null

interface ApiSesion {
  usuario: Perfil | null
  cargando: boolean
  motivoSalida: MotivoSalida
  ingresar: (correo: string, contrasena: string) => Promise<Perfil>
  salir: () => Promise<void>
  /** true si el usuario tiene al menos uno de los permisos indicados. */
  puede: (...permisos: string[]) => boolean
}

const Contexto = createContext<ApiSesion | null>(null)
export const CLAVE_PERFIL = ['sesion', 'perfil'] as const

async function cargarPerfil(): Promise<Perfil | null> {
  try {
    return await api.get<Perfil>('/auth/yo')
  } catch (e) {
    if (e instanceof ErrorApi && (e.status === 401 || e.status === 403)) return null
    throw e
  }
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const cliente = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: CLAVE_PERFIL, queryFn: cargarPerfil, staleTime: 5 * 60_000, retry: 1 })
  const usuario = data ?? null
  const [motivoSalida, setMotivoSalida] = useState<MotivoSalida>(null)

  /**
   * Cambia de sesión: borra los datos de la sesión anterior (otro usuario no debe verlos) y actualiza el perfil
   * en su misma consulta. No se usa cliente.clear(): eliminaría la consulta a la que este componente está
   * suscrito y el nuevo perfil quedaría en otra consulta que nadie observa (la interfaz seguiría sin sesión).
   */
  const cambiarSesion = useCallback(
    (perfil: Perfil | null) => {
      const esPerfil = (clave: readonly unknown[]) => clave[0] === CLAVE_PERFIL[0] && clave[1] === CLAVE_PERFIL[1]
      cliente.cancelQueries({ predicate: (q) => !esPerfil(q.queryKey) })
      cliente.removeQueries({ predicate: (q) => !esPerfil(q.queryKey) })
      cliente.setQueryData(CLAVE_PERFIL, perfil)
    },
    [cliente],
  )

  useEffect(() => {
    const alExpirar = () => {
      // El motivo debe quedar aplicado antes de que la interfaz note que ya no hay usuario.
      flushSync(() => setMotivoSalida('expirada'))
      cambiarSesion(null)
    }
    window.addEventListener(EVENTO_SESION_EXPIRADA, alExpirar)
    return () => window.removeEventListener(EVENTO_SESION_EXPIRADA, alExpirar)
  }, [cambiarSesion])

  const ingresar = useCallback(
    async (correo: string, contrasena: string) => {
      const perfil = await api.post<Perfil>('/auth/login', { correo, contrasena })
      setMotivoSalida(null)
      cambiarSesion(perfil)
      return perfil
    },
    [cambiarSesion],
  )

  const salir = useCallback(async () => {
    flushSync(() => setMotivoSalida('voluntaria'))
    try {
      await api.post('/auth/logout')
    } finally {
      cambiarSesion(null)
    }
  }, [cambiarSesion])

  const puede = useCallback(
    (...permisos: string[]) => !!usuario && permisos.some((p) => usuario.permisos.includes(p)),
    [usuario],
  )

  const valor = useMemo(
    () => ({ usuario, cargando: isPending, motivoSalida, ingresar, salir, puede }),
    [usuario, isPending, motivoSalida, ingresar, salir, puede],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useSesion debe usarse dentro de ProveedorSesion')
  return ctx
}
