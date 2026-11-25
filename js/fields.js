import { icon } from './svg.js';
// Dibuja los campos del formulario a partir de las plantillas (templates.js)
import { h, uid, toast, confirmBox, confirmDelete } from './ui.js';
import { normVal, sameVal, customOf, customPatch, oneValue, bandsOf, bandPatch, addUnique } from './multi.js';
import { photosField } from './photos.js';
import { OPT } from './templates.js';
import { reverseGeocode, parseCoords, GEO_KEYS } from './geo.js';
import { aiFieldButton } from './ai.js';
import { speechLang, tr } from './i18n.js';

/**
 * ctx = { data, set(key, value, rerender), people, catalog, readOnly, report }
 */
export function renderField(f, ctx) {
  if (f.showIf && !f.showIf(ctx.data)) return null;
  const v = ctx.data[f.key];
  const ro = ctx.readOnly;
  const set = (val, re = false) => ctx.set(f.key, val, re);
  const label = h('label', { class: 'label' }, f.label, f.required ? h('span', { class: 'req' }, ' *') : null, f.unit ? h('span', { class: 'muted' }, ` (${f.unit})`) : null);
  const help = f.help ? h('div', { class: 'help' }, f.help) : null;
  const wrap = (...c) => h('div', { class: `field ${f.half ? 'half' : 'full'}` }, label, ...c, help);
  // Contexto del aviso de eliminación: informe, sección (paso) y campo
  const dc = (extra = {}) => ({ report: ctx.reportLabel, section: ctx.section, field: f.label, ...extra });

  switch (f.type) {
    case 'info': return h('div', { class: 'field full info-box' }, f.label);
    case 'text':
    case 'email':
      return wrap(h('input', { type: f.type === 'email' ? 'email' : 'text', value: v ?? '', placeholder: f.placeholder || '', disabled: ro, oninput: (e) => set(e.target.value) }));
    case 'textarea': {
      const ta = h('textarea', { rows: 3, placeholder: f.placeholder || 'Puedes escribir o dictar en español; se traducirá al inglés', disabled: ro, oninput: (e) => set(e.target.value) }, v ?? '');
      const mic = ro ? null : micButton(ta, (txt) => set(txt));
      return wrap(h('div', { class: 'with-mic' }, ta, mic, ro ? null : aiFieldButton(ctx, f), mic?._live));
    }
    case 'number':
      return wrap(h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: v ?? '', disabled: ro, oninput: (e) => set(e.target.value === '' ? '' : Number(e.target.value)) }));
    case 'date':
    case 'time':
      return wrap(h('input', { type: f.type, value: v ?? '', disabled: ro, onchange: (e) => set(e.target.value) }));
    case 'gps':
      return wrap(gpsInput(v ?? '', (val) => set(val), ro, ctx));
    case 'toggle':
      return wrap(h('div', { class: 'seg' },
        h('button', { type: 'button', class: v === true ? 'on' : '', disabled: ro, onclick: () => set(v === true ? null : true, true) }, 'Sí'),
        h('button', { type: 'button', class: v === false ? 'on' : '', disabled: ro, onclick: () => set(v === false ? null : false, true) }, 'No')));
    case 'select':
      return wrap(optionSelect(f.options || [], v ?? '', f.allowOther, ctx.data[`${f.key}_other`] ?? '', ro,
        (val) => set(val, true), (other) => ctx.set(`${f.key}_other`, other, false)));
    case 'catalogSelect': {
      const items = ctx.catalog.filter((c) => c.kind === f.catalogKind && (c.active || c.name === v));
      return wrap(optionSelect(items.map((c) => ({ v: c.name, es: c.name })), v ?? '', true, ctx.data[`${f.key}_other`] ?? '', ro,
        (val) => set(val, true), (other) => ctx.set(`${f.key}_other`, other, false)));
    }
    case 'chips':
      return wrap(chips(f.options || [], v || { values: [], other: '' }, f.allowOther, ro, (val, re) => set(val, re), dc));
    case 'people':
      return wrap(peoplePicker(ctx.people, v || { ids: [], other: '' }, f.allowOther, ro, (val, re) => set(val, re)));
    case 'antennaMount':
      return wrap(antennaMount(ctx.catalog, v || {}, ro, (val, re) => set(val, re), (x = {}) => dc({ equipment: `Antena 1 · ${oneValue(v || {}, 'system') || 'Starlink'}`, ...x })));
    case 'equipment':
      return wrap(equipmentEditor(ctx.catalog, v || [], ro, (val, re) => set(val, re), dc, ctx));
    case 'segments':
      return wrap(segmentsEditor(v || [], ro, (val, re) => set(val, re), dc));
    case 'antennaTests':
      return wrap(antennaTests(ctx, ro));
    case 'existingAntennas':
      return wrap(existingEditor(ctx.catalog, v || [], ro, (val, re) => set(val, re), dc, ctx));
    case 'antennaList':
      return wrap(antennaList(ctx, v || [], ro, (val, re) => set(val, re), dc));
    case 'materialList':
      return wrap(materialList(ctx.catalog, v || [], f.mode, ro, (val, re) => set(val, re), dc));
    case 'photos':
      return wrap(photosField(ctx.report, f.photoCategory, ro, dc));
  }
  return null;
}

// ---------------------------------------------------------------------
export function optionSelect(options, value, allowOther, other, ro, onChange, onOther) {
  const sel = h('select', { disabled: ro, onchange: (e) => onChange(e.target.value) },
    h('option', { value: '' }, '— Elegir —'),
    options.map((o) => h('option', { value: o.v, selected: o.v === value }, o.es)),
    allowOther ? h('option', { value: '__other', selected: value === '__other' }, 'Otro…') : null);
  return h('div', {}, sel,
    value === '__other' ? h('input', { class: 'mt', placeholder: 'Escribe cuál', value: other, disabled: ro, oninput: (e) => onOther(e.target.value) }) : null);
}

function chips(options, value0, allowOther, ro, onChange0, dc) {
  let value = value0;
  const onChange = (nv, re) => { value = nv; onChange0(nv, re); };
  const vals = value.values || [];
  const showOther = !!value.other || value._open;
  return h('div', {},
    h('div', { class: 'chips' },
      options.map((o) => h('button', {
        type: 'button', class: `chip ${vals.includes(o.v) ? 'on' : ''}`, disabled: ro,
        onclick: () => { const cv = value.values || []; onChange({ ...value, values: cv.includes(o.v) ? cv.filter((x) => x !== o.v) : [...cv, o.v] }, true); },
      }, vals.includes(o.v) ? '✓ ' : '', o.es)),
      allowOther ? h('button', { type: 'button', class: `chip ${showOther ? 'on' : ''}`, disabled: ro, onclick: async () => {
        // cerrar «Otro» borra lo escrito: se confirma si había texto
        if (showOther && (value.other || '').trim() && !(await confirmDelete({ ...(dc ? dc() : {}), value: value.other.trim(), consequence: 'se eliminará el texto escrito en «Otro»; las opciones marcadas se conservan.' }))) return;
        onChange({ ...value, _open: !showOther, other: showOther ? '' : value.other || '' }, true);
      } }, '+ Otro') : null),
    allowOther && showOther ? h('input', { class: 'mt', placeholder: 'Otro (separa varios con ;)', value: value.other || '', disabled: ro, oninput: (e) => onChange({ ...value, other: e.target.value }, false) }) : null);
}

function peoplePicker(people, value0, allowOther, ro, onChange0) {
  let value = value0;
  const onChange = (nv, re) => { value = nv; onChange0(nv, re); };
  const ids = value.ids || [];
  const list = people.filter((p) => p.active || ids.includes(p.id));
  return h('div', {},
    h('div', { class: 'chips' }, list.map((p) => h('button', {
      type: 'button', class: `chip ${ids.includes(p.id) ? 'on' : ''}`, disabled: ro,
      onclick: () => { const ci = value.ids || []; onChange({ ...value, ids: ci.includes(p.id) ? ci.filter((x) => x !== p.id) : [...ci, p.id] }, true); },
    }, ids.includes(p.id) ? '✓ ' : '', p.name, p.active ? '' : ' (inactivo)'))),
    allowOther ? h('input', { class: 'mt', placeholder: 'Otras personas (externos), separadas por comas', value: value.other || '', disabled: ro, oninput: (e) => onChange({ ...value, other: e.target.value }, false) }) : null);
}

