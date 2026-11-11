import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Retrasa la actualización de un valor (búsquedas mientras se escribe) para no saturar la API. */
export function useRetardado<T>(valor: T, ms = 300): T {
  const [retardado, setRetardado] = useState(valor)
  useEffect(() => {
    const t = window.setTimeout(() => setRetardado(valor), ms)
    return () => window.clearTimeout(t)
  }, [valor, ms])
  return retardado
}

/**
 * Filtros guardados en la URL: se pueden compartir, sobreviven a recargar la página
 * y el botón Atrás del navegador los restaura.
 */
export function useFiltrosUrl<T extends Record<string, string>>(predeterminados: T) {
  const [params, setParams] = useSearchParams()
  const valores = Object.fromEntries(
    Object.entries(predeterminados).map(([k, v]) => [k, params.get(k) ?? v]),
  ) as T
  const cambiar = (cambios: Partial<T>, reiniciarPagina = true) => {
    const siguiente = new URLSearchParams(params)
    for (const [k, v] of Object.entries(cambios)) {
      if (v === undefined || v === '' || v === predeterminados[k]) siguiente.delete(k)
      else siguiente.set(k, String(v))
    }
    if (reiniciarPagina && !('pagina' in cambios)) siguiente.delete('pagina')
    setParams(siguiente, { replace: true })
  }
  return [valores, cambiar] as const
}

export function useTitulo(titulo: string) {
  useEffect(() => {
    document.title = `${titulo} | SIGESER`
  }, [titulo])
}
