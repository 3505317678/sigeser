import { useState } from 'react'
import { Logo } from './Logo'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import type { Repuesto } from '../api/tipos'
import { useSesion } from '../sesion/Sesion'
import { iniciales } from '../util/formato'
import { Boton, Icono } from './ui'

interface Enlace {
  a: string
  texto: string
  icono: string
  permisos: string[]
  contador?: number
}

export function Marco() {
  const { usuario, puede, salir } = useSesion()
  const navegar = useNavigate()
  const ubicacion = useLocation()
  // El menú móvil queda abierto solo en la ruta donde se abrió: al navegar se cierra sin efectos adicionales.
  const [menuAbiertoEn, setMenuAbiertoEn] = useState<string | null>(null)
  const menuAbierto = menuAbiertoEn === ubicacion.pathname
  const setMenuAbierto = (abrir: boolean | ((actual: boolean) => boolean)) => {
    const valor = typeof abrir === 'function' ? abrir(menuAbierto) : abrir
    setMenuAbiertoEn(valor ? ubicacion.pathname : null)
  }

  const alertas = useQuery({
    queryKey: ['repuestos', 'alertas'],
    queryFn: () => api.get<Repuesto[]>('/repuestos/alertas'),
    enabled: puede('inventario.gestionar'),
    staleTime: 60_000,
  })

  if (!usuario) return null
  const esTecnico = !!usuario.tecnico_id && !puede('ordenes.ver_todas')

  const grupos: { titulo: string; enlaces: Enlace[] }[] = [
    {
      titulo: 'Operación',
      enlaces: [
        { a: '/panel', texto: 'Panel', icono: 'speedometer2', permisos: ['reportes.ver'] },
        {
          a: '/ordenes',
          texto: esTecnico ? 'Mis órdenes' : 'Órdenes de servicio',
          icono: 'clipboard2-check',
          permisos: ['ordenes.ver_todas', 'ordenes.ver_asignadas'],
        },
        { a: '/clientes', texto: 'Clientes y equipos', icono: 'people', permisos: ['clientes.ver', 'clientes.gestionar'] },
        {
          a: '/inventario',
          texto: 'Inventario',
          icono: 'box-seam',
          permisos: ['inventario.ver', 'inventario.gestionar'],
          contador: alertas.data?.length,
        },
      ],
    },
    {
      titulo: 'Gestión',
      enlaces: [
        { a: '/tecnicos', texto: 'Técnicos', icono: 'person-gear', permisos: ['tecnicos.ver', 'tecnicos.gestionar'] },
        { a: '/reportes', texto: 'Reportes', icono: 'bar-chart-line', permisos: ['reportes.ver'] },
        { a: '/usuarios', texto: 'Usuarios y roles', icono: 'shield-lock', permisos: ['usuarios.gestionar'] },
        { a: '/auditoria', texto: 'Auditoría', icono: 'journal-text', permisos: ['auditoria.ver'] },
      ],
    },
    {
      titulo: 'Ayuda',
      enlaces: [{ a: '/ayuda', texto: 'Videotutoriales', icono: 'play-btn', permisos: [] }],
    },
  ]

  // La redirección al ingreso la hace RequiereSesion según el motivo de la salida.
  const cerrarSesion = () => salir()

  return (
    <div className={`app${menuAbierto ? ' app--menu-abierto' : ''}`}>
      <a href="#contenido" className="saltar-contenido">
        Saltar al contenido
      </a>
      <aside className="menu" id="menu-principal" aria-label="Menú principal">
        <NavLink to="/" className="menu__marca">
          <Logo variante="clara" tamano={30} />
          <strong>SIGESER</strong>
        </NavLink>
        <nav>
          {grupos.map((g) => {
            const visibles = g.enlaces.filter((e) => e.permisos.length === 0 || puede(...e.permisos))
            if (visibles.length === 0) return null
            return (
              <div className="menu__grupo" key={g.titulo}>
                <div className="menu__grupo-titulo" id={`grupo-${g.titulo}`}>
                  {g.titulo}
                </div>
                <ul aria-labelledby={`grupo-${g.titulo}`}>
                  {visibles.map((e) => (
                    <li key={e.a}>
                      <NavLink to={e.a} className="menu__enlace">
                        <Icono nombre={e.icono} />
                        {e.texto}
                        {!!e.contador && (
                          <span className="menu__contador" aria-label={`${e.contador} repuestos bajo el mínimo`}>
                            {e.contador}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </nav>
        <div className="menu__pie">SIGESER versión 1.2</div>
      </aside>
      {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} aria-hidden="true" />}

      <div className="principal">
        <header className="barra">
          <Boton
            variante="fantasma"
            icono="list"
            className="barra__menu-movil"
            aria-label="Abrir menú"
            aria-expanded={menuAbierto}
            aria-controls="menu-principal"
            onClick={() => setMenuAbierto((v) => !v)}
          />
          <div className="barra__espacio" />
          <div className="usuario-actual">
            <div>
              <strong>{usuario.nombre_completo}</strong>
              <small>{usuario.rol}</small>
            </div>
            <span className="avatar" aria-hidden="true">
              {iniciales(usuario.nombre_completo)}
            </span>
          </div>
          <Boton variante="fantasma" icono="key" aria-label="Cambiar contraseña" title="Cambiar contraseña" onClick={() => navegar('/cuenta')} />
          <Boton variante="fantasma" icono="box-arrow-right" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={cerrarSesion} />
        </header>
        <main id="contenido" className="contenido" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
