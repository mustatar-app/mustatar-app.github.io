/* Mustatar — helping the owner improve the app.
   - Problems: when something fails (an error on screen, a crash), a short report is sent: what failed, on which screen, app version.
   - Feedback: people can write a problem or an idea from Settings.
   - Usage: once a day, how many times each button was used (just counts — never note contents, recordings or messages).
   - Owner view: the app owner, with the owner code, sees everything grouped, and can copy it all to ask Claude for a quality review. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = window.ZadLang === 'ar';
const L = (en, ar) => AR ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
const day = () => new Date().toISOString().slice(0, 10);
const anon = store.get('anon') || (() => { const a = Math.random().toString(36).slice(2, 10); store.set('anon', a); return a; })();
const allowed = () => store.get('shareReports', true);
const version = () => (document.querySelector('#app-version')?.textContent || '').replace(/[^\d.]/g, '');

function base(kind) {
  const me = J.me() || {};
  return { kind, anon, app: version(), lang: AR ? 'ar' : 'en', page: document.querySelector('.screen:not([hidden])')?.id?.replace('screen-', '') || '',
    name: store.get('shareName', true) ? (me.name || '') : '', roles: (me.roles || [me.use || '']).join('+'), ua: (navigator.userAgent.match(/(Android [\d.]+|iPhone OS [\d_]+|Windows NT [\d.]+|Mac OS X [\d_]+)/) || [''])[0] + (/Brave/.test(navigator.userAgent) || navigator.brave ? ' Brave' : /SamsungBrowser/.test(navigator.userAgent) ? ' Samsung' : /Chrome/.test(navigator.userAgent) ? ' Chrome' : /Safari/.test(navigator.userAgent) ? ' Safari' : '') };
}
async function send(body) {
  try { await J.serverFetch('/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }); return true; } catch { return false; }
}

/* ---------- problems ---------- */
const seen = new Map();
function problem(msg, extra = {}) {
  if (!allowed()) return;
  msg = String(msg || '').slice(0, 300); if (!msg) return;
  const k = msg.slice(0, 80), now = Date.now();
  if (now - (seen.get(k) || 0) < 3600e3) return;                       // the same problem at most once an hour
  const c = store.get('repCount', {}); if (c.d !== day()) { c.d = day(); c.n = 0; }
  if (c.n >= 30) return; c.n++; store.set('repCount', c);                // at most 30 a day from one phone
  seen.set(k, now);
  send({ ...base('error'), msg, ...extra });
}
window.addEventListener('error', e => { if (e.message && !/ResizeObserver|Script error/i.test(e.message)) problem(e.message, { stack: `${e.filename?.split('/').pop()}:${e.lineno}:${e.colno}`, where: 'crash' }); });
window.addEventListener('unhandledrejection', e => { const m = e.reason?.message || String(e.reason || ''); if (m && !/abort/i.test(m)) problem(m, { stack: String(e.reason?.stack || '').split('\n').slice(0, 3).join(' | '), where: 'crash' }); });
// every error message the app shows to a person is also a problem worth knowing about
const errText = J.errText;
J.errText = e => { const t = errText(e); if (!/abort|cancel/i.test(String(e?.message || e))) problem(t, { where: 'shown', code: e?.code || '' }); return t; };

/* ---------- usage counts (only how often each button is used) ---------- */
function count(name) {
  const u = store.get('usage', {}); if (u.d !== day()) { flush(u); u.d = day(); u.c = {}; }
  u.c ||= {}; u.c[name] = (u.c[name] || 0) + 1; store.set('usage', u);
}
function flush(u) { if (u?.d && u.c && Object.keys(u.c).length && allowed()) send({ ...base('usage'), msg: u.d, counts: u.c }); }
document.addEventListener('click', e => {
  const b = e.target.closest('button, a, summary'); if (!b) return;
  const name = b.id || b.dataset.go || b.dataset.tab || b.dataset.m || b.dataset.r || (b.matches('summary') ? 'open:' + b.textContent.trim().slice(0, 24) : '') || [...b.classList].find(c => !/^(primary|ghost|small|icon-btn|on)$/.test(c)) || '';
  if (name) count(name);
}, true);
(() => { const u = store.get('usage', {}); if (u.d && u.d !== day()) { flush(u); store.set('usage', { d: day(), c: {} }); } })();
function event(name) { count('event:' + name); }

