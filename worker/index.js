// Ourtwo 通知小幫手（Cloudflare Worker，每分鐘檢查一次有沒有新留言）
// 需要兩個 Secret：FID（家庭編號）、VAPID_JWK（推播私鑰）。不要把它們寫進這個檔案。
const KEY = 'AIzaSyB7Rq6SU2PJm5-O0PeqqiroX8QcpAHVM-Q';
const BASE = 'https://firestore.googleapis.com/v1/projects/ourtwo-bfb8d/databases/(default)/documents';
const VAPID_PUB = 'BMmsYwVKIthLmHnioturlTNgKm_8XALobFZE3k8hR1BVU4_SEikCIX4okvBnq2-gOT8DJBJxVPeN5M7uFkts7nQ';

// 小記憶：用 Durable Object 記住登入憑證與「已通知到哪一則」
export class State {
  constructor(state) { this.s = state.storage; }
  async fetch(req) {
    const u = new URL(req.url); const k = u.searchParams.get('k');
    if (req.method === 'PUT') { await this.s.put(k, await req.text()); return new Response('ok'); }
    const v = await this.s.get(k); return new Response(v === undefined ? null : v, { status: v === undefined ? 404 : 200 });
  }
}
const stub = env => env.STATE.get(env.STATE.idFromName('main'));
async function sget(env, k) { const r = await stub(env).fetch('https://s/?k=' + k); return r.status === 200 ? await r.text() : null; }
async function sput(env, k, v) { await stub(env).fetch('https://s/?k=' + k, { method: 'PUT', body: v }); }

async function getToken(env) {
  const rt = await sget(env, 'rt');
  if (rt) {
    const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + KEY, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt)
    });
    if (r.ok) { const j = await r.json(); await sput(env, 'rt', j.refresh_token); return j.id_token; }
  }
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
  });
  if (!r.ok) throw new Error('auth ' + r.status);
  const j = await r.json(); await sput(env, 'rt', j.refreshToken); return j.idToken;
}

const val = f => f == null ? undefined : f.stringValue !== undefined ? f.stringValue : f.integerValue !== undefined ? Number(f.integerValue) : f.doubleValue;

async function newer(env, tok, coll, seen) {
  const r = await fetch(BASE + '/families/' + env.FID + ':runQuery', {
    method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: coll }],
      where: { fieldFilter: { field: { fieldPath: 'ts' }, op: 'GREATER_THAN', value: { integerValue: String(seen) } } },
      orderBy: [{ field: { fieldPath: 'ts' }, direction: 'ASCENDING' }], limit: 20 } })
  });
  if (!r.ok) throw new Error(coll + ' ' + r.status);
  const rows = await r.json();
  return rows.filter(x => x.document).map(x => ({ by: val(x.document.fields.by), ts: val(x.document.fields.ts) }));
}

const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = s => new TextEncoder().encode(s);

async function vapid(endpoint, env) {
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:ourtwo@example.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(head + '.' + body));
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + VAPID_PUB;
}

async function subs(env, tok) {
  const r = await fetch(BASE + '/families/' + env.FID + '/push', { headers: { authorization: 'Bearer ' + tok } });
  if (!r.ok) return {};
  const j = await r.json(); const out = {};
  (j.documents || []).forEach(d => { const id = d.name.split('/').pop(); try { out[id] = JSON.parse(val(d.fields.sub)); } catch (e) { /* skip */ } });
  return out;
}

async function send(sub, env, tok, id) {
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { authorization: await vapid(sub.endpoint, env), ttl: '86400', urgency: 'normal' } });
  if (r.status === 404 || r.status === 410) {
    await fetch(BASE + '/families/' + env.FID + '/push/' + id, { method: 'DELETE', headers: { authorization: 'Bearer ' + tok } });
  }
  return r.status;
}

export async function run(env) {
  const tok = await getToken(env);
  const raw = await sget(env, 'seen');
  if (raw === null) { await sput(env, 'seen', String(Date.now())); return 'init'; }
  const seen = Number(raw);
  let max = seen; const toNotify = new Set();
  for (const c of ['board', 'notes', 'memos']) {
    for (const it of await newer(env, tok, c, seen)) {
      if (it.ts > max) max = it.ts;
      const to = it.by === '老公' ? 'her' : it.by === '老婆' ? 'him' : null;
      if (to) toNotify.add(to);
    }
  }
  if (!toNotify.size) return 'none';
  const all = await subs(env, tok);
  const res = [];
  for (const to of toNotify) if (all[to]) res.push(to + ':' + await send(all[to], env, tok, to));
  await sput(env, 'seen', String(max));
  return res.join(',') || 'no-sub';
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env).catch(e => console.log('ERR', e.message))); },
  async fetch(req, env) { try { return new Response(await run(env)); } catch (e) { return new Response('ERR ' + e.message, { status: 500 }); } }
};
