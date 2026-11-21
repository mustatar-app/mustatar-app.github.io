"""Proof for every line, how much was heard, and Bring your work (import and backup).
Run: python3 tests/proof_import_test.py http://localhost:8765/"""
import asyncio, json, subprocess, sys, tempfile, zipfile, io, os
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
T = tempfile.mkdtemp(); fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
def ff(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)

# ---------- files from other apps ----------
# Google Takeout (Keep): two notes as .json and .html, one with a checklist, one in the bin
keep = io.BytesIO()
with zipfile.ZipFile(keep, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("Takeout/Keep/Fasting rulings.json", json.dumps({"title": "أحكام الصيام", "textContent": "الصيام ركن من أركان الإسلام.\nيبدأ من طلوع الفجر.", "labels": [{"name": "Fiqh"}], "createdTimestampUsec": 1700000000000000, "isTrashed": False}, ensure_ascii=False))
    z.writestr("Takeout/Keep/Fasting rulings.html", "<html><body>duplicate</body></html>")
    z.writestr("Takeout/Keep/Shopping.json", json.dumps({"title": "Shopping", "textContent": "", "listContent": [{"text": "Dates", "isChecked": True}, {"text": "Milk", "isChecked": False}], "labels": [], "createdTimestampUsec": 1700000000000000}))
    z.writestr("Takeout/Keep/Old.json", json.dumps({"title": "Old", "textContent": "gone", "isTrashed": True}))
    z.writestr("Takeout/Keep/Labels.txt", "Fiqh")
    z.writestr("Takeout/archive_browser.html", "<html><title>Takeout</title></html>")
open(f"{T}/takeout-keep.zip", "wb").write(keep.getvalue())
# Notion: markdown with long ids, inside a zip inside a zip
inner = io.BytesIO()
with zipfile.ZipFile(inner, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("Work 0123456789abcdef0123456789abcdef/Weekly plan 0123456789abcdef0123456789abcdef.md", "# Weekly plan\n\n## Monday\n- [x] Call the supplier\n- [ ] Send the report\n\nSome **bold** words and a [link](https://x.y).\n")
    z.writestr("Work 0123456789abcdef0123456789abcdef/Budget 0123456789abcdef0123456789abcdef.csv", "a,b\n1,2\n")
outer = io.BytesIO()
with zipfile.ZipFile(outer, "w", zipfile.ZIP_STORED) as z:
    z.writestr("Export-1234-Part-1.zip", inner.getvalue())
open(f"{T}/notion.zip", "wb").write(outer.getvalue())
# Evernote
open(f"{T}/my.enex", "w").write("""<?xml version="1.0" encoding="UTF-8"?>
<en-export><note><title>Meeting with Ali</title><content><![CDATA[<en-note><div>Decided to launch in March.</div><div><en-todo checked="true"/>Book the hall</div><div><en-todo/>Print flyers</div></en-note>]]></content><created>20240105T101500Z</created><tag>Business</tag></note>
<note><title>Empty</title><content><![CDATA[<en-note></en-note>]]></content></note></en-export>""")
# Word
import docx
d = docx.Document(); d.add_heading("Lesson on wudu", 1); d.add_paragraph("Washing the face is required."); d.add_paragraph("Hands", style="List Bullet"); d.save(f"{T}/wudu.docx")
open(f"{T}/idea.md", "w").write("---\ntags: x\n---\n# idea\nA quick thought about Mustatar.\n")

# 7 minutes of sound for the coverage check
ff("-f", "lavfi", "-i", "sine=f=300:sample_rate=16000", "-t", "420", "-ac", "1", f"{T}/talk.wav")
ff("-i", f"{T}/talk.wav", "-b:a", "48k", f"{T}/talk.mp3")

SAID = ["الحمد لله نبدأ درس اليوم عن الطهارة", "الوضوء له فرائض منها غسل الوجه", "", "", "ومن السنن المضمضة والاستنشاق في أول الوضوء", "التيمم يكون عند فقد الماء أو العجز عن استعماله", "وفي الختام نسأل الله التوفيق"]

async def ctx(b, lang="en", extra=""):
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block", accept_downloads=True)
    await c.add_init_script(f"localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_plan',JSON.stringify('test'));localStorage.setItem('jn_autoCorrect','false');localStorage.setItem('jn_autoMake','false');{extra}")
    await c.route("**/api.aladhan.com/**", lambda r: r.abort())
    return c

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- Bring your work ----------
        c = await ctx(b); pg = await c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(1200)
        await pg.click('.tabbar [data-nav="library"]'); await pg.wait_for_timeout(400)
        check(await pg.is_visible("#kp-bring"), "i1 empty My notes offers Bring your notes")
        await pg.click('.tabbar [data-nav="me"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-k="bring"]'); await pg.wait_for_timeout(300)
        check(await pg.is_visible("#bring-dialog"), "i2 Me → Bring your work opens the sheet")
        n_src = await pg.evaluate("document.querySelectorAll('.bring-src').length")
        check(n_src == 8, f"i3 the sheet lists 8 sources (with Samsung Notes and other phone notes) with their steps ({n_src})")
        await pg.set_input_files("#bring-file", [f"{T}/takeout-keep.zip", f"{T}/notion.zip", f"{T}/my.enex", f"{T}/wudu.docx", f"{T}/idea.md"])
        await pg.wait_for_function("/Brought in|Nothing/.test(document.querySelector('#bring-st').innerText)", timeout=20000)
        st = await pg.inner_text("#bring-st")
        print("   ", st.replace("\n", " | "))
        check("Brought in 6 notes" in st, "i4 6 notes brought in (2 Keep, 1 Notion, 1 Evernote, 1 Word, 1 Markdown); bin, duplicate .html and CSV left out")
        check("Google Keep 2" in st and "Notion 1" in st and "Evernote 1" in st, "i5 the result says where each came from")
        ls = await pg.evaluate("JundKeep.all().then(a => a.map(l => ({u: l.title || l.text.split('\\n')[0], s: (l.labels||[])[0] || '', n: {text: l.text, items: l.items}, t: l.text, d: new Date(l.created).toISOString(), from: l.from, pinned: l.pinned, color: l.color})))")
        by = {x["u"]: x for x in ls}
        check(set(by) == {"أحكام الصيام", "Shopping", "Weekly plan", "Meeting with Ali", "wudu", "idea"}, f"i6 the right titles {sorted(by)}")
        check(by.get("أحكام الصيام", {}).get("s") == "Fiqh" and by.get("Meeting with Ali", {}).get("s") == "Business" and by.get("Weekly plan", {}).get("s") == "Work", "i7 each note comes into My notes under its label, tag or folder")
        shop = json.dumps(by.get("Shopping", {}).get("n", {}), ensure_ascii=False)
        sh = by.get("Shopping", {}).get("n", {}).get("items") or []
        check([(i["t"], i["done"]) for i in sh] == [("Dates", True), ("Milk", False)], "i8 a Keep checklist comes in as a checklist with its ticks")
        wp = by.get("Weekly plan", {}).get("n", {})
        wt = by.get("Weekly plan", {}).get("t", "")
        check("Monday" in wt and "Call the supplier" in wt and "[link]" not in wt and "**bold**" in wt, "i9 Notion text, headings and bold kept; link markup removed")
        check("☑ Book the hall" in json.dumps(by.get("Meeting with Ali", {}).get("n", {}), ensure_ascii=False) and by.get("Meeting with Ali", {}).get("d", "").startswith("2024-01-05"), "i10 Evernote to-dos and the original date kept")
        check("Washing the face is required." in (by.get("wudu", {}).get("t") or "") and "tags:" not in (by.get("idea", {}).get("t") or ""), "i11 Word text read; Obsidian front matter removed")
        # the same files again: nothing doubles
        await pg.set_input_files("#bring-file", [f"{T}/takeout-keep.zip", f"{T}/my.enex"])
        await pg.wait_for_timeout(1500)
        n = await pg.evaluate("JundKeep.all().then(a => a.length)")
        check(n == 6, f"i12 bringing the same files again does not double them ({n})")
        await pg.click("#bring-see"); await pg.wait_for_timeout(500)
        lib = await pg.inner_text("#keep")
        check("Fiqh" in lib and "Weekly plan" in lib, "i13 See them in Notes shows the brought-in notes in My notes")
        # open one: it renders as a normal note
        await pg.evaluate("JundKeep.all().then(a => JundKeep.edit(a.find(l => l.title === 'Weekly plan').id))"); await pg.wait_for_timeout(500)
        txt = await pg.input_value("#kp-text")
        check("Monday" in txt and "Call the supplier" in txt, "i14 a brought-in note opens in the note editor like any other")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(200)
        # backup → a fresh phone → restore
        await pg.evaluate("localStorage.setItem('jn_habits', JSON.stringify([{id:'h1',name:'Read Quran'}])); localStorage.setItem('jn_mstToken', JSON.stringify('SECRET'))")
        data = await pg.evaluate("JundImport.backupData()")
        raw = json.dumps(data)
        check(len(data["keep"]) == 6 and "habits" in data["data"] and "SECRET" not in raw, "i15 the backup has all notes and lists, and never the sign-in")
        open(f"{T}/backup.json", "w").write(raw)
        check(not errs, f"i16 no page errors {errs[:2]}")
        await c.close()
        c = await ctx(b, "ar"); pg = await c.new_page()
        await pg.goto(BASE); await pg.wait_for_timeout(1000)
        await pg.evaluate("localStorage.setItem('jn_habits', JSON.stringify([{id:'mine',name:'كتابة'}]))")
        await pg.evaluate("JundImport.open()"); await pg.wait_for_timeout(200)
        check("انقل أعمالك" in await pg.inner_text("#bring-dialog"), "i17 the sheet is in Arabic")
        await pg.set_input_files("#bring-file", f"{T}/backup.json")
        await pg.wait_for_function("/نُقلت|لا شيء/.test(document.querySelector('#bring-st').innerText)", timeout=15000)
        n = await pg.evaluate("JundKeep.all().then(a => a.length)")
        hab = await pg.evaluate("JSON.parse(localStorage.getItem('jn_habits'))")
        check(n == 6 and hab[0]["id"] == "mine", f"i18 a backup brings back all notes and never replaces what is on the phone ({n}, {hab})")
        # Word on New notes is read as text, not as unreadable characters
        await pg.evaluate("JN.show('new')"); await pg.wait_for_timeout(300)
        await pg.set_input_files("#file", f"{T}/wudu.docx"); await pg.wait_for_timeout(1200)
        t = await pg.evaluate("__jn.pending().map(p => p.text).join('|')")
        check("Washing the face is required." in t and "PK" not in t[:5], "i19 a Word file on New notes is read as its text")
        await c.close()

        # ---------- how much was heard: 7 minutes, minutes 3 and 4 silent ----------
        c = await ctx(b); pg = await c.new_page(); calls = []
        async def srv(route):
            req = route.request
            cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-mst-stream, authorization"}
            if req.method == "OPTIONS": return await route.fulfill(status=204, headers=cors)
            if "/transcribe" in req.url:
                said = SAID[len(calls) % len(SAID)]; calls.append(req.url)
                ev = {"choices": [{"index": 0, "delta": {"content": said}, "finish_reason": "stop"}]}
                return await route.fulfill(status=200, headers={**cors, "content-type": "text/event-stream"}, body="data: " + json.dumps(ev, ensure_ascii=False) + "\n\ndata: [DONE]\n\n")
            await route.fulfill(status=200, headers={**cors, "content-type": "application/json"}, body='{"ok":true,"app":"mustatar","key":true}')
        await pg.route("**/*workers.dev/**", srv)
        await pg.goto(BASE); await pg.wait_for_timeout(1200)
        await pg.evaluate("JN.show('new')"); await pg.wait_for_timeout(300)
        await pg.set_input_files("#file", f"{T}/talk.mp3")
        for _ in range(120):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate("__jn.pending().some(p => /Transcribed/.test(p.status||''))"): break
        it = await pg.evaluate("(()=>{const p=__jn.pending()[0];return {tl:p.timeline,h:p.heard,st:p.status}})()")
        print("   ", it["st"], it["h"])
        tl = it["tl"] or []
        check(len(tl) == 7 and tl[0]["s"] == 0 and all(abs(x["s"] - 60 * i) <= 8 for i, x in enumerate(tl)) and all(tl[i]["e"] == tl[i + 1]["s"] for i in range(6)), f"h1 each minute knows where it sits, with no gaps ({[x['s'] for x in tl]})")
        check(it["h"] and abs(it["h"]["total"] - 420) <= 2 and it["h"]["speech"] == 300, f"h2 heard 7 min, speech in 5 ({it['h']})")
        check("speech in 5/7 min" in (it["st"] or ""), "h3 the list says how much had speech")

        # ---------- proof for each line ----------
        lesson = {"id": "Lproof", "subject": {"id": "mine:Fiqh", "name": "Fiqh", "place": "mine"}, "unit": "Wudu", "kind": "transcript", "lang": "ar", "engine": "server",
                  "date": "2026-11-19T10:00:00Z", "transcript": " ".join(s for s in SAID if s), "timeline": tl, "heard": it["h"], "txid": "tx-proof",
                  "notes": {"title": "الوضوء", "sections": [{"heading": "فرائض الوضوء", "blocks": [{"t": "list", "ordered": False, "items": ["من فرائض الوضوء غسل الوجه", "التيمم عند فقد الماء أو العجز عن استعماله", "قاعدة ذهبية: الطيارات تطير في السماء الزرقاء"]}]}], "mindmap": [], "report": {}},
                  "chat": []}
        await pg.evaluate("async l => { await JN.saveLesson(l); await JN.openLesson(l); }", lesson); await pg.wait_for_timeout(900)
        heard = await pg.inner_text("#heard")
        check("Heard all 7 min" in heard and "speech in 5" in heard and "2 min quiet" in heard, f"p1 the coverage line under the title ({heard.strip()})")
        check(await pg.is_visible("#rt-proof"), "p2 the note has Where is this from?")
        # the sound of the recording, still on the phone
        await pg.evaluate("window.JundRecs.audioFor = async id => id === 'tx-proof' ? new Blob(['x'], {type:'audio/mpeg'}) : null")
        await pg.click("#rt-proof"); await pg.wait_for_timeout(200)
        check(await pg.evaluate("document.body.classList.contains('proof-on')"), "p3 checking mode turns on")
        lis = await pg.query_selector_all("#pages-notes li")
        await lis[1].click(); await pg.wait_for_timeout(500)
        sh = await pg.inner_text("#proof-sheet")
        print("   ", sh.replace("\n", " | ")[:200])
        import re as _re
        m = _re.search(r"(?:Minute|الدقيقة) (\d+):(\d\d)", sh); at = int(m[1]) * 60 + int(m[2]) if m else -1
        check(tl[5]["s"] <= at < tl[5]["e"], f"p4 the tayammum line points to the 6th minute of the recording ({at} s)")
        check("Clear match" in sh or "تطابق واضح" in sh, "p5 it says the match is clear")
        check(await pg.is_visible("#pf-play"), "p6 Listen from here shows while the sound is on the phone")
        await pg.click("#pf-x"); await lis[0].click(); await pg.wait_for_timeout(400)
        sh = await pg.inner_text("#proof-sheet")
        m = _re.search(r"(?:Minute|الدقيقة) (\d+):(\d\d)", sh); at = int(m[1]) * 60 + int(m[2]) if m else -1
        check(tl[1]["s"] <= at < tl[1]["e"], f"p7 the wudu line points to the 2nd minute ({at} s)")
        await pg.click("#pf-x"); await lis[2].click(); await pg.wait_for_timeout(400)
        sh = await pg.inner_text("#proof-sheet")
        check("Not found" in sh or "لم يُعثر" in sh, "p8 a line not in the recording is said plainly to be added")
        await pg.click("#pf-x")
        await pg.click('.tabbar [data-nav="library"]'); await pg.wait_for_timeout(200)
        check(not await pg.evaluate("document.body.classList.contains('proof-on')"), "p9 leaving the note turns checking off")
        saved = await pg.evaluate("JN.allLessons().then(a => JSON.stringify(a.find(l => l.id === 'Lproof')))")
        check("_win" not in saved, "p10 nothing extra is saved on the note")
        # a note made from text (no recording): proof finds the place in the source
        await pg.evaluate("""async () => { const l = {id:'Ltext', subject:{id:'mine:X',name:'X',place:'mine'}, unit:'Text', kind:'book', lang:'en', engine:'server', date:'2026-11-19T10:00:00Z',
            transcript: 'Photosynthesis happens in the chloroplast. Plants use sunlight, water and carbon dioxide to make glucose and oxygen. ' + 'Filler words about nothing in particular here. '.repeat(40) + 'Mitochondria release energy from glucose in respiration.',
            notes:{title:'Biology', sections:[{heading:'Cells', blocks:[{t:'text', text:'Mitochondria release energy from glucose.'}]}], mindmap:[], report:{}}, chat:[]};
            await JN.saveLesson(l); await JN.openLesson(l); }"""); await pg.wait_for_timeout(700)
        check(await pg.evaluate("document.getElementById('heard').hidden"), "p11 no coverage line for a note made from text")
        await pg.click("#rt-proof"); await pg.click("#pages-notes .col > *:not(.b-h) >> nth=0"); await pg.wait_for_timeout(400)
        sh = await pg.inner_text("#proof-sheet")
        check(("Clear match" in sh) and "respiration" in sh and "Minute" not in sh, "p12 a text note shows the matching passage of its source")
        await c.close(); await b.close()
asyncio.run(main())
print("\n" + (f"{len(fails)} check(s) failed" if fails else "All checks passed")); sys.exit(1 if fails else 0)
