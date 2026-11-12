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
import { tr, lang } from './i18n.js';

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

// ---------- textos de las instrucciones, en el idioma de la app ----------
const P = {
  es: {
    langName: 'español', mount: 'montura', section: 'tramo', total: 'total', antenna: 'antena', obstructions: 'obstrucciones', down: 'Mbps bajada', up: 'Mbps subida',
    yes: 'Sí', no: 'No', proposed: '(posición propuesta)', cable: 'Recorrido de cable', dashed: 'discontinuo', from: 'desde', to: 'hasta', number: 'Número', photo: 'Foto', marks: 'Marcas',
    docSurvey: 'Survey (visita técnica previa) para una instalación de antena/comunicaciones', docInstall: 'Informe de instalación de antena/comunicaciones', docType: 'Tipo de documento', place: 'Ubicación',
    photosTitle: '[Fotos y lo marcado en ellas]', survey: 'survey', install: 'informe de instalación',
    rules: 'Usa SOLO los datos que te doy: no inventes medidas, resultados, pruebas ni equipos. Si falta algún dato importante, indícalo al final entre corchetes.',
    role: 'Eres un técnico experto en instalaciones de antenas satélite (Starlink, OneWeb, VSAT, TVRO) y routers Peplink que redacta informes profesionales.',
    field: (l) => `Redacta el texto del campo «${l}» de este informe. Escribe en español, en tono técnico, claro y profesional, con frases cortas (máximo 5-6 frases o una lista breve si encaja mejor).`,
    already: 'Lo que ya he escrito (mejóralo y complétalo, sin perder información):', hints: 'Indicaciones del técnico:', only: 'Responde SOLO con el texto final, sin títulos ni comentarios.', data: 'DATOS DEL INFORME:',
    concl: (k) => `Con los datos de este ${k}, redacta los siguientes apartados en español, en tono técnico y profesional.`,
    format: 'Responde EXACTAMENTE con este formato (un título por apartado, sin texto antes ni después):', text: '(texto)',
    review: 'Revisa este informe y dime qué falta o qué se podría mejorar.', answerIn: 'Responde en español.', tech: 'Contexto técnico:', default: 'la instalación propuesta',
    imgEdit: (d) => `Edita la foto adjunta para hacer un replanteo fotorrealista de la instalación: ${d}.\nMantén la foto igual (mismo encuadre, luz, perspectiva y escala); añade solo lo indicado, con aspecto real y bien integrado. Si la foto tiene marcas o dibujos encima, úsalos como guía de dónde va cada cosa y elimínalos en el resultado. No añadas textos, logotipos ni marcas de agua.`,
    imgNew: (d) => `Genera una imagen fotorrealista para un informe técnico: ${d}.\nAspecto de foto real, a escala y sin textos, logotipos ni marcas de agua.`,
  },
  en: {
    langName: 'English', mount: 'mount', section: 'section', total: 'total', antenna: 'antenna', obstructions: 'obstructions', down: 'Mbps down', up: 'Mbps up',
    yes: 'Yes', no: 'No', proposed: '(proposed position)', cable: 'Cable route', dashed: 'dashed', from: 'from', to: 'to', number: 'Number', photo: 'Photo', marks: 'Marks',
    docSurvey: 'Survey (technical site visit) for an antenna/communications installation', docInstall: 'Antenna/communications installation report', docType: 'Document type', place: 'Location',
    photosTitle: '[Photos and what is marked on them]', survey: 'survey', install: 'installation report',
    rules: 'Use ONLY the data I give you: do not invent measurements, results, tests or equipment. If an important piece of data is missing, say so at the end in square brackets.',
    role: 'You are a technician expert in satellite antenna installations (Starlink, OneWeb, VSAT, TVRO) and Peplink routers who writes professional reports.',
    field: (l) => `Write the text for the field «${l}» of this report. Write in English, in a technical, clear and professional tone, with short sentences (at most 5-6 sentences or a short list if it fits better).`,
    already: 'What I have already written (improve and complete it, without losing information):', hints: 'Instructions from the technician:', only: 'Answer ONLY with the final text, without headings or comments.', data: 'REPORT DATA:',
    concl: (k) => `With the data of this ${k}, write the following sections in English, in a technical and professional tone.`,
    format: 'Answer EXACTLY in this format (one heading per section, no text before or after):', text: '(text)',
    review: 'Review this report and tell me what is missing or what could be improved.', answerIn: 'Answer in English.', tech: 'Technical context:', default: 'the proposed installation',
    imgEdit: (d) => `Edit the attached photo to make a photorealistic mock-up of the installation: ${d}.\nKeep the photo the same (same framing, light, perspective and scale); add only what is described, looking real and well integrated. If the photo has marks or drawings on it, use them as a guide for where each thing goes and remove them from the result. Do not add text, logos or watermarks.`,
    imgNew: (d) => `Generate a photorealistic image for a technical report: ${d}.\nIt should look like a real photo, to scale, with no text, logos or watermarks.`,
  },
  pt: {
    langName: 'português', mount: 'suporte', section: 'troço', total: 'total', antenna: 'antena', obstructions: 'obstruções', down: 'Mbps download', up: 'Mbps upload',
    yes: 'Sim', no: 'Não', proposed: '(posição proposta)', cable: 'Percurso do cabo', dashed: 'tracejado', from: 'desde', to: 'até', number: 'Número', photo: 'Foto', marks: 'Marcas',
    docSurvey: 'Survey (visita técnica prévia) para uma instalação de antena/comunicações', docInstall: 'Relatório de instalação de antena/comunicações', docType: 'Tipo de documento', place: 'Localização',
    photosTitle: '[Fotos e o que está marcado nelas]', survey: 'survey', install: 'relatório de instalação',
    rules: 'Use APENAS os dados que lhe dou: não invente medidas, resultados, testes nem equipamentos. Se faltar algum dado importante, indique-o no fim entre parênteses retos.',
    role: 'É um técnico especialista em instalações de antenas de satélite (Starlink, OneWeb, VSAT, TVRO) e routers Peplink que redige relatórios profissionais.',
    field: (l) => `Redija o texto do campo «${l}» deste relatório. Escreva em português, num tom técnico, claro e profissional, com frases curtas (no máximo 5-6 frases ou uma lista breve se for mais adequado).`,
    already: 'O que já escrevi (melhore e complete, sem perder informação):', hints: 'Indicações do técnico:', only: 'Responda APENAS com o texto final, sem títulos nem comentários.', data: 'DADOS DO RELATÓRIO:',
    concl: (k) => `Com os dados deste ${k}, redija as seguintes secções em português, num tom técnico e profissional.`,
    format: 'Responda EXATAMENTE neste formato (um título por secção, sem texto antes nem depois):', text: '(texto)',
    review: 'Reveja este relatório e diga-me o que falta ou o que se pode melhorar.', answerIn: 'Responda em português.', tech: 'Contexto técnico:', default: 'a instalação proposta',
    imgEdit: (d) => `Edite a foto anexa para fazer uma simulação fotorrealista da instalação: ${d}.\nMantenha a foto igual (mesmo enquadramento, luz, perspetiva e escala); acrescente apenas o indicado, com aspeto real e bem integrado. Se a foto tiver marcas ou desenhos por cima, use-os como guia de onde fica cada coisa e elimine-os no resultado. Não acrescente textos, logótipos nem marcas de água.`,
    imgNew: (d) => `Gere uma imagem fotorrealista para um relatório técnico: ${d}.\nAspeto de foto real, à escala e sem textos, logótipos nem marcas de água.`,
  },
};
const L = () => P[lang()] || P.en;

