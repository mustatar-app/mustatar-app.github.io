// Accounts and each person's own private space.
//
//   Each person's notes, tasks, habits, boards and settings live in their OWN small database: one
//   Durable Object with SQLite per person (class UserSpace). Nobody's data is mixed with anyone else's,
//   and one busy person never slows anyone else down.
//   Sign-in details (passkeys) live in one small Accounts database. A signed-in person gets a session
//   token signed by the server, so ordinary requests never need to look anything up.
//
//   POST /auth/passkey/register/start   → options for making a passkey (new account, or a new device)
//   POST /auth/passkey/register/finish  → checks the passkey, makes the account, returns a session
//   POST /auth/passkey/login/start      → options for signing in with any saved passkey
//   POST /auth/passkey/login/finish     → checks it, returns a session
//   GET  /auth/me                       → who is signed in
//   GET  /space/pull?since=N            → everything changed since N (in pages)
//   POST /space/push                    → save changes (the newest change of each item wins)
//   GET  /space/usage                   → how much space is used, and the limit
//   POST /space/delete-all              → "delete my data": the space and the account, for good

import { DurableObject } from 'cloudflare:workers';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const SESSION_DAYS = 90;
const FLOW_MINUTES = 5;
const MAX_ITEM = 1_000_000;            // bytes of one item (one note, one task…)
const MAX_PUSH = 500;                  // items per request
const PAGE = 500;                      // items per pull page
const SPACE_LIMIT = 100 * 1024 * 1024; // free plan: 100 MB of text per person
const KINDS = /^[a-z][a-z0-9_-]{0,31}$/;
// passkeys made inside the Android app carry the app's identity instead of a web address
const ANDROID_ORIGINS = ['android:apk-key-hash:nJ8TYGIV2h5a7op5cG45zI-U5HOGovC0_fmoOEWoq4g'];
const IDS = /^[A-Za-z0-9_.:-]{1,128}$/;

const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const randomId = (n = 16) => b64u(crypto.getRandomValues(new Uint8Array(n)));

/* ---------------- each person's own database ---------------- */
export class UserSpace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.setup();
  }
  setup() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL,
      updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, seq INTEGER NOT NULL, size INTEGER NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS items_seq ON items(seq)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
  }
  meta(k, v) {
    if (v === undefined) return this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0]?.v;
    this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v));
  }
  closed() { return this.meta('closed') === '1'; }   // the person deleted their account
  used() { return this.sql.exec('SELECT COALESCE(SUM(size), 0) AS n, COUNT(*) AS c FROM items WHERE deleted = 0').toArray()[0]; }

  // changes: [{ id, kind, data, updated, deleted }]. For each item the newest "updated" wins.
  push(changes, limit = SPACE_LIMIT) {
    if (this.closed()) return { closed: true };
    let seq = Number(this.meta('seq') || 0), saved = 0, skipped = 0;
    const room = limit - this.used().n;
    let grow = 0;
    for (const c of changes) {
      const old = this.sql.exec('SELECT updated, size, deleted FROM items WHERE id = ?', c.id).toArray()[0];
      if (old && old.updated >= c.updated) { skipped++; continue; }
      const data = c.deleted ? '' : c.data;
      const size = enc.encode(data).length;
      grow += size - (old && !old.deleted ? old.size : 0);
      if (grow > room && !c.deleted) return { ok: false, error: 'full', saved, skipped, seq };
      seq++;
      this.sql.exec(`INSERT INTO items (id, kind, data, updated, deleted, seq, size) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, data = excluded.data, updated = excluded.updated,
        deleted = excluded.deleted, seq = excluded.seq, size = excluded.size`,
        c.id, c.kind, data, c.updated, c.deleted ? 1 : 0, seq, size);
      saved++;
    }
    this.meta('seq', seq);
    return { ok: true, saved, skipped, seq };
  }
  pull(since) {
    if (this.closed()) return { closed: true };
    const rows = this.sql.exec('SELECT id, kind, data, updated, deleted, seq FROM items WHERE seq > ? ORDER BY seq LIMIT ?', since, PAGE + 1).toArray();
    const more = rows.length > PAGE;
    const items = rows.slice(0, PAGE).map(r => ({ id: r.id, kind: r.kind, data: r.deleted ? null : r.data, updated: r.updated, deleted: !!r.deleted }));
    return { items, seq: items.length ? rows[items.length - 1].seq : since, more };
  }
  usage(limit = SPACE_LIMIT) { if (this.closed()) return { closed: true }; const u = this.used(); return { bytes: u.n, items: u.c, limit }; }
  async wipe() { // everything is erased; the empty space stays closed so old sign-ins cannot reopen it
    await this.ctx.storage.deleteAll();
    this.setup();
    this.meta('closed', '1');
    return { ok: true };
  }
}

