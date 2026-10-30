import { h, $, toast } from './ui.js';
import { api, setToken, getToken } from './api.js';
import { state, bootstrap, sync, pendingCount, applyBootData } from './store.js';
import { kv } from './db.js';
import { applyCachedIcons, applyLogoIcons, cachedLogo } from './icons.js';
import { API_URL, APP_VERSION } from './config.js';
import { listView, defaultList } from './views/list.js';
import { editorView } from './views/editor.js';
import { usersView, catalogView, companyView } from './views/admin.js';

const root = () => $('#app');

// ---------------------------------------------------------------------
// Barra superior + indicador de sincronización
// ---------------------------------------------------------------------
function navLinks() {
  const admin = state.user?.role === 'admin';
  const cur = location.hash.split('?')[0] || '#/';
  const link = (href, label) => h('a', { href, class: cur === href || (href === '#/' && (cur === '' || cur === '#/' || cur.startsWith('#/r/'))) ? 'active' : '' }, label);
  return [link('#/', 'Informes'), admin ? [link('#/admin/users', 'Usuarios'), link('#/admin/catalog', 'Catálogo'), link('#/admin/company', 'Empresa')] : null];
}

function openMenu() {
  const close = () => { back.remove(); menu.remove(); };
  const back = h('div', { class: 'menu-back', onclick: close });
  const menu = h('div', { class: 'menu', onclick: (e) => { if (e.target.tagName === 'A') close(); } },
    h('div', { class: 'who' }, state.user?.name, h('br'), h('span', { class: 'tiny' }, { admin: 'Administrador', supervisor: 'Supervisor', technician: 'Técnico' }[state.user?.role] || '')),
    navLinks(),
    h('button', { onclick: () => { close(); sync(); toast('Sincronizando…'); } }, '↻ Sincronizar ahora'),
    h('button', { onclick: () => { close(); logout(); } }, 'Salir'),
    h('div', { class: 'who tiny', style: { borderBottom: 0, borderTop: '1px solid #eef0f3', marginTop: '4px' } }, `v${APP_VERSION}`));
  document.body.append(back, menu);
}

function topbar() {
  return h('header', { class: 'topbar' },
    h('a', { href: '#/', class: 'brand' }, state.logo ? h('img', { src: state.logo, alt: '' }) : null, h('span', {}, 'Field Reports')),
    h('nav', { class: 'topnav' }, navLinks()),
    h('span', { id: 'sync-pill', class: 'pill' }),
    h('button', { class: 'menu-btn', 'aria-label': 'Menú', onclick: openMenu }, '☰'));
}

async function updatePill(detail) {
  const el = $('#sync-pill');
  if (!el) return;
  const pend = detail?.pending || await pendingCount();
  if (!navigator.onLine) { el.className = 'pill bad'; el.textContent = pend.total ? `Sin red · ${pend.total}` : 'Sin red'; el.title = 'Sin conexión: se guarda en este dispositivo'; }
  else if (state.syncing) { el.className = 'pill warn'; el.textContent = 'Subiendo…'; }
  else if (pend.total) { el.className = 'pill warn'; el.textContent = `${pend.total} por subir`; el.title = state.lastError || ''; }
  else { el.className = 'pill ok'; el.textContent = 'Al día'; }
}
window.addEventListener('sync', (e) => updatePill(e.detail));
window.addEventListener('online', () => updatePill());
window.addEventListener('report-state', () => updatePill());
window.addEventListener('offline', () => updatePill());

// ---------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------
/** Tras entrar: los datos y la lista ya vienen en la respuesta del login → se muestra la app sin esperar más. */
async function afterLogin(r) {
  setToken(r.token);
  if (r.boot) {
    await applyBootData(r.boot);
    await kv.set(defaultList(r.boot.user).key, { rows: r.list || [], at: Date.now() });
    await start();
  } else await start({ fresh: true });
}

function loginView() {
  // Despierta el servidor de Google mientras se escribe la contraseña (evita el "arranque en frío")
  api('ping', {}, { timeout: 30000 }).catch(() => {});
  const user = h('input', { autocomplete: 'username', autocapitalize: 'none', required: true });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const err = h('div', { class: 'error', hidden: true });
  const btn = h('button', { class: 'btn primary full-w mt' }, 'Entrar');
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      const r = await api('login', { username: user.value, password: pw.value }, { timeout: 120000 });
      if (r.mustChange) { setToken(r.token); return render(changePasswordView(pw.value)); }
      await afterLogin(r);
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    btn.disabled = false; btn.textContent = 'Entrar';
  } },
  cachedLogo() ? h('img', { class: 'login-logo', src: cachedLogo(), alt: '' }) : null,
  h('h2', { style: { textAlign: 'center' } }, 'Field Reports'), h('p', { class: 'muted', style: { textAlign: 'center' } }, 'Surveys e informes de instalación Starlink / Peplink'),
  h('label', { class: 'label' }, 'Usuario o email'), user,
  h('label', { class: 'label mt' }, 'Contraseña'), pw, err, btn,
  h('p', { class: 'muted small mt' }, '¿Sin cuenta o contraseña olvidada? Pídesela al administrador.'),
  h('p', { class: 'muted tiny' }, `v${APP_VERSION}`));
  return h('div', { class: 'login' }, form);
}

