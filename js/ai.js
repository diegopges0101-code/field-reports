// =====================================================================
//  Asistente IA (ChatGPT o Gemini) SIN coste para la empresa: la app prepara
//  la instrucción con el contexto del informe y la abre en el ChatGPT / Gemini
//  de cada técnico (su propia cuenta). La respuesta se pega de vuelta.
//  Nunca se envían emails, teléfonos, IP ni números de serie.
// =====================================================================
import { h, toast, modal, copyText, downloadBlob, dataUrlToBytes } from './ui.js';
import { TEMPLATES } from './templates.js';
import { state, listPhotos } from './store.js';
import { STICKERS } from './stickers.js';
import { renderAnnotated } from './annot.js';
import { icon } from './svg.js';

const LS = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } } };

export const PROVIDERS = {
  chatgpt: { name: 'ChatGPT', open: (q) => `https://chatgpt.com/${q && q.length < 5500 ? '?q=' + encodeURIComponent(q) : ''}`, prefill: true },
  gemini: { name: 'Gemini', open: () => 'https://gemini.google.com/app', prefill: false },
};
export const aiEnabled = () => String(state.config?.ai_enabled ?? 'true') !== 'false';
const provider = () => (PROVIDERS[LS.get('fr_ai', 'chatgpt')] ? LS.get('fr_ai', 'chatgpt') : 'chatgpt');

// Datos que NUNCA salen de la app
const NEVER = new Set(['client_contact', 'recipient_email', 'technicians', 'supervisor', 'ip', 'mask', 'gateway', 'dns', 'contract', 'gps']);
const CLIENT_DATA = new Set(['client', 'site_code', 'site_name', 'address', 'postcode']);
const SKIP_TYPES = new Set(['info', 'photos', 'people']);

const optLabel = (f, v) => (f.options || []).find((o) => o.v === v)?.es || v;
const other = (d, f, v) => (v === '__other' ? d[`${f.key}_other`] || '' : v);
const kindEs = { antenna: 'Antena', router: 'Router', cable: 'Cable', accessory: 'Accesorio', sim: 'Tarjeta SIM' };

function valueText(f, v, d) {
  if (v == null || v === '') return '';
  switch (f.type) {
    case 'select': return optLabel(f, other(d, f, v));
    case 'catalogSelect': return other(d, f, v);
    case 'toggle': return v === true ? 'Sí' : v === false ? 'No' : '';
    case 'number': return `${v}${f.unit ? ' ' + f.unit : ''}`;
    case 'chips': return [...(v.values || []).map((x) => optLabel(f, x)), v.other].filter(Boolean).join(', ');
    case 'antennaMount': return [v.antenna, v.mount === '__other' ? v.mountOther : v.mount].filter(Boolean).join(' – montura: ');
    case 'equipment': return (v || []).map((e) => [kindEs[e.kind] || e.kind, e.model === '__other' ? e.modelOther : e.model, e.mount && `montura ${e.mount === '__other' ? e.mountOther : e.mount}`, e.qty > 1 && `x${e.qty}`, e.notes].filter(Boolean).join(' ')).filter(Boolean).join('; ');
    case 'segments': { const t = (v || []).reduce((a, s) => a + (Number(s.length) || 0), 0); return (v || []).map((s) => `${s.desc || 'tramo'} ${s.length ?? '?'} m`).join(', ') + (t ? ` (total ${t} m)` : ''); }
    case 'antennaTests': {
      const ants = (d.equipment || []).filter((e) => e.kind === 'antenna');
      return Object.entries(v || {}).map(([k, t], i) => {
        const n = ants.findIndex((a) => a.id === k);
        return `antena ${n >= 0 ? n + 1 : i + 1}: ${[t.status, t.obstructions && `obstrucciones ${t.obstructions}`, t.down && `${t.down} Mbps bajada`, t.up && `${t.up} Mbps subida`, t.latency && `${t.latency} ms`, t.notes].filter(Boolean).join(', ')}`;
      }).join('; ');
    }
    default: return String(v).trim();
  }
}

