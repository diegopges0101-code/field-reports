// Fotos: hacer/elegir, pie de foto, ordenar, borrar y MARCAS numeradas (círculos y flechas)
import { h, modal, toast, compressImage, confirmBox } from './ui.js';
import { listPhotos, addPhoto, updatePhoto, deletePhoto, ensurePhotoData } from './store.js';

export function photosField(report, category, ro) {
  const grid = h('div', { class: 'photos' }, h('div', { class: 'muted' }, 'Cargando fotos…'));
  const status = h('div', { class: 'muted small mt' });
  let photos = [];

  async function refresh() {
    photos = (await listPhotos(report.id)).filter((p) => p.category === category);
    draw();
    if (photos.some((p) => !p.dataUrl) && navigator.onLine) {
      try { await ensurePhotoData(photos); draw(); } catch { status.textContent = 'Algunas fotos se verán cuando haya conexión.'; }
    }
  }

  function draw() {
    grid.innerHTML = '';
    if (!photos.length) grid.appendChild(h('div', { class: 'muted' }, 'Sin fotos todavía.'));
    photos.forEach((p, i) => {
      grid.appendChild(h('div', { class: 'photo' },
        p.dataUrl ? h('img', { src: p.dataUrl, alt: '', onclick: () => !ro && annotate(p) }) : h('div', { class: 'ph-empty' }, '☁'),
        !p.uploaded ? h('div', { class: 'badge warn tiny' }, 'Pendiente de subir') : null,
        h('input', { placeholder: 'Pie de foto (opcional)', value: p.caption || '', disabled: ro, onchange: async (e) => { p.caption = e.target.value; await updatePhoto(p, { caption: p.caption }); } }),
        ro ? null : h('div', { class: 'row between' },
          h('button', { type: 'button', class: 'btn small', title: 'Mover a la izquierda', onclick: () => move(i, -1) }, '◀'),
          h('button', { type: 'button', class: 'btn small', title: 'Marcas', onclick: () => annotate(p), disabled: !p.dataUrl }, '✎ Marcas'),
          h('button', { type: 'button', class: 'btn small danger', onclick: () => remove(p) }, '🗑'),
          h('button', { type: 'button', class: 'btn small', title: 'Mover a la derecha', onclick: () => move(i, 1) }, '▶'))));
    });
  }

  async function onFiles(files) {
    const list = [...(files || [])];
    let sort = photos.length ? Math.max(...photos.map((p) => p.sort)) + 1 : 0;
    for (const [n, f] of list.entries()) {
      status.textContent = `Procesando ${n + 1}/${list.length}…`;
      try { photos.push(await addPhoto(report.id, category, await compressImage(f), sort++)); draw(); }
      catch { toast(`No se pudo leer ${f.name} (formato no compatible)`); }
    }
    status.textContent = navigator.onLine ? 'Las fotos se suben en segundo plano.' : 'Sin conexión: las fotos se subirán al volver la cobertura.';
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
  function annotate(p) {
    openAnnotator(p.dataUrl, p.caption || '', async (dataUrl, caption) => {
      p.dataUrl = dataUrl; p.caption = caption;
      await updatePhoto(p, { dataUrl, caption });
      draw();
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

// ---------------------------------------------------------------------
// Editor de marcas: toca para poner un círculo numerado; arrastra para dibujar una flecha.
// La leyenda de cada número se añade al pie de foto.
// ---------------------------------------------------------------------
export function openAnnotator(src, caption, onSave) {
  const canvas = h('canvas', { class: 'annot-canvas' });
  const ctx2 = canvas.getContext('2d');
  const img = new Image();
  const marks = [];
  let tool = 'circle';
  let color = '#e53935';
  let drag = null;
  const legendBox = h('div', { class: 'stack' });
  const capInput = h('input', { value: caption, placeholder: 'Pie de foto' });

  img.onload = () => { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; redraw(); };
  img.src = src;

  const size = () => Math.max(canvas.width, canvas.height) / 28;
  function redraw(preview) {
    ctx2.drawImage(img, 0, 0);
    [...marks, ...(preview ? [preview] : [])].forEach((m) => {
      ctx2.strokeStyle = m.color; ctx2.fillStyle = m.color; ctx2.lineWidth = size() / 4;
      if (m.type === 'circle') {
        ctx2.beginPath(); ctx2.arc(m.x, m.y, size(), 0, Math.PI * 2); ctx2.fill();
        ctx2.fillStyle = '#fff'; ctx2.font = `bold ${size() * 1.15}px sans-serif`; ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
        ctx2.fillText(String(m.n), m.x, m.y + size() * 0.05);
      } else {
        const ang = Math.atan2(m.y2 - m.y, m.x2 - m.x), hl = size() * 1.2;
        ctx2.beginPath(); ctx2.moveTo(m.x, m.y); ctx2.lineTo(m.x2, m.y2); ctx2.stroke();
        ctx2.beginPath(); ctx2.moveTo(m.x2, m.y2);
        ctx2.lineTo(m.x2 - hl * Math.cos(ang - 0.45), m.y2 - hl * Math.sin(ang - 0.45));
        ctx2.lineTo(m.x2 - hl * Math.cos(ang + 0.45), m.y2 - hl * Math.sin(ang + 0.45));
        ctx2.closePath(); ctx2.fill();
      }
    });
  }
  function drawLegend() {
    legendBox.innerHTML = '';
    marks.filter((m) => m.type === 'circle').forEach((m) => {
      legendBox.appendChild(h('div', { class: 'row' }, h('span', { class: 'num', style: { background: m.color } }, m.n),
        h('input', { placeholder: `Qué señala el ${m.n}`, value: m.text || '', oninput: (e) => { m.text = e.target.value; } })));
    });
  }
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] || e.changedTouches[0] : e;
    return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
  };
  const start = (e) => { e.preventDefault(); const p = pos(e); drag = { x: p.x, y: p.y, x2: p.x, y2: p.y }; };
  const moveEv = (e) => { if (!drag) return; e.preventDefault(); const p = pos(e); drag.x2 = p.x; drag.y2 = p.y; if (tool === 'arrow') redraw({ type: 'arrow', color, ...drag }); };
  const end = (e) => {
    if (!drag) return; e.preventDefault();
    if (tool === 'arrow' && Math.hypot(drag.x2 - drag.x, drag.y2 - drag.y) > size()) marks.push({ type: 'arrow', color, ...drag });
    if (tool === 'circle') marks.push({ type: 'circle', color, x: drag.x, y: drag.y, n: marks.filter((m) => m.type === 'circle').length + 1, text: '' });
    drag = null; redraw(); drawLegend();
  };
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', moveEv); window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', moveEv, { passive: false }); canvas.addEventListener('touchend', end, { passive: false });

  const toolBtn = (t, label) => h('button', { type: 'button', class: `chip ${tool === t ? 'on' : ''}`, 'data-tool': t, onclick: (e) => { tool = t; e.target.parentNode.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); } }, label);
  const colorBtn = (c) => h('button', { type: 'button', class: 'swatch', style: { background: c }, onclick: () => { color = c; } });

  const m = modal('Marcas en la foto', h('div', { class: 'stack' },
    h('div', { class: 'row wrap' }, toolBtn('circle', '① Número'), toolBtn('arrow', '➜ Flecha'), colorBtn('#e53935'), colorBtn('#fdd835'), colorBtn('#1e88e5'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { marks.pop(); redraw(); drawLegend(); } }, '↶ Deshacer')),
    h('div', { class: 'muted small' }, 'Toca la foto para poner un número; con "Flecha", arrastra desde el inicio hasta la punta.'),
    canvas, legendBox, capInput), [
    h('button', { class: 'btn', onclick: () => { window.removeEventListener('mouseup', end); m.close(); } }, 'Cancelar'),
    h('button', {
      class: 'btn primary', onclick: () => {
        const legend = marks.filter((x) => x.type === 'circle' && x.text).map((x) => `${x.n}: ${x.text}`).join('; ');
        const cap = [capInput.value.trim(), legend].filter(Boolean).join(' — ');
        window.removeEventListener('mouseup', end);
        onSave(canvas.toDataURL('image/jpeg', 0.85), cap);
        m.close();
      },
    }, 'Guardar'),
  ]);
  m.el.classList.add('wide');
}
