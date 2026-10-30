// =====================================================================
//  Editor de fotos por objetos: línea con punto y descripción, recorrido de
//  cable por puntos (con medidas por tramo), flecha, línea, círculo, cuadrado,
//  número y texto. Cada herramienta queda activa para encadenar marcas; solo
//  "Mover" selecciona, mueve y ajusta. Lupa, imán a otras líneas y enderezado.
//  Las marcas se guardan aparte (coordenadas 0–1), la foto original no se toca.
// =====================================================================
import { h, uid } from './ui.js';

export const COLORS = ['#e53935', '#fdd835', '#ffffff', '#1e88e5', '#43a047', '#111111'];
const STROKE = [0.45, 0.7, 1.05];
const FONT = [2.5, 3.3, 4.3];
const NUM_R = [2.3, 3.0, 3.8];
const TEXT_TYPES = ['callout', 'text', 'number', 'circle', 'rect', 'route'];

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
  const u = Math.min(W, H) / 100;
  const tr = opts.tr || ((a) => a.text);
  const boxes = new Map();
  for (const a of annots) {
    const s = (a.size || 2) - 1;
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
      let by = align === 'above' ? ay - bh - u : ay - bh / 2;
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
    }
    if (box) boxes.set(a.id, box);
  }
  return boxes;
}

/** Foto + marcas en una sola imagen (para miniaturas y PDF). */
export async function renderAnnotated(src, annots, { maxSide = 1600, quality = 0.85, tr } = {}) {
  if (!annots || !annots.length) return src;
  const img = await loadImage(src);
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  drawAnnots(ctx, c.width, c.height, annots, { tr });
  return c.toDataURL('image/jpeg', quality);
}

const thumbCache = new Map();
export async function thumbFor(p) {
  if (!p.dataUrl) return '';
  if (!p.annots?.length) return p.dataUrl;
  const key = p.id + JSON.stringify(p.annots);
  if (!thumbCache.has(key)) thumbCache.set(key, renderAnnotated(p.dataUrl, p.annots, { maxSide: 640, quality: 0.8 }));
  return thumbCache.get(key);
}

// =====================================================================
//  EDITOR A PANTALLA COMPLETA
// =====================================================================
const TOOLS = [
  ['callout', '⟋•', 'Línea+texto'], ['route', '⤷', 'Recorrido'], ['arrow', '➜', 'Flecha'], ['line', '╱', 'Línea'],
  ['rect', '▢', 'Cuadrado'], ['circle', '◯', 'Círculo'], ['number', '①', 'Número'], ['text', 'T', 'Texto'],
  ['select', '✋', 'Mover'],
];
const HINT = {
  callout: 'Pon el dedo en el punto exacto y arrastra hasta donde irá el texto. Después escribe la descripción.',
  route: 'Toca punto a punto el recorrido del cable (puedes arrastrar antes de soltar para afinar). Pulsa «Terminar» al acabar.',
  arrow: 'Arrastra desde el inicio hasta la punta de la flecha.',
  line: 'Arrastra de un extremo al otro. Se pega a otras líneas y se endereza sola.',
  rect: 'Arrastra en diagonal para dibujar el cuadrado.',
  circle: 'Arrastra en diagonal para dibujar el círculo.',
  number: 'Toca donde quieras el número y escribe qué señala.',
  text: 'Toca donde quieras el texto y escríbelo.',
  select: 'Toca una marca para moverla, cambiarla o borrarla. Arrastra los puntos blancos para ajustarla.',
};
const PLACEHOLDER = { callout: 'Descripción (ej. Antena Starlink)', text: 'Texto', number: 'Qué señala este número', circle: 'Etiqueta (opcional)', rect: 'Etiqueta (opcional)', route: 'Texto al final (ej. Infra Veolia)' };
const LINEISH = ['callout', 'arrow', 'line'];
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('pe-' + k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('pe-' + k, JSON.stringify(v)); } catch { /* */ } } };

