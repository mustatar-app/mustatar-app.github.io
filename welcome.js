/* Mustatar — the first-open welcome: language, name and what you do, your day (languages, hours, what is hard),
   and your tools (only the ones that fit you; the rest can be switched on later in Settings). */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = window.ZadLang === 'ar';
const L = (en, ar) => AR ? ar : en;
const ROLES = [
  ['student', '🎓', 'Student', 'طالب', 'study'], ['seeker', '📖', 'Student of knowledge', 'طالب علم', 'study'],
  ['teacher', '🧑‍🏫', 'Teacher', 'معلّم', 'work'], ['employee', '💼', 'Employee', 'موظف', 'work'],
  ['developer', '💻', 'Developer', 'مبرمج', 'work'], ['business', '🏪', 'Business owner', 'صاحب عمل', 'work'],
  ['creator', '🎬', 'Content creator', 'صانع محتوى', 'work'], ['other', '✨', 'Something else', 'غير ذلك', 'work'],
];
const LANGS = [['Arabic', 'العربية'], ['English', 'English'], ['Urdu', 'اردو'], ['Hindi', 'हिन्दी'], ['French', 'Français'], ['Turkish', 'Türkçe'], ['Malay / Indonesian', 'Melayu'], ['Spanish', 'Español']];
const HARD_AR = { forget: 'نسيان المهام', meetings: 'كثرة الاجتماعات', start: 'البدء في العمل', focus: 'التركيز', habits: 'الاستمرار على العادات', revise: 'المراجعة والحفظ', organise: 'ترتيب الملاحظات' };
const TOOLS_AR = { habits: 'متابعة العادات', prayer: 'أوقات الصلاة', study: 'أدوات المذاكرة (بطاقات، اختبارات، امتحانات)', meetings: 'التسجيلات والاجتماعات', studio: 'الاستوديو (نص على الصور والفيديو)' };
let box;

