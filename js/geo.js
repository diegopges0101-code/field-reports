// Dirección a partir de las coordenadas GPS (gratis y sin clave).
// 1º OpenStreetMap (Nominatim): dirección completa con calle. 2º BigDataCloud si el primero falla.
// Los nombres de país salen en inglés (el informe es en inglés); calles y pueblos, como se escriben allí.

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const getJson = async (url, ms) => { const r = await withTimeout(fetch(url, { headers: { Accept: 'application/json' } }), ms); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? '').trim()]));

async function nominatim(lat, lon) {
  const j = await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=en`, 6000);
  const a = j.address || {};
  if (!a.country_code) throw new Error('sin datos');
  const street = [a.road || a.pedestrian || a.footway || a.path || a.hamlet || a.isolated_dwelling, a.house_number].filter(Boolean);
  const address = [street.length ? (a.house_number && /^(FR|ES|IT|BE|PT|GB|IE|US|CA|LU|MC)$/i.test(a.country_code) ? `${a.house_number} ${street[0]}` : street.join(' ')) : '', a.locality || a.neighbourhood || a.suburb || a.quarter].filter(Boolean);
  return clean({
    address: [...new Set(address)].join(', '),
    city: a.city || a.town || a.village || a.municipality || a.hamlet || '',
    postcode: a.postcode,
    region: [a.county || a.state_district, a.state || a.region].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).join(', '),
    region_code: a['ISO3166-2-lvl6'] || a['ISO3166-2-lvl4'] || a['ISO3166-2-lvl5'] || '',
    country: a.country,
    country_code: String(a.country_code).toUpperCase(),
  });
}

async function bigDataCloud(lat, lon) {
  const j = await getJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, 6000);
  if (!j.countryCode) throw new Error('sin datos');
  const admin = (j.localityInfo?.administrative || []).sort((x, y) => (x.adminLevel || 0) - (y.adminLevel || 0));
  const dept = admin.find((x) => x.adminLevel === 6)?.name;
  return clean({
    address: '',
    city: j.city || j.locality,
    postcode: j.postcode,
    region: [dept, j.principalSubdivision].filter(Boolean).join(', '),
    region_code: j.principalSubdivisionCode,
    country: j.countryName,
    country_code: j.countryCode,
  });
}

/** Devuelve { address, city, postcode, region, region_code, country, country_code } */
export async function reverseGeocode(lat, lon) {
  lat = Number(lat).toFixed(6); lon = Number(lon).toFixed(6);
  try { return await nominatim(lat, lon); } catch { /* siguiente servicio */ }
  return bigDataCloud(lat, lon);
}

/** Lee coordenadas escritas a mano: "43.7358, 7.2931" o 43°44'09.03"N – 7°17'35.20"E */
export function parseCoords(s) {
  s = String(s || '').trim();
  if (!s) return null;
  const dec = s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (dec) { const lat = +dec[1], lon = +dec[2]; return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null; }
  const re = /(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*["″]?\s*([NSEWO])/gi;
  const parts = [...s.matchAll(re)];
  if (parts.length !== 2) return null;
  const val = (m) => { const v = +m[1] + +m[2] / 60 + parseFloat(m[3].replace(',', '.')) / 3600; return /[SWO]/i.test(m[4]) ? -v : v; };
  const a = parts.find((m) => /[NS]/i.test(m[4])), b = parts.find((m) => /[EWO]/i.test(m[4]));
  return a && b ? { lat: val(a), lon: val(b) } : null;
}

export const GEO_KEYS = ['address', 'postcode', 'city', 'region', 'region_code', 'country', 'country_code'];
