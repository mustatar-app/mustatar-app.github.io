// Mustatar's free AI engine: no Google, and nobody needs a key of their own.
//   Hearing:  Whisper on Groq first (8 free hours a day), then Whisper on Cloudflare.
//   Writing:  Gemma 4 on Cloudflare for notes and long work, gpt-oss on Groq for quick answers; each backs up the other.
//   Reading pages and photos: Gemma 4 on Cloudflare (it reads images), then Qwen on Groq for one or two pages.
// When every free source is full, the answer says how long to wait ("rate"), and the app waits in line and tries again.
// A small meter counts what each source used today, and a brake stops Cloudflare before its free daily allowance is used up.

let GROQ = 'https://api.groq.com/openai/v1';   // GROQ_BASE replaces it only in local tests

export const MODELS = {
  cfText: '@cf/google/gemma-4-26b-a4b-it',
  cfHear: '@cf/openai/whisper-large-v3-turbo',
  groqText: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],   // each has its own 8,000 tokens a minute
  groqVision: 'qwen/qwen3.8-27b',
  groqHear: ['whisper-large-v3', 'whisper-large-v3-turbo'],
};
export const GROQ_AUDIO_MAX = 25 * 1024 * 1024;   // the largest file Groq's free plan takes
const GROQ_TPM = 8000;                             // tokens a minute for each text model on Groq's free plan
const CF_OUT_MAX = 16000;                          // the longest answer Gemma 4 on Cloudflare writes
export const CF_FREE_NEURONS = 10000;              // Cloudflare's free AI allowance for each day
export const CF_DEFAULT_LIMIT = 9500;              // the brake: stop a little before it
export const NEURONS = { in: 9091 / 1e6, out: 27273 / 1e6, audioMin: 46.63 };   // Gemma 4 per token, Whisper per minute (Cloudflare's price list)

export const groqKey = env => String(env.GROQ_API_KEY || env.GROQ_FREE_API_KEY || '').trim();
export const ready = env => !!(env.AI || groqKey(env));
export const estTokens = s => Math.ceil(String(s || '').length / 3);
const today = () => new Date().toISOString().slice(0, 10);
const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
const secondsToTomorrow = () => { const d = new Date(); return Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d) / 1000); };
export function setBase(env) { if (env.GROQ_BASE) GROQ = env.GROQ_BASE; }

