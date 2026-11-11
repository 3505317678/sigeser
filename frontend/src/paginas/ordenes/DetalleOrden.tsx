import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, descargar } from '../../api/cliente'
import type { Accion, OrdenDetalle } from '../../api/tipos'
import { useNotificar } from '../../componentes/Notificaciones'
import {
  AvisoError,
  Boton,
  Cargando,
  Encabezado,
  FechaEstimada,
  Icono,
  Insignia,
  InsigniaEstado,
  InsigniaPrioridad,
  mensajeError,
  Vacio,
} from '../../componentes/ui'
import { ACCIONES, NOMBRE_ESTADO, ORDEN_ACCIONES, PASOS_RIEL, pasoDelRiel } from '../../dominio/ordenes'
import { formatoFechaHora, formatoMoneda, haceCuanto } from '../../util/formato'
import { useTitulo } from '../../util/hooks'
import { ACCIONES_DIRECTAS, DialogoAccion, useAccionOrden } from './AccionesOrden'
import { DiagramaEquipo } from './DiagramaEquipo'
import { FotosOrden } from './FotosOrden'
import { NotasVoz } from './NotasVoz'
import { ProgresoOrden } from './ProgresoOrden'

export function DetalleOrden() {
  const id = Number(useParams().id)
  const consulta = useQuery({ queryKey: ['orden', id], queryFn: () => api.get<OrdenDetalle>(`/ordenes/${id}`), enabled: Number.isFinite(id) })
  useTitulo(consulta.data ? `Orden ${consulta.data.codigo}` : 'Orden de servicio')

  if (consulta.isPending) return <Cargando texto="Cargando la orden…" />
  if (consulta.error) {
    return (
      <>
        <Encabezado titulo="Orden de servicio" migas={<Link to="/ordenes">Órdenes de servicio</Link>} />
        <AvisoError error={consulta.error} reintentar={() => consulta.refetch()} />
      </>
    )
  }
  return <ContenidoOrden orden={consulta.data} />
}

