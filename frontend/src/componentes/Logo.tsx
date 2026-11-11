/**
 * Marca de SIGESER: una etiqueta de reparación (la que se cuelga del equipo en el taller) con una pista de
 * circuito en forma de «S». La pista termina en dos soldaduras; la final, en ámbar, señala el equipo entregado.
 * Variante «clara» para fondos oscuros (menú e ingreso) y «oscura» para fondos claros.
 */
export function Logo({ variante = 'clara', tamano = 28, animada = false }: { variante?: 'clara' | 'oscura'; tamano?: number; animada?: boolean }) {
  const cuerpo = variante === 'clara' ? '#dceae8' : '#0f3d3e'
  const fondo = variante === 'clara' ? '#0f3d3e' : '#f2f4f3'
  return (
    <svg className={`logo${animada ? ' logo--animada' : ''}`} width={tamano} height={tamano} viewBox="0 0 48 48" aria-hidden="true">
      <path fill={cuerpo} d="M9 4h21l13 13v23a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" />
      <circle cx="30.5" cy="14" r="3.2" fill={fondo} />
      <path
        className="logo__pista"
        fill="none"
        stroke={fondo}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 36h12a5.5 5.5 0 0 0 0-11h-6a5.5 5.5 0 0 1 0-11h3"
      />
      <circle cx="13" cy="36" r="3" fill={fondo} />
      <circle className="logo__soldadura" cx="34" cy="36" r="3.4" fill="#d9920f" />
    </svg>
  )
}
