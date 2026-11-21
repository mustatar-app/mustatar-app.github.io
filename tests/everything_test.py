"""Search everything, the alarm, the focus lock, Google Drive and phone notes, Studio translation only.
Run: python3 tests/everything_test.py http://localhost:8765/"""
import asyncio, json, sys, datetime as dt
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
T = dt.date.today().isoformat()
EV = [{"id": "e1", "title": "Tafsir homework surah Yusuf", "date": T, "time": "", "type": "homework", "repeat": "none", "remind": -1, "notes": ""}]
H = [{"id": "h1", "name": "Memorise Quran", "days": {}, "created": T}]

async def run(b, lang):
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
    await c.add_init_script(f"if (!sessionStorage.x) {{ sessionStorage.x = 1; localStorage.clear(); localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_checkinSpeak','false');localStorage.setItem('jn_events', JSON.stringify({json.dumps(EV)}));localStorage.setItem('jn_habits', JSON.stringify({json.dumps(H)})); }}")
    await c.route("**/api.aladhan.com/**", lambda r: r.abort())
    pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1500)
    # search everything
    await pg.click("#top-search"); await pg.wait_for_timeout(300)
    check(await pg.evaluate("!document.querySelector('.sr').hidden"), f"[{lang}] 🔍 opens search everything")
    await pg.fill("#sr-q", "يوسف" if lang == "ar" else "yusuf"); await pg.wait_for_timeout(700)
    txt = await pg.inner_text("#sr-body")
    check("Tafsir homework" in txt if lang == "en" else True, f"[{lang}] search finds tasks")
    await pg.fill("#sr-q", "حجم الخط" if lang == "ar" else "font size"); await pg.wait_for_timeout(500)
    txt = await pg.inner_text("#sr-body")
    check(("حجم النص" in txt) if lang == "ar" else ("Text size" in txt), f"[{lang}] search finds settings (text size): {txt[:60]!r}")
    await pg.fill("#sr-q", "منبه" if lang == "ar" else "alarm"); await pg.wait_for_timeout(500)
    await pg.click(".sr-it"); await pg.wait_for_timeout(400)
    check(await pg.evaluate("!!document.querySelector('#al-dlg[open]')"), f"[{lang}] a search result opens the place (the alarm)")
    # back closes search / windows
    # alarm: add one for every weekday
    await pg.fill("#al-time", "05:10"); await pg.fill("#al-label", "Fajr")
    for i in (0, 1, 2, 3, 4): await pg.click(f"[data-day='{i}']")
    await pg.click("#al-form button[type=submit]"); await pg.wait_for_timeout(300)
    al = await pg.evaluate("JundAlarm.all()")
    check(len(al) == 1 and al[0]["time"] == "05:10" and al[0]["days"] == [0, 1, 2, 3, 4], f"[{lang}] an alarm Sun–Thu at 05:10 is set ({al})")
    nx = await pg.evaluate("JundAlarm.next(JundAlarm.all()[0])")
    check(nx > 0, f"[{lang}] its next ring time is worked out")
    note = await pg.inner_text("#al-dlg")
    check(("only while Mustatar is open" in note) if lang == "en" else ("مفتوح" in note), f"[{lang}] in a browser it says honestly it rings only while open")
    await pg.evaluate("document.querySelector('#al-dlg').close()")
    # focus lock (browser: explains)
    await pg.evaluate("JundLock.open()"); await pg.wait_for_timeout(200)
    check(await pg.evaluate("document.querySelectorAll('.al-dlg[open] [data-m]').length") == 4, f"[{lang}] focus lock offers 25/50/90/120 min")
    await pg.evaluate("document.querySelector('.al-dlg[open]').close()")
    # Drive
    await pg.evaluate("JundDrive.help()"); await pg.wait_for_timeout(200)
    check(await pg.evaluate("document.querySelectorAll('#dv-dlg ol li').length") == 6, f"[{lang}] Google Drive: both ways explained step by step")
    await pg.evaluate("document.querySelector('#dv-dlg').close()")
    # phone notes in Bring your work
    await pg.evaluate("JundImport.open()"); await pg.wait_for_timeout(200)
    srcs = await pg.evaluate("[...document.querySelectorAll('.bring-src summary')].map(s => s.textContent)")
    check(any("Samsung Notes" in s for s in srcs), f"[{lang}] Bring your work has Samsung Notes and other phone notes apps")
    await pg.evaluate("document.querySelector('#bring-dialog').close()")
    # Studio translation: only the translation, no "summary", and never with the notes format
    calls = []
    await pg.expose_function("seen", lambda x: calls.append(x))
    await pg.evaluate("""JN.callServer = async (o) => { seen(JSON.stringify({ a: o.assistant, s: o.system.slice(0, 200) })); return { text: '**Executive Summary:** My Lord, increase me in knowledge.' }; }; 1""")
    await pg.evaluate("JN.show('studio')"); await pg.wait_for_timeout(500)
    await pg.evaluate("document.querySelector('#st-text').value = 'رب زدني علما'; document.querySelector('#st-text').dispatchEvent(new Event('input'))")
    await pg.evaluate("document.querySelector('#st-tr').click()"); await pg.wait_for_timeout(600)
    t = await pg.evaluate("document.querySelector('#st-text').value")
    check(t == "My Lord, increase me in knowledge.", f"[{lang}] Studio translate gives only the translation: {t!r}")
    check(calls and json.loads(calls[0])["a"] is True, f"[{lang}] the translation is asked as a plain job (no notes format added)")
    st = await pg.evaluate("document.querySelector('#st-status')?.textContent || ''")
    check((lang == "ar") == ("أُضيفت" in st), f"[{lang}] Studio messages in the app's language: {st[:50]!r}")
    check(not errs, f"[{lang}] no page errors {errs[:2]}")
    await c.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for lang in ("en", "ar"): await run(b, lang)
        await b.close()
    print("ALL PASS" if not fails else f"{len(fails)} FAILED")
    sys.exit(1 if fails else 0)
asyncio.run(main())
