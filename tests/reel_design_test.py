# Ideas from the "slop dashboard → product" reel: wallpaper + frosted glass, a satisfying main button, a ⌘K/Ctrl+K command palette
import asyncio
from playwright.async_api import async_playwright
fails = []
def check(ok, w): print(("PASS " if ok else "FAIL ") + w); (None if ok else fails.append(w))
BASE = __import__('sys').argv[1] if len(__import__('sys').argv) > 1 else 'http://localhost:8765/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(viewport={"width": 1280, "height": 860}, service_workers="block")
        await c.add_init_script("if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.clear(); localStorage.setItem('jn_uiLang', JSON.stringify('ar'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_appBg', JSON.stringify('desert')); }")
        pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(1500)
        check(await pg.evaluate("document.documentElement.dataset.appBg") == "desert", "desert wallpaper is on")
        st = await pg.evaluate("getComputedStyle(document.querySelector('#app-bg-layer')).backgroundSize")
        check("cover" in st, f"wallpaper fills the screen ({st})")
        bl = await pg.evaluate("(() => { const e = [...document.querySelectorAll('.card, .tl-fold, .hm-card')].find(x => x.offsetParent); return e ? getComputedStyle(e).backdropFilter : 'none'; })()")
        check("blur" in bl, f"cards are frosted glass ({bl})")
        await pg.screenshot(path="/tmp/reel-desert.png")
        await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(400)
        t = await pg.evaluate("document.querySelector('.sr')?.innerText || ''")
        check("الأكثر استخدامًا" in t and "ملاحظة جديدة" in t, f"Ctrl+K opens the command palette with the most used actions: {t[:90]!r}")
        await pg.screenshot(path="/tmp/reel-palette.png")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
        check(await pg.evaluate("!document.querySelector('.sr') || document.querySelector('.sr').hidden"), "Escape closes it")
        await pg.evaluate("localStorage.setItem('jn_appBg', JSON.stringify('nightsky')); JundBg.applyApp(); 1"); await pg.wait_for_timeout(300)
        await pg.screenshot(path="/tmp/reel-night.png")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
asyncio.run(main())
raise SystemExit(1 if fails else 0)
