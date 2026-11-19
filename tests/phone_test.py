"""The real Android app on an Android phone emulator (GitHub Actions): Studio save and share, a video,
the carousel, sharing words, reading aloud, and printing a note — checked in the phone itself
(the gallery's database, the share sheet on screen), with screenshots.

The test build opens the app's pages from the test computer (http://localhost:8765, through adb reverse),
so the pages being tested are the ones in this change, not the live site.
Run by .github/workflows/phone-test.yml:  python3 tests/phone_test.py
"""
import json, os, re, subprocess, sys, time, urllib.request
import websocket  # pip install websocket-client

PKG = "app.mustatar"
SHOTS = "phone-shots"
os.makedirs(SHOTS, exist_ok=True)
failures = []

def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what, flush=True)
    if not ok:
        failures.append(what)

def adb(*args, check_ok=False):
    r = subprocess.run(["adb", *args], capture_output=True, text=True)
    if check_ok and r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout

def shot(name):
    png = subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True).stdout
    with open(f"{SHOTS}/{name}.png", "wb") as f:
        f.write(png)
    # also into the log, small, so the screenshots can be seen without downloading anything
    try:
        import base64, io
        from PIL import Image
        im = Image.open(io.BytesIO(png)).convert("RGB")
        im.thumbnail((360, 800))
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=60)
        b = base64.b64encode(buf.getvalue()).decode()
        for i in range(0, len(b), 8000):
            print(f"SHOT {name} {i // 8000} {b[i:i + 8000]}")
    except Exception as e:
        print("     (screenshot not printed:", e, ")")

def media(uri):
    out = adb("shell", "content", "query", "--uri", uri, "--projection", "_display_name:relative_path:_size")
    return [l for l in out.splitlines() if "_display_name=" in l]

def on_screen():
    """the screen in front: its activity name (the share sheet is Android's ChooserActivity)"""
    out = adb("shell", "dumpsys", "activity", "activities")
    lines = [l for l in out.splitlines() if "ResumedActivity" in l]
    return " ".join(lines) or out[:2000]

class Page:
    """the app's page, through the web view's debugging connection (it reconnects if the page reloads)"""
    def __init__(self):
        self.ws = None
        self.n = 0
        self.connect()

    def connect(self):
        pid = ""
        for _ in range(30):
            pid = adb("shell", "pidof", PKG).strip().split(" ")[0]
            if pid:
                break
            time.sleep(1)
        adb("forward", "--remove-all")
        adb("forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}")
        pages = []
        for _ in range(40):
            try:
                pages = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5).read())
                pages = [p for p in pages if p.get("type") == "page" and "localhost:8765" in p.get("url", "")]
                if pages:
                    break
            except Exception:
                pass
            time.sleep(1)
        print("     page:", pages[0].get("url") if pages else "none", flush=True)
        if self.ws:
            try: self.ws.close()
            except Exception: pass
        self.ws = websocket.create_connection(pages[0]["webSocketDebuggerUrl"], timeout=120, suppress_origin=True)

    def js(self, expr, timeout=60, again=True):
        self.n += 1
        try:
            self.ws.settimeout(timeout + 5)
            self.ws.send(json.dumps({"id": self.n, "method": "Runtime.evaluate",
                                     "params": {"expression": expr, "awaitPromise": True, "returnByValue": True, "timeout": timeout * 1000}}))
            while True:
                m = json.loads(self.ws.recv())
                if m.get("id") == self.n:
                    r = m.get("result", {})
                    if "exceptionDetails" in r:
                        return {"error": r["exceptionDetails"].get("exception", {}).get("description", "error")[:300]}
                    return r.get("result", {}).get("value")
        except Exception as e:
            if not again:
                raise
            print("     (connection lost:", type(e).__name__, "- reconnecting)", flush=True)
            time.sleep(3)
            self.connect()
            return self.js(expr, timeout, again=False)

def wait(page, expr, secs=30):
    for _ in range(secs * 2):
        v = page.js(expr)
        if v and not (isinstance(v, dict) and "error" in v):
            return v
        time.sleep(0.5)
    return None

LOAD_FILE = """(async (url, name, type) => {
  const b = await (await fetch(url)).blob();
  const dt = new DataTransfer(); dt.items.add(new File([b], name, { type }));
  const input = document.querySelector('#st-media'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  return b.size;
})"""

def back_to_app():
    for _ in range(3):
        if "MainActivity" in on_screen():
            return
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(1.5)