function changePasswordView(oldPw = '') {
  const old = h('input', { type: 'password', value: oldPw, autocomplete: 'current-password' });
  const n1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8 });
  const n2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const err = h('div', { class: 'error', hidden: true });
  return h('div', { class: 'login' }, h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    if (n1.value !== n2.value) { err.textContent = 'Las contraseñas no coinciden'; err.hidden = false; return; }
    try {
      const r = await api('changePassword', { oldPassword: old.value, newPassword: n1.value }, { timeout: 120000 });
      toast('Contraseña cambiada'); await afterLogin(r);
    } catch (ex) {
      err.textContent = ex.code === 'offline'
        ? 'El servidor no respondió a tiempo. Puede que el cambio SÍ se haya guardado: pulsa "Salir" y entra con la contraseña NUEVA; si no funciona, con la antigua.'
        : ex.message;
      err.hidden = false;
    }
  } },
  h('h2', {}, 'Elige tu contraseña'), h('p', { class: 'muted' }, 'Es obligatorio cambiar la contraseña provisional (mínimo 8 caracteres).'),
  h('label', { class: 'label' }, 'Contraseña actual'), old,
  h('label', { class: 'label mt' }, 'Nueva contraseña'), n1,
  h('label', { class: 'label mt' }, 'Repite la nueva contraseña'), n2, err,
  h('button', { class: 'btn primary full-w mt' }, 'Guardar'),
  h('button', { type: 'button', class: 'btn full-w mt', onclick: () => { setToken(''); render(loginView()); } }, 'Salir y volver a entrar')));
}

async function logout() {
  const pend = await pendingCount();
  if (pend.total && !confirm(`Hay ${pend.total} cambio(s) sin subir. Si sales ahora se quedarán en este dispositivo y se subirán la próxima vez que entres. ¿Salir?`)) return;
  setToken(''); state.user = null; location.hash = '#/'; render(loginView());
}

// ---------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------
function render(view) {
  const r = root(); r.innerHTML = ''; r.appendChild(view);
}

async function route() {
  if (!state.user) return;
  const hash = location.hash || '#/';
  const page = h('main', { class: 'page' });
  render(h('div', {}, topbar(), page));
  updatePill();
  try {
    let m;
    if ((m = hash.match(/^#\/r\/([^?]+)(?:\?step=(\d+))?/))) await editorView(page, decodeURIComponent(m[1]), Number(m[2] || 0));
    else if (hash === '#/admin/users') await usersView(page);
    else if (hash === '#/admin/catalog') await catalogView(page);
    else if (hash === '#/admin/company') await companyView(page);
    else await listView(page);
  } catch (e) {
    page.appendChild(h('div', { class: 'error' }, e.message));
  }
}

async function start({ fresh = false } = {}) {
  try {
    await bootstrap({ cachedFirst: !fresh });
  } catch (e) {
    if (e.code === 'must_change') return render(changePasswordView());
    if (e.code === 'auth') return render(loginView());
    render(h('div', { class: 'page' }, h('div', { class: 'error' }, 'No se pudo arrancar: ', e.message)));
    return;
  }
  window.onhashchange = () => route();
  applyLogoIcons(state.logo);
  await route();
  sync();
}

window.addEventListener('auth-expired', () => { state.user = null; render(loginView()); toast('Sesión caducada: vuelve a entrar'); });
window.addEventListener('must-change', () => render(changePasswordView()));
window.addEventListener('boot-refreshed', () => { const b = $('.topbar'); if (b && state.user) b.replaceWith(topbar()); updatePill(); applyLogoIcons(state.logo); });

// Arranque
applyCachedIcons();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // Versión nueva publicada: se aplica sola si no estás escribiendo un informe
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (!location.hash.startsWith('#/r/')) location.reload();
    else toast('Hay una versión nueva de la app: se aplicará al volver a la lista', 6000);
  });
}
if (API_URL.includes('PEGA_AQUI')) {
  render(h('div', { class: 'page' }, h('div', { class: 'error' }, 'Falta configurar la URL de Apps Script en js/config.js (ver guía, paso 4).')));
} else if (getToken()) start(); else render(loginView());
