// Fotos: hacer/elegir, pie de foto, ordenar, borrar y EDITAR (marcas movibles)
import { h, toast, compressImage, confirmBox } from './ui.js';
import { listPhotos, addPhoto, updatePhoto, deletePhoto, ensurePhotoData } from './store.js';
import { openPhotoEditor, thumbFor } from './annot.js';

export function photosField(report, category, ro) {
  const grid = h('div', { class: 'photos' }, h('div', { class: 'skel', style: { aspectRatio: '4/3' } }), h('div', { class: 'skel', style: { aspectRatio: '4/3' } }));
  const status = h('div', { class: 'muted small mt' });
  let photos = [];

  async function refresh() {
    photos = (await listPhotos(report.id, { cachedFirst: true })).filter((p) => p.category === category);
    draw();
    if (photos.some((p) => !p.dataUrl) && navigator.onLine) {
      status.textContent = 'Descargando fotos…';
      try { await ensurePhotoData(photos); status.textContent = ''; draw(); } catch { status.textContent = 'Algunas fotos se verán cuando haya conexión.'; }
    }
  }

  function draw() {
    grid.innerHTML = '';
    if (!photos.length) grid.appendChild(h('div', { class: 'muted', style: { gridColumn: '1 / -1' } }, 'Sin fotos todavía.'));
    photos.forEach((p, i) => {
      const img = h('img', { alt: '', loading: 'lazy', onclick: () => (!ro ? edit(p) : null) });
      thumbFor(p).then((src) => { img.src = src || ''; });
      grid.appendChild(h('div', { class: 'photo' },
        p.dataUrl ? img : h('div', { class: 'ph-empty' }, '☁'),
        !p.uploaded || p.pendingMeta ? h('span', { class: 'badge warn tiny' }, 'Por subir') : null,
        p.annots?.length ? h('span', { class: 'badge tiny' }, `${p.annots.length} marca(s)`) : null,
        h('input', { placeholder: 'Pie de foto', value: p.caption || '', disabled: ro, onchange: async (e) => { p.caption = e.target.value; await updatePhoto(p, { caption: p.caption }); } }),
        ro ? null : h('div', { class: 'tools' },
          h('button', { type: 'button', class: 'btn small', title: 'Mover a la izquierda', 'aria-label': 'Mover a la izquierda', onclick: () => move(i, -1) }, '◀'),
          h('button', { type: 'button', class: 'btn small', title: 'Editar / marcar', 'aria-label': 'Editar', disabled: !p.dataUrl, onclick: () => edit(p) }, '✎'),
          h('button', { type: 'button', class: 'btn small danger', title: 'Borrar', 'aria-label': 'Borrar', onclick: () => remove(p) }, '🗑'),
          h('button', { type: 'button', class: 'btn small', title: 'Mover a la derecha', 'aria-label': 'Mover a la derecha', onclick: () => move(i, 1) }, '▶'))));
    });
  }

  async function onFiles(files) {
    const list = [...(files || [])];
    let sort = photos.length ? Math.max(...photos.map((p) => p.sort)) + 1 : 0;
    for (const [n, f] of list.entries()) {
      status.textContent = `Preparando ${n + 1}/${list.length}…`;
      try { photos.push(await addPhoto(report.id, category, await compressImage(f), sort++)); draw(); }
      catch { toast(`No se pudo leer ${f.name} (formato no compatible)`); }
    }
    status.textContent = navigator.onLine ? 'Se suben solas en segundo plano.' : 'Sin conexión: se subirán al volver la cobertura.';
  }

  async function move(i, dir) {
    const j = i + dir; if (j < 0 || j >= photos.length) return;
    const a = photos[i], b = photos[j];
    [a.sort, b.sort] = [b.sort, a.sort];
    await updatePhoto(a, { sort: a.sort }); await updatePhoto(b, { sort: b.sort });
    photos.sort((x, y) => x.sort - y.sort); draw();
  }
  async function remove(p) {
    if (!(await confirmBox('¿Borrar esta foto?', 'Borrar'))) return;
    await deletePhoto(p); photos = photos.filter((x) => x.id !== p.id); draw();
  }
  function edit(p) {
    if (!p.dataUrl) return toast('La foto aún se está descargando');
    openPhotoEditor(p, {
      caption: p.caption || '',
      onSave: async (annots, caption) => {
        p.annots = annots; p.caption = caption;
        await updatePhoto(p, { annots, caption });
        draw();
      },
    });
  }

  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { onFiles(e.target.files); e.target.value = ''; } });
  const camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { onFiles(e.target.files); e.target.value = ''; } });
  refresh();
  return h('div', {}, grid,
    ro ? null : h('div', { class: 'row wrap mt' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => camInput.click() }, '📷 Hacer foto'),
      h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, '🖼 Galería')),
    fileInput, camInput, status);
}
