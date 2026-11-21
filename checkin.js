/* Mustatar — the end-of-day check-in (مراجعة اليوم): the assistant goes through what today held (tasks, homework,
   lessons, meetings, habits), asks "did you do it?", and you just talk: "Quran done, tafsir I missed because I was
   ill, the essay is half done". It ticks each one done or not done, keeps your remark or your reason, asks again about
   anything you did not mention, and moves unfinished tasks to tomorrow if you want. The coach reads these reasons. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const AR = () => window.ZadLang === 'ar';
const L = (en, ar) => AR() ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const C = () => window.JundCal;
const TYPE = { task: ['Task', 'مهمة'], homework: ['Homework', 'واجب'], exam: ['Exam', 'اختبار'], project: ['Project', 'مشروع'], class: ['Lesson', 'درس'], meeting: ['Meeting', 'اجتماع'], study: ['Study time', 'وقت مذاكرة'], habit: ['Habit', 'عادة'] };
const typeL = k => (TYPE[k] || TYPE.task)[AR() ? 1 : 0];

/* ---------- what today held ---------- */
function items(d = today()) {
  const out = [], seen = new Set(), evs = C()?.events?.() || [];
  const dayOf = C()?.on ? C().on(d) : evs.filter(e => e.date === d);
  for (const e of dayOf) {
    if (seen.has(e.id) || e.ext === 'phone' && !e.type) continue; seen.add(e.id);
    const weekly = e.repeat === 'weekly';
    const st = weekly ? e.att?.[d]?.s || '' : e.done ? 'done' : (e.ci?.[d]?.s || '');
    out.push({ key: 'e:' + e.id, id: e.id, kind: e.type || 'task', title: e.title, time: e.time || '', weekly, st, note: (weekly ? e.att?.[d]?.n : e.ci?.[d]?.n) || '' });
  }
  // tasks that were already late
  for (const e of evs) if (!seen.has(e.id) && !e.done && e.date && e.date < d && e.repeat !== 'weekly' && ['task', 'homework', 'project'].includes(e.type || 'task')) {
    seen.add(e.id); out.push({ key: 'e:' + e.id, id: e.id, kind: e.type || 'task', title: e.title, late: e.date, st: e.ci?.[d]?.s || '', note: e.ci?.[d]?.n || '' });
  }
  for (const h of store.get('habits', []) || []) out.push({ key: 'h:' + h.id, id: h.id, kind: 'habit', title: h.name, target: h.target || '', st: h.days?.[d] ? 'done' : h.miss?.[d] ? 'not' : '', note: h.notes?.[d] || '' });
  return out.sort((a, b) => (a.kind === 'habit') - (b.kind === 'habit') || (a.time || '99').localeCompare(b.time || '99'));
}

