// =====================================================================
//  Editor de fotos a pantalla completa (v2.9). La foto ocupa todo el
//  escenario y se ve a través de una vista { s, tx, ty } (zoom y
//  desplazamiento) en un canvas del tamaño de la pantalla × DPR: zoom
//  nítido y asas e indicadores siempre del mismo tamaño en pantalla.
//  Ajustada, la foto entera queda en la zona libre de las barras fijas
//  (superior, raíl y grupo lateral): ninguna barra la tapa.
//  Las marcas se dibujan con el motor de annot.js (el mismo del PDF) y se
//  guardan aparte, en coordenadas 0–1: la foto original no se toca.
//  Herramientas de v2.8 con precisión: asas pequeñas que se cogen de lado
//  (el dedo no tapa el punto), modo fino, D-pad y flechas, imán, Ángulo,
//  lupa al tacto y lectura de ángulo y longitud.
//
//  PUNTOS DE EXTENSIÓN, dentro de openPhotoEditor:
//  - handlers[tool] = { down(e, p), move(e, p), up(e, p), cancel() }: puntero de cada herramienta;
//    p = { sx, sy, x, y } (px del escenario y px de imagen). toolHandler(start) los construye:
//    start(e, p) devuelve la operación del gesto ({ move, up, cancel }) o null. Operaciones listas:
//    createOp (arrastrar de A a B), placeOp, moveOp, handleOp (asas) y stickerHandleOp.
//  - Asas: handles(a) → [{ k, x, y }] y setHandle(a, k, q, link) → k, por tipo de marca.
//  - Precisión: placePoint(p, e, { anchor, exclude, vertex }) (imán + Ángulo), showLoupe(e, q),
//    readLine(p1, p2), endAids() y nudge(dx, dy).
//  - Barra contextual: CTX_SECTIONS (secciones (c, bar, opt) que añaden filas y grupos), drawCtx(),
//    openPop/closePop (menús .pe-pop) y acts[nombre] (botones data-act, también los de .pe-ctx).
//  - uiLayers: funciones (ctx) que pintan la capa de interfaz en px de pantalla.
//  - Historial: snapshot(), commit(antes), doUndo(), doRedo() y dirty. select(id), sel(), active.
//  - requestRender(), showHint(texto, ms), hideHint(), setReadout(texto | null).
//  - prefs.snap / prefs.ortho / prefs.fine (localStorage pe-…), ctxBar (.pe-ctx) y loupe.
// =====================================================================
import { h, uid } from './ui.js';
import { COLORS, drawAnnots, loadImage, stickerGeom, stickerPortPts } from './annot.js';
import { STICKERS, STICKER_ORDER, stickerThumb } from './stickers.js';
import { fitView, zoomAt, clampView, toImage, toScreen, maxScale, constrainAngle, angleDeg, distSeg, fmtDim, normDecimal, FINE_FACTOR } from './annot-geom.js';
import { lang } from './i18n.js';

const BG = '#0b0b0d';      // fondo del escenario
const ZOOM_STEP = 1.5;     // botones y teclas + / −
const WHEEL_STEP = 1.15;   // un paso de rueda (deltaY de 100 px)
const MINI_SHOW = 1.05;    // el minimapa aparece con s > fitS · 1.05
const DPR_MAX = 3;         // más resolución no se nota y gasta memoria
const TAP_SLOP = 12;       // px que puede moverse el dedo sin dejar de ser un toque
const DUP_OFFSET = 0.02;   // lo que se desplaza una copia (fracción de la foto, en x e y)
const DIM_TAP = 8;         // px: un arrastre de cota más corto es un toque y se descarta

// Precisión (px de pantalla, iguales a cualquier zoom)
const HANDLE_R = 5;                          // radio dibujado de las asas
const HANDLE_HIT = { touch: 22, mouse: 10 }; // zona de toque de las asas
const STK_HANDLE_R = 9;                      // asas de escalar y girar las pegatinas (con icono)
const MARK_HIT = { touch: 16, mouse: 8 };    // distancia para tocar una marca
const SNAP_PX = 12, PORT_PX = 18;            // imán: extremos y puntos verdes de los equipos
const DRAG_SLOP = 3;                         // lo que hay que mover para arrastrar una marca o asa (un toque solo la elige)
const LOUPE = 140, LOUPE_WIDE = 180;         // lado de la lupa (la grande con ancho ≥ 700)
const GAP = 10;                              // margen de los flotantes (--pe-gap)
const NUDGE_DELAY = 420, NUDGE_EVERY = 60;   // pulsación larga en el D-pad: espera y repetición (ms)
const NUDGE_DIR = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const NUDGE_LABEL = { left: 'Mover a la izquierda', up: 'Mover arriba', down: 'Mover abajo', right: 'Mover a la derecha' };

// Herramientas del raíl, en orden: [clave, nombre, atajo de teclado]
const TOOLS = [
  ['select', 'Mover', 'V'], ['dim', 'Cota', 'D'], ['callout', 'Línea+texto', 'C'], ['route', 'Recorrido', 'P'],
  ['arrow', 'Flecha', 'A'], ['line', 'Línea', 'L'], ['rect', 'Cuadrado', 'R'], ['circle', 'Círculo', 'O'],
  ['number', 'Número', 'N'], ['text', 'Texto', 'T'], ['sticker', 'Equipo', 'E'],
];
const KEY_TOOL = Object.fromEntries(TOOLS.map(([k, , key]) => [key.toLowerCase(), k]));

// Ayuda de cada herramienta (una o dos frases). Imán y Ángulo son interruptores: sin ellos nada se pega ni se endereza solo.
const HINT = {
  select: 'Toca una marca para elegirla y arrástrala para moverla. Arrastra sus puntos desde un lado, sin taparlos, y afínalos con las flechas.',
  dim: 'Arrastra de un extremo al otro de lo que quieres medir. Tira del asa central para separar la línea de cota y escribe la medida.',
  callout: 'Pon el dedo en el punto exacto (la lupa muestra dónde cae) y arrastra hasta donde irá el texto. Después escribe la descripción.',
  route: 'Toca punto a punto el recorrido del cable y pulsa «Terminar». Si empieza o acaba en el punto verde ● de un equipo, el cable lo sigue.',
  arrow: 'Arrastra desde el inicio hasta la punta de la flecha.',
  line: 'Arrastra de un extremo al otro. Con Imán se pega a extremos y a los puntos verdes ● de los equipos; con Ángulo (o Mayús), va a múltiplos de 45°.',
  rect: 'Arrastra en diagonal para dibujar el cuadrado.',
  circle: 'Arrastra en diagonal para dibujar el círculo.',
  number: 'Toca donde quieras el número y escribe qué señala.',
  text: 'Toca donde quieras el texto y escríbelo.',
  sticker: 'Elige el equipo abajo y toca la foto donde irá. Arrástralo para colocarlo; el asa ⤡ cambia el tamaño y ⟳ lo gira. «Propuesta» lo deja semitransparente.',
};
const HINT_TIMES = 2; // la ayuda sale sola las 2 primeras veces que se elige cada herramienta

// Preferencias de precisión: [clave, nombre, al activarla, al desactivarla, por defecto]
const PREFS = [
  ['snap', 'Imán', 'Imán: los puntos se pegan a extremos y equipos', 'Imán desactivado', true],
  ['ortho', 'Ángulo', 'Ángulo: líneas a múltiplos de 45° (o mantén Mayús)', 'Ángulo desactivado', false],
  ['fine', 'Modo fino', 'Modo fino: al mover o ajustar, los puntos se mueven 4 veces más despacio', 'Modo fino desactivado', false],
];

// Marcas: tipos con dos extremos (con imán y asas '1' y '2'; la cota lleva además el asa 'off') y tipos con texto (v2.8)
const LINEISH = ['callout', 'arrow', 'line'];
const ENDPOINTS = [...LINEISH, 'dim'];
const CABLE_TOOLS = ['callout', 'arrow', 'line', 'route']; // con ellas se ven los puntos verdes de los equipos
const TEXT_TYPES = ['callout', 'text', 'number', 'circle', 'rect', 'route', 'sticker'];
const PLACEHOLDER = { callout: 'Descripción (ej. Antena Starlink)', text: 'Texto', number: 'Qué señala este número', circle: 'Etiqueta (opcional)', rect: 'Etiqueta (opcional)', route: 'Texto al final (ej. Infra Veolia)', sticker: 'Etiqueta (opcional, ej. Antena propuesta)' };
const PLACEHOLDER_DIM = 'Etiqueta (opcional, ej. Altura del mástil)';
const DIM_UNITS = ['mm', 'cm', 'm', 'in', 'ft'];
const DIM_ENDS = [['arrow', 'Flecha'], ['tick', 'Trazo'], ['dot', 'Punto']];
const COLOR_NAMES = { '#e53935': 'Rojo', '#fdd835': 'Amarillo', '#ffffff': 'Blanco', '#1e88e5': 'Azul', '#43a047': 'Verde', '#111111': 'Negro', '#fb8c00': 'Naranja', '#00acc1': 'Cian' };
const SIZES = [[0, 'Fino', 1], [1, 'S', 2], [2, 'M', 3], [3, 'L', 4.5]]; // [tamaño, nombre, grosor de la muestra en px]

// Iconos de trazo (24 px). Los puntos llenos llevan fill propio.
const DOT = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;
const ICONS = {
  select: '<path d="M5.5 3v16l4.1-3.8 2.8 5.8 2.5-1.1-2.7-5.8h5.6z"/>',
  dim: '<path d="M3.5 6.5v11M20.5 6.5v11M3.5 12h17M6.5 9.5 3.5 12l3 2.5M17.5 9.5l3 2.5-3 2.5"/>',
  callout: `${DOT(5.5, 18.5, 2)}<path d="M7 17l5-5"/><rect x="12" y="4.5" width="8.5" height="7.5" rx="1.5"/><path d="M14.5 8.25h3.5"/>`,
  route: `<path d="M5 18.5 9.5 11l5 4.5 5-9"/>${DOT(5, 18.5, 2)}${DOT(9.5, 11, 1.4)}${DOT(14.5, 15.5, 1.4)}`,
  arrow: '<path d="M5 19 18.5 5.5M10 5.5h8.5V14"/>',
  line: '<circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="5.5" r="2"/><path d="M7 17 17 7"/>',
  rect: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  number: '<circle cx="12" cy="12" r="8.5"/><path d="M10.5 9.8 12.6 8v8.2"/>',
  text: '<path d="M6 7.5v-2h12v2M12 5.5v13M9.5 18.5h5"/>',
  sticker: `<path d="M4.5 9a8.5 8.5 0 0 0 10.5 10.5z"/><path d="M9.75 14.25 14 10"/>${DOT(15, 9, 1.6)}<path d="M16 4.5a3.5 3.5 0 0 1 3.5 3.5"/>`,
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H15a4.5 4.5 0 0 1 0 9h-3.5"/>',
  redo: '<path d="m15 14 4.5-4.5L15 5"/><path d="M19.5 9.5H9a4.5 4.5 0 0 0 0 9h3.5"/>',
  list: `<path d="M9 6.5h11M9 12h11M9 17.5h11"/>${DOT(4.75, 6.5, 1.1)}${DOT(4.75, 12, 1.1)}${DOT(4.75, 17.5, 1.1)}`,
  caption: '<rect x="3.5" y="3.5" width="17" height="12" rx="2"/><path d="m3.5 13 5-4.5 4 3.5 2.5-2 5.5 4.5M7 20h10"/>',
  snap: '<path d="M6 3.5v8a6 6 0 0 0 12 0v-8h-4v8a2 2 0 0 1-4 0v-8z"/><path d="M6 7.5h4M14 7.5h4"/>',
  ortho: '<path d="M4.5 19.5h15M4.5 19.5 16 8M11.5 19.5a7 7 0 0 0-2.05-4.95"/>',
  fine: `<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>${DOT(12, 12, 1.2)}`,
  zoomin: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9M8 10.5h5M10.5 8v5"/>',
  zoomout: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9M8 10.5h5"/>',
  fit: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  zoom100: `<path d="M4.5 8.5 7.5 6v12M16.5 8.5 19.5 6v12"/>${DOT(12, 10, 1.3)}${DOT(12, 15, 1.3)}`, // «1:1»
  help: `<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.5a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2.1-2.3 3.6"/>${DOT(12, 17, 1)}`,
  hide: '<path d="M14.5 4H20v5.5M20 4l-6 6M9.5 20H4v-5.5M4 20l6-6"/>',
  show: '<path d="M10 4.5V10H4.5M10 10 4 4M14 19.5V14h5.5M14 14l6 6"/>',
  // barra contextual
  dup: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  up: '<path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/>',
  down: '<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/>',
  del: '<path d="M4.5 7h15M9.5 7V5.25A1.25 1.25 0 0 1 10.75 4h2.5a1.25 1.25 0 0 1 1.25 1.25V7M6.5 7l.85 11.6A1.5 1.5 0 0 0 8.85 20h6.3a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 10.5v6M14 10.5v6"/>',
  dashed: '<path d="M3.5 12h3.5M10.25 12h3.5M17 12h3.5"/>',
  'nudge-left': '<path d="M19 12H5M10.5 6.5 5 12l5.5 5.5"/>',
  'nudge-up': '<path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/>',
  'nudge-down': '<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/>',
  'nudge-right': '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  'stk-smaller': '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/><path d="M9 12h6"/>',
  'stk-bigger': '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/><path d="M9 12h6M12 9v6"/>',
  'stk-left': '<path d="M5 12.5a7 7 0 1 0 2.4-5.3"/><path d="M4.5 4.5v4h4"/>',
  'stk-right': '<path d="M19 12.5a7 7 0 1 1-2.4-5.3"/><path d="M19.5 4.5v4h-4"/>',
  'stk-flip': '<path d="M12 3.5v17" stroke-dasharray="2 2.6"/><path d="M8.5 7.5 3.5 16.5h5zM15.5 7.5l5 9h-5z"/>',
};
const svg = (body, attrs = '') => {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="pe-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${attrs}>${body}</svg>`;
  return t.content.firstChild;
};
const ico = (name) => svg(ICONS[name]);
// Muestra de grosor: un trazo ondulado con el grueso del tamaño (una raya recta se confundiría con «menos»)
const weightIco = (n) => svg(`<path d="M4 14.5c2.5-4.5 5-5 8-2.5s5.5 2 8-2.5" stroke-width="${SIZES.find(([k]) => k === n)[2]}"/>`);

