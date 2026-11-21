/* Mustatar — your own calendar: tasks, homework, exams, classes (timetable), reminders and the weekly review. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const android = window.MustatarAndroid;
const ar = () => window.ZadLang === 'ar';
const L = (en, arabic) => ar() ? arabic : en;
let nativeStatus;

const TYPES = { task: 'Task', homework: 'Homework', exam: 'Exam', class: 'Class', meeting: 'Meeting', study: 'Study time' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const weekStart = () => Number(store.get('weekStart', 0));
const startOfWeek = s => { const d = parse(s); const back = (d.getDay() - weekStart() + 7) % 7; d.setDate(d.getDate() - back); return iso(d); };
const nice = (s, withDay = true) => { const d = parse(s); return (withDay ? DOW[d.getDay()] + ', ' : '') + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); };
const when = s => { const t = today(); return s === t ? 'Today' : s === addDays(t, 1) ? 'Tomorrow' : s === addDays(t, -1) ? 'Yesterday' : nice(s); };
const hm = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${(h % 12) || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`; };

/* ---------- the items ---------- */
let events = store.get('events', []);
const newId = () => 'E' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let syncTimer = null;
function save() {
  store.set('events', events); store.set('eventsSaved', Date.now());
  if (android) pushSync();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { J.cloud.putData('calendar', { saved: store.get('eventsSaved'), events }).catch(() => {}); pushSync(); widgetSync(); }, 2500);
}
function merge(list) {
  for (const e of list || []) {
    const i = events.findIndex(x => x.id === e.id);
    if (i < 0) events.push(e); else if ((e.updated || 0) > (events[i].updated || 0)) events[i] = e;
  }
  save(); render();
}
const occurs = (e, d) => e.repeat === 'weekly'
  ? d >= e.date && parse(d).getDay() === parse(e.date).getDay() && !(e.skip || []).includes(d)
  : e.date === d;
const isDone = (e, d) => e.repeat === 'weekly' ? !!e.doneDates?.[d] : !!e.done;
const on = d => events.filter(e => occurs(e, d)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
const colorOf = t => `var(--t-${TYPES[t] ? t : 'task'})`;
function setDone(e, d, v) {
  if (e.repeat === 'weekly') { e.doneDates ||= {}; if (v) e.doneDates[d] = true; else delete e.doneDates[d]; }
  else e.done = v;
  e.updated = Date.now(); save();
}
// things not done whose day has passed (one-off items only; a missed class is not "overdue")
const overdue = () => events.filter(e => e.repeat !== 'weekly' && !e.done && e.date && e.date < today() && e.type !== 'class' && e.type !== 'meeting')
  .sort((a, b) => a.date.localeCompare(b.date));

/* ---------- drawing ---------- */
let viewMonth = today().slice(0, 7), selDay = today(), mode = { board: 'tasks' }[store.get('calMode2', 'agenda')] || store.get('calMode2', 'agenda');
const TYPE_AR = { task: 'مهمة', homework: 'واجب', exam: 'اختبار', class: 'درس', meeting: 'اجتماع', study: 'وقت مذاكرة' };
const tname = t => ar() ? TYPE_AR[t] || TYPE_AR.task : TYPES[t] || 'Task';
const DOW_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const loc = () => ar() ? 'ar-SA' : 'en-GB';
const dayName = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parse(s).toLocaleDateString(loc(), o);
const whenL = s => { const t = today(); return s === t ? L('Today', 'اليوم') : s === addDays(t, 1) ? L('Tomorrow', 'غدًا') : s === addDays(t, -1) ? L('Yesterday', 'أمس') : dayName(s); };
const clock = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return ar() ? `${(h % 12) || 12}:${pad(m)} ${h < 12 ? 'ص' : 'م'}` : hm(t); };
const HJ_AR = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
const hijriL = d => { const F = window.JundFeatures; if (!F) return ''; if (!ar()) return F.hijri?.(new Date(d + 'T12:00')) || '';
  try { const h = F.hijriParts(new Date(d + 'T12:00')); return `${h.d.toLocaleString('ar-SA')} ${HJ_AR[h.m - 1]} ${h.y.toLocaleString('ar-SA', { useGrouping: false })}`; } catch { return ''; } };
