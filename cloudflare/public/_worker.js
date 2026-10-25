/**
 * Pages Functions advanced mode: one entry point for every /api/session request.
 *
 * Per-route files (`index.js`, a `[[path]]` catch-all) proved unreliable on Pages -
 * `[[param]]` only works as a FILE name and nested catch-alls did not expose the
 * segments, so routing is done here explicitly. Static assets are served through
 * the ASSETS binding.
 */
import { handle, json } from './_lib/session.js';

const CODE = /^[0-9]{6}$/;

function route(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'session') {
    return null;
  }
  if (parts.length === 2) {
    return { action: 'create', code: '' };
  }
  if (!CODE.test(parts[2] || '')) {
    return { action: 'poll', code: parts[2] || '' };
  }
  const sub = String(parts[3] || '');
  if (!sub) {
    return { action: 'poll', code: parts[2] };
  }
  if (sub === 'confirm') {
    return { action: 'confirm-put', code: parts[2] };
  }
  return { action: sub + '-put', code: parts[2] };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return json(204, {});
    }
    const hit = route(url);
    if (!hit) {
      return env.ASSETS.fetch(request);
    }
    if (hit.action === 'create' && request.method !== 'POST') {
      return json(405, { error: 'method not allowed' });
    }
    const action = hit.action.endsWith('-put') && request.method === 'GET' ? hit.action.replace('-put', '-get') : hit.action;
    return handle({ request, env, params: { code: hit.code } }, action);
  }
};