def main():
    # the app asks for notifications at its first start; answer yes now, so no question covers the screen
    for perm in ["POST_NOTIFICATIONS", "ACCESS_COARSE_LOCATION", "RECORD_AUDIO"]:
        adb("shell", "pm", "grant", PKG, "android.permission." + perm)
    adb("shell", "am", "start", "-n", f"{PKG}/sa.jund.notes.MainActivity", "--es", "testHome", "http://localhost:8765", check_ok=True)
    time.sleep(8)
    shot("00-start")
    page = Page()
    check(wait(page, "document.readyState === 'complete' && !!window.JundNative"), "the app opens the pages, and its save, share and voice are connected")
    # at the very first start the app's offline copy is put in place, and the page reloads once: wait for that
    wait(page, "!!navigator.serviceWorker?.controller", 40)
    time.sleep(4)
    wait(page, "document.readyState === 'complete' && !!window.JundNative", 20)
    page.js("""(()=>{for(let i=0;i<6;i++){const o=[...document.querySelectorAll('body > *')].find(e=>{const s=getComputedStyle(e);return s.position==='fixed'&&s.display!=='none'&&e.offsetHeight>300&&/wl|welcome/i.test(e.className+e.id)}); if(!o) break; const bs=[...o.querySelectorAll('button')]; (bs.find(b=>/تخط|Skip|Continue without|بدون حساب/i.test(b.innerText))||bs[0])?.click();} return true})()""")
    time.sleep(1)
    def open_studio():
        page.js("document.body.classList.remove('off-studio'); (document.querySelector('.tabbar [data-nav=\"studio\"]') || document.querySelector('[data-nav-to=\"studio\"]'))?.click(); true")
        if not wait(page, "!!document.querySelector('#st-media')", 5):
            page.js("location.href = '/?view=studio'; true")
            time.sleep(4)
            wait(page, "!!document.querySelector('#st-media')", 20)
    open_studio()
    check(page.js("!!document.querySelector('#st-media')"), "Studio opens")
    shot("01-studio")

    # 1. a photo with words on it → Save image → the phone's gallery
    size = page.js(LOAD_FILE + "('/tests/samples/photo.jpg', 'photo.jpg', 'image/jpeg')")
    check(isinstance(size, int) and size > 10000, f"a sample photo is opened in Studio ({size} bytes)")
    wait(page, "document.querySelector('#st-export').textContent === 'Save image' && !/Opening/.test(document.querySelector('#st-status').textContent)")
    page.js("document.querySelector('#st-add').click(); const t=document.querySelector('#st-text'); t.value='بسم الله — Mustatar'; t.dispatchEvent(new Event('input')); true")
    time.sleep(1)
    shot("02-photo-with-text")
    before = len(media("content://media/external/images/media"))
    page.js("document.querySelector('#st-export').click()")
    st = wait(page, "(s => /Saved|Could not/.test(s) && s)(document.querySelector('#st-status').textContent)", 30)
    pics = media("content://media/external/images/media")
    new = [l for l in pics if "jund-studio" in l and "Pictures/Mustatar" in l]
    check(len(pics) > before and new, f"Save image puts the picture in the gallery (Pictures/Mustatar): {new[-1:] or pics[-1:]}")
    check(st and "gallery" in st, f"the screen says where it went: {st}")
    shot("03-saved")

    # 2. Share → the phone's share sheet opens with the picture
    page.js("document.querySelector('#st-share').click()")
    time.sleep(4)
    shot("04-share-sheet")
    acts = on_screen()
    check("chooser" in acts.lower() or "ResolverActivity" in acts, "Share opens the phone's share sheet: " + acts[:160])
    back_to_app()
    if not page.js("!!document.querySelector('#st-media')"):
        open_studio()
    st = page.js("document.querySelector('#st-status')?.textContent")
    check(st == "✓ Shared.", f"the screen says it was shared: {st}")

    if not page.js("!!document.querySelector('#st-media')"):
        open_studio()
    # 3. a phone video (H.264 MP4, as phones record) → Save video → the gallery
    size = page.js(LOAD_FILE + "('/tests/samples/clip.mp4', 'clip.mp4', 'video/mp4')")
    ok = wait(page, "!document.querySelector('#st-trim').hidden && document.querySelector('#st-export').textContent === 'Save video'", 30)
    check(ok, f"a phone video opens in Studio, with the trim bar ({size} bytes)")
    page.js("document.querySelector('#st-add').click(); const t=document.querySelector('#st-text'); t.value='Reel'; t.dispatchEvent(new Event('input')); true")
    before = len(media("content://media/external/video/media"))
    page.js("document.querySelector('#st-export').click()")
    st = wait(page, "(s => /Saved|Could not|could not/.test(s) && s)(document.querySelector('#st-status').textContent)", 90)
    vids = media("content://media/external/video/media")
    newv = [l for l in vids if "jund-studio" in l and "Movies/Mustatar" in l]
    check(len(vids) > before and newv, f"Save video puts the video in the gallery (Movies/Mustatar): {newv[-1:]} — {st}")
    shot("05-video-saved")

    # 4. the carousel: several slides to the share sheet at once
    page.js("const c=document.querySelector('#st-car'); c.value='الأولى\\n\\nالثانية\\n\\nالثالثة'; document.querySelector('#st-car-go').click(); true")
    time.sleep(6)
    shot("06-carousel-share")
    acts = on_screen()
    check("chooser" in acts.lower(), "the carousel's slides open the share sheet together: " + acts[:160])
    back_to_app()

    # 5. sharing words (a note, a reminder) and reading aloud
    r = page.js("window.JundNative.shareText('A reminder from Mustatar', 'Mustatar').then(r => r.ok)")
    time.sleep(3)
    acts = on_screen()
    check(r is True and "chooser" in acts.lower(), "sharing words opens the share sheet")
    back_to_app()
    r = page.js("window.JundNative.speak('Hello, this is Mustatar.', 'en', 1)", timeout=40)
    print("     reading aloud (English):", r)
    check(isinstance(r, dict) and (r.get("ok") or "voice" in str(r.get("problem", "")) or "missing" in str(r.get("problem", ""))), "reading aloud reaches the phone's voice (or says the voice is missing)")

    # 6. Save a file from Settings (a backup) → Downloads/Mustatar
    r = page.js("(window.JundNative.save(new Blob(['{\"test\":1}'], {type:'application/json'}), 'Mustatar test backup.json')).then(r => JSON.stringify(r))")
    downloads = media("content://media/external/downloads")
    check('"ok":true' in str(r) and any("Mustatar test backup" in l for l in downloads), f"a file saves to Downloads/Mustatar: {r}")
    # 7. "Continue with Google" is offered inside the app (the phone's own Google sheet)
    page.js("window.JN.show('settings'); document.querySelectorAll('details').forEach(d => d.open = true); true")
    g = wait(page, "!!document.querySelector('#acct-google:not([hidden]) .g-native')", 20)
    check(bool(g), "Settings offers Continue with Google inside the app")
    if g:
        # what the phone's own Google sheet answers (on this test phone there is no Google account)
        r = page.js("window.JundNative.googleSignIn('test-client.apps.googleusercontent.com').then(r => JSON.stringify(r))", timeout=60)
        print("     the phone's Google sheet answered:", str(r)[:300])
        back_to_app()
    # 8. the browser route: the app opens a page in the phone's browser, not in itself
    r = page.js("window.JundNative.openBrowser('https://www.example.com/').then(r => JSON.stringify(r))", timeout=30)
    time.sleep(4)
    front = on_screen()
    shot("08-browser")
    check('"ok":true' in str(r) and "MainActivity" not in front, f"Continue with Google can open the phone's browser: {r} — {front[:140]}")
    back_to_app()
    adb("shell", "am", "start", "-n", f"{PKG}/sa.jund.notes.MainActivity")
    time.sleep(2)
    # 9. back from Google: app.mustatar://signin?t=… opens the app signed in
    import base64
    t = base64.urlsafe_b64encode(json.dumps({"token": "phone-test-token-123456", "user": {"name": "Phone Tester", "email": "phone@example.com"}, "created": False}).encode()).decode().rstrip("=")
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"app.mustatar://signin?t={t}", PKG)
    time.sleep(6)
    page = Page()
    wait(page, "document.readyState === 'complete' && !!window.JN", 30)
    got = page.js("JSON.stringify({t: JSON.parse(localStorage.getItem('jn_mstToken')||'null'), hash: location.hash})")
    shot("09-signed-in")
    check('phone-test-token-123456' in str(got) and '"hash":""' in str(got), f"coming back from Google in the browser opens the app signed in: {got}")
    shot("07-end")
    print("\n" + (f"{len(failures)} check(s) failed" if failures else "All checks passed"))
    sys.exit(1 if failures else 0)

if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        print("FAIL the test stopped:", type(e).__name__, e)
        shot("99-stopped")
        sys.exit(1)
    finally:
        log = adb("logcat", "-d", "-t", "3000")
        open(f"{SHOTS}/logcat.txt", "w").write(log)
        print("---- the phone's log (the app's page and errors) ----")
        for l in log.splitlines():
            if re.search(r"chromium|Console|AndroidRuntime|FATAL|FileOut|app\.mustatar|TextToSpeech", l):
                print("LOG", l[:300])
