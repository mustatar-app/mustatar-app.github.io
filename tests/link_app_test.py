"""Paste any link → notes, in the app (the server is faked here; tests/link_test.mjs checks the server).
Run: python3 tests/link_app_test.py http://localhost:8765/"""
import asyncio, json, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
import subprocess, os
MP3 = "/tmp/link-test.mp3"
if not os.path.exists(MP3):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=2", "-q:a", "9", MP3, "-y"], check=True)

async def srv(route):
    req = route.request
    cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-mst-stream, authorization", "access-control-expose-headers": "x-link-name, x-link-type, content-length"}
    if req.method == "OPTIONS": return await route.fulfill(status=204, headers=cors)
    if req.method == "GET": return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"}, body='{"ok":true,"app":"mustatar","key":true,"link":true}')
    if req.url.endswith("/link"):
        u = json.loads(req.post_data)["url"]
        if "talk.mp3" in u:
            return await route.fulfill(status=200, headers={**cors, "content-type": "audio/mpeg", "x-link-type": "audio/mpeg", "x-link-name": "Friday%20talk.mp3"}, body=open(MP3, "rb").read())
        if "blog" in u:
            return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"}, body=json.dumps({"kind": "text", "title": "How to study", "text": "Review the lesson the same day. " * 20}))
        if "tiktok" in u:
            return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"}, body=json.dumps({"kind": "blocked", "site": "TikTok"}))
        return await route.fulfill(status=400, headers={**cors, "content-type": "application/json"}, body=json.dumps({"code": "private"}))
    # anything else (hearing, writing): a short answer
    ev = {"choices": [{"index": 0, "delta": {"content": "نص"}, "finish_reason": "stop"}]}
    await route.fulfill(status=200, headers={**cors, "content-type": "text/event-stream"}, body="data: " + json.dumps(ev) + "\n\ndata: [DONE]\n\n")

async def run(b, lang):
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
    await c.add_init_script(f"localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_plan',JSON.stringify('test'));localStorage.setItem('jn_autoMake','false');")
    await c.route("**/api.aladhan.com/**", lambda r: r.abort())
    await c.route("**/jund-notes-ai.dawajund.workers.dev/**", srv)
    pg = await c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1200)
    await pg.evaluate("JN.show('new')"); await pg.wait_for_timeout(300)
    ph = await pg.get_attribute("#yt", "placeholder")
    check(("Drive" in ph) if lang == "en" else ("درايف" in ph), f"[{lang}] the box says it takes any link ({ph})")
    await pg.fill("#yt", "https://cdn.example.org/talk.mp3"); await pg.click("#yt-go")
    await pg.wait_for_function("(window.__jn?.pending?.() || []).length > 0", timeout=15000)
    p = await pg.evaluate("__jn.pending().map(x => ({unit: x.unit, media: !!x.media, size: x.file?.size || 0}))")
    check(p and p[0]["unit"] == "Friday talk" and p[0]["media"] and p[0]["size"] > 1000, f"[{lang}] a recording's link becomes a recording to transcribe ({p})")
    await pg.fill("#yt", "https://blog.example.org/post"); await pg.click("#yt-go")
    await pg.wait_for_function("(__jn.pending() || []).some(x => x.unit === 'How to study')", timeout=15000)
    p = await pg.evaluate("__jn.pending().find(x => x.unit === 'How to study')")
    check(bool(p) and "Review the lesson" in (p.get("text") or ""), f"[{lang}] a web page's words come in to make notes from")
    await pg.fill("#yt", "https://www.tiktok.com/@a/video/1"); await pg.click("#yt-go"); await pg.wait_for_timeout(1200)
    e = await pg.evaluate("(() => { const e = document.querySelector('#new-error'); return e.hidden ? '' : e.textContent; })()")
    check(("TikTok" in e and ("Save the video" in e if lang == "en" else "احفظ" in e)), f"[{lang}] TikTok gets an honest answer: {e[:90]}")
    await pg.fill("#yt", "https://drive.google.com/file/d/xyz/view"); await pg.click("#yt-go"); await pg.wait_for_timeout(1200)
    e = await pg.evaluate("document.querySelector('#new-error').textContent")
    check(("private" in e) if lang == "en" else ("خاص" in e), f"[{lang}] a private link says how to fix it: {e[:90]}")
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
