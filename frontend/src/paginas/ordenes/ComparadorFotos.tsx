import { useState, type CSSProperties } from 'react'
import type { Foto } from '../../api/tipos'

/**
 * Comparación visual del antes y el después (RF-35): superpone una foto de recepción y una posterior
 * (diagnóstico, reparación o entrega) y un deslizador revela una u otra. Funciona con ratón, tacto y teclado,
 * porque el control es un input range nativo.
 */
export function ComparadorFotos({ fotos }: { fotos: Foto[] }) {
  const antes = fotos.filter((f) => f.etapa === 'RECEPCION')
  const despues = fotos.filter((f) => f.etapa !== 'RECEPCION')
  const [idAntes, setIdAntes] = useState<number | null>(null)
  const [idDespues, setIdDespues] = useState<number | null>(null)
  const [posicion, setPosicion] = useState(50)

  if (antes.length === 0 || despues.length === 0) return null
  // Si el usuario no ha elegido, se compara la primera foto de recepción con la más reciente.
  const fotoAntes = antes.find((f) => f.id === idAntes) ?? antes[0]
  const fotoDespues = despues.find((f) => f.id === idDespues) ?? despues[despues.length - 1]

  return (
    <div className="comparador-bloque panel__cuerpo">
      <div className="comparador__cabecera">
        <h3>Antes y después</h3>
        <div className="fila">
          <label className="comparador__selector">
            <span>Antes</span>
            <select value={fotoAntes.id} onChange={(e) => setIdAntes(Number(e.target.value))}>
              {antes.map((f, i) => (
                <option key={f.id} value={f.id}>
                  {f.descripcion || `Recepción ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label className="comparador__selector">
            <span>Después</span>
            <select value={fotoDespues.id} onChange={(e) => setIdDespues(Number(e.target.value))}>
              {despues.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.etapa_nombre}: {f.descripcion || 'sin descripción'}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="comparador" style={{ '--pos': `${posicion}%` } as CSSProperties}>
        <img src={fotoDespues.url} alt={`Después: ${fotoDespues.descripcion || fotoDespues.etapa_nombre}`} />
        <img className="comparador__antes" src={fotoAntes.url} alt={`Antes: ${fotoAntes.descripcion || 'recepción'}`} />
        <span className="comparador__rotulo comparador__rotulo--antes">Antes</span>
        <span className="comparador__rotulo comparador__rotulo--despues">Después</span>
        <span className="comparador__linea" aria-hidden="true">
          <span className="comparador__tirador">⇆</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={posicion}
          onChange={(e) => setPosicion(Number(e.target.value))}
          className="comparador__control"
          aria-label="Deslice para comparar la foto de antes con la de después"
        />
      </div>
    </div>
  )
}
