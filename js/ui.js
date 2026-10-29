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
    h('div', { class: 'modal-head' }, h('strong', {}, title), h('button', { class: 'btn small ghost-dark', onclick: close, 'aria-label': 'Cerrar' }, '✕')),
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
  return isNaN(d) ? iso : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
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

/** Reduce una foto a máx. 1600 px en JPEG (subidas rápidas con 4G). */
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally { URL.revokeObjectURL(url); }
}