const optLabel = (f, v) => tr((f.options || []).find((o) => o.v === v)?.es || v);
const other = (d, f, v) => (v === '__other' ? d[`${f.key}_other`] || '' : v);
const kindEs = { antenna: 'Antena', router: 'Router', cable: 'Cable', accessory: 'Accesorio', sim: 'Tarjeta SIM' };
const manOf = (e) => (e.manufacturer === 'Other' ? e.manufacturerOther : (['OneWeb', 'VSAT', 'TVRO'].includes(e.manufacturer) ? e.manufacturer : ''));

function valueText(f, v, d) {
  if (v == null || v === '') return '';
  const t = L();
  switch (f.type) {
    case 'select': return optLabel(f, other(d, f, v));
    case 'catalogSelect': return other(d, f, v);
    case 'toggle': return v === true ? t.yes : v === false ? t.no : '';
    case 'number': return `${v}${f.unit ? ' ' + f.unit : ''}`;
    case 'chips': return [...(v.values || []).map((x) => optLabel(f, x)), v.other].filter(Boolean).join(', ');
    case 'antennaMount': return [[v.system === '__other' ? v.systemOther : v.system, v.antenna].filter(Boolean).join(' '), v.mount === '__other' ? v.mountOther : v.mount].filter(Boolean).join(` – ${t.mount}: `);
    case 'equipment': return (v || []).map((e) => [tr(kindEs[e.kind] || e.kind), manOf(e), e.model === '__other' ? e.modelOther : e.model, e.mount && `${t.mount} ${e.mount === '__other' ? e.mountOther : e.mount}`, e.qty > 1 && `x${e.qty}`, e.notes].filter(Boolean).join(' ')).filter(Boolean).join('; ');
    case 'segments': { const tot = (v || []).reduce((a, s) => a + (Number(s.length) || 0), 0); return (v || []).map((s) => `${s.desc || t.section} ${s.length ?? '?'} m`).join(', ') + (tot ? ` (${t.total} ${tot} m)` : ''); }
    case 'antennaTests': {
      const ants = (d.equipment || []).filter((e) => e.kind === 'antenna');
      return Object.entries(v || {}).map(([k, x], i) => {
        const n = ants.findIndex((a) => a.id === k);
        return `${t.antenna} ${n >= 0 ? n + 1 : i + 1}: ${[x.status, x.obstructions && `${t.obstructions} ${x.obstructions}`, x.down && `${x.down} ${t.down}`, x.up && `${x.up} ${t.up}`, x.latency && `${x.latency} ms`, x.notes].filter(Boolean).join(', ')}`;
      }).join('; ');
    }
    default: return String(v).trim();
  }
}

