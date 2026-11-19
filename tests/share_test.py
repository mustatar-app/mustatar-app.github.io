"""Photos in notes, and "Share with a friend" — against the server running on this computer.
Run:  (cd server && npx wrangler dev --port 8787 --ip 127.0.0.1) &   python3 -m http.server 8765 &
      python3 tests/share_test.py http://localhost:8765/ http://127.0.0.1:8787"""
import asyncio, base64, io, json, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/").rstrip("/") + "/"
API = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8787"
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))

# a big photo (4000×3000) with writing on it
img = Image.new("RGB", (4000, 3000), (240, 220, 180)); dr = ImageDraw.Draw(img)
for i in range(0, 4000, 37): dr.line([(i, 0), (4000 - i, 3000)], fill=(i % 255, 90, 160), width=9)
buf = io.BytesIO(); img.save(buf, "JPEG", quality=95); open("/tmp/big-photo.jpg", "wb").write(buf.getvalue())
_b = io.BytesIO(); Image.new("RGB", (40, 30), (10, 120, 200)).save(_b, "JPEG"); small = "data:image/jpeg;base64," + base64.b64encode(_b.getvalue()).decode()

HELPERS = """
window.T = {
  api: %s,
  async call(path, opts = {}, token) {
    const r = await fetch(this.api + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) } });
    let body = null; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  },
  async register(name) {
    const s = await this.call('/auth/passkey/register/start', { method: 'POST', body: JSON.stringify({ name }) });
    const cred = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(s.body.options) });
    return this.call('/auth/passkey/register/finish', { method: 'POST', body: JSON.stringify({ flow: s.body.flow, response: cred.toJSON() }) });
  },
};
""" % json.dumps(API)

