import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ErrorApi } from '../../api/cliente'
import type { Accion, OrdenDetalle, Repuesto, Tecnico } from '../../api/tipos'
import { Dialogo } from '../../componentes/Dialogo'
import { useNotificar } from '../../componentes/Notificaciones'
import { Aviso, Campo, mensajeError } from '../../componentes/ui'
import { ACCIONES } from '../../dominio/ordenes'
import { formatoMoneda } from '../../util/formato'

/** Ruta del endpoint de cada acción; las que no necesitan datos se ejecutan sin diálogo. */
const RUTA: Record<Accion, string> = {
  asignar_tecnico: 'asignar-tecnico',
  iniciar_diagnostico: 'iniciar-diagnostico',
  registrar_diagnostico: 'diagnostico',
  registrar_aprobacion: 'aprobacion',
  registrar_actividad: 'actividades',
  agregar_repuesto: 'repuestos',
  poner_en_espera: 'espera',
  enviar_verificacion: 'enviar-verificacion',
  reanudar: 'reanudar',
  verificar: 'verificacion',
  registrar_entrega: 'entrega',
  cancelar: 'cancelar',
}

export const ACCIONES_DIRECTAS: Accion[] = ['iniciar_diagnostico', 'reanudar']

const EXITO: Record<Accion, string> = {
  asignar_tecnico: 'Técnico asignado.',
  iniciar_diagnostico: 'Diagnóstico iniciado.',
  registrar_diagnostico: 'Diagnóstico registrado. La orden espera la respuesta del cliente.',
  registrar_aprobacion: 'Respuesta del cliente registrada.',
  registrar_actividad: 'Actividad registrada.',
  agregar_repuesto: 'Repuesto agregado a la orden.',
  poner_en_espera: 'La orden quedó en espera de repuestos.',
  enviar_verificacion: 'Orden enviada a verificación.',
  reanudar: 'Reparación reanudada.',
  verificar: 'Verificación registrada.',
  registrar_entrega: 'Equipo entregado. La orden quedó cerrada.',
  cancelar: 'Orden cancelada.',
}

interface RespuestaRepuesto {
  alerta_stock_bajo?: boolean
}

export function useAccionOrden(orden: OrdenDetalle) {
  const cola = useQueryClient()
  const notificar = useNotificar()
  return useMutation({
    mutationFn: ({ accion, cuerpo }: { accion: Accion; cuerpo?: unknown }) =>
      api.post<RespuestaRepuesto>(`/ordenes/${orden.id}/${RUTA[accion]}`, cuerpo),
    onSuccess: (respuesta, { accion }) => {
      cola.invalidateQueries({ queryKey: ['orden', orden.id] })
      cola.invalidateQueries({ queryKey: ['ordenes'] })
      cola.invalidateQueries({ queryKey: ['panel'] })
      if (accion === 'agregar_repuesto' || accion === 'cancelar') cola.invalidateQueries({ queryKey: ['repuestos'] })
      notificar(EXITO[accion])
      if (respuesta?.alerta_stock_bajo) notificar('El repuesto quedó por debajo del stock mínimo. Avise para reponerlo.', 'aviso')
    },
    onError: (error, { accion }) => {
      if (ACCIONES_DIRECTAS.includes(accion)) notificar(mensajeError(error), 'error')
    },
  })
}

interface DialogoAccionProps {
  orden: OrdenDetalle
  accion: Accion
  alCerrar: () => void
}

