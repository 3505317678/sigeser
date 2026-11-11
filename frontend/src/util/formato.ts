const ZONA = 'America/Bogota'

const moneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const numero = new Intl.NumberFormat('es-CO')
const fechaHora = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA })
const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONA })
const relativo = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' })

export const formatoMoneda = (valor: string | number | null | undefined): string =>
  valor === null || valor === undefined || valor === '' ? '—' : moneda.format(Number(valor))

export const formatoNumero = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : numero.format(valor)

export function formatoFechaHora(valor: string | null | undefined): string {
  return valor ? fechaHora.format(new Date(valor)) : '—'
}

/** Las fechas sin hora (AAAA-MM-DD) se interpretan como día calendario, sin desplazamiento por zona horaria. */
export function formatoFecha(valor: string | null | undefined): string {
  if (!valor) return '—'
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00-05:00`) : new Date(valor)
  return fechaCorta.format(fecha)
}

export function haceCuanto(valor: string | null | undefined): string {
  if (!valor) return '—'
  const minutos = Math.round((new Date(valor).getTime() - Date.now()) / 60000)
  if (Math.abs(minutos) < 60) return relativo.format(minutos, 'minute')
  const horas = Math.round(minutos / 60)
  if (Math.abs(horas) < 24) return relativo.format(horas, 'hour')
  return relativo.format(Math.round(horas / 24), 'day')
}

/** Fecha local de hoy en formato AAAA-MM-DD (para filtros y campos tipo date). */
export function hoyIso(desplazamientoDias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + desplazamientoDias)
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d)
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}
