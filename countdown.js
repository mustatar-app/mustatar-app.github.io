/* Countdowns and timers.
   - Countdowns on Today: "Ramadan · 24 days", Eid, Arafah… (Umm al-Qura dates, worked out on the phone), your exams from the
     calendar, and your own ("My trip · 12 days"), each once or every year.
   - Timers (several at once, pause, +1 min) and a stopwatch. A running timer shows at the top of every screen and rings
     even when the app is closed (it goes to the phone's alarms like a reminder). */
(() => {
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = () => window.ZadLang === 'ar';
const t = (en, ar) => AR() ? ar : en;
const num = n => J.ar(n);
const $ = (s, r = document) => r.querySelector(s);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysTo = date => Math.round((day0(new Date(date + 'T12:00')) - day0(new Date())) / 864e5);
const hParts = d => window.JundFeatures?.hijriParts?.(d);

/* ---------- Islamic dates (Umm al-Qura) ---------- */
const ISLAMIC = [
  { id: 'ramadan', m: 9, d: 1, en: 'Ramadan', ar: 'رمضان', ic: '🌙', len: 30 },
  { id: 'qadr', m: 9, d: 21, en: 'Last ten nights', ar: 'العشر الأواخر', ic: '✨', len: 10 },
  { id: 'fitr', m: 10, d: 1, en: 'Eid al-Fitr', ar: 'عيد الفطر', ic: '🎉', len: 3 },
  { id: 'dhul10', m: 12, d: 1, en: 'First ten days of Dhul-Hijjah', ar: 'عشر ذي الحجة', ic: '📿', len: 10, off: true },
  { id: 'arafah', m: 12, d: 9, en: 'Day of Arafah', ar: 'يوم عرفة', ic: '🕋', len: 1 },
  { id: 'adha', m: 12, d: 10, en: 'Eid al-Adha', ar: 'عيد الأضحى', ic: '🐑', len: 4 },
  { id: 'hijri', m: 1, d: 1, en: 'Islamic New Year', ar: 'رأس السنة الهجرية', ic: '🌒', len: 1 },
  { id: 'ashura', m: 1, d: 10, en: 'Ashura', ar: 'عاشوراء', ic: '🤲', len: 1 },
];
let hCache = { day: '', map: null };
// the next start date (YYYY-MM-DD) of each Islamic date, and whether we are inside it now (e.g. "Ramadan, day 12")
function islamicDates() {
  const today = iso(new Date());
  if (hCache.day === today) return hCache.map;
  const map = {}, start = day0(new Date());
  // looking back first: are we inside one of them right now?
  for (let i = -30; i <= 400 && Object.keys(map).length < ISLAMIC.length; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const h = hParts(d); if (!h) break;
    for (const x of ISLAMIC) {
      if (map[x.id] || h.m !== x.m || h.d !== x.d) continue;
      const end = new Date(d); end.setDate(end.getDate() + x.len - 1);
      if (i < 0 && day0(end) < start) continue;          // already over: wait for next year's
      map[x.id] = { date: iso(d), end: iso(end), hy: h.y };
    }
  }
  hCache = { day: today, map };
  return map;
}

/* ---------- all countdowns, nearest first ---------- */
const mine = () => store.get('countdowns', []);
function nextYearly(date) {   // a yearly countdown (a birthday, an anniversary): its next date
  const [y, m, d] = date.split('-').map(Number), now = day0(new Date());
  let n = new Date(now.getFullYear(), m - 1, d);
  if (n < now) n = new Date(now.getFullYear() + 1, m - 1, d);
  return iso(n);
}
function list() {
  const out = [];
  const off = store.get('cdHidden', []);
  if (store.get('cdIslamic', true)) {
    const map = islamicDates();
    for (const x of ISLAMIC) {
      const v = map[x.id]; if (!v || off.includes(x.id) || (x.off && !store.get('cdOn_' + x.id, false))) continue;
      const n = daysTo(v.date), inside = n <= 0 && daysTo(v.end) >= 0;
      out.push({ id: x.id, kind: 'islamic', ic: x.ic, title: t(x.en, x.ar), date: v.date, days: n, inside, dayOf: inside ? 1 - n : 0, len: x.len,
        sub: `${num(x.d)} ${window.ZadLang === 'ar' ? ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'][x.m - 1] : ['Muharram', 'Safar', 'Rabiʻ I', 'Rabiʻ II', 'Jumada I', 'Jumada II', 'Rajab', 'Shaʻban', 'Ramadan', 'Shawwal', 'Dhuʻl-Qiʻdah', 'Dhuʻl-Hijjah'][x.m - 1]} ${num(v.hy)}` });
    }
  }
  for (const c of mine()) {
    const date = c.yearly ? nextYearly(c.date) : c.date, n = daysTo(date);
    if (n < -1) continue;
    out.push({ id: c.id, kind: 'mine', ic: c.ic || '📅', title: c.title, date, days: n, yearly: !!c.yearly });
  }
  if (store.get('cdExams', true)) {
    for (const e of window.JundCal?.events?.() || []) {
      if (e.type !== 'exam' || e.done || !e.date) continue;
      const n = daysTo(e.date); if (n < 0 || n > 60) continue;
      out.push({ id: 'ev:' + e.id, kind: 'exam', ic: '📝', title: e.title, date: e.date, days: n });
    }
  }
  return out.sort((a, b) => (a.inside ? -1 : a.days) - (b.inside ? -1 : b.days));
}
const when = c => c.inside ? (c.len > 1 ? t(`day ${num(c.dayOf)}`, `اليوم ${num(c.dayOf)}`) : t('today', 'اليوم'))
  : c.days === 0 ? t('today', 'اليوم') : c.days === 1 ? t('tomorrow', 'غدًا')
  : AR() ? `بعد ${num(c.days)} ${c.days <= 10 ? 'أيام' : 'يومًا'}` : `${num(c.days)} days`;

/* ---------- the row on Today ---------- */
function paint() {
  const home = $('#screen-assistant'); if (!home || !$('#hm-next')) return;
  let row = $('#hm-count');
  if (!row) { row = document.createElement('div'); row.id = 'hm-count'; row.className = 'cd-row'; ($('#hm-study') || $('.home-head', home))?.after(row); }
  const items = list().filter(c => c.days <= 400).slice(0, 6);
  row.innerHTML = items.map(c => `<button type="button" class="cd-chip${c.inside || c.days === 0 ? ' now' : ''}" data-cd="${esc(c.id)}"><span class="cd-ic" aria-hidden="true">${c.ic}</span><span class="cd-t"><b>${esc(when(c))}</b><small dir="auto">${esc(c.title)}</small></span></button>`).join('')
    + `<button type="button" class="cd-chip cd-add" data-cd="+" aria-label="${t('Countdowns and timers', 'العدّ التنازلي والمؤقتات')}"><span class="cd-ic">＋</span><span class="cd-t"><b>${t('Countdown', 'عدّ تنازلي')}</b><small>${t('or a timer', 'أو مؤقت')}</small></span></button>`;
  row.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => open(b.dataset.cd === '+' ? 'add' : 'list'));
}

/* ---------- timers and the stopwatch ---------- */
const timers = () => store.get('timers', []);
const setTimers = l => { store.set('timers', l); window.JundCal?.pushSync?.(); tick(); };
const leftOf = x => x.end ? Math.max(0, x.end - Date.now()) : (x.left || 0);
const clock = ms => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60; return num(h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`); };
function startTimer(min, label = '') {
  const ms = Math.round(Math.max(0.1, Math.min(24 * 60, Number(min) || 0)) * 60000);
  const x = { id: 'tm' + Date.now().toString(36), label: String(label || '').trim().slice(0, 60), ms, start: Date.now(), end: Date.now() + ms };
  setTimers([...timers(), x]);
  window.JundCal?.toast(t(`✓ Timer set: ${clock(ms)}`, `✓ ضُبط المؤقت: ${clock(ms)}`));
  return x;
}
const edit = (id, fn) => setTimers(timers().map(x => x.id === id ? fn({ ...x }) : x));
const pause = id => edit(id, x => { if (x.end) { x.left = leftOf(x); x.end = 0; } return x; });
const resume = id => edit(id, x => { if (!x.end) { x.end = Date.now() + (x.left || 0); x.left = 0; } return x; });
const addMin = id => edit(id, x => { if (x.end) x.end += 60000; else x.left = (x.left || 0) + 60000; x.ms += 60000; return x; });
const stop = id => setTimers(timers().filter(x => x.id !== id));
function ring(x) {
  const label = x.label || t('Timer', 'المؤقت');
  window.JundCal?.toast(t(`⏰ ${label} — time is up`, `⏰ ${label} — انتهى الوقت`), 8000);
  try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch {}
  try {   // three short beeps
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.45, 0.9].forEach(s => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(0.0001, a.currentTime + s); g.gain.exponentialRampToValueAtTime(0.3, a.currentTime + s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + s + 0.3);
      o.start(a.currentTime + s); o.stop(a.currentTime + s + 0.32); });
    setTimeout(() => a.close(), 1600);
  } catch {}
  try { if (!window.JundNative && Notification.permission === 'granted' && document.hidden) navigator.serviceWorker?.ready.then(r => r.showNotification(t('Time is up', 'انتهى الوقت'), { body: label, icon: 'icon-192.png', tag: x.id })); } catch {}
}
let ticker = 0;
function tick() {
  const list = timers(), sw = store.get('stopwatch', null);
  for (const x of list) if (x.end && x.end <= Date.now()) { ring(x); stop(x.id); return; }
  // the pill at the top: the timer that ends first (or the stopwatch)
  const pill = $('#tm-pill');
  const run = list.filter(x => x.end).sort((a, b) => a.end - b.end)[0] || list[0];
  if (pill) {
    if (run) { pill.hidden = false; pill.textContent = `${run.end ? '⏱' : '⏸'} ${clock(leftOf(run))}${list.length > 1 ? ' +' + num(list.length - 1) : ''}`; }
    else if (sw?.on) { pill.hidden = false; pill.textContent = '⏱ ' + swClock(swTime(sw)); }
    else pill.hidden = true;
  }
  const d = $('#cd-dialog'); if (d?.open) paintTimers(d);
  clearTimeout(ticker);
  if (list.length || sw?.on) ticker = setTimeout(tick, 500);
}
const swClock = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60; return num(h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`); };
const swTime = sw => (sw.acc || 0) + (sw.on ? Date.now() - sw.start : 0);
const swSet = v => { store.set('stopwatch', v); tick(); };

