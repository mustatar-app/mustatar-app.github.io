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
  field: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>',
  words: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/><path d="M17 13l3 3-3 3"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  count: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>',
  note: '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8 12h8M8 16h5"/>',
  bring: '<path d="M12 4v11m0 0-4-4m4 4 4-4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
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
      ${row('note', L('Note', 'ملاحظة'), L('A quick note, list or voice note', 'ملاحظة سريعة أو قائمة أو ملاحظة صوتية'))}
      ${row('rec', L('Record', 'تسجيل'), L('Meeting, lesson or a thought', 'اجتماع أو درس أو فكرة'))}
      ${row('up', L('Upload a file', 'رفع ملف'), L('Audio, video, PDF or text', 'صوت أو فيديو أو PDF أو نص'))}
      ${row('scan', L('Scan pages', 'تصوير صفحات'), L('Book pages or a whiteboard', 'صفحات كتاب أو سبّورة'))}
      ${row('yt', L('YouTube link', 'رابط يوتيوب'), '')}
      ${row('paste', L('Paste text', 'لصق نص'), '')}
    </div>
    <div class="mx-h">${L('Create', 'إنشاء')}</div>
    <div class="mx-group">
      ${row('studio', L('Post or story', 'منشور أو ستوري'), L('Studio: text on photos and videos', 'الاستوديو: نص على الصور والفيديو'))}
    </div>
    <div class="mx-h">${L('Plan', 'تخطيط')}</div>
    <div class="mx-group">
      ${row('task', L('Task or reminder', 'مهمة أو تذكير'), '')}
      ${row('habit', L('Habit', 'عادة'), '')}
      ${row('focus', L('Focus session', 'جلسة تركيز'), '')}
      ${row('timer', L('Timer or stopwatch', 'مؤقت أو ساعة إيقاف'), '')}
      ${row('count', L('Countdown', 'عدّ تنازلي'), L('Ramadan, Eid, exams, your own dates', 'رمضان والعيد والاختبارات ومناسباتك'))}
    </div>
    <input type="file" id="px-scan" accept="image/*" capture="environment" multiple hidden>
  </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  const go = (k, fn) => { $(`[data-k="${k}"]`, sheet).onclick = () => { closeSheet(); fn(); }; };
  go('rec', () => window.JundFeatures?.record());
  go('note', () => window.JundKeep?.newNote());
  // the file pickers must open in the same tap, so these do not wait for the sheet to close
  $('[data-k="up"]', sheet).onclick = () => { J.show('new'); $('#file')?.click(); closeSheet(); };
  $('[data-k="scan"]', sheet).onclick = () => { $('#px-scan', sheet).click(); };
  $('#px-scan', sheet).onchange = e => { const f = [...e.target.files]; e.target.value = ''; closeSheet(); if (f.length) { J.show('new'); J.addFiles(f); } };
  go('yt', () => { J.show('new'); setTimeout(() => $('#yt')?.focus(), 60); });
  go('paste', () => { J.show('new'); const p = $('#paste-box'); if (p) p.open = true; setTimeout(() => { const t = $('#transcript'); t?.focus(); t?.scrollIntoView({ block: 'center' }); }, 60); });
  go('studio', () => J.show('studio'));
  go('task', () => window.JundCal?.open());
  go('habit', () => window.JundFeatures?.addHabit());
  go('focus', () => window.JundFeatures?.openFocus());
  go('timer', () => window.JundCount?.open('timer'));
  go('count', () => window.JundCount?.open('add'));
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
    ${window.JundUpdate?.ready() ? `<button type="button" class="me-upd" id="me-upd"><span class="me-upd-dot"></span><span>${L('A new version is ready', 'نسخة جديدة جاهزة')}</span><b>${L('Restart', 'إعادة التشغيل')}</b></button>` : ''}
    <div id="me-plan"></div>
    <div class="mx-h">${L('Growth', 'النموّ')}</div>
    <div class="mx-group">
      ${row('habit', L('Habits', 'العادات'), '', habits || '')}
      ${row('review', L('Weekly review', 'مراجعة الأسبوع'), '')}
      ${row('focus', L('Focus', 'التركيز'), '')}
      ${row('count', L('Countdowns and timers', 'العدّ التنازلي والمؤقتات'), '', (window.JundCount?.timers?.().length || '') || '')}
      ${row('brief', L('Brief before lessons and meetings', 'موجز قبل الدروس والاجتماعات'), (m => m ? (m >= 60 ? L(`${m / 60} h before`, `قبل ${m / 60} س`) : L(`${m} min before`, `قبل ${m} د`)) : L('Off', 'متوقف'))(Number(store.get('briefLead', 60))))}
      ${tools.study ? row('study', L('Study tools', 'أدوات المذاكرة'), L('Flashcards, quizzes, exam plan', 'بطاقات واختبارات وخطة امتحان')) : ''}
    </div>
    <div class="mx-h">${L('Workspace', 'مساحة العمل')}</div>
    <div class="mx-group">
      ${row('chat', L('Assistant chats', 'محادثات المساعد'), '', chats || '')}
      ${row('mic', L('Recordings & meetings', 'التسجيلات والاجتماعات'), '', '<span id="me-recs"></span>')}
      ${row('left', L('Left to do', 'ما تبقّى'), '', '<span id="me-left"></span>')}
      ${row('bell', L('Reminders', 'التذكيرات'), '')}
      ${row('studio', L('Studio', 'الاستوديو'), L('Text on photos and videos', 'نص على الصور والفيديو'))}
      ${row('bring', L('Bring your work', 'انقل أعمالك'), L('From Google Keep, Drive, Evernote, Notion…', 'من Google Keep وDrive وEvernote وNotion…'))}
    </div>
    <div class="mx-h">${L('Settings', 'الإعدادات')}</div>
    <div class="mx-group">
      ${row('user', L('Profile and languages', 'الملف الشخصي واللغات'), '')}
      ${row('field', L('Your field', 'مجالك'), L('Notes written the way your field needs', 'ملاحظات بالطريقة التي يحتاجها مجالك'), esc(fieldName()))}
      ${row('words', L('My words', 'كلماتي'), L('Names and terms the app should hear and spell right', 'أسماء ومصطلحات يسمعها التطبيق ويكتبها صحيحة'), (store.get('myWords', '') || '').split(/[,،\n]/).filter(w => w.trim()).length || '')}
      ${row('tools', L('Tools', 'الأدوات'), '', nTools ? L(nTools + ' on', nTools + ' مفعّلة') : '')}
      ${row('pin', L('Prayer and calendar', 'الصلاة والتقويم'), '', esc(place))}
      ${row('sun', L('Appearance and text size', 'المظهر وحجم النص'), '', esc(theme))}
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
  on('count', () => window.JundCount?.open(window.JundCount.timers().length ? 'timer' : 'list'));
  on('brief', () => pickBrief());
  on('study', () => window.JundStudy?.planner?.());
  on('chat', () => window.JundDrawer?.open());
  on('mic', () => J.show('recordings'));
  on('left', () => J.show('pending'));
  on('bell', () => J.show('inbox'));
  on('studio', () => J.show('studio'));
  on('bring', () => window.JundImport?.open());
  const card = sel => () => { J.show('settings'); setTimeout(() => { const c = typeof sel === 'function' ? sel() : $(sel); if (!c) return; c.scrollIntoView({ block: 'start', behavior: 'smooth' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1600); }, 80); };
  const cardOf = sel => () => $(sel)?.closest('.card');
  const cardTitled = t => () => $$('#screen-settings .card').find(c => (c.querySelector('.card-h')?.textContent || '').trim().startsWith(t));
  on('user', card('#about-card'));
  on('field', pickField);
  on('words', editWords);
  on('tools', card('#tools-card'));
  on('pin', card(cardOf('#prayer-place')));
  on('sun', card(cardOf('#theme')));
  on('shield', card('#acct-card'));
  on('save', card(cardTitled('Saving and backup')));
  on('send', card('#fb-card'));
  on('tour', () => window.JundWelcome?.start(true));
  $('#me-all', sc).onclick = () => J.show('settings');
  const up = $('#me-upd', sc); if (up) up.onclick = () => window.JundUpdate.apply();
  const si = $('#me-signin', sc); if (si) si.onclick = card('#acct-card');
  window.JundRecs?.summary().then(s => { const e = $('#me-recs', sc); if (e && s.left.length) e.textContent = s.left.length; }).catch(() => {});
  window.JundPending?.count().then(n => { const e = $('#me-left', sc); if (e && n) e.textContent = n; }).catch(() => {});
  window.JundPlan?.card?.($('#me-plan', sc));
}

