// Estado de la app + sincronización con el servidor (funciona sin cobertura)
import { api, ApiError, getToken } from './api.js';
import { idb, kv } from './db.js';
import { TEMPLATES, initialData } from './templates.js';
import { uid } from './ui.js';

export const state = { user: null, people: [], catalog: [], config: {}, logo: '', syncing: false, lastError: '' };
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

// ---------------------------------------------------------------------
// Arranque: datos de la empresa, usuarios, catálogo (con copia local)
// ---------------------------------------------------------------------
const applyBoot = (b) => Object.assign(state, { user: b.user, people: b.people, catalog: b.catalog, config: b.config, logo: b.logo });

/** Guarda los datos que llegan junto con el login (así no hace falta otra petición). */
export async function applyBootData(b) { applyBoot(b); await kv.set('boot', b); bootFresh = Date.now(); }
let bootFresh = 0;

/** Arranque. Con copia guardada abre al instante y actualiza en segundo plano. */
export async function bootstrap({ cachedFirst = false } = {}) {
  const cached = await kv.get('boot');
  if (cachedFirst && cached && getToken()) {
    applyBoot(cached);
    if (Date.now() - bootFresh < 60000) return true; // recién recibido con el login
    api('bootstrap').then(async (b) => { applyBoot(b); await kv.set('boot', b); emit('boot-refreshed'); }).catch((e) => {
      if (e.code === 'auth' || e.code === 'must_change') return; // api.js ya avisa a la app
    });
    return true;
  }
  try {
    const b = await api('bootstrap');
    applyBoot(b);
    await kv.set('boot', b);
    return true;
  } catch (e) {
    if (e.code === 'offline' && getToken() && cached) { applyBoot(cached); return true; }
    throw e;
  }
}

// ---------------------------------------------------------------------
// Informes
// ---------------------------------------------------------------------
export async function createReport(type, data) {
  const r = {
    id: uid(), type, number: '', status: 'draft', version: 0,
    data: data || initialData(TEMPLATES[type], state.user.id), english: {},
    created_by: state.user.id, dirty: true, isNew: true, updated_local: Date.now(),
  };
  await idb.put('reports', r);
  scheduleSync(100);
  return r;
}

/** Abre un informe. Si hay copia en el dispositivo se abre al instante y se comprueba el servidor en segundo plano. */
export async function loadReport(id, { cachedFirst = true } = {}) {
  const local = await idb.get('reports', id);
  if (local && cachedFirst) {
    if (navigator.onLine && !local.isNew) refreshReport(id).catch(() => {});
    return local;
  }
  if (!navigator.onLine) return local || null;
  try {
    return await refreshReport(id);
  } catch (e) {
    if (local) return local;
    throw e;
  }
}

/** Trae la versión del servidor y la fusiona con la local sin perder cambios. */
export async function refreshReport(id) {
  const server = await api('getReport', { id });
  const local = await idb.get('reports', id);
  if (!local || (!local.dirty && Number(local.version) !== Number(server.version)) || !local.dirty && local.status !== server.status) {
    const r = { ...server, dirty: false };
    await idb.put('reports', r);
    if (local) emit('report-refreshed', { id });
    return r;
  }
  if (local.dirty && Number(server.version) !== Number(local.version)) {
    local.conflict = { version: server.version, updated_by: server.updated_by };
    await idb.put('reports', local);
    emit('report-state', { id });
  }
  if (local.status !== server.status || local.number !== server.number) {
    Object.assign(local, { status: server.status, number: server.number || local.number, review_comment: server.review_comment, snapshot: server.snapshot });
    await idb.put('reports', local);
  }
  return local;
}

export async function saveLocal(r) {
  // los campos que gestiona el servidor se toman siempre de la copia local más reciente
  const cur = await idb.get('reports', r.id);
  if (cur) { r.version = cur.version; r.number = cur.number || r.number; r.isNew = cur.isNew; r.status = cur.status || r.status; if (cur.conflict) r.conflict = cur.conflict; }
  r.dirty = true;
  r.updated_local = Date.now();
  await idb.put('reports', { ...r });
  emit('report-state', { id: r.id });
  scheduleSync(900);
}

