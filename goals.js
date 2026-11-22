/* Mustatar — Goals (الأهداف): what he wants to reach, why, by when, and how important — joined to his tasks and habits.
   Ideas taken from the productivity sheets he sent, only where they fit Mustatar:
   - Priorities: the Eisenhower matrix (important / urgent → do now, schedule, hand over, drop).
   - "Eat the frog": one most important step for today, shown first.
   - Flow: a goal works best when you care about it, are good at it, it is challenging, and it is long-term (a quick check).
   - Artificial deadlines and time blocks: the AI planner splits a goal into milestones with dates, dated tasks for the
     next two weeks, and daily habits — he picks what to add, and each task stays linked to its goal.
   - The Seinfeld streak lives in the habit tracker already; a goal shows the streaks of its own habits.
   Progress: a number target (e.g. 604 pages) or the share of its steps and linked tasks that are done. */
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
const today = () => iso(new Date());
const num = n => AR() ? String(n).replace(/\d/g, x => '٠١٢٣٤٥٦٧٨٩'[x]) : String(n);
const newId = () => 'G' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const AREAS = () => ({
  faith: L('Faith & Quran', 'الإيمان والقرآن'), knowledge: L('Knowledge & study', 'العلم والدراسة'), health: L('Health', 'الصحة'),
  family: L('Family', 'الأسرة'), work: L('Work & projects', 'العمل والمشاريع'), money: L('Money', 'المال'), self: L('Self', 'الذات'),
});
const AREA_IC = { faith: '📖', knowledge: '🎓', health: '💪', family: '🏠', work: '💼', money: '💰', self: '🌱' };
const QUAD = () => ({
  do: [L('Do it now', 'نفّذه الآن'), L('Important · urgent', 'مهم · عاجل')],
  plan: [L('Schedule it', 'جدوِله'), L('Important · not urgent', 'مهم · غير عاجل')],
  hand: [L('Hand it over', 'فوّضه'), L('Not important · urgent', 'غير مهم · عاجل')],
  drop: [L('Drop it', 'اتركه'), L('Not important · not urgent', 'غير مهم · غير عاجل')],
});
const quad = g => g.imp ? (g.urg ? 'do' : 'plan') : (g.urg ? 'hand' : 'drop');
const RANK = { do: 0, plan: 1, hand: 2, drop: 3 };

/* ---------- the goals ---------- */
const all = () => store.get('goals', []) || [];
function save(list) {
  store.set('goals', list);
  J.cloud?.putData?.('goals', { saved: Date.now(), goals: list }).catch?.(() => {});
  paint();
}
const tasksOf = g => (window.JundCal?.events?.() || []).filter(e => e.goal === g.id);
const habitsOf = g => (store.get('habits', []) || []).filter(h => (g.habitIds || []).includes(h.id));
function progress(g) {
  if (g.target > 0) return Math.max(0, Math.min(1, (Number(g.done) || 0) / g.target));
  const steps = g.steps || [], tasks = tasksOf(g).filter(e => e.repeat !== 'weekly');
  const n = steps.length + tasks.length; if (!n) return g.status === 'done' ? 1 : 0;
  return (steps.filter(s => s.done).length + tasks.filter(e => e.done).length) / n;
}
const daysLeft = g => g.due ? Math.round((new Date(g.due + 'T12:00') - new Date(today() + 'T12:00')) / 864e5) : null;
function streak(h) { let n = 0; const d = new Date(); if (!h.days?.[iso(d)]) d.setDate(d.getDate() - 1); while (h.days?.[iso(d)]) { n++; d.setDate(d.getDate() - 1); } return n; }

// the one most important thing for today ("eat the frog"): from the most important goal, its next step or today's linked task
function frog() {
  const act = all().filter(g => g.status !== 'done' && g.status !== 'paused').sort((a, b) => RANK[quad(a)] - RANK[quad(b)] || (a.due || '9999').localeCompare(b.due || '9999'));
  for (const g of act) {
    const t = tasksOf(g).find(e => !e.done && e.date <= today() && e.repeat !== 'weekly');
    if (t) return { g, text: t.title, task: t };
    const s = (g.steps || []).find(x => !x.done);
    if (s) return { g, text: s.t, step: s };
  }
  return null;
}

