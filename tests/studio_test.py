"""Studio: open a photo and a video, write on them, save, share, carousel, drafts — in a phone browser,
and as inside the Android app (with a pretend app that receives the files the way MainActivity does).

Run:  python3 -m http.server 8765 &   then   python3 tests/studio_test.py http://localhost:8765/
Samples are made with ffmpeg; extra real samples from the internet are used when they can be downloaded.
"""
import asyncio, base64, os, struct, subprocess, sys, tempfile, urllib.request
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
TMP = tempfile.mkdtemp(prefix="studio-")
failures = []

def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        failures.append(what)

def ff(*args):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)

def samples():
    s = {}
    s["photo"] = os.path.join(TMP, "camera.jpg")       # a big camera-size photo
    ff("-f", "lavfi", "-i", "testsrc2=s=4000x3000", "-frames:v", "1", "-q:v", "4", s["photo"])
    s["png"] = os.path.join(TMP, "screenshot.png")
    ff("-f", "lavfi", "-i", "smptebars=s=1080x2340", "-frames:v", "1", s["png"])
    s["video"] = os.path.join(TMP, "clip.webm")         # Chromium for tests has no H.264, so the test clip is WebM
    ff("-f", "lavfi", "-i", "testsrc2=s=720x1280:r=30", "-f", "lavfi", "-i", "sine=f=440", "-t", "3",
       "-c:v", "libvpx", "-b:v", "1M", "-c:a", "libopus", s["video"])
    # real photos from the internet, when the machine can reach them
    for name, url in [("web.jpg", "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Masjid_al-Haram_panorama.jpg/1280px-Masjid_al-Haram_panorama.jpg"),
                      ("web2.jpg", "https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg")]:
        try:
            req = urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0 (Mustatar test)"})
            data = urllib.request.urlopen(req, timeout=20).read()
            if data[:2] == b"\xff\xd8":
                path = os.path.join(TMP, name)
                open(path, "wb").write(data)
                s[name] = path
        except Exception as e:
            print("note: could not download", name, "-", str(e)[:80])
    return s

def jpeg_size(data):
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        i += 2 + length
    return None

# a pretend Android app: receives files in pieces exactly like MainActivity, and answers like FileOut
FAKE_ANDROID = """
(() => {
  const listeners = [];
  const parts = {};
  window.__native = { saved: [], shared: [], texts: [], spoken: [] };
  const answer = obj => setTimeout(() => { const e = { data: JSON.stringify(obj) }; listeners.forEach(f => f(e)); window.MustatarAndroid.onmessage?.(e); }, 30);
  window.MustatarAndroid = {
    addEventListener: (t, f) => { if (t === 'message') listeners.push(f); },
    postMessage: str => {
      const m = JSON.parse(str);
      if (m.action === 'fileStart') parts[m.id] = { name: m.name, mime: m.mime, data: '' , chunks: 0};
      else if (m.action === 'fileChunk') { const b = atob(m.data); parts[m.id].data += b; parts[m.id].chunks++; }
      else if (m.action === 'fileEnd') parts[m.id].done = true;
      else if (m.action === 'fileSave' || m.action === 'fileShare') {
        const files = m.ids.map(id => ({ name: parts[id].name, mime: parts[id].mime, size: parts[id].data.length, head: btoa(parts[id].data.slice(0, 16)), done: !!parts[id].done, chunks: parts[id].chunks }));
        (m.action === 'fileSave' ? window.__native.saved : window.__native.shared).push(files);
        answer({ file: m.job, result: m.action === 'fileSave' ? { ok: true, count: files.length, where: 'Pictures/Mustatar' } : { ok: true, shared: files.length } });
      }
      else if (m.action === 'shareText') { window.__native.texts.push(m.text); answer({ file: m.job, result: { ok: true } }); }
      else if (m.action === 'speak') { window.__native.spoken.push([m.lang, m.text]); answer({ spoke: m.id, ok: true }); }
      else if (m.action !== 'stopSpeaking') answer({ notifications: true });
    },
  };
})();
"""
# a phone browser that has the share sheet (Chrome on Android, Safari on iPhone)
FAKE_SHARE = """
window.__shared = [];
navigator.canShare = d => !!d;
navigator.share = async d => { window.__shared.push({ text: d.text || '', files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) }); };
"""

