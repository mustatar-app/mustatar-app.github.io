/* Mustatar — Studio: put Arabic and English text on a photo, a video or a colour, in ready Instagram-style looks.
   Every text can be saved with its look and put back with one tap. Also: post ideas from the week's notes.
   Everything runs on the phone; only "Post ideas" uses the internet. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const screen = $('#screen-studio');

const FONTS = {
  modern: { name: 'Modern', css: "'IBM Plex Sans Arabic', system-ui, sans-serif", w: 700 },
  cairo: { name: 'Cairo', css: "'Cairo', 'Poppins', sans-serif", w: 700 },
  tajawal: { name: 'Tajawal', css: "'Tajawal', 'Montserrat', sans-serif", w: 700 },
  naskh: { name: 'Naskh', css: "'Amiri', 'IBM Plex Sans Arabic', serif", w: 700 },
  scheh: { name: 'Scheherazade', css: "'Scheherazade New', 'Lora', serif", w: 700 },
  kufi: { name: 'Kufi', css: "'Reem Kufi', 'IBM Plex Sans Arabic', sans-serif", w: 700 },
  changa: { name: 'Bold Kufi', css: "'Changa', 'Oswald', sans-serif", w: 700 },
  messiri: { name: 'Display', css: "'El Messiri', 'Playfair Display', serif", w: 700 },
  ruqaa: { name: 'Handwritten', css: "'Caveat', 'Aref Ruqaa', cursive", w: 700 },
  marhey: { name: 'Fun', css: "'Marhey', 'Pacifico', cursive", w: 600 },
  heavy: { name: 'Heavy', css: "'Lalezar', 'Anton', 'IBM Plex Sans Arabic', sans-serif", w: 400 },
  poster: { name: 'Poster', css: "'Rakkas', 'Bebas Neue', sans-serif", w: 400 },
  type: { name: 'Typewriter', css: "'Special Elite', 'IBM Plex Sans Arabic', monospace", w: 400 },
  elegant: { name: 'Elegant', css: "'Playfair Display', 'Amiri', serif", w: 700 },
};
const LOOKS = {
  classic: { name: 'Classic', font: 'modern' },
  box: { name: 'Strong box', font: 'modern', box: 'solid' },
  soft: { name: 'Soft box', font: 'modern', box: 'soft' },
  outline: { name: 'Outline', font: 'heavy', outline: true },
  neon: { name: 'Neon', font: 'kufi', neon: true },
  type: { name: 'Typewriter', font: 'type', box: 'paper' },
  hand: { name: 'Handwritten', font: 'ruqaa' },
  elegant: { name: 'Elegant', font: 'elegant' },
};
const COLORS = ['#ffffff', '#111111', '#4f8cff', '#ff5a5f', '#ffcc00', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6'];
const BGS = {
  navy: ['#0b1324', '#1f3b73'], night: ['#0f0f12', '#2b2b33'], ocean: ['#0ea5e9', '#1e3a8a'], sunset: ['#f97316', '#be185d'],
  mint: ['#34d399', '#065f46'], paper: ['#f6efe0', '#e6d9be'], rose: ['#fda4af', '#9f1239'], gold: ['#facc15', '#a16207'],
};
const SIZES = { story: [1080, 1920, 'Story 9:16'], post: [1080, 1350, 'Post 4:5'], square: [1080, 1080, 'Square'] };

/* ---------- state ---------- */
let size = store.get('studioSize', 'story');
let bg = { kind: 'color', key: 'navy' };   // or { kind: 'image', img } / { kind: 'video', video }
let layers = [], sel = null, built = false, fontsLoaded = false;
let trim = { start: 0, end: 0 };
const newId = () => 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
// Arabic without harakat (also the small Quran marks), for easy reading or when the marks come out jumbled
const noHarakat = t => String(t).replace(/\u0640\u0670/g, 'ا').replace(/\u0671/g, 'ا').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '');
window.noHarakat = noHarakat;
let harakat = store.get('studioHarakat', true);
const shown = l => harakat ? (l.text || '') : noHarakat(l.text || '');
const isAr = t => (String(t).match(/[؀-ۿ]/g) || []).length > (String(t).match(/[A-Za-z]/g) || []).length;

function loadFonts() {
  if (fontsLoaded) return Promise.resolve();
  fontsLoaded = true;
  const l = document.createElement('link'); l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@700&family=Aref+Ruqaa:wght@700&family=Lalezar&family=Caveat:wght@700&family=Special+Elite&family=Playfair+Display:wght@700&family=Anton'
    + '&family=Cairo:wght@700&family=Poppins:wght@700&family=Tajawal:wght@700&family=Montserrat:wght@700&family=Scheherazade+New:wght@700&family=Lora:wght@700'
    + '&family=Changa:wght@700&family=Oswald:wght@700&family=El+Messiri:wght@700&family=Marhey:wght@600&family=Pacifico&family=Rakkas&family=Bebas+Neue&display=swap';
  document.head.appendChild(l);
  return new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 4000); })
    .then(() => Promise.all(['700 40px "Reem Kufi"', '700 40px "Aref Ruqaa"', '40px Lalezar', '700 40px Caveat', '40px "Special Elite"', '700 40px "Playfair Display"', '700 40px Amiri', '700 40px "IBM Plex Sans Arabic"',
      '700 40px Cairo', '700 40px Tajawal', '700 40px "Scheherazade New"', '700 40px Changa', '700 40px "El Messiri"', '600 40px Marhey', '40px Rakkas', '40px "Bebas Neue"', '40px Pacifico', '700 40px Poppins', '700 40px Montserrat', '700 40px Oswald']
      .map(f => document.fonts.load(f, 'Aa بسم').catch(() => {}))))
    .then(() => draw());
}

/* ---------- the screen: a full-screen editor like Instagram's ---------- */
const AR = window.ZadLang === 'ar';
const L = (en, ar) => AR ? ar : en;
const FONT_AR = { modern: 'عصري', cairo: 'القاهرة', tajawal: 'تجوال', naskh: 'نسخ', scheh: 'شهرزاد', kufi: 'كوفي', changa: 'كوفي عريض', messiri: 'عرض', ruqaa: 'رقعة', marhey: 'مرح', heavy: 'عريض', poster: 'ملصق', type: 'آلة كاتبة', elegant: 'أنيق' };
// the text styles that the "A" button goes through, like Instagram
const STYLE_CYCLE = ['classic', 'box', 'soft', 'type', 'outline', 'neon'];
const STYLE_AR = { classic: 'عادي', box: 'صندوق', soft: 'صندوق شفاف', type: 'ورقة', outline: 'محدد', neon: 'نيون', hand: 'رقعة', elegant: 'أنيق' };
const ic = d => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>', undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  cmp: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  bg: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16"/>', star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  tr: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
  ideas: '<path d="M12 3c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6z"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  alS: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', alC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', alE: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
let editing = null, sheetOpen = null;

