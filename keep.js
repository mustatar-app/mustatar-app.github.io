/* My notes — quick notes like Google Keep, with one thing Keep does not have:
   pick any notes (press and hold, or tap their circles) and work on them with the AI: ask about them, combine them,
   summarise, turn them into a to-do list or a full study file, quiz yourself, or tell the AI what to make.
   - Cards in two columns, colours, pin, labels, checklists, voice notes, search, archive, bin (7 days).
   - Saved on the phone at once (IndexedDB), copied to your private space when signed in, and in the backup file.
   - Everything plain is free and works offline; the AI parts use the same free AI as the assistant. */
(() => {
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = () => window.ZadLang === 'ar';
const t = (en, ar) => AR() ? ar : en;
const num = n => J.ar(n);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- storage ---------- */
const DB = (() => {
  let p;
  const open = () => p ||= new Promise((res, rej) => {
    const r = indexedDB.open('mustatar-keep', 2);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' }); if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn, st = 'notes') => { const db = await open(); return new Promise((res, rej) => { const x = db.transaction(st, mode), out = fn(x.objectStore(st)); x.oncomplete = () => res(out && 'result' in out ? out.result : out); x.onerror = () => rej(x.error); }); };
  return { all: () => tx('readonly', s => s.getAll()), put: n => tx('readwrite', s => { s.put(n); }), many: l => tx('readwrite', s => { l.forEach(n => s.put(n)); }), del: id => tx('readwrite', s => { s.delete(id); }),
    img: id => tx('readonly', s => s.get(id), 'images'), putImg: x => tx('readwrite', s => { s.put(x); }, 'images'), delImg: id => tx('readwrite', s => { s.delete(id); }, 'images'), allImg: () => tx('readonly', s => s.getAll(), 'images') };
})();
let notes = null;
async function load() {
  if (notes) return notes;
  notes = await DB.all().catch(() => []);
  // notes that came down from your space before this file was ready
  for (const x of window.__keepIn || []) await fromCloud(x.id, x.note, true);
  window.__keepIn = [];
  // notes saved from a friend's link (note.html) also go to your private space
  for (const n of notes.filter(x => x.fromShare && !x.synced)) { n.synced = 1; await DB.put(n); J.cloud.keep?.(n.id); (n.images || []).forEach(im => J.cloud.keepImg?.(im.id)); }
  // the bin empties itself after 7 days
  const old = notes.filter(n => n.trashed && Date.now() - n.trashed > 7 * 864e5);
  for (const n of old) await remove(n.id, true);
  return notes;
}
const newId = () => 'K' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isEmpty = n => !String(n.title || '').trim() && !String(n.text || '').trim() && !(n.items || []).some(i => String(i.t || '').trim());
async function save(n, { sync = true, quiet = false } = {}) {
  await load();
  n.updated = Date.now(); n.created ||= n.updated;
  const i = notes.findIndex(x => x.id === n.id);
  if (i >= 0) notes[i] = n; else notes.unshift(n);
  await DB.put(n);
  if (sync) J.cloud.keep?.(n.id);
  if (!quiet) paintSoon();
  return n;
}
async function remove(id, forever = true) {
  await load();
  if (!forever) { const n = notes.find(x => x.id === id); if (n) { n.trashed = Date.now(); n.pinned = false; await save(n); } return; }
  const gone = notes.find(x => x.id === id);
  notes = notes.filter(x => x.id !== id); await DB.del(id); J.cloud.keep?.(id, true);
  for (const im of gone?.images || []) { await DB.delImg(im.id).catch(() => {}); J.cloud.keepImg?.(im.id, true); }
  if (gone?.share?.id) unshare(gone, true).catch(() => {});
  paintSoon();
}
// from your private space (another phone): the newest change wins
async function fromCloud(id, note, inLoad = false) {
  if (!notes && !inLoad) { (window.__keepIn ||= []).push({ id, note }); return; }
  const have = notes.find(x => x.id === id);
  if (!note) { if (have) { notes = notes.filter(x => x.id !== id); await DB.del(id); } }
  else if (!have || (note.updated || 0) >= (have.updated || 0)) { const i = notes.indexOf(have); if (i >= 0) notes[i] = note; else notes.unshift(note); await DB.put(note); }
  if (!inLoad) paintSoon();
}
const plain = n => [n.title ? n.title : '', n.text || '', ...(n.items || []).map(i => (i.done ? '☑ ' : '☐ ') + i.t)].filter(Boolean).join('\n').trim();

/* ---------- colours (Google Keep's, with dark-theme versions) ---------- */
const COLORS = ['', 'coral', 'peach', 'sand', 'mint', 'sage', 'fog', 'storm', 'dusk', 'blossom', 'clay', 'chalk'];
const CNAME = { '': ['Default', 'افتراضي'], coral: ['Coral', 'مرجاني'], peach: ['Peach', 'خوخي'], sand: ['Sand', 'رملي'], mint: ['Mint', 'نعناعي'], sage: ['Sage', 'مريمي'], fog: ['Fog', 'ضبابي'], storm: ['Storm', 'عاصف'], dusk: ['Dusk', 'غسقي'], blossom: ['Blossom', 'زهري'], clay: ['Clay', 'طيني'], chalk: ['Chalk', 'طباشيري'] };

/* ---------- icons ---------- */
const I = (d, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
  pinOff: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7M4 4l16 16"/>',
  archive: '<path d="M4 7h16v3H4zM5 10v9h14v-9M10 14h4"/>',
  unarchive: '<path d="M4 7h16v3H4zM5 10v9h14v-9M12 18v-5m0 0-2 2m2-2 2 2"/>',
  trash: '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.5-1-2.6 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4c0-4.5-4-8.1-9-8.1z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  list: '<path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/>',
  label: '<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="8" cy="8" r="1.4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/>',
  all: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  share: '<path d="M12 15V4m0 0-4 4m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  merge: '<path d="M6 4v5a6 6 0 0 0 6 6h6M18 15l-3-3m3 3-3 3M6 20v-3"/>',
  study: '<path d="M4 6a2 2 0 0 1 2-2h6v16H6a2 2 0 0 1-2-2zM12 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>',
  sum: '<path d="M5 6h14M5 10h10M5 14h14M5 18h7"/>',
  todo: '<path d="M4 7l2 2 4-4M4 16l2 2 4-4M13 7h7M13 16h7"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  expand: '<path d="M4 6h10M4 12h16M4 18h12M18 3v6M15 6h6"/>',
  post: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 14h8M8 10h5"/>',
  check: '<path d="M5 12.5l4 4 10-10"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 6M18 19a6 6 0 0 0-2.5-4.9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  text: '<path d="M4 6V4h16v2M12 4v16M9 20h6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  rows: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/>',
};

/* ---------- the Notes screen: My notes | Lessons and files ---------- */
let view = 'notes', query = '', selected = new Set(), paintTimer = 0;
const seg = () => store.get('libSeg', 'keep');
function setSeg(s) {
  store.set('libSeg', s);
  const scr = $('#screen-library'); if (!scr) return;
  scr.classList.toggle('seg-keep', s === 'keep'); scr.classList.toggle('seg-files', s !== 'keep');
  $$('#lib-seg [data-seg]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.seg === s)));
  if (s === 'keep') paint(); else clearSel();
}
function mount() {
  const scr = $('#screen-library'); if (!scr || $('#keep')) return;
  const head = scr.querySelector('.row-between');
  head.insertAdjacentHTML('afterend', `<div class="seg" id="lib-seg" role="tablist"><button type="button" role="tab" data-seg="keep">${t('My notes', 'ملاحظاتي')}</button><button type="button" role="tab" data-seg="files">${t('Lessons and files', 'الدروس والملفات')}</button></div>
    <div id="keep"><div class="kp-search"><input id="kp-q" type="search" dir="auto" placeholder="${t('Search your notes', 'ابحث في ملاحظاتك')}"><button type="button" class="kp-ib" id="kp-layout"></button></div>
      <div class="kp-chips" id="kp-chips"></div>
      <div class="kp-take" id="kp-take"><button type="button" class="kp-take-t" id="kp-take-t">${t('Take a note…', 'اكتب ملاحظة…')}</button>
        <button type="button" class="kp-ib" id="kp-take-list" aria-label="${t('New list', 'قائمة جديدة')}">${I(IC.list)}</button>
        <button type="button" class="kp-ib" id="kp-take-mic" aria-label="${t('Voice note', 'ملاحظة صوتية')}">${I(IC.mic)}</button></div>
      <div id="kp-grid" class="kp-wrap"></div></div>`);
  // the files part: everything that was already on the screen
  const files = document.createElement('div'); files.id = 'lib-files';
  [...scr.children].filter(x => !['row-between', 'seg'].some(c => x.classList.contains(c)) && x.id !== 'keep' && x.id !== 'lib-seg').forEach(x => files.appendChild(x));
  scr.appendChild(files);
  scr.insertAdjacentHTML('beforeend', `<div class="kp-selbar" id="kp-selbar" hidden><button type="button" class="kp-ib" id="kp-sel-x" aria-label="${t('Cancel', 'إلغاء')}">${I(IC.x)}</button><b id="kp-sel-n"></b><span class="kp-sp"></span>
      <button type="button" class="kp-ib" data-sa="pin">${I(IC.pin)}</button><button type="button" class="kp-ib" data-sa="color" aria-label="${t('Colour', 'اللون')}">${I(IC.palette)}</button><button type="button" class="kp-ib" data-sa="label" aria-label="${t('Label', 'تصنيف')}">${I(IC.label)}</button><button type="button" class="kp-ib" data-sa="archive">${I(IC.archive)}</button><button type="button" class="kp-ib" data-sa="trash" aria-label="${t('Delete', 'حذف')}">${I(IC.trash)}</button><button type="button" class="kp-ib" data-sa="all" aria-label="${t('Select all', 'تحديد الكل')}">${I(IC.all)}</button></div>
    <button type="button" class="kp-aibtn" id="kp-aibtn" hidden>${I(IC.ai, 18)}<span id="kp-aibtn-t"></span></button>`);
  $$('#lib-seg [data-seg]').forEach(b => b.onclick = () => setSeg(b.dataset.seg));
  $('#kp-q').addEventListener('input', e => { query = e.target.value.trim(); paint(); });
  const lay = () => { const one = store.get('kpList', false); $('#kp-grid').classList.toggle('list', one); const b = $('#kp-layout'); b.innerHTML = I(one ? IC.grid : IC.rows); b.setAttribute('aria-label', one ? t('Grid view', 'عرض شبكي') : t('List view', 'عرض قائمة')); };
  $('#kp-layout').onclick = () => { store.set('kpList', !store.get('kpList', false)); lay(); }; lay();
  $('#kp-take-t').onclick = () => edit(null);
  $('#kp-take-list').onclick = () => edit(null, { list: true });
  $('#kp-take-mic').onclick = () => edit(null, { voice: true });
  $('#kp-sel-x').onclick = clearSel;
  $$('#kp-selbar [data-sa]').forEach(b => b.onclick = () => selAction(b.dataset.sa, b));
  $('#kp-aibtn').onclick = () => aiSheet([...selected]);
  setSeg(seg());
}

// what shows: notes / a label / archive / bin, then the search
function shown() {
  const q = query.toLowerCase();
  return (notes || []).filter(n => {
    if (view === 'trash') { if (!n.trashed) return false; }
    else if (n.trashed) return false;
    else if (view === 'archive') { if (!n.archived) return false; }
    else if (n.archived) return false;
    else if (view !== 'notes' && !(n.labels || []).includes(view)) return false;
    return !q || plain(n).toLowerCase().includes(q) || (n.labels || []).some(l => l.toLowerCase().includes(q));
  }).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
const labels = () => [...new Set((notes || []).filter(n => !n.trashed).flatMap(n => n.labels || []))].sort((a, b) => a.localeCompare(b));
function paintSoon() { clearTimeout(paintTimer); paintTimer = setTimeout(paint, 60); }
async function paint() {
  if (!$('#keep') || seg() !== 'keep') return;
  await load();
  const chips = $('#kp-chips'), L = labels();
  if (!['notes', 'archive', 'trash'].includes(view) && !L.includes(view)) view = 'notes';
  chips.innerHTML = [['notes', t('All', 'الكل')], ...L.map(l => [l, '# ' + l]), ['archive', t('Archive', 'الأرشيف')], ['trash', t('Bin', 'المحذوفات')]]
    .map(([k, v]) => `<button type="button" class="chip${view === k ? ' on' : ''}" data-v="${esc(k)}" dir="auto">${esc(v)}</button>`).join('');
  $$('[data-v]', chips).forEach(b => b.onclick = () => { view = b.dataset.v; clearSel(); paint(); });
  $('#kp-take').hidden = view === 'trash' || view === 'archive';
  const list = shown(), grid = $('#kp-grid');
  const pinned = list.filter(n => n.pinned && view !== 'trash'), rest = list.filter(n => !(n.pinned && view !== 'trash'));
  const sec = (title, l) => l.length ? `${title ? `<div class="kp-h">${title}</div>` : ''}<div class="kp-grid">${l.map(card).join('')}</div>` : '';
  grid.innerHTML = list.length
    ? (view === 'trash' ? `<p class="muted kp-note">${t('Notes in the bin are deleted after 7 days.', 'تُحذف الملاحظات من المحذوفات بعد ٧ أيام.')} <button type="button" class="link" id="kp-empty-bin">${t('Empty the bin', 'أفرغ المحذوفات')}</button></p>` : '')
      + sec(pinned.length ? t('Pinned', 'مثبّتة') : '', pinned) + sec(pinned.length ? t('Others', 'أخرى') : '', rest)
    : `<div class="kp-empty">${I(IC.ai, 34)}<b>${query ? t('No notes match.', 'لا ملاحظات مطابقة.') : view === 'trash' ? t('The bin is empty.', 'المحذوفات فارغة.') : view === 'archive' ? t('No archived notes.', 'لا ملاحظات مؤرشفة.') : t('Your notes will show here', 'ستظهر ملاحظاتك هنا')}</b>${!query && view === 'notes' ? `<span>${t('Write ideas, lists and voice notes. Then press and hold to pick some, and the AI can combine them, summarise them or make a study file.', 'اكتب أفكارك وقوائمك وملاحظاتك الصوتية. ثم اضغط مطولًا لتختار بعضها، والذكاء الاصطناعي يدمجها أو يلخّصها أو يصنع منها ملفًا دراسيًا.')}</span><button type="button" class="ghost small" id="kp-bring">${t('Bring notes from Google Keep, Evernote or Notion', 'انقل ملاحظاتك من Google Keep أو Evernote أو Notion')}</button>` : ''}</div>`;
  const eb = $('#kp-empty-bin'); if (eb) eb.onclick = async () => { for (const n of notes.filter(x => x.trashed)) await remove(n.id, true); };
  const br = $('#kp-bring'); if (br) br.onclick = () => window.JundImport?.open();
  $$('.kp-card', grid).forEach(wire);
  fillImgs(grid);
  selBar();
}
function card(n) {
  const items = n.items || null, open = items ? items.filter(i => !i.done) : [], done = items ? items.filter(i => i.done) : [];
  const body = items
    ? `<ul class="kp-items${n.title ? '' : ' kp-first'}">${open.slice(0, 8).map(i => `<li dir="auto"><span class="kp-box"></span>${esc(i.t)}</li>`).join('')}${done.length ? `<li class="kp-more">${t(`+ ${done.length} ticked`, `+ ${num(done.length)} منجزة`)}</li>` : ''}${open.length > 8 ? `<li class="kp-more">…</li>` : ''}</ul>`
    : n.text ? `<div class="kp-body${n.title ? '' : ' kp-first'}" dir="auto">${esc(String(n.text).slice(0, 600))}</div>` : '';
  const im = (n.images || [])[0];
  return `<article class="kp-card${selected.has(n.id) ? ' sel' : ''}${im ? ' has-img' : ''}" data-id="${esc(n.id)}" data-c="${esc(n.color || '')}" tabindex="0" role="button" aria-label="${esc(n.title || plain(n).slice(0, 40) || t('Note', 'ملاحظة'))}">
    <span class="kp-chk" aria-hidden="true">${I(IC.check, 14)}</span>
    ${im ? `<div class="kp-cimg" style="aspect-ratio:${Math.max(0.6, Math.min(1.8, (im.w || 4) / (im.h || 3)))}"><img alt="" data-img="${esc(im.id)}">${n.images.length > 1 ? `<span class="kp-imgn">+${num(n.images.length - 1)}</span>` : ''}</div>` : ''}
    ${n.share?.id ? `<span class="kp-shared" title="${t('Shared', 'مشاركة')}">${I(IC.people, 14)}</span>` : ''}
    ${n.pinned ? `<span class="kp-pinned">${I(IC.pin, 14)}</span>` : ''}
    ${n.title ? `<b class="kp-t" dir="auto">${esc(n.title)}</b>` : ''}${body}
    ${(n.labels || []).length || n.ai || n.remind ? `<div class="kp-lbls">${n.remind && new Date(`${n.remind.date}T${n.remind.time || '09:00'}`) > new Date() ? `<span>${I(IC.bell, 11)} ${esc(whenText(n.remind))}</span>` : ''}${(n.labels || []).slice(0, 3).map(l => `<span dir="auto">${esc(l)}</span>`).join('')}${n.ai ? `<span class="kp-aitag">✦ ${t('AI', 'ذكاء')}</span>` : ''}</div>` : ''}
  </article>`;
}

/* ---------- picking notes: press and hold, or tap the circle ---------- */
function wire(el) {
  let hold = 0, held = false, sx = 0, sy = 0;
  el.addEventListener('pointerdown', e => { held = false; sx = e.clientX; sy = e.clientY; hold = setTimeout(() => { held = true; toggle(el.dataset.id); try { navigator.vibrate?.(15); } catch {} }, 450); });
  el.addEventListener('pointermove', e => { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) clearTimeout(hold); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(k => el.addEventListener(k, () => clearTimeout(hold)));
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('click', e => {
    if (held) { held = false; return; }
    if (e.target.closest('.kp-chk') || selected.size) { toggle(el.dataset.id); return; }
    edit(el.dataset.id);
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') el.click(); if (e.key === ' ') { e.preventDefault(); toggle(el.dataset.id); } });
}
function toggle(id) {
  selected.has(id) ? selected.delete(id) : selected.add(id);
  $(`.kp-card[data-id="${CSS.escape(id)}"]`)?.classList.toggle('sel', selected.has(id));
  selBar();
}
function clearSel() { selected.clear(); $$('.kp-card.sel').forEach(c => c.classList.remove('sel')); selBar(); }
function selBar() {
  const n = selected.size, bar = $('#kp-selbar'), ai = $('#kp-aibtn'); if (!bar) return;
  const on = n > 0 && seg() === 'keep' && !$('#screen-library')?.hidden;
  bar.hidden = !on; ai.hidden = !on || view === 'trash';
  document.body.classList.toggle('kp-selecting', on);
  if (!on) return;
  $('#kp-sel-n').textContent = t(`${n} selected`, `${num(n)} محددة`);
  $('#kp-aibtn-t').textContent = n === 1 ? t('Work on it with AI', 'اعمل عليها بالذكاء الاصطناعي') : t(`Work on ${n} notes with AI`, `اعمل على ${num(n)} ملاحظات بالذكاء الاصطناعي`);
  const sel = [...selected].map(id => notes.find(x => x.id === id)).filter(Boolean);
  const allPinned = sel.every(x => x.pinned);
  const pb = $('#kp-selbar [data-sa="pin"]'); pb.innerHTML = I(allPinned ? IC.pinOff : IC.pin); pb.setAttribute('aria-label', allPinned ? t('Unpin', 'إلغاء التثبيت') : t('Pin', 'تثبيت'));
  const ab = $('#kp-selbar [data-sa="archive"]'); ab.innerHTML = I(view === 'trash' ? IC.unarchive : view === 'archive' ? IC.unarchive : IC.archive);
  ab.setAttribute('aria-label', view === 'trash' ? t('Restore', 'استرجاع') : view === 'archive' ? t('Unarchive', 'إلغاء الأرشفة') : t('Archive', 'أرشفة'));
  $('#kp-selbar [data-sa="trash"]').setAttribute('aria-label', view === 'trash' ? t('Delete forever', 'حذف نهائي') : t('Delete', 'حذف'));
}
async function selAction(a, btn) {
  const sel = [...selected].map(id => notes.find(x => x.id === id)).filter(Boolean);
  if (a === 'all') { shown().forEach(n => selected.add(n.id)); paint(); return; }
  if (!sel.length) return;
  if (a === 'pin') { const on = !sel.every(x => x.pinned); for (const n of sel) { n.pinned = on; await save(n, { quiet: true }); } }
  if (a === 'archive') {
    for (const n of sel) { if (view === 'trash') n.trashed = 0; else n.archived = view !== 'archive'; await save(n, { quiet: true }); }
    if (view === 'notes' || !['archive', 'trash'].includes(view)) undoToast(sel, 'archive');
    else toast(view === 'trash' ? t('✓ Restored', '✓ استُرجعت') : t('✓ Back in your notes', '✓ عادت إلى ملاحظاتك'));
  }
  if (a === 'trash') {
    if (view === 'trash') { for (const n of sel) await remove(n.id, true); toast(t('✓ Deleted forever', '✓ حُذفت نهائيًا')); }
    else { for (const n of sel) await remove(n.id, false); undoToast(sel); }
  }
  if (a === 'color') { pickColor(btn, async c => { for (const n of sel) { n.color = c; await save(n, { quiet: true }); } paint(); }); return; }
  if (a === 'label') { pickLabels(sel, () => paint()); return; }
  clearSel(); paint();
}
function toast(m, ms) { window.JundCal?.toast?.(m, ms); }
function undoToast(sel, what = 'bin') {
  const ids = sel.map(n => n.id || n);
  window.JundCal?.toast?.(what === 'bin' ? t(`✓ Moved ${ids.length} to the bin`, `✓ نُقلت ${num(ids.length)} إلى المحذوفات`) : t(`✓ Archived ${ids.length}`, `✓ أُرشفت ${num(ids.length)}`), 6000,
    { label: t('Undo', 'تراجع'), fn: async () => { for (const id of ids) { const n = notes.find(x => x.id === id); if (!n) continue; if (what === 'bin') n.trashed = 0; else n.archived = false; await save(n, { quiet: true }); } paint(); } });
}

/* ---------- small pickers ---------- */
function pop(anchor, html, wire) {
  $('#kp-pop')?.remove();
  const p = document.createElement('div'); p.id = 'kp-pop'; p.className = 'kp-pop'; p.innerHTML = html; p.dir = AR() ? 'rtl' : 'ltr';
  // inside the open editor or sheet (they sit above the page, so a menu on the page would be hidden and untouchable)
  ([...document.querySelectorAll('dialog[open]')].pop() || document.body).appendChild(p);
  const r = anchor.getBoundingClientRect(), w = Math.min(320, innerWidth - 16);
  p.style.width = w + 'px';
  p.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  const below = r.bottom + 8, h = p.offsetHeight;
  p.style.top = (below + h < innerHeight - 8 ? below : Math.max(8, r.top - h - 8)) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
  wire(p);
  return p;
}
function pickColor(anchor, done, cur = null) {
  pop(anchor, `<div class="kp-pal">${COLORS.map(c => `<button type="button" class="kp-dot${c === cur ? ' on' : ''}" data-c="${c}" data-col="${c}" aria-label="${(AR() ? CNAME[c][1] : CNAME[c][0])}"></button>`).join('')}</div>`,
    p => $$('[data-col]', p).forEach(b => b.onclick = () => { p.remove(); done(b.dataset.col); }));
}
function pickLabels(sel, done) {
  const all = labels();
  const has = l => sel.every(n => (n.labels || []).includes(l));
  const d = dlg('kp-lbl', `<div class="kp-dh"><b>${t('Labels', 'التصنيفات')}</b></div>
    <div class="kp-newl"><input id="kp-newl" dir="auto" maxlength="40" placeholder="${t('New label', 'تصنيف جديد')}"><button type="button" class="ghost small" id="kp-newl-add">${t('Add', 'إضافة')}</button></div>
    <div class="kp-llist">${all.map(l => `<label class="kp-lrow" dir="auto"><input type="checkbox" value="${esc(l)}"${has(l) ? ' checked' : ''}> ${esc(l)}</label>`).join('') || `<p class="muted">${t('No labels yet. Type one above.', 'لا تصنيفات بعد. اكتب واحدًا في الأعلى.')}</p>`}</div>
    <div class="kp-dact"><button type="button" class="primary" id="kp-lbl-ok">${t('Done', 'تم')}</button></div>`);
  const add = () => { const v = $('#kp-newl', d).value.trim(); if (!v) return; const row = document.createElement('label'); row.className = 'kp-lrow'; row.innerHTML = `<input type="checkbox" value="${esc(v)}" checked> ${esc(v)}`; $('.kp-llist', d).querySelector('p')?.remove(); $('.kp-llist', d).prepend(row); $('#kp-newl', d).value = ''; };
  $('#kp-newl-add', d).onclick = add;
  $('#kp-newl', d).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  $('#kp-lbl-ok', d).onclick = async () => {
    const want = $$('.kp-lrow input', d).map(x => [x.value, x.checked]);
    for (const n of sel) {
      let ls = new Set(n.labels || []);
      for (const [l, on] of want) { if (on) ls.add(l); else if (all.includes(l)) ls.delete(l); }
      n.labels = [...ls]; await save(n, { quiet: true });
    }
    d.close(); done?.();
  };
}
function dlg(id, html) {
  let d = document.getElementById(id);
  if (!d) { d = document.createElement('dialog'); d.id = id; d.className = 'kp-sheet'; document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d) d.close(); }); }
  d.dir = AR() ? 'rtl' : 'ltr'; d.innerHTML = html;
  if (!d.open) d.showModal();
  return d;
}

/* ---------- the editor: like Keep, saved as you type ---------- */
let cur = null, saveTimer = 0;
async function edit(id, opts = {}) {
  await load();
  const n = id ? notes.find(x => x.id === id) : { id: newId(), title: '', text: opts.text || '', items: opts.list ? [{ t: '', done: false }] : null, color: '', pinned: false, labels: view !== 'notes' && !['archive', 'trash'].includes(view) ? [view] : [], ...(opts.note || {}) };
  if (!n) return;
  cur = JSON.parse(JSON.stringify(n));
  let d = $('#kp-ed');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'kp-ed'; d.className = 'kp-ed'; document.body.appendChild(d);
    d.addEventListener('close', closeEditor);
  }
  d.dir = AR() ? 'rtl' : 'ltr'; d.dataset.c = cur.color || '';
  const inBin = !!cur.trashed;
  d.innerHTML = `<div class="kp-ed-top"><button type="button" class="kp-ib" id="kp-ed-back" aria-label="${t('Back', 'رجوع')}">${I(IC.back)}</button><span class="kp-sp"></span>
      ${inBin ? '' : `<button type="button" class="kp-ib" id="kp-ed-pin" aria-label="${t('Pin', 'تثبيت')}" aria-pressed="${!!cur.pinned}">${I(cur.pinned ? IC.pinOff : IC.pin)}</button>
      <button type="button" class="kp-ib" id="kp-ed-arch" aria-label="${cur.archived ? t('Unarchive', 'إلغاء الأرشفة') : t('Archive', 'أرشفة')}">${I(cur.archived ? IC.unarchive : IC.archive)}</button>`}
      <button type="button" class="kp-ib" id="kp-ed-more" aria-label="${t('More', 'المزيد')}">${I(IC.more)}</button></div>
    <div class="kp-ed-body">
      <div class="kp-eimgs" id="kp-eimgs"></div>
      ${inBin ? `<p class="kp-binnote">${t('This note is in the bin.', 'هذه الملاحظة في المحذوفات.')} <button type="button" class="link" id="kp-ed-restore">${t('Restore', 'استرجاع')}</button></p>` : ''}
      <input class="kp-title" id="kp-title" dir="auto" placeholder="${t('Title', 'العنوان')}" maxlength="200" value="${esc(cur.title || '')}">
      <div id="kp-content"></div>
      <div class="kp-ed-lbls" id="kp-ed-lbls"></div>
      ${cur.from ? `<small class="muted kp-from">${t('Brought in from', 'نُقلت من')} ${esc(cur.from)}</small>` : ''}
    </div>
    <div class="kp-rec" id="kp-rec" hidden><span class="kp-dotrec"></span><span id="kp-rec-t">0:00</span><span class="kp-sp"></span><button type="button" class="ghost small" id="kp-rec-x">${t('Cancel', 'إلغاء')}</button><button type="button" class="primary small" id="kp-rec-stop">${t('Done', 'تم')}</button></div>
    <div class="kp-ed-bot">
      <button type="button" class="kp-ib kp-addb" id="kp-ed-add" aria-label="${t('Add a photo, a checklist or voice', 'أضف صورة أو قائمة أو صوتًا')}">${I(IC.plus)}</button>
      <button type="button" class="kp-ib" id="kp-ed-color" aria-label="${t('Colour', 'اللون')}">${I(IC.palette)}</button>
      <button type="button" class="kp-ib" id="kp-ed-bell" aria-label="${t('Remind me', 'ذكّرني')}">${I(IC.bell)}</button>
      <button type="button" class="kp-ib" id="kp-ed-label" aria-label="${t('Labels', 'التصنيفات')}">${I(IC.label)}</button>
      <input type="file" id="kp-ed-file" accept="image/*" multiple hidden>
      <span class="kp-sp"></span><small class="kp-edited muted" id="kp-edited"></small><span class="kp-sp"></span>
      <button type="button" class="kp-aichip" id="kp-ed-ai">${I(IC.ai, 16)} ${t('AI', 'الذكاء')}</button>
    </div>`;
  paintContent(); paintLabels(); edited();
  $('#kp-ed-back', d).onclick = () => d.close();
  $('#kp-title', d).addEventListener('input', e => { cur.title = e.target.value; dirty(); });
  const pin = $('#kp-ed-pin', d); if (pin) pin.onclick = () => { cur.pinned = !cur.pinned; pin.innerHTML = I(cur.pinned ? IC.pinOff : IC.pin); pin.setAttribute('aria-pressed', String(cur.pinned)); dirty(); };
  const ar = $('#kp-ed-arch', d); if (ar) ar.onclick = async () => { cur.archived = !cur.archived; const id = cur.id, on = cur.archived; await flush(); d.close(); if (on) undoToast([id], 'archive'); else toast(t('✓ Back in your notes', '✓ عادت إلى ملاحظاتك')); };
  const rs = $('#kp-ed-restore', d); if (rs) rs.onclick = () => { cur.trashed = 0; dirty(true); d.close(); };
  $('#kp-ed-color', d).onclick = e => pickColor(e.currentTarget, c => { cur.color = c; d.dataset.c = c; dirty(); }, cur.color || '');
  // ＋ like Keep: a photo, a checklist, or speak
  $('#kp-ed-add', d).onclick = e => pop(e.currentTarget, `<div class="kp-menu">
      <button type="button" data-a="photo">${I(IC.photo, 18)} ${t('Add a photo', 'أضف صورة')}</button>
      <button type="button" data-a="list">${I(IC.list, 18)} ${cur.items ? t('Turn into text', 'حوّل إلى نص') : t('Turn into a checklist', 'حوّل إلى قائمة')}</button>
      <button type="button" data-a="voice">${I(IC.mic, 18)} ${t('Add by voice', 'أضف بالصوت')}</button></div>`,
    p => $$('[data-a]', p).forEach(b => b.onclick = () => { p.remove(); const a = b.dataset.a; if (a === 'photo') $('#kp-ed-file', d).click(); else if (a === 'list') toList(!cur.items); else voice(); }));
  $('#kp-ed-label', d).onclick = () => { const snap = { ...cur }; pickLabels([snap], () => { cur.labels = snap.labels; paintLabels(); dirty(); }); };

  $('#kp-ed-bell', d).onclick = e => remindPick(e.currentTarget);

  $('#kp-ed-file', d).onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; await addPhotos(fs); };
  paintImgs();
  $('#kp-ed-ai', d).onclick = async () => { await flush(); if (isEmpty(cur)) { toast(t('Write something first', 'اكتب شيئًا أولًا')); return; } aiSheet([cur.id]); };
  $('#kp-ed-more', d).onclick = e => pop(e.currentTarget, `<div class="kp-menu">
      ${cur.trashed ? '' : `<button type="button" data-m="friend">${I(IC.people, 18)} ${cur.share?.id ? t('Shared with friends', 'مشاركة مع الأصدقاء') : t('Share with a friend', 'شاركها مع صديق')}</button>`}
      <button type="button" data-m="copy">${I(IC.copy, 18)} ${t('Make a copy', 'نسخة')}</button>
      <button type="button" data-m="share">${I(IC.share, 18)} ${t('Send', 'إرسال')}</button>
      <button type="button" data-m="del">${I(IC.trash, 18)} ${cur.trashed ? t('Delete forever', 'حذف نهائي') : t('Delete', 'حذف')}</button></div>`,
    p => $$('[data-m]', p).forEach(b => b.onclick = async () => {
      p.remove();
      const m = b.dataset.m;
      if (m === 'friend') { await flush(); shareSheet(); return; }
      if (m === 'copy') { await flush(); const c = { ...JSON.parse(JSON.stringify(cur)), id: newId(), pinned: false, created: 0 }; await save(c); toast(t('✓ Copy made', '✓ صُنعت نسخة')); }
      if (m === 'share') {   // a copy of the text (and photos) to any app
        const txt = plain(cur);
        try {
          const files = [];
          for (const im of cur.images || []) { const r = await DB.img(im.id); if (r) files.push(new File([await (await fetch(r.data)).blob()], `${im.id}.jpg`, { type: 'image/jpeg' })); }
          if (navigator.share && files.length && navigator.canShare?.({ files })) await navigator.share({ title: cur.title || 'Mustatar', text: txt, files });
          else if (navigator.share) await navigator.share({ title: cur.title || 'Mustatar', text: txt });
          else { await navigator.clipboard.writeText(txt); toast(t('✓ Copied', '✓ نُسخت')); }
        } catch {}
      }
      if (m === 'del') { const id = cur.id, bin = cur.trashed; await flush(); cur = null; d.close(); if (bin) await remove(id, true); else { await remove(id, false); undoToast([id]); } }
    }));
  if (!d.open) d.showModal();
  if (opts.voice) voice();
  else if (!id) setTimeout(() => { if (cur) (cur.items ? $('.kp-it', d) : $('#kp-text', d))?.focus(); }, 60);
}
function paintContent() {
  const box = $('#kp-content'); if (!box) return;
  if (!cur.items) {
    box.innerHTML = `<textarea class="kp-text" id="kp-text" dir="auto" placeholder="${t('Note', 'ملاحظة')}">${esc(cur.text || '')}</textarea>`;
    const ta = $('#kp-text'); const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(160, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', () => { cur.text = ta.value; fit(); dirty(); }); setTimeout(fit, 0);
    return;
  }
  const open = cur.items.map((x, i) => [x, i]).filter(([x]) => !x.done), done = cur.items.map((x, i) => [x, i]).filter(([x]) => x.done);
  const row = ([x, i]) => `<div class="kp-row${x.done ? ' done' : ''}" data-i="${i}"><input type="checkbox"${x.done ? ' checked' : ''} aria-label="${t('Done', 'منجز')}"><input class="kp-it" dir="auto" value="${esc(x.t)}" placeholder="${t('List item', 'عنصر')}"><button type="button" class="kp-ib kp-rm" aria-label="${t('Remove', 'حذف')}">${I(IC.x, 16)}</button></div>`;
  box.innerHTML = `<div class="kp-list">${open.map(row).join('')}<button type="button" class="kp-additem" id="kp-additem">${I(IC.plus, 18)} ${t('List item', 'عنصر')}</button>
    ${done.length ? `<details class="kp-done" open><summary>${t(`${done.length} ticked`, `${num(done.length)} منجزة`)}</summary>${done.map(row).join('')}</details>` : ''}</div>`;
  $$('.kp-row', box).forEach(r => {
    const i = +r.dataset.i, inp = $('.kp-it', r);
    $('input[type=checkbox]', r).onchange = e => { cur.items[i].done = e.target.checked; dirty(); paintContent(); };
    inp.addEventListener('input', () => { cur.items[i].t = inp.value; dirty(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); cur.items.splice(i + 1, 0, { t: '', done: false }); dirty(); paintContent(); $$('.kp-row', box).find(x => +x.dataset.i === i + 1)?.querySelector('.kp-it')?.focus(); }
      if (e.key === 'Backspace' && !inp.value && cur.items.length > 1) { e.preventDefault(); cur.items.splice(i, 1); dirty(); paintContent(); const prev = $$('.kp-row', box).find(x => +x.dataset.i === Math.max(0, i - 1)); prev?.querySelector('.kp-it')?.focus(); }
    });
    $('.kp-rm', r).onclick = () => { cur.items.splice(i, 1); if (!cur.items.length) cur.items.push({ t: '', done: false }); dirty(); paintContent(); };
  });
  $('#kp-additem', box).onclick = () => { cur.items.push({ t: '', done: false }); dirty(); paintContent(); const rows = $$('.kp-list > .kp-row', box); rows.at(-1)?.querySelector('.kp-it')?.focus(); };
}
function toList(on) {
  if (on) { cur.items = String(cur.text || '').split('\n').map(s => s.replace(/^\s*(?:[-*•]|[☐☑]|\d+[.)])\s*/, '').trim()).filter(Boolean).map(s => ({ t: s, done: false })); if (!cur.items.length) cur.items = [{ t: '', done: false }]; cur.text = ''; }
  else { cur.text = cur.items.filter(i => i.t.trim()).map(i => (i.done ? '☑ ' : '') + i.t).join('\n'); cur.items = null; }
  dirty(); paintContent();
}
function paintLabels() {
  const box = $('#kp-ed-lbls'); if (!box) return;
  const r = cur.remind && new Date(`${cur.remind.date}T${cur.remind.time || '09:00'}`) > new Date(Date.now() - 864e5) ? cur.remind : null;
  box.innerHTML = (r ? `<span class="chip small kp-remchip">${I(IC.bell, 14)} ${esc(whenText(r))}<button type="button" class="kp-remx" aria-label="${t('Remove the reminder', 'إلغاء التذكير')}">✕</button></span>` : '')
    + (cur.labels || []).map(l => `<span class="chip small" dir="auto">${esc(l)}</span>`).join('');
  const x = $('.kp-remx', box); if (x) x.onclick = () => { window.JundCal?.remove?.(cur.remind.ev); cur.remind = null; paintLabels(); dirty(true); };
}
const whenText = r => new Date(`${r.date}T${r.time || '09:00'}`).toLocaleString(AR() ? 'ar-SA-u-ca-gregory' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
function remindPick(anchor) {
  const now = new Date(), tom = new Date(+now + 864e5), iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const later = new Date(+now + 3 * 3600e3); const lt = `${String(later.getHours()).padStart(2, '0')}:00`;
  pop(anchor, `<div class="kp-rem"><b>${t('Remind me', 'ذكّرني')}</b>
      <button type="button" class="kp-remq" data-d="${iso(later)}" data-t="${lt}">${t('Later today', 'لاحقًا اليوم')} · ${lt}</button>
      <button type="button" class="kp-remq" data-d="${iso(tom)}" data-t="08:00">${t('Tomorrow', 'غدًا')} · 08:00</button>
      <div class="kp-two"><input type="date" id="kp-rem-d" value="${cur.remind?.date || iso(tom)}" min="${iso(now)}"><input type="time" id="kp-rem-t" value="${cur.remind?.time || '09:00'}"></div>
      <button type="button" class="primary small" id="kp-rem-ok">${t('Save', 'حفظ')}</button></div>`, p => {
    const set = (date, time) => {
      p.remove();
      if (cur.remind?.ev) window.JundCal?.remove?.(cur.remind.ev);
      const title = cur.title || plain(cur).split('\n')[0].slice(0, 60) || t('Note', 'ملاحظة');
      const ev = window.JundCal?.add?.({ title, date, time, type: 'task', remind: 0, notes: t('From My notes', 'من ملاحظاتي'), keep: cur.id });
      cur.remind = { date, time, ev: ev?.id };
      window.JundCal?.pushSync?.();
      paintLabels(); dirty(true);
      toast(t(`✓ I will remind you ${whenText(cur.remind)}`, `✓ سأذكّرك ${whenText(cur.remind)}`));
    };
    $$('.kp-remq', p).forEach(b => b.onclick = () => set(b.dataset.d, b.dataset.t));
    $('#kp-rem-ok', p).onclick = () => { const d = $('#kp-rem-d', p).value, tm = $('#kp-rem-t', p).value; if (d) set(d, tm || '09:00'); };
  });
}
function edited() {
  const el = $('#kp-edited'); if (!el || !cur.updated) { if (el) el.textContent = ''; return; }
  const d = new Date(cur.updated), today = new Date().toDateString() === d.toDateString();
  el.textContent = t('Edited ', 'عُدّلت ') + (today ? d.toLocaleTimeString(AR() ? 'ar-SA' : 'en-GB', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(AR() ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short' }));
}
function dirty(now = false) { clearTimeout(saveTimer); if (now) flush(); else saveTimer = setTimeout(flush, 500); }
async function flush() {
  clearTimeout(saveTimer);
  if (!cur || isEmpty(cur)) return;
  const n = JSON.parse(JSON.stringify(cur));
  if (n.items) n.items = n.items.filter((x, i, a) => x.t.trim() || i === a.length - 1);
  await save(n); cur.updated = n.updated; cur.created = n.created; edited();
  if (n.share?.id) pushShare(n);
}
async function closeEditor() {
  stopVoice(true);
  if (!cur) { paint(); return; }
  if (isEmpty(cur)) { if (notes.some(x => x.id === cur.id)) await remove(cur.id, true); else if (cur.title === '' && !cur.text) toast(t('Empty note discarded', 'حُذفت ملاحظة فارغة')); }
  else await flush();
  cur = null; paint();
}

/* ---------- voice: speak, and the words are written into the note ---------- */
let rec = null;
async function voice() {
  if (rec) return;
  let stream;
  try { stream = await openMic({ echoCancellation: true, noiseSuppression: true }); }
  catch (e) { toast('✗ ' + micError(e), 6000); return; }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(x => window.MediaRecorder?.isTypeSupported?.(x)) || '';
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : {}), chunks = [];
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec = { mr, stream, chunks, start: Date.now(), cancel: false };
  const bar = $('#kp-rec'); if (bar) bar.hidden = false;
  const tick = () => { if (!rec) return; const s = Math.floor((Date.now() - rec.start) / 1000); const el = $('#kp-rec-t'); if (el) el.textContent = `${num(Math.floor(s / 60))}:${num(String(s % 60).padStart(2, '0'))}`; if (s >= 300) stopVoice(false); else rec.tm = setTimeout(tick, 250); };
  tick();
  $('#kp-rec-x').onclick = () => stopVoice(true);
  $('#kp-rec-stop').onclick = () => stopVoice(false);
  mr.start(1000);
}
async function stopVoice(cancel) {
  if (!rec) return;
  const r = rec; rec = null; clearTimeout(r.tm);
  const bar = $('#kp-rec'); if (bar) bar.hidden = true;
  const ended = new Promise(res => { r.mr.onstop = res; });
  try { r.mr.stop(); } catch {}
  await ended; r.stream.getTracks().forEach(x => x.stop());
  if (cancel || !r.chunks.length) return;
  const blob = new Blob(r.chunks, { type: (r.mr.mimeType || 'audio/webm').split(';')[0] });
  const target = cur; const el = $('#kp-edited'); if (el) el.textContent = t('Writing what you said…', 'تُكتب كلماتك…');
  try {
    const res = await J.serverFetch('/transcribe?mime=' + encodeURIComponent(blob.type) + '&langs=' + encodeURIComponent(J.speechLangs?.() || 'ar,en'), { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
    const out = await J.readStream(res);
    const said = String(out.text || '').replace(/\[\[END\]\]/g, '').replace(/\s+/g, ' ').trim();
    if (!said) { toast(t('Nothing was heard. Try again a little closer.', 'لم يُسمع شيء. حاول مرة أخرى بصوت أقرب.')); edited(); return; }
    if (target && cur === target) {
      if (cur.items) { const last = cur.items.at(-1); if (last && !last.t.trim()) last.t = said; else cur.items.push({ t: said, done: false }); paintContent(); }
      else { cur.text = (cur.text ? cur.text.replace(/\s*$/, '') + '\n' : '') + said; paintContent(); }
      cur.voice = true; dirty(true);
    } else await save({ id: newId(), title: '', text: said, items: null, color: '', labels: [], voice: true });
  } catch (e) { toast('✗ ' + J.errText(e)); edited(); }
}

/* ---------- photos in notes (like Keep), with "Grab the text" ---------- */
const imgCache = new Map();
async function imgData(id) {
  if (imgCache.has(id)) return imgCache.get(id);
  const r = await DB.img(id).catch(() => null);
  if (r) imgCache.set(id, r.data);
  return r?.data || '';
}
async function fillImgs(root) { for (const el of $$('img[data-img]', root)) { if (!el.src) { const d = await imgData(el.dataset.img); if (d) el.src = d; } } }
// a photo is kept as a JPEG of at most 1600 px (under ~0.9 MB, so it also fits your private space)
async function shrink(file, max = 1600, q = 0.82) {
  const bmp = await createImageBitmap(file);
  for (const [m, qq] of [[max, q], [1280, 0.75], [1000, 0.68], [800, 0.6]]) {
    const k = Math.min(1, m / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', qq);
    if (data.length < 900_000) return { data, w: c.width, h: c.height };
  }
  throw new Error(t('This photo is too big.', 'هذه الصورة كبيرة جدًا.'));
}
async function addPhotos(files) {
  if (!cur) return;
  const imgs = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name));
  if (!imgs.length) return;
  cur.images ||= [];
  for (const f of imgs.slice(0, 12 - cur.images.length)) {
    try {
      const { data, w, h } = await shrink(f);
      const id = 'P' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await DB.putImg({ id, data, w, h, note: cur.id, updated: Date.now() }); imgCache.set(id, data);
      J.cloud.keepImg?.(id);
      cur.images.push({ id, w, h });
    } catch (e) { toast('✗ ' + (e.message || t('Could not add the photo.', 'تعذّرت إضافة الصورة.'))); }
  }
  if (cur.images.length >= 12) toast(t('A note can hold up to 12 photos.', 'تتسع الملاحظة لـ١٢ صورة.'));
  paintImgs(); dirty(true);
}
function paintImgs() {
  const box = $('#kp-eimgs'); if (!box || !cur) return;
  const l = cur.images || [];
  box.className = 'kp-eimgs n' + Math.min(l.length, 3);
  box.innerHTML = l.map(im => `<button type="button" class="kp-eimg" data-im="${esc(im.id)}" style="aspect-ratio:${Math.max(0.6, Math.min(1.8, (im.w || 4) / (im.h || 3)))}"><img alt="" data-img="${esc(im.id)}"></button>`).join('');
  $$('[data-im]', box).forEach(b => b.onclick = () => viewImg(b.dataset.im));
  fillImgs(box);
}
function viewImg(id) {
  let d = $('#kp-view');
  if (!d) { d = document.createElement('dialog'); d.id = 'kp-view'; d.className = 'kp-view'; document.body.appendChild(d); }
  d.dir = AR() ? 'rtl' : 'ltr';
  d.innerHTML = `<div class="kp-vtop"><button type="button" class="kp-ib" id="kp-v-x" aria-label="${t('Back', 'رجوع')}">${I(IC.back)}</button><span class="kp-sp"></span>
      <button type="button" class="kp-vbtn" id="kp-v-text">${I(IC.text, 18)} ${t('Grab the text', 'استخرج النص')}</button>
      <button type="button" class="kp-ib" id="kp-v-del" aria-label="${t('Delete the photo', 'احذف الصورة')}">${I(IC.trash)}</button></div>
    <div class="kp-vimg"><img alt="" id="kp-v-img"></div><div class="kp-vst" id="kp-v-st"></div>`;
  imgData(id).then(src => { const im = $('#kp-v-img', d); if (im) im.src = src; });
  $('#kp-v-x', d).onclick = () => d.close();
  $('#kp-v-del', d).onclick = async () => {
    if (!cur) return;
    cur.images = (cur.images || []).filter(x => x.id !== id);
    await DB.delImg(id).catch(() => {}); imgCache.delete(id); J.cloud.keepImg?.(id, true);
    d.close(); paintImgs(); dirty(true);
  };
  $('#kp-v-text', d).onclick = async () => {
    const st = $('#kp-v-st', d), b = $('#kp-v-text', d);
    b.disabled = true; st.textContent = t('Reading the photo…', 'تُقرأ الصورة…');
    try {
      const blob = await (await fetch(await imgData(id))).blob();
      const out = await window.JundAttach.readScanBatch([{ page: 1, blob }], new AbortController().signal);
      const text = String(out?.[0]?.text || '').trim();
      if (!text) { st.textContent = t('No text was found in this photo.', 'لا يوجد نص في هذه الصورة.'); b.disabled = false; return; }
      if (cur) {
        if (cur.items) cur.items.push(...text.split('\n').filter(x => x.trim()).map(x => ({ t: x.trim(), done: false })));
        else cur.text = (cur.text ? cur.text.replace(/\s*$/, '') + '\n\n' : '') + text;
        paintContent(); dirty(true);
      }
      d.close(); toast(t('✓ The text of the photo is in the note', '✓ نص الصورة أُضيف إلى الملاحظة'));
    } catch (e) { st.textContent = '✗ ' + J.errText(e); b.disabled = false; }
  };
  d.showModal();
}
async function imgFromCloud(id, rec) {
  if (!rec) { await DB.delImg(id).catch(() => {}); imgCache.delete(id); return; }
  await DB.putImg({ ...rec, id }); imgCache.set(id, rec.data); paintSoon();
}

/* ---------- share a note with a friend: a private link; they always see the latest ---------- */
const signedIn = () => !!store.get('mstToken', '');
const shareLink = id => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}note.html?id=${encodeURIComponent(id)}`;
async function sharePayload(n) {
  const images = [];
  for (const im of (n.images || []).slice(0, 8)) {
    const src = await imgData(im.id); if (!src) continue;
    // smaller copies for the link, so a note with photos still fits
    try { const blob = await (await fetch(src)).blob(); const s = await shrink(blob, 1000, 0.7); images.push({ data: s.data, w: s.w, h: s.h }); } catch {}
  }
  return { title: n.title || '', text: n.text || '', items: n.items || null, color: n.color || '', labels: n.labels || [], images, by: J.me?.().name || store.get('mstUser', {})?.name || '' };
}
async function shareCall(method, path, note) {
  const res = await J.serverFetch(path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + store.get('mstToken', '') }, body: note ? JSON.stringify({ note }) : undefined });
  return res.json().catch(() => ({}));
}
let shareTimer = 0;
function pushShare(n) {   // after an edit: the friends' copy follows a moment later
  clearTimeout(shareTimer);
  shareTimer = setTimeout(async () => { try { await shareCall('PUT', '/share/' + n.share.id, await sharePayload(n)); } catch {} }, 1500);
}
async function unshare(n, quiet = false) {
  const id = n.share?.id; if (!id) return;
  try { await shareCall('DELETE', '/share/' + id); } catch (e) { if (!quiet) throw e; }
  if (!quiet) { delete n.share; await save(n); }
}
async function shareSheet() {
  if (!cur) return;
  const n = notes.find(x => x.id === cur.id) || cur;
  if (!signedIn()) {
    const d = dlg('kp-share', `<div class="kp-dh"><b>${I(IC.people, 18)} ${t('Share with a friend', 'شاركها مع صديق')}</b><button type="button" class="kp-ib" id="kp-sh-x">${I(IC.x)}</button></div>
      <p>${t('Sign in first (one tap with Google). Then you get a private link: only people you send it to can open it, and they always see your latest version.', 'سجّل الدخول أولًا (ضغطة واحدة بحساب Google). بعدها تحصل على رابط خاص: لا يفتحه إلا من ترسله إليه، ويرى دائمًا آخر نسخة منك.')}</p>
      <div class="kp-dact"><button type="button" class="ghost" id="kp-sh-copy">${t('Send a copy instead', 'أرسل نسخة بدلًا من ذلك')}</button><button type="button" class="primary" id="kp-sh-in">${t('Sign in', 'تسجيل الدخول')}</button></div>`);
    $('#kp-sh-x', d).onclick = () => d.close();
    $('#kp-sh-copy', d).onclick = () => { d.close(); $('#kp-ed-more')?.click(); setTimeout(() => $('#kp-pop [data-m="share"]')?.click(), 50); };
    $('#kp-sh-in', d).onclick = () => { d.close(); $('#kp-ed')?.close(); J.show('settings'); setTimeout(() => { const a = $('#acct-card'); a?.scrollIntoView({ block: 'center' }); a?.querySelector('button')?.focus(); }, 200); };
    return;
  }
  const d = dlg('kp-share', `<div class="kp-dh"><b>${I(IC.people, 18)} ${t('Share with a friend', 'شاركها مع صديق')}</b><button type="button" class="kp-ib" id="kp-sh-x">${I(IC.x)}</button></div><div id="kp-sh-body"><div class="kp-busy"><div class="spinner"></div><span>${t('Making a private link…', 'يُصنع رابط خاص…')}</span></div></div>`);
  $('#kp-sh-x', d).onclick = () => d.close();
  const body = $('#kp-sh-body', d);
  try {
    if (!n.share?.id) {
      const r = await shareCall('POST', '/share', await sharePayload(n));
      if (!r.id) throw new Error(r.error || t('Could not share. Try again.', 'تعذّرت المشاركة. حاول مرة أخرى.'));
      n.share = { id: r.id, at: Date.now() }; if (cur && cur.id === n.id) cur.share = n.share; await save(n);
    } else await shareCall('PUT', '/share/' + n.share.id, await sharePayload(n));
    const link = shareLink(n.share.id);
    body.innerHTML = `<p>${t('Anyone you send this link to can open the note, with its photos, and save a copy. When you edit it, they see the change. Only you can edit it.', 'من ترسل إليه هذا الرابط يفتح الملاحظة بصورها ويستطيع حفظ نسخة. وإذا عدّلتها رأى التعديل. التعديل لك وحدك.')}</p>
      <div class="kp-link"><span dir="ltr">${esc(link)}</span></div>
      <button type="button" class="primary kp-sh-send" id="kp-sh-send">${I(IC.share, 18)} ${t('Send the link', 'أرسل الرابط')}</button>
      <div class="kp-sh-more"><button type="button" class="link" id="kp-sh-cp">${I(IC.link, 16)} ${t('Copy link', 'انسخ الرابط')}</button><button type="button" class="link kp-stop" id="kp-sh-stop">${t('Stop sharing', 'أوقف المشاركة')}</button></div>`;
    $('#kp-sh-cp', d).onclick = async () => { try { await navigator.clipboard.writeText(link); toast(t('✓ Link copied', '✓ نُسخ الرابط')); } catch { toast(link); } };
    $('#kp-sh-send', d).onclick = async () => { try { if (navigator.share) await navigator.share({ title: n.title || 'Mustatar', text: (n.title ? n.title + ' — ' : '') + t('a note from Mustatar', 'ملاحظة من مستطر'), url: link }); else { await navigator.clipboard.writeText(link); toast(t('✓ Link copied', '✓ نُسخ الرابط')); } } catch {} };
    $('#kp-sh-stop', d).onclick = async () => { try { await unshare(n); if (cur && cur.id === n.id) delete cur.share; d.close(); toast(t('✓ The link no longer works', '✓ لم يعد الرابط يعمل')); } catch (e) { toast('✗ ' + J.errText(e)); } };
  } catch (e) { body.innerHTML = `<p class="kp-binnote">✗ ${esc(J.errText(e))}</p>`; }
}

/* ---------- with AI: the part Keep does not have ---------- */
const MAX_IN = 9000;   // the free, fast AI reads about this much at once
function joined(list) {
  let text = list.map((n, i) => `### ${i + 1}. ${n.title || t('Note', 'ملاحظة')}${(n.labels || []).length ? ' [' + n.labels.join(', ') + ']' : ''}\n${[n.text || '', ...(n.items || []).map(x => (x.done ? '☑ ' : '☐ ') + x.t)].filter(Boolean).join('\n')}`).join('\n\n');
  const cut = text.length > MAX_IN; if (cut) text = text.slice(0, MAX_IN);
  return { text, cut };
}
const ACTIONS = [
  { k: 'ask', ic: IC.chat, en: ['Ask about them', 'Chat with the AI using only these notes'], ar: ['اسأل عنها', 'حادث الذكاء الاصطناعي من هذه الملاحظات فقط'] },
  { k: 'combine', ic: IC.merge, en: ['Combine into one note', 'One tidy note: repeats removed, every point kept'], ar: ['ادمجها في ملاحظة واحدة', 'ملاحظة مرتبة: بلا تكرار، وكل نقطة باقية'], min: 2 },
  { k: 'summary', ic: IC.sum, en: ['Summarise', 'The main points, short'], ar: ['لخّصها', 'أهم النقاط باختصار'] },
  { k: 'todo', ic: IC.todo, en: ['Make a to-do list', 'Every task in them, as a checklist'], ar: ['حوّلها إلى قائمة مهام', 'كل مهمة فيها، كقائمة تحقق'] },
  { k: 'study', ic: IC.study, en: ['Make a study file', 'Full notes with headings, a check and a quiz'], ar: ['اصنع ملفًا دراسيًا', 'ملاحظات كاملة بعناوين وتدقيق واختبار'] },
  { k: 'quiz', ic: IC.quiz, en: ['Quiz me', 'Questions one at a time, in the chat'], ar: ['اختبرني', 'أسئلة واحدًا تلو الآخر في المحادثة'] },
  { k: 'expand', ic: IC.expand, en: ['Explain and add more', 'Clearer, with examples (additions are marked)'], ar: ['اشرحها وزد عليها', 'أوضح، مع أمثلة (الإضافات مميّزة)'] },
  { k: 'post', ic: IC.post, en: ['Write a post', 'A short post for social media or Studio'], ar: ['اكتب منشورًا', 'منشور قصير للتواصل أو للاستوديو'] },
];
const ASK = {
  combine: 'Combine these notes into ONE well-organised note. Remove repetition, keep every distinct point, fact, name and number, and group related points under short headings. Do not add new information.',
  summary: 'Summarise these notes: a one-line gist, then the main points as short bullets. Do not add new information.',
  todo: 'Find every task, action or thing to do in these notes and return them as a checklist (items). Keep each item short and clear. If a note is itself a list, keep its unticked items.',
  expand: 'Rewrite these notes so they are clearer and fuller: explain each point simply and add an example where it helps. Mark every sentence you add that is not in the notes with "(added)". Keep all original points.',
  post: 'Write one short social-media post (under 70 words) from these notes, in a warm, clear voice. No hashtags unless the notes have them. Put the post in "text".',
};
function aiSheet(ids) {
  const list = ids.map(id => notes.find(x => x.id === id)).filter(Boolean);
  if (!list.length) return;
  const n = list.length;
  const d = dlg('kp-ai', `<div class="kp-dh"><b>${I(IC.ai, 18)} ${n === 1 ? t('With AI', 'بالذكاء الاصطناعي') : t(`With AI · ${n} notes`, `بالذكاء الاصطناعي · ${num(n)} ملاحظات`)}</b><button type="button" class="kp-ib" id="kp-ai-x" aria-label="${t('Close', 'إغلاق')}">${I(IC.x)}</button></div>
    <div class="kp-picked">${list.slice(0, 6).map(x => `<span class="kp-pk" data-c="${esc(x.color || '')}" dir="auto">${esc((x.title || plain(x)).slice(0, 28) || t('Note', 'ملاحظة'))}</span>`).join('')}${n > 6 ? `<span class="kp-pk">+${num(n - 6)}</span>` : ''}</div>
    <div class="kp-acts" id="kp-acts">${ACTIONS.filter(a => !a.min || n >= a.min).map(a => `<button type="button" class="kp-act" data-k="${a.k}"><span class="kp-acti">${I(a.ic)}</span><span><b>${AR() ? a.ar[0] : a.en[0]}</b><small>${AR() ? a.ar[1] : a.en[1]}</small></span></button>`).join('')}
      ${n >= 2 ? `<button type="button" class="kp-act plain" data-k="merge"><span class="kp-acti">${I(IC.merge)}</span><span><b>${t('Merge as they are', 'ادمجها كما هي')}</b><small>${t('No AI: one note with all the text', 'بلا ذكاء اصطناعي: ملاحظة واحدة بكل النص')}</small></span></button>` : ''}</div>
    <form class="kp-own" id="kp-own"><textarea id="kp-own-t" rows="2" dir="auto" placeholder="${t('Or tell the AI what to make from them… e.g. “a revision plan for this week”', 'أو اكتب للذكاء الاصطناعي ما تريد… مثل «خطة مراجعة لهذا الأسبوع»')}"></textarea><button type="submit" class="primary small">${t('Make', 'اصنع')}</button></form>
    <div class="kp-busy" id="kp-busy" hidden><div class="spinner" aria-hidden="true"></div><span id="kp-busy-t"></span><button type="button" class="ghost small" id="kp-busy-x">${t('Stop', 'إيقاف')}</button></div>`);
  $('#kp-ai-x', d).onclick = () => d.close();
  $$('.kp-act', d).forEach(b => b.onclick = () => run(b.dataset.k, list, d));
  $('#kp-own', d).onsubmit = e => { e.preventDefault(); const q = $('#kp-own-t', d).value.trim(); if (q) run('own', list, d, q); };
}
let aiAbort = null;
async function run(k, list, d, own = '') {
  const { text, cut } = joined(list);
  if (k === 'merge') {
    const all = list.every(x => x.items) ? { items: list.flatMap(x => x.items) } : { text: list.map(x => [x.title ? x.title : '', x.text || '', ...(x.items || []).map(i => (i.done ? '☑ ' : '☐ ') + i.t)].filter(Boolean).join('\n')).join('\n\n— — —\n\n') };
    const nn = await save({ id: newId(), title: list.map(x => x.title).filter(Boolean).slice(0, 2).join(' + ').slice(0, 80), items: all.items || null, text: all.text || '', color: list[0].color || '', labels: [...new Set(list.flatMap(x => x.labels || []))], merged: list.map(x => x.id) });
    d.close(); clearSel(); toast(t('✓ Merged into a new note; the originals are kept', '✓ دُمجت في ملاحظة جديدة، والأصلية باقية')); edit(nn.id); return;
  }
  if (k === 'ask' || k === 'quiz') {
    d.close(); clearSel();
    window.JundAssistant?.withNotes(list.map(x => ({ id: x.id, title: x.title, text: plain(x) })), k === 'quiz' ? t('Quiz me on these notes, one question at a time. Wait for my answer before the next question.', 'اختبرني في هذه الملاحظات، سؤالًا واحدًا كل مرة، وانتظر جوابي قبل السؤال التالي.') : '', k === 'quiz');
    return;
  }
  if (k === 'study') {
    d.close(); clearSel();
    J.show('new');
    setTimeout(() => {
      const ta = $('#transcript'); if (!ta) return;
      ta.value = list.map(x => [x.title ? '# ' + x.title : '', x.text || '', ...(x.items || []).map(i => '- ' + i.t)].filter(Boolean).join('\n')).join('\n\n');
      ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus();
      toast(t('Your notes are in. Choose the subject, then tap Make notes.', 'ملاحظاتك هنا. اختر المادة ثم اضغط «اصنع الملاحظات».'));
    }, 120);
    return;
  }
  const busy = $('#kp-busy', d), acts = $('#kp-acts', d), form = $('#kp-own', d);
  busy.hidden = false; acts.classList.add('off'); form.classList.add('off');
  $('#kp-busy-t', d).textContent = t('✦ Writing…', '✦ يكتب…') + (cut ? ' ' + t('(long notes: the first part is used)', '(ملاحظات طويلة: يُستعمل أولها)') : '');
  aiAbort = new AbortController();
  $('#kp-busy-x', d).onclick = () => aiAbort?.abort();
  const lang = J.langOf(text) === 'ar' ? 'Arabic' : 'English';
  const task = k === 'own' ? `Do what the user asks with these notes: "${own}". Use only the notes unless the request needs general knowledge; mark anything not from the notes with "(added)".` : ASK[k];
  const system = `You work on the user's own notes inside the Mustatar app. ${task}
Write in ${lang} (the language of the notes) unless the user asks otherwise. Plain text: short paragraphs, "- " bullets, **bold** for key words; no tables.
Return JSON only: {"title": "a short title", "text": "the note text (empty if items)", "items": ["only for a to-do list: one task each"]}`;
  try {
    const r = await J.callServer({ system, user: `THE NOTES:\n\n${text}`, maxTokens: k === 'expand' || k === 'own' || k === 'combine' ? 2600 : 1400, json: true, assistant: true, signal: aiAbort.signal });
    let o = J.parseJSON(r.text);
    if (!o || (typeof o !== 'object')) o = { title: '', text: String(r.text || '') };
    const items = Array.isArray(o.items) && o.items.length && (k === 'todo' || !o.text) ? o.items.map(x => ({ t: String(x).replace(/^[-☐☑\s]+/, '').trim(), done: false })).filter(x => x.t) : null;
    const body = items ? '' : String(o.text || '').trim();
    if (!items && !body) throw new Error(t('Nothing came back. Try again.', 'لم يرجع شيء. حاول مرة أخرى.'));
    const nn = await save({ id: newId(), title: String(o.title || '').slice(0, 120), text: body, items, color: k === 'todo' ? 'mint' : k === 'summary' ? 'fog' : '', labels: [...new Set(list.flatMap(x => x.labels || []))], ai: k, from_notes: list.map(x => x.id) });
    d.close(); clearSel();
    toast(t('✓ Saved as a new note; your notes are unchanged', '✓ حُفظت كملاحظة جديدة، وملاحظاتك كما هي'));
    edit(nn.id);
  } catch (e) {
    if (e.name === 'AbortError') { busy.hidden = true; acts.classList.remove('off'); form.classList.remove('off'); return; }
    $('#kp-busy-t', d).textContent = '✗ ' + J.errText(e);
    $('.spinner', busy)?.remove();
    acts.classList.remove('off'); form.classList.remove('off');
  } finally { aiAbort = null; }
}

/* ---------- for the rest of the app ---------- */
// import (Keep, Evernote, Notion…): many notes at once, never doubled
async function addMany(list) {
  await load();
  const fresh = [];
  for (const n of list) {
    const ex = notes.find(x => x.id === n.id);
    if (ex) continue;
    const note = { color: '', pinned: false, labels: [], items: null, ...n, updated: n.updated || n.created || Date.now() };
    notes.unshift(note); fresh.push(note);
  }
  if (fresh.length) { await DB.many(fresh); fresh.forEach(n => J.cloud.keep?.(n.id)); paintSoon(); }
  return fresh.length;
}
// words of your notes, for the assistant's search
async function search(q, max = 3) {
  await load();
  const ws = [...new Set(String(q).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2))];
  if (!ws.length) return [];
  return notes.filter(n => !n.trashed).map(n => { const tx = plain(n).toLowerCase(); let s = 0; for (const w of ws) if (tx.includes(w)) s++; return { n, s }; })
    .filter(x => x.s >= (ws.length <= 2 ? 1 : 2)).sort((a, b) => b.s - a.s).slice(0, max).map(x => ({ title: x.n.title, text: plain(x.n) }));
}
function newNote(opts = {}) { J.show('library'); setSeg('keep'); return edit(null, opts); }
// the back button: close the editor or stop picking
function back() { if (selected.size && !$('#screen-library')?.hidden) { clearSel(); return true; } return false; }
document.addEventListener('click', e => { if (e.target.closest?.('.tabbar [data-nav]') && selected.size) clearSel(); }, true);
window.addEventListener('mustatar-screen', () => selBar());

mount();
load().then(() => paint());
window.JundKeep = { load, all: async () => (await load()).slice(), raw: async id => { await load(); return id ? notes.find(x => x.id === id) || null : notes.slice(); }, fromCloud, imgFromCloud, img: id => DB.img(id), allImg: () => DB.allImg(), putImg: x => DB.putImg(x), shareLink, save, remove, addMany, edit, newNote, search, plain, back, open: () => { J.show('library'); setSeg('keep'); }, setSeg, aiSheet };
})();
