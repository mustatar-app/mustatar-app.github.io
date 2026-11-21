import asyncio, json, datetime as dt
from playwright.async_api import async_playwright
T = dt.date.today(); d = lambda n: (T + dt.timedelta(days=n)).isoformat()
EV = [{"id": "c1", "title": "مصطلح ١/ع (دار الحديث)", "date": d(-14), "time": "08:00", "type": "class", "repeat": "weekly", "remind": -1, "notes": ""},
      {"id": "t1", "title": "Write the essay", "date": d(2), "time": "", "type": "homework", "repeat": "none", "remind": -1, "notes": ""}]
fails = []
def check(ok, w): print(("PASS " if ok else "FAIL ") + w); (None if ok else fails.append(w))
BASE = __import__('sys').argv[1] if len(__import__('sys').argv) > 1 else 'http://localhost:8765/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
        await c.add_init_script(f"if (!sessionStorage.x) {{ sessionStorage.x = 1; localStorage.clear(); localStorage.setItem('jn_uiLang', JSON.stringify('ar'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_events', JSON.stringify({json.dumps(EV, ensure_ascii=False)})); }}")
        pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        dialogs = []; pg.on("dialog", lambda dl: (dialogs.append(dl.message), asyncio.ensure_future(dl.accept())))
        await pg.goto(BASE); await pg.wait_for_timeout(1500)
        reply = {"reply": "تم، إجازة سعيدة", "actions": [{"do": "off", "from": d(0), "to": d(6), "title": "إجازة"}]}
        await pg.evaluate(f"JN.callServer = async () => ({{ stop: 'STOP', text: {json.dumps(json.dumps(reply, ensure_ascii=False))} }}); 1")
        await pg.fill("#as-text", "عندي إجازة إلى الأحد، لا أريد أي درس هذا الأسبوع"); await pg.click("#as-send"); await pg.wait_for_timeout(1200)

        n = await pg.evaluate(f"[0,1,2,3,4,5,6].filter(i => {{ const x = new Date(); x.setDate(x.getDate()+i); const s = x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); return JundCal.on(s).some(e => e.id === 'c1'); }}).length")
        check(n == 0, f"holiday: the weekly lesson is hidden all week ({n} days shown)")
        check(await pg.evaluate("JundCal.events().some(e => e.id === 'c1')"), "…and it is NOT deleted (it comes back after)")
        n2 = await pg.evaluate(f"JundCal.on('{d(14)}').some(e => e.id === 'c1')")
        check(n2, "the lesson comes back the week after")
        check(not dialogs, f"no grey browser boxes ({dialogs})")
        # deleting: one Arabic window for all, then undo
        reply2 = {"reply": "حذفتها", "actions": [{"do": "delete", "id": "c1"}, {"do": "delete", "id": "t1"}]}
        await pg.evaluate(f"JN.callServer = async () => ({{ stop: 'STOP', text: {json.dumps(json.dumps(reply2, ensure_ascii=False))} }}); 1")
        await pg.fill("#as-text", "احذف درس المصطلح والواجب"); await pg.click("#as-send"); await pg.wait_for_timeout(800)
        cf = await pg.evaluate("document.querySelector('.cf-dlg[open]')?.innerText || ''")
        check("أنفّذ هذه التغييرات (2)" in cf and "نهائيًا" in cf, f"one Arabic confirmation lists both changes: {cf[:80]!r}")
        await pg.click(".cf-dlg [data-v='1']"); await pg.wait_for_timeout(600)
        check(await pg.evaluate("JundCal.events().length") == 0, "after 'Do it' both are deleted")
        await pg.click("#toast button, .toast button"); await pg.wait_for_timeout(400)
        check(await pg.evaluate("JundCal.events().length") == 2, "Undo brings them back")
        await pg.evaluate("JN.show('calendar')"); await pg.wait_for_timeout(400)
        check(await pg.evaluate("!!document.querySelector('.ag-off')"), "the calendar shows the holiday with 'End it'")

        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("ALL PASS" if not fails else f"{len(fails)} FAILED"); __import__("sys").exit(1 if fails else 0)
asyncio.run(main())