async def open_app(browser, init=None):
    ctx = await browser.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True,
                                    service_workers="block", accept_downloads=True)
    if init:
        await ctx.add_init_script(init)
    await ctx.add_init_script("localStorage.setItem('jn_welcomed','1');localStorage.setItem('jn_plan',JSON.stringify('test'));localStorage.setItem('welcomed','1');")
    page = await ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:300]))
    await page.route("**/*workers.dev/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":true}'))
    await page.route("**/api.aladhan.com/**", lambda r: r.abort())
    await page.goto(BASE, wait_until="load")
    await page.wait_for_timeout(1500)
    for _ in range(6):
        closed = await page.evaluate("""()=>{const o=[...document.querySelectorAll('body > *')].find(e=>{const s=getComputedStyle(e);return s.position==='fixed'&&s.display!=='none'&&e.offsetHeight>300&&/wl|welcome/i.test(e.className+e.id)}); if(!o) return false; const bs=[...o.querySelectorAll('button')]; (bs.find(b=>/تخط|Skip|Continue without|بدون حساب/i.test(b.innerText))||bs[0])?.click(); return true}""")
        if not closed:
            break
        await page.wait_for_timeout(300)
    await page.evaluate("JN.show('studio')")
    await page.wait_for_timeout(800)
    return ctx, page, errors

async def load_media(page, path, kind):
    await page.set_input_files("#st-media", path)
    for _ in range(60):
        await page.wait_for_timeout(250)
        if await page.evaluate("document.querySelector('#st-export').textContent") == ("Save video" if kind == "video" else "Save image") \
           and not await page.evaluate("/Opening|Converting/.test(document.querySelector('#st-status').textContent)"):
            if kind != "video" or await page.evaluate("!document.querySelector('#st-trim').hidden"):
                return True
    return False

async def write_text(page, text):
    await page.click("#st-add")
    await page.fill("#st-text", text)
    await page.wait_for_timeout(200)

async def status(page):
    return await page.evaluate("document.querySelector('#st-status').textContent")

async def browser_run(browser, s):
    print("\n== In a phone browser ==")
    ctx, page, errors = await open_app(browser)
    check(await load_media(page, s["photo"], "image"), "a big camera photo (4000×3000) opens")
    await write_text(page, "بسم الله — Mustatar")
    async with page.expect_download(timeout=15000) as d:
        await page.click("#st-export")
    path = await (await d.value).path()
    data = open(path, "rb").read()
    check(data[:2] == b"\xff\xd8" and jpeg_size(data) in [(1080, 1350), (1080, 1080), (1080, 1920)], f"Save image gives a JPEG picture {jpeg_size(data)} ({len(data)//1024} KB)")
    check("Saved" in await status(page), "the screen says it was saved: " + await status(page))
    # Share without a share sheet (a computer browser): it saves instead
    async with page.expect_download(timeout=15000) as d:
        await page.click("#st-share")
    check((await d.value).suggested_filename.endswith(".jpg"), "Share on a browser without a share sheet saves the picture instead")
    # PNG screenshot and the downloaded real photos
    for key in ["png", "web.jpg", "web2.jpg"]:
        if key not in s:
            continue
        ok = await load_media(page, s[key], "image")
        async with page.expect_download(timeout=15000) as d:
            await page.click("#st-export")
        data = open(await (await d.value).path(), "rb").read()
        check(ok and data[:2] == b"\xff\xd8", f"{key}: opens and saves")
    # drafts
    before = await page.evaluate("document.querySelectorAll('#st-drafts [data-open], #st-drafts .draft, #st-drafts img').length")
    await page.click("#st-draft")
    await page.wait_for_timeout(800)
    after = await page.evaluate("document.querySelectorAll('#st-drafts [data-open], #st-drafts .draft, #st-drafts img').length")
    check("Draft saved" in await status(page) and after > before, "Save draft keeps a draft in the list")
    # carousel: three slides become three pictures
    await page.fill("#st-car", "الشريحة الأولى\n\nSlide two\n\nالشريحة الثالثة")
    names = []
    page.on("download", lambda dl: names.append(dl.suggested_filename))
    await page.click("#st-car-go")
    await page.wait_for_timeout(3500)
    check(len(names) == 3, f"the carousel saves 3 slides ({len(names)})")
    # video: write on it and save it as a video
    check(await load_media(page, s["video"], "video"), "a video opens, with the trim bar")
    await write_text(page, "Reel text")
    async with page.expect_download(timeout=60000) as d:
        await page.click("#st-export")
    vd = open(await (await d.value).path(), "rb").read()
    check(len(vd) > 20000 and (vd[:4] == b"\x1aE\xdf\xa3" or vd[4:8] == b"ftyp"), f"Save video gives a video file ({len(vd)//1024} KB)")
    check(await page.evaluate("!document.querySelector('#st-export').disabled && document.querySelector('#st-progress').hidden"), "after the video, the buttons are free again")
    check(not errors, "no errors on the page: " + "; ".join(errors[:3]))
    await ctx.close()

    print("\n== In a phone browser with a share sheet ==")
    ctx, page, errors = await open_app(browser, FAKE_SHARE)
    await load_media(page, s["photo"], "image")
    await write_text(page, "Share me")
    await page.click("#st-share")
    await page.wait_for_timeout(1500)
    shared = await page.evaluate("window.__shared")
    check(len(shared) == 1 and shared[0]["files"] and shared[0]["files"][0]["type"] == "image/jpeg" and shared[0]["files"][0]["size"] > 30000, f"Share hands the picture to the share sheet {shared[:1]}")
    await page.fill("#st-car", "One\n\nTwo")
    await page.click("#st-car-go")
    await page.wait_for_timeout(2500)
    shared = await page.evaluate("window.__shared")
    check(len(shared) == 2 and len(shared[1]["files"]) == 2, "the carousel's slides go to the share sheet together")
    check(not errors, "no errors on the page: " + "; ".join(errors[:3]))
    await ctx.close()

