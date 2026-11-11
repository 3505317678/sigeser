import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ErrorApi } from '../../api/cliente'
import type { Cliente, ClienteLista, OrdenDetalle, Paginado, Prioridad, Tecnico } from '../../api/tipos'
import { DialogoCliente, DialogoEquipo } from '../../componentes/FormulariosCliente'
import { SelectorFotos } from '../../componentes/SelectorFotos'
import { FOTOS_MAXIMO_POR_ORDEN, subirFotos, type FotoElegida } from '../../dominio/fotos'
import { useNotificar } from '../../componentes/Notificaciones'
import { Aviso, AvisoError, Boton, Campo, Encabezado, Icono, mensajeError, Vacio } from '../../componentes/ui'
import { useSesion } from '../../sesion/Sesion'
import { hoyIso } from '../../util/formato'
import { useRetardado, useTitulo } from '../../util/hooks'

export function NuevaOrden() {
  useTitulo('Registrar orden')
  const navegar = useNavigate()
  const notificar = useNotificar()
  const cola = useQueryClient()
  const { puede } = useSesion()

  const [busqueda, setBusqueda] = useState('')
  const termino = useRetardado(busqueda.trim())
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [equipoId, setEquipoId] = useState<number | null>(null)
  const [dialogo, setDialogo] = useState<'cliente' | 'equipo' | null>(null)
  const [fotos, setFotos] = useState<FotoElegida[]>([])
  const [avanceFotos, setAvanceFotos] = useState<number | null>(null)
  const [datos, setDatos] = useState({
    falla_reportada: '',
    accesorios: '',
    estado_fisico: '',
    prioridad: 'MEDIA' as Prioridad,
    fecha_estimada_entrega: hoyIso(3),
    tecnico: '',
  })

  const resultados = useQuery({
    queryKey: ['clientes', { search: termino, activo: true }],
    queryFn: ({ signal }) => api.get<Paginado<ClienteLista>>('/clientes', { search: termino, activo: true, tamano: 8 }, signal),
    enabled: termino.length >= 2 && clienteId === null,
  })
  const cliente = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: () => api.get<Cliente>(`/clientes/${clienteId}`),
    enabled: clienteId !== null,
  })
  const tecnicos = useQuery({
    queryKey: ['tecnicos'],
    queryFn: () => api.get<Tecnico[]>('/tecnicos'),
    enabled: puede('ordenes.asignar'),
  })

  const registrar = useMutation({
    mutationFn: () =>
      api.post<OrdenDetalle>('/ordenes', {
        ...datos,
        cliente: clienteId,
        equipo: equipoId,
        tecnico: datos.tecnico ? Number(datos.tecnico) : null,
        fecha_estimada_entrega: datos.fecha_estimada_entrega || null,
      }),
    onSuccess: async (orden) => {
      cola.invalidateQueries({ queryKey: ['ordenes'] })
      cola.invalidateQueries({ queryKey: ['panel'] })
      let aviso = `Orden ${orden.codigo} registrada. Ya puede imprimir el comprobante de recepción.`
      if (fotos.length > 0) {
        setAvanceFotos(0)
        const r = await subirFotos(orden.id, fotos, setAvanceFotos)
        if (r.error) {
          notificar(`La orden ${orden.codigo} se registró, pero ${fotos.length - r.subidas} foto(s) no se guardaron: ${mensajeError(r.error)} Puede agregarlas desde la orden.`, 'error')
          aviso = ''
        } else {
          aviso = `Orden ${orden.codigo} registrada con ${r.subidas} foto(s). Ya puede imprimir el comprobante de recepción.`
        }
      }
      if (aviso) notificar(aviso)
      navegar(`/ordenes/${orden.id}`, { replace: true })
    },
  })
  const e = registrar.error instanceof ErrorApi ? registrar.error : null
  const poner = (campo: keyof typeof datos) => (ev: { target: { value: string } }) => setDatos({ ...datos, [campo]: ev.target.value })

  const elegirCliente = (id: number) => {
    setClienteId(id)
    setEquipoId(null)
  }

  const equipos = cliente.data?.equipos ?? []
  const listo = clienteId !== null && equipoId !== null && datos.falla_reportada.trim().length > 0

  return (
    <>
      <Encabezado
        migas={
          <>
            <Link to="/ordenes">Órdenes de servicio</Link>
            <span aria-hidden="true">/</span>
            <span>Registrar</span>
          </>
        }
        titulo="Registrar orden de servicio"
        descripcion="Identifique al cliente, elija el equipo que trae y describa la falla tal como la reporta."
      />

      <form
        className="rejilla-2"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault()
          if (listo) registrar.mutate()
        }}
      >
        <div className="pila">
          {/* Paso 1: cliente */}
          <section className="panel" aria-labelledby="paso-cliente">
            <div className="panel__cabecera">
              <h2 id="paso-cliente">1. Cliente</h2>
              {puede('clientes.gestionar') && (
                <Boton pequeno icono="person-plus" onClick={() => setDialogo('cliente')}>
                  Registrar cliente nuevo
                </Boton>
              )}
            </div>
            <div className="panel__cuerpo pila pila--compacta">
              {clienteId === null ? (
                <>
                  <Campo etiqueta="Buscar cliente" ayuda="Escriba al menos dos caracteres del documento, nombre o teléfono.">
                    <input className="control" type="search" value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} autoFocus />
                  </Campo>
                  {resultados.error && <AvisoError error={resultados.error} />}
                  {resultados.data && resultados.data.results.length === 0 && (
                    <Aviso tono="info">No hay clientes con ese dato. Regístrelo con el botón Registrar cliente nuevo.</Aviso>
                  )}
                  {resultados.data && resultados.data.results.length > 0 && (
                    <ul className="lista-simple" aria-label="Clientes encontrados" style={{ border: '1px solid var(--c-borde)', borderRadius: 'var(--r-control)' }}>
                      {resultados.data.results.map((c) => (
                        <li key={c.id}>
                          <span>
                            <strong>{c.nombre}</strong>
                            <span className="pequeno texto-2">
                              {' '}
                              {c.tipo_documento} {c.numero_documento}, tel. {c.telefono}
                            </span>
                          </span>
                          <Boton pequeno onClick={() => elegirCliente(c.id)}>
                            Elegir
                          </Boton>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <div className="fila" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{cliente.data?.nombre ?? 'Cargando…'}</strong>
                    {cliente.data && (
                      <div className="pequeno texto-2">
                        {cliente.data.tipo_documento} {cliente.data.numero_documento}, tel. {cliente.data.telefono}
                      </div>
                    )}
                  </div>
                  <Boton pequeno variante="fantasma" onClick={() => setClienteId(null)}>
                    Cambiar cliente
                  </Boton>
                </div>
              )}
            </div>
          </section>

          {/* Paso 2: equipo */}
          <section className="panel" aria-labelledby="paso-equipo" aria-disabled={clienteId === null}>
            <div className="panel__cabecera">
              <h2 id="paso-equipo">2. Equipo</h2>
              {clienteId !== null && puede('clientes.gestionar') && (
                <Boton pequeno icono="laptop" onClick={() => setDialogo('equipo')}>
                  Registrar otro equipo
                </Boton>
              )}
            </div>
            <div className="panel__cuerpo">
              {clienteId === null ? (
                <p className="texto-3">Primero elija o registre el cliente.</p>
              ) : equipos.length === 0 ? (
                <Vacio icono="laptop" titulo="Este cliente aún no tiene equipos registrados">
                  Registre el equipo que trae para continuar.
                </Vacio>
              ) : (
                <fieldset className="pila pila--compacta" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="solo-lector">Equipo que se recibe</legend>
                  {equipos.map((eq) => (
                    <label key={eq.id} className="casilla" style={{ padding: 'var(--s-3)', border: '1px solid var(--c-borde)', borderRadius: 'var(--r-control)' }}>
                      <input type="radio" name="equipo" checked={equipoId === eq.id} onChange={() => setEquipoId(eq.id)} />
                      <span>
                        <strong>
                          {eq.tipo} {eq.marca} {eq.modelo}
                        </strong>
                        <span className="pequeno texto-2">
                          {' '}
                          {eq.serial ? `Serial ${eq.serial}` : 'Sin serial'}
                          {eq.total_ordenes > 0 && `, ${eq.total_ordenes} servicio(s) anteriores`}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {e?.campo('equipo') && <p className="campo__error">{e.campo('equipo')}</p>}
            </div>
          </section>

          {/* Paso 3: falla */}
          <section className="panel" aria-labelledby="paso-falla">
            <div className="panel__cabecera">
              <h2 id="paso-falla">3. Falla y condiciones de recepción</h2>
            </div>
            <div className="panel__cuerpo formulario">
              <Campo etiqueta="Falla reportada por el cliente" obligatorio error={e?.campo('falla_reportada')}>
                <textarea className="control" value={datos.falla_reportada} onChange={poner('falla_reportada')} />
              </Campo>
              <div className="formulario__fila">
                <Campo etiqueta="Accesorios recibidos" ayuda="Cargador, estuche, cables…" error={e?.campo('accesorios')}>
                  <input className="control" value={datos.accesorios} onChange={poner('accesorios')} />
                </Campo>
                <Campo etiqueta="Estado físico" ayuda="Golpes, rayones o piezas faltantes." error={e?.campo('estado_fisico')}>
                  <input className="control" value={datos.estado_fisico} onChange={poner('estado_fisico')} />
                </Campo>
              </div>
            </div>
          </section>

          {/* Paso 4: fotos (RF-33) */}
          {puede('ordenes.fotos') && (
            <section className="panel" aria-labelledby="paso-fotos">
              <div className="panel__cabecera">
                <h2 id="paso-fotos">4. Fotos del equipo</h2>
                <span className="pequeno texto-3">Opcional</span>
              </div>
              <div className="panel__cuerpo pila pila--compacta">
                <p className="pequeno texto-2">
                  Fotografíe el equipo por todos sus lados y los accesorios. Las fotos quedan en la orden y salen en el comprobante de recepción.
                </p>
                <SelectorFotos fotos={fotos} alCambiar={setFotos} maximo={FOTOS_MAXIMO_POR_ORDEN} descripcionInicial="Estado al recibir el equipo" />
              </div>
            </section>
          )}
        </div>

        <aside className="pila" aria-label="Programación de la orden">
          <section className="panel">
            <div className="panel__cabecera">
              <h2>Programación</h2>
            </div>
            <div className="panel__cuerpo formulario">
              <Campo etiqueta="Prioridad" error={e?.campo('prioridad')}>
                <select className="control" value={datos.prioridad} onChange={poner('prioridad')}>
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                </select>
              </Campo>
              <Campo etiqueta="Fecha estimada de entrega" ayuda="La que se le promete al cliente." error={e?.campo('fecha_estimada_entrega')}>
                <input className="control" type="date" min={hoyIso()} value={datos.fecha_estimada_entrega} onChange={poner('fecha_estimada_entrega')} />
              </Campo>
              {puede('ordenes.asignar') && (
                <Campo etiqueta="Técnico" ayuda="Puede asignarlo ahora o más tarde." error={e?.campo('tecnico')}>
                  <select className="control" value={datos.tecnico} onChange={poner('tecnico')}>
                    <option value="">Asignar más tarde</option>
                    {tecnicos.data
                      ?.filter((t) => t.disponible)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}, {t.especialidad} ({t.ordenes_activas} activas)
                        </option>
                      ))}
                  </select>
                </Campo>
              )}
            </div>
          </section>
          {registrar.error && !e?.campo('falla_reportada') && !e?.campo('fecha_estimada_entrega') && (
            <Aviso tono="error">{mensajeError(registrar.error)}</Aviso>
          )}
          <Boton type="submit" variante="primario" icono="clipboard2-plus" bloque cargando={registrar.isPending || avanceFotos !== null} disabled={!listo}>
            {avanceFotos !== null ? `Subiendo fotos (${avanceFotos} de ${fotos.length})…` : 'Registrar orden'}
          </Boton>
          {!listo && (
            <p className="pequeno texto-3">
              <Icono nombre="info-circle" /> Para registrar la orden falta {clienteId === null ? 'elegir el cliente' : equipoId === null ? 'elegir el equipo' : 'describir la falla'}.
            </p>
          )}
        </aside>
      </form>

      {dialogo === 'cliente' && <DialogoCliente abierto alCerrar={() => setDialogo(null)} alGuardar={(c) => elegirCliente(c.id)} />}
      {dialogo === 'equipo' && clienteId !== null && (
        <DialogoEquipo abierto clienteId={clienteId} alCerrar={() => setDialogo(null)} alGuardar={(eq) => setEquipoId(eq.id)} />
      )}
    </>
  )
}
