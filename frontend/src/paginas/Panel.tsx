import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import type { Dashboard } from '../api/tipos'
import { ESTADOS_ACTIVOS, NOMBRE_ESTADO } from '../dominio/ordenes'
import { AvisoError, Boton, Cargando, Encabezado, FechaEstimada, Icono, InsigniaEstado, Vacio } from '../componentes/ui'
import { useSesion } from '../sesion/Sesion'
import { formatoMoneda, formatoNumero } from '../util/formato'
import { useTitulo } from '../util/hooks'

const fechaLarga = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' })

export function Panel() {
  useTitulo('Panel')
  const { puede } = useSesion()
  const navegar = useNavigate()
  const [hoy] = useState(() => fechaLarga.format(new Date()))
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['panel'],
    queryFn: () => api.get<Dashboard>('/reportes/dashboard'),
    refetchInterval: 60_000,
  })

  const acciones = puede('ordenes.crear') && (
    <Boton variante="primario" icono="plus-lg" onClick={() => navegar('/ordenes/nueva')}>
      Registrar orden
    </Boton>
  )

  return (
    <>
      <Encabezado titulo="Panel del taller" descripcion={`Situación de hoy, ${hoy}.`} acciones={acciones} />
      {isPending && <Cargando />}
      {error && <AvisoError error={error} reintentar={() => refetch()} />}
      {data && <ContenidoPanel datos={data} />}
    </>
  )
}

function ContenidoPanel({ datos }: { datos: Dashboard }) {
  const conteo = Object.fromEntries(datos.por_estado.map((e) => [e.estado, e.total]))
  const maxCarga = Math.max(1, ...datos.carga_tecnicos.map((t) => t.activas))

  return (
    <>
      <section aria-labelledby="titulo-tablero" className="pila pila--compacta">
        <h2 id="titulo-tablero" className="solo-lector">
          Órdenes activas por etapa
        </h2>
        <div className="tablero">
          {ESTADOS_ACTIVOS.map((estado, i) => {
            const total = conteo[estado] ?? 0
            return (
              <Link
                key={estado}
                to={`/ordenes?estado=${estado}`}
                className={`tablero__estado estado-${estado}${total === 0 ? ' tablero__estado--vacio' : ''}`}
                aria-label={`${NOMBRE_ESTADO[estado]}: ${total} órdenes. Ver la lista`}
              >
                <span className="tablero__paso">Etapa {i + 1}</span>
                <span className="tablero__nombre">{NOMBRE_ESTADO[estado]}</span>
                <span className="tablero__cifra">{total}</span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="indicadores" aria-label="Indicadores del mes">
        <div className="indicador">
          <span>Órdenes en el taller</span>
          <strong>{formatoNumero(datos.ordenes_activas)}</strong>
          <small>sin entregar ni cancelar</small>
        </div>
        <div className="indicador">
          <span>Con la fecha de entrega vencida</span>
          <strong style={{ color: datos.vencidas_total ? 'var(--c-senal-texto)' : undefined }}>{formatoNumero(datos.vencidas_total)}</strong>
          <small>{datos.vencidas_total ? 'requieren seguimiento' : 'todo al día'}</small>
        </div>
        <div className="indicador">
          <span>Entregadas este mes</span>
          <strong>{formatoNumero(datos.entregadas_mes)}</strong>
          <small>equipos devueltos al cliente</small>
        </div>
        <div className="indicador">
          <span>Ingresos del mes</span>
          <strong>{formatoMoneda(datos.ingresos_mes)}</strong>
          <small>mano de obra y repuestos</small>
        </div>
      </section>

      <div className="rejilla-2">
        <section className={`panel${datos.vencidas_total ? ' panel--atencion' : ''}`} aria-labelledby="titulo-vencidas">
          <div className="panel__cabecera">
            <h2 id="titulo-vencidas">Entregas vencidas</h2>
            {datos.vencidas_total > 0 && (
              <Link to="/ordenes?vencidas=true" className="pequeno">
                Ver las {datos.vencidas_total}
              </Link>
            )}
          </div>
          {datos.vencidas.length === 0 ? (
            <Vacio icono="calendar-check" titulo="No hay entregas vencidas">
              Todas las órdenes activas están dentro de la fecha prometida al cliente.
            </Vacio>
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Orden</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Prometida para</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.vencidas.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link className="codigo-orden" to={`/ordenes/${o.id}`}>
                          {o.codigo}
                        </Link>
                      </td>
                      <td>{o.cliente}</td>
                      <td>
                        <FechaEstimada fecha={o.fecha_estimada_entrega} vencida />
                      </td>
                      <td>
                        <InsigniaEstado estado={o.estado} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="pila">
        <section className="panel" aria-labelledby="titulo-carga">
          <div className="panel__cabecera">
            <h2 id="titulo-carga">Carga por técnico</h2>
            <span className="pequeno texto-3">órdenes activas</span>
          </div>
          {datos.carga_tecnicos.length === 0 ? (
            <Vacio icono="person-gear" titulo="Aún no hay técnicos registrados" />
          ) : (
            <ul className="lista-simple">
              {datos.carga_tecnicos.map((t) => (
                <li key={t.id}>
                  <div className="pila pila--compacta" style={{ flex: 1, gap: 6 }}>
                    <div className="fila" style={{ justifyContent: 'space-between' }}>
                      <span>
                        {t.nombre}
                        {!t.disponible && <span className="pequeno texto-3"> (no disponible)</span>}
                      </span>
                      <span className="pequeno texto-2">
                        <strong className="cifra" style={{ fontSize: 'var(--t-lg)', color: 'var(--c-texto)' }}>{t.activas}</strong> activas,{' '}
                        {t.en_reparacion} en reparación
                      </span>
                    </div>
                    <div
                      className="barra-carga"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={maxCarga}
                      aria-valuenow={t.activas}
                      aria-label={`Órdenes activas de ${t.nombre}`}
                    >
                      <span style={{ width: `${(t.activas / maxCarga) * 100}%`, background: 'var(--g-magnitud)' }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`panel${datos.alertas_stock.length ? ' panel--atencion' : ''}`} aria-labelledby="titulo-stock">
          <div className="panel__cabecera">
            <h2 id="titulo-stock">Repuestos por reponer</h2>
            <Link to="/inventario?bajo=1" className="pequeno">
              Ir al inventario
            </Link>
          </div>
          {datos.alertas_stock.length === 0 ? (
            <Vacio icono="box-seam" titulo="El inventario está sobre los mínimos" />
          ) : (
            <ul className="lista-simple">
              {datos.alertas_stock.map((r) => (
                <li key={r.id} className="alerta-stock">
                  <span>
                    <strong>{r.codigo}</strong> <span className="texto-2">{r.nombre}</span>
                  </span>
                  <span className="vencida" style={{ whiteSpace: 'nowrap' }}>
                    <Icono nombre="exclamation-triangle" />
                    {r.stock_actual} de {r.stock_minimo} mínimo
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
      </div>
    </>
  )
}
