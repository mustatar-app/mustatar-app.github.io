"""Check of step 2, part 4 in a phone-sized browser, with no internet needed:

1. Moving to the new address: the old address (mustatar-app.github.io) and the new one
   (mustatar.dawajund.workers.dev) are both served from this folder. A phone has a note and a habit at the
   old address; "Move my notes" must carry them to the new address.
2. Recordings: the sound is deleted as soon as the text is ready, unless "Keep the audio" is ticked.
3. The privacy page opens, in English and Arabic.

Run:  python3 tests/move_test.py
"""
import asyncio, json, mimetypes, os, sys
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD, NEW = "https://mustatar-app.github.io", "https://mustatar.dawajund.workers.dev"
LESSON = {"id": "L-move-1", "date": "2026-11-17T09:00:00.000Z", "subject": {"id": "s1", "name": "Meetings"}, "unit": "Weekly meeting",
          "notes": {"title": "اجتماع الفريق", "sections": []}, "transcript": "Launch on Friday."}
COUNT = "new Promise(r=>{const q=indexedDB.open('jund-notes');q.onsuccess=()=>{try{const t=q.result.transaction('lessons').objectStore('lessons').getAll();t.onsuccess=()=>r(t.result.map(l=>l.id))}catch(e){r([])}}})"


async def serve(route):
    url = route.request.url
    path = url.split("://", 1)[1].split("/", 1)[1] if "/" in url.split("://", 1)[1] else ""
    path = path.split("?")[0].split("#")[0] or "index.html"
    if path.endswith("/"):
        path += "index.html"
    f = os.path.join(ROOT, path)
    if path == "server.json":
        return await route.fulfill(status=200, content_type="application/json", body=json.dumps({"url": "https://example.invalid"}))
    if not os.path.isfile(f):
        return await route.fulfill(status=404, body="not found")
    ctype = mimetypes.guess_type(f)[0] or "application/octet-stream"
    if f.endswith(".mjs"):
        ctype = "text/javascript"
    await route.fulfill(status=200, content_type=ctype, body=open(f, "rb").read())


async def main():
    failures = []
    def check(ok, what):
        print(("PASS " if ok else "FAIL ") + what)
        if not ok:
            failures.append(what)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 412, "height": 915}, service_workers="block")
        await ctx.route(OLD + "/**", serve)
        await ctx.route(NEW + "/**", serve)
        await ctx.route("**/example.invalid/**", lambda r: r.abort())
        await ctx.route("**/api.aladhan.com/**", lambda r: r.abort())
        errors = []
        old = await ctx.new_page()
        old.on("pageerror", lambda e: errors.append("old: " + str(e)[:200]))
        await old.goto(OLD + "/", wait_until="load")
        await old.evaluate("localStorage.setItem('jn_habits', JSON.stringify([{id:'h1', name:'Water 2.5 L'}])); localStorage.setItem('jn_welcomed', 'true'); localStorage.setItem('jn_opened', 'true')")
        await old.evaluate(f"""new Promise(r=>{{const q=indexedDB.open('jund-notes');q.onsuccess=()=>{{const t=q.result.transaction('lessons','readwrite');t.objectStore('lessons').put({json.dumps(LESSON)});t.oncomplete=()=>r(1)}}}})""")
        await old.reload(wait_until="load")
        await old.wait_for_timeout(1500)
        check(await old.evaluate("!!document.querySelector('.move-banner #move-go')"), "the old address shows 'Mustatar has a new address'")

        async with ctx.expect_page() as popup:
            await old.click("#move-go")
        new = await popup.value
        new.on("pageerror", lambda e: errors.append("new: " + str(e)[:200]))
        await new.wait_for_load_state("load")
        msg = ""
        for _ in range(30):
            msg = await old.evaluate("document.querySelector('#move-msg').innerText")
            if "✓" in msg:
                break
            await old.wait_for_timeout(500)
        check("✓ Moved 1" in msg or "✓ Moved ١" in msg, "the old page confirms the notes moved")
        await new.wait_for_timeout(2500)
        check("L-move-1" in await new.evaluate(COUNT), "the note is at the new address")
        habits = await new.evaluate("JSON.parse(localStorage.getItem('jn_habits') || '[]')")
        check(any(h.get("name") == "Water 2.5 L" for h in habits), "the habits and settings are at the new address")
        check(await new.evaluate("!document.querySelector('.move-banner #move-go')"), "the new address does not ask to move")

        # recordings: the sound goes as soon as the text is ready
        page = new
        r1 = await page.evaluate("""(async () => {
            const audio = new Blob([new Uint8Array(1000)], { type: 'audio/mpeg' });
            const p = { txid: 'tx-test-1', unit: 'Test meeting', file: new File([audio], 'a.mp3', { type: 'audio/mpeg' }) };
            await JundRecs.started(p); await JundRecs.finished({ ...p, text: 'Launch on Friday.' }, '');
            const db = await new Promise(r => { const q = indexedDB.open('mustatar-tx', 1); q.onsuccess = () => r(q.result); });
            return await new Promise(r => { const g = db.transaction('items').objectStore('items').get('tx-test-1'); g.onsuccess = () => r({ audio: !!g.result.audio, gone: !!g.result.audioGone, text: g.result.text }); });
        })()""")
        check(r1["text"] == "Launch on Friday." and not r1["audio"] and r1["gone"], "a recording's sound is deleted once its text is ready, and the text is kept")
        r2 = await page.evaluate("""(async () => {
            const audio = new Blob([new Uint8Array(1000)], { type: 'audio/mpeg' });
            const p = { txid: 'tx-test-2', unit: 'Keep this one', file: new File([audio], 'b.mp3', { type: 'audio/mpeg' }) };
            await JundRecs.started(p);
            const db = await new Promise(r => { const q = indexedDB.open('mustatar-tx', 1); q.onsuccess = () => r(q.result); });
            const get = () => new Promise(r => { const g = db.transaction('items').objectStore('items').get('tx-test-2'); g.onsuccess = () => r(g.result); });
            const it = await get(); it.keep = true;
            await new Promise(r => { const t = db.transaction('items', 'readwrite'); t.objectStore('items').put(it); t.oncomplete = r; });
            await JundRecs.finished({ ...p, text: 'Kept.' }, '');
            return !!(await get()).audio;
        })()""")
        check(r2 is True, "with 'Keep the audio' ticked, the sound is kept")

        priv = await ctx.new_page()
        await priv.goto(NEW + "/privacy.html", wait_until="load")
        t = await priv.evaluate("document.body.innerText")
        check("deleted as soon as the text is ready" in t and "الخصوصية" in t, "the privacy page opens, in English and Arabic")
        check(not errors, "no errors: " + "; ".join(errors[:3]))
        await browser.close()

    print(f"\n{len(failures)} problem(s)" if failures else "\nAll checks passed")
    sys.exit(1 if failures else 0)


asyncio.run(main())