const ANN_ES = { callout: 'Línea+texto', arrow: 'Flecha', line: 'Línea', rect: 'Cuadrado', circle: 'Círculo', text: 'Texto' };
function annotText(a, all) {
  const t = L();
  const name = (id) => { const s = all.find((x) => x.id === id); return s ? tr(STICKERS[s.kind]?.name) : null; };
  if (a.type === 'sticker') return `${tr(STICKERS[a.kind]?.name || 'Equipo')}${a.ghost ? ' ' + t.proposed : ''}${a.text ? ` «${a.text}»` : ''}`;
  if (a.type === 'route') {
    const len = String(a.lengths || '').split(/[,;]/).map((x) => parseFloat(x)).filter((x) => !isNaN(x));
    const from = a.links?.v0 && name(a.links.v0.s), last = a.links?.[`v${(a.pts || []).length - 1}`], to = last && name(last.s);
    return `${t.cable}${len.length ? ` ${len.join(' m + ')} m (${t.total} ${len.reduce((x, y) => x + y, 0)} m)` : ''}${a.dashed ? ' ' + t.dashed : ''}${from ? ` ${t.from} ${from}` : ''}${to ? ` ${t.to} ${to}` : ''}${a.text ? ` «${a.text}»` : ''}`;
  }
  if (a.type === 'number') return `${t.number} ${a.n}${a.text ? ` «${a.text}»` : ''}`;
  return a.text ? `${tr(ANN_ES[a.type] || a.type)} «${a.text}»` : '';
}

/** Resumen del informe, en el idioma de la app, para dar contexto a la IA */
export function reportContext(r, photos = [], { hideClient = false } = {}) {
  const tpl = TEMPLATES[r.type], d = r.data || {}, t = L();
  const out = [`${t.docType}: ${r.type === 'survey' ? t.docSurvey : t.docInstall}.`];
  const place = [d.city, d.region, d.country].filter(Boolean).join(', ');
  if (place) out.push(`${t.place}: ${place}.`);
  for (const s of tpl.steps) {
    const rows = [];
    for (const f of s.fields) {
      if (SKIP_TYPES.has(f.type) || NEVER.has(f.key) || (hideClient && CLIENT_DATA.has(f.key)) || ['city', 'region', 'region_code', 'country', 'country_code'].includes(f.key)) continue;
      if (f.showIf && !f.showIf(d)) continue;
      const txt = valueText(f, d[f.key], d);
      if (txt) rows.push(`- ${tr(f.label)}: ${txt}`);
    }
    if (rows.length) out.push(`\n[${tr(s.title)}]`, ...rows);
  }
  const ph = photos.filter((p) => p.caption || p.annots?.length);
  if (ph.length) {
    out.push('\n' + t.photosTitle);
    photos.forEach((p, i) => {
      const marks = (p.annots || []).map((a) => annotText(a, p.annots)).filter(Boolean);
      if (p.caption || marks.length) out.push(`- ${t.photo} ${i + 1}${p.category ? ` (${p.category.toLowerCase()})` : ''}${p.caption ? `: «${p.caption}»` : ''}${marks.length ? `. ${t.marks}: ${marks.join('; ')}` : ''}`);
    });
  }
  return out.join('\n');
}

