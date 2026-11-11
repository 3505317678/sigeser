
const { chromium, request } = require('playwright')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const URL_BASE = process.env.SIGESER_URL || 'http://localhost:8080'
const SALIDA = path.resolve(process.argv[2] || 'tutoriales')
const FOTOS = path.resolve(process.env.FOTOS_DEMO || path.join(__dirname, 'fotos-demo'))
const ADMIN = { correo: 'admin@sigeser.local', clave: process.env.SIGESER_ADMIN_CONTRASENA }
const RECEPCION = { correo: 'recepcion@sigeser.local', clave: process.env.SIGESER_DEMO_CONTRASENA }
const TECNICO = { correo: 'carlos.rodriguez@sigeser.local', clave: process.env.SIGESER_DEMO_CONTRASENA }
const TAMANO = { width: 1280, height: 800 }
if (!ADMIN.clave || !RECEPCION.clave) {
  console.error('Defina SIGESER_ADMIN_CONTRASENA y SIGESER_DEMO_CONTRASENA en el entorno.')
  process.exit(2)
}
fs.mkdirSync(SALIDA, { recursive: true })

/** Cliente de la API con sesión, para preparar los datos de cada video. */
async function apiComo(usuario) {
  const api = await request.newContext({ baseURL: URL_BASE })
  await api.get('/api/v1/auth/csrf')
  const csrf = () => api.storageState().then((s) => s.cookies.find((c) => c.name === 'sigeser_csrf').value)
  const llamar = async (metodo, ruta, datos) => {
    const r = await api.fetch(`/api/v1${ruta}`, { method: metodo, data: datos, headers: { 'X-CSRFToken': await csrf() } })
    if (!r.ok()) throw new Error(`${metodo} ${ruta}: ${r.status()} ${await r.text()}`)
    return r.status() === 204 ? null : r.json()
  }
  await llamar('POST', '/auth/login', { correo: usuario.correo, contrasena: usuario.clave })
  return { get: (r) => llamar('GET', r), post: (r, d) => llamar('POST', r, d ?? {}), cerrar: () => api.dispose() }
}

const segundosVtt = (ms) => {
  const t = new Date(Math.max(ms, 0)).toISOString()
  return t.slice(11, 23)
}

