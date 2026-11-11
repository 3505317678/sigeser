import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ErrorApi } from '../api/cliente'
import type { Cliente, Equipo, TipoDocumento } from '../api/tipos'
import { Dialogo } from './Dialogo'
import { useNotificar } from './Notificaciones'
import { Aviso, Campo, mensajeError } from './ui'

const TIPOS_DOCUMENTO: { valor: TipoDocumento; texto: string }[] = [
  { valor: 'CC', texto: 'Cédula de ciudadanía' },
  { valor: 'CE', texto: 'Cédula de extranjería' },
  { valor: 'NIT', texto: 'NIT' },
  { valor: 'PAS', texto: 'Pasaporte' },
]

export const TIPOS_EQUIPO = ['Portátil', 'Computador de escritorio', 'Celular', 'Tableta', 'Impresora', 'Monitor', 'Otro']

/** Muestra el error general solo cuando no se puede ubicar en un campo concreto. */
function ErrorGeneral({ error, campos }: { error: unknown; campos: string[] }) {
  if (!error) return null
  if (error instanceof ErrorApi && campos.some((c) => error.campo(c))) return null
  return <Aviso tono="error">{mensajeError(error)}</Aviso>
}

interface DialogoClienteProps {
  abierto: boolean
  alCerrar: () => void
  cliente?: Cliente
  alGuardar?: (cliente: Cliente) => void
}

export function DialogoCliente({ abierto, alCerrar, cliente, alGuardar }: DialogoClienteProps) {
  const cola = useQueryClient()
  const notificar = useNotificar()
  const [datos, setDatos] = useState({
    tipo_documento: cliente?.tipo_documento ?? ('CC' as TipoDocumento),
    numero_documento: cliente?.numero_documento ?? '',
    nombre: cliente?.nombre ?? '',
    telefono: cliente?.telefono ?? '',
    correo: cliente?.correo ?? '',
    direccion: cliente?.direccion ?? '',
    autoriza_datos: cliente?.autoriza_datos ?? false,
  })
  const guardar = useMutation({
    mutationFn: () =>
      cliente ? api.patch<Cliente>(`/clientes/${cliente.id}`, datos) : api.post<Cliente>('/clientes', datos),
    onSuccess: (c) => {
      cola.invalidateQueries({ queryKey: ['clientes'] })
      cola.invalidateQueries({ queryKey: ['cliente', c.id] })
      notificar(cliente ? 'Datos del cliente actualizados.' : `Cliente ${c.nombre} registrado.`)
      alGuardar?.(c)
      alCerrar()
    },
  })
  const e = guardar.error instanceof ErrorApi ? guardar.error : null
  const poner = (campo: keyof typeof datos) => (ev: { target: { value: string } }) => setDatos({ ...datos, [campo]: ev.target.value })

  return (
    <Dialogo
      abierto={abierto}
      titulo={cliente ? 'Editar cliente' : 'Registrar cliente'}
      alCerrar={alCerrar}
      alEnviar={() => guardar.mutate()}
      enviando={guardar.isPending}
      textoEnviar={cliente ? 'Guardar cambios' : 'Registrar cliente'}
      ancho
    >
      <div className="formulario">
        <ErrorGeneral error={guardar.error} campos={Object.keys(datos)} />
        <div className="formulario__fila">
          <Campo etiqueta="Tipo de documento" obligatorio error={e?.campo('tipo_documento')}>
            <select className="control" value={datos.tipo_documento} onChange={poner('tipo_documento')}>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.texto}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Número de documento" obligatorio error={e?.campo('numero_documento')}>
            <input className="control" inputMode="numeric" value={datos.numero_documento} onChange={poner('numero_documento')} autoFocus />
          </Campo>
        </div>
        <Campo etiqueta="Nombre o razón social" obligatorio error={e?.campo('nombre')}>
          <input className="control" autoComplete="off" value={datos.nombre} onChange={poner('nombre')} />
        </Campo>
        <div className="formulario__fila">
          <Campo etiqueta="Teléfono" obligatorio error={e?.campo('telefono')}>
            <input className="control" type="tel" inputMode="tel" value={datos.telefono} onChange={poner('telefono')} />
          </Campo>
          <Campo etiqueta="Correo electrónico" error={e?.campo('correo')}>
            <input className="control" type="email" value={datos.correo} onChange={poner('correo')} />
          </Campo>
        </div>
        <Campo etiqueta="Dirección" error={e?.campo('direccion')}>
          <input className="control" value={datos.direccion} onChange={poner('direccion')} />
        </Campo>
        <div className="campo">
          <label className="casilla">
            <input
              type="checkbox"
              checked={datos.autoriza_datos}
              onChange={(ev) => setDatos({ ...datos, autoriza_datos: ev.target.checked })}
              aria-describedby="ayuda-datos"
              aria-invalid={e?.campo('autoriza_datos') ? true : undefined}
            />
            <span>El cliente autoriza el tratamiento de sus datos personales.</span>
          </label>
          <span id="ayuda-datos" className="campo__ayuda">
            Requerido por la Ley 1581 de 2012. Los datos se usan solo para gestionar el servicio técnico y contactar al cliente.
          </span>
          {e?.campo('autoriza_datos') && <span className="campo__error">{e.campo('autoriza_datos')}</span>}
        </div>
      </div>
    </Dialogo>
  )
}

