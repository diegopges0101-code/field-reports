import { h, toast, modal, confirmBox, fmtDateTime, copyText, compressImage, downloadBlob } from '../ui.js';
import { api } from '../api.js';
import { state, bootstrap } from '../store.js';
import { iconsZip, iconPreview, iconMode, setIconMode, applyLogoIcons } from '../icons.js';
import { icon } from '../svg.js';

const ROLE = { admin: 'Administrador', supervisor: 'Supervisor', technician: 'Técnico' };

// ---------------------------------------------------------------------
// Piezas comunes de las pantallas de administración
// ---------------------------------------------------------------------
const pageHead = (title, sub, action) => h('div', { class: 'ad-head' },
  h('div', { class: 'grow' }, h('h2', {}, title), sub ? h('p', { class: 'muted' }, sub) : null), action || null);

const fieldBox = (label, control, { full = false, help = '' } = {}) => h('div', { class: `field ${full ? 'full' : 'half'}` },
  h('label', { class: 'label' }, label), control, help ? h('div', { class: 'help' }, help) : null);

/** Interruptor (sí / no) */
function toggle(on, onChange, { label = '', disabled = false } = {}) {
  const inp = h('input', { type: 'checkbox', role: 'switch', checked: on, disabled, onchange: (e) => onChange(e.target.checked, e.target) });
  return h('label', { class: `switch ${disabled ? 'dis' : ''}` }, inp, h('span', { class: 'track' }, h('span', { class: 'thumb' })), label ? h('span', { class: 'sw-label' }, label) : null);
}

/** Bloque desplegable ("＋ Nuevo …") */
function collapsible(title, body, open = false) {
  const box = h('div', { class: `card ad-collapse ${open ? 'open' : ''}` });
  const head = h('button', { type: 'button', class: 'ad-collapse-head', onclick: () => box.classList.toggle('open') },
    h('span', { class: 'ad-plus' }, icon('plus', { size: 18 })), h('span', { class: 'grow' }, title), icon('back', { size: 16, cls: 'chev' }));
  box.append(head, h('div', { class: 'ad-collapse-body' }, body));
  return box;
}

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function showPassword(name, pw) {
  modal('Contraseña provisional', h('div', { class: 'stack' },
    h('p', {}, `Pásale a ${name} estos datos. Al entrar tendrá que cambiar la contraseña.`),
    h('div', { class: 'pw-box' }, pw),
    h('button', { class: 'btn primary', onclick: async () => { await copyText(pw); toast('Copiada'); } }, icon('copy'), 'Copiar contraseña'),
    h('p', { class: 'muted small' }, 'No se volverá a mostrar.')));
}

