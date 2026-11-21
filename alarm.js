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
  const list = all().map(a => { const [h, m] = a.time.split(':').map(Number); return { id: a.id, h, m, days: a.days || [], label: a.label || '', on: a.on !== false }; });
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
let audio = null;
function webRing(a) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); audio = ctx;
    const beep = t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.start(t); o.stop(t + 0.4); };
    for (let i = 0; i < 240; i++) beep(ctx.currentTime + i * 0.5 + (i % 4 === 3 ? 0.3 : 0));
  } catch {}
  navigator.vibrate?.([600, 400, 600, 400, 600]);
  try { if (Notification.permission === 'granted') new Notification('⏰ ' + (a.label || 'Mustatar'), { body: a.time, requireInteraction: true, tag: `al-${a.id}-${next(a, Date.now() - 120e3)}` }); } catch {}
  const d = document.createElement('dialog'); d.className = 'al-ring'; d.setAttribute('data-noi18n', ''); d.dir = AR() ? 'rtl' : 'ltr';
  d.innerHTML = `<b class="al-big">${a.time}</b><span>⏰ ${esc(a.label || L('Alarm', 'المنبّه'))}</span><button type="button" class="primary" id="al-stop">${L('Stop', 'إيقاف')}</button><button type="button" class="ghost" id="al-snz">${L('Snooze 5 min', 'غفوة ٥ دقائق')}</button>`;
  document.body.appendChild(d); d.showModal();
  const stop = () => { try { audio?.close(); } catch {} audio = null; navigator.vibrate?.(0); d.close(); d.remove(); };
  $('#al-stop', d).onclick = stop;
  $('#al-snz', d).onclick = () => { stop(); setTimeout(() => webRing(a), 5 * 60e3); };
}

