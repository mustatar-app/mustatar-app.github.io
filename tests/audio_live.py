"""Live check of hearing: real Arabic and English speech through the real server and the real app.
Runs on GitHub (the live addresses are reachable there). Prints what was heard; fails if speech is not turned into text.
  python3 tests/audio_live.py
"""
import asyncio, json, os, re, subprocess, sys, time, urllib.request, urllib.error
SERVER = os.environ.get("SERVER", "https://jund-notes-ai.dawajund.workers.dev")
APP = os.environ.get("APP", "https://mustatar.dawajund.workers.dev")
UA = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 MustatarAudioCheck"
T = "/tmp/aud"; os.makedirs(T, exist_ok=True)
problems = []
def say(ok, text):
    print(("PASS " if ok else "FAIL ") + text, flush=True)
    if not ok: problems.append(text)
def ff(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)

SAID = {
    "ar": "بسم الله الرحمن الرحيم. درس اليوم عن الصيام. الصيام ركن من أركان الإسلام، ويبدأ من طلوع الفجر إلى غروب الشمس. ومن أكل ناسيا فليتم صومه.",
    "en": "Good morning everyone. Today's meeting is about the product launch. We agreed to finish the design on Monday, test with five users on Wednesday, and launch on Sunday.",
}
KEY = {"ar": ["الصيام", "الفجر", "الشمس", "الإسلام"], "en": ["meeting", "launch", "design", "Monday", "Wednesday", "Sunday"]}

