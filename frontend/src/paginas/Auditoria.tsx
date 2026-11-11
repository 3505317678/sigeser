import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import type { Paginado, RegistroAuditoria } from '../api/tipos'
import { Dialogo } from '../componentes/Dialogo'
import { AvisoError, Boton, Encabezado, FilasCargando, Icono, Insignia, Paginacion, Vacio } from '../componentes/ui'
import { formatoFechaHora } from '../util/formato'
import { useFiltrosUrl, useRetardado, useTitulo } from '../util/hooks'

const TAMANO = 25

const tieneDetalle = (d: unknown): d is Record<string, unknown> =>
  typeof d === 'object' && d !== null && Object.keys(d).length > 0

const TONO_ACCION: Record<string, 'error' | 'aviso' | 'exito' | 'info'> = {
  LOGIN_FALLIDO: 'aviso',
  CUENTA_BLOQUEADA: 'error',
  LOGIN_EXITOSO: 'exito',
  ORDEN_CANCELADA: 'error',
}

export function Auditoria() {
  useTitulo('Auditoría')
  const [filtros, cambiar] = useFiltrosUrl({ buscar: '', desde: '', hasta: '', pagina: '1' })
  const [texto, setTexto] = useState(filtros.buscar)
  const buscar = useRetardado(texto)
  const [detalle, setDetalle] = useState<RegistroAuditoria | null>(null)

  useEffect(() => {
    if (buscar !== filtros.buscar) cambiar({ buscar })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar])

  const pagina = Number(filtros.pagina) || 1
  const params = { search: filtros.buscar || undefined, desde: filtros.desde || undefined, hasta: filtros.hasta || undefined, page: pagina, tamano: TAMANO }
  const consulta = useQuery({
    queryKey: ['auditoria', params],
    queryFn: ({ signal }) => api.get<Paginado<RegistroAuditoria>>('/auditoria', params, signal),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <Encabezado
        titulo="Auditoría"
        descripcion="Registro inalterable de ingresos al sistema y de cada operación sobre órdenes, inventario, clientes y usuarios."
      />
      <section className="panel">
        <div className="barra-herramientas" role="search">
          <label className="buscador">
            <span className="solo-lector">Buscar en la auditoría</span>
            <Icono nombre="search" />
            <input className="control" type="search" placeholder="Acción o entidad, por ejemplo LOGIN u orden" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          <label className="fila pequeno">
            Desde
            <input className="control" style={{ width: 'auto' }} type="date" value={filtros.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
          </label>
          <label className="fila pequeno">
            Hasta
            <input className="control" style={{ width: 'auto' }} type="date" value={filtros.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
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
                <caption className="solo-lector">Registros de auditoría</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Usuario</th>
                    <th scope="col">Acción</th>
                    <th scope="col">Entidad</th>
                    <th scope="col">Dirección IP</th>
                    <th scope="col">
                      <span className="solo-lector">Detalle</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {consulta.isPending ? (
                    <FilasCargando columnas={6} />
                  ) : (
                    consulta.data?.results.map((r) => (
                      <tr key={r.id}>
                        <td className="texto-2" style={{ whiteSpace: 'nowrap' }}>
                          {formatoFechaHora(r.fecha)}
                        </td>
                        <td>{r.usuario_nombre || <span className="texto-3">Anónimo</span>}</td>
                        <td>
                          <Insignia tono={TONO_ACCION[r.accion] ?? 'info'}>{r.accion}</Insignia>
                        </td>
                        <td>
                          {r.entidad}
                          {r.entidad_id ? <span className="texto-3"> #{r.entidad_id}</span> : null}
                        </td>
                        <td className="texto-2">{r.ip || '—'}</td>
                        <td className="acciones-celda">
                          {tieneDetalle(r.detalle) && (
                            <Boton pequeno variante="fantasma" onClick={() => setDetalle(r)}>
                              Ver detalle
                            </Boton>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {consulta.data?.count === 0 && <Vacio icono="journal-text" titulo="No hay registros con esos filtros" />}
            <Paginacion pagina={pagina} total={consulta.data?.count ?? 0} tamano={TAMANO} alCambiar={(p) => cambiar({ pagina: String(p) }, false)} />
          </>
        )}
      </section>
      {detalle && (
        <Dialogo abierto titulo={detalle.accion} descripcion={`${formatoFechaHora(detalle.fecha)}, ${detalle.usuario_nombre || 'anónimo'}`} alCerrar={() => setDetalle(null)}>
          <dl className="datos" style={{ gridTemplateColumns: '1fr' }}>
            {Object.entries(tieneDetalle(detalle.detalle) ? detalle.detalle : {}).map(([clave, valor]) => (
              <div key={clave}>
                <dt>{clave}</dt>
                <dd>{typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}</dd>
              </div>
            ))}
          </dl>
        </Dialogo>
      )}
    </>
  )
}
