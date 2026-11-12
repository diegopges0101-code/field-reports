// =====================================================================
//  Idiomas de la app: inglés (por defecto), español y portugués.
//  El código está escrito en español; este módulo traduce lo que se muestra
//  (textos, ayudas, avisos y errores del servidor) con el diccionario de
//  i18n-dict.js. Los INFORMES (PDF, correo, WhatsApp) salen siempre en inglés.
//  Para añadir un idioma: una columna más en i18n-dict.js y una entrada en LANGS.
// =====================================================================
import { DICT } from './i18n-dict.js';
import { OPT } from './templates.js';

export const LANGS = {
  en: { name: 'English', short: 'EN', locale: 'en-GB', speech: 'en-US' },
  es: { name: 'Español', short: 'ES', locale: 'es-ES', speech: 'es-ES' },
  pt: { name: 'Português', short: 'PT', locale: 'pt-PT', speech: /^pt-BR/i.test(globalThis.navigator?.language || '') ? 'pt-BR' : 'pt-PT' },
};
const COL = { en: 1, pt: 2 };

let cur = 'en';
try { const s = localStorage.getItem('fr_lang'); if (LANGS[s]) cur = s; } catch { /* inglés */ }

export const lang = () => cur;
export const locale = () => LANGS[cur].locale;
export const speechLang = () => LANGS[cur].speech;
export function setLang(l) {
  if (!LANGS[l] || l === cur) return;
  try { localStorage.setItem('fr_lang', l); } catch { /* */ }
  location.reload();
}

/** ¿Hay que traducir al inglés lo que se escribe en este informe? Solo si se escribió en otro idioma. */
export const needsTranslation = (report) => (report?.data?.input_lang ?? 'es') !== 'en';

// ---------- diccionario ----------
const exact = new Map();
const patterns = [];
function build() {
  exact.clear(); patterns.length = 0;
  if (cur === 'es') return;
  const col = COL[cur];
  // Opciones de las listas: en inglés se muestra el mismo texto que saldrá en el informe
  if (cur === 'en') Object.values(OPT).forEach((list) => list.forEach((o) => { if (o.es && o.v && !exact.has(o.es)) exact.set(o.es, o.v); }));
  for (const row of DICT) {
    const es = row[0], t = row[col];
    if (t == null) continue;
    if (/\{\d\}/.test(es)) {
      const src = es.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d\}/g, '([\\s\\S]*?)');
      const order = [...es.matchAll(/\{(\d)\}/g)].map((m) => +m[1]);
      patterns.push({ re: new RegExp('^' + src + '$'), t, order, w: es.replace(/\{\d\}/g, '').length });
    } else exact.set(es, t);
  }
  patterns.sort((a, b) => b.w - a.w);
}
build();

const cache = new Map();
/** Traduce un texto de la interfaz (si no está en el diccionario, lo deja igual). */
export function tr(s, depth = 0) {
  if (cur === 'es' || typeof s !== 'string' || !s) return s;
  if (cache.has(s)) return cache.get(s);
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = m[2];
  let out = null;
  if (core) {
    if (exact.has(core)) out = exact.get(core);
    else if (depth < 2 && /[a-záéíóúñ]/i.test(core)) {
      for (const p of patterns) {
        const mm = core.match(p.re);
        if (!mm) continue;
        const vals = {}; p.order.forEach((n, i) => { vals[n] = tr(mm[i + 1], depth + 1); });
        out = p.t.replace(/\{(\d)\}/g, (_, n) => vals[n] ?? '');
        break;
      }
      // "A · B · C": cada parte por separado (títulos y líneas de detalle)
      if (out == null && core.includes(' · ')) {
        const parts = core.split(' · '); const tp = parts.map((x) => tr(x, depth + 1));
        if (tp.some((x, i) => x !== parts[i])) out = tp.join(' · ');
      }
    }
  }
  const res = out == null ? s : m[1] + out + m[3];
  if (cache.size < 5000) cache.set(s, res);
  return res;
}

// ---------- traducción automática de lo que se pinta en pantalla ----------
const ATTRS = ['placeholder', 'title', 'aria-label'];
const SKIP = 'textarea, pre, script, style, .orig, .pw-box, [data-nt]';
const done = new WeakMap();

function textNode(n) {
  const v = n.nodeValue;
  if (!v || done.get(n) === v || !/\S/.test(v)) return;
  const p = n.parentElement;
  if (!p || p.closest(SKIP)) return;
  const t = tr(v);
  if (t !== v) { done.set(n, t); n.nodeValue = t; } else done.set(n, v);
}
function element(el) {
  if (el.nodeType !== 1) return;
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
  }
}
function walk(root) {
  if (root.nodeType === 3) return textNode(root);
  if (root.nodeType !== 1) return;
  element(root);
  root.querySelectorAll('[placeholder], [title], [aria-label]').forEach(element);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) textNode(n);
}

/** Arranca la traducción de la pantalla. Se llama una vez al iniciar la app. */
export function initI18n() {
  document.documentElement.lang = cur;
  if (cur === 'es') return;
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') element(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const nativeConfirm = window.confirm.bind(window);
  window.confirm = (msg) => nativeConfirm(tr(String(msg)));
}
