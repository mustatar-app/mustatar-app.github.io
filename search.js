/* Mustatar — search everything (the 🔍 at the top): every screen, tool and setting of the app, your notes,
   My notes, tasks and calendar, habits, countdowns and past chats — in Arabic or English, one box, as you type.
   Arabic is matched without tashkeel and with أ/إ/آ = ا, ة = ه, ى = ي. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = () => window.ZadLang === 'ar';
const L = (en, ar) => AR() ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[̀-ͯ]/g, '');
const meRow = k => () => { J.show('me'); setTimeout(() => $(`#screen-me [data-k="${k}"]`)?.click(), 80); };
const calMode = m => () => { J.show('calendar'); setTimeout(() => $(`#cal-mode [data-m="${m}"], #cal-mode [data-mode="${m}"]`)?.click(), 60); };

// every place in the app: [English, Arabic, more words people may type, what it opens]
const PLACES = () => [
  ['Today', 'اليوم', 'home start main الرئيسية البداية', () => J.show('assistant')],
  ['Assistant chat', 'محادثة المساعد', 'ai ask chat ذكاء اسأل دردشة', () => { J.show('assistant'); setTimeout(() => $('#as-text')?.focus(), 80); }],
  ['Past chats', 'المحادثات السابقة', 'history conversations سجل', () => window.JundDrawer?.open()],
  ['Notes and lessons', 'الملاحظات والدروس', 'library lessons minutes المكتبة المحاضر', () => J.show('library')],
  ['My notes', 'ملاحظاتي', 'keep quick note memo list checklist قائمة', () => window.JundKeep?.open()],
  ['New note', 'ملاحظة جديدة', 'write note اكتب', () => window.JundKeep?.newNote()],
  ['Record a lesson or meeting', 'سجّل درسًا أو اجتماعًا', 'record voice microphone audio تسجيل صوت ميكروفون', () => window.JundFeatures?.record()],
  ['Upload a file to make notes', 'ارفع ملفًا لصنع ملاحظات', 'upload pdf file audio video رفع ملف', () => { J.show('new'); setTimeout(() => $('#file')?.click(), 60); }],
  ['Paste a link (YouTube, website, Drive)', 'الصق رابطًا (يوتيوب، موقع، درايف)', 'link url youtube website رابط', () => { J.show('new'); setTimeout(() => $('#yt')?.focus(), 60); }],
  ['Paste text', 'الصق نصًا', 'text paste لصق', () => { J.show('new'); const p = $('#paste-box'); if (p) p.open = true; }],
  ['Recordings and meetings', 'التسجيلات والاجتماعات', 'recordings meetings transcripts التسجيلات', () => J.show('recordings')],
  ['Calendar — agenda', 'التقويم — الأجندة', 'calendar schedule timetable التقويم الجدول المواعيد', calMode('agenda')],
  ['Tasks and deadlines', 'المهام والمواعيد', 'tasks todo deadline homework المهام الواجبات', calMode('tasks')],
  ['Week timetable', 'جدول الأسبوع', 'week timetable classes الأسبوع الحصص', calMode('week')],
  ['Month', 'الشهر', 'month الشهر', calMode('month')],
  ['Add a task or reminder', 'أضف مهمة أو تذكيرًا', 'add task reminder new أضف مهمة تذكير', () => window.JundCal?.open()],
  ['Plan for an exam', 'خطط لاختبار', 'exam test study plan اختبار امتحان مذاكرة', () => { J.show('calendar'); setTimeout(() => $('#plan-exam, [data-plan-exam]')?.click(), 80); }],
  ['Habit tracker', 'متابعة العادات', 'habits streak tracker العادات سلسلة', () => J.show('habits')],
  ['Your coach: SWOT and gap analysis', 'مدرّبك: تحليل SWOT والفجوة', 'coach swot gap analysis weakness strength مدرب تحليل ضعف قوة فجوة', () => { J.show('habits'); setTimeout(() => $('#hb-coach')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150); }],
  ['Self-review (by voice)', 'محاسبة النفس (بالصوت)', 'check in review day done evening self accountability muhasaba مراجعة اليوم أنجزت محاسبة النفس', () => window.JundCheckin?.open()],
  ['Weekly review', 'مراجعة الأسبوع', 'week review المراجعة', meRow('review')],
  ['Focus session', 'جلسة تركيز', 'focus pomodoro concentrate تركيز', () => window.JundFeatures?.openFocus()],
  ['Focus lock (stay in the app)', 'قفل التركيز (ابقَ في التطبيق)', 'lock block distraction airplane phone قفل حجب منع', () => window.JundLock?.open()],
  ['Alarm', 'المنبّه', 'alarm wake up clock منبه استيقاظ', () => window.JundAlarm?.open()],
  ['Timer and stopwatch', 'المؤقت وساعة الإيقاف', 'timer stopwatch مؤقت', () => window.JundCount?.open('timer')],
  ['Countdowns (Ramadan, Eid, exams)', 'العدّ التنازلي (رمضان، العيد، الاختبارات)', 'countdown ramadan eid عد تنازلي رمضان عيد', () => window.JundCount?.open('list')],
  ['Brief before lessons and meetings', 'موجز قبل الدروس والاجتماعات', 'brief before lesson meeting موجز', meRow('brief')],
  ['Left to do', 'ما تبقّى', 'pending left unfinished where I stopped ما تبقى توقفت', () => J.show('pending')],
  ['Reminders', 'التذكيرات', 'reminders notifications coming التذكيرات الإشعارات', () => J.show('inbox')],
  ['Studio: posts and stories', 'الاستوديو: منشورات وستوري', 'studio post story instagram carousel image ستوري منشور صورة', () => J.show('studio')],
  ['Prayer times', 'أوقات الصلاة', 'prayer salah adhan times qibla fajr dhuhr asr maghrib isha الصلاة الأذان الفجر الظهر العصر المغرب العشاء', meRow('pin')],
  ['Plan and usage', 'الخطة والاستخدام', 'plan usage limits subscription الخطة الاستخدام الحدود اشتراك', () => window.JundPlan?.usage()],
  ['Text size', 'حجم النص', 'font size big small large text الخط حجم كبير صغير', meRow('sun')],
  ['Theme: light or dark', 'المظهر: فاتح أو داكن', 'theme dark light night day mode المظهر داكن فاتح ليلي', meRow('sun')],
  ['Language: Arabic / English', 'اللغة: عربي / إنجليزي', 'language arabic english اللغة عربي انجليزي', meRow('user')],
  ['Profile and languages', 'الملف الشخصي واللغات', 'profile name about me الملف الاسم', meRow('user')],
  ['Your field', 'مجالك', 'field medicine law business مجال', meRow('field')],
  ['My words (names and terms)', 'كلماتي (أسماء ومصطلحات)', 'words vocabulary spelling names كلماتي', meRow('words')],
  ['Tools on or off', 'تشغيل الأدوات وإيقافها', 'tools features الأدوات', meRow('tools')],
  ['Account and privacy', 'الحساب والخصوصية', 'account sign in login privacy password الحساب الدخول الخصوصية', meRow('shield')],
  ['Saving and backup', 'الحفظ والنسخ الاحتياطي', 'backup save export download sync النسخ الاحتياطي حفظ مزامنة', meRow('save')],
  ['Bring notes from Keep, Samsung Notes, Drive…', 'انقل ملاحظاتك من Keep وSamsung Notes وDrive…', 'import samsung keep drive evernote notion phone notes استيراد نقل ملاحظات الهاتف', () => window.JundImport?.open()],
  ['Save to Google Drive', 'احفظ في Google Drive', 'google drive save export upload درايف حفظ', () => window.JundDrive?.help()],
  ['This phone: widgets, calendar, steps', 'هذا الهاتف: الأدوات والتقويم والخطوات', 'widget phone calendar fitness steps health أداة الهاتف خطوات', () => { J.show('settings'); setTimeout(() => $('#ph-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120); }],
  ['Send feedback', 'أرسل ملاحظة', 'feedback bug problem report مشكلة خطأ ملاحظة', meRow('send')],
  ['Welcome tour', 'جولة الترحيب', 'tour intro help start جولة مساعدة', meRow('tour')],
  ['All settings', 'كل الإعدادات', 'settings preferences الإعدادات', () => J.show('settings')],
];

let box, timer = 0;
function open() {
  if (!box) build();
  const tt = document.getElementById('toast'); if (tt && !tt.hidden) tt.click();   // a message would cover the search box
  box.hidden = false; document.body.classList.add('sr-open');
  requestAnimationFrame(() => { box.classList.add('in'); const i = $('#sr-q', box); i.value = ''; run(''); setTimeout(() => i.focus(), 60); });
}
function close() { if (!box) return; box.classList.remove('in'); document.body.classList.remove('sr-open'); setTimeout(() => { box.hidden = true; }, 160); }
function build() {
  box = document.createElement('div'); box.className = 'sr'; box.hidden = true; box.setAttribute('data-noi18n', ''); box.dir = AR() ? 'rtl' : 'ltr';
  box.innerHTML = `<div class="sr-bar"><button type="button" class="icon-btn" id="sr-x" aria-label="${L('Close', 'إغلاق')}">${AR() ? '→' : '←'}</button>
    <input id="sr-q" type="search" dir="auto" autocomplete="off" placeholder="${L('Search everything: notes, tasks, habits, settings…', 'ابحث في كل شيء: الملاحظات والمهام والعادات والإعدادات…')}"></div>
    <div class="sr-body" id="sr-body"></div>`;
  document.body.appendChild(box);
  $('#sr-x', box).onclick = close;
  $('#sr-q', box).oninput = e => { clearTimeout(timer); timer = setTimeout(() => run(e.target.value), 120); };
  $('#sr-q', box).onkeydown = e => { if (e.key === 'Enter') $('.sr-it', box)?.click(); if (e.key === 'Escape') close(); };
}
// a word matches with or without the Arabic article and the small joined words (ال، لل، بال، وال، فال)
const stem = w => w.length > 4 ? w.replace(/^(وال|فال|بال|كال|لل|ال)/, '') : w;
const hit = (q, ...parts) => { const t = norm(parts.join(' ')); return q.split(/\s+/).filter(Boolean).every(w => t.includes(w) || t.includes(stem(w))); };
function snippet(text, q) {
  const t = String(text || '').replace(/\s+/g, ' '), n = norm(t), w = q.split(/\s+/)[0] || '', i = w ? n.indexOf(w) : -1;
  if (i < 0) return esc(t.slice(0, 90));
  const a = Math.max(0, i - 35); return (a ? '…' : '') + esc(t.slice(a, i + 70)) + '…';
}
async function run(raw) {
  const body = $('#sr-body', box), q = norm(raw.trim());
  const groups = [];
  const places = PLACES().filter(p => !q || hit(q, p[0], p[1], p[2]));
  if (!q) {
    groups.push([L('Go to', 'انتقل إلى'), places.slice(0, 12).map(p => ({ t: AR() ? p[1] : p[0], i: '↗', go: p[3] }))]);
    paint(body, groups, ''); return;
  }
  if (places.length) groups.push([L('In the app', 'في التطبيق'), places.slice(0, 8).map(p => ({ t: AR() ? p[1] : p[0], i: '↗', go: p[3] }))]);
  const evs = (window.JundCal?.events?.() || []).filter(e => hit(q, e.title, e.notes, e.type, e.project)).slice(0, 8);
  if (evs.length) groups.push([L('Tasks and calendar', 'المهام والتقويم'), evs.map(e => ({ t: e.title, s: [e.date || L('no date', 'بلا تاريخ'), e.time, e.done ? '✓' : ''].filter(Boolean).join(' · '), i: e.done ? '☑' : '☐', go: () => window.JundCal?.open(e.id) }))]);
  const hs = (store.get('habits', []) || []).filter(h => hit(q, h.name, h.target)).slice(0, 6);
  if (hs.length) groups.push([L('Habits', 'العادات'), hs.map(h => ({ t: h.name, s: h.target || '', i: '◎', go: () => J.show('habits') }))]);
  const als = (window.JundAlarm?.all?.() || []).filter(a => hit(q, a.label, a.time, L('alarm', 'منبه'))).slice(0, 4);
  if (als.length) groups.push([L('Alarms', 'المنبّهات'), als.map(a => ({ t: `${a.time}${a.label ? ' · ' + a.label : ''}`, s: a.on === false ? L('off', 'متوقف') : L('on', 'مفعّل'), i: '⏰', go: () => window.JundAlarm?.open() }))]);
  const cds = (window.JundCount?.list?.() || []).filter(c => hit(q, c.title || c.name)).slice(0, 4);
  if (cds.length) groups.push([L('Countdowns', 'العدّ التنازلي'), cds.map(c => ({ t: c.title || c.name, s: c.date || '', i: '⏳', go: () => window.JundCount?.open('list') }))]);
  paint(body, groups, q, true);
  // notes and chats take a moment (they are read from the phone's storage)
  const [lessons, keep] = await Promise.all([J.allLessons().catch(() => []), window.JundKeep?.all?.().catch(() => []) || []]);
  if (norm($('#sr-q', box)?.value.trim()) !== q) return;
  const text = l => [l.notes?.title, l.unit, l.subject?.name, ...(l.notes?.sections || []).flatMap(s => [s.heading, ...(s.blocks || []).map(b => b.text || (b.items || []).join(' '))])].join(' ');
  const ls = lessons.filter(l => !l.draft && hit(q, text(l))).slice(0, 8);
  if (ls.length) groups.push([L('Notes and lessons', 'الملاحظات والدروس'), ls.map(l => ({ t: l.notes?.title || l.unit || L('Notes', 'ملاحظات'), s: [l.subject?.name, (l.date || '').slice(0, 10)].filter(Boolean).join(' · '), x: snippet(text(l), q), i: '📄', go: () => J.openLesson(l.id) }))]);
  const kp = (keep || []).filter(n => !n.trashed && hit(q, n.title, n.text, ...(n.items || []).map(i => i.t), ...(n.labels || []))).slice(0, 8);
  if (kp.length) groups.push([L('My notes', 'ملاحظاتي'), kp.map(n => ({ t: n.title || String(n.text || '').split('\n')[0].slice(0, 60) || L('Note', 'ملاحظة'), x: snippet([n.text, ...(n.items || []).map(i => i.t)].join(' '), q), i: '🗒', go: () => { window.JundKeep?.open(); setTimeout(() => window.JundKeep?.edit(n.id), 120); } }))]);
  const ch = (window.JundAssistant?.chats?.() || []).filter(c => hit(q, c.title, c.summary, ...(c.log || []).map(m => m.text))).slice(0, 6);
  if (ch.length) groups.push([L('Past chats', 'المحادثات السابقة'), ch.map(c => ({ t: c.title || L('Chat', 'محادثة'), x: snippet((c.log || []).map(m => m.text).join(' '), q), i: '💬', go: () => { J.show('assistant'); window.JundAssistant?.openChat(c.id); } }))]);
  paint(body, groups, q, false);
}
function paint(body, groups, q, more) {
  const items = [];
  body.innerHTML = groups.length ? groups.map(([h, list]) => `<div class="sr-h">${h}</div>${list.map(it => { items.push(it); return `<button type="button" class="sr-it" data-n="${items.length - 1}"><span class="sr-i">${it.i || '•'}</span><span class="sr-t"><b dir="auto">${esc(it.t)}</b>${it.s ? `<small dir="auto">${esc(it.s)}</small>` : ''}${it.x ? `<small class="sr-x" dir="auto">${it.x}</small>` : ''}</span></button>`; }).join('')}`).join('')
    + (more ? `<div class="sr-more">${L('Searching your notes…', 'أبحث في ملاحظاتك…')}</div>` : '')
    : more ? `<div class="sr-more">${L('Searching…', 'أبحث…')}</div>` : `<div class="sr-none">${L('Nothing found. Try another word — or ask the assistant.', 'لم أجد شيئًا. جرّب كلمة أخرى — أو اسأل المساعد.')}${q ? `<button type="button" class="ghost small" id="sr-ask">${L('Ask the assistant', 'اسأل المساعد')}</button>` : ''}</div>`;
  $$('.sr-it', body).forEach(b => b.onclick = () => { const it = items[Number(b.dataset.n)]; close(); setTimeout(() => it.go(), 60); });
  const ask = $('#sr-ask', body); if (ask) ask.onclick = () => { const v = $('#sr-q', box).value; close(); J.show('assistant'); const t = $('#as-text'); if (t) { t.value = v; t.dispatchEvent(new Event('input')); t.focus(); } };
}

const btn = $('#top-search');
if (btn) { btn.onclick = open; btn.setAttribute('aria-label', L('Search everything', 'ابحث في كل شيء')); }
window.JundSearch = { open, close, isOpen: () => !!box && !box.hidden };
})();
