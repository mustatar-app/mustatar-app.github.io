/* Bring your work to Mustatar, and take all of it with you.
   Reads, on the phone, at no cost and with no Google permissions:
   - Google Keep (Google Takeout .zip, or its .json / .html files)
   - Evernote (.enex)
   - Notion (Markdown & CSV export .zip, also a zip inside a zip)
   - Obsidian, Bear, plain notes (.md, .txt), web pages (.html), Word (.docx)
   - a Mustatar backup (.json made by "Download all my work")
   Files from Google Drive come in through the phone's own file chooser (Drive shows there), so no Drive access is needed.
   Every note becomes an ordinary note in Notes, under its label / tag / folder, or under the app it came from. */
(() => {
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = () => window.ZadLang === 'ar';
const t = (en, ar) => AR() ? ar : en;

/* ---------- a small zip reader (the browser's own deflate; zip64 too) ---------- */
async function unzip(blob) {
  const u8 = async (a, b) => new Uint8Array(await blob.slice(a, b).arrayBuffer());
  const tailLen = Math.min(blob.size, 66000), tail = await u8(blob.size - tailLen, blob.size);
  const dv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  let count = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff || count === 0xffff) {           // zip64: big Google Takeout files
    const loc = eocd - 20;
    if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
      const off64 = Number(dv.getBigUint64(loc + 8, true));
      const r = new DataView((await u8(off64, off64 + 56)).buffer);
      count = Number(r.getBigUint64(32, true)); cdSize = Number(r.getBigUint64(40, true)); cdOff = Number(r.getBigUint64(48, true));
    }
  }
  const cd = await u8(cdOff, cdOff + cdSize), c = new DataView(cd.buffer), dec = new TextDecoder();
  const out = [];
  for (let p = 0, n = 0; n < count && p + 46 <= cd.length; n++) {
    if (c.getUint32(p, true) !== 0x02014b50) break;
    const method = c.getUint16(p + 10, true);
    let csize = c.getUint32(p + 20, true), size = c.getUint32(p + 24, true);
    const nl = c.getUint16(p + 28, true), xl = c.getUint16(p + 30, true), cl = c.getUint16(p + 32, true);
    let lho = c.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nl));
    // zip64 sizes and offset live in the extra field
    for (let e = p + 46 + nl, end = e + xl; e + 4 <= end;) {
      const id = c.getUint16(e, true), len = c.getUint16(e + 2, true);
      if (id === 1) { let q = e + 4; if (size === 0xffffffff) { size = Number(c.getBigUint64(q, true)); q += 8; } if (csize === 0xffffffff) { csize = Number(c.getBigUint64(q, true)); q += 8; } if (lho === 0xffffffff) lho = Number(c.getBigUint64(q, true)); }
      e += 4 + len;
    }
    p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    out.push({ name, size, read: async () => {
      const h = new DataView((await u8(lho, lho + 30)).buffer);
      const start = lho + 30 + h.getUint16(26, true) + h.getUint16(28, true);
      const raw = blob.slice(start, start + csize);
      if (method === 0) return raw;
      if (method !== 8) throw new Error('zip method ' + method);
      return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    } });
  }
  return out;
}

