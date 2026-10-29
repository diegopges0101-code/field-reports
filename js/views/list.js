import { h, toast, confirmBox } from '../ui.js';
import { api } from '../api.js';
import { idb } from '../db.js';
import { state, createReport, scheduleSync } from '../store.js';

export const STATUS_LABEL = { draft: 'Borrador', ready_for_review: 'Para revisar', changes_requested: 'Correcciones pedidas', approved: 'Aprobado', issued: 'Emitido', archived: 'Archivado' };
export const TYPE_LABEL = { survey: 'Survey', installation: 'Installation Report' };

// Campos que NO se copian al duplicar (propios de cada sitio / intervención)
const NOT_COPIED = ['site_code', 'site_name', 'contract', 'gps', 'client_contact', 'recipient_email', 'start_time', 'end_time',
  'ip', 'mask', 'gateway', 'dns', 'sl_status', 'sl_obstructions', 'sl_down', 'sl_up', 'sl_latency', 'sl_notes',
  'pp_tests', 'pp_notes', 'final_status', 'pending', 'issues', 'final_notes', 'feasibility', 'conditions', 'conclusion',
  'sky_view', 'antenna_notes', 'route_notes', 'access_notes', 'destination_notes', 'onsite_notes', 'onsite_equipment'];

const filters = { q: '', type: '', status: '', mine: false };

export async function listView(page) {
  const manager = state.user.role !== 'technician';
  const listBox = h('div', { class: 'list' }, h('div', { class: 'muted' }, 'Cargando…'));
  const newReport = async (type) => { const r = await createReport(type); location.hash = `#/r/${r.id}`; };

  const q = h('input', { type: 'search', placeholder: 'Buscar nº, cliente, sitio, nº de serie…', value: filters.q, oninput: (e) => { filters.q = e.target.value; debounce(); } });
  const sel = (key, opts) => h('select', { onchange: (e) => { filters[key] = e.target.value; load(); } }, opts.map(([v, l]) => h('option', { value: v, selected: filters[key] === v }, l)));

  page.append(
    h('div', { class: 'new-buttons' },
      h('button', { class: 'big-btn survey', onclick: () => newReport('survey') }, '＋ Nuevo SURVEY'),
      h('button', { class: 'big-btn install', onclick: () => newReport('installation') }, '＋ Nuevo INSTALLATION REPORT')),
    h('div', { class: 'filters' }, q,
      sel('type', [['', 'Todos los tipos'], ['survey', 'Survey'], ['installation', 'Installation']]),
      sel('status', [['', 'Activos'], ...Object.entries(STATUS_LABEL)]),
      manager ? h('label', { class: 'checkbox' }, h('input', { type: 'checkbox', checked: filters.mine, onchange: (e) => { filters.mine = e.target.checked; load(); } }), 'Solo los míos') : null),
    listBox);

  let t;
  function debounce() { clearTimeout(t); t = setTimeout(load, 300); }

  async function load() {
    const local = await idb.all('reports');
    const pendingIds = new Set(local.filter((r) => r.dirty).map((r) => r.id));
    let rows = [];
    let offline = false;
    try {
      rows = await api('listReports', { ...filters, mine: manager ? filters.mine : true, limit: 80 });
    } catch (e) {
      offline = true;
      rows = local.map((r) => ({ id: r.id, number: r.number, type: r.type, status: r.status, client: r.data.client, site_code: r.data.site_code, site_name: r.data.site_name, report_date: r.data.date }));
    }
    // borradores nuevos aún no subidos
    local.filter((r) => r.isNew && !rows.some((x) => x.id === r.id)).forEach((r) =>
      rows.unshift({ id: r.id, number: '', type: r.type, status: 'draft', client: r.data.client, site_code: r.data.site_code, site_name: r.data.site_name, report_date: r.data.date }));
    listBox.innerHTML = '';
    if (offline) listBox.appendChild(h('div', { class: 'warn' }, 'Sin conexión: se muestran los informes guardados en este dispositivo.'));
    if (!rows.length) listBox.appendChild(h('p', { class: 'muted' }, 'No hay informes.'));
    rows.forEach((r) => listBox.appendChild(h('div', { class: 'list-row' },
      h('a', { href: `#/r/${r.id}`, class: 'grow' },
        h('div', { class: 'row between' },
          h('strong', {}, [r.site_code, r.site_name].filter(Boolean).join(' – ') || '(sin sitio)'),
          h('span', { class: `badge st-${r.status}` }, STATUS_LABEL[r.status] || r.status)),
        h('div', { class: 'muted small' }, [TYPE_LABEL[r.type], r.number || 'nº pendiente', r.client, r.report_date].filter(Boolean).join(' · '),
          pendingIds.has(r.id) ? h('span', { class: 'badge warn tiny' }, ' sin subir') : null)),
      h('button', { class: 'btn small', title: 'Duplicar para un trabajo parecido', onclick: () => duplicate(r.id) }, 'Duplicar'))));
  }

  async function duplicate(id) {
    let src = await idb.get('reports', id);
    if (!src) { try { src = await api('getReport', { id }); } catch (e) { return toast(e.message); } }
    if (!(await confirmBox('Se creará un informe nuevo con los mismos equipos y opciones, sin sitio, números de serie, IP, pruebas ni fotos. ¿Continuar?', 'Duplicar'))) return;
    const d = JSON.parse(JSON.stringify(src.data));
    NOT_COPIED.forEach((k) => delete d[k]);
    d.date = new Date().toISOString().slice(0, 10);
    d.technicians = { ids: [state.user.id], other: '' };
    if (Array.isArray(d.equipment)) d.equipment = d.equipment.map((e) => ({ ...e, serial: '', notes: '' }));
    const r = await createReport(src.type, d);
    scheduleSync(100);
    location.hash = `#/r/${r.id}`;
  }

  load();
}
