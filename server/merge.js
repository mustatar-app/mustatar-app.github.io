// Two people editing the same note at the same time: put both sets of changes together.
// A three-way merge: what the note was when this person started (base), what they have now (mine),
// and what is saved now, with the other person's changes (theirs).
//   text: line by line — a line changed by one person keeps that change; if both changed the same lines
//         differently, both versions are kept (nothing anyone wrote is lost);
//   checklist: items added by either are kept, items removed by either are removed, ticks follow whoever changed them;
//   title, colour, labels: whoever changed it; if both did, the latest save wins.

// which lines of a match lines of b (longest common subsequence), as a map a-index → b-index
function match(a, b) {
  const n = a.length, m = b.length, map = new Array(n).fill(-1);
  // the same start and end are matched straight away (most edits are small)
  let s = 0; while (s < n && s < m && a[s] === b[s]) { map[s] = s; s++; }
  let e = 0; while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) { map[n - 1 - e] = m - 1 - e; e++; }
  const A = a.slice(s, n - e), B = b.slice(s, m - e);
  if (!A.length || !B.length) return map;
  if (A.length * B.length > 4_000_000) return map;   // very big rewrites: treat the middle as all changed
  const W = B.length + 1, L = new Uint32Array((A.length + 1) * W);
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--)
    L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  for (let i = 0, j = 0; i < A.length && j < B.length;) {
    if (A[i] === B[j]) { map[s + i] = s + j; i++; j++; }
    else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) i++; else j++;
  }
  return map;
}
const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
export function mergeLines(o, a, b) {
  if (same(a, b)) return a; if (same(o, a)) return b; if (same(o, b)) return a;
  const ma = match(o, a), mb = match(o, b), out = [];
  let i = 0, ja = 0, jb = 0;
  const chunk = (oo, aa, bb) => {
    if (same(aa, bb)) out.push(...aa);
    else if (same(oo, aa)) out.push(...bb);
    else if (same(oo, bb)) out.push(...aa);
    else { out.push(...bb); for (const l of aa) if (!bb.includes(l)) out.push(l); }   // both changed here: keep both
  };
  for (;;) {
    let k = i; while (k < o.length && !(ma[k] >= ja && mb[k] >= jb)) k++;
    if (k >= o.length) { chunk(o.slice(i), a.slice(ja), b.slice(jb)); break; }
    chunk(o.slice(i, k), a.slice(ja, ma[k]), b.slice(jb, mb[k]));
    out.push(o[k]); i = k + 1; ja = ma[k] + 1; jb = mb[k] + 1;
  }
  return out;
}
export const mergeText = (o, a, b) => mergeLines(String(o || '').split('\n'), String(a || '').split('\n'), String(b || '').split('\n')).join('\n');

function mergeItems(o, a, b) {
  if (!a && !b) return null;
  if (!a || !b) {   // one of them turned the list into text (or text into a list): the side that changed it wins
    if (JSON.stringify(a) === JSON.stringify(o)) return b ?? null;
    if (JSON.stringify(b) === JSON.stringify(o)) return a ?? null;
    return a ?? b ?? null;
  }
  const key = x => x.t.trim();
  const inO = new Map((o || []).map(x => [key(x), x])), inA = new Map(a.map(x => [key(x), x])), inB = new Map(b.map(x => [key(x), x]));
  const out = [];
  const tick = k => { const ox = inO.get(k), ax = inA.get(k), bx = inB.get(k); if (!ax) return bx.done; if (!bx) return ax.done; if (!ox) return ax.done || bx.done; return ax.done !== ox.done ? ax.done : bx.done; };
  const keep = k => { if (!k) return false; const wasThere = inO.has(k); return wasThere ? inA.has(k) && inB.has(k) : (inA.has(k) || inB.has(k)); };
  const seen = new Set();
  // the saved order first, then the new items from this person in their place
  for (const x of b) { const k = key(x); if (seen.has(k) || !keep(k)) continue; seen.add(k); out.push({ t: x.t, done: tick(k) }); }
  a.forEach((x, i) => {
    const k = key(x); if (seen.has(k) || !keep(k)) return; seen.add(k);
    const prev = i ? key(a[i - 1]) : null, at = prev ? out.findIndex(y => key(y) === prev) + 1 : 0;
    out.splice(at > 0 ? at : (i ? out.length : 0), 0, { t: x.t, done: tick(k) });
  });
  // an empty last line (where the next item is typed) stays at the end
  if (a.length && !a.at(-1).t.trim()) out.push({ t: '', done: false });
  return out;
}
const pick = (o, a, b) => JSON.stringify(a) !== JSON.stringify(o) ? a : b;

export function mergeNote(o, a, b) {
  o = o || {};
  return {
    ...b,
    title: o.title === a.title ? b.title : o.title === b.title ? a.title : a.title,
    text: mergeText(o.text, a.text, b.text),
    items: mergeItems(o.items || null, a.items || null, b.items || null),
    color: pick(o.color, a.color, b.color),
    labels: pick(o.labels, a.labels, b.labels),
    images: a.images ?? b.images,
  };
}