export function DialogoAccion({ orden, accion, alCerrar }: DialogoAccionProps) {
  const ejecutar = useAccionOrden(orden)
  const [datos, setDatos] = useState<Record<string, string>>(() => valoresIniciales(orden, accion))
  const e = ejecutar.error instanceof ErrorApi ? ejecutar.error : null
  const poner = (campo: string) => (ev: { target: { value: string } }) => setDatos((d) => ({ ...d, [campo]: ev.target.value }))
  const def = ACCIONES[accion]

  const enviar = () =>
    ejecutar.mutate({ accion, cuerpo: cuerpoDe(accion, datos) }, { onSuccess: () => alCerrar() })

  const errorGeneral = ejecutar.error && (!e || Object.keys(e.errores).length === 0) && (
    <Aviso tono="error">{mensajeError(ejecutar.error)}</Aviso>
  )

  const comun = {
    abierto: true,
    titulo: def.etiqueta,
    alCerrar,
    alEnviar: enviar,
    enviando: ejecutar.isPending,
    textoEnviar: def.etiqueta,
  }

  switch (accion) {
    case 'asignar_tecnico':
      return (
        <Dialogo {...comun} descripcion={`Orden ${orden.codigo}: ${orden.equipo_resumen}.`}>
          <div className="formulario">
            {errorGeneral}
            <SelectorTecnico valor={datos.tecnico} alCambiar={(v) => setDatos({ tecnico: v })} error={e?.campo('tecnico')} />
          </div>
        </Dialogo>
      )
    case 'registrar_diagnostico':
      return (
        <Dialogo {...comun} ancho descripcion="El costo estimado es el presupuesto de mano de obra que se le comunica al cliente para su aprobación.">
          <div className="formulario">
            {errorGeneral}
            <Campo etiqueta="Diagnóstico técnico" obligatorio error={e?.campo('descripcion')}>
              <textarea className="control" value={datos.descripcion} onChange={poner('descripcion')} autoFocus />
            </Campo>
            <Campo etiqueta="Causa probable" error={e?.campo('causa_probable')}>
              <input className="control" value={datos.causa_probable} onChange={poner('causa_probable')} />
            </Campo>
            <Campo etiqueta="Solución propuesta" obligatorio error={e?.campo('solucion_propuesta')}>
              <textarea className="control" value={datos.solucion_propuesta} onChange={poner('solucion_propuesta')} />
            </Campo>
            <Campo etiqueta="Costo estimado de mano de obra (COP)" obligatorio error={e?.campo('costo_estimado')}>
              <input className="control" type="number" min="0" step="1000" inputMode="numeric" value={datos.costo_estimado} onChange={poner('costo_estimado')} />
            </Campo>
          </div>
        </Dialogo>
      )
    case 'registrar_aprobacion':
      return (
        <Dialogo
          {...comun}
          textoEnviar="Registrar respuesta"
          descripcion={
            orden.diagnostico
              ? `Presupuesto de mano de obra: ${formatoMoneda(orden.diagnostico.costo_estimado)}. ${orden.diagnostico.solucion_propuesta}`
              : undefined
          }
        >
          <div className="formulario">
            {errorGeneral}
            <fieldset className="pila pila--compacta" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="campo__etiqueta">¿El cliente aprueba la reparación?</legend>
              <label className="casilla">
                <input type="radio" name="aprobado" checked={datos.aprobado === 'si'} onChange={() => setDatos({ ...datos, aprobado: 'si' })} />
                Sí, aprueba el presupuesto
              </label>
              <label className="casilla">
                <input type="radio" name="aprobado" checked={datos.aprobado === 'no'} onChange={() => setDatos({ ...datos, aprobado: 'no' })} />
                No, prefiere retirar el equipo sin reparar
              </label>
            </fieldset>
            {datos.aprobado === 'si' && (
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={datos.esperar_repuestos === 'si'}
                  onChange={(ev) => setDatos({ ...datos, esperar_repuestos: ev.target.checked ? 'si' : '' })}
                />
                Hay que conseguir repuestos antes de empezar la reparación
              </label>
            )}
            {datos.aprobado === 'no' && (
              <Aviso tono="info">La orden pasará a Lista para entrega para que el cliente retire el equipo.</Aviso>
            )}
            <Campo etiqueta="Observación" error={e?.campo('observacion')}>
              <input className="control" value={datos.observacion} onChange={poner('observacion')} />
            </Campo>
          </div>
        </Dialogo>
      )
    case 'registrar_actividad':
      return (
        <Dialogo {...comun}>
          <div className="formulario">
            {errorGeneral}
            <Campo etiqueta="Trabajo realizado" obligatorio error={e?.campo('descripcion')}>
              <textarea className="control" value={datos.descripcion} onChange={poner('descripcion')} autoFocus />
            </Campo>
            <Campo etiqueta="Horas empleadas" obligatorio error={e?.campo('horas_empleadas')}>
              <input className="control" type="number" min="0.25" max="200" step="0.25" inputMode="decimal" value={datos.horas_empleadas} onChange={poner('horas_empleadas')} />
            </Campo>
          </div>
        </Dialogo>
      )
    case 'agregar_repuesto':
      return (
        <Dialogo {...comun} descripcion="El repuesto se descuenta del inventario y se cobra al precio vigente hoy.">
          <div className="formulario">
            {errorGeneral}
            <SelectorRepuesto
              repuesto={datos.repuesto}
              cantidad={datos.cantidad}
              alCambiar={(campo, valor) => setDatos((d) => ({ ...d, [campo]: valor }))}
              errorRepuesto={e?.campo('repuesto')}
              errorCantidad={e?.campo('cantidad')}
            />
          </div>
        </Dialogo>
      )
    case 'poner_en_espera':
      return (
        <Dialogo {...comun} descripcion="Use esta opción cuando la reparación no puede continuar hasta que llegue un repuesto.">
          <div className="formulario">
            {errorGeneral}
            <Campo etiqueta="Repuesto que se espera" error={e?.campo('observacion')}>
              <input className="control" value={datos.observacion} onChange={poner('observacion')} autoFocus />
            </Campo>
          </div>
        </Dialogo>
      )
    case 'enviar_verificacion':
      return (
        <Dialogo {...comun} descripcion="Confirme el valor final de la mano de obra antes de pasar la orden a pruebas de calidad.">
          <div className="formulario">
            {errorGeneral}
            <Campo etiqueta="Mano de obra final (COP)" obligatorio error={e?.campo('costo_mano_obra')}>
              <input className="control" type="number" min="0" step="1000" inputMode="numeric" value={datos.costo_mano_obra} onChange={poner('costo_mano_obra')} />
            </Campo>
            <p className="pequeno texto-2">Repuestos de la orden: {formatoMoneda(orden.total_repuestos)}.</p>
          </div>
        </Dialogo>
      )
    case 'verificar':
      return (
        <Dialogo {...comun}>
          <div className="formulario">
            {errorGeneral}
            <fieldset className="pila pila--compacta" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="campo__etiqueta">Resultado de las pruebas</legend>
              <label className="casilla">
                <input type="radio" name="aprobada" checked={datos.aprobada === 'si'} onChange={() => setDatos({ ...datos, aprobada: 'si' })} />
                El equipo funciona correctamente: queda listo para entrega
              </label>
              <label className="casilla">
                <input type="radio" name="aprobada" checked={datos.aprobada === 'no'} onChange={() => setDatos({ ...datos, aprobada: 'no' })} />
                Persiste la falla: vuelve a reparación
              </label>
            </fieldset>
            <Campo etiqueta="Observación" error={e?.campo('observacion')}>
              <textarea className="control" value={datos.observacion} onChange={poner('observacion')} />
            </Campo>
          </div>
        </Dialogo>
      )
    case 'registrar_entrega':
      return (
        <Dialogo {...comun} descripcion={`Total a cobrar: ${formatoMoneda(orden.total)}.`}>
          <div className="formulario">
            {errorGeneral}
            <Campo etiqueta="Nombre de quien recibe el equipo" obligatorio error={e?.campo('recibido_por')}>
              <input className="control" value={datos.recibido_por} onChange={poner('recibido_por')} autoFocus />
            </Campo>
            <Campo etiqueta="Observación" error={e?.campo('observacion')}>
              <input className="control" value={datos.observacion} onChange={poner('observacion')} />
            </Campo>
          </div>
        </Dialogo>
      )
    case 'cancelar':
      return (
        <Dialogo
          {...comun}
          titulo={`Cancelar la orden ${orden.codigo}`}
          descripcion="La cancelación no se puede deshacer. Los repuestos usados vuelven al inventario."
          textoEnviar="Cancelar orden"
          varianteEnviar="peligro-solido"
        >
          <div className="formulario">
            {errorGeneral}
            <Campo etiqueta="Motivo de la cancelación" obligatorio error={e?.campo('motivo')}>
              <textarea className="control" value={datos.motivo} onChange={poner('motivo')} autoFocus />
            </Campo>
          </div>
        </Dialogo>
      )
    default:
      return null
  }
}

