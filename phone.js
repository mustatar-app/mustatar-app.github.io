/* Mustatar — things only the Android app can do (in a browser this file does nothing visible):
   1. Home-screen widgets: the app hands them prayer times, your items, the Hijri date, the style and the language.
   2. Prayer times: a gentle vibration at each prayer, with no sound (on by default; off in Settings).
   3. Your phone's calendars, both ways: events from the calendars you pick come into Mustatar; Mustatar's items go into
      one calendar you pick, and changes you make there come back.
   4. Fitness tracker: steps, distance, active calories, sleep and workouts from Health Connect (Samsung Health,
      Google Fit, watches…), read only, with your permission. */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const { store, esc } = J;
const N = () => window.JundNative;
const APP = () => !!window.MustatarAndroid && !!N()?.ask;
const AR = () => window.ZadLang === 'ar';
const t = (en, ar) => AR() ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const FIVE = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const FIVE_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
const HIJRI_AR = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
const HIJRI_EN = ['Muharram', 'Safar', 'Rabi I', 'Rabi II', 'Jumada I', 'Jumada II', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qa'dah", 'Dhu al-Hijjah'];

/* ---------- 1. the widgets' data ---------- */
function hijriLabel(d) {
  try { const h = window.JundFeatures.hijriParts(d); return AR() ? `${h.d} ${HIJRI_AR[h.m - 1]} ${h.y}` : `${h.d} ${HIJRI_EN[h.m - 1]} ${h.y}`; } catch { return ''; }
}
async function widgetData() {
  const F = window.JundFeatures, C = window.JundCal;
  const prayers = {}, hijri = {};
  for (let i = 0; i < 8; i++) {
    const d = addDays(new Date(), i), k = iso(d), times = F?.timesFor?.(k);
    if (times) prayers[k] = Object.fromEntries(FIVE.map(n => [n, times[n]]));
    if (i < 2) hijri[k] = hijriLabel(d);
  }
  const items = [], busy = new Set();
  for (const x of C?.between?.(-31, 40) || []) {
    busy.add(x.d);
    if (x.done || x.d < iso(addDays(new Date(), -1))) continue;
    const start = x.e.time ? x.at : new Date(x.d + 'T00:01').getTime();
    const end = x.e.time ? x.at + Math.max(15, Number(x.e.mins) || 60) * 60e3 : new Date(x.d + 'T23:59').getTime();
    if (end < Date.now() || items.length >= 80) continue;
    items.push({ title: x.e.title, at: start, end, timed: !!x.e.time, type: x.e.type || 'task' });
  }
  items.sort((a, b) => a.at - b.at);
  return { v: 1, lang: AR() ? 'ar' : 'en', style: store.get('widgetStyle', 'clear'), weekStart: Number(store.get('weekStart', 0)) || 0,
    prayers, hijri, items, busyDays: [...busy], wisdom: await window.JundReminder?.forWidget?.().catch(() => null) || [] };
}
let lastWidget = '';
async function pushWidgets(force) {
  if (!APP()) return;
  const data = await widgetData();
  const s = JSON.stringify({ ...data, wisdom: (data.wisdom || []).length });
  if (!force && s === lastWidget) return;
  lastWidget = s;
  window.MustatarAndroid.postMessage(JSON.stringify({ action: 'widget', data }));
}

/* ---------- 2. a gentle vibration at prayer times ---------- */
function prayerAlarms() {
  if (!APP() || !store.get('prayerVibrate', true)) return [];
  const out = [], now = Date.now(), place = store.get('prayerPlace', {})?.name || '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(new Date(), i), k = iso(d), times = window.JundFeatures?.timesFor?.(k);
    if (!times) continue;
    for (const n of FIVE) {
      if (!/^\d\d:\d\d/.test(times[n] || '')) continue;
      const at = new Date(`${k}T${times[n].slice(0, 5)}`).getTime();
      if (at < now - 60e3) continue;
      out.push({ id: `pray-${k}-${n}`, kind: 'prayer', at, title: AR() ? `حان وقت صلاة ${FIVE_AR[n]}` : `It is time for ${n}`, body: [times[n].slice(0, 5), place].filter(Boolean).join(' · ') });
    }
  }
  return out;
}