// =====================================================================
// USUARIOS
// =====================================================================
export async function usersView(page) {
  const list = h('div', { class: 'ad-list' }, [1, 2, 3].map(() => h('div', { class: 'skel', style: { height: '132px' } })));
  const count = h('span', { class: 'badge' }, '…');
  const f = {
    username: h('input', { required: true, autocapitalize: 'none', autocomplete: 'off', placeholder: 'ej. jose' }),
    name: h('input', { required: true, placeholder: 'ej. José García' }),
    email: h('input', { type: 'email', placeholder: 'opcional' }),
    job_title: h('input', { placeholder: 'ej. Field Technician' }),
    role: h('select', {}, Object.entries(ROLE).map(([k, v]) => h('option', { value: k, selected: k === 'technician' }, v))),
  };
  const form = h('form', { class: 'form-grid', onsubmit: async (e) => {
    e.preventDefault();
    const btn = e.submitter || form.querySelector('button'); btn.disabled = true;
    try {
      const res = await api('createUser', { user: Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()])) });
      showPassword(f.name.value, res.password);
      Object.values(f).forEach((el) => { if (el.tagName === 'INPUT') el.value = ''; });
      add.classList.remove('open');
      load(); bootstrap();
    } catch (ex) { toast(ex.message); }
    btn.disabled = false;
  } },
  fieldBox('Usuario (para entrar)', f.username),
  fieldBox('Nombre completo', f.name, { help: 'Sale en los informes' }),
  fieldBox('Email', f.email, { help: 'También sirve para entrar' }),
  fieldBox('Cargo', f.job_title, { help: 'Firma del correo' }),
  fieldBox('Rol', f.role),
  h('div', { class: 'full' }, h('button', { class: 'btn primary' }, icon('plus'), 'Crear usuario y generar contraseña')));
  const add = collapsible('Nuevo usuario', form);

  page.append(pageHead('Usuarios', 'Quién puede entrar en la app y qué puede hacer.', count), add, list);

  async function load() {
    let users;
    try { users = await api('listUsers'); } catch (e) { list.replaceChildren(h('div', { class: 'error' }, e.message)); return; }
    count.textContent = `${users.filter((u) => u.active).length} activos`;
    list.replaceChildren(...users.map(userCard));
  }

  function userCard(u) {
    const me = u.id === state.user.id;
    const upd = async (patch, msg = 'Guardado') => { try { await api('updateUser', { id: u.id, patch }); toast(msg); load(); bootstrap(); } catch (e) { toast(e.message); load(); } };
    return h('div', { class: `card ad-user ${u.active ? '' : 'off'}` },
      h('div', { class: 'ad-user-top' },
        h('div', { class: 'avatar' }, initials(u.name)),
        h('div', { class: 'grow ad-user-id' },
          h('div', { class: 'ad-name' }, h('strong', {}, u.name),
            me ? h('span', { class: 'badge' }, 'Tú') : null,
            !u.active ? h('span', { class: 'badge bad' }, 'Inactivo') : null,
            u.must_change ? h('span', { class: 'badge warn' }, 'Contraseña provisional') : null),
          h('div', { class: 'muted small ellip' }, [u.username, u.email].filter(Boolean).join(' · ')),
          h('div', { class: 'muted tiny' }, `Último acceso: ${fmtDateTime(u.last_login) || 'nunca'}`)),
        me ? null : toggle(u.active, (on) => upd({ active: on }, on ? 'Usuario activado' : 'Usuario desactivado'), { label: u.active ? 'Activo' : 'Inactivo' })),
      h('div', { class: 'ad-user-fields' },
        h('div', {}, h('div', { class: 'sublabel' }, 'Nombre completo (sale en los informes)'),
          h('input', { value: u.name || '', placeholder: 'ej. Diego Pérez', autocomplete: 'off', onchange: (e) => {
            const v = e.target.value.trim();
            if (!v) { e.target.value = u.name; return toast('El nombre no puede quedar vacío'); }
            upd({ name: v }, 'Nombre guardado');
          } })),
        h('div', {}, h('div', { class: 'sublabel' }, 'Email (también sirve para entrar)'),
          h('input', { type: 'email', value: u.email || '', placeholder: 'opcional', autocomplete: 'off', onchange: (e) => upd({ email: e.target.value.trim() }, 'Email guardado') })),
        h('div', {}, h('div', { class: 'sublabel' }, 'Rol'),
          h('select', { disabled: me, onchange: (e) => upd({ role: e.target.value }) }, Object.entries(ROLE).map(([k, v]) => h('option', { value: k, selected: k === u.role }, v)))),
        h('div', {}, h('div', { class: 'sublabel' }, 'Cargo'),
          h('input', { placeholder: 'Cargo', value: u.job_title || '', onchange: (e) => upd({ job_title: e.target.value }) }))),
      h('div', { class: 'ad-actions' },
        h('button', { class: 'btn small', onclick: async () => {
          if (!(await confirmBox(`¿Generar una contraseña nueva para ${u.name}? La actual dejará de valer.`, 'Generar'))) return;
          try { const r = await api('resetPassword', { id: u.id }); showPassword(u.name, r.password); load(); } catch (e) { toast(e.message); }
        } }, icon('sync', { size: 16 }), 'Nueva contraseña'),
        me ? null : h('button', { class: 'btn small danger', onclick: async () => {
          if (!(await confirmBox(`¿Eliminar a ${u.name}? Si solo quieres que no entre, mejor desactívalo.`, 'Eliminar'))) return;
          try { await api('deleteUser', { id: u.id }); toast('Eliminado'); load(); } catch (e) { toast(e.message); }
        } }, icon('trash', { size: 16 }), 'Eliminar')));
  }
  load();
}

// =====================================================================
// CATÁLOGO
// =====================================================================
const KINDS = [['antenna', 'Antenas'], ['mount', 'Monturas'], ['router', 'Routers'], ['cable', 'Cables'], ['accessory', 'Accesorios'], ['sim', 'SIM']];
const FAMILY_LABEL = { standard: 'Standard', standard_actuated: 'Standard Actuated', mini: 'Mini', performance_gen3: 'Performance Gen 3', flat_hp: 'Flat High Perf.', high_performance: 'High Performance', enterprise: 'Enterprise' };
const FAMILIES = Object.keys(FAMILY_LABEL);
const MANUFACTURERS = ['Starlink', 'Peplink', 'SIM', 'Third-party', 'Other'];
let kind = 'antenna';

