/* Mustatar — the main navigation: the bottom bar (Today · Notes · ＋ · Calendar · Me), the ＋ sheet
   (capture something, or plan something) and the Me screen (you, your growth tools, your workspace, settings). */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = window.ZadLang === 'ar';
const L = (en, ar) => AR ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const IC = {
  rec: '<circle cx="12" cy="12" r="4" fill="#E5484D" stroke="none"/><circle cx="12" cy="12" r="8"/>',
  up: '<path d="M12 15V4m0 0 4 4m-4-4-4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  yt: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zM10.5 9.5v5l4-2.5z"/>',
  paste: '<path d="M9 4h6v3H9zM7 5.5H5.5V20h13V5.5H17M8.5 11h7M8.5 15h5"/>',
  task: '<path d="M5 12.5l4 4 10-10"/>',
  habit: '<path d="M12 21a8 8 0 1 1 8-8M12 8v5l3 2"/>',
  focus: '<path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 1.5M10 3h4"/>',
  review: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  studio: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/>',
  left: '<path d="M12 21a9 9 0 1 0 0-18v9z"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  tools: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>',
  send: '<path d="M4 12l16-8-6 16-2-7z"/>',
  study: '<path d="M3 8l9-4 9 4-9 4zM7 10v5c3 2 7 2 10 0v-5"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
const chev = `<span class="mx-chev" aria-hidden="true">${AR ? '‹' : '›'}</span>`;
const row = (k, t, sub, extra = '') => `<button type="button" class="mx-row" data-k="${k}"><span class="mx-ic">${svg(IC[k] ? k : 'tools')}</span><span class="mx-t"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span>${extra ? `<span class="mx-x">${extra}</span>` : ''}${chev}</button>`;

/* ---------- the ＋ sheet ---------- */
let sheet;
function buildSheet() {
  sheet = document.createElement('div');
  sheet.className = 'px'; sheet.hidden = true; sheet.setAttribute('data-noi18n', ''); sheet.dir = AR ? 'rtl' : 'ltr';
  sheet.innerHTML = `<div class="px-panel" role="dialog" aria-modal="true" aria-label="${L('Add', 'إضافة')}">
    <div class="px-grip"></div>
    <div class="mx-h">${L('Capture', 'التقاط')}</div>
    <div class="mx-group">
      ${row('rec', L('Record', 'تسجيل'), L('Meeting, lesson or a thought', 'اجتماع أو درس أو فكرة'))}
      ${row('up', L('Upload a file', 'رفع ملف'), L('Audio, video, PDF or text', 'صوت أو فيديو أو PDF أو نص'))}
      ${row('scan', L('Scan pages', 'تصوير صفحات'), L('Book pages or a whiteboard', 'صفحات كتاب أو سبّورة'))}
      ${row('yt', L('YouTube link', 'رابط يوتيوب'), '')}
      ${row('paste', L('Paste text', 'لصق نص'), '')}
    </div>
    <div class="mx-h">${L('Plan', 'تخطيط')}</div>
    <div class="mx-group">
      ${row('task', L('Task or reminder', 'مهمة أو تذكير'), '')}
      ${row('habit', L('Habit', 'عادة'), '')}
      ${row('focus', L('Focus session', 'جلسة تركيز'), '')}
    </div>
    <input type="file" id="px-scan" accept="image/*" capture="environment" multiple hidden>
  </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  const go = (k, fn) => { $(`[data-k="${k}"]`, sheet).onclick = () => { closeSheet(); fn(); }; };
  go('rec', () => window.JundFeatures?.record());
  // the file pickers must open in the same tap, so these do not wait for the sheet to close
  $('[data-k="up"]', sheet).onclick = () => { J.show('new'); $('#file')?.click(); closeSheet(); };
  $('[data-k="scan"]', sheet).onclick = () => { $('#px-scan', sheet).click(); };
  $('#px-scan', sheet).onchange = e => { const f = [...e.target.files]; e.target.value = ''; closeSheet(); if (f.length) { J.show('new'); J.addFiles(f); } };
  go('yt', () => { J.show('new'); setTimeout(() => $('#yt')?.focus(), 60); });
  go('paste', () => { J.show('new'); const p = $('#paste-box'); if (p) p.open = true; setTimeout(() => { const t = $('#transcript'); t?.focus(); t?.scrollIntoView({ block: 'center' }); }, 60); });
  go('task', () => window.JundCal?.open());
  go('habit', () => window.JundFeatures?.addHabit());
  go('focus', () => window.JundFeatures?.openFocus());
  // swipe the sheet down to close it
  let y0 = null;
  $('.px-panel', sheet).addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
  $('.px-panel', sheet).addEventListener('touchend', e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 70) closeSheet(); y0 = null; }, { passive: true });
}
function openSheet() { if (!sheet) buildSheet(); sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('in')); document.body.classList.add('vx-open'); }
function closeSheet() { if (!sheet) return; sheet.classList.remove('in'); document.body.classList.remove('vx-open'); setTimeout(() => { sheet.hidden = true; }, 200); }

/* ---------- the Me screen ---------- */
function me() {
  const sc = $('#screen-me'); if (!sc) return;
  sc.dir = AR ? 'rtl' : 'ltr';
  const u = store.get('mstUser', null), inn = !!store.get('mstToken', '') && u;
  const prof = J.me() || {};
  const name = (inn && u.name) || prof.name || L('You', 'أنت');
  const tools = store.get('tools', null) || {};
  const nTools = Object.values(tools).filter(Boolean).length;
  const place = $('#prayer-place')?.selectedOptions?.[0]?.textContent || '';
  const theme = $('#theme')?.selectedOptions?.[0]?.textContent || '';
  const habits = (store.get('habits', []) || []).length;
  const chats = window.JundAssistant?.chats?.().length || 0;
  sc.innerHTML = `
    <div class="me-head"><span class="me-av">${esc(String(name).trim().charAt(0).toUpperCase() || '·')}</span>
      <span class="me-who"><b dir="auto">${esc(name)}</b><small>${inn ? esc(u.email || L('Signed in', 'مسجّل الدخول')) + ' · ' + L('synced', 'متزامن') : L('Not signed in — your notes are on this phone only', 'لم تسجّل الدخول — ملاحظاتك على هذا الهاتف فقط')}</small></span>
      ${inn ? '' : `<button type="button" class="primary small" id="me-signin">${L('Sign in', 'تسجيل الدخول')}</button>`}</div>
    <div id="me-plan"></div>
    <div class="mx-h">${L('Growth', 'النموّ')}</div>
    <div class="mx-group">
      ${row('habit', L('Habits', 'العادات'), '', habits || '')}
      ${row('review', L('Weekly review', 'مراجعة الأسبوع'), '')}
      ${row('focus', L('Focus', 'التركيز'), '')}
      ${tools.study ? row('study', L('Study tools', 'أدوات المذاكرة'), L('Flashcards, quizzes, exam plan', 'بطاقات واختبارات وخطة امتحان')) : ''}
    </div>
    <div class="mx-h">${L('Workspace', 'مساحة العمل')}</div>
    <div class="mx-group">
      ${row('chat', L('Assistant chats', 'محادثات المساعد'), '', chats || '')}
      ${row('mic', L('Recordings & meetings', 'التسجيلات والاجتماعات'), '', '<span id="me-recs"></span>')}
      ${row('left', L('Left to do', 'ما تبقّى'), '', '<span id="me-left"></span>')}
      ${row('bell', L('Reminders', 'التذكيرات'), '')}
      ${row('studio', L('Studio', 'الاستوديو'), L('Text on photos and videos', 'نص على الصور والفيديو'))}
    </div>
    <div class="mx-h">${L('Settings', 'الإعدادات')}</div>
    <div class="mx-group">
      ${row('user', L('Profile and languages', 'الملف الشخصي واللغات'), '')}
      ${row('tools', L('Tools', 'الأدوات'), '', nTools ? L(nTools + ' on', nTools + ' مفعّلة') : '')}
      ${row('pin', L('Prayer and calendar', 'الصلاة والتقويم'), '', esc(place))}
      ${row('sun', L('Appearance', 'المظهر'), '', esc(theme))}
      ${row('shield', L('Account and privacy', 'الحساب والخصوصية'), '')}
      ${row('save', L('Saving and backup', 'الحفظ والنسخ الاحتياطي'), '')}
      ${row('send', L('Send feedback', 'أرسل ملاحظة'), '')}
      ${row('review', L('Welcome tour', 'جولة الترحيب'), L('See the opening screen and first questions again', 'شاشة البداية والأسئلة الأولى من جديد'), '').replace('data-k="review"', 'data-k="tour"')}
    </div>
    <button type="button" class="link me-all" id="me-all">${L('All settings', 'كل الإعدادات')}</button>`;
  const on = (k, fn) => { const b = $(`[data-k="${k}"]`, sc); if (b) b.onclick = fn; };
  on('habit', () => window.JundFeatures?.addHabit());
  on('review', () => { J.show('calendar'); setTimeout(() => $('#week-review')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80); });
  on('focus', () => window.JundFeatures?.openFocus());
  on('study', () => window.JundStudy?.planner?.());
  on('chat', () => window.JundDrawer?.open());
  on('mic', () => J.show('recordings'));
  on('left', () => J.show('pending'));
  on('bell', () => J.show('inbox'));
  on('studio', () => J.show('studio'));
  const card = sel => () => { J.show('settings'); setTimeout(() => { const c = typeof sel === 'function' ? sel() : $(sel); if (!c) return; c.scrollIntoView({ block: 'start', behavior: 'smooth' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1600); }, 80); };
  const cardOf = sel => () => $(sel)?.closest('.card');
  const cardTitled = t => () => $$('#screen-settings .card').find(c => (c.querySelector('.card-h')?.textContent || '').trim().startsWith(t));
  on('user', card('#about-card'));
  on('tools', card('#tools-card'));
  on('pin', card(cardOf('#prayer-place')));
  on('sun', card(cardOf('#theme')));
  on('shield', card('#acct-card'));
  on('save', card(cardTitled('Saving and backup')));
  on('send', card('#fb-card'));
  on('tour', () => window.JundWelcome?.start(true));
  $('#me-all', sc).onclick = () => J.show('settings');
  const si = $('#me-signin', sc); if (si) si.onclick = card('#acct-card');
  window.JundRecs?.summary().then(s => { const e = $('#me-recs', sc); if (e && s.left.length) e.textContent = s.left.length; }).catch(() => {});
  window.JundPending?.count().then(n => { const e = $('#me-left', sc); if (e && n) e.textContent = n; }).catch(() => {});
  window.JundPlan?.card?.($('#me-plan', sc));
}

/* ---------- wiring ---------- */
$('#tab-plus')?.addEventListener('click', openSheet);
// the Today screen: the ＋ button replaces the four quick buttons above the message box
document.body.classList.add('nav2');
window.JundNav = { me, openSheet, closeSheet };
})();
