/**
 * Regresión: con la compilación de producción (sin StrictMode) la sesión no quedaba activa después de ingresar,
 * porque el perfil se guardaba en una consulta que el proveedor ya no observaba. Se prueba el ciclo completo
 * ingreso -> contenido protegido -> salida, sin StrictMode, igual que en producción.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProveedorSesion, useSesion } from '../sesion/Sesion'
import { RequiereSesion } from '../sesion/Protegida'
import { Ingreso } from '../paginas/Ingreso'

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

const PERFIL = {
  id: 2,
  nombre_completo: 'Laura Gómez Pardo',
  correo: 'recepcion@sigeser.local',
  rol: 'Recepcionista',
  permisos: ['ordenes.crear'],
  tecnico_id: null,
  last_login: null,
}

function AreaProtegida({ titulo }: { titulo: string }) {
  const { usuario, salir } = useSesion()
  return (
    <div>
      <h1>{titulo}</h1>
      <p>Hola, {usuario?.nombre_completo}</p>
      <button onClick={() => salir()}>Salir</button>
    </div>
  )
}

const protegida = (titulo: string) => (
  <RequiereSesion>
    <AreaProtegida titulo={titulo} />
  </RequiereSesion>
)

describe('sesión', () => {
  beforeEach(() => {
    document.cookie = 'sigeser_csrf=t; path=/'
    let conSesion = false
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/auth/login')) {
          conSesion = true
          return Promise.resolve(json(200, PERFIL))
        }
        if (url.includes('/auth/logout')) {
          conSesion = false
          return Promise.resolve(new Response(null, { status: 204 }))
        }
        if (url.includes('/auth/yo')) return Promise.resolve(conSesion ? json(200, PERFIL) : json(401, {}))
        return Promise.resolve(json(200, {}))
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('ingresa, vuelve a la página pedida y, tras cerrar sesión, el siguiente ingreso no hereda esa página', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={cliente}>
        <ProveedorSesion>
          <MemoryRouter initialEntries={['/ordenes/9']}>
            <Routes>
              <Route path="/ingresar" element={<Ingreso />} />
              <Route path="/" element={protegida('Inicio')} />
              <Route path="/ordenes/:id" element={protegida('Detalle de la orden')} />
            </Routes>
          </MemoryRouter>
        </ProveedorSesion>
      </QueryClientProvider>,
    )
    const usuario = userEvent.setup()
    const ingresar = async () => {
      await usuario.type(await screen.findByLabelText(/Correo electrónico/), PERFIL.correo)
      await usuario.type(screen.getByLabelText(/^Contraseña/), 'una-clave-cualquiera')
      await usuario.click(screen.getByRole('button', { name: 'Ingresar' }))
    }

    // Sin sesión, el enlace a una orden lleva al ingreso y, al ingresar, se vuelve a esa orden.
    await ingresar()
    expect(await screen.findByRole('heading', { name: 'Detalle de la orden' })).toBeInTheDocument()
    expect(screen.getByText('Hola, Laura Gómez Pardo')).toBeInTheDocument()

    // Al cerrar sesión se confirma la salida y se olvida la página anterior.
    await usuario.click(screen.getByRole('button', { name: 'Salir' }))
    expect(await screen.findByText('Cerró la sesión correctamente.')).toBeInTheDocument()
    await ingresar()
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
  })
})
