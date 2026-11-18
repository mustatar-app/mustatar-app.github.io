"""Mustatar benchmarks, on the LIVE server with real speech (GitHub Actions, .github/workflows/benchmark.yml).

Speech: Google's FLEURS test set (read speech with exact transcripts, CC-BY 4.0), Arabic (Egypt) and English (US).
About 4-5 minutes per language is joined into one recording, like a short lecture, then:
  1. Hearing: the recording goes to the server as MP3 (the app's own recording format → Groq) and as AAC
     (phone videos and M4A files → Cloudflare). Accuracy = word error rate (WER) against the real transcript,
     and speed = seconds of waiting per minute of sound.
  2. Notes: the transcript becomes notes and study notes (JSON); time, and whether the shape is right.
  3. The whole app: the real app (in a browser) gets the MP3 file, hears it, and makes the note, as a person would.
  4. Reading a page: a photo of an Arabic and an English paragraph; character error rate (CER).
  5. The assistant and voice: time to answer.
Results go to the job summary (a table) and to lines starting "BENCH". Notes are printed (lines "NOTE") for review.
"""
import asyncio, io, json, os, re, statistics, subprocess, sys, tarfile, time, unicodedata, urllib.request, csv

SERVER = os.environ.get("SERVER", "https://jund-notes-ai.dawajund.workers.dev")
ORIGIN = "http://localhost:8765"
HF = "https://huggingface.co/datasets/google/fleurs/resolve/main/data"
WORK = "bench-work"
os.makedirs(WORK, exist_ok=True)
rows = []           # (area, test, result, detail)
problems = []

def bench(area, test, result, detail=""):
    rows.append((area, test, result, detail))
    print(f"BENCH | {area} | {test} | {result} | {detail}", flush=True)

def get(url, dest):
    if not os.path.exists(dest):
        req = urllib.request.Request(url, headers={"user-agent": "Mustatar benchmark"})
        with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest

def post(path, data, ctype="application/json", headers=None, timeout=600):
    req = urllib.request.Request(SERVER + path, data=data, method="POST",
                                 headers={"origin": ORIGIN, "content-type": ctype, "user-agent": "Mozilla/5.0 (Mustatar benchmark)", **(headers or {})})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace"); status = r.status
            post.model = r.headers.get("x-model", "")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace"); status = e.code; post.model = ""
    return status, body, time.time() - t0

def sse_text(body):
    out, finish = "", ""
    for line in body.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            ev = json.loads(line[5:])
        except Exception:
            continue
        for c in ev.get("choices", []) or []:
            out += ((c.get("delta") or {}).get("content") or (c.get("message") or {}).get("content") or "")
            finish = c.get("finish_reason") or finish
        for c in ev.get("candidates", []) or []:
            out += "".join(p.get("text", "") for p in c.get("content", {}).get("parts", []))
            finish = c.get("finishReason") or finish
    return out, finish

# ---------- scoring ----------
AR_DIAC = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
def norm(text, lang):
    t = unicodedata.normalize("NFKC", text)
    if lang == "ar":
        t = AR_DIAC.sub("", t)
        t = re.sub("[إأآٱ]", "ا", t).replace("ة", "ه").replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
        t = t.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    t = t.lower()
    t = re.sub(r"[^\w\s]", " ", t)
    return t.split()

def edits(a, b):
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]

def wer(ref, hyp, lang):
    r, h = norm(ref, lang), norm(hyp, lang)
    return edits(r, h) / max(1, len(r))

def cer(ref, hyp, lang):
    r, h = "".join(norm(ref, lang)), "".join(norm(hyp, lang))
    return edits(list(r), list(h)) / max(1, len(r))

