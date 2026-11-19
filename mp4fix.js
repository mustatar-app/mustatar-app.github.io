/* Turns a "fragmented" MP4 (what the phone's video recorder makes: many small pieces, and no total length at the top)
   into one ordinary MP4 with its full length written in. Some players (the phone's gallery, WhatsApp) read only the
   first piece of a fragmented file, so a 10-second video from Studio played for 3 seconds. Same picture and sound,
   nothing is re-encoded: the samples are only listed again in one table. */
(() => {
const T = s => (s.charCodeAt(0) << 24 | s.charCodeAt(1) << 16 | s.charCodeAt(2) << 8 | s.charCodeAt(3)) >>> 0;
const name = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
function boxes(dv, start, end) {
  const out = [];
  for (let o = start; o + 8 <= end;) {
    let size = dv.getUint32(o), hdr = 8;
    if (size === 1) { size = Number(dv.getBigUint64(o + 8)); hdr = 16; } else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) break;
    out.push({ type: name(dv, o + 4), start: o, body: o + hdr, end: o + size });
    o += size;
  }
  return out;
}
const kid = (dv, b, type) => boxes(dv, b.body, b.end).find(x => x.type === type);
const path = (dv, b, ...types) => types.reduce((x, t) => x && kid(dv, x, t), b);

/* ---------- writing ---------- */
class W {
  constructor() { this.a = []; this.n = 0; }
  u8(v) { this.a.push(new Uint8Array([v])); this.n += 1; }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); this.a.push(b); this.n += 2; }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); this.a.push(b); this.n += 4; }
  u64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v)); this.a.push(b); this.n += 8; }
  bytes(u) { this.a.push(u); this.n += u.length; }
  str(s) { this.u32(T(s)); }
  box(type, fn) { const w = new W(); fn(w); this.u32(w.n + 8); this.str(type); for (const x of w.a) this.a.push(x); this.n += w.n; }
  full(type, ver, flags, fn) { this.box(type, w => { w.u32((ver << 24 | flags) >>> 0); fn(w); }); }
}
const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