/* ---------- answers in the one small format the app reads ---------- */
export function modelResponse(h, model, text, finishReason) {
  const event = { candidates: [{ content: { parts: [{ text }] }, finishReason }] };
  return new Response(`data: ${JSON.stringify(event)}\n\n`, {
    headers: { ...h, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-model': model },
  });
}
const geminiEvent = (text, finishReason) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] })}\n\n`;
const finishOf = r => r === 'length' ? 'MAX_TOKENS' : r ? 'STOP' : '';

// A streamed answer goes straight through to the app, which reads this kind of stream itself (almost no work for the
// server). An older copy of the app, which does not say it can, gets each piece turned into the older format.
function passThrough(h, body, model, { direct, prefix = '', onEnd }) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  let bytes = 0, prev = null, last = null, buf = '';
  const convert = (text, ctl) => {
    buf += text;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.error) { ctl.enqueue(enc.encode(`data: ${JSON.stringify({ error: { code: 503, message: String(ev.error.message || ev.error).slice(0, 200) } })}\n\n`)); continue; }
      const c = ev.choices?.[0];
      const t = c?.delta?.content ?? ev.response ?? '';
      const f = finishOf(c?.finish_reason);
      if (t || f) ctl.enqueue(enc.encode(geminiEvent(t || '', f)));
    }
  };
  const stream = new TransformStream({
    start(ctl) {
      if (!prefix) return;
      ctl.enqueue(enc.encode(direct ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: prefix } }] })}\n\n` : geminiEvent(prefix)));
    },
    transform(chunk, ctl) {
      bytes += chunk.byteLength; prev = last; last = chunk;
      if (direct) ctl.enqueue(chunk); else convert(dec.decode(chunk, { stream: true }), ctl);
    },
    flush(ctl) {
      if (!direct) convert(dec.decode() + '\n', ctl);
      let usage = null;
      try {
        const tail = (prev ? dec.decode(prev) : '') + (last ? dec.decode(last) : '');
        const m = tail.match(/"usage"\s*:\s*(\{[^{}]*(\{[^{}]*\}[^{}]*)*\})/g);
        if (m) usage = JSON.parse(m[m.length - 1].replace(/^"usage"\s*:\s*/, ''));
      } catch {}
      try { onEnd?.({ bytes, usage }); } catch {}
    },
  });
  const out = body.pipeThrough(stream);
  return new Response(out, { headers: { ...h, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-model': model } });
}

/* ---------- the meter and the brake (kept in the accounts database, one small row per source per day) ---------- */
const accounts = env => env.ACCOUNTS ? env.ACCOUNTS.get(env.ACCOUNTS.idFromName('accounts')) : null;
let brakeCache = { at: 0, day: '', v: null };
export async function brakeState(env) {
  const d = today();
  if (brakeCache.v && brakeCache.day === d && Date.now() - brakeCache.at < 20000) return brakeCache.v;
  let v = { cfUsed: 0, cfLimit: Number(env.CF_DAILY_NEURONS) || CF_DEFAULT_LIMIT, paid: false };
  try {
    const a = accounts(env);
    if (a) {
      const r = await a.meterToday(d);
      v = { ...v, cfUsed: Number(r?.used?.['cf.neurons']) || 0 };
      if (r?.brake) {
        if (Number(r.brake.cfLimit) > 0) v.cfLimit = Number(r.brake.cfLimit);
        v.paid = r.brake.paid === true;
      }
    }
  } catch {}
  brakeCache = { at: Date.now(), day: d, v };
  return v;
}
export const resetBrakeCache = () => { brakeCache = { at: 0, day: '', v: null }; };
// free users (Basic) only ever use the free daily allowance, so they cost nothing; paying past it is allowed only when the
// owner has switched it on AND the request is from a paid plan (paid plans arrive with payments; until then nobody is)
const cfAllowed = (b, paidPlan = false) => (b.paid && paidPlan === true) || b.cfUsed < b.cfLimit;
export function meter(env, ctx, items) {
  const clean = Object.fromEntries(Object.entries(items).filter(([, n]) => Number.isFinite(n) && n > 0).map(([k, n]) => [k, Math.round(n * 1000) / 1000]));
  if (!Object.keys(clean).length) return;
  if (brakeCache.v && clean['cf.neurons']) brakeCache.v.cfUsed += clean['cf.neurons'];
  const a = accounts(env);
  if (!a) return;
  const p = Promise.resolve().then(() => a.meterAdd(today(), clean)).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(p);
}

/* ---------- reasons a source said no ---------- */
function waitFrom(r, text) {
  const h = Number(r?.headers?.get?.('retry-after'));
  if (h > 0) return h;
  const m = String(text || '').match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Math.ceil(Number(m[3] || 0))) : 0;
}
const dailyLimit = text => /per day|\(TPD\)|\(RPD\)|\(ASD\)|daily/i.test(String(text || ''));
export function cfProblem(e) {
  const m = String(e?.message || e || '');
  if (/3036|4006|daily free allocation|neurons/i.test(m)) return { status: 429, daily: true, msg: m.slice(0, 200) };
  if (/3040|capacity|3043|too many|rate/i.test(m)) return { status: 429, retryAfter: 20, msg: m.slice(0, 200) };
  if (/3007|3008|timeout|timed out/i.test(m)) return { status: 504, msg: m.slice(0, 200) };
  return { status: 502, msg: m.slice(0, 200) };
}
class Tally {
  constructor() { this.rate = 0; this.quota = false; this.last = 502; this.tried = []; this.fitChars = 0; }
  no(who, r) {
    this.tried.push(who + ':' + r.status);
    this.last = r.status || 502;
    if (r.status === 429) { if (r.daily) this.quota = true; else this.rate = Math.max(this.rate, r.retryAfter || 20); }
  }
  answer(h) {
    console.warn('AI sources said no', this.tried);
    if (this.rate) return json({ code: 'rate', retryAfter: Math.ceil(Math.min(this.rate, 900)), status: 429 }, 429, h);
    // Cloudflare's daily allowance is used up and the text is too long for Groq's free plan in one go:
    // ask for smaller parts (they fit Groq) instead of saying "come back tomorrow"
    if (this.quota && this.fitChars) return json({ code: 'smaller', maxChars: this.fitChars, status: 429 }, 429, h);
    if (this.quota) return json({ code: 'quota', retryAfter: secondsToTomorrow(), status: 429 }, 429, h);
    if (!this.tried.length) return json({ error: 'no AI source is set up', code: 'nokey' }, 500, h);
    return json({ code: 'ai_busy', status: this.last }, 502, h);
  }
}

/* ---------- hearing: one piece of sound → its words ---------- */
const EXT = {
  'audio/aac': 'aac', 'audio/aacp': 'aac', 'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/webm': 'webm',
  'video/webm': 'webm', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'video/mp4': 'mp4', 'video/quicktime': 'mp4', 'video/3gpp': 'mp4', 'audio/3gpp': 'mp4',
};
export const fileName = mime => 'audio.' + (EXT[mime] || 'mp3');
export const GROQ_REFUSES = /^audio\/(aac|aacp)$/;
const LANGS = { arabic: 'ar', english: 'en', urdu: 'ur', hindi: 'hi', french: 'fr', malay: 'ms', indonesian: 'id', turkish: 'tr', persian: 'fa', bengali: 'bn', spanish: 'es', german: 'de', swahili: 'sw', somali: 'so', hausa: 'ha', russian: 'ru', chinese: 'zh', tamil: 'ta', malayalam: 'ml', pashto: 'ps' };
export const langCode = l => { l = String(l || '').toLowerCase().trim(); return LANGS[l] || (/^[a-z]{2}$/.test(l) ? l : ''); };
// what Whisper sometimes writes over silence or music, when nobody said it
const JUNK = /(ترجمة نانسي قنقر|اشتركوا? في القناة|لا تنسوا? الاشتراك|شكرا(?:ً)? (?:لكم )?على المشاهدة|thanks? (?:you )?(?:so much )?for watching|subtitles? by|amara\.org|please subscribe)/i;

const ONLY_FILLER = /^[\s.!,،]*(thank you|thanks|you|bye|okay|شكرا|شكرًا|شكراً)[\s.!,،]*$/i;
export function tidyTranscript(segments, text, duration = 0) {
  const out = tidySegments(segments, text);
  return duration > 15 && ONLY_FILLER.test(out) ? '' : out;
}
function tidySegments(segments, text) {
  if (!Array.isArray(segments) || !segments.length) return JUNK.test(text || '') && String(text).length < 80 ? '' : String(text || '').trim();
  let out = '', lastEnd = null, lastText = '', repeats = 0;
  for (const s of segments) {
    const t = String(s.text || s.word || '').trim();
    if (!t) continue;
    if (Number(s.no_speech_prob) > 0.6 && Number(s.avg_logprob) < -1) continue;
    if (t.length < 80 && JUNK.test(t)) continue;
    if (t === lastText) { if (++repeats >= 2) continue; } else { repeats = 0; lastText = t; }  // a stuck loop: keep it once or twice
    const start = Number(s.start), gap = lastEnd != null && Number.isFinite(start) ? start - lastEnd : 0;
    out += out ? (gap > 2.5 ? '\n\n' : ' ') : '';
    out += t;
    if (Number.isFinite(Number(s.end))) lastEnd = Number(s.end);
  }
  return out.trim();
}

async function groqHear(env, model, audio, mime, language) {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mime }), fileName(mime));
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (language) form.append('language', language);
  let r;
  try {
    r = await fetch(GROQ + '/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + groqKey(env) }, body: form, signal: AbortSignal.timeout(180000) });
  } catch { return { ok: false, status: 504 }; }
  if (!r.ok) {
    const t = (await r.text().catch(() => '')).slice(0, 600);
    return { ok: false, status: r.status, retryAfter: waitFrom(r, t), daily: r.status === 429 && dailyLimit(t), msg: t };
  }
  const j = await r.json().catch(() => ({}));
  return { ok: true, text: tidyTranscript(j.segments, j.text, Number(j.duration) || 0), lang: langCode(j.language), duration: Number(j.duration) || 0, model };
}
async function cfHear(env, audio, mime, language) {
  try {
    const body = audio instanceof ReadableStream ? audio : new Blob([audio]).stream();
    const j = await env.AI.run(MODELS.cfHear, { audio: { body, contentType: mime }, vad_filter: true, ...(language ? { language } : {}) });
    return { ok: true, text: tidyTranscript(j?.segments, j?.text, Number(j?.transcription_info?.duration) || 0), lang: langCode(j?.transcription_info?.language), duration: Number(j?.transcription_info?.duration) || 0, model: MODELS.cfHear };
  } catch (e) { return { ok: false, ...cfProblem(e) }; }
}

