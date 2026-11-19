// A note shared with friends: "Share with a friend" in My notes.
//
//   Each shared note lives in its OWN small database (one Durable Object with SQLite per shared note),
//   under a long random id that is the link: only people who are sent the link can open it.
//   Only the person who shared it (signed in) can change it or stop sharing it. When they edit the note,
//   the shared copy follows, so friends always see the latest. Free on Cloudflare's free plan.
//
//   POST   /share          (signed in) { note }  → { id }      share a note
//   PUT    /share/<id>     (signed in) { note }  → { ok }      update it (owner only)
//   DELETE /share/<id>     (signed in)           → { ok }      stop sharing (owner only)
//   GET    /share/<id>                           → { note, updated, by }   anyone with the link

import { DurableObject } from 'cloudflare:workers';
import { sessionUser } from './space.js';

const MAX = 1_800_000;                       // bytes of one shared note, photos included
const ID = /^[A-Za-z0-9_-]{20,40}$/;
const COLORS = /^(|coral|peach|sand|mint|sage|fog|storm|dusk|blossom|clay|chalk)$/;
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export class SharedNote extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS note (k INTEGER PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL)');
  }
  read() { return this.sql.exec('SELECT owner, data, updated FROM note WHERE k = 1').toArray()[0] || null; }
  get() { const r = this.read(); return r ? { data: r.data, updated: r.updated } : null; }
  put(owner, data, updated, create) {
    const cur = this.read();
    if (create && cur) return { ok: false, code: 'taken' };
    if (!create && !cur) return { ok: false, code: 'gone' };
    if (cur && cur.owner !== owner) return { ok: false, code: 'owner' };
    this.sql.exec('INSERT INTO note (k, owner, data, updated) VALUES (1, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET data = excluded.data, updated = excluded.updated', owner, data, updated);
    return { ok: true };
  }
  remove(owner) {
    const cur = this.read();
    if (!cur) return { ok: true };
    if (cur.owner !== owner) return { ok: false, code: 'owner' };
    this.sql.exec('DELETE FROM note');
    return { ok: true };
  }
}

// only the parts of a note a friend needs, checked
export function cleanNote(n) {
  if (!n || typeof n !== 'object') return null;
  const s = (v, max) => String(v ?? '').slice(0, max);
  const out = {
    title: s(n.title, 300), text: s(n.text, 200_000), color: COLORS.test(String(n.color || '')) ? String(n.color || '') : '',
    items: Array.isArray(n.items) ? n.items.slice(0, 500).map(i => ({ t: s(i?.t, 2000), done: !!i?.done })) : null,
    labels: Array.isArray(n.labels) ? n.labels.slice(0, 10).map(l => s(l, 40)) : [],
    images: Array.isArray(n.images) ? n.images.slice(0, 12).filter(i => IMG.test(String(i?.data || ''))).map(i => ({ data: String(i.data), w: Math.max(0, Math.min(10000, Number(i.w) || 0)), h: Math.max(0, Math.min(10000, Number(i.h) || 0)) })) : [],
    by: s(n.by, 80),
  };
  if (!out.title.trim() && !out.text.trim() && !(out.items || []).some(i => i.t.trim()) && !out.images.length) return null;
  return out;
}

const randomId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const stub = (env, id) => env.SHARES.get(env.SHARES.idFromName('share:' + id));

export async function shareRoutes(req, env, h, path, json) {
  if (!env.SHARES) return json({ error: 'sharing is not set up yet', code: 'noshare' }, 503, h);
  const id = path.split('/')[2] || '';
  if (req.method === 'GET') {
    if (!ID.test(id)) return json({ error: 'not found', code: 'gone' }, 404, h);
    const r = await stub(env, id).get();
    if (!r) return json({ error: 'this note is no longer shared', code: 'gone' }, 404, h);
    return new Response(JSON.stringify({ note: JSON.parse(r.data), updated: r.updated }), { status: 200, headers: { ...h, 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  const user = await sessionUser(req, env);
  if (!user) return json({ error: 'please sign in to share', code: 'signin' }, 401, h);
  if (req.method === 'DELETE') {
    if (!ID.test(id)) return json({ error: 'not found', code: 'gone' }, 404, h);
    const r = await stub(env, id).remove(user);
    return json(r, r.ok ? 200 : 403, h);
  }
  const raw = await req.text();
  if (raw.length > MAX) return json({ error: 'this note is too big to share (photos are kept smaller; remove some)', code: 'toolong' }, 413, h);
  let note; try { note = cleanNote(JSON.parse(raw)?.note); } catch {}
  if (!note) return json({ error: 'nothing to share', code: 'bad' }, 400, h);
  const data = JSON.stringify(note);
  if (new TextEncoder().encode(data).length > MAX) return json({ error: 'this note is too big to share', code: 'toolong' }, 413, h);
  if (req.method === 'POST' && path === '/share') {
    const nid = randomId();
    const r = await stub(env, nid).put(user, data, Date.now(), true);
    return r.ok ? json({ ok: true, id: nid }, 200, h) : json({ error: 'try again', code: r.code }, 409, h);
  }
  if (req.method === 'PUT' && ID.test(id)) {
    const r = await stub(env, id).put(user, data, Date.now(), false);
    return json(r, r.ok ? 200 : r.code === 'gone' ? 404 : 403, h);
  }
  return json({ error: 'not found' }, 404, h);
}