function flatten(buf) {
  const dv = new DataView(buf), top = boxes(dv, 0, buf.byteLength);
  const moov = top.find(b => b.type === 'moov');
  if (!moov || !top.some(b => b.type === 'moof')) return null;            // already an ordinary MP4: nothing to do
  const u8 = new Uint8Array(buf);
  const raw = b => u8.subarray(b.start, b.end);
  // the tracks, as the file describes them
  const tracks = new Map();
  for (const trak of boxes(dv, moov.body, moov.end).filter(b => b.type === 'trak')) {
    const tkhd = kid(dv, trak, 'tkhd'), v = dv.getUint8(tkhd.body);
    const id = dv.getUint32(tkhd.body + (v ? 20 : 12));
    const mdia = kid(dv, trak, 'mdia'), mdhd = kid(dv, mdia, 'mdhd'), mv = dv.getUint8(mdhd.body);
    const minf = kid(dv, mdia, 'minf'), stbl = kid(dv, minf, 'stbl');
    const tw = tkhd.end - 8, th = tkhd.end - 4;   // width and height are the last two fields of tkhd
    tracks.set(id, { id, timescale: dv.getUint32(mdhd.body + (mv ? 20 : 12)), lang: dv.getUint16(mdhd.body + (mv ? 32 : 20)),
      hdlr: raw(kid(dv, mdia, 'hdlr')), media: boxes(dv, minf.body, minf.end).filter(b => /^(vmhd|smhd|nmhd|sthd|dinf)$/.test(b.type)).map(raw),
      stsd: raw(kid(dv, stbl, 'stsd')), width: dv.getUint32(tw), height: dv.getUint32(th), audio: !!kid(dv, minf, 'smhd'),
      def: { dur: 0, size: 0, flags: 0 }, samples: [] });
  }
  const mvex = kid(dv, moov, 'mvex');
  if (mvex) for (const trex of boxes(dv, mvex.body, mvex.end).filter(b => b.type === 'trex')) {
    const t = tracks.get(dv.getUint32(trex.body + 4)); if (!t) continue;
    t.def = { dur: dv.getUint32(trex.body + 12), size: dv.getUint32(trex.body + 16), flags: dv.getUint32(trex.body + 20) };
  }
  // every sample of every piece
  for (const moof of top.filter(b => b.type === 'moof')) {
    for (const traf of boxes(dv, moof.body, moof.end).filter(b => b.type === 'traf')) {
      const tfhd = kid(dv, traf, 'tfhd'), ff = dv.getUint32(tfhd.body) & 0xffffff;
      const t = tracks.get(dv.getUint32(tfhd.body + 4)); if (!t) continue;
      let p = tfhd.body + 8, base = moof.start, dDur = t.def.dur, dSize = t.def.size, dFlags = t.def.flags;
      if (ff & 1) { base = Number(dv.getBigUint64(p)); p += 8; }
      if (ff & 2) p += 4;
      if (ff & 8) { dDur = dv.getUint32(p); p += 4; }
      if (ff & 0x10) { dSize = dv.getUint32(p); p += 4; }
      if (ff & 0x20) { dFlags = dv.getUint32(p); p += 4; }
      const tfdt = kid(dv, traf, 'tfdt');
      let time = tfdt ? (dv.getUint8(tfdt.body) ? Number(dv.getBigUint64(tfdt.body + 4)) : dv.getUint32(tfdt.body + 4)) : null;
      if (time != null) t.next = time;
      let at = base;
      for (const trun of boxes(dv, traf.body, traf.end).filter(b => b.type === 'trun')) {
        const ver = dv.getUint8(trun.body), tf = dv.getUint32(trun.body) & 0xffffff, n = dv.getUint32(trun.body + 4);
        let q = trun.body + 8;
        if (tf & 1) { at = base + dv.getInt32(q); q += 4; }
        let first = null; if (tf & 4) { first = dv.getUint32(q); q += 4; }
        for (let i = 0; i < n; i++) {
          const dur = tf & 0x100 ? dv.getUint32((q += 4) - 4) : dDur;
          const size = tf & 0x200 ? dv.getUint32((q += 4) - 4) : dSize;
          const flags = tf & 0x400 ? dv.getUint32((q += 4) - 4) : (i === 0 && first != null ? first : dFlags);
          const cto = tf & 0x800 ? (ver ? dv.getInt32((q += 4) - 4) : dv.getUint32((q += 4) - 4)) : 0;
          t.samples.push({ at, size, dur, sync: !(flags & 0x10000), cto, dts: t.next || 0 });
          t.next = (t.next || 0) + dur; at += size;
        }
      }
    }
  }
  const list = [...tracks.values()].filter(t => t.samples.length);
  if (!list.length) return null;
  for (const t of list) {   // a last sample with no length gets the one before it
    const s = t.samples; if (s.length > 1 && !s.at(-1).dur) s.at(-1).dur = s.at(-2).dur;
    t.total = s.reduce((n, x) => n + x.dur, 0);
    t.bytes = s.reduce((n, x) => n + x.size, 0);
  }
  const movieDur = Math.max(...list.map(t => Math.round(t.total * 1000 / t.timescale)));
  // the new file: ftyp, moov (at the start, so it plays while downloading), then one mdat with each track's samples together
  const ftyp = new W(); ftyp.box('ftyp', w => { w.str('isom'); w.u32(512); for (const b of ['isom', 'iso2', 'avc1', 'mp41']) w.str(b); });
  const big = list.reduce((n, t) => n + t.bytes, 0) > 0xfff00000;
  const makeMoov = offsets => { const m = new W(); m.box('moov', w => {
    w.full('mvhd', 0, 0, x => { x.u32(0); x.u32(0); x.u32(1000); x.u32(movieDur); x.u32(0x10000); x.u16(0x100); x.u16(0); x.u32(0); x.u32(0); MATRIX.forEach(v => x.u32(v)); for (let i = 0; i < 6; i++) x.u32(0); x.u32(Math.max(...list.map(t => t.id)) + 1); });
    list.forEach((t, k) => w.box('trak', tr => {
      tr.full('tkhd', 0, 3, x => { x.u32(0); x.u32(0); x.u32(t.id); x.u32(0); x.u32(Math.round(t.total * 1000 / t.timescale)); x.u32(0); x.u32(0); x.u16(0); x.u16(0); x.u16(t.audio ? 0x100 : 0); x.u16(0); MATRIX.forEach(v => x.u32(v)); x.u32(t.width); x.u32(t.height); });
      tr.box('mdia', md => {
        md.full('mdhd', 0, 0, x => { x.u32(0); x.u32(0); x.u32(t.timescale); x.u32(t.total); x.u16(t.lang); x.u16(0); });
        md.bytes(t.hdlr);
        md.box('minf', mi => {
          t.media.forEach(b => mi.bytes(b));
          mi.box('stbl', st => {
            st.bytes(t.stsd);
            const runs = []; for (const s of t.samples) { const r = runs.at(-1); if (r && r[1] === s.dur) r[0]++; else runs.push([1, s.dur]); }
            st.full('stts', 0, 0, x => { x.u32(runs.length); runs.forEach(([c, d]) => { x.u32(c); x.u32(d); }); });
            if (t.samples.some(s => s.cto)) {
              const cr = []; for (const s of t.samples) { const r = cr.at(-1); if (r && r[1] === s.cto) r[0]++; else cr.push([1, s.cto]); }
              st.full('ctts', 1, 0, x => { x.u32(cr.length); cr.forEach(([c, o]) => { x.u32(c); x.u32(o); }); });
            }
            if (!t.audio && !t.samples.every(s => s.sync)) { const k2 = t.samples.map((s, i) => s.sync ? i + 1 : 0).filter(Boolean); st.full('stss', 0, 0, x => { x.u32(k2.length); k2.forEach(v => x.u32(v)); }); }
            st.full('stsc', 0, 0, x => { x.u32(1); x.u32(1); x.u32(t.samples.length); x.u32(1); });
            st.full('stsz', 0, 0, x => { x.u32(0); x.u32(t.samples.length); t.samples.forEach(s => x.u32(s.size)); });
            if (big) st.full('co64', 0, 0, x => { x.u32(1); x.u64(offsets[k]); }); else st.full('stco', 0, 0, x => { x.u32(1); x.u32(offsets[k]); });
          });
        });
      });
    }));
  }); return m; };
  const mdatHdr = big ? 16 : 8;
  const moovSize = makeMoov(list.map(() => 0)).n;
  const offsets = []; let o = ftyp.n + moovSize + mdatHdr;
  for (const t of list) { offsets.push(o); o += t.bytes; }
  const moovW = makeMoov(offsets);
  const total = list.reduce((n, t) => n + t.bytes, 0);
  const parts = [...ftyp.a, ...moovW.a];
  const mh = new W(); if (big) { mh.u32(1); mh.str('mdat'); mh.u64(total + 16); } else { mh.u32(total + 8); mh.str('mdat'); }
  parts.push(...mh.a);
  for (const t of list) for (const s of t.samples) parts.push(u8.subarray(s.at, s.at + s.size));
  return { parts, seconds: movieDur / 1000 };
}
// for Studio: a Blob in, a Blob out (the same Blob if it needed nothing or could not be read)
async function fix(blob) {
  try {
    const r = flatten(await blob.arrayBuffer());
    return r ? new Blob(r.parts, { type: 'video/mp4' }) : blob;
  } catch (e) { console.warn('mp4fix', e); return blob; }
}
(typeof window !== 'undefined' ? window : globalThis).JundMp4 = { flatten, fix };
})();
