"""Hearing study on one-speaker speech (like a real lesson or meeting), Groq directly (needs GROQ_API_KEY):
whole recording vs ~2-minute pieces cut at quiet moments (like the app), Whisper large-v3 vs turbo.
  English: LibriSpeech test-clean, one reader, one chapter read straight through (exact text).
  Arabic:  Surah Ya-Sin recited by al-Husary, ayah by ayah (exact text), and FLEURS Arabic (many speakers).
Lines starting STUDY are the results."""
import json, os, re, subprocess, sys, tarfile, time, urllib.request, uuid, importlib.util
sys.argv = [sys.argv[0]]
spec = importlib.util.spec_from_file_location("b", os.path.join(os.path.dirname(__file__), "benchmark.py")); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
KEY = os.environ["GROQ_API_KEY"].strip()
W = b.WORK
UA = {"user-agent": "Mozilla/5.0 (Mustatar hearing study)"}

def groq(path, model, name="a.mp3", mime="audio/mpeg"):
    bnd = uuid.uuid4().hex
    parts = [("model", model), ("response_format", "verbose_json"), ("temperature", "0")]
    body = b"".join(f"--{bnd}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode() for k, v in parts)
    body += f"--{bnd}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: {mime}\r\n\r\n".encode() + open(path, "rb").read() + f"\r\n--{bnd}--\r\n".encode()
    for attempt in range(6):
        req = urllib.request.Request("https://api.groq.com/openai/v1/audio/transcriptions", data=body, method="POST",
                                     headers={"authorization": "Bearer " + KEY, "content-type": f"multipart/form-data; boundary={bnd}", **UA})
        try:
            return json.loads(urllib.request.urlopen(req, timeout=300).read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get("retry-after") or 20); print(f"   (busy, waiting {wait}s)", flush=True); time.sleep(wait + 1); continue
            raise
    raise RuntimeError("Groq stayed busy")

def mp3_of(wav):
    out = wav.rsplit(".", 1)[0] + ".mp3"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-b:a", "64k", out], check=True)
    return out

def quiet_pieces(wav, target=120, window=6):
    """cut like the app: every ~2 minutes, at the middle of the nearest silence within 6 seconds"""
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True).stdout)
    if dur <= 150:
        return [mp3_of(wav)]
    log = subprocess.run(["ffmpeg", "-i", wav, "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]; ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    mids = [(a + e) / 2 for a, e in zip(starts, ends)]
    n = max(1, round(dur / target)); cuts = [0.0]
    for k in range(1, n):
        plan = dur * k / n
        near = [m for m in mids if abs(m - plan) <= window]
        cuts.append(min(near, key=lambda m: abs(m - plan)) if near else plan)
    cuts.append(dur)
    out = []
    for i in range(len(cuts) - 1):
        p = f"{wav[:-4]}-q{i:02d}.mp3"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(cuts[i]), "-to", str(cuts[i + 1]), "-i", wav, "-ac", "1", "-b:a", "64k", p], check=True)
        out.append(p)
    return out

def librispeech():
    tgz = b.get("https://www.openslr.org/resources/12/test-clean.tar.gz", f"{W}/ls-test-clean.tar.gz")
    d = f"{W}/LibriSpeech"
    if not os.path.isdir(d):
        with tarfile.open(tgz) as t: t.extractall(W)
    best = None
    for root, _, files in os.walk(f"{d}/test-clean"):
        flac = [f for f in files if f.endswith(".flac")]
        tot = sum(os.path.getsize(os.path.join(root, f)) for f in flac)
        if flac and (best is None or tot > best[1]): best = (root, tot)
    root = best[0]
    trans = [f for f in os.listdir(root) if f.endswith(".trans.txt")][0]
    lines = [l.split(" ", 1) for l in open(os.path.join(root, trans)).read().splitlines()]
    lst = f"{W}/ls.txt"; text = []
    with open(lst, "w") as f:
        for uid, t in lines:
            f.write(f"file '{os.path.abspath(os.path.join(root, uid + '.flac'))}'\n"); text.append(t.lower())
    wav = f"{W}/ls-long.wav"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-ar", "16000", "-ac", "1", "-t", "420", wav], check=True)
    # keep only the text of the first 7 minutes
    durs, acc, keep = [], 0.0, []
    for uid, t in lines:
        dd = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(root, uid + ".flac")], capture_output=True, text=True).stdout)
        if acc + dd > 420: break
        acc += dd; keep.append(t.lower())
    return wav, " ".join(keep), keep