/** Rellena dirección, región y país a partir de las coordenadas (solo lo que esté vacío, o todo si se confirma) */
async function fillAddress(ctx, lat, lon, { quiet = false } = {}) {
  if (!navigator.onLine) { if (!quiet) toast('Sin conexión: la dirección se rellenará al pulsar GPS con cobertura'); return; }
  let geo;
  try { geo = await reverseGeocode(lat, lon); } catch { if (!quiet) toast('No se pudo obtener la dirección; escríbela a mano'); return; }
  const d = ctx.data;
  const found = GEO_KEYS.filter((k) => geo[k]);
  const differs = found.filter((k) => String(d[k] ?? '').trim() && String(d[k]).trim() !== geo[k]);
  let keys = found.filter((k) => !String(d[k] ?? '').trim());
  if (differs.length && await confirmBox(`La dirección ya escrita no coincide con la del GPS:\n\n${geo.address ? geo.address + ', ' : ''}${geo.postcode} ${geo.city}, ${geo.country}\n\n¿Sustituirla?`, 'Sustituir')) keys = found;
  if (!keys.length) { if (!quiet) toast('La dirección ya estaba rellenada'); return; }
  keys.forEach((k, i) => ctx.set(k, geo[k], i === keys.length - 1));
  toast(`Dirección rellenada: ${[geo.city, geo.country_code].filter(Boolean).join(', ')}`);
}

function gpsInput(value, onChange, ro, ctx) {
  const inp = h('input', { value, disabled: ro, placeholder: `43°44'09.03"N – 7°17'35.20"E`, oninput: (e) => onChange(e.target.value),
    // Coordenadas escritas o pegadas a mano: si la dirección está vacía, se busca sola
    onchange: (e) => { const c = parseCoords(e.target.value); if (c && ctx && !GEO_KEYS.some((k) => String(ctx.data[k] ?? '').trim())) fillAddress(ctx, c.lat, c.lon, { quiet: true }); } });
  const dms = (dec, pos, neg) => {
    const a = Math.abs(dec); const d = Math.floor(a); const m = Math.floor((a - d) * 60);
    const s = ((a - d - m / 60) * 3600).toFixed(2);
    return `${d}°${String(m).padStart(2, '0')}'${s.padStart(5, '0')}"${dec >= 0 ? pos : neg}`;
  };
  const idle = () => btn.replaceChildren(icon('pin'), 'GPS');
  const btn = h('button', {
    type: 'button', class: 'btn small', disabled: ro, title: 'Usar mi posición y rellenar la dirección',
    onclick: () => {
      if (!navigator.geolocation) return toast('Este dispositivo no permite GPS');
      btn.disabled = true; btn.replaceChildren('Buscando…');
      navigator.geolocation.getCurrentPosition(async (p) => {
        const { latitude: lat, longitude: lon, accuracy } = p.coords;
        inp.value = `${dms(lat, 'N', 'S')} – ${dms(lon, 'E', 'W')}`;
        onChange(inp.value);
        toast(`Ubicación obtenida (±${Math.round(accuracy)} m). Buscando dirección…`);
        btn.replaceChildren('Dirección…');
        if (ctx) await fillAddress(ctx, lat, lon);
        btn.disabled = false; idle();
      }, (e) => { btn.disabled = false; idle(); toast(e.code === 1 ? 'Permite la ubicación al navegador para usar el GPS' : 'No se pudo obtener la ubicación: ' + e.message); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
    },
  }, icon('pin'), 'GPS');
  return h('div', { class: 'row' }, inp, btn);
}

// Dictado por voz (Chrome Android/PC, Edge y Safari iOS). Si no hay, queda el dictado del teclado.
// Rápido: el texto aparece mientras hablas (resultados parciales) y sigue escuchando hasta pulsar parar.
// (El modo "en el dispositivo" de Chrome se probó y se descartó: en algunas versiones cuelga la pestaña.)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const IS_ANDROID = /Android/i.test(navigator.userAgent);
function cap(t, prev) {
  t = t.trim();
  if (!t) return '';
  return (!prev.trim() || /[.!?]\s*$/.test(prev)) ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function micButton(ta, onText) {
  if (!SR) return null;
  let rec = null, active = false, base = '', finals = '';
  const live = h('div', { class: 'interim', 'aria-live': 'polite' });
  const write = (interim) => {
    const txt = [base.trimEnd(), finals.trim()].filter(Boolean).join(' ');
    ta.value = interim ? [txt, interim.trim()].filter(Boolean).join(' ') : txt;
    live.textContent = interim ? 'Escuchando…' : '';
  };
  const commit = () => { onText(ta.value); };
  const stop = () => { active = false; try { rec && rec.stop(); } catch { /* */ } };

  function begin() {
    rec = new SR();
    rec.lang = speechLang(); // se dicta en el idioma elegido en la app
    rec.interimResults = true;       // texto al instante mientras hablas
    rec.maxAlternatives = 1;
    // En Android el modo continuo repite frases: se usan tramos cortos que se encadenan solos
    rec.continuous = !IS_ANDROID;
    let segFinal = '';
    rec.onresult = (e) => {
      let interim = '';
      segFinal = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) segFinal += t; else interim += t;
      }
      if (!rec.continuous) {
        write(cap(interim || segFinal, [base, finals].join(' ')));
        if (segFinal && !interim) { finals = [finals, cap(segFinal, [base, finals].join(' '))].filter(Boolean).join(' '); segFinal = ''; write(''); commit(); }
      } else {
        // Continuo: e.results contiene toda la sesión
        let all = '';
        for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) all += e.results[i][0].transcript;
        finals = cap(all, base);
        write(interim ? cap(interim, [base, finals].join(' ')) : '');
        if (!interim) commit();
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      active = false;
      toast(e.error === 'not-allowed' ? 'Permite el micrófono para dictar' : e.error === 'network' ? 'Dictado: sin conexión' : 'Dictado: ' + e.error);
    };
    rec.onend = () => {
      // Sigue escuchando hasta que se pulse parar (el navegador corta solo tras un silencio o en cada frase en Android)
      if (active) { base = ta.value; finals = ''; begin(); return; }
      rec = null; write(''); commit();
      btn.classList.remove('on'); btn.replaceChildren(icon('mic', { size: 18 })); btn.title = 'Dictar';
    };
    try { rec.start(); } catch { /* ya iniciado */ }
  }

  const btn = h('button', {
    type: 'button', class: 'mic', title: 'Dictar', 'aria-label': 'Dictar',
    onclick: () => {
      if (active) { stop(); return; }
      active = true; base = ta.value; finals = '';
      btn.classList.add('on'); btn.replaceChildren(icon('stop', { size: 16 })); btn.title = 'Parar';
      begin();
    },
  }, icon('mic', { size: 18 }));
  btn._live = live;
  return btn;
}

// ---------------------------------------------------------------------
// Antena Starlink + montura filtrada
// ---------------------------------------------------------------------
export function mountsFor(catalog, antennaName) {
  const fam = catalog.find((c) => c.kind === 'antenna' && c.name === antennaName)?.family;
  return catalog.filter((c) => c.kind === 'mount' && c.active && (!fam || c.compat.includes(fam)));
}

// ---------------------------------------------------------------------
// Antenas fuera de Starlink/Peplink (Intellian, Cobham SeaTel, KVH…):
// el catálogo es enorme, así que el técnico escribe marca, modelo, diámetro,
// banda y tipo, y lista los accesorios/dispositivos que usa con ella.
// ---------------------------------------------------------------------
const ANT_BRANDS = ['Intellian', 'Cobham SeaTel', 'Cobham Sailor', 'KVH', 'Kymeta', 'Hughes', 'Gilat', 'Viasat', 'ThinKom', 'Hanwha Phasor', 'Prodelin', 'Skyware', 'Channel Master', 'Jonsa', 'Orbit', 'Avl', 'Gigasat', 'Norsat', 'Eutelsat OneWeb'];
const PART_BRANDS = ['iDirect', 'Comtech', 'Newtec', 'Hughes', 'Gilat', 'Intellian', 'Cobham SeaTel', 'KVH', 'Norsat', 'Actox', 'SMW', 'Kratos', 'NJRC', 'Agilis', 'Peplink', 'Cisco', 'Ubiquiti', 'MikroTik', 'Times Microwave', 'Belden', 'Phihong'];
let dlSeq = 0;
const datalist = (items) => { const id = `dl${++dlSeq}`; return [id, h('datalist', { id }, items.map((x) => h('option', { value: x })))]; };
const sub = (label, ...kids) => h('div', {}, h('div', { class: 'sublabel' }, label), ...kids);
const optSel = (list, value, ro, onPick) => h('select', { disabled: ro, onchange: (e) => onPick(e.target.value) },
  h('option', { value: '' }, '— Elegir —'), list.map((x) => h('option', { value: x.v, selected: x.v === value }, x.es)));

// ---------------------------------------------------------------------
// v2.11 — «Otro» con varios valores personalizados (Requerimiento 01, mejora 2)
// ---------------------------------------------------------------------
/**
 * Lista de valores personalizados: cada valor se edita o se quita por separado y se añaden con «+ Añadir otro».
 * Se redibuja a sí misma (sin redibujar el paso) para no perder el foco mientras se escribe.
 * delInfo(valor) → contexto del aviso de eliminación.
 */
export function customListEditor({ list: list0, ro, predefined = [], onChange, delInfo, placeholder = 'Escribe el valor' }) {
  let list = [...list0];
  const box = h('div', { class: 'mo-list' });
  const save = () => onChange([...list]);
  const tryAdd = (inp, quiet) => {
    if (!inp?.isConnected) return; // el campo ya se redibujó (p. ej. «change» tras Intro)
    if (!normVal(inp.value)) { if (!quiet) inp.focus(); return; }
    const res = addUnique(list, inp.value, predefined);
    if (res.error) { toast(res.error); return; }
    inp.value = ''; // vacío antes de redibujar: un «change» tardío no lo vuelve a añadir
    list = res.list; save(); draw(); box.querySelector('.mo-add input')?.focus();
  };
  function draw() {
    box.replaceChildren(
      ...list.map((v, i) => h('div', { class: 'mo-item' },
        h('input', { value: v, disabled: ro, autocomplete: 'off', 'aria-label': `Valor personalizado ${i + 1}`,
          onchange: (e) => {
            const nv = normVal(e.target.value);
            const others = list.filter((_, j) => j !== i);
            if (!nv) { toast('El valor no puede quedar vacío: usa la papelera para quitarlo'); e.target.value = list[i]; return; }
            if (others.some((x) => sameVal(x, nv))) { toast(`«${nv}» ya está en la lista`); e.target.value = list[i]; return; }
            list[i] = nv; e.target.value = nv; save();
          } }),
        ro ? null : h('button', { type: 'button', class: 'btn small danger', title: 'Quitar', 'aria-label': `Quitar ${v}`,
          onclick: async () => {
            if (!(await confirmDelete({ ...(delInfo ? delInfo(v) : {}), value: v, consequence: 'se eliminará este valor personalizado; el resto de valores se conserva.' }))) return;
            list = list.filter((x) => x !== v); save(); draw();
          } }, icon('trash', { size: 16 })))),
      ro ? null : h('div', { class: 'mo-add' },
        h('input', { placeholder, autocomplete: 'off',
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); tryAdd(e.target); } },
          // al salir del campo con texto escrito se añade solo: no se pierde lo tecleado
          onchange: (e) => tryAdd(e.target, true) }),
        h('button', { type: 'button', class: 'btn small', onclick: (e) => tryAdd(e.currentTarget.previousSibling) }, icon('plus', { size: 16 }), 'Añadir otro')));
  }
  draw();
  return box;
}

