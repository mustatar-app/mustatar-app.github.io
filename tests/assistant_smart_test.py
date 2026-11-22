# The assistant: Hijri dates are converted exactly, it asks with tap answers when unsure, replies to a chosen message,
# copies, and learns from 👎 (the reason goes into what it is told next time). Prayer reminders before each prayer.
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
fails = []
def check(ok, w): print(("PASS " if ok else "FAIL ") + w); (None if ok else fails.append(w))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(service_workers="block", permissions=["clipboard-read", "clipboard-write"])
        await c.add_init_script("if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.clear(); localStorage.setItem('jn_uiLang', JSON.stringify('ar')); localStorage.setItem('jn_welcomed','true'); localStorage.setItem('jn_opened','true');  }")
        pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(1500)
        # 1. Hijri → Gregorian, the same as the phone's own Umm al-Qura calendar
        r = await pg.evaluate("""(() => { const out = []; for (const off of [3, 40, 200, 400]) { const d = new Date(Date.now() + off * 864e5); const h = JundFeatures.hijriParts(d);
            const p = n => String(n).padStart(2, '0'); out.push([JundFeatures.fromHijri(h.y, h.m, h.d), `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`]); } return out; })()""")
        check(all(a == b_ for a, b_ in r), f"Hijri dates convert exactly: {r}")
        # 2. the assistant adds a task on a Hijri date
        h = await pg.evaluate("(() => { const h = JundFeatures.hijriParts(new Date(Date.now() + 20 * 864e5)); return h; })()")
        hd = f"h{h['y']}-{h['m']:02d}-{h['d']:02d}"
        want = await pg.evaluate(f"JundFeatures.fromHijri({h['y']}, {h['m']}, {h['d']})")
        await pg.evaluate("window.__sent = []; JN.callServer = async (o) => { window.__sent.push(o.user); return window.__next(o); }; 1")
        await pg.evaluate("window.__next = () => ({ stop: 'STOP', text: JSON.stringify({ reply: 'أضفت الاختبار', actions: [{ do: 'add', title: 'اختبار الفقه', date: '" + hd + "', time: '', type: 'exam', repeat: 'none', remind: 0 }] }) }); 1")
        await pg.fill('#as-text', 'عندي اختبار الفقه يوم ' + str(h['d']) + ' القادم هجري'); await pg.click('#as-send'); await pg.wait_for_timeout(800)
        ev = await pg.evaluate("JundCal.events().find(e => e.title === 'اختبار الفقه')")
        check(ev and ev['date'] == want, f"a Hijri date from the assistant lands on the right day ({hd} → {ev and ev['date']} / {want})")
        ctx = (await pg.evaluate("window.__sent"))[-1]
        check("HIJRI MONTHS (Umm al-Qura, exact)" in ctx and "starts" in ctx, "the assistant is given the Hijri month table")
        # 3. it asks with tap answers when unsure
        await pg.evaluate("window.__next = () => ({ stop: 'STOP', text: JSON.stringify({ reply: 'تقصد ١٥/٦', actions: [], ask: { q: 'هل التاريخ هجري أم ميلادي؟', choices: ['هجري', 'ميلادي'] } }) }); 1")
        await pg.fill('#as-text', 'ضع موعدًا يوم ١٥/٦'); await pg.click('#as-send'); await pg.wait_for_timeout(800)
        check(await pg.locator('[data-choice]').count() == 2, "a question comes with tap answers")
        await pg.evaluate("window.__next = () => ({ stop: 'STOP', text: JSON.stringify({ reply: 'حسنًا', actions: [] }) }); 1")
        await pg.click('[data-choice]:has-text("هجري")'); await pg.wait_for_timeout(800)
        check((await pg.evaluate("window.__sent"))[-1].endswith('The student now says: هجري'), "tapping an answer sends it")
        # 4. reply to a chosen message
        await pg.locator('.as-tools-row.ai [data-t="reply"]').first.click()
        check(await pg.locator('#as-replyto').count() == 1, "Reply shows the message being answered above the box")
        await pg.fill('#as-text', 'غيّره إلى الساعة ٨'); await pg.click('#as-send'); await pg.wait_for_timeout(800)
        check("He is replying to this earlier message" in (await pg.evaluate("window.__sent"))[-1] and await pg.locator('.msg.me .as-quote').count() >= 1, "the reply carries the quoted message to the assistant and shows it")
        # 5. copy
        await pg.locator('.as-tools-row.ai [data-t="copy"]').last.click(); await pg.wait_for_timeout(200)
        check(await pg.evaluate("navigator.clipboard.readText()") == 'حسنًا', "Copy puts the answer on the clipboard")
        # 6. 👎 with a reason becomes a lesson it is told next time
        await pg.locator('.as-tools-row.ai [data-t="down"]').last.click(); await pg.wait_for_timeout(200)
        await pg.click('.as-fb [data-w]:has-text("تاريخ أو وقت خطأ")'); await pg.fill('#as-fb-n', 'كان التاريخ هجريًا')
        await pg.click('.as-fb [data-s]'); await pg.wait_for_timeout(900)
        ctx = (await pg.evaluate("window.__sent"))[-1]
        check("LESSONS FROM HIS RATINGS" in ctx and "كان التاريخ هجريًا" in ctx, "👎 with a reason is remembered and sent next time, and it tries again")
        # 7. prayer reminders 10 minutes before (with sound) for browsers too
        pr = await pg.evaluate("""(() => { JundFeatures.timesFor = () => ({ Fajr: '05:10', Dhuhr: '12:20', Asr: '15:40', Maghrib: '17:50', Isha: '19:20' });
            const l = JundPhone.prayerAlarms(); const b = l.filter(x => x.id.startsWith('prb-')); const first = b[0];
            const at = l.find(x => x.id === first.id.replace('prb-', 'pray-'));
            return { before: b.length, gap: at ? (at.at - first.at) / 60000 : null, title: first.title }; })()""")
        check(pr['before'] >= 25 and pr['gap'] == 10, f"a reminder 10 minutes before each prayer, for a week ({pr})")
        await pg.evaluate("JundFeatures.timesFor = () => ({ Fajr: '05:10', Dhuhr: '12:20', Asr: '15:40', Maghrib: '17:50', Isha: '19:20' }); 1")
        inlist = await pg.evaluate("JundCal.upcoming ? 1 : 1")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
asyncio.run(main())
raise SystemExit(1 if fails else 0)
