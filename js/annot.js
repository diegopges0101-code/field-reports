// =====================================================================
//  Editor de fotos por objetos: línea con punto y descripción, flecha,
//  línea, círculo, cuadrado, número y texto. Todo se puede seleccionar,
//  mover, redimensionar, cambiar de color/tamaño, editar el texto y borrar.
//  Las marcas se guardan aparte (coordenadas 0–1), la foto original no se toca.
// =====================================================================
import { h, uid } from './ui.js';

export const COLORS = ['#e53935', '#fdd835', '#ffffff', '#1e88e5', '#43a047', '#111111'];
const STROKE = [0.45, 0.7, 1.05];
const FONT = [2.5, 3.3, 4.3];
const NUM_R = [2.3, 3.0, 3.8];
const TEXT_TYPES = ['callout', 'text', 'number', 'circle', 'rect'];

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
  ['select', '✋', 'Mover'], ['callout', '⟋•', 'Línea+texto'], ['arrow', '➜', 'Flecha'], ['line', '╱', 'Línea'],
  ['circle', '◯', 'Círculo'], ['rect', '▢', 'Cuadrado'], ['number', '①', 'Número'], ['text', 'T', 'Texto'],
];
const PLACEHOLDER = { callout: 'Descripción de la línea', text: 'Texto', number: 'Qué señala este número', circle: 'Etiqueta (opcional)', rect: 'Etiqueta (opcional)' };