function build() {
  built = true;
  screen.innerHTML = `
  <div class="sx" dir="${AR ? 'rtl' : 'ltr'}">
    <div class="sx-top">
      <button type="button" class="sx-ic" id="st-back" aria-label="${L('Close Studio', 'إغلاق الاستوديو')}">${ic(IC.close)}</button>
      <div class="sx-seg" id="st-size">${Object.entries(SIZES).map(([k, v]) => `<button type="button" data-k="${k}">${AR ? { story: 'ستوري ٩:١٦', post: 'منشور ٤:٥', square: 'مربع' }[k] : v[2]}</button>`).join('')}</div>
      <span class="sx-gap"></span>
      <button type="button" class="sx-ic" id="st-undo" aria-label="${L('Undo', 'تراجع')}" disabled>${ic(IC.undo)}</button>
      <button type="button" class="sx-ic" id="st-cmp" aria-label="${L('Hold to compare', 'اضغط مطولًا للمقارنة')}">${ic(IC.cmp)}</button>
    </div>
    <div class="sx-stage" id="st-stage">
      <div class="st-canvas-wrap" id="st-wrap">
        <canvas id="st-canvas"></canvas>
        <div class="sx-sel" id="st-sel" hidden>
          <button type="button" class="sx-h sx-del" id="st-sel-del" aria-label="${L('Remove this text', 'احذف هذا النص')}">×</button>
          <span class="sx-h sx-w" data-h="w" title="${L('Drag to make the box wider or narrower', 'اسحب لتوسيع الصندوق أو تضييقه')}">↔</span>
          <span class="sx-h sx-s" data-h="s" title="${L('Drag to make the text bigger or smaller', 'اسحب لتكبير النص أو تصغيره')}">⤡</span>
        </div>
        <div class="sx-hint" id="st-hint">${L('Tap Aa to write · drag to move · pinch to resize', 'اضغط Aa للكتابة · اسحب للتحريك · قرّب الإصبعين للتكبير')}</div>
        <div class="sx-trash" id="st-trash" hidden>${ic(IC.trash)}</div>
      </div>
      <div class="sx-rail">
        <button type="button" class="sx-r" id="st-add"><b class="sx-aa">Aa</b><small>${L('Text', 'نص')}</small></button>
        <label class="sx-r"><input type="file" id="st-media" accept="image/*,video/*" hidden>${ic(IC.photo)}<small>${L('Photo', 'صورة')}</small></label>
        <button type="button" class="sx-r" id="st-bg-btn">${ic(IC.bg)}<small>${L('Colour', 'خلفية')}</small></button>
        <button type="button" class="sx-r sx-saved-btn" id="st-saved-btn">${ic(IC.star)}<small>${L('Saved', 'المحفوظة')}</small><i class="sx-n" id="st-saved-n"></i></button>
        <button type="button" class="sx-r" id="st-tr">${ic(IC.tr)}<small>${L('Translate', 'ترجمة')}</small></button>
        <button type="button" class="sx-r" id="st-design">${ic(IC.ideas)}<small>${L('Ideas', 'أفكار')}</small></button>
        <button type="button" class="sx-r" id="st-more">${ic(IC.more)}<small>${L('More', 'المزيد')}</small></button>
      </div>
    </div>
    <!-- the video trimmer, like WhatsApp and Instagram: frames in a strip, drag the two handles to keep a part,
         tap the strip to jump, play to watch the part with a line moving along it -->
    <div id="st-trim" class="sx-trim" hidden>
      <div class="tr-wrap" dir="ltr">
        <button type="button" class="tr-play" id="st-play" aria-label="${L('Play the part', 'شغّل الجزء')}">▶</button>
        <div class="tr-strip" id="tr-strip" aria-label="${L('Video timeline: drag the handles to choose the part to keep', 'شريط الفيديو: اسحب الطرفين لاختيار الجزء الذي تبقيه')}">
          <canvas id="tr-thumbs"></canvas>
          <div class="tr-dim" id="tr-dl"></div><div class="tr-dim" id="tr-dr"></div>
          <div class="tr-win" id="tr-win"><span class="tr-h" id="tr-h0" role="slider" tabindex="0" aria-label="${L('Start', 'البداية')}"></span><span class="tr-h" id="tr-h1" role="slider" tabindex="0" aria-label="${L('End', 'النهاية')}"></span></div>
          <div class="tr-head" id="tr-head"></div>
        </div>
      </div>
      <div class="tr-times" dir="ltr"><b id="st-t0v"></b><span id="st-len"></span><b id="st-t1v"></b></div>
      <input type="range" id="st-t0" min="0" step="0.1" hidden><input type="range" id="st-t1" min="0" step="0.1" hidden>
    </div>
    <div class="sx-bottom">
      <button type="button" class="ghost small" id="st-draft">${L('Save draft', 'حفظ مسودة')}</button>
      <span class="sx-gap"></span>
      <button type="button" class="ghost" id="st-share">${L('Share', 'مشاركة')}</button>
      <button type="button" class="primary" id="st-export">Save image</button>
    </div>
    <div class="progress small" id="st-progress" hidden><div class="spinner" aria-hidden="true"></div><div id="st-progress-text">Making the video…</div></div>
    <div class="muted sx-status" id="st-status" aria-live="polite"></div>
  </div>

  <div class="sx-edit" id="st-edit" hidden dir="${AR ? 'rtl' : 'ltr'}">
    <div class="sx-edit-top">
      <button type="button" class="sx-ic" id="st-align" aria-label="${L('Alignment', 'المحاذاة')}"></button>
      <button type="button" class="sx-ic sx-colorbtn" id="st-color-btn" aria-label="${L('Colour', 'اللون')}"><i></i></button>
      <button type="button" class="sx-ic sx-stylebtn" id="st-look" aria-label="${L('Text style', 'نمط النص')}">A</button>
      <button type="button" class="sx-ic sx-hk" id="st-hk" aria-label="${L('Arabic marks (harakat)', 'التشكيل')}">${L('Harakat', 'التشكيل')}</button>
      <span class="sx-gap"></span>
      <button type="button" class="sx-ic" id="st-save-text" aria-label="${L('Save this text', 'احفظ هذا النص')}">${ic(IC.star)}</button>
      <button type="button" class="sx-done" id="st-done">${L('Done', 'تم')}</button>
    </div>
    <div class="sx-edit-mid">
      <input type="range" id="st-size-r" class="sx-vsize" min="0.03" max="0.16" step="0.002" aria-label="${L('Size', 'الحجم')}">
      <textarea id="st-text" rows="3" dir="auto" placeholder="${L('Write here…', 'اكتب هنا…')}"></textarea>
    </div>
    <div class="sx-style-name" id="st-style-name"></div>
    <div class="sx-colors" id="st-colors" hidden>${COLORS.map(c => `<button type="button" class="sw" data-color="${c}" aria-label="colour ${c}" style="background:${c}"></button>`).join('')}</div>
    <div class="sx-fonts" id="st-fonts">${Object.entries(FONTS).map(([k, v]) => `<button type="button" class="sx-font" data-font="${k}" style="font-family:${v.css};font-weight:${v.w}">${AR ? FONT_AR[k] : v.name}</button>`).join('')}</div>
  </div>

  <div class="sx-sheet" id="st-sheet" hidden><div class="sx-sheet-panel" role="dialog" aria-modal="true"><div class="px-grip"></div><div id="st-sheet-body"></div></div></div>

  <div hidden id="st-holders">
    <div id="sh-saved"><div class="row-between"><b class="sx-sh-h">${L('Saved texts', 'النصوص المحفوظة')}</b><small class="muted">${L('Tap to put on the picture', 'اضغط لوضعه على الصورة')}</small></div><div class="sx-saved" id="st-saved"></div></div>
    <div id="sh-bg"><b class="sx-sh-h">${L('Background colour', 'لون الخلفية')}</b><div class="st-bgs" id="st-bgs">${Object.entries(BGS).map(([k, c]) => `<button type="button" class="sw" data-bg="${k}" aria-label="${k} background" style="background:linear-gradient(135deg,${c[0]},${c[1]})"></button>`).join('')}</div>
      <button type="button" class="ghost small danger" id="st-rmbg" hidden>${L('Remove photo', 'إزالة الصورة')}</button></div>
    <div id="sh-ideas"><b class="sx-sh-h">${L('Design ideas', 'أفكار تصميم')}</b><div id="st-design-list"></div></div>
    <div id="sh-more">
      <div class="row-gap"><button type="button" class="ghost small" id="st-new">${L('New design', 'تصميم جديد')}</button></div>
      <div class="sx-sec"><b class="sx-sh-h">${L('Drafts', 'المسودات')}</b><div id="st-drafts"></div></div>
      <div class="sx-sec"><b class="sx-sh-h">${L('Carousel', 'كاروسيل (عدة شرائح)')}</b>
        <p class="muted fine" style="margin:0 0 8px">${L('One slide per paragraph (leave an empty line between slides). Each slide uses the look, font, colour and background chosen above.', 'شريحة لكل فقرة (اترك سطرًا فارغًا بين الشرائح). كل شريحة تأخذ الشكل والخط واللون والخلفية المختارة.')}</p>
        <textarea id="st-car" rows="5" dir="auto" placeholder="${L('Slide 1 text', 'نص الشريحة ١')}&#10;&#10;${L('Slide 2 text', 'نص الشريحة ٢')}"></textarea>
        <div class="row-gap" style="margin-top:8px"><button type="button" class="ghost small" id="st-car-ai">${L('Write slides from my last note', 'اكتب الشرائح من آخر ملاحظاتي')}</button><button type="button" class="primary small" id="st-car-go">${L('Make the carousel', 'اصنع الكاروسيل')}</button></div>
        <small class="muted" id="st-car-st"></small></div>
      <div class="sx-sec"><b class="sx-sh-h">${L('Saved captions — tap to copy', 'تعليقات محفوظة — اضغط للنسخ')}</b><div id="st-caps"></div>
        <textarea id="st-cap-new" rows="2" dir="auto" placeholder="${L('Write a caption or hashtags to keep', 'اكتب تعليقًا أو وسومًا لحفظها')}"></textarea>
        <button type="button" class="ghost small" id="st-cap-save">${L('Save caption', 'احفظ التعليق')}</button></div>
      <div class="sx-sec"><div class="row-between"><b class="sx-sh-h">${L('Post ideas from your notes', 'أفكار منشورات من ملاحظاتك')}</b><button type="button" class="ghost small" id="st-ideas">${L('Get ideas', 'اقترح أفكارًا')}</button></div>
        <div id="st-ideas-list" class="muted" style="margin-top:8px">${L('Ideas for your page from what you studied this week. Tap “Use” to put the hook on the picture.', 'أفكار لصفحتك مما درسته هذا الأسبوع. اضغط «استخدم» لوضع العبارة على الصورة.')}</div></div>
    </div>
  </div>`;

  const cv = $('#st-canvas');
  cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  $$('#st-sel [data-h]').forEach(h => { h.addEventListener('pointerdown', handleDown); h.addEventListener('pointermove', handleMove); h.addEventListener('pointerup', handleUp); h.addEventListener('pointercancel', handleUp); });
  $('#st-sel-del').onclick = e => { e.stopPropagation(); if (!sel) return; snap(); removeLayer(sel); };
  $('#st-back').onclick = () => { if (!closeLayer()) window.JundBack?.(); };
  $$('#st-size button').forEach(b => b.onclick = () => { size = b.dataset.k; store.set('studioSize', size); sync(); draw(); });
  $$('#st-bgs [data-bg]').forEach(b => b.onclick = () => { snap(); stopVideo(); bg = { kind: 'color', key: b.dataset.bg }; sync(); draw(); });
  $('#st-media').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) { try { loadMedia(f); } catch (err) { status('✗ ' + err.message); window.JundReport?.problem('studio media: ' + err.message); } } };
  $('#st-add').onclick = () => { const l = addLayer({ text: '' }); openEditor(l); };
  $('#st-text').onfocus = snap;
  $('#st-text').oninput = () => { const l = editing || sel || addLayer({ text: '' }); l.text = $('#st-text').value; draw(); };
  $('#st-done').onclick = closeEditor;
  $('#st-edit').addEventListener('click', e => { if (e.target.id === 'st-edit') closeEditor(); });
  $('#st-look').onclick = () => { const l = editing || sel; if (!l) return; snap(); const i = STYLE_CYCLE.indexOf(l.look); l.look = STYLE_CYCLE[(i + 1) % STYLE_CYCLE.length]; if (l.look === 'type') l.font = 'type'; else if (l.font === 'type') l.font = 'modern'; syncEditor(); draw(); };
  $('#st-color-btn').onclick = () => { const c = $('#st-colors'); c.hidden = !c.hidden; };
  $$('#st-fonts [data-font]').forEach(b => b.onclick = () => { const l = editing || sel; if (!l) return; snap(); l.font = b.dataset.font; syncEditor(); draw(); b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });
  $$('#st-colors [data-color]').forEach(b => b.onclick = () => { const l = editing || sel; if (!l) return; snap(); l.color = b.dataset.color; syncEditor(); draw(); });
  $('#st-size-r').onpointerdown = snap;
  $('#st-size-r').oninput = () => { const l = editing || sel; if (!l) return; l.size = Number($('#st-size-r').value); syncEditor(); draw(); };
  $('#st-align').onclick = () => { const l = editing || sel; if (!l) return; snap(); l.align = { center: 'start', start: 'end', end: 'center' }[l.align || 'center']; syncEditor(); draw(); };
  $('#st-hk').onclick = () => { harakat = !harakat; store.set('studioHarakat', harakat); syncEditor(); draw(); };
  $('#st-save-text').onclick = () => { const l = editing || sel; if (l?.text.trim()) { saveText(l); window.JundCal?.toast(L('★ Saved — find it under “Saved”', '★ حُفظ — تجده في «المحفوظة»')); } };
  $('#st-undo').onclick = undo;
  const cmp = on => { comparing = on; draw(); };
  $('#st-cmp').onpointerdown = () => cmp(true); $('#st-cmp').onpointerup = $('#st-cmp').onpointerleave = $('#st-cmp').onpointercancel = () => cmp(false);
  $('#st-rmbg').onclick = () => { snap(); stopVideo(); bg = { kind: 'color', key: 'navy' }; sync(); draw(); };
  $('#st-draft').onclick = saveDraft;
  $('#st-new').onclick = () => { snap(); stopVideo(); bg = { kind: 'color', key: 'navy' }; layers = []; sel = null; draftId = null; closeSheet(); sync(); draw(); };
  $('#st-saved-btn').onclick = () => openSheet('saved');
  $('#st-bg-btn').onclick = () => openSheet('bg');
  $('#st-more').onclick = () => openSheet('more');
  $('#st-sheet').addEventListener('click', e => { if (e.target.id === 'st-sheet') closeSheet(); });
  renderDrafts();
  $('#st-export').onclick = () => exportIt(false);
  $('#st-share').onclick = () => exportIt(true);
  $('#st-ideas').onclick = ideas;
  $('#st-tr').onclick = translate;
  $('#st-design').onclick = () => { openSheet('ideas'); designIdeas(); };
  $('#st-cap-save').onclick = () => { const t = $('#st-cap-new').value.trim(); if (t) { saveCaption(t); $('#st-cap-new').value = ''; } };
  renderCaps();
  $('#st-car-go').onclick = carousel;
  $('#st-car-ai').onclick = carouselFromNote;
  ['st-t0', 'st-t1'].forEach(id => $('#' + id).oninput = () => {
    trim.start = Math.min(Number($('#st-t0').value), Number($('#st-t1').value) - 0.5);
    trim.end = Math.max(Number($('#st-t1').value), trim.start + 0.5);
    showTrim(); if (bg.video) { bg.video.currentTime = id === 'st-t0' ? trim.start : trim.end; }
  });
  $('#st-play').onclick = () => {
    const v = bg.video; if (!v) return;
    if (!v.paused) { v.pause(); playIcon(); return; }
    if (v.currentTime < trim.start || v.currentTime >= trim.end - 0.05) v.currentTime = trim.start;
    v.muted = false; v.play().then(playIcon, playIcon); loop();
  };
  trimmer();
  window.addEventListener('resize', () => { if (!screen.hidden) { fit(); placeSel(); } });
  sync(); renderSaved(); draw();
}

