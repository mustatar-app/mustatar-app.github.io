"""The short brief before a lesson or meeting, and the choice of which tasks to add from a note.
Run: python3 tests/brief_test.py http://localhost:8765/"""
import asyncio, json, sys, datetime as dt
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
now = dt.datetime.now()
soon = now + dt.timedelta(minutes=50)          # inside the 1-hour window: the card shows now
later = now + dt.timedelta(hours=5)
today = dt.date.today().isoformat()
yday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
calls = []

async def srv(route):
    req = route.request
    cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-mst-stream, authorization"}
    if req.method == "OPTIONS": return await route.fulfill(status=204, headers=cors)
    if req.method == "GET": return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"}, body='{"ok":true,"app":"mustatar","key":true}')
    body = json.loads(req.post_data or "{}"); calls.append(body)
    if "meeting" in (body.get("system") or "") and "minutes of the last meeting" in body.get("system", ""):
        out = {"points": ["Launch moved to Monday"], "open": ["Ali sends the design"], "bring": ["The budget sheet"]}
    else:
        out = {"points": ["الطهارة شرط لصحة الصلاة", "الوضوء له أربعة فروض"], "remember": ["النية: القصد بالقلب"], "ask": ["ما فروض الوضوء؟", "متى يجب الغسل؟"]}
    ev = {"choices": [{"index": 0, "delta": {"content": json.dumps(out, ensure_ascii=False)}, "finish_reason": "stop"}]}
    await route.fulfill(status=200, headers={**cors, "content-type": "text/event-stream"}, body="data: " + json.dumps(ev, ensure_ascii=False) + "\n\ndata: [DONE]\n\n")

LESSON = {"id": "L1", "date": yday + "T10:00:00", "lang": "ar", "subject": {"name": "الفقه"}, "unit": "كتاب الطهارة",
          "notes": {"title": "كتاب الطهارة", "sections": [{"heading": "الوضوء", "blocks": [{"items": ["فروض الوضوء أربعة", "النية شرط"]}]}]}}