/* ---------- a back arrow on screens that are not one of the tabs ---------- */
(() => {
  const bar = $('.topbar'); if (!bar || $('#top-back')) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-btn top-back'; b.id = 'top-back';
  b.setAttribute('aria-label', L('Back', 'رجوع'));
  b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${AR ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  b.onclick = () => window.JundBack?.();
  bar.prepend(b);
})();

/* ---------- your field: the notes are written the way the field needs (the instructions are in app.js FIELDS) ---------- */
const FIELD_NAMES = {
  general: [L('General', 'عام'), L('Clear notes for any subject', 'ملاحظات واضحة لأي موضوع')],
  business: [L('Business and meetings', 'الأعمال والاجتماعات'), L('Decisions, who does what, deadlines, numbers', 'القرارات، ومن يفعل ماذا، والمواعيد، والأرقام')],
  medicine: [L('Medicine and health', 'الطب والصحة'), L('Drugs and doses exactly, signs, tables, mnemonics', 'الأدوية والجرعات بدقة، والعلامات، والجداول، وطرق الحفظ')],
  engineering: [L('Engineering and computing', 'الهندسة والحاسب'), L('Formulas, units, steps, code kept exactly', 'المعادلات والوحدات والخطوات والكود كما هو')],
  law: [L('Law', 'القانون'), L('Articles and numbers, cases, definitions, exceptions', 'المواد وأرقامها، والقضايا، والتعريفات، والاستثناءات')],
  teaching: [L('Teaching', 'التدريس'), L('Aims, activities, homework, questions to ask', 'الأهداف، والأنشطة، والواجبات، وأسئلة للطلاب')],
  islamic: [L('Islamic studies', 'العلوم الشرعية'), L('Verses and hadith with sources, rulings with evidence', 'الآيات والأحاديث بمصادرها، والأحكام بأدلتها')],
};
function fieldName() { return (FIELD_NAMES[store.get('field', 'general')] || FIELD_NAMES.general)[0]; }
function dlg(id, html) {
  let d = document.getElementById(id);
  if (!d) { d = document.createElement('dialog'); d.id = id; d.className = 'mx-dlg'; d.setAttribute('data-noi18n', ''); document.body.appendChild(d); }
  d.dir = AR ? 'rtl' : 'ltr'; d.innerHTML = html; d.showModal();
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  return d;
}
// the short brief before lessons and meetings: when it comes
function pickBrief() {
  const now = Number(store.get('briefLead', 60));
  const opts = [[0, L('Off', 'متوقف'), ''], [30, L('30 minutes before', 'قبل ٣٠ دقيقة'), ''], [60, L('1 hour before', 'قبل ساعة'), L('Recommended', 'مقترح')], [120, L('2 hours before', 'قبل ساعتين'), '']];
  const d = dlg('brief-dlg', `<b class="mx-dlg-h">${L('Brief before lessons and meetings', 'موجز قبل الدروس والاجتماعات')}</b>
    <p class="muted fine">${L('Before each class, meeting or exam in your calendar: a quick review of the last lesson, or what was decided and what is still left from the last meeting. It rings even with the app closed.', 'قبل كل درس أو اجتماع أو اختبار في تقويمك: مراجعة سريعة للدرس السابق، أو ما قُرّر وما بقي من الاجتماع السابق. يصلك حتى والتطبيق مغلق.')}</p>
    <div class="mx-group">${opts.map(([m, a, b]) => `<button type="button" class="mx-row" data-m="${m}"><span class="mx-t"><b>${a}</b>${b ? `<small>${b}</small>` : ''}</span><span class="mx-x">${m === now ? '✓' : ''}</span></button>`).join('')}</div>
    <div class="row-gap" style="justify-content:flex-end;margin-top:12px"><button type="button" class="ghost" data-x>${L('Close', 'إغلاق')}</button></div>`);
  d.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { store.set('briefLead', Number(b.dataset.m)); d.close(); me(); window.JundBrief?.prepare(); window.JundCal?.pushSync?.(); });
  d.querySelector('[data-x]').onclick = () => d.close();
}
function pickField() {
  const now = store.get('field', 'general');
  const d = dlg('field-dlg', `<b class="mx-dlg-h">${L('Your field', 'مجالك')}</b>
    <p class="muted fine">${L('Mustatar writes your notes the way this field needs. You can change it any time.', 'يكتب مستطر ملاحظاتك بالطريقة التي يحتاجها هذا المجال، وتستطيع تغييره متى شئت.')}</p>
    <div class="mx-group">${Object.entries(FIELD_NAMES).map(([k, v]) => `<button type="button" class="mx-row" data-f="${k}"><span class="mx-t"><b>${v[0]}</b><small>${v[1]}</small></span><span class="mx-x">${k === now ? '✓' : ''}</span></button>`).join('')}</div>
    <div class="row-gap" style="justify-content:flex-end;margin-top:12px"><button type="button" class="ghost" data-x>${L('Close', 'إغلاق')}</button></div>`);
  d.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { store.set('field', b.dataset.f); d.close(); me(); window.JundCal?.toast?.(L('✓ Your next notes follow this field', '✓ ملاحظاتك القادمة تتبع هذا المجال')); });
  d.querySelector('[data-x]').onclick = () => d.close();
}
function editWords() {
  const d = dlg('words-dlg', `<b class="mx-dlg-h">${L('My words', 'كلماتي')}</b>
    <p class="muted fine">${L('Names, places and terms you use often (your teacher, your company, special terms). Mustatar listens for them in recordings and spells them exactly like this. One per line or separated by commas.', 'الأسماء والأماكن والمصطلحات التي تتكرر عندك (اسم شيخك، شركتك، مصطلحات خاصة). يسمعها مستطر في التسجيلات ويكتبها كما كتبتها هنا. كل كلمة في سطر أو بينها فواصل.')}</p>
    <textarea id="words-t" rows="7" dir="auto" placeholder="${L('e.g. Ibn Uthaymeen, Kulliyat al-Haram, ROI, Q3 report', 'مثال: ابن عثيمين، كلية الحرم، العائد على الاستثمار')}">${esc(store.get('myWords', ''))}</textarea>
    <div class="row-gap" style="justify-content:flex-end;margin-top:12px"><button type="button" class="ghost" data-x>${L('Cancel', 'إلغاء')}</button><button type="button" class="primary" data-s>${L('Save', 'حفظ')}</button></div>`);
  d.querySelector('[data-x]').onclick = () => d.close();
  d.querySelector('[data-s]').onclick = () => { store.set('myWords', d.querySelector('#words-t').value.trim().slice(0, 2000)); d.close(); me(); window.JundCal?.toast?.(L('✓ Saved', '✓ حُفظ')); };
}

/* ---------- wiring ---------- */
$('#tab-plus')?.addEventListener('click', openSheet);
// the Today screen: the ＋ button replaces the four quick buttons above the message box
document.body.classList.add('nav2');
window.JundNav = { me, openSheet, closeSheet, pickField, editWords };
})();