// Arabic counting: يوم، يومين، ٣ أيام، ١١ يومًا
const arDays = n => n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يومًا`;
const isTask = e => ['task', 'homework'].includes(e.type || 'task');
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
// the deadline, said plainly: "Due today", "Due in 3 days", "2 days late", "No date"
function due(e) {
  if (!e.date) return { t: L('No date', 'بلا تاريخ'), cls: 'nd' };
  if (e.done) return { t: L('Done', 'منجزة'), cls: 'ok' };
  const n = daysBetween(today(), e.date), at = e.time ? ' · ' + clock(e.time) : '';
  if (n < 0) return { t: L(`${-n} ${-n === 1 ? 'day' : 'days'} late`, `متأخرة ${arDays(-n)}`), cls: 'late' };
  if (n === 0) return { t: L('Due today', 'تُسلَّم اليوم') + at, cls: 'today' };
  if (n === 1) return { t: L('Due tomorrow', 'تُسلَّم غدًا') + at, cls: 'soon' };
  if (n <= 7) return { t: L(`Due ${dayName(e.date, { weekday: 'long' })} · in ${n} days`, `تُسلَّم ${dayName(e.date, { weekday: 'long' })} · بعد ${arDays(n)}`) + at, cls: 'soon' };
  return { t: L(`Due ${dayName(e.date)} · in ${n} days`, `تُسلَّم ${dayName(e.date)} · بعد ${arDays(n)}`), cls: '' };
}

function row2(e, d, { time = true } = {}) {
  const done = isDone(e, d), doable = !['class', 'meeting'].includes(e.type), dd = isTask(e) ? due(e) : null;
  const tm = e.time ? clock(e.time) + (e.mins ? `<small>${clock(endOf(e))}</small>` : '') : isTask(e) ? L('Due', 'موعد') : L('All day', 'طوال اليوم');
  return `<div class="ag-row ${done ? 'done' : ''}" data-ev="${esc(e.id)}" data-d="${d || ''}">
    ${time ? `<span class="ag-time">${tm}</span>` : ''}<span class="ag-bar" style="background:${colorOf(e.type)}"></span>
    <button type="button" class="ag-body" dir="auto"><b>${esc(e.title)}</b>
      <span class="ag-meta"><span class="type-pill" style="background:color-mix(in srgb, ${colorOf(e.type)} 20%, transparent);color:${colorOf(e.type)}">${tname(e.type)}</span>${dd ? ` <span class="due ${dd.cls}">${dd.t}</span>` : ''}${e.repeat === 'weekly' ? ' · ' + L('every week', 'كل أسبوع') : ''}${e.ext ? ' · ' + esc(e.notes || '') : ''}${e.who ? ' · 👤 ' + esc(e.who) : ''}${e.project ? ' · ' + esc(e.project) : ''}</span></button>
    ${doable && !e.ext ? `<input type="checkbox" class="ag-ck" ${done ? 'checked' : ''} aria-label="${L('Done', 'منجز')}">` : '<span class="ag-ck"></span>'}</div>`;
}
const endOf = e => { const [h, m] = (e.time || '00:00').split(':').map(Number), t = h * 60 + m + (Number(e.mins) || 60); return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; };
function wire2(box) {
  $$('.ag-row', box).forEach(r => {
    const e = events.find(x => x.id === r.dataset.ev); if (!e) return;
    const ck = $('input.ag-ck', r); if (ck) ck.onchange = () => { setDone(e, r.dataset.d || e.date, ck.checked); if (ck.checked) toast(L('✓ Done', '✓ أُنجزت'), 1800); render(); };
    $('.ag-body', r).onclick = () => { if (!e.ext) openDialog(e, r.dataset.d || e.date); };
  });
}
function evRow(e, d, showDate = false) {
  const done = isDone(e, d);
  return `<div class="ev ${done ? 'done' : ''}" data-ev="${esc(e.id)}" data-d="${d}">
    <span class="bar-c" style="background:${colorOf(e.type)}"></span>
    <input type="checkbox" ${done ? 'checked' : ''} aria-label="Done">
    <div class="body">
      <div class="t" dir="auto">${esc(e.title)}</div>
      <div class="m"><span class="type-pill" style="background:color-mix(in srgb, ${colorOf(e.type)} 22%, transparent);color:${colorOf(e.type)}">${TYPES[e.type] || 'Task'}</span>${showDate ? when(d) + (e.time ? ' · ' : '') : ''}${hm(e.time)}${e.repeat === 'weekly' ? ' · every week' : ''}${e.remind >= 0 ? ' · 🔔' : ''}${e.who ? ' · 👤 ' + esc(e.who) : ''}${e.project ? ' · ' + esc(e.project) : ''}${e.doing && !done ? ' · <b style="color:var(--gold)">doing</b>' : ''}</div>
      ${e.notes ? `<div class="d" dir="auto">${esc(e.notes)}</div>` : ''}
    </div></div>`;
}
function wire(box) {
  $$('.ev', box).forEach(row => {
    const e = events.find(x => x.id === row.dataset.ev); if (!e) return;
    $('input', row).onchange = ev => { setDone(e, row.dataset.d, ev.target.checked); render(); };
    $('.body', row).onclick = () => openDialog(e, row.dataset.d);
  });
}

function renderReview() {
  const t = today(), ws = startOfWeek(t), days = [...Array(7)].map((_, i) => addDays(ws, i));
  let planned = 0, done = 0;
  for (const d of days) for (const e of on(d)) if (e.type !== 'class') { planned++; if (isDone(e, d)) done++; }
  const next7 = [...Array(7)].map((_, i) => addDays(t, i + 1)).reduce((n, d) => n + on(d).filter(e => e.type !== 'class').length, 0);
  const late = overdue();
  const exam = [...Array(10)].map((_, i) => addDays(t, i)).flatMap(d => on(d).filter(e => e.type === 'exam' && !isDone(e, d)).map(e => ({ e, d })))[0];
  let tip;
  if (late.length) tip = `You have <b>${late.length}</b> unfinished ${late.length === 1 ? 'item' : 'items'} from earlier days. Finish ${late.length === 1 ? 'it' : 'them'} or move ${late.length === 1 ? 'it' : 'them'} to a new day.`;
  else if (exam) tip = `<b>${esc(exam.e.title)}</b> is ${when(exam.d).toLowerCase() === 'today' ? 'today' : 'on ' + nice(exam.d)}. Block study time before it. <button type="button" class="link" id="add-study" data-d="${exam.d}">Add study time</button>`;
  else if (planned && done / planned < 0.5) tip = 'Less than half of this week is done yet. Pick the two most important items and do them first.';
  else if (planned) tip = 'Good week so far. Keep going.';
  else tip = 'Nothing planned this week yet. Tap <b>+ Add</b>, or let the app find homework and exams in your lessons.';
  J.allLessons().then(ls => {
    const n = ls.filter(l => l.date.slice(0, 10) >= ws).length;
    const el = $('#rv-lessons'); if (el) el.textContent = n;
  });
  $('#week-review').innerHTML = `<div class="row-between"><div class="card-h" style="margin:0">This week · ${nice(ws, false)} – ${nice(addDays(ws, 6), false)}</div>
      <button type="button" class="ghost small" id="rv-ideas">Post ideas</button></div>
    <div class="stats" style="margin-top:10px">
      <div class="stat"><b>${done}/${planned}</b><span>done</span></div>
      <div class="stat"><b id="rv-lessons">·</b><span>lessons made</span></div>
      <div class="stat"><b>${next7}</b><span>next 7 days</span></div>
    </div>
    <div class="tip">${tip}</div>
    ${late.length ? `<div style="margin-top:8px">${late.slice(0, 5).map(e => evRow(e, e.date, true)).join('')}</div>` : ''}`;
  wire($('#week-review'));
  $('#rv-ideas').onclick = () => { J.show('studio'); window.JundStudio?.ideas(); };
  window.JundFeatures?.review($('#week-review'), ws);
  const as = $('#add-study'); if (as) as.onclick = () => openDialog(null, addDays(as.dataset.d, -1), { type: 'study', title: 'Study for ' + exam.e.title });
}

function renderMonth() {
  const [y, m] = viewMonth.split('-').map(Number);
  $('#cal-month').textContent = `${MONTHS[m - 1]} ${y}`;
  const first = iso(new Date(y, m - 1, 1));
  let d = startOfWeek(first);
  const dows = [...Array(7)].map((_, i) => `<div class="dow">${DOW[(weekStart() + i) % 7].slice(0, 2)}</div>`).join('');
  let cells = '';
  for (let i = 0; i < 42; i++) {
    if (i === 35 && d.slice(0, 7) !== viewMonth) break;
    const items = on(d);
    cells += `<button type="button" class="cal-day ${d.slice(0, 7) !== viewMonth ? 'out' : ''} ${d === today() ? 'today' : ''} ${d === selDay ? 'sel' : ''}" data-day="${d}" aria-label="${nice(d)}${items.length ? ', ' + items.length + ' items' : ''}">
      ${parse(d).getDate()}<span class="dots">${items.slice(0, 4).map(e => `<i style="background:${colorOf(e.type)};opacity:${isDone(e, d) ? .35 : 1}"></i>`).join('')}</span></button>`;
    d = addDays(d, 1);
  }
  $('#cal-grid').className = 'cal-grid';
  $('#cal-grid').innerHTML = dows + cells;
  $$('[data-day]', $('#cal-grid')).forEach(b => b.onclick = () => { selDay = b.dataset.day; render(); });
}
/* ---------- Agenda: everything coming, day by day (late tasks first) ---------- */
let agFrom = today(), agDays = 30;
function strip() {
  const ws = startOfWeek(agFrom);
  return `<div class="ag-strip">${[...Array(7)].map((_, i) => { const d = addDays(ws, i), n = on(d).filter(e => !isDone(e, d)).length;
    return `<button type="button" class="ag-sd ${d === today() ? 'today' : ''} ${d === agFrom ? 'sel' : ''}" data-sd="${d}"><small>${dayName(d, { weekday: 'narrow' })}</small><b>${parse(d).getDate()}</b><i>${n ? '•'.repeat(Math.min(3, n)) : ''}</i></button>`; }).join('')}</div>`;
}
const agOpen = new Set();
const ar2 = n => window.ZadLang === 'ar' ? String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]) : String(n);
function renderAgenda() {
  const v = $('#cal-view'), t = today(), late = agFrom === t ? overdue() : [], nodate = events.filter(e => isTask(e) && !e.date && !e.done);
  let html = `<div class="ag-nav"><button type="button" class="icon-btn" data-ag="-7" aria-label="${L('Previous week', 'الأسبوع السابق')}">‹</button><b>${dayName(startOfWeek(agFrom), { month: 'long', year: 'numeric' })}</b>${agFrom !== t ? `<button type="button" class="ghost small" data-ag="today">${L('Today', 'اليوم')}</button>` : ''}<button type="button" class="icon-btn" data-ag="7" aria-label="${L('Next week', 'الأسبوع التالي')}">›</button></div>${strip()}`;
  if (late.length) html += `<section class="ag-day late"><h3>${L('Late', 'متأخرة')} <small>${late.length}</small><button type="button" class="link small" id="ag-move">${L('Move all to today', 'انقلها كلها لليوم')}</button></h3>${late.map(e => row2(e, e.date)).join('')}</section>`;
  for (let i = 0; i < agDays; i++) {
    const d = addDays(agFrom, i), items = on(d);
    if (!items.length && i > 0) continue;
    const hj = hijriL(d);
    // today (and the day picked in the strip) is open; every other day is folded to one line — tap it to open
    const open = d === t || d === agFrom || agOpen.has(d);
    const sum = items.length ? L(`${items.length} ${items.length === 1 ? 'item' : 'items'}`, `${ar2(items.length)} ${items.length === 1 ? 'عنصر' : items.length === 2 ? 'عنصران' : items.length <= 10 ? 'عناصر' : 'عنصرًا'}`) + (items[0].time ? ' · ' + L('from ', 'من ') + clock(items[0].time) : '') : '';
    html += `<details class="ag-day ${d === t ? 'is-today' : ''}" data-day="${d}" ${open ? 'open' : ''}><summary><h3>${whenL(d)}${d === t || d === addDays(t, 1) ? ` <small>${dayName(d)}</small>` : ''}<span class="ag-sum">${esc(sum)}</span><span class="ag-hj">${esc(hj)}</span></h3></summary>
      ${items.length ? items.map(e => row2(e, d)).join('') : `<div class="ag-free">${L('Nothing planned.', 'لا شيء مخطط.')} <button type="button" class="link" data-add="${d}">${L('Add something', 'أضف شيئًا')}</button></div>`}</details>`;
  }
  html += `<button type="button" class="ghost ag-more" id="ag-more">${L('Show 30 more days', 'اعرض ٣٠ يومًا أخرى')}</button>`;
  if (nodate.length) html += `<button type="button" class="ag-nodate" id="ag-nodate">📌 ${L(`${nodate.length} ${nodate.length === 1 ? 'task has' : 'tasks have'} no date yet — see them in Tasks`, `${nodate.length} من المهام بلا تاريخ — تجدها في «المهام»`)}</button>`;
  v.innerHTML = html; wire2(v);
  $$('[data-ag]', v).forEach(b => b.onclick = () => { agFrom = b.dataset.ag === 'today' ? t : addDays(agFrom, Number(b.dataset.ag)); if (agFrom < t && b.dataset.ag !== 'today') agFrom = startOfWeek(agFrom); render(); });
  $$('[data-sd]', v).forEach(b => b.onclick = () => { agFrom = b.dataset.sd; render(); });
  $$('[data-add]', v).forEach(b => b.onclick = () => openDialog(null, b.dataset.add));
  $('#ag-more').onclick = () => { agDays += 30; render(); };
  $$('details.ag-day', v).forEach(dt => dt.addEventListener('toggle', () => { if (dt.open) agOpen.add(dt.dataset.day); else agOpen.delete(dt.dataset.day); }));
  const mv = $('#ag-move'); if (mv) mv.onclick = () => { for (const e of late) { e.date = t; e.updated = Date.now(); } save(); render(); toast(L(`✓ Moved ${late.length} to today`, `✓ نُقلت ${late.length} إلى اليوم`)); };
  const nd = $('#ag-nodate'); if (nd) nd.onclick = () => { mode = 'tasks'; store.set('calMode2', mode); render(); };
}

/* ---------- Tasks: every task in one place, with its deadline (nothing gets lost) ---------- */
let taskQ = '', taskView = store.get('taskView', 'list');
function renderTasks() {
  const v = $('#cal-view'), t = today(), q = taskQ.trim().toLowerCase();
  const all = events.filter(e => isTask(e) && e.repeat !== 'weekly' && !e.ext && (!q || [e.title, e.notes, e.project, e.who].join(' ').toLowerCase().includes(q)));
  const open = all.filter(e => !e.done), done = all.filter(e => e.done).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const by = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99').localeCompare(b.time || '99');
  const groups = [
    [L('Late', 'متأخرة'), open.filter(e => e.date && e.date < t), 'late'],
    [L('Today', 'اليوم'), open.filter(e => e.date === t), 'today'],
    [L('Tomorrow', 'غدًا'), open.filter(e => e.date === addDays(t, 1)), ''],
    [L('This week', 'هذا الأسبوع'), open.filter(e => e.date > addDays(t, 1) && e.date <= addDays(t, 7)), ''],
    [L('Later', 'لاحقًا'), open.filter(e => e.date > addDays(t, 7)), ''],
    [L('No date yet', 'بلا تاريخ بعد'), open.filter(e => !e.date), 'nd'],
  ];
  v.innerHTML = `<form class="tk-add" id="tk-add"><input id="tk-new" dir="auto" placeholder="${L('Add a task…', 'أضف مهمة…')}" autocomplete="off">
      <select id="tk-when" aria-label="${L('Deadline', 'موعد التسليم')}"><option value="">${L('No deadline', 'بلا موعد')}</option><option value="${t}">${L('Today', 'اليوم')}</option><option value="${addDays(t, 1)}">${L('Tomorrow', 'غدًا')}</option><option value="${addDays(t, 7)}">${L('In a week', 'بعد أسبوع')}</option><option value="pick">${L('Pick a date…', 'اختر تاريخًا…')}</option></select>
      <input type="date" id="tk-date" hidden aria-label="${L('Deadline', 'موعد التسليم')}"><button type="submit" class="primary">${L('Add', 'أضف')}</button></form>
    <div class="tk-bar"><label class="tk-search"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4.2-4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input type="search" id="tk-q" value="${esc(taskQ)}" placeholder="${L('Find a task', 'ابحث عن مهمة')}" dir="auto"></label>
      <div class="seg small" id="tk-view"><button type="button" data-tv="list" class="${taskView === 'list' ? 'on' : ''}">${L('List', 'قائمة')}</button><button type="button" data-tv="board" class="${taskView === 'board' ? 'on' : ''}">${L('Board', 'لوحة')}</button></div></div>
    <div id="tk-body"></div>`;
  const body = $('#tk-body', v);
  if (taskView === 'board') { renderBoardInto(body, all); }
  else {
    body.innerHTML = groups.filter(g => g[1].length).map(([h, list, cls]) => `<section class="ag-day ${cls}"><h3>${h} <small>${list.length}</small></h3>${list.sort(by).map(e => row2(e, e.date, { time: false })).join('')}</section>`).join('')
      + (done.length ? `<details class="tk-done"><summary>${L(`Done (${done.length})`, `منجزة (${done.length})`)}</summary>${done.slice(0, 50).map(e => row2(e, e.date, { time: false })).join('')}</details>` : '')
      || `<div class="ag-free">${q ? L('No task matches.', 'لا مهمة مطابقة.') : L('No tasks yet. Add one above — with a deadline, or without.', 'لا مهام بعد. أضف واحدة في الأعلى — بموعد تسليم أو بدونه.')}</div>`;
    wire2(body);
  }
  $('#tk-add', v).onsubmit = ev => {
    ev.preventDefault();
    const title = $('#tk-new', v).value.trim(); if (!title) return;
    const w = $('#tk-when', v).value, date = w === 'pick' ? $('#tk-date', v).value || '' : w;
    events.push({ id: newId(), created: Date.now(), updated: Date.now(), title, date, time: '', type: 'task', repeat: 'none', remind: -1, notes: '' });
    save(); render(); toast(L('✓ Task added', '✓ أُضيفت المهمة'));
    setTimeout(() => $('#tk-new')?.focus(), 50);
  };
  $('#tk-when', v).onchange = e => { const p = e.target.value === 'pick', di = $('#tk-date', v); di.hidden = !p; if (p) { di.min = t; di.value = addDays(t, 2); try { di.showPicker(); } catch {} } };
  const qi = $('#tk-q', v); qi.oninput = () => { taskQ = qi.value; const pos = qi.selectionStart; render(); const n = $('#tk-q'); n.focus(); n.setSelectionRange(pos, pos); };
  $$('[data-tv]', v).forEach(b => b.onclick = () => { taskView = b.dataset.tv; store.set('taskView', taskView); render(); });
}
function renderBoardInto(box, items) {
  const cols = { todo: items.filter(e => !e.done && !e.doing), doing: items.filter(e => !e.done && e.doing), done: items.filter(e => e.done).slice(0, 20) };
  const card = e => { const d = due(e); return `<button type="button" class="bcard" data-b="${e.id}" style="border-color:${colorOf(e.type)}" dir="auto"><b>${esc(e.title)}</b><small class="due ${d.cls}">${d.t}</small></button>`; };
  box.innerHTML = `<div class="board">${[['todo', L('To do', 'للعمل')], ['doing', L('Doing', 'جارٍ')], ['done', L('Done', 'منجز')]].map(([k, n]) => `<div class="bcol"><h4>${n} <span>${cols[k].length}</span></h4>${cols[k].map(card).join('') || `<div class="muted" style="font-size:.8rem">${L('Empty', 'فارغ')}</div>`}</div>`).join('')}</div>
    <small class="muted">${L('Tap a card to move it: To do → Doing → Done.', 'اضغط البطاقة لنقلها: للعمل ← جارٍ ← منجز.')}</small>`;
  $$('[data-b]', box).forEach(b => b.onclick = () => {
    const e = events.find(x => x.id === b.dataset.b);
    if (!e.done && !e.doing) e.doing = true; else if (e.doing && !e.done) { e.doing = false; e.done = true; } else { e.done = false; e.doing = false; }
    e.updated = Date.now(); save(); render();
  });
}

/* ---------- Week: the timetable as a real time grid ---------- */
function renderTimetable() {
  const ws = startOfWeek(selDay), days = [...Array(7)].map((_, i) => addDays(ws, i)), t = today();
  $('#cal-month').textContent = `${dayName(ws, { day: 'numeric', month: 'short' })} – ${dayName(addDays(ws, 6), { day: 'numeric', month: 'short' })}`;
  const timed = days.map(d => on(d).filter(e => e.time)), allDay = days.map(d => on(d).filter(e => !e.time));
  const mins = e => { const [h, m] = e.time.split(':').map(Number); return h * 60 + m; };
  let from = 7 * 60, to = 22 * 60;
  for (const l of timed) for (const e of l) { from = Math.min(from, Math.floor(mins(e) / 60) * 60); to = Math.max(to, Math.ceil((mins(e) + (Number(e.mins) || 60)) / 60) * 60); }
  to = Math.min(to, 24 * 60);
  const H = 46, px = m => (m - from) / 60 * H;
  const hours = []; for (let m = from; m < to; m += 60) hours.push(m);
  const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  $('#cal-grid').className = 'tt';
  $('#cal-grid').innerHTML = `<div class="tt-head"><span></span>${days.map(d => `<button type="button" class="tt-dn ${d === t ? 'today' : ''}" data-tday="${d}"><small>${dayName(d, { weekday: 'short' })}</small><b>${parse(d).getDate()}</b></button>`).join('')}</div>
    <div class="tt-all"><span class="tt-g">${L('Due', 'تسليم')}</span>${allDay.map((l, i) => `<div class="tt-ac">${l.map(e => `<button type="button" class="tt-chip ${isDone(e, days[i]) ? 'done' : ''}" data-ev="${e.id}" data-d="${days[i]}" style="--c:${colorOf(e.type)}" dir="auto">${esc(e.title)}</button>`).join('')}</div>`).join('')}</div>
    <div class="tt-body" style="height:${px(to)}px"><div class="tt-hours">${hours.map(m => `<span style="top:${px(m)}px">${clock(pad(m / 60) + ':00').replace(':00', '')}</span>`).join('')}</div>
      ${days.map((d, i) => `<div class="tt-col ${d === t ? 'today' : ''}">${hours.map(m => `<i class="tt-line" style="top:${px(m)}px"></i>`).join('')}
        ${timed[i].map(e => { const s = mins(e), len = Number(e.mins) || 60; return `<button type="button" class="tt-ev ${isDone(e, d) ? 'done' : ''}" data-ev="${e.id}" data-d="${d}" style="top:${px(s)}px;height:${Math.max(22, len / 60 * H - 2)}px;--c:${colorOf(e.type)}" dir="auto"><b>${esc(e.title)}</b><small>${clock(e.time)}</small></button>`; }).join('')}
        ${d === t && nowM >= from && nowM <= to ? `<i class="tt-now" style="top:${px(nowM)}px"></i>` : ''}</div>`).join('')}</div>`;
  $$('[data-ev]', $('#cal-grid')).forEach(x => x.onclick = () => { const e = events.find(y => y.id === x.dataset.ev); if (e && !e.ext) openDialog(e, x.dataset.d); });
  $$('[data-tday]', $('#cal-grid')).forEach(x => x.onclick = () => { agFrom = x.dataset.tday; mode = 'agenda'; store.set('calMode2', mode); render(); });
}

function render() {
  if (!$('#screen-calendar')) return;
  renderReview();
  const m = $('#cal-mode');
  if (!m.dataset.built || m.dataset.lang !== String(ar())) {
    m.dataset.built = '1'; m.dataset.lang = String(ar());
    m.innerHTML = [['agenda', L('Agenda', 'الأجندة')], ['tasks', L('Tasks', 'المهام')], ['week', L('Week', 'الأسبوع')], ['month', L('Month', 'الشهر')]].map(([k, n]) => `<button type="button" data-m="${k}">${n}</button>`).join('');
    $$('button', m).forEach(b => b.onclick = () => { mode = b.dataset.m; store.set('calMode2', mode); if (mode === 'agenda') agFrom = today(); render(); });
    $('#cal-more-h').textContent = L('This week’s review and study', 'مراجعة الأسبوع والمذاكرة');
  }
  $$('button', m).forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  const grid = mode === 'week' || mode === 'month';
  $('.cal-card').hidden = !grid; $('#cal-view').hidden = grid; $('#day-card').hidden = mode !== 'month';
  if (mode === 'agenda') renderAgenda(); else if (mode === 'tasks') renderTasks(); else if (mode === 'week') renderTimetable(); else renderMonth();
  window.JundStudy?.calendar();
  if (mode === 'month') {
    $('#day-title').textContent = selDay === today() ? L('Today', 'اليوم') + ' · ' + dayName(selDay) : whenL(selDay) + (selDay === addDays(today(), 1) ? ' · ' + dayName(selDay) : '');
    const items = on(selDay);
    $('#day-list').innerHTML = items.length ? items.map(e => row2(e, selDay)).join('')
      : `<div class="ag-free">${L('Nothing on this day.', 'لا شيء في هذا اليوم.')} <button type="button" class="link" id="day-add">${L('Add something', 'أضف شيئًا')}</button></div>`;
    wire2($('#day-list'));
    const da = $('#day-add'); if (da) da.onclick = () => openDialog(null, selDay);
    window.JundFeatures?.cleanCalendarExtras(); window.JundFeatures?.decorateCalendar();
  }
  banner();
  window.JundAssistant?.home();
}
$('#cal-prev').onclick = () => { if (mode === 'week') selDay = addDays(selDay, -7); else { const [y, m] = viewMonth.split('-').map(Number); viewMonth = iso(new Date(y, m - 2, 1)).slice(0, 7); } render(); };
$('#cal-today').onclick = () => { goToday(); render(); };
$('#cal-next').onclick = () => { if (mode === 'week') selDay = addDays(selDay, 7); else { const [y, m] = viewMonth.split('-').map(Number); viewMonth = iso(new Date(y, m, 1)).slice(0, 7); } render(); };
$('#ev-add').onclick = () => openDialog(null, selDay);

/* ---------- add / edit ---------- */
let editing = null, editDay = null;
function openDialog(e, day, preset = {}) {
  editing = e; editDay = day;
  const v = e || { title: '', date: day || today(), time: '', type: 'task', repeat: 'none', remind: Number(store.get('remindDefault', 30)), notes: '', ...preset };
  $('#ev-dialog-title').textContent = e ? 'Edit item' : 'New item';
  $('#ev-title').value = v.title; $('#ev-date').value = v.date || ''; $('#ev-time').value = v.time || '';
  $('#ev-nodate').checked = !v.date && !!e; $('#ev-end').value = v.time && v.mins ? endOf(v) : '';
  $('#ev-type').value = v.type || 'task'; $('#ev-repeat').value = v.repeat || 'none';
  $('#ev-remind').value = String(v.remind ?? -1); $('#ev-notes').value = v.notes || '';
  $('#ev-who').value = v.who || ''; $('#ev-project').value = v.project || '';
  $('#ev-projects').innerHTML = [...new Set(events.map(x => x.project).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
  $('#ev-delete').hidden = !e; delete $('#ev-delete').dataset.sure; $('#ev-delete').textContent = e?.repeat === 'weekly' ? 'Delete every week' : 'Delete';
  $('#ev-dialog-title').textContent = e ? L('Edit', 'تعديل') : L('New item', 'عنصر جديد');
  formFor(); $('#ev-dialog').showModal();
  setTimeout(() => { if (!e) $('#ev-title').focus(); }, 50);
}
// the form says what each date means: a deadline for tasks and homework, a start and end for classes and meetings
function formFor() {
  const ty = $('#ev-type').value, task = ['task', 'homework'].includes(ty), nd = task && $('#ev-nodate').checked;
  $('#ev-date-l').textContent = task ? L('Deadline', 'موعد التسليم') : ty === 'exam' ? L('Exam day', 'يوم الاختبار') : L('Date', 'التاريخ');
  $('#ev-time-l').textContent = task ? L('By (optional)', 'قبل الساعة (اختياري)') : L('Starts', 'يبدأ');
  $('#ev-nodate-f').hidden = !task; $('#ev-end-f').hidden = task;
  $('#ev-date').disabled = nd; $('#ev-date').required = !nd; $('#ev-time').disabled = nd;
  $('#ev-nodate-l').textContent = L('No deadline yet', 'لا موعد تسليم بعد');
}
$('#ev-nodate').onchange = formFor;
$('#ev-type').onchange = () => { if ($('#ev-type').value === 'class' && !editing) $('#ev-repeat').value = 'weekly'; formFor(); };
$('#ev-cancel').onclick = () => $('#ev-dialog').close();
$('#ev-form').onsubmit = ev => {
  ev.preventDefault();
  const ty = $('#ev-type').value, nodate = ['task', 'homework'].includes(ty) && $('#ev-nodate').checked;
  const title = $('#ev-title').value.trim(), date = nodate ? '' : $('#ev-date').value;
  if (!title || (!date && !nodate)) return;
  const time = nodate ? '' : $('#ev-time').value, end = $('#ev-end').value;
  const mins = !['task', 'homework'].includes(ty) && time && end ? (() => { const a = time.split(':').map(Number), b = end.split(':').map(Number); const n = (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]); return n > 0 ? n : 0; })() : 0;
  const v = { title, date, time, mins: mins || undefined, type: ty, repeat: nodate ? 'none' : $('#ev-repeat').value,
    remind: Number($('#ev-remind').value), notes: $('#ev-notes').value.trim(), updated: Date.now(),
    who: $('#ev-who').value.trim(), project: $('#ev-project').value.trim() };
  if (editing) Object.assign(editing, v); else events.push({ id: newId(), created: Date.now(), ...v });
  save(); $('#ev-dialog').close();
  if (date) { selDay = date; viewMonth = date.slice(0, 7); }
  // show where it went: tasks in Tasks, everything else in the Agenda on its day
  if (!editing) { if (nodate || ['task', 'homework'].includes(ty)) mode = 'tasks'; else { mode = 'agenda'; agFrom = date < today() ? date : today(); } store.set('calMode2', mode); }
  render();
  if ($('#screen-assistant').hidden) J.show('calendar');
  // added from Today or the chat: one tap shows where it is
  const see = !$('#screen-calendar').hidden ? null : { label: L('See it', 'اعرضها'), fn: () => J.show('calendar') };
  toast(editing ? L('✓ Saved', '✓ حُفظ') : nodate ? L('✓ Added to Tasks (no deadline yet)', '✓ أُضيفت إلى المهام (بلا موعد بعد)') : L(`✓ Added · ${whenL(date)}`, `✓ أُضيفت · ${whenL(date)}`), 4000, see);
};
$('#ev-delete').onclick = () => {
  const b = $('#ev-delete');
  if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to delete'; return; }
  events = events.filter(x => x !== editing); save(); $('#ev-dialog').close(); render();
};

/* ---------- reminders ---------- */
let toastTimer;
// a short message: a small banner at the top that slides in and away (tap or swipe it up to close it sooner)
function toast(t, ms = 3200, act = null) {
  const el = $('#toast'); if (!el) return;
  const s = String(t || '').trim(), kind = /^✓/.test(s) ? 'ok' : /^✗|^⚠/.test(s) ? 'bad' : 'info';
  el.dataset.kind = kind; el.setAttribute('dir', 'auto');
  el.innerHTML = `<i class="tst-dot" aria-hidden="true"></i><span class="tst-t"></span>`;
  el.querySelector('.tst-t').textContent = s.replace(/^[✓✗⚠]\uFE0F?\s*/, '');
  if (act?.label) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tst-act'; b.textContent = act.label; b.onclick = e => { e.stopPropagation(); hide(); act.fn?.(); }; el.appendChild(b); }
  el.hidden = false; el.classList.remove('out'); void el.offsetWidth; el.classList.add('in');
  // above any open window too (otherwise a message during a window shows half-hidden under its edge)
  try { if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual'); if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch {}
  const hide = () => { el.classList.remove('in'); el.classList.add('out'); clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; el.classList.remove('out'); try { el.hidePopover(); } catch {} }, 220); };
  el.onclick = hide;
  let y0 = null;
  el.ontouchstart = e => { y0 = e.touches[0].clientY; };
  el.ontouchend = e => { if (y0 !== null && e.changedTouches[0].clientY - y0 < -20) hide(); y0 = null; };
  clearTimeout(toastTimer); toastTimer = setTimeout(hide, Math.max(act ? 5000 : 2200, Math.min(ms, 6000)));
}
const notified = () => store.get('notified', {});
function dueTime(e, d) {
  const [h, m] = (e.time || '08:00').split(':').map(Number);
  const at = parse(d); at.setHours(h, m, 0, 0);
  return { at: at.getTime(), due: at.getTime() - Math.max(0, e.time ? e.remind : 0) * 60000 };
}
async function notify(title, body, tag) {
  toast('🔔 ' + title + (body ? ' — ' + body : ''), 7000);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const r = await navigator.serviceWorker?.ready;
      if (r) r.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png' });
      else new Notification(title, { body, tag });
    }
  } catch {}
}
function checkReminders() {
  if (android && nativeStatus?.notifications) return [];
  const now = Date.now(), n = notified(), missed = [];
  for (const d of [addDays(today(), -1), today(), addDays(today(), 1)]) for (const e of on(d)) {
    if (!(e.remind >= 0) || isDone(e, d)) continue;
    const key = e.id + '|' + d; if (n[key]) continue;
    const { at, due } = dueTime(e, d);
    if (now < due) continue;
    n[key] = now;
    if (now - at > 3 * 3600000) { missed.push({ e, d }); continue; } // long past: show it in the list, no pop-up
    notify(e.title, `${TYPES[e.type] || 'Task'} · ${when(d)}${e.time ? ' ' + hm(e.time) : ''}`, key);
  }
  // keep the list of shown reminders short
  for (const k of Object.keys(n)) if (now - n[k] > 10 * 864e5) delete n[k];
  store.set('notified', n);
  return missed;
}
// the weekly review arrives on the first day of the week
function weeklyNudge() {
  const t = today(), wk = startOfWeek(t);
  if (t !== wk || store.get('reviewSeen') === wk) return;
  store.set('reviewSeen', wk);
  notify('Your weekly review is ready', 'See what you did and what is coming this week.', 'review-' + wk);
}
function banner() {
  const b = $('#due-banner'); if (!b) return;
  const t = today(), items = on(t).filter(e => !isDone(e, t)), late = overdue();
  if (!items.length && !late.length) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<b>Today:</b> ${items.length ? items.slice(0, 3).map(e => `${e.time ? hm(e.time) + ' ' : ''}<span dir="auto">${esc(e.title)}</span>`).join(' · ') + (items.length > 3 ? ` +${items.length - 3}` : '') : 'nothing left'}
    ${late.length ? `<br><span style="color:var(--danger)">${late.length} unfinished from earlier</span>` : ''}
    · <button type="button" class="link" id="due-open">Open calendar</button>`;
  $('#due-open').onclick = () => { goToday(); J.show('calendar'); };
}
function goToday() { selDay = today(); viewMonth = selDay.slice(0, 7); }