export async function resolveConflict(r, keepMine) {
  if (keepMine) {
    const cur = (await idb.get('reports', r.id)) || r;
    cur.version = cur.conflict?.version ?? r.conflict?.version;
    delete cur.conflict; delete r.conflict;
    cur.data = r.data; cur.english = r.english; cur.dirty = true; cur.updated_local = Date.now();
    await idb.put('reports', cur);
    r.version = cur.version;
    scheduleSync(200);
    return r;
  }
  delete r.conflict;
  r.dirty = false;
  await idb.put('reports', r);
  return loadReport(r.id);
}

export async function localDrafts() {
  return (await idb.all('reports')).filter((r) => r.dirty);
}

// ---------------------------------------------------------------------
// Fotos (se guardan en el dispositivo y se suben cuando hay conexión)
// ---------------------------------------------------------------------
export async function listPhotos(reportId, { cachedFirst = false } = {}) {
  const localAll = () => idb.all('photos').then((all) => all.filter((p) => p.reportId === reportId));
  const visible = (arr) => arr.filter((p) => !p.deleted).sort((a, b) => a.sort - b.sort);
  const known = await kv.get(`ph-${reportId}`);
  if (cachedFirst && known) {
    if (navigator.onLine) refreshPhotos(reportId).catch(() => {});
    return visible(await localAll());
  }
  try { await refreshPhotos(reportId); } catch { /* sin conexión */ }
  return visible(await localAll());
}

/** Descarga la lista de fotos (sin imágenes) y la guarda en el dispositivo. */
async function refreshPhotos(reportId) {
  if (!navigator.onLine) return;
  const r = await idb.get('reports', reportId);
  if (!r || r.isNew) { await kv.set(`ph-${reportId}`, Date.now()); return; }
  const server = await api('listPhotos', { reportId });
  const local = (await idb.all('photos')).filter((p) => p.reportId === reportId);
  const map = new Map(local.map((p) => [p.id, p]));
  let changed = false;
  for (const s of server) {
    const l = map.get(s.id);
    if (!l) { await idb.put('photos', { id: s.id, reportId, category: s.category, caption: s.caption, sort: s.sort, annots: s.annots || [], uploaded: true }); changed = true; }
    else if (!l.pendingMeta && !l.deleted && (l.caption !== s.caption || l.sort !== s.sort || l.category !== s.category || JSON.stringify(l.annots || []) !== JSON.stringify(s.annots || []))) {
      Object.assign(l, { caption: s.caption, sort: s.sort, category: s.category, annots: s.annots || [] });
      await idb.put('photos', l); changed = true;
    }
  }
  // fotos borradas en otro dispositivo
  const ids = new Set(server.map((s) => s.id));
  for (const l of local) if (l.uploaded && !l.pendingMeta && !l.deleted && !ids.has(l.id)) { await idb.del('photos', l.id); changed = true; }
  await kv.set(`ph-${reportId}`, Date.now());
  if (changed) emit('photos-refreshed', { reportId });
}

/** Asegura que cada foto tenga su imagen (descarga de Drive y guarda en el dispositivo). */
export async function ensurePhotoData(photos, onProgress) {
  const missing = photos.filter((p) => !p.dataUrl);
  for (let i = 0; i < missing.length; i += 6) {
    const chunk = missing.slice(i, i + 6);
    const got = await api('getPhotos', { ids: chunk.map((p) => p.id) });
    for (const p of chunk) {
      if (got[p.id]) { p.dataUrl = got[p.id]; await idb.put('photos', { ...p }); }
    }
    onProgress?.(Math.min(missing.length, i + 6), missing.length);
  }
  return photos;
}

export async function addPhoto(reportId, category, dataUrl, sort) {
  const p = { id: uid(), reportId, category, caption: '', sort, dataUrl, uploaded: false };
  await idb.put('photos', p);
  emit('report-state', { id: reportId });
  scheduleSync(300);
  return p;
}

export async function updatePhoto(p, patch) {
  const cur = (await idb.get('photos', p.id)) || { ...p };
  Object.assign(cur, patch);
  if (cur.uploaded) { cur.pendingMeta = true; if (patch.dataUrl) cur.pendingImage = true; }
  await idb.put('photos', cur);
  scheduleSync(600);
  return cur;
}

