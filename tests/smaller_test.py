"""When the server's main AI (Cloudflare) is used up for the day, long texts are too big for the backup (Groq) in one go.
The server then answers "smaller" with the size it can take, and the app must cut the text and still make the whole note.
Run: python3 -m http.server 8765 &  then  python3 tests/smaller_test.py http://localhost:8765/"""
import asyncio, json, sys, importlib.util, os
from playwright.async_api import async_playwright
import types
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
a = types.SimpleNamespace(); _src = open(os.path.join(os.path.dirname(__file__), "app_test.py")).read().split("async def main")[0]
exec(_src, a.__dict__)  # the stand-in server of app_test.py, without running its checks
MAX = 9000
seen = {"smaller": 0, "ok": 0, "biggest_ok": 0}
# a long lecture: about 75,000 characters (an hour and a half of talk), all different sentences
LECTURE = " ".join(f"Point {i}: the teacher explained rule number {i} and gave the example of case {i * 7}, then asked the students to repeat it." for i in range(700))

async def server(route):
    req = route.request
    cors = {"access-control-allow-origin": BASE.rstrip("/"), "access-control-allow-headers": "content-type, x-mst-stream, authorization"}
    if req.method == "POST" and "/write" in req.url:
        b = json.loads(req.post_data or "{}")
        size = len(json.dumps(b.get("messages") or b.get("user") or b.get("contents") or "", ensure_ascii=False))
        if size > MAX:
            seen["smaller"] += 1; print("   smaller:", size, str(b.get("system", ""))[:70].replace("\n", " "), flush=True)
            return await route.fulfill(status=429, headers={**cors, "content-type": "application/json"}, body=json.dumps({"code": "smaller", "maxChars": MAX - 1500, "status": 429}))
        seen["ok"] += 1; seen["biggest_ok"] = max(seen["biggest_ok"], size)
    return await a.fake_server(route)

async def main():
    fails = []
    def check(ok, what): print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
        await ctx.add_init_script("localStorage.setItem('jn_welcomed','1');localStorage.setItem('welcomed','1');")
        page = await ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        await page.route("**/*workers.dev/**", server); await page.route("**/api.aladhan.com/**", lambda r: r.abort())
        await page.goto(BASE, wait_until="load"); await page.wait_for_timeout(2000)
        for _ in range(6):
            c = await page.evaluate("""()=>{const o=[...document.querySelectorAll('body > *')].find(e=>{const s=getComputedStyle(e);return s.position==='fixed'&&s.display!=='none'&&e.offsetHeight>300&&/wl|welcome/i.test(e.className+e.id)}); if(!o) return false; const bs=[...o.querySelectorAll('button')]; (bs.find(b=>/تخط|Skip/i.test(b.innerText))||bs[0])?.click(); return true}""")
            if not c: break
            await page.wait_for_timeout(300)
        await page.evaluate("window.JN.show('new')"); await page.wait_for_timeout(800)
        await page.evaluate("document.querySelector('#transcript').closest('details').open = true")
        await page.evaluate("(()=>{const d=document.querySelector('#custom-subject'); if(d){d.closest('label').hidden=false}})()")
        try: await page.fill("#custom-subject", "Lectures")
        except Exception: pass
        await page.fill("#transcript", LECTURE); await page.fill("#unit", "Long lecture")
        await page.click("#make")
        saved = []
        for _ in range(int(os.environ.get('WAIT', 180))):
            await page.wait_for_timeout(1000)
            saved = await page.evaluate("""new Promise(r=>{const q=indexedDB.open('jund-notes');q.onsuccess=()=>{try{const t=q.result.transaction('lessons').objectStore('lessons').getAll();t.onsuccess=()=>r(t.result.filter(l=>!l.draft).map(l=>l.unit))}catch(e){r([])}};q.onerror=()=>r([])})""")
            if saved: break
            if _ % 10 == 9: print("   screen:", (await page.evaluate("[...document.querySelectorAll('#make-status,#status,.status,[id*=status]')].map(e=>e.innerText).filter(Boolean).join(' | ')"))[:200].replace("\n", " "), flush=True)
            print("server calls:", seen)
        check(seen["smaller"] >= 1, "the server said 'smaller' at least once")
        check(bool(saved), "the long lecture still became a saved note" + ("" if saved else " — screen: " + (await page.evaluate("(document.querySelector('#status')||document.body).innerText"))[:200].replace("\n", " ")))
        check(seen["biggest_ok"] <= MAX, f"every part that was written fits the backup ({seen['biggest_ok']} ≤ {MAX})")
        check(not errors, "no page errors: " + "; ".join(errors[:2]))
        await br.close()
    sys.exit(1 if fails else 0)
asyncio.run(main())