/* ---------- the sheet: countdowns, timers, stopwatch ---------- */
let tab = 'count';
function open(what = 'list') {
  let d = $('#cd-dialog');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'cd-dialog'; d.className = 'cd-sheet'; document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => paint());
  }
  if (what === 'timer') tab = 'timer'; else if (what === 'sw') tab = 'sw'; else if (what === 'add' || what === 'list') tab = 'count';
  d.dir = AR() ? 'rtl' : 'ltr';
  draw(d, what === 'add');
  if (!d.open) d.showModal();
}
function draw(d, focusAdd) {
  const tabs = [['count', t('Countdowns', 'العدّ التنازلي')], ['timer', t('Timer', 'المؤقت')], ['sw', t('Stopwatch', 'ساعة الإيقاف')]];
  d.innerHTML = `<div class="cd-h"><div class="cd-tabs" role="tablist">${tabs.map(([k, v]) => `<button type="button" role="tab" class="cd-tab" data-tab="${k}" aria-selected="${tab === k}">${v}</button>`).join('')}</div>
    <button type="button" class="icon-btn" id="cd-x" aria-label="${t('Close', 'إغلاق')}">✕</button></div><div id="cd-body"></div>`;
  d.querySelector('#cd-x').onclick = () => d.close();
  d.querySelectorAll('.cd-tab').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(d); });
  const body = d.querySelector('#cd-body');
  if (tab === 'count') {
    const all = list();
    body.innerHTML = `<div class="cd-list">${all.length ? all.map(c => `<div class="cd-item"><span class="cd-ic">${c.ic}</span><span class="cd-t"><b dir="auto">${esc(c.title)}</b><small>${esc(new Date(c.date + 'T12:00').toLocaleDateString(AR() ? 'ar-SA-u-ca-gregory-nu-arab' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}${c.sub ? ' · ' + esc(c.sub) : ''}${c.yearly ? ' · ' + t('every year', 'كل سنة') : ''}</small></span><span class="cd-n${c.inside || c.days === 0 ? ' now' : ''}">${esc(when(c))}</span>${c.kind === 'mine' ? `<button type="button" class="icon-btn small" data-del="${esc(c.id)}" aria-label="${t('Remove', 'حذف')}">✕</button>` : c.kind === 'islamic' ? `<button type="button" class="icon-btn small" data-hide="${esc(c.id)}" aria-label="${t('Hide', 'إخفاء')}">✕</button>` : ''}</div>`).join('') : `<p class="muted">${t('No countdowns yet.', 'لا عدّ تنازلي بعد.')}</p>`}</div>
      <form class="cd-add-f" id="cd-add"><b>${t('New countdown', 'عدّ تنازلي جديد')}</b>
        <input id="cd-title" dir="auto" maxlength="60" required placeholder="${t('e.g. Final exams, my trip, wedding', 'مثال: الاختبارات النهائية، سفري، الزواج')}">
        <div class="cd-two"><input id="cd-date" type="date" required min="${iso(new Date())}"><label class="cd-chk"><input type="checkbox" id="cd-yearly"> ${t('Every year', 'كل سنة')}</label></div>
        <button type="submit" class="primary">${t('Add', 'إضافة')}</button></form>
      <div class="cd-opts"><label class="cd-chk"><input type="checkbox" id="cd-isl" ${store.get('cdIslamic', true) ? 'checked' : ''}> ${t('Islamic dates (Ramadan, Eid, Arafah…)', 'المناسبات الإسلامية (رمضان، العيد، عرفة…)')}</label>
        <label class="cd-chk"><input type="checkbox" id="cd-exams" ${store.get('cdExams', true) ? 'checked' : ''}> ${t('Exams from my calendar', 'الاختبارات من تقويمي')}</label>
        ${store.get('cdHidden', []).length ? `<button type="button" class="link small" id="cd-unhide">${t('Show hidden dates again', 'أظهر المناسبات المخفية')}</button>` : ''}
        <small class="muted">${t('Islamic dates follow the Umm al-Qura calendar and can differ by a day from the moon sighting where you live.', 'التواريخ الإسلامية حسب تقويم أم القرى، وقد تختلف يومًا عن رؤية الهلال في بلدك.')}</small></div>`;
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { store.set('countdowns', mine().filter(c => c.id !== b.dataset.del)); draw(d); paint(); });
    body.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => { store.set('cdHidden', [...new Set([...store.get('cdHidden', []), b.dataset.hide])]); draw(d); paint(); });
    const un = body.querySelector('#cd-unhide'); if (un) un.onclick = () => { store.set('cdHidden', []); draw(d); paint(); };
    body.querySelector('#cd-isl').onchange = e => { store.set('cdIslamic', e.target.checked); draw(d); paint(); };
    body.querySelector('#cd-exams').onchange = e => { store.set('cdExams', e.target.checked); draw(d); paint(); };
    body.querySelector('#cd-add').onsubmit = e => {
      e.preventDefault();
      const title = body.querySelector('#cd-title').value.trim(), date = body.querySelector('#cd-date').value;
      if (!title || !/^\d{4}-\d\d-\d\d$/.test(date)) return;
      addCountdown(title, date, body.querySelector('#cd-yearly').checked);
      draw(d);
    };
    // a yearly date (a birthday) may be in the past: only one-off dates must be ahead
    body.querySelector('#cd-yearly').onchange = e => { const di = body.querySelector('#cd-date'); if (e.target.checked) di.removeAttribute('min'); else di.min = iso(new Date()); };
    if (focusAdd) setTimeout(() => body.querySelector('#cd-title')?.focus(), 80);
  } else if (tab === 'timer') {
    body.innerHTML = `<div id="tm-live"></div>
      <div class="tm-pre">${[1, 3, 5, 10, 15, 20, 25, 30, 45, 60].map(m => `<button type="button" class="chip" data-min="${m}">${num(m)} ${t('min', 'د')}</button>`).join('')}</div>
      <form class="cd-add-f" id="tm-f"><div class="cd-two"><input id="tm-min" type="number" min="1" max="1440" inputmode="numeric" placeholder="${t('Minutes', 'الدقائق')}"><input id="tm-label" dir="auto" maxlength="60" placeholder="${t('Name (optional): tea, revision…', 'الاسم (اختياري): شاي، مراجعة…')}"></div>
        <button type="submit" class="primary">${t('Start', 'ابدأ')}</button></form>
      <small class="muted">${t('It rings even if you close the app.', 'يرنّ حتى لو أغلقت التطبيق.')}</small>`;
    const label = () => body.querySelector('#tm-label').value;
    body.querySelectorAll('[data-min]').forEach(b => b.onclick = () => startTimer(+b.dataset.min, label()));
    body.querySelector('#tm-f').onsubmit = e => { e.preventDefault(); const m = +body.querySelector('#tm-min').value; if (m > 0) { startTimer(m, label()); body.querySelector('#tm-min').value = ''; } };
    paintTimers(d);
  } else {
    body.innerHTML = `<div class="sw-face" id="sw-face"></div><div class="sw-act" id="sw-act"></div><ol class="sw-laps" id="sw-laps"></ol>`;
    paintTimers(d);
  }
}
function paintTimers(d) {
  const live = d.querySelector('#tm-live');
  if (live) {
    const list = timers();
    const sig = list.map(x => x.id + (x.end ? 'r' : 'p')).join();
    if (live.dataset.sig !== sig) {   // rebuild the rows only when timers change, so taps are not lost
      live.dataset.sig = sig;
      live.innerHTML = list.map(x => `<div class="tm-row" data-id="${x.id}"><div class="tm-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" class="tm-bg"/><circle cx="18" cy="18" r="16" class="tm-fg" pathLength="100"/></svg></div>
        <div class="tm-t"><b class="tm-clock"></b><small dir="auto">${esc(x.label || t('Timer', 'مؤقت'))}</small></div>
        <button type="button" class="ghost small" data-act="plus">+${num(1)}</button><button type="button" class="ghost small" data-act="pp">${x.end ? t('Pause', 'إيقاف مؤقت') : t('Resume', 'استئناف')}</button><button type="button" class="icon-btn small" data-act="stop" aria-label="${t('Stop', 'إيقاف')}">✕</button></div>`).join('');
      live.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { const id = b.closest('.tm-row').dataset.id, a = b.dataset.act; a === 'plus' ? addMin(id) : a === 'stop' ? stop(id) : (timers().find(x => x.id === id)?.end ? pause(id) : resume(id)); });
    }
    for (const x of timers()) {
      const r = live.querySelector(`[data-id="${x.id}"]`); if (!r) continue;
      r.querySelector('.tm-clock').textContent = clock(leftOf(x));
      r.querySelector('.tm-fg').style.strokeDasharray = `${Math.max(0, 100 * leftOf(x) / x.ms)} 100`;
    }
  }
  const face = d.querySelector('#sw-face');
  if (face) {
    const sw = store.get('stopwatch', null) || { on: false, acc: 0, laps: [] };
    const ms = swTime(sw), cs = Math.floor(ms / 10) % 100;
    face.textContent = swClock(ms) + '.' + num(String(cs).padStart(2, '0'));
    const act = d.querySelector('#sw-act'), sig = (sw.on ? 'on' : 'off') + (ms > 0 ? 'x' : '');
    if (act.dataset.sig !== sig) {
      act.dataset.sig = sig;
      act.innerHTML = sw.on ? `<button type="button" class="ghost" id="sw-lap">${t('Lap', 'لفّة')}</button><button type="button" class="primary" id="sw-stop">${t('Stop', 'إيقاف')}</button>`
        : `${ms > 0 ? `<button type="button" class="ghost" id="sw-reset">${t('Reset', 'تصفير')}</button>` : ''}<button type="button" class="primary" id="sw-go">${ms > 0 ? t('Resume', 'استئناف') : t('Start', 'ابدأ')}</button>`;
      const b = id => act.querySelector(id);
      if (b('#sw-go')) b('#sw-go').onclick = () => { const s = store.get('stopwatch', null) || { acc: 0, laps: [] }; swSet({ ...s, on: true, start: Date.now() }); };
      if (b('#sw-stop')) b('#sw-stop').onclick = () => { const s = store.get('stopwatch'); swSet({ ...s, on: false, acc: swTime(s) }); };
      if (b('#sw-lap')) b('#sw-lap').onclick = () => { const s = store.get('stopwatch'); swSet({ ...s, laps: [...(s.laps || []), swTime(s)] }); };
      if (b('#sw-reset')) b('#sw-reset').onclick = () => swSet(null);
    }
    const laps = sw.laps || [], ol = d.querySelector('#sw-laps');
    if (ol.childElementCount !== laps.length) ol.innerHTML = laps.map((l, i) => `<li>${t('Lap', 'لفّة')} ${num(i + 1)} · ${swClock(l - (laps[i - 1] || 0))}</li>`).reverse().join('');
    clearTimeout(swTick); if (sw.on && d.open) swTick = setTimeout(() => paintTimers(d), 60);
  }
}
let swTick = 0;
function addCountdown(title, date, yearly = false) {
  if (!title || !/^\d{4}-\d\d-\d\d$/.test(date)) return false;
  if (mine().some(c => c.title === title && c.date === date)) return false;
  store.set('countdowns', [...mine(), { id: 'cd' + Date.now().toString(36), title: String(title).slice(0, 60), date, yearly: !!yearly }]);
  paint();
  const d = $('#cd-dialog'); if (d?.open && tab === 'count') draw(d);
  window.JundCal?.toast(t(`✓ Countdown added: ${title}`, `✓ أُضيف العدّ التنازلي: ${title}`));
  return true;
}
// for the assistant: the next dates, so "how many days to Ramadan?" is answered right
const brief = () => list().filter(c => c.days <= 400).slice(0, 8).map(c => `${c.title} ${c.inside ? '(now, day ' + c.dayOf + ')' : 'on ' + c.date + ' (in ' + c.days + ' days)'}`).join('; ');
// reminders for the phone: running timers ring like a reminder, even with the app closed
const alarms = () => timers().filter(x => x.end > Date.now()).map(x => ({ id: x.id, at: x.end, title: t('Time is up', 'انتهى الوقت'), body: x.label || t('Timer', 'المؤقت') }));

// the pill at the top of every screen
const top = $('#rec-pill');
if (top && !$('#tm-pill')) { const p = document.createElement('button'); p.type = 'button'; p.id = 'tm-pill'; p.className = 'chip tm-pill'; p.hidden = true; p.onclick = () => open(timers().length ? 'timer' : 'sw'); top.after(p); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
tick();

window.JundCount = { paint, open, list, startTimer, addCountdown, timers, stop, pause, resume, brief, alarms, islamicDates };
})();
