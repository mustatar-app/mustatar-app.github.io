"""Check of accounts and each person's own private space, against the server running on this computer.

It uses a pretend passkey (Chrome's built-in test authenticator), so no phone is needed. It checks that:
a person makes an account with a passkey, saves notes, signs in again and gets them back; a second
person cannot see the first person's notes; bad or old changes are refused; "delete my data" removes
everything; and requests without sign-in are refused.

Run:  (cd server && npx wrangler dev --port 8787) &   python3 -m http.server 8765 &
      python3 tests/space_test.py http://localhost:8765/ http://127.0.0.1:8787
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

PAGE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/").rstrip("/") + "/tests/blank.html"
API = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8787"

HELPERS = """
window.T = {
  api: %s,
  async call(path, opts = {}, token) {
    const r = await fetch(this.api + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) } });
    let body = null; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  },
  async register(name, token) {
    const s = await this.call('/auth/passkey/register/start', { method: 'POST', body: JSON.stringify({ name }) }, token);
    const cred = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(s.body.options) });
    return this.call('/auth/passkey/register/finish', { method: 'POST', body: JSON.stringify({ flow: s.body.flow, response: cred.toJSON() }) });
  },
  async login() {
    const s = await this.call('/auth/passkey/login/start', { method: 'POST', body: '{}' });
    const cred = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(s.body.options) });
    return this.call('/auth/passkey/login/finish', { method: 'POST', body: JSON.stringify({ flow: s.body.flow, response: cred.toJSON() }) });
  },
};
""" % json.dumps(API)


async def main():
    failures = []
    def check(ok, what):
        print(("PASS " if ok else "FAIL ") + what)
        if not ok:
            failures.append(what)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context()).new_page()
        await page.route("**/*workers.dev/**", lambda r: r.abort())
        await page.goto(PAGE)
        cdp = await page.context.new_cdp_session(page)
        await cdp.send("WebAuthn.enable")
        auth = await cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {
            "protocol": "ctap2", "transport": "internal", "hasResidentKey": True,
            "hasUserVerification": True, "isUserVerified": True}})
        await page.evaluate(HELPERS)
        ev = lambda js: page.evaluate(f"(async () => {{ {js} }})()")

        r = await ev("return T.call('/space/pull')")
        check(r["status"] == 401, "the space refuses anyone not signed in")

        r = await ev("return T.call('/auth/config')")
        check(r["status"] == 200 and r["body"]["passkeys"] is True, "the server says which sign-in ways are on")
        r = await ev("return T.call('/auth/google', { method: 'POST', body: JSON.stringify({ credential: 'not.a.token' }) })")
        check(r["status"] in (400, 501), "a fake Google sign-in is refused")

        r = await ev("return T.register('Junaid')")
        check(r["status"] == 200 and r["body"].get("token"), "a passkey makes a new account")
        tok = r["body"]["token"]

        changes = [
            {"id": "note-1", "kind": "note", "data": {"title": "اجتماع الفريق", "text": "Launch on Friday"}, "updated": 1000},
            {"id": "task-1", "kind": "task", "data": {"title": "Send the minutes"}, "updated": 1000},
            {"id": "habit-1", "kind": "habit", "data": {"name": "Water 2.5 L"}, "updated": 1000},
        ]
        r = await ev(f"return T.call('/space/push', {{ method: 'POST', body: JSON.stringify({{ changes: {json.dumps(changes)} }}) }}, {json.dumps(tok)})")
        check(r["status"] == 200 and r["body"]["saved"] == 3, "notes, tasks and habits are saved in the person's space")

        older = [{"id": "note-1", "kind": "note", "data": {"title": "OLD"}, "updated": 500}]
        r = await ev(f"return T.call('/space/push', {{ method: 'POST', body: JSON.stringify({{ changes: {json.dumps(older)} }}) }}, {json.dumps(tok)})")
        check(r["status"] == 200 and r["body"]["skipped"] == 1, "an older change never overwrites a newer one")

        newer = [{"id": "task-1", "kind": "task", "deleted": True, "updated": 2000}]
        await ev(f"return T.call('/space/push', {{ method: 'POST', body: JSON.stringify({{ changes: {json.dumps(newer)} }}) }}, {json.dumps(tok)})")

        r = await ev("return T.login()")
        check(r["status"] == 200 and r["body"]["user"]["name"] == "Junaid", "signing in again with the passkey works")
        tok2 = r["body"]["token"]
        r = await ev(f"return T.call('/space/pull?since=0', {{}}, {json.dumps(tok2)})")
        items = {i["id"]: i for i in r["body"]["items"]}
        check(json.loads(items["note-1"]["data"])["title"] == "اجتماع الفريق", "the notes come back after signing in again, Arabic intact")
        check(items["task-1"]["deleted"] is True, "a deleted task comes back as deleted, so other devices remove it too")
        seq = r["body"]["seq"]
        r = await ev(f"return T.call('/space/pull?since={seq}', {{}}, {json.dumps(tok2)})")
        check(r["body"]["items"] == [], "asking again returns only what changed since")

        r = await ev("return T.register('Second person')")
        other = r["body"]["token"]
        r = await ev(f"return T.call('/space/pull?since=0', {{}}, {json.dumps(other)})")
        check(r["status"] == 200 and r["body"]["items"] == [], "a second person cannot see the first person's notes")

        bad = [{"id": "x y", "kind": "note", "data": "a", "updated": 1}]
        r = await ev(f"return T.call('/space/push', {{ method: 'POST', body: JSON.stringify({{ changes: {json.dumps(bad)} }}) }}, {json.dumps(tok)})")
        check(r["status"] == 400, "a change in the wrong shape is refused")

        forged = tok[:-3] + ("AAA" if not tok.endswith("AAA") else "BBB")
        r = await ev(f"return T.call('/space/pull', {{}}, {json.dumps(forged)})")
        check(r["status"] == 401, "a forged sign-in is refused")

        r = await ev(f"return T.call('/space/usage', {{}}, {json.dumps(tok)})")
        check(r["status"] == 200 and r["body"]["items"] == 2, "the space reports how much it holds")

        r = await ev(f"return T.call('/space/delete-all', {{ method: 'POST', body: JSON.stringify({{ confirm: 'DELETE' }}) }}, {json.dumps(tok)})")
        check(r["status"] == 200, "'delete my data' works")
        r = await ev(f"return T.call('/space/pull?since=0', {{}}, {json.dumps(tok)})")
        check(r["status"] == 401, "after deleting, the space is closed to old sign-ins")
        r = await ev(f"return T.call('/auth/me', {{}}, {json.dumps(tok)})")
        check(r["status"] == 401, "after deleting, the account is gone")
        await browser.close()

    print(f"\n{len(failures)} problem(s)" if failures else "\nAll checks passed")
    sys.exit(1 if failures else 0)


asyncio.run(main())
