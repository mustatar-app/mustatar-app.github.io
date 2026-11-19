"""Automatic check of the app in a phone-sized browser. Runs on every change (see .github/workflows/tests.yml).

The AI server is replaced by a stand-in, so the check needs no keys and costs nothing.
It checks that: the app opens with no errors, every main screen opens, a transcript becomes a
saved note, and the task inside that note reaches the calendar.

Run locally:  python3 -m http.server 8765 &   then   python3 tests/app_test.py http://localhost:8765/
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
SCREENS = ["library", "calendar", "assistant", "studio", "settings", "me"]
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
    cors = {"access-control-allow-origin": BASE.rstrip("/"), "access-control-allow-headers": "content-type, x-mst-stream, authorization"}
    if req.method == "OPTIONS":
        return await route.fulfill(status=204, headers=cors)
    if req.method == "GET":
        return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"},
                                   body=json.dumps({"ok": True, "app": "mustatar", "key": True, "push": True, "googleClientId": "test-client.apps.googleusercontent.com"}))
    if req.url.endswith("/auth/google"):
        return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"},
                                   body=json.dumps({"token": "test-token-1234567890", "user": {"name": "Test User", "email": "test@example.com"}, "created": True}))
    try:
        b = json.loads(req.post_data or "{}")
    except Exception:
        b = {}
    text = json.dumps(NOTE, ensure_ascii=False) if b.get("json", True) else "Done."
    half = len(text) // 2
    if req.headers.get("x-mst-stream") == "openai":
        # the free engine's own stream (Cloudflare and Groq), passed straight through, with some thinking the app must ignore
        events = [{"choices": [{"index": 0, "delta": {"reasoning_content": "thinking…", "content": None}}]},
                  {"choices": [{"index": 0, "delta": {"content": text[:half]}}]},
                  {"choices": [{"index": 0, "delta": {"content": text[half:]}, "finish_reason": "stop"}]}]
        sse = "".join("data: " + json.dumps(e, ensure_ascii=False) + "\n\n" for e in events) + "data: [DONE]\n\n"
    else:
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
            closed = await page.evaluate("""()=>{const o=[...document.querySelectorAll('body > *')].find(e=>{const s=getComputedStyle(e);return s.position==='fixed'&&s.display!=='none'&&e.offsetHeight>300&&/wl|welcome/i.test(e.className+e.id)}); if(!o) return false; const bs=[...o.querySelectorAll('button')]; (bs.find(b=>/تخط|Skip|Continue without|بدون حساب/i.test(b.innerText))||bs[0])?.click(); return true}""")
            if not closed:
                break
            await page.wait_for_timeout(400)
        check(not errors, "the app opens with no errors")

        for screen in SCREENS:
            before = len(errors)
            # the bottom bar has Today, Notes, Calendar and Me; Studio and Settings are opened from Me
            found = await page.evaluate(f"(()=>{{const b=document.querySelector('[data-nav=\"{screen}\"]'); if(b) b.click(); else JN.show('{screen}'); return !document.querySelector('#screen-{screen}').hidden}})()")
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
        # the first-day questions and "Your tools"
        await page.evaluate("window.JundWelcome.start(true)")
        await page.wait_for_timeout(400)
        await page.evaluate("document.querySelector('#op-skip')?.click()")
        await page.wait_for_timeout(300)
        await page.fill("#wl-name", "Junaid")
        await page.evaluate("document.querySelector('.wl .wl-role[data-r=\"employee\"]').click(); document.querySelector('.wl .wl-next').click()")
        await page.wait_for_timeout(300)
        await page.evaluate("document.querySelector('.wl [data-hard=\"meetings\"]').click(); document.querySelector('.wl .wl-next').click()")
        await page.wait_for_timeout(300)
        meetings_on = await page.evaluate("document.querySelector('.wl [data-tool=\"meetings\"]').classList.contains('on')")
        check(meetings_on, "an employee who finds meetings hard gets the meetings tools suggested")
        await page.evaluate("document.querySelector('.wl [data-tool=\"prayer\"]').click(); document.querySelector('.wl .wl-next').click()")
        await page.wait_for_timeout(300)
        me = await page.evaluate("JSON.parse(localStorage.getItem('jn_me'))")
        check("meetings" in me.get("hard", []) and me.get("name") == "Junaid", "the first-day answers are kept in About me")
        check(await page.evaluate("document.body.classList.contains('off-prayer')"), "a tool switched off disappears from the app")
        await page.evaluate("document.querySelector('.wl .wl-next')?.click()")
        # the navigation: Today · Notes · ＋ · Calendar · Me
        check(await page.evaluate("document.querySelectorAll('.tabbar button').length === 5 && getComputedStyle(document.querySelector('.tabbar')).display !== 'none'"), "the bottom bar shows Today, Notes, ＋, Calendar and Me")
        await page.evaluate("document.querySelector('#tab-plus').click()")
        await page.wait_for_timeout(400)
        check(await page.evaluate("!!document.querySelector('.px.in') && document.querySelectorAll('.px .mx-row').length === 9 && !!document.querySelector('.px [data-k=studio]')"), "＋ opens the sheet: five ways to capture, Studio, three ways to plan")
        await page.evaluate("JundNav.closeSheet()")
        await page.wait_for_timeout(300)
        await page.evaluate("document.querySelector('.tabbar [data-nav=\"me\"]').click()")
        await page.wait_for_timeout(400)
        check(await page.evaluate("!!document.querySelector('#screen-me .pl-card') && document.querySelectorAll('#screen-me .pl-row').length === 5"), "Me shows the free plan and what is left today and this month")
        check(await page.evaluate("(()=>{const d=new Date().toLocaleDateString('en-CA'); localStorage.setItem('jn_planUse', JSON.stringify({day:d, month:d.slice(0,7), rec:0, msg:10, text:0, yt:0, quiz:0})); try { JundPlan.check('msg'); return false } catch (e) { return e.code === 'quota' && JundPlan.left('rec') === 60 } })()"), "after 10 free assistant messages the next waits until tomorrow; recordings are counted apart")
        await page.evaluate("localStorage.removeItem('jn_planUse')")
        check(await page.evaluate("!document.querySelector('#screen-me').hidden && document.querySelectorAll('#screen-me .mx-row').length >= 12 && document.querySelector('.tabbar [data-nav=\"me\"]').classList.contains('on')"), "Me shows growth, workspace and settings")
        await page.evaluate("document.querySelector('#screen-me [data-k=\"sun\"]').click()")
        await page.wait_for_timeout(400)
        check(await page.evaluate("!document.querySelector('#screen-settings').hidden && document.querySelector('.tabbar [data-nav=\"me\"]').classList.contains('on')"), "a Me row opens its part of Settings")
        # the back button goes back through the screens, then to Today
        await page.evaluate("history.back()"); await page.wait_for_timeout(400)
        check(await page.evaluate("document.body.dataset.screen") == "me", "back from a part of Settings goes back to Me")
        await page.evaluate("history.back()"); await page.wait_for_timeout(400)
        check(await page.evaluate("document.body.dataset.screen") == "assistant", "back from a tab goes to Today")
        await page.evaluate("JN.show('settings')")
        await page.wait_for_timeout(400)
        check(await page.evaluate("getComputedStyle(document.querySelector('#top-back')).display !== 'none'"), "Settings has a back arrow at the top")
        check(await page.evaluate("!!document.querySelector('#tools-list [data-tool=\"prayer\"]') && !document.querySelector('#tools-list [data-tool=\"prayer\"]').checked"),
              "Settings → Your tools shows the same choice")
        check(await page.evaluate("!document.querySelector('#user-key')"), "the personal AI key is gone")
        check(not errors, "no errors anywhere: " + "; ".join(errors[:3]))
        # ---- a new version updates by itself ----
        c7 = await browser.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True)
        await c7.add_init_script("localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');")
        p7 = await c7.new_page()
        await p7.route("**/*workers.dev/**", fake_server); await p7.route("**/api.aladhan.com/**", lambda r: r.abort())
        await p7.goto(BASE); await p7.wait_for_timeout(2500); await p7.reload(); await p7.wait_for_timeout(2500)   # a version is in place
        await p7.evaluate("window.__mark=1; navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))"); await p7.wait_for_timeout(2500)
        check(await p7.evaluate("window.__mark === undefined"), "a new version loads by itself when nothing is going on")
        await p7.fill("#as-text", "half-written message")
        await p7.evaluate("window.__mark=1; navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))"); await p7.wait_for_timeout(1000)
        check(await p7.evaluate("window.__mark === 1 && document.body.classList.contains('has-update')"), "while typing, the update waits (and shows a small dot on Me)")
        await p7.evaluate("Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}); document.dispatchEvent(new Event('visibilitychange'))"); await p7.wait_for_timeout(3000)
        check(await p7.evaluate("window.__mark === undefined && document.querySelector('#as-text').value === 'half-written message'"), "the update happens when the app is left, keeping the half-written message")
        await c7.close()

        # ---- "Continue with Google" ----
        GSI_STUB = "window.google={accounts:{id:{initialize(c){window.__gcfg=c}, renderButton(el){el.innerHTML='<button type=button id=fake-g>Google</button>'}, prompt(){}}}};"
        async def gsi(route):
            await route.fulfill(status=200, headers={"content-type": "text/javascript"}, body=GSI_STUB)
        # 1. the Android app: the phone's Google sheet fails (not set up) → the browser opens google.html instead
        c3 = await browser.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
        await c3.add_init_script("localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');")
        p3 = await c3.new_page()
        await p3.route("**/*workers.dev/**", fake_server); await p3.route("**/api.aladhan.com/**", lambda r: r.abort()); await p3.route("**/accounts.google.com/**", gsi)
        await p3.goto(BASE); await p3.wait_for_timeout(1200)
        await p3.evaluate("""(async()=>{window.MustatarAndroid={}; window.__opened=null;
            window.JundNative={googleSignIn: async()=>({ok:false, error:'GetCredentialCustomException: [28444] Developer console is not set up correctly.'}),
                               openBrowser: async u=>{window.__opened=u; return {ok:true}}};
            const d=document.createElement('div'); d.id='gtest'; document.body.appendChild(d); window.__mounted=await JundAcct.mountGoogle(d);})()""")
        await p3.wait_for_timeout(500)
        await p3.evaluate("document.querySelector('#gtest .g-native').click()")
        await p3.wait_for_timeout(800)
        opened = await p3.evaluate("window.__opened")
        st = await p3.evaluate("document.querySelector('#acct-status').textContent")
        check(bool(opened) and "/google.html?from=app" in opened and "browser" in st.lower(), f"in the Android app, when the phone's Google sheet is not set up, Google opens in the browser ({opened}; '{st}')")
        await p3.evaluate("window.JundNative.googleSignIn=async()=>({ok:false, error:'cancelled'}); window.__opened=null; document.querySelector('#gtest .g-native').click()")
        await p3.wait_for_timeout(500)
        check(await p3.evaluate("window.__opened === null"), "cancelling Google's sheet does not open the browser")
        await c3.close()
        # 2. google.html from the app: after Google, the way back to the app carries the sign-in
        c4 = await browser.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
        p4 = await c4.new_page(); e4 = []
        p4.on("pageerror", lambda e: e4.append(str(e)))
        await p4.route("**/*workers.dev/**", fake_server); await p4.route("**/accounts.google.com/**", gsi)
        await p4.goto(BASE + "google.html?from=app&lang=en"); await p4.wait_for_timeout(1500)
        check(await p4.evaluate("!!document.querySelector('#g #fake-g') && window.__gcfg?.client_id === 'test-client.apps.googleusercontent.com'"), "google.html shows Google's button with the app's Google client")
        await p4.evaluate("window.__gcfg.callback({credential: 'fake-google-id-token'})"); await p4.wait_for_timeout(1200)
        back = await p4.evaluate("document.querySelector('#back').getAttribute('href') || ''")
        import base64 as _b64, re as _re
        tok = None
        m = _re.search(r"t=([A-Za-z0-9_-]+)", back)
        if m:
            raw = m.group(1); raw += "=" * (-len(raw) % 4)
            try: tok = json.loads(_b64.urlsafe_b64decode(raw))["token"]
            except Exception: tok = None
        check(back.startswith("intent://signin?t=") and "package=app.mustatar" in back and tok == "test-token-1234567890", f"after Google, the way back to the app carries the sign-in ({back[:60]}…)")
        check(not e4, "google.html has no errors " + "; ".join(e4[:2]))
        await c4.close()
        # 3. the app receives the sign-in in its address (from the Android app, or google.html in a normal browser)
        c5 = await browser.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
        p5 = await c5.new_page()
        await p5.route("**/*workers.dev/**", fake_server); await p5.route("**/accounts.google.com/**", gsi); await p5.route("**/api.aladhan.com/**", lambda r: r.abort())
        payload = _b64.urlsafe_b64encode(json.dumps({"token": "test-token-1234567890", "user": {"name": "Test User", "email": "test@example.com"}, "created": False}).encode()).decode().rstrip("=")
        await p5.goto(BASE + "#signin=" + payload); await p5.wait_for_timeout(1800)
        got = await p5.evaluate("({t: JSON.parse(localStorage.getItem('jn_mstToken')||'null'), hash: location.hash, opening: !!document.querySelector('#op-skip')})")
        check(got["t"] == "test-token-1234567890" and got["hash"] == "" and not got["opening"], f"the app keeps the Google sign-in from its address, cleans the address, and skips the sign-in screen ({got})")
        await p5.evaluate("document.querySelectorAll('.wl').forEach(x=>x.remove()); document.body.classList.remove('vx-open'); JN.show('me')"); await p5.wait_for_timeout(400)
        check(await p5.evaluate("/Test User/.test(document.querySelector('#screen-me').innerText) && !document.querySelector('#me-signin')"), "Me shows the signed-in Google account")
        # the app already open on the same page: only the part after # changes
        await p5.evaluate("localStorage.removeItem('jn_mstToken'); location.hash = '#signin=" + payload + "'"); await p5.wait_for_timeout(1200)
        check(await p5.evaluate("JSON.parse(localStorage.getItem('jn_mstToken')||'null') === 'test-token-1234567890' && location.hash === ''"), "the sign-in also arrives while the app is already open")
        # google.html opened in a normal browser goes back to the website, signed in
        await p5.goto(BASE + "google.html?lang=en"); await p5.wait_for_timeout(1200)
        await p5.evaluate("localStorage.removeItem('jn_mstToken'); window.__gcfg.callback({credential: 'fake-google-id-token'})"); await p5.wait_for_timeout(2500)
        check(await p5.evaluate("JSON.parse(localStorage.getItem('jn_mstToken')||'null') === 'test-token-1234567890' && location.pathname.endsWith('/')"), "google.html in a normal browser signs in the website")
        await c5.close()
        # 4. the website's opening screen: Continue with Google signs in and goes on to the first questions
        c6 = await browser.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
        p6 = await c6.new_page()
        await p6.route("**/*workers.dev/**", fake_server); await p6.route("**/accounts.google.com/**", gsi); await p6.route("**/api.aladhan.com/**", lambda r: r.abort())
        await p6.goto(BASE); await p6.wait_for_timeout(1800)
        check(await p6.evaluate("!!document.querySelector('#op-google:not([hidden]) #fake-g')"), "the opening screen shows Continue with Google")
        await p6.evaluate("window.__gcfg.callback({credential: 'fake-google-id-token'})"); await p6.wait_for_timeout(1500)
        got = await p6.evaluate("({t: JSON.parse(localStorage.getItem('jn_mstToken')||'null'), q: !!document.querySelector('.wl .wl-dots'), op: !!document.querySelector('#op-skip')})")
        check(got["t"] == "test-token-1234567890" and got["q"] and not got["op"], f"Continue with Google on the opening screen signs in and goes on ({got})")
        await c6.close()
        # a new version while the person is busy: no pop-up, a dot on Me and a quiet line; it updates on the next tab change
        c8 = await browser.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True)
        await c8.add_init_script("localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');")
        p8 = await c8.new_page()
        await p8.route("**/*workers.dev/**", fake_server); await p8.route("**/api.aladhan.com/**", lambda r: r.abort())
        await p8.goto(BASE); await p8.wait_for_timeout(2500); await p8.reload(); await p8.wait_for_timeout(2500)
        await p8.evaluate("document.querySelector('#as-text').value='half-written'; document.querySelector('#as-text').focus(); navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))")
        await p8.wait_for_timeout(300)
        check(await p8.evaluate("document.body.classList.contains('has-update') && !document.querySelector('.update-bar:not([style*=none])')?.offsetParent"), "a new version shows only a small dot on Me, no pop-up")
        await p8.evaluate("JN.show('me')"); await p8.wait_for_timeout(300)
        check(await p8.evaluate("!!document.querySelector('#me-upd')"), "Me has a quiet 'new version' line with Restart")
        await p8.evaluate("document.querySelector('#as-text').value=''; document.activeElement.blur()")
        waiter = asyncio.ensure_future(p8.wait_for_event("load", timeout=8000))
        await p8.click('.tabbar [data-nav="library"]')
        try: await waiter; ok = True
        except Exception: ok = False
        await p8.wait_for_timeout(1500)
        check(ok and await p8.evaluate("!document.querySelector('#screen-library').hidden"), "the next tap on the bottom bar updates and opens that screen")
        await c8.close()

        await browser.close()

    print(f"\n{len(failures)} problem(s)" if failures else "\nAll checks passed")
    sys.exit(1 if failures else 0)


asyncio.run(main())