/* ---------------- the accounts database (sign-in only) ---------------- */
export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, created INTEGER NOT NULL)');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS creds (id TEXT PRIMARY KEY, user TEXT NOT NULL, key TEXT NOT NULL,
      counter INTEGER NOT NULL, transports TEXT NOT NULL, created INTEGER NOT NULL, used INTEGER NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS creds_user ON creds(user)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS flows (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, user TEXT, name TEXT, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS google (sub TEXT PRIMARY KEY, user TEXT NOT NULL, email TEXT NOT NULL, created INTEGER NOT NULL)');
  }
  // "Continue with Google": the Google account is another door into the same Mustatar account
  googleUser(sub, email, name, linkTo) {
    const row = this.sql.exec('SELECT user FROM google WHERE sub = ?', sub).toArray()[0];
    if (row) return { user: row.user, created: false };
    const user = linkTo || randomId();
    if (!this.sql.exec('SELECT id FROM users WHERE id = ?', user).toArray().length)
      this.sql.exec('INSERT INTO users (id, name, created) VALUES (?, ?, ?)', user, name || '', Date.now());
    this.sql.exec('INSERT INTO google (sub, user, email, created) VALUES (?, ?, ?, ?)', sub, user, email || '', Date.now());
    return { user, created: !linkTo };
  }
  // the secret that signs sessions: made once, never leaves the server
  sessionKey() {
    let k = this.sql.exec("SELECT v FROM meta WHERE k = 'session'").toArray()[0]?.v;
    if (!k) { k = randomId(32); this.sql.exec("INSERT INTO meta (k, v) VALUES ('session', ?)", k); }
    return k;
  }
  saveFlow(challenge, user = null, name = null) {
    const now = Date.now();
    this.sql.exec('DELETE FROM flows WHERE expires < ?', now);
    const id = randomId();
    this.sql.exec('INSERT INTO flows (id, challenge, user, name, expires) VALUES (?, ?, ?, ?, ?)', id, challenge, user, name, now + FLOW_MINUTES * 60_000);
    return id;
  }
  takeFlow(id) { // a flow can be used once only
    const f = this.sql.exec('SELECT challenge, user, name, expires FROM flows WHERE id = ?', String(id)).toArray()[0];
    this.sql.exec('DELETE FROM flows WHERE id = ?', String(id));
    return f && f.expires >= Date.now() ? f : null;
  }
  userCreds(user) { return this.sql.exec('SELECT id, transports FROM creds WHERE user = ?', user).toArray().map(r => ({ id: r.id, transports: JSON.parse(r.transports) })); }
  addCred(user, name, cred) {
    const now = Date.now();
    if (!this.sql.exec('SELECT id FROM users WHERE id = ?', user).toArray().length)
      this.sql.exec('INSERT INTO users (id, name, created) VALUES (?, ?, ?)', user, name || '', now);
    this.sql.exec('INSERT INTO creds (id, user, key, counter, transports, created, used) VALUES (?, ?, ?, ?, ?, ?, ?)',
      cred.id, user, cred.key, cred.counter, JSON.stringify(cred.transports || []), now, now);
  }
  cred(id) { return this.sql.exec('SELECT id, user, key, counter, transports FROM creds WHERE id = ?', String(id)).toArray()[0] || null; }
  usedCred(id, counter) { this.sql.exec('UPDATE creds SET counter = ?, used = ? WHERE id = ?', counter, Date.now(), id); }
  user(id) { return this.sql.exec('SELECT id, name, created FROM users WHERE id = ?', id).toArray()[0] || null; }
  removeUser(id) { this.sql.exec('DELETE FROM google WHERE user = ?', id); this.sql.exec('DELETE FROM creds WHERE user = ?', id); this.sql.exec('DELETE FROM users WHERE id = ?', id); return { ok: true }; }
}

