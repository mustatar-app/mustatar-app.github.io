/* A short brief before each lesson or meeting (Junaid's idea).
   An hour (or two) before a class, meeting or exam in the calendar, a notification comes with:
   - for a lesson or exam: a quick review of the last lesson on that subject — the key points, words to remember,
     and two quick questions (not the full notes);
   - for a meeting: what was decided last time, what is still left to do, and what to bring.
   The brief is made in advance (when the app is open), so the notification can ring with the app closed.
   On Today, the brief shows as a card from the time it rings until half an hour after the start. */
(() => {
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = () => window.ZadLang === 'ar';
const t = (en, ar) => AR() ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
const lead = () => Number(store.get('briefLead', 60));          // minutes before; 0 = off
const KINDS = ['class', 'meeting', 'exam', 'study'];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// the classes, meetings and exams with a time in the next 36 hours
function upcoming() {
  const out = [], now = Date.now();
  for (const e of window.JundCal?.events?.() || []) {
    if (!e.time || !/^\d\d:\d\d$/.test(e.time)) continue;
    const kind = KINDS.includes(e.type) ? e.type : /lesson|class|lecture|meeting|درس|محاضرة|اجتماع|حلقة/i.test(e.title || '') ? (/meeting|اجتماع/i.test(e.title) ? 'meeting' : 'class') : '';
    if (!kind) continue;
    for (let i = 0; i <= 2; i++) {
      const d = new Date(); d.setDate(d.getDate() + i); const day = iso(d);
      const occurs = e.repeat === 'weekly' ? day >= e.date && new Date(day + 'T12:00').getDay() === new Date(e.date + 'T12:00').getDay() && !(e.skip || []).includes(day) : e.date === day;
      if (!occurs) continue;
      const start = new Date(`${day}T${e.time}`).getTime();
      if (start < now - 30 * 60e3 || start > now + 36 * 3600e3) continue;
      out.push({ e, day, start, kind, key: `${e.id}|${day}` });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// words that say what something is about (both languages; short and common words dropped)
const STOP = new Set('the and for with from this that lesson class meeting lecture session weekly team about درس حلقة محاضرة اجتماع مع في من على عن إلى الى'.split(' '));
const norm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[\u064b-\u0652ـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const words = s => new Set(norm(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/^(ال|وال|بال)/, '')));
// the last lesson (or meeting minutes) that matches this calendar item
async function lastLesson(x) {
  const want = words(`${x.e.title} ${x.e.project || ''} ${x.e.notes || ''}`);
  if (!want.size) return null;
  const all = (await J.allLessons().catch(() => [])).filter(l => !l.draft && (l.date || '').slice(0, 10) <= x.day);
  let best = null, bestScore = 0;
  for (const l of all) {
    const have = words(`${l.subject?.name || ''} ${l.unit || ''} ${l.notes?.title || ''}`);
    let s = 0; for (const w of want) if (have.has(w)) s++;
    if (x.kind === 'meeting' && l.kind === 'meeting') s += 0.5;
    if (s > bestScore || (s === bestScore && s > 0 && (l.date || '') > (best?.date || ''))) { best = l; bestScore = s; }
  }
  return bestScore >= 1 ? best : null;
}
// what is still left: tasks from that lesson, or from the same project, not done
function leftTasks(x, l) {
  const today = iso(new Date());
  return (window.JundCal?.events?.() || []).filter(e => e.id !== x.e.id && !e.done && e.repeat !== 'weekly' && !['class', 'meeting'].includes(e.type)
    && ((l && e.src === l.id) || (x.e.project && e.project === x.e.project)) && e.date <= addDay(x.day, 7)).slice(0, 6)
    .map(e => ({ id: e.id, title: e.title, late: e.date < today }));
}
const addDay = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return iso(x); };
// the lesson's notes as short text for the AI (headings and points, not everything)
function digest(l) {
  const out = [];
  for (const s of l.notes?.sections || []) {
    out.push('## ' + (s.heading || ''));
    for (const b of s.blocks || []) {
      if (b.items) out.push(...b.items.slice(0, 8).map(i => '- ' + String(i).slice(0, 220)));
      else if (b.text) out.push(String(b.text).slice(0, 400));
      else if (b.rows) out.push(...b.rows.slice(0, 6).map(r => r.join(' | ')));
    }
  }
  return out.join('\n').slice(0, 7000);
}
// a brief without the AI: the first point of each part (used offline or if the AI is busy)
function plainBrief(l) {
  const pts = [];
  for (const s of l.notes?.sections || []) {
    const b = (s.blocks || []).find(b => b.items?.length || b.text);
    const p = b?.items?.[0] || b?.text || '';
    if (s.heading || p) pts.push((s.heading ? s.heading + ': ' : '') + String(p).replace(/\*\*/g, '').slice(0, 140));
    if (pts.length >= 5) break;
  }
  return { points: pts, remember: [], ask: [] };
}

async function make(x) {
  const briefs = store.get('briefs', {});
  if (briefs[x.key]?.made && Date.now() - briefs[x.key].made < 12 * 3600e3) return briefs[x.key];
  const l = await lastLesson(x), tasks = leftTasks(x, l);
  let body = null;
  if (l) {
    const ar = (l.lang || J.langOf(digest(l))) !== 'en';
    const sys = x.kind === 'meeting'
      ? `From the minutes of the last meeting, write a brief to read one hour before the next meeting. Return JSON only: {"points": ["what was decided (max 4, very short)"], "open": ["what is still open or was promised (max 4)"], "bring": ["what to prepare or bring (max 3)"]}. ${ar ? 'Write in Arabic.' : 'Write in English.'} Use only the minutes.`
      : `From the notes of the last lesson, write a QUICK review to read one hour before the next lesson (not a full summary). Return JSON only: {"points": ["the key points, max 5, each under 18 words, with the evidence or example word if there is one"], "remember": ["2-3 terms, rules or names to remember, each with a few words of meaning"], "ask": ["2 quick self-check questions"]}. ${ar ? 'Write in Arabic.' : 'Write in English.'} Use only the notes.`;
    try {
      const r = await J.callServer({ system: sys, user: digest(l), json: true, maxTokens: 700, assistant: true });
      body = J.parseJSON(r.text);
    } catch {}
    if (!body || !Array.isArray(body.points)) body = plainBrief(l);
  }
  const b = { key: x.key, eventId: x.e.id, title: x.e.title, day: x.day, time: x.e.time, start: x.start, kind: x.kind, lessonId: l?.id || '', lessonTitle: l ? (l.unit || l.notes?.title || '') : '',
    lessonDate: l ? (l.date || '').slice(0, 10) : '', points: body?.points || [], remember: body?.remember || [], ask: body?.ask || [], open: body?.open || [], bring: body?.bring || [], tasks, made: Date.now() };
  const all = store.get('briefs', {});
  for (const k of Object.keys(all)) if (all[k].start < Date.now() - 2 * 864e5) delete all[k];   // keep only recent ones
  all[x.key] = b; store.set('briefs', all);
  return b;
}
let busy = false;
async function prepare() {
  if (busy || !lead() || !navigator.onLine) return;
  busy = true;
  try {
    for (const x of upcoming()) await make(x).catch(() => {});
    window.JundCal?.pushSync?.();   // the new notifications go to the phone's alarms
  } finally { busy = false; paint(); }
}
const nice = b => new Date(b.start).toLocaleTimeString(AR() ? 'ar-SA' : 'en-GB', { hour: 'numeric', minute: '2-digit' });
// the notifications (for the phone's alarms and the server's wake-ups)
function alarms() {
  const m = lead(); if (!m) return [];
  const all = store.get('briefs', {}), now = Date.now();
  return Object.values(all).filter(b => b.start - m * 60e3 > now - 60e3 && (b.points.length || b.tasks.length || b.open.length))
    .map(b => ({ id: 'brief-' + b.key, kind: 'brief', at: b.start - m * 60e3,
      title: (b.kind === 'meeting' ? t('Before your meeting: ', 'قبل اجتماعك: ') : b.kind === 'exam' ? t('Before your exam: ', 'قبل اختبارك: ') : t('Before your lesson: ', 'قبل درسك: ')) + b.title + ' · ' + nice(b),
      body: [b.tasks.length ? t(`${b.tasks.length} left to do`, `${b.tasks.length} لم تُنجز`) : '', (b.points[0] || b.open[0] || '')].filter(Boolean).join(' · ').slice(0, 180) }));
}
// the card on Today: from the time it rings until half an hour after the start
function current() {
  const m = lead() || 60, now = Date.now();
  return Object.values(store.get('briefs', {})).filter(b => now >= b.start - m * 60e3 && now <= b.start + 30 * 60e3 && !b.closed && (b.points.length || b.tasks.length || b.open.length)).sort((a, b) => a.start - b.start)[0] || null;
}
function paint() {
  const home = $('#screen-assistant'); if (!home) return;
  let card = $('#hm-brief-card');
  const b = current();
  if (!b) { if (card) card.hidden = true; return; }
  if (!card) { card = document.createElement('div'); card.id = 'hm-brief-card'; card.className = 'brief-card'; ($('#screen-assistant .hm-sec') || $('#screen-assistant .home-head'))?.before(card); }
  card.hidden = false; card.dir = 'auto';
  const list = (head, arr) => arr?.length ? `<div class="bf-h">${head}</div><ul>${arr.map(x => `<li dir="auto">${esc(x)}</li>`).join('')}</ul>` : '';
  card.innerHTML = `<div class="bf-top"><span class="bf-ic">${b.kind === 'meeting' ? '👥' : b.kind === 'exam' ? '📝' : '📖'}</span><div class="bf-t"><b dir="auto">${esc(b.title)}</b><small>${nice(b)}${b.lessonTitle ? ' · ' + t('from', 'من') + ' «' + esc(b.lessonTitle) + '»' : ''}</small></div><button type="button" class="icon-btn small" id="bf-x" aria-label="${t('Close', 'إغلاق')}">✕</button></div>
    ${b.kind === 'meeting' ? list(t('Decided last time', 'قُرّر في المرة الماضية'), b.points) + list(t('Still open', 'ما زال مفتوحًا'), b.open) + list(t('Bring', 'أحضر معك'), b.bring)
      : list(t('Quick review', 'مراجعة سريعة'), b.points) + list(t('Remember', 'تذكّر'), b.remember) + list(t('Ask yourself', 'اسأل نفسك'), b.ask)}
    ${b.tasks.length ? `<div class="bf-h">${t('Left to do', 'لم يُنجز بعد')}</div>${b.tasks.map(x => `<label class="bf-task"><input type="checkbox" data-done="${esc(x.id)}"><span dir="auto">${esc(x.title)}${x.late ? ` <small class="bf-late">${t('late', 'متأخر')}</small>` : ''}</span></label>`).join('')}` : ''}
    ${!b.lessonId ? `<p class="muted bf-none">${t('No earlier notes for this yet. Record it today, and next time you get a review.', 'لا ملاحظات سابقة لهذا بعد. سجّله اليوم، وفي المرة القادمة تصلك مراجعة.')}</p>` : `<button type="button" class="link small" id="bf-open">${t('Open the last notes', 'افتح الملاحظات السابقة')}</button>`}`;
  $('#bf-x', card).onclick = () => { const all = store.get('briefs', {}); if (all[b.key]) { all[b.key].closed = true; store.set('briefs', all); } card.hidden = true; };
  const o = $('#bf-open', card); if (o) o.onclick = async () => { const l = (await J.allLessons()).find(x => x.id === b.lessonId); if (l) J.openLesson(l); };
  card.querySelectorAll('[data-done]').forEach(c => c.onchange = () => { const e = (window.JundCal?.events?.() || []).find(x => x.id === c.dataset.done); if (e) { e.done = c.checked; e.updated = Date.now(); window.JundCal.save(); } });
}

setTimeout(prepare, 5000);
setInterval(() => { prepare(); paint(); }, 15 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { paint(); prepare(); } });
window.addEventListener('mustatar-screen', paint);
window.JundBrief = { prepare, alarms, make, upcoming, current, paint, lastLesson };
})();
