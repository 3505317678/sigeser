import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ErrorApi } from '../api/cliente'
import type { Paginado, Tecnico, Usuario } from '../api/tipos'
import { Dialogo } from '../componentes/Dialogo'
import { useNotificar } from '../componentes/Notificaciones'
import { Aviso, AvisoError, Boton, Campo, Encabezado, FilasCargando, Insignia, mensajeError, Vacio } from '../componentes/ui'
import { useSesion } from '../sesion/Sesion'
import { useTitulo } from '../util/hooks'

export function Tecnicos() {
  useTitulo('Técnicos')
  const { puede } = useSesion()
  const gestiona = puede('tecnicos.gestionar')
  const cola = useQueryClient()
  const notificar = useNotificar()
  const [dialogo, setDialogo] = useState<{ tecnico?: Tecnico } | null>(null)
  const consulta = useQuery({ queryKey: ['tecnicos'], queryFn: () => api.get<Tecnico[]>('/tecnicos') })
  const disponibilidad = useMutation({
    mutationFn: (t: Tecnico) => api.patch<Tecnico>(`/tecnicos/${t.id}`, { disponible: !t.disponible }),
    onSuccess: (t) => {
      cola.invalidateQueries({ queryKey: ['tecnicos'] })
      notificar(t.disponible ? `${t.nombre} vuelve a recibir órdenes.` : `${t.nombre} no recibirá órdenes nuevas.`)
    },
    onError: (e) => notificar(mensajeError(e), 'error'),
  })

  return (
    <>
      <Encabezado
        titulo="Técnicos"
        descripcion="Personal que diagnostica y repara los equipos. Solo los técnicos disponibles se ofrecen al asignar una orden."
        acciones={
          gestiona && (
            <Boton variante="primario" icono="person-plus" onClick={() => setDialogo({})}>
              Registrar técnico
            </Boton>
          )
        }
      />
      <section className="panel">
        {consulta.error ? (
          <div className="panel__cuerpo">
            <AvisoError error={consulta.error} reintentar={() => consulta.refetch()} />
          </div>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lector">Técnicos</caption>
              <thead>
                <tr>
                  <th scope="col">Técnico</th>
                  <th scope="col">Especialidad</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col" className="num">
                    Órdenes activas
                  </th>
                  <th scope="col">Disponibilidad</th>
                  {gestiona && (
                    <th scope="col">
                      <span className="solo-lector">Acciones</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {consulta.isPending ? (
                  <FilasCargando columnas={gestiona ? 6 : 5} filas={3} />
                ) : (
                  consulta.data?.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.nombre}</strong>
                        <div className="pequeno texto-2">{t.correo}</div>
                      </td>
                      <td>{t.especialidad}</td>
                      <td>{t.telefono || <span className="texto-3">No registrado</span>}</td>
                      <td className="num cifra" style={{ fontSize: 'var(--t-lg)' }}>
                        {t.ordenes_activas}
                      </td>
                      <td>{t.disponible ? <Insignia tono="exito">Disponible</Insignia> : <Insignia tono="neutro">No disponible</Insignia>}</td>
                      {gestiona && (
                        <td className="acciones-celda">
                          <Boton pequeno variante="fantasma" icono="pencil" onClick={() => setDialogo({ tecnico: t })}>
                            Editar
                          </Boton>
                          <Boton
                            pequeno
                            variante="fantasma"
                            cargando={disponibilidad.isPending && disponibilidad.variables?.id === t.id}
                            onClick={() => disponibilidad.mutate(t)}
                          >
                            {t.disponible ? 'Marcar no disponible' : 'Marcar disponible'}
                          </Boton>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {consulta.data?.length === 0 && (
              <Vacio icono="person-gear" titulo="Aún no hay técnicos">
                Cree primero un usuario con el rol Técnico y luego regístrelo aquí con su especialidad.
              </Vacio>
            )}
          </div>
        )}
      </section>
      {dialogo && <DialogoTecnico tecnico={dialogo.tecnico} alCerrar={() => setDialogo(null)} />}
    </>
  )
}

function DialogoTecnico({ tecnico, alCerrar }: { tecnico?: Tecnico; alCerrar: () => void }) {
  const cola = useQueryClient()
  const notificar = useNotificar()
  const [datos, setDatos] = useState({
    usuario: tecnico ? String(tecnico.usuario) : '',
    especialidad: tecnico?.especialidad ?? '',
    telefono: tecnico?.telefono ?? '',
  })
  // Candidatos: usuarios activos con rol Técnico que aún no tienen ficha de técnico.
  const candidatos = useQuery({
    queryKey: ['usuarios', 'candidatos-tecnico'],
    queryFn: () => api.get<Paginado<Usuario>>('/usuarios', { activo: true, tamano: 100 }),
    enabled: !tecnico,
    select: (p) => p.results.filter((u) => u.rol_nombre === 'Técnico' && !u.es_tecnico),
  })
  const guardar = useMutation({
    mutationFn: () =>
      tecnico
        ? api.patch<Tecnico>(`/tecnicos/${tecnico.id}`, { especialidad: datos.especialidad, telefono: datos.telefono })
        : api.post<Tecnico>('/tecnicos', { ...datos, usuario: Number(datos.usuario) || null }),
    onSuccess: () => {
      cola.invalidateQueries({ queryKey: ['tecnicos'] })
      cola.invalidateQueries({ queryKey: ['usuarios'] })
      notificar(tecnico ? 'Datos del técnico actualizados.' : 'Técnico registrado.')
      alCerrar()
    },
  })
  const e = guardar.error instanceof ErrorApi ? guardar.error : null
  const poner = (campo: keyof typeof datos) => (ev: { target: { value: string } }) => setDatos({ ...datos, [campo]: ev.target.value })

  return (
    <Dialogo
      abierto
      titulo={tecnico ? `Editar a ${tecnico.nombre}` : 'Registrar técnico'}
      alCerrar={alCerrar}
      alEnviar={() => guardar.mutate()}
      enviando={guardar.isPending}
      textoEnviar={tecnico ? 'Guardar cambios' : 'Registrar técnico'}
    >
      <div className="formulario">
        {guardar.error && (!e || Object.keys(e.errores).length === 0) && <Aviso tono="error">{mensajeError(guardar.error)}</Aviso>}
        {!tecnico && (
          <Campo etiqueta="Usuario" obligatorio error={e?.campo('usuario')} ayuda="Solo aparecen usuarios con rol Técnico que aún no tienen ficha.">
            <select className="control" value={datos.usuario} onChange={poner('usuario')} autoFocus>
              <option value="">Elija un usuario</option>
              {candidatos.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre_completo} ({u.correo})
                </option>
              ))}
            </select>
          </Campo>
        )}
        {!tecnico && candidatos.data?.length === 0 && (
          <Aviso tono="info">No hay usuarios pendientes. Cree un usuario con el rol Técnico en Usuarios y roles.</Aviso>
        )}
        <Campo etiqueta="Especialidad" obligatorio error={e?.campo('especialidad')}>
          <input className="control" value={datos.especialidad} onChange={poner('especialidad')} placeholder="Por ejemplo: celulares y tabletas" />
        </Campo>
        <Campo etiqueta="Teléfono" error={e?.campo('telefono')}>
          <input className="control" type="tel" value={datos.telefono} onChange={poner('telefono')} />
        </Campo>
      </div>
    </Dialogo>
  )
}