/* ---------- feedback (Settings) ---------- */
function settingsCard() {
  const fine = document.querySelector('#screen-settings > p.fine');
  const c = document.createElement('div'); c.className = 'card'; c.id = 'fb-card'; c.setAttribute('data-noi18n', '');
  c.innerHTML = `<div class="card-h">${L('Help improve Mustatar', 'ساعد في تحسين مستطر')}</div>
    <p class="muted fine">${L('Something not working, something missing, or an idea? Write it here — it goes straight to the app’s owner.', 'شيء لا يعمل، أو ينقص، أو لديك فكرة؟ اكتبها هنا — تصل مباشرة إلى صاحب التطبيق.')}</p>
    <div class="fb-kinds">${[['problem', L('🐞 Problem', '🐞 مشكلة')], ['idea', L('💡 Idea', '💡 فكرة')], ['missing', L('🧩 Something missing', '🧩 شيء ناقص')]].map(([k, t], i) => `<button type="button" class="fb-k${i ? '' : ' on'}" data-k="${k}">${t}</button>`).join('')}</div>
    <textarea id="fb-text" rows="4" dir="auto" placeholder="${L('What happened, or what would help you?', 'ماذا حدث، أو ما الذي يفيدك؟')}"></textarea>
    <div class="row-gap"><button type="button" class="primary" id="fb-send">${L('Send', 'أرسل')}</button><span class="muted" id="fb-status"></span></div>
    <label class="check"><input type="checkbox" id="fb-share"> ${L('Send problem reports and button-use counts automatically (never your notes or recordings)', 'أرسل تقارير المشاكل وعدد استخدام الأزرار تلقائيًا (لا تُرسل ملاحظاتك أو تسجيلاتك أبدًا)')}</label>
    <label class="check"><input type="checkbox" id="fb-name"> ${L('Include my first name', 'أرفق اسمي الأول')}</label>
    <button type="button" class="ghost small" id="fb-owner">${store.get('ownerCode') ? L('Open the owner view', 'افتح لوحة المالك') : L('I am the app owner', 'أنا صاحب التطبيق')}</button>`;
  fine ? fine.before(c) : document.querySelector('#screen-settings')?.appendChild(c);
  let kind = 'problem';
  c.querySelectorAll('.fb-k').forEach(b => b.onclick = () => { kind = b.dataset.k; c.querySelectorAll('.fb-k').forEach(x => x.classList.toggle('on', x === b)); });
  const sh = $('#fb-share', c), nm = $('#fb-name', c);
  sh.checked = allowed(); sh.onchange = () => store.set('shareReports', sh.checked);
  nm.checked = store.get('shareName', true); nm.onchange = () => store.set('shareName', nm.checked);
  $('#fb-send', c).onclick = async () => {
    const t = $('#fb-text', c).value.trim(); if (!t) return;
    $('#fb-status', c).textContent = L('Sending…', 'جارٍ الإرسال…');
    const ok = await send({ ...base('feedback'), msg: kind, text: t.slice(0, 4000) });
    $('#fb-status', c).textContent = ok ? L('✓ Sent. Thank you!', '✓ أُرسلت. شكرًا لك!') : L('Could not send — check the internet and try again.', 'تعذّر الإرسال — تأكد من الإنترنت وحاول مرة أخرى.');
    if (ok) $('#fb-text', c).value = '';
  };
  $('#fb-owner', c).onclick = () => owner();
}