function fieldPrompt(r, field, current, extra, ctxText) {
  const t = L();
  return `${t.role}\n${t.field(tr(field.label))} ${t.rules}\n` +
    (current ? `\n${t.already}\n«${current}»\n` : '') +
    (extra ? `\n${t.hints} ${extra}\n` : '') +
    `\n${t.only}\n\n${t.data}\n${ctxText}`;
}
function conclusionPrompt(r, fields, extra, ctxText) {
  const t = L();
  return `${t.role}\n${t.concl(r.type === 'survey' ? t.survey : t.install)} ${t.rules}\n` +
    (extra ? `\n${t.hints} ${extra}\n` : '') +
    `\n${t.format}\n${fields.map((f) => `## ${tr(f.label)}\n${t.text}`).join('\n')}\n\n${t.data}\n${ctxText}`;
}
function freePrompt(r, question, ctxText) {
  const t = L();
  return `${t.role}\n${question || t.review}\n${t.answerIn} ${t.rules}\n\n${t.data}\n${ctxText}`;
}
function imagePrompt(desc, withPhoto, ctxShort) {
  const t = L();
  return (withPhoto ? t.imgEdit(desc) : t.imgNew(desc)) + (ctxShort ? `\n${t.tech} ${ctxShort}` : '');
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
    const f = m && fields.find((x) => norm(tr(x.label)) === norm(m[1]) || norm(x.label) === norm(m[1]));
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
      body.appendChild(h('p', { class: 'muted small' }, `Redacta «${tr(opts.field.label)}» usando todo lo que has rellenado y marcado en las fotos.`));
      extra.placeholder = 'Indicaciones (opcional): más corto, en lista, menciona el riesgo de…';
      body.appendChild(extra);
      prompt = () => fieldPrompt(r, opts.field, cur, extra.value.trim(), ctxText());
      main = 'Redactar con ';
    } else if (mode === 'conclusion') {
      if (!conclFields.length) body.appendChild(h('p', { class: 'warn' }, 'No hay apartados de conclusión en este informe.'));
      body.appendChild(h('p', { class: 'muted small' }, `Redacta de una vez: ${conclFields.map((f) => `«${tr(f.label)}»`).join(', ')}. Luego «Pegar respuesta» rellena cada apartado.`));
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
        const am = d.antenna || {}, mo = (x) => (x?.mount === '__other' ? x.mountOther : x?.mount);
        return [am.antenna && [am.system === '__other' ? am.systemOther : am.system, am.antenna].filter(Boolean).join(' '), mo(am), ...(d.equipment || []).filter((e) => e.kind === 'antenna').map((e) => [manOf(e), e.model === '__other' ? e.modelOther : e.model, mo(e)].filter(Boolean).join(' ')), d.surface !== '__other' && d.surface, d.mount_surface !== '__other' && d.mount_surface].filter(Boolean).join('; ');
      };
      prompt = () => imagePrompt(extra.value.trim() || L().default, withPhoto && !!pick, ctxShort());
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
      const done = (v) => { setField(opts.field.key, v); m.close(); toast(`«${tr(opts.field.label)}» actualizado. Revisa el texto.`); };
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
        setField(f.key, text); m.close(); toast(`Texto puesto en «${tr(f.label)}». Revísalo.`); return;
      }
      keys.forEach((k) => setField(k, parts[k]));
      m.close(); toast(`Rellenados: ${keys.map((k) => tr(conclFields.find((f) => f.key === k).label)).join(', ')}. Revísalos.`, 5000);
    }
  }
  draw();
}

/** Botón ✦ para los campos de texto */
export function aiFieldButton(ctx, field) {
  if (!aiEnabled()) return null;
  return h('button', { type: 'button', class: 'ai-btn', title: 'Redactar con IA', 'aria-label': 'Redactar con IA', onclick: () => openAssistant({ ctx, field, mode: 'field' }) }, '✦');
}