/* the bottom sheets: Saved texts, Background, Design ideas, More (the parts are moved in, never rebuilt, so nothing is lost) */
function openSheet(which) {
  closeSheet();
  const body = $('#st-sheet-body'), part = $('#sh-' + which); if (!part) return;
  body.appendChild(part); sheetOpen = which;
  const sh = $('#st-sheet'); sh.hidden = false; requestAnimationFrame(() => sh.classList.add('in'));
  if (which === 'saved') renderSaved();
  if (which === 'more') renderDrafts();
}
function closeSheet() {
  const sh = $('#st-sheet'); if (!sh || sh.hidden) return false;
  const body = $('#st-sheet-body'); [...body.children].forEach(c => $('#st-holders').appendChild(c));
  sh.classList.remove('in'); sh.hidden = true; sheetOpen = null; return true;
}
// for the phone's back button: close what is open in Studio first
function closeLayer() { if (editing) { closeEditor(); return true; } if (closeSheet()) return true; if (sel) { sel = null; sync(); draw(); return true; } return false; }

/* the text editor, over the picture */
function openEditor(l) {
  closeSheet();
  editing = l; sel = l;
  const ed = $('#st-edit'); ed.hidden = false;
  $('#st-text').value = l.text || '';
  $('#st-colors').hidden = true;
  syncEditor(); draw();
  setTimeout(() => { const t = $('#st-text'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, 30);
}
function closeEditor() {
  if (!editing) return;
  const l = editing; editing = null;
  $('#st-edit').hidden = true;
  $('#st-text').blur();
  if (!l.text.trim()) { layers = layers.filter(x => x !== l); sel = layers.at(-1) || null; }
  sync(); draw();
}
function syncEditor() {
  const l = editing || sel; if (!l) return;
  const f = FONTS[l.font] || FONTS.modern, t = $('#st-text');
  // the writing box looks like the text will look on the picture (its colour, box and glow)
  const look = LOOKS[l.look] || LOOKS.classic;
  t.style.fontFamily = f.css; t.style.fontWeight = f.w;
  t.style.background = look.box === 'soft' ? 'rgba(0,0,0,.55)' : look.box === 'paper' ? '#fffdf5' : look.box ? l.color : 'transparent';
  t.style.color = look.box === 'solid' ? (lum(l.color) > 0.6 ? '#111111' : '#ffffff') : look.box === 'soft' ? '#ffffff' : look.box === 'paper' ? '#1a1a1a' : look.neon ? '#ffffff' : l.color;
  t.style.textShadow = look.neon ? `0 0 10px ${l.color}, 0 0 22px ${l.color}` : look.box ? 'none' : '0 1px 6px rgba(0,0,0,.6)';
  t.style.webkitTextStroke = look.outline ? `1px ${l.color}` : '';
  if (look.outline) t.style.color = lum(l.color) > 0.6 ? '#111111' : '#ffffff';
  t.style.textAlign = l.align === 'start' ? 'start' : l.align === 'end' ? 'end' : 'center';
  t.style.fontSize = Math.max(18, Math.min(40, l.size * 330)) + 'px';
  $('#st-align').innerHTML = ic({ start: IC.alS, center: IC.alC, end: IC.alE }[l.align || 'center']);
  $('#st-color-btn i').style.background = l.color;
  $('#st-look').classList.toggle('on', l.look !== 'classic');
  $('#st-style-name').textContent = AR ? (STYLE_AR[l.look] || '') : (LOOKS[l.look]?.name || '');
  $('#st-hk').classList.toggle('off', !harakat);
  $('#st-size-r').value = l.size;
  $$('#st-fonts [data-font]').forEach(b => b.classList.toggle('on', l.font === b.dataset.font));
  $$('#st-colors [data-color]').forEach(b => b.classList.toggle('on', l.color === b.dataset.color));
}

// the picture fills the space between the top and bottom bars, keeping its shape
function fit() {
  const wrap = $('#st-wrap'), stage = $('#st-stage'); if (!wrap || !stage) return;
  const [W, H] = SIZES[size];
  const railW = 64, availW = Math.max(160, stage.clientWidth - railW - 8), availH = Math.max(200, stage.clientHeight);
  const k = Math.min(availW / W, availH / H);
  wrap.style.width = Math.floor(W * k) + 'px'; wrap.style.height = Math.floor(H * k) + 'px';
}

function sync() {
  const [W, H] = SIZES[size];
  const cv = $('#st-canvas'); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  fit();
  $$('#st-size button').forEach(b => b.classList.toggle('on', b.dataset.k === size));
  $$('#st-bgs [data-bg]').forEach(b => b.classList.toggle('on', bg.kind === 'color' && bg.key === b.dataset.bg));
  $('#st-rmbg').hidden = bg.kind === 'color';
  $('#st-undo').disabled = !history.length;
  $('#st-export').textContent = bg.kind === 'video' ? 'Save video' : 'Save image';
  $('#st-trim').hidden = bg.kind !== 'video';
  $('#st-hint').hidden = layers.length > 0;
  const n = saved().length, nb = $('#st-saved-n'); if (nb) nb.textContent = n ? (AR ? ar(n) : n) : '';
  if (editing) syncEditor();
}
const ar = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

/* ---------- the list of texts, undo, compare, drafts ---------- */
let history = [], comparing = false, draftId = null;
const state = () => ({ layers: JSON.parse(JSON.stringify(layers)), sel: sel?.id || null, bgKind: bg.kind, bgKey: bg.key });
function snap() { history.push({ ...state(), bg }); if (history.length > 40) history.shift(); const u = $('#st-undo'); if (u) u.disabled = false; }
function undo() {
  const s = history.pop(); if (!s) return;
  layers = s.layers; sel = layers.find(l => l.id === s.sel) || null; bg = s.bg;
  sync(); draw();
}
function renderLayers() {
  const box = $('#st-layers'); if (!box) return;
  box.innerHTML = layers.length ? layers.map((l, i) => `<div class="st-layer ${l === sel ? 'on' : ''}"><button type="button" class="st-lt" data-li="${i}" dir="auto">${esc((l.text || '').split('\n')[0].slice(0, 40) || '(empty)')}</button><button type="button" class="x ghost small" data-lx="${i}" aria-label="Delete this text">×</button></div>`).join('')
    : '<span class="muted" style="font-size:.88rem">No text yet. Tap “+ Add text”.</span>';
  $$('[data-li]', box).forEach(b => b.onclick = () => { sel = layers[+b.dataset.li]; $('#st-text').value = sel.text; sync(); draw(); });
  $$('[data-lx]', box).forEach(b => b.onclick = () => { snap(); const l = layers[+b.dataset.lx]; layers = layers.filter(x => x !== l); if (sel === l) sel = layers.at(-1) || null; $('#st-text').value = sel?.text || ''; sync(); draw(); });
}
// drafts live in the phone's own storage (photos are kept smaller)
const DB = () => new Promise((res, rej) => { const r = indexedDB.open('daftar-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const db = await DB(); return new Promise((res, rej) => { const t = db.transaction('drafts', mode); const r = fn(t.objectStore('drafts')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); };
async function saveDraft() {
  let img = null;
  if (bg.kind === 'image') {
    const k = Math.min(1, 1440 / Math.max(bg.img.naturalWidth, bg.img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(bg.img.naturalWidth * k); c.height = Math.round(bg.img.naturalHeight * k);
    c.getContext('2d').drawImage(bg.img, 0, 0, c.width, c.height); img = c.toDataURL('image/jpeg', 0.85);
  }
  const [W, H] = SIZES[size], t = document.createElement('canvas'); t.width = 216; t.height = Math.round(216 * H / W);
  paint(t.getContext('2d'), t.width, t.height, false);
  draftId ||= 'D' + Date.now().toString(36);
  await tx('readwrite', s => s.put({ id: draftId, date: new Date().toISOString(), size, bgKey: bg.kind === 'color' ? bg.key : 'navy', img, video: bg.kind === 'video', layers: JSON.parse(JSON.stringify(layers)), thumb: t.toDataURL('image/jpeg', 0.7) }));
  status(bg.kind === 'video' ? '✓ Draft saved. Videos are not kept in drafts; pick the video again when you open it.' : '✓ Draft saved.');
  renderDrafts();
}
async function renderDrafts() {
  const box = $('#st-drafts'); if (!box) return;
  let list = []; try { list = (await tx('readonly', s => s.getAll())) || []; } catch {}
  list.sort((a, b) => b.date.localeCompare(a.date));
  box.innerHTML = list.length ? `<div class="st-drafts">${list.map(d => `<div class="st-draft"><button type="button" data-do="${d.id}"><img src="${d.thumb}" alt=""></button><small>${new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small><button type="button" class="x ghost small" data-dx="${d.id}" aria-label="Delete draft">×</button></div>`).join('')}</div>`
    : '<span class="muted" style="font-size:.88rem">Tap “Save draft” to keep your work and finish it later.</span>';
  $$('[data-do]', box).forEach(b => b.onclick = async () => {
    const d = list.find(x => x.id === b.dataset.do); snap(); stopVideo();
    size = d.size; layers = d.layers; sel = layers.at(-1) || null; draftId = d.id;
    if (d.img) { const im = new Image(); im.onload = () => { bg = { kind: 'image', img: im }; sync(); draw(); }; im.src = d.img; } else bg = { kind: 'color', key: d.bgKey };
    closeSheet(); sync(); draw();
    if (d.video) status('This draft had a video: pick it again with “Photo or video”.');
  });
  $$('[data-dx]', box).forEach(b => b.onclick = async () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Delete?'; return; } await tx('readwrite', s => s.delete(b.dataset.dx)); if (draftId === b.dataset.dx) draftId = null; renderDrafts(); });
}

function addLayer(o) {
  if (layers.length || o.text) snap();
  const l = { id: newId(), text: o.text ?? 'اكتب هنا', look: o.look || 'classic', font: o.font || LOOKS[o.look || 'classic'].font,
    color: o.color || '#ffffff', size: o.size || 0.075, align: o.align || 'center', x: 0.5, y: 0.4 + (layers.length % 3) * 0.12, wrap: o.wrap || 0.84, rot: o.rot || 0 };
  layers.push(l); sel = l; sync(); draw();
  return l;
}

/* ---------- media ---------- */
function stopVideo() { if (bg.video) { bg.video.pause(); URL.revokeObjectURL(bg.video.src); } }
function loadMedia(f) {
  snap(); stopVideo();
  const url = URL.createObjectURL(f);
  if ((f.type || '').startsWith('video/') || /\.(mp4|mov|webm|3gp)$/i.test(f.name)) {
    const v = document.createElement('video');
    v.src = url; v.playsInline = true; v.preload = 'auto'; v.muted = true; v.crossOrigin = 'anonymous';
    v.onloadedmetadata = async () => {
      // some videos say "unknown length" at first: ask the player for the real end before setting the part to keep
      if (!Number.isFinite(v.duration) || !v.duration) { v.currentTime = 1e7; await new Promise(r => { v.ondurationchange = r; setTimeout(r, 3000); }); v.currentTime = 0; }
      trim = { start: 0, end: v.duration };
      for (const id of ['st-t0', 'st-t1']) $('#' + id).max = String(v.duration);
      $('#st-t0').value = '0'; $('#st-t1').value = String(v.duration);
      // pick the canvas shape from the video
      const r = v.videoWidth / v.videoHeight; size = r < 0.7 ? 'story' : r < 0.9 ? 'post' : 'square';
      bg = { kind: 'video', video: v }; sync(); showTrim(); v.currentTime = 0.05;
      requestAnimationFrame(() => thumbs(v));
    };
    v.onseeked = () => { draw(); head(); };
    v.onpause = v.onplay = playIcon;
    v.onerror = () => status('✗ This video cannot be opened here. Try an MP4 file.');
  } else {
    // photos from phone cameras can be very big: make a copy of at most 2400 px, so every phone can draw it
    status('Opening the picture…');
    openPicture(f, url).then(img => {
      bg = { kind: 'image', img }; sync(); draw(); status('');
      $('#st-canvas')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }).catch(() => {
      const heic = /heic|heif/i.test(f.type + f.name);
      const msg = heic ? '✗ This HEIC photo could not be converted. Take a screenshot of it and use that.' : '✗ This picture cannot be opened. Try another photo, or a screenshot of it.';
      status(msg); window.JundCal?.toast(msg, 6000); window.JundReport?.problem('studio photo failed: ' + (f.type || 'no type') + ' ' + Math.round(f.size / 1024) + 'KB');
    });
  }
}
// iPhone and some Android cameras save photos as HEIC, which browsers cannot open: turn them into JPG here, on the phone
const isHeic = f => /hei[cf]/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '');
function loadHeicTool() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  return loadHeicTool.p ||= new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'vendor/heic2any.min.js'; sc.onload = () => window.heic2any ? ok(window.heic2any) : no(new Error('no converter')); sc.onerror = no; document.head.appendChild(sc); });
}
async function fromHeic(f) {
  const conv = await loadHeicTool();
  const out = await conv({ blob: f, toType: 'image/jpeg', quality: 0.9 });
  return Array.isArray(out) ? out[0] : out;
}
async function openPicture(f, url) {
  const MAX = 2400;
  let src = null;
  if (isHeic(f)) { status('Converting the HEIC photo…'); f = await fromHeic(f); URL.revokeObjectURL(url); url = URL.createObjectURL(f); }
  try { src = await createImageBitmap(f); } catch {}
  // a photo with no file type that will not open may still be HEIC
  if (!src && !isHeic(f)) { try { const j = await fromHeic(f); src = await createImageBitmap(j); } catch {} }
  if (!src) src = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  if (!w || !h) throw new Error('empty');
  const k = Math.min(1, MAX / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  try { src.close?.(); } catch {}
  URL.revokeObjectURL(url);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
  return await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(blob); });
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function showTrim() {
  $('#st-t0').value = trim.start; $('#st-t1').value = trim.end;
  $('#st-t0v').textContent = fmt(trim.start); $('#st-t1v').textContent = fmt(trim.end);
  const len = trim.end - trim.start;
  $('#st-len').textContent = len > 90 ? L(`${fmt(len)} · Reels are best under 90 s`, `${fmt(len)} · الريلز أفضل تحت ٩٠ ث`) : fmt(len);
  const d = bg.video?.duration || 0; if (!d) return;
  const a = trim.start / d * 100, b = trim.end / d * 100;
  $('#tr-win').style.left = a + '%'; $('#tr-win').style.width = (b - a) + '%';
  $('#tr-dl').style.width = a + '%'; $('#tr-dr').style.left = b + '%';
  $('#tr-h0').setAttribute('aria-valuetext', fmt(trim.start)); $('#tr-h1').setAttribute('aria-valuetext', fmt(trim.end));
  head();
}
const playIcon = () => { const v = bg.video; $('#st-play').textContent = v && !v.paused ? '❚❚' : '▶'; };
function head() {
  const v = bg.video, d = v?.duration || 0; if (!d) return;
  $('#tr-head').style.left = Math.min(100, v.currentTime / d * 100) + '%';
}
function loop() {
  const v = bg.video; if (!v || v.paused) { playIcon(); return; }
  if (v.currentTime >= trim.end) { v.currentTime = trim.start; }   // the part plays round, like WhatsApp's trimmer
  draw(); head(); requestAnimationFrame(loop);
}
// the frames in the strip, taken from a second copy of the video (so the one on screen is not disturbed)
async function thumbs(v) {
  const c = $('#tr-thumbs'), box = $('#tr-strip').getBoundingClientRect();
  const W = Math.max(200, Math.round(box.width || 300)), H = Math.max(36, Math.round(box.height || 48)), dpr = Math.min(2, devicePixelRatio || 1);
  c.width = W * dpr; c.height = H * dpr;
  const x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height);
  const n = Math.max(6, Math.min(14, Math.round(W / (H * 0.62)))), w = c.width / n;
  const t = document.createElement('video'); t.muted = true; t.playsInline = true; t.preload = 'auto'; t.src = v.src;
  try {
    await new Promise((ok, no) => { t.onloadeddata = ok; t.onerror = no; setTimeout(ok, 6000); });
    for (let i = 0; i < n; i++) {
      if (bg.video !== v) return;   // another video was chosen
      t.currentTime = Math.min(v.duration - 0.05, (i + 0.5) * v.duration / n);
      await new Promise(ok => { t.onseeked = ok; setTimeout(ok, 1500); });
      const r = t.videoWidth / t.videoHeight || 1, sw = Math.min(t.videoWidth, t.videoHeight * (w / c.height)), sh = sw / (w / c.height);
      try { x.drawImage(t, (t.videoWidth - sw) / 2, (t.videoHeight - Math.min(sh, t.videoHeight)) / 2, sw, Math.min(sh, t.videoHeight), i * w, 0, w + 1, c.height); } catch {}
      void r;
    }
  } catch {} finally { t.removeAttribute('src'); t.load(); }
}
// dragging the handles, and tapping the strip to jump
function trimmer() {
  const strip = $('#tr-strip');
  const at = e => { const b = strip.getBoundingClientRect(), d = bg.video?.duration || 0; return Math.max(0, Math.min(d, (e.clientX - b.left) / b.width * d)); };
  const MIN = 0.5;
  const set = (which, t) => {
    const d = bg.video?.duration || 0; if (!d) return;
    if (which === 0) trim.start = Math.max(0, Math.min(t, trim.end - MIN));
    else trim.end = Math.min(d, Math.max(t, trim.start + MIN));
    const v = bg.video; if (!v.paused) v.pause();
    v.currentTime = which === 0 ? trim.start : trim.end; showTrim();
  };
  for (const [id, which] of [['tr-h0', 0], ['tr-h1', 1]]) {
    const h = $('#' + id);
    h.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId); h.classList.add('on');
      h.onpointermove = m => set(which, at(m));
      h.onpointerup = h.onpointercancel = () => { h.onpointermove = null; h.classList.remove('on'); };
    };
    h.onkeydown = e => { const k = { ArrowLeft: -0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowUp: 0.5 }[e.key]; if (k) { e.preventDefault(); set(which, (which ? trim.end : trim.start) + k); } };
  }
  strip.onpointerdown = e => {
    if (e.target.classList.contains('tr-h') || !bg.video) return;
    const v = bg.video, t = at(e);
    v.currentTime = Math.max(trim.start, Math.min(trim.end - 0.05, t)); head();
    strip.onpointermove = m => { v.currentTime = Math.max(trim.start, Math.min(trim.end - 0.05, at(m))); head(); };
    strip.setPointerCapture(e.pointerId);
    strip.onpointerup = strip.onpointercancel = () => { strip.onpointermove = null; };
  };
}

/* ---------- drawing ---------- */
const boxes = new Map();
function cover(ctx, src, sw, sh, W, H) {
  const k = Math.max(W / sw, H / sh), w = sw * k, h = sh * k;
  ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
}
function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); }
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/); let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function drawLayer(ctx, l, W, H, showSel) {
  const look = LOOKS[l.look] || LOOKS.classic, font = FONTS[l.font] || FONTS.modern;
  const px = Math.round(l.size * W), rtl = isAr(l.text), txt = shown(l);
  ctx.save();
  if (l.rot) { ctx.translate(l.x * W, l.y * H); ctx.rotate(l.rot); ctx.translate(-l.x * W, -l.y * H); }
  ctx.font = `${font.w} ${px}px ${font.css}`;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'middle';
  const lines = wrap(ctx, txt || ' ', W * (l.wrap || 0.84));
  const lh = px * (l.font === 'naskh' || l.font === 'ruqaa' ? 1.55 : 1.3);
  const widths = lines.map(t => ctx.measureText(t).width);
  const maxW = Math.max(...widths, 10), totalH = lh * lines.length;
  const cx = l.x * W, top = l.y * H - totalH / 2;
  const al = l.align === 'center' ? 'center' : (l.align === 'start') !== rtl ? 'left' : 'right';
  const xFor = w => al === 'center' ? cx - w / 2 : al === 'left' ? cx - maxW / 2 : cx + maxW / 2 - w;
  const padX = px * 0.38, padY = px * 0.16;
  // boxes behind each line, like Instagram
  if (look.box) {
    const fill = look.box === 'soft' ? 'rgba(0,0,0,.55)' : look.box === 'paper' ? '#fffdf5' : l.color;
    ctx.fillStyle = fill;
    lines.forEach((t, i) => { if (!t.trim()) return; rr(ctx, xFor(widths[i]) - padX, top + i * lh - padY / 2, widths[i] + padX * 2, lh + padY, px * 0.28); });
  }
  let fill = l.color;
  if (look.box === 'solid') fill = lum(l.color) > 0.6 ? '#111111' : '#ffffff';
  if (look.box === 'soft') fill = '#ffffff';
  if (look.box === 'paper') fill = '#1a1a1a';
  if (look.neon) { ctx.shadowColor = l.color; ctx.shadowBlur = px * 0.55; fill = '#ffffff'; }
  else if (!look.box) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = px * 0.18; ctx.shadowOffsetY = px * 0.04; }
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';  // we place each line ourselves; the text inside still shapes right to left
  lines.forEach((t, i) => {
    const y = top + i * lh + lh / 2;
    ctx.save(); ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
    const x = rtl ? xFor(widths[i]) + widths[i] : xFor(widths[i]);
    if (look.outline) { ctx.lineJoin = 'round'; ctx.lineWidth = px * 0.12; ctx.strokeStyle = l.color; ctx.shadowBlur = 0; ctx.strokeText(t, x, y); ctx.fillStyle = lum(l.color) > 0.6 ? '#111' : '#fff'; ctx.fillText(t, x, y); }
    else { ctx.fillStyle = fill; ctx.fillText(t, x, y); if (look.neon) { ctx.shadowBlur = px * 0.2; ctx.fillText(t, x, y); } }
    ctx.restore();
  });
  ctx.restore();
  const b = { x: cx - maxW / 2 - padX, y: top - padY, w: maxW + padX * 2, h: totalH + padY * 2 };
  return b;   // the frame and handles of the chosen text are drawn over the picture (placeSel), never into it
}
function paint(ctx, W, H, showSel) {
  ctx.clearRect(0, 0, W, H);
  if (bg.kind === 'image') cover(ctx, bg.img, bg.img.naturalWidth, bg.img.naturalHeight, W, H);
  else if (bg.kind === 'video' && bg.video.readyState >= 2) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); cover(ctx, bg.video, bg.video.videoWidth, bg.video.videoHeight, W, H); }
  else { const c = BGS[bg.key] || BGS.navy, g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  if (comparing && showSel) return;
  // the text being written is shown in the writing box instead, like Instagram
  for (const l of layers) { if (showSel && l === editing) continue; boxes.set(l.id, drawLayer(ctx, l, W, H, showSel && l === sel)); }
}
function draw(withFrame = true) {
  const cv = $('#st-canvas'); if (!cv) return;
  paint(cv.getContext('2d'), cv.width, cv.height, true);
  if (withFrame) placeSel(); else { const f = $('#st-sel'); if (f) f.hidden = true; }
}

