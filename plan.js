/* Mustatar — plans and fair limits. Basic is free and costs the app nothing: it runs only on the free daily AI
   allowance (the server never pays for it), and these limits share that allowance fairly between people.
   Calendar, tasks, habits, prayer, reminders, focus and the workspace have no limits. Paid plans come later. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = window.ZadLang === 'ar';
const L = (en, ar) => AR ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
const num = n => AR ? Number(n).toLocaleString('ar-EG') : String(n);

// per day: minutes of recordings turned into notes, assistant messages; per month: files, YouTube videos, quiz sets
const LIMITS = { basic: { rec: 60, msg: 10, text: 30, yt: 2, quiz: 10 } };
const DAILY = new Set(['rec', 'msg']);
const NAMES = {
  rec: [L('Recordings into notes, today', 'تسجيلات إلى ملاحظات، اليوم'), L('min', 'د')],
  msg: [L('Assistant messages, today', 'رسائل المساعد، اليوم'), ''],
  text: [L('Files, PDFs and photos, this month', 'ملفات وPDF وصور، هذا الشهر'), ''],
  yt: [L('YouTube videos, this month', 'فيديوهات يوتيوب، هذا الشهر'), ''],
  quiz: [L('Quiz and card sets, this month', 'اختبارات وبطاقات، هذا الشهر'), ''],
};
const plan = () => store.get('ownerCode') ? 'owner' : store.get('plan', 'basic');
const day = () => new Date().toLocaleDateString('en-CA');
const month = () => day().slice(0, 7);
function use() {
  const u = store.get('planUse', {}) || {};
  if (u.day !== day()) { u.day = day(); u.rec = 0; u.msg = 0; }
  if (u.month !== month()) { u.month = month(); u.text = 0; u.yt = 0; u.quiz = 0; }
  return u;
}
const limitOf = k => LIMITS[plan()]?.[k] ?? Infinity;
const left = k => Math.max(0, limitOf(k) - (use()[k] || 0));
function add(k, n = 1) { const u = use(); u[k] = (u[k] || 0) + n; store.set('planUse', u); }

const WAIT = {
  rec: L('You have used today’s free hour of recordings into notes. Your recording is saved: try it again tomorrow, or see the plans in Me.', 'استخدمت ساعتك المجانية اليوم لتحويل التسجيلات إلى ملاحظات. تسجيلك محفوظ: أعد المحاولة غدًا، أو اطّلع على الخطط في «أنا».'),
  msg: L('That was today’s last free assistant message. It comes back tomorrow; your calendar, tasks and habits keep working.', 'كانت هذه آخر رسالة مجانية للمساعد اليوم. تعود غدًا، والتقويم والمهام والعادات تعمل كما هي.'),
  text: L('This month’s free files, PDFs and photos are used up. They come back on the 1st, or see the plans in Me.', 'انتهت ملفات هذا الشهر المجانية (ملفات وPDF وصور). تعود في أول الشهر، أو اطّلع على الخطط في «أنا».'),
  yt: L('This month’s free YouTube videos are used up. They come back on the 1st, or see the plans in Me.', 'انتهت فيديوهات يوتيوب المجانية لهذا الشهر. تعود في أول الشهر، أو اطّلع على الخطط في «أنا».'),
  quiz: L('This month’s free quiz and card sets are used up. They come back on the 1st.', 'انتهت الاختبارات والبطاقات المجانية لهذا الشهر. تعود في أول الشهر.'),
};
// throws like "the free AI is used up today", so every screen already knows what to do (keep the work, try later)
function check(k) {
  if (left(k) > 0) return true;
  window.JundReport?.event('limit:' + k);
  throw Object.assign(new Error(WAIT[k]), { code: 'quota', limit: k });
}

/* ---------- the plan card on Me ---------- */
function card(el) {
  if (!el) return;
  const p = plan(), u = use();
  const bar = k => {
    const lim = limitOf(k), used = u[k] || 0, pct = Math.min(100, Math.round(used / lim * 100));
    return `<div class="pl-row"><span class="pl-k">${NAMES[k][0]}</span><span class="pl-n">${num(used)} / ${num(lim)}${NAMES[k][1] ? ' ' + NAMES[k][1] : ''}</span>
      <span class="pl-bar"><i style="width:${pct}%"${pct >= 100 ? ' class="full"' : ''}></i></span></div>`;
  };
  el.innerHTML = p === 'owner'
    ? `<div class="pl-card"><div class="pl-top"><b>${L('Owner', 'المالك')}</b><span class="muted">${L('no limits on this phone', 'بلا حدود على هذا الهاتف')}</span></div></div>`
    : `<div class="pl-card"><div class="pl-top"><b>${L('Basic', 'الأساسية')}</b><span class="pl-free">${L('Free', 'مجانية')}</span><button type="button" class="link pl-see" id="pl-see">${L('See plans', 'الخطط')}</button></div>
      ${['rec', 'msg', 'text', 'yt', 'quiz'].map(bar).join('')}
      <p class="muted fine">${L('Calendar, tasks, habits, prayer, reminders and focus are unlimited. Daily limits reset at midnight, monthly ones on the 1st.', 'التقويم والمهام والعادات والصلاة والتذكيرات والتركيز بلا حدود. الحدود اليومية تتجدد منتصف الليل، والشهرية في أول الشهر.')}</p></div>`;
  const s = $('#pl-see', el); if (s) s.onclick = prices;
}

