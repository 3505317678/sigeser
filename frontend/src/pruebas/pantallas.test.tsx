import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ProveedorNotificaciones } from '../componentes/Notificaciones'
import { ProveedorSesion } from '../sesion/Sesion'
import { DetalleOrden } from '../paginas/ordenes/DetalleOrden'
import { Ingreso } from '../paginas/Ingreso'

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar(ruta: string, elemento: ReactNode, patron: string) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={cliente}>
      <ProveedorNotificaciones>
        <ProveedorSesion>
          <MemoryRouter initialEntries={[ruta]}>
            <Routes>
              <Route path={patron} element={elemento} />
              <Route path="*" element={<p>otra página</p>} />
            </Routes>
          </MemoryRouter>
        </ProveedorSesion>
      </ProveedorNotificaciones>
    </QueryClientProvider>,
  )
}

const ORDEN = {
  id: 6,
  codigo: 'OS-2026-00006',
  cliente: 1,
  cliente_nombre: 'Luis Eduardo Vargas',
  cliente_documento: 'CC 40139795',
  cliente_telefono: '3154526984',
  equipo: 1,
  equipo_resumen: 'Celular Xiaomi Redmi Note 12',
  equipo_serial: 'SN1',
  tecnico: 2,
  tecnico_nombre: 'Andrea Martínez Ríos',
  estado: 'EN_REPARACION',
  estado_nombre: 'En reparación',
  prioridad: 'ALTA',
  fecha_recepcion: '2026-10-29T15:26:00-05:00',
  fecha_estimada_entrega: '2026-11-02',
  fecha_entrega: null,
  vencida: true,
  falla_reportada: 'No carga',
  accesorios: '',
  estado_fisico: '',
  costo_mano_obra: '45000.00',
  total_repuestos: '25000.00',
  total: '70000.00',
  recibido_por: '',
  motivo_cancelacion: '',
  diagnostico: null,
  historial: [],
  actividades: [],
  repuestos: [],
  fotos: [],
  acciones: ['registrar_actividad', 'agregar_repuesto', 'poner_en_espera', 'enviar_verificacion'],
}

describe('pantallas', () => {
  let fetchSimulado: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchSimulado = vi.fn()
    vi.stubGlobal('fetch', fetchSimulado)
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true
    }
  })
  afterEach(() => vi.unstubAllGlobals())

  it('el detalle de la orden solo ofrece las acciones que autoriza la API', async () => {
    fetchSimulado.mockImplementation((url: string) =>
      Promise.resolve(url.includes('/auth/yo') ? json(401, {}) : json(200, ORDEN)),
    )
    montar('/ordenes/6', <DetalleOrden />, '/ordenes/:id')
    expect(await screen.findByRole('button', { name: 'Registrar actividad' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar a verificación' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar orden' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entregar equipo' })).not.toBeInTheDocument()
    expect(screen.getByText('Entrega vencida')).toBeInTheDocument()
  })

  it('sin permiso de fotos muestra el estado vacío y no ofrece agregar fotos', async () => {
    fetchSimulado.mockImplementation((url: string) =>
      Promise.resolve(url.includes('/auth/yo') ? json(401, {}) : json(200, ORDEN)),
    )
    montar('/ordenes/6', <DetalleOrden />, '/ordenes/:id')
    expect(await screen.findByText('Aún no hay fotos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar fotos' })).not.toBeInTheDocument()
  })

  it('la galería abre el visor ampliado y permite pasar de una foto a otra', async () => {
    const foto = (id: number, etapa: string, descripcion: string) => ({
      id,
      etapa,
      etapa_nombre: etapa === 'RECEPCION' ? 'Recepción' : 'Diagnóstico',
      descripcion,
      ancho: 1200,
      alto: 900,
      tamano_bytes: 150000,
      fecha: '2026-10-29T15:30:00-05:00',
      subida_por_nombre: 'Rosa Recepción',
      url: `/api/v1/ordenes/6/fotos/${id}/imagen`,
      url_miniatura: `/api/v1/ordenes/6/fotos/${id}/imagen?tamano=miniatura`,
    })
    const conFotos = { ...ORDEN, fotos: [foto(1, 'RECEPCION', 'Rayón en la tapa'), foto(2, 'DIAGNOSTICO', 'Puerto de carga sulfatado')], acciones: [...ORDEN.acciones, 'subir_foto'] }
    fetchSimulado.mockImplementation((url: string) =>
      Promise.resolve(url.includes('/auth/yo') ? json(401, {}) : json(200, conFotos)),
    )
    montar('/ordenes/6', <DetalleOrden />, '/ordenes/:id')
    const usuario = userEvent.setup()
    expect(await screen.findByRole('button', { name: 'Agregar fotos' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Ampliar foto 1: Rayón en la tapa/ }))
    expect(await screen.findByRole('heading', { name: 'Foto 1 de 2' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Rayón en la tapa' })).toHaveAttribute('src', '/api/v1/ordenes/6/fotos/1/imagen')
    await usuario.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(await screen.findByRole('heading', { name: 'Foto 2 de 2' })).toBeInTheDocument()
    expect(screen.getByText('Diagnóstico: Puerto de carga sulfatado')).toBeInTheDocument()
  })

  it('al ingresar con datos incorrectos muestra el mensaje genérico de la API y limpia la contraseña', async () => {
    document.cookie = 'sigeser_csrf=t; path=/'
    fetchSimulado.mockImplementation((url: string) =>
      Promise.resolve(url.includes('/auth/login') ? json(401, { detail: 'Correo o contraseña incorrectos.' }) : json(401, {})),
    )
    montar('/ingresar', <Ingreso />, '/ingresar')
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText(/Correo electrónico/), 'alguien@taller.co')
    const clave = screen.getByLabelText(/^Contraseña/)
    await usuario.type(clave, 'equivocada')
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument()
    expect(clave).toHaveValue('')
  })
})
