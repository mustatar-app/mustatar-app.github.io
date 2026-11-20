/* Mustatar — the habit tracker, made like Junaid's own sheets ("Self-upgrading OS", the notebook table, the Habits app):
   a table of habits × days with ✓ and ✗, the day's score under each day (9/13), a progress chart, weekly and monthly
   percentages, the top habits, and a coach (the AI) that studies your record and tells you plainly:
   your strengths and weaknesses (SWOT), the gap between where you are and your goals, the difficulties ahead,
   what you are missing, and the next steps — with habits to add in one tap. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const AR = () => window.ZadLang === 'ar';
const L = (en, ar) => AR() ? ar : en;
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => new Date(s + 'T12:00');
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const loc = () => AR() ? 'ar-SA' : 'en-GB';
const COLORS = ['#f5c542', '#7aa7ff', '#5ad1c1', '#f28fb1', '#b59cff', '#8fd16a', '#ff9f5a', '#6fc3ff', '#e3a3ff', '#ffd27a'];

/* ---------- the habits (same store as before: days[date] = true when done; miss[date] = true when marked ✗) ---------- */
const all = () => store.get('habits', []);
function save(list) {
  store.set('habits', list);
  J.cloud?.putData?.('habits', { saved: Date.now(), habits: list }).catch?.(() => {});
  window.JundCal?.pushSync?.();
  window.JundFeatures?.renderHabits?.();
}
const colorOf = (h, i) => h.color || COLORS[i % COLORS.length];
const state = (h, d) => h.days?.[d] ? 'done' : h.miss?.[d] ? 'miss' : '';
function cycle(id, d) {   // tap: empty → ✓ → ✗ → empty
  const list = all(), h = list.find(x => x.id === id); if (!h) return;
  h.days ||= {}; h.miss ||= {};
  const s = state(h, d);
  delete h.days[d]; delete h.miss[d];
  if (s === '') h.days[d] = true; else if (s === 'done') h.miss[d] = true;
  save(list); paint();
  if (s === '' && navigator.vibrate) navigator.vibrate(12);
}
const since = h => h.created && h.created <= today() ? h.created : '0000';
// a habit counts only from the day it was made
const counted = (h, days) => days.filter(d => d >= since(h) && d <= today());
const rate = (h, days) => { const c = counted(h, days); return c.length ? c.filter(d => h.days?.[d]).length / c.length : 0; };
function streak(h) {
  let n = 0, d = today();
  if (!h.days?.[d]) d = addDays(d, -1);
  while (h.days?.[d]) { n++; d = addDays(d, -1); }
  return n;
}
function bestStreak(h) {
  const ds = Object.keys(h.days || {}).filter(d => h.days[d]).sort(); let best = 0, run = 0, prev = '';
  for (const d of ds) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

/* ---------- the screen ---------- */
let view = store.get('habitView', 'week'), month = today().slice(0, 7);
function periodDays() {
  if (view === 'week') return [...Array(7)].map((_, i) => addDays(today(), i - 6));
  const [y, m] = month.split('-').map(Number), n = new Date(y, m, 0).getDate();
  return [...Array(n)].map((_, i) => `${month}-${pad(i + 1)}`);
}
function ring(p, c, size = 26) {
  const r = size / 2 - 3, C = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="3.5"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
function screen() {
  let s = $('#screen-habits');
  if (!s) { s = document.createElement('section'); s.className = 'screen'; s.id = 'screen-habits'; s.hidden = true; s.setAttribute('data-noi18n', ''); $('#screen-calendar').after(s); }
  return s;
}
function paint() {
  const s = screen(); if (s.hidden) return;
  const list = all(), days = periodDays(), t = today();
  const live = days.filter(d => d <= t);
  // the day's score (done / habits that existed that day)
  const score = d => { const hs = list.filter(h => d >= since(h)); return [hs.filter(h => h.days?.[d]).length, hs.length]; };
  const tot = live.reduce((a, d) => { const [x, y] = score(d); return [a[0] + x, a[1] + y]; }, [0, 0]);
  const pct = tot[1] ? Math.round(tot[0] / tot[1] * 100) : 0;
  const wk = [...Array(7)].map((_, i) => addDays(t, i - 6)), wkTot = wk.reduce((a, d) => { const [x, y] = score(d); return [a[0] + x, a[1] + y]; }, [0, 0]);
  const top = list.map((h, i) => ({ h, i, r: rate(h, live) })).sort((a, b) => b.r - a.r);
  const nudge = coachLine(list);
  const head = view === 'week' ? L('Last 7 days', 'آخر ٧ أيام') : parse(month + '-01').toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
  s.innerHTML = `<div class="row-between"><h1 class="screen-title">${L('Habit tracker', 'متابعة العادات')}</h1><button type="button" class="primary" id="hb-add">+ ${L('Habit', 'عادة')}</button></div>
    ${nudge ? `<div class="hb-nudge">💡 <span dir="auto">${nudge}</span></div>` : ''}
    <div class="seg hb-views"><button type="button" data-v="week" class="${view === 'week' ? 'on' : ''}">${L('Week', 'الأسبوع')}</button><button type="button" data-v="month" class="${view === 'month' ? 'on' : ''}">${L('Month', 'الشهر')}</button></div>
    <div class="hb-nav">${view === 'month' ? `<button type="button" class="icon-btn" data-mo="-1" aria-label="${L('Previous month', 'الشهر السابق')}">‹</button>` : ''}<b>${head}</b>${view === 'month' ? `<button type="button" class="icon-btn" data-mo="1" aria-label="${L('Next month', 'الشهر التالي')}">›</button>` : ''}</div>
    ${list.length ? `
    <div class="card hb-card"><div class="hb-scroll"><table class="hb-grid hb-${view === 'week' ? 'w' : 'm'}">
      <thead><tr><th class="hb-name-h">${L('Habit', 'العادة')}</th>${days.map(d => `<th class="${d === t ? 'today' : ''}${d > t ? ' fut' : ''}"><small>${parse(d).toLocaleDateString(loc(), { weekday: 'narrow' })}</small><b>${parse(d).getDate()}</b></th>`).join('')}${view === 'month' ? '<th class="hb-pc-h">%</th>' : ''}</tr></thead>
      <tbody>${list.map((h, i) => { const c = colorOf(h, i), r = rate(h, live);
        return `<tr><th class="hb-name" style="--c:${c}"><button type="button" class="hb-edit" data-edit="${esc(h.id)}">${ring(r, c)}<span dir="auto"><b>${esc(h.name)}</b>${h.target || h.reminder ? `<small>${esc([h.target, h.reminder ? '⏰ ' + h.reminder : ''].filter(Boolean).join(' · '))}</small>` : ''}</span></button></th>
          ${days.map(d => { const st = state(h, d), off = d > t || d < since(h);
            return `<td><button type="button" class="hb-c ${st}${d === t ? ' today' : ''}" data-h="${esc(h.id)}" data-d="${d}" ${off ? 'disabled' : ''} style="--c:${c}" aria-label="${esc(h.name)} ${d}">${st === 'done' ? '✓' : st === 'miss' ? '✕' : ''}</button></td>`; }).join('')}
          ${view === 'month' ? `<td class="hb-pc">${Math.round(r * 100)}%</td>` : ''}</tr>`; }).join('')}</tbody>
      <tfoot><tr><th>${L('Done', 'المنجز')}</th>${days.map(d => { const [x, y] = score(d); return `<td class="${d > t ? 'fut' : ''}">${d > t ? '' : `<b>${x}</b><small>/${y}</small>`}</td>`; }).join('')}${view === 'month' ? '<td></td>' : ''}</tr></tfoot>
    </table></div>
    <small class="muted hb-tip">${L('Tap a box: ✓ done → ✕ missed → empty. Tap a habit to change or delete it.', 'اضغط المربع: ✓ أنجزت ← ✕ فاتتني ← فارغ. اضغط العادة لتعديلها أو حذفها.')}</small></div>

    <div class="card"><div class="card-h">${L('Progress', 'التقدم')}</div>
      <div class="hb-stats">
        <div class="hb-stat">${ring(wkTot[1] ? wkTot[0] / wkTot[1] : 0, 'var(--accent)', 64)}<b>${wkTot[1] ? Math.round(wkTot[0] / wkTot[1] * 100) : 0}%</b><span>${L('this week', 'هذا الأسبوع')}</span></div>
        <div class="hb-stat">${ring(pct / 100, '#5ad1c1', 64)}<b>${pct}%</b><span>${view === 'week' ? L('7 days', '٧ أيام') : L('this month', 'هذا الشهر')}</span></div>
        <div class="hb-stat big"><b>${Math.max(0, ...list.map(streak))}</b><span>${L('best running streak', 'أطول سلسلة الآن')}</span></div>
      </div>
      <div class="hb-chart" aria-label="${L('Habits done each day', 'العادات المنجزة كل يوم')}">${days.map(d => { const [x, y] = score(d); const p = y ? x / y : 0;
        return `<div class="hb-bar ${d === t ? 'today' : ''}" title="${d}: ${x}/${y}"><i style="height:${d > t ? 0 : Math.max(2, Math.round(p * 100))}%;opacity:${d > t ? .2 : .35 + p * .65}"></i><small>${view === 'week' || parse(d).getDate() % 5 === 1 ? parse(d).getDate() : ''}</small></div>`; }).join('')}</div>
      <div class="card-h" style="margin-top:14px">${L('Top habits', 'أفضل العادات')}</div>
      <ol class="hb-top">${top.map(({ h, i, r }) => `<li><span dir="auto">${esc(h.name)}</span><i><b style="width:${Math.round(r * 100)}%;background:${colorOf(h, i)}"></b></i><small>${Math.round(r * 100)}%</small></li>`).join('')}</ol>
    </div>` : `<div class="card hb-empty"><p>${L('Track the habits that build you: tick them each day, see your score, and let the coach show you where you stand.', 'تابع العادات التي تبنيك: علّمها كل يوم، وشاهد نتيجتك، ودع المدرّب يريك أين تقف.')}</p>
      <div class="hb-ideas">${IDEAS().map(([n, tg]) => `<button type="button" class="chip" data-idea="${esc(n)}" data-tg="${esc(tg)}">+ ${esc(n)}${tg ? ` <small>${esc(tg)}</small>` : ''}</button>`).join('')}</div></div>`}

    <div class="card hb-coach" id="hb-coach"></div>`;
  wire(s); paintCoach();
}
const IDEAS = () => AR()
  ? [['الاستيقاظ مبكرًا', '٥:٣٠ ص'], ['قراءة ورد من القرآن', '٢٠ دقيقة'], ['أذكار الصباح والمساء', ''], ['شرب الماء', '٢٫٥ لتر'], ['رياضة', '٢٠ دقيقة'], ['مذاكرة', 'ساعتان'], ['النوم قبل ١٠ م', ''], ['خطة الغد', ''], ['محاسبة النفس', ''], ['تعلّم لغة', '٢٠ دقيقة'], ['قراءة كتاب', '٥ صفحات'], ['بلا تواصل اجتماعي', '']]
  : [['Wake up early', '5:30 am'], ['Quran reading', '20 min'], ['Morning & evening adhkar', ''], ['Water', '2.5 L'], ['Workout', '20 min'], ['Study', '2 h'], ['Sleep before 10 pm', ''], ['Plan the next day', ''], ['Journal & self-review', ''], ['Learn a language', '20 min'], ['Read a book', '5 pages'], ['No social media', '']];
function wire(s) {
  $('#hb-add', s).onclick = () => editor();
  $$('[data-v]', s).forEach(b => b.onclick = () => { view = b.dataset.v; store.set('habitView', view); paint(); });
  $$('[data-mo]', s).forEach(b => b.onclick = () => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + Number(b.dataset.mo), 1); month = iso(d).slice(0, 7); paint(); });
  $$('.hb-c', s).forEach(b => b.onclick = () => cycle(b.dataset.h, b.dataset.d));
  $$('[data-edit]', s).forEach(b => b.onclick = () => editor(all().find(h => h.id === b.dataset.edit)));
  $$('[data-idea]', s).forEach(b => b.onclick = () => add({ name: b.dataset.idea, target: b.dataset.tg }));
  // the month table starts at today
  const sc = $('.hb-scroll', s), td = $('th.today', s);
  if (sc && td && view === 'month') requestAnimationFrame(() => { const a = sc.getBoundingClientRect(), b = td.getBoundingClientRect(); sc.scrollLeft += AR() ? (b.left - a.left) - 60 : (b.right - a.right) + 60; });
}
function add(h) {
  const list = all();
  if (list.some(x => x.name.trim().toLowerCase() === h.name.trim().toLowerCase())) { window.JundCal?.toast(L('You already have this habit', 'هذه العادة موجودة')); return; }
  list.push({ id: 'H' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: h.name.trim().slice(0, 80), target: (h.target || '').slice(0, 40), reminder: h.reminder || '', color: COLORS[list.length % COLORS.length], days: {}, miss: {}, created: today() });
  save(list); paint(); window.JundCal?.toast(L('✓ Habit added', '✓ أُضيفت العادة'));
}
function editor(h) {
  const d = document.createElement('dialog'); d.className = 'hb-dlg'; d.dir = AR() ? 'rtl' : 'ltr'; d.setAttribute('data-noi18n', '');
  d.innerHTML = `<form method="dialog"><h2>${h ? L('Edit habit', 'تعديل العادة') : L('New habit', 'عادة جديدة')}</h2>
    <label class="field"><span>${L('Habit', 'العادة')}</span><input id="hd-n" dir="auto" maxlength="80" required value="${esc(h?.name || '')}" placeholder="${L('e.g. ⏰ Wake up early', 'مثال: ⏰ الاستيقاظ مبكرًا')}"></label>
    <div class="grid2"><label class="field"><span>${L('Target (optional)', 'الهدف (اختياري)')}</span><input id="hd-t" dir="auto" maxlength="40" value="${esc(h?.target || '')}" placeholder="${L('20 min, 2.5 L, 5 pages…', '٢٠ دقيقة، ٥ صفحات…')}"></label>
      <label class="field"><span>${L('Reminder (optional)', 'تذكير (اختياري)')}</span><input id="hd-r" type="time" value="${esc(h?.reminder || '')}"></label></div>
    <div class="hd-colors">${COLORS.map(c => `<button type="button" class="hd-col${(h?.color || COLORS[all().length % COLORS.length]) === c ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
    <div class="row-between" style="margin-top:14px">${h ? `<button type="button" class="ghost danger" id="hd-del">${L('Delete', 'حذف')}</button>` : '<span></span>'}
      <span class="row-gap"><button type="button" class="ghost" id="hd-x">${L('Cancel', 'إلغاء')}</button><button type="submit" class="primary">${L('Save', 'حفظ')}</button></span></div></form>`;
  document.body.appendChild(d); d.showModal(); d.addEventListener('close', () => d.remove());
  let color = h?.color || COLORS[all().length % COLORS.length];
  $$('.hd-col', d).forEach(b => b.onclick = () => { color = b.dataset.c; $$('.hd-col', d).forEach(x => x.classList.toggle('on', x === b)); });
  $('#hd-x', d).onclick = () => d.close();
  const del = $('#hd-del', d); if (del) del.onclick = () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = L('Tap again to delete', 'اضغط مرة أخرى للحذف'); return; } save(all().filter(x => x.id !== h.id)); d.close(); paint(); };
  $('form', d).onsubmit = e => {
    e.preventDefault(); const name = $('#hd-n', d).value.trim(); if (!name) return;
    if (!h) { d.close(); add({ name, target: $('#hd-t', d).value.trim(), reminder: $('#hd-r', d).value }); const l = all(); l.at(-1).color = color; save(l); paint(); return; }
    const l = all(), x = l.find(y => y.id === h.id); Object.assign(x, { name, target: $('#hd-t', d).value.trim(), reminder: $('#hd-r', d).value, color }); save(l); d.close(); paint();
  };
  setTimeout(() => $('#hd-n', d).focus(), 50);
}

/* ---------- the coach: quick tips right away (no AI), and a full study of you with the AI ---------- */
function coachLine(list) {
  if (!list.length) return '';
  const t = today(), wk = [...Array(7)].map((_, i) => addDays(t, i - 6)), y = addDays(t, -1);
  const missed3 = list.find(h => since(h) <= addDays(t, -3) && [1, 2, 3].every(n => !h.days?.[addDays(t, -n)]));
  if (missed3) return L(`“${esc(missed3.name)}” has slipped 3 days. Make it smaller today — even 2 minutes keeps the chain alive.`, `«${esc(missed3.name)}» فاتتك ٣ أيام. صغّرها اليوم — ولو دقيقتين تُبقي السلسلة حيّة.`);
  const best = list.map(h => ({ h, r: rate(h, wk) })).sort((a, b) => b.r - a.r)[0];
  const left = list.filter(h => !h.days?.[t] && since(h) <= t);
  const hour = new Date().getHours();
  if (left.length && hour >= 18) return L(`${left.length} left for today: ${left.slice(0, 3).map(h => esc(h.name)).join(', ')}. One now, before the day closes.`, `بقي ${left.length} لليوم: ${left.slice(0, 3).map(h => esc(h.name)).join('، ')}. واحدة الآن قبل أن ينتهي اليوم.`);
  if (best?.r >= .85) return L(`“${esc(best.h.name)}” is your strongest habit this week (${Math.round(best.r * 100)}%). Tie a weaker habit right after it.`, `«${esc(best.h.name)}» أقوى عاداتك هذا الأسبوع (${Math.round(best.r * 100)}٪). اربط بها عادة أضعف بعدها مباشرة.`);
  if (list.every(h => !h.days?.[y]) && since(list[0]) <= y) return L('Yesterday had no ticks. Start today with the easiest habit.', 'لم تُسجَّل عادة أمس. ابدأ اليوم بأسهل عادة.');
  return '';
}
// everything the coach should know, in short
async function profileText() {
  const t = today(), list = all(), d30 = [...Array(30)].map((_, i) => addDays(t, i - 29)), me = store.get('me', {});
  const dow = n => parse(n).toLocaleDateString('en-GB', { weekday: 'short' });
  const lines = [];
  lines.push(`Today: ${t}. Person: ${me.name || 'unknown name'}; ${me.use === 'work' ? 'works' : 'studies'}: ${me.study || 'not said'}; field: ${store.get('field', 'general')}; says hard for them: ${(me.hard || []).join(', ') || 'not said'}; working hours: ${me.hours?.from || '?'}–${me.hours?.to || '?'}.`);
  lines.push(`Their goals (in their words): ${store.get('coachGoals', '') || 'not written yet'}`);
  lines.push('\nHABITS (last 30 days; ✓ done, ✕ marked missed, · not ticked; oldest first):');
  for (const h of list) {
    const c = counted(h, d30), r = c.length ? Math.round(c.filter(d => h.days?.[d]).length / c.length * 100) : 0;
    const byDow = {}; for (const d of c) { const k = dow(d); byDow[k] ||= [0, 0]; byDow[k][1]++; if (h.days?.[d]) byDow[k][0]++; }
    const weak = Object.entries(byDow).filter(([, [a, b]]) => b && a / b < .4).map(([k]) => k);
    lines.push(`- ${h.name}${h.target ? ` (target ${h.target})` : ''}${h.reminder ? ` reminder ${h.reminder}` : ''}: ${r}% of ${c.length} days, streak ${streak(h)}, best ${bestStreak(h)}; weak days: ${weak.join(' ') || 'none'}; record ${c.map(d => h.days?.[d] ? '✓' : h.miss?.[d] ? '✕' : '·').join('')}`);
  }
  if (!list.length) lines.push('- (no habits yet)');
  const C = window.JundCal;
  if (C) {
    const ev = C.events(), late = ev.filter(e => !e.done && e.repeat !== 'weekly' && e.date && e.date < t && !['class', 'meeting'].includes(e.type));
    const done14 = ev.filter(e => e.done && e.date >= addDays(t, -14) && e.date <= t).length;
    const soon = ev.filter(e => !e.done && e.date >= t && e.date <= addDays(t, 21) && ['exam', 'homework', 'task'].includes(e.type)).sort((a, b) => a.date.localeCompare(b.date));
    const classes = ev.filter(e => e.repeat === 'weekly' && e.type === 'class').length;
    lines.push(`\nCALENDAR: ${classes} weekly classes; ${late.length} tasks late (${late.slice(0, 6).map(e => `${e.title} due ${e.date}`).join('; ')}); ${done14} items done in the last 14 days; coming in 3 weeks: ${soon.slice(0, 10).map(e => `${e.type} "${e.title}" ${e.date}`).join('; ') || 'nothing'}; tasks without a deadline: ${ev.filter(e => !e.date && !e.done).length}.`);
  }
  try { const ls = await J.allLessons(); const n = ls.filter(l => (l.date || '') >= addDays(t, -30)).length; lines.push(`NOTES: ${n} lessons/meetings written up in 30 days; subjects: ${[...new Set(ls.slice(0, 40).map(l => l.subject?.name).filter(Boolean))].slice(0, 8).join(', ')}.`); } catch {}
  const f = store.get('fitness', {}); if (f?.on && f.data?.length) {
    const st = f.data.filter(x => x.steps), sl = f.data.filter(x => x.sleepMin);
    lines.push(`FITNESS (7 days): steps avg ${st.length ? Math.round(st.reduce((a, x) => a + x.steps, 0) / st.length) : '?'}; sleep avg ${sl.length ? (sl.reduce((a, x) => a + x.sleepMin, 0) / sl.length / 60).toFixed(1) + ' h' : '?'}.`);
  }
  return lines.join('\n');
}
async function analyse(quiet = false) {
  const box = $('#hb-coach') || document.createElement('div'); const st = $('#hc-st', box);
  if (st) st.textContent = L('The coach is studying your record…', 'المدرّب يدرس سجلّك…');
  const btn = $('#hc-go', box); if (btn) btn.disabled = true;
  const sys = `You are a wise, honest personal coach inside the Mustatar app. Study the person's record and give a frank, kind, specific analysis. Never invent facts; base every point on the data (numbers, habits, dates). Write in ${AR() ? 'Arabic' : 'English'}. Be concise: each item one short sentence.
Return JSON only:
{"summary":"2 sentences: where they stand now",
 "score": 0-100 overall consistency,
 "swot":{"strengths":[2-4],"weaknesses":[2-4],"opportunities":[2-3],"threats":[2-3]},
 "gaps":[{"goal":"what they want","now":"where they are (with a number)","fix":"the one change that closes it"}] (2-4),
 "difficulties":["problems they will likely face soon, e.g. an exam week colliding with a weak habit"] (2-4),
 "missing":["what is missing from their system: a habit, a routine, rest, a plan…"] (2-4),
 "next":["3 concrete steps for this week, smallest first"],
 "habits":[{"name":"a habit to add","target":"short target","why":"one line"}] (0-3, only if truly missing)}`;
  try {
    const r = await J.callServer({ system: sys, user: await profileText(), json: true, maxTokens: 1800, assistant: true });
    const j = J.parseJSON(r.text);
    if (!j?.swot) throw new Error('bad');
    store.set('coach', { at: Date.now(), ...j, seen: !quiet }); paintCoach();
    if (quiet) window.JundFeatures?.renderHabits?.();
  } catch (e) {
    if (st) st.textContent = L('✗ The coach could not answer now. Check the internet and try again.', '✗ تعذّر على المدرّب الإجابة الآن. تأكد من الإنترنت وحاول مرة أخرى.');
    if (btn) btn.disabled = false;
  }
}
function paintCoach() {
  const box = $('#hb-coach'); if (!box) return;
  const c = store.get('coach', null), goals = store.get('coachGoals', '');
  const li = a => (a || []).map(x => `<li dir="auto">${esc(x)}</li>`).join('');
  const age = c ? Math.floor((Date.now() - c.at) / 864e5) : 0;
  if (c && !c.seen && !$('#screen-habits')?.hidden) store.set('coach', { ...c, seen: true });
  box.innerHTML = `<div class="card-h">🧭 ${L('Your coach', 'مدرّبك')}</div>
    <p class="muted fine">${L('It studies your habits, tasks, notes and (if connected) steps and sleep, then tells you plainly where you stand, what is missing and what to do next.', 'يدرس عاداتك ومهامك وملاحظاتك (وخطواتك ونومك إن ربطتها)، ثم يخبرك بصراحة أين تقف وما الذي ينقصك وماذا تفعل بعد ذلك.')}</p>
    <label class="field"><span>${L('Your goals (in your words)', 'أهدافك (بكلماتك)')}</span><textarea id="hc-goals" rows="2" dir="auto" placeholder="${L('e.g. finish the semester with top marks, memorise 5 juz this year, wake up for Fajr every day…', 'مثال: أنهي الفصل بتقدير ممتاز، أحفظ ٥ أجزاء هذه السنة، أستيقظ للفجر كل يوم…')}">${esc(goals)}</textarea></label>
    <div class="row-gap"><button type="button" class="primary" id="hc-go">${c ? L('Study me again', 'ادرسني من جديد') : L('Study me', 'ادرسني')}</button>${c ? `<small class="muted">${age ? L(`last study ${age} days ago`, `آخر دراسة قبل ${age} أيام`) : L('studied today', 'دُرست اليوم')}</small>` : ''}</div>
    <p class="muted fine" id="hc-st"></p>
    ${c ? `<div class="hc-out">
      <div class="hc-sum">${c.score != null ? `<span class="hc-score">${ring((Number(c.score) || 0) / 100, 'var(--accent)', 56)}<b>${Number(c.score) || 0}</b></span>` : ''}<p dir="auto">${esc(c.summary || '')}</p></div>
      <div class="hc-h">${L('SWOT — where you stand', 'تحليل SWOT — أين تقف')}</div>
      <div class="hc-swot">
        <div class="s"><b>💪 ${L('Strengths', 'نقاط القوة')}</b><ul>${li(c.swot.strengths)}</ul></div>
        <div class="w"><b>⚠️ ${L('Weaknesses', 'نقاط الضعف')}</b><ul>${li(c.swot.weaknesses)}</ul></div>
        <div class="o"><b>🌱 ${L('Opportunities', 'الفرص')}</b><ul>${li(c.swot.opportunities)}</ul></div>
        <div class="t"><b>⛈ ${L('Threats', 'التهديدات')}</b><ul>${li(c.swot.threats)}</ul></div>
      </div>
      ${(c.gaps || []).length ? `<div class="hc-h">${L('Gap analysis — your goal vs. today', 'تحليل الفجوة — هدفك مقابل واقعك')}</div>
        <div class="hc-gaps">${c.gaps.map(g => `<div class="hc-gap"><div><small>${L('Goal', 'الهدف')}</small><span dir="auto">${esc(g.goal)}</span></div><div><small>${L('Now', 'الآن')}</small><span dir="auto">${esc(g.now)}</span></div><div class="fix"><small>${L('Close the gap', 'لسدّ الفجوة')}</small><span dir="auto">${esc(g.fix)}</span></div></div>`).join('')}</div>` : ''}
      ${(c.difficulties || []).length ? `<div class="hc-h">${L('Difficulties ahead', 'صعوبات قادمة')}</div><ul class="hc-list">${li(c.difficulties)}</ul>` : ''}
      ${(c.missing || []).length ? `<div class="hc-h">${L('What you are missing', 'ما الذي ينقصك')}</div><ul class="hc-list">${li(c.missing)}</ul>` : ''}
      ${(c.next || []).length ? `<div class="hc-h">${L('Your next steps this week', 'خطواتك هذا الأسبوع')}</div><ol class="hc-list">${li(c.next)}</ol>
        <button type="button" class="ghost small" id="hc-tasks">${L('Add these steps to my tasks', 'أضف هذه الخطوات إلى مهامي')}</button>` : ''}
      ${(c.habits || []).length ? `<div class="hc-h">${L('Habits the coach suggests', 'عادات يقترحها المدرّب')}</div>${c.habits.map((h, i) => `<div class="hc-hab"><span dir="auto"><b>${esc(h.name)}</b>${h.target ? ` · ${esc(h.target)}` : ''}<small>${esc(h.why || '')}</small></span><button type="button" class="ghost small" data-sug="${i}">+ ${L('Add', 'أضف')}</button></div>`).join('')}` : ''}
    </div>` : ''}`;
  const g = $('#hc-goals', box); g.onchange = () => store.set('coachGoals', g.value.trim());
  $('#hc-go', box).onclick = () => { store.set('coachGoals', g.value.trim()); analyse(); };
  $$('[data-sug]', box).forEach(b => b.onclick = () => { const h = c.habits[Number(b.dataset.sug)]; add({ name: h.name, target: h.target }); });
  const tk = $('#hc-tasks', box); if (tk) tk.onclick = () => {
    for (const [i, step] of (c.next || []).entries()) window.JundCal?.add({ title: String(step).slice(0, 120), date: addDays(today(), i), type: 'task', notes: L('From your coach', 'من مدرّبك') });
    window.JundCal?.toast(L('✓ Added to Tasks, one a day', '✓ أُضيفت إلى المهام، واحدة كل يوم'), 4000, { label: L('See them', 'اعرضها'), fn: () => J.show('calendar') });
  };
}

/* ---------- on Today: today's habits as quick ticks ---------- */
function paintToday(box) {
  const list = all(), t = today();
  const wrap = $('#hm-habits-wrap'); if (wrap) wrap.hidden = !list.length;
  if (!list.length) { box.innerHTML = ''; return; }
  const done = list.filter(h => h.days?.[t]).length, nudge = coachLine(list), c = store.get('coach', null);
  // once a week the coach studies the record by itself (quietly, only with enough days ticked)
  const ticks = list.reduce((n, h) => n + Object.keys(h.days || {}).length, 0);
  if (navigator.onLine && ticks >= 10 && (!c || Date.now() - c.at > 7 * 864e5) && Date.now() - store.get('coachTry', 0) > 12 * 36e5 && !navigator.webdriver) { store.set('coachTry', Date.now()); analyse(true); }
  box.innerHTML = `<div class="hb-today"><div class="hb-th"><b>${L('Habits today', 'عادات اليوم')}</b><small>${done}/${list.length}</small><button type="button" class="link small" id="hb-open">${L('Tracker', 'المتابعة')} ›</button></div>
    <div class="hb-chips">${list.map((h, i) => `<button type="button" class="hb-chip ${h.days?.[t] ? 'on' : ''}" data-h="${esc(h.id)}" style="--c:${colorOf(h, i)}" dir="auto"><i>${h.days?.[t] ? '✓' : ''}</i>${esc(h.name)}</button>`).join('')}</div>
    ${nudge ? `<p class="hb-tnudge" dir="auto">💡 ${nudge}</p>` : ''}
    ${c && !c.seen ? `<button type="button" class="hb-tcoach" id="hb-tcoach">🧭 <span dir="auto"><b>${L('Your coach studied your week', 'مدرّبك درس أسبوعك')}</b><small>${esc(String(c.summary || '').slice(0, 140))}</small></span></button>` : ''}</div>`;
  $$('[data-h]', box).forEach(b => b.onclick = () => { const l = all(), h = l.find(x => x.id === b.dataset.h); h.days ||= {}; h.miss ||= {}; if (h.days[t]) delete h.days[t]; else { h.days[t] = true; delete h.miss[t]; } save(l); });
  $('#hb-open', box).onclick = () => J.show('habits');
  const tc = $('#hb-tcoach', box); if (tc) tc.onclick = () => { store.set('coach', { ...store.get('coach', {}), seen: true }); J.show('habits'); setTimeout(() => $('#hb-coach')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150); };
}

window.addEventListener('mustatar-screen', () => { if (!$('#screen-habits')?.hidden) paint(); });
window.JundHabits = { open: () => { screen(); J.show('habits'); }, paint, paintToday, add, analyse, profileText, all };
screen();
window.JundFeatures?.renderHabits?.();
})();
