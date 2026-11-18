"""Why does a hearing model miss words? Calls Groq directly with the benchmark recordings and compares
its raw answer with what the server keeps after tidying (dropped pieces are listed). Needs GROQ_API_KEY."""
import json, os, subprocess, sys, urllib.request, uuid
sys.argv = [sys.argv[0]]
import importlib.util
spec = importlib.util.spec_from_file_location("b", os.path.join(os.path.dirname(__file__), "benchmark.py")); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
KEY = os.environ.get("GROQ_API_KEY", "").strip()
if not KEY:
    print("no key"); sys.exit(0)
def groq(path, model, lang=None):
    bnd = uuid.uuid4().hex
    parts = [("model", model), ("response_format", "verbose_json"), ("temperature", "0")] + ([("language", lang)] if lang else [])
    body = b"".join(f"--{bnd}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode() for k, v in parts)
    body += f"--{bnd}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n".encode() + open(path, "rb").read() + f"\r\n--{bnd}--\r\n".encode()
    req = urllib.request.Request("https://api.groq.com/openai/v1/audio/transcriptions", data=body, method="POST",
                                 headers={"authorization": "Bearer " + KEY, "content-type": f"multipart/form-data; boundary={bnd}", "user-agent": "Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(req, timeout=300).read())
for lang_dir, lang in (("ar_eg", "ar"), ("en_us", "en")):
    s = b.fleurs(lang_dir)
    for model in ("whisper-large-v3", "whisper-large-v3-turbo"):
        for told in (None, lang):
            j = groq(s["mp3"], model, told)
            segs = j.get("segments", [])
            kept = [x for x in segs if not (x.get("no_speech_prob", 0) > 0.6 and x.get("avg_logprob", 0) < -1)]
            dropped = [x for x in segs if x not in kept]
            print(f"DIAG {lang} {model} told={told}: raw WER {b.wer(s['ref'], j.get('text',''), lang)*100:.1f}% · {len(segs)} pieces, {len(dropped)} dropped by the filter · duration {j.get('duration')}")
            for x in dropped[:5]:
                print(f"   dropped: {x.get('start')}-{x.get('end')} nsp={x.get('no_speech_prob'):.2f} lp={x.get('avg_logprob'):.2f} «{x.get('text','')[:80]}»")
            gaps = [(round(a['end'],1), round(c['start'],1)) for a, c in zip(segs, segs[1:]) if c['start'] - a['end'] > 4]
            print(f"   long silent jumps (sound skipped?): {gaps[:6]}")