def husary(surah=36, ayat=40):
    j = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://api.alquran.cloud/v1/surah/{surah}/quran-simple-clean", headers=UA), timeout=60).read())
    texts = [a["text"] for a in j["data"]["ayahs"][:ayat]]
    if surah != 1 and surah != 9: texts[0] = re.sub(r"^بسم الله الرحمن الرحيم\s*", "", texts[0])
    lst = f"{W}/q.txt"
    with open(lst, "w") as f:
        for i in range(1, ayat + 1):
            p = b.get(f"https://everyayah.com/data/Husary_64kbps/{surah:03d}{i:03d}.mp3", f"{W}/q{surah:03d}{i:03d}.mp3")
            f.write(f"file '{os.path.abspath(p)}'\n")
    wav = f"{W}/quran-long.wav"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-ar", "16000", "-ac", "1", wav], check=True)
    return wav, " ".join(texts), texts

sets = []
try: sets.append(("en", "LibriSpeech, one reader", *librispeech()))
except Exception as e: print("note: LibriSpeech not available:", e)
try: sets.append(("ar", "Quran, al-Husary", *husary()))
except Exception as e: print("note: Husary not available:", e)
f = b.fleurs("ar_eg"); sets.append(("ar", "FLEURS Arabic, many speakers", f["wav"], f["ref"], f["sentences"]))

for lang, name, wav, ref, sentences in sets:
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True).stdout)
    whole = mp3_of(wav); pieces = quiet_pieces(wav)
    for model in ("whisper-large-v3", "whisper-large-v3-turbo"):
        for mode, files in (("whole", [whole]), (f"{len(pieces)} quiet pieces", pieces)):
            t0 = time.time(); text = " ".join(groq(p, model).get("text", "") for p in files); secs = time.time() - t0
            w = b.wer(ref, text, lang); miss = b.skipped(sentences, text, lang)
            print(f"STUDY | {name} ({dur/60:.1f} min) | {model} | {mode} | WER {w*100:.1f}% | {miss} of {len(sentences)} skipped | {secs:.0f} s", flush=True)

# A phone video (picture + AAC sound): the app turns its sound into M4A pieces; Groq must accept them and hear them as well as MP3
import asyncio, base64, threading, http.server, functools
from playwright.async_api import async_playwright
en = [x for x in sets if x[0] == "en"]
if en:
    _, _, wav, ref, sentences = en[0]
    vid = f"{W}/phone-video.mp4"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x240:r=10", "-i", wav, "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", vid], check=True)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8766), functools.partial(http.server.SimpleHTTPRequestHandler, directory=root))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    async def pieces_of(path):
        async with async_playwright() as p:
            br = await p.chromium.launch(); page = await br.new_page()
            await page.route("**/*workers.dev/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":true}'))
            await page.goto("http://127.0.0.1:8766/"); await page.wait_for_timeout(1500)
            out = await page.evaluate("""async b64 => {
              const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              const prep = await window.JundMedia.prepare(new File([bytes], 'video.mp4', { type: 'video/mp4' }));
              const res = [];
              for (const p of prep.pieces) { const u = new Uint8Array(await p.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); res.push({ mime: p.mime, b64: btoa(s) }); }
              return res;
            }""", base64.b64encode(open(path, "rb").read()).decode())
            await br.close(); return out
    got = asyncio.run(pieces_of(vid))
    files = []
    for i, pc in enumerate(got):
        f = f"{W}/video-piece{i}.m4a"; open(f, "wb").write(base64.b64decode(pc["b64"])); files.append((f, pc["mime"]))
    print("STUDY | phone video pieces:", [m for _, m in files])
    t0 = time.time(); text = " ".join(groq(f, "whisper-large-v3", "audio.m4a", m).get("text", "") for f, m in files)
    print(f"STUDY | phone video ({len(files)} M4A pieces made by the app) | whisper-large-v3 | WER {b.wer(ref, text, 'en')*100:.1f}% | {b.skipped(sentences, text, 'en')} of {len(sentences)} skipped | {time.time()-t0:.0f} s", flush=True)