EVENTS = [
  {"id": "c1", "title": "درس الفقه", "date": soon.date().isoformat(), "time": soon.strftime("%H:%M"), "type": "class", "repeat": "none", "remind": -1},
  {"id": "m1", "title": "Team meeting", "date": later.date().isoformat(), "time": later.strftime("%H:%M"), "type": "meeting", "repeat": "none", "remind": -1},
  {"id": "c2", "title": "Fiqh lesson (الفقه)", "date": (now + dt.timedelta(hours=3)).date().isoformat(), "time": (now + dt.timedelta(hours=3)).strftime("%H:%M"), "type": "class", "repeat": "none", "remind": -1},
  {"id": "t1", "title": "احفظ فروض الوضوء", "date": today, "type": "homework", "repeat": "none", "remind": -1, "src": "L1"},
]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
        await c.add_init_script(f"""localStorage.setItem('jn_uiLang', JSON.stringify('en'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');
          localStorage.setItem('jn_plan',JSON.stringify('test'));localStorage.setItem('jn_events', JSON.stringify({json.dumps(EVENTS, ensure_ascii=False)}));""")
        await c.route("**/api.aladhan.com/**", lambda r: r.abort())
        await c.route("**/jund-notes-ai.dawajund.workers.dev/**", srv)
        pg = await c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(1200)
        await pg.evaluate(f"JN.saveLesson({json.dumps(LESSON, ensure_ascii=False)})")
        up = await pg.evaluate("JundBrief.upcoming().map(x => x.kind + ':' + x.e.id)")
        check(up[:3] == ["class:c1", "class:c2", "meeting:m1"], f"the next class and meeting are found ({up})")
        match = await pg.evaluate("JundBrief.lastLesson(JundBrief.upcoming()[0]).then(l => l && l.id)")
        check(match == "L1", "the class «درس الفقه» is matched to the last fiqh lesson")
        await pg.evaluate("JundBrief.prepare()"); await pg.wait_for_timeout(800)
        briefs = await pg.evaluate("JSON.parse(localStorage.getItem('jn_briefs') || '{}')")
        cls = next((v for v in briefs.values() if v["eventId"] == "c1"), None)
        check(bool(cls and cls["points"] and cls["ask"]), "a quick review was made for the lesson (points + questions)")
        check(bool(cls and any(t["id"] == "t1" for t in cls["tasks"])), "the lesson's unfinished homework is listed as left to do")
        meet = next((v for v in briefs.values() if v["eventId"] == "m1"), None)
        check(meet is not None and not meet["lessonId"], "a meeting with no earlier minutes still gets an entry (no review)")
        al = await pg.evaluate("JundBrief.alarms()")
        a1 = next((a for a in al if "c2" in a["id"]), None)
        start2 = (now + dt.timedelta(hours=3)).replace(second=0, microsecond=0)
        check(bool(a1) and abs(a1["at"] - (int(start2.timestamp() * 1000) - 3600e3)) < 61e3, "the lesson's notification rings one hour before it starts")
        check(bool(a1) and a1["title"].startswith("Before your lesson"), f"the notification says what it is ({a1 and a1['title']})")
        nat = await pg.evaluate("JundCal.pushSync && true")
        # the card on Today
        await pg.evaluate("JundBrief.paint()")
        card = await pg.evaluate("(() => { const c = document.querySelector('#hm-brief-card'); return c && !c.hidden ? c.innerText : ''; })()")
        check("الطهارة" in card and "ask yourself" in card.lower(), "the brief shows on Today with the review and the questions")
        check("احفظ فروض الوضوء" in card, "the left-to-do task shows in the card")
        await pg.click("#hm-brief-card [data-done='t1']")
        done = await pg.evaluate("JundCal.events().find(e => e.id === 't1').done")
        check(done is True, "ticking the task in the brief marks it done")
        await pg.click("#bf-x")
        hid = await pg.evaluate("document.querySelector('#hm-brief-card').hidden")
        check(hid, "the brief can be closed")
        # off in Me
        await pg.evaluate("localStorage.setItem('jn_briefLead', '0')")
        check(await pg.evaluate("JundBrief.alarms().length") == 0, "turning the brief off removes its notifications")

        # the choice of tasks from a note: nothing added until chosen; past dates asked about
        await pg.evaluate("localStorage.setItem('jn_briefLead', '60')")
        n0 = await pg.evaluate("JundCal.events().length")
        await pg.evaluate("""JundCal.chooseTasks({id: 'L2', date: '2026-01-01T09:00', notes: {title: 'x'}},
            [{title: 'Old essay', date: '2020-01-01', type: 'homework'}, {title: 'Read chapter 2', type: 'task'}])""")
        await pg.wait_for_timeout(300)
        txt = await pg.evaluate("document.querySelector('#ft-sheet')?.innerText || ''")
        check("passed" in txt, "a date that has passed is pointed out")
        check("No day was said" in txt, "a task with no day asks for one")
        dis = await pg.evaluate("document.querySelector('#ft-add').disabled")
        check(dis, "Add stays off until something is ticked")
        mins = await pg.evaluate("[...document.querySelectorAll('#ft-sheet input[type=date]')].map(i => i.value >= i.min)")
        check(all(mins), "the suggested days are today or later")
        await pg.click("#ft-sheet input[type=checkbox] >> nth=0")
        await pg.click("#ft-add"); await pg.wait_for_timeout(200)
        n1 = await pg.evaluate("JundCal.events().length")
        check(n1 == n0 + 1, "only the ticked task is added")
        newd = await pg.evaluate("JundCal.events().at(-1).date")
        check(newd >= today, f"the passed task is added on a new day ({newd})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print(f"\n{'ALL PASSED' if not fails else str(len(fails)) + ' FAILED'}")
    sys.exit(1 if fails else 0)
asyncio.run(main())
