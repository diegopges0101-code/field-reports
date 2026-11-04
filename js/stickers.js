// =====================================================================
//  Pegatinas de equipos para las fotos — dibujo vectorial con sombreado
//  realista (escalan sin perder calidad, sin descargas, sin logotipos).
//  Cada pegatina se dibuja centrada en (0,0) en una caja w × h (h = w·ar).
//  "ports": puntos de conexión (fracciones de la caja) donde se enganchan
//  las líneas y recorridos de cable; al mover la pegatina, el cable la sigue.
// =====================================================================

const EDGE = 'rgba(20,22,26,.55)';

function kit(c, w, h) {
  const X = (f) => -w / 2 + f * w, Y = (f) => -h / 2 + f * h;
  const lw = Math.max(0.6, w * 0.006);
  const g = {
    X, Y, lw,
    path(pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.closePath(); },
    grad([x0, y0], [x1, y1], stops) { const gr = c.createLinearGradient(X(x0), Y(y0), X(x1), Y(y1)); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; },
    rad(cx, cy, r, stops) { const gr = c.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), r * w); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; },
    fill(style, edge = EDGE, width = lw) { c.fillStyle = style; c.fill(); c.shadowColor = 'transparent'; if (edge) { c.strokeStyle = edge; c.lineWidth = width; c.stroke(); } },
    poly(pts, style, edge, width) { g.path(pts); g.fill(style, edge, width); },
    line(pts, col, width) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.strokeStyle = col; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); },
    ell(cx, cy, rx, ry, rot, style, edge, width) { c.beginPath(); c.ellipse(X(cx), Y(cy), rx * w, ry * h, rot || 0, 0, Math.PI * 2); g.fill(style, edge, width); },
    dot(x, y, r, col) { c.beginPath(); c.arc(X(x), Y(y), r * w, 0, Math.PI * 2); c.fillStyle = col; c.fill(); },
    rr(x0, y0, x1, y1, r, style, edge, width) { c.beginPath(); if (c.roundRect) c.roundRect(X(x0), Y(y0), (x1 - x0) * w, (y1 - y0) * h, r * w); else c.rect(X(x0), Y(y0), (x1 - x0) * w, (y1 - y0) * h); g.fill(style, edge, width); },
  };
  return g;
}
const off = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

// Plato rectangular en perspectiva (cara blanca + canto gris), como la antena real
function dish(g, L, T, R, F, edge = 0.035) {
  // canto (grosor) por debajo de los bordes delanteros
  g.poly([L, F, R, [R[0], R[1] + edge * 0.8], [F[0], F[1] + edge], [L[0], L[1] + edge * 0.8]],
    g.grad(L, [F[0], F[1] + edge], [[0, '#6f767d'], [0.5, '#4b5056'], [1, '#2d3136']]));
  // cara
  g.poly([L, T, R, F], g.grad(T, F, [[0, '#ffffff'], [0.55, '#f1f3f5'], [1, '#d9dde1']]), 'rgba(80,86,92,.55)');
  // brillo suave y filo claro en el borde trasero
  g.path([L, T, R, F]); const c = g._c; c.save(); c.clip();
  c.fillStyle = g.grad(L, R, [[0, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,.55)'], [0.55, 'rgba(255,255,255,0)']]); c.fill(); c.restore();
  g.line([L, T, R], 'rgba(255,255,255,.9)', g.lw * 1.2);
}
// Tubo cilíndrico vertical (mástil, poste)
function pipe(g, x, y0, y1, d, light = '#c3c9cf', dark = '#4e555c') {
  g.rr(x - d / 2, y0, x + d / 2, y1, d * 0.15, g.grad([x - d / 2, 0], [x + d / 2, 0], [[0, dark], [0.35, light], [0.6, '#eef1f4'], [1, dark]]));
}
// Caja 3D (cara frontal, superior y lateral)
function box3d(g, x0, y0, x1, y1, dx, dy, front, top, side) {
  g.poly([[x1, y0], [x1 + dx, y0 - dy], [x1 + dx, y1 - dy], [x1, y1]], side);
  g.poly([[x0, y0], [x0 + dx, y0 - dy], [x1 + dx, y0 - dy], [x1, y0]], top);
  g.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], front);
}
// Bloque de hormigón (lastre)
function block(g, x, y, s) {
  const k = 0.55;
  box3d(g, x, y, x + s, y + s * 0.45, s * 0.45, s * 0.28,
    g.grad([x, y], [x, y + s * 0.45], [[0, '#a9a49b'], [1, '#86817a']]),
    g.grad([x, y - s * 0.28], [x + s, y], [[0, '#cfcac1'], [1, '#bdb8af']]), '#77736c');
  void k;
}

