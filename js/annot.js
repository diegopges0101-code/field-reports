// =====================================================================
//  Marcas sobre fotos: motor de dibujo que comparten el editor
//  (annot-editor.js), las miniaturas y el PDF. Línea con punto y texto,
//  recorrido de cable por puntos (con medidas por tramo), flecha, línea,
//  círculo, cuadrado, número, texto, pegatina de equipo y cota.
//  Las marcas se guardan aparte (coordenadas 0–1); la foto original no se toca.
// =====================================================================
import { STICKERS, drawSticker, stickerPorts } from './stickers.js';
import { dimLayout, fmtDim } from './annot-geom.js';

export const COLORS = ['#e53935', '#fdd835', '#ffffff', '#1e88e5', '#43a047', '#111111', '#fb8c00', '#00acc1'];
// Tamaños: 0 = Fino, 1 = S, 2 = M, 3 = L (en unidades u = lado menor / 100). Sin tamaño cuenta como M.
const STROKE = { 0: 0.22, 1: 0.45, 2: 0.7, 3: 1.05 };
const FONT = { 0: 2.2, 1: 2.5, 2: 3.3, 3: 4.3 };
const NUM_R = { 0: 1.9, 1: 2.3, 2: 3.0, 3: 3.8 };
const SANS = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
};

export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function wrapText(ctx, text, maxW) {
  const out = [];
  String(text).split('\n').forEach((para) => {
    let line = '';
    para.split(/\s+/).forEach((w) => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    });
    out.push(line);
  });
  return out.filter((l, i, a) => l || a.length === 1);
}