// audio: an ArrayBuffer (any size), or a stream (only for pieces too big to keep in memory: Cloudflare alone, no second try).
// langs: the languages the person speaks. One language: Whisper is told it. Several: Whisper finds it, and if it finds a
// language the person does not speak (a quiet start can fool it), it hears the piece again in their first language.
export async function hear(env, ctx, { audio, mime, langs = [], fast = false, paidPlan = false }) {
  const tally = new Tally();
  const size = audio instanceof ReadableStream ? Infinity : audio.byteLength;
  const told = langs.length === 1 ? langs[0] : undefined;
  const settle = async (first, again) => {
    if (told || langs.length < 2 || !first.lang || langs.includes(first.lang)) return first;
    const second = await again(langs[0]);
    return second.ok ? second : first;
  };
  // Groq refuses raw AAC (the sound taken out of phone videos and M4A files) whatever its name: those go to Cloudflare
  if (groqKey(env) && size <= GROQ_AUDIO_MAX && !GROQ_REFUSES.test(mime)) {
    for (const model of fast ? [...MODELS.groqHear].reverse() : MODELS.groqHear) {
      const r = await groqHear(env, model, audio, mime, told);
      if (r.ok) {
        const best = await settle(r, l => groqHear(env, model, audio, mime, l));
        meter(env, ctx, { 'groq.audio_sec': Math.max(10, best.duration) * (best === r ? 1 : 2), 'hear.groq': 1 });
        return best;
      }
      tally.no('groq:' + model, r);
      if (r.status === 400 || r.status === 413 || r.status === 401) break;   // the file or the key: no use asking the other Groq model
    }
  }
  if (env.AI) {
    const b = await brakeState(env);
    if (!cfAllowed(b, paidPlan)) tally.no('cf:brake', { status: 429, daily: true });
    else {
      const r = await cfHear(env, audio, mime, told);
      if (r.ok) {
        const best = size === Infinity ? r : await settle(r, l => cfHear(env, audio, mime, l));
        const minutes = Math.max(r.duration, 1) / 60 * (best === r ? 1 : 2);
        meter(env, ctx, { 'cf.neurons': minutes * NEURONS.audioMin, 'cf.audio_sec': minutes * 60, 'hear.cf': 1 });
        return best;
      }
      tally.no('cf', r);
    }
  }
  return { ok: false, fail: h => tally.answer(h) };
}