/**
 * Desplegable de una opción con «Otro…»: al elegirlo aparece la lista de valores personalizados.
 * Guarda { [key]: otherValue, [key+'Custom']: [...], [key+'Other']: 'A / B' } (ver multi.js).
 */
export function otherSelect({ obj, key, options, ro, onPatch, delInfo, otherValue = '__other', empty = true, placeholder, disabled }) {
  const value = obj?.[key] ?? '';
  const sel = h('select', { disabled: ro || disabled, onchange: (e) => onPatch({ [key]: e.target.value }, true) },
    empty ? h('option', { value: '' }, '— Elegir —') : null,
    options.map((o) => h('option', { value: o.v, selected: o.v === value }, o.es)),
    h('option', { value: otherValue, selected: value === otherValue }, 'Otro…'));
  return h('div', {}, sel,
    value === otherValue ? customListEditor({ list: customOf(obj, key), ro, predefined: options, placeholder,
      onChange: (list) => onPatch(customPatch(key, list), false), delInfo }) : null);
}

const openBands = new Set(); // tarjetas con «+ Otro» abierto en Banda (solo pantalla)
/** Banda de frecuencia multivalor: opciones (Ku, Ka…) combinables con valores personalizados. */
export function bandPicker({ obj, ro, onPatch, delInfo, uiKey }) {
  const { values, custom } = bandsOf(obj);
  const open = custom.length > 0 || openBands.has(uiKey);
  const toggle = (v) => onPatch(bandPatch(values.includes(v) ? values.filter((x) => x !== v) : [...values, v], custom), true);
  // valores de informes antiguos que no son opciones de la lista se muestran también
  const extra = values.filter((v) => !OPT.antBand.some((o) => o.v === v)).map((v) => ({ v, es: v }));
  return h('div', {},
    h('div', { class: 'chips mo-chips' },
      [...OPT.antBand, ...extra].map((o) => h('button', { type: 'button', class: `chip ${values.includes(o.v) ? 'on' : ''}`, disabled: ro, onclick: () => toggle(o.v) },
        values.includes(o.v) ? '✓ ' : '', o.es)),
      ro ? null : h('button', { type: 'button', class: `chip ${open ? 'on' : ''}`, disabled: ro || custom.length > 0,
        title: custom.length ? 'Quita los valores personalizados para cerrar' : '',
        onclick: () => { if (open) openBands.delete(uiKey); else openBands.add(uiKey); onPatch({}, true); } }, '+ Otro')),
    open ? customListEditor({ list: custom, ro, predefined: OPT.antBand, placeholder: 'Ej. X-Band',
      onChange: (list) => onPatch(bandPatch(values, list), false), delInfo }) : null);
}

/** Marca, modelo, diámetro, banda y tipo de una antena "libre". `mk` = clave donde se guarda el modelo. */
function satAntennaFields(v, mk, catalogModels, ro, set, dc = () => ({}), uiKey = '') {
  const [bId, bList] = datalist(ANT_BRANDS);
  const [mId, mList] = datalist(catalogModels);
  return h('div', { class: 'sat-ant' },
    h('div', { class: 'grid3' },
      sub('Marca', h('input', { list: bId, placeholder: 'Ej. Intellian, Cobham SeaTel…', value: v.brand || '', disabled: ro, autocomplete: 'off', oninput: (e) => set({ brand: e.target.value }, false) }), bList),
      sub('Modelo', h('input', { list: mId, placeholder: 'Ej. v240MT, 4009…', value: v[mk] || '', disabled: ro, autocomplete: 'off', oninput: (e) => set({ [mk]: e.target.value }, false) }), mList),
      sub('Diámetro', h('div', { class: 'row nowrap' },
        h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Ej. 1,2', value: v.diameter || '', disabled: ro, style: 'flex:1;min-width:0', oninput: (e) => set({ diameter: e.target.value }, false) }),
        h('select', { disabled: ro, style: 'width:auto', onchange: (e) => set({ dunit: e.target.value }, false) },
          OPT.antUnit.map((x) => h('option', { value: x.v, selected: x.v === (v.dunit || 'm') }, x.es)))))),
    h('div', { class: 'grid2 mt' },
      sub('Banda', bandPicker({ obj: v, ro, onPatch: set, uiKey, delInfo: () => dc({ field: 'Banda de frecuencia' }) })),
      sub('Tipo de antena', otherSelect({ obj: v, key: 'antType', options: OPT.antType, ro, onPatch: set, placeholder: 'Ej. Antena de seguimiento', delInfo: () => dc({ field: 'Tipo de antena' }) }))));
}

