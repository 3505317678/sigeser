/**
 * Cliente HTTP de la API de SIGESER.
 *
 * - La sesión viaja en una cookie HttpOnly que el navegador envía solo (credentials: 'same-origin');
 *   el JavaScript nunca ve ni guarda el identificador de sesión.
 * - Toda petición que modifica datos lleva la cabecera X-CSRFToken con el valor de la cookie sigeser_csrf.
 * - Los errores se normalizan en ErrorApi para que la interfaz los muestre de forma uniforme.
 */
const BASE = '/api/v1'
const COOKIE_CSRF = 'sigeser_csrf'
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])
export const EVENTO_SESION_EXPIRADA = 'sigeser:sesion-expirada'

export type Parametros = Record<string, string | number | boolean | undefined | null | (string | number)[]>

export class ErrorApi extends Error {
  readonly status: number
  readonly codigo?: string
  readonly errores: Record<string, string[]>
  readonly datos: Record<string, unknown>

  constructor(status: number, datos: Record<string, unknown>) {
    super(ErrorApi.mensajeDe(status, datos))
    this.name = 'ErrorApi'
    this.status = status
    this.datos = datos
    this.codigo = typeof datos.codigo === 'string' ? datos.codigo : undefined
    this.errores = ErrorApi.normalizarErrores(datos.errores)
  }

  /** Primer mensaje de un campo, para mostrarlo debajo del control correspondiente. */
  campo(nombre: string): string | undefined {
    return this.errores[nombre]?.[0]
  }

  private static mensajeDe(status: number, datos: Record<string, unknown>): string {
    if (typeof datos.detail === 'string') return datos.detail
    if (status === 0) return 'No hay conexión con el servidor. Verifique la red e intente de nuevo.'
    if (status === 401) return 'La sesión terminó. Ingrese de nuevo.'
    if (status === 403) return 'Su rol no tiene permiso para realizar esta acción.'
    if (status === 404) return 'El registro solicitado no existe o no está disponible para su rol.'
    if (status === 429) return 'Demasiados intentos. Espere un momento antes de volver a intentarlo.'
    if (status >= 500) return 'El servidor no pudo completar la operación. Intente de nuevo en unos minutos.'
    return 'No fue posible completar la operación.'
  }

  private static normalizarErrores(valor: unknown): Record<string, string[]> {
    if (!valor || typeof valor !== 'object') return {}
    const salida: Record<string, string[]> = {}
    for (const [campo, mensajes] of Object.entries(valor as Record<string, unknown>)) {
      if (Array.isArray(mensajes)) salida[campo] = mensajes.map(String)
      else if (typeof mensajes === 'string') salida[campo] = [mensajes]
    }
    return salida
  }
}

function leerCookie(nombre: string): string | null {
  const par = document.cookie.split('; ').find((c) => c.startsWith(`${nombre}=`))
  return par ? decodeURIComponent(par.slice(nombre.length + 1)) : null
}

let csrfPendiente: Promise<void> | null = null

async function asegurarCsrf(): Promise<string> {
  let token = leerCookie(COOKIE_CSRF)
  if (!token) {
    csrfPendiente ??= fetch(`${BASE}/auth/csrf`, { credentials: 'same-origin' }).then(() => undefined)
    await csrfPendiente
    csrfPendiente = null
    token = leerCookie(COOKIE_CSRF)
  }
  return token ?? ''
}

export function construirUrl(ruta: string, params?: Parametros): string {
  const url = new URL(`${BASE}${ruta}`, window.location.origin)
  for (const [clave, valor] of Object.entries(params ?? {})) {
    if (valor === undefined || valor === null || valor === '') continue
    if (Array.isArray(valor)) valor.forEach((v) => url.searchParams.append(clave, String(v)))
    else url.searchParams.set(clave, String(valor))
  }
  return url.pathname + url.search
}

interface Opciones {
  params?: Parametros
  cuerpo?: unknown
  signal?: AbortSignal
}

async function solicitar<T>(metodo: string, ruta: string, { params, cuerpo, signal }: Opciones = {}): Promise<T> {
  const cabeceras: Record<string, string> = { Accept: 'application/json' }
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json'
  if (!METODOS_SEGUROS.has(metodo)) cabeceras['X-CSRFToken'] = await asegurarCsrf()

  let respuesta: Response
  try {
    respuesta = await fetch(construirUrl(ruta, params), {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: 'same-origin',
      signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ErrorApi(0, {})
  }

  if (respuesta.status === 204) return undefined as T
  const tipo = respuesta.headers.get('Content-Type') ?? ''
  const datos = tipo.includes('application/json') ? await respuesta.json() : {}

  if (!respuesta.ok) {
    if (respuesta.status === 401 && !ruta.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_EXPIRADA))
    }
    throw new ErrorApi(respuesta.status, datos as Record<string, unknown>)
  }
  return datos as T
}

export const api = {
  get: <T>(ruta: string, params?: Parametros, signal?: AbortSignal) => solicitar<T>('GET', ruta, { params, signal }),
  post: <T>(ruta: string, cuerpo?: unknown) => solicitar<T>('POST', ruta, { cuerpo: cuerpo ?? {} }),
  patch: <T>(ruta: string, cuerpo: unknown) => solicitar<T>('PATCH', ruta, { cuerpo }),
}

/**
 * Envía un formulario multipart (fotos). No se fija Content-Type: el navegador agrega el límite (boundary).
 * Usa el mismo manejo de CSRF y de errores que el resto del cliente.
 */
export async function subirArchivo<T>(ruta: string, formulario: FormData): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(construirUrl(ruta), {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-CSRFToken': await asegurarCsrf() },
      body: formulario,
      credentials: 'same-origin',
    })
  } catch {
    throw new ErrorApi(0, {})
  }
  const datos = (respuesta.headers.get('Content-Type') ?? '').includes('application/json') ? await respuesta.json() : {}
  if (!respuesta.ok) {
    if (respuesta.status === 401) window.dispatchEvent(new CustomEvent(EVENTO_SESION_EXPIRADA))
    if (respuesta.status === 413) throw new ErrorApi(413, { detail: 'La foto es demasiado grande para enviarla.' })
    throw new ErrorApi(respuesta.status, datos as Record<string, unknown>)
  }
  return datos as T
}

/** Descarga un archivo (PDF o CSV) generado por la API sin abrir otra pestaña. */
export async function descargar(ruta: string, params: Parametros, nombreSugerido: string): Promise<void> {
  const respuesta = await fetch(construirUrl(ruta, params), { credentials: 'same-origin' })
  if (!respuesta.ok) {
    const datos = (respuesta.headers.get('Content-Type') ?? '').includes('json') ? await respuesta.json() : {}
    throw new ErrorApi(respuesta.status, datos)
  }
  const disposicion = respuesta.headers.get('Content-Disposition') ?? ''
  const nombre = /filename="?([^"]+)"?/.exec(disposicion)?.[1] ?? nombreSugerido
  const url = URL.createObjectURL(await respuesta.blob())
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
