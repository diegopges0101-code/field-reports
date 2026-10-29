import { h, toast, modal, fmtDateTime } from '../ui.js';
import { api } from '../api.js';
import { idb } from '../db.js';
import { state, loadReport, saveLocal, resolveConflict, sync, listPhotos } from '../store.js';
import { TEMPLATES, missingRequired } from '../templates.js';
import { renderField } from '../fields.js';
import { getTranslatables, trState } from '../english.js';
import { outputsStep } from './outputs.js';
import { STATUS_LABEL, TYPE_LABEL } from './list.js';

export function canEdit(r) {
  const u = state.user;
  if (['issued', 'archived'].includes(r.status)) return false;
  if (u.role !== 'technician') return true;
  return r.status !== 'approved';
}

export async function editorView(page, id, stepIdx) {
  let r = await loadReport(id);
  if (!r) { page.appendChild(h('div', { class: 'error' }, 'Informe no disponible sin conexión.')); return; }
  const tpl = TEMPLATES[r.type];
  stepIdx = Math.min(stepIdx, tpl.steps.length - 1);
  const readOnly = !canEdit(r);

  const saveEl = h('div', { class: 'save' });
  const headTitle = h('h2', {}, `${TYPE_LABEL[r.type]} · ${r.number || 'nº pendiente'}`);
  const banner = h('div', {});
  const stepsNav = h('nav', { class: 'steps' });
  const body = h('section', { class: 'card' });

  async function refreshSaveState() {
    const cur = (await idb.get('reports', r.id)) || r;
    r.version = cur.version; r.number = cur.number || r.number; r.status = cur.status || r.status; r.dirty = cur.dirty; r.conflict = cur.conflict; r.isNew = cur.isNew;
    headTitle.textContent = `${TYPE_LABEL[r.type]} · ${r.number || 'nº pendiente'}`;
    if (r.conflict) { saveEl.className = 'save save-bad'; saveEl.textContent = '⚠ Conflicto'; }
    else if (!r.dirty) { saveEl.className = 'save save-ok'; saveEl.textContent = '✓ Guardado en la nube'; }
    else if (!navigator.onLine) { saveEl.className = 'save save-bad'; saveEl.textContent = 'Sin conexión · guardado en este dispositivo'; }
    else { saveEl.className = 'save save-warn'; saveEl.textContent = state.syncing ? '↻ Guardando…' : '● Cambios pendientes de subir'; }
    drawBanner();
  }
  function drawBanner() {
    banner.innerHTML = '';
    if (r.conflict) banner.appendChild(h('div', { class: 'warn' },
      'Otra persona guardó cambios en este informe mientras tú lo editabas.',
      h('div', { class: 'row wrap mt' },
        h('button', { class: 'btn', onclick: async () => { r = await resolveConflict(r, false); location.reload(); } }, 'Cargar su versión (pierdo mis cambios)'),
        h('button', { class: 'btn danger', onclick: async () => { await resolveConflict(r, true); refreshSaveState(); } }, 'Guardar la mía encima'))));
    if (r.status === 'changes_requested' && r.review_comment) banner.appendChild(h('div', { class: 'warn' }, 'Correcciones pedidas: ', r.review_comment));
    if (readOnly) banner.appendChild(h('div', { class: 'info-box' }, `Estado "${STATUS_LABEL[r.status]}": solo lectura.`));
  }
  const onSync = () => refreshSaveState();
  window.addEventListener('report-state', onSync);
  window.addEventListener('sync', onSync);
  window.addEventListener('online', onSync); window.addEventListener('offline', onSync);
  window.addEventListener('hashchange', function off() {
    window.removeEventListener('report-state', onSync); window.removeEventListener('sync', onSync);
    window.removeEventListener('online', onSync); window.removeEventListener('offline', onSync);
    window.removeEventListener('hashchange', off);
  });

  const ctx = {
    get data() { return r.data; },
    set: (key, value, rerender) => {
      r.data = { ...r.data, [key]: value };
      saveLocal(r);
      if (rerender) drawStep();
      else markSteps();
    },
    people: state.people, catalog: state.catalog, readOnly, report: r,
  };

  function markSteps() {
    const missing = missingRequired(tpl, r.data);
    [...stepsNav.children].forEach((b, i) => b.classList.toggle('missing', missing.some((m) => m.step === tpl.steps[i].title)));
  }

  function goStep(i) {
    stepIdx = i;
    history.replaceState(null, '', `#/r/${encodeURIComponent(r.id)}?step=${i}`);
    drawStep(); window.scrollTo(0, 0);
  }

  function drawStep() {
    const step = tpl.steps[stepIdx];
    stepsNav.innerHTML = '';
    tpl.steps.forEach((s, i) => stepsNav.appendChild(h('button', { class: `step ${i === stepIdx ? 'on' : ''}`, onclick: () => goStep(i) }, h('span', { class: 'n' }, i + 1), ' ', s.title)));
    markSteps();
    const y = window.scrollY;
    body.innerHTML = '';
    body.appendChild(h('h3', {}, step.title));
    if (step.id === 'english') body.appendChild(englishStep(r, readOnly));
    else if (step.id === 'outputs') body.appendChild(outputsStep(r, { onChanged: async () => { r = await loadReport(r.id); refreshSaveState(); } }));
    else body.appendChild(h('div', { class: 'form-grid' }, step.fields.map((f) => renderField(f, ctx))));
    window.scrollTo(0, y);
  }

  const histBtn = h('button', { class: 'btn small', onclick: () => showHistory(r) }, 'Historial');
  page.append(
    h('div', { class: 'editor-head' },
      h('div', {}, h('a', { href: '#/', class: 'muted' }, '← Informes'), headTitle,
        h('div', { class: 'muted' }, h('span', { class: `badge st-${r.status}` }, STATUS_LABEL[r.status]), ' ', r.isNew ? '' : histBtn)),
      saveEl),
    banner, stepsNav, body,
    h('div', { class: 'bottom-bar' },
      h('button', { class: 'btn', onclick: () => stepIdx > 0 && goStep(stepIdx - 1) }, '← Anterior'),
      h('span', { class: 'muted small', id: 'step-count' }, ''),
      h('button', { class: 'btn primary', onclick: () => stepIdx < tpl.steps.length - 1 && goStep(stepIdx + 1) }, 'Siguiente →')));
  drawStep();
  refreshSaveState();
}

