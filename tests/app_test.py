"""Automatic check of the app in a phone-sized browser. Runs on every change (see .github/workflows/tests.yml).

The AI server is replaced by a stand-in, so the check needs no keys and costs nothing.
It checks that: the app opens with no errors, every main screen opens, a transcript becomes a
saved note, and the task inside that note reaches the calendar.

Run locally:  python3 -m http.server 8765 &   then   python3 tests/app_test.py http://localhost:8765/
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
SCREENS = ["library", "calendar", "assistant", "studio", "settings"]
NOTE = {
    "title": "اجتماع الفريق", "subtitle": "Weekly meeting",
    "sections": [{"heading": "القرارات", "blocks": [
        {"t": "def", "title": "الهدف", "text": "إطلاق النسخة الأولى."},
        {"t": "list", "title": "Decisions", "items": ["Launch on Friday", "Invite 100 users"], "ordered": True},
        {"t": "table", "title": "مقارنة", "headers": ["الخيار", "التكلفة"], "rows": [["مجاني", "0"], ["مدفوع", "5"]]}]}],
    "mnemonics": [],
    "tasks": [{"title": "Send the meeting minutes", "date": "2026-11-20", "time": "", "type": "homework", "who": "", "note": ""}],
    "mindmap": [{"center": "الاجتماع", "branches": [{"label": "القرارات", "children": []}]}],
    "report": {"inferred": [], "left_out": [], "maybe_wrong": [], "added": []},
}
TRANSCRIPT = ("Today's meeting. We decided to launch on Friday and to invite the first 100 users. "
              "اتفقنا على إطلاق النسخة الأولى يوم الجمعة. The action: send the meeting minutes by Friday. ") * 6


async def fake_server(route):
    req = route.request
    cors = {"access-control-allow-origin": BASE.rstrip("/"), "access-control-allow-headers": "content-type, x-user-key"}
    if req.method == "OPTIONS":
        return await route.fulfill(status=204, headers=cors)
    if req.method == "GET":
        return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"},
                                   body=json.dumps({"ok": True, "app": "mustatar", "key": True, "push": True}))
    try:
        b = json.loads(req.post_data or "{}")
    except Exception:
        b = {}
    text = json.dumps(NOTE, ensure_ascii=False) if b.get("json", True) else "Done."
    half = len(text) // 2
    sse = "".join("data: " + json.dumps({"candidates": [{"content": {"parts": [{"text": t}]}, **({"finishReason": "STOP"} if last else {})}]},
                                        ensure_ascii=False) + "\n\n" for t, last in ((text[:half], False), (text[half:], True)))
    await route.fulfill(status=200, headers={**cors, "content-type": "text/event-stream"}, body=sse)


async def main():
    failures = []
    def check(ok, what):
        print(("PASS " if ok else "FAIL ") + what)
        if not ok:
            failures.append(what)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 412, "height": 915}, locale="ar-SA", is_mobile=True, has_touch=True, service_workers="block")
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        await page.route("**/*workers.dev/**", fake_server)
        await page.route("**/api.aladhan.com/**", lambda r: r.abort())
        await page.goto(BASE, wait_until="load")
        await page.wait_for_timeout(2500)
        # pass the first-day welcome screens
        for _ in range(6):
            closed = await page.evaluate("""()=>{const o=[...document.querySelectorAll('body > *')].find(e=>{const s=getComputedStyle(e);return s.position==='fixed'&&s.display!=='none'&&e.offsetHeight>300&&/wl|welcome/i.test(e.className+e.id)}); if(!o) return false; const bs=[...o.querySelectorAll('button')]; (bs.find(b=>/تخط|Skip/i.test(b.innerText))||bs[0])?.click(); return true}""")
            if not closed:
                break
            await page.wait_for_timeout(400)
        check(not errors, "the app opens with no errors")

        for screen in SCREENS:
            before = len(errors)
            found = await page.evaluate(f"(()=>{{const b=document.querySelector('[data-nav=\"{screen}\"]'); if(!b) return false; b.click(); return true}})()")
            await page.wait_for_timeout(700)
            check(found and len(errors) == before, f"the {screen} screen opens")

        await page.evaluate("document.querySelector('[data-nav=\"library\"]').click()")
        await page.wait_for_timeout(500)
        await page.evaluate("document.querySelector('[data-go=\"new\"]').click()")
        await page.wait_for_timeout(800)
        await page.evaluate("document.querySelector('#transcript').closest('details').open = true")
        await page.fill("#custom-subject", "Meetings")
        await page.fill("#transcript", TRANSCRIPT)
        await page.fill("#unit", "Weekly meeting")
        await page.click("#make")
        saved = 0
        for _ in range(40):
            await page.wait_for_timeout(1000)
            saved = await page.evaluate("""new Promise(r=>{const q=indexedDB.open('jund-notes');q.onsuccess=()=>{try{const t=q.result.transaction('lessons').objectStore('lessons').getAll();t.onsuccess=()=>r(t.result.length)}catch(e){r(-1)}};q.onerror=()=>r(-2)})""")
            if saved and saved > 0:
                break
        check(saved and saved > 0, "a transcript becomes a saved note")

        # the app offers the tasks it found in the note; accept them
        offered = False
        for _ in range(10):
            offered = await page.evaluate("(()=>{const b=document.querySelector('#found-tasks:not([hidden]) #ft-add'); if(!b) return false; b.click(); return true})()")
            if offered:
                break
            await page.wait_for_timeout(500)
        check(offered, "the app offers the note's tasks for the calendar")
        await page.wait_for_timeout(600)
        await page.evaluate("document.querySelector('[data-nav=\"calendar\"]').click()")
        await page.wait_for_timeout(800)
        check(await page.evaluate("document.body.innerText.includes('Send the meeting minutes')"), "the note's task reaches the calendar")
        check(not errors, "no errors anywhere: " + "; ".join(errors[:3]))
        await browser.close()

    print(f"\n{len(failures)} problem(s)" if failures else "\nAll checks passed")
    sys.exit(1 if failures else 0)


asyncio.run(main())