async function grabar(navegador, id, usuario, guion) {
  const dirVideo = path.join(SALIDA, '.crudo', id)
  fs.rmSync(dirVideo, { recursive: true, force: true })
  const contexto = await navegador.newContext({
    viewport: TAMANO,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    recordVideo: { dir: dirVideo, size: TAMANO },
  })
  const pagina = await contexto.newPage()
  const inicio = Date.now()
  const subtitulos = []
  const errores = []
  pagina.on('pageerror', (e) => errores.push(String(e)))

  const t = {
    pagina,
    /** Nuevo subtítulo: queda en pantalla hasta el siguiente. */
    decir: async (texto, pausa = 1400) => {
      const ahora = Date.now() - inicio
      if (subtitulos.length) subtitulos[subtitulos.length - 1].fin = ahora
      subtitulos.push({ inicio: ahora, fin: ahora + 4000, texto })
      await pagina.waitForTimeout(pausa)
    },
    /** Resalta el control (recuadro ámbar) y luego actúa sobre él. */
    resaltar: async (localizador, ms = 900) => {
      await localizador.scrollIntoViewIfNeeded()
      const caja = await localizador.boundingBox()
      if (!caja) return
      await pagina.evaluate((c) => {
        const marco = document.createElement('div')
        marco.id = 'tutorial-resalte'
        Object.assign(marco.style, {
          position: 'fixed', left: `${c.x - 6}px`, top: `${c.y - 6}px`, width: `${c.width + 12}px`, height: `${c.height + 12}px`,
          border: '3px solid #d9920f', borderRadius: '10px', boxShadow: '0 0 0 6px rgba(217,146,15,.25)', zIndex: 99999,
          pointerEvents: 'none', transition: 'opacity .3s', opacity: '0',
        })
        document.body.appendChild(marco)
        requestAnimationFrame(() => { marco.style.opacity = '1' })
      }, caja)
      await pagina.waitForTimeout(ms)
      await pagina.evaluate(() => document.getElementById('tutorial-resalte')?.remove())
    },
    clic: async (localizador, ms) => {
      await t.resaltar(localizador, ms)
      await localizador.click()
      await pagina.waitForTimeout(700)
    },
    escribir: async (localizador, texto) => {
      await t.resaltar(localizador, 500)
      await localizador.click()
      await localizador.pressSequentially(texto, { delay: 45 })
      await pagina.waitForTimeout(400)
    },
    dialogo: () => pagina.getByRole('dialog'),
  }

  // Ingreso visible solo en el tutorial de primeros pasos; en los demás el video empieza con la sesión iniciada.
  await guion(t)
  if (subtitulos.length) subtitulos[subtitulos.length - 1].fin = Date.now() - inicio + 500
  await pagina.waitForTimeout(800)
  const duracionMs = Date.now() - inicio
  await contexto.close()

  const crudo = fs.readdirSync(dirVideo).find((f) => f.endsWith('.webm'))
  const mp4 = path.join(SALIDA, `${id}.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dirVideo, crudo), '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4])
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1',
    '-deadline', 'good', '-cpu-used', '4', '-an', path.join(SALIDA, `${id}.webm`)])
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.round(duracionMs * 0.45) / 1000), '-i', mp4, '-frames:v', '1',
    '-vf', 'scale=640:-2', '-q:v', '4', path.join(SALIDA, `${id}.jpg`)])
  const vtt = ['WEBVTT', '', ...subtitulos.flatMap((s, i) => [String(i + 1), `${segundosVtt(s.inicio)} --> ${segundosVtt(s.fin)}`, s.texto, ''])]
  fs.writeFileSync(path.join(SALIDA, `${id}.vtt`), vtt.join('\n'), 'utf8')
  fs.rmSync(dirVideo, { recursive: true, force: true })
  const seg = Math.round(duracionMs / 1000)
  console.log(`${id}: ${seg} s, ${subtitulos.length} subtítulos, ${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB${errores.length ? `, errores: ${errores}` : ''}`)
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
}

async function ingresar(t, usuario, visible = false) {
  const p = t.pagina
  await p.goto(`${URL_BASE}/ingresar`)
  if (visible) {
    await t.decir('Abra SIGESER en el navegador e ingrese con el correo y la contraseña que le asignó el administrador.', 1800)
    await t.escribir(p.getByLabel(/Correo electrónico/), usuario.correo)
    await t.escribir(p.getByLabel(/^Contraseña/), usuario.clave)
    await t.clic(p.getByRole('button', { name: 'Ingresar' }))
  } else {
    await p.getByLabel(/Correo electrónico/).fill(usuario.correo)
    await p.getByLabel(/^Contraseña/).fill(usuario.clave)
    await p.getByRole('button', { name: 'Ingresar' }).click()
  }
  await p.waitForURL((u) => !u.pathname.startsWith('/ingresar'))
  await p.waitForTimeout(900)
}

;(async () => {
  const navegador = await chromium.launch({ args: ['--lang=es-CO'], env: { ...process.env, LANG: 'es_CO.UTF-8' } })
  const duraciones = {}
  const recepcion = await apiComo(RECEPCION)
  const admin = await apiComo(ADMIN)

  // Datos que se crean durante los videos y se reutilizan en los siguientes.
  const clientes = (await recepcion.get('/clientes?activo=true&tamano=50')).results
  const cliente = clientes.find((c) => c.total_equipos > 0) ?? clientes[0]
  const tecnicos = await recepcion.get('/tecnicos')
  const carlos = tecnicos.find((x) => x.nombre.startsWith('Carlos'))
  let ordenId = null

  duraciones['primeros-pasos'] = await grabar(navegador, 'primeros-pasos', RECEPCION, async (t) => {
    const p = t.pagina
    await ingresar(t, RECEPCION, true)
    await t.decir('Al ingresar, el menú de la izquierda muestra solo los módulos que su rol puede usar.', 1800)
    await t.clic(p.getByRole('link', { name: 'Clientes y equipos' }))
    await t.decir('Cada módulo tiene su buscador y sus filtros.', 1400)
    await t.clic(p.getByRole('link', { name: 'Inventario' }))
    await t.decir('Con el icono de llave cambia su contraseña: mínimo 12 caracteres.', 1200)
    await t.clic(p.getByRole('button', { name: 'Cambiar contraseña' }))
    await p.waitForTimeout(1200)
    await t.decir('Al terminar el turno, cierre la sesión con el botón de salida.', 1200)
    await t.clic(p.getByRole('button', { name: 'Cerrar sesión' }))
    await t.decir('La sesión también se cierra sola tras 30 minutos sin actividad.', 1800)
  })

  duraciones['registrar-orden'] = await grabar(navegador, 'registrar-orden', RECEPCION, async (t) => {
    const p = t.pagina
    await ingresar(t, RECEPCION)
    await t.decir('Para recibir un equipo, abra Órdenes de servicio y pulse Registrar orden.', 1000)
    await t.clic(p.getByRole('link', { name: 'Órdenes de servicio' }).first())
    await t.clic(p.getByRole('button', { name: 'Registrar orden' }).first())
    await t.decir('Busque al cliente por su documento, nombre o teléfono.', 600)
    await t.escribir(p.getByLabel('Buscar cliente'), cliente.nombre.split(' ')[0])
    await p.waitForTimeout(900)
    await t.clic(p.getByRole('button', { name: 'Elegir' }).first())
    await t.decir('Elija el equipo que trae. Si es nuevo, regístrelo con el botón de la derecha.', 900)
    await t.clic(p.getByRole('radio').first())
    await t.decir('Describa la falla con las palabras del cliente y anote accesorios y estado físico.', 600)
    await t.escribir(p.getByLabel(/Falla reportada/), 'La pantalla parpadea y el equipo se apaga solo')
    await t.escribir(p.getByLabel(/Accesorios recibidos/), 'Cargador original')
    await t.escribir(p.getByLabel(/^Estado físico/), 'Rayón en la tapa')
    await t.decir('Tome las fotos con la cámara o elíjalas del equipo: quedan como evidencia del estado en que llegó.', 600)
    await t.resaltar(p.getByRole('button', { name: 'Elegir fotos' }))
    await p.locator('input[type=file]').setInputFiles([path.join(FOTOS, 'portatil-tapa.jpg'), path.join(FOTOS, 'puerto-carga.jpg')])
    await p.waitForTimeout(900)
    const descripciones = p.getByLabel(/Descripción de la foto/)
    await descripciones.nth(0).fill('')
    await t.escribir(descripciones.nth(0), 'Rayón en la tapa')
    await descripciones.nth(1).fill('')
    await t.escribir(descripciones.nth(1), 'Puerto de carga')
    await t.decir('Asigne el técnico ahora o más tarde, y registre la orden.', 600)
    await p.getByLabel('Técnico').selectOption(String(carlos.id))
    await t.resaltar(p.getByLabel('Técnico'), 700)
    await t.clic(p.getByRole('button', { name: 'Registrar orden' }))
    await p.waitForURL(/\/ordenes\/\d+$/)
    ordenId = Number(p.url().split('/').pop())
    await p.waitForTimeout(1200)
    await t.decir('La orden queda con su código y sus fotos. Entregue al cliente el comprobante de recepción: incluye las fotos y un código QR.', 600)
    await t.resaltar(p.getByRole('heading', { name: 'Fotos del equipo' }), 1500)
    await t.resaltar(p.getByRole('button', { name: 'Comprobante de recepción' }), 1800)
  })

  duraciones['diagnostico'] = await grabar(navegador, 'diagnostico', TECNICO, async (t) => {
    const p = t.pagina
    await ingresar(t, TECNICO)
    await t.decir('En Mis órdenes, el técnico ve solo las órdenes asignadas a él.', 1200)
    await p.goto(`${URL_BASE}/ordenes/${ordenId}`)
    await p.waitForTimeout(900)
    await t.decir('Al empezar a revisar el equipo, pulse Iniciar diagnóstico.', 400)
    await t.clic(p.getByRole('button', { name: 'Iniciar diagnóstico' }))
    await t.decir('Documente con fotos lo que encontró dentro del equipo.', 400)
    await t.clic(p.getByRole('button', { name: 'Agregar fotos' }))
    await p.locator('dialog input[type=file]').setInputFiles([path.join(FOTOS, 'placa-condensador.jpg')])
    await p.waitForTimeout(700)
    await t.escribir(t.dialogo().getByLabel(/Descripción de la foto/), 'Condensador inflado en la placa')
    await t.clic(t.dialogo().getByRole('button', { name: 'Guardar fotos' }))
    await p.waitForTimeout(1200)
    await t.decir('Registre el diagnóstico, la solución y el costo de la mano de obra.', 400)
    await t.clic(p.getByRole('button', { name: 'Registrar diagnóstico' }))
    const d = t.dialogo()
    await t.escribir(d.getByLabel(/Diagnóstico técnico/), 'Condensador de la fuente inflado')
    await t.escribir(d.getByLabel(/Causa probable/), 'Picos de voltaje')
    await t.escribir(d.getByLabel(/Solución propuesta/), 'Cambiar el condensador y limpiar la placa')
    await t.escribir(d.getByLabel(/Costo estimado/), '85000')
    await t.clic(d.getByRole('button', { name: 'Registrar diagnóstico' }))
    await t.decir('La orden pasa a Pendiente de aprobación hasta que el cliente responda.', 2200)
  })

  duraciones['entrega'] = await grabar(navegador, 'entrega', RECEPCION, async (t) => {
    const p = t.pagina
    await ingresar(t, RECEPCION)
    await p.goto(`${URL_BASE}/ordenes/${ordenId}`)
    await p.waitForTimeout(900)
    await t.decir('Cuando el cliente responde al presupuesto, registre su respuesta.', 400)
    await t.clic(p.getByRole('button', { name: 'Registrar respuesta del cliente' }))
    await t.clic(t.dialogo().getByText('Sí, aprueba el presupuesto'))
    await t.clic(t.dialogo().getByRole('button', { name: 'Registrar respuesta' }))
    await t.decir('La orden pasa a reparación. Cuando el técnico la verifica, queda Lista para entrega.', 1600)
    const lista = (await recepcion.get('/ordenes?estado=LISTA_PARA_ENTREGA&tamano=1')).results[0]
    await t.clic(p.locator('#menu-principal').getByRole('link', { name: 'Órdenes de servicio' }))
    await p.goto(`${URL_BASE}/ordenes/${lista.id}`)
    await p.waitForTimeout(900)
    await t.decir('Para entregar el equipo, pulse Entregar equipo y escriba quién lo recibe.', 400)
    await t.clic(p.getByRole('button', { name: 'Entregar equipo' }))
    await t.escribir(t.dialogo().getByLabel(/Nombre de quien recibe/), lista.cliente_nombre)
    await t.clic(t.dialogo().getByRole('button', { name: 'Entregar equipo' }))
    await t.decir('La orden queda Entregada y cerrada. Descargue el comprobante de entrega con el detalle de costos.', 600)
    await t.resaltar(p.getByRole('button', { name: 'Comprobante de entrega' }), 2000)
  })

  duraciones['reparacion'] = await grabar(navegador, 'reparacion', TECNICO, async (t) => {
    const p = t.pagina
    await ingresar(t, TECNICO)
    await p.goto(`${URL_BASE}/ordenes/${ordenId}`)
    await p.waitForTimeout(900)
    await t.decir('Con la orden en reparación, registre cada actividad con las horas empleadas.', 400)
    await t.clic(p.getByRole('button', { name: 'Registrar actividad' }))
    await t.escribir(t.dialogo().getByLabel(/Trabajo realizado/), 'Cambio de condensador y limpieza de la placa')
    await t.dialogo().getByLabel(/Horas empleadas/).fill('')
    await t.escribir(t.dialogo().getByLabel(/Horas empleadas/), '1.5')
    await t.clic(t.dialogo().getByRole('button', { name: 'Registrar actividad' }))
    await t.decir('Si falta una pieza, pulse Esperar repuestos e indique cuál: la orden queda detenida y visible en el panel.', 400)
    await t.clic(p.getByRole('button', { name: 'Esperar repuestos' }))
    await t.escribir(t.dialogo().getByLabel(/Repuesto que se espera/), 'Condensador 470 µF')
    await t.clic(t.dialogo().getByRole('button', { name: 'Esperar repuestos' }))
    await t.decir('Cuando el repuesto entra al inventario, pulse Reanudar reparación.', 400)
    await t.clic(p.getByRole('button', { name: 'Reanudar reparación' }))
    await t.decir('Agregue el repuesto: se descuenta del inventario y se suma al total de la orden.', 400)
    await t.clic(p.getByRole('button', { name: 'Agregar repuesto' }))
    const selector = t.dialogo().getByLabel('Repuesto')
    const opcion = await selector.locator('option:not([disabled])').nth(1).getAttribute('value')
    await selector.selectOption(opcion)
    await t.resaltar(selector, 700)
    await t.clic(t.dialogo().getByRole('button', { name: 'Agregar repuesto' }))
    await t.decir('Al terminar, envíe la orden a verificación con el costo final de la mano de obra.', 400)
    await t.clic(p.getByRole('button', { name: 'Enviar a verificación' }))
    await t.clic(t.dialogo().getByRole('button', { name: 'Enviar a verificación' }))
    await t.decir('Después de probar el equipo, el técnico registra la verificación y la orden queda lista para entrega.', 2200)
  })

  duraciones['inventario'] = await grabar(navegador, 'inventario', ADMIN, async (t) => {
    const p = t.pagina
    await ingresar(t, ADMIN)
    await t.decir('En Inventario, el contador del menú avisa cuántos repuestos están bajo el mínimo.', 600)
    await t.clic(p.getByRole('link', { name: /^Inventario/ }))
    const repuesto = (await admin.get('/repuestos?ordering=stock_actual&tamano=1')).results[0]
    await p.goto(`${URL_BASE}/inventario/${repuesto.id}`)
    await p.waitForTimeout(900)
    await t.decir('Cuando llega una compra, registre una Entrada con el número de la factura.', 400)
    await t.clic(p.getByRole('button', { name: 'Registrar movimiento' }))
    const d = t.dialogo()
    await d.getByLabel('Cantidad').fill('')
    await t.escribir(d.getByLabel('Cantidad'), '5')
    await t.escribir(d.getByLabel(/^Motivo/), 'Factura 0456 de Distribuidora Andina')
    await t.clic(d.getByRole('button', { name: 'Registrar movimiento' }))
    await t.decir('Para corregir el conteo o registrar una unidad dañada, use un Ajuste con número negativo.', 400)
    await t.clic(p.getByRole('button', { name: 'Registrar movimiento' }))
    await t.clic(t.dialogo().getByText('Ajuste por conteo físico, daño o pérdida'))
    await t.dialogo().getByLabel('Cantidad').fill('')
    await t.escribir(t.dialogo().getByLabel('Cantidad'), '-1')
    await t.escribir(t.dialogo().getByLabel(/^Motivo/), 'Unidad dañada en bodega')
    await t.clic(t.dialogo().getByRole('button', { name: 'Registrar movimiento' }))
    await t.decir('El kardex guarda cada movimiento con su fecha, usuario y existencias resultantes. Nada se borra.', 600)
    await t.resaltar(p.getByRole('heading', { name: /kardex/i }), 2200)
  })

  duraciones['reportes'] = await grabar(navegador, 'reportes', ADMIN, async (t) => {
    const p = t.pagina
    await ingresar(t, ADMIN)
    await t.decir('El panel resume el taller: órdenes por etapa, entregas vencidas, carga de cada técnico y repuestos por reponer.', 2600)
    await p.mouse.wheel(0, 500)
    await p.waitForTimeout(1500)
    await t.decir('En Reportes elija el periodo: verá ingresos, tiempos y repuestos más usados, y puede exportarlos.', 400)
    await t.clic(p.getByRole('link', { name: 'Reportes' }))
    await p.waitForTimeout(1500)
    await t.resaltar(p.getByRole('button', { name: 'Exportar PDF' }), 1400)
    await p.mouse.wheel(0, 600)
    await p.waitForTimeout(1500)
    await t.decir('En Auditoría consulte quién hizo cada cambio, desde qué equipo y cuándo.', 400)
    await t.clic(p.getByRole('link', { name: 'Auditoría' }))
    await p.waitForTimeout(2200)
  })

  await recepcion.cerrar()
  await admin.cerrar()
  await navegador.close()
  fs.rmSync(path.join(SALIDA, '.crudo'), { recursive: true, force: true })
  fs.writeFileSync(path.join(SALIDA, 'duraciones.json'), JSON.stringify(duraciones, null, 2))
  console.log(duraciones)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