const ANN_ES = { callout: 'Señal con texto', route: 'Recorrido de cable', arrow: 'Flecha', line: 'Línea', rect: 'Recuadro', circle: 'Círculo', number: 'Número', text: 'Texto', sticker: 'Equipo dibujado' };
function annotText(a, all) {
  const name = (id) => { const s = all.find((x) => x.id === id); return s ? STICKERS[s.kind]?.name : null; };
  if (a.type === 'sticker') return `${STICKERS[a.kind]?.name || 'Equipo'}${a.ghost ? ' (posición propuesta)' : ''}${a.text ? ` «${a.text}»` : ''}`;
  if (a.type === 'route') {
    const L = String(a.lengths || '').split(/[,;]/).map((x) => parseFloat(x)).filter((x) => !isNaN(x));
    const from = a.links?.v0 && name(a.links.v0.s), last = a.links?.[`v${(a.pts || []).length - 1}`], to = last && name(last.s);
    return `Recorrido de cable${L.length ? ` ${L.join(' m + ')} m (total ${L.reduce((x, y) => x + y, 0)} m)` : ''}${a.dashed ? ' discontinuo' : ''}${from ? ` desde ${from}` : ''}${to ? ` hasta ${to}` : ''}${a.text ? ` «${a.text}»` : ''}`;
  }
  if (a.type === 'number') return `Número ${a.n}${a.text ? ` «${a.text}»` : ''}`;
  return a.text ? `${ANN_ES[a.type] || a.type} «${a.text}»` : '';
}

/** Resumen del informe en español para dar contexto a la IA */
export function reportContext(r, photos = [], { hideClient = false } = {}) {
  const t = TEMPLATES[r.type], d = r.data || {};
  const L = [`Tipo de documento: ${r.type === 'survey' ? 'Survey (visita técnica previa) para una instalación Starlink/Peplink' : 'Informe de instalación Starlink/Peplink'}.`];
  const place = [d.city, d.region, d.country].filter(Boolean).join(', ');
  if (place) L.push(`Ubicación: ${place}.`);
  for (const s of t.steps) {
    const rows = [];
    for (const f of s.fields) {
      if (SKIP_TYPES.has(f.type) || NEVER.has(f.key) || (hideClient && CLIENT_DATA.has(f.key)) || ['city', 'region', 'region_code', 'country', 'country_code'].includes(f.key)) continue;
      if (f.showIf && !f.showIf(d)) continue;
      const txt = valueText(f, d[f.key], d);
      if (txt) rows.push(`- ${f.label}: ${txt}`);
    }
    if (rows.length) L.push(`\n[${s.title}]`, ...rows);
  }
  const ph = photos.filter((p) => p.caption || p.annots?.length);
  if (ph.length) {
    L.push('\n[Fotos y lo marcado en ellas]');
    photos.forEach((p, i) => {
      const marks = (p.annots || []).map((a) => annotText(a, p.annots)).filter(Boolean);
      if (p.caption || marks.length) L.push(`- Foto ${i + 1}${p.category ? ` (${p.category.toLowerCase()})` : ''}${p.caption ? `: «${p.caption}»` : ''}${marks.length ? `. Marcas: ${marks.join('; ')}` : ''}`);
    });
  }
  return L.join('\n');
}

const RULES = 'Usa SOLO los datos que te doy: no inventes medidas, resultados, pruebas ni equipos. Si falta algún dato importante, indícalo al final entre corchetes.';
const ROLE = 'Eres un técnico experto en instalaciones de Starlink y routers Peplink que redacta informes profesionales.';

function fieldPrompt(r, field, current, extra, ctxText) {
  return `${ROLE}\nRedacta el texto del campo «${field.label}» de este informe. Escribe en español, en tono técnico, claro y profesional, con frases cortas (máximo 5-6 frases o una lista breve si encaja mejor). ${RULES}\n` +
    (current ? `\nLo que ya he escrito (mejóralo y complétalo, sin perder información):\n«${current}»\n` : '') +
    (extra ? `\nIndicaciones del técnico: ${extra}\n` : '') +
    `\nResponde SOLO con el texto final, sin títulos ni comentarios.\n\nDATOS DEL INFORME:\n${ctxText}`;
}
function conclusionPrompt(r, fields, extra, ctxText) {
  return `${ROLE}\nCon los datos de este ${r.type === 'survey' ? 'survey' : 'informe de instalación'}, redacta los siguientes apartados en español, en tono técnico y profesional. ${RULES}\n` +
    (extra ? `\nIndicaciones del técnico: ${extra}\n` : '') +
    `\nResponde EXACTAMENTE con este formato (un título por apartado, sin texto antes ni después):\n${fields.map((f) => `## ${f.label}\n(texto)`).join('\n')}\n\nDATOS DEL INFORME:\n${ctxText}`;
}
function freePrompt(r, question, ctxText) {
  return `${ROLE}\n${question || 'Revisa este informe y dime qué falta o qué se podría mejorar.'}\nResponde en español. ${RULES}\n\nDATOS DEL INFORME:\n${ctxText}`;
}
function imagePrompt(desc, withPhoto, ctxShort) {
  return withPhoto
    ? `Edita la foto adjunta para hacer un replanteo fotorrealista de la instalación: ${desc}.\nMantén la foto igual (mismo encuadre, luz, perspectiva y escala); añade solo lo indicado, con aspecto real y bien integrado. Si la foto tiene marcas o dibujos encima, úsalos como guía de dónde va cada cosa y elimínalos en el resultado. No añadas textos, logotipos ni marcas de agua.${ctxShort ? `\nContexto técnico: ${ctxShort}` : ''}`
    : `Genera una imagen fotorrealista para un informe técnico: ${desc}.\nAspecto de foto real, a escala y sin textos, logotipos ni marcas de agua.${ctxShort ? `\nContexto técnico: ${ctxShort}` : ''}`;
}