def make_audio():
    from gtts import gTTS
    for lang, text in SAID.items():
        gTTS(text, lang=lang).save(f"{T}/{lang}.mp3")
        # what phones send: webm/opus from Chrome, m4a from Android/iPhone, and a wav for the fake microphone
        ff("-i", f"{T}/{lang}.mp3", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", f"{T}/{lang}.webm")
        ff("-i", f"{T}/{lang}.mp3", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k", f"{T}/{lang}.m4a")
        # the fake microphone repeats the file: 3 s of quiet, the speech, 30 s of quiet
        ff("-f", "lavfi", "-t", "3", "-i", "anullsrc=r=48000:cl=mono", "-i", f"{T}/{lang}.mp3", "-f", "lavfi", "-t", "30", "-i", "anullsrc=r=48000:cl=mono",
           "-filter_complex", "[1:a]aresample=48000,aformat=channel_layouts=mono[s];[0:a][s][2:a]concat=n=3:v=0:a=1", "-ar", "48000", "-ac", "1", f"{T}/{lang}-mic.wav")
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{T}/{lang}.mp3"], capture_output=True, text=True).stdout or 0)
        print(f"  made {lang} speech: {dur:.1f} s")

def score(lang, text):
    t = text.lower()
    return sum(1 for k in KEY[lang] if k.lower() in t) / len(KEY[lang])

def transcribe(path, mime, langs="ar,en", words=""):
    q = f"/transcribe?mime={urllib.parse.quote(mime)}&langs={langs}" + (f"&words={urllib.parse.quote(words)}" if words else "")
    r = urllib.request.Request(SERVER + q, data=open(path, "rb").read(), method="POST",
                               headers={"content-type": mime, "origin": APP, "user-agent": UA, "x-mst-stream": "openai"})
    t0 = time.time()
    try:
        body = urllib.request.urlopen(r, timeout=180).read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}", time.time() - t0, False
    # the answer comes as a stream of small pieces: join their text
    text = ""
    for line in body.splitlines():
        if line.startswith("data: ") and line[6:].strip() not in ("", "[DONE]"):
            try:
                j = json.loads(line[6:])
                text += (j.get("choices") or [{}])[0].get("delta", {}).get("content", "") or j.get("text", "") or ""
            except Exception: pass
    if not text and body.strip().startswith("{"):
        try: text = json.loads(body).get("text", "")
        except Exception: pass
    if not text: text = body[:300]
    return text, time.time() - t0, True

import urllib.parse
def server_checks():
    for lang in ("ar", "en"):
        for ext, mime in (("mp3", "audio/mpeg"), ("webm", "audio/webm"), ("m4a", "audio/mp4")):
            text, secs, ok = transcribe(f"{T}/{lang}.{ext}", mime)
            s = score(lang, text) if ok else 0
            print(f"  [{lang} {ext}] {secs:.1f}s → {text[:160]!r}")
            say(ok and s >= 0.5, f"server hears {'Arabic' if lang == 'ar' else 'English'} sent as {ext} ({int(s * 100)}% of key words, {secs:.1f} s)")
    # with My words (the prompt) set: must still work
    text, secs, ok = transcribe(f"{T}/ar.mp3", "audio/mpeg", words="الصيام، ابن رجب، الفجر")
    say(ok and score("ar", text) >= 0.5, f"server hears Arabic with My words set ({secs:.1f} s) → {text[:80]!r}")
    # English only, Arabic only
    text, secs, ok = transcribe(f"{T}/en.mp3", "audio/mpeg", langs="en")
    say(ok and score("en", text) >= 0.5, f"server hears English when only English is chosen ({secs:.1f} s)")

async def app_checks():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        for lang in ("ar", "en"):
            b = await p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-audio-capture={T}/{lang}-mic.wav", "--autoplay-policy=no-user-gesture-required"])
            c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, user_agent=UA, permissions=["microphone"])
            await c.add_init_script(f"localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_consentOk','true');localStorage.setItem('jn_autoMake', 'false');")
            pg = await c.new_page(); errs = []; logs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: logs.append(m.text) if m.type in ("error", "warning") else None)
            await pg.goto(APP, wait_until="networkidle"); await pg.wait_for_timeout(2500)
            ver = await pg.evaluate("(async () => { const k = await caches.keys().catch(() => []); return k.join(',') })()")
            print(f"  app opened ({lang}); caches: {ver}")
            # 1. record → stop → transcribed
            try:
                await pg.evaluate("JundRecorder.start()"); await pg.wait_for_timeout(1500)
                state = await pg.evaluate("({open: document.querySelector('#rec-dialog')?.open, status: document.querySelector('#rec-status')?.textContent, time: document.querySelector('#rec-time')?.textContent})")
                print("   recorder:", state)
                await pg.wait_for_timeout(16000)
                state = await pg.evaluate("({time: document.querySelector('#rec-time')?.textContent, level: document.querySelector('#rec-level')?.style.width, saved: document.querySelector('#rec-saved')?.textContent})")
                print("   after 17 s:", state)
                await pg.click("#rec-stop");
                text = ""
                for _ in range(120):
                    await pg.wait_for_timeout(1000)
                    it = await pg.evaluate("(() => { const p = (window.__jn?.pending?.() || [])[0]; return p ? { st: p.status || '', text: p.text || '', bad: !!p.bad } : null })()")
                    if it and (it["text"] or it["bad"] or "✗" in it["st"]): text = it["text"]; print("   pending:", {**it, "text": it["text"][:160]}); break
                else:
                    it = await pg.evaluate("(window.__jn?.pending?.() || []).map(p => ({st: p.status, text: (p.text||'').slice(0,80)}))"); print("   pending at the end:", it)
                say(score(lang, text) >= 0.5, f"app: record → stop → text ({'Arabic' if lang == 'ar' else 'English'}, {int(score(lang, text) * 100)}% of key words)")
            except Exception as e:
                say(False, f"app recording ({lang}) ran: {e}")
            # 2. typing by voice in the chat box (dictation), and talking with the assistant
            try:
                await pg.evaluate("JN.show('assistant')"); await pg.wait_for_timeout(500)
                await pg.click("#as-mic"); await pg.wait_for_timeout(1200)
                ui = await pg.evaluate("({dlg: [...document.querySelectorAll('dialog[open]')].map(d => d.id), bar: document.querySelector('.as-input')?.className, txt: document.querySelector('#as-text')?.value})")
                print("   after the mic:", ui)
                await pg.wait_for_timeout(15000)
                ui2 = await pg.evaluate("({dlg: [...document.querySelectorAll('dialog[open]')].map(d => [d.id, d.innerText.slice(0, 200)]), txt: document.querySelector('#as-text')?.value, log: [...document.querySelectorAll('#as-log .msg')].map(m => m.textContent.slice(0, 120))})")
                print("   after speaking:", json.dumps(ui2, ensure_ascii=False)[:600])
                heard = (ui2.get("txt") or "") + " " + " ".join(ui2.get("log") or []) + " " + " ".join(x[1] for x in ui2.get("dlg") or [])
                say(score(lang, heard) >= 0.5, f"app: talking to the assistant hears {'Arabic' if lang == 'ar' else 'English'} ({int(score(lang, heard) * 100)}%)")
            except Exception as e:
                say(False, f"app voice chat ({lang}) ran: {e}")
            if errs: print("   page errors:", errs[:5])
            if logs: print("   console:", [l[:200] for l in logs[:8]])
            await b.close()

make_audio()
server_checks()
asyncio.run(app_checks())
print("\n" + (f"{len(problems)} problem(s)" if problems else "All hearing checks passed"))
sys.exit(1 if problems else 0)