/* ---------- the window ---------- */
let list = [], dlg = null, rec = null, round = 0;
function open(d = today()) {
  list = items(d); round = 0;
  dlg?.remove();
  dlg = document.createElement('dialog'); dlg.className = 'ci-dlg'; dlg.dir = AR() ? 'rtl' : 'ltr'; dlg.setAttribute('data-noi18n', ''); dlg.dataset.day = d;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => { stopRec(true); window.JundVoice?.stop?.(); dlg?.remove(); dlg = null; });
  paint(); dlg.showModal();
  if (list.length && store.get('checkinSpeak', true)) setTimeout(() => ask(), 450);
}
function paint() {
  if (!dlg) return;
  const d = dlg.dataset.day, n = list.length, done = list.filter(x => x.st === 'done').length, answered = list.filter(x => x.st).length;
  const head = d === today() ? L('How did today go?', 'كيف كان يومك؟') : new Date(d + 'T12:00').toLocaleDateString(AR() ? 'ar-SA-u-ca-gregory' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  dlg.innerHTML = `<div class="ci-top"><div><b>${head}</b><small>${n ? L(`${answered} of ${n} answered · ${done} done`, `أُجيب عن ${answered} من ${n} · أُنجز ${done}`) : ''}</small></div><button type="button" class="icon-btn" id="ci-x" aria-label="${L('Close', 'إغلاق')}">✕</button></div>
    ${n ? `<div class="ci-voice">
      <button type="button" class="ci-mic ${rec ? 'on' : ''}" id="ci-mic" aria-label="${rec ? L('Stop', 'إيقاف') : L('Talk', 'تكلّم')}">${rec ? '■' : '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'}</button>
      <div class="ci-say"><b id="ci-q">${rec ? L('Listening… tap ■ when you finish', 'أستمع… اضغط ■ عندما تنتهي') : round ? L('Tell me about the ones still open', 'أخبرني عن التي بقيت') : L('Tap and tell me what you did', 'اضغط وأخبرني بما فعلت')}</b>
        <small id="ci-st">${L('e.g. “Quran and tafsir done, I missed the workout because I was tired, the essay is half done.”', 'مثال: «أنجزت القرآن والتفسير، وفاتتني الرياضة لأني كنت متعبًا، والبحث أنجزت نصفه.»')}</small></div>
      <button type="button" class="ghost small ci-read" id="ci-read" title="${L('Read it to me', 'اقرأها لي')}">🔊</button></div>
      <textarea id="ci-text" rows="2" dir="auto" placeholder="${L('…or type it here', '…أو اكتبها هنا')}"></textarea>
      <button type="button" class="ghost small" id="ci-apply" hidden>${L('Fill from what I wrote', 'املأ مما كتبت')}</button>
      <div class="ci-list">${list.map((x, i) => `<div class="ci-row ${x.st}" data-i="${i}">
        <div class="ci-t"><b dir="auto">${esc(x.title)}</b><small>${typeL(x.kind)}${x.time ? ' · ' + x.time : ''}${x.target ? ' · ' + esc(x.target) : ''}${x.late ? ' · ' + L('late since ', 'متأخرة منذ ') + x.late : ''}</small></div>
        <div class="ci-ch"><button type="button" data-s="done" class="${x.st === 'done' ? 'on' : ''}">✓ ${L('Done', 'أنجزت')}</button><button type="button" data-s="part" class="${x.st === 'part' ? 'on' : ''}">◐ ${L('Part', 'جزئيًا')}</button><button type="button" data-s="not" class="${x.st === 'not' ? 'on' : ''}">✕ ${L('Not done', 'لم أنجز')}</button></div>
        <input class="ci-note" dir="auto" value="${esc(x.note)}" placeholder="${x.st === 'not' ? L('Why? (your reason)', 'لماذا؟ (سببك)') : L('Remark (optional)', 'ملاحظة (اختياري)')}" ${x.st || x.note ? '' : 'hidden'}>
      </div>`).join('')}</div>
      <label class="check ci-move"><input type="checkbox" id="ci-move" ${store.get('checkinMove', true) ? 'checked' : ''}> ${L('Move unfinished tasks to tomorrow', 'انقل المهام غير المنجزة إلى الغد')}</label>
      <button type="button" class="primary ci-save" id="ci-save">${L('Save my day', 'احفظ يومي')}</button>
      <label class="ci-when"><span>${L('Remind me every evening at', 'ذكّرني كل مساء الساعة')}</span><input type="time" id="ci-time" value="${at()}"></label>`
    : `<p class="muted">${L('Nothing was planned today — no tasks, lessons or habits. Add some for tomorrow from the Calendar or the Habit tracker.', 'لم يكن لديك شيء مخطط اليوم — لا مهام ولا دروس ولا عادات. أضف للغد من التقويم أو متابعة العادات.')}</p>`}`;
  $('#ci-x', dlg).onclick = () => dlg.close();
  if (!n) return;
  $('#ci-mic', dlg).onclick = () => rec ? stopRec(false) : startRec();
  $('#ci-read', dlg).onclick = () => ask(true);
  const ta = $('#ci-text', dlg), ap = $('#ci-apply', dlg);
  ta.oninput = () => { ap.hidden = !ta.value.trim(); };
  ap.onclick = () => understand(ta.value.trim());
  $$('.ci-row', dlg).forEach(r => {
    const x = list[Number(r.dataset.i)];
    $$('[data-s]', r).forEach(b => b.onclick = () => { x.st = x.st === b.dataset.s ? '' : b.dataset.s; x.by = 'hand'; paintKeep(); });
    $('.ci-note', r).oninput = e => { x.note = e.target.value; };
  });
  $('#ci-move', dlg).onchange = e => store.set('checkinMove', e.target.checked);
  $('#ci-save', dlg).onclick = saveDay;
  $('#ci-time', dlg).onchange = e => { if (e.target.value) { store.set('checkinTime', e.target.value); C()?.pushSync?.(); C()?.toast?.(L('✓ The evening reminder is set', '✓ ضُبط تذكير المساء')); } };
}
// repaint without losing what is typed in the big box
function paintKeep() { const t = $('#ci-text', dlg)?.value || '', y = $('.ci-list', dlg)?.scrollTop || 0; paint(); const ta = $('#ci-text', dlg); if (ta) { ta.value = t; $('#ci-apply', dlg).hidden = !t.trim(); } const l = $('.ci-list', dlg); if (l) l.scrollTop = y; }
function status(t) { const s = $('#ci-st', dlg); if (s) s.textContent = t; }

/* ---------- the assistant asks out loud ---------- */
function names(xs) { return xs.map(x => x.title).slice(0, 8).join(AR() ? '، ' : ', '); }
function ask(force, quiet) {
  const open_ = list.filter(x => !x.st);
  if (!open_.length) { if (force) speak(L('Everything is answered. Tap Save my day.', 'أجبت عن كل شيء. اضغط احفظ يومي.')); return; }
  const tasks = open_.filter(x => x.kind !== 'habit'), habits = open_.filter(x => x.kind === 'habit');
  const q = round === 0
    ? L(`Today you had ${tasks.length ? tasks.length + ' ' + (tasks.length === 1 ? 'thing' : 'things') + ': ' + names(tasks) : 'no tasks'}${habits.length ? (tasks.length ? ', and your habits: ' : 'your habits: ') + names(habits) : ''}. Which did you do? For anything not done, tell me why.`,
        `كان عندك اليوم ${tasks.length ? tasks.length + ': ' + names(tasks) : 'لا مهام'}${habits.length ? '، وعاداتك: ' + names(habits) : ''}. ماذا أنجزت؟ وما لم تنجزه، أخبرني بسببه.`)
    : L(`And what about ${names(open_)}?`, `وماذا عن ${names(open_)}؟`);
  const qb = $('#ci-q', dlg); if (qb) qb.textContent = q;
  if (!quiet) speak(q);
}
function speak(t) { try { window.JundVoice?.say?.(t, AR() ? 'ar' : 'en'); } catch {} }

/* ---------- you talk: record, write it down, understand it ---------- */
const TYPE_A = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
async function startRec() {
  window.JundVoice?.stop?.();
  let stream; try { stream = await window.openMic({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }); }
  catch (e) { status(window.micError ? window.micError(e) : L('The microphone could not start.', 'تعذّر تشغيل الميكروفون.')); return; }
  const ty = TYPE_A(), mr = new MediaRecorder(stream, ty ? { mimeType: ty, audioBitsPerSecond: 32000 } : undefined), parts = [];
  mr.ondataavailable = e => { if (e.data?.size) parts.push(e.data); };
  rec = { mr, stream, parts, at: Date.now() };
  mr.start(1000); paintKeep();
  rec.limit = setTimeout(() => stopRec(false), 3 * 60e3);   // three minutes at most
}
function stopRec(cancel) {
  const r = rec; if (!r) return; rec = null; clearTimeout(r.limit);
  r.mr.onstop = async () => {
    r.stream.getTracks().forEach(t => t.stop());
    if (cancel || !dlg) return;
    paintKeep();
    if (Date.now() - r.at < 900) { status(L('That was too short — tap and talk.', 'كان قصيرًا جدًا — اضغط وتكلّم.')); return; }
    const blob = new Blob(r.parts, { type: r.mr.mimeType || 'audio/webm' });
    const file = new File([blob], 'day.' + (/mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm'), { type: blob.type.split(';')[0] });
    status(L('Writing down what you said…', 'أكتب ما قلته…'));
    try {
      const res = await window.JundAttach.askFile(file, { maxTokens: 1500,
        system: 'You write down speech. Output ONLY the exact words spoken in this audio, in the language(s) spoken (Arabic in Arabic script, English in English), with normal punctuation. No notes, no quotes. If nothing clear was said, output nothing.',
        user: 'Write down what is said. Words likely to come up: ' + list.map(x => x.title).join(', ').slice(0, 600) });
      const said = res.text.trim().replace(/^["“]|["”]$/g, '');
      if (!said) { status(L('I heard nothing clear. Try again, a little closer.', 'لم أسمع شيئًا واضحًا. حاول مرة أخرى بقرب أكثر.')); return; }
      const ta = $('#ci-text', dlg); if (ta) ta.value = said;
      await understand(said);
    } catch (e) { status('✗ ' + J.errText(e)); }
  };
  try { r.mr.stop(); } catch { r.stream.getTracks().forEach(t => t.stop()); }
}
async function understand(said) {
  if (!said || !dlg) return;
  status(L('Understanding…', 'أفهم ما قلت…'));
  const rows = list.map((x, i) => `${i + 1}. [${x.kind}] ${x.title}${x.target ? ` (target ${x.target})` : ''}${x.st ? ` — already: ${x.st}` : ''}`).join('\n');
  try {
    const r = await J.callServer({ assistant: true, json: true, maxTokens: 1500,
      system: `The person is telling you how their day went. Match what they say to the numbered items. For each item they mention, decide:
"done" (finished), "part" (partly done / started / half), or "not" (not done / missed / skipped). Keep their remark or reason short, in their own language (e.g. "was ill", "did 2 of 3 pages").
Only include items they really talked about; a general phrase like "everything else done" or "كل الباقي أنجزته" counts for all items not otherwise mentioned. Never guess.
Also list anything they did that is not in the list (extra), briefly.
Return JSON only: {"items":[{"n":1,"s":"done|part|not","note":"..."}],"extra":["..."],"reply":"one warm, short sentence back to them in their language (praise what went well; for what was missed, one practical tip)"}`,
      user: `ITEMS:\n${rows}\n\nWHAT THEY SAID:\n${said}` });
    const j = J.parseJSON(r.text) || {};
    let hit = 0;
    for (const it of j.items || []) { const x = list[Number(it.n) - 1]; if (!x || !['done', 'part', 'not'].includes(it.s)) continue; x.st = it.s; if (it.note) x.note = String(it.note).slice(0, 200); x.by = 'voice'; hit++; }
    if (Array.isArray(j.extra) && j.extra.length) dlg.dataset.extra = JSON.stringify(j.extra.slice(0, 5));
    round++; paintKeep();
    const left = list.filter(x => !x.st);
    status(j.reply ? String(j.reply).slice(0, 300) : hit ? L(`✓ Filled ${hit}.`, `✓ مُلئ ${hit}.`) : L('I could not match that to your list. Tap the buttons, or say it again naming the task.', 'لم أستطع ربط كلامك بقائمتك. اضغط الأزرار، أو أعدها مع ذكر اسم المهمة.'));
    if (j.reply) speak(String(j.reply));
    if (left.length && hit) { ask(false, true); setTimeout(() => ask(), j.reply ? 2600 : 400); }
  } catch (e) { status('✗ ' + J.errText(e)); }
}

/* ---------- save: tick, keep the remarks and reasons, move unfinished tasks on ---------- */
function saveDay() {
  const d = dlg.dataset.day, move = $('#ci-move', dlg)?.checked, evs = C()?.events?.() || [], hs = store.get('habits', []) || [];
  let moved = 0;
  for (const x of list) {
    if (x.kind === 'habit') {
      const h = hs.find(y => y.id === x.id); if (!h) continue;
      h.days ||= {}; h.miss ||= {}; h.notes ||= {};
      delete h.days[d]; delete h.miss[d];
      if (x.st === 'done' || x.st === 'part') h.days[d] = true; else if (x.st === 'not') h.miss[d] = true;
      if (x.note) h.notes[d] = x.note; else delete h.notes[d];
      continue;
    }
    const e = evs.find(y => y.id === x.id); if (!e) continue;
    if (x.weekly) { e.att ||= {}; if (x.st || x.note) e.att[d] = { s: x.st, n: x.note }; else delete e.att[d]; }
    else {
      e.ci ||= {}; if (x.st || x.note) e.ci[d] = { s: x.st, n: x.note }; else delete e.ci[d];
      if (x.st === 'done') e.done = true;
      if (x.note && !String(e.notes || '').includes(x.note)) e.notes = [e.notes, `${d}: ${x.st === 'not' ? L('not done — ', 'لم يُنجز — ') : x.st === 'part' ? L('partly — ', 'جزئيًا — ') : ''}${x.note}`].filter(Boolean).join('\n');
      if (move && x.st !== 'done' && ['task', 'homework', 'project'].includes(e.type || 'task') && e.date && e.date <= d) { e.date = addDays(d, 1); moved++; }
    }
    e.updated = Date.now();
  }
  store.set('habits', hs); J.cloud?.putData?.('habits', { saved: Date.now(), habits: hs }).catch?.(() => {});
  C()?.save?.();
  const log = store.get('checkins', {});
  log[d] = { at: Date.now(), items: list.map(x => ({ t: x.title, k: x.kind, s: x.st, n: x.note })), extra: JSON.parse(dlg.dataset.extra || '[]') };
  const keys = Object.keys(log).sort(); while (keys.length > 120) delete log[keys.shift()];
  store.set('checkins', log);
  window.JundFeatures?.renderHabits?.(); window.JundHabits?.paint?.();
  const done = list.filter(x => x.st === 'done').length;
  dlg.close();
  C()?.toast?.(L(`✓ Day saved: ${done} of ${list.length} done${moved ? `, ${moved} moved to tomorrow` : ''}`, `✓ حُفظ يومك: أُنجز ${done} من ${list.length}${moved ? `، ونُقلت ${moved} إلى الغد` : ''}`), 4500);
  paintToday();
}

/* ---------- on Today in the evening, and a reminder ---------- */
const at = () => store.get('checkinTime', '21:00');
function paintToday() {
  const sec = $('#screen-assistant .hm-sec') || $('#screen-assistant .home-head');
  let card = $('#hm-checkin');
  const t = today(), h = new Date().getHours(), done = !!store.get('checkins', {})[t], n = items(t).length;
  const show = store.get('checkinOn', true) && n && !done && h >= Math.min(18, Number(at().split(':')[0]));
  if (!show) { card?.remove(); return; }
  if (!card) { card = document.createElement('button'); card.type = 'button'; card.id = 'hm-checkin'; card.className = 'ci-card'; sec?.before(card); }
  card.setAttribute('data-noi18n', ''); card.dir = AR() ? 'rtl' : 'ltr';
  card.innerHTML = `<span class="ci-card-ic">🎙️</span><span><b>${L('How did today go?', 'كيف كان يومك؟')}</b><small>${L(`Tell me by voice — ${n} things to tick, about 2 minutes`, `أخبرني بصوتك — ${n} أشياء للتعليم، نحو دقيقتين`)}</small></span>`;
  card.onclick = () => open();
}
// the evening reminder (the Android app shows it even when Mustatar is closed)
function alarms() {
  if (!store.get('checkinOn', true)) return [];
  const out = [], [hh, mm] = at().split(':').map(Number);
  for (let i = 0; i < 7; i++) {
    const d = addDays(today(), i), when = new Date(`${d}T${pad(hh)}:${pad(mm)}`).getTime();
    if (when < Date.now() - 60e3 || store.get('checkins', {})[d]) continue;
    out.push({ id: 'checkin-' + d, kind: 'checkin', view: 'checkin', at: when, title: L('How did today go? 🎙️', 'كيف كان يومك؟ 🎙️'), body: L('Two minutes: tell Mustatar what you did, and why for what you did not.', 'دقيقتان: أخبر مستطر بما أنجزت، وبسبب ما لم تنجزه.') });
  }
  return out;
}
// the coach and the chat read the reasons
function recent(days = 14) {
  const log = store.get('checkins', {}), from = addDays(today(), -days);
  return Object.entries(log).filter(([d]) => d >= from).sort().map(([d, v]) => `${d}: ` + v.items.filter(x => x.s && x.s !== 'done' || x.n).map(x => `${x.t} ${x.s || '?'}${x.n ? ' (' + x.n + ')' : ''}`).join('; ')).filter(s => !/: $/.test(s)).join('\n');
}

window.addEventListener('mustatar-screen', () => { if (!$('#screen-assistant')?.hidden) paintToday(); });
setTimeout(paintToday, 1500);
setInterval(paintToday, 10 * 60e3);
window.JundCheckin = { open, items, alarms, recent, paintToday };
})();
