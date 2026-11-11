/**
 * Efecto de celebración (confeti) al completar una etapa importante de la orden.
 * Se dibuja en un canvas temporal que se elimina solo; si el usuario pidió reducir el movimiento, no se muestra.
 */
const COLORES = ['#1d6b6b', '#d9920f', '#1f7a4d', '#2563a8', '#6b4fa3'] // colores de la identidad de SIGESER
const DURACION_MS = 2600
const PARTICULAS = 140

interface Particula {
  x: number
  y: number
  vx: number
  vy: number
  giro: number
  velocidadGiro: number
  tamano: number
  color: string
}

export function lanzarConfeti(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const lienzo = document.createElement('canvas')
  lienzo.className = 'confeti'
  lienzo.setAttribute('aria-hidden', 'true')
  lienzo.width = window.innerWidth
  lienzo.height = window.innerHeight
  document.body.appendChild(lienzo)
  const ctx = lienzo.getContext('2d')
  if (!ctx) {
    lienzo.remove()
    return
  }

  const particulas: Particula[] = Array.from({ length: PARTICULAS }, () => ({
    x: lienzo.width / 2 + (Math.random() - 0.5) * 120,
    y: lienzo.height * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 12 - 4,
    giro: Math.random() * Math.PI,
    velocidadGiro: (Math.random() - 0.5) * 0.3,
    tamano: 6 + Math.random() * 6,
    color: COLORES[Math.floor(Math.random() * COLORES.length)],
  }))

  const inicio = performance.now()
  const cuadro = (ahora: number) => {
    const transcurrido = ahora - inicio
    ctx.clearRect(0, 0, lienzo.width, lienzo.height)
    ctx.globalAlpha = Math.max(0, 1 - transcurrido / DURACION_MS)
    for (const p of particulas) {
      p.vy += 0.35 // gravedad
      p.vx *= 0.99 // resistencia del aire
      p.x += p.vx
      p.y += p.vy
      p.giro += p.velocidadGiro
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.giro)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.tamano / 2, -p.tamano / 4, p.tamano, p.tamano / 2)
      ctx.restore()
    }
    if (transcurrido < DURACION_MS) requestAnimationFrame(cuadro)
    else lienzo.remove()
  }
  requestAnimationFrame(cuadro)
}