/* ---------- the screen ---------- */
let view = 'list', openId = null;
function screen() {
  let s = $('#screen-goals');
  if (!s) { s = document.createElement('section'); s.className = 'screen'; s.id = 'screen-goals'; s.hidden = true; s.setAttribute('data-noi18n', ''); ($('#screen-habits') || $('#screen-calendar')).after(s); }
  return s;
}
function paint() {
  const s = screen(); if (s.hidden) return;
  s.dir = AR() ? 'rtl' : 'ltr';
  const list = all().slice().sort((a, b) => (a.status === 'done') - (b.status === 'done') || RANK[quad(a)] - RANK[quad(b)] || (a.due || '9999').localeCompare(b.due || '9999'));
  const f = frog();
  s.innerHTML = `<div class="gl-top"><h2 class="screen-title" style="margin:0">${L('Goals', 'الأهداف')}</h2><button type="button" class="primary small" id="gl-new">＋ ${L('New goal', 'هدف جديد')}</button></div>
    ${f ? `<div class="gl-frog"><span class="gl-frog-ic">🐸</span><div><small>${L('Most important today', 'أهم شيء اليوم')}</small><b dir="auto">${esc(f.text)}</b><em dir="auto">${esc(f.g.title)}</em></div><button type="button" class="ghost small" id="gl-frog-do">${f.task ? '✓ ' + L('Done', 'تم') : L('Do it today', 'اجعله اليوم')}</button></div>` : ''}
    ${list.length ? `<div class="seg gl-seg"><button type="button" data-v="list" class="${view === 'list' ? 'on' : ''}">${L('Goals', 'الأهداف')}</button><button type="button" data-v="matrix" class="${view === 'matrix' ? 'on' : ''}">${L('Priorities', 'الأولويات')}</button></div>` : ''}
    <div id="gl-body">${!list.length ? empty() : view === 'matrix' ? matrix(list) : list.map(card).join('')}</div>`;
  $('#gl-new', s).onclick = () => editor();
  $$('.gl-seg [data-v]', s).forEach(b => b.onclick = () => { view = b.dataset.v; paint(); });
  const fd = $('#gl-frog-do', s);
  if (fd) fd.onclick = () => {
    if (f.task) { f.task.done = true; f.task.updated = Date.now(); window.JundCal.save(); }
    else window.JundCal?.add({ title: f.text, date: today(), type: 'task', goal: f.g.id });
    paint();
  };
  wire(s);
}
function empty() {
  return `<div class="gl-empty"><div class="gl-empty-ic">🎯</div><b>${L('What do you want to reach?', 'ما الذي تريد أن تصل إليه؟')}</b>
    <p class="muted">${L('A goal with a reason and a date. Mustatar splits it into steps, tasks on your calendar and daily habits, and shows the most important step each day.', 'هدف له سبب وموعد. يقسّمه مستطر إلى خطوات ومهام في تقويمك وعادات يومية، ويُظهر لك أهم خطوة كل يوم.')}</p>
    <div class="gl-ex">${[L('Memorise Surah Al-Baqarah by Ramadan', 'حفظ سورة البقرة قبل رمضان'), L('Finish my research by the end of the term', 'إنهاء بحثي قبل نهاية الفصل'), L('Read 12 books this year', 'قراءة ١٢ كتابًا هذه السنة')].map(x => `<button type="button" class="chip-b" data-ex dir="auto">${esc(x)}</button>`).join('')}</div></div>`;
}
function card(g) {
  const p = progress(g), dl = daysLeft(g), q = quad(g), open = openId === g.id, hs = habitsOf(g), ts = tasksOf(g);
  const due = g.due ? (dl < 0 ? L(`${-dl} days late`, `متأخر ${num(-dl)} يومًا`) : dl === 0 ? L('Due today', 'اليوم') : L(`${dl} days left`, `باقٍ ${num(dl)} يومًا`)) : '';
  return `<div class="gl-card ${g.status === 'done' ? 'done' : ''} ${open ? 'open' : ''}" data-g="${g.id}">
    <button type="button" class="gl-head" data-toggle>
      <span class="gl-area">${AREA_IC[g.area] || '🎯'}</span>
      <span class="gl-ttl"><b dir="auto">${esc(g.title)}</b><small>${[AREAS()[g.area], due, QUAD()[q][0]].filter(Boolean).join(' · ')}</small></span>
      <span class="gl-pct">${num(Math.round(p * 100))}٪</span>
    </button>
    <div class="gl-bar q-${q}"><i style="width:${Math.round(p * 100)}%"></i></div>
    ${open ? `<div class="gl-more">
      ${g.why ? `<p class="gl-why" dir="auto">💬 ${esc(g.why)}</p>` : ''}
      ${g.target > 0 ? `<div class="gl-num"><span>${L('Progress', 'التقدّم')}</span><button type="button" class="ghost small" data-dec>−</button><b>${num(g.done || 0)} / ${num(g.target)} ${esc(g.unit || '')}</b><button type="button" class="ghost small" data-inc>＋</button></div>` : ''}
      <div class="gl-sec"><b>${L('Steps', 'الخطوات')}</b>
        ${(g.steps || []).map(st => `<label class="gl-step ${st.done ? 'ok' : ''}"><input type="checkbox" data-step="${st.id}" ${st.done ? 'checked' : ''}><span dir="auto">${esc(st.t)}</span>${st.date ? `<small>${esc(st.date.slice(5))}</small>` : ''}<button type="button" class="link" data-rmstep="${st.id}" aria-label="${L('Remove', 'حذف')}">×</button></label>`).join('')}
        <form class="gl-add" data-addstep><input dir="auto" placeholder="${L('Add a step…', 'أضف خطوة…')}" maxlength="140"><button type="submit" class="ghost small">＋</button></form>
      </div>
      ${ts.length ? `<div class="gl-sec"><b>${L('Tasks on your calendar', 'مهام في تقويمك')}</b>${ts.slice(0, 12).map(e => `<div class="gl-task ${e.done ? 'ok' : ''}"><span>${e.done ? '✓' : '○'}</span><span dir="auto">${esc(e.title)}</span><small>${esc(e.date)}</small></div>`).join('')}</div>` : ''}
      ${hs.length ? `<div class="gl-sec"><b>${L('Daily habits', 'العادات اليومية')}</b>${hs.map(h => `<div class="gl-task"><span>◎</span><span dir="auto">${esc(h.name)}</span><small>🔥 ${num(streak(h))}</small></div>`).join('')}</div>` : ''}
      ${g.flow ? flowLine(g.flow) : ''}
      <div class="gl-acts">
        <button type="button" class="primary small" data-plan>✦ ${L('Plan it for me', 'خطّط لي')}</button>
        <button type="button" class="ghost small" data-edit>${L('Edit', 'تعديل')}</button>
        <button type="button" class="ghost small" data-donegoal>${g.status === 'done' ? L('Reopen', 'أعد فتحه') : '✓ ' + L('Reached', 'تحقّق')}</button>
        <button type="button" class="ghost small danger" data-del>${L('Delete', 'حذف')}</button>
      </div></div>` : ''}
  </div>`;
}
function flowLine(f) {
  const n = ['care', 'good', 'hard', 'long'].filter(k => f[k]).length;
  const miss = { care: L('you care about it', 'يهمّك'), good: L('you are good at it', 'تُحسنه'), hard: L('it is challenging', 'فيه تحدٍّ'), long: L('it is long-term', 'بعيد المدى') };
  const lack = Object.keys(miss).filter(k => !f[k]).map(k => miss[k]);
  return `<p class="gl-flow">${n === 4 ? '✨ ' + L('In your flow zone: all four are there.', 'في منطقة التدفّق: الأربعة كلها موجودة.') : `◐ ${L('Flow', 'التدفّق')} ${num(n)}/٤ — ${L('missing', 'ينقصه')}: ${lack.join('، ')}`}</p>`;
}
function matrix(list) {
  const act = list.filter(g => g.status !== 'done');
  return `<div class="gl-mx">${Object.entries(QUAD()).map(([k, [t, sub]]) => `<div class="gl-q q-${k}"><b>${t}</b><small>${sub}</small>
    ${act.filter(g => quad(g) === k).map(g => `<button type="button" class="gl-qi" data-goto="${g.id}" dir="auto">${AREA_IC[g.area] || '🎯'} ${esc(g.title)}</button>`).join('') || `<em class="muted">—</em>`}</div>`).join('')}</div>
    <p class="muted fine">${L('Do the top-left first. Put the top-right on your calendar. Hand over or shorten the bottom-left. Let the bottom-right go.', 'ابدأ بأعلى اليمين. ضع ما بجانبه في تقويمك. فوّض ما تحته أو اختصره. واترك الأخير.')}</p>`;
}
function wire(s) {
  $$('[data-ex]', s).forEach(b => b.onclick = () => editor({ title: b.textContent }));
  $$('[data-goto]', s).forEach(b => b.onclick = () => { view = 'list'; openId = b.dataset.goto; paint(); });
  $$('.gl-card', s).forEach(c => {
    const id = c.dataset.g, get = () => { const l = all(); return [l, l.find(x => x.id === id)]; };
    $('[data-toggle]', c).onclick = () => { openId = openId === id ? null : id; paint(); };
    const on = (sel, fn) => { const b = $(sel, c); if (b) b.onclick = fn; };
    on('[data-inc]', () => { const [l, g] = get(); g.done = Math.min(g.target, (Number(g.done) || 0) + 1); save(l); });
    on('[data-dec]', () => { const [l, g] = get(); g.done = Math.max(0, (Number(g.done) || 0) - 1); save(l); });
    on('[data-edit]', () => editor(get()[1]));
    on('[data-plan]', () => plan(get()[1]));
    on('[data-donegoal]', () => { const [l, g] = get(); g.status = g.status === 'done' ? 'active' : 'done'; if (g.status === 'done') { g.reached = today(); navigator.vibrate?.([30, 60, 30]); window.JundCal?.toast(L('🎉 Goal reached. Well done!', '🎉 تحقّق الهدف. أحسنت، بارك الله فيك!'), 4000); } save(l); });
    on('[data-del]', async () => {
      const ok = window.JundConfirm ? await window.JundConfirm(L('Delete this goal? Its tasks and habits stay.', 'حذف هذا الهدف؟ تبقى مهامه وعاداته.'), { yes: L('Delete', 'حذف'), danger: true }) : true;
      if (ok) save(all().filter(x => x.id !== id));
    });
    $$('[data-step]', c).forEach(x => x.onchange = () => { const [l, g] = get(); const st = g.steps.find(y => y.id === x.dataset.step); st.done = x.checked; save(l); });
    $$('[data-rmstep]', c).forEach(x => x.onclick = e => { e.preventDefault(); const [l, g] = get(); g.steps = g.steps.filter(y => y.id !== x.dataset.rmstep); save(l); });
    const f = $('[data-addstep]', c);
    if (f) f.onsubmit = e => { e.preventDefault(); const v = f.querySelector('input').value.trim(); if (!v) return; const [l, g] = get(); (g.steps ||= []).push({ id: newId(), t: v.slice(0, 140) }); save(l); };
  });
}

