"""Clicks every button on every screen, in English and Arabic, and reports any that throws an error or does nothing.
The AI server is faked, so this checks the app itself, not the AI. Buttons that delete, sign out or leave the app are skipped.
  python3 -m http.server 8765 &   then   python3 tests/click_all.py [http://localhost:8765/]
"""
import asyncio, json, re, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
NOTE = {"title": "Team meeting", "summary": "We decided the launch date.", "sections": [{"heading": "Decisions", "points": ["Launch on Friday", "Invite 100 users"]}],
        "glossary": [], "questions": [], "flashcards": [{"q": "When is the launch?", "a": "Friday"}], "mnemonics": [], "tasks": [],
        "mindmap": [{"center": "Meeting", "branches": [{"label": "Decisions", "children": []}]}], "report": {"inferred": [], "left_out": [], "maybe_wrong": [], "added": []}}
SKIP = re.compile(r"delete|remove|clear|erase|sign out|log ?out|reset|forget|wipe|حذف|احذف|امسح|مسح|خروج|إزالة|أزل|تسجيل الخروج|نسيان", re.I)

async def fake_server(route):
    req = route.request
    cors = {"access-control-allow-origin": BASE.rstrip("/").rsplit("/", 0)[0] if False else "*", "access-control-allow-headers": "*"}
    if req.method == "OPTIONS":
        return await route.fulfill(status=204, headers=cors)
    if req.method == "GET":
        return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"}, body=json.dumps({"ok": True, "app": "mustatar", "key": True, "push": True}))
    try: b = json.loads(req.post_data or "{}")
    except Exception: b = {}
    text = json.dumps({"reply": "Hello! How can I help?", "actions": []}) if b.get("assistant") else (json.dumps(NOTE) if b.get("json", True) else "Done.")
    ev = [{"choices": [{"index": 0, "delta": {"content": text}, "finish_reason": "stop"}]}]
    sse = "".join("data: " + json.dumps(e) + "\n\n" for e in ev) + "data: [DONE]\n\n"
    await route.fulfill(status=200, headers={**cors, "content-type": "text/event-stream"}, body=sse)

SCREENS = ["assistant", "library", "result", "new", "calendar", "me", "settings", "studio", "recordings", "pending", "inbox"]

