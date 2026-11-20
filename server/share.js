// A note shared with friends: "Share with a friend" in My notes.
//
//   Each shared note lives in its OWN small database (one Durable Object with SQLite per shared note),
//   under a long random id that is the link: only people who are sent the link can open it.
//   Only the person who shared it (signed in) can stop sharing it. When they edit the note, the shared copy
//   follows, so friends always see the latest. Free on Cloudflare's free plan.
//   Editing together: the owner can let friends edit. The edit link carries a second secret (the edit key);
//   anyone with it can change the note, and changes made at the same time are put together (merge.js).
//
//   POST   /share            (signed in) { note, edit }        → { id, rev, key? }   share a note
//   PUT    /share/<id>       (owner, or x-edit-key) { note, base, by } → { ok, rev, note }   save (merged if needed)
//   POST   /share/<id>/edit  (owner) { on }                    → { ok, key }   let friends edit, or stop it
//   DELETE /share/<id>       (owner)                           → { ok }        stop sharing
//   GET    /share/<id>?rev=N                                   → { note, updated, rev, edit, lastBy } or { same: true }

import { DurableObject } from 'cloudflare:workers';
import { sessionUser } from './space.js';
import { mergeNote } from './merge.js';

const MAX = 1_800_000;                       // bytes of one shared note, photos included
const ID = /^[A-Za-z0-9_-]{20,40}$/;
const COLORS = /^(|coral|peach|sand|mint|sage|fog|storm|dusk|blossom|clay|chalk)$/;
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export class SharedNote extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS note (k INTEGER PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL)');
    // added for editing together (older shared notes get the new columns here)
    for (const c of ['rev INTEGER NOT NULL DEFAULT 1', 'ekey TEXT', "lastBy TEXT NOT NULL DEFAULT ''"]) { try { this.sql.exec('ALTER TABLE note ADD COLUMN ' + c); } catch {} }
    this.sql.exec('CREATE TABLE IF NOT EXISTS hist (rev INTEGER PRIMARY KEY, data TEXT NOT NULL)');   // the last versions, to put changes together
  }
  read() { return this.sql.exec('SELECT owner, data, updated, rev, ekey, lastBy FROM note WHERE k = 1').toArray()[0] || null; }
  get(rev) {
    const r = this.read(); if (!r) return null;
    if (rev && Number(rev) === r.rev) return { same: true, rev: r.rev };
    return { data: r.data, updated: r.updated, rev: r.rev, edit: !!r.ekey, lastBy: r.lastBy };
  }
  create(owner, data, updated, key) {
    if (this.read()) return { ok: false, code: 'taken' };
    this.sql.exec('INSERT INTO note (k, owner, data, updated, rev, ekey) VALUES (1, ?, ?, ?, 1, ?)', owner, data, updated, key || null);
    this.sql.exec('INSERT OR REPLACE INTO hist (rev, data) VALUES (1, ?)', data);
    return { ok: true, rev: 1 };
  }
  // a save from the owner (signed in) or from a friend with the edit key; base = the version they started from
  save(who, key, data, base, by) {
    const cur = this.read();
    if (!cur) return { ok: false, code: 'gone' };
    const owner = who && who === cur.owner;
    if (!owner && !(cur.ekey && key && key === cur.ekey)) return { ok: false, code: 'owner' };
    let next = JSON.parse(data), merged = false;
    if (!owner) next.images = JSON.parse(cur.data).images || [];   // friends change the words and the list; photos stay the owner's
    if (base && Number(base) !== cur.rev) {
      const old = this.sql.exec('SELECT data FROM hist WHERE rev = ?', Number(base)).toArray()[0];
      next = mergeNote(old ? JSON.parse(old.data) : JSON.parse(cur.data), next, JSON.parse(cur.data)); merged = true;
    }
    if (!owner) next.by = JSON.parse(cur.data).by || next.by;     // "shared by" stays the owner's name
    const out = JSON.stringify(next), rev = cur.rev + 1;
    if (out === cur.data) return { ok: true, rev: cur.rev, note: next, merged: false };
    this.sql.exec('UPDATE note SET data = ?, updated = ?, rev = ?, lastBy = ? WHERE k = 1', out, Date.now(), rev, owner ? '' : String(by || '').slice(0, 60));
    this.sql.exec('INSERT OR REPLACE INTO hist (rev, data) VALUES (?, ?)', rev, out);
    this.sql.exec('DELETE FROM hist WHERE rev < ?', rev - 60);
    return { ok: true, rev, note: next, merged };
  }
  setEdit(who, on, key) {
    const cur = this.read();
    if (!cur) return { ok: false, code: 'gone' };
    if (cur.owner !== who) return { ok: false, code: 'owner' };
    const k = on ? (cur.ekey || key) : null;
    this.sql.exec('UPDATE note SET ekey = ? WHERE k = 1', k);
    return { ok: true, key: k };
  }
  key(who) { const cur = this.read(); return cur && cur.owner === who ? cur.ekey : null; }
  remove(owner) {
    const cur = this.read();
    if (!cur) return { ok: true };
    if (cur.owner !== owner) return { ok: false, code: 'owner' };
    this.sql.exec('DELETE FROM note'); this.sql.exec('DELETE FROM hist');
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

const randomId = (n = 18) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const KEY = /^[A-Za-z0-9_-]{16,40}$/;
const stub = (env, id) => env.SHARES.get(env.SHARES.idFromName('share:' + id));

export async function shareRoutes(req, env, h, path, json) {
  if (!env.SHARES) return json({ error: 'sharing is not set up yet', code: 'noshare' }, 503, h);
  const id = path.split('/')[2] || '';
  const nocache = { ...h, 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (req.method === 'GET') {
    if (!ID.test(id)) return json({ error: 'not found', code: 'gone' }, 404, h);
    const r = await stub(env, id).get(new URL(req.url).searchParams.get('rev') || 0);
    if (!r) return json({ error: 'this note is no longer shared', code: 'gone' }, 404, h);
    if (r.same) return new Response(JSON.stringify(r), { status: 200, headers: nocache });
    // the owner also gets the edit key back (to make the edit link again on another phone)
    const me = req.headers.get('authorization') ? await sessionUser(req, env) : null;
    const key = me ? await stub(env, id).key(me) : null;
    return new Response(JSON.stringify({ note: JSON.parse(r.data), updated: r.updated, rev: r.rev, edit: r.edit, lastBy: r.lastBy, ...(key ? { key } : {}) }), { status: 200, headers: nocache });
  }
  const ekey = req.headers.get('x-edit-key') || '';
  const user = await sessionUser(req, env);
  // saving with the edit link (a friend; no sign-in needed)
  if (req.method === 'PUT' && ID.test(id) && KEY.test(ekey)) {
    const raw = await req.text();
    if (raw.length > MAX) return json({ error: 'too big', code: 'toolong' }, 413, h);
    let body = {}, note; try { body = JSON.parse(raw); note = cleanNote(body.note) || cleanNote({ ...body.note, text: ' ' }); } catch {}
    if (!note) return json({ error: 'nothing to save', code: 'bad' }, 400, h);
    const r = await stub(env, id).save(user || '', ekey, JSON.stringify(note), Number(body.base) || 0, String(body.by || ''));
    return json(r, r.ok ? 200 : r.code === 'gone' ? 404 : 403, h);
  }
  if (!user) return json({ error: 'please sign in to share', code: 'signin' }, 401, h);
  if (req.method === 'POST' && /^\/share\/[^/]+\/edit$/.test(path)) {
    if (!ID.test(id)) return json({ error: 'not found', code: 'gone' }, 404, h);
    const b = await req.json().catch(() => ({}));
    const r = await stub(env, id).setEdit(user, !!b.on, randomId(15));
    return json(r, r.ok ? 200 : r.code === 'gone' ? 404 : 403, h);
  }
  if (req.method === 'DELETE') {
    if (!ID.test(id)) return json({ error: 'not found', code: 'gone' }, 404, h);
    const r = await stub(env, id).remove(user);
    return json(r, r.ok ? 200 : 403, h);
  }
  const raw = await req.text();
  if (raw.length > MAX) return json({ error: 'this note is too big to share (photos are kept smaller; remove some)', code: 'toolong' }, 413, h);
  let body = {}, note; try { body = JSON.parse(raw); note = cleanNote(body.note); } catch {}
  if (!note) return json({ error: 'nothing to share', code: 'bad' }, 400, h);
  const data = JSON.stringify(note);
  if (new TextEncoder().encode(data).length > MAX) return json({ error: 'this note is too big to share', code: 'toolong' }, 413, h);
  if (req.method === 'POST' && path === '/share') {
    const nid = randomId(), key = body.edit ? randomId(15) : null;
    const r = await stub(env, nid).create(user, data, Date.now(), key);
    return r.ok ? json({ ok: true, id: nid, rev: r.rev, ...(key ? { key } : {}) }, 200, h) : json({ error: 'try again', code: r.code }, 409, h);
  }
  if (req.method === 'PUT' && ID.test(id)) {
    const r = await stub(env, id).save(user, '', data, Number(body.base) || 0, '');
    return json(r, r.ok ? 200 : r.code === 'gone' ? 404 : 403, h);
  }
  return json({ error: 'not found' }, 404, h);
}
