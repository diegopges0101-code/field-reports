// =====================================================================
//  Valores personalizados («Otro») con varios valores por campo (v2.11)
//  Formato de datos, compatible con los informes anteriores:
//    campo de una opción:  { key: '__other', keyCustom: ['A', 'B'], keyOther: 'A / B' }
//    banda (multivalor):   { bands: ['Ku', 'Ka'], bandCustom: ['X-Band'], band: 'Ku, Ka, X-Band' }
//  keyOther / band se mantienen como texto para que las versiones anteriores
//  de la app, el PDF y la IA sigan leyendo el dato aunque no conozcan las listas.
// =====================================================================

/** Normaliza: espacios repetidos fuera y recorte. */
export const normVal = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** Mismo valor sin distinguir mayúsculas/minúsculas ni espacios sobrantes. */
export const sameVal = (a, b) => normVal(a).toLocaleLowerCase() === normVal(b).toLocaleLowerCase();
export const OTHER_SEP = ' / ';

/** Lista de valores personalizados de `key` (con los informes antiguos: el texto único de keyOther). */
export function customOf(obj, key) {
  const arr = obj?.[`${key}Custom`];
  const legacy = normVal(obj?.[`${key}Other`]);
  // La lista solo vale si sigue de acuerdo con keyOther: si otra pantalla (o una versión anterior de la app)
  // cambió el texto, manda el texto.
  if (Array.isArray(arr) && normVal(arr.join(OTHER_SEP)) === legacy) return arr.map(normVal).filter(Boolean);
  return legacy ? [legacy] : [];
}
/** Parche que guarda la lista y su texto equivalente (compatibilidad). */
export const customPatch = (key, arr) => ({ [`${key}Custom`]: arr, [`${key}Other`]: arr.join(OTHER_SEP) });

/** Valor visible de un campo de una opción: la opción elegida o sus valores personalizados. */
export function oneValue(obj, key, otherValue = '__other') {
  const v = obj?.[key];
  if (v === otherValue) return customOf(obj, key).join(OTHER_SEP);
  return typeof v === 'string' ? v : '';
}

/** Bandas de una antena: opciones marcadas + personalizadas. Informes antiguos: `band` era un único texto. */
export function bandsOf(obj) {
  if (Array.isArray(obj?.bands)) {
    const b = { values: obj.bands.filter(Boolean), custom: customOf(obj, 'band') };
    if (normVal([...b.values, ...b.custom].join(', ')) === normVal(obj.band)) return b; // si no cuadra, manda el texto `band`
  }
  const b = normVal(obj?.band);
  return { values: b ? [b] : [], custom: [] };
}
export const bandText = (obj) => { const b = bandsOf(obj); return [...b.values, ...b.custom].join(', '); };
export const bandPatch = (values, custom) => ({ bands: values, bandCustom: custom, bandOther: custom.join(OTHER_SEP), band: [...values, ...custom].join(', ') });

/**
 * Añade un valor a una lista evitando vacíos y duplicados (también contra las opciones predefinidas).
 * Devuelve { list } o { error }.
 */
export function addUnique(list, value, predefined = []) {
  const v = normVal(value);
  if (!v) return { error: 'Escribe un valor antes de añadirlo' };
  if (list.some((x) => sameVal(x, v))) return { error: `«${v}» ya está en la lista` };
  const pre = predefined.find((o) => sameVal(o.v, v) || sameVal(o.es, v));
  if (pre) return { error: `«${v}» ya es una opción de la lista: elígela arriba`, option: pre.v };
  return { list: [...list, v] };
}
