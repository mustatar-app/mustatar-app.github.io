// The free AI engine (server/engine.js) with pretend Groq and Cloudflare: does it pick the right source,
// fall back when one is full, wait in line when all are full, keep the meter, and tidy what Whisper hears?
// Run: node tests/engine_test.mjs
import * as AI from '../server/engine.js';

let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };
const enc = new TextEncoder();
const sse = events => new ReadableStream({ start(c) { for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } });
const delta = (content, finish_reason = null) => ({ choices: [{ index: 0, delta: { content }, finish_reason }] });

// ---- pretend services ----
let groq = {}, groqCalls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('http://groq.test/audio/transcriptions')) {
    const form = init.body;
    const call = { kind: 'hear', model: form.get('model'), language: form.get('language'), name: form.get('file')?.name };
    groqCalls.push(call);
    return groq.hear(call);
  }
  if (url.startsWith('http://groq.test/chat/completions')) {
    const body = JSON.parse(init.body);
    groqCalls.push({ kind: 'chat', ...body });
    return groq.chat(body);
  }
  throw new Error('unexpected fetch ' + url);
};
const meterRows = {};
let brake = null;
const accounts = {
  meterAdd: async (day, items) => { for (const [k, n] of Object.entries(items)) meterRows[k] = (meterRows[k] || 0) + n; },
  meterToday: async () => ({ used: { ...meterRows }, brake }),
  meterRead: async () => ({ rows: Object.entries(meterRows).map(([k, n]) => ({ day: 'today', k, n })), brake }),
  setBrake: async v => { brake = v; },
};
let cf = {}, cfCalls = [];
const env = {
  GROQ_API_KEY: 'gsk_test', GROQ_BASE: 'http://groq.test',
  ACCOUNTS: { idFromName: () => 'id', get: () => accounts },
  AI: { run: async (model, input) => { cfCalls.push({ model, input }); return cf.run(model, input); } },
};
const waits = [];
const ctx = { waitUntil: p => waits.push(p) };
const settle = async () => { await Promise.all(waits.splice(0)); };
const h = { 'access-control-allow-origin': '*' };
const reset = () => { groqCalls = []; cfCalls = []; for (const k in meterRows) delete meterRows[k]; brake = null; AI.resetBrakeCache(); };
const readAll = async r => new TextDecoder().decode(await r.arrayBuffer());
const geminiText = body => body.split('\n').filter(l => l.startsWith('data:')).map(l => { try { return JSON.parse(l.slice(5)); } catch { return null; } })
  .filter(Boolean).map(e => (e.candidates?.[0]?.content?.parts || []).map(p => p.text).join('')).join('');
AI.setBase(env);
const okJson = obj => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
const fail = (status, message, headers = {}) => new Response(JSON.stringify({ error: { message } }), { status, headers });
const audio = new Uint8Array(2000).buffer;

// 1. Groq hears it; junk over silence is dropped; a long pause starts a new paragraph
reset();
groq.hear = () => okJson({ text: 'x', language: 'arabic', duration: 64, segments: [
  { start: 0, end: 5, text: ' السلام عليكم', no_speech_prob: 0.01, avg_logprob: -0.2 },
  { start: 5, end: 9, text: ' درس اليوم', no_speech_prob: 0.02, avg_logprob: -0.3 },
  { start: 14, end: 18, text: ' الباب الأول', no_speech_prob: 0.02, avg_logprob: -0.3 },
  { start: 40, end: 44, text: ' ترجمة نانسي قنقر', no_speech_prob: 0.9, avg_logprob: -1.4 },
] });
let r = await AI.hear(env, ctx, { audio, mime: 'audio/mpeg', langs: ['ar'] });
await settle();
check(r.ok && r.text === 'السلام عليكم درس اليوم\n\nالباب الأول', 'Groq hears; the made-up line over silence is dropped; a long pause starts a new paragraph');
check(groqCalls[0].model === 'whisper-large-v3' && groqCalls[0].language === 'ar' && groqCalls[0].name === 'audio.mp3', 'the best Whisper first, told the one language, with the right file name');
check(meterRows['groq.audio_sec'] === 64 && !cfCalls.length, 'the meter counts Groq seconds, and Cloudflare is not used');