/* ---------- new goal / edit ---------- */
function editor(g0 = {}) {
  const isNew = !g0.id, g = { area: 'self', imp: true, urg: false, flow: {}, ...g0 };
  const d = document.createElement('dialog'); d.className = 'cf-dlg gl-dlg'; d.dir = AR() ? 'rtl' : 'ltr'; d.setAttribute('data-noi18n', '');
  const tg = (id, on, label) => `<label class="gl-tg"><span>${label}</span><span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></span></label>`;
  d.innerHTML = `<b class="cf-t">${isNew ? L('New goal', 'هدف جديد') : L('Edit goal', 'تعديل الهدف')}</b>
    <label class="field"><span>${L('The goal', 'الهدف')}</span><input id="gd-t" dir="auto" maxlength="140" value="${esc(g.title || '')}" placeholder="${L('e.g. Memorise Surah Al-Baqarah', 'مثل: حفظ سورة البقرة')}"></label>
    <label class="field"><span>${L('Why it matters to you', 'لماذا يهمّك؟')}</span><textarea id="gd-why" dir="auto" rows="2" maxlength="400">${esc(g.why || '')}</textarea></label>
    <div class="gl-row2"><label class="field"><span>${L('Area', 'المجال')}</span><select id="gd-area">${Object.entries(AREAS()).map(([k, v]) => `<option value="${k}" ${k === g.area ? 'selected' : ''}>${AREA_IC[k]} ${v}</option>`).join('')}</select></label>
      <label class="field"><span>${L('By when', 'الموعد')}</span><input type="date" id="gd-due" value="${esc(g.due || '')}"><small class="muted" id="gd-h"></small></label></div>
    <div class="gl-row2"><label class="field"><span>${L('Measure (optional)', 'المقياس (اختياري)')}</span><input type="number" id="gd-n" min="0" inputmode="numeric" value="${g.target || ''}" placeholder="604"></label>
      <label class="field"><span>${L('Unit', 'الوحدة')}</span><input id="gd-u" dir="auto" maxlength="20" value="${esc(g.unit || '')}" placeholder="${L('pages', 'صفحة')}"></label></div>
    <div class="gl-tgs">${tg('gd-imp', g.imp, L('Important', 'مهم'))}${tg('gd-urg', g.urg, L('Urgent', 'عاجل'))}</div>
    <details class="gl-flowd" ${isNew ? '' : 'open'}><summary>${L('Flow check (optional)', 'فحص التدفّق (اختياري)')}</summary>
      <p class="muted fine">${L('Goals stick best when all four are true.', 'يثبت الهدف أكثر حين تجتمع الأربعة.')}</p>
      <div class="gl-tgs">${tg('gd-care', g.flow?.care, L('I care about it', 'يهمّني'))}${tg('gd-good', g.flow?.good, L('I am good at it', 'أُحسنه'))}${tg('gd-hard', g.flow?.hard, L('It is challenging', 'فيه تحدٍّ'))}${tg('gd-long', g.flow?.long, L('It is long-term', 'بعيد المدى'))}</div></details>
    <div class="cf-b"><button type="button" class="ghost" id="gd-x">${L('Cancel', 'إلغاء')}</button><button type="button" class="primary" id="gd-s">${isNew ? L('Add and plan it', 'أضف وخطّط') : L('Save', 'احفظ')}</button></div>`;
  document.body.appendChild(d); d.showModal(); d.addEventListener('close', () => d.remove());
  const hShow = () => { const v = $('#gd-due', d).value; $('#gd-h', d).textContent = v ? (window.JundFeatures?.hijri?.(new Date(v + 'T12:00')) || '') : ''; };
  $('#gd-due', d).oninput = hShow; hShow();
  $('#gd-x', d).onclick = () => d.close();
  $('#gd-s', d).onclick = () => {
    const title = $('#gd-t', d).value.trim(); if (!title) { $('#gd-t', d).focus(); return; }
    const l = all(), x = isNew ? { id: newId(), created: today(), status: 'active', steps: [], habitIds: [] } : l.find(y => y.id === g.id);
    Object.assign(x, { title, why: $('#gd-why', d).value.trim(), area: $('#gd-area', d).value, due: $('#gd-due', d).value,
      target: Number($('#gd-n', d).value) || 0, unit: $('#gd-u', d).value.trim(), imp: $('#gd-imp', d).checked, urg: $('#gd-urg', d).checked,
      flow: { care: $('#gd-care', d).checked, good: $('#gd-good', d).checked, hard: $('#gd-hard', d).checked, long: $('#gd-long', d).checked } });
    if (isNew) l.push(x);
    openId = x.id; save(l); d.close();
    if (isNew) plan(x);
  };
}

