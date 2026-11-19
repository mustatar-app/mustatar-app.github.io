// Inside the Android app the page runs in a web view, which cannot save a download, open the share sheet
// or read aloud by itself. This file hands those jobs to the app (MainActivity.java and FileOut.java):
//   JundNative.save(blob, name)  → the phone's gallery (pictures, videos) or Downloads, in a "Mustatar" folder
//   JundNative.share(files)      → the share sheet (Instagram, WhatsApp, Drive…)
//   navigator.share(...)         → the same share sheet, so every Share button in the app works
//   JundNative.speak(text, lang) → the phone's own reading voice
// In a browser, MustatarAndroid does not exist and this file does nothing.
(() => {
  const A = window.MustatarAndroid;
  if (!A) return;
  const waiting = new Map();
  A.addEventListener('message', e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (!m) return;
    const key = m.file !== undefined ? 'f:' + m.file : m.spoke !== undefined ? 's:' + m.spoke : null;
    if (key && waiting.has(key)) { waiting.get(key)(m.file !== undefined ? (m.result || {}) : m); waiting.delete(key); }
  });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ask = (msg, ms = 300000) => new Promise(res => {
    const job = uid();
    waiting.set('f:' + job, res);
    setTimeout(() => { if (waiting.delete('f:' + job)) res({ ok: false, error: 'the app did not answer' }); }, ms);
    A.postMessage(JSON.stringify({ ...msg, job }));
  });
  const toB64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  const CHUNK = 384 * 1024;   // about 0.5 MB of text per message
  async function send(blob, name) {
    const id = uid();
    A.postMessage(JSON.stringify({ action: 'fileStart', id, name: name || blob.name || 'Mustatar file', mime: (blob.type || 'application/octet-stream').split(';')[0] }));
    for (let i = 0; i < blob.size; i += CHUNK) A.postMessage(JSON.stringify({ action: 'fileChunk', id, data: await toB64(blob.slice(i, i + CHUNK)) }));
    A.postMessage(JSON.stringify({ action: 'fileEnd', id }));
    return id;
  }
  async function out(list, action) {
    const ids = [];
    for (const f of list) ids.push(await send(f.blob, f.name));
    return ask({ action, ids });
  }
  const N = window.JundNative = {
    save: (blob, name) => out([{ blob, name }], 'fileSave'),
    saveAll: files => out(files.map(f => ({ blob: f, name: f.name })), 'fileSave'),
    share: files => out(files.map(f => ({ blob: f, name: f.name })), 'fileShare'),
    shareText: (text, title) => ask({ action: 'shareText', text: String(text || ''), title: String(title || '') }),
    speak: (text, lang, rate = 1) => new Promise(res => {
      const id = uid();
      waiting.set('s:' + id, res);
      A.postMessage(JSON.stringify({ action: 'speak', id, text: String(text || ''), lang, rate }));
    }),
    stopSpeaking: () => A.postMessage(JSON.stringify({ action: 'stopSpeaking' })),
    // "Continue with Google": the phone's own Google sheet → a signed token for the server
    googleSignIn: clientId => ask({ action: 'googleSignIn', clientId }, 180000),
    // the same, in the phone's browser (it comes back with app.mustatar://signin)
    openBrowser: url => ask({ action: 'openBrowser', url }, 20000),
  };
  // the browser's own share, done by the app (a web view has none, or one that does nothing)
  const share = async data => {
    const r = data?.files?.length ? await N.share([...data.files])
      : await N.shareText([data?.text, data?.url].filter(Boolean).join('\n'), data?.title || '');
    if (!r.ok) throw Object.assign(new Error(r.error || 'Could not share'), { name: 'NotAllowedError' });
  };
  const canShare = data => !!data && (!!data.files?.length || !!data.text || !!data.url || !!data.title);
  try {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
  } catch {}
})();