// settings
$('#week-start').value = String(weekStart());
$('#week-start').onchange = () => { store.set('weekStart', Number($('#week-start').value)); render(); };
$('#remind-default').value = String(store.get('remindDefault', 30));
$('#remind-default').onchange = () => store.set('remindDefault', Number($('#remind-default').value));
/* reminders when the app is closed: the server wakes the phone at the right minute */
function reminderList() {
  const out = [];
  for (let i = -1; i <= 7; i++) {
    const d = addDays(today(), i);
    for (const e of on(d)) {
      if (!(e.remind >= 0) || isDone(e, d)) continue;
      const { at, due } = dueTime(e, d);
      if (due < Date.now() - 60e3) continue;
      out.push({ at: due, title: e.title, body: `${TYPES[e.type] || 'Task'} · ${when(d)}${e.time ? ' ' + hm(e.time) : ''}`, tag: e.id + '|' + d });
    }
  }
  const run = store.get('focusRun');
  if (run && run.end > Date.now()) out.push({ at: run.end, title: 'Focus time done', body: `${run.min} min of ${run.subject}. Take a short break.`, tag: 'focus-' + run.start });
  for (const x of window.JundCount?.alarms?.() || []) out.push({ at: x.at, title: x.title, body: x.body, tag: x.id });
  for (const x of window.JundBrief?.alarms?.() || []) out.push({ at: x.at, title: x.title, body: x.body, tag: x.id });   // briefs before lessons and meetings
  for (const x of window.JundCheckin?.alarms?.() || []) out.push({ at: x.at, title: x.title, body: x.body, tag: x.id });
  for (const h of window.JundFeatures?.habitReminders?.() || []) for (let i = 0; i <= 7; i++) {
    const date = addDays(today(), i), at = new Date(`${date}T${h.time}`).getTime();
    if (at >= Date.now() - 60e3 && !h.skip.includes(date)) out.push({ at, title: h.title, body: h.body, tag: `${h.id}|${date}` });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 200);
}
function nativeReminders() {
  const items = events.filter(e => e.remind >= 0 && (e.repeat === 'weekly' || (!e.done && e.date >= addDays(today(), -1))))
    .map(e => ({ id: e.id, title: e.title, body: TYPES[e.type] || L('Task', 'مهمة'), date: e.date,
      time: e.time || '08:00', lead: e.time ? e.remind : 0, every: e.repeat === 'weekly' ? 7 : 0,
      skip: [...(e.skip || []), ...Object.keys(e.doneDates || {}).filter(d => e.doneDates[d])].filter(d => d >= addDays(today(), -1)) }));
  items.push(...(window.JundFeatures?.habitReminders?.() || []));
  const run = store.get('focusRun');
  if (run && run.end > Date.now()) items.push({ id: 'focus-' + run.start, at: run.end, title: L('Focus time done', 'انتهى وقت التركيز'), body: run.subject });
  items.push(...(window.JundCount?.alarms?.() || []));   // running timers ring like the focus timer
  items.push(...(window.JundBrief?.alarms?.() || []));   // a short brief before lessons and meetings
  items.push(...(window.JundCheckin?.alarms?.() || []));   // the evening check-in
  items.push(...(window.JundPhone?.prayerAlarms?.() || []));   // a gentle vibration at prayer times (Android app)
  return items;
}
function nativeMessage(action, details = {}) { android.postMessage(JSON.stringify({ action, ...details })); }
if (android) android.onmessage = e => {
  try { const s = JSON.parse(e.data); if (s && (s.move !== undefined || s.file !== undefined || s.spoke !== undefined)) return; nativeStatus = s; notifStatus(); } catch {}
};
let pushBusy = false;
async function pushSync(force) {
  if (android) { nativeMessage('sync', { items: nativeReminders() }); return null; }
  if (pushBusy || !('PushManager' in window) || !('serviceWorker' in navigator) || Notification.permission !== 'granted' || !navigator.onLine) return null;
  pushBusy = true;
  try {
    const base = (await (await fetch('server.json', { cache: 'no-cache' })).json()).url.replace(/\/$/, '');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const kr = await fetch(base + '/push/key'); if (!kr.ok) return null;
      const { key } = await kr.json();
      const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), c => c.charCodeAt(0));
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    }
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint));
    const id = [...new Uint8Array(hash)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
    const c = await caches.open('jn-push'); await c.put('id', new Response(id)); await c.put('server', new Response(base));
    const r = await fetch(base + '/push/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, sub: sub.toJSON(), reminders: reminderList() }) });
    store.set('pushOk', r.ok); store.set('pushId', id);
    return r.ok ? { base, id } : null;
  } catch (e) { store.set('pushOk', false); return null; } finally { pushBusy = false; }
}
/* the home-screen widget reads a short list kept on the app's server */
function widgetId() {
  let id = store.get('widgetId');
  if (!id) { id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); store.set('widgetId', id); }
  return id;
}
async function widgetSync() {
  if (!(store.get('widgetOn') || store.get('feedOn')) || !navigator.onLine) return;
  try {
    const base = (await (await fetch('server.json', { cache: 'no-cache' })).json()).url.replace(/\/$/, '');
    const up = [];
    for (let i = -1; i <= 14 && up.length < 12; i++) {
      const d = addDays(today(), i);
      for (const e of on(d)) {
        if (isDone(e, d)) continue;
        const { at } = dueTime(e, d);
        const end = e.time ? at + 3600e3 : new Date(d + 'T23:59').getTime();
        if (end < Date.now()) continue;
        up.push({ title: e.title, at: e.time ? at : new Date(d + 'T00:01').getTime(), end, timed: !!e.time });
      }
    }
    const p = store.get('prayerPlace', { name: 'Makkah', lat: 21.4225, lon: 39.8262 });
    await fetch(base + '/widget/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: widgetId(), place: { name: p.name, lat: p.lat, lon: p.lon }, upcoming: up.slice(0, 12), style: store.get('widgetStyle', 'clear'), wisdom: await window.JundReminder?.forWidget?.().catch(() => null), feed: events.filter(e => !e.ext && (e.repeat === 'weekly' || e.date >= addDays(today(), -7))).slice(0, 400).map(e => ({ t: e.title, d: e.date, tm: e.time || '', r: e.remind ?? -1, w: e.repeat === 'weekly', id: e.id, ty: e.type })) }) });
  } catch {}
}
async function widgetConnect() {
  store.set('widgetOn', true);
  await widgetSync();
  const base = (await (await fetch('server.json', { cache: 'no-cache' })).json()).url.replace(/\/$/, '');
  location.href = `intent://widget?id=${widgetId()}&server=${encodeURIComponent(base)}#Intent;scheme=daftar;package=app.mustatar;end`;
}
if ($('#widget-connect')) $('#widget-connect').onclick = widgetConnect;
if ($('#widget-style')) { $('#widget-style').value = store.get('widgetStyle', 'clear'); $('#widget-style').onchange = () => { store.set('widgetStyle', $('#widget-style').value); widgetSync(); toast('Widget style saved. It changes on your home screen within a few minutes, or tap the widget once.'); }; }
function notifStatus() {
  if (android) {
    const s = $('#notif-status');
    $('#notif-allow').hidden = !!(nativeStatus?.notifications && nativeStatus?.exact);
    $('#notif-test').hidden = !nativeStatus?.notifications;
    s.textContent = !nativeStatus?.notifications ? L('Allow Android notifications for reminders when the app is closed.', 'اسمح بإشعارات أندرويد لتصل التذكيرات والتطبيق مغلق.')
      : nativeStatus.exact ? L('Android reminders are enabled, including when the app is closed.', 'تذكيرات أندرويد مفعّلة حتى عند إغلاق التطبيق.')
        : L('Reminders work in the background. Allow exact alarms for more precise delivery.', 'تعمل التذكيرات في الخلفية. اسمح بالمنبّهات الدقيقة لتحسين توقيت وصولها.');
    return;
  }
  const s = $('#notif-status'); if (!('Notification' in window)) { s.textContent = 'This browser cannot show notifications; reminders show inside the app.'; return; }
  const p = Notification.permission;
  $('#notif-allow').hidden = p === 'granted';
  $('#notif-test').hidden = p !== 'granted';
  s.textContent = p === 'granted' ? (store.get('pushOk') ? '✓ Reminders reach this phone even when Mustatar is closed.' : '✓ Reminders pop up while the app is open. Connecting closed-app reminders…')
    : p === 'denied' ? 'Notifications are blocked. Allow them for this app in your phone settings.' : 'Allow notifications to get reminders on the phone, even when the app is closed.';
}
$('#notif-allow').onclick = async () => { if (android) { nativeMessage('permissions'); return; } try { await Notification.requestPermission(); } catch {} notifStatus(); await pushSync(); notifStatus(); };
$('#notif-test').onclick = async () => {
  if (android) { nativeMessage('test'); toast(L('Test reminder scheduled. You can close Mustatar.', 'جُدول إشعار تجريبي. يمكنك إغلاق مستطر.')); return; }
  $('#notif-status').textContent = 'Sending a test… you can close the app now.';
  const ok = await pushSync();
  if (!ok) { $('#notif-status').textContent = '✗ Could not connect closed-app reminders on this browser. In-app reminders still work. (On Android, open Mustatar with Chrome.)'; return; }
  const r = await fetch(ok.base + '/push/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: ok.id }) }).then(x => x.json()).catch(() => ({}));
  $('#notif-status').textContent = r.ok ? '✓ Test sent. A notification should appear in a few seconds.' : '✗ The test did not go through (' + (r.status || 'no answer') + ').';
};
notifStatus();

/* ---------- tasks found in a lesson ---------- */
// tasks and dates found in a lesson or meeting: the person chooses which go to the calendar (none are added by themselves)
function onLesson(l) {
  const box = $('#found-tasks');
  const list = (l?.notes?.tasks || []).filter(t => t && t.title);
  if (!store.get('findTasks', true) || !list.length || l.tasksHandled) { box.hidden = true; return; }
  const AR = window.ZadLang === 'ar', L = (en, ar) => AR ? ar : en;
  // a small line on the result: the choice can always be opened again
  box.hidden = false;
  box.innerHTML = `<button type="button" class="ft-chip" id="ft-open">📅 ${L(`${list.length} ${list.length === 1 ? 'task or date' : 'tasks and dates'} found — choose what to add`, `وُجدت ${list.length} ${list.length === 1 ? 'مهمة أو موعد' : 'مهام ومواعيد'} — اختر ما تضيفه`)}</button>`;
  $('#ft-open').onclick = () => chooseTasks(l, list);
  if (!l.tasksAsked) { l.tasksAsked = true; J.saveLesson(l); setTimeout(() => { if (!$('#screen-result')?.hidden) chooseTasks(l, list); }, 700); }
}
function chooseTasks(l, list) {
  const AR = window.ZadLang === 'ar', L = (en, ar) => AR ? ar : en;
  const t0 = today(), base = (l.date || '').slice(0, 10) || t0;
  const fallback = addDays(base, 1) < t0 ? addDays(t0, 1) : addDays(base, 1);
  const nice = d => new Date(d + 'T12:00').toLocaleDateString(AR ? 'ar-SA-u-ca-gregory' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  let d = $('#ft-sheet');
  if (!d) { d = document.createElement('dialog'); d.id = 'ft-sheet'; d.className = 'ft-sheet'; document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d) d.close(); }); }
  d.dir = AR ? 'rtl' : 'ltr';
  const rows = list.map((t, i) => {
    const said = /^\d{4}-\d\d-\d\d$/.test(t.date || '') ? t.date : '';
    const past = said && said < t0;
    return `<div class="ft-row${past ? ' past' : ''}" data-i="${i}">
      <label class="ft-pick"><input type="checkbox" data-i="${i}"><span><b dir="auto">${esc(t.title)}</b>
        <small><span class="type-pill" style="background:color-mix(in srgb, ${colorOf(t.type)} 22%, transparent);color:${colorOf(t.type)}">${TYPES[t.type] || 'Task'}</span>
        ${t.who ? ' · ' + esc(t.who) : ''}${t.time ? ' · ' + esc(t.time) : ''}</small></span></label>
      <div class="ft-when">${past ? `<span class="ft-past">⚠ ${L(`This was for ${nice(said)}, which has passed. Add it anyway on a new day?`, `كان هذا ليوم ${nice(said)} وقد مضى. أتضيفه في يوم جديد؟`)}</span>` : !said ? `<span class="ft-nodate">${L('No day was said — pick one', 'لم يُذكر يوم — اختر يومًا')}</span>` : ''}
        <input type="date" data-date="${i}" value="${past ? addDays(t0, 1) : said || fallback}" min="${t0}"></div>
    </div>`;
  }).join('');
  d.innerHTML = `<div class="ft-h"><b>${L('Add to your calendar?', 'أتضيفها إلى تقويمك؟')}</b><button type="button" class="icon-btn" id="ft-x" aria-label="${L('Close', 'إغلاق')}">✕</button></div>
    <p class="muted ft-sub">${L(`From “${esc(l.unit || l.notes?.title || '')}”. Tick the ones you want; nothing is added unless you choose it.`, `من «${esc(l.unit || l.notes?.title || '')}». اختر ما تريد؛ لا يُضاف شيء إلا ما تختاره.`)}</p>
    <div class="ft-list">${rows}</div>
    <div class="ft-act"><button type="button" class="link" id="ft-all">${L('Tick all', 'اختر الكل')}</button><span class="ft-sp"></span>
      <button type="button" class="ghost small" id="ft-none">${L('None of these', 'لا شيء منها')}</button><button type="button" class="primary small" id="ft-add" disabled>${L('Add', 'أضف')}</button></div>`;
  const count = () => { const n = $$('input[data-i]:checked', d).length; const b = $('#ft-add', d); b.disabled = !n; b.textContent = n ? L(`Add ${n}`, `أضف ${n}`) : L('Add', 'أضف'); };
  $$('input[data-i]', d).forEach(c => c.onchange = count);
  $('#ft-all', d).onclick = () => { $$('input[data-i]', d).forEach(c => c.checked = true); count(); };
  $('#ft-x', d).onclick = () => d.close();
  const done = async () => { l.tasksHandled = true; $('#found-tasks').hidden = true; await J.saveLesson(l); d.close(); };
  $('#ft-none', d).onclick = done;
  $('#ft-add', d).onclick = async () => {
    let n = 0;
    $$('input[data-i]', d).forEach(c => {
      if (!c.checked) return;
      const t = list[+c.dataset.i], date = $(`input[data-date="${c.dataset.i}"]`, d).value || fallback;
      events.push({ id: newId(), created: Date.now(), updated: Date.now(), title: t.title, date, time: /^\d\d:\d\d$/.test(t.time || '') ? t.time : '',
        type: TYPES[t.type] ? t.type : 'task', repeat: 'none', remind: Number(store.get('remindDefault', 30)),
        notes: [t.note, `From: ${l.subject?.name || ''} — ${l.unit || ''}`].filter(Boolean).join('\n'), src: l.id,
        who: t.who || '', project: J.me().use === 'work' ? (l.subject?.name || '') : '' });
      n++;
    });
    save(); await done(); toast(L(`✓ Added ${n} to your calendar`, `✓ أُضيفت ${n} إلى تقويمك`));
  };
  if (!d.open) d.showModal();
}