/* ---------- owner view ---------- */
async function owner() {
  let code = store.get('ownerCode', '');
  if (!code) { code = (prompt(L('Enter the owner code', 'أدخل رمز المالك')) || '').trim().toUpperCase(); if (!code) return; }
  const ov = document.createElement('div'); ov.className = 'vx ow'; ov.setAttribute('data-noi18n', '');
  ov.innerHTML = `<div class="vx-card ow-card"><div class="vx-head"><b class="vx-title">${L('Owner view', 'لوحة المالك')}</b><button type="button" class="icon-btn vx-x">✕</button></div><div class="ow-body muted">${L('Loading…', 'جارٍ التحميل…')}</div></div>`;
  document.body.appendChild(ov); document.body.classList.add('vx-open');
  const closeIt = () => { ov.remove(); document.body.classList.remove('vx-open'); };
  $('.vx-x', ov).onclick = closeIt;
  let data, meterData = null;
  try {
    const ask = path => J.serverFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }).then(r => r.json());
    [data, meterData] = await Promise.all([ask('/owner/reports'), ask('/owner/meter').catch(() => null)]);
  } catch (e) {
    if (e.code === 'owner') store.set('ownerCode', '');
    $('.ow-body', ov).textContent = e.code === 'owner' ? L('That code is not right.', 'الرمز غير صحيح.') : J.errText(e); return;
  }
  store.set('ownerCode', code);
  $('#fb-owner') && ($('#fb-owner').textContent = L('Open the owner view', 'افتح لوحة المالك'));
  const items = data.items || [], week = Date.now() - 7 * 864e5;
  const people = new Map(); items.forEach(x => { const id = x.a || '?'; const p = people.get(id) || { name: x.n, last: 0, n: 0, roles: x.r, ua: x.u, v: x.v }; p.last = Math.max(p.last, x.t); p.n++; if (x.n) p.name = x.n; people.set(id, p); });
  const active = [...people.values()].filter(p => p.last > week).length;
  const errs = items.filter(x => x.k === 'error'), fbs = items.filter(x => x.k === 'feedback').sort((a, z) => z.t - a.t);
  const groups = new Map(); errs.forEach(x => { const g = groups.get(x.m) || { m: x.m, n: 0, who: new Set(), last: 0, p: x.p, ex: x }; g.n++; g.who.add(x.n || x.a); g.last = Math.max(g.last, x.t); groups.set(x.m, g); });
  const tops = {}; items.filter(x => x.k === 'usage' && x.t > week - 23 * 864e5).forEach(x => { try { for (const [k, v] of Object.entries(JSON.parse(x.c || '{}'))) { const n = Number.isInteger(v) && v >= 0 && v <= 1e6 ? v : 0; if (n) tops[String(k).slice(0, 40)] = (tops[String(k).slice(0, 40)] || 0) + n; } } catch {} });
  const when = t => new Date(t).toLocaleString(AR ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const gl = [...groups.values()].sort((a, z) => z.n - a.n);
  const tl = Object.entries(tops).sort((a, z) => z[1] - a[1]);
  $('.ow-body', ov).classList.remove('muted');
  $('.ow-body', ov).innerHTML = `
    <div class="ow-stats"><div><b>${people.size}</b>${L('people', 'أشخاص')}</div><div><b>${active}</b>${L('active this week', 'نشطون هذا الأسبوع')}</div><div><b>${groups.size}</b>${L('kinds of problem', 'أنواع المشاكل')}</div><div><b>${fbs.length}</b>${L('messages', 'رسائل')}</div></div>
    ${meterHtml(meterData)}
    <button type="button" class="primary small ow-copy">${L('Copy everything for Claude to review', 'انسخ الكل ليراجعه Claude')}</button>
    <h3>${L('Messages from people', 'رسائل الناس')}</h3>
    ${fbs.map(x => `<div class="ow-item"><div class="ow-meta">${esc(x.n || x.a)} · ${esc({ problem: L('Problem', 'مشكلة'), idea: L('Idea', 'فكرة'), missing: L('Missing', 'ناقص') }[x.m] || x.m)} · ${when(x.t)}</div><div dir="auto">${esc(x.full?.text || x.m)}</div></div>`).join('') || `<p class="muted">${L('None yet.', 'لا شيء بعد.')}</p>`}
    <h3>${L('Problems (most common first)', 'المشاكل (الأكثر تكرارًا أولًا)')}</h3>
    ${gl.map(g => `<div class="ow-item"><div class="ow-meta">×${g.n} · ${esc([...g.who].join(', '))} · ${esc(g.p)} · ${when(g.last)}</div><div dir="auto">${esc(g.m)}</div></div>`).join('') || `<p class="muted">${L('No problems reported.', 'لا مشاكل.')}</p>`}
    <h3>${L('Most used (last 30 days)', 'الأكثر استخدامًا (آخر ٣٠ يومًا)')}</h3>
    <div class="ow-tops">${tl.slice(0, 30).map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('') || `<p class="muted">${L('No counts yet (sent once a day).', 'لا أرقام بعد (تُرسل مرة يوميًا).')}</p>`}</div>
    <h3>${L('People', 'الأشخاص')}</h3>
    ${[...people.values()].sort((a, z) => z.last - a.last).map(p => `<div class="ow-item"><div class="ow-meta">${esc(p.name || L('(no name)', '(بلا اسم)'))} · ${esc(p.roles || '')} · ${esc(p.ua || '')} · v${esc(p.v || '')}</div><div>${L('last seen', 'آخر ظهور')} ${when(p.last)}</div></div>`).join('')}
    <button type="button" class="ghost small ow-clear">${L('Clear the problems list', 'امسح قائمة المشاكل')}</button>`;
  const save = $('.ow-brake-save', ov);
  if (save) save.onclick = async () => {
    const brake = { cfLimit: Number($('.ow-cf-limit', ov).value) || 9500, paid: $('.ow-cf-paid', ov).checked };
    if (brake.paid && !confirm(L('Allow Cloudflare to charge past its free daily allowance? (About $0.011 per 1,000 units; it works only once the Cloudflare paid plan is on.)', 'السماح لـ Cloudflare بالمحاسبة بعد الحصة المجانية اليومية؟ (نحو ٠٫٠١١ دولار لكل ١٠٠٠ وحدة، ويعمل فقط بعد تفعيل خطة Cloudflare المدفوعة.)'))) return;
    try { await J.serverFetch('/owner/brake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, brake }) }); save.textContent = L('✓ Saved', '✓ حُفظ'); }
    catch (e) { save.textContent = J.errText(e); }
  };
  $('.ow-copy', ov).onclick = async () => {
    const txt = [`Mustatar — reports (${new Date().toISOString().slice(0, 10)})`, `People: ${people.size}, active this week: ${active}`, '', 'MESSAGES:',
      ...fbs.map(x => `- [${x.m}] ${x.n || x.a} (${new Date(x.t).toISOString().slice(0, 16)}): ${x.full?.text || x.m}`), '', 'PROBLEMS:',
      ...gl.map(g => `- ×${g.n} on "${g.p}" (${[...g.who].join(', ')}): ${g.m}${g.ex.full?.stack ? ' @ ' + g.ex.full.stack : ''}${g.ex.u ? ' [' + g.ex.u + ' v' + g.ex.v + ']' : ''}`), '', 'MOST USED (30 days):',
      tl.slice(0, 60).map(([k, v]) => `${k} ${v}`).join(', ')].join('\n');
    try { await navigator.clipboard.writeText(txt); $('.ow-copy', ov).textContent = L('✓ Copied — paste it to Claude', '✓ نُسخ — الصقه لـ Claude'); }
    catch { J.download(new Blob([txt], { type: 'text/plain' }), 'mustatar-reports.txt'); }
  };
  $('.ow-clear', ov).onclick = async () => {
    if (!confirm(L('Clear all problem reports?', 'مسح كل تقارير المشاكل؟'))) return;
    await J.serverFetch('/owner/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, keys: errs.map(x => x.key) }) });
    closeIt(); owner();
  };
}

/* ---------- the AI meter: how much of each free allowance was used, and the brake ---------- */
function meterHtml(m) {
  if (!m?.rows) return '';
  const day = new Date().toISOString().slice(0, 10);
  const byDay = new Map();
  for (const r of m.rows) { const d = byDay.get(r.day) || {}; d[r.k] = (d[r.k] || 0) + Number(r.n); byDay.set(r.day, d); }
  const t = byDay.get(day) || {};
  const num = n => Math.round(n || 0).toLocaleString(AR ? 'ar-SA' : 'en-GB');
  const bar = (used, free, label, unit) => {
    const pc = Math.min(100, Math.round((used || 0) / free * 100));
    return `<div class="ow-item"><div class="ow-meta">${label}</div><div class="ow-bar"><i style="width:${pc}%;background:${pc >= 90 ? '#c0392b' : pc >= 70 ? '#d68910' : '#1e8449'}"></i></div><div>${num(used)} / ${num(free)} ${unit} · ${pc}%</div></div>`;
  };
  const over = Math.max(0, (t['cf.neurons'] || 0) - m.free.cfNeurons);
  const rows = [...byDay.entries()].sort((a, z) => z[0].localeCompare(a[0])).slice(0, 14).map(([d, v]) =>
    `<tr><td>${esc(d.slice(5))}</td><td>${num(v['hear.groq'])}+${num(v['hear.cf'])}</td><td>${num(v['write.cf'])}+${num(v['write.groq'])}</td><td>${num(v['cf.neurons'])}</td><td>${num((v['groq.audio_sec'] || 0) / 60)}</td></tr>`).join('');
  return `<h3>${L('Free AI today', 'الذكاء الاصطناعي المجاني اليوم')}</h3>
    ${m.sources?.groq ? '' : `<p class="muted fine">⚠ ${L('Groq is not connected yet (GROQ_API_KEY is missing): hearing uses Cloudflare only.', 'Groq غير متصل بعد (لا يوجد GROQ_API_KEY): التفريغ عبر Cloudflare فقط.')}</p>`}
    ${bar(t['cf.neurons'], m.free.cfNeurons, L('Cloudflare (Whisper and Gemma)', 'Cloudflare (Whisper وGemma)'), L('units', 'وحدة'))}
    ${bar((t['groq.audio_sec'] || 0) / 60, m.free.groqAudioSec / 60 * 2, L('Groq hearing (two Whisper models, 8 hours each)', 'تفريغ Groq (نموذجا Whisper، ٨ ساعات لكل منهما)'), L('minutes', 'دقيقة'))}
    ${bar(t['groq.tokens'], m.free.groqTokens * 2, L('Groq writing (two gpt-oss models)', 'كتابة Groq (نموذجا gpt-oss)'), L('tokens', 'رمز'))}
    <p class="muted fine">${L('Cost today', 'تكلفة اليوم')}: <b>$${(over * 0.011 / 1000).toFixed(2)}</b> · ${L('the free allowances start again at 03:00 Makkah time.', 'تتجدد الحصص المجانية الساعة ٣ فجرًا بتوقيت مكة.')}</p>
    <div class="ow-item"><div class="ow-meta">${L('The brake', 'المكابح')}</div>
      <label>${L('Stop Cloudflare at', 'أوقف Cloudflare عند')} <input class="ow-cf-limit" type="number" min="0" step="100" value="${esc(m.brake.cfLimit)}" style="width:7em"> ${L('units a day', 'وحدة يوميًا')}</label><br>
      <label><input class="ow-cf-paid" type="checkbox"${m.brake.paid ? ' checked' : ''}> ${L('Allow paying past the free allowance', 'اسمح بالدفع بعد الحصة المجانية')}</label><br>
      <button type="button" class="ghost small ow-brake-save">${L('Save the brake', 'احفظ المكابح')}</button></div>
    <table class="ow-table"><tr><th>${L('Day', 'اليوم')}</th><th>${L('Hearing G+C', 'تفريغ G+C')}</th><th>${L('Writing C+G', 'كتابة C+G')}</th><th>${L('CF units', 'وحدات CF')}</th><th>${L('Groq min', 'دقائق Groq')}</th></tr>${rows}</table>`;
}

window.JundReport = { problem, event, count, owner };
settingsCard();
})();