function valoresIniciales(orden: OrdenDetalle, accion: Accion): Record<string, string> {
  switch (accion) {
    case 'asignar_tecnico':
      return { tecnico: orden.tecnico ? String(orden.tecnico) : '' }
    case 'registrar_diagnostico':
      return {
        descripcion: orden.diagnostico?.descripcion ?? '',
        causa_probable: orden.diagnostico?.causa_probable ?? '',
        solucion_propuesta: orden.diagnostico?.solucion_propuesta ?? '',
        costo_estimado: orden.diagnostico ? String(Number(orden.diagnostico.costo_estimado)) : '',
      }
    case 'registrar_aprobacion':
      return { aprobado: 'si', esperar_repuestos: '', observacion: '' }
    case 'registrar_actividad':
      return { descripcion: '', horas_empleadas: '1' }
    case 'agregar_repuesto':
      return { repuesto: '', cantidad: '1' }
    case 'enviar_verificacion':
      return { costo_mano_obra: String(Number(orden.costo_mano_obra ?? 0)) }
    case 'verificar':
      return { aprobada: 'si', observacion: '' }
    case 'registrar_entrega':
      return { recibido_por: orden.cliente_nombre, observacion: '' }
    default:
      return { observacion: '', motivo: '' }
  }
}

function cuerpoDe(accion: Accion, d: Record<string, string>): unknown {
  switch (accion) {
    case 'asignar_tecnico':
      return { tecnico: Number(d.tecnico) || null }
    case 'registrar_aprobacion':
      return { aprobado: d.aprobado === 'si', esperar_repuestos: d.aprobado === 'si' && d.esperar_repuestos === 'si', observacion: d.observacion }
    case 'agregar_repuesto':
      return { repuesto: Number(d.repuesto) || null, cantidad: Number(d.cantidad) }
    case 'verificar':
      return { aprobada: d.aprobada === 'si', observacion: d.observacion }
    case 'poner_en_espera':
      return { observacion: d.observacion }
    default:
      return d
  }
}

