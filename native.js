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

/* Opening the microphone, the same way everywhere (recorder, voice chat, dictation, voice notes).
   If the phone refuses the clean-up options (echo and noise), it tries again with the plain microphone,
   and a failure comes with a message that says what actually went wrong. */
window.openMic = async function openMic(audio) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no getUserMedia'), { name: 'NotSupportedError' });
  try { return await navigator.mediaDevices.getUserMedia({ audio: audio || true }); }
  catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
    try { return await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e2) {
      if (e2?.name !== 'NotReadableError' && e2?.name !== 'AbortError') throw e2;
      await new Promise(r => setTimeout(r, 700));          // the microphone may be just closing from another use
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }
};
window.micError = function micError(e) {
  const ar = (window.ZadLang || document.documentElement.lang) === 'ar', app = !!window.JundNative;
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError' || (n === 'NotSupportedError' && e.message !== 'no getUserMedia')) return app
    ? (ar ? 'اسمح لمستطر باستخدام المايك: الإعدادات ← التطبيقات ← مستطر ← الأذونات ← الميكروفون، ثم حاول مرة أخرى.' : 'Allow the microphone for Mustatar: Settings › Apps › Mustatar › Permissions › Microphone, then try again.')
    : (ar ? 'اسمح لمستطر باستخدام المايك (من إعدادات الموقع في المتصفح، رمز القفل بجانب العنوان) ثم حاول مرة أخرى.' : 'Allow the microphone for Mustatar (in the browser’s site settings — the lock next to the address), then try again.');
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return ar ? 'لم يُعثر على مايك في هذا الجهاز. صِل سماعة بمايك أو جرّب جهازًا آخر.' : 'No microphone was found on this device. Plug in a headset with a mic, or try another device.';
  if (n === 'NotReadableError' || n === 'AbortError') return ar ? 'المايك مشغول؛ قد يكون تطبيق آخر يستخدمه (مكالمة أو مسجّل). أغلقه ثم حاول مرة أخرى.' : 'The microphone is busy — another app (a call or a recorder) may be using it. Close it, then try again.';
  if (n === 'NotSupportedError') return ar ? 'هذا المتصفح لا يسمح بالتسجيل. افتح مستطر في Chrome أو من التطبيق.' : 'This browser cannot record. Open Mustatar in Chrome, or in the app.';
  return ar ? 'تعذّر فتح المايك. حاول مرة أخرى.' : 'The microphone could not start. Please try again.';
};
