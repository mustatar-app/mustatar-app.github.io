// The server side of "paste any link": run with  node tests/link_test.mjs
import { linkRoute } from '../server/link.js';
let fails = 0; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fails++; };
const pages = {
  'https://cdn.example.org/talk.mp3': () => new Response(new Uint8Array(5000), { headers: { 'content-type': 'audio/mpeg', 'content-length': '5000' } }),
  'https://pod.example.org/episode-7': () => new Response('<html><head><meta property="og:title" content="Episode 7: Patience"><meta property="og:audio" content="https://cdn.example.org/ep7.mp3"></head><body>x</body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
  'https://cdn.example.org/ep7.mp3': () => new Response(new Uint8Array(3000), { headers: { 'content-type': 'audio/mpeg' } }),
  'https://blog.example.org/post': () => new Response('<html><head><title>How to study</title></head><body><nav>Home About</nav><article><h1>How to study</h1>' + '<p>Review the lesson on the same day, then again after a week. </p>'.repeat(8) + '</article><footer>©</footer></body></html>', { headers: { 'content-type': 'text/html' } }),
  'https://www.dropbox.com/s/abc/lecture.m4a?dl=1': () => new Response(new Uint8Array(2000), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="lecture.m4a"' } }),
  'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrStUvWxYz123456&export=download&confirm=t': () => new Response(new Uint8Array(4000), { headers: { 'content-type': 'video/mp4', 'content-disposition': 'attachment; filename="class 3.mp4"' } }),
  'https://docs.google.com/document/d/1DocDocDocDocDocDocDocDoc12/export?format=txt': () => new Response('Meeting notes. We agreed to launch on Sunday and Ali will send the design by Monday.', { headers: { 'content-type': 'text/plain; charset=utf-8' } }),
  'https://secret.example.org/x.mp3': () => new Response('no', { status: 403 }),
};
globalThis.fetch = async (u) => { const f = pages[String(u)]; if (!f) return new Response('not found', { status: 404 }); const r = f(); Object.defineProperty(r, 'url', { value: String(u) }); return r; };
const call = (url, app = true) => linkRoute(new Request('https://srv/link', { method: 'POST', body: JSON.stringify({ url }) }), {}, {}, app);
let r;
r = await call('https://cdn.example.org/talk.mp3');
check(r.status === 200 && r.headers.get('x-link-type') === 'audio/mpeg' && decodeURIComponent(r.headers.get('x-link-name')) === 'talk.mp3' && (await r.arrayBuffer()).byteLength === 5000, 'a direct audio file comes back as the recording, with its name');
r = await call('https://pod.example.org/episode-7');
check(r.status === 200 && decodeURIComponent(r.headers.get('x-link-name')).startsWith('Episode 7: Patience'), 'a podcast page gives its episode recording, named after the episode');
r = await call('https://blog.example.org/post'); let j = await r.json();
check(j.kind === 'text' && j.title === 'How to study' && j.text.includes('Review the lesson') && !j.text.includes('Home About'), 'a web page gives its readable words without the menu');
r = await call('https://www.dropbox.com/s/abc/lecture.m4a?dl=0');
check(r.status === 200 && decodeURIComponent(r.headers.get('x-link-name')) === 'lecture.m4a', 'a Dropbox share link gives the file itself');
r = await call('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view?usp=sharing');
check(r.status === 200 && r.headers.get('x-link-type') === 'video/mp4' && decodeURIComponent(r.headers.get('x-link-name')) === 'class 3.mp4', 'a Google Drive share link gives the video itself');
r = await call('https://docs.google.com/document/d/1DocDocDocDocDocDocDocDoc12/edit'); j = await r.json();
check(j.kind === 'text' && j.text.includes('launch on Sunday'), 'a shared Google Doc gives its text');
r = await call('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); j = await r.json();
check(j.kind === 'youtube', 'a YouTube link goes to the YouTube path');
r = await call('https://www.tiktok.com/@a/video/123'); j = await r.json();
check(j.kind === 'blocked' && j.site === 'TikTok', 'TikTok is answered honestly (save it, then add it as a file)');
r = await call('https://www.instagram.com/reel/abc/'); j = await r.json();
check(j.kind === 'blocked' && j.site === 'Instagram', 'Instagram too');
r = await call('https://secret.example.org/x.mp3'); j = await r.json();
check(j.code === 'private', 'a private link says it is private');
r = await call('http://127.0.0.1:8080/admin'); check(r.status === 400, 'private network addresses are refused');
r = await call('http://localhost/x'); check(r.status === 400, 'localhost is refused');
r = await call('https://cdn.example.org/talk.mp3', false); check(r.status === 403, 'only the app can use it (not an open downloader)');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
