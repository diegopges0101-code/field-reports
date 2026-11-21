// =====================================================================
//  Geometría pura del editor de fotos: vista (zoom/desplazamiento), ángulos
//  y maquetación de cotas. Solo matemática: sin DOM ni imports de otros
//  módulos. Ninguna función muta sus argumentos; las vistas son objetos
//  nuevos { s, tx, ty } con pantalla = imagen·s + t (px CSS).
// =====================================================================

/** Factor de velocidad del modo fino (el editor lo aplica al arrastrar). */
export const FINE_FACTOR = 0.25;

/** Vista que muestra toda la imagen, centrada en `rect` ({x, y, w, h}, zona libre de barras). */
export function fitView(iw, ih, rect) {
  const s = Math.min(rect.w / iw, rect.h / ih);
  return {
    s,
    tx: rect.x + (rect.w - iw * s) / 2,
    ty: rect.y + (rect.h - ih * s) / 2,
  };
}

/** Cambia la escala a `s2` dejando fijo el punto de pantalla (sx, sy). */
export function zoomAt(view, sx, sy, s2) {
  const k = s2 / view.s;
  return { s: s2, tx: sx - (sx - view.tx) * k, ty: sy - (sy - view.ty) * k };
}

// Limita un eje: centra si la imagen cabe; si no, deja al menos la mitad del escenario cubierta.
function clampAxis(t, size, stage) {
  if (size <= stage) return (stage - size) / 2;
  return Math.min(stage / 2, Math.max(stage / 2 - size, t));
}

/** Centra la imagen si cabe en el escenario; si no, impide sacarla más del 50 % por ningún lado. */
export function clampView(view, iw, ih, stageW, stageH) {
  return {
    s: view.s,
    tx: clampAxis(view.tx, iw * view.s, stageW),
    ty: clampAxis(view.ty, ih * view.s, stageH),
  };
}

/** Punto de pantalla → coordenadas de imagen. */
export function toImage(view, sx, sy) {
  return { x: (sx - view.tx) / view.s, y: (sy - view.ty) / view.s };
}

/** Coordenadas de imagen → punto de pantalla. */
export function toScreen(view, x, y) {
  return { x: x * view.s + view.tx, y: y * view.s + view.ty };
}

/** Escala máxima de zoom a partir de la escala de ajuste. */
export function maxScale(fitS) {
  return Math.max(fitS * 20, 8);
}

/** Ajusta `pt` al múltiplo de `stepDeg` más cercano respecto a `anchor`, conservando la distancia. */
export function constrainAngle(anchor, pt, stepDeg = 45) {
  const dx = pt.x - anchor.x;
  const dy = pt.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: anchor.x + Math.cos(a) * dist, y: anchor.y + Math.sin(a) * dist };
}

/** Ángulo de la recta p1-p2 en grados, de 0 a 180 (sin sentido), con un decimal. */
export function angleDeg(p1, p2) {
  let d = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
  d = ((d % 180) + 180) % 180;
  const r = Math.round(d * 10) / 10;
  return r >= 180 ? 0 : r;
}

/** Normaliza un ángulo en radianes a [−π/2, π/2) para que el texto no quede boca abajo. */
export function readableAngle(rad) {
  let a = rad;
  while (a >= Math.PI / 2 - 1e-9) a -= Math.PI;
  while (a < -Math.PI / 2) a += Math.PI;
  return a;
}

/**
 * Maqueta una cota entre p1 y p2 con desplazamiento `off` (px) y unidad `u` (px).
 * Devuelve { n, d1, d2, e1, e2, mid, ang, len }; e1/e2 son [desde, hasta] o null si |off| < 1.2u.
 */
export function dimLayout(p1, p2, off, u) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  const nb = len > 0 ? { x: -dy / len, y: dx / len } : { x: 0, y: -1 };
  const d1 = { x: p1.x + nb.x * off, y: p1.y + nb.y * off };
  const d2 = { x: p2.x + nb.x * off, y: p2.y + nb.y * off };
  const sg = off < 0 ? -1 : 1;
  const n = off === 0 ? nb : { x: nb.x * sg, y: nb.y * sg };
  const ext = (p, d) => [
    { x: p.x + n.x * 0.6 * u, y: p.y + n.y * 0.6 * u },
    { x: d.x + n.x * 0.8 * u, y: d.y + n.y * 0.8 * u },
  ];
  const withExt = Math.abs(off) >= 1.2 * u;
  return {
    n,
    d1,
    d2,
    e1: withExt ? ext(p1, d1) : null,
    e2: withExt ? ext(p2, d2) : null,
    mid: { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 },
    ang: readableAngle(len > 0 ? Math.atan2(dy, dx) : 0),
    len,
  };
}

/** Coma decimal → punto («2,40» → «2.40»), con 1-2 decimales o con 4 o más. Con exactamente 3 («1,200») solo si la
 *  interfaz está en español o portugués: en inglés es el separador de miles y se deja igual. Cualquier otro texto queda igual. */
export function normDecimal(s, lang = 'es') {
  const m = /^\s*(-?\d+),(\d+)\s*$/.exec(s);
  if (!m || (m[2].length === 3 && lang !== 'es' && lang !== 'pt')) return s;
  return `${m[1]}.${m[2]}`;
}

/** Une valor y unidad («2.40» + «m»); vacío si no hay valor; no repite la unidad si el valor ya acaba en letra o comillas. */
export function fmtDim(val, unit) {
  const v = val == null ? '' : String(val).trim();
  if (!v) return '';
  if (/[\p{L}"'″′]$/u.test(v)) return v;
  return [v, unit].filter(Boolean).join(' ');
}

/** Distancia del punto (px, py) al segmento (x1, y1)-(x2, y2). */
export function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