/* ---------- the plans page ---------- */
function prices() {
  let d = $('#pl-dialog');
  if (!d) { d = document.createElement('dialog'); d.id = 'pl-dialog'; d.setAttribute('data-noi18n', ''); document.body.appendChild(d); }
  d.dir = AR ? 'rtl' : 'ltr';
  const P = [
    [L('Basic', 'الأساسية'), L('Free', 'مجانًا'), [L('1 hour of recordings into notes a day', 'ساعة تسجيلات إلى ملاحظات يوميًا'), L('30 files, PDFs or photos a month', '٣٠ ملفًا أو PDF أو صورة شهريًا'), L('10 assistant messages a day', '١٠ رسائل للمساعد يوميًا'), L('Calendar, tasks, habits, prayer: unlimited', 'التقويم والمهام والعادات والصلاة: بلا حدود')], L('Your plan', 'خطتك')],
    [L('Plus', 'الميسّرة'), L('$3.99 a month', '٣٫٩٩$ شهريًا'), [L('30 hours a month, never waits', '٣٠ ساعة شهريًا، بلا انتظار'), L('60 files and 30 YouTube videos', '٦٠ ملفًا و٣٠ فيديو يوتيوب'), L('60 assistant messages a day', '٦٠ رسالة للمساعد يوميًا'), L('Studio without the mark', 'الاستوديو بلا علامة')], L('Coming soon', 'قريبًا')],
    [L('Elite', 'النخبة'), L('$14.99 a month', '١٤٫٩٩$ شهريًا'), [L('60 hours, 30 with the best hearing', '٦٠ ساعة، منها ٣٠ بأفضل سماع'), L('A full second check of every note', 'تدقيق ثانٍ كامل لكل ملاحظة'), L('The strongest AI for the assistant', 'أقوى ذكاء اصطناعي للمساعد')], L('Coming soon', 'قريبًا')],
    [L('Team and institutions', 'الفرق والمؤسسات'), L('From $9 a person', 'من ٩$ للشخص'), [L('Shared library, tasks to members, admin', 'مكتبة مشتركة، مهام للأعضاء، إدارة')], L('Contact us', 'تواصل معنا')],
  ];
  d.innerHTML = `<div class="row-between"><b class="card-h" style="margin:0">${L('Plans', 'الخطط')}</b><button type="button" class="icon-btn" id="pl-x" aria-label="${L('Close', 'إغلاق')}">✕</button></div>
    <div class="pl-list">${P.map((x, i) => `<div class="pl-plan${i === 0 ? ' on' : ''}"><div class="pl-ph"><b>${x[0]}</b><span>${x[1]}</span></div><ul>${x[2].map(t => `<li>${t}</li>`).join('')}</ul>
      ${i === 3 ? `<a class="ghost small pl-cta" href="mailto:mustatar.app@gmail.com?subject=Mustatar%20for%20teams">${x[3]}</a>` : `<span class="pl-cta muted">${x[3]}</span>`}</div>`).join('')}</div>
    <p class="muted fine">${L('Paid plans open soon. Until then, Basic stays free with these limits.', 'الخطط المدفوعة تُفتح قريبًا، وحتى ذلك الحين تبقى الأساسية مجانية بهذه الحدود.')}</p>`;
  $('#pl-x', d).onclick = () => d.close();
  d.showModal();
}

window.JundPlan = { check, add, left, plan, card, prices, LIMITS };
})();