// ---------------------------------------------------------------------
// Paso "Revisar inglés"
// ---------------------------------------------------------------------
const TR_LABEL = { ok: ['Traducido', 'ok'], edited: ['Revisado a mano', 'ok'], outdated: ['El original cambió: volver a traducir', 'warn'], missing: ['Sin traducir', 'warn'], failed: ['Falló la traducción', 'bad'] };

function englishStep(r, readOnly) {
  const box = h('div', { class: 'stack' }, h('div', { class: 'muted' }, 'Cargando…'));
  let items = [];
  const draw = () => {
    box.innerHTML = '';
    const pending = items.filter((i) => ['missing', 'outdated', 'failed'].includes(trState(r.english, i)));
    box.appendChild(h('p', { class: 'muted' }, 'Las opciones de las listas ya salen en inglés. Aquí aparecen solo los textos que has escrito. Revisa la traducción: es automática y no es una certificación técnica. Los números de serie, IP y medidas se protegen y no se traducen.'));
    if (!items.length) { box.appendChild(h('p', {}, 'No hay textos libres que traducir.')); return; }
    if (!readOnly) box.appendChild(h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', disabled: !pending.length, onclick: (e) => translate(pending, e.target) }, `Traducir al inglés (${pending.length} pendientes)`),
      h('button', { class: 'btn', onclick: (e) => translate(items, e.target) }, 'Volver a traducir todo')));
    items.forEach((it) => {
      const s = trState(r.english, it);
      const cur = r.english[it.path];
      box.appendChild(h('div', { class: 'card tr' },
        h('div', { class: 'row between' }, h('strong', {}, it.label), h('span', { class: `badge ${TR_LABEL[s][1]}` }, TR_LABEL[s][0])),
        h('div', { class: 'orig' }, it.text),
        h('textarea', { rows: 3, disabled: readOnly, placeholder: 'English text', oninput: (e) => { r.english = { ...r.english, [it.path]: { src: it.text, en: e.target.value, status: 'edited' } }; saveLocal(r); } },
          cur && cur.src === it.text ? cur.en : '')));
    });
  };
  const translate = async (list, btn) => {
    if (!navigator.onLine) return toast('La traducción necesita conexión. Puedes escribir el inglés a mano.');
    btn.disabled = true; btn.textContent = 'Traduciendo…';
    try {
      const res = await api('translate', { texts: list.map((i) => i.text) }, { timeout: 120000 });
      const en = { ...r.english };
      list.forEach((it, k) => { en[it.path] = { src: it.text, en: res[k]?.ok ? res[k].text : '', status: res[k]?.ok ? 'auto' : 'failed' }; });
      r.english = en; await saveLocal(r);
      const bad = res.filter((x) => !x.ok).length;
      toast(bad ? `${bad} texto(s) no se pudieron traducir: escríbelos a mano` : 'Traducción lista. Revísala.');
    } catch (e) { toast('Error al traducir: ' + e.message); }
    draw();
  };
  listPhotos(r.id).then((ph) => { items = getTranslatables(r, ph); draw(); });
  return box;
}

async function showHistory(r) {
  const box = h('div', {}, 'Cargando…');
  modal('Historial del informe', box);
  try {
    const rows = await api('history', { id: r.id });
    box.innerHTML = '';
    box.appendChild(h('table', { class: 'tbl' }, rows.map((a) => h('tr', {}, h('td', {}, fmtDateTime(a.at)), h('td', {}, a.user), h('td', {}, a.action), h('td', {}, a.detail)))));
  } catch (e) { box.textContent = e.message; }
}

export { sync };