/** Dibuja todas las marcas. Devuelve las cajas de texto (para tocarlas). */
export function drawAnnots(ctx, W, H, annots, opts = {}) {
  applyLinks(annots, W, H);
  const u = Math.min(W, H) / 100;
  const tr = opts.tr || ((a) => a.text);
  const boxes = new Map();
  for (const a of annots) {
    const s = a.size ?? 2;
    const lw = STROKE[s] * u;
    const col = a.color || COLORS[0];
    const halo = isLight(col) ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.75)';
    const X1 = a.x1 * W, Y1 = a.y1 * H, X2 = (a.x2 ?? a.x1) * W, Y2 = (a.y2 ?? a.y1) * H;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stroke = (fn) => {
      ctx.strokeStyle = halo; ctx.lineWidth = lw + u * 0.45; ctx.beginPath(); fn(); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); fn(); ctx.stroke();
    };
    const label = (txt, ax, ay, align) => {
      if (!txt) return null;
      const fs = FONT[s] * u;
      ctx.font = `600 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      const lines = wrapText(ctx, txt, W * 0.42);
      const pad = fs * 0.35, lh = fs * 1.2;
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
      const bh = lines.length * lh + pad * 1.2;
      let bx = align === 'left' ? ax : align === 'right' ? ax - bw : ax - bw / 2;
      let by = align === 'above' ? ay - bh - u : align === 'below' ? ay + u * 0.6 : ay - bh / 2;
      if (align === 'below') bx = ax - bw / 2;
      bx = Math.max(2, Math.min(W - bw - 2, bx)); by = Math.max(2, Math.min(H - bh - 2, by));
      ctx.fillStyle = col; ctx.strokeStyle = halo; ctx.lineWidth = u * 0.3;
      const r = Math.min(fs * 0.3, bh / 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, r); else ctx.rect(bx, by, bw, bh);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = isLight(col) ? '#111' : '#fff'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad * 0.7 + i * lh + (lh - fs) / 2));
      return { x: bx, y: by, w: bw, h: bh };
    };
    let box = null;
    const text = a.text ? tr(a) : '';
    switch (a.type) {
      case 'dim':
        box = drawDim(ctx, a, { W, H, u, lw, col, halo, s, X1, Y1, X2, Y2, text, editing: !!opts.editing });
        break;
      case 'callout': {
        stroke(() => { ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); });
        const dr = lw * 1.3 + u * 0.35;
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(X1, Y1, dr + u * 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X1, Y1, dr, 0, Math.PI * 2); ctx.fill();
        box = label(text, X2 + (X2 >= X1 ? u * 0.4 : -u * 0.4), Y2, X2 >= X1 ? 'left' : 'right');
        break;
      }
      case 'arrow': {
        const ang = Math.atan2(Y2 - Y1, X2 - X1), hl = lw * 4 + u * 1.5;
        stroke(() => { ctx.moveTo(X1, Y1); ctx.lineTo(X2 - Math.cos(ang) * hl * 0.6, Y2 - Math.sin(ang) * hl * 0.6); });
        const head = () => { ctx.moveTo(X2, Y2); ctx.lineTo(X2 - hl * Math.cos(ang - 0.42), Y2 - hl * Math.sin(ang - 0.42)); ctx.lineTo(X2 - hl * Math.cos(ang + 0.42), Y2 - hl * Math.sin(ang + 0.42)); ctx.closePath(); };
        ctx.fillStyle = halo; ctx.strokeStyle = halo; ctx.lineWidth = u * 0.45; ctx.beginPath(); head(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); head(); ctx.fill();
        break;
      }
      case 'line':
        stroke(() => { ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); });
        break;
      case 'route': {
        const P = (a.pts || []).map(([x, y]) => [x * W, y * H]);
        if (!P.length) break;
        ctx.setLineDash(a.dashed ? [lw * 2.6, lw * 2] : []);
        stroke(() => { ctx.moveTo(P[0][0], P[0][1]); P.slice(1).forEach(([x, y]) => ctx.lineTo(x, y)); });
        ctx.setLineDash([]);
        const dr = lw * 1.2 + u * 0.3;
        [P[0]].forEach(([x, y]) => { ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, dr + u * 0.25, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, dr, 0, Math.PI * 2); ctx.fill(); });
        // medidas por tramo: "20, 15, 5" → 20 m, 15 m, 5 m en el centro de cada tramo
        const L = String(a.lengths || '').split(/[,;]/).map((v) => v.trim());
        const fs = FONT[s] * u * 0.8;
        for (let i = 0; i < P.length - 1; i++) {
          const v = L[i]; if (!v) continue;
          const txt = /^[\d.,]+$/.test(v) ? `${v} m` : v;
          const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2;
          ctx.font = `700 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
          const tw = ctx.measureText(txt).width + fs * 0.7, th = fs * 1.35;
          const ang = Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]);
          const off = th * 0.9; // desplazado a un lado del tramo
          const bx = mx - Math.sin(ang) * off - tw / 2, by = my + Math.cos(ang) * off * (Math.cos(ang) >= 0 ? -1 : 1) - th / 2;
          ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = u * 0.3;
          ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, tw, th, th * 0.2); else ctx.rect(bx, by, tw, th); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + tw / 2, by + th / 2 + fs * 0.03);
        }
        const [ex, ey] = P[P.length - 1], [px, py] = P.length > 1 ? P[P.length - 2] : [ex - 1, ey];
        box = label(text, ex + (ex >= px ? u * 0.6 : -u * 0.6), ey, ex >= px ? 'left' : 'right');
        break;
      }
      case 'circle': {
        const cx = (X1 + X2) / 2, cy = (Y1 + Y2) / 2, rx = Math.abs(X2 - X1) / 2, ry = Math.abs(Y2 - Y1) / 2;
        stroke(() => ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2));
        box = label(text, Math.min(X1, X2), Math.min(Y1, Y2), 'above');
        break;
      }
      case 'rect': {
        const x = Math.min(X1, X2), y = Math.min(Y1, Y2), w = Math.abs(X2 - X1), hh = Math.abs(Y2 - Y1);
        stroke(() => ctx.rect(x, y, w, hh));
        box = label(text, x, y, 'above');
        break;
      }
      case 'number': {
        const r = NUM_R[s] * u;
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(X1, Y1, r + u * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X1, Y1, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = isLight(col) ? '#111' : '#fff';
        ctx.font = `700 ${r * 1.15}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(a.n), X1, Y1 + r * 0.05);
        box = { x: X1 - r, y: Y1 - r, w: r * 2, h: r * 2 };
        break;
      }
      case 'text':
        box = label(text || 'Texto', X1, Y1, 'left');
        break;
      case 'sticker': {
        // Pegatina de equipo: centro (x1,y1), ancho w (fracción del lado menor), giro rot, espejo flip, ghost = propuesta
        const g = stickerGeom(a, W, H);
        ctx.save(); ctx.translate(X1, Y1); ctx.rotate(g.rot); if (a.flip) ctx.scale(-1, 1);
        if (a.ghost) ctx.globalAlpha = 0.6;
        drawSticker(ctx, a.kind, g.sw);
        ctx.restore();
        if (a.ghost) {
          ctx.save(); ctx.translate(X1, Y1); ctx.rotate(g.rot);
          const m = u * 0.8, bw = g.sw + m * 2, bh = g.sh + m * 2;
          ctx.setLineDash([u * 1.4, u * 1]); ctx.lineWidth = u * 0.5; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
          ctx.lineWidth = u * 0.28; ctx.strokeStyle = '#fff'; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh); ctx.restore();
        }
        box = label(text, X1, Math.max(...g.corners.map((c) => c.y)), 'below');
        break;
      }
    }
    if (box) boxes.set(a.id, box);
  }
  return boxes;
}

/**
 * Cota: línea de medida entre dos puntos, desplazada `off` (fracción del lado menor, con signo),
 * con líneas de referencia, extremos según `end` (arrow | tick | dot) y caja con la medida.
 * No inventa medidas: sin valor solo dibuja la línea (y un «?» si se está editando).
 * Devuelve la caja de texto alineada a los ejes, o null si no hay texto.
 */
function drawDim(ctx, a, { W, H, u, lw, col, halo, s, X1, Y1, X2, Y2, text, editing }) {
  const L = dimLayout({ x: X1, y: Y1 }, { x: X2, y: Y2 }, (a.off || 0) * Math.min(W, H), u);
  const end = a.end || 'arrow';
  const { d1, d2, n } = L;
  const t = L.len > 0 ? { x: (X2 - X1) / L.len, y: (Y2 - Y1) / L.len } : { x: 1, y: 0 };
  const hw = lw + u * 0.3; // grosor del halo, más fino que en el resto de marcas
  const seg = (p, q) => { ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); };
  const line = (fn) => {
    ctx.strokeStyle = halo; ctx.lineWidth = hw; ctx.beginPath(); fn(); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); fn(); ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Líneas de referencia o, si la cota está pegada a la medida, topes perpendiculares
  if (L.e1) line(() => { seg(...L.e1); seg(...L.e2); });
  else {
    const h = 0.6 * u;
    line(() => { for (const d of [d1, d2]) seg({ x: d.x - n.x * h, y: d.y - n.y * h }, { x: d.x + n.x * h, y: d.y + n.y * h }); });
  }

  // Línea de cota (acortada bajo las flechas para que la punta quede limpia)
  const hl = 2.2 * u + 3 * lw;
  const cut = end === 'arrow' ? Math.min(hl * 0.6, L.len / 2) : 0;
  line(() => seg({ x: d1.x + t.x * cut, y: d1.y + t.y * cut }, { x: d2.x - t.x * cut, y: d2.y - t.y * cut }));

  // Extremos: dir = sentido hacia fuera de la cota en ese extremo
  for (const [d, dir] of [[d1, -1], [d2, 1]]) {
    const dx = t.x * dir, dy = t.y * dir;
    if (end === 'tick') {
      const c = Math.SQRT1_2, hh = 0.8 * u;
      const v = { x: (dx - dy) * c, y: (dx + dy) * c };
      line(() => seg({ x: d.x - v.x * hh, y: d.y - v.y * hh }, { x: d.x + v.x * hh, y: d.y + v.y * hh }));
    } else if (end === 'dot') {
      const r = 0.45 * u + lw;
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(d.x, d.y, r + u * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2); ctx.fill();
    } else {
      const ang = Math.atan2(dy, dx), k = 15 * Math.PI / 180;
      const head = () => { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - hl * Math.cos(ang - k), d.y - hl * Math.sin(ang - k)); ctx.lineTo(d.x - hl * Math.cos(ang + k), d.y - hl * Math.sin(ang + k)); ctx.closePath(); };
      ctx.fillStyle = halo; ctx.strokeStyle = halo; ctx.lineWidth = u * 0.3; ctx.beginPath(); head(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); head(); ctx.fill();
    }
  }
  ctx.restore();

  // Texto: medida (negrita) + etiqueta, en una caja blanca girada con la cota
  const val = fmtDim(a.val, a.unit);
  const runs = [];
  if (val) runs.push([val, 700]);
  if (val && text) runs.push([' · ', 600]);
  if (text) runs.push([text, 600]);
  const empty = !runs.length;
  if (empty) { if (!editing) return null; runs.push(['?', 700]); }
  const fs = FONT[s] * u;
  ctx.save();
  const widths = runs.map(([str, wt]) => { ctx.font = `${wt} ${fs}px ${SANS}`; return ctx.measureText(str).width; });
  const tw = widths.reduce((x, y) => x + y, 0);
  const bw = tw + fs * 0.8, bh = fs * 1.45;
  const c = Math.abs(Math.cos(L.ang)), sn = Math.abs(Math.sin(L.ang));
  const ew = bw * c + bh * sn, eh = bw * sn + bh * c; // caja envolvente alineada a los ejes
  // Posición normal; si se sale de la foto, al otro lado de la línea; si aún no cabe, se desplaza lo justo (margen 2 px, como label)
  const at = (k) => ({ x: L.mid.x + n.x * k * (bh / 2 + 0.5 * u), y: L.mid.y + n.y * k * (bh / 2 + 0.5 * u) });
  const fits = (p) => p.x - ew / 2 >= 2 && p.x + ew / 2 <= W - 2 && p.y - eh / 2 >= 2 && p.y + eh / 2 <= H - 2;
  let pos = at(1);
  if (!fits(pos) && fits(at(-1))) pos = at(-1);
  else if (!fits(pos)) pos = { x: Math.max(2 + ew / 2, Math.min(W - 2 - ew / 2, pos.x)), y: Math.max(2 + eh / 2, Math.min(H - 2 - eh / 2, pos.y)) };
  const cx = pos.x, cy = pos.y;
  ctx.translate(cx, cy); ctx.rotate(L.ang);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = u * 0.3;
  if (empty) ctx.setLineDash([u * 0.8, u * 0.5]);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-bw / 2, -bh / 2, bw, bh, Math.min(fs * 0.3, bh / 2)); else ctx.rect(-bw / 2, -bh / 2, bw, bh);
  ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let x = -tw / 2;
  runs.forEach(([str, wt], i) => { ctx.font = `${wt} ${fs}px ${SANS}`; ctx.fillText(str, x, fs * 0.04); x += widths[i]; });
  ctx.restore();
  return { x: cx - ew / 2, y: cy - eh / 2, w: ew, h: eh };
}

/** Geometría de una pegatina en píxeles: centro, tamaño, giro y esquinas */
export function stickerGeom(a, W, H) {
  const st = STICKERS[a.kind] || STICKERS.sl_standard;
  const sw = (a.w || 0.26) * Math.min(W, H), sh = sw * st.ar, rot = a.rot || 0;
  const cx = a.x1 * W, cy = a.y1 * H, cs = Math.cos(rot), sn = Math.sin(rot);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: cx + (i * sw / 2) * cs - (j * sh / 2) * sn, y: cy + (i * sw / 2) * sn + (j * sh / 2) * cs }));
  return { cx, cy, sw, sh, rot, cs, sn, corners };
}

/** Puntos de conexión de una pegatina en píxeles de la foto */
export function stickerPortPts(a, W, H) {
  const g = stickerGeom(a, W, H);
  return stickerPorts(a.kind, g.sw).map((p) => { const lx = a.flip ? -p.x : p.x; return { x: g.cx + lx * g.cs - p.y * g.sn, y: g.cy + lx * g.sn + p.y * g.cs }; });
}

/** Extremos de líneas y recorridos enganchados a una pegatina: siguen a la pegatina. links = { '1'|'2'|'v<n>': { s: idPegatina, p: nºPunto } } */
export function applyLinks(annots, W, H) {
  const byId = new Map(annots.filter((a) => a.type === 'sticker').map((a) => [a.id, a]));
  for (const a of annots) {
    if (!a.links) continue;
    for (const [k, l] of Object.entries(a.links)) {
      const st = byId.get(l.s);
      if (!st) continue; // la pegatina se borró: el extremo se queda donde estaba
      const pt = stickerPortPts(st, W, H)[l.p];
      if (!pt) continue;
      const nx = pt.x / W, ny = pt.y / H;
      if (k === '1') { a.x1 = nx; a.y1 = ny; }
      else if (k === '2') { a.x2 = nx; a.y2 = ny; }
      else if (k[0] === 'v' && a.pts && a.pts[+k.slice(1)]) a.pts[+k.slice(1)] = [nx, ny];
    }
  }
  return annots;
}

/** Foto + marcas en una sola imagen (para miniaturas y PDF), con el lado largo como mucho de maxSide px.
 *  Sin marcas también se reduce (una foto de 2560 px no va tal cual al PDF ni a una miniatura); si ya cabe, sale tal cual. */
export async function renderAnnotated(src, annots, { maxSide = 1600, quality = 0.85, tr } = {}) {
  const marks = annots?.length ? annots : null;
  let img;
  try { img = await loadImage(src); } catch (e) { if (marks) throw e; return src; } // sin marcas, como antes: la foto tal cual
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  if (!marks && k === 1) return src;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  if (marks) drawAnnots(ctx, c.width, c.height, marks, { tr });
  const out = c.toDataURL('image/jpeg', quality);
  c.width = c.height = 0; // suelta ya la memoria del lienzo (iOS)
  return out;
}

// Miniaturas de la cuadrícula (640 px, con o sin marcas). Las más antiguas salen de la caché: no crece sin límite.
const thumbCache = new Map();
export async function thumbFor(p) {
  if (!p.dataUrl) return '';
  const key = p.id + JSON.stringify(p.annots || []);
  if (!thumbCache.has(key)) {
    thumbCache.set(key, renderAnnotated(p.dataUrl, p.annots, { maxSide: 640, quality: 0.8 }));
    if (thumbCache.size > 300) thumbCache.delete(thumbCache.keys().next().value);
  }
  return thumbCache.get(key);
}