export function openPhotoEditor(photo, { caption = '', onSave }) {
  let annots = JSON.parse(JSON.stringify(photo.annots || []));
  let tool = store.get('tool', 'callout');
  if (!TOOLS.some((t) => t[0] === tool)) tool = 'callout';
  let color = store.get('color', COLORS[0]);
  let size = store.get('size', 2);
  let selId = null;          // marca activa (para escribir su texto o editarla con "Mover")
  let draft = null;          // recorrido que se está dibujando
  const undo = [], redo = [];
  let boxes = new Map();
  let img;
  let dirty = false;
  const touchUI = matchMedia('(pointer: coarse)').matches;

  const canvas = h('canvas', {});
  const ctx = canvas.getContext('2d');
  const loupe = h('canvas', { class: 'pe-loupe', hidden: true });
  const lctx = loupe.getContext('2d');
  const zoomBox = h('div', { class: 'pe-zoom' });
  const stage = h('div', { class: 'pe-stage' }, canvas, zoomBox);
  const hint = h('div', { class: 'pe-hint' });
  const props = h('div', { class: 'pe-props' });
  const tools = h('div', { class: 'pe-tools' });
  const capInput = h('input', { value: caption, placeholder: 'Pie de foto (opcional)', style: { flex: 1 } });
  const root = h('div', { class: 'pe' },
    h('div', { class: 'pe-top' },
      h('button', { onclick: () => close(false) }, 'Cancelar'),
      h('div', { class: 'row', style: { flex: 1, justifyContent: 'center' } },
        h('button', { 'aria-label': 'Deshacer', title: 'Deshacer (Ctrl+Z)', onclick: () => doUndo() }, '↶ Deshacer'),
        h('button', { 'aria-label': 'Rehacer', title: 'Rehacer (Ctrl+Y)', onclick: () => doRedo() }, '↷')),
      h('button', { class: 'primary', onclick: () => close(true) }, 'Guardar')),
    hint, stage, props, tools,
    h('div', { class: 'pe-props pe-cap' }, capInput), loupe);
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  // Botones fiables con el dedo (se activan al levantar el dedo; se ignora el click duplicado)
  let down = null;
  root.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); down = b && !stage.contains(b) ? { b, x: e.clientX, y: e.clientY } : (b ? { b, x: e.clientX, y: e.clientY } : null); }, true);
  root.addEventListener('pointerup', (e) => {
    const b = e.target.closest('button');
    if (!down || b !== down.b || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12 || b.disabled) { down = null; return; }
    down = null; b._fired = Date.now(); b.click();
  }, true);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && e.isTrusted && b._fired && Date.now() - b._fired < 700) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  const sel = () => annots.find((a) => a.id === selId);
  const snapshot = () => { undo.push(JSON.stringify(annots)); if (undo.length > 80) undo.shift(); redo.length = 0; dirty = true; };
  const W = () => canvas.width, H = () => canvas.height;

  // ---------- vista (zoom y desplazamiento) ----------
  let view = { s: 1, tx: 0, ty: 0 };
  function fit() {
    if (!img) return;
    const r = stage.getBoundingClientRect();
    const k = Math.min(r.width / canvas.width, r.height / canvas.height);
    canvas.style.width = `${canvas.width * k}px`; canvas.style.height = `${canvas.height * k}px`;
    applyView();
  }
  function applyView() {
    if (view.s <= 1.001) view = { s: 1, tx: 0, ty: 0 };
    canvas.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
    drawZoom();
  }
  function zoomAt(px, py, ns) {
    ns = Math.max(1, Math.min(8, ns));
    const sr = stage.getBoundingClientRect();
    const bx = sr.left + canvas.offsetLeft, by = sr.top + canvas.offsetTop;
    const cx = (px - bx - view.tx) / view.s, cy = (py - by - view.ty) / view.s;
    view = { s: ns, tx: px - bx - ns * cx, ty: py - by - ns * cy };
    applyView();
  }
  const zoomCenter = (f) => { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.s * f); };
  function drawZoom() {
    zoomBox.innerHTML = '';
    zoomBox.append(...[
      h('button', { 'aria-label': 'Alejar', onclick: () => zoomCenter(1 / 1.6), disabled: view.s <= 1 }, '−'),
      h('button', { 'aria-label': 'Acercar', onclick: () => zoomCenter(1.6) }, '+'),
      view.s > 1 ? h('button', { 'aria-label': 'Ver toda la foto', onclick: () => { view = { s: 1, tx: 0, ty: 0 }; applyView(); } }, '⤢') : null].filter(Boolean));
  }
  const pxScale = () => canvas.width / canvas.getBoundingClientRect().width; // px de imagen por px de pantalla

  // ---------- dibujo ----------
  let snapMark = null;
  function redraw() {
    if (!img) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const list = draft && !annots.includes(draft) ? [...annots, draft] : annots;
    boxes = drawAnnots(ctx, canvas.width, canvas.height, list);
    const k = pxScale();
    // recorrido en curso: tramo provisional hasta el dedo
    if (draft && draft.preview && !draft.pts.length) { // primer punto: solo se marca dónde caerá
      ctx.fillStyle = '#fff'; ctx.strokeStyle = draft.color; ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.arc(draft.preview[0] * W(), draft.preview[1] * H(), 7 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (draft && draft.preview && draft.pts.length) {
      const last = draft.pts[draft.pts.length - 1];
      ctx.save(); ctx.setLineDash([8 * k, 6 * k]); ctx.strokeStyle = draft.color; ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.moveTo(last[0] * W(), last[1] * H()); ctx.lineTo(draft.preview[0] * W(), draft.preview[1] * H()); ctx.stroke(); ctx.restore();
    }
    if (draft) draft.pts.forEach(([x, y]) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = draft.color; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.arc(x * W(), y * H(), 7 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    const a = sel();
    if (a && tool === 'select') {
      const bb = bbox(a);
      ctx.save(); ctx.lineWidth = 2 * k; ctx.strokeStyle = '#111'; ctx.strokeRect(bb.x - 8 * k, bb.y - 8 * k, bb.w + 16 * k, bb.h + 16 * k);
      ctx.setLineDash([6 * k, 5 * k]); ctx.strokeStyle = '#fff'; ctx.strokeRect(bb.x - 8 * k, bb.y - 8 * k, bb.w + 16 * k, bb.h + 16 * k); ctx.restore();
      handles(a).forEach((p) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3.5 * k; ctx.beginPath(); ctx.arc(p.x, p.y, 12 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    }
    if (snapMark) { ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.arc(snapMark.x, snapMark.y, 14 * k, 0, Math.PI * 2); ctx.stroke(); }
  }
  function pointsOf(a) {
    if (a.type === 'route') return (a.pts || []).map(([x, y]) => ({ x: x * W(), y: y * H() }));
    if (a.x2 == null) return [{ x: a.x1 * W(), y: a.y1 * H() }];
    return [{ x: a.x1 * W(), y: a.y1 * H() }, { x: a.x2 * W(), y: a.y2 * H() }];
  }
  function bbox(a) {
    const ps = pointsOf(a); const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    const b = boxes.get(a.id);
    if (b) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); }
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  function handles(a) {
    if (LINEISH.includes(a.type)) return pointsOf(a).map((p, i) => ({ k: i + 1, ...p }));
    if (a.type === 'route') return pointsOf(a).map((p, i) => ({ k: 'v' + i, ...p }));
    if (['circle', 'rect'].includes(a.type)) return [
      { k: 'tl', x: Math.min(a.x1, a.x2) * W(), y: Math.min(a.y1, a.y2) * H() }, { k: 'tr', x: Math.max(a.x1, a.x2) * W(), y: Math.min(a.y1, a.y2) * H() },
      { k: 'bl', x: Math.min(a.x1, a.x2) * W(), y: Math.max(a.y1, a.y2) * H() }, { k: 'br', x: Math.max(a.x1, a.x2) * W(), y: Math.max(a.y1, a.y2) * H() }];
    return [];
  }

  // ---------- precisión: imán a otras líneas y enderezado ----------
  function snap(pt, { anchor = null, exclude = null, vertex = -1 } = {}) {
    const tol = 18 * pxScale();
    let best = null, bd = tol;
    const cand = (p) => { const d = Math.hypot(p.x - pt.x, p.y - pt.y); if (d < bd) { bd = d; best = p; } };
    annots.forEach((a) => {
      if (a.type !== 'route' && !LINEISH.includes(a.type)) return;
      pointsOf(a).forEach((p, i) => {
        if (a.id === exclude && (vertex < 0 || LINEISH.includes(a.type) || i === vertex)) return; // nunca a sí misma
        cand(p);
      });
    });
    if (draft && draft.id !== exclude) draft.pts.slice(0, -1).forEach(([x, y]) => cand({ x: x * W(), y: y * H() }));
    if (best) { snapMark = best; return { x: best.x, y: best.y }; }
    snapMark = null;
    if (anchor) {
      const dx = pt.x - anchor.x, dy = pt.y - anchor.y, d = Math.hypot(dx, dy);
      if (d > 12 * pxScale()) {
        const ang = Math.atan2(dy, dx), step = Math.PI / 4, near = Math.round(ang / step) * step;
        if (Math.abs(ang - near) < (5 * Math.PI) / 180) return { x: anchor.x + Math.cos(near) * d, y: anchor.y + Math.sin(near) * d };
      }
    }
    return pt;
  }
  const clampPt = (p) => ({ x: Math.max(0, Math.min(W(), p.x)), y: Math.max(0, Math.min(H(), p.y)) });
  const N = (p) => ({ x: p.x / W(), y: p.y / H() });

  // ---------- tocar marcas (solo en "Mover") ----------
  const distSeg = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };
  function hit(pt) {
    const tol = 16 * pxScale();
    for (let i = annots.length - 1; i >= 0; i--) {
      const a = annots[i];
      const b = boxes.get(a.id);
      if (b && pt.x >= b.x - 4 && pt.x <= b.x + b.w + 4 && pt.y >= b.y - 4 && pt.y <= b.y + b.h + 4) return a;
      const ps = pointsOf(a);
      if ((LINEISH.includes(a.type) || a.type === 'route') && ps.some((p, j) => j > 0 && distSeg(pt.x, pt.y, ps[j - 1].x, ps[j - 1].y, p.x, p.y) <= tol)) return a;
      if (['number', 'text'].includes(a.type) && Math.hypot(ps[0].x - pt.x, ps[0].y - pt.y) <= tol * 2) return a;
      if (a.type === 'rect' || a.type === 'circle') {
        const [p1, p2] = ps;
        if (pt.x >= Math.min(p1.x, p2.x) - tol && pt.x <= Math.max(p1.x, p2.x) + tol && pt.y >= Math.min(p1.y, p2.y) - tol && pt.y <= Math.max(p1.y, p2.y) + tol) return a;
      }
    }
    return null;
  }
  function hitHandle(pt) {
    const a = sel(); if (!a) return null;
    const tol = 24 * pxScale();
    return handles(a).find((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= tol) || null;
  }

  // ---------- lupa ----------
  const LOUPE = 150;
  function showLoupe(e, pt) {
    if (e.pointerType === 'mouse') return;
    const dpr = devicePixelRatio || 1;
    if (loupe.width !== LOUPE * dpr) { loupe.width = LOUPE * dpr; loupe.height = LOUPE * dpr; }
    let x = e.clientX - LOUPE / 2, y = e.clientY - LOUPE - 50;
    if (y < 8) y = e.clientY + 50;
    x = Math.max(6, Math.min(innerWidth - LOUPE - 6, x));
    loupe.style.left = `${x}px`; loupe.style.top = `${y}px`; loupe.hidden = false;
    const disp = canvas.getBoundingClientRect().width / canvas.width;
    const src = LOUPE / (disp * 2.2);
    lctx.fillStyle = '#000'; lctx.fillRect(0, 0, loupe.width, loupe.height);
    lctx.drawImage(canvas, pt.x - src / 2, pt.y - src / 2, src, src, 0, 0, loupe.width, loupe.height);
    const c = loupe.width / 2;
    lctx.strokeStyle = 'rgba(0,0,0,.6)'; lctx.lineWidth = 3 * dpr; lctx.beginPath(); lctx.moveTo(c - 14 * dpr, c); lctx.lineTo(c + 14 * dpr, c); lctx.moveTo(c, c - 14 * dpr); lctx.lineTo(c, c + 14 * dpr); lctx.stroke();
    lctx.strokeStyle = '#fff'; lctx.lineWidth = 1.5 * dpr; lctx.stroke();
  }
  const hideLoupe = () => { loupe.hidden = true; };

  // ---------- gestos ----------
  const pointers = new Map();
  let op = null;
  let pinch = null;
  const toPt = (e) => {
    const r = canvas.getBoundingClientRect();
    return clampPt({ x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) });
  };
  function cancelOp() {
    if (op?.created) annots = annots.filter((a) => a !== op.created);
    if (op?.snap0) annots = JSON.parse(op.snap0);
    if (draft) draft.preview = null;
    op = null; snapMark = null; hideLoupe(); redraw();
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pe-zoom')) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      cancelOp();
      const [p1, p2] = [...pointers.values()];
      pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2, view: { ...view } };
      return;
    }
    if (pointers.size > 2 || !img) return;
    const pt = toPt(e);
    const sx = e.clientX, sy = e.clientY;
    if (tool === 'select') {
      const hd = hitHandle(pt);
      if (hd) { op = { mode: 'resize', h: hd.k, snap0: JSON.stringify(annots) }; showLoupe(e, pt); return; }
      const a = hit(pt);
      if (a) { selId = a.id; op = { mode: 'move', start: pt, orig: JSON.parse(JSON.stringify(a)), snap0: JSON.stringify(annots) }; drawProps(); redraw(); return; }
      selId = null; drawProps(); redraw();
      if (view.s > 1) op = { mode: 'pan', sx, sy, v: { ...view } };
      return;
    }
    if (tool === 'route') {
      const p = snap(pt, { anchor: draft ? { x: draft.pts.at(-1)[0] * W(), y: draft.pts.at(-1)[1] * H() } : null });
      op = { mode: 'routePoint' };
      if (draft) draft.preview = [p.x / W(), p.y / H()];
      else draft = { id: uid(), type: 'route', color, size, pts: [], text: '', lengths: '', dashed: false, preview: [p.x / W(), p.y / H()] };
      redraw(); showLoupe(e, p); drawProps();
      return;
    }
    if (tool === 'number' || tool === 'text') {
      const p = N(pt);
      const n = tool === 'number' ? Math.max(0, ...annots.filter((x) => x.type === 'number').map((x) => x.n)) + 1 : undefined;
      const obj = { id: uid(), type: tool, color, size, x1: p.x, y1: p.y, text: '', n };
      snapshot(); annots.push(obj); selId = obj.id;
      op = { mode: 'place', created: obj };
      redraw(); showLoupe(e, pt); drawProps();
      return;
    }
    // líneas y formas: se dibujan arrastrando
    const p0 = LINEISH.includes(tool) ? snap(pt) : pt;
    const obj = { id: uid(), type: tool, color, size, x1: p0.x / W(), y1: p0.y / H(), x2: p0.x / W(), y2: p0.y / H(), text: '' };
    snapshot(); annots.push(obj); selId = obj.id;
    op = { mode: 'create', created: obj, anchor: p0, sx, sy };
    redraw(); showLoupe(e, p0);
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      view = { ...pinch.view };
      zoomAt(pinch.mx, pinch.my, pinch.view.s * (d / pinch.d));
      view.tx += mx - pinch.mx; view.ty += my - pinch.my; applyView();
      return;
    }
    if (!op) return;
    if (op.mode === 'pan') { view.tx = op.v.tx + (e.clientX - op.sx); view.ty = op.v.ty + (e.clientY - op.sy); applyView(); return; }
    const pt = toPt(e);
    if (op.mode === 'routePoint') {
      const last = draft.pts.at(-1);
      const p = snap(pt, { anchor: last ? { x: last[0] * W(), y: last[1] * H() } : null });
      draft.preview = [p.x / W(), p.y / H()]; redraw(); showLoupe(e, p); return;
    }
    if (op.mode === 'place') { const p = N(pt); op.created.x1 = p.x; op.created.y1 = p.y; redraw(); showLoupe(e, pt); return; }
    if (op.mode === 'create') {
      const o = op.created;
      const p = LINEISH.includes(o.type) ? snap(pt, { anchor: op.anchor, exclude: o.id }) : pt;
      o.x2 = p.x / W(); o.y2 = p.y / H(); redraw(); showLoupe(e, p); return;
    }
    const a = sel(); if (!a) return;
    if (op.mode === 'move') {
      if (!op.moved) { op.moved = true; undo.push(op.snap0); redo.length = 0; dirty = true; }
      const dx = (pt.x - op.start.x) / W(), dy = (pt.y - op.start.y) / H(), o = op.orig;
      if (a.type === 'route') a.pts = o.pts.map(([x, y]) => [x + dx, y + dy]);
      else { a.x1 = o.x1 + dx; a.y1 = o.y1 + dy; if (o.x2 != null) { a.x2 = o.x2 + dx; a.y2 = o.y2 + dy; } }
      redraw(); return;
    }
    if (op.mode === 'resize') {
      if (!op.moved) { op.moved = true; undo.push(op.snap0); redo.length = 0; dirty = true; }
      if (op.h === 1 || op.h === 2) {
        const other = op.h === 1 ? { x: a.x2 * W(), y: a.y2 * H() } : { x: a.x1 * W(), y: a.y1 * H() };
        const p = snap(pt, { anchor: other, exclude: a.id, vertex: op.h - 1 });
        if (op.h === 1) { a.x1 = p.x / W(); a.y1 = p.y / H(); } else { a.x2 = p.x / W(); a.y2 = p.y / H(); }
        showLoupe(e, p);
      } else if (String(op.h).startsWith('v')) {
        const i = Number(op.h.slice(1));
        const prev = a.pts[i - 1] || a.pts[i + 1];
        const p = snap(pt, { anchor: prev ? { x: prev[0] * W(), y: prev[1] * H() } : null, exclude: a.id, vertex: i });
        a.pts[i] = [p.x / W(), p.y / H()]; showLoupe(e, p);
      } else {
        const n = N(pt);
        const nb = { L: Math.min(a.x1, a.x2), R: Math.max(a.x1, a.x2), T: Math.min(a.y1, a.y2), B: Math.max(a.y1, a.y2) };
        if (op.h.includes('l')) nb.L = n.x; else nb.R = n.x;
        if (op.h.includes('t')) nb.T = n.y; else nb.B = n.y;
        a.x1 = nb.L; a.x2 = nb.R; a.y1 = nb.T; a.y2 = nb.B;
        if (a.x1 > a.x2) { [a.x1, a.x2] = [a.x2, a.x1]; op.h = op.h.replace(/[lr]/, (c) => (c === 'l' ? 'r' : 'l')); }
        if (a.y1 > a.y2) { [a.y1, a.y2] = [a.y2, a.y1]; op.h = op.h.replace(/[tb]/, (c) => (c === 't' ? 'b' : 't')); }
        showLoupe(e, pt);
      }
      redraw();
    }
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (!op) return;
    const o = op; op = null;
    hideLoupe();
    if (o.mode === 'routePoint') {
      if (!draft.pts.length) snapshot();
      const [x, y] = draft.preview; draft.preview = null;
      const last = draft.pts.at(-1);
      if (!last || Math.hypot((x - last[0]) * W(), (y - last[1]) * H()) > 6 * pxScale()) draft.pts.push([x, y]);
      dirty = true;
    } else if (o.mode === 'create') {
      const a = o.created;
      const tiny = Math.hypot(e.clientX - o.sx, e.clientY - o.sy) < 8;
      if (tiny) { // toque sin arrastrar: tamaño por defecto
        const r = canvas.width / canvas.height, d = 0.07;
        if (a.type === 'circle' || a.type === 'rect') Object.assign(a, { x1: a.x1 - d, y1: a.y1 - d * r, x2: a.x1 + d, y2: a.y1 + d * r });
        else Object.assign(a, { x2: Math.min(0.97, a.x1 + 0.16), y2: Math.max(0.03, a.y1 - 0.1 * r) });
      }
    }
    snapMark = null;
    drawProps(o.mode === 'create' && o.created.type === 'callout' || o.mode === 'place');
    redraw();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); pinch = null; cancelOp(); });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });

  function finishRoute() {
    if (!draft) return;
    if (draft.pts.length >= 2) { delete draft.preview; annots.push(draft); selId = draft.id; }
    draft = null; drawProps(true); redraw();
  }

  // ---------- barras ----------
  function setTool(k) {
    if (draft) finishRoute();
    tool = k; store.set('tool', k);
    if (k !== 'select') selId = null;
    drawTools(); drawProps(); redraw();
  }
  function doUndo() {
    if (draft && draft.pts.length) { draft.pts.pop(); if (!draft.pts.length) draft = null; drawProps(); redraw(); return; }
    if (!undo.length) return;
    redo.push(JSON.stringify(annots)); annots = JSON.parse(undo.pop());
    if (!sel()) selId = null; drawProps(); redraw();
  }
  function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(annots)); annots = JSON.parse(redo.pop()); drawProps(); redraw(); }
  function drawTools() {
    tools.innerHTML = '';
    TOOLS.forEach(([k, icon, label]) => tools.appendChild(h('button', { class: `tool ${tool === k ? 'on' : ''}`, 'data-tool': k, onclick: () => setTool(k) }, h('b', {}, icon), label)));
    hint.textContent = HINT[tool];
  }
  function drawProps(focusText) {
    props.innerHTML = '';
    const a = draft || sel();
    const curColor = a ? a.color : color;
    const curSize = a ? a.size || 2 : size;
    if (draft) {
      props.appendChild(h('div', { class: 'txt' },
        h('span', { class: 'hint-inline' }, draft.pts.length < 2 ? `Puntos: ${draft.pts.length}. Toca el siguiente punto.` : `Puntos: ${draft.pts.length}.`),
        h('button', { onclick: () => { if (draft.pts.length) draft.pts.pop(); if (!draft.pts.length) draft = null; drawProps(); redraw(); } }, '↶ Punto'),
        h('button', { class: 'primary', disabled: draft.pts.length < 2, onclick: finishRoute }, '✓ Terminar')));
    } else if (a) {
      const del = h('button', { class: 'danger', onclick: () => { snapshot(); annots = annots.filter((x) => x.id !== a.id); selId = null; drawProps(); redraw(); } }, '🗑');
      if (TEXT_TYPES.includes(a.type)) {
        const inp = h('input', { value: a.text || '', placeholder: PLACEHOLDER[a.type] || 'Texto', class: focusText && touchUI ? 'pulse' : '',
          onfocus: () => { inp.classList.remove('pulse'); },
          oninput: (e) => { if (!inp.dataset.snap) { snapshot(); inp.dataset.snap = '1'; } a.text = e.target.value; redraw(); },
          onkeydown: (e) => { if (e.key === 'Enter') inp.blur(); } });
        props.appendChild(h('div', { class: 'txt' }, inp, del));
        if (focusText && !touchUI) setTimeout(() => inp.focus(), 60);
      } else props.appendChild(del);
      if (a.type === 'route') {
        const lens = h('input', { value: a.lengths || '', placeholder: 'Medidas por tramo: 20, 15, 5, 3', inputmode: 'decimal',
          oninput: (e) => { if (!lens.dataset.snap) { snapshot(); lens.dataset.snap = '1'; } a.lengths = e.target.value; redraw(); } });
        props.appendChild(h('div', { class: 'txt' }, lens,
          h('button', { class: a.dashed ? 'on' : '', onclick: () => { snapshot(); a.dashed = !a.dashed; drawProps(); redraw(); } }, '┄ Discontinua')));
      }
    }
    COLORS.forEach((c) => props.appendChild(h('button', {
      class: `sw ${c === curColor ? 'on' : ''}`, style: { background: c }, 'aria-label': 'Color',
      onclick: () => { if (a) { if (a !== draft) snapshot(); a.color = c; } color = c; store.set('color', c); drawProps(); redraw(); },
    })));
    ['S', 'M', 'L'].forEach((l, i) => props.appendChild(h('button', {
      class: `sz ${curSize === i + 1 ? 'on' : ''}`, onclick: () => { if (a) { if (a !== draft) snapshot(); a.size = i + 1; } size = i + 1; store.set('size', size); drawProps(); redraw(); },
    }, l)));
  }

  function onKey(e) {
    if (e.target.tagName === 'INPUT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel()) { snapshot(); annots = annots.filter((x) => x.id !== selId); selId = null; drawProps(); redraw(); }
    else if (e.key === 'Enter' && draft) finishRoute();
    else if (e.key === 'Escape') { if (draft) finishRoute(); else { selId = null; drawProps(); redraw(); } }
  }

  function close(save) {
    if (draft) finishRoute();
    if (!save && dirty && !confirm('¿Descartar los cambios en la foto?')) return;
    document.body.style.overflow = '';
    window.removeEventListener('resize', fit);
    window.removeEventListener('keydown', onKey);
    root.remove();
    if (save) onSave(annots, capInput.value);
  }

  drawTools(); drawProps(); drawZoom();
  window.addEventListener('resize', fit);
  window.addEventListener('keydown', onKey);
  loadImage(photo.dataUrl).then((im) => {
    img = im;
    const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
    canvas.width = Math.round(im.naturalWidth * k); canvas.height = Math.round(im.naturalHeight * k);
    fit(); redraw();
  });
  return { close, get annots() { return annots; } };
}
