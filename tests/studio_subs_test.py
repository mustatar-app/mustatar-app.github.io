# Studio: a video gets its words written and put on it as subtitles (spoken language, a translation, or both);
# the script can be read and kept; Arabic text and its translation move separately.
import asyncio, sys, os, json, subprocess, tempfile
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
fails = []
def check(ok, w): print(("PASS " if ok else "FAIL ") + w); (None if ok else fails.append(w))
# a phone-like video (H.264 + AAC in MP4); the browser is made unable to "decode" it, as on his phone
CLIP = os.path.join(tempfile.gettempdir(), 'subs-clip.mp4')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=480x854:rate=25:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', CLIP], check=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        c = await b.new_context(service_workers="block", viewport={"width": 420, "height": 860})
        await c.add_init_script("localStorage.setItem('jn_uiLang', JSON.stringify('ar')); localStorage.setItem('jn_welcomed','true'); localStorage.setItem('jn_opened','true'); (window.AudioContext || window.webkitAudioContext).prototype.decodeAudioData = function () { return Promise.reject(new DOMException('Decoding failed', 'EncodingError')); };")
        pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(1500); await pg.evaluate("JN.show('studio')"); await pg.wait_for_timeout(800)
        # the server: the words with their times; the translation
        await pg.evaluate("""window.__wav = 0; JN.serverFetch = async (path, init) => { if (path.startsWith('/transcribe?timed=1')) { window.__wav = init.body.size; window.__type = init.headers['content-type'];
              return new Response(JSON.stringify({ text: 'السلام عليكم ورحمة الله وبركاته هذا درس اليوم عن الصبر', lang: 'ar', segments: [{ s: 0.2, e: 3, t: 'السلام عليكم ورحمة الله وبركاته' }, { s: 3, e: 7, t: 'هذا درس اليوم عن الصبر والشكر في حياة المسلم كل يوم' }] }), { status: 200, headers: { 'content-type': 'application/json' } }); } throw new Error('unexpected ' + path); };
            JN.callServer = async () => ({ stop: 'STOP', text: JSON.stringify({ lines: ['Peace be upon you', 'Today’s lesson is about patience and gratitude in a Muslim’s daily life'] }) }); 1""")
        await pg.set_input_files('#st-media', CLIP); await pg.wait_for_timeout(2500)
        check(await pg.is_visible('#st-subs'), "a video shows the Subtitles button")
        await pg.click('#st-subs'); await pg.wait_for_timeout(300)
        await pg.click('.st-subs-dlg [name=sm][value=both]')
        await pg.click('#sb-go'); await pg.wait_for_timeout(2500)
        info = await pg.evaluate("[window.__wav, window.__type]")
        check(0 < info[0] < 200000 and info[1] == 'audio/mp4', f"a phone video whose sound cannot be decoded still works: only its sound is lifted out and sent ({info})")
        st = await pg.evaluate("document.querySelector('.st-subs-dlg') ? document.querySelector('#sb-status').textContent : 'closed'")
        check(st == 'closed', f"subtitles made (both languages): {st}")
        # the subtitle of the moment is drawn on the video
        await pg.evaluate("document.querySelector('#st-canvas') && 1")
        drawn = await pg.evaluate("""(async () => { const v = JundStudio.video(); v.currentTime = 1.0; await new Promise(r => setTimeout(r, 400));
            const c = document.querySelector('#st-canvas'), ctx = c.getContext('2d'); const d = ctx.getImageData(0, Math.round(c.height * 0.72), c.width, Math.round(c.height * 0.2)).data;
            let white = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 245 && d[i+1] > 245 && d[i+2] > 245) white++; return white; })()""")
        check(drawn > 300, f"the subtitle shows on the video at its time ({drawn} white pixels in the lower part)")
        await pg.screenshot(path='/tmp/studio-subs.png')
        # the script
        await pg.click('#st-subs'); await pg.wait_for_timeout(200); await pg.click('#sb-script'); await pg.wait_for_timeout(200)
        t = await pg.inner_text('.st-script')
        check('الصبر' in t and 'patience' in t, "the script shows the words and their translation")
        await pg.click('#sc-keep'); await pg.wait_for_timeout(500)
        kept = await pg.evaluate("JundKeep.all().then(a => a.some(n => /الصبر/.test(n.text)))")
        check(kept, "the script can be kept in My notes")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
asyncio.run(main())
raise SystemExit(1 if fails else 0)
