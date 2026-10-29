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
export async function bootstrap() {
  try {
    const b = await api('bootstrap');
    Object.assign(state, { user: b.user, people: b.people, catalog: b.catalog, config: b.config, logo: b.logo });
    await kv.set('boot', b);
    return true;
  } catch (e) {
    if (e.code === 'offline' && getToken()) {
      const b = await kv.get('boot');
      if (b) { Object.assign(state, { user: b.user, people: b.people, catalog: b.catalog, config: b.config, logo: b.logo }); return true; }
    }
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

/** Abre un informe: local si hay cambios sin subir, si no la versión del servidor. */
export async function loadReport(id) {
  const local = await idb.get('reports', id);
  if (!navigator.onLine) return local || null;
  try {
    const server = await api('getReport', { id });
    if (!local || !local.dirty) {
      const r = { ...server, dirty: false };
      await idb.put('reports', r);
      return r;
    }
    if (Number(server.version) !== Number(local.version)) {
      local.conflict = { version: server.version, updated_by: server.updated_by };
      await idb.put('reports', local);
    }
    return { ...local, status: server.status, number: server.number || local.number };
  } catch (e) {
    if (local) return local;
    throw e;
  }
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
export async function listPhotos(reportId) {
  const local = (await idb.all('photos')).filter((p) => p.reportId === reportId);
  let server = [];
  if (navigator.onLine) {
    const r = await idb.get('reports', reportId);
    if (r && !r.isNew) {
      try { server = await api('listPhotos', { reportId }); } catch { /* sin conexión */ }
    }
  }
  const map = new Map(local.map((p) => [p.id, p]));
  for (const s of server) {
    const l = map.get(s.id);
    if (!l) map.set(s.id, { id: s.id, reportId, category: s.category, caption: s.caption, sort: s.sort, uploaded: true });
    else if (!l.pendingMeta && !l.deleted) Object.assign(l, { caption: s.caption, sort: s.sort, category: s.category });
  }
  return [...map.values()].filter((p) => !p.deleted).sort((a, b) => a.sort - b.sort);
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
          await api('uploadPhoto', { id: p.id, reportId: p.reportId, base64: p.dataUrl.split(',')[1], mime: 'image/jpeg', category: p.category, caption: p.caption, sort: p.sort }, { timeout: 120000 });
          const cur = await idb.get('photos', p.id);
          if (cur) { cur.uploaded = true; if (cur.caption !== p.caption || cur.sort !== p.sort) cur.pendingMeta = true; await idb.put('photos', cur); }
        } else if (p.pendingMeta) {
          await api('updatePhoto', { id: p.id, caption: p.caption, sort: p.sort, category: p.category, base64: p.pendingImage ? p.dataUrl.split(',')[1] : undefined }, { timeout: 120000 });
          const cur = await idb.get('photos', p.id);
          if (cur) { cur.pendingMeta = false; cur.pendingImage = false; await idb.put('photos', cur); }
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
