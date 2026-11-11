import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import type { Cliente, ClienteLista, Equipo, OrdenLista, Paginado } from '../api/tipos'
import { Dialogo } from '../componentes/Dialogo'
import { DialogoCliente, DialogoEquipo } from '../componentes/FormulariosCliente'
import {
  AvisoError,
  Boton,
  Cargando,
  Encabezado,
  FilasCargando,
  Icono,
  Insignia,
  InsigniaEstado,
  Paginacion,
  Vacio,
} from '../componentes/ui'
import { useSesion } from '../sesion/Sesion'
import { formatoFecha, formatoFechaHora } from '../util/formato'
import { useFiltrosUrl, useRetardado, useTitulo } from '../util/hooks'

const TAMANO = 20

export function ListaClientes() {
  useTitulo('Clientes y equipos')
  const { puede } = useSesion()
  const navegar = useNavigate()
  const [filtros, cambiar] = useFiltrosUrl({ buscar: '', pagina: '1' })
  const [texto, setTexto] = useState(filtros.buscar)
  const buscar = useRetardado(texto)
  const [registrando, setRegistrando] = useState(false)

  useEffect(() => {
    if (buscar !== filtros.buscar) cambiar({ buscar })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar])

  const pagina = Number(filtros.pagina) || 1
  const params = { search: filtros.buscar || undefined, page: pagina, tamano: TAMANO }
  const consulta = useQuery({
    queryKey: ['clientes', params],
    queryFn: ({ signal }) => api.get<Paginado<ClienteLista>>('/clientes', params, signal),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <Encabezado
        titulo="Clientes y equipos"
        descripcion="Personas y empresas que han traído equipos al taller, con el historial de cada equipo."
        acciones={
          puede('clientes.gestionar') && (
            <Boton variante="primario" icono="person-plus" onClick={() => setRegistrando(true)}>
              Registrar cliente
            </Boton>
          )
        }
      />
      <section className="panel">
        <div className="barra-herramientas" role="search">
          <label className="buscador">
            <span className="solo-lector">Buscar clientes</span>
            <Icono nombre="search" />
            <input
              className="control"
              type="search"
              placeholder="Nombre, documento, teléfono o correo"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
        </div>
        {consulta.error ? (
          <div className="panel__cuerpo">
            <AvisoError error={consulta.error} reintentar={() => consulta.refetch()} />
          </div>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lector">Clientes</caption>
                <thead>
                  <tr>
                    <th scope="col">Cliente</th>
                    <th scope="col">Documento</th>
                    <th scope="col">Contacto</th>
                    <th scope="col" className="num">
                      Equipos
                    </th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {consulta.isPending ? (
                    <FilasCargando columnas={5} />
                  ) : (
                    consulta.data?.results.map((c) => (
                      <tr key={c.id} className="tabla__fila-enlace" onClick={() => navegar(`/clientes/${c.id}`)}>
                        <td>
                          <Link to={`/clientes/${c.id}`} onClick={(e) => e.stopPropagation()}>
                            <strong>{c.nombre}</strong>
                          </Link>
                        </td>
                        <td>
                          {c.tipo_documento} {c.numero_documento}
                        </td>
                        <td>
                          <div>{c.telefono}</div>
                          {c.correo && <div className="pequeno texto-2">{c.correo}</div>}
                        </td>
                        <td className="num">{c.total_equipos}</td>
                        <td>{c.activo === false ? <Insignia tono="neutro">Inactivo</Insignia> : <Insignia tono="exito">Activo</Insignia>}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {consulta.data?.count === 0 && (
              <Vacio icono="people" titulo={filtros.buscar ? 'Ningún cliente coincide con la búsqueda' : 'Aún no hay clientes'}>
                {filtros.buscar ? 'Revise el dato escrito o registre al cliente.' : 'Los clientes se registran al recibir su primer equipo.'}
              </Vacio>
            )}
            <Paginacion pagina={pagina} total={consulta.data?.count ?? 0} tamano={TAMANO} alCambiar={(p) => cambiar({ pagina: String(p) }, false)} />
          </>
        )}
      </section>
      {registrando && <DialogoCliente abierto alCerrar={() => setRegistrando(false)} alGuardar={(c) => navegar(`/clientes/${c.id}`)} />}
    </>
  )
}

export function DetalleCliente() {
  const id = Number(useParams().id)
  const { puede } = useSesion()
  const navegar = useNavigate()
  const [dialogo, setDialogo] = useState<'editar' | 'equipo' | null>(null)
  const [equipoEditado, setEquipoEditado] = useState<Equipo | null>(null)
  const [historial, setHistorial] = useState<Equipo | null>(null)
  const consulta = useQuery({ queryKey: ['cliente', id], queryFn: () => api.get<Cliente>(`/clientes/${id}`) })
  useTitulo(consulta.data?.nombre ?? 'Cliente')

  if (consulta.isPending) return <Cargando />
  if (consulta.error) return <AvisoError error={consulta.error} reintentar={() => consulta.refetch()} />
  const c = consulta.data
  const gestiona = puede('clientes.gestionar')

  return (
    <>
      <Encabezado
        migas={
          <>
            <Link to="/clientes">Clientes y equipos</Link>
            <span aria-hidden="true">/</span>
            <span>{c.nombre}</span>
          </>
        }
        titulo={c.nombre}
        descripcion={`${c.tipo_documento} ${c.numero_documento}. Cliente desde ${formatoFecha(c.creado_en)}.`}
        acciones={
          <>
            {gestiona && (
              <Boton icono="pencil" onClick={() => setDialogo('editar')}>
                Editar datos
              </Boton>
            )}
            {puede('ordenes.crear') && (
              <Boton variante="primario" icono="clipboard2-plus" onClick={() => navegar('/ordenes/nueva')}>
                Registrar orden
              </Boton>
            )}
          </>
        }
      />
      <div className="rejilla-2">
        <section className="panel" aria-labelledby="t-equipos">
          <div className="panel__cabecera">
            <h2 id="t-equipos">Equipos</h2>
            {gestiona && (
              <Boton pequeno icono="laptop" onClick={() => setDialogo('equipo')}>
                Registrar equipo
              </Boton>
            )}
          </div>
          {c.equipos.length === 0 ? (
            <Vacio icono="laptop" titulo="Sin equipos registrados" />
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Equipo</th>
                    <th scope="col">Serial</th>
                    <th scope="col" className="num">
                      Servicios
                    </th>
                    <th scope="col">
                      <span className="solo-lector">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.equipos.map((eq) => (
                    <tr key={eq.id}>
                      <td>
                        <strong>
                          {eq.tipo} {eq.marca} {eq.modelo}
                        </strong>
                        {eq.descripcion && <div className="pequeno texto-2">{eq.descripcion}</div>}
                      </td>
                      <td>{eq.serial || <span className="texto-3">Sin serial</span>}</td>
                      <td className="num">{eq.total_ordenes}</td>
                      <td className="acciones-celda">
                        <Boton pequeno variante="fantasma" icono="clock-history" onClick={() => setHistorial(eq)}>
                          Historial
                        </Boton>
                        {gestiona && (
                          <Boton pequeno variante="fantasma" icono="pencil" aria-label={`Editar ${eq.marca} ${eq.modelo}`} onClick={() => setEquipoEditado(eq)} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel" aria-labelledby="t-contacto">
          <div className="panel__cabecera">
            <h2 id="t-contacto">Contacto</h2>
          </div>
          <dl className="panel__cuerpo datos" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <dt>Teléfono</dt>
              <dd>{c.telefono}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{c.correo || 'No registrado'}</dd>
            </div>
            <div>
              <dt>Dirección</dt>
              <dd>{c.direccion || 'No registrada'}</dd>
            </div>
            <div>
              <dt>Tratamiento de datos</dt>
              <dd>{c.autoriza_datos ? `Autorizado el ${formatoFechaHora(c.fecha_autorizacion)}` : 'Sin autorización'}</dd>
            </div>
          </dl>
        </section>
      </div>

      {dialogo === 'editar' && <DialogoCliente abierto cliente={c} alCerrar={() => setDialogo(null)} />}
      {dialogo === 'equipo' && <DialogoEquipo abierto clienteId={c.id} alCerrar={() => setDialogo(null)} />}
      {equipoEditado && <DialogoEquipo abierto clienteId={c.id} equipo={equipoEditado} alCerrar={() => setEquipoEditado(null)} />}
      {historial && <HistorialEquipo equipo={historial} alCerrar={() => setHistorial(null)} />}
    </>
  )
}

function HistorialEquipo({ equipo, alCerrar }: { equipo: Equipo; alCerrar: () => void }) {
  const consulta = useQuery({ queryKey: ['equipo', equipo.id, 'historial'], queryFn: () => api.get<OrdenLista[]>(`/equipos/${equipo.id}/historial`) })
  return (
    <Dialogo abierto ancho titulo={`Historial de ${equipo.marca} ${equipo.modelo}`} descripcion={equipo.serial ? `Serial ${equipo.serial}` : undefined} alCerrar={alCerrar}>
      {consulta.isPending && <Cargando />}
      {consulta.error && <AvisoError error={consulta.error} />}
      {consulta.data?.length === 0 && <Vacio icono="clock-history" titulo="Este equipo no tiene servicios anteriores" />}
      {!!consulta.data?.length && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Orden</th>
                <th scope="col">Recibida</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link className="codigo-orden" to={`/ordenes/${o.id}`} onClick={alCerrar}>
                      {o.codigo}
                    </Link>
                  </td>
                  <td>{formatoFecha(o.fecha_recepcion)}</td>
                  <td>
                    <InsigniaEstado estado={o.estado ?? 'RECIBIDA'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialogo>
  )
}