export function openPhotoEditor(photo, { caption = '', onSave }) {
  let annots = JSON.parse(JSON.stringify(photo.annots || []));
  let tool = 'select';
  let selId = null;
  let color = COLORS[0];
  let size = 2;
  const undo = [];
  let boxes = new Map();
  let img;
  let dirty = false;

  const canvas = h('canvas', {});
  const ctx = canvas.getContext('2d');
  const stage = h('div', { class: 'pe-stage' }, canvas);
  const props = h('div', { class: 'pe-props' });
  const tools = h('div', { class: 'pe-tools' });
  const capInput = h('input', { value: caption, placeholder: 'Pie de foto (opcional)', style: { flex: 1 } });
  const root = h('div', { class: 'pe' },
    h('div', { class: 'pe-top' },
      h('button', { onclick: () => close(false) }, 'Cancelar'),
      h('strong', { style: { flex: 1, textAlign: 'center' } }, 'Editar foto'),
      h('button', { class: 'primary', onclick: () => close(true) }, 'Guardar')),
    stage, props, tools,
    h('div', { class: 'pe-props pe-cap' }, capInput));
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  // Botones fiables con el dedo: se activan al levantar el dedo (tras arrastrar sobre la foto,
  // algunos móviles no envían el "click" del siguiente toque). El click nativo duplicado se ignora.
  let down = null;
  root.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); down = b && !stage.contains(b) ? { b, x: e.clientX, y: e.clientY } : null; }, true);
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
  const snapshot = () => { undo.push(JSON.stringify(annots)); if (undo.length > 60) undo.shift(); dirty = true; };

  // ---------- tamaño del lienzo ----------
  let view = { s: 1, tx: 0, ty: 0 };
  function fit() {
    if (!img) return;
    const r = stage.getBoundingClientRect();
    const k = Math.min(r.width / canvas.width, r.height / canvas.height);
    canvas.style.width = `${canvas.width * k}px`;
    canvas.style.height = `${canvas.height * k}px`;
    applyView();
  }
  function applyView() {
    canvas.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
    zoomBtn.hidden = view.s === 1;
  }
  const pxScale = () => canvas.width / canvas.getBoundingClientRect().width; // px de imagen por px de pantalla

  // ---------- dibujo ----------
  function redraw() {
    if (!img) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    boxes = drawAnnots(ctx, canvas.width, canvas.height, annots);
    const a = sel();
    if (a) {
      const k = pxScale();
      ctx.save();
      ctx.setLineDash([6 * k, 5 * k]); ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2 * k;
      const bb = bbox(a);
      ctx.strokeRect(bb.x - 6 * k, bb.y - 6 * k, bb.w + 12 * k, bb.h + 12 * k);
      ctx.restore();
      handles(a).forEach((p) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    }
  }
  function bbox(a) {
    const W = canvas.width, H = canvas.height;
    const xs = [a.x1 * W, (a.x2 ?? a.x1) * W], ys = [a.y1 * H, (a.y2 ?? a.y1) * H];
    const b = boxes.get(a.id);
    if (b) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); }
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  function handles(a) {
    const W = canvas.width, H = canvas.height;
    if (['callout', 'arrow', 'line'].includes(a.type)) return [{ k: 1, x: a.x1 * W, y: a.y1 * H }, { k: 2, x: a.x2 * W, y: a.y2 * H }];
    if (['circle', 'rect'].includes(a.type)) return [
      { k: 'tl', x: Math.min(a.x1, a.x2) * W, y: Math.min(a.y1, a.y2) * H }, { k: 'tr', x: Math.max(a.x1, a.x2) * W, y: Math.min(a.y1, a.y2) * H },
      { k: 'bl', x: Math.min(a.x1, a.x2) * W, y: Math.max(a.y1, a.y2) * H }, { k: 'br', x: Math.max(a.x1, a.x2) * W, y: Math.max(a.y1, a.y2) * H }];
    return [];
  }

  // ---------- tocar objetos ----------
  const distSeg = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };
  function hit(pt) {
    const W = canvas.width, H = canvas.height, tol = 16 * pxScale();
    for (let i = annots.length - 1; i >= 0; i--) {
      const a = annots[i];
      const b = boxes.get(a.id);
      if (b && pt.x >= b.x - 4 && pt.x <= b.x + b.w + 4 && pt.y >= b.y - 4 && pt.y <= b.y + b.h + 4) return a;
      const X1 = a.x1 * W, Y1 = a.y1 * H, X2 = (a.x2 ?? a.x1) * W, Y2 = (a.y2 ?? a.y1) * H;
      if (['callout', 'arrow', 'line'].includes(a.type) && distSeg(pt.x, pt.y, X1, Y1, X2, Y2) <= tol) return a;
      if (a.type === 'rect' && pt.x >= Math.min(X1, X2) - tol && pt.x <= Math.max(X1, X2) + tol && pt.y >= Math.min(Y1, Y2) - tol && pt.y <= Math.max(Y1, Y2) + tol) return a;
      if (a.type === 'circle') {
        const cx = (X1 + X2) / 2, cy = (Y1 + Y2) / 2, rx = Math.abs(X2 - X1) / 2 + tol, ry = Math.abs(Y2 - Y1) / 2 + tol;
        if (((pt.x - cx) / rx) ** 2 + ((pt.y - cy) / ry) ** 2 <= 1) return a;
      }
    }
    return null;
  }
  function hitHandle(pt) {
    const a = sel(); if (!a) return null;
    const tol = 22 * pxScale();
    return handles(a).find((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= tol) || null;
  }

  // ---------- gestos ----------
  const pointers = new Map();
  let op = null; // {mode:'move'|'resize'|'create', ...}
  let pinch = null;
  const toPt = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  };
  const norm = (pt) => ({ x: Math.max(0, Math.min(1, pt.x / canvas.width)), y: Math.max(0, Math.min(1, pt.y / canvas.height)) });

  stage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { // dos dedos: zoom, se cancela lo que se estaba haciendo
      if (op && op.started) { annots = JSON.parse(undo.pop()); }
      op = null;
      const [p1, p2] = [...pointers.values()];
      pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2, view: { ...view } };
      redraw(); return;
    }
    if (pointers.size > 2 || e.target !== canvas) return;
    const pt = toPt(e);
    const hd = hitHandle(pt);
    if (hd) { op = { mode: 'resize', h: hd.k, start: pt }; return; }
    const a = hit(pt);
    if (a) { selId = a.id; op = { mode: 'move', start: pt, orig: { ...a } }; drawProps(); redraw(); return; }
    if (tool === 'select') { selId = null; drawProps(); redraw(); return; }
    const n = norm(pt);
    if (tool === 'number' || tool === 'text') {
      snapshot();
      const nn = tool === 'number' ? Math.max(0, ...annots.filter((x) => x.type === 'number').map((x) => x.n)) + 1 : undefined;
      const obj = { id: uid(), type: tool, color, size, x1: n.x, y1: n.y, text: '', n: nn };
      annots.push(obj); selId = obj.id; drawProps(true); redraw(); return;
    }
    op = { mode: 'create', start: pt, n0: n };
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      view.s = Math.max(1, Math.min(6, pinch.view.s * (d / pinch.d)));
      view.tx = pinch.view.tx + (mx - pinch.mx); view.ty = pinch.view.ty + (my - pinch.my);
      applyView(); return;
    }
    if (!op) return;
    const pt = toPt(e);
    const W = canvas.width, H = canvas.height;
    const dx = (pt.x - op.start.x) / W, dy = (pt.y - op.start.y) / H;
    if (!op.started && Math.hypot(pt.x - op.start.x, pt.y - op.start.y) < 4 * pxScale()) return;
    if (!op.started) { op.started = true; snapshot(); }
    if (op.mode === 'move') {
      const a = sel(); const o = op.orig;
      a.x1 = o.x1 + dx; a.y1 = o.y1 + dy;
      if (o.x2 != null) { a.x2 = o.x2 + dx; a.y2 = o.y2 + dy; }
    } else if (op.mode === 'resize') {
      const a = sel(); const n = norm(pt);
      if (op.h === 1) { a.x1 = n.x; a.y1 = n.y; } else if (op.h === 2) { a.x2 = n.x; a.y2 = n.y; } else {
        // esquina: se mueve la que corresponde, la opuesta queda fija
        const L = Math.min(a.x1, a.x2), R = Math.max(a.x1, a.x2), T = Math.min(a.y1, a.y2), B = Math.max(a.y1, a.y2);
        const nb = { L, R, T, B };
        if (op.h.includes('l')) nb.L = n.x; else nb.R = n.x;
        if (op.h.includes('t')) nb.T = n.y; else nb.B = n.y;
        a.x1 = nb.L; a.x2 = nb.R; a.y1 = nb.T; a.y2 = nb.B;
        if (a.x1 > a.x2) { [a.x1, a.x2] = [a.x2, a.x1]; op.h = op.h.replace(/[lr]/, (c) => (c === 'l' ? 'r' : 'l')); }
        if (a.y1 > a.y2) { [a.y1, a.y2] = [a.y2, a.y1]; op.h = op.h.replace(/[tb]/, (c) => (c === 't' ? 'b' : 't')); }
      }
    } else if (op.mode === 'create') {
      const n = norm(pt);
      if (!op.obj) { op.obj = { id: uid(), type: tool, color, size, x1: op.n0.x, y1: op.n0.y, x2: n.x, y2: n.y, text: '' }; annots.push(op.obj); selId = op.obj.id; }
      op.obj.x2 = n.x; op.obj.y2 = n.y;
    }
    redraw();
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (!op) return;
    if (op.mode === 'create') {
      if (!op.obj) { // toque sin arrastrar: forma con tamaño por defecto
        snapshot();
        const r = canvas.width / canvas.height;
        const d = 0.07;
        const obj = { id: uid(), type: tool, color, size, text: '' };
        if (tool === 'circle' || tool === 'rect') Object.assign(obj, { x1: op.n0.x - d, y1: op.n0.y - d * r, x2: op.n0.x + d, y2: op.n0.y + d * r });
        else Object.assign(obj, { x1: op.n0.x, y1: op.n0.y, x2: Math.min(0.97, op.n0.x + 0.15), y2: Math.max(0.03, op.n0.y - 0.12 * r) });
        annots.push(obj); op.obj = obj;
      }
      selId = op.obj.id;
      drawProps(op.obj.type === 'callout');
    } else drawProps();
    op = null;
    redraw();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  // ---------- barras ----------
  const zoomBtn = h('button', { hidden: true, onclick: () => { view = { s: 1, tx: 0, ty: 0 }; applyView(); } }, '⤢ Ajustar');
  function drawTools() {
    tools.innerHTML = '';
    TOOLS.forEach(([k, icon, label]) => tools.appendChild(h('button', { class: `tool ${tool === k ? 'on' : ''}`, onclick: () => { tool = k; drawTools(); drawProps(); } }, h('b', {}, icon), label)));
    tools.appendChild(h('button', { class: 'tool', onclick: () => { if (!undo.length) return; annots = JSON.parse(undo.pop()); if (!sel()) selId = null; drawProps(); redraw(); } }, h('b', {}, '↶'), 'Deshacer'));
    tools.appendChild(zoomBtn);
  }
  function drawProps(focusText) {
    props.innerHTML = '';
    const a = sel();
    const curColor = a ? a.color : color;
    const curSize = a ? a.size || 2 : size;
    COLORS.forEach((c) => props.appendChild(h('button', {
      class: `sw ${c === curColor ? 'on' : ''}`, style: { background: c }, 'aria-label': 'Color',
      onclick: () => { if (a) { snapshot(); a.color = c; } else color = c; color = c; drawProps(); redraw(); },
    })));
    ['S', 'M', 'L'].forEach((l, i) => props.appendChild(h('button', {
      class: curSize === i + 1 ? 'on' : '', onclick: () => { if (a) { snapshot(); a.size = i + 1; } size = i + 1; drawProps(); redraw(); },
    }, l)));
    if (a) {
      const del = h('button', { class: 'danger', onclick: () => { snapshot(); annots = annots.filter((x) => x.id !== a.id); selId = null; drawProps(); redraw(); } }, '🗑 Borrar');
      if (TEXT_TYPES.includes(a.type)) {
        const inp = h('input', { value: a.text || '', placeholder: PLACEHOLDER[a.type] || 'Texto',
          oninput: (e) => { if (!inp.dataset.snap) { snapshot(); inp.dataset.snap = '1'; } a.text = e.target.value; redraw(); } });
        props.prepend(h('div', { class: 'txt' }, inp, del));
        if (focusText) setTimeout(() => inp.focus(), 60);
      } else props.appendChild(del);
    } else {
      props.appendChild(h('span', { class: 'hint' }, tool === 'select'
        ? 'Toca una marca para editarla · arrástrala para moverla · dos dedos = zoom'
        : 'Toca o arrastra sobre la foto para añadir'));
    }
  }

  function close(save) {
    if (!save && dirty && !confirm('¿Descartar los cambios en la foto?')) return;
    document.body.style.overflow = '';
    window.removeEventListener('resize', fit);
    root.remove();
    if (save) onSave(annots, capInput.value);
  }

  drawTools(); drawProps();
  window.addEventListener('resize', fit);
  loadImage(photo.dataUrl).then((im) => {
    img = im;
    const k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight));
    canvas.width = Math.round(im.naturalWidth * k); canvas.height = Math.round(im.naturalHeight * k);
    fit(); redraw();
  });
  return { close };
}
