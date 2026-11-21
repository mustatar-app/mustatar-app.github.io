# Alarm options (sound, how long it rings, volume, soft start, vibration, snooze), editing an alarm, and the iPhone Safari steps
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
fails = []
def check(ok, w): print(("PASS " if ok else "FAIL ") + w); (None if ok else fails.append(w))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(service_workers="block")
        await c.add_init_script("if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.clear(); localStorage.setItem('jn_uiLang', JSON.stringify('ar')); localStorage.setItem('jn_welcomed','true'); localStorage.setItem('jn_opened','true'); }")
        pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(1500)
        await pg.evaluate("JundAlarm.open()"); await pg.wait_for_timeout(300)
        await pg.click('#al-dlg .al-more summary')
        check(await pg.locator('#al-ringfor').count() == 1 and await pg.locator('#al-tone').count() == 1, "options show: sound, how long it rings")
        await pg.fill('#al-time', '05:10'); await pg.fill('#al-label', 'الفجر')
        await pg.select_option('#al-ringfor', '20'); await pg.select_option('#al-snooze', '10'); await pg.select_option('#al-tone', 'chime')
        await pg.evaluate("const r = document.querySelector('#al-vol'); r.value = 70; r.dispatchEvent(new Event('input'))")
        await pg.click('#al-dlg label:has(#al-rise) .switch')
        await pg.click('#al-dlg button[type=submit]'); await pg.wait_for_timeout(400)
        a = (await pg.evaluate("JundAlarm.all()"))[0]
        check(a['o']['ring'] == 20 and a['o']['snooze'] == 10 and a['o']['vol'] == 70 and a['o']['rise'] is True and a['o']['tone'] == 'chime', f"the choices are saved with the alarm: {a['o']}")
        # edit: tap the alarm, change how long it rings, save
        await pg.click('#al-dlg [data-ed]'); await pg.wait_for_timeout(200)
        check(await pg.input_value('#al-time') == '05:10' and await pg.input_value('#al-label') == 'الفجر', "tapping an alarm opens it for changes")
        await pg.select_option('#al-ringfor', '30'); await pg.click('#al-dlg button[type=submit]'); await pg.wait_for_timeout(300)
        l = await pg.evaluate("JundAlarm.all()")
        check(len(l) == 1 and l[0]['o']['ring'] == 30, "saving changes the same alarm (no copy)")
        # a web ring follows the options and stops by itself
        await pg.evaluate("window.__webRingTest = 1; 1")
        check(await pg.evaluate("JundAlarm.upcoming().length > 0"), "it still goes to closed-app notifications")
        # iPhone Safari (not added to the Home Screen): the steps appear
        await c.close()
        ios = await b.new_context(service_workers="block", user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
        await ios.add_init_script("localStorage.setItem('jn_uiLang', JSON.stringify('ar')); localStorage.setItem('jn_welcomed','true'); localStorage.setItem('jn_opened','true');")
        pg = await ios.new_page(); await pg.goto(BASE); await pg.wait_for_timeout(7000)
        t = await pg.evaluate("document.querySelector('.ios-dlg')?.innerText || ''")
        check("إضافة إلى الشاشة الرئيسية" in t, "iPhone Safari: once, it shows how to add Mustatar to the Home Screen for notifications")
        await pg.click('#ios-ok')
        await pg.evaluate("JundAlarm.open()"); await pg.wait_for_timeout(300)
        check("الشاشة الرئيسية" in await pg.inner_text('#al-dlg'), "iPhone Safari: the alarm window shows the same steps")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
asyncio.run(main())
raise SystemExit(1 if fails else 0)
