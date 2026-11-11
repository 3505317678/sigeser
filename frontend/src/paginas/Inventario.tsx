import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ErrorApi } from '../api/cliente'
import type { Movimiento, Paginado, Repuesto } from '../api/tipos'
import { Dialogo } from '../componentes/Dialogo'
import { useNotificar } from '../componentes/Notificaciones'
import {
  Aviso,
  AvisoError,
  Boton,
  Campo,
  Cargando,
  Encabezado,
  FilasCargando,
  Icono,
  Insignia,
  mensajeError,
  Paginacion,
  Vacio,
} from '../componentes/ui'
import { useSesion } from '../sesion/Sesion'
import { formatoFechaHora, formatoMoneda } from '../util/formato'
import { useFiltrosUrl, useRetardado, useTitulo } from '../util/hooks'

const TAMANO = 20
const NOMBRE_MOVIMIENTO: Record<Movimiento['tipo'], string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida a orden',
  AJUSTE: 'Ajuste',
  DEVOLUCION: 'Devolución',
}

function EstadoStock({ r }: { r: Repuesto }) {
  if (!r.activo) return <Insignia tono="neutro">Inactivo</Insignia>
  if (r.stock_actual === 0) return <Insignia tono="error">Agotado</Insignia>
  if (r.bajo_minimo) return <Insignia tono="aviso">Bajo el mínimo</Insignia>
  return <Insignia tono="exito">Disponible</Insignia>
}