/* ---------- the AI planner: milestones, tasks for the next two weeks, daily habits — he picks what to add ---------- */
async function plan(g) {
  const d = document.createElement('dialog'); d.className = 'cf-dlg gl-dlg'; d.dir = AR() ? 'rtl' : 'ltr'; d.setAttribute('data-noi18n', '');
  d.innerHTML = `<b class="cf-t">✦ ${L('Planning', 'أخطّط')}: <span dir="auto">${esc(g.title)}</span></b><p class="muted" id="gp-st">${L('Thinking about the steps…', 'أفكّر في الخطوات…')}</p><div id="gp-body"></div>
    <div class="cf-b"><button type="button" class="ghost" id="gp-x">${L('Close', 'إغلاق')}</button><button type="button" class="primary" id="gp-add" hidden>${L('Add what I ticked', 'أضف ما اخترته')}</button></div>`;
  document.body.appendChild(d); d.showModal(); d.addEventListener('close', () => d.remove());
  $('#gp-x', d).onclick = () => d.close();
  const pt = window.JundFeatures?.timesFor?.(today());
  const busy = (window.JundCal?.events?.() || []).filter(e => e.repeat === 'weekly').map(e => `${e.title} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(e.date + 'T12:00').getDay()]} ${e.time || ''})`).slice(0, 20).join('; ');
  let out;
  try {
    const r = await J.callServer({ assistant: true, json: true, maxTokens: 3000,
      system: `You are a practical planning coach inside Mustatar for a Muslim student. Turn ONE goal into a realistic plan. Reply in ${AR() ? 'Arabic' : 'English'} with JSON only:
{"milestones":[{"t":"short milestone","date":"YYYY-MM-DD"}],"tasks":[{"t":"a concrete task with the exact amount","date":"YYYY-MM-DD","time":"HH:MM or empty"}],"habits":[{"t":"a small daily habit","time":"HH:MM or empty"}],"first":"the smallest first step he can do today in under 15 minutes","note":"one or two sentences of advice"}
Rules: 3–6 milestones spread up to the deadline (or 3 months if none). Tasks only for the next 14 days, at most 10, each with real numbers (pages, verses, chapters, minutes), placed around his weekly lessons and prayer times; prefer mornings after Fajr for memorisation. 0–2 habits. Use real sizes you know (a Quran page ≈ 15 lines; Surah Al-Baqarah 286 verses ≈ 48 pages). Set artificial deadlines a little before the real one.`,
      user: `Today: ${today()} (Hijri ${window.JundFeatures?.hijri?.() || ''}).\nGoal: ${g.title}\nWhy: ${g.why || '-'}\nDeadline: ${g.due || 'none'}\nMeasure: ${g.target ? g.target + ' ' + (g.unit || '') + ' (done so far ' + (g.done || 0) + ')' : '-'}\nArea: ${g.area}\nPriority: ${g.imp ? 'important' : 'not important'}, ${g.urg ? 'urgent' : 'not urgent'}\nHis weekly lessons: ${busy || 'none'}\nPrayer times today: ${pt ? Object.entries(pt).map(([k, v]) => k + ' ' + v).join(', ') : 'unknown'}\nSteps he already has: ${(g.steps || []).map(s => s.t).join('; ') || 'none'}` });
    out = JSON.parse(r.text);
  } catch (e) { $('#gp-st', d).textContent = '✗ ' + (J.errText?.(e) || e.message); return; }
  const ok = s => /^\d{4}-\d\d-\d\d$/.test(s || '');
  const ms = (out.milestones || []).filter(x => x?.t).slice(0, 6), ts = (out.tasks || []).filter(x => x?.t && ok(x.date)).slice(0, 10), hs = (out.habits || []).filter(x => x?.t).slice(0, 2);
  $('#gp-st', d).textContent = out.note || '';
  const item = (k, i, t, sub) => `<label class="gl-pick"><input type="checkbox" data-k="${k}" data-i="${i}" checked><span dir="auto">${esc(t)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</label>`;
  $('#gp-body', d).innerHTML = `${out.first ? `<div class="gl-first">🐸 <b>${L('Start today', 'ابدأ اليوم')}:</b> <span dir="auto">${esc(out.first)}</span></div>` : ''}
    ${ms.length ? `<div class="gl-sec"><b>${L('Milestones (steps of the goal)', 'المراحل (خطوات الهدف)')}</b>${ms.map((x, i) => item('m', i, x.t, ok(x.date) ? x.date : '')).join('')}</div>` : ''}
    ${ts.length ? `<div class="gl-sec"><b>${L('Tasks for the next two weeks (to your calendar)', 'مهام الأسبوعين القادمين (إلى تقويمك)')}</b>${ts.map((x, i) => item('t', i, x.t, x.date + (x.time ? ' ' + x.time : ''))).join('')}</div>` : ''}
    ${hs.length ? `<div class="gl-sec"><b>${L('Daily habits (to your habit tracker)', 'عادات يومية (إلى متابعة العادات)')}</b>${hs.map((x, i) => item('h', i, x.t, x.time || '')).join('')}</div>` : ''}`;
  const add = $('#gp-add', d); add.hidden = false;
  add.onclick = () => {
    const pick = k => $$(`[data-k="${k}"]:checked`, d).map(x => Number(x.dataset.i));
    const l = all(), x = l.find(y => y.id === g.id); if (!x) return d.close();
    x.steps ||= []; x.habitIds ||= [];
    if (out.first) x.steps.unshift({ id: newId(), t: out.first, date: today() });
    for (const i of pick('m')) x.steps.push({ id: newId(), t: ms[i].t, date: ok(ms[i].date) ? ms[i].date : '' });
    for (const i of pick('t')) window.JundCal?.add({ title: ts[i].t, date: ts[i].date, time: /^\d\d:\d\d$/.test(ts[i].time || '') ? ts[i].time : '', type: 'task', remind: /^\d\d:\d\d$/.test(ts[i].time || '') ? 10 : -1, goal: x.id });
    for (const i of pick('h')) {
      window.JundFeatures?.createHabit?.(hs[i].t, hs[i].time || '');
      const h = (store.get('habits', []) || []).find(y => y.name === String(hs[i].t).trim().slice(0, 120)); if (h && !x.habitIds.includes(h.id)) x.habitIds.push(h.id);
    }
    save(l); d.close();
    window.JundCal?.toast(L('✓ Added to your goal, calendar and habits', '✓ أُضيف إلى هدفك وتقويمك وعاداتك'), 3500);
  };
}

