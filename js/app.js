import { h, $, toast } from './ui.js';
import { api, setToken, getToken } from './api.js';
import { state, bootstrap, sync, pendingCount } from './store.js';
import { API_URL, APP_VERSION } from './config.js';
import { listView } from './views/list.js';
import { editorView } from './views/editor.js';
import { usersView, catalogView, companyView } from './views/admin.js';

const root = () => $('#app');

// ---------------------------------------------------------------------
// Barra superior + indicador de sincronización
// ---------------------------------------------------------------------
function topbar() {
  const admin = state.user?.role === 'admin';
  const link = (href, label) => h('a', { href, class: location.hash === href || (href === '#/' && (location.hash === '' || location.hash === '#/')) ? 'active' : '' }, label);
  return h('header', { class: 'topbar' },
    h('a', { href: '#/', class: 'brand' }, state.logo ? h('img', { src: state.logo, alt: '' }) : null, h('span', {}, 'Field Reports')),
    h('nav', {}, link('#/', 'Informes'), admin ? [link('#/admin/users', 'Usuarios'), link('#/admin/catalog', 'Catálogo'), link('#/admin/company', 'Empresa')] : null),
    h('span', { id: 'sync-pill', class: 'pill' }),
    h('button', { class: 'btn small ghost', title: state.user?.name, onclick: logout }, 'Salir'));
}

async function updatePill(detail) {
  const el = $('#sync-pill');
  if (!el) return;
  const pend = detail?.pending || await pendingCount();
  if (!navigator.onLine) { el.className = 'pill bad'; el.textContent = pend.total ? `Sin conexión · ${pend.total} pendiente(s)` : 'Sin conexión'; }
  else if (state.syncing) { el.className = 'pill warn'; el.textContent = 'Sincronizando…'; }
  else if (pend.total) { el.className = 'pill warn'; el.textContent = `${pend.total} pendiente(s)`; el.title = state.lastError || ''; }
  else { el.className = 'pill ok'; el.textContent = '✓ Al día'; }
}
window.addEventListener('sync', (e) => updatePill(e.detail));
window.addEventListener('online', () => updatePill());
window.addEventListener('report-state', () => updatePill());
window.addEventListener('offline', () => updatePill());

// ---------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------
function loginView() {
  const user = h('input', { autocomplete: 'username', autocapitalize: 'none', required: true });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const err = h('div', { class: 'error', hidden: true });
  const btn = h('button', { class: 'btn primary full-w mt' }, 'Entrar');
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      const r = await api('login', { username: user.value, password: pw.value }, { timeout: 120000 });
      setToken(r.token);
      if (r.mustChange) return render(changePasswordView(pw.value));
      await start();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    btn.disabled = false; btn.textContent = 'Entrar';
  } },
  h('h2', {}, 'Field Reports'), h('p', { class: 'muted' }, 'Surveys e informes de instalación Starlink / Peplink'),
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
      setToken(r.token); toast('Contraseña cambiada'); await start();
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

async function start() {
  try {
    await bootstrap();
  } catch (e) {
    if (e.code === 'must_change') return render(changePasswordView());
    if (e.code === 'auth') return render(loginView());
    render(h('div', { class: 'page' }, h('div', { class: 'error' }, 'No se pudo arrancar: ', e.message)));
    return;
  }
  window.onhashchange = () => route();
  await route();
  sync();
}

window.addEventListener('auth-expired', () => { state.user = null; render(loginView()); toast('Sesión caducada: vuelve a entrar'); });
window.addEventListener('must-change', () => render(changePasswordView()));

// Arranque
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (API_URL.includes('PEGA_AQUI')) {
  render(h('div', { class: 'page' }, h('div', { class: 'error' }, 'Falta configurar la URL de Apps Script en js/config.js (ver guía, paso 4).')));
} else if (getToken()) start(); else render(loginView());