/* ---------- 3. the phone's calendars, both ways ---------- */
const cal = () => store.get('phoneCal', { on: false, show: [], write: null });
const ask = (msg, ms) => N().ask(msg, ms);
let calBusy = false;
async function calRefresh(force) {
  const c = cal(); if (!APP() || !c.on || calBusy) return;
  if (!force && Date.now() - (c.at || 0) < 10 * 60e3) return;
  calBusy = true;
  try {
    const C = window.JundCal, evs = C.events();
    const from = new Date(); from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0);
    const to = addDays(new Date(), 60);
    const r = await ask({ action: 'calendarRead', from: from.getTime(), to: to.getTime(), ids: c.show || [] }, 30000);
    if (!r.ok) { if (r.error === 'permission') { c.on = false; store.set('phoneCal', c); } return; }
    const names = Object.fromEntries((c.list || []).map(x => [String(x.id), x.name]));
    const fresh = [], seenMine = new Set(); let changed = false;
    for (const ev of r.events || []) {
      const d = new Date(ev.begin);
      const day = ev.allDay ? d.toISOString().slice(0, 10) : iso(d), time = ev.allDay ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (ev.mine) {   // one of Mustatar's own items, as it is now in the phone's calendar
        seenMine.add(ev.mine);
        const e = evs.find(x => x.id === ev.mine);
        if (e && e.repeat !== 'weekly' && (e.title !== ev.title || e.date !== day || (e.time || '') !== time)) {
          e.title = ev.title || e.title; e.date = day; e.time = time; e.updated = Date.now(); changed = true;
        }
        continue;
      }
      fresh.push({ id: `p:${ev.event}:${day}`, ext: 'phone', title: ev.title || t('(no title)', '(بلا عنوان)'), date: day, time, type: 'meeting', repeat: 'none',
        remind: -1, notes: names[String(ev.cal)] || t('Phone calendar', 'تقويم الجوال'), created: 0, updated: 0 });
    }
    // Mustatar items deleted in the phone's calendar app: remove them here too (a few at a time, never a mass wipe)
    const gone = (c.written || []).filter(id => !seenMine.has(id) && evs.some(e => e.id === id && e.repeat !== 'weekly' && e.date >= iso(from) && e.date <= iso(to)));
    if (gone.length && gone.length <= 3) {
      for (const id of gone) { const i = evs.findIndex(e => e.id === id); if (i >= 0) evs.splice(i, 1); }
      await ask({ action: 'calendarForget', ids: gone }, 10000); changed = true;
    }
    const done = new Set(evs.filter(e => e.ext === 'phone' && e.done).map(e => e.id));
    for (let i = evs.length - 1; i >= 0; i--) if (evs[i].ext === 'phone') evs.splice(i, 1);
    fresh.forEach(e => { if (done.has(e.id)) e.done = true; evs.push(e); });
    c.count = fresh.length; c.at = Date.now(); store.set('phoneCal', c);
    C.save(); if (changed) C.pushSync?.();
    await calWrite();
    paintCalCard();
  } catch {} finally { calBusy = false; }
}
async function calWrite() {
  const c = cal(); if (!APP() || !c.on || !c.write) return;
  const from = iso(addDays(new Date(), -1));
  const items = [];
  for (const e of window.JundCal.events()) {
    if (e.ext || !e.date || !e.title) continue;
    if (e.repeat !== 'weekly' && (e.done || e.date < from)) continue;
    const [y, m, d] = e.date.split('-').map(Number);
    const allDay = !e.time;
    const start = allDay ? Date.UTC(y, m - 1, d) : new Date(`${e.date}T${e.time}`).getTime();
    const end = allDay ? start + 864e5 : start + Math.max(15, Number(e.mins) || 60) * 60e3;
    items.push({ id: e.id, title: e.title, start, end, allDay, notes: [e.notes, t('From Mustatar', 'من مستطر')].filter(Boolean).join('\n'),
      remind: e.time ? (e.remind ?? -1) : -1, rrule: e.repeat === 'weekly' ? 'FREQ=WEEKLY' : '' });
  }
  const sig = JSON.stringify([c.write, items]);
  if (sig === c.sig) return;
  const r = await ask({ action: 'calendarWrite', cal: c.write, items }, 60000);
  if (r.ok) { c.sig = sig; c.written = items.map(x => x.id); c.wrote = r.count; store.set('phoneCal', c); }
}
async function calConnect() {
  const st = $('#ph-cal-st');
  const ok = await ask({ action: 'calendarAsk' }, 120000);
  if (!ok.ok) { if (st) st.textContent = t('Calendar access was not allowed. You can allow it in the phone’s Settings → Apps → Mustatar → Permissions.', 'لم يُسمح بالوصول للتقويم. تستطيع السماح من إعدادات الجوال ← التطبيقات ← مستطر ← الأذونات.'); return; }
  const r = await ask({ action: 'calendarList' }, 20000);
  const c = cal(); c.on = true; c.list = r.calendars || [];
  if (!c.show?.length) c.show = c.list.filter(x => x.visible).map(x => x.id);
  if (c.write == null) c.write = (c.list.find(x => x.writable && x.primary && /google/i.test(x.type)) || c.list.find(x => x.writable && x.primary) || c.list.find(x => x.writable))?.id ?? null;
  store.set('phoneCal', c); paintCalCard(); calRefresh(true);
}
function paintCalCard() {
  const box = $('#ph-cal'); if (!box) return;
  const c = cal();
  if (!c.on) {
    box.innerHTML = `<p class="muted fine">${t('See your Google, Samsung or Outlook calendar (whatever is on this phone) inside Mustatar, and put Mustatar’s tasks into it. Changes made on either side follow.', 'اعرض تقويم Google أو Samsung أو Outlook (ما في جوالك) داخل مستطر، وضع مهام مستطر فيه. والتعديل من أي جهة يصل للأخرى.')}</p>
      <button type="button" class="primary" id="ph-cal-on">${t('Connect my phone’s calendars', 'اربط تقاويم جوالي')}</button><p class="muted fine" id="ph-cal-st"></p>`;
    $('#ph-cal-on').onclick = calConnect; return;
  }
  const list = c.list || [];
  box.innerHTML = `<div class="ph-h">${t('Show in Mustatar', 'اعرضها في مستطر')}</div>
    ${list.map(x => `<label class="ph-row"><span class="ph-dot" style="background:${esc(x.color)}"></span><span class="ph-t" dir="auto"><b>${esc(x.name)}</b><small>${esc(x.account)}</small></span><input type="checkbox" data-show="${x.id}"${(c.show || []).includes(x.id) ? ' checked' : ''}></label>`).join('')}
    <label class="field" style="margin-top:10px"><span>${t('Put Mustatar’s items in', 'ضع عناصر مستطر في')}</span><select id="ph-write"><option value="">${t('Nowhere (only read)', 'لا مكان (قراءة فقط)')}</option>
      ${list.filter(x => x.writable).map(x => `<option value="${x.id}"${c.write === x.id ? ' selected' : ''}>${esc(x.name)} · ${esc(x.account)}</option>`).join('')}</select></label>
    <p class="muted fine">${c.at ? t(`✓ ${c.count || 0} events from your phone. ${c.write ? `${c.wrote || 0} Mustatar items in your calendar.` : ''}`, `✓ ${c.count || 0} موعدًا من جوالك. ${c.write ? `${c.wrote || 0} من عناصر مستطر في تقويمك.` : ''}`) : t('Reading…', 'جارٍ القراءة…')}</p>
    <div class="row-gap"><button type="button" class="ghost small" id="ph-cal-now">${t('Sync now', 'زامن الآن')}</button><button type="button" class="link" id="ph-cal-off">${t('Disconnect', 'افصل')}</button></div>`;
  box.querySelectorAll('[data-show]').forEach(b => b.onchange = () => { const c2 = cal(); const id = Number(b.dataset.show); c2.show = b.checked ? [...new Set([...(c2.show || []), id])] : (c2.show || []).filter(x => x !== id); store.set('phoneCal', c2); calRefresh(true); });
  $('#ph-write').onchange = e => { const c2 = cal(); c2.write = e.target.value ? Number(e.target.value) : null; c2.sig = ''; store.set('phoneCal', c2); if (!c2.write) ask({ action: 'calendarClear' }); calRefresh(true); };
  $('#ph-cal-now').onclick = () => calRefresh(true);
  $('#ph-cal-off').onclick = async () => {
    if (!confirm(t('Disconnect? Mustatar’s copies are taken out of your phone’s calendar; your phone’s events leave Mustatar.', 'فصل؟ تُحذف نسخ مستطر من تقويم جوالك، وتخرج مواعيد جوالك من مستطر.'))) return;
    await ask({ action: 'calendarClear' });
    const evs = window.JundCal.events(); for (let i = evs.length - 1; i >= 0; i--) if (evs[i].ext === 'phone') evs.splice(i, 1);
    window.JundCal.save(); store.set('phoneCal', { on: false, show: [], write: null }); paintCalCard();
  };
}

