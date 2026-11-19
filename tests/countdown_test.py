"""Countdowns (Ramadan, Eid, exams, your own) and timers / stopwatch.
Run: python3 tests/countdown_test.py http://localhost:8765/"""
import asyncio, json, sys, datetime as dt
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
today = dt.date.today()
in_days = lambda n: (today + dt.timedelta(days=n)).isoformat()

def fake(reply_actions):
    async def srv(route):
        req = route.request
        cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-mst-stream, authorization"}
        if req.method == "OPTIONS": return await route.fulfill(status=204, headers=cors)
        if req.method == "GET": return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"}, body='{"ok":true,"app":"mustatar","key":true}')
        text = json.dumps({"reply": "Done.", "actions": reply_actions}, ensure_ascii=False)
        ev = {"choices": [{"index": 0, "delta": {"content": text}, "finish_reason": "stop"}]}
        await route.fulfill(status=200, headers={**cors, "content-type": "text/event-stream"}, body="data: " + json.dumps(ev, ensure_ascii=False) + "\n\ndata: [DONE]\n\n")
    return srv

async def ctx(b, lang="en", extra=""):
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
    await c.add_init_script(f"localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_plan',JSON.stringify('test'));{extra}")
    await c.route("**/api.aladhan.com/**", lambda r: r.abort())
    return c

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        evs = [{"id": "e1", "title": "Exam: Fiqh", "date": in_days(5), "type": "exam", "repeat": "none", "remind": -1},
               {"id": "e2", "title": "Exam: far away", "date": in_days(90), "type": "exam", "repeat": "none", "remind": -1}]
        c = await ctx(b, "en", f"localStorage.setItem('jn_events', JSON.stringify({json.dumps(evs)}));")
        pg = await c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(1500)
        L = await pg.evaluate("JundCount.list()")
        names = [x["title"] for x in L]
        print("   ", [(x["title"], x["date"], x["days"]) for x in L][:9])
        # the Islamic dates, checked against the phone's own Umm al-Qura calendar
        ok = await pg.evaluate("""() => JundCount.list().filter(c => c.kind === 'islamic').every(c => {
            const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {day:'numeric', month:'numeric'}).formatToParts(new Date(c.date + 'T12:00'));
            const g = t => +p.find(x => x.type === t).value; const want = {ramadan:[9,1], qadr:[9,21], fitr:[10,1], arafah:[12,9], adha:[12,10], hijri:[1,1], ashura:[1,10]}[c.id];
            return want && g('month') === want[0] && g('day') === want[1]; })""")
        check(ok and all(n in names for n in ["Ramadan", "Eid al-Fitr", "Day of Arafah", "Eid al-Adha", "Islamic New Year"]), "c1 Ramadan, Eid, Arafah… on their Umm al-Qura dates")
        check(all(0 <= x["days"] <= 400 or x.get("inside") for x in L), "c2 every countdown is ahead (or happening now)")
        check("Exam: Fiqh" in names and "Exam: far away" not in names, "c3 exams in the next 60 days show; far ones do not")
        check([x["days"] for x in L] == sorted(x["days"] if not x.get("inside") else -1 for x in L), "c4 nearest first")
        row = await pg.inner_text("#hm-count")
        check("Exam: Fiqh" in row and "5 days" in row, f"c5 Today shows the nearest countdown as one quiet line ({row.strip()})")
        # add your own, and a yearly one
        await pg.click('#hm-count'); await pg.wait_for_timeout(300)
        await pg.fill("#cd-title", "My trip"); await pg.fill("#cd-date", in_days(24)); await pg.click("#cd-add button[type=submit]"); await pg.wait_for_timeout(200)
        bd = (today.replace(year=today.year - 20) + dt.timedelta(days=3)).isoformat() if today.month != 2 else in_days(3)
        await pg.evaluate(f"JundCount.addCountdown('Birthday', '{bd}', true)")
        L = await pg.evaluate("JundCount.list()")
        trip = next((x for x in L if x["title"] == "My trip"), None); bday = next((x for x in L if x["title"] == "Birthday"), None)
        check(trip and trip["days"] == 24, "c6 your own countdown: 24 days")
        check(bday and bday["days"] == 3 and bday["date"].startswith(str(today.year if (today + dt.timedelta(days=3)).year == today.year else today.year + 1)), f"c7 a yearly date counts to its next time ({bday and bday['date']})")
        lst = await pg.inner_text("#cd-dialog")
        check("24 days" in lst and "every year" in lst, "c8 the list shows days and 'every year'")
        # hide one Islamic date, then turn them all off
        await pg.click('[data-hide="ashura"]'); await pg.wait_for_timeout(150)
        check("Ashura" not in await pg.inner_text("#cd-dialog"), "c9 an Islamic date can be hidden")
        await pg.click("#cd-isl"); await pg.wait_for_timeout(150)
        L = await pg.evaluate("JundCount.list()")
        check(not any(x["kind"] == "islamic" for x in L), "c10 Islamic dates can be turned off")
        await pg.click("#cd-isl"); await pg.click("#cd-unhide"); await pg.wait_for_timeout(150)
        await pg.click('[data-del]'); await pg.wait_for_timeout(150)
        check(len(await pg.evaluate("JSON.parse(localStorage.getItem('jn_countdowns'))")) == 1, "c11 your own countdown can be removed")
        # ---------- timers ----------
        await pg.click('.cd-tab[data-tab="timer"]'); await pg.fill("#tm-label", "Tea"); await pg.click('[data-min="5"]'); await pg.wait_for_timeout(700)
        pill = await pg.inner_text("#tm-pill")
        check(await pg.is_visible("#tm-pill") and ("4:5" in pill or "5:00" in pill), f"t1 a 5-minute timer runs and shows at the top ({pill})")
        al = await pg.evaluate("JundCount.alarms()")
        check(len(al) == 1 and al[0]["body"] == "Tea" and abs(al[0]["at"] / 1000 - (dt.datetime.now().timestamp() + 300)) < 5, "t2 the timer goes to the phone's alarms, so it rings with the app closed")
        await pg.click('.tm-row [data-act="pp"]'); await pg.wait_for_timeout(1300)
        a = await pg.evaluate("JundCount.timers()[0]")
        check(a["end"] == 0 and 295000 < a["left"] <= 300000 and await pg.evaluate("JundCount.alarms().length") == 0, "t3 pause stops the clock and the alarm")
        await pg.click('.tm-row [data-act="plus"]'); await pg.click('.tm-row [data-act="pp"]'); await pg.wait_for_timeout(300)
        a = await pg.evaluate("JundCount.timers()[0]")
        check(a["end"] > 0 and a["ms"] == 360000, "t4 +1 minute and resume")
        await pg.click('[data-min="1"]'); await pg.wait_for_timeout(300)
        check(await pg.evaluate("JundCount.timers().length") == 2 and "+1" in await pg.inner_text("#tm-pill"), "t5 several timers at once")
        # time is up: it rings and goes away
        await pg.evaluate("(() => { const l = JundCount.timers(); l[1].end = Date.now() - 10; localStorage.setItem('jn_timers', JSON.stringify(l)); })()")
        await pg.wait_for_timeout(1200)
        toast = await pg.evaluate("document.querySelector('#toast')?.textContent || ''")
        check("time is up" in toast and await pg.evaluate("JundCount.timers().length") == 1, f"t6 a finished timer rings and is removed ({toast})")
        await pg.click('.tm-row [data-act="stop"]'); await pg.wait_for_timeout(700)
        check(not await pg.is_visible("#tm-pill"), "t7 stopping the last timer hides the top pill")
        # stopwatch
        await pg.click('.cd-tab[data-tab="sw"]'); await pg.click("#sw-go"); await pg.wait_for_timeout(1300); await pg.click("#sw-lap"); await pg.click("#sw-stop")
        face = await pg.inner_text("#sw-face"); laps = await pg.inner_text("#sw-laps")
        check(face.startswith("0:01") and "Lap 1" in laps, f"t8 stopwatch with laps ({face}, {laps})")
        await pg.click("#sw-reset"); check((await pg.inner_text("#sw-face")).startswith("0:00"), "t9 stopwatch resets")
        await pg.click("#cd-x")
        # the ＋ sheet and Me lead here
        await pg.evaluate("JundNav.openSheet()"); await pg.wait_for_timeout(300)
        await pg.click('.px [data-k="timer"]'); await pg.wait_for_timeout(400)
        check(await pg.evaluate("document.querySelector('#cd-dialog').open && document.querySelector('.cd-tab[aria-selected=true]').dataset.tab === 'timer'"), "t10 ＋ → Timer opens the timer")
        await pg.click("#cd-x"); await pg.click('.tabbar [data-nav="me"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-k="count"]'); await pg.wait_for_timeout(300)
        check(await pg.evaluate("document.querySelector('#cd-dialog').open"), "t11 Me → Countdowns and timers opens the sheet")
        await pg.click("#cd-x")
        check(not errs, f"t12 no page errors {errs[:2]}")
        await c.close()
        # ---------- the assistant can set them ----------
        c = await ctx(b, "en"); pg = await c.new_page()
        await pg.route("**/*workers.dev/**", fake([{"do": "timer", "minutes": 10, "label": "tea"}, {"do": "countdown", "title": "Wedding", "date": in_days(40), "yearly": False}]))
        await pg.goto(BASE); await pg.wait_for_timeout(1200)
        sent = []
        pg.on("request", lambda r: sent.append(r.post_data or "") if "/write" in r.url else None)
        await pg.fill("#as-text", "set a timer for 10 minutes for tea and count down to my wedding in 40 days")
        await pg.click("#as-send") if await pg.query_selector("#as-send") else await pg.press("#as-text", "Enter")
        await pg.wait_for_timeout(2500)
        tms = await pg.evaluate("JundCount.timers()"); cds = await pg.evaluate("JSON.parse(localStorage.getItem('jn_countdowns')||'[]')")
        check(len(tms) == 1 and tms[0]["ms"] == 600000 and tms[0]["label"] == "tea", "a1 the assistant starts a timer")
        check(any(x["title"] == "Wedding" for x in cds), "a2 the assistant adds a countdown")
        check(any("COUNTDOWNS" in s and "Ramadan" in s for s in sent), "a3 the assistant is told the exact dates (for 'how many days to Ramadan?')")
        await c.close()
        # ---------- Arabic ----------
        c = await ctx(b, "ar"); pg = await c.new_page()
        await pg.goto(BASE); await pg.wait_for_timeout(1300)
        row = await pg.inner_text("#hm-count")
        check("رمضان" in row and "بعد" in row, f"r1 the Today line is in Arabic ({row.strip()})")
        await pg.evaluate("JundCount.open('timer')"); await pg.wait_for_timeout(200)
        check("يرنّ حتى لو أغلقت التطبيق" in await pg.inner_text("#cd-dialog"), "r2 the timer sheet is in Arabic")
        await c.close(); await b.close()
asyncio.run(main())
print("\n" + (f"{len(fails)} check(s) failed" if fails else "All checks passed")); sys.exit(1 if fails else 0)
