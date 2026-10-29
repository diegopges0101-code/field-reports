import { h, toast, modal, copyText, downloadBlob, confirmBox, promptBox, blobToBase64 } from '../ui.js';
import { api } from '../api.js';
import { idb } from '../db.js';
import { state, listPhotos, ensurePhotoData, sync, pendingCount } from '../store.js';
import { TEMPLATES, missingRequired } from '../templates.js';
import { buildDoc, emailSubject, emailBody, whatsappText } from '../english.js';
import { buildPdf } from '../pdf.js';
import { renderAnnotated } from '../annot.js';

function peopleFor(r) {
  const src = r.status === 'issued' && r.snapshot?.people ? r.snapshot.people : state.people;
  return src.map((p) => ({ id: p.id, full_name: p.name }));
}
function configFor(r) { return r.status === 'issued' && r.snapshot?.config ? r.snapshot.config : state.config; }

async function makeModel(r) {
  const photos = await listPhotos(r.id, { cachedFirst: true });
  return { model: buildDoc({ report: r, photos, people: peopleFor(r) }), photos };
}

export async function generatePdf(r, onProgress) {
  const { model, photos } = await makeModel(r);
  if (photos.some((p) => !p.dataUrl)) {
    if (!navigator.onLine) throw new Error('Faltan fotos que no están en este dispositivo y no hay conexión');
    await ensurePhotoData(photos, (a, b) => onProgress?.(`Descargando fotos ${a}/${b}…`));
  }
  onProgress?.('Creando PDF…');
  // Las marcas se dibujan sobre la foto con sus textos en inglés
  const en = r.english || {};
  const photoData = {};
  for (const p of photos.filter((x) => x.dataUrl)) {
    const tr = (a) => { const e = en[`photo.${p.id}.a.${a.id}`]; return e && e.src === (a.text || '').trim() && e.en?.trim() ? e.en.trim() : a.text; };
    photoData[p.id] = p.annots?.length ? await renderAnnotated(p.dataUrl, p.annots, { maxSide: 1800, quality: 0.86, tr }) : p.dataUrl;
  }
  const cfg = configFor(r);
  const bytes = await buildPdf(model, { companyName: cfg.company_name, footer: cfg.footer_text, contactLine: cfg.contact_line, logo: state.logo, photoData });
  return { blob: new Blob([bytes], { type: 'application/pdf' }), model };
}

