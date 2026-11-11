import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../api/cliente'
import type { OrdenLista, Paginado, Tecnico } from '../../api/tipos'
import { ESTADOS_ACTIVOS, ESTADOS_FINALES, NOMBRE_ESTADO } from '../../dominio/ordenes'
import {
  AvisoError,
  Boton,
  Encabezado,
  FechaEstimada,
  FilasCargando,
  Icono,
  InsigniaEstado,
  InsigniaPrioridad,
  Paginacion,
  Vacio,
} from '../../componentes/ui'
import { useSesion } from '../../sesion/Sesion'
import { formatoFecha } from '../../util/formato'
import { useFiltrosUrl, useRetardado, useTitulo } from '../../util/hooks'

const TAMANO = 20

export function ListaOrdenes() {
  const { usuario, puede } = useSesion()
  const esTecnico = !!usuario?.tecnico_id && !puede('ordenes.ver_todas')
  useTitulo(esTecnico ? 'Mis órdenes' : 'Órdenes de servicio')
  const navegar = useNavigate()
  const [filtros, cambiar] = useFiltrosUrl({
    estado: 'activas',
    vencidas: '',
    prioridad: '',
    tecnico: '',
    desde: '',
    hasta: '',
    buscar: '',
    pagina: '1',
  })
  const verTecnicos = !esTecnico && puede('tecnicos.ver', 'tecnicos.gestionar')
  const tecnicos = useQuery({ queryKey: ['tecnicos'], queryFn: () => api.get<Tecnico[]>('/tecnicos'), enabled: verTecnicos })
  const [texto, setTexto] = useState(filtros.buscar)
  const buscar = useRetardado(texto)
  useEffect(() => {
    if (buscar !== filtros.buscar) cambiar({ buscar })
    // Solo se sincroniza cuando cambia el texto ya retardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar])

  const pagina = Number(filtros.pagina) || 1
  const params = {
    activas: filtros.estado === 'activas' ? true : undefined,
    estado: filtros.estado !== 'activas' && filtros.estado !== 'todas' ? filtros.estado : undefined,
    vencidas: filtros.vencidas === 'true' ? true : undefined,
    prioridad: filtros.prioridad || undefined,
    tecnico: filtros.tecnico || undefined,
    desde: filtros.desde || undefined,
    hasta: filtros.hasta || undefined,
    search: filtros.buscar || undefined,
    ordering: filtros.estado === 'activas' ? 'fecha_estimada_entrega' : '-fecha_recepcion',
    page: pagina,
    tamano: TAMANO,
  }
  const consulta = useQuery({
    queryKey: ['ordenes', params],
    queryFn: ({ signal }) => api.get<Paginado<OrdenLista>>('/ordenes', params, signal),
    placeholderData: keepPreviousData,
  })
  const hayFiltros =
    filtros.estado !== 'activas' || filtros.vencidas || filtros.prioridad || filtros.tecnico || filtros.desde || filtros.hasta || filtros.buscar

  return (
    <>
      <Encabezado
        titulo={esTecnico ? 'Mis órdenes' : 'Órdenes de servicio'}
        descripcion={
          esTecnico
            ? 'Equipos asignados a usted. Abra una orden para registrar el diagnóstico, las actividades y los repuestos.'
            : 'Busque por código, cliente, documento o serial del equipo.'
        }
        acciones={
          puede('ordenes.crear') && (
            <Boton variante="primario" icono="plus-lg" onClick={() => navegar('/ordenes/nueva')}>
              Registrar orden
            </Boton>
          )
        }
      />

      <section className="panel">
        <div className="barra-herramientas" role="search">
          <label className="buscador">
            <span className="solo-lector">Buscar órdenes</span>
            <Icono nombre="search" />
            <input
              className="control"
              type="search"
              placeholder="Código, cliente, documento o serial"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
          <label className="campo" style={{ minWidth: 210 }}>
            <span className="solo-lector">Estado</span>
            <select className="control" value={filtros.estado} onChange={(e) => cambiar({ estado: e.target.value })}>
              <option value="activas">En el taller (activas)</option>
              {ESTADOS_ACTIVOS.map((e) => (
                <option key={e} value={e}>
                  {NOMBRE_ESTADO[e]}
                </option>
              ))}
              {ESTADOS_FINALES.map((e) => (
                <option key={e} value={e}>
                  {NOMBRE_ESTADO[e]}
                </option>
              ))}
              <option value="todas">Todos los estados</option>
            </select>
          </label>
          <label className="campo" style={{ minWidth: 150 }}>
            <span className="solo-lector">Prioridad</span>
            <select className="control" value={filtros.prioridad} onChange={(e) => cambiar({ prioridad: e.target.value })}>
              <option value="">Cualquier prioridad</option>
              <option value="ALTA">Prioridad alta</option>
              <option value="MEDIA">Prioridad media</option>
              <option value="BAJA">Prioridad baja</option>
            </select>
          </label>
          {verTecnicos && (
            <label className="campo" style={{ minWidth: 190 }}>
              <span className="solo-lector">Técnico</span>
              <select className="control" value={filtros.tecnico} onChange={(e) => cambiar({ tecnico: e.target.value })}>
                <option value="">Todos los técnicos</option>
                {tecnicos.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="fila pequeno">
            Recibidas desde
            <input className="control" style={{ width: 'auto' }} type="date" max={filtros.hasta || undefined} value={filtros.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
          </label>
          <label className="fila pequeno">
            hasta
            <input className="control" style={{ width: 'auto' }} type="date" min={filtros.desde || undefined} value={filtros.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
          </label>
          <button
            type="button"
            className="pastilla-filtro"
            aria-pressed={filtros.vencidas === 'true'}
            onClick={() => cambiar({ vencidas: filtros.vencidas === 'true' ? '' : 'true' })}
          >
            <Icono nombre="alarm" />
            Solo vencidas
          </button>
          {hayFiltros && (
            <Boton
              variante="fantasma"
              pequeno
              onClick={() => {
                setTexto('')
                cambiar({ estado: 'activas', vencidas: '', prioridad: '', tecnico: '', desde: '', hasta: '', buscar: '' })
              }}
            >
              Quitar filtros
            </Boton>
          )}
        </div>

        {consulta.error ? (
          <div className="panel__cuerpo">
            <AvisoError error={consulta.error} reintentar={() => consulta.refetch()} />
          </div>
        ) : (
          <>
            <div className="tabla-contenedor" aria-busy={consulta.isFetching}>
              <table className="tabla">
                <caption className="solo-lector">Órdenes de servicio</caption>
                <thead>
                  <tr>
                    <th scope="col">Orden</th>
                    <th scope="col">Cliente y equipo</th>
                    {!esTecnico && <th scope="col">Técnico</th>}
                    <th scope="col">Estado</th>
                    <th scope="col">Prioridad</th>
                    <th scope="col">Entrega prometida</th>
                    <th scope="col">Recibida</th>
                  </tr>
                </thead>
                <tbody>
                  {consulta.isPending ? (
                    <FilasCargando columnas={esTecnico ? 6 : 7} />
                  ) : (
                    consulta.data?.results.map((o) => (
                      <tr key={o.id} className="tabla__fila-enlace" onClick={() => navegar(`/ordenes/${o.id}`)}>
                        <td>
                          <Link className="codigo-orden" to={`/ordenes/${o.id}`} onClick={(e) => e.stopPropagation()}>
                            {o.codigo}
                          </Link>
                        </td>
                        <td>
                          <div>{o.cliente_nombre}</div>
                          <div className="pequeno texto-2">{o.equipo_resumen}</div>
                        </td>
                        {!esTecnico && <td>{o.tecnico_nombre || <span className="texto-3">Sin asignar</span>}</td>}
                        <td>
                          <InsigniaEstado estado={o.estado ?? 'RECIBIDA'} />
                        </td>
                        <td>
                          <InsigniaPrioridad prioridad={o.prioridad ?? 'MEDIA'} />
                        </td>
                        <td>
                          <FechaEstimada fecha={o.fecha_estimada_entrega} vencida={o.vencida} />
                        </td>
                        <td className="texto-2">{formatoFecha(o.fecha_recepcion)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {consulta.data?.count === 0 && (
              <Vacio icono="clipboard2-x" titulo={hayFiltros ? 'Ninguna orden coincide con los filtros' : 'No hay órdenes activas'}>
                {hayFiltros
                  ? 'Pruebe con otro estado o quite los filtros para ver todas las órdenes.'
                  : esTecnico
                    ? 'Cuando recepción le asigne un equipo, aparecerá aquí.'
                    : 'Registre la primera orden cuando llegue un equipo al mostrador.'}
              </Vacio>
            )}
            <Paginacion
              pagina={pagina}
              total={consulta.data?.count ?? 0}
              tamano={TAMANO}
              alCambiar={(p) => cambiar({ pagina: String(p) }, false)}
            />
          </>
        )}
      </section>
    </>
  )
}
