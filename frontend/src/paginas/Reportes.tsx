import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { api, descargar } from '../api/cliente'
import type { ReportePeriodo } from '../api/tipos'
import { useNotificar } from '../componentes/Notificaciones'
import { AvisoError, Boton, Campo, Cargando, Encabezado, mensajeError, Vacio } from '../componentes/ui'
import { formatoFecha, formatoMoneda, formatoNumero, hoyIso } from '../util/formato'
import { useTitulo } from '../util/hooks'

/* Mismos valores que los tokens --g-* (los atributos SVG de Recharts no resuelven variables CSS en todos los navegadores). */
const COLOR = { recibidas: '#1b6fae', entregadas: '#c0661a', rejilla: '#e3e8e6', eje: '#6b7774', magnitud: '#1d6b6b' }
const SERIES = [
  { clave: 'recibidas', nombre: 'Recibidas', color: COLOR.recibidas },
  { clave: 'entregadas', nombre: 'Entregadas', color: COLOR.entregadas },
] as const
const diaCorto = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
const etiquetaDia = (iso: string) => diaCorto.format(new Date(`${iso}T12:00:00-05:00`))

export default function Reportes() {
  useTitulo('Reportes')
  const notificar = useNotificar()
  const [rango, setRango] = useState({ desde: hoyIso(-29), hasta: hoyIso() })
  const [aplicado, setAplicado] = useState(rango)
  const consulta = useQuery({
    queryKey: ['reportes', 'periodo', aplicado],
    queryFn: () => api.get<ReportePeriodo>('/reportes/periodo', aplicado),
  })
  const [exportando, setExportando] = useState<'csv' | 'pdf' | null>(null)

  const exportar = async (formato: 'csv' | 'pdf') => {
    setExportando(formato)
    try {
      await descargar('/reportes/exportar', { ...aplicado, formato }, `reporte-sigeser.${formato}`)
    } catch (e) {
      notificar(mensajeError(e), 'error')
    } finally {
      setExportando(null)
    }
  }

  return (
    <>
      <Encabezado
        titulo="Reportes"
        descripcion="Productividad del taller e ingresos en el período elegido. Las fechas incluyen el primer y el último día."
        acciones={
          <>
            <Boton icono="filetype-csv" cargando={exportando === 'csv'} onClick={() => exportar('csv')}>
              Exportar CSV
            </Boton>
            <Boton icono="file-earmark-pdf" cargando={exportando === 'pdf'} onClick={() => exportar('pdf')}>
              Exportar PDF
            </Boton>
          </>
        }
      />
      <form
        className="panel barra-herramientas"
        style={{ alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault()
          setAplicado(rango)
        }}
      >
        <Campo etiqueta="Desde">
          <input className="control" type="date" max={rango.hasta} value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
        </Campo>
        <Campo etiqueta="Hasta">
          <input className="control" type="date" min={rango.desde} max={hoyIso()} value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
        </Campo>
        <Boton type="submit" variante="primario" icono="funnel">
          Consultar
        </Boton>
        <div className="fila" style={{ marginLeft: 'auto' }}>
          {[7, 30, 90].map((dias) => (
            <Boton
              key={dias}
              pequeno
              variante="fantasma"
              onClick={() => {
                const r = { desde: hoyIso(-(dias - 1)), hasta: hoyIso() }
                setRango(r)
                setAplicado(r)
              }}
            >
              Últimos {dias} días
            </Boton>
          ))}
        </div>
      </form>

      {consulta.isPending && <Cargando texto="Calculando el reporte…" />}
      {consulta.error && <AvisoError error={consulta.error} reintentar={() => consulta.refetch()} />}
      {consulta.data && <ContenidoReporte r={consulta.data} />}
    </>
  )
}