/* ---------------- sessions ---------------- */
let cachedKey = null;
async function hmacKey(env) {
  if (!cachedKey) {
    const secret = await accounts(env).sessionKey();
    cachedKey = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  }
  return cachedKey;
}
async function makeSession(env, user) {
  const body = b64u(enc.encode(JSON.stringify({ u: user, exp: Date.now() + SESSION_DAYS * 86_400_000 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body));
  return body + '.' + b64u(sig);
}
export async function sessionUser(req, env) {
  const m = /^Bearer ([\w-]+)\.([\w-]+)$/.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  try {
    if (!await crypto.subtle.verify('HMAC', await hmacKey(env), unb64u(m[2]), enc.encode(m[1]))) return null;
    const s = JSON.parse(new TextDecoder().decode(unb64u(m[1])));
    return s.exp > Date.now() && typeof s.u === 'string' ? s.u : null;
  } catch { return null; }
}

/* ---------------- Google sign-in: check the ID token Google gives the browser ---------------- */
let googleKeys = null, googleKeysAt = 0;
async function googleKey(kid) {
  if (!googleKeys || Date.now() - googleKeysAt > 3_600_000 || !googleKeys.find(k => k.kid === kid)) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    googleKeys = (await r.json()).keys || []; googleKeysAt = Date.now();
  }
  const k = googleKeys.find(x => x.kid === kid);
  return k ? crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']) : null;
}
export async function checkGoogleToken(token, clientId, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(unb64u(parts[0])));
    const body = JSON.parse(new TextDecoder().decode(unb64u(parts[1])));
    if (head.alg !== 'RS256') return null;
    if (body.aud !== clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(body.iss)) return null;
    if (!(body.exp * 1000 > now) || !body.sub || body.email_verified === false) return null;
    const key = await googleKey(head.kid);
    if (!key || !await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(parts[2]), enc.encode(parts[0] + '.' + parts[1]))) return null;
    return { sub: String(body.sub), email: String(body.email || ''), name: String(body.given_name || body.name || '').slice(0, 60) };
  } catch { return null; }
}

const accounts = env => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('accounts'));
const space = (env, user) => env.SPACE.get(env.SPACE.idFromName('user:' + user));