/* ---------- text helpers ---------- */
const htmlText = html => {
  const d = new DOMParser().parseFromString(String(html || ''), 'text/html');
  d.querySelectorAll('script,style,head').forEach(x => x.remove());
  d.querySelectorAll('br').forEach(x => x.replaceWith('\n'));
  // <en-todo/> is not self-closing to an HTML reader, so it holds the rest of the line: keep that text after the box
  d.querySelectorAll('en-todo').forEach(x => x.replaceWith(x.getAttribute('checked') === 'true' ? '☑ ' : '☐ ', ...x.childNodes));
  d.querySelectorAll('li').forEach(x => x.prepend('- '));
  d.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre').forEach(x => x.append('\n'));
  d.querySelectorAll('h1,h2,h3').forEach(x => x.prepend('# '));
  return (d.body?.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};
async function docxText(file) {
  const parts = await unzip(file);
  const doc = parts.find(p => p.name === 'word/document.xml');
  if (!doc) throw new Error('no document');
  const xml = new DOMParser().parseFromString(await (await doc.read()).text(), 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const lines = [];
  for (const p of xml.getElementsByTagNameNS(W, 'p')) {
    let s = '';
    for (const n of p.getElementsByTagNameNS(W, '*')) {
      if (n.localName === 't') s += n.textContent;
      else if (n.localName === 'tab') s += '\t';
      else if (n.localName === 'br') s += '\n';
    }
    const style = p.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') || '';
    const list = p.getElementsByTagNameNS(W, 'numPr').length > 0;
    if (s.trim()) lines.push((/^(Heading|Title|العنوان)/i.test(style) ? '# ' : list ? '- ' : '') + s);
    else lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// plain text / markdown → the app's note shape (sections with text and list blocks)
function toNotes(title, text, subtitle) {
  const sections = [];
  let sec = { heading: '', blocks: [] }, list = null, para = [];
  const flushPara = () => { if (para.length) { sec.blocks.push({ t: 'text', text: para.join('\n') }); para = []; } };
  const flushList = () => { if (list) { sec.blocks.push({ t: 'list', ordered: list.ordered, items: list.items }); list = null; } };
  for (let line of String(text || '').replace(/\r/g, '').split('\n')) {
    const h = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    const li = line.match(/^\s*(?:[-*•+]|(\d+)[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/);
    const box = line.match(/^\s*([☐☑])\s*(.*)$/);
    if (h) { flushPara(); flushList(); if (sec.heading || sec.blocks.length) sections.push(sec); sec = { heading: h[1].replace(/[*_`]/g, '').trim(), blocks: [] }; continue; }
    if (li || box) {
      flushPara();
      const ordered = !!li?.[1], item = box ? `${box[1]} ${box[2]}` : (li[2] !== undefined ? (li[2].trim() ? '☑ ' : '☐ ') : '') + li[3];
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(item.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()); continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^>\s?/, '').replace(/__(.+?)__/g, '**$1**').trim());
  }
  flushPara(); flushList();
  if (sec.heading || sec.blocks.length) sections.push(sec);
  // one long text block reads badly on a page: split by paragraph size
  for (const s of sections) s.blocks = s.blocks.flatMap(b => b.t === 'text' && b.text.length > 1200 ? J.splitText(b.text, 180).map(x => ({ t: 'text', text: x })) : [b]);
  return { title, subtitle, sections, mindmap: [], report: {} };
}
const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h.toString(36); };

/* ---------- each source → { title, text, date, group, from } ---------- */
const keepJSON = j => {
  if (!j || typeof j !== 'object' || j.isTrashed || !('textContent' in j || 'listContent' in j)) return null;
  const items = (j.listContent || []).map(x => (x.isChecked ? '☑ ' : '☐ ') + (x.text || ''));
  const text = [j.textContent || '', items.join('\n')].filter(Boolean).join('\n\n');
  return { title: j.title || '', text, date: j.createdTimestampUsec ? new Date(j.createdTimestampUsec / 1000) : j.userEditedTimestampUsec ? new Date(j.userEditedTimestampUsec / 1000) : null,
    group: j.labels?.[0]?.name || '', from: 'Google Keep', archived: !!j.isArchived };
};
function enex(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const enDate = s => { const m = String(s || '').match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)/); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null; };
  return [...xml.getElementsByTagName('note')].map(n => ({
    title: n.getElementsByTagName('title')[0]?.textContent || '',
    text: htmlText(n.getElementsByTagName('content')[0]?.textContent || ''),
    date: enDate(n.getElementsByTagName('created')[0]?.textContent),
    group: n.getElementsByTagName('tag')[0]?.textContent || '', from: 'Evernote',
  }));
}
const titleFromName = name => String(name).split('/').pop().replace(/\.[^.]+$/, '').replace(/\s+[0-9a-f]{32}$/i, '').trim();   // Notion adds a long id
// the folder a file sits in, as its group (Notion pages, Obsidian folders), skipping the export's own top folder
const folderOf = name => { const p = String(name).split('/').slice(0, -1).filter(x => !/^(Takeout|Keep|Export-[0-9a-f-]+|Part-\d+)$/i.test(x)); return p.length ? titleFromName(p[p.length - 1] + '.x') : ''; };

async function readEntry(name, getBlob, from, out, depth = 0) {
  const low = name.toLowerCase();
  try {
    if (low.endsWith('.zip')) {
      if (depth > 1) return;
      const blob = await getBlob(), entries = await unzip(blob);
      const isKeep = entries.some(e => /(^|\/)Keep\/[^/]+\.json$/i.test(e.name));
      const isNotion = !isKeep && entries.some(e => /\s[0-9a-f]{32}\.(md|csv)$/i.test(e.name) || /\.zip$/i.test(e.name));
      const kind = isKeep ? 'Google Keep' : isNotion ? 'Notion' : from;
      for (const e of entries) {
        if (isKeep && !/\.json$/i.test(e.name)) continue;            // Keep gives each note as .json and .html (and a label list): the .json is enough
        await readEntry(e.name, e.read, kind, out, depth + 1);
      }
      return;
    }
    if (low.endsWith('.json')) {
      const j = JSON.parse(await (await getBlob()).text());
      if (isBackup(j)) { out.backup = j; return; }
      const k = keepJSON(j); if (k && (k.text || k.title)) out.push(k); return;
    }
    if (low.endsWith('.enex')) { out.push(...enex(await (await getBlob()).text())); return; }
    if (low.endsWith('.docx')) { out.push({ title: titleFromName(name), text: await docxText(await getBlob()), group: folderOf(name), from: from || 'Word' }); return; }
    if (/\.(md|markdown|txt)$/.test(low)) {
      let text = await (await getBlob()).text();
      let title = titleFromName(name);
      const fm = text.match(/^---\n[\s\S]*?\n---\n/); if (fm) text = text.slice(fm[0].length);   // Obsidian front matter
      const h1 = text.match(/^\s*#\s+(.+)\n/); if (h1 && h1[1].trim() === title) text = text.slice(h1[0].length);
      out.push({ title, text, group: folderOf(name), from: from || (low.endsWith('.txt') ? 'Text' : 'Markdown') }); return;
    }
    if (/\.html?$/.test(low)) {
      const html = await (await getBlob()).text();
      const tt = html.match(/<title>([^<]*)<\/title>/i)?.[1];
      out.push({ title: (tt && tt.trim()) || titleFromName(name), text: htmlText(html), group: folderOf(name), from: from || 'Web page' }); return;
    }
    if (from) out.skipped = (out.skipped || 0) + (/\.(png|jpe?g|gif|webp|heic|pdf|mp3|m4a|mp4|csv)$/i.test(low) ? 0 : 1);
  } catch (e) { out.failed = (out.failed || 0) + 1; out.why = String(e.message || e); }
}

/* ---------- save ---------- */
async function bring(files, onStatus = () => {}) {
  const found = []; found.skipped = 0; found.failed = 0;
  let i = 0;
  for (const f of files) { onStatus(t(`Reading ${f.name}…`, `قراءة ${f.name}…`), ++i / files.length); await readEntry(f.name, async () => f, '', found); }
  let saved = 0, empty = 0;
  if (found.backup) saved += await restore(found.backup);
  const mine = store.get('mySubjects', []);
  const by = {};
  for (const n of found) {
    const text = String(n.text || '').trim(), title = String(n.title || '').trim() || text.split('\n')[0].slice(0, 60);
    if (!text) { empty++; continue; }
    const group = String(n.group || n.from || t('Imported', 'مستورد')).trim().slice(0, 40);
    if (!mine.includes(group)) mine.push(group);
    const lang = J.langOf(text || title);
    const date = n.date && !isNaN(n.date) ? n.date : new Date();
    const lesson = {
      id: 'I' + hash(n.from + '|' + title + '|' + text.slice(0, 2000)),
      subject: { id: 'other:' + group, name: group, place: '', book: '', family: (store.get('families', {})['mine:' + group]) || window.familyForName?.(group) },   // the same shape as notes made in your own subject
      unit: title, kind: 'other', lang, engine: 'import', imported: n.from, date: date.toISOString(), transcript: text,
      notes: toNotes(title, text, (lang === 'en' ? 'From ' : 'من ') + n.from),
      chat: [{ who: 'ai', text: lang === 'en' ? `Brought in from ${n.from}. Ask me to tidy it, turn it into full study notes, or make a quiz from it.` : `نُقلت من ${n.from}. اطلب مني ترتيبها أو تحويلها إلى ملف دراسي كامل أو اختبار.` }],
    };
    await J.saveLesson(lesson);
    saved++; by[n.from] = (by[n.from] || 0) + 1;
    if (saved % 20 === 0) onStatus(t(`Saved ${saved} notes…`, `حُفظت ${J.ar(saved)} ملاحظة…`), 1);
  }
  store.set('mySubjects', mine);
  return { saved, by, empty, skipped: found.skipped, failed: found.failed, why: found.why, restored: !!found.backup };
}

/* ---------- take everything with you: one file with all notes and the app's own lists ---------- */
// everything the app keeps on the phone, except sign-in, keys and counters
const SKIP_KEY = /token|key|secret|mstUser|planUse|owner|signin|notified|opened|welcomed|uiLang|cache|lastSeen|^hadVersion/i;
// the backup file (the same shape the app always used, plus every list the app keeps)
async function backupData() {
  const lessons = await J.allLessons();
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith('jn_')) continue;
    const name = k.slice(3);
    if (!SKIP_KEY.test(name)) data[name] = localStorage.getItem(k);
  }
  return { app: 'jund-notes', version: 3, saved: new Date().toISOString(), families: store.get('families', {}), lessons,
    events: store.get('events', []), studio: store.get('studioSaved', []), data };
}
async function backup() {
  const file = await backupData();
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const day = new Date().toISOString().slice(0, 10);
  return J.download(blob, `Mustatar backup ${day}.json`).then(r => ({ ...r, count: file.lessons.length }));
}
const isBackup = j => j && (j.app === 'jund-notes' || j.app === 'Mustatar') && Array.isArray(j.lessons);
async function restore(j) {
  if (!isBackup(j)) throw new Error(t('This is not a backup file from the app.', 'هذا ليس ملف نسخة احتياطية من التطبيق.'));
  let n = 0;
  for (const l of j.lessons || []) { if (l && l.id && l.notes) { await J.saveLesson(l); n++; } }
  if (j.families) store.set('families', { ...j.families, ...store.get('families', {}) });
  if (Array.isArray(j.events)) window.JundCal?.merge?.(j.events);
  if (Array.isArray(j.studio)) { const have = store.get('studioSaved', []); store.set('studioSaved', [...have, ...j.studio.filter(x => !have.some(h => h.id === x.id))]); }
  for (const [k, v] of Object.entries(j.data || {})) {
    if (SKIP_KEY.test(k)) continue;
    if (k === 'mySubjects') { try { const cur = store.get('mySubjects', []); store.set('mySubjects', [...new Set([...cur, ...JSON.parse(v)])]); } catch {} continue; }
    if (localStorage.getItem('jn_' + k) == null) localStorage.setItem('jn_' + k, v);   // never overwrite what is already on this phone
  }
  return n;
}

/* ---------- the screen: a sheet with the sources, each with its own short steps ---------- */
const SOURCES = [
  { id: 'keep', name: 'Google Keep', link: 'https://takeout.google.com/settings/takeout/custom/keep',
    en: ['Open the link and sign in.', 'Only "Keep" is ticked: tap Next step, then Create export.', 'When Google emails you, download the .zip.', 'Come back here, tap Choose files, and pick that .zip.'],
    ar: ['افتح الرابط وسجّل الدخول.', 'تأكد أن «Keep» وحده محدد: اضغط الخطوة التالية ثم إنشاء تصدير.', 'عندما يصلك بريد من Google، نزّل ملف ‎.zip.', 'ارجع هنا، واضغط «اختر الملفات»، واختر ملف ‎.zip.'] },
  { id: 'drive', name: 'Google Docs / Drive',
    en: ['Tap Choose files: the phone shows Google Drive in the list.', 'Pick your documents (Word, text, PDF go to New notes).', 'A Google Doc can also be saved first: File → Download → Microsoft Word (.docx).'],
    ar: ['اضغط «اختر الملفات»: يظهر Google Drive في القائمة على الهاتف.', 'اختر مستنداتك (وورد ونصوص؛ وملفات PDF تُضاف من «ملاحظات جديدة»).', 'ويمكن حفظ مستند Google أولًا: ملف ← تنزيل ← Microsoft Word ‏(.docx).'] },
  { id: 'evernote', name: 'Evernote', link: 'https://help.evernote.com/hc/en-us/articles/209005557',
    en: ['On a computer, open Evernote.', 'Right-click a notebook → Export notebook → .enex.', 'Send the .enex to your phone (or Drive), then choose it here.'],
    ar: ['افتح Evernote على الحاسب.', 'اضغط بالزر الأيمن على الدفتر ← تصدير الدفتر ← ‎.enex.', 'أرسل ملف ‎.enex إلى هاتفك (أو Drive)، ثم اختره هنا.'] },
  { id: 'notion', name: 'Notion', link: 'https://www.notion.so/help/export-your-content',
    en: ['In Notion: Settings → General → Export all workspace content.', 'Choose "Markdown & CSV", then Export.', 'Download the .zip and choose it here.'],
    ar: ['في Notion: الإعدادات ← عام ← تصدير كل محتوى مساحة العمل.', 'اختر «Markdown & CSV» ثم تصدير.', 'نزّل ملف ‎.zip واختره هنا.'] },
  { id: 'other', name: t('Obsidian, Bear, other notes', 'Obsidian وBear وغيرها'),
    en: ['Export or share your notes as .md or .txt files.', 'Choose them here (many at once is fine).'],
    ar: ['صدّر ملاحظاتك أو شاركها كملفات ‎.md أو ‎.txt.', 'اخترها هنا (يمكن اختيار عدة ملفات معًا).'] },
  { id: 'backup', name: t('A Mustatar backup', 'نسخة احتياطية من مستطر'),
    en: ['Choose the "Mustatar backup" file you downloaded before. Nothing on this phone is replaced.'],
    ar: ['اختر ملف «Mustatar backup» الذي نزّلته من قبل. لا يُستبدل شيء على هذا الهاتف.'] },
];
const ACCEPT = '.zip,.json,.enex,.md,.markdown,.txt,.html,.htm,.docx,application/zip,application/json,text/plain,text/markdown,text/html';

function open() {
  let d = document.getElementById('bring-dialog');
  if (!d) { d = document.createElement('dialog'); d.id = 'bring-dialog'; d.className = 'bring'; document.body.appendChild(d); }
  const ar = AR();
  d.dir = ar ? 'rtl' : 'ltr';
  d.innerHTML = `<div class="bring-h"><b>${t('Bring your work to Mustatar', 'انقل أعمالك إلى مستطر')}</b><button type="button" class="icon-btn" id="bring-x" aria-label="${t('Close', 'إغلاق')}">✕</button></div>
    <p class="muted">${t('Your notes come in as ordinary notes, each under its label, tag or folder. Free, on your phone, and nothing is sent anywhere.', 'تدخل ملاحظاتك كملاحظات عادية، كل واحدة تحت تصنيفها أو وسمها أو مجلدها. مجانًا، على هاتفك، ولا يُرسل شيء إلى أي مكان.')}</p>
    <div class="bring-list">${SOURCES.map(s => `<details class="bring-src" data-src="${s.id}"><summary>${esc(s.name)}</summary><ol>${(ar ? s.ar : s.en).map(x => `<li>${esc(x)}</li>`).join('')}</ol>${s.link ? `<a class="link small" href="${s.link}" target="_blank" rel="noopener">${t('Open the link', 'افتح الرابط')} ↗</a>` : ''}</details>`).join('')}</div>
    <input type="file" id="bring-file" multiple accept="${ACCEPT}" hidden>
    <div class="bring-act"><button type="button" class="primary" id="bring-pick">${t('Choose files', 'اختر الملفات')}</button>
    <button type="button" class="ghost" id="bring-backup">${t('Download all my work', 'نزّل كل أعمالي')}</button></div>
    <div class="bring-st muted" id="bring-st" aria-live="polite"></div>`;
  d.querySelector('#bring-x').onclick = () => d.close();
  d.querySelector('#bring-pick').onclick = () => d.querySelector('#bring-file').click();
  d.querySelector('#bring-backup').onclick = async () => {
    const st = d.querySelector('#bring-st');
    st.textContent = t('Preparing the file…', 'تجهيز الملف…');
    try { const r = await backup(); st.textContent = r.ok ? t(`✓ ${r.count} notes and your lists are in the file. Keep it somewhere safe (Drive, email).`, `✓ ${J.ar(r.count)} ملاحظة وقوائمك في الملف. احفظه في مكان آمن (Drive أو البريد).`) : t('Not saved.', 'لم يُحفظ.'); }
    catch (e) { st.textContent = '✗ ' + J.errText(e); }
  };
  d.querySelector('#bring-file').onchange = async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    const st = d.querySelector('#bring-st'), pick = d.querySelector('#bring-pick');
    pick.disabled = true;
    try {
      const r = await bring(files, s => { st.textContent = s; });
      const parts = Object.entries(r.by).map(([k, v]) => `${k} ${J.ar(v)}`).join(' · ');
      const extra = [r.empty ? t(`${r.empty} empty skipped`, `${J.ar(r.empty)} فارغة تُركت`) : '', r.failed ? t(`${r.failed} could not be read`, `${J.ar(r.failed)} تعذّرت قراءتها`) : ''].filter(Boolean).join(' · ');
      st.innerHTML = r.saved
        ? `<b>${esc(t(`✓ Brought in ${r.saved} note${r.saved === 1 ? '' : 's'}`, `✓ نُقلت ${J.ar(r.saved)} ملاحظة`))}</b>${parts ? ` (${esc(parts)})` : ''}${extra ? `<br>${esc(extra)}` : ''}<br><button type="button" class="link" id="bring-see">${t('See them in Notes', 'اعرضها في الملاحظات')}</button>`
        : esc(t('Nothing to bring in from these files. Check the steps above for your app.', 'لا شيء للنقل من هذه الملفات. راجع الخطوات أعلاه لتطبيقك.') + (r.why ? ' (' + r.why + ')' : ''));
      const see = d.querySelector('#bring-see'); if (see) see.onclick = () => { d.close(); J.show('library'); };
      if (r.saved) window.JundCal?.toast(t(`✓ ${r.saved} note${r.saved === 1 ? '' : 's'} brought in`, `✓ نُقلت ${J.ar(r.saved)} ملاحظة`));
    } catch (err) { st.textContent = '✗ ' + J.errText(err); }
    finally { pick.disabled = false; }
  };
  d.showModal();
}

window.JundImport = { open, bring, backup, backupData, restore, unzip, docxText, toNotes, htmlText };
})();
