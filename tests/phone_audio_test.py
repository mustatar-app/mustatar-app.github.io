"""Hearing inside the real Android app (emulator): the microphone opens and records, and real Arabic and English speech
files are turned into text through the live server — the same path as recordings on a phone.
Run by .github/workflows/phone-test.yml after phone_test.py:  python3 tests/phone_audio_test.py
(needs tests/speech-ar.mp3 and tests/speech-en.mp3, made with gTTS in the workflow)
"""
import json, sys, time
from phone_test import Page, adb, check, shot, wait, failures, PKG

KEY = {"ar": ["الصيام", "الفجر", "الشمس", "الإسلام"], "en": ["meeting", "launch", "design", "Monday", "Wednesday", "Sunday"]}
def score(lang, t): t = (t or "").lower(); return sum(1 for k in KEY[lang] if k.lower() in t) / len(KEY[lang])

LOAD = """(async (url, name, type) => {
  const b = await (await fetch(url)).blob();
  const dt = new DataTransfer(); dt.items.add(new File([b], name, { type }));
  const input = document.querySelector('#file'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  return b.size;
})"""

def main():
    for perm in ["POST_NOTIFICATIONS", "RECORD_AUDIO"]:
        adb("shell", "pm", "grant", PKG, "android.permission." + perm)
    adb("shell", "am", "force-stop", PKG)
    adb("shell", "am", "start", "-n", f"{PKG}/sa.jund.notes.MainActivity", "--es", "testHome", "http://localhost:8765")
    time.sleep(8)
    page = None
    for attempt in range(3):   # the app may still be starting (or another app is in front): try again
        try: page = Page(); break
        except Exception as e:
            print("     (no page yet:", type(e).__name__, "- starting the app again)", flush=True)
            adb("shell", "am", "start", "-n", f"{PKG}/sa.jund.notes.MainActivity", "--es", "testHome", "http://localhost:8765"); time.sleep(10)
    wait(page, "document.readyState === 'complete' && !!window.JN", 30)
    page.js("localStorage.setItem('jn_welcomed','true'); localStorage.setItem('jn_opened','true'); localStorage.setItem('jn_consentOk','true'); localStorage.setItem('jn_autoMake','false'); true")
    page.js("location.reload(); true"); time.sleep(6)
    page = Page(); wait(page, "document.readyState === 'complete' && !!window.JN", 30)

    # 1. the microphone itself (the same way the app opens it)
    adb("logcat", "-c")
    mic = page.js("""(async () => {
      try {
        const s = await openMic({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
        const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].filter(t => window.MediaRecorder?.isTypeSupported(t));
        const mr = new MediaRecorder(s, types[0] ? { mimeType: types[0] } : {}); const parts = [];
        mr.ondataavailable = e => parts.push(e.data); mr.start(500);
        await new Promise(r => setTimeout(r, 3000)); mr.stop(); await new Promise(r => mr.onstop = r);
        s.getTracks().forEach(t => t.stop());
        return { ok: true, types, bytes: parts.reduce((n, p) => n + p.size, 0), track: s.getAudioTracks()[0]?.label || '' };
      } catch (e) { return { ok: false, name: e.name, message: e.message }; }
    })()""", timeout=30)
    print("     microphone:", mic, flush=True)
    if not (isinstance(mic, dict) and mic.get("ok")):
        for line in adb("logcat", "-d").splitlines():
            if any(k in line for k in ("AudioRecord", "AudioFlinger", "AudioPolicy", "audio_hw", "MODIFY_AUDIO", "cr_media", "chromium")) and ("E " in line or "W " in line or "rror" in line):
                print("     LOG", line[-220:], flush=True)
    check(isinstance(mic, dict) and mic.get("ok") and mic.get("bytes", 0) > 0, f"the microphone opens and records inside the Android app ({mic})")

    # 2. the in-app recorder: start, record 6 s, stop (silence on the emulator: it must stop cleanly, not fail on the microphone)
    st = page.js("(async () => { try { await JundRecorder.start(); return { open: document.querySelector('#rec-dialog')?.open, status: document.querySelector('#rec-status')?.textContent } } catch (e) { return { error: String(e) } } })()", timeout=20)
    print("     recorder:", st, flush=True)
    time.sleep(6); shot("audio-01-recording")
    t = page.js("document.querySelector('#rec-time')?.textContent")
    check(isinstance(st, dict) and st.get("open") and t not in (None, "00:00"), f"the recorder runs in the Android app (time {t})")
    page.js("document.querySelector('#rec-cancel')?.click(); true"); time.sleep(1)
    page.js("[...document.querySelectorAll('dialog[open]')].forEach(d => { const y = [...d.querySelectorAll('button')].find(b => /Discard|احذف|Yes|نعم/i.test(b.innerText)); y?.click(); }); true"); time.sleep(1)

    # 3. real speech files → text, through the same steps as a phone recording (cut into pieces, sent to the live server)
    for lang in ("ar", "en"):
        page.js("JN.show('new'); true"); time.sleep(1)
        page.js("(window.__jn?.pending?.() || []).splice(0); true")
        size = page.js(f"({LOAD})('/tests/speech-{lang}.mp3', 'speech-{lang}.mp3', 'audio/mpeg')", timeout=30)
        print(f"     loaded speech-{lang}.mp3: {size} bytes", flush=True)
        got = None
        for _ in range(90):
            time.sleep(1)
            got = page.js("(() => { const p = (window.__jn?.pending?.() || [])[0]; return p ? { st: p.status || '', text: p.text || '', bad: !!p.bad } : null })()")
            if isinstance(got, dict) and (got.get("text") or got.get("bad") or "✗" in (got.get("st") or "")):
                break
        print(f"     {lang}:", json.dumps(got, ensure_ascii=False)[:300], flush=True)
        shot(f"audio-02-{lang}")
        text = (got or {}).get("text", "") if isinstance(got, dict) else ""
        check(score(lang, text) >= 0.5, f"a {'n Arabic' if lang == 'ar' else 'n English'} recording becomes text inside the Android app ({int(score(lang, text) * 100)}% of key words)")

    # 4. the assistant speaks its answer aloud (the phone's own voice)
    sp = page.js("(async () => { if (!window.JundNative?.speak) return 'no native voice'; try { const r = await Promise.race([window.JundNative.speak('مرحبا', 'ar'), new Promise(r => setTimeout(() => r('no reply in 8 s'), 8000))]); return r ?? 'ok' } catch (e) { return 'error ' + e } })()", timeout=15)
    print("     speaking:", sp, flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAIL the test stopped:", type(e).__name__, e); failures.append(str(e))
    print("\n" + (f"{len(failures)} check(s) failed" if failures else "All Android hearing checks passed"))
    sys.exit(1 if failures else 0)