async def run(p, lang):
    problems, clicked = [], 0
    b = await p.chromium.launch()
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
    await c.add_init_script(f"localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');"
                            "localStorage.setItem('jn_plan', JSON.stringify('test'));localStorage.setItem('jn_me', JSON.stringify({name:'Tester', use:'study'}));"
                            "localStorage.setItem('jn_events', JSON.stringify([{id:'e1', title:'Fiqh class', date:new Date().toLocaleDateString('en-CA'), time:'10:00', type:'class'},{id:'e2', title:'Revise', date:new Date().toLocaleDateString('en-CA'), time:'', type:'task'}]));"
                            "localStorage.setItem('jn_habits', JSON.stringify([{id:'h1', name:'Quran 1 page'}]));")
    pg = await c.new_page()
    await pg.route("**/*workers.dev/**", fake_server)
    await pg.route("**/api.aladhan.com/**", lambda r: r.abort())
    await pg.route("**/accounts.google.com/**", lambda r: r.abort())
    errs = []
    pg.on("pageerror", lambda e: errs.append("page error: " + str(e)))
    pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "net::" not in m.text and errs.append("console: " + m.text))
    pg.on("dialog", lambda d: asyncio.ensure_future(d.dismiss()))
    pg.on("filechooser", lambda f: None)
    pg.on("popup", lambda w: asyncio.ensure_future(w.close()))
    await pg.goto(BASE); await pg.wait_for_timeout(1500)
    # one saved note, so the library and the note screen have buttons
    await pg.evaluate("JN.show('new'); document.querySelector('#transcript').closest('details').open = true")
    await pg.fill("#transcript", "Today's meeting. We decided to launch on Friday. " * 20)
    await pg.click("#make"); await pg.wait_for_timeout(2500)
    errs.clear()

    async def reset(screen):
        try: await pg.wait_for_function("!!(window.JN && window.JN.show)", timeout=15000, polling=200)
        except Exception:
            print('  (reloading; JN was', await pg.evaluate('typeof window.JN'), pg.url, ')', flush=True)
            await pg.goto(BASE); await pg.wait_for_function("!!(window.JN && window.JN.show)", timeout=15000, polling=200)
        await pg.evaluate("""(s)=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());
          document.querySelectorAll('.px.in').forEach(()=>window.JundNav?.closeSheet());
          document.querySelectorAll('.wl, .pick-sheet, .pick-back').forEach(x=>x.remove()); document.body.classList.remove('vx-open');
          if (window.JundDrawer?.close) JundDrawer.close();
          JN.show(s); window.scrollTo(0,0);}""", screen)
        await pg.keyboard.press("Escape")
        await pg.wait_for_timeout(80)

    async def mark(screen, i):
        return await pg.evaluate(f"""(()=>{{const sc=document.querySelector('#screen-{screen}'); const all=[...sc.querySelectorAll('button, [role=button], summary, select, input[type=checkbox]')];
            const e=all[{i}]; if(!e) return null; document.querySelectorAll('[data-ck]').forEach(x=>x.removeAttribute('data-ck')); e.dataset.ck='x'; const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
            const vis = r.width>0 && r.height>0 && s.visibility!=='hidden' && !e.disabled && !e.closest('[hidden]');
            return {{n: all.length, vis, text:(e.innerText||e.getAttribute('aria-label')||e.title||e.id||e.tagName).trim().slice(0,50), tag:e.tagName, id:e.id}}}})()""")

    for screen in SCREENS:
        i = 0
        while True:
            await reset(screen)
            if screen == "result":
                await pg.evaluate("JN.allLessons().then(l => l[0] && JN.openLesson(l[0]))"); await pg.wait_for_timeout(400)
            info = await mark(screen, i)
            if not info: break
            i += 1
            if not info["vis"] or SKIP.search(info["text"] + " " + info["id"]): continue
            before = len(errs)
            pass
            try:
                if info["tag"] == "SELECT":
                    await pg.evaluate("""(()=>{const e=document.querySelector('[data-ck="x"]'); if(e.options.length>1){const old=e.selectedIndex; e.selectedIndex=(old+1)%e.options.length; e.dispatchEvent(new Event('change',{bubbles:true})); e.selectedIndex=old; e.dispatchEvent(new Event('change',{bubbles:true}));}})()""")
                else:
                    await pg.locator('[data-ck="x"]').click(timeout=2500, force=True, no_wait_after=True)
                await pg.wait_for_timeout(250)
                clicked += 1
            except Exception as e:
                problems.append(f"{lang} {screen}: '{info['text']}' could not be clicked ({str(e).splitlines()[0][:90]})"); print("  PROBLEM", problems[-1], flush=True)
                continue
            if len(errs) > before:
                problems.append(f"{lang} {screen}: '{info['text']}' → {errs[before][:200]}"); print("  PROBLEM", problems[-1], flush=True)
            if pg.url.split('#')[0].split('?')[0] != BASE.split('?')[0]:
                await pg.goto(BASE); await pg.wait_for_timeout(1200)
    # the bottom bar, ＋ sheet rows and Me rows
    for k in ["rec", "up", "scan", "yt", "paste", "task", "habit", "focus"]:
        await reset("assistant")
        before = len(errs)
        await pg.click("#tab-plus"); await pg.wait_for_timeout(300)
        try:
            await pg.locator(f'.px [data-k="{k}"]').click(timeout=3000); await pg.wait_for_timeout(500); clicked += 1
        except Exception as e:
            problems.append(f"{lang} ＋ sheet: '{k}' could not be clicked ({str(e).splitlines()[0][:90]})")
        if len(errs) > before: problems.append(f"{lang} ＋ sheet: '{k}' → {errs[before][:200]}")
        await pg.evaluate("window.JundRecorder?.cancel?.(); window.JundRecorder?.stop?.()")
    await b.close()
    return problems, clicked

async def main():
    async with async_playwright() as p:
        allp = []
        for lang in ["en", "ar"]:
            probs, n = await run(p, lang)
            print(f"{lang}: clicked {n} buttons, {len(probs)} problem(s)")
            allp += probs
        for x in allp: print("FAIL", x)
        print("All checks passed" if not allp else f"{len(allp)} problem(s)")
        sys.exit(1 if allp else 0)

asyncio.run(main())
