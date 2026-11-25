import { locale } from './i18n.js';
import { icon } from './svg.js';
// Pequeñas utilidades de interfaz (sin frameworks)
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'multiple' || k === 'selected') el[k] = !!v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);

let toastTimer;
export function toast(msg, ms = 3500) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast' }); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Ventana modal. Devuelve { el, close }. */
export function modal(title, body, actions = []) {
  const back = h('div', { class: 'modal-back' });
  const close = () => back.remove();
  const box = h('div', { class: 'modal' },
    h('div', { class: 'modal-head' }, h('strong', {}, title), h('button', { class: 'btn small ghost-dark', onclick: close, 'aria-label': 'Cerrar' }, icon('x', { size: 18 }))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-foot' }, actions) : null);
  back.appendChild(box);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.appendChild(back);
  return { el: box, close };
}

export function confirmBox(text, okText = 'Aceptar') {
  return new Promise((res) => {
    const m = modal('Confirmar', h('p', {}, text), [
      h('button', { class: 'btn', onclick: () => { m.close(); res(false); } }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: () => { m.close(); res(true); } }, okText),
    ]);
  });
}

/**
 * Confirmación de eliminación con contexto (Requerimiento 01, mejora 4).
 * info = { report, section, equipment, equipmentLabel, field, value, consequence, dependents: [texto…] }
 * Muestra exactamente qué se elimina y solo resuelve true con «Confirmar eliminación».
 * Cerrar con la X, Esc o fuera de la ventana equivale a «Cancelar».
 */
export function confirmDelete(info = {}) {
  return new Promise((res) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; window.removeEventListener('keydown', onKey, true); m.close(); res(ok); };
    // El «Valor» es lo que escribió el usuario: no pasa por el diccionario de la interfaz (data-nt)
    const row = (label, value, raw = false) => (value == null || String(value).trim() === '' ? null
      : h('div', { class: 'del-row' }, h('span', { class: 'del-k' }, label), h('span', { class: 'del-v', 'data-nt': raw ? '' : null }, String(value))));
    const deps = (info.dependents || []).filter(Boolean);
    const body = h('div', { class: 'del-box' },
      h('div', { class: 'del-rows' },
        row('Informe', info.report), row('Sección', info.section), row(info.equipmentLabel || 'Equipo', info.equipment),
        row('Campo', info.field), row('Valor', info.value, true)),
      deps.length ? h('div', { class: 'del-deps' }, h('strong', {}, 'También se eliminará:'), h('ul', {}, deps.map((d) => h('li', {}, d)))) : null,
      h('p', { class: 'del-cons' }, h('strong', {}, 'Consecuencia: '), info.consequence || 'el elemento se eliminará del informe.'),
      h('p', { class: 'del-q' }, '¿Desea continuar?'));
    const cancel = h('button', { type: 'button', class: 'btn', onclick: () => finish(false) }, 'Cancelar');
    const ok = h('button', { type: 'button', class: 'btn danger', onclick: () => finish(true) }, 'Confirmar eliminación');
    const m = modal('Confirmar eliminación', body, [cancel, ok]);
    m.el.parentElement.classList.add('modal-del');
    // cerrar con la X o fuera de la ventana = cancelar
    m.el.parentElement.addEventListener('click', (e) => { if (e.target === m.el.parentElement) finish(false); });
    m.el.querySelector('.modal-head button')?.addEventListener('click', () => finish(false));
    // El editor de fotos escucha el teclado en window: el aviso se queda con Esc / Intro mientras está abierto
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
      else if (e.key === 'Enter' && document.activeElement === ok) { e.preventDefault(); e.stopImmediatePropagation(); finish(true); }
      else if (!m.el.contains(e.target)) e.stopImmediatePropagation();
    }
    window.addEventListener('keydown', onKey, true);
    setTimeout(() => cancel.focus(), 30); // el foco empieza en «Cancelar»: Intro no borra por accidente
  });
}

export function promptBox(title, label, value = '') {
  return new Promise((res) => {
    const inp = h('textarea', { rows: 3 }, value);
    const m = modal(title, h('div', {}, h('label', { class: 'label' }, label), inp), [
      h('button', { class: 'btn', onclick: () => { m.close(); res(null); } }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: () => { m.close(); res(inp.value); } }, 'Aceptar'),
    ]);
    setTimeout(() => inp.focus(), 50);
  });
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, text);
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* */ }
    ta.remove(); return ok;
  }
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export function blobToDataUrl(b) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}
export function dataUrlToBase64(d) { return String(d).split(',')[1] || ''; }
export function dataUrlToBytes(d) {
  const bin = atob(dataUrlToBase64(d));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export async function blobToBase64(b) { return dataUrlToBase64(await blobToDataUrl(b)); }

/** Reduce una foto a máx. 2560 px en JPEG (la nitidez que necesitan las cotas y marcas; subidas en bloques pequeños). */
export async function compressImage(file, maxSide = 2560, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', quality);
    c.width = c.height = 0; // suelta ya los ~20 MB del lienzo (iOS tarda en liberarlos y se acumulan foto a foto)
    return out;
  } finally { URL.revokeObjectURL(url); }
}
