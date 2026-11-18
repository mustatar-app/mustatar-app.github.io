// Audio and video files → small audio pieces the server can transcribe.
// Long recordings are cut into pieces of about 2 minutes, at a quiet moment (between words).
// Measured on real Arabic speech (tests/benchmark.py): sent whole, a 5-minute recording lost
// 5 of 26 sentences (Whisper skips parts of long audio); cut into 2-minute pieces, none were lost.
// Nothing here uses the internet; it all runs on the phone.
(() => {
'use strict';

const PIECE_SEC = 120;                  // about 2 minutes of speech per piece (Whisper skips less)
const WHOLE_SEC = 150;                  // recordings up to 2½ minutes are sent whole
const WHOLE_MAX = 18 * 1024 * 1024;     // smaller files are sent as they are
const HARD_MAX = 95 * 1024 * 1024;      // the server accepts up to this per piece
const FAST_MAX = 23 * 1024 * 1024;      // pieces up to this go to the fastest free hearing service (Groq takes 25 MB)
const READ_STEP = 8 * 1024 * 1024;      // read big files 8 MB at a time

const ext = f => ((f.name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

// what kind of file is it?
function kindOf(f) {
  const e = ext(f), t = (f.type || '').toLowerCase();
  if (['mp4', 'm4a', 'm4v', 'mov', '3gp', '3g2'].includes(e) || /^(video|audio)\/(mp4|x-m4a|m4a|quicktime|3gpp)/.test(t)) return 'mp4';
  if (e === 'mp3' || /audio\/(mpeg|mp3)/.test(t)) return 'mp3';
  if (e === 'aac' || t === 'audio/aac') return 'aac';
  if (e === 'wav' || /audio\/(wav|x-wav|wave)/.test(t)) return 'wav';
  if (['ogg', 'oga', 'opus'].includes(e) || /audio\/(ogg|opus)/.test(t)) return 'ogg';
  if (e === 'flac' || t === 'audio/flac') return 'flac';
  if (e === 'webm' || /\/webm/.test(t)) return t.startsWith('audio') ? 'webm-audio' : 'webm';
  if (['mkv', 'avi', 'wmv', 'flv', 'amr'].includes(e)) return 'other';
  if (t.startsWith('audio/') || t.startsWith('video/')) return 'other';
  return null;
}
const isMedia = f => kindOf(f) !== null;
const MIME = { mp3: 'audio/mp3', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', 'webm-audio': 'audio/webm', webm: 'video/webm' };

const tooBig = () => Object.assign(new Error('هذا الملف كبير جدًا بهذا النوع. حوّله إلى MP3 في تطبيق إدارة الملفات، ثم أرسله.'), { code: 'media' });
const cannot = () => Object.assign(new Error('لا أستطيع قراءة الصوت من هذا الملف. حوّله إلى MP3 في تطبيق إدارة الملفات، ثم أرسله.'), { code: 'media' });

/* ---------- MP4 / M4A / MOV: take the AAC sound out, without re-encoding ---------- */
const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

async function topBoxes(file) {
  const boxes = [];
  let off = 0;
  while (off + 8 <= file.size && boxes.length < 2000) {
    const dv = new DataView(await file.slice(off, off + 16).arrayBuffer());
    let len = dv.getUint32(0), hdr = 8;
    const type = String.fromCharCode(dv.getUint8(4), dv.getUint8(5), dv.getUint8(6), dv.getUint8(7));
    if (len === 1 && dv.byteLength >= 16) { len = Number(dv.getBigUint64(8)); hdr = 16; }
    else if (len === 0) len = file.size - off;
    if (len < hdr) break;
    boxes.push({ type, off, len });
    off += len;
  }
  return boxes;
}

// AudioSpecificConfig → the three numbers an ADTS header needs
function ascInfo(bytes, track) {
  let aot = 2, fi = -1, ch = track?.audio?.channel_count || 1;
  if (bytes && bytes.length >= 2) {
    aot = bytes[0] >> 3;
    fi = ((bytes[0] & 7) << 1) | (bytes[1] >> 7);
    ch = (bytes[1] >> 3) & 15;
    if (aot === 5 || aot === 29) aot = 2; // HE-AAC: the core is plain AAC-LC; players add the rest themselves
  }
  if (fi < 0 || fi > 12) fi = RATES.indexOf(track?.audio?.sample_rate);
  if (fi < 0) fi = 4;
  if (!ch || ch > 7) ch = track?.audio?.channel_count || 1;
  return { profile: Math.max(0, Math.min(3, aot - 1)), fi, ch };
}
function adtsHeader(len, { profile, fi, ch }) {
  const n = len + 7, h = new Uint8Array(7);
  h[0] = 0xFF; h[1] = 0xF1;
  h[2] = (profile << 6) | (fi << 2) | (ch >> 2);
  h[3] = ((ch & 3) << 6) | (n >> 11);
  h[4] = (n >> 3) & 0xFF;
  h[5] = ((n & 7) << 5) | 0x1F;
  h[6] = 0xFC;
  return h;
}

// AAC frames → a small M4A file (the same sound, in the box that phones and Groq's Whisper accept).
// Groq refuses raw AAC, so without this, sound from phone videos and M4A files could only go to Cloudflare.
function m4a(frames, asc, rate, channels) {
  const enc = new TextEncoder();
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const u16 = n => [(n >> 8) & 255, n & 255];
  const box = (type, ...parts) => {
    const body = parts.flat(Infinity);
    return [...u32(8 + body.length), ...enc.encode(type), ...body];
  };
  const full = (type, v, flags, ...parts) => box(type, v, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255, ...parts);
  const n = frames.length, dur = n * 1024;
  const matrix = [...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
  const desc = (tag, body) => [tag, body.length, ...body];
  const esds = full('esds', 0, 0, desc(3, [...u16(1), 0,
    ...desc(4, [0x40, 0x15, 0, 0, 0, ...u32(0), ...u32(0), ...desc(5, [...asc])]),
    ...desc(6, [2])]));
  const mp4a = box('mp4a', 0, 0, 0, 0, 0, 0, ...u16(1), ...u32(0), ...u32(0), ...u16(channels), ...u16(16), ...u16(0), ...u16(0), ...u32((rate & 0xFFFF) << 16 >>> 0), esds);
  const sizes = frames.map(f => u32(f.length));
  const moov = offset => box('moov',
    full('mvhd', 0, 0, ...u32(0), ...u32(0), ...u32(rate), ...u32(dur), ...u32(0x10000), ...u16(0x100), ...u16(0), ...u32(0), ...u32(0), ...matrix, ...new Array(24).fill(0), ...u32(2)),
    box('trak',
      full('tkhd', 0, 7, ...u32(0), ...u32(0), ...u32(1), ...u32(0), ...u32(dur), ...u32(0), ...u32(0), ...u16(0), ...u16(0), ...u16(0x100), ...u16(0), ...matrix, ...u32(0), ...u32(0)),
      box('mdia',
        full('mdhd', 0, 0, ...u32(0), ...u32(0), ...u32(rate), ...u32(dur), ...u16(0x55C4), ...u16(0)),
        full('hdlr', 0, 0, ...u32(0), ...enc.encode('soun'), ...u32(0), ...u32(0), ...u32(0), ...enc.encode('Sound'), 0),
        box('minf',
          full('smhd', 0, 0, ...u16(0), ...u16(0)),
          box('dinf', full('dref', 0, 0, ...u32(1), full('url ', 0, 1))),
          box('stbl',
            full('stsd', 0, 0, ...u32(1), mp4a),
            full('stts', 0, 0, ...u32(1), ...u32(n), ...u32(1024)),
            full('stsc', 0, 0, ...u32(1), ...u32(1), ...u32(n), ...u32(1)),
            full('stsz', 0, 0, ...u32(0), ...u32(n), ...sizes),
            full('stco', 0, 0, ...u32(1), ...u32(offset)))))));
  const ftyp = box('ftyp', ...enc.encode('M4A '), ...u32(0), ...enc.encode('M4A isommp42'));
  const total = frames.reduce((t, f) => t + f.length, 0);
  const head = moov(0).length;
  const mv = new Uint8Array(moov(ftyp.length + head + 8));
  return new Blob([new Uint8Array(ftyp), mv, new Uint8Array([...u32(8 + total), ...enc.encode('mdat')]), ...frames], { type: 'audio/mp4' });
}
const ascFrom = ({ profile, fi, ch }) => [((profile + 1) << 3) | (fi >> 1), ((fi & 1) << 7) | (ch << 3)];

async function fromMp4(file, onStatus, signal) {
  if (!window.MP4Box) throw cannot();
  const boxes = await topBoxes(file);
  const moov = boxes.find(b => b.type === 'moov');
  if (!moov) throw cannot();
  const mp4 = window.MP4Box.createFile();
  let info = null;
  mp4.onReady = i => { info = i; };
  mp4.onError = () => {};
  // feed only the description boxes, joined end to end; the sample positions
  // inside them still point at the real places in the file, so mdat is never loaded
  const head = boxes.filter(x => x.type === 'ftyp' || x.type === 'moov');
  const buf = await new Blob(head.map(b => file.slice(b.off, b.off + b.len))).arrayBuffer();
  buf.fileStart = 0;
  mp4.appendBuffer(buf);
  mp4.flush();
  const track = info?.audioTracks?.[0];
  if (!track) throw Object.assign(new Error('لا يوجد صوت في هذا الملف.'), { code: 'media' });
  const trak = mp4.getTrackById(track.id);
  const samples = trak?.samples || [];
  const isAac = /^mp4a\.40/.test(track.codec || '') || (track.codec === 'mp4a' && samples.length);
  if (!samples.length || !isAac) return null; // fragmented or not AAC: the caller sends the file whole
  const esd = trak.mdia?.minf?.stbl?.stsd?.entries?.[0]?.esds?.esd;
  const dsi = esd?.descs?.[0]?.descs?.[0]?.data;
  const cfg = ascInfo(dsi ? new Uint8Array(dsi) : null, track);

  const list = samples.map(s => ({ off: s.offset, size: s.size, t: s.cts / s.timescale })).sort((a, b) => a.off - b.off);
  const asc = dsi && dsi.byteLength >= 2 ? new Uint8Array(dsi) : ascFrom(cfg);
  const rate = RATES[cfg.fi] || track.audio?.sample_rate || 44100;
  const pieces = [], whole = [];
  let frames = [], pieceStart = 0, bytes = 0;
  const close = (endT) => {
    if (frames.length) pieces.push({ blob: m4a(frames, asc, rate, cfg.ch), mime: 'audio/mp4', start: pieceStart, end: endT });
    frames = []; bytes = 0;
  };
  const add = (s, data) => {
    if (frames.length && (s.t >= pieceStart + PIECE_SEC || bytes > FAST_MAX)) { close(s.t); pieceStart = s.t; }
    frames.push(data); bytes += data.length;
    whole.push(adtsHeader(data.length, cfg), data);
  };
  let i = 0;
  while (i < list.length) {
    if (signal?.aborted) throw new DOMException('stopped', 'AbortError');
    const from = list[i].off, to = Math.min(file.size, from + READ_STEP);
    const buf = new Uint8Array(await file.slice(from, to).arrayBuffer());
    while (i < list.length && list[i].off + list[i].size <= to) {
      const s = list[i++];
      add(s, buf.slice(s.off - from, s.off - from + s.size));
    }
    if (i < list.length && list[i].off < to) { // a sample cut by the read window
      const s = list[i++];
      add(s, new Uint8Array(await file.slice(s.off, s.off + s.size).arrayBuffer()));
    }
    onStatus?.(i / list.length);
  }
  const duration = list.length ? Math.max(...list.slice(-50).map(s => s.t)) : 0;
  close(duration);
  return { pieces, audio: new Blob(whole, { type: 'audio/aac' }), audioName: 'aac', duration };
}

/* ---------- how long is it, and where is it quiet? ---------- */
// the length of a sound file, from the phone's own player (no decoding of the whole file)
function durationOf(file) {
  return new Promise(res => {
    const a = document.createElement('audio'), url = URL.createObjectURL(file);
    const done = d => { URL.revokeObjectURL(url); a.removeAttribute('src'); res(Number.isFinite(d) && d > 0 ? d : 0); };
    a.preload = 'metadata'; a.onloadedmetadata = () => done(a.duration); a.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    a.src = url;
  });
}
let actx = null;
const audioCtx = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());
// the quietest moment (in seconds from the window's start) in a few seconds of sound
function quietestIn(buf) {
  const ch = buf.getChannelData(0), win = Math.max(1, Math.round(buf.sampleRate * 0.05));
  let best = Infinity, at = ch.length / 2;
  for (let i = 0; i + win <= ch.length; i += win) {
    let e = 0; for (let j = i; j < i + win; j++) e += ch[j] * ch[j];
    // prefer the middle a little, so pieces stay close to 2 minutes
    const mid = Math.abs(i + win / 2 - ch.length / 2) / ch.length;
    const score = e * (1 + mid);
    if (score < best) { best = score; at = i + win / 2; }
  }
  return at / buf.sampleRate;
}

/* ---------- MP3 and ADTS-AAC: cut at frame starts, at a quiet moment ---------- */
async function cutAtFrames(file, mime, isSync) {
  const nextSync = async from => {
    const win = new Uint8Array(await file.slice(from, Math.min(file.size, from + 65536)).arrayBuffer());
    let j = 0; while (j < win.length - 1 && !isSync(win[j], win[j + 1])) j++;
    return from + j;
  };
  let seconds = await durationOf(file);
  // raw AAC has no length in it: estimate it from the first frames (each holds 1024 sound samples)
  if (!seconds && mime === 'audio/aac') {
    const h = new Uint8Array(await file.slice(0, Math.min(file.size, 262144)).arrayBuffer());
    const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    let i = 0, frames = 0, bytes = 0, rate = 0;
    while (i + 7 < h.length && h[i] === 0xFF && (h[i + 1] & 0xF6) === 0xF0) {
      rate ||= RATES[(h[i + 2] >> 2) & 15] || 44100;
      const len = ((h[i + 3] & 3) << 11) | (h[i + 4] << 3) | (h[i + 5] >> 5);
      if (len < 7) break;
      i += len; frames++; bytes += len;
    }
    if (frames > 20 && rate) seconds = file.size / (bytes / (frames * 1024 / rate));
  }
  if (seconds && seconds <= WHOLE_SEC && file.size <= FAST_MAX) return { pieces: [{ blob: file, mime }], audio: file };
  if (!seconds && file.size <= WHOLE_MAX) return { pieces: [{ blob: file, mime }], audio: file };
  const bps = seconds ? file.size / seconds : 16000;           // bytes per second (an unknown file: 128 kbit/s)
  const total = seconds || file.size / bps;
  const n = Math.max(1, Math.round(total / PIECE_SEC));
  const cuts = [0];
  for (let k = 1; k < n; k++) {
    let at = Math.floor(file.size * k / n);
    // look 6 seconds either side for the quietest moment, and cut there
    try {
      const from = await nextSync(Math.max(cuts[cuts.length - 1] + 1, at - Math.round(bps * 6)));
      const to = Math.min(file.size, at + Math.round(bps * 6));
      const buf = await audioCtx().decodeAudioData(await file.slice(from, to).arrayBuffer());
      at = from + Math.round((to - from) * quietestIn(buf) / buf.duration);
    } catch {}
    cuts.push(await nextSync(at));
  }
  cuts.push(file.size);
  const pieces = [];
  for (let k = 0; k < cuts.length - 1; k++) if (cuts[k + 1] > cuts[k]) pieces.push({ blob: file.slice(cuts[k], cuts[k + 1], mime), mime, start: cuts[k] / bps, end: cuts[k + 1] / bps });
  return { pieces, audio: file };
}

// raw AAC (ADTS frames) → M4A; null if the bytes are not clean ADTS
function adtsToM4a(u8) {
  const frames = []; let i = 0, cfg = null;
  while (i + 7 <= u8.length) {
    if (u8[i] !== 0xFF || (u8[i + 1] & 0xF6) !== 0xF0) return null;
    const hdr = (u8[i + 1] & 1) ? 7 : 9;
    const len = ((u8[i + 3] & 3) << 11) | (u8[i + 4] << 3) | (u8[i + 5] >> 5);
    if (len <= hdr || i + len > u8.length) break;
    cfg ||= { profile: u8[i + 2] >> 6, fi: (u8[i + 2] >> 2) & 15, ch: ((u8[i + 2] & 1) << 2) | (u8[i + 3] >> 6) };
    frames.push(u8.subarray(i + hdr, i + len)); i += len;
  }
  if (!frames.length || !cfg) return null;
  return m4a(frames, ascFrom(cfg), RATES[cfg.fi] || 44100, cfg.ch || 1);
}

/* ---------- WAV: cut the sound data, give each piece its own header ---------- */
async function cutWav(file) {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 1 << 16)).arrayBuffer());
  const dv = new DataView(head.buffer);
  let p = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (p + 8 <= head.length) {
    const id = String.fromCharCode(...head.subarray(p, p + 4)), len = dv.getUint32(p + 4, true);
    if (id === 'fmt ') fmt = head.slice(p + 8, p + 8 + len);
    if (id === 'data') { dataOff = p + 8; dataLen = Math.min(len, file.size - dataOff); break; }
    p += 8 + len + (len & 1);
  }
  if (!fmt || dataOff < 0) throw cannot();
  const fdv = new DataView(fmt.buffer);
  const byteRate = fdv.getUint32(8, true), align = fdv.getUint16(12, true) || 1, bits = fdv.getUint16(14, true);
  if (dataLen / byteRate <= WHOLE_SEC && file.size <= FAST_MAX) return { pieces: [{ blob: file, mime: 'audio/wav' }], audio: file };
  let step = Math.min(byteRate * PIECE_SEC, 15 * 1024 * 1024); step -= step % align;
  // the quietest 50 ms within 6 seconds of a planned cut (16-bit sound; other kinds cut where planned)
  const quiet = async at => {
    if (bits !== 16) return at;
    const span = byteRate * 6, from = Math.max(0, at - span), to = Math.min(dataLen, at + span);
    const pcm = new Int16Array((await file.slice(dataOff + from, dataOff + to).arrayBuffer()).slice(0, Math.floor((to - from) / 2) * 2));
    const win = Math.max(align / 2, Math.round(byteRate * 0.05 / 2));
    let best = Infinity, pos = at - from;
    for (let i = 0; i + win <= pcm.length; i += win) {
      let e = 0; for (let j = i; j < i + win; j += 4) e += pcm[j] * pcm[j];
      if (e < best) { best = e; pos = (i + win / 2) * 2; }
    }
    const cut = from + pos; return cut - (cut % align);
  };
  const ends = [];
  for (let o = step; o < dataLen - byteRate * 20; o += step) ends.push(await quiet(o));
  ends.push(dataLen);
  const pieces = [];
  for (let k = 0, o = 0; k < ends.length; o = ends[k], k++) {
    const len = ends[k] - o; if (len <= 0) continue;
    const h = new Uint8Array(20 + fmt.length + 8), hv = new DataView(h.buffer);
    h.set([82, 73, 70, 70]); hv.setUint32(4, 12 + fmt.length + 8 + len, true); h.set([87, 65, 86, 69, 102, 109, 116, 32], 8);
    hv.setUint32(16, fmt.length, true); h.set(fmt, 20);
    h.set([100, 97, 116, 97], 20 + fmt.length); hv.setUint32(24 + fmt.length, len, true);
    pieces.push({ blob: new Blob([h, file.slice(dataOff + o, dataOff + o + len)], { type: 'audio/wav' }), mime: 'audio/wav', start: o / byteRate, end: (o + len) / byteRate });
  }
  return { pieces, audio: file };
}

/* ---------- the one function the app calls ---------- */
async function prepare(file, onStatus, signal) {
  const k = kindOf(file);
  if (!k) throw cannot();
  let r = null;
  if (k === 'mp4') {
    r = await fromMp4(file, onStatus, signal);
    if (!r) { // not plain AAC inside: send it as it is if it is small enough
      if (file.size > HARD_MAX) throw tooBig();
      const mime = /^audio/.test(file.type) || ext(file) === 'm4a' ? 'audio/m4a' : (file.type || 'video/mp4');
      r = { pieces: [{ blob: file, mime }], audio: null };
    }
  } else if (k === 'mp3') r = await cutAtFrames(file, 'audio/mp3', (a, b) => a === 0xFF && (b & 0xE0) === 0xE0);
  else if (k === 'aac') {
    r = await cutAtFrames(file, 'audio/aac', (a, b) => a === 0xFF && (b & 0xF6) === 0xF0);
    r.pieces = await Promise.all(r.pieces.map(async p => ({ ...p, blob: adtsToM4a(new Uint8Array(await p.blob.arrayBuffer())) || p.blob, mime: 'audio/mp4' })));
    r.pieces.forEach(p => { if (p.blob.type !== 'audio/mp4') p.mime = 'audio/aac'; });
  }
  else if (k === 'wav') r = await cutWav(file);
  else if (MIME[k]) {
    if (file.size > HARD_MAX) throw tooBig();
    r = { pieces: [{ blob: file, mime: MIME[k] }], audio: k === 'webm' ? null : file };
  } else throw cannot();
  onStatus?.(1);
  return r;
}

window.JundMedia = { isMedia, kindOf, prepare, PIECE_SEC, adtsToM4a };
})();
