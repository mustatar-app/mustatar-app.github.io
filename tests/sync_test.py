"""Check of signing in inside the app and syncing between two phones, against the server on this computer.

Phone 1 already has a lesson and a calendar event. The person creates an account in Settings with a
pretend passkey; the lesson and the event must move into their space. Phone 2 signs in with the same
passkey and must receive both. A lesson deleted on phone 2 must disappear from phone 1 after it syncs.

Run:  (cd server && npx wrangler dev --port 8787) &   python3 -m http.server 8765 &
      python3 tests/sync_test.py http://localhost:8765/ http://127.0.0.1:8787
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
API = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8787"
LESSON = {"id": "L-test-1", "date": "2026-11-17T09:00:00.000Z", "subject": {"id": "s1", "name": "Meetings"}, "unit": "Weekly meeting",
          "notes": {"title": "اجتماع الفريق", "sections": []}, "transcript": "Launch on Friday."}
EVENT = {"id": "E-test-1", "title": "Send the minutes", "date": "2026-11-20", "time": "", "type": "task", "repeat": "none"}
COUNT = "new Promise(r=>{const q=indexedDB.open('jund-notes');q.onsuccess=()=>{try{const t=q.result.transaction('lessons').objectStore('lessons').getAll();t.onsuccess=()=>r(t.result.map(l=>l.id))}catch(e){r([])}}})"


async def phone(browser, creds=None):
    ctx = await browser.new_context(viewport={"width": 412, "height": 915}, service_workers="block")
    page = await ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:200]))
    await page.route("**/server.json*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"url": API})))
    await page.route("**/api.aladhan.com/**", lambda r: r.abort())
    cdp = await ctx.new_cdp_session(page)
    await cdp.send("WebAuthn.enable")
    auth = (await cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {"protocol": "ctap2", "transport": "internal",
            "hasResidentKey": True, "hasUserVerification": True, "isUserVerified": True}}))["authenticatorId"]
    for c in creds or []:
        await cdp.send("WebAuthn.addCredential", {"authenticatorId": auth, "credential": c})
    return page, cdp, auth, errors


async def open_settings(page):
    await page.goto(BASE, wait_until="load")
    await page.wait_for_timeout(2000)
    for _ in range(6):
        closed = await page.evaluate("""()=>{const o=[...document.querySelectorAll('body > *')].find(e=>{const s=getComputedStyle(e);return s.position==='fixed'&&s.display!=='none'&&e.offsetHeight>300&&/wl|welcome/i.test(e.className+e.id)}); if(!o) return false; const bs=[...o.querySelectorAll('button')]; (bs.find(b=>/تخط|Skip/i.test(b.innerText))||bs[0])?.click(); return true}""")
        if not closed:
            break
        await page.wait_for_timeout(400)
    await page.evaluate("JN.show('settings')")
    await page.wait_for_timeout(600)


async def wait_status(page, text, secs=20):
    for _ in range(secs * 2):
        s = await page.evaluate("document.querySelector('#acct-status').innerText")
        if text in s:
            return s
        await page.wait_for_timeout(500)
    return await page.evaluate("document.querySelector('#acct-status').innerText")


async def main():
    failures = []
    def check(ok, what):
        print(("PASS " if ok else "FAIL ") + what)
        if not ok:
            failures.append(what)

    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # phone 1: notes already on the phone, then a new account
        p1, cdp1, auth1, err1 = await phone(browser)
        await p1.goto(BASE, wait_until="load")
        await p1.evaluate(f"""localStorage.setItem('jn_events', JSON.stringify([{json.dumps(EVENT)}])); localStorage.setItem('jn_eventsSaved', '{1763370000000}');""")
        await p1.evaluate(f"""new Promise(r=>{{const q=indexedDB.open('jund-notes',1);q.onupgradeneeded=()=>q.result.createObjectStore('lessons',{{keyPath:'id'}});q.onsuccess=()=>{{const t=q.result.transaction('lessons','readwrite');t.objectStore('lessons').put({json.dumps(LESSON)});t.oncomplete=()=>r(1)}}}})""")
        await open_settings(p1)
        check(await p1.evaluate("!document.querySelector('#acct-out').hidden"), "Settings shows the account card to someone signed out")
        await p1.fill("#acct-name", "Junaid")
        await p1.click("#acct-create")
        s = await wait_status(p1, "private space")
        check("account is ready" in s or "Saved in your own private space" in s, "creating an account with a passkey works in the app")
        check(await p1.evaluate("document.querySelector('#acct-who').innerText") == "Junaid", "the app shows who is signed in")
        for _ in range(20):
            if await p1.evaluate("JSON.stringify(localStorage.getItem('jn_mstPending'))") in ('"{}"', 'null'):
                break
            await p1.wait_for_timeout(500)
        tok = await p1.evaluate("JSON.parse(localStorage.getItem('jn_mstToken'))")
        r = await p1.evaluate(f"fetch({json.dumps(API)}+'/space/pull?since=0',{{headers:{{authorization:'Bearer '+{json.dumps(tok)}}}}}).then(r=>r.json())")
        ids = {i["id"] for i in r["items"]}
        check("lesson:L-test-1" in ids, "the lesson already on the phone moved into the space")
        check("data:calendar" in ids, "the calendar moved into the space")

        # phone 2: same passkey, empty phone
        creds = (await cdp1.send("WebAuthn.getCredentials", {"authenticatorId": auth1}))["credentials"]
        p2, cdp2, auth2, err2 = await phone(browser, creds)
        await open_settings(p2)
        await p2.click("#acct-signin")
        s = await wait_status(p2, "sync")
        check("in sync" in s or "private space" in s, "signing in on a second phone works")
        check("L-test-1" in await p2.evaluate(COUNT), "the lesson arrives on the second phone")
        cal = await p2.evaluate("JSON.parse(localStorage.getItem('jn_mstData:calendar'))")
        check(bool(cal and cal.get("events")) and cal["events"][0]["title"] == "Send the minutes", "the calendar arrives on the second phone")

        # delete on phone 2 → gone on phone 1
        await p2.evaluate("JN.removeLesson ? JN.removeLesson('L-test-1') : null")
        has_remove = await p2.evaluate("typeof JN.removeLesson === 'function'")
        if not has_remove:
            await p2.evaluate("""(async()=>{ await new Promise(r=>{const q=indexedDB.open('jund-notes');q.onsuccess=()=>{const t=q.result.transaction('lessons','readwrite');t.objectStore('lessons').delete('L-test-1');t.oncomplete=()=>r(1)}}); JN.cloud.remove('L-test-1'); })()""")
        await p2.wait_for_timeout(4000)
        await p1.evaluate("document.querySelector('#acct-sync').click()")
        await wait_status(p1, "In sync")
        check("L-test-1" not in await p1.evaluate(COUNT), "a lesson deleted on one phone disappears from the other")

        await p1.evaluate("window.confirm = () => true; document.querySelector('#acct-signout').click()")
        await p1.wait_for_timeout(500)
        check(await p1.evaluate("!document.querySelector('#acct-out').hidden"), "signing out works")
        check(not err1 and not err2, "no errors on either phone: " + "; ".join((err1 + err2)[:3]))
        await browser.close()

    print(f"\n{len(failures)} problem(s)" if failures else "\nAll checks passed")
    sys.exit(1 if failures else 0)


asyncio.run(main())
