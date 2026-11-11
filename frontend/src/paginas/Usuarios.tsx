import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ErrorApi } from '../api/cliente'
import type { Paginado, Permiso, Rol, Usuario } from '../api/tipos'
import { Dialogo } from '../componentes/Dialogo'
import { useNotificar } from '../componentes/Notificaciones'
import { Aviso, AvisoError, Boton, Campo, Encabezado, FilasCargando, Icono, Insignia, mensajeError, Paginacion } from '../componentes/ui'
import { useSesion } from '../sesion/Sesion'
import { formatoFechaHora, haceCuanto } from '../util/formato'
import { useTitulo } from '../util/hooks'

const TAMANO = 20

export function Usuarios() {
  useTitulo('Usuarios y roles')
  const [pestana, setPestana] = useState<'usuarios' | 'roles'>('usuarios')
  const [dialogo, setDialogo] = useState<{ usuario?: Usuario } | null>(null)
  return (
    <>
      <Encabezado
        titulo="Usuarios y roles"
        descripcion="Cuentas de acceso al sistema. Cada persona tiene un rol, y el rol define qué puede consultar y modificar."
        acciones={
          pestana === 'usuarios' && (
            <Boton variante="primario" icono="person-plus" onClick={() => setDialogo({})}>
              Crear usuario
            </Boton>
          )
        }
      />
      <div className="pestanas" role="tablist" aria-label="Secciones">
        <button type="button" role="tab" id="pestana-usuarios" aria-selected={pestana === 'usuarios'} aria-controls="panel-usuarios" onClick={() => setPestana('usuarios')}>
          Usuarios
        </button>
        <button type="button" role="tab" id="pestana-roles" aria-selected={pestana === 'roles'} aria-controls="panel-roles" onClick={() => setPestana('roles')}>
          Roles y permisos
        </button>
      </div>
      {pestana === 'usuarios' ? (
        <div role="tabpanel" id="panel-usuarios" aria-labelledby="pestana-usuarios">
          <TablaUsuarios alEditar={(usuario) => setDialogo({ usuario })} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-roles" aria-labelledby="pestana-roles">
          <MatrizRoles />
        </div>
      )}
      {dialogo && <DialogoUsuario usuario={dialogo.usuario} alCerrar={() => setDialogo(null)} />}
    </>
  )
}

/** `ahora` es el instante en que se consultaron los datos, para que el render no dependa del reloj. */
const estaBloqueado = (u: Usuario, ahora: number) => !!u.bloqueado_hasta && new Date(u.bloqueado_hasta).getTime() > ahora

function estadoCuenta(u: Usuario, ahora: number) {
  if (!u.activo) return <Insignia tono="neutro">Inactivo</Insignia>
  if (estaBloqueado(u, ahora)) return <Insignia tono="error">Bloqueado</Insignia>
  return <Insignia tono="exito">Activo</Insignia>
}

