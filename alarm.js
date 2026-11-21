/* Mustatar — the alarm clock inside the app, and the focus lock.
   Alarm: set times (once, every day, or chosen days) with a name. In the Android app they ring like the phone's own
   alarm — at the exact time, loud, on the lock screen, through do-not-disturb, even when Mustatar is closed — with
   Stop and Snooze. In a browser they can only ring while Mustatar is open (a browser cannot wake a sleeping phone).
   Focus lock: pins Mustatar on the screen (other apps, the home screen and notifications are out of reach until you
   unlock) and silences the phone except alarms. No app can switch on airplane mode itself; this is the closest. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = () => window.ZadLang === 'ar';
const L = (en, ar) => AR() ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const N = () => window.JundNative;
const DAYS = () => AR() ? ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAYN = () => AR() ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toast = (t, ms, a) => window.JundCal?.toast?.(t, ms, a);

/* ---------- alarms ---------- */
const all = () => store.get('alarms', []);
function next(a, from = Date.now()) {
  const [h, m] = a.time.split(':').map(Number), d = new Date(from); d.setSeconds(0, 0); d.setHours(h, m);
  for (let i = 0; i < 8; i++) { if (d.getTime() > from + 1000 && (!a.days?.length || a.days.includes(d.getDay()))) return d.getTime(); d.setDate(d.getDate() + 1); d.setHours(h, m); }
  return 0;
}
function inWords(ms) {
  const m = Math.max(1, Math.round((ms - Date.now()) / 6e4)), h = Math.floor(m / 60), mm = m % 60;
  return L(`Rings in ${h ? h + ' h ' : ''}${mm} min`, `يرن بعد ${h ? h + ' س ' : ''}${mm} د`);
}
function repeatText(a) {
  if (!a.days?.length) return L('Once', 'مرة واحدة');
  if (a.days.length === 7) return L('Every day', 'كل يوم');
  if ([0, 1, 2, 3, 4].every(x => a.days.includes(x)) && a.days.length === 5) return L('Sun–Thu', 'الأحد–الخميس');
  return a.days.slice().sort().map(x => DAYN()[x]).join(AR() ? '، ' : ', ');
}
let native = null;
// the next week of alarms, for the server to send as notifications when the app is closed (browser / home-screen app)
function upcoming() {
  const out = [], until = Date.now() + 7 * 864e5;
  for (const a of all()) {
    if (a.on === false) continue;
    let t = next(a);
    while (t && t < until && out.length < 60) { out.push({ id: `al-${a.id}-${t}`, at: t, title: '⏰ ' + (a.label || L('Alarm', 'المنبّه')), body: a.time + ' · ' + L('Mustatar alarm', 'منبّه مستطر') }); if (!a.days?.length) break; t = next(a, t + 60e3); }
  }
  return out;
}
async function sync() {
  window.JundCal?.pushSync?.();   // browser / home-screen app: the server sends them as notifications
  const list = all().map(a => { const [h, m] = a.time.split(':').map(Number); const o = opts(a); return { id: a.id, h, m, days: a.days || [], label: a.label || '', on: a.on !== false, sound: o.sound, ring: o.ring, vol: o.vol, rise: o.rise, vib: o.vib, snooze: o.snooze }; });
  if (N()?.ask) { try { native = await N().ask({ action: 'alarmSet', alarms: list }, 5000); } catch { native = null; } }
  webArm();
}
// in a browser: ring while the app is open
let webTimer = 0;
function webArm() {
  clearTimeout(webTimer); if (native?.ok) return;
  const soon = all().filter(a => a.on !== false).map(a => [a, next(a)]).filter(x => x[1]).sort((x, y) => x[1] - y[1])[0];
  if (!soon || soon[1] - Date.now() > 2 ** 31 - 1) return;
  webTimer = setTimeout(() => { webRing(soon[0]); if (!soon[0].days?.length) { const l = all(); const x = l.find(y => y.id === soon[0].id); if (x) x.on = false; store.set('alarms', l); } webArm(); }, soon[1] - Date.now());
}
/* ---------- options for each alarm ---------- */
const DEF = { sound: 'default', soundName: '', tone: 'classic', ring: 10, vol: 100, rise: false, vib: true, snooze: 5 };
const opts = a => ({ ...DEF, ...(store.get('alarmDefaults', {}) || {}), ...(a?.o || {}) });
const RINGS = [1, 3, 5, 10, 15, 20, 30], SNOOZES = [5, 10, 15, 20, 30];
const TONES = () => ({ classic: L('Classic beeps', 'تنبيه كلاسيكي'), chime: L('Soft chime', 'جرس هادئ'), rising: L('Rising tones', 'نغمات متصاعدة'), digital: L('Digital clock', 'ساعة رقمية') });

