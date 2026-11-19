"""My notes (like Google Keep) + pick notes → AI; Today; a new chat on every open; no chat limit.
Run: python3 tests/keep_test.py http://localhost:8765/"""
import asyncio, json, sys, time
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))

SENT = []
def fake():
    async def srv(route):
        req = route.request
        cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-mst-stream, authorization"}
        if req.method == "OPTIONS": return await route.fulfill(status=204, headers=cors)
        if req.method == "GET": return await route.fulfill(status=200, headers={**cors, "content-type": "application/json"}, body='{"ok":true,"app":"mustatar","key":true}')
        if "/transcribe" in req.url: out = "اشتر الخبز بعد المغرب"
        else:
            body = req.post_data or ""
            SENT.append(body)
            b = json.loads(body) if body.startswith("{") else {}
            sysm = b.get("system", "")
            if "checklist (items)" in sysm: out = json.dumps({"title": "To do", "text": "", "items": ["Call Ahmad", "Buy dates"]})
            elif "ONE well-organised note" in sysm: out = json.dumps({"title": "Fasting, combined", "text": "**Fasting** is a pillar.\n- Starts at dawn\n- Forgetting does not break it"})
            elif "Do what the user asks" in sysm: out = json.dumps({"title": "Revision plan", "text": "- Monday: fasting\n- Tuesday: hadith terms"})
            elif "Summarise this chat" in sysm: out = "A chat about fasting."
            elif "general assistant" in sysm or "You can act on his calendar" in sysm:
                u = b.get("user", "")
                if "save this as a note" in u.lower(): out = json.dumps({"reply": "Saved.", "actions": [{"do": "note", "title": "From chat", "text": "Remember the dates"}]})
                else: out = json.dumps({"reply": "Here is the answer from your notes.", "actions": []})
            else: out = json.dumps({"reply": "ok", "actions": []})
        ev = {"choices": [{"index": 0, "delta": {"content": out}, "finish_reason": "stop"}]}
        await route.fulfill(status=200, headers={**cors, "content-type": "text/event-stream"}, body="data: " + json.dumps(ev, ensure_ascii=False) + "\n\ndata: [DONE]\n\n")
    return srv

async def ctx(b, lang="en", extra=""):
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block", permissions=["microphone"])
    await c.add_init_script(f"localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_plan',JSON.stringify('basic'));{extra}")
    await c.route("**/api.aladhan.com/**", lambda r: r.abort())
    await c.route("**/*workers.dev/**", fake())
    return c
async def hold(pg, el):
    box = await el.bounding_box()
    await pg.mouse.move(box["x"] + 20, box["y"] + 20); await pg.mouse.down(); await pg.wait_for_timeout(650); await pg.mouse.up(); await pg.wait_for_timeout(150)