/* ---------- touching the picture: move, pinch to resize and turn, handles for the box, drop on the bin to remove ---------- */
let drag = null, pinch = null, handle = null;
const ptrs = new Map();
function pt(e) { const cv = $('#st-canvas'), r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * cv.width, y: (e.clientY - r.top) / r.height * cv.height }; }
// a point in the text's own frame (the text may be turned)
function local(l, p) {
  const b = boxes.get(l.id); if (!b) return p;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = -(l.rot || 0), dx = p.x - cx, dy = p.y - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}
function hitAt(p) {
  return [...layers].reverse().find(l => { const b = boxes.get(l.id), q = local(l, p); const m = 12; return b && q.x >= b.x - m && q.x <= b.x + b.w + m && q.y >= b.y - m && q.y <= b.y + b.h + m; });
}
function overTrash(e) { const t = $('#st-trash'); if (!t || t.hidden) return false; const r = t.getBoundingClientRect(); return e.clientX > r.left - 20 && e.clientX < r.right + 20 && e.clientY > r.top - 20 && e.clientY < r.bottom + 20; }
function down(e) {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { e.target.setPointerCapture?.(e.pointerId); } catch {}
  if (ptrs.size === 2 && sel) {
    const [a, b] = [...ptrs.values()];
    pinch = { l: sel, d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), size: sel.size, rot: sel.rot || 0 };
    drag = null; $('#st-trash').hidden = true; e.preventDefault(); return;
  }
  const p = pt(e), hit = hitAt(p);
  if (hit) {
    const again = hit === sel;
    sel = hit; snap();
    drag = { l: hit, dx: p.x - hit.x * $('#st-canvas').width, dy: p.y - hit.y * $('#st-canvas').height, moved: false, again, sx: e.clientX, sy: e.clientY };
    sync(); draw(); e.preventDefault();
  } else if (sel) { sel = null; sync(); draw(); }
}
function move(e) {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    pinch.l.size = Math.min(0.24, Math.max(0.02, pinch.size * d / pinch.d));
    let r = pinch.rot + ang - pinch.ang; if (Math.abs(r) < 0.06) r = 0;   // snaps back to straight
    pinch.l.rot = r; draw(); return;
  }
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
  drag.moved = true;
  const p = pt(e), cv = $('#st-canvas'), ox = drag.l.x, oy = drag.l.y;
  drag.l.y = Math.min(0.98, Math.max(0.02, (p.y - drag.dy) / cv.height));
  drag.l.x = Math.min(0.98, Math.max(0.02, (p.x - drag.dx) / cv.width));
  // its translation moves with it
  for (const t of layers) if (t.of === drag.l.id) { t.x += drag.l.x - ox; t.y += drag.l.y - oy; }
  const tr = $('#st-trash'); tr.hidden = false; tr.classList.toggle('hot', overTrash(e));
  $('#st-sel').hidden = true;
  draw(false);
}
function up(e) {
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; sync(); draw(); return; }
  if (!drag) return;
  const d = drag; drag = null;
  const tr = $('#st-trash'), drop = !tr.hidden && overTrash(e); tr.hidden = true; tr.classList.remove('hot');
  if (drop) { removeLayer(d.l); return; }
  // a tap on a text that was already chosen opens it for writing, like Instagram
  if (!d.moved && d.again) { openEditor(d.l); return; }
  sync(); draw();
}
function removeLayer(l) {
  layers = layers.filter(x => x !== l && x.of !== l.id);
  if (sel === l) sel = null;
  sync(); draw();
}
// the handles around the chosen text: ↔ makes the box wider or narrower (the text wraps), ⤡ makes the text bigger or smaller
function handleDown(e) {
  if (!sel) return; e.stopPropagation(); e.preventDefault();
  try { e.target.setPointerCapture?.(e.pointerId); } catch {} snap();
  const b = boxes.get(sel.id), r = $('#st-canvas').getBoundingClientRect(), k = r.width / $('#st-canvas').width;
  handle = { kind: e.target.dataset.h, l: sel, x0: e.clientX, y0: e.clientY, wrap: sel.wrap || 0.84, size: sel.size,
    cx: r.left + (b.x + b.w / 2) * k, cy: r.top + (b.y + b.h / 2) * k };
  handle.d0 = Math.hypot(e.clientX - handle.cx, e.clientY - handle.cy);
}
function handleMove(e) {
  if (!handle) return; e.preventDefault();
  const cv = $('#st-canvas'), r = cv.getBoundingClientRect();
  if (handle.kind === 'w') {
    const dx = (e.clientX - handle.x0) * (AR ? -1 : 1);   // the handle sits on the end side (left in Arabic)
    handle.l.wrap = Math.min(0.96, Math.max(0.18, handle.wrap + 2 * dx / r.width));
  } else {
    const d = Math.hypot(e.clientX - handle.cx, e.clientY - handle.cy);
    handle.l.size = Math.min(0.24, Math.max(0.02, handle.size * d / Math.max(20, handle.d0)));
  }
  draw();
}
function handleUp() { if (!handle) return; handle = null; sync(); draw(); }
// the frame with the handles sits on the chosen text
function placeSel() {
  const box = $('#st-sel'); if (!box) return;
  const l = sel, b = l && boxes.get(l.id);
  if (!l || !b || editing || comparing) { box.hidden = true; return; }
  const cv = $('#st-canvas'), k = cv.getBoundingClientRect().width / cv.width;
  box.hidden = false;
  Object.assign(box.style, { left: b.x * k + 'px', top: b.y * k + 'px', width: b.w * k + 'px', height: b.h * k + 'px', transform: `rotate(${l.rot || 0}rad)` });
}

