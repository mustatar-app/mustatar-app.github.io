/* Mustatar — backgrounds: original drawn patterns (leaves, waves, night stars, Islamic star lattice, dunes, mountains,
   ruled paper, dots) for a note in My notes or a lesson card, and a gentle backdrop for the whole app
   (Me → Appearance). Each is a small drawing made here, so nothing is downloaded and it works offline. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store } = J;
const AR = () => window.ZadLang === 'ar';
const enc = s => "url('data:image/svg+xml," + encodeURIComponent(s).replace(/'/g, '%27') + "')";
// a tile: repeated; a scene: one drawing at the bottom of the card or the screen
const P = {
  leaves: { en: 'Leaves', ar: 'أوراق', tint: '#2f7d4f', kind: 'tile', size: 120, svg: c => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><g fill="${c}" fill-opacity="0.14"><path d="M20 40c10-22 34-26 40-24-2 8-8 34-34 38-4 0-6-6-6-14z"/><path d="M80 96c4-18 24-26 32-24-2 8-10 28-28 30-3 0-4-3-4-6z"/><path d="M78 24c14 2 22 16 20 24-8 0-22-4-24-16 0-4 2-8 4-8z"/></g><g stroke="${c}" stroke-opacity="0.2" fill="none" stroke-width="1.4"><path d="M24 50c8-10 18-20 32-30M84 100c6-8 14-16 26-24M80 28c6 6 12 12 16 18"/></g></svg>` },
  waves: { en: 'Waves', ar: 'أمواج', tint: '#2a6db0', kind: 'tile', size: 140, svg: c => `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="70" viewBox="0 0 140 70"><g fill="none" stroke="${c}" stroke-opacity="0.18" stroke-width="2"><path d="M0 20c17 0 17-12 35-12s18 12 35 12 18-12 35-12 18 12 35 12"/><path d="M0 50c17 0 17-12 35-12s18 12 35 12 18-12 35-12 18 12 35 12" stroke-opacity="0.12"/></g></svg>` },
  stars: { en: 'Night', ar: 'ليل', tint: '#3a3f8f', kind: 'tile', size: 160, svg: c => `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><g fill="${c}" fill-opacity="0.23"><circle cx="20" cy="30" r="1.6"/><circle cx="90" cy="18" r="1.2"/><circle cx="140" cy="60" r="1.8"/><circle cx="60" cy="90" r="1.3"/><circle cx="120" cy="130" r="1.5"/><circle cx="30" cy="140" r="1.1"/><path d="M110 92l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M38 60l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z"/></g><path d="M78 40a14 14 0 1 0 12 22 11 11 0 1 1-12-22z" fill="${c}" fill-opacity="0.2"/></svg>` },
  geo: { en: 'Pattern', ar: 'زخرفة', tint: '#8a6a2b', kind: 'tile', size: 80, svg: c => `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><g fill="none" stroke="${c}" stroke-opacity="0.17" stroke-width="1.3"><path d="M40 14l7.6 18.4L66 40l-18.4 7.6L40 66l-7.6-18.4L14 40l18.4-7.6z"/><rect x="24" y="24" width="32" height="32" transform="rotate(45 40 40)"/><rect x="24" y="24" width="32" height="32"/><path d="M0 0l14 14M80 0L66 14M0 80l14-14M80 80L66 66"/></g></svg>` },
  dots: { en: 'Dots', ar: 'نقاط', tint: '#6b6f7a', kind: 'tile', size: 22, svg: c => `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="1.4" fill="${c}" fill-opacity="0.23"/></svg>` },
  ruled: { en: 'Notebook', ar: 'دفتر', tint: '#4a78c2', kind: 'tile', size: 28, svg: c => `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M0 27.5h28" stroke="${c}" stroke-opacity="0.18" stroke-width="1"/></svg>` },
  dunes: { en: 'Desert', ar: 'صحراء', tint: '#b9803a', kind: 'scene', svg: c => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120" viewBox="0 0 400 120" preserveAspectRatio="none"><path d="M0 70c60-30 120-30 190 0s140 20 210-10v60H0z" fill="${c}" fill-opacity="0.14"/><path d="M0 95c80-25 150-20 230 5s120 10 170-5v25H0z" fill="${c}" fill-opacity="0.21"/><circle cx="330" cy="30" r="14" fill="${c}" fill-opacity="0.16"/></svg>` },
  hills: { en: 'Mountains', ar: 'جبال', tint: '#3f7a6a', kind: 'scene', svg: c => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120" viewBox="0 0 400 120" preserveAspectRatio="none"><path d="M0 120V80l70-50 60 40 70-60 90 70 50-30 60 40v30z" fill="${c}" fill-opacity="0.13"/><path d="M0 120v-20l90-30 80 25 90-35 140 40v20z" fill="${c}" fill-opacity="0.21"/></svg>` },
};
const NAMES = Object.keys(P);
const tile = (id, color) => { const p = P[id]; return p ? enc(p.svg(color || p.tint)) : ''; };
// CSS for an element: the background drawing, in its own colour
function style(id, color) {
  const p = P[id]; if (!p) return '';
  return p.kind === 'tile' ? `background-image:${tile(id, color)};background-size:${p.size}px;background-repeat:repeat;`
    : `background-image:${tile(id, color)};background-size:100% 46%;background-position:bottom;background-repeat:no-repeat;`;
}
// a small round preview button for a picker
const swatch = (id, on) => `<button type="button" class="bg-sw${on ? ' on' : ''}" data-bg="${id}" style="${id ? style(id) : ''}" title="${id ? (AR() ? P[id].ar : P[id].en) : (AR() ? 'بلا خلفية' : 'None')}" aria-label="${id ? (AR() ? P[id].ar : P[id].en) : (AR() ? 'بلا خلفية' : 'None')}">${id ? '' : '⊘'}</button>`;

/* the whole app: a gentle drawing behind everything (cards stay solid, so text stays easy to read) */
function applyApp() {
  const id = store.get('appBg', '');
  document.documentElement.dataset.appBg = id || '';
  let el = document.getElementById('app-bg-layer');
  if (!id) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'app-bg-layer'; el.setAttribute('aria-hidden', 'true'); document.body.prepend(el); }
  el.setAttribute('style', style(id) + (P[id].kind === 'scene' ? 'background-size:100% 28%;' : ''));
}
function paintSetting() {
  const box = document.getElementById('app-bg'); if (!box) return;
  const cur = store.get('appBg', '');
  box.innerHTML = ['', ...NAMES].map(id => swatch(id, id === cur)).join('');
  box.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => { store.set('appBg', b.dataset.bg); applyApp(); paintSetting(); });
}
applyApp(); paintSetting();
window.JundBg = { names: NAMES, style, swatch, info: id => P[id], applyApp, paintSetting };
})();
