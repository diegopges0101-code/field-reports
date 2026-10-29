import { h, toast, modal, confirmBox, fmtDateTime, copyText, compressImage } from '../ui.js';
import { api } from '../api.js';
import { state, bootstrap } from '../store.js';

const ROLE = { admin: 'Administrador', supervisor: 'Supervisor', technician: 'Técnico' };

function showPassword(name, pw) {
  modal('Contraseña provisional', h('div', { class: 'stack' },
    h('p', {}, `Pásale a ${name} estos datos. Al entrar tendrá que cambiar la contraseña.`),
    h('div', { class: 'pw-box' }, pw),
    h('button', { class: 'btn', onclick: async () => { await copyText(pw); toast('Copiada'); } }, 'Copiar contraseña'),
    h('p', { class: 'muted small' }, 'No se volverá a mostrar.')));
}

// =====================================================================
export async function usersView(page) {
  const list = h('div', { class: 'list' });
  const f = { username: h('input', { required: true, autocapitalize: 'none', placeholder: 'ej. jose' }), name: h('input', { required: true }), email: h('input', { type: 'email' }), job_title: h('input'), role: h('select', {}, Object.entries(ROLE).map(([k, v]) => h('option', { value: k, selected: k === 'technician' }, v))) };
  page.append(h('h2', {}, 'Usuarios'),
    h('form', { class: 'card form-grid', onsubmit: async (e) => {
      e.preventDefault();
      try {
        const res = await api('createUser', { user: Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()])) });
        showPassword(f.name.value, res.password);
        Object.values(f).forEach((el) => { if (el.tagName === 'INPUT') el.value = ''; });
        load(); bootstrap();
      } catch (ex) { toast(ex.message); }
    } },
    h('h4', { class: 'full' }, 'Nuevo usuario'),
    h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Usuario (para entrar)'), f.username),
    h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Nombre completo (sale en los informes)'), f.name),
    h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Email (opcional, también sirve para entrar)'), f.email),
    h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Cargo (firma del correo)'), f.job_title),
    h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Rol'), f.role),
    h('div', { class: 'full' }, h('button', { class: 'btn primary' }, 'Crear usuario y generar contraseña'))),
    list);

  async function load() {
    list.innerHTML = '';
    const users = await api('listUsers');
    users.forEach((u) => {
      const upd = async (patch) => { try { await api('updateUser', { id: u.id, patch }); toast('Guardado'); load(); bootstrap(); } catch (e) { toast(e.message); } };
      list.appendChild(h('div', { class: 'list-row' },
        h('div', { class: 'grow' },
          h('strong', {}, u.name), ' ', !u.active ? h('span', { class: 'badge bad' }, 'Inactivo') : null, u.must_change ? h('span', { class: 'badge warn' }, 'Contraseña provisional') : null,
          h('div', { class: 'muted small' }, `${u.username}${u.email ? ' · ' + u.email : ''} · último acceso: ${fmtDateTime(u.last_login) || 'nunca'}`),
          h('input', { class: 'mt', placeholder: 'Cargo', value: u.job_title || '', onchange: (e) => upd({ job_title: e.target.value }) })),
        h('div', { class: 'stack' },
          h('select', { disabled: u.id === state.user.id, onchange: (e) => upd({ role: e.target.value }) }, Object.entries(ROLE).map(([k, v]) => h('option', { value: k, selected: k === u.role }, v))),
          u.id !== state.user.id ? h('button', { class: 'btn small', onclick: () => upd({ active: !u.active }) }, u.active ? 'Desactivar' : 'Activar') : null,
          h('button', { class: 'btn small', onclick: async () => { if (!(await confirmBox(`¿Generar una contraseña nueva para ${u.name}? La actual dejará de valer.`))) return; try { const r = await api('resetPassword', { id: u.id }); showPassword(u.name, r.password); load(); } catch (e) { toast(e.message); } } }, 'Nueva contraseña'),
          u.id !== state.user.id ? h('button', { class: 'btn small danger', onclick: async () => { if (!(await confirmBox(`¿Eliminar a ${u.name}?`, 'Eliminar'))) return; try { await api('deleteUser', { id: u.id }); load(); } catch (e) { toast(e.message); } } }, 'Eliminar') : null)));
    });
  }
  load();
}

// =====================================================================
const KINDS = [['antenna', 'Antenas Starlink'], ['mount', 'Monturas'], ['router', 'Routers'], ['cable', 'Cables'], ['accessory', 'Accesorios'], ['sim', 'SIM']];
const FAMILIES = ['standard', 'standard_actuated', 'mini', 'performance_gen3', 'flat_hp', 'high_performance', 'enterprise'];
let kind = 'antenna';