/** Abre la IA elegida con la instrucción (copiada también al portapapeles) */
async function launch(prompt) {
  const p = PROVIDERS[provider()];
  await copyText(prompt);
  window.open(p.open(prompt), '_blank', 'noopener');
  toast(p.prefill ? `Abriendo ${p.name}. Si no aparece escrito, mantén pulsado y «Pegar».` : `Instrucción copiada. En ${p.name}, mantén pulsado el cuadro de texto y «Pegar».`, 6000);
}

async function readClipboard() {
  try { const t = await navigator.clipboard.readText(); return t || ''; } catch { return null; }
}

// Partes de una respuesta con "## Título"
function splitSections(text, fields) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
  const out = {}; let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:#{1,4}\s*|\*\*)(.+?)(?:\*\*)?\s*:?\s*$/);
    const f = m && fields.find((x) => norm(x.label) === norm(m[1]));
    if (f) { cur = f.key; out[cur] = []; continue; }
    if (cur) out[cur].push(line);
  }
  Object.keys(out).forEach((k) => { out[k] = out[k].join('\n').trim(); if (!out[k]) delete out[k]; });
  return out;
}

const cleanAnswer = (t) => String(t || '').replace(/^\s*["«]|["»]\s*$/g, '').trim();

// ---------------------------------------------------------------------
// Ventana del asistente
// ---------------------------------------------------------------------
/**
 * opts: { ctx (formulario), report, field (campo de texto), mode: 'field'|'conclusion'|'free'|'image', photo, onAddImage(files) }
 */