/* ---------- 4. fitness tracker ---------- */
const fit = () => store.get('fitness', { on: false });
const stepGoal = () => Number(store.get('stepGoal', 8000)) || 8000;
async function fitRead(force) {
  const f = fit(); if (!APP() || !f.on) return null;
  if (!force && f.data && Date.now() - (f.at || 0) < 15 * 60e3) return f.data;
  const r = await ask({ action: 'healthRead', days: 7 }, 30000);
  if (r.ok) { f.data = r.days || []; f.at = Date.now(); f.granted = r.granted; store.set('fitness', f); }
  else if (r.status && r.status !== 'ok') { f.on = false; f.problem = r.status; store.set('fitness', f); }
  return f.data || null;
}
async function fitConnect() {
  const st = $('#ph-fit-st'); if (st) st.textContent = t('Opening Health Connect…', 'يُفتح Health Connect…');
  const r = await ask({ action: 'healthAsk' }, 300000);
  const f = fit();
  if (r.status === 'update') { if (st) st.textContent = t('Install or update “Health Connect” from the Play Store (it opened), then tap Connect again.', 'ثبّت أو حدّث «Health Connect» من المتجر (فُتح لك)، ثم اضغط «اربط» مرة أخرى.'); return; }
  if (r.status === 'none') { if (st) st.textContent = t('This phone cannot use Health Connect (it needs Android 9 or newer).', 'هذا الجوال لا يدعم Health Connect (يحتاج أندرويد ٩ أو أحدث).'); return; }
  if (!r.ok || !r.granted) { if (st) st.textContent = t('Nothing was allowed. You can try again any time.', 'لم يُسمح بشيء. تستطيع المحاولة متى شئت.'); return; }
  f.on = true; store.set('fitness', f);
  await fitRead(true); paintFitCard(); paintFitHome();
}
const km = m => (m / 1000).toFixed(m >= 10000 ? 0 : 1);
const hm = min => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`;
function ring(p, size = 64) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, p));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="7"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
function bars(days, key, goal) {
  const max = Math.max(goal || 1, ...days.map(d => d[key] || 0));
  return `<div class="fx-bars">${days.map(d => { const v = d[key] || 0, wd = new Date(d.date + 'T12:00').toLocaleDateString(AR() ? 'ar-SA' : 'en-GB', { weekday: 'narrow' });
    return `<div class="fx-bar${d.date === iso(new Date()) ? ' on' : ''}"><i style="height:${Math.round(v / max * 100)}%"${goal && v >= goal ? ' class="met"' : ''}></i><small>${wd}</small></div>`; }).join('')}</div>`;
}
function paintFitHome() {
  const home = $('#screen-assistant'); if (!home || !APP()) return;
  let card = $('#hm-fit');
  const f = fit();
  if (!f.on) {
    if (store.get('fitAskHidden')) { if (card) card.remove(); return; }
    if (!card) { card = document.createElement('div'); card.id = 'hm-fit'; card.className = 'hm-sec fx-card'; ($('#hm-habits-wrap') || $('#hm-tiles'))?.before(card); }
    card.innerHTML = `<div class="fx-ask"><span class="fx-ic">👟</span><span>${t('See your steps and sleep here', 'اعرض خطواتك ونومك هنا')}</span><button type="button" class="ghost small" id="fx-go">${t('Connect', 'اربط')}</button><button type="button" class="icon-btn small" id="fx-no" aria-label="${t('Hide', 'إخفاء')}">✕</button></div>`;
    $('#fx-go', card).onclick = fitConnect; $('#fx-no', card).onclick = () => { store.set('fitAskHidden', true); card.remove(); };
    return;
  }
  const days = f.data || [], d = days.at(-1) || {}, goal = stepGoal();
  if (!card) { card = document.createElement('div'); card.id = 'hm-fit'; card.className = 'hm-sec fx-card'; ($('#hm-habits-wrap') || $('#hm-tiles'))?.before(card); }
  const wk = (d.workouts || []).map(w => `${w.title || t('Workout', 'تمرين')} · ${w.min} ${t('min', 'د')}`).join(' · ');
  card.innerHTML = `<button type="button" class="fx-main" id="fx-open">
      <span class="fx-ring">${ring((d.steps || 0) / goal)}<b>${Math.round((d.steps || 0) / goal * 100)}%</b></span>
      <span class="fx-nums"><b>${(d.steps || 0).toLocaleString(AR() ? 'ar-SA' : 'en-GB')}</b> <small>${t(`of ${goal.toLocaleString('en-GB')} steps`, `من ${goal.toLocaleString('ar-SA')} خطوة`)}</small>
        <span class="fx-sub">${d.meters ? `${km(d.meters)} ${t('km', 'كم')}` : ''}${d.kcal ? ` · ${d.kcal} ${t('kcal', 'سعرة')}` : ''}${d.sleepMin ? ` · 🌙 ${hm(d.sleepMin)}` : ''}</span>
        ${wk ? `<span class="fx-sub">🏃 ${esc(wk)}</span>` : ''}</span>
      ${bars(days, 'steps', goal)}</button>`;
  $('#fx-open', card).onclick = fitSheet;
}
function fitSheet() {
  const f = fit(), days = f.data || [], goal = stepGoal();
  const avg = k => Math.round(days.reduce((n, d) => n + (d[k] || 0), 0) / Math.max(1, days.filter(d => d[k]).length));
  const d = document.createElement('dialog'); d.className = 'fx-sheet'; d.dir = AR() ? 'rtl' : 'ltr';
  d.innerHTML = `<div class="fx-sh-top"><b>${t('Your week', 'أسبوعك')}</b><button type="button" class="icon-btn" data-x>✕</button></div>
    <div class="fx-h">${t('Steps', 'الخطوات')} <small class="muted">${t(`average ${avg('steps').toLocaleString('en-GB')} a day`, `المعدل ${avg('steps').toLocaleString('ar-SA')} يوميًا`)}</small></div>${bars(days, 'steps', goal)}
    <div class="fx-h">${t('Sleep', 'النوم')} <small class="muted">${days.some(x => x.sleepMin) ? t(`average ${hm(avg('sleepMin'))} a night`, `المعدل ${hm(avg('sleepMin'))} كل ليلة`) : t('no sleep recorded (a watch or Samsung Health sleep tracking fills this)', 'لا نوم مسجّل (الساعة أو تتبّع النوم في Samsung Health يملؤه)')}</small></div>${bars(days, 'sleepMin', 480)}
    <label class="field" style="margin-top:12px"><span>${t('Daily step goal', 'هدف الخطوات اليومي')}</span><select id="fx-goal">${[4000, 6000, 8000, 10000, 12000].map(g => `<option value="${g}"${g === goal ? ' selected' : ''}>${g.toLocaleString(AR() ? 'ar-SA' : 'en-GB')}</option>`).join('')}</select></label>
    <p class="muted fine">${t('Read from Health Connect on this phone, only to show you. Nothing is sent anywhere.', 'تُقرأ من Health Connect في جوالك لعرضها لك فقط. لا يُرسل شيء إلى أي مكان.')}</p>`;
  document.body.appendChild(d); d.showModal();
  d.querySelector('[data-x]').onclick = () => d.close();
  d.addEventListener('close', () => d.remove());
  $('#fx-goal', d).onchange = e => { store.set('stepGoal', Number(e.target.value)); paintFitHome(); };
}
function paintFitCard() {
  const box = $('#ph-fit'); if (!box) return;
  const f = fit();
  box.innerHTML = f.on
    ? `<p class="muted fine">${t('✓ Connected. Your steps, sleep and workouts show on Today.', '✓ مربوط. خطواتك ونومك وتمارينك تظهر في «اليوم».')}</p>
       <div class="row-gap"><button type="button" class="ghost small" id="ph-fit-more">${t('Choose what to share', 'اختر ما تشاركه')}</button><button type="button" class="link" id="ph-fit-off">${t('Stop', 'أوقف')}</button></div>`
    : `<p class="muted fine">${t('Steps, distance, sleep and workouts from Samsung Health, Google Fit or your watch (through Android’s Health Connect). Read only, and only shown to you.', 'الخطوات والمسافة والنوم والتمارين من Samsung Health أو Google Fit أو ساعتك (عبر Health Connect في أندرويد). قراءة فقط، وتُعرض لك وحدك.')}</p>
       <button type="button" class="primary" id="ph-fit-on">${t('Connect my steps and sleep', 'اربط خطواتي ونومي')}</button><p class="muted fine" id="ph-fit-st"></p>`;
  const on = $('#ph-fit-on'); if (on) on.onclick = fitConnect;
  const more = $('#ph-fit-more'); if (more) more.onclick = fitConnect;
  const off = $('#ph-fit-off'); if (off) off.onclick = () => { store.set('fitness', { on: false }); paintFitCard(); paintFitHome(); };
}

/* ---------- 5. folders on the phone: new recordings → notes, new screenshots → My notes ---------- */
const FOLDERS = {
  rec: { start: 'Recordings/Voice Recorder', ic: '🎙', en: ['Recordings', 'new recording', 'new recordings', 'Make notes'], ar: ['التسجيلات', 'تسجيل جديد', 'تسجيلات جديدة', 'اصنع ملاحظات'], want: /^(audio|video)\// },
  shots: { start: 'DCIM/Screenshots', ic: '🖼', en: ['Screenshots', 'new screenshot', 'new screenshots', 'Save to My notes'], ar: ['لقطات الشاشة', 'لقطة جديدة', 'لقطات جديدة', 'احفظها في ملاحظاتي'], want: /^image\// },
};
const folders = () => store.get('phoneFolders', {});
const waiting = {};   // new files found in each folder, not yet handled
async function folderPick(k) {
  const r = await ask({ action: 'folderPick', start: FOLDERS[k].start }, 300000);
  if (!r.ok) return;
  const f = folders(); f[k] = { uri: r.uri, name: r.name, since: Date.now() - 2 * 864e5 }; store.set('phoneFolders', f);
  paintFolders(); await folderScan(true);
}
async function folderScan(force) {
  const f = folders();
  for (const k of Object.keys(FOLDERS)) {
    if (!f[k]?.uri) continue;
    const r = await ask({ action: 'folderList', uri: f[k].uri, since: f[k].since || 0 }, 20000);
    if (!r.ok) continue;
    waiting[k] = (r.files || []).filter(x => FOLDERS[k].want.test(x.mime || '')).sort((a, b) => a.modified - b.modified).slice(-20);
  }
  paintFolderCards(); void force;
}
async function folderTake(k) {
  const f = folders(), list = waiting[k] || []; if (!list.length) return;
  const files = [];
  for (const x of list) {
    const r = await ask({ action: 'folderFile', uri: f[k].uri, doc: x.doc, mime: x.mime }, 20000);
    if (!r.ok) continue;
    try { const b = await (await fetch(r.path, { cache: 'no-store' })).blob(); files.push(new File([b], x.name, { type: x.mime || b.type })); } catch {}
  }
  f[k].since = Math.max(...list.map(x => x.modified)); store.set('phoneFolders', f); waiting[k] = []; paintFolderCards();
  if (!files.length) return;
  if (k === 'rec') { J.show('new'); await window.JN.addFiles(files); }
  else {
    window.JundCal?.toast(t('Saving to My notes and reading the words…', 'تُحفظ في ملاحظاتي وتُقرأ كلماتها…'));
    for (const file of files) await window.JundKeep?.capture({ files: [file] });
    window.JundCal?.toast(t(`✓ ${files.length} saved in My notes`, `✓ حُفظت ${files.length} في ملاحظاتي`));
  }
}
function paintFolderCards() {
  const home = $('#screen-assistant'); if (!home) return;
  for (const k of Object.keys(FOLDERS)) {
    const n = (waiting[k] || []).length, F = FOLDERS[k], w = AR() ? F.ar : F.en;
    let card = $('#hm-fold-' + k);
    if (!n) { card?.remove(); continue; }
    if (!card) { card = document.createElement('div'); card.id = 'hm-fold-' + k; card.className = 'hm-sec'; ($('#hm-fit') || $('#hm-habits-wrap') || $('#hm-tiles'))?.before(card); }
    card.innerHTML = `<div class="fx-ask fold-ask"><span class="fx-ic">${F.ic}</span><span>${n} ${n === 1 ? w[1] : w[2]}</span><button type="button" class="primary small" data-go>${w[3]}</button><button type="button" class="icon-btn small" data-no aria-label="${t('Not now', 'ليس الآن')}">✕</button></div>`;
    card.querySelector('[data-go]').onclick = () => folderTake(k);
    card.querySelector('[data-no]').onclick = () => { const f = folders(); f[k].since = Math.max(...(waiting[k] || []).map(x => x.modified), f[k].since || 0); store.set('phoneFolders', f); waiting[k] = []; card.remove(); };
  }
}
function paintFolders() {
  const box = $('#ph-fold'); if (!box) return;
  const f = folders();
  box.innerHTML = `<p class="muted fine">${t('Choose a folder once. When something new appears there, Mustatar offers to make notes from it — no uploading one by one. On Samsung, recordings are in Recordings → Voice Recorder.', 'اختر المجلد مرة واحدة. وعندما يظهر فيه شيء جديد يعرض مستطر صنع ملاحظات منه — دون رفع كل ملف وحده. في سامسونج التسجيلات في Recordings ← Voice Recorder.')}</p>
    ${Object.entries(FOLDERS).map(([k, F]) => `<div class="ph-row"><span class="fx-ic">${F.ic}</span><span class="ph-t"><b>${AR() ? F.ar[0] : F.en[0]}</b><small dir="ltr">${esc(f[k]?.name || t('not chosen', 'لم يُختر'))}</small></span>
      <button type="button" class="ghost small" data-pick="${k}">${f[k] ? t('Change', 'غيّر') : t('Choose folder', 'اختر المجلد')}</button>${f[k] ? `<button type="button" class="link" data-off="${k}">${t('Stop', 'أوقف')}</button>` : ''}</div>`).join('')}
    <p class="muted fine">${t('Samsung’s own transcript: in Voice Recorder, open the recording → Transcript → Share → Mustatar.', 'تفريغ سامسونج نفسه: في المسجّل افتح التسجيل ← النص ← مشاركة ← مستطر.')}</p>`;
  box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => folderPick(b.dataset.pick));
  box.querySelectorAll('[data-off]').forEach(b => b.onclick = () => { const f2 = folders(); delete f2[b.dataset.off]; store.set('phoneFolders', f2); waiting[b.dataset.off] = []; paintFolders(); paintFolderCards(); });
}

/* ---------- the Settings card (Android app only) ---------- */
function settingsCard() {
  if (!APP() || $('#ph-card')) return;
  const anchor = $('#widget-connect')?.closest('.card'); if (!anchor) return;
  const c = document.createElement('div'); c.className = 'card'; c.id = 'ph-card'; c.setAttribute('data-noi18n', '');
  c.innerHTML = `<div class="card-h">${t('This phone', 'هذا الجوال')}</div>
    <label class="check"><input type="checkbox" id="ph-vibe"${store.get('prayerVibrate', true) ? ' checked' : ''}> ${t('At prayer times: a gentle vibration, no sound', 'عند أوقات الصلاة: اهتزاز خفيف، بلا صوت')}</label>
    <div class="ph-sec"><div class="card-h small">${t('Your phone’s calendars', 'تقاويم جوالك')}</div><div id="ph-cal"></div></div>
    <div class="ph-sec"><div class="card-h small">${t('Fitness: steps and sleep', 'اللياقة: الخطوات والنوم')}</div><div id="ph-fit"></div></div>
    <div class="ph-sec"><div class="card-h small">${t('Recordings and screenshots on this phone', 'التسجيلات ولقطات الشاشة في هذا الجوال')}</div><div id="ph-fold"></div></div>`;
  anchor.before(c);
  $('#ph-vibe').onchange = e => { store.set('prayerVibrate', e.target.checked); window.JundCal?.pushSync?.(); };
  paintCalCard(); paintFitCard(); paintFolders();
}

/* ---------- 6. a new version of the Android app: offered inside the app ----------
   The screens update by themselves (they come from the server). Only the app's own phone parts (widgets, mic,
   calendar, health…) need a new install: when one is published, Today shows "New version — Update". */
const REPO = 'mustatar-app/mustatar-app.github.io';
async function installed() {
  try { const r = await ask({ action: 'appInfo' }, 4000); if (r?.versionCode) return Number(r.versionCode); } catch {}
  // older apps cannot say their version: the one that knows the health tracker is version 55, older ones know neither
  try { const r = await ask({ action: 'healthStatus' }, 4000); if (r && 'status' in r) return 55; } catch {}
  return 0;
}
async function latest() {
  const c = store.get('apkLatest', null);
  if (c && Date.now() - c.at < 6 * 3600e3) return c;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { cache: 'no-store' });
  if (!r.ok) return c;
  const j = await r.json(), n = Number(String(j.tag_name || '').replace(/\D/g, ''));
  const asset = (j.assets || []).find(a => /\.apk$/i.test(a.name));
  const out = { n, url: asset?.browser_download_url || `https://github.com/${REPO}/releases/latest/download/Mustatar.apk`, at: Date.now() };
  store.set('apkLatest', out); return out;
}
let updateInfo = null;
async function checkUpdate() {
  if (!window.MustatarAndroid) return;
  try {
    const [have, l] = await Promise.all([installed(), latest()]);
    updateInfo = l && l.n > have ? { ...l, have } : null;
    paintUpdate();
  } catch {}
}
function paintUpdate(state) {
  const home = $('#screen-assistant'); if (!home) return;
  let card = $('#hm-update');
  const later = store.get('apkLater', {});
  if (!updateInfo || (later.n === updateInfo.n && Date.now() < later.until && !state)) { card?.remove(); return; }
  if (!card) { card = document.createElement('div'); card.id = 'hm-update'; card.className = 'hm-sec'; ($('#screen-assistant .hm-sec') || $('#hm-tiles'))?.before(card); }
  const msg = state === 'allow' ? t('Android asks once: allow Mustatar to install its updates, then come back.', 'يسألك أندرويد مرة واحدة: اسمح لمستطر بتثبيت تحديثاته، ثم ارجع.')
    : state === 'down' ? t('Downloading the new version (about 5 MB)…', 'يُنزَّل الإصدار الجديد (نحو ٥ ميغابايت)…')
    : state === 'fail' ? t('The download did not finish. Check the internet and try again.', 'لم يكتمل التنزيل. تأكد من الإنترنت وحاول مرة أخرى.')
    : state === 'browser' ? t('The download opened in your browser. When it finishes, tap it and choose “Update”. Your notes and settings stay.', 'فُتح التنزيل في المتصفح. عند انتهائه اضغط عليه واختر «تحديث». ملاحظاتك وإعداداتك تبقى.')
    : state === 'done' ? t('Tap “Update” on Android’s screen. Your notes and settings stay.', 'اضغط «تحديث» في شاشة أندرويد. ملاحظاتك وإعداداتك تبقى.')
    : t('A new version of the Mustatar app is ready. Your notes and settings stay.', 'إصدار جديد من تطبيق مستطر جاهز. ملاحظاتك وإعداداتك تبقى.');
  card.innerHTML = `<div class="fx-ask up-card"><span class="fx-ic">⬆️</span><span>${msg}</span>
    ${state === 'down' ? '' : `<button type="button" class="primary small" id="up-go">${state === 'fail' ? t('Try again', 'حاول مرة أخرى') : t('Update', 'حدّث')}</button>`}
    ${state ? '' : `<button type="button" class="icon-btn small" id="up-no" aria-label="${t('Later', 'لاحقًا')}">✕</button>`}</div>`;
  const go = $('#up-go', card); if (go) go.onclick = startUpdate;
  const no = $('#up-no', card); if (no) no.onclick = () => { store.set('apkLater', { n: updateInfo.n, until: Date.now() + 3 * 864e5 }); card.remove(); };
}
async function startUpdate() {
  if (!updateInfo) return;
  if (!updateInfo.have || updateInfo.have < 56) {   // apps from before this feature: the phone's browser downloads it
    const ok = await N()?.openBrowser?.(updateInfo.url).then(r => r?.ok).catch(() => false);
    if (!ok) location.href = updateInfo.url;
    paintUpdate('browser'); return;
  }
  paintUpdate('down');
  const r = await ask({ action: 'appUpdate', url: updateInfo.url }, 300000).catch(() => ({ ok: false }));
  paintUpdate(r.step === 'allow' ? 'allow' : r.ok ? 'done' : 'fail');
}
window.JundUpdate = { check: checkUpdate, downloading: () => paintUpdate('down'), done: ok => paintUpdate(ok ? 'done' : 'fail') };

/* ---------- when things run ---------- */
async function tick(force) {
  if (!APP()) return;
  try { await pushWidgets(force); } catch {}
  calRefresh(force);
  if (fit().on && !document.hidden) { await fitRead(false); paintFitHome(); }
  if (!document.hidden && Object.keys(folders()).length) folderScan();
}
if (window.MustatarAndroid) {
  setTimeout(() => { settingsCard(); paintFitHome(); tick(true); }, 2500);
  setTimeout(checkUpdate, 8000);
  setInterval(() => { if (!document.hidden) checkUpdate(); }, 6 * 3600e3);
  setInterval(() => { if (!document.hidden) tick(false); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(false); paintFitHome(); } });
  window.addEventListener('mustatar-screen', () => { settingsCard(); paintFitHome(); paintFolderCards(); });
}
window.JundPhone = { folderScan, folderTake, prayerAlarms, pushWidgets, widgetData, calRefresh, fitRead, paintFitHome, previewWidgets: () => N()?.ask?.({ action: 'widgetPreview' }, 30000) };
})();
