"""The real server (wrangler dev on this machine) with a pretend Groq: recordings, notes, the voice assistant,
a photo, a text file, waiting in line, and the owner's meter. Cloudflare's own AI cannot run here, so Groq does all of it.

Run:  python3 tests/server_ai_test.py            (starts the pretend Groq on port 8799)
      then the server:  (cd server && npx wrangler dev -c wrangler.test.toml --port 8788 --ip 127.0.0.1
                          --var GROQ_API_KEY:gsk_test --var GROQ_BASE:http://127.0.0.1:8799)
      python3 tests/server_ai_test.py check http://127.0.0.1:8788
"""
import base64, json, sys, threading, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"busy": False, "calls": []}

class FakeGroq(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass
    def do_POST(self):
        if self.headers.get("transfer-encoding", "").lower() == "chunked":
            body = b""
            while True:
                size = int(self.rfile.readline().strip().split(b";")[0], 16)
                if not size:
                    self.rfile.readline(); break
                body += self.rfile.read(size); self.rfile.readline()
            n = len(body)
        else:
            n = int(self.headers.get("content-length") or 0)
            body = self.rfile.read(n)
        STATE["calls"].append({"path": self.path, "type": self.headers.get("content-type", ""), "size": n, "body": body[:20000]})
        if STATE["busy"]:
            self.send_response(429); self.send_header("retry-after", "33"); self.send_header("content-type", "application/json"); self.end_headers()
            self.wfile.write(b'{"error":{"message":"Rate limit reached. Please try again in 33s."}}'); return
        if self.path.endswith("/audio/transcriptions"):
            out = {"text": "x", "language": "arabic", "duration": 30, "segments": [
                {"start": 0, "end": 4, "text": " بسم الله", "no_speech_prob": 0.01, "avg_logprob": -0.2},
                {"start": 10, "end": 14, "text": " موضوع الاجتماع اليوم", "no_speech_prob": 0.01, "avg_logprob": -0.2}]}
            self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps(out, ensure_ascii=False).encode()); return
        req = json.loads(body or b"{}")
        if req.get("stream"):
            self.send_response(200); self.send_header("content-type", "text/event-stream"); self.end_headers()
            for piece, fin in (("## الخلاصة", None), (" تمت", "stop")):
                ev = {"choices": [{"index": 0, "delta": {"content": piece}, "finish_reason": fin}]}
                self.wfile.write(("data: " + json.dumps(ev, ensure_ascii=False) + "\n\n").encode())
            self.wfile.write(b'data: {"choices":[],"usage":{"total_tokens":77}}\n\ndata: [DONE]\n\n'); return
        out = {"choices": [{"message": {"content": "صفحة مقروءة"}, "finish_reason": "stop"}], "usage": {"total_tokens": 300}}
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps(out, ensure_ascii=False).encode())

def serve():
    ThreadingHTTPServer(("127.0.0.1", 8799), FakeGroq).serve_forever()

O = "http://localhost:8765"