function askNotify() {
  if (N()?.ask || !('Notification' in window) || Notification.permission !== 'default') return;
  Notification.requestPermission().then(p => { if (p === 'granted') window.JundCal?.pushSync?.(); }).catch(() => {});
}
function open() {
  let d = $('#al-dlg'); d?.remove();
  d = document.createElement('dialog'); d.id = 'al-dlg'; d.className = 'al-dlg'; d.setAttribute('data-noi18n', ''); d.dir = AR() ? 'rtl' : 'ltr';
  document.body.appendChild(d); d.addEventListener('close', () => d.remove());
  paint(d); d.showModal();
  if (N()?.ask) N().ask({ action: 'alarmStatus' }, 3000).then(r => { native = r?.ok ? r : false; paint(d); }).catch(() => { native = false; paint(d); });
}
function paint(d) {
  const list = all().slice().sort((a, b) => a.time.localeCompare(b.time));
  const soon = list.filter(a => a.on !== false).map(a => next(a)).filter(Boolean).sort()[0];
  const warn = native?.ok && (!native.exact || !native.fullScreen || !native.notifications);
  d.innerHTML = `<div class="row-between"><b class="card-h" style="margin:0">⏰ ${L('Alarm', 'المنبّه')}</b><button type="button" class="icon-btn" id="al-x" aria-label="${L('Close', 'إغلاق')}">✕</button></div>
    <p class="muted fine" style="margin-top:6px">${soon ? inWords(soon) : L('No alarm is on.', 'لا يوجد منبّه مفعّل.')}</p>
    ${warn ? `<button type="button" class="al-warn" id="al-perm">⚠ ${L('Allow alarms to ring on the lock screen at the exact time — tap to open the setting', 'اسمح للمنبّه أن يرن على شاشة القفل في الوقت الدقيق — اضغط لفتح الإعداد')}</button>` : ''}
    ${N()?.ask && native === false ? `<p class="al-note">${L('This copy of the Android app is too old to ring alarms when it is closed. Update it (Me → A new version), and the alarms below will ring.', 'نسخة تطبيق أندرويد هذه قديمة لا ترن المنبّهات وهو مغلق. حدّثها (أنا ← نسخة جديدة)، وسترن المنبّهات أدناه.')}</p>` : ''}
    ${!N()?.ask ? `<p class="al-note">${L('Added to the home screen: with notifications allowed, the alarm comes as a notification even when Mustatar is closed, and rings loudly while it is open. In the Mustatar Android app it rings like the phone’s own alarm.', 'من الشاشة الرئيسية: إذا سمحت بالإشعارات يصلك المنبّه إشعارًا حتى ومستطر مغلق، ويرن بصوت عالٍ وهو مفتوح. وفي تطبيق مستطر على أندرويد يرن مثل منبّه الهاتف نفسه.')}</p>` : ''}
    <div class="al-list">${list.map(a => `<div class="al-row ${a.on === false ? 'off' : ''}"><button type="button" class="al-t" data-ed="${esc(a.id)}"><b>${a.time}</b><small>${esc(a.label || '')}${a.label ? ' · ' : ''}${repeatText(a)}</small></button>
      <label class="switch"><input type="checkbox" data-on="${esc(a.id)}" ${a.on === false ? '' : 'checked'}><span></span></label></div>`).join('') || `<p class="muted">${L('No alarms yet.', 'لا منبّهات بعد.')}</p>`}</div>
    <form class="al-form" id="al-form"><div class="al-ft"><input type="time" id="al-time" dir="ltr" required value="${pad((new Date().getHours() + 1) % 24)}:00"><input id="al-label" dir="auto" maxlength="40" placeholder="${L('Name (e.g. Fajr, study)', 'الاسم (مثل: الفجر، المذاكرة)')}"></div>
      <div class="al-days">${DAYS().map((x, i) => `<button type="button" data-day="${i}" aria-label="${DAYN()[i]}">${x}</button>`).join('')}</div>
      <small class="muted">${L('No day chosen = rings once.', 'بدون اختيار يوم = يرن مرة واحدة.')}</small>
      <button type="submit" class="primary" style="width:100%;margin-top:10px">+ ${L('Add alarm', 'أضف منبّهًا')}</button></form>
    ${N()?.ask ? `<button type="button" class="link small" id="al-test">${L('Test the sound now', 'جرّب الصوت الآن')}</button>` : ''}`;
  $('#al-x', d).onclick = () => d.close();
  const pick = new Set();
  $$('[data-day]', d).forEach(b => b.onclick = () => { const i = Number(b.dataset.day); pick.has(i) ? pick.delete(i) : pick.add(i); b.classList.toggle('on', pick.has(i)); });
  $('#al-form', d).onsubmit = e => {
    e.preventDefault(); const t = $('#al-time', d).value; if (!t) return;
    const l = all(); l.push({ id: 'A' + Date.now().toString(36), time: t, days: [...pick].sort(), label: $('#al-label', d).value.trim(), on: true });
    store.set('alarms', l); askNotify(); sync().then(() => paint(d)); paint(d);
    toast(L(`✓ Alarm set — ${inWords(next(l.at(-1)))}`, `✓ ضُبط المنبّه — ${inWords(next(l.at(-1)))}`));
  };
  $$('[data-on]', d).forEach(c => c.onchange = () => { const l = all(), a = l.find(x => x.id === c.dataset.on); a.on = c.checked; store.set('alarms', l); sync(); paint(d); });
  $$('[data-ed]', d).forEach(b => b.onclick = () => {
    const a = all().find(x => x.id === b.dataset.ed); if (!a) return;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.querySelector('small').textContent = L('Tap again to delete this alarm', 'اضغط مرة أخرى لحذف هذا المنبّه'); return; }
    store.set('alarms', all().filter(x => x.id !== a.id)); sync(); paint(d);
  });
  const p = $('#al-perm', d); if (p) p.onclick = () => N().ask({ action: 'alarmPerm' }, 4000);
  const tst = $('#al-test', d); if (tst) tst.onclick = () => N().ask({ action: 'alarmTest', label: L('Test', 'تجربة') }, 4000);
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