function SelectorTecnico({ valor, alCambiar, error }: { valor: string; alCambiar: (v: string) => void; error?: string }) {
  const tecnicos = useQuery({ queryKey: ['tecnicos'], queryFn: () => api.get<Tecnico[]>('/tecnicos') })
  return (
    <Campo etiqueta="Técnico responsable" obligatorio error={error} ayuda="Entre paréntesis, las órdenes activas de cada técnico.">
      <select className="control" value={valor} onChange={(e) => alCambiar(e.target.value)} autoFocus>
        <option value="">Elija un técnico</option>
        {tecnicos.data?.map((t) => (
          <option key={t.id} value={t.id} disabled={!t.disponible}>
            {t.nombre}, {t.especialidad} ({t.ordenes_activas}){t.disponible ? '' : ', no disponible'}
          </option>
        ))}
      </select>
    </Campo>
  )
}

function SelectorRepuesto({
  repuesto,
  cantidad,
  alCambiar,
  errorRepuesto,
  errorCantidad,
}: {
  repuesto: string
  cantidad: string
  alCambiar: (campo: 'repuesto' | 'cantidad', valor: string) => void
  errorRepuesto?: string
  errorCantidad?: string
}) {
  const repuestos = useQuery({
    queryKey: ['repuestos', 'activos'],
    queryFn: () => api.get<{ results: Repuesto[] }>('/repuestos', { activo: true, tamano: 100, ordering: 'nombre' }),
  })
  const elegido = repuestos.data?.results.find((r) => String(r.id) === repuesto)
  return (
    <>
      <Campo etiqueta="Repuesto" obligatorio error={errorRepuesto}>
        <select className="control" value={repuesto} onChange={(e) => alCambiar('repuesto', e.target.value)} autoFocus>
          <option value="">Elija un repuesto</option>
          {repuestos.data?.results.map((r) => (
            <option key={r.id} value={r.id} disabled={r.stock_actual === 0}>
              {r.codigo}, {r.nombre} ({r.stock_actual === 0 ? 'agotado' : `${r.stock_actual} disponibles`})
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Cantidad" obligatorio error={errorCantidad} ayuda={elegido ? `Precio unitario ${formatoMoneda(elegido.precio_unitario)}. Disponibles: ${elegido.stock_actual}.` : undefined}>
        <input className="control" type="number" min="1" max={elegido?.stock_actual} step="1" value={cantidad} onChange={(e) => alCambiar('cantidad', e.target.value)} />
      </Campo>
      {elegido && Number(cantidad) > 0 && (
        <p className="pequeno">
          Subtotal: <strong>{formatoMoneda(Number(elegido.precio_unitario) * Number(cantidad))}</strong>
        </p>
      )}
    </>
  )
}