// 2. Groq is full this hour (both Whisper models) → Cloudflare hears it
reset();
groq.hear = () => fail(429, 'Rate limit reached for model in organization on seconds of audio per hour (ASH): Limit 7200. Please try again in 2m10s.');
cf.run = () => ({ text: 'Good morning', transcription_info: { language: 'en', duration: 120 }, segments: [{ start: 0, end: 2, text: 'Good morning' }] });
r = await AI.hear(env, ctx, { audio, mime: 'audio/mpeg', langs: ['en', 'ar'] });
await settle();
check(r.ok && r.text === 'Good morning' && r.model === AI.MODELS.cfHear, 'Groq full → Cloudflare Whisper hears it');
check(groqCalls.length === 2 && cfCalls[0].input.audio.contentType === 'audio/mpeg', 'both Groq models were tried, then Cloudflare with the sound streamed');
groqCalls = []; cfCalls = [];
r = await AI.hear(env, ctx, { audio, mime: 'audio/aac', langs: ['en', 'ar'] });
check(r.ok && !groqCalls.length && cfCalls.length === 1, 'raw AAC (from phone videos and M4A) goes straight to Cloudflare, which reads it (Groq refuses it)');
check(AI.tidyTranscript([{ start: 0, end: 2, text: ' Thank you.' }], '', 20) === '' && AI.tidyTranscript([{ start: 0, end: 2, text: ' Thank you.' }], '', 3) === 'Thank you.', 'a long silent piece heard as only "Thank you." becomes empty; a short real one stays');
check(Math.abs(meterRows['cf.neurons'] - 4 * AI.NEURONS.audioMin) < 0.01, 'the meter counts Cloudflare units by minutes of sound');

// 3. A piece too big for Groq goes straight to Cloudflare
reset();
groq.hear = () => { throw new Error('should not be called'); };
r = await AI.hear(env, ctx, { audio: new Blob([new Uint8Array(10)]).stream(), mime: 'audio/webm', langs: [] });
check(r.ok && !groqCalls.length && cfCalls.length === 1, 'a piece over 25 MB skips Groq and goes to Cloudflare');

// 4. Everything is full right now → "wait in line", with how long
reset();
groq.hear = () => fail(429, 'Please try again in 45s', { 'retry-after': '45' });
cf.run = () => { throw new Error('3040: Capacity temporarily exceeded, please try again'); };
r = await AI.hear(env, ctx, { audio, mime: 'audio/mpeg', langs: ['ar'] });
let resp = r.fail(h), body = await resp.json();
check(!r.ok && resp.status === 429 && body.code === 'rate' && body.retryAfter === 45, 'all full now → 429 "rate" with the wait, so the app waits in line');

// 5. The day's free allowance is used up everywhere → "quota" (the app keeps the recording for tomorrow)
reset();
groq.hear = () => fail(429, 'Rate limit reached on seconds of audio per day (ASD): Limit 28800');
brake = { cfLimit: 100, paid: false }; meterRows['cf.neurons'] = 150;
r = await AI.hear(env, ctx, { audio, mime: 'audio/mpeg', langs: ['ar'] });
resp = r.fail(h); body = await resp.json();
check(body.code === 'quota' && !cfCalls.length, 'Groq used up for the day and the Cloudflare brake reached → "quota", and Cloudflare is not called');

// 6. Whisper guessed a language the person does not speak → heard again in their first language
reset();
let n = 0;
groq.hear = call => okJson(++n === 1 ? { text: 'Assalamualaikum', language: 'indonesian', duration: 10 } : { text: 'السلام عليكم', language: 'arabic', duration: 10 });
r = await AI.hear(env, ctx, { audio, mime: 'audio/mpeg', langs: ['ar', 'en'] });
check(r.text === 'السلام عليكم' && groqCalls[1].language === 'ar' && !groqCalls[0].language, 'a wrong language guess is heard again in Arabic');

// 7. Notes: Cloudflare Gemma streams straight through to a new app
reset();
cf.run = (model, input) => input.stream ? sse([delta('## Summary'), delta(' text'), { ...delta('', 'stop'), usage: { completion_tokens: 3 } }]) : null;
resp = await AI.talk(env, ctx, h, { system: 'S', user: 'a lecture', direct: true });
let text = await readAll(resp); await settle();
check(resp.headers.get('x-model') === AI.MODELS.cfText && text.includes('"content":"## Summary"') && text.includes('[DONE]'), 'notes stream straight through from Gemma on Cloudflare');
check(cfCalls[0].input.chat_template_kwargs.enable_thinking === false && cfCalls[0].input.max_tokens <= 16000, 'Gemma is asked not to think aloud, within its answer limit');
check(meterRows['cf.neurons'] > 0 && meterRows['write.cf'] === 1, 'the meter counts the note');

// 8. An older app copy gets the older format
reset();
resp = await AI.talk(env, ctx, h, { system: 'S', user: 'a lecture', direct: false });
text = await readAll(resp);
check(geminiText(text) === '## Summary text' && text.includes('"finishReason":"STOP"'), 'an older app copy gets the same answer in the older format, finished');