/* ---------- start ---------- */
async function pullCloud() {
  try {
    const r = await J.cloud.getData('calendar');
    if (r?.events && (r.saved || 0) > (store.get('eventsSaved', 0))) { merge(r.events); store.set('eventsSaved', r.saved); }
  } catch {}
}
function upcoming(days = 7, max = 8) {
  const out = overdue().map(e => ({ e, d: e.date, late: true }));
  for (let i = 0; i <= days; i++) { const d = addDays(today(), i); for (const e of on(d)) if (!isDone(e, d)) out.push({ e, d }); }
  return out.slice(0, max).map(x => ({ ...x, when: x.late ? 'Overdue' : when(x.d), time: hm(x.e.time), type: TYPES[x.e.type] || 'Task', color: colorOf(x.e.type) }));
}
// every (item, day) between two days from today, repeats included (for the widgets and the phone's calendar)
function between(a, b) { const out = []; for (let i = a; i <= b; i++) { const d = addDays(today(), i); for (const e of on(d)) out.push({ e, d, done: isDone(e, d), ...dueTime(e, d) }); } return out; }
window.JundCal = { on, between, pushSync, widgetSync, widgetId, render, onLesson, chooseTasks, merge, goToday, toast, upcoming, save: () => { save(); render(); }, addDays, today, open: (e, d) => openDialog(e ? events.find(x => x.id === e) : null, d || today()), events: () => events, add: e => { const x = { id: newId(), created: Date.now(), updated: Date.now(), repeat: 'none', remind: -1, ...e }; events.push(x); save(); return x; }, remove: id => { const i = events.findIndex(x => x.id === id); if (i >= 0) { events.splice(i, 1); save(); } } };
banner();
setTimeout(() => {
  const missed = checkReminders();
  if (missed.length) toast(window.ZadLang === 'ar' ? `🔔 فاتتك ${missed.length} من التذكيرات — انظر «اليوم»` : `🔔 You missed ${missed.length} ${missed.length === 1 ? 'reminder' : 'reminders'} — see Today`, 6000);
  weeklyNudge();
}, 1500);
setInterval(() => { checkReminders(); weeklyNudge(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); banner(); } });
pullCloud();
setTimeout(() => pushSync().then(notifStatus), 4000);
document.addEventListener('visibilitychange', () => { if (document.hidden) { pushSync(); widgetSync(); } });
setTimeout(widgetSync, 6000);
})();