# ---------- speech samples ----------
def fleurs(lang_dir, n=26):
    tsv = get(f"{HF}/{lang_dir}/test.tsv", f"{WORK}/{lang_dir}.tsv")
    tgz = get(f"{HF}/{lang_dir}/audio/test.tar.gz", f"{WORK}/{lang_dir}.tar.gz")
    rows_ = list(csv.reader(open(tsv, encoding="utf-8"), delimiter="\t", quoting=csv.QUOTE_NONE))
    seen, picked = set(), []
    for r in rows_:
        if r[0] in seen:          # the same sentence is read by several people: keep one reading of each
            continue
        seen.add(r[0]); picked.append(r)
        if len(picked) == n:
            break
    names = {r[1] for r in picked}
    out = f"{WORK}/{lang_dir}"
    os.makedirs(out, exist_ok=True)
    with tarfile.open(tgz) as t:
        for m in t.getmembers():
            base = os.path.basename(m.name)
            if base in names and not os.path.exists(f"{out}/{base}"):
                with open(f"{out}/{base}", "wb") as f:
                    f.write(t.extractfile(m).read())
    files = [f"{out}/{r[1]}" for r in picked if os.path.exists(f"{out}/{r[1]}")]
    sentences = [r[2] for r in picked if os.path.exists(f"{out}/{r[1]}")]
    ref = " ".join(sentences)
    # one recording, with a short pause between the sentences
    lst = f"{WORK}/{lang_dir}.txt"
    sil = f"{WORK}/silence.wav"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "0.7", sil], check=True)
    with open(lst, "w") as f:
        for p in files:
            f.write(f"file '{os.path.abspath(p)}'\nfile '{os.path.abspath(sil)}'\n")
    wav = f"{WORK}/{lang_dir}-long.wav"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-ar", "16000", "-ac", "1", wav], check=True)
    mp3 = wav.replace(".wav", ".mp3"); aac = wav.replace(".wav", ".aac")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-b:a", "64k", mp3], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-c:a", "aac", "-b:a", "64k", "-f", "adts", aac], check=True)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True).stdout.strip())
    return {"mp3": mp3, "aac": aac, "wav": wav, "ref": ref, "sentences": sentences, "minutes": dur / 60, "clips": files}

def skipped(sentences, hyp, lang):
    """how many of the real sentences are mostly missing from what was heard (skipped, not just misheard)"""
    words = set(norm(hyp, lang))
    miss = 0
    for snt in sentences:
        w = norm(snt, lang)
        if w and sum(x in words for x in w) / len(w) < 0.5:
            miss += 1
    return miss

def chunks(s, kind, secs=60):
    """the same recording cut into pieces of about a minute, the way the app could send it"""
    d = f"{WORK}/{os.path.basename(s['wav'])}-{kind}-{secs}"
    os.makedirs(d, exist_ok=True)
    ext = "mp3" if kind == "mp3" else "aac"
    args = ["-b:a", "64k"] if kind == "mp3" else ["-c:a", "aac", "-b:a", "64k", "-f", "segment", "-segment_format", "adts"]
    if kind == "mp3":
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", s["wav"], "-f", "segment", "-segment_time", str(secs), *args, f"{d}/p%03d.{ext}"], check=True)
    else:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", s["wav"], "-segment_time", str(secs), *args, f"{d}/p%03d.{ext}"], check=True)
    return sorted(os.path.join(d, f) for f in os.listdir(d))

def hearing(lang, s):
    texts = {}
    for kind, mime, modes in (("mp3", "audio/mpeg", ("whole", 120, 60)), ("aac", "audio/aac", ("whole",))):
        for mode in modes:
            parts = [s[kind]] if mode == "whole" else chunks(s, kind, mode)
            text, secs, bad, used = "", 0.0, None, {}
            for part in parts:
                status, body, t = post(f"/transcribe?mime={mime}&langs=ar,en", open(part, "rb").read(), mime)
                secs += t
                if status != 200:
                    bad = f"failed {status}: {body[:100]}"; break
                used[post.model] = used.get(post.model, 0) + 1
                piece, _ = sse_text(body)
                text += ("\n" if text else "") + ("" if piece.strip() == "[[NOSPEECH]]" else piece)
            label = "whole recording" if mode == "whole" else f"{mode}-second pieces"
            who = ", ".join(f"{m.split('/')[-1]}×{n}" for m, n in used.items())
            name = f"{lang} {kind.upper()}, {label}"
            if bad:
                bench("Hearing", name, "failed", bad); problems.append(f"hearing {lang} {kind} {mode}"); continue
            w = wer(s["ref"], text, lang); miss = skipped(s["sentences"], text, lang)
            bench("Hearing", name, f"WER {w*100:.1f}%", f"{miss} of {len(s['sentences'])} sentences skipped · heard by {who} · {secs / s['minutes']:.1f} s per minute")
            texts[f"{kind} {mode}"] = text
            if lang == "en" and mode in ("whole", 60):
                for i, line in enumerate(text.splitlines()):
                    print(f"TEXT {kind} {mode} {i:03d} {line}")
            if lang == "en":
                words = set(norm(text, lang))
                for snt in s["sentences"]:
                    w = norm(snt, lang)
                    if w and sum(x in words for x in w) / len(w) < 0.5:
                        print(f"MISSED {lang} {kind} {mode}: {snt[:160]}")
    return {"mp3": texts.get("mp3 whole", "")}

