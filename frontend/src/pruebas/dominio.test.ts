import { describe, expect, it } from 'vitest'
import { ESTADOS_ACTIVOS, ESTADOS_FINALES, NOMBRE_ESTADO, PASOS_RIEL, pasoDelRiel } from '../dominio/ordenes'
import { formatoFecha, formatoMoneda, iniciales } from '../util/formato'

describe('formato', () => {
  it('muestra pesos colombianos sin decimales', () => {
    expect(formatoMoneda('255000.00').replace(/\s/g, ' ')).toBe('$ 255.000')
    expect(formatoMoneda(null)).toBe('—')
  })

  it('una fecha sin hora no se corre de día por la zona horaria', () => {
    expect(formatoFecha('2026-11-10')).toContain('10')
    expect(formatoFecha('2026-11-10')).toContain('2026')
  })

  it('obtiene las iniciales para el avatar', () => {
    expect(iniciales('Laura Gómez Pardo')).toBe('LG')
  })
})

describe('estados de la orden', () => {
  it('cubre los nueve estados de la Tabla 13 sin repetir', () => {
    const todos = [...ESTADOS_ACTIVOS, ...ESTADOS_FINALES]
    expect(new Set(todos).size).toBe(9)
    expect(Object.keys(NOMBRE_ESTADO)).toHaveLength(9)
  })

  it('la espera de repuestos se ubica en el paso de reparación del riel', () => {
    const reparacion = PASOS_RIEL.findIndex((p) => p.estado === 'EN_REPARACION')
    expect(pasoDelRiel('EN_ESPERA_REPUESTOS')).toBe(reparacion)
    expect(pasoDelRiel('ENTREGADA')).toBe(PASOS_RIEL.length - 1)
  })
})

describe('validación de fotos en el navegador', () => {
  it('acepta JPEG, PNG y WebP de hasta 8 MB y rechaza lo demás', async () => {
    const { validarFoto } = await import('../dominio/fotos')
    const archivo = (tipo: string, bytes: number) => new File([new Uint8Array(bytes)], 'f', { type: tipo })
    expect(validarFoto(archivo('image/jpeg', 1000))).toBeNull()
    expect(validarFoto(archivo('image/webp', 1000))).toBeNull()
    expect(validarFoto(archivo('image/gif', 1000))).toMatch(/JPEG, PNG o WebP/)
    expect(validarFoto(archivo('application/pdf', 1000))).toMatch(/JPEG, PNG o WebP/)
    expect(validarFoto(archivo('image/png', 8 * 1024 * 1024 + 1))).toMatch(/8 MB/)
  })
})
