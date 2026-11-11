// Genera las fotos de prueba de la demostración (ilustraciones vectoriales con aspecto de fotografía, no fotos reales).
// Uso: node pruebas-e2e/fotos-demo/generar.cjs  (las guarda en la misma carpeta)
const { chromium } = require('playwright')
const ruido = `<filter id="ruido"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.08 0"/></filter>`
const mesa = `<radialGradient id="luz" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#b9a58a"/><stop offset="1" stop-color="#5d4c3a"/></radialGradient>
<linearGradient id="vetas" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`
const fondo = `<rect width="1600" height="1200" fill="url(#luz)"/>${Array.from({length:14},(_,i)=>`<rect x="0" y="${i*90}" width="1600" height="40" fill="url(#vetas)"/>`).join('')}`
const escenas = {
  'portatil-tapa': `<defs>${ruido}${mesa}<linearGradient id="tapa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8e959c"/><stop offset=".45" stop-color="#c9cfd4"/><stop offset="1" stop-color="#6f767d"/></linearGradient></defs>${fondo}
   <rect x="250" y="230" width="1100" height="740" rx="34" fill="#2c2f33" opacity=".35" transform="translate(18 26)"/>
   <rect x="250" y="230" width="1100" height="740" rx="34" fill="url(#tapa)"/>
   <rect x="740" y="560" width="120" height="80" rx="10" fill="#9aa1a7" opacity=".7"/>
   <path d="M930 360 L1010 420 L1040 445 L1110 520" stroke="#f4f6f8" stroke-width="5" fill="none" opacity=".9"/>
   <path d="M932 364 L1012 424 L1042 449 L1112 524" stroke="#4b5157" stroke-width="2" fill="none" opacity=".6"/>
   <ellipse cx="420" cy="860" rx="38" ry="26" fill="#5b6167" opacity=".55"/>
   <rect width="1600" height="1200" filter="url(#ruido)"/>`,
  'celular-pantalla': `<defs>${ruido}${mesa}<linearGradient id="vidrio" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2128"/><stop offset=".5" stop-color="#2f3943"/><stop offset="1" stop-color="#0d1115"/></linearGradient></defs>${fondo}
   <rect x="560" y="120" width="480" height="960" rx="60" fill="#111" opacity=".35" transform="translate(16 22)"/>
   <rect x="560" y="120" width="480" height="960" rx="60" fill="#23272b"/>
   <rect x="585" y="150" width="430" height="900" rx="40" fill="url(#vidrio)"/>
   <circle cx="800" cy="185" r="12" fill="#0a0c0e"/>
   <g stroke="#e9eef2" stroke-width="2.5" fill="none" opacity=".85"><path d="M700 640 L640 520 L600 470"/><path d="M700 640 L820 560 L930 520 L1010 500"/><path d="M700 640 L760 760 L790 900 L820 1040"/><path d="M700 640 L620 700 L590 760"/><path d="M820 560 L860 470 L880 380"/><path d="M760 760 L880 800 L1000 820"/></g>
   <path d="M600 160 L1010 1040" stroke="#fff" stroke-width="70" opacity=".04"/>
   <rect width="1600" height="1200" filter="url(#ruido)"/>`,
  'placa-condensador': `<defs>${ruido}<radialGradient id="pcb" cx="40%" cy="35%" r="80%"><stop offset="0" stop-color="#1f7a4d"/><stop offset="1" stop-color="#0c3b26"/></radialGradient><linearGradient id="cap" x1="0" x2="1"><stop offset="0" stop-color="#2a3550"/><stop offset=".45" stop-color="#5a6b96"/><stop offset="1" stop-color="#1c2438"/></linearGradient></defs>
   <rect width="1600" height="1200" fill="url(#pcb)"/>
   <g stroke="#c9a54a" stroke-width="6" fill="none" opacity=".75">${Array.from({length:9},(_,i)=>`<path d="M0 ${130+i*115} H${380+i*40} L${460+i*40} ${80+i*115} H1600"/>`).join('')}</g>
   <g fill="#c9a54a">${Array.from({length:30},(_,i)=>`<circle cx="${120+(i%10)*150}" cy="${160+Math.floor(i/10)*380}" r="9"/>`).join('')}</g>
   <rect x="1020" y="520" width="300" height="220" rx="12" fill="#1a1a1a"/><rect x="1040" y="540" width="260" height="180" rx="8" fill="#2b2b2b"/>
   ${[[520,600,false],[700,600,true],[880,600,false]].map(([x,y,inflado])=>`<g transform="translate(${x} ${y})"><ellipse cx="0" cy="190" rx="78" ry="22" fill="#000" opacity=".35"/><rect x="-75" y="-150" width="150" height="330" rx="20" fill="url(#cap)"/><ellipse cx="0" cy="-150" rx="75" ry="${inflado?44:22}" fill="${inflado?'#9aa6c4':'#7f8db0'}"/><path d="M-40 -150 L40 -150 M0 -190 L0 -110" stroke="#2a3550" stroke-width="7" opacity="${inflado?.4:.8}"/>${inflado?'<path d="M-30 -168 Q0 -205 30 -168" fill="#5a3b1c" opacity=".7"/>':''}</g>`).join('')}
   <circle cx="700" cy="450" r="140" fill="none" stroke="#d9920f" stroke-width="10" stroke-dasharray="28 16"/>
   <rect width="1600" height="1200" filter="url(#ruido)"/>`,
  'puerto-carga': `<defs>${ruido}${mesa}<linearGradient id="borde" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f45"/><stop offset=".5" stop-color="#6c737b"/><stop offset="1" stop-color="#2b2f34"/></linearGradient></defs>${fondo}
   <rect x="160" y="420" width="1280" height="360" rx="170" fill="url(#borde)"/>
   <rect x="610" y="545" width="380" height="110" rx="55" fill="#0d0f11"/>
   <rect x="650" y="582" width="300" height="36" rx="10" fill="#2f3439"/>
   ${Array.from({length:12},(_,i)=>`<rect x="${662+i*24}" y="588" width="12" height="24" rx="2" fill="${[3,4,5,8].includes(i)?'#2e8f6a':'#d4b25b'}"/>`).join('')}
   <ellipse cx="760" cy="600" rx="60" ry="22" fill="#2e8f6a" opacity=".55"/>
   <circle cx="330" cy="600" r="26" fill="#111"/><circle cx="1270" cy="600" r="26" fill="#111"/>
   <rect width="1600" height="1200" filter="url(#ruido)"/>`,
}
;(async () => {
  const navegador = await chromium.launch()
  const pagina = await navegador.newPage({ viewport: { width: 1600, height: 1200 } })
  for (const [nombre, contenido] of Object.entries(escenas)) {
    await pagina.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">${contenido}</svg></body></html>`)
    await pagina.screenshot({ path: require('path').join(__dirname, `${nombre}.jpg`), type: 'jpeg', quality: 88 })
  }
  await navegador.close()
})()