// 9. Cloudflare is busy → Groq writes it, quickly, without long thinking
reset();
cf.run = () => { throw new Error('3040: Capacity temporarily exceeded'); };
groq.chat = b => new Response(sse([delta('مرحبا'), { ...delta('', 'stop') }, { choices: [], usage: { total_tokens: 50 } }]), { headers: { 'content-type': 'text/event-stream' } });
resp = await AI.talk(env, ctx, h, { system: 'S', user: 'short question', direct: true });
text = await readAll(resp); await settle();
const chat = groqCalls.find(c => c.kind === 'chat');
check(chat?.model === 'openai/gpt-oss-120b' && chat.reasoning_effort === 'low' && text.includes('مرحبا'), 'Cloudflare busy → gpt-oss on Groq answers');
check(meterRows['groq.tokens'] === 50, 'the meter takes Groq’s own token count from the end of the stream');

// 10. The assistant asks Groq first
reset();
cf.run = () => { throw new Error('should not be called'); };
resp = await AI.talk(env, ctx, h, { system: 'S', user: 'hi', prefer: 'groq', direct: true });
check(resp.ok && !cfCalls.length && groqCalls.length === 1, 'the assistant goes to Groq first');

// 11. A long lecture is too big for Groq's free plan, and Cloudflare's brake is reached → "smaller" (the app cuts it to Groq's size)
reset();
brake = { cfLimit: 10, paid: false }; meterRows['cf.neurons'] = 20;
resp = await AI.talk(env, ctx, h, { system: 'S', user: 'x'.repeat(60000) });
body = await resp.json();
check(resp.status === 429 && body.code === 'smaller' && body.maxChars >= 1500 && body.maxChars < 12000 && !groqCalls.length, `a long lecture with Cloudflare used up and too big for Groq → "smaller" (${body.maxChars} characters a part), nothing sent`);
resp = await AI.talk(env, ctx, h, { system: 'S', user: 'x'.repeat(body.maxChars) });
check(resp.ok && groqCalls.length === 1, 'a part of that size is then written by Groq');

// 12. Owner allows paying past the free allowance → the brake lets Cloudflare go on
reset();
brake = { cfLimit: 10, paid: true }; meterRows['cf.neurons'] = 20;
cf.run = (m, input) => input.stream ? sse([delta('ok', 'stop')]) : null;
resp = await AI.talk(env, ctx, h, { system: 'S', user: 'x'.repeat(60000), direct: true });
check(resp.ok && cfCalls.length === 1, 'with paid use switched on, the brake lets Cloudflare go on');

// 13. Page reading: a bad answer from Gemma counts as a failure, Qwen on Groq reads two pages instead
reset();
cf.run = () => ({ choices: [{ message: { content: 'not json' }, finish_reason: 'stop' }], usage: { neurons: 3 } });
groq.chat = b => okJson({ choices: [{ message: { content: '{"pages":[{"page":1,"text":"a"},{"page":2,"text":"b"}]}' }, finish_reason: 'stop' }], usage: { total_tokens: 900 } });
const pages = [{ label: 'PDF page 1', mime: 'image/jpeg', data: 'AAA' }, { label: 'PDF page 2', mime: 'image/jpeg', data: 'BBB' }];
const formatResult = t => { try { return JSON.parse(t).pages.length === 2 ? t : null; } catch { return null; } };
resp = await AI.talk(env, ctx, h, { system: 'S', user: 'Read', images: pages, json: true, formatResult });
text = await readAll(resp);
const vision = groqCalls.find(c => c.kind === 'chat');
check(geminiText(text).includes('"page":2') && vision?.model === AI.MODELS.groqVision && vision.messages[1].content.some(p => p.type === 'image_url'), 'a bad page reading → Qwen on Groq reads the two page photos');

// 14. Whisper stuck in a loop: the repeated line is kept at most twice
const looped = AI.tidyTranscript([1, 2, 3, 4, 5].map(i => ({ start: i, end: i + 1, text: 'نعم' })), '');
check(looped === 'نعم نعم', 'a stuck loop of the same line is cut down');
check(AI.fileName('audio/aac') === 'audio.aac' && AI.fileName('video/webm') === 'audio.webm' && AI.langCode('Arabic') === 'ar', 'file names and language names');

// 15. Nothing set up at all → "nokey"
const bare = { ACCOUNTS: env.ACCOUNTS };
resp = await AI.talk(bare, ctx, h, { user: 'x' });
check((await resp.json()).code === 'nokey' && !AI.ready(bare), 'no AI source at all → "nokey"');

console.log(failed ? `\n${failed} check(s) failed` : '\nAll engine checks passed');
process.exit(failed ? 1 : 0);