function ContenidoOrden({ orden }: { orden: OrdenDetalle }) {
  const estado = orden.estado ?? 'RECIBIDA'
  const [accionAbierta, setAccionAbierta] = useState<Accion | null>(null)
  const directa = useAccionOrden(orden)
  const notificar = useNotificar()
  const cola = useQueryClient()
  const devolver = useMutation({
    mutationFn: (usoId: number) => api.post(`/ordenes/${orden.id}/repuestos/${usoId}/devolver`),
    onSuccess: () => {
      cola.invalidateQueries({ queryKey: ['orden', orden.id] })
      cola.invalidateQueries({ queryKey: ['repuestos'] })
      notificar('Repuesto devuelto al inventario.')
    },
    onError: (e) => notificar(mensajeError(e), 'error'),
  })

  const acciones = ORDEN_ACCIONES.filter((a) => orden.acciones.includes(a))
  const avance = acciones.filter((a) => ACCIONES[a].tipo === 'avance')
  const gestion = acciones.filter((a) => ACCIONES[a].tipo !== 'avance')
  const puedeEditarRepuestos = orden.acciones.includes('agregar_repuesto')

  const ejecutar = (accion: Accion) => {
    if (ACCIONES_DIRECTAS.includes(accion)) directa.mutate({ accion })
    else setAccionAbierta(accion)
  }

  const bajarComprobante = async (tipo: 'recepcion' | 'entrega') => {
    try {
      await descargar(`/ordenes/${orden.id}/comprobante`, { tipo }, `${orden.codigo}-${tipo}.pdf`)
    } catch (e) {
      notificar(mensajeError(e), 'error')
    }
  }

  const paso = pasoDelRiel(estado)
  const cancelada = estado === 'CANCELADA'

  return (
    <>
      <Encabezado
        migas={
          <>
            <Link to="/ordenes">Órdenes de servicio</Link>
            <span aria-hidden="true">/</span>
            <span>{orden.codigo}</span>
          </>
        }
        titulo={<span className="solo-lector">Orden {orden.codigo}</span>}
      />

      <section className={`ficha estado-${estado}`} aria-label="Resumen de la orden">
        <p className="ficha__codigo">{orden.codigo}</p>
        <div className="ficha__resumen">
          <div className="fila">
            <InsigniaEstado estado={estado} />
            <InsigniaPrioridad prioridad={orden.prioridad ?? 'MEDIA'} />
            {orden.vencida && (
              <span className="vencida">
                <Icono nombre="alarm" /> Entrega vencida
              </span>
            )}
          </div>
          <strong>{orden.equipo_resumen}</strong>
          <span className="texto-2">
            {orden.cliente_nombre}, {orden.cliente_documento}, tel. {orden.cliente_telefono}
          </span>
        </div>
        <div className="ficha__total">
          <span>Total de la orden</span>
          <strong>{formatoMoneda(orden.total)}</strong>
        </div>
      </section>

      {!cancelada && (
        <section className="panel panel__cuerpo" aria-label="Avance de la orden">
          <ProgresoOrden estado={estado} />
          <ol className={`riel estado-${estado}`}>
            {PASOS_RIEL.map((p, i) => (
              <li
                key={p.estado}
                className={i < paso || estado === 'ENTREGADA' ? 'riel--hecho' : i === paso ? 'riel--actual' : undefined}
                aria-current={i === paso ? 'step' : undefined}
              >
                {i === paso && estado === 'EN_ESPERA_REPUESTOS' ? 'En espera de repuestos' : p.nombre}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="rejilla-2">
        <div className="pila">
          {cancelada && orden.motivo_cancelacion && (
            <div className="aviso aviso--error" role="status">
              <Icono nombre="x-octagon" />
              <div>
                <strong>Orden cancelada.</strong> {orden.motivo_cancelacion}
              </div>
            </div>
          )}

          <section className="panel" aria-labelledby="t-recepcion">
            <div className="panel__cabecera">
              <h2 id="t-recepcion">Recepción del equipo</h2>
            </div>
            <dl className="panel__cuerpo datos">
              <div className="datos--ancho">
                <dt>Falla reportada por el cliente</dt>
                <dd>{orden.falla_reportada}</dd>
              </div>
              <div>
                <dt>Accesorios</dt>
                <dd>{orden.accesorios || 'Ninguno'}</dd>
              </div>
              <div>
                <dt>Estado físico</dt>
                <dd>{orden.estado_fisico || 'Sin observaciones'}</dd>
              </div>
              <div>
                <dt>Serial</dt>
                <dd>{orden.equipo_serial || 'Sin serial'}</dd>
              </div>
              <div>
                <dt>Recibida</dt>
                <dd>{formatoFechaHora(orden.fecha_recepcion)}</dd>
              </div>
              <div>
                <dt>Entrega prometida</dt>
                <dd>
                  <FechaEstimada fecha={orden.fecha_estimada_entrega} vencida={orden.vencida} />
                </dd>
              </div>
              <div>
                <dt>Técnico</dt>
                <dd>{orden.tecnico_nombre || 'Sin asignar'}</dd>
              </div>
              {orden.fecha_entrega && (
                <div>
                  <dt>Entregada</dt>
                  <dd>
                    {formatoFechaHora(orden.fecha_entrega)}, a {orden.recibido_por}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <FotosOrden orden={orden} />

          <DiagramaEquipo orden={orden} />

          <NotasVoz orden={orden} />

          <section className="panel" aria-labelledby="t-diagnostico">
            <div className="panel__cabecera">
              <h2 id="t-diagnostico">Diagnóstico y presupuesto</h2>
              {orden.diagnostico && (
                <Insignia tono={orden.diagnostico.aprobado === null ? 'aviso' : orden.diagnostico.aprobado ? 'exito' : 'error'}>
                  {orden.diagnostico.aprobado === null ? 'Esperando al cliente' : orden.diagnostico.aprobado ? 'Aprobado' : 'Rechazado'}
                </Insignia>
              )}
            </div>
            {orden.diagnostico ? (
              <dl className="panel__cuerpo datos">
                <div className="datos--ancho">
                  <dt>Diagnóstico</dt>
                  <dd>{orden.diagnostico.descripcion}</dd>
                </div>
                {orden.diagnostico.causa_probable && (
                  <div className="datos--ancho">
                    <dt>Causa probable</dt>
                    <dd>{orden.diagnostico.causa_probable}</dd>
                  </div>
                )}
                <div className="datos--ancho">
                  <dt>Solución propuesta</dt>
                  <dd>{orden.diagnostico.solucion_propuesta}</dd>
                </div>
                <div>
                  <dt>Presupuesto de mano de obra</dt>
                  <dd>{formatoMoneda(orden.diagnostico.costo_estimado)}</dd>
                </div>
                <div>
                  <dt>Registrado por</dt>
                  <dd>
                    {orden.diagnostico.tecnico_nombre}, {haceCuanto(orden.diagnostico.fecha)}
                  </dd>
                </div>
              </dl>
            ) : (
              <Vacio icono="clipboard2-pulse" titulo="Aún no hay diagnóstico">
                {orden.tecnico_nombre ? `${orden.tecnico_nombre} lo registrará al revisar el equipo.` : 'Asigne un técnico para que revise el equipo.'}
              </Vacio>
            )}
          </section>

          <section className="panel" aria-labelledby="t-trabajo">
            <div className="panel__cabecera">
              <h2 id="t-trabajo">Trabajo realizado</h2>
            </div>
            {orden.actividades.length === 0 ? (
              <Vacio icono="tools" titulo="Sin actividades registradas" />
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Actividad</th>
                      <th scope="col">Técnico</th>
                      <th scope="col" className="num">
                        Horas
                      </th>
                      <th scope="col">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orden.actividades.map((a) => (
                      <tr key={a.id}>
                        <td>{a.descripcion}</td>
                        <td>{a.tecnico_nombre}</td>
                        <td className="num">{Number(a.horas_empleadas).toLocaleString('es-CO')}</td>
                        <td className="texto-2">{formatoFechaHora(a.fecha_inicio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="t-repuestos">
            <div className="panel__cabecera">
              <h2 id="t-repuestos">Repuestos y costos</h2>
            </div>
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Repuesto</th>
                    <th scope="col" className="num">
                      Cantidad
                    </th>
                    <th scope="col" className="num">
                      Precio unitario
                    </th>
                    <th scope="col" className="num">
                      Subtotal
                    </th>
                    {puedeEditarRepuestos && (
                      <th scope="col">
                        <span className="solo-lector">Acciones</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {orden.repuestos.length === 0 && (
                    <tr>
                      <td colSpan={puedeEditarRepuestos ? 5 : 4} className="texto-3">
                        Esta orden no tiene repuestos.
                      </td>
                    </tr>
                  )}
                  {orden.repuestos.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.codigo}</strong> <span className="texto-2">{r.nombre}</span>
                      </td>
                      <td className="num">{r.cantidad}</td>
                      <td className="num">{formatoMoneda(r.precio_unitario)}</td>
                      <td className="num">{formatoMoneda(r.subtotal)}</td>
                      {puedeEditarRepuestos && (
                        <td className="acciones-celda">
                          <Boton
                            pequeno
                            variante="fantasma"
                            icono="arrow-counterclockwise"
                            cargando={devolver.isPending && devolver.variables === r.id}
                            onClick={() => devolver.mutate(r.id)}
                          >
                            Devolver
                          </Boton>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Mano de obra</td>
                    <td className="num">{formatoMoneda(orden.costo_mano_obra)}</td>
                    {puedeEditarRepuestos && <td />}
                  </tr>
                  <tr>
                    <td colSpan={3}>Repuestos</td>
                    <td className="num">{formatoMoneda(orden.total_repuestos)}</td>
                    {puedeEditarRepuestos && <td />}
                  </tr>
                  <tr>
                    <td colSpan={3}>Total</td>
                    <td className="num cifra" style={{ fontSize: 'var(--t-lg)' }}>
                      {formatoMoneda(orden.total)}
                    </td>
                    {puedeEditarRepuestos && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>

        <aside className="pila" aria-label="Acciones e historial">
          <section className="panel" aria-labelledby="t-acciones">
            <div className="panel__cabecera">
              <h2 id="t-acciones">Siguiente paso</h2>
            </div>
            <div className="panel__cuerpo acciones-orden">
              {acciones.length === 0 && (
                <p className="texto-2">
                  {estado === 'ENTREGADA' || cancelada
                    ? `La orden está ${NOMBRE_ESTADO[estado].toLowerCase()} y ya no admite cambios.`
                    : 'No hay acciones disponibles para su rol en esta etapa.'}
                </p>
              )}
              {avance.map((a, i) => (
                <Boton
                  key={a}
                  variante={i === 0 ? 'primario' : 'secundario'}
                  icono={ACCIONES[a].icono}
                  cargando={directa.isPending && directa.variables?.accion === a}
                  onClick={() => ejecutar(a)}
                >
                  {ACCIONES[a].etiqueta}
                </Boton>
              ))}
              {gestion.map((a) => (
                <Boton
                  key={a}
                  variante={ACCIONES[a].tipo === 'peligro' ? 'peligro' : 'fantasma'}
                  icono={ACCIONES[a].icono}
                  onClick={() => ejecutar(a)}
                >
                  {ACCIONES[a].etiqueta}
                </Boton>
              ))}
            </div>
            <div className="panel__cuerpo acciones-orden" style={{ borderTop: '1px solid var(--c-borde)' }}>
              <Boton variante="fantasma" icono="file-earmark-pdf" onClick={() => bajarComprobante('recepcion')}>
                Comprobante de recepción
              </Boton>
              {estado === 'ENTREGADA' && (
                <Boton variante="fantasma" icono="file-earmark-check" onClick={() => bajarComprobante('entrega')}>
                  Comprobante de entrega
                </Boton>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="t-historial">
            <div className="panel__cabecera">
              <h2 id="t-historial">Historial</h2>
            </div>
            <div className="panel__cuerpo">
              <ol className="linea-tiempo">
                {[...orden.historial].reverse().map((h) => (
                  <li key={h.id} className={`estado-${h.estado_nuevo}`}>
                    <strong>{NOMBRE_ESTADO[h.estado_nuevo]}</strong>
                    <span className="pequeno texto-2">
                      {formatoFechaHora(h.fecha)}, {h.usuario_nombre}
                    </span>
                    {h.observacion && <span className="pequeno">{h.observacion}</span>}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </aside>
      </div>

      {accionAbierta && <DialogoAccion orden={orden} accion={accionAbierta} alCerrar={() => setAccionAbierta(null)} />}
    </>
  )
}
