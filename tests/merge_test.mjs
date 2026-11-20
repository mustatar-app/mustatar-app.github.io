// Two people editing one note: run with  node tests/merge_test.mjs
import { mergeText, mergeNote } from '../server/merge.js';
let fails = 0; const check = (ok, what, got) => { console.log((ok ? 'PASS ' : 'FAIL ') + what + (ok ? '' : '  → ' + JSON.stringify(got))); if (!ok) fails++; };
const base = 'Shopping\nmilk\nbread\neggs';
let r = mergeText(base, 'Shopping\nmilk\nbread\neggs\ndates', 'Shopping list\nmilk\nbread\neggs');
check(r === 'Shopping list\nmilk\nbread\neggs\ndates', 'one adds a line at the end, the other edits the first line: both kept', r);
r = mergeText(base, 'Shopping\nmilk\neggs', 'Shopping\nmilk\nbread\neggs\nhoney');
check(r === 'Shopping\nmilk\neggs\nhoney', 'one deletes a line, the other adds one: both happen', r);
r = mergeText(base, 'Shopping\nmilk (2)\nbread\neggs', 'Shopping\nmilk (3)\nbread\neggs');
check(r.includes('milk (2)') && r.includes('milk (3)') && r.split('\n').length === 5, 'both change the same line differently: nothing is lost', r);
r = mergeText('', 'درس الفقه\nالطهارة', '');
check(r === 'درس الفقه\nالطهارة', 'writing into an empty note', r);
r = mergeText('أ\nب\nج', 'أ\nب\nج\nد', 'أ\nب مع زيادة\nج');
check(r === 'أ\nب مع زيادة\nج\nد', 'Arabic lines merge the same way', r);
const o = { title: 'Trip', text: '', items: [{ t: 'tickets', done: false }, { t: 'hotel', done: false }], color: '', labels: [] };
let n = mergeNote(o, { ...o, items: [{ t: 'tickets', done: true }, { t: 'hotel', done: false }, { t: 'visa', done: false }] },
                     { ...o, title: 'Umrah trip', items: [{ t: 'tickets', done: false }, { t: 'hotel', done: true }, { t: 'car', done: false }] });
check(n.title === 'Umrah trip', 'the title changed by one person is kept', n.title);
const k = Object.fromEntries(n.items.map(x => [x.t, x.done]));
check(k.tickets === true && k.hotel === true && 'visa' in k && 'car' in k && n.items.length === 4, 'checklist: both ticks and both new items are kept', n.items);
n = mergeNote(o, { ...o, items: [{ t: 'hotel', done: false }] }, { ...o, items: [{ t: 'tickets', done: false }, { t: 'hotel', done: false }, { t: 'car', done: false }] });
check(!n.items.some(x => x.t === 'tickets') && n.items.some(x => x.t === 'car'), 'an item removed by one person is removed; the other\'s new item stays', n.items);
n = mergeNote(o, { ...o, color: 'mint' }, { ...o, labels: ['family'] });
check(n.color === 'mint' && n.labels[0] === 'family', 'colour and labels follow whoever changed them', n);
const big = Array.from({ length: 3000 }, (_, i) => 'line ' + i);
const t0 = Date.now(); r = mergeText(big.join('\n'), [...big.slice(0, 10), 'NEW', ...big.slice(10)].join('\n'), [...big.slice(0, 2900), 'END'].join('\n'));
check(r.includes('NEW') && r.endsWith('END') && Date.now() - t0 < 1500, `a long note (3000 lines) merges quickly (${Date.now() - t0} ms)`, r.length);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
