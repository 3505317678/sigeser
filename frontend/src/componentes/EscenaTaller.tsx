/**
 * Ilustración vectorial original de la pantalla de ingreso: la mesa del taller con un portátil en reparación,
 * un teléfono, un destornillador y pistas de circuito por las que «viaja» una señal. Es decorativa (aria-hidden);
 * la animación se detiene si el usuario pidió reducir el movimiento.
 */
export function EscenaTaller() {
  return (
    <svg className="ingreso__escena" viewBox="0 0 440 230" aria-hidden="true">
      {/* Pistas de circuito al fondo */}
      <g fill="none" stroke="#1d6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        <path d="M0 40h70l18 18h60" />
        <path d="M0 78h40l14-14h44" />
        <path d="M440 30h-80l-20 20h-40" />
        <path d="M440 70h-50l-14 14h-30" />
      </g>
      <g fill="#1d6b6b">
        <circle cx="148" cy="58" r="4" />
        <circle cx="98" cy="64" r="4" />
        <circle cx="300" cy="50" r="4" />
        <circle cx="346" cy="84" r="4" />
      </g>
      <path className="escena__senal" fill="none" stroke="#d9920f" strokeWidth="2.5" strokeLinecap="round" d="M0 40h70l18 18h60" />
      <path className="escena__senal escena__senal--2" fill="none" stroke="#d9920f" strokeWidth="2.5" strokeLinecap="round" d="M440 30h-80l-20 20h-40" />

      {/* Mesa */}
      <rect x="20" y="196" width="400" height="10" rx="5" fill="#155354" />
      <rect x="60" y="206" width="12" height="24" fill="#155354" />
      <rect x="368" y="206" width="12" height="24" fill="#155354" />

      {/* Portátil abierto con la orden en pantalla */}
      <g>
        <rect x="128" y="74" width="184" height="114" rx="8" fill="#0b2e2f" stroke="#dceae8" strokeWidth="3" />
        <rect x="140" y="86" width="160" height="90" rx="3" fill="#eef5f4" />
        <rect x="150" y="96" width="60" height="8" rx="2" fill="#0f3d3e" />
        <rect x="150" y="110" width="100" height="5" rx="2" fill="#b9c3c0" />
        {/* Riel de etapas de la orden */}
        <g className="escena__riel">
          <line x1="158" y1="140" x2="282" y2="140" stroke="#b9c3c0" strokeWidth="3" />
          <line className="escena__avance" x1="158" y1="140" x2="282" y2="140" stroke="#155354" strokeWidth="3" />
          <circle cx="158" cy="140" r="6" fill="#155354" />
          <circle cx="189" cy="140" r="6" fill="#155354" />
          <circle cx="220" cy="140" r="6" fill="#155354" />
          <circle className="escena__actual" cx="251" cy="140" r="6" fill="#d9920f" />
          <circle cx="282" cy="140" r="6" fill="#eef5f4" stroke="#b9c3c0" strokeWidth="2" />
        </g>
        <rect x="150" y="158" width="44" height="10" rx="5" fill="#1f7a4d" />
        <rect x="200" y="158" width="36" height="10" rx="5" fill="#dceae8" />
        <path d="M108 188h224l-10 8H118z" fill="#dceae8" />
      </g>

      {/* Teléfono con la cámara lista para la foto de recepción */}
      <g transform="rotate(-8 360 160)">
        <rect x="338" y="112" width="46" height="80" rx="8" fill="#0b2e2f" stroke="#dceae8" strokeWidth="2.5" />
        <rect x="344" y="122" width="34" height="56" rx="3" fill="#155354" />
        <circle cx="361" cy="150" r="10" fill="none" stroke="#eef5f4" strokeWidth="2.5" />
        <circle className="escena__obturador" cx="361" cy="150" r="4" fill="#d9920f" />
      </g>

      {/* Destornillador y tornillos */}
      <g transform="rotate(-18 70 180)">
        <rect x="34" y="174" width="44" height="12" rx="6" fill="#d9920f" />
        <rect x="78" y="178" width="40" height="4" rx="2" fill="#dceae8" />
      </g>
      <circle cx="96" cy="192" r="3" fill="#dceae8" />
      <circle cx="108" cy="190" r="3" fill="#dceae8" />
    </svg>
  )
}