export async function catalogView(page) {
  const list = h('div', { class: 'list' });
  const tabs = h('div', { class: 'chips' });
  const form = h('form', { class: 'card form-grid mt' });
  page.append(h('h2', {}, 'Catálogo de equipos'),
    h('p', { class: 'muted' }, 'Lo que añadas aparece al momento en los desplegables. Desactivar no borra: los informes antiguos lo conservan.'), tabs, form, list);

  const save = async (item) => { try { state.catalog = await api('saveCatalogItem', { item }); draw(); } catch (e) { toast(e.message); } };

  function draw() {
    tabs.innerHTML = '';
    KINDS.forEach(([k, l]) => tabs.appendChild(h('button', { class: `chip ${k === kind ? 'on' : ''}`, onclick: () => { kind = k; draw(); } }, l)));
    const man = h('select', {}, ['Starlink', 'Peplink', 'SIM', 'Third-party', 'Other'].map((m) => h('option', {}, m)));
    const name = h('input', { required: true });
    const fam = h('select', {}, FAMILIES.map((x) => h('option', {}, x)));
    const compat = new Set();
    form.innerHTML = '';
    form.append(
      h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Fabricante'), man),
      h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Nombre (en inglés, tal como saldrá en el PDF)'), name),
      kind === 'antenna' ? h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Familia (para filtrar monturas)'), fam) : null,
      kind === 'mount' ? h('div', { class: 'field full' }, h('label', { class: 'label' }, 'Compatible con'), h('div', { class: 'chips' }, FAMILIES.map((x) => h('button', { type: 'button', class: 'chip', onclick: (e) => { compat.has(x) ? compat.delete(x) : compat.add(x); e.target.classList.toggle('on'); } }, x)))) : null,
      h('div', { class: 'full' }, h('button', { class: 'btn primary' }, 'Añadir')));
    form.onsubmit = (e) => { e.preventDefault(); save({ kind, manufacturer: man.value, name: name.value.trim(), family: kind === 'antenna' ? fam.value : '', compat: [...compat] }); };

    list.innerHTML = '';
    state.catalog.filter((c) => c.kind === kind).forEach((c) => list.appendChild(h('div', { class: 'list-row' },
      h('div', { class: 'grow' },
        h('strong', { style: { opacity: c.active ? 1 : 0.45 } }, c.name),
        h('div', { class: 'muted small' }, c.manufacturer, c.family ? ` · ${c.family}` : ''),
        kind === 'mount' ? h('div', { class: 'chips mt' }, FAMILIES.map((x) => h('button', { class: `chip tiny ${c.compat.includes(x) ? 'on' : ''}`, onclick: () => save({ ...c, compat: c.compat.includes(x) ? c.compat.filter((y) => y !== x) : [...c.compat, x] }) }, x))) : null),
      h('button', { class: 'btn small', onclick: () => save({ ...c, active: !c.active }) }, c.active ? 'Desactivar' : 'Activar'))));
  }
  draw();
}

// =====================================================================
export async function companyView(page) {
  const c = { ...state.config };
  const field = (k, label, full) => h('div', { class: `field ${full ? 'full' : 'half'}` }, h('label', { class: 'label' }, label), h('input', { value: c[k] || '', oninput: (e) => { c[k] = e.target.value; } }));
  const logoImg = h('img', { class: 'logo-prev', src: state.logo || '', hidden: !state.logo });
  page.append(h('h2', {}, 'Empresa'),
    h('div', { class: 'card form-grid' },
      field('company_name', 'Nombre de la empresa'),
      field('signature', 'Firma del correo (bajo el nombre del técnico)'),
      field('contact_line', 'Línea de contacto de la portada (dirección | email | teléfono)', true),
      field('footer_text', 'Pie de página del PDF', true),
      field('default_cc', 'CC por defecto en los correos'),
      h('label', { class: 'field half checkbox' }, h('input', { type: 'checkbox', checked: String(c.require_approval) === 'true', onchange: (e) => { c.require_approval = String(e.target.checked); } }), 'Exigir aprobación de un supervisor antes de emitir'),
      h('div', { class: 'field full' }, h('label', { class: 'label' }, 'Logo (si pegaste 08_Logo.gs en Apps Script, se usa ese)'), logoImg,
        h('input', { type: 'file', accept: 'image/png,image/jpeg', onchange: async (e) => {
          const f = e.target.files[0]; if (!f) return;
          c.logo = await compressImage(f, 420, 0.85); logoImg.src = c.logo; logoImg.hidden = false;
        } })),
      h('div', { class: 'full' }, h('button', { class: 'btn primary', onclick: async () => {
        try { await api('saveConfig', { config: c }); await bootstrap(); toast('Guardado. Se aplica a los informes nuevos y no emitidos.'); } catch (e) { toast(e.message); }
      } }, 'Guardar'))));
}