export async function catalogView(page) {
  const tabs = h('div', { class: 'ad-tabs' });
  const addBox = h('div', {});
  const search = h('input', { type: 'search', placeholder: 'Buscar en el catálogo…', oninput: () => drawList() });
  const list = h('div', { class: 'ad-list' });
  page.append(pageHead('Catálogo de equipos', 'Lo que añadas aparece al momento en los desplegables. Desactivar no borra: los informes antiguos lo conservan.'),
    tabs, addBox, h('div', { class: 'ad-search' }, icon('search', { size: 17 }), search), list);

  const save = async (item, msg = 'Guardado') => {
    try { state.catalog = await api('saveCatalogItem', { item }); toast(msg); draw(); } catch (e) { toast(e.message); draw(); }
  };

  function draw() {
    tabs.replaceChildren(...KINDS.map(([k, l]) => {
      const n = state.catalog.filter((c) => c.kind === k).length;
      return h('button', { class: `ad-tab ${k === kind ? 'on' : ''}`, onclick: () => { kind = k; search.value = ''; draw(); } }, l, h('span', { class: 'n' }, n));
    }));
    addBox.replaceChildren(addForm());
    drawList();
  }

  function addForm() {
    const man = h('select', {}, MANUFACTURERS.map((m) => h('option', { selected: (kind === 'router' ? 'Peplink' : kind === 'sim' ? 'SIM' : 'Starlink') === m }, m)));
    const name = h('input', { required: true, placeholder: kind === 'antenna' ? 'ej. Starlink Standard Kit (V4)' : 'Nombre en inglés' });
    const fam = h('select', {}, FAMILIES.map((x) => h('option', { value: x }, FAMILY_LABEL[x])));
    const compat = new Set();
    const label = KINDS.find(([k]) => k === kind)[1].toLowerCase();
    const form = h('form', { class: 'form-grid', onsubmit: (e) => {
      e.preventDefault();
      save({ kind, manufacturer: man.value, name: name.value.trim(), family: kind === 'antenna' ? fam.value : '', compat: [...compat] }, 'Añadido');
    } },
    fieldBox('Fabricante', man),
    fieldBox('Nombre', name, { help: 'Tal como saldrá en el PDF' }),
    kind === 'antenna' ? fieldBox('Familia', fam, { help: 'Sirve para filtrar las monturas compatibles' }) : null,
    kind === 'mount' ? fieldBox('Compatible con', h('div', { class: 'chips' }, FAMILIES.map((x) => h('button', { type: 'button', class: 'chip', onclick: (e) => { compat.has(x) ? compat.delete(x) : compat.add(x); e.currentTarget.classList.toggle('on'); } }, FAMILY_LABEL[x]))), { full: true }) : null,
    h('div', { class: 'full' }, h('button', { class: 'btn primary' }, icon('plus'), 'Añadir al catálogo')));
    return collapsible(`Añadir a ${label}`, form);
  }

  function drawList() {
    const q = search.value.trim().toLowerCase();
    const items = state.catalog.filter((c) => c.kind === kind && (!q || `${c.name} ${c.manufacturer} ${c.family}`.toLowerCase().includes(q)));
    if (!items.length) { list.replaceChildren(h('p', { class: 'muted ad-empty' }, q ? 'Nada coincide con la búsqueda.' : 'Todavía no hay nada en esta categoría.')); return; }
    list.replaceChildren(...items.map((c) => h('div', { class: `card ad-item ${c.active ? '' : 'off'}` },
      h('div', { class: 'ad-item-top' },
        h('div', { class: 'grow' },
          h('div', { class: 'ad-item-name' }, c.name),
          h('div', { class: 'ad-meta' }, h('span', { class: 'tag' }, c.manufacturer), c.family ? h('span', { class: 'tag' }, FAMILY_LABEL[c.family] || c.family) : null)),
        toggle(c.active, (on) => save({ ...c, active: on }, on ? 'Activado' : 'Desactivado'), { label: c.active ? 'Activo' : 'Oculto' })),
      kind === 'mount' ? h('div', { class: 'ad-compat' }, h('div', { class: 'sublabel' }, 'Compatible con'),
        h('div', { class: 'chips' }, FAMILIES.map((x) => h('button', { class: `chip tiny ${c.compat.includes(x) ? 'on' : ''}`, onclick: () => save({ ...c, compat: c.compat.includes(x) ? c.compat.filter((y) => y !== x) : [...c.compat, x] }) }, FAMILY_LABEL[x])))) : null)));
  }
  draw();
}

