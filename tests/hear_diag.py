"""Groq directly, English 60-second pieces: raw text, pieces, no-speech scores (why some pieces come back empty)."""
import json, os, sys, urllib.request, uuid, importlib.util
sys.argv = [sys.argv[0]]
spec = importlib.util.spec_from_file_location("b", os.path.join(os.path.dirname(__file__), "benchmark.py")); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
KEY = os.environ.get("GROQ_API_KEY", "").strip()
def groq(path, model):
    bnd = uuid.uuid4().hex
    parts = [("model", model), ("response_format", "verbose_json"), ("temperature", "0")]
    body = b"".join(f"--{bnd}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode() for k, v in parts)
    body += f"--{bnd}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n".encode() + open(path, "rb").read() + f"\r\n--{bnd}--\r\n".encode()
    req = urllib.request.Request("https://api.groq.com/openai/v1/audio/transcriptions", data=body, method="POST",
                                 headers={"authorization": "Bearer " + KEY, "content-type": f"multipart/form-data; boundary={bnd}", "user-agent": "Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(req, timeout=300).read())
s = b.fleurs("en_us")
for p in b.chunks(s, "mp3", 60):
    j = groq(p, "whisper-large-v3")
    segs = j.get("segments", [])
    print(f"DIAG {os.path.basename(p)} lang={j.get('language')} dur={j.get('duration')} pieces={len(segs)} text={j.get('text','')[:90]!r}")
    for x in segs[:12]:
        print(f"   {x['start']:.1f}-{x['end']:.1f} nsp={x.get('no_speech_prob',0):.2f} lp={x.get('avg_logprob',0):.2f} cr={x.get('compression_ratio',0):.2f} {x.get('text','')[:60]!r}")