/** Lista "Accesorios y dispositivos usados": módem, BUC, LNB, cables, piezas… aunque no estén en el catálogo. */
function partsEditor(parts0, ro, onChange0, opts = {}) {
  let parts = parts0 || [];
  const onChange = (nv, re) => { parts = nv; onChange0(nv, re); };
  const setP = (id, patch, re) => onChange(parts.map((p) => (p.id === id ? { ...p, ...patch } : p)), re);
  const [bId, bList] = datalist(PART_BRANDS);
  const label = (t) => OPT.partType.find((x) => x.v === t)?.es || t;
  return h('div', { class: 'parts' },
    opts.noTitle ? null : h('div', { class: 'parts-head' }, h('b', {}, 'Accesorios y dispositivos usados'),
      h('span', { class: 'muted small' }, opts.hint || 'Todo lo que se usa con esta antena, aunque no esté en el catálogo')),
    bList,
    parts0.map((p, i) => h('div', { class: 'part' },
      h('div', { class: 'part-head' },
        h('select', { class: 'part-type', disabled: ro, onchange: (e) => setP(p.id, { type: e.target.value }, true) },
          OPT.partType.map((x) => h('option', { value: x.v, selected: x.v === p.type }, x.es))),
        p.type === 'Other' ? h('input', { class: 'part-what', placeholder: '¿Qué es?', value: p.typeOther || '', disabled: ro, oninput: (e) => setP(p.id, { typeOther: e.target.value }, false) }) : h('span', { class: 'grow' }),
        ro ? null : h('button', { type: 'button', class: 'btn small danger', title: 'Quitar', onclick: async () => {
          const cur = parts.find((x) => x.id === p.id) || p;
          if (!(await confirmDelete({ ...(opts.dc ? opts.dc() : {}), field: 'Accesorios y dispositivos usados', value: [label(cur.type === 'Other' ? (cur.typeOther || 'Other') : cur.type), cur.brand, cur.model, cur.serial && `S/N ${cur.serial}`].filter(Boolean).join(' · '),
            consequence: 'se eliminará este accesorio de la antena; los demás accesorios se conservan.' }))) return;
          onChange(parts.filter((x) => x.id !== p.id), true);
        } }, icon('trash', { size: 16 }))),
      h('div', { class: 'grid4' },
        sub('Marca', h('input', { list: bId, value: p.brand || '', disabled: ro, autocomplete: 'off', placeholder: 'Ej. iDirect', oninput: (e) => setP(p.id, { brand: e.target.value }, false) })),
        sub('Modelo', h('input', { value: p.model || '', disabled: ro, autocomplete: 'off', placeholder: 'Ej. X7', oninput: (e) => setP(p.id, { model: e.target.value }, false) })),
        sub('Nº de serie (S/N)', h('input', { value: p.serial || '', disabled: ro, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', oninput: (e) => setP(p.id, { serial: e.target.value }, false) })),
        sub('Cantidad', h('input', { type: 'number', min: 1, inputmode: 'numeric', value: p.qty || 1, disabled: ro, oninput: (e) => setP(p.id, { qty: Number(e.target.value) || 1 }, false) }))),
      h('input', { class: 'mt', placeholder: 'Notas (opcional)', value: p.notes || '', disabled: ro, oninput: (e) => setP(p.id, { notes: e.target.value }, false) }))),
    ro ? null : h('div', { class: 'chips' },
      OPT.partType.map((x) => h('button', { type: 'button', class: 'chip add', onclick: () => onChange([...parts, { id: uid(), type: x.v, qty: 1 }], true) }, `+ ${x.es}`))));
}

// Sistemas de antena admitidos (además de Starlink). '__other' = el técnico lo escribe a mano.
export const SYSTEMS = ['Starlink', 'OneWeb', 'VSAT', 'TVRO'];
export const systemName = (v) => (v?.system === '__other' ? (v.systemOther || '').trim() : v?.system || 'Starlink');

function antennaMount(catalog, value0, ro, onChange0, dc = () => ({})) {
  let value = value0;
  const onChange = (nv, re) => { value = nv; onChange0(nv, re); };
  const system = value.system || 'Starlink';
  const starlink = system === 'Starlink';
  const uiKey = value.id || 'main';
  // Cambiar de sistema reinicia montura (y el modelo si se entra o sale de Starlink); los valores personalizados del sistema se conservan
  const sysSel = h('div', {}, h('div', { class: 'sublabel' }, 'Sistema'),
    otherSelect({ obj: value, key: 'system', options: SYSTEMS.map((x) => ({ v: x, es: x })), empty: false, ro, placeholder: 'Escribe qué sistema o tecnología es',
      delInfo: () => dc({ field: 'Sistema' }),
      onPatch: (p, re) => onChange('system' in p ? { ...value, ...p, antenna: p.system === 'Starlink' || system === 'Starlink' ? '' : value.antenna, mount: '', mountOther: '', mountCustom: [] } : { ...value, ...p }, re) }));
  if (starlink) {
    const antennas = catalog.filter((c) => c.kind === 'antenna' && c.manufacturer === 'Starlink' && (c.active || c.name === value.antenna));
    const mounts = mountsFor(catalog, value.antenna === '__other' ? '' : value.antenna || '');
    return h('div', { class: 'grid3' }, sysSel,
      h('div', {}, h('div', { class: 'sublabel' }, 'Modelo de antena'),
        otherSelect({ obj: value, key: 'antenna', options: antennas.map((a) => ({ v: a.name, es: a.name })), ro, placeholder: 'Modelo que no está en la lista',
          delInfo: () => dc({ field: 'Modelo de antena' }),
          onPatch: (p, re) => onChange('antenna' in p ? { ...value, ...p, system: 'Starlink', mount: '' } : { ...value, ...p }, re) })),
      h('div', {}, h('div', { class: 'sublabel' }, 'Montura'),
        otherSelect({ obj: value, key: 'mount', options: mounts.map((m) => ({ v: m.name, es: m.name })), ro, disabled: !value.antenna, placeholder: 'Montura o soporte',
          delInfo: () => dc({ field: 'Montura' }), onPatch: (p, re) => onChange({ ...value, ...p }, re) })));
  }
  // OneWeb, VSAT, TVRO u otro: el técnico escribe marca, modelo, diámetro… (el catálogo solo sugiere)
  const models = catalog.filter((c) => c.kind === 'antenna' && c.manufacturer === system && c.active).map((c) => c.name);
  const patch = (p, re) => onChange({ ...value, ...p }, re);
  return h('div', { class: 'stack' },
    h('div', { class: 'grid3' }, sysSel,
      sub('Montura', h('input', { placeholder: 'Tipo de montura o soporte', value: value.mountOther || '', disabled: ro, oninput: (e) => patch({ mount: e.target.value ? '__other' : '', mountOther: e.target.value }, false) }))),
    satAntennaFields(value, 'antenna', models, ro, patch, dc, uiKey),
    partsEditor(value.parts || [], ro, (parts, re) => patch({ parts }, re), { dc }));
}

// ---------------------------------------------------------------------
// Equipos: Fabricante → Tipo → Modelo → Nº serie (+ montura si es antena)
// ---------------------------------------------------------------------
const KIND_LABEL = { antenna: 'Antena', router: 'Router / módem', cable: 'Cable', accessory: 'Accesorio', sim: 'Tarjeta SIM' };
const ALLK = ['antenna', 'router', 'cable', 'accessory'];
const KINDS_BY_MAN = { Starlink: ALLK, Peplink: ['router', 'accessory'], OneWeb: ALLK, VSAT: ALLK, TVRO: ALLK, SIM: ['sim'], Other: ALLK };
const FREE_MAN = ['OneWeb', 'VSAT', 'TVRO', 'Other'];

const CARD_TITLE = { antenna: 'Antena', router: 'Router', cable: 'Cable', accessory: 'Accesorio', sim: 'Tarjeta SIM' };

function equipmentEditor(catalog, rows0, ro, onChange0, dc = () => ({}), ctx = null) {
  let rows = rows0;
  const onChange = (nv, re) => { rows = nv; onChange0(nv, re); };
  const setRow = (id, patch, re) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)), re);
  const add = (manufacturer, kind) => onChange([...rows, { id: uid(), manufacturer, kind, model: '' }], true);
  // "Otra igual": mismo modelo y montura, sin números de serie (para 2ª, 3ª antena…)
  const clone = (r) => {
    const i = rows.findIndex((x) => x.id === r.id);
    const copy = { id: uid(), manufacturer: r.manufacturer, manufacturerOther: r.manufacturerOther, manufacturerCustom: r.manufacturerCustom, kind: r.kind, model: r.model, modelOther: r.modelOther, modelCustom: r.modelCustom,
      mount: r.mount, mountOther: r.mountOther, mountCustom: r.mountCustom,
      brand: r.brand, diameter: r.diameter, dunit: r.dunit, band: r.band, bands: r.bands, bandCustom: r.bandCustom, bandOther: r.bandOther,
      antType: r.antType, antTypeOther: r.antTypeOther, antTypeCustom: r.antTypeCustom,
      parts: r.parts ? r.parts.map((p) => ({ ...p, id: uid(), serial: '' })) : undefined };
    onChange([...rows.slice(0, i + 1), copy, ...rows.slice(i + 1)], true);
  };
  const countBy = {};
  const serialInput = (r, label, key, placeholder, mode) => h('div', {}, h('div', { class: 'sublabel' }, label),
    h('input', { value: r[key] || '', disabled: ro, inputmode: mode, placeholder, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false',
      oninput: (e) => setRow(r.id, { [key]: e.target.value }, false) }));
  return h('div', { class: 'stack' },
    rows0.map((r) => {
      const models = catalog.filter((c) => c.kind === r.kind && ((r.manufacturer === 'Other' && r.kind !== 'antenna') || c.manufacturer === r.manufacturer) && (c.active || c.name === r.model));
      const starlinkAnt = r.kind === 'antenna' && r.manufacturer === 'Starlink';
      const mounts = starlinkAnt ? mountsFor(catalog, r.model) : [];
      const manName = r.manufacturer === 'Other' ? (r.manufacturerOther || '') : r.manufacturer;
      const tKey = ['router', 'antenna'].includes(r.kind) ? `${manName} ${r.kind}` : r.kind;
      countBy[tKey] = (countBy[tKey] || 0) + 1;
      const title = ['router', 'antenna'].includes(r.kind) ? [CARD_TITLE[r.kind], manName].filter(Boolean) : [CARD_TITLE[r.kind] || 'Equipo'];
      // Fuera de Starlink/Peplink: antena escrita a mano + accesorios/dispositivos usados
      const freeAnt = r.kind === 'antenna' && FREE_MAN.includes(r.manufacturer);
      const freeAcc = r.kind === 'accessory' && FREE_MAN.includes(r.manufacturer);
      const freeSet = (p, re) => setRow(r.id, 'modelOther' in p ? { ...p, model: p.modelOther ? '__other' : '' } : p, re);
      const eqLabel = `${title[0]}${title[1] ? ` ${title[1]}` : ''} ${countBy[tKey]}`;
      const dcE = (x = {}) => dc({ equipment: eqLabel, ...x });
      const partsBox = (hint) => partsEditor(r.parts || [], ro, (parts, re) => setRow(r.id, { parts }, re), { hint, dc: dcE });
      const removeRow = async () => {
        const cur = rows.find((x) => x.id === r.id) || r;
        const model = oneValue(cur, 'model') || (cur.modelOther ?? '');
        const deps = [];
        if (cur.parts?.length) deps.push(`${cur.parts.length} accesorio(s) o dispositivo(s) de este equipo`);
        const tests = ctx?.data?.sl_tests?.[cur.id];
        if (cur.kind === 'antenna' && tests && Object.values(tests).some((x) => x !== '' && x != null)) deps.push('Los resultados de pruebas de esta antena');
        if (!(await confirmDelete({ ...dcE(), value: [model, cur.serial && `S/N ${cur.serial}`, cur.kit && `Kit ${cur.kit}`].filter(Boolean).join(' · ') || eqLabel,
          dependents: deps, consequence: 'se eliminará este equipo con toda su configuración; el resto de equipos se conserva.' }))) return;
        onChange(rows.filter((x) => x.id !== r.id), true);
        if (deps.length && tests && ctx) { const t = { ...ctx.data.sl_tests }; delete t[cur.id]; ctx.set('sl_tests', t, false); }
      };
      return h('div', { class: 'card eq' },
        h('div', { class: 'eq-head' }, h('span', {}, title[0], title[1] ? ` ${title[1]}` : '', ` ${countBy[tKey]}`),
          ro ? null : h('div', { class: 'row' },
            ['antenna', 'router', 'sim'].includes(r.kind) ? h('button', { type: 'button', class: 'btn small', title: 'Añadir otro igual', onclick: () => clone(r) }, icon('plus', { size: 16 }), 'Otra igual') : null,
            h('button', { type: 'button', class: 'btn small danger', title: 'Quitar', onclick: removeRow }, icon('trash', { size: 16 })))),
        h('div', { class: 'grid3' },
          h('div', {}, h('div', { class: 'sublabel' }, 'Fabricante'),
            otherSelect({ obj: r, key: 'manufacturer', otherValue: 'Other', empty: false, ro, placeholder: 'Marca o sistema',
              options: Object.keys(KINDS_BY_MAN).filter((m) => m !== 'Other').map((m) => ({ v: m, es: m })),
              delInfo: () => dcE({ field: 'Fabricante' }),
              onPatch: (p, re) => setRow(r.id, 'manufacturer' in p ? { ...p, kind: KINDS_BY_MAN[p.manufacturer][0], model: '' } : p, re) })),
          h('div', {}, h('div', { class: 'sublabel' }, 'Tipo'),
            h('select', { disabled: ro, onchange: (e) => setRow(r.id, { kind: e.target.value, model: '' }, true) },
              KINDS_BY_MAN[r.manufacturer].map((k) => h('option', { value: k, selected: k === r.kind }, KIND_LABEL[k])))),
          freeAnt || freeAcc ? null : h('div', {}, h('div', { class: 'sublabel' }, 'Modelo'),
            // sin modelos en el catálogo (OneWeb, VSAT, TVRO, otro…): se escribe a mano
            models.length || !FREE_MAN.includes(r.manufacturer)
              ? otherSelect({ obj: r, key: 'model', options: models.map((m) => ({ v: m.name, es: m.name })), ro, placeholder: 'Modelo que no está en la lista',
                delInfo: () => dcE({ field: 'Modelo' }),
                onPatch: (p, re) => setRow(r.id, 'model' in p ? { ...p, mount: '' } : p, re) })
              : h('input', { placeholder: 'Marca y modelo', value: r.modelOther || '', disabled: ro, oninput: (e) => setRow(r.id, { model: e.target.value ? '__other' : '', modelOther: e.target.value }, false) }))),
        freeAnt ? satAntennaFields(r, 'modelOther', models.map((m) => m.name), ro, freeSet, dcE, r.id) : null,
        freeAcc ? partsBox('Módems, BUC, LNB, cables, piezas… aunque no estén en el catálogo') : r.kind === 'antenna'
          ? h('div', { class: 'grid3 mt' },
            serialInput(r, 'Nº de serie (S/N)', 'serial', 'Ej. 2DWC…', 'text'),
            starlinkAnt ? serialInput(r, 'Nº de kit', 'kit', 'Ej. KIT4051…', 'text')
              : h('div', {}, h('div', { class: 'sublabel' }, 'Cantidad'), h('input', { type: 'number', min: 1, inputmode: 'numeric', value: r.qty || 1, disabled: ro, oninput: (e) => setRow(r.id, { qty: Number(e.target.value) || 1 }, false) })),
            h('div', {}, h('div', { class: 'sublabel' }, 'Montura'),
              starlinkAnt ? otherSelect({ obj: r, key: 'mount', options: mounts.map((m) => ({ v: m.name, es: m.name })), ro, disabled: !r.model, placeholder: 'Montura o soporte',
                delInfo: () => dcE({ field: 'Montura' }), onPatch: (p, re) => setRow(r.id, p, re) })
                : h('input', { placeholder: 'Tipo de montura o soporte', value: r.mountOther || '', disabled: ro, oninput: (e) => setRow(r.id, { mount: e.target.value ? '__other' : '', mountOther: e.target.value }, false) })))
          : h('div', { class: 'grid2 mt' },
            r.kind === 'sim' ? serialInput(r, 'ICCID', 'serial', '8934…', 'numeric') : serialInput(r, 'Nº de serie (S/N)', 'serial', 'Ej. 1936-…', 'text'),
            h('div', {}, h('div', { class: 'sublabel' }, 'Cantidad'),
              h('input', { type: 'number', min: 1, inputmode: 'numeric', value: r.qty || 1, disabled: ro, oninput: (e) => setRow(r.id, { qty: Number(e.target.value) || 1 }, false) }))),
        h('input', { class: 'mt', placeholder: 'Notas (opcional)', value: r.notes || '', disabled: ro, oninput: (e) => setRow(r.id, { notes: e.target.value }, false) }),
        freeAnt ? partsBox() : null);
    }),
    ro ? null : h('div', { class: 'chips' },
      h('button', { type: 'button', class: 'chip add', onclick: () => add('Starlink', 'antenna') }, '+ Antena Starlink'),
      h('button', { type: 'button', class: 'chip add', onclick: () => add('OneWeb', 'antenna') }, '+ Otra antena (OneWeb, VSAT, TVRO…)'),
      h('button', { type: 'button', class: 'chip add', onclick: () => add('VSAT', 'accessory') }, '+ Accesorios / dispositivos (módem, BUC, LNB…)'),
      h('button', { type: 'button', class: 'chip add', onclick: () => add('Peplink', 'router') }, '+ Router Peplink'),
      h('button', { type: 'button', class: 'chip add', onclick: () => add('SIM', 'sim') }, '+ SIM'),
      h('button', { type: 'button', class: 'chip add', onclick: () => add('Starlink', 'cable') }, '+ Cable'),
      h('button', { type: 'button', class: 'chip add', onclick: () => add('Starlink', 'accessory') }, '+ Accesorio')));
}

