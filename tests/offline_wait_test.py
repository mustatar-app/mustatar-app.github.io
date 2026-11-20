"""No internet: a recording waits (nothing lost) and is transcribed by itself when the internet is back.
Run: python3 tests/offline_wait_test.py"""
import subprocess, os, sys
if not os.path.exists("/tmp/link-test.mp3"):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=2", "-q:a", "9", "/tmp/link-test.mp3", "-y"], check=True)
fails = []
import asyncio, json
from playwright.async_api import async_playwright
async def srv(route):
    req = route.request
    cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}
    if req.method == "OPTIONS": return await route.fulfill(status=204, headers=cors)
    if req.method == "GET": return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"}, body='{"ok":true,"app":"mustatar","key":true}')
    ev = {"choices": [{"index": 0, "delta": {"content": "درس اليوم عن الصيام"}, "finish_reason": "stop"}]}
    await route.fulfill(status=200, headers={**cors, "content-type": "text/event-stream"}, body="data: " + json.dumps(ev, ensure_ascii=False) + "\n\ndata: [DONE]\n\n")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); c = await b.new_context(service_workers="block")
        await c.add_init_script("localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_autoMake','false');localStorage.setItem('jn_autoCorrect','false');localStorage.setItem('jn_plan',JSON.stringify('test'));")
        await c.route("**/api.aladhan.com/**", lambda r: r.abort()); await c.route("**/jund-notes-ai.dawajund.workers.dev/**", srv)
        pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto((sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/")); await pg.wait_for_timeout(1200)
        await pg.evaluate("JN.show('new')")
        await c.set_offline(True)
        await pg.set_input_files("#file", "/tmp/link-test.mp3"); await pg.wait_for_timeout(2500)
        a = await pg.evaluate("__jn.pending().map(p => [p.status, !!p.bad, (p.text||'').slice(0,20)])"); print("offline:", a)
        if not (a and "Waiting for the internet" in a[0][0] and not a[0][1]): fails.append("waits without internet")
        await c.set_offline(False); await pg.evaluate("dispatchEvent(new Event('online'))"); await pg.wait_for_timeout(6000)
        a = await pg.evaluate("__jn.pending().map(p => [p.status, !!p.bad, (p.text||'').slice(0,20)])"); print("online again:", a, errs[:2])
        if not (a and a[0][2]) or errs: fails.append("transcribed when back online")
        await b.close()
asyncio.run(main())
print("FAIL " + ", ".join(fails) if fails else "ALL PASSED"); sys.exit(1 if fails else 0)