let audio = null, ringStop = null;
// in a browser: the chosen tone, for the chosen time, at the chosen volume, softly rising if chosen
function webSound(o, seconds) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)(); const master = ctx.createGain(); master.connect(ctx.destination);
  const full = Math.max(0.1, Math.min(1, (o.vol || 100) / 100));
  master.gain.setValueAtTime(o.rise ? full * 0.08 : full, ctx.currentTime);
  if (o.rise) master.gain.linearRampToValueAtTime(full, ctx.currentTime + 60);
  const note = (t, f, len, type = 'sine', peak = 0.6) => { const os = ctx.createOscillator(), g = ctx.createGain(); os.type = type; os.frequency.value = f; os.connect(g); g.connect(master); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len); os.start(t); os.stop(t + len + 0.05); };
  const bar = { classic: [[0, 880, .35], [.5, 880, .35], [1, 880, .35], [1.8, 880, .35]],
    chime: [[0, 659, 1.2], [.6, 784, 1.2], [1.2, 988, 1.6]],
    rising: [[0, 523, .3], [.35, 659, .3], [.7, 784, .3], [1.05, 1047, .5]],
    digital: [[0, 2000, .08, 'square', .3], [.15, 2000, .08, 'square', .3], [.3, 2000, .08, 'square', .3], [.45, 2000, .08, 'square', .3]] }[o.tone] || [];
  const len = o.tone === 'chime' ? 3 : 2.4;
  let at = ctx.currentTime + 0.05; const end = ctx.currentTime + seconds;
  const fill = () => { while (at < ctx.currentTime + 6 && at < end) { for (const [d, f, l, ty, pk] of bar) note(at + d, f, l, ty, pk); at += len; } };
  fill(); const iv = setInterval(fill, 2000);
  const stop = () => { clearInterval(iv); try { ctx.close(); } catch {} };
  setTimeout(stop, seconds * 1000 + 200);
  return stop;
}
function webRing(a) {
  const o = opts(a);
  try { const s = webSound(o, o.ring * 60); audio = { close: s }; } catch {}
  let vibT = 0; if (o.vib && navigator.vibrate) { const v = () => navigator.vibrate([800, 600, 800, 600]); v(); vibT = setInterval(v, 2800); }
  try { if (Notification.permission === 'granted') new Notification('⏰ ' + (a.label || 'Mustatar'), { body: a.time, requireInteraction: true, tag: `al-${a.id}-${next(a, Date.now() - 120e3)}` }); } catch {}
  const d = document.createElement('dialog'); d.className = 'al-ring'; d.setAttribute('data-noi18n', ''); d.dir = AR() ? 'rtl' : 'ltr';
  d.innerHTML = `<b class="al-big">${a.time}</b><span>⏰ ${esc(a.label || L('Alarm', 'المنبّه'))}</span><button type="button" class="primary" id="al-stop">${L('Stop', 'إيقاف')}</button><button type="button" class="ghost" id="al-snz">${L(`Snooze ${o.snooze} min`, `غفوة ${J.ar ? J.ar(o.snooze) : o.snooze} دقائق`)}</button>`;
  document.body.appendChild(d); d.showModal();
  const stop = () => { try { audio?.close(); } catch {} audio = null; clearInterval(vibT); navigator.vibrate?.(0); clearTimeout(autoEnd); try { d.close(); } catch {} d.remove(); ringStop = null; };
  const autoEnd = setTimeout(stop, o.ring * 60e3);
  ringStop = stop;
  $('#al-stop', d).onclick = stop;
  $('#al-snz', d).onclick = () => { stop(); setTimeout(() => webRing(a), o.snooze * 60e3); };
}