/* ---------- writing and reading: words (and page photos) → an answer ---------- */
function chatMessages(system, user, images) {
  const content = images?.length
    ? [{ type: 'text', text: user }, ...images.flatMap(im => [...(im.label ? [{ type: 'text', text: im.label }] : []), { type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } }])]
    : user;
  return [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }];
}
const textOf = j => { const c = j?.choices?.[0]; return { text: c?.message?.content ?? j?.response ?? '', finish: finishOf(c?.finish_reason || (j?.response != null ? 'stop' : '')) }; };

// prefer: 'cf' for notes, long text and pages; 'groq' for the assistant and voice, which must answer fast.
// formatResult: when set, the whole answer is checked first (for page reading) and a bad one counts as a failure.
export async function talk(env, ctx, h, { system = '', user = '', images = [], json: wantJson = false, maxTokens = 8000, prefer = 'cf', stream = true, formatResult, direct = false, prefix = '', think = false, paidPlan = false }) {
  const tally = new Tally();
  const inTok = estTokens(system) + estTokens(user) + images.length * 1100;
  const streaming = stream && !formatResult;
  const order = prefer === 'groq' ? ['groq', 'cf'] : ['cf', 'groq'];
  for (const source of order) {
    if (source === 'cf' && env.AI) {
      const b = await brakeState(env);
      if (!cfAllowed(b, paidPlan)) { tally.no('cf:brake', { status: 429, daily: true }); continue; }
      const out = Math.max(256, Math.min(Number(maxTokens) || 8000, CF_OUT_MAX));
      const input = {
        messages: chatMessages(system, user, images), max_tokens: out, temperature: formatResult ? 0 : 0.3,
        chat_template_kwargs: { enable_thinking: !!think },
        ...(wantJson ? { response_format: { type: 'json_object' } } : {}),
      };
      try {
        if (streaming) {
          const body = await env.AI.run(MODELS.cfText, { ...input, stream: true });
          return passThrough(h, body, MODELS.cfText, { direct, prefix, onEnd: ({ bytes, usage }) => {
            const outTok = Math.max(Number(usage?.completion_tokens) || 0, Math.round(bytes / 300));
            meter(env, ctx, { 'cf.neurons': inTok * NEURONS.in + outTok * NEURONS.out, 'write.cf': 1 });
          } });
        }
        const j = await env.AI.run(MODELS.cfText, input);
        const { text, finish } = textOf(j);
        const outTok = Number(j?.usage?.completion_tokens) || estTokens(text);
        meter(env, ctx, { 'cf.neurons': Number(j?.usage?.neurons) || inTok * NEURONS.in + outTok * NEURONS.out, 'write.cf': 1 });
        if (formatResult) {
          const ok = finish === 'STOP' && formatResult(text);
          if (ok) return modelResponse(h, MODELS.cfText, ok, 'STOP');
          tally.no('cf:format', { status: 502 });
          continue;
        }
        return modelResponse(h, MODELS.cfText, prefix + text, finish || 'STOP');
      } catch (e) { tally.no('cf', cfProblem(e)); continue; }
    }
    if (source === 'groq' && groqKey(env)) {
      const models = images.length ? (images.length <= 2 ? [MODELS.groqVision] : []) : MODELS.groqText;
      const room = GROQ_TPM - inTok - 300;
      if (!models.length || room < 500) {
        tally.tried.push('groq:too-big');
        // the longest text (in characters) that leaves Groq room to write about as much as it reads
        if (models.length) tally.fitChars = Math.max(1500, Math.floor((GROQ_TPM - 300 - estTokens(system)) / 2) * 3);
        continue;
      }
      const out = Math.min(Number(maxTokens) || 8000, room, images.length ? 3400 : 7000);
      for (const model of models) {
        const body = {
          model, messages: chatMessages(system, user, images), max_completion_tokens: out, temperature: formatResult ? 0 : 0.3, stream: streaming,
          ...(streaming ? { stream_options: { include_usage: true } } : {}),
          ...(wantJson ? { response_format: { type: 'json_object' } } : {}),
          ...(/gpt-oss/.test(model) ? { reasoning_effort: think ? 'medium' : 'low', include_reasoning: false } : { reasoning_effort: 'none' }),
        };
        let r;
        try {
          r = await fetch(GROQ + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + groqKey(env) }, body: JSON.stringify(body), signal: AbortSignal.timeout(streaming ? 30000 : 90000) });
        } catch { tally.no('groq:' + model, { status: 504 }); continue; }
        if (!r.ok) {
          const t = (await r.text().catch(() => '')).slice(0, 600);
          tally.no('groq:' + model, { status: r.status, retryAfter: waitFrom(r, t), daily: r.status === 429 && dailyLimit(t) });
          if (r.status === 401) break;
          continue;
        }
        if (streaming) return passThrough(h, r.body, model, { direct, prefix, onEnd: ({ bytes, usage }) => {
          meter(env, ctx, { 'groq.tokens': Number(usage?.total_tokens) || inTok + Math.round(bytes / 120), 'write.groq': 1 });
        } });
        const j = await r.json().catch(() => ({}));
        const { text, finish } = textOf(j);
        meter(env, ctx, { 'groq.tokens': Number(j?.usage?.total_tokens) || inTok + estTokens(text), 'write.groq': 1 });
        if (formatResult) {
          const ok = finish === 'STOP' && formatResult(text);
          if (ok) return modelResponse(h, model, ok, 'STOP');
          tally.no('groq:format', { status: 502 });
          continue;
        }
        return modelResponse(h, model, prefix + text, finish || 'STOP');
      }
    }
  }
  return tally.answer(h);
}