// ---------------------------------------------------------------------
// Pruebas Starlink: un bloque por cada antena añadida en "Equipos"
// ---------------------------------------------------------------------
function antennaTests(ctx, ro) {
  const antennas = (ctx.data.equipment || []).filter((e) => e.kind === 'antenna');
  const all = { ...(ctx.data.sl_tests || {}) };
  // Informes antiguos: los campos sueltos pasan a la primera antena
  if (!ctx.data.sl_tests && ['sl_status', 'sl_down', 'sl_up', 'sl_latency', 'sl_obstructions', 'sl_notes'].some((k) => ctx.data[k] != null && ctx.data[k] !== '')) {
    const key = antennas[0]?.id || '_';
    all[key] = { status: ctx.data.sl_status, obstructions: ctx.data.sl_obstructions, down: ctx.data.sl_down, up: ctx.data.sl_up, latency: ctx.data.sl_latency, notes: ctx.data.sl_notes };
  }
  const blocks = antennas.length ? antennas.map((a, i) => ({ key: a.id, title: `Antena ${i + 1}`, sub: [a.model === '__other' ? a.modelOther : a.model, a.serial && `S/N ${a.serial}`, a.kit && `Kit ${a.kit}`].filter(Boolean).join(' · ') })) : [{ key: '_', title: 'Starlink', sub: 'Añade las antenas en el paso "Equipos" para tener una prueba por antena' }];
  const set = (key, patch, re) => { all[key] = { ...(all[key] || {}), ...patch }; ctx.set('sl_tests', { ...all }, re); };
  const sel = (key, k, opts) => h('select', { disabled: ro, onchange: (e) => set(key, { [k]: e.target.value }, false) },
    h('option', { value: '' }, '— Elegir —'), opts.map((o) => h('option', { value: o.v, selected: (all[key] || {})[k] === o.v }, o.es)));
  const numIn = (key, k, unit) => h('div', {}, h('div', { class: 'sublabel' }, unit),
    h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: (all[key] || {})[k] ?? '', disabled: ro, oninput: (e) => set(key, { [k]: e.target.value === '' ? '' : Number(e.target.value) }, false) }));
  return h('div', { class: 'stack' }, blocks.map((b) => h('div', { class: 'card eq' },
    h('div', { class: 'eq-head' }, h('span', {}, b.title), h('span', { class: 'muted small', style: { fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, b.sub)),
    h('div', { class: 'grid2' },
      h('div', {}, h('div', { class: 'sublabel' }, 'Estado'), sel(b.key, 'status', OPT.starlinkStatus)),
      h('div', {}, h('div', { class: 'sublabel' }, 'Obstrucciones'), sel(b.key, 'obstructions', OPT.obstructions))),
    h('div', { class: 'grid3 mt' }, numIn(b.key, 'down', 'Descarga (Mbps)'), numIn(b.key, 'up', 'Subida (Mbps)'), numIn(b.key, 'latency', 'Latencia (ms)')),
    h('textarea', { class: 'mt', rows: 2, placeholder: 'Notas de esta antena (opcional)', disabled: ro, oninput: (e) => set(b.key, { notes: e.target.value }, false) }, (all[b.key] || {}).notes || ''))));
}

function segmentsEditor(rows, ro, onChange, dc = () => ({})) {
  const total = rows.reduce((a, s) => a + (Number(s.length) || 0), 0);
  const totalEl = h('strong', {}, `Total: ${total} m`);
  const setRow = (id, patch, re) => {
    const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    rows = next;
    totalEl.textContent = `Total: ${next.reduce((a, s) => a + (Number(s.length) || 0), 0)} m`;
    onChange(next, re);
  };
  return h('div', { class: 'stack' },
    rows.map((s) => h('div', { class: 'row' },
      h('input', { style: { flex: 3 }, placeholder: 'Tramo (ej. parte superior / tejado)', value: s.desc || '', disabled: ro, oninput: (e) => setRow(s.id, { desc: e.target.value }, false) }),
      h('input', { style: { flex: 1, minWidth: '80px' }, type: 'number', inputmode: 'decimal', placeholder: 'm', value: s.length ?? '', disabled: ro, oninput: (e) => setRow(s.id, { length: e.target.value === '' ? undefined : Number(e.target.value) }, false) }),
      ro ? null : h('button', { type: 'button', class: 'btn danger small', title: 'Quitar', onclick: async () => {
        const cur = rows.find((x) => x.id === s.id) || s;
        const i = rows.findIndex((x) => x.id === s.id);
        if (!(await confirmDelete({ ...dc({ equipmentLabel: 'Tramo', equipment: `Tramo ${i + 1}` }), value: [cur.desc, cur.length != null && cur.length !== '' ? `${cur.length} m` : ''].filter(Boolean).join(' – ') || `Tramo ${i + 1}`,
          consequence: 'se eliminará este tramo y la longitud total se recalculará.' }))) return;
        onChange(rows.filter((x) => x.id !== s.id), true);
      } }, '✕'))),
    h('div', { class: 'row between' },
      ro ? h('span') : h('button', { type: 'button', class: 'chip add', onclick: () => onChange([...rows, { id: uid(), desc: '' }], true) }, '+ Añadir tramo'),
      totalEl));
}

// ---------------------------------------------------------------------
// SURVEY v2.10 — instalación existente, más antenas propuestas y material
// ---------------------------------------------------------------------
const optName = (list, v) => list.find((x) => x.v === v)?.es || v;
const numIn = (value, ro, onNum, attrs = {}) => h('input', { type: 'number', min: 0, inputmode: 'decimal', step: 'any', value: value ?? '', disabled: ro, ...attrs,
  oninput: (e) => onNum(e.target.value === '' ? '' : Number(e.target.value)) });
// Lista editable genérica: tarjetas + "Otra igual" + quitar. `rows` se mantiene al día sin redibujar al escribir.
function listState(rows0, onChange0) {
  const st = { rows: rows0 };
  st.change = (nv, re) => { st.rows = nv; onChange0(nv, re); };
  st.patch = (id, p, re) => st.change(st.rows.map((r) => (r.id === id ? { ...r, ...p } : r)), re);
  st.replace = (id, nv, re) => st.change(st.rows.map((r) => (r.id === id ? nv : r)), re);
  // Quitar una tarjeta pide confirmación con lo que se elimina (info o función que la calcula con la fila actual)
  st.remove = async (id, info) => {
    const cur = st.rows.find((r) => r.id === id);
    if (!cur) return;
    if (info && !(await confirmDelete(typeof info === 'function' ? info(cur) : info))) return;
    st.change(st.rows.filter((r) => r.id !== id), true);
  };
  st.cloneAfter = (r, copy) => { const i = st.rows.findIndex((x) => x.id === r.id); st.change([...st.rows.slice(0, i + 1), copy, ...st.rows.slice(i + 1)], true); };
  return st;
}
const cardHead = (title, ro, onClone, onRemove) => h('div', { class: 'eq-head' }, h('span', {}, ...title),
  ro ? null : h('div', { class: 'row' },
    onClone ? h('button', { type: 'button', class: 'btn small', title: 'Añadir otro igual', onclick: onClone }, icon('plus', { size: 16 }), 'Otra igual') : null,
    h('button', { type: 'button', class: 'btn small danger', title: 'Quitar', onclick: onRemove }, icon('trash', { size: 16 }))));
const REMOVED = ['To be replaced', 'To be replaced – existing mount reused', 'To be replaced – existing mount and cable reused', 'To be removed (no replacement)'];

/** Instalación existente: qué hay (antena, montura, módem…), en qué estado y qué se hará con cada cosa. */
function existingEditor(catalog, rows0, ro, onChange0, dc = () => ({}), ctx = null) {
  const st = listState(rows0, onChange0);
  const [mId, mList] = datalist([...new Set(catalog.filter((c) => c.kind === 'antenna' || c.kind === 'router').map((c) => c.name))]);
  const countBy = {};
  const add = (kind) => st.change([...st.rows, { id: uid(), kind, system: kind === 'Antenna' ? 'Starlink' : '', qty: 1 }], true);
  return h('div', { class: 'stack' }, mList,
    rows0.map((r) => {
      countBy[r.kind] = (countBy[r.kind] || 0) + 1;
      const set = (p, re = false) => st.patch(r.id, p, re);
      const ant = r.kind === 'Antenna';
      const exLabel = `${optName(OPT.existingKind, r.kind || 'Other')} ${countBy[r.kind]} (existente)`;
      const dcX = (x = {}) => dc({ equipment: exLabel, ...x });
      return h('div', { class: 'card eq existing' },
        cardHead([optName(OPT.existingKind, r.kind || 'Other'), ` ${countBy[r.kind]}`, h('span', { class: 'muted small tag' }, 'existente')], ro,
          () => st.cloneAfter(r, { ...r, id: uid(), serial: '' }), () => st.remove(r.id, (cur) => {
            const reps = (ctx?.data?.antennas_more || []).map((a, i) => (a.replaces === cur.id ? `La antena ${i + 2} dejará de indicar que sustituye a este equipo` : null)).filter(Boolean);
            return { ...dcX(), value: [oneValue(cur, 'system'), cur.model, cur.serial && `S/N ${cur.serial}`].filter(Boolean).join(' · ') || exLabel,
              dependents: reps, consequence: 'se eliminará este equipo de la instalación existente con su estado, acción prevista y notas.' };
          })),
        h('div', { class: 'grid3' },
          sub('Tipo', optSel(OPT.existingKind, r.kind || '', ro, (k) => set({ kind: k }, true))),
          sub('Sistema', otherSelect({ obj: r, key: 'system', options: SYSTEMS.map((x) => ({ v: x, es: x })), ro, placeholder: 'Escribe qué sistema o tecnología es',
            delInfo: () => dcX({ field: 'Sistema' }), onPatch: (p, re) => set(p, re) })),
          sub('Marca y modelo', h('input', { list: mId, placeholder: 'Ej. Hughes HT2000, Starlink V4…', value: r.model || '', disabled: ro, autocomplete: 'off', oninput: (e) => set({ model: e.target.value }) }))),
        h('div', { class: 'grid3 mt' },
          sub('Estado actual', optSel(OPT.existingCond, r.cond || '', ro, (c) => set({ cond: c }))),
          sub('Ubicación', optSel(OPT.location, r.location || '', ro, (l) => set({ location: l }))),
          ant ? sub('Montura actual', h('input', { placeholder: 'Tipo de montura o soporte', value: r.mount || '', disabled: ro, oninput: (e) => set({ mount: e.target.value }) }))
            : sub('Cantidad', numIn(r.qty || 1, ro, (n) => set({ qty: n || 1 }), { min: 1 }))),
        h('div', { class: 'grid2 mt' },
          sub('Qué se hará', optSel(OPT.existingAction, r.action || '', ro, (a) => set({ action: a }, true))),
          REMOVED.includes(r.action) ? sub('Destino del equipo retirado', optSel(OPT.removedDest, r.dest || '', ro, (x) => set({ dest: x }))) : h('span')),
        h('div', { class: 'grid2 mt' },
          sub('Nº de serie (S/N, opcional)', h('input', { value: r.serial || '', disabled: ro, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', oninput: (e) => set({ serial: e.target.value }) })),
          sub('Notas', h('input', { placeholder: 'Opcional', value: r.notes || '', disabled: ro, oninput: (e) => set({ notes: e.target.value }) }))));
    }),
    ro ? null : h('div', { class: 'chips' },
      h('button', { type: 'button', class: 'chip add', onclick: () => add('Antenna') }, '+ Antena existente'),
      h('button', { type: 'button', class: 'chip add', onclick: () => add('Mount / support') }, '+ Montura existente'),
      h('button', { type: 'button', class: 'chip add', onclick: () => add('Modem / router') }, '+ Módem / router existente'),
      h('button', { type: 'button', class: 'chip add', onclick: () => add('Other') }, '+ Otro equipo existente')));
}

/** Antenas 2, 3… del mismo sitio, cada una con su emplazamiento, montura y función. */
function antennaList(ctx, rows0, ro, onChange0, dc = () => ({})) {
  const st = listState(rows0, onChange0);
  const existingAnts = (ctx.data.existing || []).filter((e) => e.kind === 'Antenna');
  const exLabel = (e, i) => [`${tr('Existente')} ${i + 1}`, e.model].filter(Boolean).join(': ');
  const main = ctx.data.antenna || {};
  const add = (base) => st.change([...st.rows, { id: uid(), system: 'Starlink', qty: 1, ...base }], true);
  const fromMain = () => add({ system: main.system || 'Starlink', systemOther: main.systemOther, systemCustom: main.systemCustom, antenna: main.antenna, antennaOther: main.antennaOther, antennaCustom: main.antennaCustom,
    mount: main.mount, mountOther: main.mountOther, mountCustom: main.mountCustom,
    brand: main.brand, diameter: main.diameter, dunit: main.dunit, band: main.band, bands: main.bands, bandCustom: main.bandCustom, bandOther: main.bandOther,
    antType: main.antType, antTypeOther: main.antTypeOther, antTypeCustom: main.antTypeCustom,
    parts: main.parts ? main.parts.map((p) => ({ ...p, id: uid(), serial: '' })) : undefined, surface: ctx.data.surface !== '__other' ? ctx.data.surface : '' });
  return h('div', { class: 'stack' },
    rows0.map((r, i) => {
      const set = (p, re = false) => st.patch(r.id, p, re);
      const sysName = oneValue(r, 'system') || 'Starlink';
      const dcA = (x = {}) => dc({ equipment: `Antena ${i + 2} · ${sysName}`, ...x });
      const pick = (key, label, options, ph) => otherSelect({ obj: r, key, options, ro, placeholder: ph, delInfo: () => dcA({ field: label }), onPatch: (p, re) => set(p, re) });
      return h('div', { class: 'card eq ant-more' },
        cardHead(['Antena', ` ${i + 2}`, r.qty > 1 ? ` (x${r.qty})` : ''], ro,
          () => st.cloneAfter(r, { ...r, id: uid(), parts: r.parts ? r.parts.map((p) => ({ ...p, id: uid(), serial: '' })) : undefined }),
          () => st.remove(r.id, (cur) => ({ ...dcA(), value: [oneValue(cur, 'system') || 'Starlink', oneValue(cur, 'antenna') || [cur.brand, cur.antenna].filter(Boolean).join(' '), oneValue(cur, 'location')].filter(Boolean).join(' · ') || `Antena ${i + 2}`,
            dependents: cur.parts?.length ? [`${cur.parts.length} accesorio(s) o dispositivo(s) de esta antena`] : [],
            consequence: 'se eliminará esta antena con toda su configuración; las demás antenas se renumerarán.' }))),
        antennaMount(ctx.catalog, r, ro, (nv, re) => st.replace(r.id, nv, re), dcA),
        h('div', { class: 'grid3 mt' },
          sub('Función', pick('role', 'Función', OPT.antRole, 'Ej. Enlace de gestión')),
          existingAnts.length ? sub('Sustituye a', h('select', { disabled: ro, onchange: (e) => set({ replaces: e.target.value }) },
            h('option', { value: '' }, '— Ninguna —'), existingAnts.map((e, j) => h('option', { value: e.id, selected: e.id === r.replaces }, exLabel(e, j))))) : null,
          sub('Cantidad', numIn(r.qty || 1, ro, (n) => set({ qty: n || 1 }), { min: 1, inputmode: 'numeric', step: 1 }))),
        h('div', { class: 'grid3 mt' },
          sub('Emplazamiento', pick('location', 'Emplazamiento', OPT.location, 'Ej. Cubierta del almacén')),
          sub('Tipo de superficie', pick('surface', 'Tipo de superficie', OPT.surface, 'Ej. Panel sándwich')),
          sub('Vista del cielo', optSel(OPT.skyView, r.sky || '', ro, (x) => set({ sky: x })))),
        h('div', { class: 'grid2 mt' },
          sub('Cable estimado (m)', numIn(r.cable_m, ro, (n) => set({ cable_m: n }))),
          sub('Notas', h('input', { placeholder: 'Ubicación exacta, orientación…', value: r.notes || '', disabled: ro, oninput: (e) => set({ notes: e.target.value }) }))));
    }),
    ro ? null : h('div', { class: 'chips' },
      (main.antenna || main.brand) ? h('button', { type: 'button', class: 'chip add', onclick: fromMain }, '+ Otra igual que la antena 1') : null,
      h('button', { type: 'button', class: 'chip add', onclick: () => add({}) }, '+ Añadir antena')));
}

/** Lista de material con cantidades: lo que se deja en el sitio (mode 'left') o lo que hay que aprovisionar ('supply'). */
const QUICK_MAT = ['Antenna', 'Mount / support', 'Ballast / blocks', 'Mast / pole', 'Router / modem', 'Cable', 'Conduit / trunking', 'Other'];
const MAT_CATALOG = { Antenna: ['antenna'], 'Mount / support': ['mount'], 'Router / modem': ['router'], Cable: ['cable'] };
function materialList(catalog, rows0, mode, ro, onChange0, dc = () => ({})) {
  const st = listState(rows0, onChange0);
  const left = mode === 'left';
  const lists = {};
  const listFor = (type) => {
    const kinds = MAT_CATALOG[type] || ['accessory'];
    const key = kinds.join();
    if (!lists[key]) lists[key] = datalist([...new Set(catalog.filter((c) => kinds.includes(c.kind) && c.active).map((c) => c.name))]);
    return lists[key][0];
  };
  const rowsEl = rows0.map((r) => {
    const set = (p, re = false) => st.patch(r.id, p, re);
    return h('div', { class: 'part mat' },
      h('div', { class: 'part-head' },
        h('select', { class: 'part-type', disabled: ro, onchange: (e) => set({ type: e.target.value }, true) },
          OPT.matType.map((x) => h('option', { value: x.v, selected: x.v === r.type }, x.es))),
        r.type === 'Other' ? h('input', { class: 'part-what', placeholder: '¿Qué es?', value: r.typeOther || '', disabled: ro, oninput: (e) => set({ typeOther: e.target.value }) }) : h('span', { class: 'grow' }),
        ro ? null : h('button', { type: 'button', class: 'btn small', title: 'Añadir otro igual', onclick: () => st.cloneAfter(r, { ...r, id: uid(), serial: '' }) }, icon('plus', { size: 16 })),
        ro ? null : h('button', { type: 'button', class: 'btn small danger', title: 'Quitar', onclick: () => st.remove(r.id, (cur) => {
          const i = st.rows.findIndex((x) => x.id === cur.id);
          const u = OPT.matUnit.find((x) => x.v === (cur.unit || 'pcs'))?.es || cur.unit;
          return { ...dc({ equipmentLabel: 'Línea', equipment: `Línea ${i + 1}` }), value: [cur.type === 'Other' ? (cur.typeOther || 'Otro') : optName(OPT.matType, cur.type), cur.desc, cur.qty != null && cur.qty !== '' ? `${cur.qty} ${u}` : ''].filter(Boolean).join(' · '),
            consequence: 'se eliminará esta línea de material con su cantidad; las demás líneas se conservan.' };
        }) }, icon('trash', { size: 16 }))),
      h('div', { class: 'grid4' },
        sub('Descripción / modelo', h('input', { list: listFor(r.type), placeholder: 'Marca, modelo o descripción', value: r.desc || '', disabled: ro, autocomplete: 'off', oninput: (e) => set({ desc: e.target.value }) })),
        left ? sub('Estado', optSel(OPT.matCond, r.cond || '', ro, (x) => set({ cond: x })))
          : sub('Notas', h('input', { placeholder: 'Opcional', value: r.notes || '', disabled: ro, oninput: (e) => set({ notes: e.target.value }) })),
        sub('Unidad', h('select', { disabled: ro, onchange: (e) => set({ unit: e.target.value }) },
          OPT.matUnit.map((x) => h('option', { value: x.v, selected: x.v === (r.unit || 'pcs') }, x.es)))),
        sub('Cantidad', numIn(r.qty ?? 1, ro, (n) => set({ qty: n }), { min: 0 }))),
      left ? h('div', { class: 'grid2 mt' },
        sub('Nº de serie (S/N, opcional)', h('input', { value: r.serial || '', disabled: ro, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', oninput: (e) => set({ serial: e.target.value }) })),
        sub('Notas', h('input', { placeholder: 'Opcional', value: r.notes || '', disabled: ro, oninput: (e) => set({ notes: e.target.value }) }))) : null);
  });
  return h('div', { class: 'parts mat-list' },
    Object.values(lists).map(([, el]) => el),
    rows0.length ? null : h('div', { class: 'muted small' }, left ? 'Pulsa lo que dejas: se añade una línea con su cantidad.' : 'Opcional: añade líneas con cantidades exactas.'),
    rowsEl,
    ro ? null : h('div', { class: 'chips' },
      // Botones rápidos para lo más habitual; el resto se elige en la lista "Tipo" de cada línea
      OPT.matType.filter((x) => QUICK_MAT.includes(x.v)).map((x) => h('button', { type: 'button', class: 'chip add', onclick: () => st.change([...st.rows, { id: uid(), type: x.v, qty: 1, unit: ['Cable', 'Conduit / trunking'].includes(x.v) ? 'm' : 'pcs' }], true) }, x.v === 'Other' ? '+ Otro…' : `+ ${x.es}`))));
}