export function outputsStep(r, { onChanged }) {
  const box = h('div', { class: 'stack' });
  const tpl = TEMPLATES[r.type];
  const cfg = configFor(r);
  const u = state.user;
  const signature = [u.name, u.job_title, cfg.signature || cfg.company_name].filter(Boolean).join('\n');

  (async () => {
    const { model } = await makeModel(r);
    const missing = missingRequired(tpl, r.data);
    const busy = (btn, txt) => { const old = btn.textContent; btn.disabled = true; btn.textContent = txt; return () => { btn.disabled = false; btn.textContent = old; }; };

    if (missing.length) box.appendChild(h('div', { class: 'warn' }, h('strong', {}, 'Faltan campos obligatorios:'), h('ul', {}, missing.map((m) => h('li', {}, `${m.step}: ${m.label}`)))));
    if (model.warnings.length) box.appendChild(h('div', { class: 'warn' }, h('strong', {}, 'Textos sin traducir'), ' (saldrán en el idioma original; ve a "Revisar inglés"):', h('ul', {}, model.warnings.map((w) => h('li', {}, w.replace('Sin traducir: ', ''))))));

    // ---------- PDF ----------
    const status = h('div', { class: 'muted small' }, `Archivo: ${model.fileName}`);
    const withPdf = async (btn, fn) => {
      const done = busy(btn, 'Generando…');
      try { const res = await generatePdf(r, (t) => { status.textContent = t; }); status.textContent = `Archivo: ${res.model.fileName}`; await fn(res); }
      catch (e) { toast('Error con el PDF: ' + e.message); status.textContent = e.message; }
      done();
    };
    const sharePdf = (btn) => withPdf(btn, async ({ blob, model: m }) => {
      const file = new File([blob], m.fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: m.fileName }); api('logComm', { reportId: r.id, channel: 'share', what: 'opened' }).catch(() => {}); toast('Menú de compartir abierto. El envío lo confirmas tú.'); }
        catch (e) { if (e.name !== 'AbortError') toast(e.message); }
      } else { downloadBlob(blob, m.fileName); toast('Este dispositivo no comparte archivos: se ha descargado el PDF.'); }
    });
    box.appendChild(h('div', { class: 'card' }, h('h4', {}, '📄 PDF'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: (e) => sharePdf(e.target) }, 'Compartir PDF'),
        h('button', { class: 'btn', onclick: (e) => withPdf(e.target, ({ blob, model: m }) => downloadBlob(blob, m.fileName)) }, 'Descargar'),
        h('button', { class: 'btn', onclick: (e) => withPdf(e.target, ({ blob }) => {
          const url = URL.createObjectURL(blob);
          const m = modal('Vista previa', h('iframe', { class: 'pdf-frame', src: url, title: 'PDF' }));
          m.el.classList.add('wide');
        }) }, 'Vista previa')),
      status));

    // ---------- Correo ----------
    const to = h('input', { type: 'email', value: r.data.recipient_email || '' });
    const cc = h('input', { value: cfg.default_cc || '' });
    const bcc = h('input', { value: '' });
    const subject = h('input', { value: emailSubject(model) });
    const body = h('textarea', { rows: 12 }, emailBody(model, { signature, pdfAttached: true }));
    const copy = async (txt, what, ch) => { if (await copyText(txt)) { toast(`${what} copiado`); api('logComm', { reportId: r.id, channel: ch, what: 'copied' }).catch(() => {}); } else toast('No se pudo copiar'); };
    const sendMail = (btn) => withPdf(btn, async ({ blob, model: m }) => {
      if (!to.value.trim()) return toast('Falta el destinatario');
      if (!(await confirmBox(`Enviar ahora a ${to.value} con el PDF adjunto desde la cuenta de Google de la empresa?`, 'Enviar'))) return;
      const res = await api('sendEmail', { reportId: r.id, to: to.value, cc: cc.value, bcc: bcc.value, subject: subject.value, body: body.value, pdfBase64: await blobToBase64(blob), fileName: m.fileName }, { timeout: 120000 });
      toast(`Correo aceptado por Google (quedan ${res.remaining} hoy). "Aceptado" no garantiza que se haya entregado.`, 7000);
    });
    box.appendChild(h('div', { class: 'card' }, h('h4', {}, '✉️ Correo (en inglés)'),
      h('div', { class: 'form-grid' },
        h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Para'), to),
        h('div', { class: 'field half' }, h('label', { class: 'label' }, 'CC'), cc),
        h('div', { class: 'field half' }, h('label', { class: 'label' }, 'CCO'), bcc),
        h('div', { class: 'field full' }, h('label', { class: 'label' }, 'Asunto'), subject),
        h('div', { class: 'field full' }, h('label', { class: 'label' }, 'Cuerpo'), body)),
      h('div', { class: 'row wrap mt' },
        h('button', { class: 'btn', onclick: () => copy(subject.value, 'Asunto', 'email') }, 'Copiar asunto'),
        h('button', { class: 'btn', onclick: () => copy(body.value, 'Cuerpo', 'email') }, 'Copiar cuerpo'),
        h('button', { class: 'btn', onclick: () => copy(`${subject.value}\n\n${body.value}`, 'Asunto y cuerpo', 'email') }, 'Copiar todo'),
        h('button', { class: 'btn', onclick: () => {
          const url = `mailto:${encodeURIComponent(to.value)}?${cc.value ? `cc=${encodeURIComponent(cc.value)}&` : ''}subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(body.value)}`;
          if (url.length > 1900) toast('Texto largo: si el correo sale cortado, usa "Copiar cuerpo".');
          api('logComm', { reportId: r.id, channel: 'email', what: 'opened' }).catch(() => {});
          location.href = url.slice(0, 8000);
        } }, 'Abrir en mi correo'),
        h('button', { class: 'btn primary', onclick: (e) => sendMail(e.target) }, 'Enviar con PDF desde la app'))));

    // ---------- WhatsApp ----------
    const phone = h('input', { inputmode: 'tel', placeholder: 'Opcional, con prefijo: 34600123456' });
    const wa = h('textarea', { rows: 10 }, whatsappText(model));
    box.appendChild(h('div', { class: 'card' }, h('h4', {}, '💬 WhatsApp (en inglés)'),
      h('div', { class: 'form-grid' }, h('div', { class: 'field half' }, h('label', { class: 'label' }, 'Teléfono'), phone), h('div', { class: 'field full' }, wa)),
      h('div', { class: 'row wrap mt' },
        h('button', { class: 'btn', onclick: () => copy(wa.value, 'Mensaje', 'whatsapp') }, 'Copiar mensaje'),
        h('button', { class: 'btn primary', onclick: () => { api('logComm', { reportId: r.id, channel: 'whatsapp', what: 'opened' }).catch(() => {}); window.open(`https://wa.me/${phone.value.replace(/\D/g, '')}?text=${encodeURIComponent(wa.value)}`, '_blank'); } }, 'Abrir WhatsApp con el texto'),
        h('button', { class: 'btn', onclick: (e) => sharePdf(e.target) }, 'Compartir PDF')),
      h('div', { class: 'muted small mt' }, 'Abrir WhatsApp no envía nada: confirma tú el envío allí y adjunta el PDF.')));

    // ---------- Estado ----------
    const manager = u.role !== 'technician';
    const needApproval = String(cfg.require_approval) === 'true';
    const change = async (btn, to, extra = {}) => {
      const done = busy(btn, '…');
      try {
        await sync();
        const pend = await pendingCount();
        const cur = await idb.get('reports', r.id);
        if (cur?.dirty || cur?.isNew) throw new Error('Hay cambios sin subir. Necesitas conexión para cambiar el estado.');
        const res = await api('setStatus', { id: r.id, status: to, ...extra });
        await idb.put('reports', { ...res, dirty: false });
        if (to === 'issued') {
          const { blob, model: m } = await generatePdf(res);
          await api('savePdf', { reportId: r.id, base64: await blobToBase64(blob), fileName: m.fileName }, { timeout: 120000 });
          downloadBlob(blob, m.fileName);
          toast('Informe emitido y PDF archivado en Drive. Emitir no significa enviarlo.', 6000);
        } else toast('Estado actualizado');
        void pend;
        await onChanged();
        location.reload();
      } catch (e) { toast(e.message); }
      done();
    };
    const actions = [];
    if (['draft', 'changes_requested'].includes(r.status) && needApproval) actions.push(h('button', { class: 'btn', onclick: (e) => change(e.target, 'ready_for_review') }, 'Enviar a revisión'));
    if (manager && r.status === 'ready_for_review') {
      actions.push(h('button', { class: 'btn', onclick: (e) => change(e.target, 'approved') }, 'Aprobar'));
      actions.push(h('button', { class: 'btn', onclick: async (e) => { const c = await promptBox('Pedir correcciones', '¿Qué hay que corregir?'); if (c) change(e.target, 'changes_requested', { comment: c }); } }, 'Pedir correcciones'));
    }
    const canIssue = manager ? r.status !== 'archived' && r.status !== 'issued' : (needApproval ? r.status === 'approved' : ['draft', 'ready_for_review', 'changes_requested'].includes(r.status));
    if (canIssue) actions.push(h('button', { class: 'btn primary', onclick: async (e) => {
      if (missing.length) return toast('Faltan campos obligatorios');
      if (await confirmBox('Al emitir, el informe queda bloqueado y se archiva el PDF en Drive. Emitir NO significa enviarlo. ¿Continuar?', 'Emitir')) change(e.target, 'issued');
    } }, 'Emitir informe'));
    if (manager && r.status === 'issued') actions.push(h('button', { class: 'btn', onclick: (e) => change(e.target, 'draft') }, 'Reabrir'));
    if (manager && r.status !== 'archived') actions.push(h('button', { class: 'btn', onclick: (e) => change(e.target, 'archived') }, 'Archivar'));
    if (manager && r.status === 'archived') actions.push(h('button', { class: 'btn', onclick: (e) => change(e.target, 'draft') }, 'Desarchivar'));
    if (r.status === 'draft' && (u.role === 'admin' || r.created_by === u.id)) actions.push(h('button', { class: 'btn danger', onclick: async () => {
      if (!(await confirmBox('¿Borrar este borrador y sus fotos? No se puede deshacer.', 'Borrar'))) return;
      try { if (!r.isNew) await api('deleteReport', { id: r.id }); await idb.del('reports', r.id); toast('Borrado'); location.hash = '#/'; } catch (e) { toast(e.message); }
    } }, 'Borrar borrador'));
    box.appendChild(h('div', { class: 'card' }, h('h4', {}, 'Estado del informe'), actions.length ? h('div', { class: 'row wrap' }, actions) : h('p', { class: 'muted' }, 'No hay acciones disponibles en este estado.')));
  })().catch((e) => box.appendChild(h('div', { class: 'error' }, e.message)));
  return box;
}