/* ---------- a PDF's own text (free on Cloudflare; a scanned PDF has none) ---------- */
export async function pdfText(env, blob, name = 'file.pdf') {
  if (!env.AI?.toMarkdown) return '';
  try {
    const r = await env.AI.toMarkdown([{ name, blob }]);
    const one = Array.isArray(r) ? r[0] : r;
    return one?.format === 'error' ? '' : String(one?.data || '').trim();
  } catch { return ''; }
}

/* ---------- the owner's view: what each source used, by day ---------- */
export async function meterReport(env, days = 14) {
  const a = accounts(env);
  const r = a ? await a.meterRead(days) : { rows: [], brake: null };
  return {
    rows: r.rows || [], brake: { cfLimit: Number(r.brake?.cfLimit) || Number(env.CF_DAILY_NEURONS) || CF_DEFAULT_LIMIT, paid: r.brake?.paid === true },
    free: { cfNeurons: CF_FREE_NEURONS, groqAudioSec: 28800, groqTokens: 200000 },
    sources: { cloudflare: !!env.AI, groq: !!groqKey(env) },
  };
}
export async function setBrake(env, brake) {
  const a = accounts(env);
  if (!a) return null;
  const v = { cfLimit: Math.max(0, Math.min(1e7, Math.round(Number(brake?.cfLimit) || CF_DEFAULT_LIMIT))), paid: brake?.paid === true };
  await a.setBrake(v);
  resetBrakeCache();
  return v;
}