/* ---------- saved texts ---------- */
const saved = () => store.get('studioSaved', []);
function saveText(l) {
  const list = saved().filter(x => !(x.text === l.text && x.look === l.look && x.font === l.font && x.color === l.color));
  list.unshift({ id: newId(), text: l.text, look: l.look, font: l.font, color: l.color, size: l.size, align: l.align });
  store.set('studioSaved', list.slice(0, 60));
  J.cloud.putData('studio', { saved: Date.now(), list: store.get('studioSaved', []) }).catch(() => {});
  renderSaved();
}
function renderSaved() {
  const box = $('#st-saved'); if (!box) return;
  const list = saved();
  const nb = $('#st-saved-n'); if (nb) nb.textContent = list.length ? (AR ? ar(list.length) : list.length) : '';
  box.innerHTML = list.length ? list.map(x => `<div class="sx-sv"><button type="button" class="sx-sv-t" data-use="${x.id}" dir="auto" style="font-family:${(FONTS[x.font] || FONTS.modern).css};font-weight:${(FONTS[x.font] || FONTS.modern).w};color:${x.color === '#111111' ? 'inherit' : x.color}">${esc(x.text.slice(0, 90))}${x.text.length > 90 ? '…' : ''}</button><button type="button" class="x ghost small" data-rm="${x.id}" aria-label="${L('Remove', 'إزالة')}">×</button></div>`).join('')
    : `<p class="muted">${L('Texts you save appear here. Next time, one tap puts the same text and look back. Tap ☆ while writing to save a text.', 'النصوص التي تحفظها تظهر هنا، وبضغطة واحدة تعود بنفس الشكل. اضغط ☆ أثناء الكتابة لحفظ النص.')}</p>`;
  $$('[data-use]', box).forEach(b => b.onclick = () => { const x = saved().find(s => s.id === b.dataset.use); if (x) { closeSheet(); addLayer({ ...x }); } });
  $$('[data-rm]', box).forEach(b => b.onclick = () => { store.set('studioSaved', saved().filter(s => s.id !== b.dataset.rm)); renderSaved(); });
}