export async function openAssistant(opts) {
  const r = opts.report || opts.ctx?.report;
  if (!aiEnabled()) return toast('El asistente IA está desactivado por el administrador');
  let mode = opts.mode || (opts.field ? 'field' : 'free');
  let hideClient = LS.get('fr_ai_hide', '0') === '1';
  const body = h('div', { class: 'ai stack' });
  const m = modal('Asistente IA', body);
  m.el.classList.add('ai-modal');
  const photos = await listPhotos(r.id, { cachedFirst: true }).catch(() => []);
  const tpl = TEMPLATES[r.type];
  const step = tpl.steps.find((s) => s.id === (r.type === 'survey' ? 'conclusion' : 'result')) || tpl.steps.find((s) => /Conclus|Result/.test(s.title));
  const conclFields = (step?.fields || []).filter((f) => f.type === 'textarea' && (!f.showIf || f.showIf(r.data)));

  function draw() {
    const prov = provider();
    body.replaceChildren();
    // proveedor
    body.appendChild(h('div', { class: 'ai-prov' },
      h('span', { class: 'muted small' }, 'Usar con tu cuenta de:'),
      h('div', { class: 'seg' }, Object.entries(PROVIDERS).map(([k, p]) => h('button', { type: 'button', class: k === prov ? 'on' : '', onclick: () => { LS.set('fr_ai', k); draw(); } }, p.name)))));
    // modos
    const modes = [opts.field ? ['field', 'Este campo'] : null, ['conclusion', 'Conclusiones'], ['free', 'Pregunta'], ['image', 'Imagen']].filter(Boolean);
    body.appendChild(h('div', { class: 'chips ai-modes' }, modes.map(([k, l]) => h('button', { type: 'button', class: `chip ${mode === k ? 'on' : ''}`, onclick: () => { mode = k; draw(); } }, l))));

    const ctxText = () => reportContext(r, photos, { hideClient });
    const extra = h('textarea', { rows: 3 });
    let main, prompt;
    let withPhoto = !!opts.photo;
    if (mode === 'field') {
      const cur = String(r.data[opts.field.key] || '').trim();
      body.appendChild(h('p', { class: 'muted small' }, `Redacta «${opts.field.label}» usando todo lo que has rellenado y marcado en las fotos.`));
      extra.placeholder = 'Indicaciones (opcional): más corto, en lista, menciona el riesgo de…';
      body.appendChild(extra);
      prompt = () => fieldPrompt(r, opts.field, cur, extra.value.trim(), ctxText());
      main = 'Redactar con ';
    } else if (mode === 'conclusion') {
      if (!conclFields.length) body.appendChild(h('p', { class: 'warn' }, 'No hay apartados de conclusión en este informe.'));
      body.appendChild(h('p', { class: 'muted small' }, `Redacta de una vez: ${conclFields.map((f) => `«${f.label}»`).join(', ')}. Luego «Pegar respuesta» rellena cada apartado.`));
      extra.placeholder = 'Indicaciones (opcional): p. ej. la instalación es viable si el cliente instala una canaleta…';
      body.appendChild(extra);
      prompt = () => conclusionPrompt(r, conclFields, extra.value.trim(), ctxText());
      main = 'Redactar con ';
    } else if (mode === 'free') {
      extra.placeholder = 'Escribe tu pregunta: ¿qué cable me recomiendas para 45 m?, ¿qué falta en el informe?…';
      body.appendChild(extra);
      prompt = () => freePrompt(r, extra.value.trim(), ctxText());
      main = 'Preguntar a ';
    } else {
      const photosWithData = photos.filter((p) => p.dataUrl);
      let pick = opts.photo || null;
      body.appendChild(h('p', { class: 'muted small' }, 'Describe qué quieres ver (p. ej. «antena Starlink en mástil de pared en la esquina derecha del tejado, con el cable bajando por la fachada hasta la caja»). Si eliges una foto, se usan también tus marcas como guía.'));
      extra.placeholder = '¿Qué quieres que aparezca en la imagen?';
      body.appendChild(extra);
      const strip = h('div', { class: 'ai-photos' },
        h('button', { type: 'button', class: `ai-ph none ${!pick ? 'on' : ''}`, onclick: () => { pick = null; withPhoto = false; mark(); } }, 'Sin foto'),
        photosWithData.map((p) => { const im = h('img', { alt: '' }); renderAnnotated(p.dataUrl, p.annots || [], { maxSide: 240, quality: 0.7 }).then((u) => { im.src = u; }); return h('button', { type: 'button', class: `ai-ph ${pick?.id === p.id ? 'on' : ''}`, 'data-id': p.id, onclick: () => { pick = p; withPhoto = true; mark(); } }, im); }));
      const mark = () => [...strip.children].forEach((b) => b.classList.toggle('on', pick ? b.dataset.id === pick.id : b.classList.contains('none')));
      body.appendChild(strip);
      const ctxShort = () => {
        const d = r.data;
        return [d.antenna?.antenna && `antena ${d.antenna.antenna}`, d.antenna?.mount && `montura ${d.antenna.mount}`, ...(d.equipment || []).filter((e) => e.kind === 'antenna').map((e) => `${e.model}${e.mount ? ` con ${e.mount}` : ''}`), d.surface && `superficie ${d.surface}`, d.mount_surface && `superficie ${d.mount_surface}`].filter(Boolean).join('; ');
      };
      prompt = () => imagePrompt(extra.value.trim() || 'la instalación propuesta', withPhoto && !!pick, ctxShort());
      body.appendChild(h('div', { class: 'stack' },
        h('button', { class: 'btn primary', onclick: async () => {
          if (!extra.value.trim()) { extra.focus(); return toast('Describe qué quieres en la imagen'); }
          const p = PROVIDERS[provider()]; const text = prompt();
          if (pick) {
            const url = await renderAnnotated(pick.dataUrl, pick.annots || [], { maxSide: 1600, quality: 0.88 });
            const file = new File([dataUrlToBytes(url)], 'foto-replanteo.jpg', { type: 'image/jpeg' });
            await copyText(text);
            if (navigator.canShare?.({ files: [file] })) {
              try { await navigator.share({ files: [file], text }); toast(`Elige ${p.name} en el menú. La instrucción también está copiada por si no aparece.`, 7000); return; }
              catch (e) { if (e.name === 'AbortError') return; }
            }
            downloadBlob(new Blob([dataUrlToBytes(url)], { type: 'image/jpeg' }), 'foto-replanteo.jpg');
            window.open(p.open(''), '_blank', 'noopener');
            toast(`Foto descargada e instrucción copiada. En ${p.name}: adjunta la foto (📎) y pega la instrucción.`, 8000);
          } else launch(text);
        } }, icon('image'), `Generar con ${PROVIDERS[provider()].name}`),
        opts.onAddImage ? h('button', { class: 'btn', onclick: () => { const inp = h('input', { type: 'file', accept: 'image/*', onchange: (e) => { if (e.target.files.length) { opts.onAddImage(e.target.files); m.close(); toast('Imagen añadida al informe'); } } }); inp.click(); } }, icon('plus'), 'Añadir la imagen generada al informe') : null,
        h('p', { class: 'muted small' }, 'Cuando la tengas: guárdala en el móvil y pulsa «Añadir la imagen generada» (o «Galería» en Fotos).')));
    }

    if (mode !== 'image') {
      body.appendChild(h('button', { class: 'btn primary', onclick: () => launch(prompt()) }, icon('next'), main + PROVIDERS[prov].name));
      const canPaste = mode === 'field' || mode === 'conclusion';
      if (canPaste) {
        const manual = h('textarea', { rows: 4, placeholder: 'Si «Pegar respuesta» no funciona: mantén pulsado aquí, «Pegar», y pulsa «Usar este texto».', hidden: true });
        const useBtn = h('button', { class: 'btn', hidden: true, onclick: () => apply(manual.value) }, 'Usar este texto');
        body.appendChild(h('div', { class: 'ai-back' },
          h('div', { class: 'muted small' }, `2. En ${PROVIDERS[prov].name}, copia la respuesta y vuelve aquí:`),
          h('button', { class: 'btn', onclick: async () => { const t = await readClipboard(); if (t) apply(t); else { manual.hidden = false; useBtn.hidden = false; manual.focus(); } } }, icon('copy'), 'Pegar respuesta'),
          manual, useBtn));
      }
    }
    // privacidad + vista previa
    body.appendChild(h('label', { class: 'checkbox small' }, h('input', { type: 'checkbox', checked: hideClient, onchange: (e) => { hideClient = e.target.checked; LS.set('fr_ai_hide', hideClient ? '1' : '0'); } }), 'Ocultar cliente, código/nombre del sitio y dirección'));
    body.appendChild(h('details', { class: 'ai-prev' }, h('summary', {}, 'Ver lo que se enviará'), h('pre', {}, '…'))).addEventListener('toggle', (e) => { if (e.target.open) e.target.querySelector('pre').textContent = prompt(); });
    body.appendChild(h('p', { class: 'muted tiny' }, `Se abre ${PROVIDERS[prov].name} con tu cuenta (servicio externo). Nunca se envían emails, teléfonos, IP, contrato ni números de serie. Revisa siempre el texto: la IA puede equivocarse.`));
  }

  function setField(key, value) {
    if (opts.ctx) opts.ctx.set(key, value, true);
  }
  function apply(raw) {
    const text = cleanAnswer(raw);
    if (!text) return toast('El portapapeles está vacío: copia antes la respuesta');
    if (mode === 'field') {
      const cur = String(r.data[opts.field.key] || '').trim();
      const done = (v) => { setField(opts.field.key, v); m.close(); toast(`«${opts.field.label}» actualizado. Revisa el texto.`); };
      if (!cur) return done(text);
      const q = modal('Ya había texto', h('p', {}, '¿Sustituir lo que había o añadir la respuesta al final?'), [
        h('button', { class: 'btn', onclick: () => { q.close(); done(`${cur}\n${text}`); } }, 'Añadir al final'),
        h('button', { class: 'btn primary', onclick: () => { q.close(); done(text); } }, 'Sustituir')]);
    } else if (mode === 'conclusion') {
      const parts = splitSections(text, conclFields);
      const keys = Object.keys(parts);
      if (!keys.length) {
        // sin títulos: va todo a «Conclusión» (o al primer apartado)
        const f = conclFields.find((x) => /conclus|observaciones finales/i.test(x.label)) || conclFields[0];
        if (!f) return;
        setField(f.key, text); m.close(); toast(`Texto puesto en «${f.label}». Revísalo.`); return;
      }
      keys.forEach((k) => setField(k, parts[k]));
      m.close(); toast(`Rellenados: ${keys.map((k) => conclFields.find((f) => f.key === k).label).join(', ')}. Revísalos.`, 5000);
    }
  }
  draw();
}

/** Botón ✦ para los campos de texto */
export function aiFieldButton(ctx, field) {
  if (!aiEnabled()) return null;
  return h('button', { type: 'button', class: 'ai-btn', title: 'Redactar con IA', 'aria-label': 'Redactar con IA', onclick: () => openAssistant({ ctx, field, mode: 'field' }) }, '✦');
}