def post(api, path, data, ctype="application/json", headers=None):
    req = urllib.request.Request(api + path, data=data, method="POST", headers={"origin": O, "content-type": ctype, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def text_of(sse):
    out = ""
    for line in sse.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            ev = json.loads(line[5:])
        except Exception:
            continue
        if "choices" in ev:
            out += "".join((c.get("delta") or {}).get("content") or "" for c in ev["choices"])
        for c in ev.get("candidates", []):
            out += "".join(p.get("text", "") for p in c.get("content", {}).get("parts", []))
    return out

def check_all(api):
    fails = []
    def check(ok, what):
        print(("PASS " if ok else "FAIL ") + what)
        if not ok:
            fails.append(what)
    with urllib.request.urlopen(api + "/", timeout=20) as r:
        info = json.loads(r.read())
    check(info.get("key") and "groq/whisper-large-v3" in info["engine"]["hear"], "the server says its free AI is ready: " + json.dumps(info.get("engine")))

    s, b = post(api, "/transcribe?mime=audio/mpeg&langs=ar,en", b"\xff\xfb" + b"\0" * 5000, "audio/mpeg")
    call = STATE["calls"][-1]
    check(s == 200 and text_of(b) == "بسم الله\n\nموضوع الاجتماع اليوم", "a recording piece becomes text, with a new paragraph after a pause")
    check("multipart/form-data" in call["type"] and b'filename="audio.mp3"' in call["body"] and b"whisper-large-v3" in call["body"], "the sound reaches Groq's Whisper as a file")

    s, b = post(api, "/write", json.dumps({"system": "S", "user": "محاضرة", "json": False}).encode(), headers={"x-mst-stream": "openai"})
    check(s == 200 and text_of(b) == "## الخلاصة تمت" and '"choices"' in b, "notes stream straight through to a new app")
    s, b = post(api, "/write", json.dumps({"system": "S", "user": "محاضرة", "json": False}).encode())
    check(s == 200 and text_of(b) == "## الخلاصة تمت" and '"finishReason":"STOP"' in b, "an older app copy gets the same notes in the older format")
    sent = json.loads(STATE["calls"][-1]["body"])
    check(sent["model"] == "openai/gpt-oss-120b" and "Markdown" in sent["messages"][0]["content"], "the note style rules are added for the writer")

    s, b = post(api, "/write", json.dumps({"system": "S", "user": "خطة", "json": True, "studyNotes": True}).encode(), headers={"x-mst-stream": "openai"})
    sent = json.loads(STATE["calls"][-1]["body"])
    check(s == 200 and '"sections"' in sent["messages"][0]["content"] and sent.get("response_format", {}).get("type") == "json_object", "study notes ask for JSON in the note shape")

    voice = base64.b64encode(b"\x1aE\xdf\xa3" + b"\0" * 3000).decode()
    s, b = post(api, "/ask-voice", json.dumps({"audio": voice, "mime": "audio/webm;codecs=opus", "system": "RULES", "user": "", "langs": "ar,en"}).encode(), headers={"x-mst-stream": "openai"})
    check(s == 200 and text_of(b).startswith("Q (ar): بسم الله موضوع الاجتماع اليوم\n## الخلاصة"), "voice: what was heard comes first, then the answer")

    img = base64.b64encode(b"\xff\xd8\xff" + b"\0" * 500).decode()
    s, b = post(api, "/ask-file", json.dumps({"file": img, "mime": "image/jpeg", "name": "board.jpg", "user": "what is here?", "system": "S"}).encode(), headers={"x-mst-stream": "openai"})
    sent = json.loads(STATE["calls"][-1]["body"])
    check(s == 200 and sent["model"] == "qwen/qwen3.8-27b" and any(p.get("type") == "image_url" for p in sent["messages"][1]["content"]), "a photo goes to the model that reads pictures")
    txt = base64.b64encode("جدول الأسبوع: الاثنين اجتماع".encode()).decode()
    s, b = post(api, "/ask-file", json.dumps({"file": txt, "mime": "text/plain", "name": "week.txt", "user": "add to calendar", "system": "S"}).encode(), headers={"x-mst-stream": "openai"})
    sent = json.loads(STATE["calls"][-1]["body"])
    check(s == 200 and "الاثنين اجتماع" in sent["messages"][1]["content"], "a text file is read and sent with the question")

    s, b = post(api, "/transcribe?mime=image/jpeg", b"\xff\xd8\xff" + b"\0" * 500, "image/jpeg")
    check(s == 200 and text_of(b) == "صفحة مقروءة", "a photo of a page becomes its text")

    STATE["busy"] = True
    s, b = post(api, "/transcribe?mime=audio/mpeg&langs=ar,en", b"\xff\xfb" + b"\0" * 5000, "audio/mpeg")
    STATE["busy"] = False
    j = json.loads(b) if b.startswith("{") else {}
    check(s == 429 and j.get("code") == "rate" and j.get("retryAfter") == 33, "when the free service is full, the app is told to wait 33 seconds in line")

    s, b = post(api, "/owner/meter", json.dumps({"code": "WRONG"}).encode())
    check(s == 403, "the meter needs the owner code")
    return fails

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "check":
        threading.Thread(target=serve, daemon=True).start()
        fails = check_all(sys.argv[2])
        print("\n" + (f"{len(fails)} check(s) failed" if fails else "All checks passed"))
        sys.exit(1 if fails else 0)
    print(__doc__)
