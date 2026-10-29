import { API_URL } from './config.js';

export class ApiError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

let token = localStorage.getItem('fr_token') || '';
export const getToken = () => token;
export function setToken(t) { token = t || ''; if (t) localStorage.setItem('fr_token', t); else localStorage.removeItem('fr_token'); }

/**
 * Llama a la API de Apps Script. Se envía como texto plano para evitar el "preflight" CORS
 * (Apps Script no lo admite); la respuesta llega en JSON.
 */
export async function api(action, params = {}, { timeout = 60000 } = {}) {
  if (!navigator.onLine) throw new ApiError('Sin conexión', 'offline');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, ...params }),
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'El servidor tarda demasiado' : 'No se puede conectar con el servidor', 'offline');
  } finally { clearTimeout(t); }
  let body;
  try { body = await res.json(); } catch { throw new ApiError('Respuesta no válida del servidor (¿URL de Apps Script correcta y desplegada?)', 'bad_response'); }
  if (!body.ok) {
    if (body.code === 'auth') { setToken(''); window.dispatchEvent(new Event('auth-expired')); }
    if (body.code === 'must_change') window.dispatchEvent(new Event('must-change'));
    throw new ApiError(body.error || 'Error', body.code);
  }
  return body.data;
}