// =====================================================================
// EMPRESA
// =====================================================================
export async function companyView(page) {
  const c = { ...state.config };
  let dirty = false;
  const saveBtn = h('button', { class: 'btn primary', disabled: true, onclick: () => save() }, icon('check'), 'Guardar cambios');
  const bar = h('div', { class: 'ad-savebar' }, h('span', { class: 'muted small grow' }, 'Se aplica a los informes nuevos y a los no emitidos.'), saveBtn);
  const mark = () => { dirty = true; saveBtn.disabled = false; bar.classList.add('dirty'); };
  const input = (k, ph = '') => h('input', { value: c[k] || '', placeholder: ph, oninput: (e) => { c[k] = e.target.value; mark(); } });

  const logoImg = h('img', { class: 'logo-prev', src: state.logo || '', alt: 'Logo', hidden: !state.logo });
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    c.logo = await compressImage(f, 420, 0.85); logoImg.src = c.logo; logoImg.hidden = false; mark();
  } });

  async function save() {
    saveBtn.disabled = true;
    try { await api('saveConfig', { config: c }); await bootstrap(); dirty = false; bar.classList.remove('dirty'); toast('Guardado'); }
    catch (e) { toast(e.message); saveBtn.disabled = false; }
  }

  const section = (title, sub, ...body) => h('section', { class: 'card ad-section' },
    h('div', { class: 'ad-sec-head' }, h('h4', {}, title), sub ? h('p', { class: 'muted small' }, sub) : null), ...body);

  page.append(pageHead('Empresa', 'Datos que aparecen en los informes, el correo y la app.'),
    section('Identidad', 'Nombre y logo de la portada del PDF.',
      h('div', { class: 'form-grid' },
        fieldBox('Nombre de la empresa', input('company_name', 'ej. Orbius'), { full: true }),
        h('div', { class: 'field full' }, h('label', { class: 'label' }, 'Logo'),
          h('div', { class: 'ad-logo' }, h('div', { class: 'ad-logo-box' }, logoImg, state.logo ? null : h('span', { class: 'muted small' }, 'Sin logo')),
            h('div', { class: 'stack' },
              h('button', { type: 'button', class: 'btn small', onclick: () => file.click() }, icon('image', { size: 16 }), 'Cambiar logo'),
              h('span', { class: 'help' }, 'PNG o JPG. Si pegaste 08_Logo.gs en Apps Script, se usa ese.')), file)))),
    section('Documentos', 'Textos fijos del PDF y del correo.',
      h('div', { class: 'form-grid' },
        fieldBox('Línea de contacto de la portada', input('contact_line', 'Dirección | email | teléfono'), { full: true }),
        fieldBox('Pie de página del PDF', input('footer_text'), { full: true }),
        fieldBox('Firma del correo', input('signature', 'ej. Orbius Field Services'), { help: 'Va debajo del nombre del técnico' }),
        fieldBox('CC por defecto en los correos', input('default_cc', 'email@empresa.com')))),
    section('Flujo de trabajo', null,
      h('div', { class: 'ad-row-switch' },
        h('div', { class: 'grow' }, h('strong', {}, 'Exigir aprobación antes de emitir'), h('div', { class: 'muted small' }, 'Un supervisor o administrador debe aprobar el informe antes de emitirlo.')),
        toggle(String(c.require_approval) === 'true', (on) => { c.require_approval = String(on); mark(); }))),
    iconSection(),
    bar);

}

// Icono de la app (pantalla de inicio del móvil, pestaña del navegador)
function iconSection() {
  const prev = h('div', {});
  let mode = iconMode();
  const draw = async () => {
    prev.replaceChildren();
    if (!state.logo) { prev.appendChild(h('p', { class: 'muted' }, 'No hay logo: pega tu 08_Logo.gs en Apps Script o sube uno arriba.')); return; }
    try { prev.appendChild(await iconPreview(state.logo, mode)); } catch { prev.appendChild(h('p', { class: 'error' }, 'El logo no es una imagen válida.')); }
  };
  const modeSel = h('div', { class: 'seg' },
    h('button', { type: 'button', class: mode === 'symbol' ? 'on' : '', onclick: (e) => pick('symbol', e) }, 'Solo el símbolo'),
    h('button', { type: 'button', class: mode === 'full' ? 'on' : '', onclick: (e) => pick('full', e) }, 'Logo completo'));
  function pick(m, e) {
    mode = m; setIconMode(m); [...modeSel.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    draw(); applyLogoIcons(state.logo);
  }
  draw();
  return h('section', { class: 'card ad-section' },
    h('div', { class: 'ad-sec-head' }, h('h4', {}, 'Icono de la app'),
      h('p', { class: 'muted small' }, 'Se crea a partir del logo. En la pestaña del navegador y en iPhone se aplica solo. Para que salga al instalar la app en Android o PC, descarga los iconos y súbelos a la carpeta icons de GitHub.')),
    modeSel, prev,
    h('button', { class: 'btn', onclick: async (e) => {
      if (!state.logo) return toast('No hay logo');
      const b = e.currentTarget; b.disabled = true;
      try { downloadBlob(await iconsZip(state.logo, mode), 'iconos-app.zip'); toast('Descomprime iconos-app.zip y sube los 5 archivos a la carpeta icons de GitHub'); }
      catch (err) { toast(err.message); }
      b.disabled = false;
    } }, icon('download'), 'Descargar iconos para GitHub'));
}
