

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL_BASE = process.env.SIGESER_URL || 'http://localhost:8080';
const SALIDA = path.resolve(process.argv[2] || 'evidencia');
const ADMIN = { correo: process.env.SIGESER_ADMIN_CORREO || 'admin@sigeser.local', clave: process.env.SIGESER_ADMIN_CONTRASENA };
const RECEPCION = { correo: 'recepcion@sigeser.local', clave: process.env.SIGESER_DEMO_CONTRASENA };
const TECNICO = { correo: 'carlos.rodriguez@sigeser.local', clave: process.env.SIGESER_DEMO_CONTRASENA };
const PAUSA = Number(process.env.PAUSA_MS || 900);
const FOTOS = path.join(__dirname, 'fotos-demo');

for (const d of ['capturas', 'comprobantes', 'video']) fs.mkdirSync(path.join(SALIDA, d), { recursive: true });
if (!ADMIN.clave || !RECEPCION.clave) {
  console.error('Defina SIGESER_ADMIN_CONTRASENA y SIGESER_DEMO_CONTRASENA en el entorno.');
  process.exit(2);
}

const resultados = [];
let numeroCaptura = 0;

(async () => {
  // El idioma del navegador (--lang y LANG) define el formato día/mes/año de los campos de fecha, como en un equipo en español.
  const navegador = await chromium.launch({
    slowMo: Number(process.env.SLOWMO_MS || 60),
    args: ['--lang=es-CO'],
    env: { ...process.env, LANG: 'es_CO.UTF-8', LANGUAGE: 'es_CO' },
  });
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    acceptDownloads: true,
    recordVideo: { dir: path.join(SALIDA, 'video'), size: { width: 1440, height: 900 } },
  });
  const pagina = await contexto.newPage();
  const erroresConsola = [];
  pagina.on('console', (m) => {
    // El 401 de /auth/yo antes de ingresar es el comportamiento esperado (aún no hay sesión).
    if (m.type() === 'error' && !/401/.test(m.text())) erroresConsola.push(m.text());
  });
  pagina.on('pageerror', (e) => erroresConsola.push(String(e)));
  // Registro de las peticiones a la API que modifican datos: sirve de evidencia y para diagnosticar fallos.
  const peticiones = [];
  pagina.on('response', (r) => {
    const m = r.request().method();
    if (r.url().includes('/api/') && m !== 'GET') peticiones.push(`${r.status()} ${m} ${new URL(r.url()).pathname}`);
  });

  const esperar = (ms = PAUSA) => pagina.waitForTimeout(ms);
  const dialogo = () => pagina.getByRole('dialog');

  async function rotulo(texto) {
    // Rótulo del paso para el video; se inserta con la API del DOM (compatible con la CSP de la aplicación).
    await pagina.evaluate((t) => {
      let r = document.getElementById('rotulo-e2e');
      if (!r) {
        r = document.createElement('div');
        r.id = 'rotulo-e2e';
        Object.assign(r.style, {
          position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: '9999',
          background: '#0b2e2f', color: '#fff', padding: '12px 22px', borderRadius: '10px', font: '600 18px Barlow, sans-serif',
          boxShadow: '0 12px 28px -8px rgba(0,0,0,.45)', borderLeft: '5px solid #d9920f', pointerEvents: 'none',
        });
        document.body.appendChild(r);
      }
      r.textContent = t;
    }, texto);
  }

  async function paso(nombre, fn) {
    const inicio = Date.now();
    try {
      await fn();
      resultados.push({ paso: nombre, resultado: 'correcto', ms: Date.now() - inicio });
      console.log(`  correcto  ${nombre}`);
    } catch (e) {
      resultados.push({ paso: nombre, resultado: 'falló', error: String(e).split('\n')[0] });
      console.log(`  FALLÓ     ${nombre}: ${String(e).split('\n')[0]}`);
      await pagina.screenshot({ path: path.join(SALIDA, 'capturas', `error-${resultados.length}.png`) });
      throw e;
    }
  }

  async function capturar(nombre, opciones = {}) {
    numeroCaptura += 1;
    // El rótulo del video y las notificaciones flotantes no deben aparecer en las capturas del documento.
    const quitar = await pagina.evaluate(() => {
      const r = document.getElementById('rotulo-e2e');
      if (r) r.style.visibility = 'hidden';
      const n = document.querySelector('.notificaciones');
      if (n) n.style.visibility = 'hidden';
      return !!r;
    });
    await pagina.screenshot({ path: path.join(SALIDA, 'capturas', `${String(numeroCaptura).padStart(2, '0')}-${nombre}.png`), ...opciones });
    await pagina.evaluate((hayRotulo) => {
      if (hayRotulo) document.getElementById('rotulo-e2e').style.visibility = 'visible';
      const n = document.querySelector('.notificaciones');
      if (n) n.style.visibility = 'visible';
    }, quitar);
  }

  async function ingresar(usuario, texto) {
    await pagina.goto(`${URL_BASE}/ingresar`);
    await rotulo(texto);
    await pagina.getByLabel(/Correo electrónico/).fill(usuario.correo);
    await pagina.locator('input[autocomplete="current-password"]').fill(usuario.clave);
    await esperar(400);
    await pagina.getByRole('button', { name: 'Ingresar' }).click();
    await pagina.waitForURL((u) => !u.pathname.startsWith('/ingresar'));
  }

  async function salir() {
    await pagina.getByRole('button', { name: 'Cerrar sesión' }).click();
    await pagina.waitForURL(/\/ingresar/);
  }

  async function accion(boton, llenar, enviar = boton) {
    await pagina.getByRole('button', { name: boton, exact: true }).click();
    await dialogo().waitFor();
    if (llenar) await llenar(dialogo());
    await esperar(500);
    await dialogo().getByRole('button', { name: enviar, exact: true }).click();
    await dialogo().waitFor({ state: 'detached' });
    await pagina.getByRole('status').filter({ hasText: /./ }).first().waitFor();
    await esperar();
  }

  async function descargar(boton, nombre) {
    const [descarga] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: boton }).click()]);
    const destino = path.join(SALIDA, 'comprobantes', nombre);
    await descarga.saveAs(destino);
    const cabecera = fs.readFileSync(destino).subarray(0, 4).toString();
    if (cabecera !== '%PDF') throw new Error(`${nombre} no es un PDF válido`);
  }

  let urlOrden = '';
  let codigo = '';
  const estado = () => pagina.locator('.ficha .insignia').first();

  try {
    await pagina.goto(`${URL_BASE}/ingresar`);
    await esperar(600);
    await capturar('ingreso');

    await paso('Recepción ingresa y ve las órdenes activas', async () => {
      await ingresar(RECEPCION, 'Recepción: ingreso con su cuenta');
      await pagina.getByRole('heading', { name: 'Órdenes de servicio' }).waitFor();
      await rotulo('Recepción: órdenes en el taller');
      await esperar();
    });

    await paso('Recepción registra un cliente nuevo con autorización de datos', async () => {
      await pagina.getByRole('button', { name: 'Registrar orden' }).click();
      await rotulo('1. Recepción registra al cliente y su equipo');
      await pagina.getByRole('button', { name: 'Registrar cliente nuevo' }).click();
      const d = dialogo();
      // Documento distinto en cada ejecución: el sistema rechaza (con razón) documentos duplicados.
      await d.getByLabel(/Número de documento/).fill(`11${String(Date.now()).slice(-8)}`);
      await d.getByLabel(/Nombre o razón social/).fill('Ana Lucía Rojas Peña');
      await d.getByLabel(/Teléfono/).fill('3112345678');
      await d.getByLabel(/Correo electrónico/).fill('ana.rojas@correo-demo.co');
      await d.getByLabel(/Dirección/).fill('Barrio La Esperanza, Villavicencio');
      await d.getByRole('checkbox', { name: /autoriza el tratamiento/ }).check();
      await esperar(500);
      await capturar('registro-cliente');
      await d.getByRole('button', { name: 'Registrar cliente', exact: true }).click();
      await d.waitFor({ state: 'detached' });
    });

    await paso('Recepción registra el equipo del cliente', async () => {
      await pagina.getByRole('button', { name: 'Registrar otro equipo' }).click();
      const d = dialogo();
      await d.getByLabel(/Tipo de equipo/).selectOption('Portátil');
      await d.getByLabel(/Marca/).fill('Lenovo');
      await d.getByLabel(/Modelo/).fill('ThinkPad E14');
      await d.getByLabel(/Serial/).fill('PF3K9X21');
      await d.getByRole('button', { name: 'Registrar equipo', exact: true }).click();
      await d.waitFor({ state: 'detached' });
      await pagina.getByRole('radio', { name: /ThinkPad E14/ }).waitFor();
    });

    await paso('Recepción registra la orden y la asigna a un técnico', async () => {
      await pagina.getByLabel(/Falla reportada/).fill('Se apaga a los pocos minutos de encender y se calienta mucho.');
      await pagina.getByLabel(/Accesorios recibidos/).fill('Cargador original');
      await pagina.getByLabel(/^Estado físico/).fill('Rayón leve en la tapa');
      // RF-33: fotos del estado en que llega el equipo, cada una con su descripción.
      await pagina.locator('input[type=file]').setInputFiles([path.join(FOTOS, 'portatil-tapa.jpg'), path.join(FOTOS, 'puerto-carga.jpg')]);
      const descripciones = pagina.getByLabel(/Descripción de la foto/);
      await descripciones.nth(0).fill('Rayón leve en la tapa');
      await descripciones.nth(1).fill('Puerto de carga sin daños visibles');
      await pagina.getByLabel(/Prioridad/).selectOption('ALTA');
      const tecnico = pagina.getByLabel(/^Técnico/);
      const opcion = await tecnico.locator('option', { hasText: 'Carlos' }).getAttribute('value');
      await tecnico.selectOption(opcion);
      await esperar(500);
      await capturar('nueva-orden', { fullPage: true });
      await pagina.getByRole('button', { name: 'Registrar orden', exact: true }).click();
      await pagina.waitForURL(/\/ordenes\/\d+$/);
      urlOrden = pagina.url();
      codigo = (await pagina.locator('.ficha__codigo').textContent()).trim();
      if (!/^OS-\d{4}-\d{5}$/.test(codigo)) throw new Error(`Código inesperado: ${codigo}`);
      await rotulo(`Orden ${codigo} registrada (estado Recibida)`);
      await pagina.locator('.galeria__foto').nth(1).waitFor();
      if ((await pagina.locator('.galeria__foto').count()) !== 2) throw new Error('La orden no muestra las 2 fotos de recepción');
      await esperar();
      await capturar('orden-recibida', { fullPage: true });
    });

    await paso('Recepción descarga el comprobante de recepción (PDF con fotos y código QR)', async () => {
      await descargar('Comprobante de recepción', `${codigo}-recepcion.pdf`);
      const pdf = fs.readFileSync(path.join(SALIDA, 'comprobantes', `${codigo}-recepcion.pdf`));
      if (!pdf.includes('/Subtype /Image')) throw new Error('El comprobante de recepción no incluye las fotos');
      await salir();
    });

    await paso('El técnico inicia el diagnóstico y registra el presupuesto', async () => {
      await ingresar(TECNICO, '2. El técnico revisa el equipo');
      await pagina.getByRole('heading', { name: 'Mis órdenes' }).waitFor();
      await esperar();
      await pagina.getByRole('link', { name: codigo }).click();
      await pagina.getByRole('button', { name: 'Iniciar diagnóstico' }).click();
      await pagina.getByRole('button', { name: 'Registrar diagnóstico' }).waitFor();
      await rotulo('2. El técnico registra el diagnóstico y el presupuesto');
      await pagina.getByRole('button', { name: 'Registrar diagnóstico', exact: true }).click();
      const d = dialogo();
      await d.getByLabel(/Diagnóstico técnico/).fill('Ventilador obstruido y pasta térmica seca: el procesador llega a 98 °C en reposo.');
      await d.getByLabel(/Causa probable/).fill('Acumulación de polvo y pasta térmica deteriorada');
      await d.getByLabel(/Solución propuesta/).fill('Limpieza interna, cambio de ventilador y de pasta térmica');
      await d.getByLabel(/Costo estimado/).fill('70000');
      await esperar(500);
      await capturar('dialogo-diagnostico');
      await d.getByRole('button', { name: 'Registrar diagnóstico', exact: true }).click();
      await d.waitFor({ state: 'detached' });
      await estado().filter({ hasText: 'Pendiente de aprobación' }).waitFor();
      await esperar();
      // RF-33: el técnico documenta la falla con una foto de la placa.
      await rotulo('2. El técnico documenta la falla con una foto');
      await pagina.getByRole('button', { name: 'Agregar fotos' }).click();
      await dialogo().locator('input[type=file]').setInputFiles(path.join(FOTOS, 'placa-condensador.jpg'));
      await dialogo().getByLabel(/Descripción de la foto/).fill('Condensador inflado junto al ventilador');
      await esperar(500);
      await capturar('dialogo-fotos');
      await dialogo().getByRole('button', { name: 'Guardar fotos' }).click();
      await dialogo().waitFor({ state: 'detached' });
      await pagina.locator('.galeria__foto').nth(2).waitFor();
      await pagina.locator('.galeria__foto').nth(2).click();
      await dialogo().getByRole('heading', { name: 'Foto 3 de 3' }).waitFor();
      await esperar(800);
      await capturar('visor-fotos');
      await pagina.keyboard.press('ArrowLeft');
      await dialogo().getByRole('heading', { name: 'Foto 2 de 3' }).waitFor();
      await pagina.keyboard.press('Escape');
      await dialogo().waitFor({ state: 'detached' });
      await salir();
    });

    await paso('Recepción registra que el cliente aprueba el presupuesto', async () => {
      await ingresar(RECEPCION, '3. Recepción registra la respuesta del cliente');
      await pagina.goto(urlOrden);
      await rotulo('3. El cliente aprueba el presupuesto');
      await accion('Registrar respuesta del cliente', null, 'Registrar respuesta');
      await estado().filter({ hasText: 'En reparación' }).waitFor();
      await salir();
    });

    await paso('El técnico registra el trabajo y los repuestos usados', async () => {
      await ingresar(TECNICO, '4. El técnico repara el equipo');
      await pagina.goto(urlOrden);
      await rotulo('4. Trabajo realizado y repuestos usados');
      await accion('Registrar actividad', async (d) => {
        await d.getByLabel(/Trabajo realizado/).fill('Limpieza interna, cambio de ventilador y de pasta térmica');
        await d.getByLabel(/Horas empleadas/).fill('2');
      });
      for (const codigoRepuesto of ['VEN-PORT', 'PAS-TER']) {
        await accion('Agregar repuesto', async (d) => {
          const lista = d.getByLabel(/^Repuesto/);
          const valor = await lista.locator('option', { hasText: codigoRepuesto }).getAttribute('value');
          await lista.selectOption(valor);
          await d.getByLabel(/Cantidad/).fill('1');
        });
      }
      await capturar('orden-en-reparacion', { fullPage: true });
    });

    await paso('El técnico envía a verificación y aprueba las pruebas de calidad', async () => {
      await rotulo('5. Verificación de calidad');
      await accion('Enviar a verificación');
      await estado().filter({ hasText: 'En verificación' }).waitFor();
      await accion('Registrar verificación');
      await estado().filter({ hasText: 'Lista para entrega' }).waitFor();
      await salir();
    });

    await paso('Recepción entrega el equipo y descarga el comprobante de entrega', async () => {
      await ingresar(RECEPCION, '6. Recepción entrega el equipo al cliente');
      await pagina.goto(urlOrden);
      await rotulo('6. Entrega del equipo con su comprobante');
      await pagina.getByRole('button', { name: 'Entregar equipo', exact: true }).click();
      await dialogo().waitFor();
      await esperar(500);
      await capturar('dialogo-entrega');
      await dialogo().getByRole('button', { name: 'Entregar equipo', exact: true }).click();
      await dialogo().waitFor({ state: 'detached' });
      await estado().filter({ hasText: 'Entregada' }).waitFor();
      const total = (await pagina.locator('.ficha__total strong').textContent()).replace(/\s/g, ' ');
      if (!total.includes('148.000')) throw new Error(`Total inesperado: ${total} (se esperaba $ 148.000)`);
      await esperar();
      await capturar('orden-entregada', { fullPage: true });
      await descargar('Comprobante de entrega', `${codigo}-entrega.pdf`);
      await salir();
    });

    await paso('El administrador revisa el panel, los reportes y la auditoría', async () => {
      await ingresar(ADMIN, '7. El administrador supervisa el taller');
      await pagina.getByRole('heading', { name: 'Panel del taller' }).waitFor();
      await rotulo('7. Panel del taller');
      await esperar(1200);
      await capturar('panel');
      await pagina.goto(`${URL_BASE}/ordenes`);
      await pagina.getByRole('link', { name: codigo }).first().waitFor({ state: 'attached' }).catch(() => {});
      await esperar(600);
      await capturar('lista-ordenes');
      await pagina.goto(`${URL_BASE}/reportes`);
      await pagina.getByRole('heading', { name: /recibidas y entregadas/ }).waitFor();
      await rotulo('7. Reportes del período');
      await esperar(1200);
      await capturar('reportes', { fullPage: true });
      await pagina.goto(`${URL_BASE}/inventario`);
      await pagina.getByRole('heading', { name: 'Inventario de repuestos' }).waitFor();
      await esperar(600);
      await capturar('inventario');
      await pagina.getByRole('link', { name: 'VEN-PORT' }).click();
      await pagina.getByRole('heading', { name: /Movimientos/ }).waitFor();
      await esperar(600);
      await capturar('kardex');
      await pagina.goto(`${URL_BASE}/usuarios`);
      await pagina.getByRole('tab', { name: 'Roles y permisos' }).click();
      await pagina.getByRole('heading', { name: 'Matriz de permisos por rol' }).waitFor();
      await esperar(600);
      await capturar('matriz-permisos', { fullPage: true });
      await pagina.goto(`${URL_BASE}/auditoria`);
      await pagina.getByRole('heading', { name: 'Auditoría' }).waitFor();
      await rotulo('7. Auditoría: cada operación queda registrada');
      await esperar(1200);
      await capturar('auditoria');
      // RF-34: centro de ayuda con videotutoriales y subtítulos.
      await pagina.goto(`${URL_BASE}/ayuda`);
      await pagina.getByRole('heading', { name: 'Videotutoriales' }).waitFor();
      const video = await pagina.evaluate(async () => {
        const v = document.querySelector('video');
        if (v.readyState < 2) await new Promise((r, x) => { v.addEventListener('loadeddata', r, { once: true }); v.addEventListener('error', x, { once: true }) });
        return { duracion: v.duration, subtitulos: v.textTracks.length };
      });
      if (!(video.duracion > 5) || video.subtitulos !== 1) throw new Error(`El videotutorial no cargó: ${JSON.stringify(video)}`);
      await esperar(600);
      await capturar('ayuda');
      await pagina.goto(`${URL_BASE}/api/docs`);
      await pagina.waitForLoadState('networkidle');
      await esperar(1000);
      await capturar('documentacion-api');
    });

    if (erroresConsola.length) throw new Error(`Errores en la consola del navegador: ${erroresConsola.join(' | ')}`);
  } catch (e) {
    process.exitCode = 1;
  } finally {
    const video = pagina.video();
    await contexto.close();
    if (video) fs.renameSync(await video.path(), path.join(SALIDA, 'video', 'flujo-completo.webm'));
    await navegador.close();
    fs.writeFileSync(path.join(SALIDA, 'resultado-e2e.json'), JSON.stringify({ codigo, erroresConsola, resultados, peticiones }, null, 2));
    const ok = resultados.filter((r) => r.resultado === 'correcto').length;
    console.log(`\n${ok} de ${resultados.length} pasos correctos. Orden: ${codigo}. Errores de consola: ${erroresConsola.length}`);
  }
})();
