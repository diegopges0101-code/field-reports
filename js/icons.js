// =====================================================================
//  Iconos de la app a partir del logo de la empresa
//  - En la pestaña del navegador y al "Añadir a pantalla de inicio" en iPhone:
//    se aplican solos al abrir la app (se generan del logo que hay en Apps Script).
//  - Para instalar en Android/PC hacen falta archivos fijos: el administrador los
//    descarga en Empresa → "Descargar iconos" y los sube a la carpeta icons/ de GitHub.
// =====================================================================
import { h } from './ui.js';

const LS = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* lleno */ } } };

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

/** Zona con "tinta" del logo; con mode='symbol' solo el símbolo de la izquierda (el globo). */
function findBox(img, mode) {
  const w = img.naturalWidth, hgt = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, hgt); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, hgt).data;
  const ink = (x, y) => { const i = (y * w + x) * 4; return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) < 200; };
  const colInk = Array.from({ length: w }, (_, x) => { let n = 0; for (let y = 0; y < hgt; y++) if (ink(x, y)) n++; return n; });
  let x0 = colInk.findIndex((n) => n > 0); if (x0 < 0) return { x: 0, y: 0, w, h: hgt };
  let x1 = w - 1; while (x1 > x0 && !colInk[x1]) x1--;
  if (mode === 'symbol') {
    // fin del símbolo = primer hueco vertical claro tras empezar la tinta
    const gap = Math.max(3, Math.round(w * 0.025));
    let run = 0;
    for (let x = x0; x <= x1; x++) {
      run = colInk[x] ? 0 : run + 1;
      if (run >= gap) { const end = x - run; if ((end - x0) > w * 0.08 && (end - x0) < (x1 - x0) * 0.75) x1 = end; break; }
    }
  }
  let y0 = hgt, y1 = 0;
  for (let y = 0; y < hgt; y++) for (let x = x0; x <= x1; x++) if (ink(x, y)) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
  for (let y = hgt - 1; y > y1; y--) for (let x = x0; x <= x1; x++) if (ink(x, y)) { y1 = y; break; }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: Math.max(1, y1 - y0 + 1) };
}

/** Icono cuadrado: fondo blanco y el símbolo (o el logo) centrado con margen. */
export async function makeIcon(logo, size, { mode = 'symbol', maskable = false } = {}) {
  const img = await loadImg(logo);
  const b = findBox(img, mode);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  const pad = size * (maskable ? 0.22 : mode === 'full' ? 0.08 : 0.12);
  const k = Math.min((size - pad * 2) / b.w, (size - pad * 2) / b.h);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, b.x, b.y, b.w, b.h, (size - b.w * k) / 2, (size - b.h * k) / 2, b.w * k, b.h * k);
  return c;
}

function setLink(rel, href, sizes) {
  let el = document.querySelector(`link[rel="${rel}"]${sizes ? `[sizes="${sizes}"]` : ''}`);
  if (!el) { el = document.createElement('link'); el.rel = rel; if (sizes) el.sizes = sizes; document.head.appendChild(el); }
  el.href = href;
}

/** Aplica al instante el último icono generado (antes de que llegue nada del servidor). */
export function applyCachedIcons() {
  const fav = LS.get('fr_icon64'), apple = LS.get('fr_icon180');
  if (fav) setLink('icon', fav);
  if (apple) setLink('apple-touch-icon', apple);
}

/** Genera y aplica los iconos de pestaña / iPhone a partir del logo. */
export async function applyLogoIcons(logo) {
  if (!logo) return;
  const key = `${logo.length}:${logo.slice(-40)}:${LS.get('fr_icon_mode') || 'symbol'}`;
  if (LS.get('fr_icon_key') === key) { applyCachedIcons(); return; }
  try {
    const mode = LS.get('fr_icon_mode') || 'symbol';
    const fav = (await makeIcon(logo, 64, { mode })).toDataURL('image/png');
    const apple = (await makeIcon(logo, 180, { mode })).toDataURL('image/png');
    LS.set('fr_icon64', fav); LS.set('fr_icon180', apple); LS.set('fr_icon_key', key); LS.set('fr_logo', logo);
    setLink('icon', fav); setLink('apple-touch-icon', apple);
  } catch { /* logo no válido: se quedan los iconos por defecto */ }
}

export const cachedLogo = () => LS.get('fr_logo');
export const iconMode = () => LS.get('fr_icon_mode') || 'symbol';
export const setIconMode = (m) => { LS.set('fr_icon_mode', m); LS.set('fr_icon_key', ''); };

// ---------------------------------------------------------------------
// Descarga de los iconos para GitHub (un .zip con los 5 archivos)
// ---------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** ZIP mínimo sin compresión (los PNG ya van comprimidos). */
function zip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const csize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

const toBytes = (canvas) => new Promise((res) => canvas.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));

export async function iconsZip(logo, mode) {
  const spec = [['icon-192.png', 192, {}], ['icon-512.png', 512, {}], ['icon-maskable-512.png', 512, { maskable: true }], ['apple-touch-icon.png', 180, {}], ['favicon-64.png', 64, {}]];
  const files = [];
  for (const [name, size, o] of spec) files.push({ name, data: await toBytes(await makeIcon(logo, size, { mode, ...o })) });
  return zip(files);
}

/** Vista previa para la pantalla Empresa. */
export async function iconPreview(logo, mode) {
  const c = await makeIcon(logo, 192, { mode });
  return h('div', { class: 'icon-prev' },
    h('img', { src: c.toDataURL('image/png'), alt: 'Icono', class: 'ip-square' }),
    h('img', { src: c.toDataURL('image/png'), alt: 'Icono redondo', class: 'ip-round' }),
    h('span', { class: 'muted small' }, 'Así se verá el icono (cuadrado en iPhone, redondo en Android).'));
}
