/* Mustatar — the side menu (like Claude's): new chat, your chats, projects (your subjects) and recent notes.
   Opens from the ☰ button at the top, or by swiping from the screen edge. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { esc } = J;
const AR = window.ZadLang === 'ar';
const L = (en, ar) => AR ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
const A = () => window.JundAssistant;
let el;

function build() {
  // the ☰ button, at the start of the top bar
  const brand = $('#go-home');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'icon-btn dr-open'; btn.id = 'dr-open'; btn.setAttribute('aria-label', L('Menu', 'القائمة'));
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h11M4 17h16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  brand.before(btn);
  btn.onclick = open;

  el = document.createElement('div');
  el.className = 'dr'; el.hidden = true; el.setAttribute('data-noi18n', '');
  // the order, from the best chat apps (Claude, ChatGPT, Gemini): the main action, then the places you go,
  // then your history (projects, chats, notes), then settings at the bottom
  const svg = d => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {
    notes: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    keep: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/>',
    rec: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    left: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    studio: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 16l3-8 3 8M9 13.5h4"/>',
    habit: '<path d="M5 12.5l4 4L19 7"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  };
  el.innerHTML = `<aside class="dr-panel" role="dialog" aria-modal="true" aria-label="${L('Menu', 'القائمة')}">
      <div class="dr-top"><span class="dr-logo" aria-hidden="true">${window.JundMark?.svg?.(30) || '<img src="icon-192.png" alt="" width="30" height="30">'}</span><b>${L('Mustatar', 'مستطر')}</b><button type="button" class="icon-btn dr-x" aria-label="${L('Close', 'إغلاق')}">✕</button></div>
      <button type="button" class="primary dr-new">${svg(IC.plus)} ${L('New chat', 'محادثة جديدة')}</button>
      <nav class="dr-nav dr-main">
        <button type="button" class="dr-item" data-go="keep"><span class="dr-ic">${svg(IC.keep)}</span><span class="dr-t">${L('My notes', 'ملاحظاتي')}</span></button>
        <button type="button" class="dr-item" data-nav-to="recordings"><span class="dr-ic">${svg(IC.rec)}</span><span class="dr-t">${L('Recordings & meetings', 'التسجيلات والاجتماعات')}</span><small id="dr-recs"></small></button>
        <button type="button" class="dr-item" data-nav-to="pending"><span class="dr-ic">${svg(IC.left)}</span><span class="dr-t">${L('Left to do', 'ما تبقّى')}</span><small id="dr-left"></small></button>
        <button type="button" class="dr-item" data-nav-to="habits"><span class="dr-ic">${svg(IC.habit)}</span><span class="dr-t">${L('Habit tracker & coach', 'العادات والمدرّب')}</span><small id="dr-hab"></small></button>
        <button type="button" class="dr-item" data-nav-to="inbox"><span class="dr-ic">${svg(IC.bell)}</span><span class="dr-t">${L('Reminders', 'التذكيرات')}</span></button>
        <button type="button" class="dr-item" data-nav-to="studio"><span class="dr-ic dr-ic-studio">${svg(IC.studio)}</span><span class="dr-t">${L('Studio', 'الاستوديو')}</span><small class="dr-hint">${L('posts & stories', 'منشورات وستوري')}</small></button>
      </nav>
      <div class="dr-scroll">
        <details class="dr-sec" open><summary class="dr-h">${L('Projects', 'المشاريع')}</summary><div class="dr-list" id="dr-projects"></div></details>
        <details class="dr-sec" open><summary class="dr-h">${L('Chats', 'المحادثات')}</summary>
          <label class="dr-search">${svg(IC.search)}<input type="search" id="dr-q" placeholder="${L('Search chats', 'ابحث في المحادثات')}" dir="auto"></label>
          <div class="dr-list" id="dr-chats"></div></details>
        <details class="dr-sec"><summary class="dr-h">${L('Recent notes', 'آخر الملاحظات')}</summary><div class="dr-list" id="dr-recent"></div></details>
      </div>
      <div class="dr-foot"><button type="button" class="dr-item" data-to="habit"><span class="dr-ic">${svg(IC.habit)}</span><span class="dr-t">${L('Add a habit', 'أضف عادة')}</span></button><button type="button" class="dr-item" data-to="settings"><span class="dr-ic">${svg(IC.gear)}</span><span class="dr-t">${L('Settings', 'الإعدادات')}</span></button></div>
    </aside>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  $('.dr-x', el).onclick = close;
  $('.dr-new', el).onclick = () => { A()?.newChat(); J.show('assistant'); close(); setTimeout(() => $('#as-text')?.focus(), 200); };
  $('[data-to="settings"]', el).onclick = () => { J.show('settings'); close(); };
  el.querySelectorAll('[data-nav-to]').forEach(b => b.onclick = () => { J.show(b.dataset.navTo); close(); });
  $('[data-to="habit"]', el).onclick = () => { close(); window.JundFeatures?.addHabit(); };
  $('[data-go="keep"]', el).onclick = () => { close(); window.JundKeep?.open(); };
  $('#dr-q', el).oninput = () => paintChats();
  // which sections are folded is remembered
  el.querySelectorAll('.dr-sec').forEach((d, i) => { const k = 'drFold' + i, v = J.store.get(k, null); if (v !== null) d.open = v; d.ontoggle = () => J.store.set(k, d.open); });
  // swipe in from the edge to open, swipe back to close
  let x0 = null;
  document.addEventListener('touchstart', e => { const x = e.touches[0].clientX, w = innerWidth; x0 = (AR ? x > w - 24 : x < 24) ? x : null; }, { passive: true });
  document.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (AR ? dx < -60 : dx > 60) open(); x0 = null; }, { passive: true });
  let x1 = null;
  el.addEventListener('touchstart', e => { x1 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => { if (x1 === null) return; const dx = e.changedTouches[0].clientX - x1; if (AR ? dx > 70 : dx < -70) close(); x1 = null; }, { passive: true });
}

async function fill() {
  { const hs = window.JundHabits?.all() || [], d = new Date(), t = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, e = $('#dr-hab', el); if (e) e.textContent = hs.length ? `${hs.filter(h => h.days?.[t]).length}/${hs.length}` : ''; }
  window.JundPending?.count().then(n => { const e = $('#dr-left', el); if (e) e.textContent = n || ''; }).catch(() => {});
  window.JundRecs?.summary().then(s => { const e = $('#dr-recs', el); if (e) e.textContent = s.left.length ? s.left.length + ' left' : ''; }).catch(() => {});
  // projects: one per subject, with how many notes it has
  const ls = await J.allLessons();
  const by = new Map();
  ls.forEach(l => { const n = l.subject?.name || L('Other', 'أخرى'); const p = by.get(n) || { n, c: 0, last: '' }; p.c++; if (l.date > p.last) p.last = l.date; by.set(n, p); });
  const ps = [...by.values()].sort((a, b) => b.last.localeCompare(a.last));
  $('#dr-projects', el).innerHTML = ps.length
    ? ps.slice(0, 6).map(p => `<button type="button" class="dr-item" data-p="${esc(p.n)}"><span class="dr-ic">▣</span><span class="dr-t" dir="auto">${esc(p.n)}</span><small>${p.c}</small></button>`).join('')
    : `<div class="dr-empty">${L('Your subjects appear here when you make notes.', 'تظهر موادك هنا عندما تصنع ملاحظات.')}</div>`;
  if (ps.length > 6) $('#dr-projects', el).insertAdjacentHTML('beforeend', `<button type="button" class="dr-item dr-all" data-all="lib"><span class="dr-ic"></span><span class="dr-t">${L(`All ${ps.length} projects`, `كل المشاريع (${ps.length})`)}</span></button>`);
  const all = $('[data-all]', el); if (all) all.onclick = () => { J.show('library'); close(); };
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    J.show('library'); const s = $('#lib-search'); if (s) { s.value = b.dataset.p; s.dispatchEvent(new Event('input')); }
    close();
  });
  const rec = ls.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  $('#dr-recent', el).innerHTML = rec.length
    ? rec.map(l => `<button type="button" class="dr-item" data-l="${esc(l.id)}"><span class="dr-ic">≡</span><span class="dr-t" dir="auto">${esc(l.notes?.title || l.unit)}</span></button>`).join('')
    : `<div class="dr-empty">${L('No notes yet.', 'لا ملاحظات بعد.')}</div>`;
  el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { const l = ls.find(x => x.id === b.dataset.l); if (l) J.openLesson(l); close(); });
  paintChats();
}
function paintChats() {
  const q = ($('#dr-q', el)?.value || '').trim().toLowerCase();
  const cs = (A()?.chats() || []).filter(c => !q || [c.title, c.summary, ...(c.log || []).map(m => m.text)].join(' ').toLowerCase().includes(q)), cur = A()?.currentChat();
  const day = t => new Date(t).toLocaleDateString(AR ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short' });
  $('#dr-chats', el).innerHTML = cs.length
    ? cs.map(c => { const tip = c.summary || [...(c.log || [])].reverse().find(m => m.who !== 'me' && m.text && !m.working)?.text || '';
        return `<div class="dr-row${c.id === cur ? ' on' : ''}"><button type="button" class="dr-item dr-chat" data-c="${esc(c.id)}"><span class="dr-t" dir="auto"><b>${esc(c.title)}</b>${tip ? `<small dir="auto">${esc(String(tip).replace(/\s+/g, ' ').slice(0, 90))}</small>` : ''}</span><small class="dr-day">${day(c.t)}</small></button><button type="button" class="dr-del" data-d="${esc(c.id)}" aria-label="${L('Delete', 'حذف')}">✕</button></div>`; }).join('')
    : `<div class="dr-empty">${q ? L('No chat has that.', 'لا محادثة فيها ذلك.') : L('Your chats will be kept here.', 'ستُحفظ محادثاتك هنا.')}</div>`;
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { A()?.openChat(b.dataset.c); J.show('assistant'); close(); });
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (confirm(L('Delete this chat?', 'حذف هذه المحادثة؟'))) { A()?.deleteChat(b.dataset.d); paintChats(); } });
}
function open() { if (!el) return; fill(); el.hidden = false; requestAnimationFrame(() => el.classList.add('in')); document.body.classList.add('vx-open'); }
function close() { if (!el) return; el.classList.remove('in'); document.body.classList.remove('vx-open'); setTimeout(() => { el.hidden = true; }, 200); }

build();
window.JundDrawer = { open, close };
})();