/* ---------------- routes ---------------- */
export async function accountRoutes(req, env, h, path, url, json, allowedOrigin) {
  if (!env.SPACE || !env.ACCOUNTS) return json({ error: 'accounts are not set up yet', code: 'noaccounts' }, 501, h);
  const origin = req.headers.get('origin') || '';
  const body = async () => { try { return await req.json(); } catch { return {}; } };

  if (path === '/auth/config' && req.method === 'GET')
    return json({ passkeys: true, googleClientId: env.GOOGLE_CLIENT_ID || '' }, 200, h);

  if (path === '/auth/google' && req.method === 'POST') {
    if (!allowedOrigin(origin)) return json({ error: 'forbidden' }, 403, h);
    if (!env.GOOGLE_CLIENT_ID) return json({ error: 'Google sign-in is not set up yet', code: 'nogoogle' }, 501, h);
    const b = await body();
    const g = await checkGoogleToken(b.credential, env.GOOGLE_CLIENT_ID);
    if (!g) return json({ error: 'Google sign-in could not be checked; please try again', code: 'google' }, 400, h);
    const signedIn = await sessionUser(req, env);
    const r = await accounts(env).googleUser(g.sub, g.email, g.name, signedIn);
    const u = await accounts(env).user(r.user);
    return json({ ok: true, token: await makeSession(env, r.user), user: { id: r.user, name: u?.name || g.name }, created: r.created }, 200, h);
  }

  if (path.startsWith('/auth/passkey/')) {
    if (req.method !== 'POST' || !allowedOrigin(origin)) return json({ error: 'forbidden' }, 403, h);
    const rpID = env.RP_ID || new URL(origin).hostname;
    const acc = accounts(env);
    const b = await body();

    if (path === '/auth/passkey/register/start') {
      // signed in already → this adds a passkey for another device; otherwise it starts a new account
      const signedIn = await sessionUser(req, env);
      const user = signedIn || randomId();
      const name = String(b.name || '').trim().slice(0, 60) || 'Mustatar';
      const options = await generateRegistrationOptions({
        rpName: 'Mustatar', rpID, userName: name, userID: enc.encode(user),
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
        excludeCredentials: signedIn ? await acc.userCreds(user) : [],
      });
      return json({ flow: await acc.saveFlow(options.challenge, user, name), options }, 200, h);
    }
    if (path === '/auth/passkey/register/finish') {
      const f = await acc.takeFlow(b.flow);
      if (!f) return json({ error: 'took too long; please try again', code: 'expired' }, 400, h);
      let v;
      try { v = await verifyRegistrationResponse({ response: b.response, expectedChallenge: f.challenge, expectedOrigin: [origin, ...ANDROID_ORIGINS], expectedRPID: rpID }); }
      catch (e) { return json({ error: 'the passkey could not be checked', code: 'passkey' }, 400, h); }
      if (!v.verified) return json({ error: 'the passkey could not be checked', code: 'passkey' }, 400, h);
      const c = v.registrationInfo.credential;
      await acc.addCred(f.user, f.name, { id: c.id, key: b64u(c.publicKey), counter: c.counter, transports: c.transports });
      return json({ ok: true, token: await makeSession(env, f.user), user: { id: f.user, name: f.name } }, 200, h);
    }
    if (path === '/auth/passkey/login/start') {
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
      return json({ flow: await acc.saveFlow(options.challenge), options }, 200, h);
    }
    if (path === '/auth/passkey/login/finish') {
      const f = await acc.takeFlow(b.flow);
      if (!f) return json({ error: 'took too long; please try again', code: 'expired' }, 400, h);
      const cred = await acc.cred(b.response?.id);
      if (!cred) return json({ error: 'this passkey is not known here', code: 'unknown' }, 400, h);
      let v;
      try {
        v = await verifyAuthenticationResponse({
          response: b.response, expectedChallenge: f.challenge, expectedOrigin: [origin, ...ANDROID_ORIGINS], expectedRPID: rpID,
          credential: { id: cred.id, publicKey: unb64u(cred.key), counter: cred.counter, transports: JSON.parse(cred.transports) },
        });
      } catch { return json({ error: 'the passkey could not be checked', code: 'passkey' }, 400, h); }
      if (!v.verified) return json({ error: 'the passkey could not be checked', code: 'passkey' }, 400, h);
      await acc.usedCred(cred.id, v.authenticationInfo.newCounter);
      const u = await acc.user(cred.user);
      return json({ ok: true, token: await makeSession(env, cred.user), user: { id: cred.user, name: u?.name || '' } }, 200, h);
    }
    return json({ error: 'not found' }, 404, h);
  }

  // everything below needs a signed-in person, and only ever touches that person's own space
  const user = await sessionUser(req, env);
  if (!user) return json({ error: 'please sign in', code: 'signin' }, 401, h);

  if (path === '/auth/me' && req.method === 'GET') {
    const u = await accounts(env).user(user);
    return u ? json({ user: { id: u.id, name: u.name, created: u.created } }, 200, h) : json({ error: 'please sign in', code: 'signin' }, 401, h);
  }
  const gone = r => r?.closed ? json({ error: 'this account was deleted', code: 'signin' }, 401, h) : null;
  if (path === '/space/pull' && req.method === 'GET') {
    const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
    const r = await space(env, user).pull(since);
    return gone(r) || json(r, 200, h);
  }
  if (path === '/space/push' && req.method === 'POST') {
    const b = await body();
    const list = Array.isArray(b.changes) ? b.changes : null;
    if (!list || list.length > MAX_PUSH) return json({ error: `send 1 to ${MAX_PUSH} changes at a time`, code: 'bad' }, 400, h);
    const changes = [];
    for (const c of list) {
      const data = c?.deleted ? '' : (typeof c?.data === 'string' ? c.data : JSON.stringify(c?.data ?? null));
      if (!c || !IDS.test(String(c.id)) || !KINDS.test(String(c.kind)) || !Number.isFinite(c.updated) || enc.encode(data).length > MAX_ITEM)
        return json({ error: 'a change is not in the right shape', code: 'bad', id: String(c?.id || '').slice(0, 128) }, 400, h);
      changes.push({ id: String(c.id), kind: String(c.kind), data, updated: Math.floor(c.updated), deleted: !!c.deleted });
    }
    const r = await space(env, user).push(changes);
    return gone(r) || json(r, r.ok ? 200 : 413, h);
  }
  if (path === '/space/usage' && req.method === 'GET') { const r = await space(env, user).usage(); return gone(r) || json(r, 200, h); }
  if (path === '/space/delete-all' && req.method === 'POST') {
    const b = await body();
    if (b.confirm !== 'DELETE') return json({ error: 'confirm with "DELETE"', code: 'confirm' }, 400, h);
    await space(env, user).wipe();
    await accounts(env).removeUser(user);
    return json({ ok: true }, 200, h);
  }
  return json({ error: 'not found' }, 404, h);
}