interface DialogoEquipoProps {
  abierto: boolean
  alCerrar: () => void
  clienteId: number
  equipo?: Equipo
  alGuardar?: (equipo: Equipo) => void
}

export function DialogoEquipo({ abierto, alCerrar, clienteId, equipo, alGuardar }: DialogoEquipoProps) {
  const cola = useQueryClient()
  const notificar = useNotificar()
  const [datos, setDatos] = useState({
    tipo: equipo?.tipo ?? 'Portátil',
    marca: equipo?.marca ?? '',
    modelo: equipo?.modelo ?? '',
    serial: equipo?.serial ?? '',
    descripcion: equipo?.descripcion ?? '',
  })
  const guardar = useMutation({
    mutationFn: () =>
      equipo ? api.patch<Equipo>(`/equipos/${equipo.id}`, datos) : api.post<Equipo>(`/clientes/${clienteId}/equipos`, datos),
    onSuccess: (eq) => {
      cola.invalidateQueries({ queryKey: ['cliente', clienteId] })
      cola.invalidateQueries({ queryKey: ['clientes'] })
      notificar(equipo ? 'Equipo actualizado.' : `Equipo ${eq.marca} ${eq.modelo} registrado.`)
      alGuardar?.(eq)
      alCerrar()
    },
  })
  const e = guardar.error instanceof ErrorApi ? guardar.error : null
  const poner = (campo: keyof typeof datos) => (ev: { target: { value: string } }) => setDatos({ ...datos, [campo]: ev.target.value })

  return (
    <Dialogo
      abierto={abierto}
      titulo={equipo ? 'Editar equipo' : 'Registrar equipo'}
      alCerrar={alCerrar}
      alEnviar={() => guardar.mutate()}
      enviando={guardar.isPending}
      textoEnviar={equipo ? 'Guardar cambios' : 'Registrar equipo'}
    >
      <div className="formulario">
        <ErrorGeneral error={guardar.error} campos={Object.keys(datos)} />
        <Campo etiqueta="Tipo de equipo" obligatorio error={e?.campo('tipo')}>
          <select className="control" value={datos.tipo} onChange={poner('tipo')}>
            {TIPOS_EQUIPO.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Campo>
        <div className="formulario__fila">
          <Campo etiqueta="Marca" obligatorio error={e?.campo('marca')}>
            <input className="control" value={datos.marca} onChange={poner('marca')} autoFocus />
          </Campo>
          <Campo etiqueta="Modelo" obligatorio error={e?.campo('modelo')}>
            <input className="control" value={datos.modelo} onChange={poner('modelo')} />
          </Campo>
        </div>
        <Campo etiqueta="Serial" ayuda="Permite reconocer el equipo si el cliente vuelve." error={e?.campo('serial')}>
          <input className="control" value={datos.serial} onChange={poner('serial')} />
        </Campo>
        <Campo etiqueta="Descripción" ayuda="Color, características o señas particulares." error={e?.campo('descripcion')}>
          <textarea className="control" value={datos.descripcion} onChange={poner('descripcion')} />
        </Campo>
      </div>
    </Dialogo>
  )
}