async def cards(pg): return await pg.query_selector_all("#kp-grid .kp-card")
async def titles(pg): return await pg.evaluate("[...document.querySelectorAll('#kp-grid .kp-card')].map(c => c.querySelector('.kp-t')?.textContent || c.textContent.trim().slice(0, 30))")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        # ---------- a new chat on every open, the old one in ☰; no chat limit ----------
        old = int(time.time() * 1000) - 60_000
        seed = f"localStorage.setItem('jn_chatId', JSON.stringify('cOld'));localStorage.setItem('jn_assistantLog', JSON.stringify([{{who:'me',text:'What did we say about fasting?',t:{old}}},{{who:'ai',text:'We said it starts at dawn.',t:{old}}}]));" \
               f"localStorage.setItem('jn_mstData:assistant', JSON.stringify({{saved:{old},log:[{{who:'me',text:'cloud copy'}},{{who:'ai',text:'old'}}]}}));" \
               "const d=new Date().toLocaleDateString('en-CA'); localStorage.setItem('jn_planUse', JSON.stringify({day:d, month:d.slice(0,7), rec:0, msg:400, text:0, yt:0, quiz:0}));"
        c = await ctx(b, "en", seed); pg = await c.new_page(); errs = []
        pg.on("pageerror", lambda e: (errs.append(str(e)), print("   PAGE ERROR", e.stack[:400] if hasattr(e, "stack") else e)))
        await pg.goto(BASE); await pg.wait_for_timeout(2500)
        log = await pg.evaluate("document.querySelectorAll('#as-log .msg').length")
        chats = await pg.evaluate("JSON.parse(localStorage.getItem('jn_chats')||'[]').map(c => c.title)")
        check(log == 0 and await pg.evaluate("JundAssistant.currentChat()") != "cOld", "o1 the app opens on a new, empty chat (even a minute later)")
        check("What did we say about fasting?" in chats, f"o2 the last chat is kept in the ☰ list ({chats})")
        check(await pg.evaluate("!document.querySelector('#screen-assistant').classList.contains('talking')"), "o3 the cloud copy of the old chat does not come back on screen")
        # Today: quiet, with four shortcuts
        check(await pg.evaluate("[...document.querySelectorAll('#hm-tiles [data-tile]')].map(b=>b.dataset.tile).join()") == "note,notes,studio,rec", "t1 Today has four shortcuts: Note, My notes, Studio, Record")
        hid = await pg.evaluate("['#hm-about','#hm-study'].every(s => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none' || e.hidden })")
        check(hid and await pg.evaluate("!document.querySelector('.cd-row')"), "t2 Today has no welcome banner, study chips or row of countdown cards")
        check(await pg.is_visible("#hm-count"), "t3 the nearest countdown is one line in the prayer card")
        # no limit on the assistant
        await pg.fill("#as-text", "hello"); await pg.click("#as-send"); await pg.wait_for_timeout(1500)
        last = await pg.evaluate("[...document.querySelectorAll('#as-log .msg.ai')].pop()?.textContent || ''")
        check("answer" in last, f"o4 no daily limit on the assistant: message 401 is answered ({last[:40]!r})")
        check(await pg.evaluate("!/Assistant messages/.test(document.body.innerText)"), "o5 the plan card no longer counts assistant messages")
        # ---------- My notes ----------
        await pg.click('.tabbar [data-nav="library"]'); await pg.wait_for_timeout(400)
        check(await pg.is_visible("#keep") and await pg.evaluate("document.querySelector('#lib-seg [aria-selected=true]').dataset.seg") == "keep", "k1 Notes opens on My notes")
        await pg.click('#lib-seg [data-seg="files"]'); await pg.wait_for_timeout(200)
        check(await pg.is_visible("#library-list") and not await pg.is_visible("#keep"), "k2 Lessons and files is one tap away")
        await pg.click('#lib-seg [data-seg="keep"]')
        # a text note, saved as you type
        await pg.click("#kp-take-t"); await pg.wait_for_timeout(300)
        await pg.fill("#kp-title", "Fasting"); await pg.fill("#kp-text", "Fasting is a pillar of Islam.\nIt starts at dawn.")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(400)
        check("Fasting" in await titles(pg), "k3 Take a note: the note is on the board after Back (no Save button)")
        # an empty note is not kept
        await pg.click("#kp-take-t"); await pg.click("#kp-ed-back"); await pg.wait_for_timeout(300)
        check(len(await cards(pg)) == 1, "k4 an empty note is thrown away")
        # a checklist
        await pg.click("#kp-take-list"); await pg.wait_for_timeout(300)
        await pg.fill("#kp-title", "Shopping")
        await pg.fill(".kp-it >> nth=0", "Dates"); await pg.press(".kp-it >> nth=0", "Enter")
        await pg.keyboard.type("Milk"); await pg.press(".kp-it >> nth=1", "Enter"); await pg.keyboard.type("Bread")
        await pg.click(".kp-row >> nth=2 >> input[type=checkbox]"); await pg.wait_for_timeout(200)
        ticked = await pg.inner_text(".kp-done summary")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(400)
        shop = await pg.evaluate("JundKeep.all().then(a => a.find(n => n.title === 'Shopping'))")
        check(shop and [i["t"] for i in shop["items"]] == ["Dates", "Milk", "Bread"] and shop["items"][2]["done"] and "1 ticked" in ticked, "k5 checklist: Enter adds an item, a ticked item moves to Ticked")
        # colour, pin, label
        await pg.click('.kp-card:has-text("Fasting")'); await pg.wait_for_timeout(300)
        await pg.click("#kp-ed-color"); await pg.click('#kp-pop [data-col="sand"]')
        await pg.click("#kp-ed-pin")
        await pg.click("#kp-ed-label"); await pg.fill("#kp-newl", "Fiqh"); await pg.press("#kp-newl", "Enter"); await pg.click("#kp-lbl-ok")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(400)
        f = await pg.evaluate("JundKeep.all().then(a => a.find(n => n.title === 'Fasting'))")
        check(f["color"] == "sand" and f["pinned"] and f["labels"] == ["Fiqh"], "k6 colour, pin and label are kept")
        check(await pg.evaluate("document.querySelector('.kp-h')?.textContent") == "Pinned" and await pg.evaluate("document.querySelector('#kp-grid .kp-card').dataset.c") == "sand", "k7 pinned notes come first, in their colour")
        await pg.click('#kp-chips [data-v="Fiqh"]'); await pg.wait_for_timeout(200)
        check(await titles(pg) == ["Fasting"], "k8 a label filters the board")
        await pg.click('#kp-chips [data-v="notes"]'); await pg.fill("#kp-q", "milk"); await pg.wait_for_timeout(200)
        check(await titles(pg) == ["Shopping"], "k9 search finds words inside notes and lists")
        await pg.fill("#kp-q", ""); await pg.wait_for_timeout(200)
        # a voice note: speak, and the words are written in
        await pg.click("#kp-take-mic"); await pg.wait_for_timeout(1300)
        check(await pg.is_visible("#kp-rec"), "k10 voice note: recording shows with Done and Cancel")
        await pg.click("#kp-rec-stop"); await pg.wait_for_timeout(1500)
        vt = await pg.input_value("#kp-text")
        check("اشتر الخبز" in vt, f"k11 the words said are written into the note ({vt!r})")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(300)
        # still there after closing the app
        await pg.reload(); await pg.wait_for_timeout(1500)
        await pg.evaluate("JundKeep.open()"); await pg.wait_for_timeout(400)
        check(len(await cards(pg)) == 3, "k12 notes stay after the app is closed and opened")
        # ---------- pick notes ----------
        cs = await cards(pg); await hold(pg, cs[0])
        check(await pg.is_visible("#kp-selbar") and "1 selected" in await pg.inner_text("#kp-sel-n"), "s1 press and hold picks a note; the bar shows")
        cs = await cards(pg); await cs[1].click(); await pg.wait_for_timeout(150)
        check("2 selected" in await pg.inner_text("#kp-sel-n") and await pg.is_visible("#kp-aibtn"), "s2 a tap picks more; ✦ Work on 2 notes with AI shows")
        await pg.go_back(); await pg.wait_for_timeout(300)
        check(not await pg.is_visible("#kp-selbar"), "s3 Back stops picking")
        # archive and bin
        cs = await cards(pg); await hold(pg, cs[2]); await pg.click('#kp-selbar [data-sa="archive"]'); await pg.wait_for_timeout(300)
        check(len(await cards(pg)) == 2, "s4 archive hides a note from the board")
        await pg.click('#kp-chips [data-v="archive"]'); await pg.wait_for_timeout(200)
        cs = await cards(pg); await hold(pg, cs[0]); await pg.click('#kp-selbar [data-sa="archive"]'); await pg.click('#kp-chips [data-v="notes"]'); await pg.wait_for_timeout(300)
        check(len(await cards(pg)) == 3, "s5 and brings it back")
        cs = await cards(pg); await hold(pg, cs[2]); await pg.click('#kp-selbar [data-sa="trash"]'); await pg.wait_for_timeout(300)
        await pg.click('#kp-chips [data-v="trash"]'); await pg.wait_for_timeout(200)
        check(len(await cards(pg)) == 1 and "7 days" in await pg.inner_text("#kp-grid"), "s6 deleted notes wait in the Bin for 7 days")
        cs = await cards(pg); await hold(pg, cs[0]); await pg.click('#kp-selbar [data-sa="archive"]'); await pg.click('#kp-chips [data-v="notes"]'); await pg.wait_for_timeout(300)
        check(len(await cards(pg)) == 3, "s7 and can be restored")
        # ---------- with AI ----------
        await pg.evaluate("JundKeep.save({id:'Kx', title:'Fasting 2', text:'Forgetting does not break the fast.', labels:['Fiqh'], color:''})"); await pg.wait_for_timeout(200)
        sel = lambda t: pg.evaluate(f"(() => {{ const c = [...document.querySelectorAll('#kp-grid .kp-card')].find(c => (c.querySelector('.kp-t')?.textContent||'') === {json.dumps(t)}); return c?.dataset.id }})()")
        a, bb = await sel("Fasting"), await sel("Fasting 2")
        await hold(pg, await pg.query_selector(f'.kp-card[data-id="{a}"]')); await (await pg.query_selector(f'.kp-card[data-id="{bb}"]')).click()
        await pg.click("#kp-aibtn"); await pg.wait_for_timeout(300)
        acts = await pg.evaluate("[...document.querySelectorAll('#kp-acts [data-k]')].map(b=>b.dataset.k).join()")
        check(acts == "ask,combine,summary,todo,study,quiz,expand,post,merge", f"a1 the AI sheet offers: ask, combine, summarise, to-do, study file, quiz, explain, post, plain merge ({acts})")
        before = await pg.evaluate("JundKeep.all().then(a => a.length)")
        await pg.click('#kp-acts [data-k="combine"]'); await pg.wait_for_timeout(1500)
        new = await pg.evaluate("JundKeep.all().then(a => a.find(n => n.title === 'Fasting, combined'))")
        check(new and new["ai"] == "combine" and await pg.is_visible("#kp-ed") and await pg.evaluate("JundKeep.all().then(a => a.length)") == before + 1, "a2 Combine: the AI's note opens as a new note; the originals stay")
        check(any("Fasting is a pillar" in s and "Forgetting does not break" in s for s in SENT), "a3 the AI is given the text of both notes")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(300)
        # merge as they are (no AI)
        await hold(pg, await pg.query_selector(f'.kp-card[data-id="{a}"]')); await (await pg.query_selector(f'.kp-card[data-id="{bb}"]')).click()
        await pg.click("#kp-aibtn"); n0 = len(SENT); await pg.click('#kp-acts [data-k="merge"]'); await pg.wait_for_timeout(500)
        m = await pg.evaluate("JundKeep.all().then(a => a.find(n => n.merged))")
        check(m and "pillar" in m["text"] and "Forgetting" in m["text"] and len(SENT) == n0, "a4 Merge as they are: one note with all the text, no AI used")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(300)
        # to-do list → a checklist
        await hold(pg, await pg.query_selector(f'.kp-card[data-id="{a}"]')); await pg.click("#kp-aibtn"); await pg.click('#kp-acts [data-k="todo"]'); await pg.wait_for_timeout(1500)
        td = await pg.evaluate("JundKeep.all().then(a => a.find(n => n.ai === 'todo'))")
        check(td and [i["t"] for i in td["items"]] == ["Call Ahmad", "Buy dates"], "a5 Make a to-do list gives a real checklist")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(300)
        # tell the AI what to make
        await hold(pg, await pg.query_selector(f'.kp-card[data-id="{a}"]')); await pg.click("#kp-aibtn")
        await pg.fill("#kp-own-t", "a revision plan for this week"); await pg.click("#kp-own button[type=submit]"); await pg.wait_for_timeout(1500)
        check(await pg.evaluate("JundKeep.all().then(a => a.some(n => n.title === 'Revision plan' && n.ai === 'own'))") and any("a revision plan for this week" in s for s in SENT), "a6 your own request makes a new note")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(300)
        # one note, from the editor
        await (await pg.query_selector(f'.kp-card[data-id="{a}"]')).click(); await pg.wait_for_timeout(300)
        await pg.click("#kp-ed-ai"); await pg.wait_for_timeout(300)
        check(await pg.is_visible("#kp-ai") and "With AI" in await pg.inner_text("#kp-ai .kp-dh"), "a7 ✦ AI in the editor works on that one note")
        await pg.keyboard.press("Escape"); await pg.click("#kp-ed-back"); await pg.wait_for_timeout(300)
        # ask about them → a chat that answers from those notes
        await hold(pg, await pg.query_selector(f'.kp-card[data-id="{a}"]')); await (await pg.query_selector(f'.kp-card[data-id="{bb}"]')).click()
        await pg.click("#kp-aibtn"); await pg.click('#kp-acts [data-k="ask"]'); await pg.wait_for_timeout(600)
        check(await pg.is_visible("#as-scope") and "From 2 notes" in await pg.inner_text("#as-scope"), "a8 Ask about them: a new chat with “From 2 notes” above the box")
        n0 = len(SENT); await pg.fill("#as-text", "When does fasting start?"); await pg.click("#as-send"); await pg.wait_for_timeout(1500)
        sent = " ".join(SENT[n0:])
        check("THE NOTES HE PICKED" in sent and "It starts at dawn" in sent and "Forgetting does not break" in sent, "a9 the chat is given exactly the picked notes")
        await pg.click("#as-scope-x"); await pg.wait_for_timeout(100)
        check(not await pg.is_visible("#as-scope"), "a10 ✕ removes the notes from the chat")
        # quiz: starts by itself
        await pg.evaluate("JundKeep.open()"); await pg.wait_for_timeout(300)
        await hold(pg, await pg.query_selector(f'.kp-card[data-id="{a}"]')); n0 = len(SENT); await pg.click("#kp-aibtn"); await pg.click('#kp-acts [data-k="quiz"]'); await pg.wait_for_timeout(1500)
        check(any("Quiz me on these notes" in s for s in SENT[n0:]), "a11 Quiz me starts the questions in the chat")
        # study file → New notes with the text in
        await pg.evaluate("JundKeep.open()"); await pg.wait_for_timeout(300)
        await hold(pg, await pg.query_selector(f'.kp-card[data-id="{a}"]')); await pg.click("#kp-aibtn"); await pg.click('#kp-acts [data-k="study"]'); await pg.wait_for_timeout(500)
        check(not await pg.evaluate("document.querySelector('#screen-new').hidden") and "It starts at dawn" in await pg.input_value("#transcript"), "a12 Make a study file puts the notes into New notes")
        # the assistant can save a note, and finds your notes
        await pg.evaluate("JundAssistant.newChat(); JN.show('assistant')"); await pg.wait_for_timeout(300)
        await pg.fill("#as-text", "save this as a note: remember the dates"); await pg.click("#as-send"); await pg.wait_for_timeout(1500)
        check(await pg.evaluate("JundKeep.all().then(a => a.some(n => n.title === 'From chat'))"), "a13 “save this as a note” in the chat saves to My notes")
        n0 = len(SENT); await pg.fill("#as-text", "what did I write about shopping milk"); await pg.click("#as-send"); await pg.wait_for_timeout(1500)
        check(any("HIS OWN QUICK NOTES" in s and "Milk" in s for s in SENT[n0:]), "a14 the assistant reads your matching notes")
        # ---------- Keep's extras: Undo, reminders, list view ----------
        await pg.evaluate("JundKeep.open()"); await pg.wait_for_timeout(300)
        n_before = len(await cards(pg))
        cs = await cards(pg); await hold(pg, cs[0]); await pg.click('#kp-selbar [data-sa="trash"]'); await pg.wait_for_timeout(300)
        check(await pg.is_visible("#toast .tst-act"), "u1 deleting shows Undo")
        await pg.click("#toast .tst-act"); await pg.wait_for_timeout(400)
        check(len(await cards(pg)) == n_before, "u2 Undo brings the note straight back")
        await (await pg.query_selector(f'.kp-card[data-id="{a}"]')).click(); await pg.wait_for_timeout(300)
        await pg.click("#kp-ed-bell"); await pg.wait_for_timeout(200)
        await pg.click("#kp-pop .kp-remq >> nth=1"); await pg.wait_for_timeout(300)
        ev = await pg.evaluate(f"JundCal.events().find(e => e.keep === {json.dumps(a)})")
        check(ev and ev["remind"] == 0 and ev["time"] == "08:00" and await pg.is_visible(".kp-remchip"), "u3 Remind me: tomorrow 08:00 goes to the calendar and rings like a reminder")
        await pg.click(".kp-remx"); await pg.wait_for_timeout(200)
        check(not await pg.evaluate(f"JundCal.events().some(e => e.keep === {json.dumps(a)})"), "u4 removing the reminder takes it off the calendar")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(300)
        await pg.click("#kp-layout"); await pg.wait_for_timeout(150)
        cols = await pg.evaluate("getComputedStyle(document.querySelector('#kp-grid .kp-grid')).columnCount")
        check(cols == "1", "u5 one tap switches to a list view")
        await pg.click("#kp-layout")
        # ---------- sync and backup ----------
        await pg.evaluate("localStorage.setItem('jn_mstToken', JSON.stringify('t')); localStorage.setItem('jn_mstPending', '{}')")
        nid = await pg.evaluate("JundKeep.save({id:'Ksync', title:'Sync me', text:'x'}).then(n => n.id)"); await pg.wait_for_timeout(200)
        pend = await pg.evaluate("JSON.parse(localStorage.getItem('jn_mstPending')||'{}')")
        check("keep:Ksync" in pend and pend["keep:Ksync"]["kind"] == "keep", "y1 signed in: each note goes to your private space")
        await pg.evaluate("localStorage.removeItem('jn_mstToken')")
        data = await pg.evaluate("JundImport.backupData()")
        check(any(n.get("title") == "Shopping" for n in data.get("keep", [])), "y2 the backup file has My notes")
        check(not errs, f"y3 no page errors {errs[:2]}")
        await c.close()
        # a backup on a new phone brings the notes back
        c = await ctx(b, "ar"); pg = await c.new_page()
        await pg.goto(BASE); await pg.wait_for_timeout(1200)
        n = await pg.evaluate("d => JundImport.restore(d)", data)
        check(await pg.evaluate("JundKeep.all().then(a => a.some(n => n.title === 'Shopping'))"), "y4 restoring a backup brings My notes back")
        # Arabic
        await pg.evaluate("JundKeep.open()"); await pg.wait_for_timeout(400)
        txt = await pg.inner_text("#screen-library")
        check("ملاحظاتي" in txt and "اكتب ملاحظة" in txt and "الدروس والملفات" in txt, "r1 My notes is in Arabic")
        tiles = await pg.evaluate("[...document.querySelectorAll('#hm-tiles .hm-tile')].map(t => [...t.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()).join('|')")
        check(tiles == "ملاحظة|ملاحظاتي|الاستوديو|تسجيل", f"r2 Today's shortcuts in Arabic ({tiles})")
        await c.close(); await b.close()
asyncio.run(main())
print("\n" + (f"{len(fails)} check(s) failed" if fails else "All checks passed")); sys.exit(1 if fails else 0)