function start(force) {
  if (!force && store.get('welcomed')) return;
  box = document.createElement('div');
  box.className = 'wl'; box.setAttribute('data-noi18n', ''); box.dir = AR ? 'rtl' : 'ltr';
  document.body.appendChild(box); document.body.classList.add('vx-open');
  // the opening screen first (sign in, or continue without an account), unless already signed in
  const st = store.get('welcomeStep', 0);
  step(st <= 1 ? (store.get('mstToken', '') || store.get('opened') ? 2 : 0) : st);
}
// the opening screen: what Mustatar does, and how to come in
function opening() {
  store.set('welcomeStep', 0);
  const A = window.JundAcct;
  box.innerHTML = `<div class="wl-card op">
    <div class="op-top"><span class="op-brand">${window.MustatarMark?.(26, false) || '<img src="icon-192.png" alt="" width="26" height="26">'}<b>${L('Mustatar', 'مستطر')}</b></span>
      <button type="button" class="op-lang" id="op-lang">${AR ? 'English' : 'عربي'}</button></div>
    <div class="op-mid"><h1 class="op-h">${L('Every lesson and meeting,<br>written your way.', 'كل درس واجتماع،<br>مكتوب بطريقتك.')}</h1>
      <p class="muted">${L('Record or upload, and Mustatar writes the notes, the minutes and the tasks, in Arabic and English.', 'سجّل أو ارفع ملفًا، ومستطر يكتب الملاحظات والمحضر والمهام، بالعربية والإنجليزية.')}</p></div>
    <div class="op-btns">
      <div id="op-google" class="op-google" hidden></div>
      ${A?.canPasskey ? `<button type="button" class="ghost op-pk" id="op-pk"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="8" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> ${L('Sign in with a passkey', 'الدخول بمفتاح المرور')}</button>` : ''}
      <button type="button" class="link op-skip" id="op-skip">${L('Continue without an account', 'المتابعة بدون حساب')}</button>
      <p class="muted op-st" id="op-st" aria-live="polite"></p>
      <p class="muted fine op-fine">${L('By continuing you agree to the Terms and Privacy Policy. Your content is never used to train AI.', 'بالمتابعة فإنك توافق على الشروط وسياسة الخصوصية. لا يُستخدم محتواك أبدًا لتدريب الذكاء الاصطناعي.')}</p>
    </div></div>`;
  const say = t => { const e = box.querySelector('#op-st'); if (e) e.textContent = t; };
  A?.say(say);
  A?.mountGoogle(box.querySelector('#op-google')).catch(() => {});
  const pk = box.querySelector('#op-pk'); if (pk) pk.onclick = () => A.passkeySignIn();
  const next = () => { A?.say(null); store.set('opened', true); window.removeEventListener('mustatar-signed-in', onIn); step(2); };
  const onIn = () => setTimeout(next, 600);
  window.addEventListener('mustatar-signed-in', onIn);
  box.querySelector('#op-skip').onclick = next;
  box.querySelector('#op-lang').onclick = () => { store.set('uiLang', AR ? 'en' : 'ar'); location.reload(); };
}
function finish() {
  store.set('welcomed', true); store.set('welcomeStep', 1);
  box?.remove(); document.body.classList.remove('vx-open');
  try { J.show('assistant'); window.JundAssistant?.home(); } catch {}
  window.JundReport?.event('welcome-done');
}
function frame(n, html) {
  box.innerHTML = `<div class="wl-card">
    <div class="wl-top"><img src="icon-192.png" alt="" width="44" height="44"><div class="wl-dots">${[2, 3, 4].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>
      <button type="button" class="ghost small wl-skip">${L('Skip', 'تخطَّ')}</button></div>${html}</div>`;
  box.querySelector('.wl-skip').onclick = finish;
}
function step(n) {
  if (n === 0) return opening();
  store.set('welcomeStep', n);
  if (n === 1) {
    frame(1, `<h1 class="wl-h">${L('Welcome to Mustatar', 'أهلًا بك في مستطر')}</h1>
      <p class="wl-verse" dir="rtl">﴿وَكُلُّ صَغِيرٖ وَكَبِيرٖ مُّسۡتَطَرٌ﴾ <small>[القمر: 53]</small></p>
      <p class="muted">${L('Your notes, lessons, tasks, calendar and a voice assistant — everything small and big, written down.', 'ملاحظاتك ودروسك ومهامك وتقويمك ومساعد صوتي — كل صغير وكبير مكتوب.')}</p>
      <p class="wl-q">${L('Choose the app language', 'اختر لغة التطبيق')}</p>
      <div class="wl-two"><button type="button" class="wl-opt" data-l="en">English</button><button type="button" class="wl-opt" data-l="ar">العربية</button></div>`);
    box.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
      const want = b.dataset.l; store.set('welcomeStep', 2);
      if ((want === 'ar') !== AR) { store.set('uiLang', want); location.reload(); } else step(2);
    });
  }
  if (n === 2) {
    const me = J.me() || {};
    frame(2, `<h1 class="wl-h">${L('About you', 'عرّفنا بك')}</h1>
      <label class="field"><span>${L('Your first name', 'اسمك الأول')}</span><input id="wl-name" dir="auto" autocomplete="given-name" value="${esc(me.name || '')}"></label>
      <p class="wl-q">${L('What do you do? (choose one or more)', 'ماذا تعمل؟ (اختر واحدًا أو أكثر)')}</p>
      <div class="wl-roles">${ROLES.map(r => `<button type="button" class="wl-role${(me.roles || []).includes(r[0]) ? ' on' : ''}" data-r="${r[0]}"><span>${r[1]}</span>${L(r[2], r[3])}</button>`).join('')}</div>
      <label class="field"><span>${L('Where? (school, company — optional)', 'أين؟ (المدرسة أو الجهة — اختياري)')}</span><input id="wl-where" dir="auto" value="${esc(me.study || '')}"></label>
      <button type="button" class="primary wl-next">${L('Next', 'التالي')}</button>`);
    box.querySelectorAll('.wl-role').forEach(b => b.onclick = () => b.classList.toggle('on'));
    box.querySelector('.wl-next').onclick = () => {
      const roles = [...box.querySelectorAll('.wl-role.on')].map(b => b.dataset.r);
      const use = roles.some(r => ROLES.find(x => x[0] === r)[4] === 'study') && !roles.some(r => ROLES.find(x => x[0] === r)[4] === 'work') ? 'study' : roles.length ? 'work' : (me.use || 'study');
      store.set('me', { ...me, name: box.querySelector('#wl-name').value.trim(), study: box.querySelector('#wl-where').value.trim(), use, roles });
      window.JundReport?.event('roles:' + (roles.join('+') || 'none'));
      step(3);
    };
  }
  if (n === 3) {
    const me = J.me() || {};
    const langs = new Set(me.langs || [AR ? 'Arabic' : 'English']), hard = new Set(me.hard || []);
    frame(3, `<h1 class="wl-h">${L('Your day', 'يومك')}</h1>
      <p class="wl-q">${L('Which languages do you speak or record in?', 'بأي لغات تتكلم أو تسجّل؟')}</p>
      <div class="wl-langs">${LANGS.map(([en, nat]) => `<button type="button" class="chip${langs.has(en) ? ' on' : ''}" data-lang="${en}">${nat}</button>`).join('')}</div>
      <p class="wl-q">${L('When do you usually work or study?', 'متى تعمل أو تذاكر عادةً؟')}</p>
      <div class="row-gap"><input id="wl-from" type="time" value="${esc(me.hours?.from || '08:00')}"><span class="muted">${L('to', 'إلى')}</span><input id="wl-to" type="time" value="${esc(me.hours?.to || '16:00')}"></div>
      <p class="wl-q">${L('What is hardest for you? (choose any)', 'ما أصعب شيء عليك؟ (اختر ما شئت)')}</p>
      <div class="wl-hard">${J.HARD.map(([k, en]) => `<button type="button" class="chip${hard.has(k) ? ' on' : ''}" data-hard="${k}">${L(en, HARD_AR[k])}</button>`).join('')}</div>
      <button type="button" class="primary wl-next">${L('Next', 'التالي')}</button>`);
    box.querySelectorAll('.chip').forEach(b => b.onclick = () => b.classList.toggle('on'));
    box.querySelector('.wl-next').onclick = () => {
      store.set('me', { ...J.me(), langs: [...box.querySelectorAll('[data-lang].on')].map(b => b.dataset.lang),
        hours: { from: box.querySelector('#wl-from').value, to: box.querySelector('#wl-to').value },
        hard: [...box.querySelectorAll('[data-hard].on')].map(b => b.dataset.hard) });
      step(4);
    };
  }
  if (n === 4) {
    // suggest tools from what the person told us; they can change any of them
    const me = J.me() || {}, roles = me.roles || [], hard = me.hard || [];
    const studies = roles.some(r => ['student', 'seeker', 'teacher'].includes(r)) || me.use === 'study';
    const suggest = { habits: hard.includes('habits') || hard.includes('focus') || hard.includes('start'), prayer: true, study: studies || hard.includes('revise'),
      meetings: roles.some(r => ['employee', 'business', 'teacher', 'developer'].includes(r)) || hard.includes('meetings') || me.use === 'work', studio: roles.includes('creator') };
    const now = { ...suggest, ...(store.get('tools', null) || {}) };
    frame(4, `<h1 class="wl-h">${L('Your tools', 'أدواتك')}</h1>
      <p class="muted">${L('These fit what you told us. Tap to change; everything can be switched on later in Settings.', 'هذه تناسب ما أخبرتنا به. اضغط للتغيير، ويمكنك تفعيل أي شيء لاحقًا من الإعدادات.')}</p>
      <div class="wl-tools">${J.TOOLS.map(([k, en]) => `<button type="button" class="chip${now[k] ? ' on' : ''}" data-tool="${k}">${L(en, TOOLS_AR[k])}</button>`).join('')}</div>
      <button type="button" class="primary wl-next">${L('Next', 'التالي')}</button>`);
    box.querySelectorAll('.chip').forEach(b => b.onclick = () => b.classList.toggle('on'));
    box.querySelector('.wl-next').onclick = () => {
      store.set('tools', Object.fromEntries([...box.querySelectorAll('[data-tool]')].map(b => [b.dataset.tool, b.classList.contains('on')])));
      J.applyTools(); J.saveProfile();
      window.JundReport?.event('tools:' + [...box.querySelectorAll('[data-tool].on')].map(b => b.dataset.tool).join('+'));
      done();
    };
  }
}
function done() {
  frame(4, `<h1 class="wl-h">${L('Ready ✓', 'جاهز ✓')}</h1>
    <p class="muted">${L('Three things to try first:', 'ثلاثة أشياء جرّبها أولًا:')}</p>
    <ul class="wl-try"><li>🎙 ${L('Tap <b>＋ → Record</b> in a class or meeting — you get clean notes.', 'اضغط <b>＋ ← تسجيل</b> في درس أو اجتماع — تحصل على ملاحظات مرتبة.')}</li>
      <li>🗣 ${L('Tap the microphone on Today and just talk, in Arabic or English.', 'اضغط المايك في «اليوم» وتكلّم بالعربية أو الإنجليزية.')}</li>
      <li>✅ ${L('Tap <b>＋ → Task</b> — you get a reminder on time.', 'اضغط <b>＋ ← مهمة</b> — يصلك تنبيه في وقته.')}</li></ul>
    ${store.get('mstToken', '') ? '' : `<p class="muted fine">${L('Tip: sign in from Me → Sign in, so your notes are kept safe in your own private space.', 'نصيحة: سجّل الدخول من «أنا» ← تسجيل الدخول، لتُحفظ ملاحظاتك في مساحتك الخاصة.')}</p>`}
    <p class="muted fine">${L('Something not working, or an idea? Me → Send feedback.', 'شيء لا يعمل، أو لديك فكرة؟ «أنا» ← أرسل ملاحظة.')}</p>
    <button type="button" class="primary wl-next">${L('Start', 'ابدأ')}</button>`);
  box.querySelector('.wl-next').onclick = finish;
}
window.JundWelcome = { start };
setTimeout(() => start(false), 300);
})();