export const STICKERS = {
  sl_standard: {
    name: 'Starlink Standard (pie)', ar: 0.46, ports: [[0.79, 0.93]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      // pie en "A" (detrás del plato)
      const steel = g.grad([0.55, 0.5], [0.8, 0.95], [[0, '#e3e8ee'], [1, '#8d97a2']]);
      g.poly([[0.56, 0.52], [0.6, 0.5], [0.64, 0.8], [0.6, 0.82]], steel);
      g.poly([[0.66, 0.48], [0.7, 0.47], [0.82, 0.9], [0.78, 0.92]], steel);
      g.poly([[0.6, 0.8], [0.8, 0.88], [0.8, 0.94], [0.6, 0.86]], g.grad([0.6, 0.8], [0.6, 0.94], [[0, '#d5dbe2'], [1, '#7b858f']]));
      dish(g, [0.005, 0.71], [0.66, 0.0], [1.0, 0.05], [0.29, 0.87], 0.05);
    },
  },
  sl_wall: {
    name: 'Starlink Standard en pared', ar: 0.95, ports: [[0.84, 0.98]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      // placa de pared
      box3d(g, 0.74, 0.66, 0.9, 0.98, 0.04, 0.03, g.grad([0.74, 0], [0.9, 0], [[0, '#7b828a'], [1, '#5b6168']]), '#9aa1a8', '#4a5056');
      // brazo en L
      g.poly([[0.44, 0.66], [0.52, 0.66], [0.8, 0.8], [0.8, 0.88], [0.5, 0.74], [0.44, 0.74]], g.grad([0.44, 0.66], [0.44, 0.88], [[0, '#a3aab1'], [1, '#5c636a']]));
      // manguito gris + mástil oscuro
      pipe(g, 0.48, 0.5, 0.74, 0.085, '#b9c0c7', '#5d646b');
      pipe(g, 0.48, 0.3, 0.52, 0.06, '#5a5f66', '#1e2226');
      g.poly([[0.38, 0.29], [0.6, 0.27], [0.56, 0.34], [0.42, 0.35]], g.grad([0.4, 0.27], [0.4, 0.35], [[0, '#3c4147'], [1, '#1a1d20']]));
      dish(g, [0.0, 0.25], [0.6, 0.0], [1.0, 0.03], [0.4, 0.3], 0.03);
    },
  },
  sl_ballast: {
    name: 'Starlink en base sin perforar (lastre)', ar: 0.9, ports: [[0.6, 0.86]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      // bastidor en rombo (perspectiva) con tubos
      const tube = g.grad([0, 0.7], [0, 0.95], [[0, '#c7cdd3'], [1, '#6c737a']]);
      g.poly([[0.06, 0.8], [0.5, 0.64], [0.94, 0.8], [0.5, 0.97]], 'rgba(60,64,70,.18)', null);
      [[[0.06, 0.8], [0.5, 0.64]], [[0.5, 0.64], [0.94, 0.8]], [[0.94, 0.8], [0.5, 0.97]], [[0.5, 0.97], [0.06, 0.8]], [[0.06, 0.8], [0.94, 0.8]], [[0.5, 0.64], [0.5, 0.97]]]
        .forEach(([a, b]) => { g.line([a, b], '#4d545b', w * 0.03); g.line([a, b], '#b7bec5', w * 0.016); });
      void tube;
      // bloques de hormigón en las 4 esquinas
      block(g, 0.4, 0.6, 0.16); block(g, 0.02, 0.75, 0.16); block(g, 0.78, 0.75, 0.16); block(g, 0.4, 0.89, 0.16);
      // mástil y cabeza
      pipe(g, 0.5, 0.32, 0.82, 0.07);
      g.rr(0.44, 0.78, 0.56, 0.84, 0.01, g.grad([0.44, 0], [0.56, 0], [[0, '#3c4147'], [0.5, '#6e757c'], [1, '#2a2e33']]));
      g.poly([[0.4, 0.3], [0.62, 0.28], [0.58, 0.35], [0.44, 0.36]], g.grad([0.4, 0.28], [0.4, 0.36], [[0, '#3c4147'], [1, '#1a1d20']]));
      dish(g, [0.02, 0.26], [0.6, 0.0], [0.98, 0.03], [0.4, 0.31], 0.03);
    },
  },
  sl_actuated: {
    name: 'Starlink Standard Actuated', ar: 0.95, ports: [[0.5, 0.99]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      pipe(g, 0.5, 0.3, 0.99, 0.07);
      g.rr(0.43, 0.82, 0.57, 0.9, 0.012, g.grad([0.43, 0], [0.57, 0], [[0, '#2a2e33'], [0.5, '#6e757c'], [1, '#2a2e33']]));
      g.ell(0.5, 0.25, 0.48, 0.2, -0.12, g.grad([0, 0.1], [0, 0.45], [[0, '#7a8188'], [1, '#33383d']]));
      g.ell(0.5, 0.22, 0.47, 0.19, -0.12, g.grad([0.2, 0.05], [0.7, 0.42], [[0, '#ffffff'], [0.6, '#eef0f2'], [1, '#d3d7db']]), 'rgba(80,86,92,.55)');
      g.ell(0.5, 0.22, 0.47, 0.19, -0.12, g.grad([0.05, 0.22], [0.95, 0.22], [[0, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,.5)'], [0.56, 'rgba(255,255,255,0)']]), null);
    },
  },
  sl_mini: {
    name: 'Starlink Mini', ar: 0.62, ports: [[0.72, 0.95]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      g.poly([[0.5, 0.55], [0.56, 0.52], [0.76, 0.92], [0.7, 0.95]], g.grad([0.5, 0.5], [0.75, 0.95], [[0, '#d8dde3'], [1, '#7f8892']]));
      dish(g, [0.02, 0.62], [0.55, 0.02], [0.98, 0.1], [0.42, 0.82], 0.06);
    },
  },
  sl_hp: {
    name: 'Starlink High Performance', ar: 0.85, ports: [[0.5, 0.99]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      pipe(g, 0.5, 0.42, 0.99, 0.08);
      g.poly([[0.32, 0.42], [0.66, 0.38], [0.62, 0.52], [0.36, 0.54]], g.grad([0.3, 0.38], [0.3, 0.54], [[0, '#454a50'], [1, '#1b1e21']]));
      dish(g, [0.0, 0.4], [0.5, 0.0], [1.0, 0.07], [0.48, 0.5], 0.06);
    },
  },
  sl_flat: {
    name: 'Starlink Flat High Performance', ar: 0.5, ports: [[0.99, 0.6]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      [[0.1, 0.62], [0.36, 0.9], [0.66, 0.16], [0.9, 0.46]].forEach(([x, y]) => g.rr(x - 0.04, y, x + 0.04, y + 0.1, 0.006, g.grad([0, y], [0, y + 0.1], [[0, '#4a5056'], [1, '#1d2023']])));
      dish(g, [0.0, 0.6], [0.6, 0.02], [1.0, 0.4], [0.4, 0.86], 0.09);
    },
  },
  sl_router: {
    name: 'Router Starlink', ar: 1.5, ports: [[0.5, 0.99]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      g.ell(0.48, 0.94, 0.34, 0.035, 0, g.grad([0, 0.9], [0, 0.98], [[0, '#d7dbdf'], [1, '#9aa1a8']]));
      box3d(g, 0.16, 0.14, 0.7, 0.94, 0.16, 0.08,
        g.grad([0.16, 0], [0.7, 0], [[0, '#f7f8f9'], [0.6, '#eceef0'], [1, '#d6dade']]), g.grad([0.16, 0.06], [0.86, 0.14], [[0, '#ffffff'], [1, '#e9ecef']]), g.grad([0.7, 0], [0.86, 0], [[0, '#c5cacf'], [1, '#a9afb5']]));
      g.dot(0.43, 0.84, 0.022, '#e9f9ef'); g.dot(0.43, 0.84, 0.012, '#22c55e');
    },
  },
  pep_router: {
    name: 'Router Peplink', ar: 0.78, ports: [[0.04, 0.86], [0.96, 0.8]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      // antenas (cilindros negros mate)
      [[0.2, -9], [0.4, -3], [0.62, 3], [0.82, 9]].forEach(([x, deg]) => {
        c.save(); c.translate(g.X(x), g.Y(0.46)); c.rotate((deg * Math.PI) / 180);
        const aw = w * 0.055, ah = h * 0.46;
        const gr = c.createLinearGradient(-aw / 2, 0, aw / 2, 0); gr.addColorStop(0, '#0d0f11'); gr.addColorStop(0.4, '#4a4f55'); gr.addColorStop(1, '#0d0f11');
        c.beginPath(); if (c.roundRect) c.roundRect(-aw / 2, -ah, aw, ah, aw / 2); else c.rect(-aw / 2, -ah, aw, ah);
        c.fillStyle = gr; c.fill(); c.shadowColor = 'transparent'; c.strokeStyle = EDGE; c.lineWidth = g.lw; c.stroke();
        c.fillStyle = '#2b2f34'; c.fillRect(-aw * 0.6, -h * 0.03, aw * 1.2, h * 0.04); c.restore();
      });
      // carcasa metálica 3D
      box3d(g, 0.02, 0.5, 0.88, 0.92, 0.1, 0.07,
        g.grad([0, 0.5], [0, 0.92], [[0, '#3b4046'], [1, '#16191c']]), g.grad([0.02, 0.43], [0.98, 0.5], [[0, '#5a6068'], [1, '#3d4248']]), g.grad([0.88, 0], [0.98, 0], [[0, '#25292d'], [1, '#121416']]));
      g.rr(0.05, 0.55, 0.85, 0.6, 0.004, 'rgba(255,255,255,.06)', null);
      [0.1, 0.16, 0.22].forEach((x) => { g.dot(x, 0.7, 0.016, '#0f2e1f'); g.dot(x, 0.7, 0.01, '#34d399'); });
      g.dot(0.28, 0.7, 0.01, '#fbbf24');
      [0.46, 0.55, 0.64, 0.73].forEach((x) => g.rr(x - 0.032, 0.66, x + 0.032, 0.78, 0.004, '#07080a', 'rgba(150,158,166,.6)', g.lw));
    },
  },
  ant_5g: {
    name: 'Antena 4G/5G exterior', ar: 0.8, ports: [[0.5, 0.99]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      g.ell(0.5, 0.86, 0.47, 0.1, 0, g.grad([0, 0.76], [0, 0.96], [[0, '#4a5056'], [1, '#121416']]));
      c.beginPath(); c.ellipse(g.X(0.5), g.Y(0.84), w * 0.42, h * 0.78, 0, Math.PI, 0); c.closePath();
      g.fill(g.rad(0.36, 0.32, 0.7, [[0, '#ffffff'], [0.5, '#eef0f2'], [1, '#b9c0c6']]));
      c.beginPath(); c.ellipse(g.X(0.5), g.Y(0.84), w * 0.42, h * 0.06, 0, 0, Math.PI); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = g.lw; c.stroke();
    },
  },
  mast: {
    name: 'Mástil de pared', ar: 2.4, ports: [[0.68, 0.0], [0.68, 1.0]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      [0.18, 0.72].forEach((y) => {
        box3d(g, 0.0, y - 0.05, 0.14, y + 0.07, 0.05, 0.015, '#6d747b', '#959ca3', '#4a5056');
        g.rr(0.12, y - 0.006, 0.58, y + 0.022, 0.004, g.grad([0, y], [0, y + 0.022], [[0, '#c7cdd3'], [1, '#6c737a']]));
      });
      pipe(g, 0.68, 0.0, 1.0, 0.2);
      [0.16, 0.7].forEach((y) => g.rr(0.55, y, 0.81, y + 0.05, 0.01, g.grad([0.55, 0], [0.81, 0], [[0, '#2a2e33'], [0.5, '#62696f'], [1, '#2a2e33']])));
    },
  },
  box: {
    name: 'Caja estanca', ar: 0.95, ports: [[0.3, 1.0], [0.5, 1.0], [0.7, 1.0]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      [0.3, 0.5, 0.7].forEach((x) => g.rr(x - 0.05, 0.86, x + 0.05, 1.0, 0.01, g.grad([x - 0.05, 0], [x + 0.05, 0], [[0, '#15181b'], [0.5, '#4a5056'], [1, '#15181b']])));
      box3d(g, 0.04, 0.1, 0.86, 0.88, 0.1, 0.08, g.grad([0, 0.1], [0, 0.88], [[0, '#e3e6e9'], [1, '#b4bac0']]), '#eef0f2', '#9aa1a8');
      g.rr(0.1, 0.16, 0.8, 0.82, 0.02, 'rgba(255,255,255,.12)', 'rgba(0,0,0,.18)');
      [[0.12, 0.2], [0.76, 0.2], [0.12, 0.76], [0.76, 0.76]].forEach(([x, y]) => g.dot(x, y, 0.014, '#8a9198'));
    },
  },
  rack: {
    name: 'Rack / armario', ar: 1.3, ports: [[0.45, 0.04]],
    draw(c, w, h) {
      const g = kit(c, w, h); g._c = c;
      box3d(g, 0.04, 0.06, 0.82, 0.98, 0.14, 0.06, g.grad([0.04, 0], [0.82, 0], [[0, '#2f3439'], [1, '#1a1d20']]), '#4b5157', '#121416');
      g.rr(0.1, 0.11, 0.76, 0.93, 0.01, 'rgba(120,180,220,.07)', 'rgba(180,190,200,.35)');
      [0.16, 0.28, 0.4].forEach((y) => { g.rr(0.14, y, 0.72, y + 0.09, 0.004, g.grad([0, y], [0, y + 0.09], [[0, '#3a3f45'], [1, '#202428']]), 'rgba(0,0,0,.5)'); g.dot(0.19, y + 0.045, 0.011, '#34d399'); });
      [0.6, 0.66, 0.72, 0.78, 0.84].forEach((y) => g.line([[0.24, y], [0.62, y]], 'rgba(0,0,0,.55)', g.lw * 2));
    },
  },
};
export const STICKER_ORDER = ['sl_standard', 'sl_wall', 'sl_ballast', 'sl_actuated', 'sl_mini', 'sl_hp', 'sl_flat', 'sl_router', 'pep_router', 'ant_5g', 'mast', 'box', 'rack'];

/** Dibuja la pegatina centrada en (0,0) con ancho w. */
export function drawSticker(c, kind, w, { shadow = true } = {}) {
  const st = STICKERS[kind] || STICKERS.sl_standard;
  const h = w * st.ar;
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (shadow) { c.shadowColor = 'rgba(0,0,0,.38)'; c.shadowBlur = w * 0.05; c.shadowOffsetY = w * 0.018; }
  st.draw(c, w, h);
  c.restore();
  return h;
}

/** Puntos de conexión en coordenadas locales (px, centro = 0,0, sin girar). */
export function stickerPorts(kind, w) {
  const st = STICKERS[kind] || STICKERS.sl_standard; const h = w * st.ar;
  return (st.ports || [[0.5, 1]]).map(([fx, fy]) => ({ x: -w / 2 + fx * w, y: -h / 2 + fy * h }));
}

/** Miniatura para la paleta del editor (canvas). */
export function stickerThumb(kind, px = 46) {
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.width = cv.height = Math.round(px * dpr);
  cv.style.width = cv.style.height = px + 'px';
  const c = cv.getContext('2d');
  const st = STICKERS[kind]; const S = px * dpr * 0.9;
  const w = st.ar > 1 ? S / st.ar : S;
  c.translate(cv.width / 2, cv.height / 2);
  drawSticker(c, kind, w, { shadow: false });
  return cv;
}