function TablaUsuarios({ alEditar }: { alEditar: (u: Usuario) => void }) {
  const { usuario: yo } = useSesion()
  const cola = useQueryClient()
  const notificar = useNotificar()
  const [pagina, setPagina] = useState(1)
  const consulta = useQuery({
    queryKey: ['usuarios', pagina],
    queryFn: () => api.get<Paginado<Usuario>>('/usuarios', { page: pagina, tamano: TAMANO }),
    placeholderData: keepPreviousData,
  })
  const accion = useMutation({
    mutationFn: ({ u, accion }: { u: Usuario; accion: 'activar' | 'desactivar' | 'desbloquear' }) => api.post(`/usuarios/${u.id}/${accion}`),
    onSuccess: (_, { u, accion }) => {
      cola.invalidateQueries({ queryKey: ['usuarios'] })
      const textos = { activar: 'activada', desactivar: 'desactivada', desbloquear: 'desbloqueada' }
      notificar(`Cuenta de ${u.nombre_completo} ${textos[accion]}.`)
    },
    onError: (e) => notificar(mensajeError(e), 'error'),
  })

  return (
    <section className="panel">
      {consulta.error ? (
        <div className="panel__cuerpo">
          <AvisoError error={consulta.error} reintentar={() => consulta.refetch()} />
        </div>
      ) : (
        <>
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lector">Usuarios</caption>
              <thead>
                <tr>
                  <th scope="col">Usuario</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Último ingreso</th>
                  <th scope="col">
                    <span className="solo-lector">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {consulta.isPending ? (
                  <FilasCargando columnas={5} filas={4} />
                ) : (
                  consulta.data?.results.map((u) => {
                    const bloqueado = estaBloqueado(u, consulta.dataUpdatedAt)
                    const ocupado = accion.isPending && accion.variables?.u.id === u.id
                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.nombre_completo}</strong>
                          {u.id === yo?.id && <span className="pequeno texto-3"> (usted)</span>}
                          <div className="pequeno texto-2">{u.correo}</div>
                        </td>
                        <td>{u.rol_nombre}</td>
                        <td>{estadoCuenta(u, consulta.dataUpdatedAt)}</td>
                        <td className="texto-2" title={formatoFechaHora(u.last_login)}>
                          {u.last_login ? haceCuanto(u.last_login) : 'Nunca'}
                        </td>
                        <td className="acciones-celda">
                          <Boton pequeno variante="fantasma" icono="pencil" onClick={() => alEditar(u)}>
                            Editar
                          </Boton>
                          {bloqueado && (
                            <Boton pequeno variante="fantasma" icono="unlock" cargando={ocupado} onClick={() => accion.mutate({ u, accion: 'desbloquear' })}>
                              Desbloquear
                            </Boton>
                          )}
                          {u.id !== yo?.id &&
                            (u.activo ? (
                              <Boton pequeno variante="peligro" cargando={ocupado} onClick={() => accion.mutate({ u, accion: 'desactivar' })}>
                                Desactivar
                              </Boton>
                            ) : (
                              <Boton pequeno cargando={ocupado} onClick={() => accion.mutate({ u, accion: 'activar' })}>
                                Activar
                              </Boton>
                            ))}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={pagina} total={consulta.data?.count ?? 0} tamano={TAMANO} alCambiar={setPagina} />
        </>
      )}
    </section>
  )
}

function DialogoUsuario({ usuario, alCerrar }: { usuario?: Usuario; alCerrar: () => void }) {
  const cola = useQueryClient()
  const notificar = useNotificar()
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<Paginado<Rol> | Rol[]>('/roles') })
  const listaRoles = roles.data ? (Array.isArray(roles.data) ? roles.data : roles.data.results) : []
  const [datos, setDatos] = useState({
    nombre_completo: usuario?.nombre_completo ?? '',
    correo: usuario?.correo ?? '',
    rol: usuario ? String(usuario.rol) : '',
    contrasena: '',
  })
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo: Record<string, unknown> = { nombre_completo: datos.nombre_completo, correo: datos.correo, rol: Number(datos.rol) || null }
      if (datos.contrasena) cuerpo.contrasena = datos.contrasena
      return usuario ? api.patch<Usuario>(`/usuarios/${usuario.id}`, cuerpo) : api.post<Usuario>('/usuarios', cuerpo)
    },
    onSuccess: (u) => {
      cola.invalidateQueries({ queryKey: ['usuarios'] })
      notificar(usuario ? 'Usuario actualizado.' : `Usuario ${u.correo} creado. Entréguele la contraseña por un medio seguro.`)
      alCerrar()
    },
  })
  const e = guardar.error instanceof ErrorApi ? guardar.error : null
  const poner = (campo: keyof typeof datos) => (ev: { target: { value: string } }) => setDatos({ ...datos, [campo]: ev.target.value })

  return (
    <Dialogo
      abierto
      titulo={usuario ? `Editar a ${usuario.nombre_completo}` : 'Crear usuario'}
      alCerrar={alCerrar}
      alEnviar={() => guardar.mutate()}
      enviando={guardar.isPending}
      textoEnviar={usuario ? 'Guardar cambios' : 'Crear usuario'}
    >
      <div className="formulario">
        {guardar.error && (!e || Object.keys(e.errores).length === 0) && <Aviso tono="error">{mensajeError(guardar.error)}</Aviso>}
        <Campo etiqueta="Nombre completo" obligatorio error={e?.campo('nombre_completo')}>
          <input className="control" value={datos.nombre_completo} onChange={poner('nombre_completo')} autoFocus />
        </Campo>
        <Campo etiqueta="Correo electrónico" obligatorio error={e?.campo('correo')} ayuda="Es el usuario con el que ingresa al sistema.">
          <input className="control" type="email" autoComplete="off" value={datos.correo} onChange={poner('correo')} />
        </Campo>
        <Campo etiqueta="Rol" obligatorio error={e?.campo('rol')}>
          <select className="control" value={datos.rol} onChange={poner('rol')}>
            <option value="">Elija un rol</option>
            {listaRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          etiqueta={usuario ? 'Nueva contraseña' : 'Contraseña inicial'}
          obligatorio={!usuario}
          error={e?.campo('contrasena')}
          ayuda={usuario ? 'Déjela vacía para conservar la actual.' : 'Mínimo 12 caracteres. Evite datos personales y contraseñas comunes.'}
        >
          <input className="control" type="password" autoComplete="new-password" value={datos.contrasena} onChange={poner('contrasena')} />
        </Campo>
      </div>
    </Dialogo>
  )
}