export function ListaInventario() {
  useTitulo('Inventario')
  const { puede } = useSesion()
  const gestiona = puede('inventario.gestionar')
  const [filtros, cambiar] = useFiltrosUrl({ buscar: '', bajo: '', pagina: '1' })
  const [texto, setTexto] = useState(filtros.buscar)
  const buscar = useRetardado(texto)
  const [dialogo, setDialogo] = useState<{ tipo: 'repuesto' | 'movimiento'; repuesto?: Repuesto } | null>(null)

  useEffect(() => {
    if (buscar !== filtros.buscar) cambiar({ buscar })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar])

  const pagina = Number(filtros.pagina) || 1
  const soloBajos = filtros.bajo === '1'
  const params = { search: filtros.buscar || undefined, page: pagina, tamano: TAMANO, ordering: 'nombre' }
  const lista = useQuery({
    queryKey: ['repuestos', 'lista', params],
    queryFn: ({ signal }) => api.get<Paginado<Repuesto>>('/repuestos', params, signal),
    placeholderData: keepPreviousData,
    enabled: !soloBajos,
  })
  const alertas = useQuery({
    queryKey: ['repuestos', 'alertas'],
    queryFn: () => api.get<Repuesto[]>('/repuestos/alertas'),
  })
  const filas = soloBajos ? alertas.data : lista.data?.results
  const consulta = soloBajos ? alertas : lista

  return (
    <>
      <Encabezado
        titulo="Inventario de repuestos"
        descripcion="Existencias, precios vigentes y alertas de reposición. Las salidas se registran desde cada orden de servicio."
        acciones={
          gestiona && (
            <Boton variante="primario" icono="plus-lg" onClick={() => setDialogo({ tipo: 'repuesto' })}>
              Registrar repuesto
            </Boton>
          )
        }
      />
      {!!alertas.data?.length && !soloBajos && (
        <Aviso tono="aviso">
          {alertas.data.length === 1 ? 'Un repuesto está' : `${alertas.data.length} repuestos están`} por debajo del stock mínimo.{' '}
          <button type="button" className="boton boton--fantasma boton--pequeno" onClick={() => cambiar({ bajo: '1' })}>
            Ver cuáles
          </button>
        </Aviso>
      )}
      <section className="panel">
        <div className="barra-herramientas" role="search">
          <label className="buscador">
            <span className="solo-lector">Buscar repuestos</span>
            <Icono nombre="search" />
            <input
              className="control"
              type="search"
              placeholder="Código, nombre o categoría"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={soloBajos}
            />
          </label>
          <button type="button" className="pastilla-filtro" aria-pressed={soloBajos} onClick={() => cambiar({ bajo: soloBajos ? '' : '1' })}>
            <Icono nombre="exclamation-triangle" />
            Solo bajo el mínimo
          </button>
        </div>
        {consulta.error ? (
          <div className="panel__cuerpo">
            <AvisoError error={consulta.error} reintentar={() => consulta.refetch()} />
          </div>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lector">Repuestos</caption>
                <thead>
                  <tr>
                    <th scope="col">Repuesto</th>
                    <th scope="col">Categoría</th>
                    <th scope="col" className="num">
                      Precio
                    </th>
                    <th scope="col" className="num">
                      Existencias
                    </th>
                    <th scope="col">Estado</th>
                    <th scope="col">
                      <span className="solo-lector">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {consulta.isPending ? (
                    <FilasCargando columnas={6} />
                  ) : (
                    filas?.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/inventario/${r.id}`}>
                            <strong>{r.codigo}</strong>
                          </Link>{' '}
                          <span className="texto-2">{r.nombre}</span>
                        </td>
                        <td>{r.categoria || <span className="texto-3">Sin categoría</span>}</td>
                        <td className="num">{formatoMoneda(r.precio_unitario)}</td>
                        <td className="num">
                          <strong className="cifra" style={{ fontSize: 'var(--t-lg)' }}>
                            {r.stock_actual}
                          </strong>
                          <span className="pequeno texto-3"> / mín. {r.stock_minimo}</span>
                        </td>
                        <td>
                          <EstadoStock r={r} />
                        </td>
                        <td className="acciones-celda">
                          {gestiona && r.activo && (
                            <Boton pequeno variante="fantasma" icono="box-arrow-in-down" onClick={() => setDialogo({ tipo: 'movimiento', repuesto: r })}>
                              Registrar movimiento
                            </Boton>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filas?.length === 0 && (
              <Vacio icono="box-seam" titulo={soloBajos ? 'Todos los repuestos están sobre el mínimo' : 'No hay repuestos que coincidan'} />
            )}
            {!soloBajos && (
              <Paginacion pagina={pagina} total={lista.data?.count ?? 0} tamano={TAMANO} alCambiar={(p) => cambiar({ pagina: String(p) }, false)} />
            )}
          </>
        )}
      </section>
      {dialogo?.tipo === 'repuesto' && <DialogoRepuesto repuesto={dialogo.repuesto} alCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'movimiento' && dialogo.repuesto && <DialogoMovimiento repuesto={dialogo.repuesto} alCerrar={() => setDialogo(null)} />}
    </>
  )
}

export function KardexRepuesto() {
  const id = Number(useParams().id)
  const { puede } = useSesion()
  const gestiona = puede('inventario.gestionar')
  const [pagina, setPagina] = useState(1)
  const [dialogo, setDialogo] = useState<'editar' | 'movimiento' | null>(null)
  const cola = useQueryClient()
  const notificar = useNotificar()
  const repuesto = useQuery({ queryKey: ['repuestos', 'detalle', id], queryFn: () => api.get<Repuesto>(`/repuestos/${id}`) })
  const movimientos = useQuery({
    queryKey: ['repuestos', 'kardex', id, pagina],
    queryFn: () => api.get<Paginado<Movimiento>>(`/repuestos/${id}/movimientos`, { page: pagina, tamano: TAMANO }),
    placeholderData: keepPreviousData,
  })
  const alternar = useMutation({
    mutationFn: (activar: boolean) => api.post(`/repuestos/${id}/${activar ? 'activar' : 'desactivar'}`),
    onSuccess: () => {
      cola.invalidateQueries({ queryKey: ['repuestos'] })
      notificar('Estado del repuesto actualizado.')
    },
    onError: (e) => notificar(mensajeError(e), 'error'),
  })
  useTitulo(repuesto.data ? `Kardex ${repuesto.data.codigo}` : 'Kardex')

  if (repuesto.isPending) return <Cargando />
  if (repuesto.error) return <AvisoError error={repuesto.error} reintentar={() => repuesto.refetch()} />
  const r = repuesto.data

  return (
    <>
      <Encabezado
        migas={
          <>
            <Link to="/inventario">Inventario</Link>
            <span aria-hidden="true">/</span>
            <span>{r.codigo}</span>
          </>
        }
        titulo={`${r.codigo}: ${r.nombre}`}
        descripcion={`${r.categoria || 'Sin categoría'}. Precio vigente ${formatoMoneda(r.precio_unitario)}.`}
        acciones={
          gestiona && (
            <>
              <Boton icono="pencil" onClick={() => setDialogo('editar')}>
                Editar
              </Boton>
              <Boton icono={r.activo ? 'archive' : 'arrow-counterclockwise'} cargando={alternar.isPending} onClick={() => alternar.mutate(!r.activo)}>
                {r.activo ? 'Desactivar' : 'Activar'}
              </Boton>
              {r.activo && (
                <Boton variante="primario" icono="box-arrow-in-down" onClick={() => setDialogo('movimiento')}>
                  Registrar movimiento
                </Boton>
              )}
            </>
          )
        }
      />
      <section className="indicadores" aria-label="Existencias">
        <div className="indicador">
          <span>Existencias</span>
          <strong>{r.stock_actual}</strong>
          <small>
            <EstadoStock r={r} />
          </small>
        </div>
        <div className="indicador">
          <span>Stock mínimo</span>
          <strong>{r.stock_minimo}</strong>
          <small>alerta de reposición</small>
        </div>
        <div className="indicador">
          <span>Valor en inventario</span>
          <strong>{formatoMoneda(Number(r.precio_unitario) * r.stock_actual)}</strong>
          <small>a precio vigente</small>
        </div>
      </section>
      <section className="panel" aria-labelledby="t-kardex">
        <div className="panel__cabecera">
          <h2 id="t-kardex">Movimientos (kardex)</h2>
        </div>
        {movimientos.error ? (
          <div className="panel__cuerpo">
            <AvisoError error={movimientos.error} />
          </div>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Movimiento</th>
                    <th scope="col" className="num">
                      Cantidad
                    </th>
                    <th scope="col" className="num">
                      Saldo
                    </th>
                    <th scope="col">Motivo</th>
                    <th scope="col">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.isPending ? (
                    <FilasCargando columnas={6} />
                  ) : (
                    movimientos.data?.results.map((m) => (
                      <tr key={m.id}>
                        <td className="texto-2">{formatoFechaHora(m.fecha)}</td>
                        <td>{NOMBRE_MOVIMIENTO[m.tipo]}</td>
                        <td className="num" style={{ color: m.cantidad < 0 ? 'var(--c-error)' : 'var(--c-exito)', fontWeight: 600 }}>
                          {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                        </td>
                        <td className="num">{m.stock_resultante}</td>
                        <td>
                          {m.orden_codigo ? (
                            <span>
                              Orden <strong>{m.orden_codigo}</strong>
                            </span>
                          ) : (
                            m.motivo
                          )}
                        </td>
                        <td>{m.usuario_nombre}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={pagina} total={movimientos.data?.count ?? 0} tamano={TAMANO} alCambiar={setPagina} />
          </>
        )}
      </section>
      {dialogo === 'editar' && <DialogoRepuesto repuesto={r} alCerrar={() => setDialogo(null)} />}
      {dialogo === 'movimiento' && <DialogoMovimiento repuesto={r} alCerrar={() => setDialogo(null)} />}
    </>
  )
}

function DialogoRepuesto({ repuesto, alCerrar }: { repuesto?: Repuesto; alCerrar: () => void }) {
  const cola = useQueryClient()
  const notificar = useNotificar()
  const [datos, setDatos] = useState({
    codigo: repuesto?.codigo ?? '',
    nombre: repuesto?.nombre ?? '',
    categoria: repuesto?.categoria ?? '',
    precio_unitario: repuesto ? String(Number(repuesto.precio_unitario)) : '',
    stock_minimo: String(repuesto?.stock_minimo ?? 2),
    stock_inicial: '0',
  })
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { ...datos, stock_minimo: Number(datos.stock_minimo), stock_inicial: Number(datos.stock_inicial) }
      return repuesto ? api.patch<Repuesto>(`/repuestos/${repuesto.id}`, cuerpo) : api.post<Repuesto>('/repuestos', cuerpo)
    },
    onSuccess: (r) => {
      cola.invalidateQueries({ queryKey: ['repuestos'] })
      notificar(repuesto ? 'Repuesto actualizado.' : `Repuesto ${r.codigo} registrado.`)
      alCerrar()
    },
  })
  const e = guardar.error instanceof ErrorApi ? guardar.error : null
  const poner = (campo: keyof typeof datos) => (ev: { target: { value: string } }) => setDatos({ ...datos, [campo]: ev.target.value })
  return (
    <Dialogo
      abierto
      titulo={repuesto ? `Editar ${repuesto.codigo}` : 'Registrar repuesto'}
      descripcion={repuesto ? 'El nuevo precio aplica a los repuestos que se agreguen desde hoy; las órdenes anteriores conservan su precio.' : undefined}
      alCerrar={alCerrar}
      alEnviar={() => guardar.mutate()}
      enviando={guardar.isPending}
      textoEnviar={repuesto ? 'Guardar cambios' : 'Registrar repuesto'}
    >
      <div className="formulario">
        {guardar.error && (!e || Object.keys(e.errores).length === 0) && <Aviso tono="error">{mensajeError(guardar.error)}</Aviso>}
        <div className="formulario__fila">
          <Campo etiqueta="Código" obligatorio error={e?.campo('codigo')}>
            <input className="control" value={datos.codigo} onChange={poner('codigo')} autoFocus />
          </Campo>
          <Campo etiqueta="Categoría" error={e?.campo('categoria')}>
            <input className="control" value={datos.categoria} onChange={poner('categoria')} />
          </Campo>
        </div>
        <Campo etiqueta="Nombre" obligatorio error={e?.campo('nombre')}>
          <input className="control" value={datos.nombre} onChange={poner('nombre')} />
        </Campo>
        <div className="formulario__fila">
          <Campo etiqueta="Precio unitario (COP)" obligatorio error={e?.campo('precio_unitario')}>
            <input className="control" type="number" min="0" step="100" value={datos.precio_unitario} onChange={poner('precio_unitario')} />
          </Campo>
          <Campo etiqueta="Stock mínimo" error={e?.campo('stock_minimo')}>
            <input className="control" type="number" min="0" step="1" value={datos.stock_minimo} onChange={poner('stock_minimo')} />
          </Campo>
          {!repuesto && (
            <Campo etiqueta="Existencias iniciales" error={e?.campo('stock_inicial')}>
              <input className="control" type="number" min="0" step="1" value={datos.stock_inicial} onChange={poner('stock_inicial')} />
            </Campo>
          )}
        </div>
      </div>
    </Dialogo>
  )
}

function DialogoMovimiento({ repuesto, alCerrar }: { repuesto: Repuesto; alCerrar: () => void }) {
  const cola = useQueryClient()
  const notificar = useNotificar()
  const [tipo, setTipo] = useState<'ENTRADA' | 'AJUSTE' | 'DEVOLUCION'>('ENTRADA')
  const [cantidad, setCantidad] = useState('1')
  const [motivo, setMotivo] = useState('')
  const registrar = useMutation({
    mutationFn: () => api.post(`/repuestos/${repuesto.id}/movimientos/registrar`, { tipo, cantidad: Number(cantidad), motivo }),
    onSuccess: () => {
      cola.invalidateQueries({ queryKey: ['repuestos'] })
      notificar('Movimiento registrado en el kardex.')
      alCerrar()
    },
  })
  const e = registrar.error instanceof ErrorApi ? registrar.error : null
  const n = Number(cantidad) || 0
  const resultado = repuesto.stock_actual + n
  return (
    <Dialogo
      abierto
      titulo={`Registrar movimiento de ${repuesto.codigo}`}
      descripcion={`Existencias actuales: ${repuesto.stock_actual}.`}
      alCerrar={alCerrar}
      alEnviar={() => registrar.mutate()}
      enviando={registrar.isPending}
      textoEnviar="Registrar movimiento"
    >
      <div className="formulario">
        {registrar.error && (!e || Object.keys(e.errores).length === 0) && <Aviso tono="error">{mensajeError(registrar.error)}</Aviso>}
        <fieldset className="pila pila--compacta" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="campo__etiqueta">Tipo de movimiento</legend>
          <label className="casilla">
            <input type="radio" name="tipo" checked={tipo === 'ENTRADA'} onChange={() => setTipo('ENTRADA')} />
            Entrada por compra o reposición
          </label>
          <label className="casilla">
            <input type="radio" name="tipo" checked={tipo === 'DEVOLUCION'} onChange={() => setTipo('DEVOLUCION')} />
            Devolución: unidades que regresan al inventario sin usar
          </label>
          <label className="casilla">
            <input type="radio" name="tipo" checked={tipo === 'AJUSTE'} onChange={() => setTipo('AJUSTE')} />
            Ajuste por conteo físico, daño o pérdida
          </label>
        </fieldset>
        <Campo
          etiqueta="Cantidad"
          obligatorio
          error={e?.campo('cantidad')}
          ayuda={tipo === 'AJUSTE' ? 'Use un número negativo para retirar unidades.' : 'Unidades que ingresan al inventario.'}
        >
          <input className="control" type="number" step="1" min={tipo === 'AJUSTE' ? undefined : 1} value={cantidad} onChange={(ev) => setCantidad(ev.target.value)} />
        </Campo>
        <Campo etiqueta="Motivo" obligatorio error={e?.campo('motivo')} ayuda="Por ejemplo: factura del proveedor o resultado del conteo.">
          <input className="control" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
        </Campo>
        <p className="pequeno">
          Existencias después del movimiento: <strong style={{ color: resultado < 0 ? 'var(--c-error)' : undefined }}>{resultado}</strong>
        </p>
      </div>
    </Dialogo>
  )
}
