import { h, toast, modal, fmtDateTime } from '../ui.js';
import { api } from '../api.js';
import { idb } from '../db.js';
import { state, loadReport, saveLocal, resolveConflict, sync, listPhotos, ensurePhotoData } from '../store.js';
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

  const saveTxt = h('span', {});
  const saveEl = h('div', { class: 'save', title: '' }, saveTxt);
  const headTitle = h('div', { class: 't1' });
  const headSub = h('div', { class: 't2' });
  const drawTitles = () => {
    const site = [r.data.site_code, r.data.site_name].filter(Boolean).join(' – ');
    headTitle.textContent = site || TYPE_LABEL[r.type];
    headSub.innerHTML = '';
    headSub.append(...[h('span', { class: `badge st-${r.status}` }, STATUS_LABEL[r.status]), h('span', {}, `${r.type === 'survey' ? 'Survey' : 'Installation'} · ${r.number || 'nº pendiente'}`),
      r.isNew ? null : h('a', { href: '#', onclick: (e) => { e.preventDefault(); showHistory(r); } }, 'Historial')].filter(Boolean));
  };
  const banner = h('div', {});
  const stepsNav = h('nav', { class: 'steps' });
  const body = h('section', { class: 'card' });

  async function refreshSaveState() {
    const cur = (await idb.get('reports', r.id)) || r;
    r.version = cur.version; r.number = cur.number || r.number; r.status = cur.status || r.status; r.dirty = cur.dirty; r.conflict = cur.conflict; r.isNew = cur.isNew;
    drawTitles();
    const set = (cls, txt, title) => { saveEl.className = `save ${cls}`; saveTxt.textContent = txt; saveEl.title = title; };
    if (r.conflict) set('save-bad', 'Conflicto', 'Otra persona guardó cambios');
    else if (!r.dirty) set('save-ok', 'Guardado', 'Guardado en la nube');
    else if (!navigator.onLine) set('save-bad', 'Sin red · en el móvil', 'Sin conexión: guardado en este dispositivo, se subirá solo');
    else set('save-warn', state.syncing ? 'Guardando…' : 'Por subir', 'Cambios pendientes de subir');
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
  const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.querySelector('.pe, .modal-back');
  // La versión del servidor llegó en segundo plano y es más nueva: se actualiza la pantalla
  const onRefreshed = async (e) => {
    if (e.detail?.id !== r.id) return;
    const cur = await idb.get('reports', r.id);
    if (!cur || cur.dirty) return;
    r = cur;
    if (!typing()) { drawStep(); toast('Informe actualizado con la última versión'); }
    refreshSaveState();
  };
  const onPhotos = (e) => { if (e.detail?.reportId === r.id && !typing() && tpl.steps[stepIdx].fields.some((f) => f.type === 'photos')) drawStep(); };
  window.addEventListener('report-state', onSync);
  window.addEventListener('sync', onSync);
  window.addEventListener('online', onSync); window.addEventListener('offline', onSync);
  window.addEventListener('report-refreshed', onRefreshed);
  window.addEventListener('photos-refreshed', onPhotos);
  window.addEventListener('hashchange', function off() {
    window.removeEventListener('report-state', onSync); window.removeEventListener('sync', onSync);
    window.removeEventListener('online', onSync); window.removeEventListener('offline', onSync);
    window.removeEventListener('report-refreshed', onRefreshed); window.removeEventListener('photos-refreshed', onPhotos);
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
    people: state.people, catalog: state.catalog, readOnly, get report() { return r; },
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
    count.textContent = `${stepIdx + 1}/${tpl.steps.length}`;
    prevBtn.disabled = stepIdx === 0;
    nextBtn.textContent = stepIdx >= tpl.steps.length - 1 ? 'Fin' : 'Siguiente →';
    nextBtn.disabled = stepIdx >= tpl.steps.length - 1;
    const on = stepsNav.children[stepIdx];
    requestAnimationFrame(() => { stepsNav.scrollLeft = on.offsetLeft - (stepsNav.clientWidth - on.offsetWidth) / 2; });
    const y = window.scrollY;
    body.innerHTML = '';
    body.appendChild(h('h3', {}, step.title));
    if (step.id === 'english') body.appendChild(englishStep(r, readOnly));
    else if (step.id === 'outputs') body.appendChild(outputsStep(r, { onChanged: async () => { r = await loadReport(r.id); refreshSaveState(); } }));
    else body.appendChild(h('div', { class: 'form-grid' }, step.fields.map((f) => renderField(f, ctx))));
    window.scrollTo(0, y);
  }

  const count = h('span', { class: 'count' });
  const prevBtn = h('button', { class: 'btn', onclick: () => stepIdx > 0 && goStep(stepIdx - 1) }, '← Anterior');
  const nextBtn = h('button', { class: 'btn primary', onclick: () => stepIdx < tpl.steps.length - 1 && goStep(stepIdx + 1) }, 'Siguiente →');
  page.append(
    h('div', { class: 'editor-head' },
      h('a', { href: '#/', class: 'btn icon back', 'aria-label': 'Volver a informes' }, '←'),
      h('div', { class: 'titles' }, headTitle, headSub),
      saveEl),
    banner, stepsNav, body,
    h('div', { class: 'bottom-bar' }, prevBtn, count, nextBtn));
  drawStep();
  refreshSaveState();
  // Descarga las fotos en segundo plano para que el paso "Fotos" y el PDF salgan al instante
  if (navigator.onLine && !r.isNew) setTimeout(() => listPhotos(r.id, { cachedFirst: true }).then((ph) => ensurePhotoData(ph)).catch(() => {}), 800);
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
  listPhotos(r.id, { cachedFirst: true }).then((ph) => { items = getTranslatables(r, ph); draw(); });
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