/* ---------- carousel: several slides in one go ---------- */
async function carousel() {
  const slides = $('#st-car').value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  if (!slides.length) { $('#st-car-st').textContent = 'Write the slides first.'; return; }
  await loadFonts();
  const base = sel || layers[0] || { look: 'classic', font: 'modern', color: '#ffffff', size: 0.07, align: 'center' };
  const keep = layers, keepSel = sel, [W, H] = SIZES[size], files = [];
  for (let i = 0; i < slides.length; i++) {
    layers = [{ ...base, id: 'c' + i, text: slides[i], x: 0.5, y: 0.5, size: slides[i].length > 120 ? 0.05 : slides[i].length > 60 ? 0.06 : base.size }];
    if (slides.length > 1) layers.push({ id: 'n' + i, text: `${i + 1}/${slides.length}`, look: 'classic', font: 'modern', color: '#ffffff', size: 0.03, align: 'center', x: 0.5, y: 0.94 });
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    paint(c.getContext('2d'), W, H, false);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.93));
    files.push(new File([b], `carousel-${stamp()}-${i + 1}.jpg`, { type: 'image/jpeg' }));
  }
  layers = keep; sel = keepSel; draw();
  if (navigator.canShare?.({ files })) { try { await navigator.share({ files }); $('#st-car-st').textContent = '✓ Shared ' + files.length + ' slides.'; return; } catch (e) { if (e.name === 'AbortError') return; } }
  if (window.JundNative) {
    const r = await window.JundNative.saveAll(files);
    $('#st-car-st').textContent = r.ok ? `✓ Saved ${files.length} slides in your gallery (${r.where === 'chosen' ? 'the place you chose' : r.where}).` : r.cancelled ? '' : '✗ Could not save: ' + (r.error || '');
    return;
  }
  for (const f of files) { J.download(f, f.name); await new Promise(r => setTimeout(r, 400)); }
  $('#st-car-st').textContent = `✓ Saved ${files.length} slides to your downloads.`;
}
async function carouselFromNote() {
  const l = (await J.allLessons()).filter(x => !x.draft).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!l) { $('#st-car-st').textContent = 'Make some notes first.'; return; }
  $('#st-car-st').textContent = 'Writing slides from “' + (l.notes?.title || l.unit) + '”…';
  const text = window.JundFeatures.lessonText(l);
  try {
    const r = await J.callServer({ json: false, maxTokens: 2000, system: `Turn these notes into an Instagram carousel of 6 slides, in the same language as the notes. Slide 1 is a hook (max 10 words). Slides 2–5: one clear point each (max 30 words). Slide 6: a short takeaway. Separate slides with one empty line. Only the slide texts, no numbers, no labels. Stay faithful to the notes.`, user: text });
    $('#st-car').value = r.text.trim(); $('#st-car-st').textContent = '✓ Check the slides, then make the carousel.';
  } catch (e) { $('#st-car-st').textContent = '✗ ' + J.errText(e); }
}

