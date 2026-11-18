"""Long recordings are cut into ~2-minute pieces at quiet moments (media.js), for MP3, AAC and WAV.
Run: python3 -m http.server 8765 &  then  python3 tests/media_test.py http://localhost:8765/"""
import asyncio, os, subprocess, sys, tempfile
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
T = tempfile.mkdtemp()
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
def ff(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
# 7 minutes of "speech": 1.7 s of tone, 0.6 s of silence, again and again
ff("-f", "lavfi", "-i", "sine=f=300:sample_rate=16000", "-af", "volume='if(lt(mod(t,2.3),1.7),1,0)':eval=frame", "-t", "420", "-ac", "1", f"{T}/talk.wav")
ff("-i", f"{T}/talk.wav", "-b:a", "64k", f"{T}/talk.mp3")
ff("-i", f"{T}/talk.wav", "-c:a", "aac", "-b:a", "64k", "-f", "adts", f"{T}/talk.aac")
ff("-f", "lavfi", "-i", "sine=f=300", "-t", "90", f"{T}/short.mp3")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page()
        await page.route("**/*workers.dev/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":true}'))
        await page.goto(BASE); await page.wait_for_timeout(1500)
        for name, mime in (("talk.mp3", "audio/mpeg"), ("talk.aac", "audio/aac"), ("talk.wav", "audio/wav"), ("short.mp3", "audio/mpeg")):
            await page.set_input_files("#file", f"{T}/{name}") if False else None
            data = open(f"{T}/{name}", "rb").read()
            r = await page.evaluate("""async ([b64, name, mime]) => {
              const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              const f = new File([bytes], name, { type: mime });
              const prep = await window.JundMedia.prepare(f);
              const ctx = new AudioContext(); const out = [];
              for (const p of prep.pieces) {
                let buf; try { buf = await ctx.decodeAudioData(await p.blob.arrayBuffer()); } catch { out.push({ secs: +(p.end - p.start).toFixed(1), head: -1, tail: -1 }); continue; }
                const ch = buf.getChannelData(0), n = Math.round(buf.sampleRate * 0.04);
                const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
                out.push({ secs: +buf.duration.toFixed(1), head: +rms(ch.slice(0, n)).toFixed(3), tail: +rms(ch.slice(-n)).toFixed(3) });
              }
              return out;
            }""", [__import__("base64").b64encode(data).decode(), name, mime])
            print(name, r)
            if name == "short.mp3":
                check(len(r) == 1, "a 90-second recording is sent whole"); continue
            lens = [x["secs"] for x in r]
            check(3 <= len(r) <= 4 and all(90 <= x <= 150 for x in lens[:-1]), f"{name}: cut into pieces of about 2 minutes {lens}")
            if name == "talk.aac":
                continue   # the test browser cannot decode AAC (phones can), so the quiet search is checked with MP3 and WAV
            inner = [x["tail"] for x in r[:-1]] + [x["head"] for x in r[1:]]
            check(sum(v < 0.05 for v in inner) >= len(inner) - 1, f"{name}: the cuts fall in quiet moments {inner}")
        await b.close()
asyncio.run(main())
print("\n" + (f"{len(fails)} check(s) failed" if fails else "All checks passed")); sys.exit(1 if fails else 0)
