// Paste any link → notes (Junaid: "it's not a downloader: paste a link, it makes the notes").
//   POST /link {url}  → one of:
//     the recording itself (audio or video bytes, with x-link-name / x-link-type), for the app to transcribe like a file;
//     {kind:'youtube', url}  for the app's YouTube path;
//     {kind:'text', title, text}  the readable words of a web page or a shared document;
//     {kind:'blocked', site}  for apps that do not allow it (TikTok, Instagram, X, Facebook, Snapchat).
// Only the app may use it (its own address), and only public links: private networks are refused.

const MAX_MEDIA = 200 * 1024 * 1024;   // the biggest recording that is passed through (about 3–4 hours of audio)
const MAX_PAGE = 4_000_000;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const MEDIA_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|mp4|m4v|mov|mkv|3gp|amr|wma)(\?|#|$)/i;
const BLOCKED = [
  [/(^|\.)tiktok\.com$/i, 'TikTok'], [/(^|\.)instagram\.com$/i, 'Instagram'], [/(^|\.)(x|twitter)\.com$/i, 'X'],
  [/(^|\.)(facebook|fb)\.(com|watch)$/i, 'Facebook'], [/(^|\.)snapchat\.com$/i, 'Snapchat'], [/(^|\.)threads\.net$/i, 'Threads'],
];

function privateHost(host) {
  host = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !host.includes(':')) return true;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const [a, b] = [+m[1], +m[2]]; return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
  return host.includes(':') && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'));
}

