import { subirArchivo } from '../api/cliente'
import type { Foto } from '../api/tipos'

/** Límites del cliente: los mismos del servidor, que los vuelve a validar (RF-33). */
export const FOTOS_TIPOS = ['image/jpeg', 'image/png', 'image/webp']
export const FOTOS_MAXIMO_MB = 8
export const FOTOS_MAXIMO_POR_ORDEN = 12

export interface FotoElegida {
  archivo: File
  descripcion: string
}

export function validarFoto(archivo: File): string | null {
  if (!FOTOS_TIPOS.includes(archivo.type)) return `«${archivo.name}» no es una foto JPEG, PNG o WebP.`
  if (archivo.size > FOTOS_MAXIMO_MB * 1024 * 1024) return `«${archivo.name}» supera los ${FOTOS_MAXIMO_MB} MB.`
  return null
}

/** Sube las fotos una por una para informar el avance y no perder las que ya se enviaron si una falla. */
export async function subirFotos(
  ordenId: number,
  fotos: FotoElegida[],
  alAvanzar?: (hechas: number) => void,
): Promise<{ subidas: number; error: unknown }> {
  let subidas = 0
  for (const foto of fotos) {
    const formulario = new FormData()
    formulario.append('archivo', foto.archivo)
    formulario.append('descripcion', foto.descripcion.trim())
    try {
      await subirArchivo<Foto>(`/ordenes/${ordenId}/fotos`, formulario)
    } catch (error) {
      return { subidas, error }
    }
    subidas += 1
    alAvanzar?.(subidas)
  }
  return { subidas, error: null }
}