/* ---------- for the assistant ---------- */
function brief() {
  return all().filter(g => g.status !== 'done').map(g => `- id ${g.id} | ${g.title} | due ${g.due || 'none'} | ${quad(g)} | ${Math.round(progress(g) * 100)}%${g.target ? ` (${g.done || 0}/${g.target} ${g.unit || ''})` : ''}`).join('\n');
}
function addFromAssistant(a) {
  const title = String(a.title || '').trim().slice(0, 140); if (!title) return null;
  const l = all(); if (l.some(g => g.title === title && g.status !== 'done')) return null;
  const g = { id: newId(), created: today(), status: 'active', steps: [], habitIds: [], title, why: String(a.why || '').slice(0, 400), area: AREAS()[a.area] ? a.area : 'self',
    due: /^\d{4}-\d\d-\d\d$/.test(a.due || a.date || '') ? (a.due || a.date) : '', imp: a.imp !== false, urg: !!a.urg, target: Number(a.target) || 0, unit: String(a.unit || '').slice(0, 20), flow: {} };
  l.push(g); store.set('goals', l); J.cloud?.putData?.('goals', { saved: Date.now(), goals: l }).catch?.(() => {});
  return g;
}

setTimeout(screen, 0);
window.addEventListener('mustatar-screen', () => { if (!screen().hidden) paint(); });
J.cloud?.getData?.('goals').then(r => { if (r?.goals && (r.saved || 0) > (store.get('goalsSaved', 0) || 0) && !all().length) store.set('goals', r.goals); }).catch?.(() => {});
window.JundGoals = { open: () => { screen(); J.show('goals'); paint(); }, all, brief, addFromAssistant, progress, frog, paint };
})();