/* ---------- caption bank ---------- */
const caps = () => store.get('captions', []);
function saveCaption(t) {
  store.set('captions', [t, ...caps().filter(x => x !== t)].slice(0, 80));
  J.cloud.putData('captions', { saved: Date.now(), list: caps() }).catch(() => {});
  renderCaps();
}
function renderCaps() {
  const box = $('#st-caps'); if (!box) return;
  const l = caps();
  box.innerHTML = l.length ? l.map((t, i) => `<div class="cap-row"><button type="button" class="cap-t" data-c="${i}" dir="auto">${esc(t)}</button><button type="button" class="x ghost small" data-cx="${i}" aria-label="Remove">×</button></div>`).join('')
    : '<span class="muted">Captions you save, and the ones from post ideas, appear here.</span>';
  $$('[data-c]', box).forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(caps()[+b.dataset.c]); status('✓ Caption copied'); } catch {} });
  $$('[data-cx]', box).forEach(b => b.onclick = () => { const l2 = caps(); l2.splice(+b.dataset.cx, 1); store.set('captions', l2); renderCaps(); });
}

/* ---------- export ---------- */
function status(t) { const s = $('#st-status'); if (s) s.textContent = t; }
async function deliver(blob, name, share) {
  const file = new File([blob], name, { type: blob.type });
  if (!blob || !blob.size) { status('✗ The picture could not be made. Try again, or pick a smaller photo.'); return; }
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); status('✓ Shared.'); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const r = await J.download(blob, name);
  if (r?.ok === false) { status(r.cancelled ? '' : '✗ Could not save: ' + (r.error || 'unknown problem')); return; }
  status(r?.where && r.where !== 'downloads'
    ? `✓ Saved in your gallery (${r.where === 'chosen' ? 'the place you chose' : r.where}). Open Instagram and pick it.`
    : '✓ Saved to your downloads. Open Instagram and pick it from your gallery.');
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
async function exportIt(share) {
  // texts used in an export are kept as "saved" automatically
  layers.filter(l => l.text.trim()).forEach(saveText);
  if (bg.kind !== 'video') {
    const [W, H] = SIZES[size], c = document.createElement('canvas'); c.width = W; c.height = H;
    paint(c.getContext('2d'), W, H, false);
    c.toBlob(b => deliver(b, `jund-studio-${stamp()}.jpg`, share), 'image/jpeg', 0.93);
    return;
  }
  try { await exportVideo(share); }
  catch (e) {
    status('✗ The video could not be made: ' + (e.message || e) + '. Try a shorter part, or save the image.');
    window.JundReport?.problem('studio video: ' + (e.message || e));
  } finally { const p = $('#st-progress'); if (p) p.hidden = true; const b = $('#st-export'); if (b) b.disabled = false; }
}
let audioCtx = null, audioSrc = null;
async function exportVideo(share) {
  const v = bg.video;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { status('✗ This phone cannot make videos in the app. Save the image instead.'); return; }
  const [W0, H0] = SIZES[size], k = 720 / W0, W = 720, H = Math.round(H0 * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const stream = c.captureStream(30);
  try {
    audioCtx ||= new AudioContext();
    audioSrc ||= audioCtx.createMediaElementSource(v);
    const dest = audioCtx.createMediaStreamDestination();
    audioSrc.disconnect(); audioSrc.connect(dest); audioSrc.connect(audioCtx.destination);
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    await audioCtx.resume();
  } catch {}
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const finished = new Promise(r => { rec.onstop = r; });
  $('#st-progress').hidden = false; $('#st-export').disabled = true;
  v.muted = false; v.currentTime = trim.start;
  await new Promise(r => { v.onseeked = r; });
  v.onseeked = () => draw();
  rec.start(500);
  await v.play();
  const len = trim.end - trim.start;
  await new Promise(res => {
    // the last frame of a video brings no "next frame" call, so the end is also watched by the "ended" event,
    // a timer, and a limit of the clip's length plus 15 seconds (before, saving a whole video waited forever at 98%)
    let done = false;
    const finish = () => { if (done) return; done = true; clearInterval(watch); clearTimeout(cap); v.removeEventListener('ended', finish); res(); };
    v.addEventListener('ended', finish);
    const watch = setInterval(() => { if (v.ended || v.currentTime >= trim.end - 0.04) finish(); }, 150);
    const cap = setTimeout(finish, (len + 15) * 1000);
    const step = () => {
      if (done) return;
      paint(ctx, W, H, false);
      $('#st-progress-text').textContent = `Making the video… ${Math.min(100, Math.round((v.currentTime - trim.start) / len * 100))}% (keep the screen on)`;
      if (v.currentTime >= trim.end || v.ended) return finish();
      (v.requestVideoFrameCallback ? v.requestVideoFrameCallback.bind(v) : requestAnimationFrame)(step);
    };
    step();
  });
  v.pause(); rec.stop(); await finished;
  $('#st-progress').hidden = true; $('#st-export').disabled = false;
  const type = (mime || 'video/webm').split(';')[0];
  let out = new Blob(chunks, { type });
  // the phone records in small pieces with no total length; some players and WhatsApp then show only the first 3 seconds.
  // Rewritten as one ordinary MP4 with its full length (same picture and sound).
  if (type === 'video/mp4' && window.JundMp4) { $('#st-progress-text').textContent = 'Finishing the video…'; out = await window.JundMp4.fix(out); }
  await deliver(out, `jund-studio-${stamp()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, share);
  draw();
}

/* ---------- translation of the text on the picture ---------- */
// how tall a text is on the picture (0–1 of the height), so the translation sits just under it
function hOf(l) {
  const [W, H] = SIZES[size], font = FONTS[l.font] || FONTS.modern, px = Math.round(l.size * W);
  const ctx = document.createElement('canvas').getContext('2d'); ctx.font = `${font.w} ${px}px ${font.css}`;
  const lh = px * (l.font === 'naskh' || l.font === 'ruqaa' ? 1.55 : 1.3);
  return wrap(ctx, shown(l) || ' ', W * (l.wrap || 0.84)).length * lh / H;
}
function placeTr(base) {
  for (const t of layers.filter(x => x.of === base.id)) {
    t.size = Math.max(0.032, base.size * 0.55); t.align = base.align; t.x = base.x; t.color = base.color;
    t.y = Math.min(0.94, base.y + hOf(base) / 2 + hOf(t) / 2 + 0.025);
  }
}
async function translate() {
  const cur = sel || layers.at(-1), l = cur?.of ? layers.find(x => x.id === cur.of) || cur : cur, src = (l?.text || $('#st-text').value).trim();
  if (!src || src === 'Your text' || src === 'اكتب هنا') { status(L('Write a text first (tap Aa), then tap Translate.', 'اكتب نصًا أولًا (اضغط Aa)، ثم اضغط ترجمة.')); return; }
  const toEn = J.langOf(src) === 'ar', b = $('#st-tr'); b.disabled = true; status('⏳ Translating…');
  try {
    const r = await J.callServer({ json: false, maxTokens: 800, system: `Translate the user's text into ${toEn ? 'clear, natural English' : 'clear, eloquent Arabic'} for a social-media picture. If it is a Quran verse, give the meaning faithfully (like Saheeh International) and do not add anything. If it is a hadith or a scholar's words, translate faithfully. Keep it short. Return only the translation, no quotes, no notes, no source.`, user: src });
    const t = r.text.trim().replace(/^["“]|["”]$/g, ''); if (!t) throw new Error('No translation came back');
    const base = l || addLayer({ text: src });
    snap();
    layers = layers.filter(x => x.of !== base.id);
    const n = { id: newId(), of: base.id, text: t, look: 'classic', font: toEn ? 'elegant' : 'naskh', color: base.color, size: 0.04, align: base.align, x: base.x, y: base.y };
    layers.push(n); placeTr(base); sel = n; $('#st-text').value = t; sync(); draw(); status('✓ Translation added under your text — drag it where you like.');
  } catch (e) { status('✗ ' + J.errText(e)); }
  b.disabled = false;
}

/* ---------- design ideas for the text: tap one to apply it ---------- */
async function designIdeas() {
  const cur = sel || layers.at(-1), l = cur?.of ? layers.find(x => x.id === cur.of) || cur : cur, text = (l?.text || $('#st-text').value).trim();
  const box = $('#st-design-list');
  if (!text) { box.innerHTML = `<p class="muted">${L('Write a text first (tap Aa), then tap Ideas.', 'اكتب نصًا أولًا (اضغط Aa)، ثم اضغط أفكار.')}</p>`; return; }
  box.innerHTML = '<p class="muted fine">⏳ Thinking of designs…</p>';
  const system = `You are a calm, tasteful Islamic social-media designer. For the user's text, suggest 4 different designs for a ${SIZES[size][2]} picture.
Choose only from these options:
look: ${Object.keys(LOOKS).join(', ')}
font: ${Object.keys(FONTS).join(', ')}
color: ${COLORS.join(', ')}
bg: ${Object.keys(BGS).join(', ')}
align: start, center, end
size: a number from 0.04 to 0.12 (smaller for long text)
y: where the text sits, 0.15 (top) to 0.8 (bottom)
For each design write a short name, and "why": one or two simple sentences on the feeling and how to finish it (e.g. add the source small at the bottom, a photo of the sky behind, leave space). Keep it modest and halal: no faces, no music.
Return JSON only: {"designs":[{"name":"","why":"","look":"","font":"","color":"","bg":"","align":"","size":0.07,"y":0.4}]}`;
  try {
    const r = await J.callServer({ system, user: text, maxTokens: 2000 });
    const list = (J.parseJSON(r.text).designs || []).filter(d => d.name).slice(0, 4);
    if (!list.length) throw new Error('No ideas came back — try again');
    box.innerHTML = list.map((d, i) => `<div class="idea st-dz"><span class="st-dz-sw" style="background:linear-gradient(135deg,${(BGS[d.bg] || BGS.navy).join(',')});color:${COLORS.includes(d.color) ? d.color : '#fff'};font-family:${(FONTS[d.font] || FONTS.modern).css}">Aa</span>
      <div style="flex:1;min-width:0"><b>${esc(d.name)}</b><div class="muted" style="font-size:.86rem">${esc(d.why || '')}</div></div>
      <button type="button" class="ghost small" data-dz="${i}">Apply</button></div>`).join('');
    $$('[data-dz]', box).forEach(b => b.onclick = () => {
      const d = list[+b.dataset.dz]; snap();
      const t = l && layers.includes(l) ? l : layers.find(x => !x.of) || addLayer({ text });
      if (LOOKS[d.look]) t.look = d.look;
      t.font = FONTS[d.font] ? d.font : LOOKS[t.look].font;
      if (COLORS.includes(d.color)) t.color = d.color;
      if (['start', 'center', 'end'].includes(d.align)) t.align = d.align;
      if (+d.size >= 0.03 && +d.size <= 0.16) t.size = +d.size;
      if (+d.y > 0.05 && +d.y < 0.95) t.y = +d.y;
      if (BGS[d.bg] && bg.kind === 'color') bg = { kind: 'color', key: d.bg };
      if (layers.some(x => x.of === t.id)) t.y = Math.min(t.y, 0.7);
      placeTr(t); sel = t; closeSheet(); sync(); draw();
    });
  } catch (e) { box.innerHTML = `<p class="muted fine">✗ ${esc(J.errText(e))}</p>`; }
}

/* ---------- post ideas from the week's notes ---------- */
async function ideas() {
  if (!built) build();
  const box = $('#st-ideas-list');
  box.classList.remove('muted'); box.textContent = 'Reading your week…';
  const all = (await J.allLessons()).filter(l => !l.draft).sort((a, b) => b.date.localeCompare(a.date));
  const week = all.filter(l => Date.now() - new Date(l.date) < 7 * 864e5);
  const use = (week.length ? week : all).slice(0, 8);
  if (!use.length) { box.textContent = 'Make some notes first — ideas come from what you studied.'; return; }
  const digest = use.map(l => {
    const n = l.notes || {};
    const keys = (n.sections || []).flatMap(s => [s.heading, ...(s.blocks || []).filter(b => ['def', 'rule', 'example', 'quote'].includes(b.t)).slice(0, 2).map(b => b.text)]);
    return `# ${l.subject?.name || ''} — ${n.title || l.unit}\n${keys.filter(Boolean).join('\n').slice(0, 1200)}`;
  }).join('\n\n');
  const lang = J.langOf(digest);
  const system = lang === 'ar'
    ? 'أنت تقترح أفكار منشورات إنستغرام لطالب علم من ملاحظات دروسه. كل فكرة: جملة افتتاحية قصيرة جذابة (hook) تصلح نصًا على الصورة، وتعليق قصير (caption)، وشكل المنشور (format: صورة نصية / كاروسيل / ريلز قصير). التزم بما في الملاحظات ولا تخترع معلومات. أعد JSON فقط: {"ideas":[{"hook":"","caption":"","format":"","from":"اسم الدرس"}]} وست أفكار.'
    : 'You suggest Instagram post ideas for a student from his lesson notes. Each idea: a short catchy hook that works as text on the picture, a short caption, and a format (text image / carousel / short reel). Stay with what is in the notes and invent nothing. Return JSON only: {"ideas":[{"hook":"","caption":"","format":"","from":"lesson name"}]} with six ideas.';
  try {
    const r = await J.callServer({ system, user: digest, maxTokens: 4000, onText: t => { box.textContent = `Thinking… ${t.split(/\s+/).length} words`; } });
    const list = (J.parseJSON(r.text).ideas || []).filter(x => x.hook);
    store.set('studioIdeas', list);
    showIdeas(list);
  } catch (e) { box.textContent = '✗ ' + J.errText(e); }
}
function showIdeas(list) {
  const box = $('#st-ideas-list');
  if (!list?.length) return;
  box.classList.remove('muted');
  box.innerHTML = list.map((x, i) => `<div class="idea" dir="auto"><div class="row-between"><b>${esc(x.hook)}</b><button type="button" class="ghost small" data-idea="${i}">Use</button></div>
    <div class="muted" style="font-size:.86rem">${esc(x.format || '')}${x.from ? ' · ' + esc(x.from) : ''}</div>
    ${x.caption ? `<div style="font-size:.9rem;white-space:pre-wrap">${esc(x.caption)}</div>` : ''}</div>`).join('');
  $$('[data-idea]', box).forEach(b => b.onclick = () => {
    const x = list[+b.dataset.idea];
    closeSheet(); addLayer({ text: x.hook, look: 'box', color: '#ffffff' });
    if (x.caption) saveCaption(x.caption);
    try { navigator.clipboard.writeText(x.caption || ''); status('✓ The hook is on the picture; the caption is copied and saved.'); } catch {}
    $('#st-canvas').scrollIntoView({ block: 'center' });
  });
}

window.JundStudio = {
  open() { if (!built) { build(); showIdeas(store.get('studioIdeas', [])); } loadFonts(); sync(); draw(); renderSaved(); requestAnimationFrame(() => { fit(); placeSel(); }); },
  closeLayer: () => built && !screen.hidden && closeLayer(),
  ideas,
  load(f) { if (!built) build(); loadFonts(); loadMedia(f); },
  addText(t) { if (!built) build(); loadFonts(); addLayer({ text: t, font: 'naskh', look: 'classic', size: 0.06 }); },
};
// pull saved texts kept in the cloud
J.cloud.getData('studio').then(r => {
  if (!r?.list) return;
  const have = saved(); store.set('studioSaved', [...have, ...r.list.filter(x => !have.some(h => h.id === x.id))]); renderSaved();
}).catch(() => {});
})();