function askNotify() {
  if (N()?.ask || !('Notification' in window) || Notification.permission !== 'default') return;
  Notification.requestPermission().then(p => { if (p === 'granted') window.JundCal?.pushSync?.(); }).catch(() => {});
}
function open() {
  editing = null;
  let d = $('#al-dlg'); d?.remove();
  d = document.createElement('dialog'); d.id = 'al-dlg'; d.className = 'al-dlg'; d.setAttribute('data-noi18n', ''); d.dir = AR() ? 'rtl' : 'ltr';
  document.body.appendChild(d); d.addEventListener('close', () => d.remove());
  paint(d); d.showModal();
  if (N()?.ask) N().ask({ action: 'alarmStatus' }, 3000).then(r => { native = r?.ok ? r : false; paint(d); }).catch(() => { native = false; paint(d); });
}
let editing = null;   // the alarm being changed, or null for a new one
function optionsHtml(o) {
  const android = !!N()?.ask;
  const sel = (id, vals, cur, fmt) => `<select id="${id}">${vals.map(v => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select>`;
  const min = v => L(`${v} min`, `${J.ar ? J.ar(v) : v} د`);
  return `<details class="al-more" ${editing ? 'open' : ''}><summary>${L('Sound, length and more', 'الصوت والمدة والمزيد')}</summary>
    <div class="al-opts">
      <label class="al-o"><span>${L('Sound', 'الصوت')}</span>${android
        ? `<button type="button" class="al-snd" id="al-snd">${esc(o.soundName || L('Phone’s alarm sound', 'صوت منبّه الهاتف'))} ›</button>`
        : sel('al-tone', Object.keys(TONES()), o.tone, k => TONES()[k])}</label>
      <label class="al-o"><span>${L('Rings for', 'مدة الرنين')}</span>${sel('al-ringfor', RINGS, o.ring, min)}</label>
      <label class="al-o al-vol"><span>${L('Volume', 'مستوى الصوت')} <b id="al-volv">${o.vol}%</b></span><input type="range" id="al-vol" min="20" max="100" step="10" value="${o.vol}"></label>
      <label class="al-o"><span>${L('Start softly, then louder', 'يبدأ هادئًا ثم يعلو')}</span><span class="switch"><input type="checkbox" id="al-rise" ${o.rise ? 'checked' : ''}><span></span></span></label>
      <label class="al-o"><span>${L('Vibrate', 'اهتزاز')}</span><span class="switch"><input type="checkbox" id="al-vib" ${o.vib ? 'checked' : ''}><span></span></span></label>
      <label class="al-o"><span>${L('Snooze', 'الغفوة')}</span>${sel('al-snooze', SNOOZES, o.snooze, min)}</label>
      <button type="button" class="ghost small" id="al-try">▶ ${L('Try this sound', 'جرّب هذا الصوت')}</button>
    </div></details>`;
}
function readOpts(d, o) {
  const v = id => $(id, d);
  return { ...o, tone: v('#al-tone')?.value || o.tone, ring: Number(v('#al-ringfor').value), vol: Number(v('#al-vol').value),
    rise: v('#al-rise').checked, vib: v('#al-vib').checked, snooze: Number(v('#al-snooze').value) };
}
function paint(d) {
  const list = all().slice().sort((a, b) => a.time.localeCompare(b.time));
  const soon = list.filter(a => a.on !== false).map(a => next(a)).filter(Boolean).sort()[0];
  const warn = native?.ok && (!native.exact || !native.fullScreen || !native.notifications);
  const ed = editing ? all().find(x => x.id === editing) : null; if (editing && !ed) editing = null;
  let o = opts(ed);
  d.innerHTML = `<div class="row-between"><b class="card-h" style="margin:0">⏰ ${L('Alarm', 'المنبّه')}</b><button type="button" class="icon-btn" id="al-x" aria-label="${L('Close', 'إغلاق')}">✕</button></div>
    <p class="muted fine" style="margin-top:6px">${soon ? inWords(soon) : L('No alarm is on.', 'لا يوجد منبّه مفعّل.')}</p>
    ${warn ? `<button type="button" class="al-warn" id="al-perm">⚠ ${L('Allow alarms to ring on the lock screen at the exact time — tap to open the setting', 'اسمح للمنبّه أن يرن على شاشة القفل في الوقت الدقيق — اضغط لفتح الإعداد')}</button>` : ''}
    ${N()?.ask && native === false ? `<p class="al-note">${L('This copy of the Android app is too old to ring alarms when it is closed. Update it (Me → A new version), and the alarms below will ring.', 'نسخة تطبيق أندرويد هذه قديمة لا ترن المنبّهات وهو مغلق. حدّثها (أنا ← نسخة جديدة)، وسترن المنبّهات أدناه.')}</p>` : ''}
    ${!N()?.ask && window.JundCal?.iosTab?.() ? `<div class="al-note">${window.JundCal.iosSteps()}</div>` : ''}
    ${!N()?.ask && !window.JundCal?.iosTab?.() ? `<p class="al-note">${L('Added to the home screen: with notifications allowed, the alarm comes as a notification even when Mustatar is closed, and rings loudly while it is open. In the Mustatar Android app it rings like the phone’s own alarm.', 'من الشاشة الرئيسية: إذا سمحت بالإشعارات يصلك المنبّه إشعارًا حتى ومستطر مغلق، ويرن بصوت عالٍ وهو مفتوح. وفي تطبيق مستطر على أندرويد يرن مثل منبّه الهاتف نفسه.')}</p>` : ''}
    <div class="al-list">${list.map(a => `<div class="al-row ${a.on === false ? 'off' : ''} ${a.id === editing ? 'ed' : ''}"><button type="button" class="al-t" data-ed="${esc(a.id)}"><b>${a.time}</b><small>${esc(a.label || '')}${a.label ? ' · ' : ''}${repeatText(a)} · ${L(`${opts(a).ring} min`, `${J.ar ? J.ar(opts(a).ring) : opts(a).ring} د`)}</small></button>
      <label class="switch"><input type="checkbox" data-on="${esc(a.id)}" ${a.on === false ? '' : 'checked'}><span></span></label></div>`).join('') || `<p class="muted">${L('No alarms yet.', 'لا منبّهات بعد.')}</p>`}</div>
    <form class="al-form" id="al-form">${ed ? `<b class="al-edh">${L('Change this alarm', 'تعديل هذا المنبّه')}</b>` : ''}<div class="al-ft"><input type="time" id="al-time" dir="ltr" required value="${ed ? ed.time : pad((new Date().getHours() + 1) % 24) + ':00'}"><input id="al-label" dir="auto" maxlength="40" value="${esc(ed?.label || '')}" placeholder="${L('Name (e.g. Fajr, study)', 'الاسم (مثل: الفجر، المذاكرة)')}"></div>
      <div class="al-days">${DAYS().map((x, i) => `<button type="button" data-day="${i}" class="${ed?.days?.includes(i) ? 'on' : ''}" aria-label="${DAYN()[i]}">${x}</button>`).join('')}</div>
      <small class="muted">${L('No day chosen = rings once.', 'بدون اختيار يوم = يرن مرة واحدة.')}</small>
      ${optionsHtml(o)}
      <button type="submit" class="primary" style="width:100%;margin-top:10px">${ed ? '✓ ' + L('Save', 'احفظ') : '+ ' + L('Add alarm', 'أضف منبّهًا')}</button>
      ${ed ? `<div class="al-edrow"><button type="button" class="ghost small" id="al-cancel">${L('Cancel', 'إلغاء')}</button><button type="button" class="ghost small danger" id="al-del">${L('Delete', 'حذف')}</button></div>` : ''}</form>`;
  $('#al-x', d).onclick = () => d.close();
  const pick = new Set(ed?.days || []);
  $$('[data-day]', d).forEach(b => b.onclick = () => { const i = Number(b.dataset.day); pick.has(i) ? pick.delete(i) : pick.add(i); b.classList.toggle('on', pick.has(i)); });
  $('#al-vol', d).oninput = e => { $('#al-volv', d).textContent = e.target.value + '%'; };
  const snd = $('#al-snd', d);
  if (snd) snd.onclick = async () => {
    const r = await N().ask({ action: 'alarmSound', uri: o.sound }, 120000).catch(() => null);
    if (r?.ok) { o = { ...o, sound: r.uri, soundName: r.uri === 'default' ? '' : r.name || '' }; snd.textContent = (o.soundName || L('Phone’s alarm sound', 'صوت منبّه الهاتف')) + ' ›'; }
  };
  let tryStop = null;
  $('#al-try', d).onclick = () => {
    const t = { ...readOpts(d, o), ring: 1 };
    if (N()?.ask) { N().ask({ action: 'alarmTest', label: L('Test', 'تجربة'), opts: t }, 4000); toast(L('Ringing now — tap Stop to end it.', 'يرن الآن — اضغط إيقاف لإنهائه.')); return; }
    if (tryStop) { tryStop(); tryStop = null; return; }
    try { tryStop = webSound(t, 6); setTimeout(() => { tryStop = null; }, 6200); } catch {}
  };
  $('#al-form', d).onsubmit = e => {
    e.preventDefault(); const t = $('#al-time', d).value; if (!t) return;
    const chosen = readOpts(d, o);
    store.set('alarmDefaults', chosen);   // the next new alarm starts with these choices
    const l = all();
    if (ed) { const x = l.find(y => y.id === ed.id); Object.assign(x, { time: t, days: [...pick].sort(), label: $('#al-label', d).value.trim(), on: true, o: chosen }); }
    else l.push({ id: 'A' + Date.now().toString(36), time: t, days: [...pick].sort(), label: $('#al-label', d).value.trim(), on: true, o: chosen });
    const it = ed ? l.find(y => y.id === ed.id) : l.at(-1);
    editing = null;
    store.set('alarms', l); askNotify(); sync().then(() => paint(d)); paint(d);
    toast(L(`✓ Alarm set — ${inWords(next(it))}`, `✓ ضُبط المنبّه — ${inWords(next(it))}`));
  };
  $$('[data-on]', d).forEach(c => c.onchange = () => { const l = all(), a = l.find(x => x.id === c.dataset.on); a.on = c.checked; store.set('alarms', l); sync(); paint(d); });
  $$('[data-ed]', d).forEach(b => b.onclick = () => { editing = editing === b.dataset.ed ? null : b.dataset.ed; paint(d); $('#al-form', d)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  const cancel = $('#al-cancel', d); if (cancel) cancel.onclick = () => { editing = null; paint(d); };
  const del = $('#al-del', d);
  if (del) del.onclick = async () => {
    const ok = window.JundConfirm ? await window.JundConfirm(L('Delete this alarm?', 'حذف هذا المنبّه؟'), { yes: L('Delete', 'حذف'), danger: true }) : true;
    if (!ok) return;
    store.set('alarms', all().filter(x => x.id !== editing)); editing = null; sync(); paint(d);
  };
  const p = $('#al-perm', d); if (p) p.onclick = () => N().ask({ action: 'alarmPerm' }, 4000);
}

/* ---------- focus lock ---------- */
async function lock(minutes = 50) {
  if (!N()?.ask) {
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    try { await navigator.wakeLock?.request('screen'); } catch {}
    toast(L('In a browser Mustatar can only go full screen. In the Android app, the focus lock pins Mustatar and silences the phone.', 'في المتصفح يمكن لمستطر فقط ملء الشاشة. في تطبيق أندرويد، قفل التركيز يثبّت مستطر ويُسكت الهاتف.'), 6000);
    return;
  }
  const st = await N().ask({ action: 'focusStatus' }, 3000).catch(() => null);
  if (st && !st.dndAllowed && !store.get('dndAsked')) {
    store.set('dndAsked', true);
    toast(L('Allow Mustatar to silence the phone (Do not disturb), then come back and start again.', 'اسمح لمستطر بإسكات الهاتف (عدم الإزعاج)، ثم عد وابدأ مرة أخرى.'), 6000);
    await N().ask({ action: 'dndAsk' }, 3000).catch(() => {}); return;
  }
  const r = await N().ask({ action: 'focusLock', dnd: true }, 5000).catch(() => null);
  store.set('focusLock', { until: Date.now() + minutes * 60e3 });
  toast(r?.pinned ? L(`🔒 Locked for ${minutes} min. Calls and other apps wait. Unlock from the focus window.`, `🔒 قُفل لمدة ${minutes} دقيقة. المكالمات والتطبيقات الأخرى تنتظر. افتح القفل من نافذة التركيز.`) : L('Could not pin the app on this phone.', 'تعذّر تثبيت التطبيق على هذا الهاتف.'), 6000);
  clearTimeout(lockTimer); lockTimer = setTimeout(unlock, minutes * 60e3);
  paintLock();
}
let lockTimer = 0;
async function unlock() {
  clearTimeout(lockTimer); store.set('focusLock', null);
  try { await N()?.ask?.({ action: 'focusUnlock' }, 3000); } catch {}
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
  paintLock();
}
// while locked: a bar at the top with the time left and Unlock
function paintLock() {
  const l = store.get('focusLock', null); let bar = $('#lk-bar');
  if (!l || l.until < Date.now()) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'lk-bar'; bar.className = 'lk-bar'; bar.setAttribute('data-noi18n', ''); document.body.appendChild(bar); }
  const m = Math.max(1, Math.round((l.until - Date.now()) / 6e4));
  bar.innerHTML = `<span>🔒 ${L(`Focus lock · ${m} min left`, `قفل التركيز · بقي ${m} د`)}</span><button type="button" id="lk-un">${L('Unlock', 'افتح القفل')}</button>`;
  $('#lk-un', bar).onclick = () => { if (!bar.dataset.sure) { bar.dataset.sure = 1; $('#lk-un', bar).textContent = L('Sure? Tap again', 'متأكد؟ اضغط مرة أخرى'); setTimeout(() => { delete bar.dataset.sure; paintLock(); }, 4000); return; } unlock(); };
}
function openLock() {
  const d = document.createElement('dialog'); d.className = 'al-dlg'; d.setAttribute('data-noi18n', ''); d.dir = AR() ? 'rtl' : 'ltr';
  d.innerHTML = `<div class="row-between"><b class="card-h" style="margin:0">🔒 ${L('Focus lock', 'قفل التركيز')}</b><button type="button" class="icon-btn" id="lk-x" aria-label="${L('Close', 'إغلاق')}">✕</button></div>
    <p class="fine" style="line-height:1.6">${L('Mustatar stays on the screen: other apps, the home screen and notifications are out of reach, and the phone is silent except alarms, until the time ends or you unlock. (No app can switch on airplane mode by itself; this is the closest.)', 'يبقى مستطر على الشاشة: التطبيقات الأخرى والشاشة الرئيسية والإشعارات بعيدة عنك، والهاتف صامت إلا المنبّهات، حتى ينتهي الوقت أو تفتح القفل. (لا يستطيع أي تطبيق تشغيل وضع الطيران بنفسه؛ وهذا أقرب ما يمكن.)')}</p>
    <div class="al-days lk-min">${[25, 50, 90, 120].map(m => `<button type="button" data-m="${m}">${m} ${L('min', 'د')}</button>`).join('')}</div>`;
  document.body.appendChild(d); d.addEventListener('close', () => d.remove()); d.showModal();
  $('#lk-x', d).onclick = () => d.close();
  $$('[data-m]', d).forEach(b => b.onclick = () => { d.close(); lock(Number(b.dataset.m)); });
}

setTimeout(() => { sync(); const l = store.get('focusLock', null); if (l && l.until > Date.now()) { lockTimer = setTimeout(unlock, l.until - Date.now()); paintLock(); } }, 1500);
setInterval(paintLock, 30e3);
window.JundAlarm = { open, all, next, sync, upcoming };
window.JundLock = { open: openLock, lock, unlock };
})();