// Preferencias del editor en localStorage, con el prefijo pe-
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('pe-' + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('pe-' + k, JSON.stringify(v)); } catch { /* sin espacio o bloqueado */ } },
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const typing = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const coarse = (e) => e.pointerType !== 'mouse'; // dedo o lápiz: zonas de toque más grandes y lupa
const isPointKey = (k) => k === '1' || k === '2' || k[0] === 'v'; // asas con imán y Ángulo
const TAU = Math.PI * 2;

export function openPhotoEditor(photo, { caption = '', onSave }) {
  // =================================================================
  //  ESTADO
  // =================================================================
  let annots = JSON.parse(JSON.stringify(photo.annots || []));
  let tool = store.get('tool', 'callout');
  if (!TOOLS.some(([k]) => k === tool)) tool = 'callout';
  const prefs = Object.fromEntries(PREFS.map(([k, , , , d]) => [k, !!store.get(k, d)]));
  // Estilo y equipo de las marcas nuevas: los últimos elegidos
  let color = store.get('color', COLORS[0]);
  if (!COLORS.includes(color)) color = COLORS[0];
  let size = store.get('size', 2);
  if (!SIZES.some(([n]) => n === size)) size = 2;
  // Cota nueva: grosor (Fino la primera vez), extremos y unidad de la última usada
  let dimSize = store.get('dimsize', 0);
  if (!SIZES.some(([n]) => n === dimSize)) dimSize = 0;
  let dimEnd = store.get('end', 'arrow');
  if (!DIM_ENDS.some(([k]) => k === dimEnd)) dimEnd = 'arrow';
  let dimUnit = store.get('unit', 'm');
  if (!DIM_UNITS.includes(dimUnit)) dimUnit = 'm';
  let stKind = store.get('sticker', 'sl_standard');
  if (!STICKERS[stKind]) stKind = 'sl_standard';
  let stW = +store.get('stw', 0.26) || 0.26;
  let selId = null;                  // marca elegida
  let active = null;                 // punto activo de la marca elegida (la última asa arrastrada): '1', '2', 'v3', 'tl'…
  let draft = null;                  // recorrido en curso (entra en las marcas al terminarlo)
  let routePreview = null;           // punto del recorrido bajo el dedo, antes de soltarlo
  let snapMark = null;               // punto al que se ha pegado el imán (anillo verde)
  let inputType = 'mouse';           // tipo del último puntero (enfocar el texto o solo resaltarlo)
  let img = null, iw = 0, ih = 0;    // foto y su tamaño (px de imagen)
  let view = { s: 1, tx: 0, ty: 0 }; // pantalla = imagen · s + t (px CSS del escenario)
  let fitS = 0;                      // escala de la vista ajustada (0 = aún sin foto)
  let fitted = true;                 // la vista es la ajustada: al cambiar el tamaño, se reajusta
  let free = { x: 0, y: 0, w: 1, h: 1, sw: 1, sh: 1 }; // zona libre de barras fijas y tamaño del escenario
  let dpr = 1;
  let uiOff = false;                 // interfaz oculta
  let boxes = new Map();             // cajas de texto de las marcas (px de imagen), para tocarlas
  let closed = false;
  // Deshacer / rehacer: copias del array de marcas. dirty = hubo cambios (cancelar pide confirmar).
  const undoStack = [], redoStack = [];
  let dirty = false;

  // =================================================================
  //  DOM
  // =================================================================
  const canvas = h('canvas', { class: 'pe-canvas' });
  const ctx = canvas.getContext('2d');
  const mini = h('canvas', { class: 'pe-mini', hidden: true });
  const mctx = mini.getContext('2d');
  const readout = h('div', { class: 'pe-readout', hidden: true, 'data-nt': '' }); // data-nt: sin traducir (números)
  const toast = h('div', { class: 'pe-toast', role: 'status', hidden: true });
  const loupe = h('canvas', { class: 'pe-loupe', hidden: true });
  const lctx = loupe.getContext('2d');
  const stage = h('div', { class: 'pe-stage' }, canvas, mini, readout, toast, loupe);

  const iconBtn = (act, label, title = label, attrs = {}) =>
    h('button', { type: 'button', class: 'pe-btn', 'data-act': act, 'aria-label': label, title, ...attrs }, ico(act));
  const listBadge = h('span', { class: 'pe-badge', hidden: true, 'data-nt': '' }); // contador de marcas (números: sin traducir)
  const listBtn = iconBtn('list', 'Lista de marcas', 'Lista de marcas', { class: 'pe-btn pe-list-btn' });
  listBtn.append(listBadge);
  const topBar = h('div', { class: 'pe-top' },
    h('button', { type: 'button', class: 'pe-txt pe-cancel', 'data-act': 'cancel', 'aria-label': 'Cancelar' }, ico('close'), h('span', {}, 'Cancelar')),
    h('div', { class: 'pe-cluster' },
      iconBtn('undo', 'Deshacer', 'Deshacer (Ctrl+Z)'),
      iconBtn('redo', 'Rehacer', 'Rehacer (Ctrl+Y)'),
      h('span', { class: 'pe-sep', 'aria-hidden': 'true' }),
      listBtn,
      iconBtn('caption', 'Pie de foto')),
    h('button', { type: 'button', class: 'pe-txt pe-save', 'data-act': 'save' }, 'Guardar'));
  const toolBox = h('div', { class: 'pe-tools' }, // desplazable si no caben todas
    TOOLS.map(([k, name, key]) => h('button', { type: 'button', class: 'tool', 'data-tool': k, 'aria-pressed': 'false', 'aria-label': name, title: `${name} (${key})` }, ico(k), h('span', {}, name))));
  const rail = h('div', { class: 'pe-rail', role: 'toolbar', 'aria-label': 'Herramientas' }, toolBox);
  const sideBox = h('div', { class: 'pe-sidebox' }, // en la franja, desplazable si no caben todos
    h('div', { class: 'pe-group' }, PREFS.map(([k, name, desc]) => iconBtn(k, name, desc, { 'aria-pressed': 'false' }))),
    h('div', { class: 'pe-group' },
      iconBtn('zoomin', 'Acercar', 'Acercar (+)'),
      iconBtn('zoomout', 'Alejar', 'Alejar (−)'),
      iconBtn('fit', 'Ver toda la foto', 'Ver toda la foto (0)'),
      iconBtn('zoom100', 'Ver al 100 %', 'Ver al 100 % (1)')),
    h('div', { class: 'pe-group' }, iconBtn('help', 'Ayuda de la herramienta'), iconBtn('hide', 'Ocultar interfaz')));
  const sideBar = h('div', { class: 'pe-side' }, sideBox);
  const ctxBar = h('div', { class: 'pe-ctx' }); // barra contextual (ver BARRA CONTEXTUAL)
  const showBtn = iconBtn('show', 'Mostrar interfaz', 'Mostrar interfaz', { class: 'pe-btn pe-show', hidden: true });
  const root = h('div', { class: 'pe', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Editor de fotos' },
    stage, topBar, rail, sideBar, ctxBar, showBtn);
  const btns = Object.fromEntries([...root.querySelectorAll('button[data-act]')].map((b) => [b.dataset.act, b]));
  const prevOverflow = document.body.style.overflow;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  // =================================================================
  //  DISPOSICIÓN Y AJUSTE
  // =================================================================
  // Zona libre: el escenario menos las barras fijas: la superior, el raíl (abajo o a la izquierda) y el
  // grupo lateral (franja bajo la barra superior en vertical; columna a la derecha en horizontal).
  // La barra contextual, el minimapa y los avisos flotan encima y no cuentan.
  function measureFree() {
    const st = stage.getBoundingClientRect();
    let x = 0, y = 0, r = st.width, b = st.height;
    if (!uiOff) {
      y = clamp(topBar.getBoundingClientRect().bottom - st.top, 0, b);
      const rr = rail.getBoundingClientRect();
      if (rr.width && rr.height) {
        if (rr.height > rr.width) x = clamp(rr.right - st.left, 0, r);
        else b = clamp(rr.top - st.top, y, b);
      }
      const sr = sideBar.getBoundingClientRect();
      if (sr.width && sr.height) {
        if (sr.width > sr.height) y = clamp(sr.bottom - st.top, y, b);
        else r = clamp(sr.left - st.left, x, r);
      }
    }
    return { x, y, w: Math.max(1, r - x), h: Math.max(1, b - y), sw: st.width, sh: st.height };
  }

  // Recalcula canvas, zona libre y escala de ajuste. Si la vista estaba ajustada, se reajusta;
  // si no, el punto de imagen del centro de la zona libre sigue en el centro (y se limita la vista).
  function layout() {
    if (closed) return;
    const prev = free;
    free = measureFree();
    dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    const cw = Math.round(free.sw * dpr), ch = Math.round(free.sh * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    if (img) {
      const c = toImage(view, prev.x + prev.w / 2, prev.y + prev.h / 2);
      fitS = fitView(iw, ih, free).s;
      sizeMini();
      if (fitted) setView(fitView(iw, ih, free));
      else { const s = clampS(view.s); setView({ s, tx: free.x + free.w / 2 - c.x * s, ty: free.y + free.h / 2 - c.y * s }); }
    }
    edgeFade(toolBox); edgeFade(sideBox);
    render(); // en el mismo fotograma: el canvas recién redimensionado no llega a verse vacío
  }

  // =================================================================
  //  RENDER
  // =================================================================
  let frame = 0;
  // Capa de interfaz (asas, imán, recorrido en curso…): funciones (ctx) en px de pantalla
  const uiLayers = [];
  // Marcas que se pintan: las guardadas y el recorrido en curso
  const marks = () => (draft ? [...annots, draft] : annots);
  // Pide un repintado; varios cambios en el mismo fotograma se pintan una sola vez.
  function requestRender() { if (!frame && !closed) frame = requestAnimationFrame(render); }
  function render() {
    cancelAnimationFrame(frame); frame = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (img) {
      const { s, tx, ty } = view, k = dpr * s;
      // Foto: suavizada al alejar; píxeles nítidos al acercar mucho (≥ 3 px de pantalla por px de imagen)
      ctx.setTransform(k, 0, 0, k, dpr * tx, dpr * ty);
      ctx.imageSmoothingEnabled = k < 3;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, iw, ih);
      // Contorno sutil de 1 px alrededor de la foto
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
      ctx.strokeRect(tx - 0.5, ty - 0.5, iw * s + 1, ih * s + 1);
      // Marcas en coordenadas de imagen, recortadas a la foto (como saldrán en el PDF)
      ctx.save();
      ctx.setTransform(k, 0, 0, k, dpr * tx, dpr * ty);
      ctx.beginPath(); ctx.rect(0, 0, iw, ih); ctx.clip();
      boxes = drawAnnots(ctx, iw, ih, marks(), { editing: true });
      ctx.restore();
      // Capa de interfaz en px de pantalla
      for (const layer of uiLayers) { ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); layer(ctx); ctx.restore(); }
    }
    drawMini();
    drawLoupe();
  }

  // =================================================================
  //  VISTA Y ZOOM
  // =================================================================
  const clampS = (s) => clamp(s, fitS, maxScale(fitS));
  // Única entrada para cambiar la vista. En la escala de ajuste, la vista ajustada (centrada);
  // si no, se limita a la zona libre: la foto no puede salir más de la mitad.
  function setView(v) {
    if (v.s <= fitS * (1 + 1e-9)) { view = fitView(iw, ih, free); fitted = true; }
    else {
      const c = clampView({ s: v.s, tx: v.tx - free.x, ty: v.ty - free.y }, iw, ih, free.w, free.h);
      view = { s: c.s, tx: c.tx + free.x, ty: c.ty + free.y };
      fitted = false;
    }
    requestRender();
    updateZoomBtns();
  }
  const center = () => ({ x: free.x + free.w / 2, y: free.y + free.h / 2 });
  // Zoom dejando fijo el punto de pantalla (sx, sy)
  const zoomAround = (sx, sy, s) => { if (img) setView(zoomAt(view, sx, sy, clampS(s))); };
  const zoomCenter = (k) => { const c = center(); zoomAround(c.x, c.y, view.s * k); };
  const fitToScreen = () => { if (img) setView(fitView(iw, ih, free)); };
  const zoom100 = () => { const c = center(); zoomAround(c.x, c.y, 1); }; // 1 px de la foto por px de pantalla (dentro de los límites)
  // Centra la vista en un punto de imagen, sin cambiar la escala
  const centerOn = (x, y) => { const c = center(); setView({ s: view.s, tx: c.x - x * view.s, ty: c.y - y * view.s }); };

  // =================================================================
  //  MINIMAPA (visible con zoom: tocarlo o arrastrarlo centra la vista)
  // =================================================================
  let miniThumb = null;
  function sizeMini() {
    const side = free.sw >= 700 ? 168 : 120, k = side / Math.max(iw, ih);
    const w = Math.round(iw * k), hh = Math.round(ih * k), bw = Math.round(w * dpr), bh = Math.round(hh * dpr);
    mini.style.width = `${w}px`; mini.style.height = `${hh}px`;
    root.style.setProperty('--pe-mini-h', `${hh}px`);
    if (miniThumb && mini.width === bw && mini.height === bh) return;
    mini.width = bw; mini.height = bh;
    miniThumb = document.createElement('canvas');
    miniThumb.width = bw; miniThumb.height = bh;
    const t = miniThumb.getContext('2d');
    t.imageSmoothingQuality = 'high';
    t.drawImage(img, 0, 0, bw, bh);
  }
  function drawMini() {
    const on = !!img && !uiOff && view.s > fitS * MINI_SHOW;
    if (mini.hidden === on) mini.hidden = !on;
    root.classList.toggle('pe-zoomed', on);
    if (!on) return;
    const W = mini.width, H = mini.height, kx = W / iw, ky = H / ih;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.drawImage(miniThumb, 0, 0);
    mctx.setTransform(kx, 0, 0, ky, 0, 0);
    drawAnnots(mctx, iw, ih, marks());
    // Zona que se ve: lo de fuera, oscurecido; el borde, en blanco
    const a = toImage(view, free.x, free.y), b = toImage(view, free.x + free.w, free.y + free.h);
    const x0 = clamp(a.x, 0, iw) * kx, y0 = clamp(a.y, 0, ih) * ky, x1 = clamp(b.x, 0, iw) * kx, y1 = clamp(b.y, 0, ih) * ky;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = 'rgba(9,9,11,.55)';
    mctx.beginPath(); mctx.rect(0, 0, W, H); mctx.rect(x0, y0, x1 - x0, y1 - y0); mctx.fill('evenodd');
    const lw = 1.5 * dpr;
    mctx.strokeStyle = '#fafafa'; mctx.lineWidth = lw;
    mctx.strokeRect(x0 + lw / 2, y0 + lw / 2, Math.max(0, x1 - x0 - lw), Math.max(0, y1 - y0 - lw));
  }
  let miniDrag = null;
  const miniGo = (e) => {
    const r = mini.getBoundingClientRect();
    centerOn(clamp((e.clientX - r.left) / r.width, 0, 1) * iw, clamp((e.clientY - r.top) / r.height, 0, 1) * ih);
  };
  mini.addEventListener('pointerdown', (e) => { e.preventDefault(); hideHint(); mini.setPointerCapture(e.pointerId); miniDrag = e.pointerId; miniGo(e); });
  mini.addEventListener('pointermove', (e) => { if (miniDrag === e.pointerId) miniGo(e); });
  const miniEnd = (e) => { if (miniDrag === e.pointerId) miniDrag = null; };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) mini.addEventListener(ev, miniEnd);

  // =================================================================
  //  ENTRADA: puntero, pellizco, rueda y teclado
  // =================================================================
  // Manejadores de puntero por herramienta (ver HERRAMIENTAS; sin manejador, tocar la foto no hace nada)
  const handlers = {};
  const pointers = new Map(); // punteros sobre la foto: id → p
  let op = null;              // manejador de la operación de un puntero en curso
  let pinch = null;           // pellizco en curso: { d, m, v }
  let spaceHeld = false, grabbing = false;

  function pt(e) {
    const r = stage.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, p = toImage(view, sx, sy);
    return { sx, sy, x: p.x, y: p.y };
  }
  function cancelOp() { const o = op; op = null; o?.cancel?.(); }
  function updateCursor(c = null) { canvas.style.cursor = grabbing ? 'grabbing' : spaceHeld ? 'grab' : c || (tool === 'select' ? 'grab' : 'crosshair'); }

  // Desplazar la vista arrastrando: Mover (fuera de las marcas), botón central o espacio + arrastrar
  const pan = {
    start: null,
    down(e, p) { this.start = { sx: p.sx, sy: p.sy, v: view }; grabbing = true; updateCursor(); },
    move(e, p) { const { sx, sy, v } = this.start; setView({ s: v.s, tx: v.tx + p.sx - sx, ty: v.ty + p.sy - sy }); },
    up() { grabbing = false; updateCursor(); },
    cancel() { grabbing = false; updateCursor(); },
  };

  // Base del pellizco con los dos primeros dedos y la vista actual. Se rehace cada vez que cambia el
  // número de dedos (un tercero que entra, uno que se levanta): así la vista no salta.
  function startPinch() {
    const [a, b] = pointers.values();
    pinch = { d: Math.max(1, Math.hypot(a.sx - b.sx, a.sy - b.sy)), m: { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 }, v: view };
  }
  // Pellizco y arrastre con dos dedos, en cualquier herramienta
  function movePinch() {
    const [a, b] = pointers.values();
    const s = clampS(pinch.v.s * Math.hypot(a.sx - b.sx, a.sy - b.sy) / pinch.d);
    const z = zoomAt(pinch.v, pinch.m.x, pinch.m.y, s);
    setView({ s, tx: z.tx + (a.sx + b.sx) / 2 - pinch.m.x, ty: z.ty + (a.sy + b.sy) / 2 - pinch.m.y });
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!img) return;
    e.preventDefault();
    hideHint();
    const consumed = closePop(); // el toque que cierra un menú no dibuja
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pt(e));
    if (pointers.size >= 2) { if (pointers.size === 2) cancelOp(); startPinch(); return; } // un segundo dedo cancela lo que hacía el primero
    if (consumed) return;
    const panning = e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && spaceHeld));
    if (!panning && e.button !== 0) return;
    op = panning ? pan : handlers[tool] || null;
    op?.down(e, pointers.get(e.pointerId));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) { hover(e); return; }
    const p = pt(e);
    pointers.set(e.pointerId, p);
    if (pinch) { if (pointers.size >= 2) movePinch(); return; }
    op?.move(e, p);
  });
  const release = (e, cancelled) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pinch) { if (pointers.size >= 2) startPinch(); else pinch = null; return; }
    const o = op; op = null;
    if (o) { if (cancelled) o.cancel?.(); else o.up?.(e, pt(e)); }
  };
  canvas.addEventListener('pointerup', (e) => release(e, false));
  canvas.addEventListener('pointercancel', (e) => release(e, true));
  canvas.addEventListener('lostpointercapture', (e) => release(e, true)); // tras pointerup ya no está: no hace nada
  canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // sin desplazamiento automático
  // Rueda: 1.15 por paso de 100 px en el cursor; los trackpads (pasos pequeños) van suaves
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!img) return;
    hideHint();
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1;
    const p = pt(e);
    zoomAround(p.sx, p.sy, view.s * WHEEL_STEP ** clamp((-e.deltaY * unit) / 100, -1, 1));
  }, { passive: false });
  root.addEventListener('contextmenu', (e) => { if (!typing(e.target)) e.preventDefault(); });

  function onKeyDown(e) {
    if (typing(e.target)) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && /^[zy]$/i.test(k)) {
      e.preventDefault();
      if (k.toLowerCase() === 'y' || e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if (mod || e.altKey) return;
    if (k === ' ') { // espacio + arrastrar mueve la vista; tampoco pulsa el botón que tenga el foco
      e.preventDefault();
      if (!spaceHeld) { spaceHeld = true; updateCursor(); }
      return;
    }
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
    if (dir && sel()) { const [dx, dy] = NUDGE_DIR[dir], m = e.shiftKey ? 10 : 1; nudge(dx * m, dy * m); } // ×10 con Mayús
    else if ((k === 'Delete' || k === 'Backspace') && sel()) deleteSel();
    else if (k === 'Enter' && draft) finishRoute(true);
    else if (k === 'Escape' && (pop || draft || selId)) { if (!closePop()) { if (draft) finishRoute(); else select(null); } }
    else if (k === '+' || k === '=') zoomCenter(ZOOM_STEP);
    else if (k === '-' || k === '_') zoomCenter(1 / ZOOM_STEP);
    else if (k === '0') fitToScreen();
    else if (k === '1') zoom100();
    else if (KEY_TOOL[k.toLowerCase()] && !e.repeat) setTool(KEY_TOOL[k.toLowerCase()]);
    else return;
    e.preventDefault();
  }
  function onKeyUp(e) { if (e.key === ' ' && !typing(e.target)) { e.preventDefault(); spaceHeld = false; updateCursor(); } }
  const onBlur = () => { spaceHeld = false; updateCursor(); stopHold(); }; // sin la ventana no hay pulsación larga que seguir
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // Botones fiables con el dedo (como v2.8): se pulsan al levantar el dedo sobre el mismo botón.
  // El click que el navegador manda después en ese punto se descarta, aunque debajo ya haya otro
  // botón (p. ej., al mostrar la interfaz aparece Guardar donde estaba el dedo) o, tras cerrar el
  // editor, la página de debajo (ver close).
  let press = null, lastTap = null;
  const isGhost = (e, tap, t0) => e.isTrusted && e.detail > 0 && !!tap && Date.now() - t0 < 700 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 30;
  root.addEventListener('pointerdown', (e) => {
    inputType = e.pointerType || 'mouse';
    // Tocar fuera del campo que tiene el foco (la foto, el minimapa, un botón) lo suelta: las teclas vuelven a ser atajos y
    // no escriben en él, la medida se normaliza (blur) y en el móvil se cierra el teclado. Hace falta porque la foto y el
    // minimapa cancelan el pointerdown (preventDefault) y el navegador ya no quita el foco por su cuenta.
    const f = document.activeElement;
    if (f && f !== root && root.contains(f) && typing(f) && !f.contains(e.target)) f.blur();
    if (pop && e.target !== canvas && !pop.el.contains(e.target) && !pop.anchor.contains(e.target)) closePop(); // tocar fuera cierra el menú
    const b = e.target.closest('button'); press = b ? { b, x: e.clientX, y: e.clientY } : null;
  }, true);
  root.addEventListener('pointerup', (e) => {
    const b = e.target.closest('button'), p = press;
    press = null;
    if (!p || b !== p.b || b.disabled || b.dataset.nudge || e.button !== 0 || Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP) return; // el D-pad lleva su propio puntero
    lastTap = { t: Date.now(), x: e.clientX, y: e.clientY };
    b.click();
  }, true);
  root.addEventListener('pointercancel', () => { press = null; }, true);
  root.addEventListener('click', (e) => {
    if (isGhost(e, lastTap, lastTap?.t)) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  // Al cerrar con un toque, la raíz desaparece antes de que llegue su click: una guarda de un solo uso
  // en document lo descarta para que no pulse lo que haya debajo (en la app, el enlace a informes).
  function guardGhostClick(tap) {
    const t0 = Date.now();
    const stop = (e) => { if (isGhost(e, tap, t0)) { e.stopPropagation(); e.preventDefault(); done(); } };
    const done = () => { clearTimeout(timer); document.removeEventListener('click', stop, true); };
    const timer = setTimeout(done, 700);
    document.addEventListener('click', stop, true);
  }

  // =================================================================
  //  MARCAS: geometría, tocar, asas y enganches (px de imagen)
  // =================================================================
  const sel = () => (selId && annots.find((a) => a.id === selId)) || null;
  // Elige una marca (o ninguna) y rehace la barra contextual. Al cambiar de marca no hay punto activo.
  function select(id) {
    if (id !== selId) active = null;
    selId = id;
    drawCtx(); requestRender();
  }
  // Puntos de una marca: vértices del recorrido, dos extremos o el punto de anclaje
  function pointsOf(a) {
    if (a.type === 'route') return (a.pts || []).map(([x, y]) => ({ x: x * iw, y: y * ih }));
    const p1 = { x: a.x1 * iw, y: a.y1 * ih };
    return a.x2 == null ? [p1] : [p1, { x: a.x2 * iw, y: a.y2 * ih }];
  }
  // Cota: normal unitaria de la línea de medida (la misma que dimLayout) y línea de cota desplazada, en px de imagen
  function dimLine(a) {
    const [p1, p2] = pointsOf(a), len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const n = len > 0 ? { x: -(p2.y - p1.y) / len, y: (p2.x - p1.x) / len } : { x: 0, y: -1 }, o = (a.off || 0) * Math.min(iw, ih);
    const d1 = { x: p1.x + n.x * o, y: p1.y + n.y * o }, d2 = { x: p2.x + n.x * o, y: p2.y + n.y * o };
    return { n, d1, d2, mid: { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 }, base: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
  }
  // Caja envolvente, con la caja de texto de la marca
  function bbox(a) {
    const ps = a.type === 'sticker' ? stickerGeom(a, iw, ih).corners : pointsOf(a), b = boxes.get(a.id);
    const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    if (b) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); }
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  function inSticker(a, p, tol = 0) {
    const g = stickerGeom(a, iw, ih), dx = p.x - g.cx, dy = p.y - g.cy;
    const lx = dx * g.cs + dy * g.sn, ly = -dx * g.sn + dy * g.cs;
    return Math.abs(lx) <= g.sw / 2 + tol && Math.abs(ly) <= g.sh / 2 + tol;
  }
  // Marca bajo el punto p, de la de encima a la de debajo (reglas de v2.8; tolerancia en px de pantalla)
  function hitMark(p, e) {
    const tol = MARK_HIT[coarse(e) ? 'touch' : 'mouse'] / view.s, m = 4 / view.s;
    for (let i = annots.length - 1; i >= 0; i--) {
      const a = annots[i], b = boxes.get(a.id), ps = pointsOf(a);
      if (b && p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m) return a;
      if (a.type === 'dim') { const { d1, d2 } = dimLine(a); if (distSeg(p.x, p.y, d1.x, d1.y, d2.x, d2.y) <= tol) return a; } // también por la línea de cota
      if ((ENDPOINTS.includes(a.type) || a.type === 'route') && ps.some((q, j) => j > 0 && distSeg(p.x, p.y, ps[j - 1].x, ps[j - 1].y, q.x, q.y) <= tol)) return a;
      if (a.type === 'sticker' && inSticker(a, p, tol * 0.5)) return a;
      if ((a.type === 'number' || a.type === 'text') && Math.hypot(ps[0].x - p.x, ps[0].y - p.y) <= tol * 2) return a;
      if ((a.type === 'rect' || a.type === 'circle') && ps[1]) {
        const [p1, p2] = ps;
        if (p.x >= Math.min(p1.x, p2.x) - tol && p.x <= Math.max(p1.x, p2.x) + tol && p.y >= Math.min(p1.y, p2.y) - tol && p.y <= Math.max(p1.y, p2.y) + tol) return a;
      }
    }
    return null;
  }

  // Asas de una marca. k: '1' | '2' extremos, 'v<i>' vértices del recorrido, 'tl' | 'tr' | 'bl' | 'br'
  // esquinas, 'sc' | 'ro' escalar y girar pegatinas, 'off' separación de la línea de cota (en su punto medio).
  function handles(a) {
    if (a.type === 'sticker') {
      const g = stickerGeom(a, iw, ih), d = g.sh / 2 + 34 / view.s; // el asa de giro, 34 px por encima
      let ro = { x: g.cx + g.sn * d, y: g.cy - g.cs * d };
      if (ro.y < 0 || ro.x < 0 || ro.x > iw) ro = { x: g.cx - g.sn * d, y: g.cy + g.cs * d }; // si se sale por arriba, abajo
      return [{ k: 'sc', ...clampImg(g.corners[2]) }, { k: 'ro', ...clampImg(ro) }];
    }
    if (ENDPOINTS.includes(a.type)) {
      const hs = pointsOf(a).map((p, i) => ({ k: String(i + 1), ...p }));
      if (a.type === 'dim') hs.push({ k: 'off', ...dimLine(a).mid });
      return hs;
    }
    if (a.type === 'route') return pointsOf(a).map((p, i) => ({ k: 'v' + i, ...p }));
    if ((a.type === 'rect' || a.type === 'circle') && a.x2 != null) {
      const L = Math.min(a.x1, a.x2) * iw, R = Math.max(a.x1, a.x2) * iw, T = Math.min(a.y1, a.y2) * ih, B = Math.max(a.y1, a.y2) * ih;
      return [{ k: 'tl', x: L, y: T }, { k: 'tr', x: R, y: T }, { k: 'bl', x: L, y: B }, { k: 'br', x: R, y: B }];
    }
    return [];
  }
  // Asa de la marca elegida bajo el punto: 22 px con el dedo y 10 con el ratón; si hay varias, la más cercana
  // only: solo esa asa (con Cota, la elegida solo se ajusta por 'off': el resto de toques crean otra cota)
  function hitHandle(a, p, e, only = null) {
    let best = null, bd = HANDLE_HIT[coarse(e) ? 'touch' : 'mouse'] / view.s;
    for (const q of handles(a)) { if (only && q.k !== only) continue; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d <= bd) { bd = d; best = q; } }
    return best;
  }
  // Coloca la asa k en q (ya con imán y Ángulo) y engancha o suelta ese punto (link). Devuelve la clave de la
  // asa, que en cuadrados y círculos cambia si se cruza la esquina contraria (como en v2.8).
  function setHandle(a, k, q, link = null) {
    const nx = q.x / iw, ny = q.y / ih;
    if (k === '1' || k === '2') { a['x' + k] = nx; a['y' + k] = ny; setLink(a, k, a.type === 'dim' ? null : link); return k; }
    if (k === 'off') { // solo en perpendicular: se proyecta q sobre la normal desde el punto medio de la medida
      const { n, base } = dimLine(a);
      a.off = ((q.x - base.x) * n.x + (q.y - base.y) * n.y) / Math.min(iw, ih);
      return k;
    }
    if (k[0] === 'v') { a.pts[+k.slice(1)] = [nx, ny]; setLink(a, k, link); return k; }
    const nb = { L: Math.min(a.x1, a.x2), R: Math.max(a.x1, a.x2), T: Math.min(a.y1, a.y2), B: Math.max(a.y1, a.y2) };
    if (k.includes('l')) nb.L = nx; else nb.R = nx;
    if (k.includes('t')) nb.T = ny; else nb.B = ny;
    a.x1 = nb.L; a.x2 = nb.R; a.y1 = nb.T; a.y2 = nb.B;
    if (a.x1 > a.x2) { [a.x1, a.x2] = [a.x2, a.x1]; k = k.replace(/[lr]/, (c) => (c === 'l' ? 'r' : 'l')); }
    if (a.y1 > a.y2) { [a.y1, a.y2] = [a.y2, a.y1]; k = k.replace(/[tb]/, (c) => (c === 't' ? 'b' : 't')); }
    return k;
  }
  // Punto fijo del Ángulo al ajustar: el otro extremo, o el vértice anterior (el siguiente si es el primero)
  function handleAnchor(a, k) {
    const ps = pointsOf(a);
    if (k === '1' || k === '2') return ps[k === '1' ? 1 : 0] || null;
    if (k[0] === 'v') { const i = +k.slice(1); return ps[i - 1] || ps[i + 1] || null; }
    return null;
  }
  // Desplaza la marca dx, dy px de imagen a partir de su copia o (puede ser la propia marca). Al mover la
  // línea entera se suelta de los equipos, como en v2.8.
  function translate(a, o, dx, dy) {
    if (a.links && a.type !== 'sticker') delete a.links;
    const kx = dx / iw, ky = dy / ih;
    if (a.type === 'route') a.pts = o.pts.map(([x, y]) => [x + kx, y + ky]);
    else { a.x1 = o.x1 + kx; a.y1 = o.y1 + ky; if (o.x2 != null) { a.x2 = o.x2 + kx; a.y2 = o.y2 + ky; } }
  }
  // Engancha el punto key ('1', '2' o 'v<i>') al punto de un equipo: link = { s: idPegatina, p: nºPunto }; null lo suelta
  function setLink(a, key, link) {
    if (link) a.links = { ...(a.links || {}), [key]: link };
    else if (a.links && a.links[key]) { delete a.links[key]; if (!Object.keys(a.links).length) delete a.links; }
  }
  // Toque sin arrastrar al crear: tamaño por defecto (v2.8)
  function defaultSize(a) {
    const r = iw / ih, d = 0.07;
    if (a.type === 'circle' || a.type === 'rect') Object.assign(a, { x1: a.x1 - d, y1: a.y1 - d * r, x2: a.x1 + d, y2: a.y1 + d * r });
    else { Object.assign(a, { x2: Math.min(0.97, a.x1 + 0.16), y2: Math.max(0.03, a.y1 - 0.1 * r) }); setLink(a, '2', null); }
  }
  function deleteMark(a) {
    snapshot();
    annots = annots.filter((x) => x !== a);
    if (selId === a.id) { selId = null; active = null; }
    drawCtx(); requestRender();
  }
  function deleteSel() { const a = sel(); if (a) deleteMark(a); }
  // Duplicar: copia con id nuevo, desplazada DUP_OFFSET en x e y (hacia el otro lado si así se saldría de la foto),
  // sin los enganches a equipos, y queda elegida. Un número nuevo sigue la cuenta.
  function duplicate(a) {
    const c = JSON.parse(JSON.stringify(a));
    c.id = uid(); delete c.links;
    const xs = a.type === 'route' ? a.pts.map((q) => q[0]) : [a.x1, a.x2].filter((v) => v != null);
    const ys = a.type === 'route' ? a.pts.map((q) => q[1]) : [a.y1, a.y2].filter((v) => v != null);
    const shift = (vs) => (Math.max(...vs) + DUP_OFFSET <= 1 ? DUP_OFFSET : Math.min(...vs) - DUP_OFFSET >= 0 ? -DUP_OFFSET : 0);
    const dx = shift(xs), dy = shift(ys);
    if (a.type === 'route') c.pts = a.pts.map(([x, y]) => [x + dx, y + dy]);
    else { c.x1 = a.x1 + dx; c.y1 = a.y1 + dy; if (a.x2 != null) { c.x2 = a.x2 + dx; c.y2 = a.y2 + dy; } }
    if (a.type === 'number') c.n = Math.max(0, ...annots.filter((x) => x.type === 'number').map((x) => +x.n || 0)) + 1;
    snapshot();
    annots.push(c); selId = c.id; active = null;
    drawCtx(); requestRender();
  }
  // Orden de las marcas: d = +1 la trae adelante (más tarde en el array, se pinta encima); −1 la envía atrás
  function reorder(a, d) {
    const i = annots.indexOf(a), j = i + d;
    if (i < 0 || j < 0 || j >= annots.length) return;
    snapshot();
    [annots[i], annots[j]] = [annots[j], annots[i]];
    requestRender();
  }

  // =================================================================
  //  PRECISIÓN: imán, Ángulo, fino, lupa, lectura y nudge
  // =================================================================
  const clampImg = (p) => ({ x: clamp(p.x, 0, iw), y: clamp(p.y, 0, ih) });
  const onImage = (p) => p.x >= 0 && p.x <= iw && p.y >= 0 && p.y <= ih;
  const angleOn = (e) => prefs.ortho || !!e?.shiftKey;
  // Lleva q dentro de la foto sin cambiar su dirección desde el ancla (el Ángulo sigue exacto en el borde)
  function clampRay(a, q) {
    let t = 1;
    const dx = q.x - a.x, dy = q.y - a.y;
    if (q.x < 0) t = Math.min(t, -a.x / dx); else if (q.x > iw) t = Math.min(t, (iw - a.x) / dx);
    if (q.y < 0) t = Math.min(t, -a.y / dy); else if (q.y > ih) t = Math.min(t, (ih - a.y) / dy);
    t = Math.max(0, t);
    return { x: a.x + dx * t, y: a.y + dy * t };
  }
  // Imán (si está activado): el punto verde de un equipo a ≤ 18 px gana; si no, el extremo o vértice más
  // cercano a ≤ 12 px (px de pantalla). Nunca a la propia marca (en un recorrido, solo al vértice que se
  // mueve) ni al último punto del recorrido en curso. Devuelve { x, y, link } o null.
  function snapTarget(p, { exclude = null, vertex = -1 } = {}) {
    if (!prefs.snap) return null;
    let best = null, bd = SNAP_PX / view.s;
    const cand = (q) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d <= bd) { bd = d; best = { x: q.x, y: q.y, link: null }; } };
    for (const a of annots) {
      if (a.type !== 'route' && !ENDPOINTS.includes(a.type)) continue;
      pointsOf(a).forEach((q, i) => { if (a.id === exclude && (a.type !== 'route' || vertex < 0 || i === vertex)) return; cand(q); });
    }
    if (draft && draft.id !== exclude) draft.pts.slice(0, -1).forEach(([x, y]) => cand({ x: x * iw, y: y * ih }));
    let port = null, pd = PORT_PX / view.s;
    for (const a of annots) {
      if (a.type !== 'sticker') continue;
      stickerPortPts(a, iw, ih).forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d <= pd) { pd = d; port = { x: q.x, y: q.y, link: { s: a.id, p: i } }; } });
    }
    return port || best;
  }
  // Punto de un extremo o vértice, dentro de la foto. El imán, si encuentra algo, manda (como en CAD); si no,
  // con Ángulo o Mayús el punto va al múltiplo de 45° más cercano desde el ancla. Sin ellos, donde cae el dedo.
  // Devuelve { x, y, link } y deja el anillo del imán.
  function placePoint(p, e, { anchor = null, exclude = null, vertex = -1 } = {}) {
    const q = clampImg(p);
    snapMark = snapTarget(q, { exclude, vertex });
    if (snapMark) return snapMark;
    if (anchor && angleOn(e)) return { ...clampRay(anchor, constrainAngle(anchor, q)), link: null };
    return { ...q, link: null };
  }
  // Lectura «∠ 12.4° · 356 px»: inclinación (0° horizontal, sentido antihorario como en un transportador) y longitud en px de imagen
  function readLine(p1, p2) {
    setReadout(`∠ ${angleDeg(p1, { x: p2.x, y: 2 * p1.y - p2.y }).toFixed(1)}° · ${Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y))} px`);
  }

  // Lupa al tacto (con ratón no hace falta): muestra el punto q, arriba, en la esquina contraria al dedo
  let lens = null; // { x, y } en el centro (px de imagen) y left: si va a la izquierda
  function showLoupe(e, q) {
    if (!coarse(e)) return;
    lens = { x: q.x, y: q.y, left: pt(e).sx > free.x + free.w / 2 };
    requestRender();
  }
  function drawLoupe() {
    if (!lens || !img) {
      if (!loupe.hidden) { loupe.hidden = true; readout.classList.remove('pe-at-lens'); }
      return;
    }
    const L = free.sw >= 700 ? LOUPE_WIDE : LOUPE, n = Math.round(L * dpr);
    if (loupe.width !== n) { loupe.width = n; loupe.height = n; }
    const left = lens.left ? free.x + GAP : free.x + free.w - L - GAP;
    const top = free.y + GAP + (lens.left && !mini.hidden ? mini.offsetHeight + GAP : 0); // sin tapar el minimapa
    Object.assign(loupe.style, { width: `${L}px`, height: `${L}px`, left: `${left}px`, top: `${top}px` });
    loupe.hidden = false;
    // La lectura, justo debajo de la lupa (donde se está mirando)
    readout.classList.add('pe-at-lens');
    readout.style.setProperty('--lx', `${left + L / 2}px`);
    readout.style.setProperty('--ly', `${top + L + 8}px`);
    // Foto y marcas con su propia transformación: k px de pantalla por px de imagen
    const k = Math.min(Math.max(view.s * 4, 2), 32), K = k * dpr;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.fillStyle = BG; lctx.fillRect(0, 0, n, n);
    lctx.setTransform(K, 0, 0, K, n / 2 - lens.x * K, n / 2 - lens.y * K);
    lctx.imageSmoothingEnabled = K < 3;
    lctx.imageSmoothingQuality = 'high';
    lctx.drawImage(img, 0, 0, iw, ih);
    lctx.save();
    lctx.beginPath(); lctx.rect(0, 0, iw, ih); lctx.clip();
    drawAnnots(lctx, iw, ih, marks(), { editing: true });
    lctx.restore();
    // Cruz de 1 px con hueco en el centro (el punto exacto queda a la vista); anillo verde si el imán ha enganchado
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = L / 2, g = 5, arm = 20;
    const cross = (w, col) => {
      lctx.strokeStyle = col; lctx.lineWidth = w; lctx.lineCap = 'butt'; lctx.beginPath();
      lctx.moveTo(c - arm, c); lctx.lineTo(c - g, c); lctx.moveTo(c + g, c); lctx.lineTo(c + arm, c);
      lctx.moveTo(c, c - arm); lctx.lineTo(c, c - g); lctx.moveTo(c, c + g); lctx.lineTo(c, c + arm);
      lctx.stroke();
    };
    cross(3, 'rgba(9,9,11,.5)'); cross(1, '#fff');
    if (snapMark) { lctx.lineWidth = 2; lctx.strokeStyle = '#22c55e'; lctx.beginPath(); lctx.arc(c, c, 11, 0, TAU); lctx.stroke(); }
  }
  // Fin de una operación: fuera lupa, lectura y anillo del imán
  function endAids() { lens = null; snapMark = null; setReadout(null); requestRender(); }

  // Mueve el punto activo (o, sin él, la marca entera) dx, dy px de pantalla: 1/s px de imagen cada uno.
  // Las pulsaciones seguidas sobre el mismo punto son un solo paso de deshacer.
  let nudgeRun = null;
  function nudge(dx, dy) {
    const a = sel();
    if (!a) return;
    const now = Date.now();
    if (!nudgeRun || nudgeRun.id !== a.id || nudgeRun.k !== active || now - nudgeRun.t > 1000) snapshot();
    const d = { x: dx / view.s, y: dy / view.s }, hp = active && handles(a).find((q) => q.k === active);
    if (hp) active = setHandle(a, active, clampImg({ x: hp.x + d.x, y: hp.y + d.y }));
    else translate(a, a, d.x, d.y);
    nudgeRun = { id: a.id, k: active, t: now };
    requestRender();
  }

  // =================================================================
  //  HERRAMIENTAS: operaciones de puntero y manejadores
  // =================================================================
  // Cada herramienta elige en down la operación del gesto ({ move, up, cancel } o null) y le pasa el resto.
  // Las operaciones guardan el estado al empezar: si se cancelan (segundo dedo, captura perdida) no queda rastro.
  const toolHandler = (start) => {
    let cur = null;
    return {
      down(e, p) { cur = start(e, p) || null; },
      move(e, p) { cur?.move?.(e, p); },
      up(e, p) { const c = cur; cur = null; c?.up?.(e, p); },
      cancel() { const c = cur; cur = null; c?.cancel?.(); },
    };
  };
  const begin = () => ({ json: JSON.stringify(annots), sel: selId, active });
  function abort(b) { annots = JSON.parse(b.json); selId = b.sel; active = b.active; endAids(); drawCtx(); }
  const newMark = (type, q, extra = {}) => ({ id: uid(), type, color, size, x1: q.x / iw, y1: q.y / ih, ...extra });

  // Línea+texto, flecha, línea, cuadrado o círculo: se arrastra de A a B (las líneas, con imán y Ángulo).
  // No va más despacio en modo fino: el punto queda bajo el dedo (lo enseña la lupa).
  function createOp(e, p, type) {
    if (!onImage(p)) return null;
    const b = begin(), lineish = LINEISH.includes(type), s0 = { x: p.sx, y: p.sy };
    const p0 = lineish ? placePoint(p, e) : { ...clampImg(p), link: null };
    const a = newMark(type, p0, { x2: p0.x / iw, y2: p0.y / ih, text: '' });
    if (p0.link) setLink(a, '1', p0.link);
    annots.push(a); selId = a.id; active = null;
    showLoupe(e, p0); requestRender();
    return {
      move(e, p) {
        const q = lineish ? placePoint(p, e, { anchor: p0, exclude: a.id }) : clampImg(p);
        a.x2 = q.x / iw; a.y2 = q.y / ih;
        if (lineish) { setLink(a, '2', q.link); readLine(p0, q); }
        showLoupe(e, q); requestRender();
      },
      up(e, p) {
        if (Math.hypot(p.sx - s0.x, p.sy - s0.y) < 8) defaultSize(a);
        commit(b.json); endAids(); drawCtx(type === 'callout');
      },
      cancel() { abort(b); },
    };
  }
  // Cota: se arrastra de A a B (con imán y Ángulo, como las líneas). Un toque sin arrastrar no crea nada: solo muestra la ayuda.
  // Al soltar queda elegida, con la medida lista para escribir.
  function dimOp(e, p) {
    if (!onImage(p)) return null;
    const b = begin(), s0 = { x: p.sx, y: p.sy }, p0 = placePoint(p, e);
    const a = newMark('dim', p0, { size: dimSize, end: dimEnd, unit: dimUnit, x2: p0.x / iw, y2: p0.y / ih, off: 0, val: '', text: '' });
    annots.push(a); selId = a.id; active = null;
    showLoupe(e, p0); requestRender();
    return {
      move(e, p) {
        const q = placePoint(p, e, { anchor: p0, exclude: a.id });
        a.x2 = q.x / iw; a.y2 = q.y / ih;
        readLine(p0, q); showLoupe(e, q); requestRender();
      },
      up(e, p) {
        if (Math.hypot(p.sx - s0.x, p.sy - s0.y) < DIM_TAP) { abort(b); showHint(HINT.dim); return; }
        commit(b.json); endAids(); drawCtx(true);
      },
      cancel() { abort(b); },
    };
  }
  // Número (correlativo) o texto: aparece donde se toca y sigue al dedo hasta soltarlo
  function placeOp(e, p, type) {
    if (!onImage(p)) return null;
    const b = begin(), q = clampImg(p);
    const n = Math.max(0, ...annots.filter((x) => x.type === 'number').map((x) => +x.n || 0)) + 1;
    const a = newMark(type, q, { text: '', ...(type === 'number' ? { n } : {}) });
    annots.push(a); selId = a.id; active = null;
    showLoupe(e, q); requestRender();
    return {
      move(e, p) { const q = clampImg(p); a.x1 = q.x / iw; a.y1 = q.y / ih; showLoupe(e, q); requestRender(); },
      up() { commit(b.json); endAids(); drawCtx(true); },
      cancel() { abort(b); },
    };
  }
  // Pegatina nueva del equipo elegido: el último tamaño usado, que quepa en la foto (alto máx. 60 %)
  function stickerPlaceOp(e, p) {
    if (!onImage(p)) return null;
    const b = begin(), q = clampImg(p), mn = Math.min(iw, ih);
    const w = Math.min(stW, (0.6 * ih) / (STICKERS[stKind].ar * mn), (0.6 * iw) / mn);
    const a = { id: uid(), type: 'sticker', kind: stKind, color, size, x1: q.x / iw, y1: q.y / ih, w, rot: 0, text: '' };
    annots.push(a); selId = a.id; active = null;
    drawCtx(); requestRender();
    return {
      move(e, p) { const q = clampImg(p); a.x1 = q.x / iw; a.y1 = q.y / ih; requestRender(); },
      up() { commit(b.json); },
      cancel() { abort(b); },
    };
  }
  // Recorrido: cada toque pone un punto (con imán y Ángulo desde el anterior); entra en las marcas al terminarlo
  function routeOp(e, p) {
    if (!onImage(p)) return null;
    const last = draft?.pts.at(-1), anchor = last ? { x: last[0] * iw, y: last[1] * ih } : null;
    const place = (e, p) => {
      routePreview = placePoint(p, e, { anchor });
      if (anchor) readLine(anchor, routePreview);
      showLoupe(e, routePreview); requestRender();
    };
    place(e, p);
    return {
      move: place,
      up() {
        const q = routePreview;
        routePreview = null;
        if (!draft) { draft = { id: uid(), type: 'route', color, size, pts: [], text: '', lengths: '', dashed: false }; selId = null; active = null; }
        if (!anchor || Math.hypot(q.x - anchor.x, q.y - anchor.y) * view.s > 6) { // un punto encima del anterior no cuenta
          draft.pts.push([q.x / iw, q.y / ih]);
          setLink(draft, 'v' + (draft.pts.length - 1), q.link);
        }
        endAids(); drawCtx(); updateHistoryBtns();
      },
      cancel() { routePreview = null; endAids(); },
    };
  }
  // Termina el recorrido en curso: con 2 puntos o más entra en las marcas y queda elegido; si no, se descarta
  function finishRoute(focus = false) {
    const d = draft;
    if (!d) return;
    draft = null; routePreview = null;
    if (d.pts.length >= 2) { snapshot(); annots.push(d); selId = d.id; active = null; }
    drawCtx(focus && d.pts.length >= 2); requestRender(); updateHistoryBtns();
  }
  // «↶ Punto» (y deshacer mientras se dibuja): quita el último punto del recorrido en curso
  function popRoutePoint() {
    if (!draft) return;
    if (draft.pts.length) { draft.pts.pop(); setLink(draft, 'v' + draft.pts.length, null); }
    if (!draft.pts.length) draft = null;
    drawCtx(); requestRender(); updateHistoryBtns();
  }
  // Mover la marca entera (en modo fino, a ×0.25). Un toque sin arrastrar solo la elige.
  function moveOp(e, p, a) {
    const b = begin(), o = JSON.parse(JSON.stringify(a)), p0 = p;
    let moving = false;
    active = null;
    requestRender();
    return {
      move(e, p) {
        if (!moving && Math.hypot(p.sx - p0.sx, p.sy - p0.sy) < DRAG_SLOP) return;
        moving = true;
        const f = prefs.fine ? FINE_FACTOR : 1;
        translate(a, o, (p.x - p0.x) * f, (p.y - p0.y) * f);
        requestRender();
      },
      up() { if (moving) commit(b.json); },
      cancel() { abort(b); },
    };
  }
  // Ajustar con una asa. Arrastre desplazado: la asa va a dedo + (asa − dedo al cogerla), así el dedo no la
  // tapa; en modo fino, asa0 + (dedo − dedo0)·0.25. Extremos y vértices, con imán y Ángulo. Queda como punto activo.
  function handleOp(e, p, a, k) {
    const b = begin(), h0 = handles(a).find((q) => q.k === k), p0 = p;
    let key = k, moving = false;
    active = k;
    const aids = (e, q) => {
      if (ENDPOINTS.includes(a.type)) { const ps = pointsOf(a); readLine(ps[0], ps[1]); }
      else if (a.type === 'route') { const an = handleAnchor(a, key); if (an) readLine(an, q); }
      showLoupe(e, q);
    };
    aids(e, h0); requestRender();
    return {
      move(e, p) {
        if (!moving && Math.hypot(p.sx - p0.sx, p.sy - p0.sy) < DRAG_SLOP) return;
        moving = true;
        const f = prefs.fine ? FINE_FACTOR : 1, t = { x: h0.x + (p.x - p0.x) * f, y: h0.y + (p.y - p0.y) * f };
        const q = isPointKey(key)
          ? placePoint(t, e, { anchor: handleAnchor(a, key), exclude: a.id, vertex: key[0] === 'v' ? +key.slice(1) : -1 })
          : { ...clampImg(t), link: null };
        key = setHandle(a, key, q, q.link); active = key;
        aids(e, q); requestRender();
      },
      up() { if (moving) commit(b.json); endAids(); },
      cancel() { abort(b); },
    };
  }
  // Escalar ('sc') o girar ('ro') una pegatina con sus asas. Modo fino a ×0.25; con Ángulo o Mayús, giro a múltiplos de 45°.
  function stickerHandleOp(e, p, a, k) {
    const b = begin(), c = { x: a.x1 * iw, y: a.y1 * ih }, w0 = a.w || 0.26, r0 = a.rot || 0, p0 = p;
    const d0 = Math.max(1e-6, Math.hypot(p.x - c.x, p.y - c.y)), ang0 = Math.atan2(p.y - c.y, p.x - c.x);
    let moving = false;
    active = null;
    return {
      move(e, p) {
        if (!moving && Math.hypot(p.sx - p0.sx, p.sy - p0.sy) < DRAG_SLOP) return;
        moving = true;
        const f = prefs.fine ? FINE_FACTOR : 1, q = { x: p0.x + (p.x - p0.x) * f, y: p0.y + (p.y - p0.y) * f };
        if (k === 'sc') a.w = clamp(w0 * Math.hypot(q.x - c.x, q.y - c.y) / d0, 0.04, 1.5);
        else {
          let r = r0 + Math.atan2(q.y - c.y, q.x - c.x) - ang0;
          if (angleOn(e)) r = Math.round(r / (Math.PI / 4)) * (Math.PI / 4);
          a.rot = r;
        }
        requestRender();
      },
      up() { if (!moving) return; commit(b.json); if (k === 'sc') { stW = a.w; store.set('stw', stW); } },
      cancel() { abort(b); },
    };
  }

  // Mover: asa de la marca elegida, marca (se elige y se arrastra) o, fuera de las marcas, la vista
  handlers.select = toolHandler((e, p) => {
    const a = sel(), hd = a && hitHandle(a, p, e);
    if (hd) return a.type === 'sticker' ? stickerHandleOp(e, p, a, hd.k) : handleOp(e, p, a, hd.k);
    const m = hitMark(p, e);
    if (m) { select(m.id); return moveOp(e, p, m); }
    if (selId) select(null);
    pan.down(e, p);
    return pan;
  });
  // Equipo: asas de la pegatina elegida, arrastrar una pegatina o poner una nueva
  handlers.sticker = toolHandler((e, p) => {
    const a = sel(), hd = a?.type === 'sticker' && hitHandle(a, p, e);
    if (hd) return stickerHandleOp(e, p, a, hd.k);
    const st = [...annots].reverse().find((x) => x.type === 'sticker' && inSticker(x, p, 6 / view.s));
    if (st) { select(st.id); return moveOp(e, p, st); }
    return stickerPlaceOp(e, p);
  });
  handlers.route = toolHandler(routeOp);
  for (const k of ['number', 'text']) handlers[k] = toolHandler((e, p) => placeOp(e, p, k));
  for (const k of ['callout', 'arrow', 'line', 'rect', 'circle']) handlers[k] = toolHandler((e, p) => createOp(e, p, k));
  // Cota: el asa central de la cota elegida (separarla de lo medido) o una cota nueva
  handlers.dim = toolHandler((e, p) => {
    const a = sel(), hd = a?.type === 'dim' && hitHandle(a, p, e, 'off');
    return hd ? handleOp(e, p, a, 'off') : dimOp(e, p);
  });

  // Ratón sin pulsar sobre la foto: el cursor anuncia lo que hará el clic con Mover (asa, marca o vista)
  function hover(e) {
    if (e.pointerType !== 'mouse' || !img || tool !== 'select' || spaceHeld) return;
    const p = pt(e), a = sel();
    updateCursor(a && hitHandle(a, p, e) ? 'crosshair' : hitMark(p, e) ? 'move' : null);
  }

  // =================================================================
  //  CAPA DE INTERFAZ (px de pantalla): equipos, recorrido en curso, selección e imán
  // =================================================================
  const HALO = 'rgba(9,9,11,.72)';
  // Anillo con borde oscuro (asas y puntos): se ve sobre cualquier fondo y no tapa el punto
  function ring(c, q, r, col = '#fff', w = 1.5) {
    c.beginPath(); c.arc(q.x, q.y, r, 0, TAU);
    c.lineWidth = w + 2; c.strokeStyle = HALO; c.stroke();
    c.lineWidth = w; c.strokeStyle = col; c.stroke();
  }
  // Asa: anillo de 5 px. La del punto activo es una mira: anillo y cuatro marcas alrededor.
  function drawHandle(c, q, on) {
    ring(c, q, HANDLE_R);
    if (!on) return;
    c.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(q.x + dx * 8, q.y + dy * 8); c.lineTo(q.x + dx * 12, q.y + dy * 12); }
    c.lineCap = 'round';
    c.lineWidth = 3.5; c.strokeStyle = HALO; c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.stroke();
  }
  // Asas de escalar y girar de las pegatinas: círculo blanco de 9 px con su icono
  function drawStickerHandle(c, q, k) {
    c.beginPath(); c.arc(q.x, q.y, STK_HANDLE_R, 0, TAU);
    c.fillStyle = '#fafafa'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = HALO; c.stroke();
    c.save(); c.translate(q.x, q.y);
    c.strokeStyle = '#18181b'; c.fillStyle = '#18181b'; c.lineWidth = 1.4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    if (k === 'sc') { // ⤡ flecha doble en diagonal
      c.moveTo(-3.6, -3.6); c.lineTo(3.6, 3.6);
      c.moveTo(-3.6, -0.8); c.lineTo(-3.6, -3.6); c.lineTo(-0.8, -3.6);
      c.moveTo(3.6, 0.8); c.lineTo(3.6, 3.6); c.lineTo(0.8, 3.6);
    } else { // ⟳ flecha circular
      c.arc(0, 0, 4, -0.35 * Math.PI, 1.25 * Math.PI);
      c.moveTo(2.2, -5.2); c.lineTo(2.9, -2.9); c.lineTo(5.3, -3.3);
    }
    c.stroke(); c.restore();
  }
  // Puntos verdes de los equipos, donde se enganchan los cables
  function portDot(c, q) {
    c.beginPath(); c.arc(q.x, q.y, 5, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,.95)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#16a34a'; c.stroke();
    c.beginPath(); c.arc(q.x, q.y, 1.8, 0, TAU); c.fillStyle = '#16a34a'; c.fill();
  }
  // Contorno discontinuo (blanco sobre oscuro)
  function dashedPath(c, fn) {
    c.lineWidth = 3; c.strokeStyle = HALO; c.setLineDash([]); c.beginPath(); fn(); c.stroke();
    c.lineWidth = 1; c.strokeStyle = '#fff'; c.setLineDash([4, 3]); c.beginPath(); fn(); c.stroke();
    c.setLineDash([]);
  }
  function drawSelection(c, a, only = null) {
    const S = (q) => toScreen(view, q.x, q.y), hs = handles(a).filter((q) => !only || q.k === only);
    if (a.type === 'sticker') {
      const pts = stickerGeom(a, iw, ih).corners.map(S);
      dashedPath(c, () => { pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath(); });
      const top = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, ro = S(hs.find((q) => q.k === 'ro'));
      c.lineCap = 'round'; c.lineWidth = 3; c.strokeStyle = HALO; c.beginPath(); c.moveTo(top.x, top.y); c.lineTo(ro.x, ro.y); c.stroke();
      c.lineWidth = 1; c.strokeStyle = '#fff'; c.stroke();
      hs.forEach((q) => drawStickerHandle(c, S(q), q.k));
      return;
    }
    if (!hs.length) { // número y texto: sin asas, un contorno
      const bb = bbox(a), p = S(bb), m = 5;
      dashedPath(c, () => c.rect(p.x - m, p.y - m, bb.w * view.s + 2 * m, bb.h * view.s + 2 * m));
    }
    hs.forEach((q) => drawHandle(c, S(q), q.k === active));
  }
  uiLayers.push((c) => {
    const S = (x, y) => toScreen(view, x, y), a = sel();
    // Puntos verdes de los equipos mientras se dibujan cables (o se ajusta uno con Mover)
    if (CABLE_TOOLS.includes(tool) || (tool === 'select' && a && (ENDPOINTS.includes(a.type) || a.type === 'route'))) {
      for (const st of annots) if (st.type === 'sticker') stickerPortPts(st, iw, ih).forEach((q) => portDot(c, S(q.x, q.y)));
    }
    // Recorrido en curso: sus puntos, el tramo provisional hasta el dedo y el punto que se va a poner
    if (draft) {
      for (const [x, y] of draft.pts) { const q = S(x * iw, y * ih); c.beginPath(); c.arc(q.x, q.y, 3.5, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2; c.strokeStyle = draft.color; c.stroke(); }
    }
    if (routePreview) {
      const q = S(routePreview.x, routePreview.y), l = draft?.pts.at(-1);
      if (l) {
        const p = S(l[0] * iw, l[1] * ih), col = draft.color;
        c.lineCap = 'round'; c.setLineDash([6, 5]);
        c.lineWidth = 4; c.strokeStyle = HALO; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
        c.lineWidth = 2; c.strokeStyle = col; c.stroke(); c.setLineDash([]);
      }
      drawHandle(c, q, true);
    }
    // Selección: con Mover, asas y contorno; con Equipo, los de la pegatina elegida; con Cota, solo el asa central de la cota
    if (a && (tool === 'select' || (tool === 'sticker' && a.type === 'sticker'))) drawSelection(c, a);
    else if (a?.type === 'dim' && tool === 'dim') drawSelection(c, a, 'off');
    // Imán: anillo verde donde se ha pegado
    if (snapMark) ring(c, S(snapMark.x, snapMark.y), 10, '#22c55e', 2);
  });

  // =================================================================
  //  BARRA CONTEXTUAL (.pe-ctx): recorrido, equipos, texto, color y grosor, borrar y D-pad
  // =================================================================
  // drawCtx() la rehace al cambiar de herramienta, de marca elegida o de recorrido en curso. Cada sección de
  // CTX_SECTIONS recibe c = { a: marca elegida, tool, draft } y añade a bar.rows filas a lo ancho (aviso,
  // paleta o campos) o a bar.main grupos de botones (una fila; si no cabe, se desplaza). Como mucho dos filas.
  // Para añadir campos basta con otra sección; Duplicar y Borrar van en el grupo de edición.
  const CTX_SECTIONS = [
    // Recorrido en curso (o por empezar): cuántos puntos van, «↶ Punto» y «✓ Terminar»
    ({ a, tool: t, draft: d }, bar) => {
      if (t !== 'route' || (!d && a)) return;
      const n = d ? d.pts.length : 0;
      bar.rows.push(h('div', { class: 'pe-ctx-info' }, !d ? 'Puntos: 0. Toca el primer punto.' : n < 2 ? `Puntos: ${n}. Toca el siguiente punto.` : `Puntos: ${n}.`));
      bar.main.push([
        h('button', { type: 'button', class: 'pe-txt', 'data-act': 'route-undo', disabled: !n }, '↶ Punto'),
        h('button', { type: 'button', class: 'pe-txt pe-primary', 'data-act': 'route-done', disabled: n < 2 }, '✓ Terminar'),
      ]);
    },
    // Equipo sin pegatina elegida: la paleta (el siguiente toque en la foto pone el elegido)
    ({ a, tool: t }, bar) => { if (t === 'sticker' && !a) bar.rows.push(palette()); },
    // Texto de la marca y, en el recorrido, medidas por tramo. Con Equipo y una pegatina elegida, su etiqueta
    // ocupa la fila de la paleta (dos filas como mucho); el botón de al lado vuelve a la paleta.
    ({ a, tool: t }, bar, opt) => {
      if (!a || !TEXT_TYPES.includes(a.type)) return;
      bar.rows.push(h('div', { class: 'pe-ctx-fields' }, labelInput(a, opt.focus), a.type === 'route' ? lengthsInput(a) : null,
        t === 'sticker' ? h('button', { type: 'button', class: 'pe-btn', 'data-act': 'palette', 'aria-label': 'Elegir otro equipo', title: 'Elegir otro equipo' }, ico('sticker')) : null));
    },
    // Cota elegida: la medida y su unidad (arriba, siempre a la vista) y la etiqueta opcional
    ({ a }, bar, opt) => {
      if (a?.type !== 'dim') return;
      bar.rows.push(h('div', { class: 'pe-ctx-fields' }, dimValInput(a, opt.focus), dimUnitSelect(a), labelInput(a, false)));
    },
    // Color y grosor: los de la marca elegida (o el recorrido en curso) o, sin ella, los de las marcas nuevas
    ({ a, tool: t, draft: d }, bar) => {
      const m = d || a;
      if (t === 'sticker' || (!m && (t === 'select' || !handlers[t]))) return;
      const g = [colorBtn(m), weightBtn(m)];
      if (a?.type === 'dim') g.push(dimEndSelect(a));
      if (a?.type === 'route') g.push(iconBtn('dashed', 'Discontinua', 'Discontinua', { 'aria-pressed': String(!!a.dashed) }));
      bar.main.push(g);
    },
    // Pegatina elegida: tamaño, giro, espejo y propuesta
    ({ a }, bar) => {
      if (a?.type !== 'sticker') return;
      bar.main.push([
        iconBtn('stk-smaller', 'Más pequeño'), iconBtn('stk-bigger', 'Más grande'),
        iconBtn('stk-left', 'Girar a la izquierda'), iconBtn('stk-right', 'Girar a la derecha'), iconBtn('stk-flip', 'Espejo'),
        h('button', { type: 'button', class: 'pe-txt', 'data-act': 'stk-ghost', 'aria-pressed': String(!!a.ghost), title: 'Semitransparente con borde discontinuo: para indicar dónde IRÁ el equipo' }, 'Propuesta'),
      ]);
    },
    // Marca elegida: borrar y D-pad (mueve el punto activo o, sin él, la marca entera)
    ({ a }, bar) => {
      if (!a) return;
      bar.main.push([iconBtn('dup', 'Duplicar'), iconBtn('del', 'Borrar')]);
      bar.main.push(['left', 'up', 'down', 'right'].map((d) => {
        const b = h('button', { type: 'button', class: 'pe-btn', 'data-nudge': d, 'aria-label': NUDGE_LABEL[d], title: NUDGE_LABEL[d] }, ico('nudge-' + d));
        b.addEventListener('pointerleave', stopHold);
        return b;
      }));
    },
  ];
  function drawCtx(focus = false) {
    closePop(); stopHold();
    updateListBtn();
    const c = { a: draft ? null : sel(), tool, draft }, bar = { rows: [], main: [] };
    for (const section of CTX_SECTIONS) section(c, bar, { focus });
    const groups = bar.main.filter((g) => g.length).map((g) => h('div', { class: 'pe-cg' }, g));
    const row = groups.length ? h('div', { class: 'pe-ctx-main' }, groups) : null;
    ctxBar.replaceChildren(...bar.rows, ...(row ? [row] : []));
    if (row) { row.addEventListener('scroll', () => edgeFade(row), { passive: true }); requestAnimationFrame(() => edgeFade(row)); }
  }

  // Campo de texto de la marca (v2.8): un paso de deshacer por campo. Al crear la marca, con ratón se enfoca;
  // en táctil solo se resalta, para que el teclado no tape la foto.
  function labelInput(a, focus) {
    const ph = a.type === 'dim' ? PLACEHOLDER_DIM : PLACEHOLDER[a.type] || 'Texto';
    const inp = h('input', { type: 'text', class: 'pe-input pe-label', value: a.text || '', placeholder: ph, 'aria-label': ph, enterkeyhint: 'done', autocomplete: 'off' });
    inp.addEventListener('input', () => { if (!inp.dataset.snap) { snapshot(); inp.dataset.snap = '1'; } a.text = inp.value; requestRender(); });
    inp.addEventListener('focus', () => inp.classList.remove('pe-pulse'));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    return focusField(inp, focus);
  }
  // Al crear una marca: con ratón el campo se enfoca; en táctil solo se resalta
  function focusField(inp, focus) {
    if (focus) { if (inputType === 'mouse') setTimeout(() => inp.isConnected && inp.focus({ preventScroll: true }), 0); else inp.classList.add('pe-pulse'); }
    return inp;
  }
  // Medida de la cota, tal cual se escribe («2,40»): un paso de deshacer por campo. Al perder el foco, la coma pasa a punto
  // (al guardar se vuelve a normalizar: el botón Guardar puede no provocar el blur).
  function dimValInput(a, focus) {
    const ph = 'Medida (ej. 2,40)';
    const inp = h('input', { type: 'text', class: 'pe-input pe-dim-val', value: a.val || '', placeholder: ph, 'aria-label': ph, inputmode: 'decimal', enterkeyhint: 'done', autocomplete: 'off' });
    inp.addEventListener('input', () => { if (!inp.dataset.snap) { snapshot(); inp.dataset.snap = '1'; } a.val = inp.value; requestRender(); });
    inp.addEventListener('blur', () => { const v = normDecimal(inp.value, lang()); if (v !== inp.value) { inp.value = v; a.val = v; requestRender(); } });
    inp.addEventListener('focus', () => inp.classList.remove('pe-pulse'));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    return focusField(inp, focus);
  }
  // Desplegable de la cota (unidad o extremos): cambia la marca elegida y se recuerda para las nuevas.
  // Elegido con ratón o lápiz, suelta el foco: así una tecla después no cambia la opción (ni deja de ser un atajo).
  // Con el teclado se queda para seguir eligiendo. Con el dedo no hace falta (tocar la foto lo suelta) y en el iPhone
  // el change puede llegar con la rueda aún abierta.
  function dimSelect(cls, label, options, cur, onPick) {
    const sl = h('select', { class: `pe-select ${cls}`, 'aria-label': label, title: label }, options.map(([v, name]) => h('option', { value: v }, name)));
    sl.value = cur;
    let byPointer = false;
    sl.addEventListener('pointerdown', (e) => { byPointer = e.pointerType !== 'touch'; });
    sl.addEventListener('keydown', () => { byPointer = false; });
    sl.addEventListener('change', () => { onPick(sl.value); if (byPointer) { byPointer = false; sl.blur(); } });
    return sl;
  }
  const dimUnitSelect = (a) => dimSelect('pe-dim-unit', 'Unidad', DIM_UNITS.map((u) => [u, u]), a.unit || dimUnit, (v) => {
    snapshot(); a.unit = dimUnit = v; store.set('unit', v); requestRender();
  });
  const dimEndSelect = (a) => dimSelect('pe-dim-end', 'Extremos de la cota', DIM_ENDS, a.end || 'arrow', (v) => {
    snapshot(); a.end = dimEnd = v; store.set('end', v); requestRender();
  });
  // Medidas por tramo del recorrido: «20, 15, 5» → 20 m, 15 m, 5 m (v2.8)
  function lengthsInput(a) {
    const ph = 'Medidas por tramo: 20, 15, 5, 3';
    const inp = h('input', { type: 'text', class: 'pe-input pe-lengths', value: a.lengths || '', placeholder: ph, 'aria-label': ph, enterkeyhint: 'done', autocomplete: 'off' }); // teclado de texto: el decimal de iOS en inglés no trae la coma que separa tramos
    inp.addEventListener('input', () => { if (!inp.dataset.snap) { snapshot(); inp.dataset.snap = '1'; } a.lengths = inp.value; requestRender(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    return inp;
  }
  // Paleta de equipos: se hace una vez (conserva su desplazamiento) y se marca el elegido
  let pal = null;
  function palette() {
    if (!pal) {
      pal = h('div', { class: 'pe-stickers', role: 'group', 'aria-label': 'Equipos' }, STICKER_ORDER.map((k) => h('button', {
        type: 'button', class: 'stk', 'data-kind': k, 'aria-pressed': 'false', title: STICKERS[k].name, 'aria-label': STICKERS[k].name,
        onclick: () => { stKind = k; store.set('sticker', k); select(null); }, // el siguiente toque en la foto pone este equipo
      }, stickerThumb(k, 40), h('span', {}, STICKERS[k].name.replace('Starlink ', '')))));
      pal.addEventListener('scroll', () => edgeFade(pal), { passive: true });
    }
    for (const b of pal.children) b.setAttribute('aria-pressed', String(b.dataset.kind === stKind));
    requestAnimationFrame(() => { // el elegido, a la vista
      const b = pal.querySelector('[aria-pressed=true]');
      if (b && (b.offsetLeft < pal.scrollLeft || b.offsetLeft + b.offsetWidth > pal.scrollLeft + pal.clientWidth)) pal.scrollLeft = b.offsetLeft - (pal.clientWidth - b.offsetWidth) / 2;
      edgeFade(pal);
    });
    return pal;
  }
  // Color y grosor: botón con el valor actual que abre su menú
  function colorBtn(m) {
    const cur = m ? m.color || COLORS[0] : color;
    const b = h('button', { type: 'button', class: 'pe-btn pe-color', 'aria-label': 'Color', title: 'Color', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, h('span', { class: 'pe-swatch', style: { background: cur } }));
    b.addEventListener('click', () => togglePop(b, () => h('div', { class: 'pe-pop-row', role: 'group', 'aria-label': 'Color' }, COLORS.map((c) => h('button', {
      type: 'button', class: 'pe-btn pe-sw', 'data-color': c, 'aria-label': COLOR_NAMES[c], title: COLOR_NAMES[c], 'aria-pressed': String(c === cur), onclick: () => pickStyle({ color: c }),
    }, h('span', { class: 'pe-swatch', style: { background: c } }))))));
    return b;
  }
  function weightBtn(m) {
    const cur = m ? m.size ?? 2 : tool === 'dim' ? dimSize : size;
    const b = h('button', { type: 'button', class: 'pe-btn pe-weight', 'aria-label': 'Grosor', title: 'Grosor', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, weightIco(cur));
    b.addEventListener('click', () => togglePop(b, () => h('div', { class: 'pe-pop-row', role: 'group', 'aria-label': 'Grosor' }, SIZES.map(([n, name]) => h('button', {
      type: 'button', class: 'pe-txt pe-wt', 'data-size': String(n), 'aria-pressed': String(n === cur), onclick: () => pickStyle({ size: n }),
    }, weightIco(n), h('span', {}, name))))));
    return b;
  }
  // Color o grosor elegido: para la marca elegida (o el recorrido en curso) y para las nuevas
  function pickStyle(st) {
    const m = draft || sel();
    if (m) { if (m !== draft) snapshot(); Object.assign(m, st); }
    if ('color' in st) { color = st.color; store.set('color', color); }
    if ('size' in st) { // la cota tiene su propio grosor (Fino por defecto): no cambia el de las demás marcas
      if (m ? m.type === 'dim' : tool === 'dim') { dimSize = st.size; store.set('dimsize', dimSize); } else { size = st.size; store.set('size', size); }
    }
    drawCtx(); requestRender();
  }

  // Menú flotante (.pe-pop): encima de la barra contextual o, si no cabe, debajo de su botón (la barra
  // superior). Se cierra al elegir, al tocar fuera (si es en la foto, ese toque no dibuja) o con Esc.
  let pop = null;
  function openPop(anchor, content) {
    closePop();
    const el = h('div', { class: 'pe-pop' }, content);
    root.appendChild(el);
    const rr = root.getBoundingClientRect(), ar = anchor.getBoundingClientRect(), ref = (anchor.closest('.pe-ctx') || anchor).getBoundingClientRect();
    let y = ref.top - rr.top - el.offsetHeight - 8;
    if (y < 8) y = ar.bottom - rr.top + 8;
    el.style.left = `${clamp(ar.left - rr.left + ar.width / 2 - el.offsetWidth / 2, 8, rr.width - el.offsetWidth - 8)}px`;
    el.style.top = `${y}px`;
    anchor.setAttribute('aria-expanded', 'true');
    pop = { el, anchor };
  }
  function closePop() {
    if (!pop) return false;
    pop.el.remove(); pop.anchor.setAttribute('aria-expanded', 'false'); pop = null;
    return true;
  }
  const togglePop = (anchor, build) => { if (pop?.anchor === anchor) closePop(); else openPop(anchor, build()); };

  // Lista de marcas (.pe-list): la de encima primero. Fila: tipo y texto o medida; tocarla elige la marca (con Mover) y
  // la centra. A la derecha: ↑ la trae adelante, ↓ la envía atrás, duplicar y borrar. Se rehace en cuanto algo cambia.
  const TYPE_NAME = Object.fromEntries(TOOLS.map(([k, name]) => [k, name]));
  function markDetail(a) {
    if (a.type === 'dim') return [fmtDim(a.val, a.unit), a.text].filter(Boolean).join(' · ');
    if (a.type === 'number') return [a.n, a.text].filter(Boolean).join(' · ');
    if (a.type === 'sticker') return a.text || STICKERS[a.kind]?.name || '';
    return a.text || '';
  }
  function markCenter(a) {
    if (a.type === 'dim') return dimLine(a).mid;
    const b = bbox(a);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  function goToMark(a) {
    setTool('select');
    select(a.id);
    const c = markCenter(a);
    centerOn(c.x, c.y);
  }
  function listPanel() {
    const rows = [...annots].reverse().map((a, i, all) => {
      const tb = (act, label, icon, fn, disabled = false) => h('button', { type: 'button', class: 'pe-btn', 'data-lact': act, 'aria-label': label, title: label, disabled, onclick: () => listEdit(fn) }, ico(icon));
      const detail = markDetail(a), kindName = a.type === 'sticker' && !a.text; // sin etiqueta, el nombre del equipo (se traduce)
      return h('div', { class: 'pe-row', role: 'listitem', 'data-id': a.id, 'aria-current': a.id === selId ? 'true' : null },
        h('button', { type: 'button', class: 'pe-row-main', onclick: () => goToMark(a) },
          h('span', { class: 'pe-swatch', style: { background: a.color || COLORS[0] } }),
          // data-nt: lo que escribió el técnico (y la medida) no pasa por el diccionario de la interfaz: «Punto» no sale «Dot»
          h('span', { class: 'pe-row-text' }, h('b', {}, TYPE_NAME[a.type] || a.type), detail ? h('span', kindName ? {} : { 'data-nt': '' }, detail) : null)),
        tb('up', 'Traer adelante', 'up', () => reorder(a, 1), i === 0),
        tb('down', 'Enviar atrás', 'down', () => reorder(a, -1), i === all.length - 1),
        tb('dup', 'Duplicar', 'dup', () => duplicate(a)),
        tb('del', 'Borrar', 'del', () => deleteMark(a)));
    });
    return h('div', { class: 'pe-list', role: 'list', 'aria-label': 'Lista de marcas' }, rows);
  }
  // Cambia algo desde la lista y la rehace, con el mismo desplazamiento (las marcas elegidas cierran los menús)
  function listEdit(fn) {
    const top = pop?.el.querySelector('.pe-list')?.scrollTop || 0;
    fn();
    if (!annots.length) { closePop(); return; }
    openPop(btns.list, listPanel());
    pop.el.querySelector('.pe-list').scrollTop = top;
  }
  // Contador del botón de la lista (sin marcas, desactivado)
  function updateListBtn() {
    const n = annots.length;
    listBadge.textContent = n; listBadge.hidden = !n;
    btns.list.disabled = !n;
  }
  // Pie de foto: un campo en un menú; se devuelve en onSave junto a las marcas
  function captionPanel() {
    const ph = 'Pie de foto';
    const inp = h('input', { type: 'text', class: 'pe-input pe-cap', value: caption, placeholder: ph, 'aria-label': ph, enterkeyhint: 'done', autocomplete: 'off' });
    inp.addEventListener('input', () => { caption = inp.value; dirty = true; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closePop(); } });
    return h('div', { class: 'pe-cap-box' }, inp);
  }

  // D-pad: un toque mueve 1 px de pantalla; mantenerlo pulsado repite desde NUDGE_DELAY (el click que sigue no vuelve a mover).
  // Con el ratón, el primer paso va al pulsar. Con el dedo, al levantarlo y solo si fue un toque: si la fila se desliza
  // (pointercancel) o el dedo se mueve más de TAP_SLOP, no hay paso. Así deslizar la barra empezando sobre el D-pad no mueve la marca.
  let hold = null;
  function stopHold() { if (hold) { clearTimeout(hold.t); hold = null; } }
  ctxBar.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button[data-nudge]');
    if (!b || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopHold();
    const [dx, dy] = NUDGE_DIR[b.dataset.nudge], m = e.shiftKey ? 10 : 1;
    const hd = { id: e.pointerId, x: e.clientX, y: e.clientY, n: 0, finger: e.pointerType !== 'mouse' };
    hd.step = () => { hd.n++; nudge(dx * m, dy * m); };
    hd.t = setTimeout(function rep() { hd.step(); hd.t = setTimeout(rep, NUDGE_EVERY); }, NUDGE_DELAY);
    hold = hd;
    if (!hd.finger) hd.step();
  });
  ctxBar.addEventListener('pointermove', (e) => {
    if (hold?.id === e.pointerId && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > TAP_SLOP) stopHold();
  });
  ctxBar.addEventListener('pointerup', (e) => {
    if (hold?.id === e.pointerId && hold.finger && !hold.n) hold.step(); // toque con el dedo: el paso, al levantarlo
    stopHold();
  });
  ctxBar.addEventListener('pointercancel', stopHold);

  // =================================================================
  //  BARRAS: acciones, herramienta, preferencias, ayuda e interfaz
  // =================================================================
  // Cambio en la marca elegida con un paso de deshacer
  const editSel = (fn) => () => {
    const a = sel();
    if (!a) return;
    snapshot(); fn(a);
    if (a.type === 'sticker' && a.w) { stW = a.w; store.set('stw', stW); }
    drawCtx(); requestRender();
  };
  // Acciones de los botones data-act (también los de la barra contextual)
  const acts = {
    cancel: () => close(false),
    save: () => close(true),
    undo: () => doUndo(),
    redo: () => doRedo(),
    zoomin: () => zoomCenter(ZOOM_STEP),
    zoomout: () => zoomCenter(1 / ZOOM_STEP),
    fit: () => fitToScreen(),
    zoom100: () => zoom100(),
    help: () => showHint(HINT[tool]),
    hide: () => setUI(false),
    show: () => setUI(true),
    ...Object.fromEntries(PREFS.map(([k]) => [k, () => togglePref(k)])),
    del: () => deleteSel(),
    dup: () => { const a = sel(); if (a) duplicate(a); },
    list: () => togglePop(btns.list, listPanel),
    caption: () => {
      const opened = pop?.anchor !== btns.caption;
      togglePop(btns.caption, captionPanel);
      if (opened) pop?.el.querySelector('input')?.focus();
    },
    dashed: editSel((a) => { a.dashed = !a.dashed; }),
    'route-undo': () => popRoutePoint(),
    'route-done': () => finishRoute(true),
    palette: () => select(null), // con Equipo: vuelve a la paleta (el siguiente toque pone el equipo elegido)
    'stk-smaller': editSel((a) => { a.w = Math.max(0.04, (a.w || 0.26) / 1.15); }),
    'stk-bigger': editSel((a) => { a.w = Math.min(1.5, (a.w || 0.26) * 1.15); }),
    'stk-left': editSel((a) => { a.rot = (a.rot || 0) - Math.PI / 12; }),
    'stk-right': editSel((a) => { a.rot = (a.rot || 0) + Math.PI / 12; }),
    'stk-flip': editSel((a) => { a.flip = !a.flip; }),
    'stk-ghost': editSel((a) => { a.ghost = !a.ghost; }),
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) setTool(b.dataset.tool);
    else if (b.dataset.nudge) { if (!e.detail) { const [dx, dy] = NUDGE_DIR[b.dataset.nudge]; nudge(dx, dy); } } // solo el teclado (Intro, espacio): el puntero va aparte
    else acts[b.dataset.act]?.();
  });
  root.querySelectorAll('button[data-act]').forEach((b) => { if (!acts[b.dataset.act]) b.disabled = true; });

  function setTool(k) {
    if (!TOOLS.some(([t]) => t === k)) return;
    cancelOp();
    finishRoute(); // cambiar de herramienta termina el recorrido en curso (v2.8)
    tool = k; store.set('tool', k);
    if (k !== 'select' && !(k === 'sticker' && sel()?.type === 'sticker')) { selId = null; active = null; }
    updateTools(); updateCursor(); drawCtx(); requestRender();
    const n = store.get('hint-' + k, 0);
    if (n < HINT_TIMES) { store.set('hint-' + k, n + 1); showHint(HINT[k]); } else hideHint();
  }
  function updateTools() {
    for (const b of toolBox.children) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    // si el raíl se desplaza, la herramienta activa siempre a la vista
    const r = toolBox.getBoundingClientRect(), b = toolBox.querySelector('[aria-pressed=true]').getBoundingClientRect(), m = 40;
    toolBox.scrollBy({ left: b.left < r.left + m ? b.left - r.left - m : b.right > r.right - m ? b.right - r.right + m : 0, top: b.top < r.top + m ? b.top - r.top - m : b.bottom > r.bottom - m ? b.bottom - r.bottom + m : 0 });
  }
  // Fundido en el borde de un desplazable (raíl, franja lateral o fila de la barra contextual) por el que quedan más botones
  function edgeFade(el) {
    const v = el.scrollHeight > el.clientHeight + 1;
    const pos = v ? el.scrollTop : el.scrollLeft, max = v ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    el.classList.toggle('pe-fade-start', pos > 1);
    el.classList.toggle('pe-fade-end', pos < max - 1);
  }
  for (const el of [toolBox, sideBox]) el.addEventListener('scroll', () => edgeFade(el), { passive: true });
  function togglePref(k) {
    prefs[k] = !prefs[k]; store.set(k, prefs[k]);
    btns[k].setAttribute('aria-pressed', String(prefs[k]));
    const [, , on, off] = PREFS.find(([p]) => p === k);
    showHint(prefs[k] ? on : off, 2800);
  }
  function updateZoomBtns() {
    const max = !img || view.s >= maxScale(fitS) * (1 - 1e-9);
    if (btns.zoomin.disabled !== max) btns.zoomin.disabled = max;
    for (const a of ['zoomout', 'fit']) if (btns[a].disabled !== fitted) btns[a].disabled = fitted;
    const at100 = !img || Math.abs(view.s - clampS(1)) < 1e-9; // ya al 100 % (o lo más cerca que permiten los límites)
    if (btns.zoom100.disabled !== at100) btns.zoom100.disabled = at100;
  }
  // Deshacer también quita puntos del recorrido en curso
  function updateHistoryBtns() { updateListBtn(); btns.undo.disabled = !undoStack.length && !draft?.pts.length; btns.redo.disabled = !redoStack.length; }

  // Aviso flotante (.pe-toast): ayuda de la herramienta y avisos breves. No tapa la foto para el dedo:
  // se cierra solo o al tocar la foto (o el minimapa).
  let hintTimer = 0;
  function showHint(text, ms) {
    if (!text) return hideHint();
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, ms ?? clamp(text.length * 60, 3500, 9000));
  }
  function hideHint() { clearTimeout(hintTimer); toast.hidden = true; }
  // Lectura flotante (.pe-readout): «∠ 12.4° · 356 px» al dibujar o ajustar líneas
  function setReadout(text) { readout.textContent = text || ''; readout.hidden = !text; }

  // Ocultar o mostrar la interfaz: sin barras, la foto ajustada aprovecha toda la pantalla
  function setUI(on) {
    uiOff = !on;
    root.classList.toggle('pe-ui-off', uiOff);
    showBtn.hidden = on;
    if (uiOff) { hideHint(); closePop(); }
    layout();
  }

  // =================================================================
  //  DESHACER / REHACER
  // =================================================================
  // commit(antes): guarda en el historial el estado anterior a un cambio ya hecho. Las operaciones de puntero
  // lo toman al empezar y lo confirman al soltar (cancelarlas no deja rastro). snapshot() = commit(ahora).
  function commit(before) {
    undoStack.push(before);
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0; dirty = true; nudgeRun = null;
    updateHistoryBtns();
  }
  function snapshot() { commit(JSON.stringify(annots)); }
  function doUndo() {
    cancelOp();
    if (draft) { popRoutePoint(); return; }
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(annots)); annots = JSON.parse(undoStack.pop());
    afterHistory();
  }
  function doRedo() {
    cancelOp();
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(annots)); annots = JSON.parse(redoStack.pop());
    afterHistory();
  }
  function afterHistory() {
    if (!sel()) { selId = null; active = null; }
    nudgeRun = null;
    updateHistoryBtns(); drawCtx(); requestRender();
  }

  // =================================================================
  //  GUARDAR Y CANCELAR
  // =================================================================
  function close(save) {
    if (closed) return;
    const tap = lastTap && Date.now() - lastTap.t < 700 ? lastTap : null; // ¿se cierra por un toque?
    cancelOp(); stopHold(); closePop();
    finishRoute(); // el recorrido en curso cuenta (v2.8)
    if (!save && dirty && !confirm('¿Descartar los cambios en la foto?')) return;
    closed = true;
    hideHint();
    cancelAnimationFrame(frame); frame = 0;
    ro.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    root.remove();
    if (tap) guardGhostClick(tap);
    document.body.style.overflow = prevOverflow;
    freeMemory();
    if (save) {
      for (const a of annots) if (a.type === 'dim' && a.val != null) a.val = normDecimal(String(a.val), lang()); // Guardar puede no provocar el blur
      onSave(annots, caption);
    }
  }

  // Suelta la memoria al cerrar (en iOS, con fotos de 2560 px, lo retenido se acumula entre fotos): lienzos a 0 × 0,
  // la foto decodificada y los ganchos de prueba de window, que retienen todo el cierre (foto incluida).
  function freeMemory() {
    for (const c of [canvas, loupe, mini, miniThumb]) if (c) c.width = c.height = 0;
    miniThumb = null;
    if (img) { img.src = ''; img = null; }
    for (const [k, f] of Object.entries(testHooks)) if (window[k] === f) delete window[k];
  }

  // =================================================================
  //  ARRANQUE
  // =================================================================
  const ro = new ResizeObserver(() => layout());
  [stage, topBar, rail, sideBar].forEach((el) => ro.observe(el));
  for (const [k] of PREFS) btns[k].setAttribute('aria-pressed', String(prefs[k]));
  updateHistoryBtns(); updateZoomBtns(); updateCursor();
  setTool(tool);
  loadImage(photo.dataUrl).then(async (im) => {
    try { await im.decode(); } catch { /* se decodifica al pintar */ }
    if (closed) { im.src = ''; return; }
    img = im; iw = im.naturalWidth; ih = im.naturalHeight;
    layout();
  }, () => showHint('No se pudo abrir la foto'));

  // Ganchos para pruebas automáticas (se quitan al cerrar: ver freeMemory)
  const testHooks = {
    __peAnnots: () => annots,
    __peView: () => ({ ...view, fitS }),
    __peHandles: () => { const a = sel(); return a ? handles(a).map((q) => ({ k: q.k, ...toScreen(view, q.x, q.y) })) : []; },
  };
  Object.assign(window, testHooks);
  return { close, get annots() { return annots; } };
}
