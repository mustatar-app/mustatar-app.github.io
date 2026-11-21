"""The evening check-in: lists today's tasks, lessons and habits; what he says (typed here, spoken on the phone) ticks them
done / partly / not done with his remark or reason; unfinished tasks move to tomorrow; the coach can read the reasons.
Also: back button stays in the app, calendar days fold, plan line opens usage, text size, Arabic errors.
Run: python3 tests/checkin_test.py http://localhost:8765/"""
import asyncio, json, sys, datetime as dt
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
T = dt.date.today(); d = lambda n: (T + dt.timedelta(days=n)).isoformat()
EV = [
  {"id": "t1", "title": "Write the essay", "date": d(0), "time": "", "type": "homework", "repeat": "none", "remind": -1, "notes": ""},
  {"id": "t2", "title": "Call the office", "date": d(-2), "time": "", "type": "task", "repeat": "none", "remind": -1, "notes": ""},
  {"id": "c1", "title": "Tafsir class", "date": d(-7), "time": "08:05", "type": "class", "repeat": "weekly", "remind": -1, "notes": ""},
  {"id": "c2", "title": "Hadith class", "date": d(1), "time": "09:00", "type": "class", "repeat": "weekly", "remind": -1, "notes": ""},
]
H = [{"id": "h1", "name": "Quran 3 pages", "days": {}, "created": d(-5)}, {"id": "h2", "name": "Workout", "days": {}, "created": d(-5)}]
MAP = {"items": [{"n": 1, "s": "done", "note": ""}, {"n": 2, "s": "part", "note": "half written"}, {"n": 4, "s": "done", "note": ""}, {"n": 5, "s": "not", "note": "was tired"}], "extra": [], "reply": "Well done on the Quran."}

