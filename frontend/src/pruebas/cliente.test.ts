import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ErrorApi, EVENTO_SESION_EXPIRADA } from '../api/cliente'

function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
  })
}

/** Devuelve el ErrorApi de una promesa rechazada; si la promesa se resuelve, la prueba falla. */
const fallo = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error('Se esperaba un error de la API')
    },
    (e: unknown) => e as ErrorApi,
  )

describe('cliente HTTP', () => {
  let fetchSimulado: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.cookie = 'sigeser_csrf=token-de-prueba; path=/'
    fetchSimulado = vi.fn()
    vi.stubGlobal('fetch', fetchSimulado)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'sigeser_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('envía la cabecera CSRF en las peticiones que modifican datos', async () => {
    fetchSimulado.mockResolvedValue(respuesta(200, { ok: true }))
    await api.post('/ordenes/1/cancelar', { motivo: 'x' })
    const [url, opciones] = fetchSimulado.mock.calls[0]
    expect(url).toBe('/api/v1/ordenes/1/cancelar')
    expect(opciones.method).toBe('POST')
    expect(opciones.headers['X-CSRFToken']).toBe('token-de-prueba')
    expect(opciones.credentials).toBe('same-origin')
  })

  it('no envía la cabecera CSRF en lecturas y omite parámetros vacíos', async () => {
    fetchSimulado.mockResolvedValue(respuesta(200, { results: [] }))
    await api.get('/ordenes', { estado: ['RECIBIDA', 'EN_REPARACION'], search: '', page: 2 })
    const [url, opciones] = fetchSimulado.mock.calls[0]
    expect(url).toBe('/api/v1/ordenes?estado=RECIBIDA&estado=EN_REPARACION&page=2')
    expect(opciones.headers['X-CSRFToken']).toBeUndefined()
  })

  it('normaliza los errores de validación por campo', async () => {
    fetchSimulado.mockResolvedValue(
      respuesta(422, { detail: 'Hay datos inválidos.', errores: { falla_reportada: ['Este campo es obligatorio.'] } }),
    )
    const error = await fallo(api.post('/ordenes', {}))
    expect(error).toBeInstanceOf(ErrorApi)
    expect(error.status).toBe(422)
    expect(error.campo('falla_reportada')).toBe('Este campo es obligatorio.')
  })

  it('conserva el código de error de dominio (409)', async () => {
    fetchSimulado.mockResolvedValue(respuesta(409, { detail: 'Stock insuficiente.', codigo: 'stock_insuficiente', stock_disponible: 2 }))
    const error = await fallo(api.post('/ordenes/1/repuestos', {}))
    expect(error.codigo).toBe('stock_insuficiente')
    expect(error.message).toBe('Stock insuficiente.')
    expect(error.datos.stock_disponible).toBe(2)
  })

  it('avisa a la aplicación cuando la sesión expira', async () => {
    const escucha = vi.fn()
    window.addEventListener(EVENTO_SESION_EXPIRADA, escucha)
    fetchSimulado.mockResolvedValue(respuesta(401, { detail: 'Las credenciales de autenticación no se proveyeron.' }))
    await api.get('/ordenes').catch(() => undefined)
    expect(escucha).toHaveBeenCalledTimes(1)
    window.removeEventListener(EVENTO_SESION_EXPIRADA, escucha)
  })

  it('un fallo de red se informa como falta de conexión', async () => {
    fetchSimulado.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await fallo(api.get('/ordenes'))
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/conexión/)
  })
})