// a public share link → the address that gives the file itself
export function direct(u) {
  const url = new URL(u), host = url.hostname.toLowerCase();
  // Google Drive: /file/d/ID/view, open?id=ID, uc?id=ID
  if (/(^|\.)drive\.google\.com$/.test(host) || host === 'docs.google.com') {
    const id = (url.pathname.match(/\/d\/([\w-]{20,})/) || [])[1] || url.searchParams.get('id');
    if (/^\/(document|presentation|spreadsheets)\//.test(url.pathname) && id) {
      const kind = url.pathname.split('/')[1];
      return { url: `https://docs.google.com/${kind}/d/${id}/export?format=${kind === 'spreadsheets' ? 'csv' : 'txt'}`, doc: true };
    }
    if (id) return { url: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` };
  }
  // Dropbox: ?dl=0 → ?dl=1
  if (/(^|\.)dropbox\.com$/.test(host)) { url.searchParams.set('dl', '1'); url.searchParams.delete('raw'); return { url: url.toString() }; }
  // OneDrive personal links: ask for the download
  if (/(^|\.)(1drv\.ms|onedrive\.live\.com)$/.test(host)) { if (!url.searchParams.has('download')) url.searchParams.set('download', '1'); return { url: url.toString() }; }
  return { url: u };
}

const decode = s => s.replace(/&(#x?[\da-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[e.toLowerCase()]);
// a web page → a recording in it (podcast pages, news pages with audio), if there is one
export function findMedia(html, base) {
  const pick = [
    /<meta[^>]+(?:property|name)=["'](?:og:audio(?::secure_url|:url)?|twitter:player:stream|og:video(?::secure_url|:url)?)["'][^>]*content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:audio|og:video)(?::secure_url|:url)?["']/i,
    /<(?:audio|video|source)[^>]+src=["']([^"']+\.(?:mp3|m4a|aac|ogg|opus|wav|mp4|webm)[^"']*)/i,
    /<enclosure[^>]+url=["']([^"']+)["']/i,                    // a podcast feed
    /"contentUrl"\s*:\s*"([^"]+\.(?:mp3|m4a|aac|mp4)[^"]*)"/i,   // schema.org on podcast pages
    /"(?:streamUrl|audioUrl|episodeUrl)"\s*:\s*"(https?:[^"]+)"/i,
  ];
  for (const re of pick) { const m = html.match(re); if (m) { try { return new URL(decode(m[1].replace(/\\\//g, '/')), base).toString(); } catch {} } }
  return '';
}
// a web page → its readable words (headings, paragraphs, lists), without menus, scripts and adverts
export function readable(html) {
  const title = decode(((html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i) || html.match(/<title[^>]*>([^<]+)/i) || [])[1] || '').trim());
  let body = (html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  body = body.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|template|button|select)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(h[1-6])[^>]*>/gi, '\n\n## ').replace(/<li[^>]*>/gi, '\n- ').replace(/<(p|div|section|br|tr|blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body).replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^(## |- )\s*$/gm, '').trim();
  return { title, text };
}
const isMediaType = t => /^(audio|video)\//i.test(t) || /application\/(ogg|octet-stream)/i.test(t);
const nameFrom = (r, u, type) => {
  const cd = r.headers.get('content-disposition') || '';
  const n = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)/i) || [])[1] || '') ||
    decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || '');
  const ext = (type.match(/(?:audio|video)\/(?:x-)?(mpeg|mp4|m4a|aac|wav|ogg|webm|flac|quicktime|3gpp)/i) || [])[1];
  const clean = n.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 90) || 'Recording';
  return MEDIA_EXT.test(clean) || !ext ? clean : `${clean}.${{ mpeg: 'mp3', quicktime: 'mov', '3gpp': '3gp' }[ext.toLowerCase()] || ext.toLowerCase()}`;
};

async function open(u, extra = {}) {
  return fetch(u, { redirect: 'follow', headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'ar,en;q=0.8', ...extra }, cf: { cacheTtl: 0 } });
}
async function text(r, max) {
  const reader = r.body.getReader(); const parts = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; parts.push(value); if (n > max) { reader.cancel(); break; } }
  const all = new Uint8Array(n); let o = 0; for (const p of parts) { all.set(p.subarray(0, Math.min(p.length, n - o)), o); o += p.length; if (o >= n) break; }
  const cs = (r.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1] || 'utf-8';
  try { return new TextDecoder(cs).decode(all); } catch { return new TextDecoder().decode(all); }
}
function media(r, u, h, type) {
  const size = Number(r.headers.get('content-length') || 0);
  if (size > MAX_MEDIA) return Response.json({ error: 'too big', code: 'big', size }, { status: 413, headers: h });
  return new Response(r.body, { status: 200, headers: { ...h, 'content-type': type || 'application/octet-stream', 'x-link-name': encodeURIComponent(nameFrom(r, u, type)), 'x-link-type': type, ...(size ? { 'content-length': String(size) } : {}),
    'Access-Control-Expose-Headers': 'x-link-name, x-link-type, content-length' } });
}

export async function linkRoute(req, env, h, appOrigin) {
  const json = (o, s = 200) => Response.json(o, { status: s, headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!appOrigin) return json({ error: 'forbidden' }, 403);           // the app only, never an open downloader
  const b = await req.json().catch(() => ({}));
  let raw = String(b.url || '').trim().match(/https?:\/\/[^\s<>"]+/i)?.[0] || '';
  if (!raw || raw.length > 2000) return json({ error: 'bad link', code: 'badlink' }, 400);
  let u; try { u = new URL(raw); } catch { return json({ error: 'bad link', code: 'badlink' }, 400); }
  if (!/^https?:$/.test(u.protocol) || privateHost(u.hostname)) return json({ error: 'bad link', code: 'badlink' }, 400);
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(host)) return json({ kind: 'youtube', url: u.toString() });
  for (const [re, site] of BLOCKED) if (re.test(host)) return json({ kind: 'blocked', site });

  const d = direct(u.toString());
  let r;
  try { r = await open(d.url); } catch { return json({ error: 'could not open the link', code: 'open' }, 400); }
  if (!r.ok) return json({ error: 'could not open the link', code: r.status === 401 || r.status === 403 ? 'private' : 'open', status: r.status }, 400);
  let type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  // Google Drive's "can't check this file for viruses" page for big files: follow its download button
  if (type === 'text/html' && /drive\.usercontent\.google\.com|drive\.google\.com/.test(r.url)) {
    const page = await text(r, 400_000);
    const form = page.match(/<form[^>]+id="download-form"[^>]+action="([^"]+)"/i);
    if (form) {
      const q = new URLSearchParams([...page.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi)].map(m => [m[1], decode(m[2])]));
      r = await open(decode(form[1]) + '?' + q); type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    } else if (/accounts\.google\.com|ServiceLogin|You need access/i.test(page)) return json({ error: 'private', code: 'private' }, 400);
    else return json({ error: 'could not open the link', code: 'open' }, 400);
  }
  if (isMediaType(type) || MEDIA_EXT.test(new URL(r.url).pathname)) {
    if (type === 'application/octet-stream' && !MEDIA_EXT.test(nameFrom(r, r.url, type))) return json({ error: 'not a recording', code: 'notmedia' }, 400);
    return media(r, r.url, h, isMediaType(type) && type !== 'application/octet-stream' ? type : '');
  }
  if (d.doc || type === 'text/plain' || type === 'text/csv' || type === 'text/markdown') {
    const t = (await text(r, MAX_PAGE)).trim();
    return t.length > 40 ? json({ kind: 'text', title: '', text: t.slice(0, 900_000) }) : json({ error: 'empty', code: 'empty' }, 400);
  }
  if (type === 'application/pdf') {
    // a PDF: pass it through; the app reads PDFs itself
    const size = Number(r.headers.get('content-length') || 0);
    if (size > 50_000_000) return json({ error: 'too big', code: 'big', size }, 413);
    return new Response(r.body, { headers: { ...h, 'content-type': 'application/pdf', 'x-link-name': encodeURIComponent(nameFrom(r, r.url, 'x').replace(/(\.pdf)?$/i, '.pdf')), 'x-link-type': 'application/pdf', 'Access-Control-Expose-Headers': 'x-link-name, x-link-type, content-length' } });
  }
  if (/html|xml|rss/.test(type)) {
    const page = await text(r, MAX_PAGE);
    // a page with a recording in it (a podcast episode): give the recording
    const m = findMedia(page, r.url);
    if (m && !privateHost(new URL(m).hostname)) {
      try { const r2 = await open(m); const t2 = (r2.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (r2.ok && (isMediaType(t2) || MEDIA_EXT.test(new URL(r2.url).pathname))) {
          const resp = media(r2, r2.url, h, isMediaType(t2) && t2 !== 'application/octet-stream' ? t2 : 'audio/mpeg');
          const title = readable(page).title; if (title && resp.status === 200) resp.headers.set('x-link-name', encodeURIComponent(title.slice(0, 90) + (MEDIA_EXT.exec(new URL(r2.url).pathname)?.[0].replace(/[?#]$/, '') || '.mp3')));
          return resp;
        } } catch {}
    }
    const rd = readable(page);
    if (rd.text.length < 200) return json({ error: 'nothing to read', code: 'empty', title: rd.title }, 400);
    return json({ kind: 'text', title: rd.title, text: rd.text.slice(0, 900_000) });
  }
  return json({ error: 'not a recording or page', code: 'notmedia', type }, 400);
}