async def run(b, lang):
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
    await c.add_init_script(f"if (!sessionStorage.x) {{ sessionStorage.x = 1; localStorage.clear(); localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_checkinSpeak','false');localStorage.setItem('jn_events', JSON.stringify({json.dumps(EV)}));localStorage.setItem('jn_habits', JSON.stringify({json.dumps(H)})); }}")
    await c.route("**/api.aladhan.com/**", lambda r: r.abort())
    pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1500)
    its = await pg.evaluate("JundCheckin.items().map(x => x.title)")
    check(its[:3] == ["Tafsir class", "Write the essay", "Call the office"] or set(its) == {"Tafsir class", "Write the essay", "Call the office", "Quran 3 pages", "Workout"}, f"[{lang}] today's list: lessons, homework, late tasks, habits ({its})")
    check(await pg.evaluate("JundCheckin.alarms().length >= 1 && JundCheckin.alarms()[0].view === 'checkin'"), f"[{lang}] an evening reminder opens the check-in")
    await pg.evaluate("JundCheckin.open()"); await pg.wait_for_timeout(300)
    rows = await pg.evaluate("document.querySelectorAll('.ci-row').length")
    check(rows == 5, f"[{lang}] the check-in shows 5 things to answer ({rows})")
    order = await pg.evaluate("JundCheckin.items().map(x => x.title)")
    MAP2 = {"items": [{"n": order.index("Tafsir class") + 1, "s": "done", "note": ""}, {"n": order.index("Write the essay") + 1, "s": "part", "note": "half written"}, {"n": order.index("Quran 3 pages") + 1, "s": "done", "note": ""}, {"n": order.index("Workout") + 1, "s": "not", "note": "was tired"}], "extra": [], "reply": "Well done on the Quran."}
    await pg.evaluate(f"JN.callServer = async () => ({{ text: {json.dumps(json.dumps(MAP2))} }})")
    await pg.fill("#ci-text", "Tafsir and Quran done, essay half written, no workout I was tired")
    await pg.click("#ci-apply"); await pg.wait_for_timeout(500)
    st = await pg.evaluate("[...document.querySelectorAll('.ci-row')].map(r => r.className.replace('ci-row','').trim())")
    check(sorted(st) == sorted(["done", "part", "", "done", "not"]), f"[{lang}] what he said ticks each one: {st}")
    note = await pg.evaluate("[...document.querySelectorAll('.ci-note')].map(i => i.value).filter(Boolean)")
    check("was tired" in note and "half written" in note, f"[{lang}] his reasons and remarks are kept ({note})")
    q = await pg.inner_text("#ci-q")
    check("Call the office" in q, f"[{lang}] it asks again about what he did not mention: {q[:60]}")
    # answer the last one by hand
    await pg.click(f".ci-row[data-i='{order.index('Call the office')}'] [data-s=not]"); await pg.wait_for_timeout(100)
    await pg.click("#ci-save"); await pg.wait_for_timeout(400)
    ev = await pg.evaluate("Object.fromEntries(JundCal.events().map(e => [e.id, e]))")
    hb = await pg.evaluate("Object.fromEntries(JundHabits.all().map(h => [h.id, h]))")
    check(ev["c1"].get("att", {}).get(d(0), {}).get("s") == "done" and not ev["c1"].get("done"), f"[{lang}] a weekly lesson is marked attended today only")
    check(ev["t1"]["date"] == d(1) and "half written" in ev["t1"]["notes"], f"[{lang}] the half-done essay moves to tomorrow with its remark")
    check(ev["t2"]["date"] == d(1), f"[{lang}] the late task moves to tomorrow")
    check(hb["h1"]["days"].get(d(0)) is True and hb["h2"].get("miss", {}).get(d(0)) is True and hb["h2"].get("notes", {}).get(d(0)) == "was tired", f"[{lang}] habits ticked ✓ / ✕ with the reason")
    rc = await pg.evaluate("JundCheckin.recent()")
    check("was tired" in rc, f"[{lang}] the coach can read the reasons")
    check(await pg.evaluate("!document.querySelector('#hm-checkin')"), f"[{lang}] after saving, the Today card goes away")
    # typing "check in" in the chat opens it
    await pg.evaluate("JN.show('assistant')"); await pg.fill("#as-text", "راجع يومي" if lang == "ar" else "check in"); await pg.click("#as-send"); await pg.wait_for_timeout(300)
    check(await pg.evaluate("!!document.querySelector('.ci-dlg[open]')"), f"[{lang}] saying 'check in' in the chat opens it")
    await pg.evaluate("document.querySelector('.ci-dlg')?.close()")
    # back button: closes windows, goes to the previous screen, never leaves to an old page
    await pg.evaluate("JN.show('calendar')"); await pg.evaluate("JN.show('habits')")
    r1 = await pg.evaluate("JundHardBack()"); s1 = await pg.evaluate("[...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id")
    r2 = await pg.evaluate("JundHardBack()"); s2 = await pg.evaluate("[...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id")
    r3 = await pg.evaluate("JundHardBack()"); r4 = await pg.evaluate("JundHardBack()")
    check(r1 == "done" and s1 == "screen-calendar" and s2 == "screen-assistant" and r3 == "done" and r4 == "exit", f"[{lang}] back: Habits → Calendar → Today → 'press again' → leave ({r1},{s1},{s2},{r3},{r4})")
    # calendar: today open, other days folded
    await pg.evaluate("JN.show('calendar'); document.querySelector('#cal-mode [data-m=agenda], #cal-mode button')?.click()"); await pg.wait_for_timeout(300)
    fold = await pg.evaluate("[...document.querySelectorAll('details.ag-day')].map(x => x.open)")
    check(len(fold) >= 2 and fold[0] is True and not any(fold[1:]), f"[{lang}] calendar: today open, other days folded ({fold})")
    # plan line → usage page
    await pg.evaluate("JN.show('me')"); await pg.wait_for_timeout(300); await pg.click("#pl-open"); await pg.wait_for_timeout(200)
    check(await pg.evaluate("document.querySelectorAll('#pl-usage .pu-row').length") == 4, f"[{lang}] the plan opens a usage page with each limit and when it resets")
    await pg.evaluate("document.querySelector('#pl-usage').close()")
    # text size
    await pg.evaluate("localStorage.setItem('jn_textSize', JSON.stringify('xl'))"); await pg.reload(); await pg.wait_for_timeout(1200)
    fs = await pg.evaluate("getComputedStyle(document.documentElement).fontSize")
    check(fs.startswith("20.8"), f"[{lang}] text size XL makes the words bigger ({fs})")
    # errors in Arabic
    if lang == "ar":
        m = await pg.evaluate("JN.errText(Object.assign(new Error('Could not reach Mustatar’s server. Try again in a moment.'), {code:'ai_busy'}))")
        check("تعذّر" in m, f"[ar] server errors are in Arabic: {m}")
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
