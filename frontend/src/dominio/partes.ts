/**
 * Catálogo de partes para el diagrama interactivo del equipo (RF-36).
 * Cada parte tiene palabras clave: si aparecen en la falla reportada o en el diagnóstico, la parte se resalta
 * como posiblemente afectada.
 */
export type TipoDiagrama = 'portatil' | 'celular'

export interface Parte {
  id: string
  nombre: string
  descripcion: string
  /** Fallas frecuentes, para orientar al técnico y al cliente. */
  fallas: string[]
  palabras: string[]
  interna: boolean
}

export const PARTES: Record<TipoDiagrama, Parte[]> = {
  portatil: [
    { id: 'pantalla', nombre: 'Pantalla', descripcion: 'Panel LCD o LED y su cable de video (flex).', fallas: ['Rayas o manchas', 'Sin imagen', 'Pantalla rota'], palabras: ['pantalla', 'video', 'imagen', 'display', 'rayas'], interna: false },
    { id: 'camara', nombre: 'Cámara web', descripcion: 'Cámara y micrófonos en el marco superior.', fallas: ['No detecta la cámara', 'Imagen oscura'], palabras: ['camara', 'webcam', 'microfono'], interna: false },
    { id: 'bisagras', nombre: 'Bisagras', descripcion: 'Sostienen la pantalla y protegen el cable de video.', fallas: ['Bisagra floja o rota', 'Carcasa abierta'], palabras: ['bisagra', 'tapa'], interna: false },
    { id: 'teclado', nombre: 'Teclado', descripcion: 'Teclado con su cable flex hacia la tarjeta madre.', fallas: ['Teclas que no responden', 'Derrame de líquido'], palabras: ['teclado', 'tecla', 'liquido', 'derrame'], interna: false },
    { id: 'touchpad', nombre: 'Touchpad', descripcion: 'Superficie táctil y botones del ratón integrado.', fallas: ['No responde', 'Cursor errático'], palabras: ['touchpad', 'mouse', 'cursor', 'raton'], interna: false },
    { id: 'puertos', nombre: 'Puertos y conector de carga', descripcion: 'USB, HDMI, audio y conector del cargador.', fallas: ['Puerto flojo', 'No carga al conectar'], palabras: ['puerto', 'usb', 'hdmi', 'cargador', 'carga', 'conector'], interna: false },
    { id: 'bateria', nombre: 'Batería', descripcion: 'Batería de iones de litio; se revisa el ciclo y la hinchazón.', fallas: ['Dura poco', 'No carga', 'Batería inflada'], palabras: ['bateria', 'carga', 'dura', 'apaga', 'enciende'], interna: true },
    { id: 'placa', nombre: 'Tarjeta madre', descripcion: 'Procesador, chipset y circuito de energía.', fallas: ['No enciende', 'Cortos', 'Sin video'], palabras: ['enciende', 'no prende', 'corto', 'placa', 'tarjeta'], interna: true },
    { id: 'ram', nombre: 'Memoria RAM', descripcion: 'Módulos de memoria de trabajo.', fallas: ['Pitidos al encender', 'Pantallazos azules'], palabras: ['ram', 'memoria', 'pantallazo', 'pitido', 'lento'], interna: true },
    { id: 'disco', nombre: 'Disco (HDD o SSD)', descripcion: 'Almacenamiento del sistema operativo y los datos.', fallas: ['Lentitud', 'No inicia el sistema', 'Pérdida de datos'], palabras: ['disco', 'lento', 'windows', 'inicia', 'arranca', 'ssd'], interna: true },
    { id: 'ventilador', nombre: 'Ventilador y disipador', descripcion: 'Sistema de enfriamiento con pasta térmica.', fallas: ['Sobrecalentamiento', 'Ruido', 'Se apaga solo'], palabras: ['calienta', 'temperatura', 'ruido', 'ventilador', 'apaga'], interna: true },
  ],
  celular: [
    { id: 'pantalla', nombre: 'Pantalla y táctil', descripcion: 'Módulo de pantalla con el digitalizador táctil.', fallas: ['Pantalla rota', 'Táctil sin respuesta', 'Manchas'], palabras: ['pantalla', 'tactil', 'touch', 'rota', 'vidrio'], interna: false },
    { id: 'camara_frontal', nombre: 'Cámara frontal', descripcion: 'Cámara de selfies y sensor de proximidad.', fallas: ['Imagen borrosa', 'No abre la cámara'], palabras: ['camara', 'selfie'], interna: false },
    { id: 'botones', nombre: 'Botones', descripcion: 'Encendido y volumen.', fallas: ['Botón hundido', 'No responde'], palabras: ['boton', 'volumen', 'encendido'], interna: false },
    { id: 'puerto', nombre: 'Puerto de carga', descripcion: 'Conector USB-C o Lightning y micrófono inferior.', fallas: ['Hay que mover el cable', 'No carga'], palabras: ['carga', 'cable', 'puerto', 'conector'], interna: false },
    { id: 'altavoz', nombre: 'Altavoz y auricular', descripcion: 'Parlante inferior y auricular de llamadas.', fallas: ['No se escucha', 'Sonido distorsionado'], palabras: ['sonido', 'audio', 'altavoz', 'escucha', 'parlante'], interna: false },
    { id: 'bateria', nombre: 'Batería', descripcion: 'Batería de polímero de litio.', fallas: ['Dura poco', 'Se apaga', 'Batería inflada'], palabras: ['bateria', 'dura', 'apaga', 'carga'], interna: true },
    { id: 'placa', nombre: 'Placa lógica', descripcion: 'Procesador, memoria y módem.', fallas: ['No enciende', 'Sin señal', 'Reinicios'], palabras: ['enciende', 'señal', 'reinicia', 'placa'], interna: true },
    { id: 'camara_trasera', nombre: 'Cámaras traseras', descripcion: 'Módulo de cámaras y flash.', fallas: ['Lente rayado', 'No enfoca'], palabras: ['camara', 'lente', 'enfoca', 'flash'], interna: true },
  ],
}

/** Elige el diagrama según el texto del equipo («Portátil Lenovo IdeaPad 3», «Celular Samsung…»). */
export function tipoDiagrama(equipo: string): TipoDiagrama | null {
  const texto = sinTildes(equipo)
  if (/(portatil|laptop|notebook|macbook)/.test(texto)) return 'portatil'
  if (/(celular|telefono|smartphone|iphone|tableta|tablet|ipad)/.test(texto)) return 'celular'
  return null
}

/** Partes cuyas palabras clave aparecen en la falla o el diagnóstico. */
export function partesSospechosas(tipo: TipoDiagrama, ...textos: (string | null | undefined)[]): Set<string> {
  const texto = sinTildes(textos.filter(Boolean).join(' '))
  return new Set(PARTES[tipo].filter((p) => p.palabras.some((palabra) => texto.includes(sinTildes(palabra)))).map((p) => p.id))
}

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
