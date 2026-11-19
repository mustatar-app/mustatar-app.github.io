/* Proof for every line, and how much of the recording was heard.
   - Under the title of a note made from a recording: "Heard all 60 min · speech in 58".
   - "Where is this from?": tap any line of the notes to see the part of the recording (the minute) or of the
     source text it came from, with ▶ to listen from there while the sound is still on the phone.
     A line that cannot be found in the source is said plainly: it may be an explanation added while writing.
   All of this runs on the phone, with no AI and no cost. */
(() => {
const J = window.JN; if (!J) return;
const { esc } = J;
const AR = () => window.ZadLang === 'ar';
const t = (en, ar) => AR() ? ar : en;
const num = n => J.ar(n);
const clock = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return num(h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`); };

/* ---------- matching a line to the source (word overlap, rare words count more) ---------- */
const STOP = new Set(('the and for that this with from are was were has have had not but you your they their them what when which who will would can could about into than then there these those also very more most some such only other its our out all any how why one two may might must should been being does did done each '
  + 'في من على إلى الى عن مع هذا هذه ذلك تلك التي الذي الذين هو هي هم انه أنه ان أن إن كان كانت يكون لكن ثم او أو بل قد لقد كل بعض غير بين عند حتى اذا إذا لما لم لن ما ماذا كيف هل نعم وهو وهي فهو فهي')
  .split(' ').map(w => w.replace(/[أإآ]/g, 'ا')));
const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/\p{M}|ـ/gu, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// light stemming so "والصلاة" meets "الصلاة" and "صلاة", and "prayers" meets "prayer"
const stem = w => {
  if (/[؀-ۿ]/.test(w)) { if (w.length > 5) w = w.replace(/^(وال|بال|فال|كال|لل)/, ''); if (w.length > 4) w = w.replace(/^(ال|و|ف|ب)/, ''); if (w.length > 4) w = w.replace(/(ها|هم|هن|كم|نا|ات|ون|ين|ه)$/, ''); return w; }
  return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w;
};
const words = s => norm(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w)).map(stem);

// the source cut into overlapping windows, each with its place in time when there is one
const cache = new WeakMap();   // kept off the lesson, so it is never saved
function windowsOf(l) {
  if (cache.has(l)) return cache.get(l);
  const out = [];
  const add = (text, s, e) => {
    const raw = String(text || '').split(/\s+/).filter(Boolean);
    const W = 45, step = 22;
    for (let i = 0; i < Math.max(1, raw.length - step); i += step) {
      const part = raw.slice(i, i + W);
      if (!part.length) break;
      const at = s == null ? null : s + (e - s) * (i / Math.max(1, raw.length));
      out.push({ text: part.join(' '), at, s, e, set: new Set(words(part.join(' '))) });
    }
  };
  if (l.timeline?.length) for (const p of l.timeline) { if (p.t) add(p.t, p.s, p.e); }
  else add(l.transcript, null, null);
  const df = new Map();
  for (const w of out) for (const x of w.set) df.set(x, (df.get(x) || 0) + 1);
  const w = { list: out, idf: x => Math.log(1 + out.length / (df.get(x) || 0.5)) };
  cache.set(l, w);
  return w;
}
function find(l, line) {
  const want = [...new Set(words(line))];
  if (!want.length) return { want: 0, best: [] };
  const { list, idf } = windowsOf(l);
  const total = want.reduce((n, x) => n + idf(x), 0);
  const scored = list.map(w => { let hit = 0, n = 0; for (const x of want) if (w.set.has(x)) { hit += idf(x); n++; } return { w, n, share: hit / total }; })
    .filter(x => x.n).sort((a, b) => b.share - a.share);
  // keep the best few that are not the same stretch
  const best = [];
  for (const x of scored) { if (best.length >= 3) break; if (!best.some(b => Math.abs((b.w.at ?? list.indexOf(b.w)) - (x.w.at ?? list.indexOf(x.w))) < (x.w.at != null ? 30 : 2))) best.push(x); }
  return { want: want.length, best };
}
const strength = r => !r ? 'none' : r.share >= 0.5 && r.n >= 2 ? 'strong' : r.share >= 0.28 ? 'some' : 'none';
// bold the words of the line inside the quote
function marked(text, line) {
  const want = new Set(words(line));
  return String(text).split(/(\s+)/).map(tok => { const w = words(tok)[0]; return w && want.has(w) ? `<b>${esc(tok)}</b>` : esc(tok); }).join('');
}

/* ---------- how much was heard ---------- */
function coverage(l) {
  let el = document.getElementById('heard');
  if (!el) { el = document.createElement('div'); el.id = 'heard'; el.className = 'heard'; document.querySelector('#screen-result .result-head')?.after(el); }
  const h = l.heard;
  if (!h || !h.total || l.timeline?.[0]?.yt) {
    if (l.timeline?.[0]?.yt) { const mins = Math.round((l.timeline.at(-1).e || 0) / 60); el.hidden = false; el.innerHTML = `<span class="heard-t">▶ ${t('YouTube', 'يوتيوب')} · ${t(`listened up to minute ${num(mins)}`, `سُمع حتى الدقيقة ${num(mins)}`)}</span>`; }
    else el.hidden = true;
    return;
  }
  const tm = Math.max(1, Math.round(h.total / 60)), sp = Math.min(tm, Math.round(h.speech / 60));
  const pct = Math.round(100 * Math.min(1, h.speech / h.total));
  el.hidden = false;
  el.innerHTML = `<div class="heard-bar" role="img" aria-label="${pct}%"><i style="width:${pct}%"></i></div>
    <span class="heard-t">✓ ${t(`Heard all ${num(tm)} min`, `سُمعت كل الـ${num(tm)} دقيقة`)} · ${t(`speech in ${num(sp)}`, `كلام في ${num(sp)}`)}${tm - sp >= 1 ? ` · ${t(`${num(tm - sp)} min quiet`, `${num(tm - sp)} د صمت`)}` : ''}</span>`;
}

/* ---------- "Where is this from?" ---------- */
let lesson = null, audioURL = '';
function sheet() {
  let d = document.getElementById('proof-sheet');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'proof-sheet'; d.className = 'proof-sheet'; document.body.appendChild(d);
    d.addEventListener('close', () => { d.querySelector('audio')?.pause(); document.querySelectorAll('.proof-picked').forEach(x => x.classList.remove('proof-picked')); });
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
  }
  return d;
}
async function show(line, el) {
  const l = lesson; if (!l) return;
  document.querySelectorAll('.proof-picked').forEach(x => x.classList.remove('proof-picked'));
  el?.classList.add('proof-picked');
  const r = find(l, line), d = sheet();
  d.dir = AR() ? 'rtl' : 'ltr';   // the sheet follows the app's language; the quote follows its own
  const fromRec = !!l.timeline?.length, yt = l.timeline?.[0]?.yt ? l.yt : '';
  const short = line.length > 140 ? line.slice(0, 140) + '…' : line;
  let k = 0;
  const paint = async () => {
    const x = r.best[k], s = strength(x);
    const where = x?.w.at != null ? `<span class="pf-time">⏱ ${t('Minute', 'الدقيقة')} ${clock(x.w.at)}</span>` : '';
    const body = s === 'none'
      ? `<p class="pf-none">${t('Not found in the', 'لم يُعثر عليه في')} ${fromRec ? t('recording', 'التسجيل') : t('source', 'المصدر')}. ${t('It may be an explanation, example or memory aid added while writing — the Check report lists what was added.', 'قد يكون شرحًا أو مثالًا أو طريقة حفظ أُضيفت عند الكتابة — «تقرير التحقق» يذكر ما أُضيف.')}</p>`
      : `<div class="pf-src">${where}<span class="pf-lvl ${s}">${s === 'strong' ? t('Clear match', 'تطابق واضح') : t('Partly matches', 'تطابق جزئي')}</span></div>
         <blockquote dir="auto">…${marked(x.w.text, line)}…</blockquote>`;
    d.innerHTML = `<div class="pf-h"><b>${t('Where this came from', 'من أين جاء هذا')}</b><button type="button" class="icon-btn" id="pf-x" aria-label="${t('Close', 'إغلاق')}">✕</button></div>
      <p class="pf-line" dir="auto">${esc(short)}</p>${body}
      <div class="pf-act">
        ${s !== 'none' && x.w.at != null && !yt ? `<button type="button" class="primary small" id="pf-play" hidden>▶ ${t('Listen from here', 'استمع من هنا')}</button>` : ''}
        ${s !== 'none' && yt && x.w.at != null ? `<a class="primary small" id="pf-yt" target="_blank" rel="noopener" href="${esc(yt + (yt.includes('?') ? '&' : '?') + 't=' + Math.max(0, Math.floor(x.w.at - 5)) + 's')}">▶ ${t('Open on YouTube here', 'افتح يوتيوب هنا')}</a>` : ''}
        ${r.best.length > 1 && s !== 'none' ? `<button type="button" class="ghost small" id="pf-next">${t('Another place', 'مكان آخر')} (${num(k + 1)}/${num(r.best.length)})</button>` : ''}
      </div><div id="pf-audio"></div>`;
    d.querySelector('#pf-x').onclick = () => d.close();
    const nx = d.querySelector('#pf-next'); if (nx) nx.onclick = () => { k = (k + 1) % r.best.length; paint(); };
    const play = d.querySelector('#pf-play');
    if (play) {
      const blob = await window.JundRecs?.audioFor?.(l.txid).catch(() => null);
      if (blob) {
        play.hidden = false;
        play.onclick = () => {
          if (audioURL) URL.revokeObjectURL(audioURL);
          audioURL = URL.createObjectURL(blob);
          const a = document.createElement('audio'); a.controls = true; a.src = audioURL; a.style.width = '100%';
          d.querySelector('#pf-audio').replaceChildren(a);
          a.addEventListener('loadedmetadata', () => { a.currentTime = Math.max(0, x.w.at - 3); a.play().catch(() => {}); }, { once: true });
        };
      } else play.insertAdjacentHTML('afterend', `<small class="muted pf-gone">${t('The sound was deleted after transcription (Recordings → Keep the audio keeps it).', 'حُذف الصوت بعد التفريغ (التسجيلات ← «احتفظ بالصوت» يبقيه).')}</small>`);
    }
  };
  await paint();
  if (!d.open) d.showModal();
}

function setMode(on) {
  document.body.classList.toggle('proof-on', on);
  const b = document.getElementById('rt-proof');
  if (b) { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? t('✓ Tap a line to check it', '✓ اضغط أي سطر لتتحقق منه') : t('🔍 Where is this from?', '🔍 من أين هذا؟'); }
}
function onLesson(l) {
  lesson = l;
  coverage(l);
  setMode(false);
  const box = document.getElementById('result-tools');
  document.getElementById('rt-proof')?.remove();
  if (!box || l.draft || !String(l.transcript || '').trim()) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost small'; b.id = 'rt-proof';
  box.prepend(b); setMode(false);
  b.onclick = () => { const on = !document.body.classList.contains('proof-on'); setMode(on); if (on) window.JundCal?.toast(t('Tap any line of the notes to see where it came from', 'اضغط أي سطر في الملاحظات لترى من أين جاء'), 3500); };
}
// taps on the notes while checking
document.getElementById('pages-notes')?.addEventListener('click', e => {
  if (!document.body.classList.contains('proof-on') || !lesson) return;
  const el = e.target.closest('li, td, .col > *');
  if (!el || !el.closest('.col')) return;
  const line = (el.innerText || el.textContent || '').trim();
  if (line.length < 4) return;
  e.preventDefault(); e.stopPropagation();
  show(line, el);
}, true);
document.addEventListener('click', e => { if (e.target.closest?.('[data-nav], .tabbar, #top-back')) setMode(false); }, true);

window.JundProof = { onLesson, find, coverage, show: line => show(line, null), strength };
})();
