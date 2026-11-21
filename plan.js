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

// per day: minutes of recordings turned into notes; per month: files, YouTube videos, quiz sets.
// Chatting with the assistant has no limit: it runs on free AI, and if that is busy for a moment the app says so.
const LIMITS = { basic: { rec: 60, text: 30, yt: 2, quiz: 10 } };
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

/* ---------- the plan on Me: one short line (like Claude's settings); tap it for usage and the plans ---------- */
const KEYS = ['rec', 'text', 'yt', 'quiz'];
const pctOf = (k, u = use()) => Math.min(100, Math.round((u[k] || 0) / limitOf(k) * 100));
function resetIn(k) {
  const now = new Date();
  if (DAILY.has(k)) {
    const m = Math.max(1, Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 6e4)), h = Math.floor(m / 60), mm = m % 60;
    return L(`Resets in ${h ? h + ' hr ' : ''}${mm} min`, `يتجدد بعد ${h ? num(h) + ' س ' : ''}${num(mm)} د`);
  }
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return L(`Resets ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, `يتجدد ${d.toLocaleDateString('ar-SA-u-ca-gregory-nu-arab', { day: 'numeric', month: 'long' })}`);
}
function card(el) {
  if (!el) return;
  const p = plan(), u = use();
  if (p === 'owner') { el.innerHTML = `<button type="button" class="pl-line" id="pl-open"><span class="pl-name"><b>${L('Owner', 'المالك')}</b><small>${L('No limits on this phone', 'بلا حدود على هذا الهاتف')}</small></span><span class="mx-chev">${AR ? '‹' : '›'}</span></button>`; $('#pl-open', el).onclick = usage; return; }
  const top = KEYS.map(k => [k, pctOf(k, u)]).sort((a, b) => b[1] - a[1])[0];
  const full = KEYS.filter(k => pctOf(k, u) >= 100);
  el.innerHTML = `<button type="button" class="pl-line" id="pl-open">
      <span class="pl-name"><b>${L('Basic plan', 'الخطة الأساسية')} <span class="pl-free">${L('Free', 'مجانية')}</span></b>
        <small>${full.length ? L('A limit is reached — tap to see when it comes back', 'وصلت أحد الحدود — اضغط لترى متى يعود') : L(`Usage: ${top[1]}% of your most-used limit`, `الاستخدام: ${num(top[1])}٪ من أكثر حدّ استخدامًا`)}</small>
        <span class="pl-bar"><i style="width:${top[1]}%"${top[1] >= 100 ? ' class="full"' : ''}></i></span></span>
      <span class="mx-chev">${AR ? '‹' : '›'}</span></button>`;
  $('#pl-open', el).onclick = usage;
}

/* ---------- usage (like Claude's Settings → Usage) and the plans ---------- */
function usage() {
  let d = $('#pl-usage');
  if (!d) { d = document.createElement('dialog'); d.id = 'pl-usage'; d.className = 'pl-dlg'; d.setAttribute('data-noi18n', ''); document.body.appendChild(d); }
  d.dir = AR ? 'rtl' : 'ltr';
  const p = plan(), u = use();
  const row = k => { const pc = pctOf(k, u), used = u[k] || 0, lim = limitOf(k);
    return `<div class="pu-row"><div class="pu-top"><b>${NAMES[k][0]}</b><span>${num(pc)}${AR ? '٪' : '%'} ${L('used', 'مستخدم')}</span></div>
      <span class="pl-bar big"><i style="width:${pc}%"${pc >= 100 ? ' class="full"' : ''}></i></span>
      <div class="pu-sub"><small>${num(used)} / ${num(lim)}${NAMES[k][1] ? ' ' + NAMES[k][1] : ''}</small><small>${resetIn(k)}</small></div></div>`; };
  d.innerHTML = `<div class="row-between"><b class="card-h" style="margin:0">${L('Plan and usage', 'الخطة والاستخدام')}</b><button type="button" class="icon-btn" id="pu-x" aria-label="${L('Close', 'إغلاق')}">✕</button></div>
    <div class="pu-plan"><span class="pu-av">${p === 'owner' ? '★' : 'B'}</span><span><b>${p === 'owner' ? L('Owner', 'المالك') : L('Basic plan', 'الخطة الأساسية')}</b><small>${p === 'owner' ? L('No limits on this phone', 'بلا حدود على هذا الهاتف') : L('Free — no card needed', 'مجانية — بلا بطاقة')}</small></span></div>
    ${p === 'owner' ? '' : `<div class="pu-h">${L('Usage limits', 'حدود الاستخدام')}</div>${KEYS.map(row).join('')}`}
    <div class="pu-free"><b>${L('Always unlimited', 'دائمًا بلا حدود')}</b><span>${L('Assistant chat, notes you write, calendar, tasks, habits, prayer times, reminders, focus and Studio.', 'محادثة المساعد، والملاحظات التي تكتبها، والتقويم، والمهام، والعادات، وأوقات الصلاة، والتذكيرات، والتركيز، والاستوديو.')}</span></div>
    <button type="button" class="primary pu-up" id="pu-plans">${L('See all plans', 'اعرض كل الخطط')}</button>`;
  $('#pu-x', d).onclick = () => d.close();
  $('#pu-plans', d).onclick = () => { d.close(); prices(); };
  if (!d.open) d.showModal();
}

/* ---------- the plans page ---------- */
function prices() {
  let d = $('#pl-dialog');
  if (!d) { d = document.createElement('dialog'); d.id = 'pl-dialog'; d.setAttribute('data-noi18n', ''); document.body.appendChild(d); }
  d.dir = AR ? 'rtl' : 'ltr';
  const P = [
    [L('Basic', 'الأساسية'), L('Free', 'مجانًا'), [L('1 hour of recordings into notes a day', 'ساعة تسجيلات إلى ملاحظات يوميًا'), L('30 files, PDFs or photos a month', '٣٠ ملفًا أو PDF أو صورة شهريًا'), L('The assistant: unlimited', 'المساعد: بلا حدود'), L('Calendar, tasks, habits, prayer: unlimited', 'التقويم والمهام والعادات والصلاة: بلا حدود'), L('Studio: free for everyone, no mark', 'الاستوديو: مجاني للجميع وبلا علامة')], L('Your plan', 'خطتك')],
    [L('Plus', 'الميسّرة'), L('$3.99 a month', '٣٫٩٩$ شهريًا'), [L('30 hours a month, never waits', '٣٠ ساعة شهريًا، بلا انتظار'), L('60 files and 30 YouTube videos', '٦٠ ملفًا و٣٠ فيديو يوتيوب'), L('A faster, stronger assistant', 'مساعد أسرع وأقوى'), L('Priority: never waits for the free allowance', 'أولوية: لا انتظار للحصة المجانية')], L('Coming soon', 'قريبًا')],
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

window.JundPlan = { check, add, left, plan, card, prices, usage, LIMITS };
})();