async def android_run(browser, s):
    print("\n== As inside the Android app (pretend app) ==")
    ctx, page, errors = await open_app(browser, FAKE_ANDROID)
    check(await page.evaluate("!!window.JundNative && typeof navigator.share === 'function'"), "the app's save, share and voice are connected")
    await load_media(page, s["photo"], "image")
    await write_text(page, "داخل التطبيق")
    await page.click("#st-export")
    await page.wait_for_timeout(2500)
    saved = await page.evaluate("window.__native.saved")
    ok = len(saved) == 1 and saved[0][0]["mime"] == "image/jpeg" and saved[0][0]["done"] and base64.b64decode(saved[0][0]["head"])[:2] == b"\xff\xd8"
    check(ok, f"Save image sends the whole picture to the app ({saved[0][0]['size']//1024 if saved else 0} KB in {saved[0][0]['chunks'] if saved else 0} pieces)")
    check("gallery" in await status(page), "the screen says where it went: " + await status(page))
    await page.click("#st-share")
    await page.wait_for_timeout(2500)
    shared = await page.evaluate("window.__native.shared")
    check(len(shared) == 1 and shared[0][0]["mime"] == "image/jpeg" and shared[0][0]["size"] > 30000, "Share hands the picture to the phone's share sheet")
    check(await status(page) == "✓ Shared.", "the screen says it was shared")
    await page.fill("#st-car", "١\n\n٢\n\n٣")
    await page.click("#st-car-go")
    await page.wait_for_timeout(4000)
    saved = await page.evaluate("window.__native.saved")
    shared = await page.evaluate("window.__native.shared")
    check(len(shared) == 2 and len(shared[1]) == 3, "the carousel's 3 slides go to the share sheet together")
    await load_media(page, s["video"], "video")
    await write_text(page, "Reel")
    await page.click("#st-export")
    for _ in range(60):
        await page.wait_for_timeout(500)
        if len(await page.evaluate("window.__native.saved")) == 2:
            break
    saved = await page.evaluate("window.__native.saved")
    check(len(saved) == 2 and saved[1][0]["mime"].startswith("video/") and saved[1][0]["size"] > 20000, "Save video sends the video to the app (for the gallery)")
    # other places that save or share
    await page.evaluate("window.JundNative.speak('السلام عليكم', 'ar', 1)")
    await page.evaluate("navigator.share({ text: 'a reminder' })")
    await page.wait_for_timeout(300)
    check(await page.evaluate("window.__native.spoken.length === 1 && window.__native.texts[0] === 'a reminder'"), "reading aloud and sharing words go to the app")
    r = await page.evaluate("window.JundNotes ? 1 : 1")
    check(not errors, "no errors on the page: " + "; ".join(errors[:3]))
    await ctx.close()

async def main():
    s = samples()
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        await browser_run(browser, s)
        await android_run(browser, s)
        await browser.close()
    print("\n" + (f"{len(failures)} check(s) failed" if failures else "All checks passed"))
    sys.exit(1 if failures else 0)

asyncio.run(main())