export async function deletePhoto(p) {
  const cur = (await idb.get('photos', p.id)) || { ...p };
  if (!cur.uploaded) { await idb.del('photos', p.id); return; }
  cur.deleted = true;
  await idb.put('photos', cur);
  scheduleSync(300);
}

// ---------------------------------------------------------------------
// Sincronización
// ---------------------------------------------------------------------
let timer;
export function scheduleSync(ms = 1000) {
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}

export async function pendingCount() {
  const reps = (await idb.all('reports')).filter((r) => r.dirty && !r.conflict).length;
  const ph = (await idb.all('photos')).filter((p) => !p.uploaded || p.pendingMeta || p.deleted).length;
  return { reports: reps, photos: ph, total: reps + ph };
}

export async function sync() {
  if (state.syncing || !navigator.onLine || !getToken()) return;
  state.syncing = true;
  emit('sync', { state: 'running' });
  let failed = false;
  try {
    // 1. Informes
    for (const r of (await idb.all('reports')).filter((x) => x.dirty && !x.conflict)) {
      const stamp = r.updated_local;
      try {
        const res = await api('saveReport', { report: { id: r.id, type: r.type, data: r.data, english: r.english, version: r.version } });
        const cur = await idb.get('reports', r.id);
        Object.assign(cur, { version: res.version, number: res.number, status: res.status, isNew: false });
        if (cur.updated_local === stamp) cur.dirty = false;
        await idb.put('reports', cur);
        emit('report-state', { id: r.id });
      } catch (e) {
        if (e.code === 'conflict') {
          const cur = await idb.get('reports', r.id);
          cur.conflict = { version: null };
          try { const s = await api('getReport', { id: r.id }); cur.conflict = { version: s.version, updated_by: s.updated_by }; } catch { /* */ }
          await idb.put('reports', cur);
          emit('report-state', { id: r.id });
        } else { failed = true; state.lastError = e.message; if (e.code === 'offline') break; }
      }
    }
    // 2. Fotos
    const reports = new Map((await idb.all('reports')).map((r) => [r.id, r]));
    for (const p of await idb.all('photos')) {
      const rep = reports.get(p.reportId);
      if (rep && rep.isNew) continue; // el informe aún no existe en el servidor
      try {
        if (p.deleted) {
          await api('deletePhoto', { id: p.id });
          await idb.del('photos', p.id);
        } else if (!p.uploaded) {
          await api('uploadPhoto', { id: p.id, reportId: p.reportId, base64: p.dataUrl.split(',')[1], mime: 'image/jpeg', category: p.category, caption: p.caption, sort: p.sort, annots: p.annots || [] }, { timeout: 120000 });
          const cur = await idb.get('photos', p.id);
          if (cur) { cur.uploaded = true; if (cur.caption !== p.caption || cur.sort !== p.sort || JSON.stringify(cur.annots || []) !== JSON.stringify(p.annots || [])) cur.pendingMeta = true; await idb.put('photos', cur); }
        } else if (p.pendingMeta) {
          await api('updatePhoto', { id: p.id, caption: p.caption, sort: p.sort, category: p.category, annots: p.annots || [], base64: p.pendingImage ? p.dataUrl.split(',')[1] : undefined }, { timeout: 120000 });
          const cur = await idb.get('photos', p.id);
          if (cur && cur.caption === p.caption && cur.sort === p.sort && JSON.stringify(cur.annots || []) === JSON.stringify(p.annots || [])) { cur.pendingMeta = false; cur.pendingImage = false; await idb.put('photos', cur); }
        }
      } catch (e) {
        failed = true; state.lastError = e.message;
        if (e.code === 'offline') break;
      }
    }
  } finally {
    state.syncing = false;
    const pend = await pendingCount();
    emit('sync', { state: failed ? 'error' : pend.total ? 'pending' : 'done', pending: pend });
    if (failed && navigator.onLine) scheduleSync(15000);
    else if (pend.total) scheduleSync(3000);
  }
}

window.addEventListener('online', () => scheduleSync(500));