def notes(lang, transcript):
    sys_notes = ("You write clear notes from a lecture or meeting transcript, in the transcript's language. "
                 "Use headings, short points, and keep every fact faithful to the transcript; add nothing that was not said.")
    status, body, secs = post("/write", json.dumps({"system": sys_notes, "user": transcript, "json": False, "maxTokens": 6000}).encode(),
                              headers={"x-mst-stream": "openai"})
    text, fin = sse_text(body)
    ok = status == 200 and len(text) > 200 and fin in ("stop", "STOP")
    bench("Notes", f"{lang} notes from {len(transcript.split())} words", f"{secs:.1f} s" if ok else f"failed {status}", f"{len(text)} characters, finished: {fin}")
    if not ok: problems.append(f"notes {lang}")
    for i, line in enumerate(text.splitlines()[:80]):
        print(f"NOTE {lang} {i:02d} {line}")
    status, body, secs = post("/write", json.dumps({"system": "Make structured study notes from this lesson, in its language.", "user": transcript,
                                                    "json": True, "studyNotes": True, "maxTokens": 8000}).encode(), headers={"x-mst-stream": "openai"})
    text, fin = sse_text(body)
    try:
        j = json.loads(re.sub(r"^```(json)?|```$", "", text.strip()).strip()); shape = f"title + {len(j.get('sections', []))} sections"
        good = bool(j.get("title")) and len(j.get("sections", [])) > 0
    except Exception as e:
        good, shape = False, "not valid JSON: " + str(e)[:60]
    bench("Notes", f"{lang} study notes (JSON shape)", f"{secs:.1f} s" if good else "wrong shape", shape)
    if not good: problems.append(f"study notes {lang}")

def page_reading():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return
    font = get("https://github.com/google/fonts/raw/main/ofl/amiri/Amiri-Regular.ttf", f"{WORK}/Amiri.ttf")
    samples = {
        "ar": "العلم نور، وطلبه عبادة. ومن آداب طالب العلم أن يخلص النية لله، وأن يصبر على التعلم، وأن يحترم معلمه، وأن يعمل بما تعلم.",
        "en": "Meeting minutes: the budget was approved. The launch moves to next Friday. Sara will send the invitations before Thursday.",
    }
    for lang, text in samples.items():
        img = Image.new("RGB", (1240, 600), "white"); d = ImageDraw.Draw(img)
        f = ImageFont.truetype(font, 44)
        words, lines, cur = text.split(), [], ""
        for w_ in words:
            test = (cur + " " + w_).strip()
            if d.textlength(test, font=f) > 1100: lines.append(cur); cur = w_
            else: cur = test
        lines.append(cur)
        for i, ln in enumerate(lines):
            if lang == "ar":
                d.text((1180, 60 + i * 80), ln, font=f, fill="black", anchor="ra", direction="rtl", language="ar")
            else:
                d.text((60, 60 + i * 80), ln, font=f, fill="black")
        buf = io.BytesIO(); img.save(buf, "JPEG", quality=88)
        status, body, secs = post("/transcribe?mime=image/jpeg", buf.getvalue(), "image/jpeg")
        got, _ = sse_text(body)
        c = cer(text, got, lang) if status == 200 else 1
        bench("Reading a page", f"{lang} photo of a paragraph", f"CER {c*100:.1f}%" if status == 200 else f"failed {status}", f"{secs:.1f} s")
        print(f"READ {lang}: {got[:300]}")
        if status != 200 or c > 0.15: problems.append(f"page reading {lang}")