function MatrizRoles() {
  const [rolEditado, setRolEditado] = useState<Rol | null>(null)
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<Paginado<Rol> | Rol[]>('/roles') })
  const permisos = useQuery({ queryKey: ['permisos'], queryFn: () => api.get<Paginado<Permiso> | Permiso[]>('/permisos', { tamano: 100 }) })
  const listaRoles = roles.data ? (Array.isArray(roles.data) ? roles.data : roles.data.results) : []
  const listaPermisos = permisos.data ? (Array.isArray(permisos.data) ? permisos.data : permisos.data.results) : []
  const error = roles.error ?? permisos.error

  return (
    <section className="panel" aria-labelledby="t-matriz">
      <div className="panel__cabecera">
        <h2 id="t-matriz">Matriz de permisos por rol</h2>
        <span className="pequeno texto-3">Todo lo que no está permitido está denegado.</span>
      </div>
      {error ? (
        <div className="panel__cuerpo">
          <AvisoError error={error} />
        </div>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Permiso</th>
                {listaRoles.map((r) => (
                  <th key={r.id} scope="col" style={{ textAlign: 'center' }}>
                    {r.nombre}
                    <div className="pequeno texto-3" style={{ fontWeight: 400 }}>
                      {r.total_usuarios} usuario(s)
                    </div>
                    <Boton pequeno variante="fantasma" icono="pencil" onClick={() => setRolEditado(r)}>
                      Editar permisos
                    </Boton>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.isPending || permisos.isPending ? (
                <FilasCargando columnas={4} />
              ) : (
                listaPermisos.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" style={{ position: 'static', background: 'none', fontWeight: 400, color: 'var(--c-texto)' }}>
                      {p.descripcion || p.codigo}
                      <div className="pequeno texto-3">{p.codigo}</div>
                    </th>
                    {listaRoles.map((r) => (
                      <td key={r.id} style={{ textAlign: 'center' }}>
                        {r.permisos.includes(p.codigo) ? (
                          <span style={{ color: 'var(--c-exito)' }}>
                            <Icono nombre="check-circle-fill" etiqueta="Permitido" />
                          </span>
                        ) : (
                          <span style={{ color: 'var(--c-borde-fuerte)' }}>
                            <Icono nombre="dash" etiqueta="Denegado" />
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {rolEditado && <DialogoPermisosRol rol={rolEditado} permisos={listaPermisos} alCerrar={() => setRolEditado(null)} />}
    </section>
  )
}

/** RF-04: el administrador ajusta los permisos de un rol. El backend impide quitar la gestión de usuarios al último rol que la tiene. */
function DialogoPermisosRol({ rol, permisos, alCerrar }: { rol: Rol; permisos: Permiso[]; alCerrar: () => void }) {
  const cola = useQueryClient()
  const notificar = useNotificar()
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(rol.permisos))
  const guardar = useMutation({
    mutationFn: () => api.patch<Rol>(`/roles/${rol.id}`, { permisos: [...elegidos].sort() }),
    onSuccess: () => {
      cola.invalidateQueries({ queryKey: ['roles'] })
      notificar(`Permisos del rol ${rol.nombre} actualizados. Aplican desde la próxima acción de sus usuarios.`)
      alCerrar()
    },
  })
  const e = guardar.error instanceof ErrorApi ? guardar.error : null
  const alternar = (codigo: string) =>
    setElegidos((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(codigo)) siguiente.delete(codigo)
      else siguiente.add(codigo)
      return siguiente
    })

  return (
    <Dialogo
      abierto
      ancho
      titulo={`Permisos del rol ${rol.nombre}`}
      descripcion={`${rol.total_usuarios} usuario(s) tienen este rol. Lo que no se marque queda denegado.`}
      alCerrar={alCerrar}
      alEnviar={() => guardar.mutate()}
      enviando={guardar.isPending}
      textoEnviar="Guardar permisos"
    >
      <div className="formulario">
        {guardar.error && <Aviso tono="error">{e?.campo('permisos') ?? mensajeError(guardar.error)}</Aviso>}
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 'var(--s-3)', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          <legend className="solo-lector">Permisos</legend>
          {permisos.map((p) => (
            <label key={p.id} className="casilla">
              <input type="checkbox" checked={elegidos.has(p.codigo)} onChange={() => alternar(p.codigo)} />
              <span>
                {p.descripcion || p.codigo}
                <span className="pequeno texto-3" style={{ display: 'block' }}>
                  {p.codigo}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </Dialogo>
  )
}
