# The send arrow while recording a voice message stops AND sends in one tap; if the words can't be written, the voice itself is sent.
# Alarms go to the closed-app reminder list for home-screen (browser) users.
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
fails = []
def check(ok, w): print(("PASS " if ok else "FAIL ") + w); (None if ok else fails.append(w))
SPY = """window.__sent = []; document.addEventListener('click', e => { if (e.target.closest('#as-send')) window.__sent.push({ text: document.querySelector('#as-text').value, files: (window.JundAttach?.homeFiles?.() || []).map(f => f.type) }); }, true);
JN.callServer = async () => ({ stop: 'STOP', text: 'تم' }); 1"""
async def run(b, mode):
    c = await b.new_context(service_workers="block", permissions=["microphone"])
    await c.add_init_script("localStorage.setItem('jn_uiLang', JSON.stringify('ar')); localStorage.setItem('jn_welcomed','true'); localStorage.setItem('jn_opened','true');")
    pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1500)
    await pg.evaluate(SPY)
    if mode == 'ok':
        await pg.evaluate("JundAttach.askFile = async () => ({ text: 'ذكرني بدرس الفقه غدًا' }); 1")
    else:
        await pg.evaluate("window.__tries = 0; JundAttach.askFile = async () => { window.__tries++; throw new Error('offline'); }; 1")
    await pg.click('#as-mic'); await pg.wait_for_timeout(2500)
    check(await pg.locator('.dict-send').count() == 1, f"[{mode}] recording bar shows the send arrow")
    await pg.click('.dict-send'); await pg.wait_for_timeout(2500)
    sent = await pg.evaluate("window.__sent")
    if mode == 'ok':
        check(len(sent) == 1 and 'درس الفقه' in sent[0]['text'], f"[ok] one tap stopped and sent the words: {sent}")
    else:
        check(len(sent) == 1 and any(t.startswith('audio') for t in sent[0]['files']), f"[fail] writing failed, so the voice itself was sent: {sent}")
        check(await pg.evaluate("window.__tries") == 2, "[fail] tried writing twice before sending the voice")
    check(await pg.locator('.dict').count() == 0, f"[{mode}] the recording bar closed")
    check(not errs, f"[{mode}] no page errors {errs[:2]}")
    await c.close()
async def alarms(b):
    c = await b.new_context(service_workers="block")
    await c.add_init_script("localStorage.setItem('jn_welcomed','true'); localStorage.setItem('jn_opened','true'); localStorage.setItem('jn_alarms', JSON.stringify([{id:'a1', time:'06:00', days:[0,1,2,3,4,5,6], label:'Fajr', on:true},{id:'a2', time:'07:30', days:[], label:'Once', on:true}]));")
    pg = await c.new_page(); await pg.goto(BASE); await pg.wait_for_timeout(1500)
    up = await pg.evaluate("JundAlarm.upcoming()")
    check(len(up) == 8 and all(x['id'].startswith('al-') for x in up), f"alarms for the coming week go to closed-app notifications ({len(up)}: 7 daily + 1 once)")
    await c.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
        await run(b, 'ok'); await run(b, 'fail'); await alarms(b)
        await b.close()
asyncio.run(main())
raise SystemExit(1 if fails else 0)