def assistant_and_voice(clip_en):
    status, body, secs = post("/write", json.dumps({"system": "You are a helpful assistant. Answer in one sentence.", "user": "What is a good way to start a meeting?",
                                                    "json": False, "assistant": True, "maxTokens": 300}).encode(), headers={"x-mst-stream": "openai"})
    text, _ = sse_text(body)
    bench("Assistant", "a short question", f"{secs:.1f} s" if status == 200 and text else f"failed {status}", text[:80])
    import base64
    webm = f"{WORK}/voice.webm"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", clip_en, "-c:a", "libopus", "-b:a", "32k", webm], check=True)
    status, body, secs = post("/ask-voice", json.dumps({"audio": base64.b64encode(open(webm, "rb").read()).decode(), "mime": "audio/webm",
                                                         "system": "Answer briefly. First line: Q (lang): what you heard.", "user": "", "langs": "ar,en"}).encode(),
                              headers={"x-mst-stream": "openai"})
    text, _ = sse_text(body)
    bench("Voice", "a spoken question → heard + answer", f"{secs:.1f} s" if status == 200 and text.startswith("Q") else f"failed {status}", text[:90].replace("\n", " / "))

async def whole_app(s_ar, s_en):
    """the real app in a browser, with the live server: a recording file → transcript → saved note"""
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for lang, s in (("ar", s_ar), ("en", s_en)):
            ctx = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
            await ctx.add_init_script("localStorage.setItem('jn_welcomed','1');localStorage.setItem('welcomed','1');")
            page = await ctx.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await page.goto(ORIGIN + "/", wait_until="load")
            await page.wait_for_timeout(1500)
            for _ in range(6):
                c = await page.evaluate("""()=>{const o=[...document.querySelectorAll('body > *')].find(e=>{const s=getComputedStyle(e);return s.position==='fixed'&&s.display!=='none'&&e.offsetHeight>300&&/wl|welcome/i.test(e.className+e.id)}); if(!o) return false; const bs=[...o.querySelectorAll('button')]; (bs.find(b=>/تخط|Skip/i.test(b.innerText))||bs[0])?.click(); return true}""")
                if not c: break
                await page.wait_for_timeout(300)
            await page.evaluate("window.JN.show('new')")
            await page.wait_for_timeout(800)
            t0 = time.time()
            await page.set_input_files("#file", s["mp3"])
            await page.wait_for_timeout(800)
            await page.evaluate("(()=>{const d=document.querySelector('#custom-subject'); if(d){d.closest('label').hidden=false}})()")
            try:
                await page.fill("#custom-subject", "Benchmark")
            except Exception:
                pass
            await page.fill("#unit", f"FLEURS {lang}")
            await page.click("#make")
            saved = None
            for _ in range(300):
                await page.wait_for_timeout(1000)
                saved = await page.evaluate("""new Promise(r=>{const q=indexedDB.open('jund-notes');q.onsuccess=()=>{try{const t=q.result.transaction('lessons').objectStore('lessons').getAll();t.onsuccess=()=>r(t.result.filter(l=>!l.draft).map(l=>({t:l.notes?.title||l.unit, n:JSON.stringify(l.notes||{}).length})))}catch(e){r([])}};q.onerror=()=>r([])})""")
                if saved:
                    break
            secs = time.time() - t0
            ok = bool(saved)
            bench("Whole app", f"{lang}: a {s['minutes']:.1f}-minute recording → saved note", f"{secs:.0f} s" if ok else "no note after 5 min",
                  (f"note “{saved[0]['t']}”, {saved[0]['n']} characters" if ok else (await page.evaluate("document.body.innerText"))[:160].replace("\n", " ")) + (f"; page errors: {errs[:2]}" if errs else ""))
            if not ok: problems.append(f"whole app {lang}")
            await ctx.close()
        await b.close()

def main():
    print("Downloading FLEURS samples…", flush=True)
    s_ar = fleurs("ar_eg"); s_en = fleurs("en_us")
    print(f"Arabic {s_ar['minutes']:.1f} min, English {s_en['minutes']:.1f} min", flush=True)
    for lang, s in (("ar", s_ar), ("en", s_en)):
        t = hearing(lang, s)
        notes(lang, t.get("mp3") or s["ref"])
    page_reading()
    assistant_and_voice(s_en["clips"][0])
    asyncio.run(whole_app(s_ar, s_en))
    with open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a") as f:
        f.write("## Mustatar benchmark\n\n| Area | Test | Result | Detail |\n|---|---|---|---|\n")
        for r in rows:
            f.write("| " + " | ".join(str(x).replace("|", "/") for x in r) + " |\n")
        f.write("\n" + ("Problems: " + ", ".join(problems) if problems else "No problems.") + "\n")
    print("\n" + ("PROBLEMS: " + ", ".join(problems) if problems else "All benchmarks ran without problems"))
    sys.exit(1 if problems else 0)

if __name__ == "__main__":
    main()