async def app_ctx(b, token="", lang="en"):
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
    await c.add_init_script(f"localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');"
                            + (f"localStorage.setItem('jn_mstToken', JSON.stringify({json.dumps(token)}));localStorage.setItem('jn_mstUser', JSON.stringify({{name:'Junaid'}}));" if token else ""))
    await c.route("**/server.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"url": API})))
    await c.route("**/api.aladhan.com/**", lambda r: r.abort())
    async def pages(route):   # the AI that reads a photo is not on this computer: a pretend one
        ev = {"choices": [{"index": 0, "delta": {"content": json.dumps({"pages": [{"page": 1, "text": "Meeting at 9\nBring the report"}]})}, "finish_reason": "stop"}]}
        await route.fulfill(status=200, headers={"access-control-allow-origin": "*", "content-type": "text/event-stream"}, body="data: " + json.dumps(ev) + "\n\ndata: [DONE]\n\n")
    await c.route("**/read-pages", pages)
    return c

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- the server ----------
        c = await b.new_context(); pg = await c.new_page()
        await pg.goto(BASE + "tests/blank.html")
        cdp = await c.new_cdp_session(pg); await cdp.send("WebAuthn.enable")
        await cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {"protocol": "ctap2", "transport": "internal", "hasResidentKey": True, "hasUserVerification": True, "isUserVerified": True}})
        await pg.evaluate(HELPERS)
        ev = lambda js: pg.evaluate(f"(async () => {{ {js} }})()")
        ta = (await ev("return T.register('Junaid')"))["body"]["token"]
        tb = (await ev("return T.register('Other')"))["body"]["token"]
        note = {"title": "Trip plan", "text": "Leave at 7", "items": [{"t": "Tickets", "done": True}], "color": "mint", "labels": ["Travel"], "images": [{"data": small, "w": 40, "h": 30}, {"data": "javascript:alert(1)"}], "secret": "x", "by": "Junaid"}
        r = await ev(f"return T.call('/share', {{ method: 'POST', body: JSON.stringify({{ note: {json.dumps(note)} }}) }})")
        check(r["status"] == 401, "s1 sharing needs sign-in")
        r = await ev(f"return T.call('/share', {{ method: 'POST', body: JSON.stringify({{ note: {json.dumps(note)} }}) }}, {json.dumps(ta)})")
        sid = (r["body"] or {}).get("id", "")
        check(r["status"] == 200 and len(sid) >= 20, f"s2 a signed-in person gets a long private link id ({len(sid)} characters)")
        r = await ev(f"return T.call('/share/{sid}')")
        n = (r["body"] or {}).get("note", {})
        check(r["status"] == 200 and n.get("title") == "Trip plan" and n.get("items") == [{"t": "Tickets", "done": True}] and n.get("color") == "mint", "s3 anyone with the link can read the note, without signing in")
        check(len(n.get("images", [])) == 1 and "secret" not in n, "s4 only real photos and the note's own parts are kept (no scripts, no extra fields)")
        r = await ev(f"return T.call('/share/{sid}', {{ method: 'PUT', body: JSON.stringify({{ note: {{ title: 'Hacked', text: 'x' }} }}) }}, {json.dumps(tb)})")
        check(r["status"] == 403, "s5 another person cannot change it")
        r = await ev(f"return T.call('/share/{sid}', {{ method: 'PUT', body: JSON.stringify({{ note: {{ title: 'Trip plan', text: 'Leave at 6 now' }} }}) }}, {json.dumps(ta)})")
        r2 = await ev(f"return T.call('/share/{sid}')")
        check(r["status"] == 200 and r2["body"]["note"]["text"] == "Leave at 6 now", "s6 the owner's change reaches the link")
        r = await ev(f"return T.call('/share', {{ method: 'POST', body: JSON.stringify({{ note: {{ title: '', text: '' }} }}) }}, {json.dumps(ta)})")
        check(r["status"] == 400, "s7 an empty note is refused")
        r = await ev(f"return T.call('/share', {{ method: 'POST', body: JSON.stringify({{ note: {{ title: 'big', text: 'x'.repeat(1900000) }} }}) }}, {json.dumps(ta)})")
        check(r["status"] == 413, "s8 a note that is too big is refused")
        r = await ev(f"return T.call('/share/{sid}', {{ method: 'DELETE' }}, {json.dumps(tb)})")
        check(r["status"] == 403, "s9 another person cannot stop the sharing")
        r = await ev("return T.call('/share/short')")
        check(r["status"] == 404, "s10 a made-up link opens nothing")
        r = await ev(f"return T.call('/share/{sid}', {{ method: 'DELETE' }}, {json.dumps(ta)})")
        r2 = await ev(f"return T.call('/share/{sid}')")
        check(r["status"] == 200 and r2["status"] == 404, "s11 the owner can stop sharing; the link then opens nothing")
        await c.close()

        # ---------- photos in a note ----------
        c = await app_ctx(b, ta); pg = await c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(1200)
        await pg.evaluate("localStorage.setItem('jn_mstPending', '{}')")
        await pg.evaluate("JundKeep.newNote()"); await pg.wait_for_timeout(300)
        await pg.fill("#kp-title", "Board photo"); await pg.fill("#kp-text", "From today's class")
        await pg.set_input_files("#kp-ed-file", "/tmp/big-photo.jpg"); await pg.wait_for_timeout(1500)
        info = await pg.evaluate("(async () => { const n = (await JundKeep.all()).find(x => x.title === 'Board photo'); const r = await JundKeep.img(n.images[0].id); return { n: n.images.length, w: r.w, h: r.h, size: r.data.length } })()")
        check(info["n"] == 1 and max(info["w"], info["h"]) <= 1600 and info["size"] < 900_000, f"p1 a 4000×3000 photo is added and kept small ({info['w']}×{info['h']}, {info['size'] // 1000} KB)")
        check(await pg.evaluate("!!document.querySelector('#kp-eimgs img[src^=\"data:image/jpeg\"]')"), "p2 the photo shows at the top of the note")
        pend = await pg.evaluate("JSON.parse(localStorage.getItem('jn_mstPending')||'{}')")
        check(any(k.startswith("kimg:") for k in pend), "p3 the photo goes to your private space as its own item")
        await pg.click("#kp-eimgs .kp-eimg"); await pg.wait_for_timeout(300)
        await pg.click("#kp-v-text"); await pg.wait_for_timeout(1200)
        check("Bring the report" in await pg.input_value("#kp-text"), "p4 Grab the text puts the photo's words into the note")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(500)
        check(await pg.evaluate("!!document.querySelector('.kp-card.has-img .kp-cimg img[src^=\"data:image\"]')"), "p5 the card shows the photo, like Keep")
        data = await pg.evaluate("JundImport.backupData()")
        check(len(data.get("keepImages", [])) == 1, "p6 the backup keeps the photos")
        # ---------- share with a friend (the app) ----------
        await pg.click(".kp-card.has-img"); await pg.wait_for_timeout(300)
        await pg.click("#kp-ed-more"); await pg.click('#kp-pop [data-m="friend"]')
        await pg.wait_for_selector(".kp-link", timeout=15000)
        link = (await pg.inner_text(".kp-link")).strip()
        sid = link.split("id=")[-1]
        check("note.html?id=" in link and len(sid) >= 20, "f1 Share with a friend gives a private link")
        r = await pg.evaluate(f"fetch({json.dumps(API)} + '/share/{sid}').then(r => r.json())")
        check(r["note"]["title"] == "Board photo" and len(r["note"]["images"]) == 1 and r["note"]["by"] == "Junaid", "f2 the link has the note, its photo and your name")
        await pg.click("#kp-sh-x"); await pg.fill("#kp-text", "Changed after sharing"); await pg.wait_for_timeout(2600)
        r = await pg.evaluate(f"fetch({json.dumps(API)} + '/share/{sid}').then(r => r.json())")
        check(r["note"]["text"] == "Changed after sharing", "f3 your edits reach your friend by themselves")
        await pg.click("#kp-ed-back"); await pg.wait_for_timeout(300)
        check(await pg.evaluate("!!document.querySelector('.kp-card .kp-shared')"), "f4 a shared note is marked on the board")
        # ---------- the friend ----------
        f = await app_ctx(b, "", "ar"); fp = await f.new_page()
        await fp.goto(BASE + "note.html?id=" + sid); await fp.wait_for_selector(".card", timeout=10000)
        txt = await fp.inner_text("main")
        check("Board photo" in txt and "Changed after sharing" in txt and await fp.evaluate("!!document.querySelector('.imgs img')"), "f5 the friend opens the link and sees the note with its photo, without signing in")
        await fp.click("#save"); await fp.wait_for_timeout(500)
        await fp.goto(BASE); await fp.wait_for_timeout(1200)
        got = await fp.evaluate("JundKeep.all().then(a => a.map(n => ({t: n.title, imgs: (n.images||[]).length, from: n.from})))")
        check(any(x["t"] == "Board photo" and x["imgs"] == 1 for x in got), f"f6 Save to my notes puts it, with the photo, in the friend's My notes ({got})")
        # stop sharing
        await pg.click(".kp-card.has-img"); await pg.wait_for_timeout(300)
        await pg.click("#kp-ed-more"); await pg.click('#kp-pop [data-m="friend"]'); await pg.wait_for_selector("#kp-sh-stop", timeout=15000)
        await pg.click("#kp-sh-stop"); await pg.wait_for_timeout(800)
        await fp.goto(BASE + "note.html?id=" + sid); await fp.wait_for_timeout(1500)
        check("لم تعد هذه الملاحظة مشاركة" in await fp.inner_text("main"), "f7 after Stop sharing the link says the note is no longer shared (in Arabic for an Arabic phone)")
        # delete a photo
        await pg.click("#kp-eimgs .kp-eimg"); await pg.click("#kp-v-del"); await pg.wait_for_timeout(400)
        check(await pg.evaluate("JundKeep.all().then(a => (a.find(n => n.title === 'Board photo').images || []).length)") == 0, "p7 a photo can be deleted")
        await pg.click("#kp-ed-back")
        check(not errs, f"p8 no page errors {errs[:2]}")
        await f.close(); await c.close()
        # not signed in: asked to sign in first
        c = await app_ctx(b, ""); pg = await c.new_page()
        await pg.goto(BASE); await pg.wait_for_timeout(1000)
        await pg.evaluate("JundKeep.newNote()"); await pg.wait_for_timeout(200); await pg.fill("#kp-text", "hi")
        await pg.click("#kp-ed-more"); await pg.click('#kp-pop [data-m="friend"]'); await pg.wait_for_timeout(300)
        check(await pg.is_visible("#kp-sh-in"), "f8 without sign-in, sharing asks you to sign in (one tap with Google)")
        await c.close(); await b.close()
asyncio.run(main())
print("\n" + (f"{len(fails)} check(s) failed" if fails else "All checks passed")); sys.exit(1 if fails else 0)
