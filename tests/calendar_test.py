"""The calendar made clear: Agenda, Tasks (with deadlines, nothing lost), Week (a real timetable) and Month.
Run: python3 tests/calendar_test.py http://localhost:8765/"""
import asyncio, json, sys, datetime as dt
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
T = dt.date.today(); d = lambda n: (T + dt.timedelta(days=n)).isoformat()
EV = [
 {"id": "c1", "title": "Hadith class", "date": d(-7), "time": "09:30", "mins": 90, "type": "class", "repeat": "weekly", "remind": -1},
 {"id": "t3", "title": "Read chapter 4", "date": d(-2), "type": "homework", "repeat": "none", "remind": -1},
 {"id": "t9", "title": "Far away essay", "date": d(40), "type": "task", "repeat": "none", "remind": -1},
]

async def run(b, lang):
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
    await c.add_init_script(f"if (!sessionStorage.x) {{ sessionStorage.x = 1; localStorage.clear(); localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_events', JSON.stringify({json.dumps(EV)})); }}")
    await c.route("**/api.aladhan.com/**", lambda r: r.abort())
    pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1200)
    await pg.evaluate("JN.show('calendar')"); await pg.wait_for_timeout(400)
    tabs = await pg.evaluate("[...document.querySelectorAll('#cal-mode button')].map(b => b.dataset.m)")
    check(tabs == ["agenda", "tasks", "week", "month"], f"[{lang}] four clear views: Agenda, Tasks, Week, Month")
    txt = await pg.inner_text("#cal-view")
    check("Read chapter 4" in txt and ("late" in txt.lower() or "متأخرة" in txt), f"[{lang}] the Agenda opens with what is late, saying how late")
    check("Hadith class" in txt, f"[{lang}] classes (the timetable) are in the Agenda on their days")
    # a task with no date: made in the form, found in Tasks
    await pg.click("#ev-add"); await pg.wait_for_timeout(200)
    await pg.fill("#ev-title", "Buy a notebook")
    lbl = await pg.inner_text("#ev-date-l")
    check(lbl in ("Deadline", "موعد التسليم"), f"[{lang}] for a task the date is called the deadline ({lbl})")
    await pg.check("#ev-nodate"); await pg.click("#ev-save"); await pg.wait_for_timeout(400)
    mode = await pg.evaluate("document.querySelector('#cal-mode .on').dataset.m")
    txt = await pg.inner_text("#cal-view")
    check(mode == "tasks" and "Buy a notebook" in txt, f"[{lang}] after adding, the app shows where the task went (Tasks, under 'no date yet')")
    check("Far away essay" in txt, f"[{lang}] a task 40 days away is still easy to find in Tasks")
    # quick add with a deadline
    await pg.fill("#tk-new", "Send the report"); await pg.select_option("#tk-when", index=2); await pg.click("#tk-add button[type=submit]"); await pg.wait_for_timeout(300)
    row = await pg.evaluate("[...document.querySelectorAll('#cal-view .ag-row')].find(r => r.innerText.includes('Send the report'))?.innerText || ''")
    check("tomorrow" in row.lower() or "غدًا" in row, f"[{lang}] quick add with a deadline: '{row.splitlines()[-1] if row else ''}'")
    # search
    await pg.fill("#tk-q", "notebook"); await pg.wait_for_timeout(200)
    n = await pg.evaluate("document.querySelectorAll('#cal-view .ag-row').length")
    check(n == 1, f"[{lang}] searching tasks finds the one you want ({n})")
    await pg.fill("#tk-q", "")
    # tick it done
    await pg.evaluate("[...document.querySelectorAll('#cal-view .ag-row')].find(r => r.innerText.includes('Buy a notebook')).querySelector('input').click()"); await pg.wait_for_timeout(300)
    done = await pg.evaluate("JundCal.events().find(e => e.title === 'Buy a notebook').done")
    check(done is True, f"[{lang}] ticking a task marks it done (it moves to the folded 'Done')")
    # week: a real time grid, a 90-minute class is a tall block
    await pg.click("#cal-mode [data-m=week]"); await pg.wait_for_timeout(300)
    h = await pg.evaluate("(() => { const b = [...document.querySelectorAll('.tt-ev')].find(x => x.innerText.includes('Hadith')); return b ? b.offsetHeight : 0 })()")
    check(h > 55, f"[{lang}] Week is a timetable: a 1½-hour class is drawn 1½ hours tall ({h}px)")
    # move late to today
    await pg.click("#cal-mode [data-m=agenda]"); await pg.wait_for_timeout(200)
    await pg.click("#ag-move"); await pg.wait_for_timeout(300)
    late = await pg.evaluate("JundCal.events().find(e => e.id === 't3').date")
    check(late == d(0), f"[{lang}] late tasks move to today in one tap")
    # class with an end time
    await pg.click("#ev-add"); await pg.fill("#ev-title", "Tafsir"); await pg.select_option("#ev-type", "class")
    end_shown = await pg.evaluate("!document.querySelector('#ev-end-f').hidden")
    await pg.fill("#ev-date", d(1)); await pg.fill("#ev-time", "20:00"); await pg.fill("#ev-end", "21:30"); await pg.click("#ev-save"); await pg.wait_for_timeout(300)
    mins = await pg.evaluate("JundCal.events().find(e => e.title === 'Tafsir').mins")
    check(end_shown and mins == 90, f"[{lang}] a class has a start and an end ({mins} min)")
    check(not errs, f"[{lang}] no page errors {errs[:2]}")
    await c.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for lang in ("en", "ar"): await run(b, lang)
        await b.close()
    print(f"\n{'ALL PASSED' if not fails else str(len(fails)) + ' FAILED'}")
    sys.exit(1 if fails else 0)
asyncio.run(main())