function ContenidoReporte({ r }: { r: ReportePeriodo }) {
  // Etiquetas directas al final de cada línea; si los últimos valores casi coinciden, se separan para no encimarse.
  const ultimo = r.serie_diaria[r.serie_diaria.length - 1]
  const maxSerie = Math.max(1, ...r.serie_diaria.flatMap((d) => [d.recibidas, d.entregadas]))
  const cerca = !!ultimo && Math.abs(ultimo.recibidas - ultimo.entregadas) <= maxSerie * 0.08
  const desplazamiento = (clave: 'recibidas' | 'entregadas') =>
    !cerca || !ultimo ? 4 : (ultimo[clave] >= ultimo[clave === 'recibidas' ? 'entregadas' : 'recibidas']) === (clave === 'recibidas') ? -4 : 14
  const maxRepuesto = Math.max(1, ...r.repuestos_mas_usados.map((x) => x.cantidad))
  const maxTecnico = Math.max(1, ...r.por_tecnico.map((x) => x.entregadas))
  return (
    <>
      <section className="indicadores" aria-label="Resumen del período">
        <div className="indicador">
          <span>Órdenes recibidas</span>
          <strong>{formatoNumero(r.recibidas)}</strong>
          <small>{r.canceladas} canceladas</small>
        </div>
        <div className="indicador">
          <span>Equipos entregados</span>
          <strong>{formatoNumero(r.entregadas)}</strong>
          <small>en el período</small>
        </div>
        <div className="indicador">
          <span>Tiempo promedio de atención</span>
          <strong>{r.tiempo_promedio_horas === null ? '—' : `${(r.tiempo_promedio_horas / 24).toLocaleString('es-CO', { maximumFractionDigits: 1 })} días`}</strong>
          <small>de la recepción a la entrega</small>
        </div>
        <div className="indicador">
          <span>Ingresos</span>
          <strong>{formatoMoneda(r.ingresos_total)}</strong>
          <small>
            {formatoMoneda(r.ingresos_mano_obra)} mano de obra, {formatoMoneda(r.ingresos_repuestos)} repuestos
          </small>
        </div>
      </section>

      <section className="panel" aria-labelledby="t-serie">
        <div className="panel__cabecera">
          <h2 id="t-serie">Órdenes recibidas y entregadas por día</h2>
        </div>
        <div className="panel__cuerpo" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={r.serie_diaria} margin={{ top: 8, right: 84, bottom: 0, left: -16 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke={COLOR.rejilla} />
              <XAxis
                dataKey="fecha"
                tickFormatter={etiquetaDia}
                tick={{ fill: COLOR.eje, fontSize: 12 }}
                axisLine={{ stroke: COLOR.rejilla }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis allowDecimals={false} tick={{ fill: COLOR.eje, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={TooltipSerie} cursor={{ stroke: COLOR.eje, strokeDasharray: '3 3' }} />
              <Legend
                verticalAlign="top"
                align="left"
                height={32}
                iconType="plainline"
                itemSorter={(item) => SERIES.findIndex((s) => s.nombre === item.value)}
                wrapperStyle={{ fontSize: 13, color: '#4a5754' }}
              />
              {SERIES.map((s) => (
                <Line
                  key={s.clave}
                  type="linear"
                  dataKey={s.clave}
                  name={s.nombre}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                  isAnimationActive={false}
                  label={(p: { x?: number | string; y?: number | string; index?: number }) =>
                    p.index === r.serie_diaria.length - 1 ? (
                      <text key={s.clave} x={Number(p.x) + 8} y={Number(p.y)} dy={desplazamiento(s.clave)} fontSize={12} fill="#4a5754">
                        {s.nombre}
                      </text>
                    ) : (
                      <g key={`${s.clave}-${p.index}`} />
                    )
                  }
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="rejilla-mitades">
        <section className="panel" aria-labelledby="t-repuestos">
          <div className="panel__cabecera">
            <h2 id="t-repuestos">Repuestos más usados</h2>
          </div>
          {r.repuestos_mas_usados.length === 0 ? (
            <Vacio icono="cpu" titulo="No se usaron repuestos en el período" />
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Repuesto</th>
                    <th scope="col" style={{ width: '38%' }}>
                      Unidades
                    </th>
                    <th scope="col" className="num">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.repuestos_mas_usados.map((x) => (
                    <tr key={x.codigo}>
                      <td>
                        <strong>{x.codigo}</strong> <span className="pequeno texto-2">{x.nombre}</span>
                      </td>
                      <td>
                        <BarraEnLinea valor={x.cantidad} maximo={maxRepuesto} />
                      </td>
                      <td className="num">{formatoMoneda(x.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel" aria-labelledby="t-tecnicos">
          <div className="panel__cabecera">
            <h2 id="t-tecnicos">Equipos entregados por técnico</h2>
          </div>
          {r.por_tecnico.length === 0 ? (
            <Vacio icono="person-gear" titulo="No hubo entregas en el período" />
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Técnico</th>
                    <th scope="col" style={{ width: '50%' }}>
                      Entregados
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.por_tecnico.map((x) => (
                    <tr key={x.tecnico}>
                      <td>{x.tecnico}</td>
                      <td>
                        <BarraEnLinea valor={x.entregadas} maximo={maxTecnico} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="t-detalle">
        <div className="panel__cabecera">
          <h2 id="t-detalle">Órdenes entregadas en el período</h2>
          <span className="pequeno texto-3">{r.detalle_entregadas.length} órdenes</span>
        </div>
        {r.detalle_entregadas.length === 0 ? (
          <Vacio icono="clipboard2" titulo="No hay entregas en este período" />
        ) : (
          <div className="tabla-contenedor" style={{ maxHeight: 420 }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Orden</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Técnico</th>
                  <th scope="col">Recibida</th>
                  <th scope="col">Entregada</th>
                  <th scope="col" className="num">
                    Mano de obra
                  </th>
                  <th scope="col" className="num">
                    Repuestos
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.detalle_entregadas.map((o) => (
                  <tr key={o.codigo}>
                    <td className="codigo-orden">{o.codigo}</td>
                    <td>{o.cliente}</td>
                    <td>{o.tecnico}</td>
                    <td>{formatoFecha(o.fecha_recepcion)}</td>
                    <td>{formatoFecha(o.fecha_entrega)}</td>
                    <td className="num">{formatoMoneda(o.mano_obra)}</td>
                    <td className="num">{formatoMoneda(o.repuestos)}</td>
                    <td className="num">
                      <strong>{formatoMoneda(o.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function BarraEnLinea({ valor, maximo }: { valor: number; maximo: number }) {
  return (
    <div className="fila" style={{ flexWrap: 'nowrap' }}>
      <div className="barra-carga" style={{ flex: 1 }} aria-hidden="true">
        <span style={{ width: `${(valor / maximo) * 100}%`, background: COLOR.magnitud }} />
      </div>
      <strong className="cifra" style={{ minWidth: '2ch', textAlign: 'right' }}>
        {valor}
      </strong>
    </div>
  )
}

function TooltipSerie({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #d8dedc', borderRadius: 8, padding: '8px 12px', boxShadow: '0 8px 20px -6px rgb(11 46 47 / 0.25)' }}>
      <strong style={{ display: 'block', marginBottom: 4 }}>{formatoFecha(String(label))}</strong>
      {payload.map((p) => (
        <div key={String(p.dataKey)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ width: 12, height: 2, background: p.color }} aria-hidden="true" />
          <span style={{ color: '#4a5754' }}>{p.name}</span>
          <strong style={{ marginLeft: 'auto' }}>{p.value}</strong>
        </div>
      ))}
    </div>
  )
}
