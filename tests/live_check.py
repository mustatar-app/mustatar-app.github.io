"""Live check of the real server and the real app: sign-in setup, how fast the assistant answers, and how fast the app opens.
Runs on GitHub (the live addresses cannot be reached from everywhere). Prints a short report; fails only if something is broken.
  python3 tests/live_check.py
"""
import json, os, re, sys, time, urllib.request, asyncio

SERVER = os.environ.get("SERVER", "https://jund-notes-ai.dawajund.workers.dev")
APP = os.environ.get("APP", "https://mustatar.dawajund.workers.dev")
HERE = os.path.dirname(os.path.abspath(__file__))
problems = []

def req(path, body=None, headers=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(SERVER + path, data=data, method="POST" if body is not None else "GET",
                               headers={"content-type": "application/json", "x-mst-stream": "openai", "origin": APP,
                                        "user-agent": "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 MustatarLiveCheck", **(headers or {})})
    return urllib.request.urlopen(r, timeout=timeout)

def say(ok, text):
    print(("PASS " if ok else "FAIL ") + text, flush=True)
    if not ok: problems.append(text)

# 1. sign-in setup
try:
    cfg = json.loads(req("/auth/config").read())
    say(bool(cfg.get("googleClientId")), f"Google sign-in is set up on the server (client id {'present' if cfg.get('googleClientId') else 'MISSING'})")
    print("  config keys:", sorted(cfg.keys()))
except Exception as e:
    say(False, f"/auth/config answers ({e})")
try:
    t = time.time(); j = json.loads(req("/auth/passkey/login/start", {}).read())
    say(bool(j.get("options", {}).get("challenge")), f"passkey sign-in starts ({(time.time()-t)*1000:.0f} ms), rpId={j.get('options', {}).get('rpId')}")
except Exception as e:
    say(False, f"passkey sign-in starts ({e})")
try:
    r = req("/auth/google", {"credential": "not-a-real-token"})
    say(False, "a fake Google sign-in is refused (it was accepted!)")
except urllib.error.HTTPError as e:
    body = e.read()[:200]
    say(e.code in (400, 401) and b"1010" not in body, f"a fake Google sign-in is refused (HTTP {e.code} {body!r})")
except Exception as e:
    say(False, f"Google sign-in endpoint answers ({e})")

# 2. the assistant: time to the first words and to the end
src = open(os.path.join(HERE, "..", "assistant.js"), encoding="utf-8").read()
SYSTEM = re.sub(r"\$\{[^}]*\}", "", src.split("const SYSTEM = () => `", 1)[1].split("`;", 1)[0])
today = time.strftime("%Y-%m-%d")
small_ctx = f"Today: {today}, time 08:30.\n\nCALENDAR (next 30 days):\n- id e1 | {today} 10:00 | class | Fiqh lesson\n- id e2 | {today} | task | Revise chapter 3\n"
big_ctx = small_ctx + "\nALL LESSONS (newest first):\n" + "\n".join(f"- id L{i} | 2026-11-{i%28+1:02d} | Subject {i%7} | Lesson title number {i} about a topic" for i in range(80)) \
    + "\n\nMOST RELEVANT LESSON NOTES:\n" + ("## Section\n- A point from the lesson notes with some detail and an example sentence. " * 260)

def ask(label, ctx, message, rounds=1):
    out = []
    for _ in range(rounds):
        user = f"{ctx}\n\nRECENT CHAT:\n(start)\n\nThe student now says: {message}"
        t0 = time.time(); first = None; text = ""; model = "?"
        try:
            r = req("/write", {"system": SYSTEM, "user": user, "assistant": True, "json": True, "maxTokens": 8000}, timeout=120)
            model = r.headers.get("x-model", "?")
            for line in r:
                if first is None and line.strip(): first = time.time() - t0
                text += line.decode("utf-8", "ignore")
            out.append((first or 0, time.time() - t0, model))
            words = "".join(re.findall(r'"content":"((?:[^"\\]|\\.)*)"', text))[:160]
            print(f"    reply: {words!r}")
        except urllib.error.HTTPError as e:
            out.append((0, time.time() - t0, f"HTTP {e.code} {e.read()[:200]!r}"))
        except Exception as e:
            out.append((0, time.time() - t0, f"error {e}"))
        time.sleep(2)
    for f, tot, m in out:
        print(f"  {label}: first words {f:.1f} s, finished {tot:.1f} s, model {m}")
    return out

print(f"\nAssistant system prompt: {len(SYSTEM)} characters; small context {len(small_ctx)}, big context {len(big_ctx)}")
a = ask("'hey there' with a small context", small_ctx, "hey there", rounds=3)
b = ask("'hey there' with the old big context", big_ctx, "hey there", rounds=1)
c = ask("'what do I have today?' small context", small_ctx, "what do I have today?", rounds=1)
best = min(x[1] for x in a)
say(best < 8, f"a short message is answered fast (best {best:.1f} s)")

# 3. the app: how fast it opens and switches screens (a phone-sized browser)
async def app_speed():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
        await c.add_init_script("localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');")
        pg = await c.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        t = time.time(); await pg.goto(APP, wait_until="domcontentloaded"); dcl = time.time() - t
        await pg.wait_for_selector(".tabbar", state="visible", timeout=30000); ready = time.time() - t
        await pg.wait_for_load_state("load"); load = time.time() - t
        print(f"\nApp opens: page {dcl:.1f} s, usable {ready:.1f} s, everything loaded {load:.1f} s")
        perf = await pg.evaluate("performance.getEntriesByType('resource').map(r=>[r.name.split('/').pop(), Math.round(r.transferSize/1024), Math.round(r.duration)]).sort((a,b)=>b[2]-a[2]).slice(0,10)")
        for n, kb, ms in perf: print(f"  {n[:40]:40} {kb:5} KB {ms:6} ms")
        for name in ["library", "calendar", "me", "assistant"]:
            t = time.time(); await pg.click(f'.tabbar [data-nav="{name}"]'); await pg.wait_for_selector(f"#screen-{name}:not([hidden])"); print(f"  switch to {name}: {(time.time()-t)*1000:.0f} ms")
        say(not errs, "the live app opens without errors " + "; ".join(errs[:3]))
        say(ready < 6, f"the live app is usable quickly ({ready:.1f} s)")
        # the opening screen a new phone sees: Google button, passkey button, continue without an account
        c2 = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
        pg2 = await c2.new_page(); logs = []
        pg2.on("console", lambda m: logs.append(m.text))
        await pg2.goto(APP); await pg2.wait_for_selector("#op-skip", timeout=20000); await pg2.wait_for_timeout(6000)
        g = await pg2.evaluate("(()=>{const b=document.querySelector('#op-google'); return {shown: !!b && !b.hidden, frame: !!b?.querySelector('iframe'), pk: !!document.querySelector('#op-pk')}})()")
        bad = [l for l in logs if 'origin' in l.lower() and 'not allowed' in l.lower() or 'GSI_LOGGER' in l]
        print("  opening screen:", g, "google messages:", bad[:3])
        say(g["shown"] and g["frame"], "the opening screen shows the Google button")
        say(not bad, "Google accepts this app's address " + "; ".join(bad[:2]))
        say(g["pk"], "the opening screen shows the passkey button")
        await pg2.click("#op-skip"); await pg2.wait_for_timeout(500)
        say(await pg2.evaluate("!!document.querySelector('.wl .wl-dots')"), "'Continue without an account' goes on to the first questions")
        await b.close()
try:
    asyncio.run(app_speed())
except Exception as e:
    say(False, f"app speed check ran ({e})")

print("\n" + ("All checks passed" if not problems else f"{len(problems)} problem(s)"))
sys.exit(1 if problems else 0)
