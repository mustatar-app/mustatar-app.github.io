"""Studio videos play to the end everywhere (WhatsApp, the phone's gallery): the phone's fragmented MP4 is rewritten
as one ordinary MP4 with its full length. Run: python3 tests/mp4fix_test.py http://localhost:8765/"""
import asyncio, base64, json, os, struct, subprocess, sys, tempfile
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
T = tempfile.mkdtemp(); fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
def ff(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
def tops(path):
    d = open(path, "rb").read(); out = []; i = 0
    while i + 8 <= len(d):
        s, = struct.unpack(">I", d[i:i + 4]); t = d[i + 4:i + 8].decode("latin1")
        if s == 1: s, = struct.unpack(">Q", d[i + 8:i + 16])
        out.append(t); i += s if s else len(d)
    return out, d
def mvhd_seconds(d):
    j = d.find(b"mvhd"); v = d[j + 4]
    ts, dur = (struct.unpack(">IQ", d[j + 24:j + 36]) if v else struct.unpack(">II", d[j + 16:j + 24]))
    return dur / ts
def packets(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-c", "copy", "-f", "framemd5", "-"], capture_output=True, text=True).stdout
    return sorted((l.split(",")[0].strip(), l.split(",")[-1].strip()) for l in r.splitlines() if l and not l.startswith("#"))

# like the phone's recorder: H.264 + AAC, a new piece every ~3.3 s, and no total length at the top
for name, extra in (("phone", ["-movflags", "frag_keyframe+empty_moov+default_base_moof"]), ("bframes", ["-bf", "2", "-movflags", "frag_keyframe+empty_moov+default_base_moof"])):
    ff("-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30", "-f", "lavfi", "-i", "sine=f=440:sample_rate=48000", "-t", "10",
       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "100", *(["-bf", "0"] if name == "phone" else []), "-c:a", "aac", "-b:a", "96k", *extra, f"{T}/{name}.mp4")
ff("-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{T}/plain.mp4")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        await pg.goto(BASE + "privacy.html")
        await pg.add_script_tag(url=BASE + "mp4fix.js")
        for name in ("phone", "bframes", "plain"):
            src = f"{T}/{name}.mp4"
            data = base64.b64encode(open(src, "rb").read()).decode()
            r = await pg.evaluate("""async b64 => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const inB = new Blob([u], {type:'video/mp4'});
                const out = await JundMp4.fix(inB); const a = new Uint8Array(await out.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768));
                return { same: out === inB, b64: btoa(s) }; }""", data)
            dst = f"{T}/{name}-fixed.mp4"; open(dst, "wb").write(base64.b64decode(r["b64"]))
            if name == "plain":
                check(r["same"], "an ordinary MP4 is left exactly as it was"); continue
            before, d0 = tops(src); after, d1 = tops(dst)
            print("   ", name, before[:5], "→", after)
            check("moof" in before and mvhd_seconds(d0) < 1, f"{name}: the recorder's file is in pieces with no length at the top ({mvhd_seconds(d0)} s)")
            check(after == ["ftyp", "moov", "mdat"], f"{name}: the new file is one ordinary MP4, length first so it plays while downloading")
            check(abs(mvhd_seconds(d1) - 10) < 0.2, f"{name}: the full length (10 s) is written in ({mvhd_seconds(d1):.2f} s)")
            check(packets(src) == packets(dst), f"{name}: picture and sound are exactly the same")
            bad = subprocess.run(["ffmpeg", "-v", "error", "-i", dst, "-f", "null", "-"], capture_output=True, text=True).stderr.strip()
            check(not bad, f"{name}: plays cleanly from start to end {bad[:120]}")
            last = subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "9.5", "-i", dst, "-frames:v", "1", f"{T}/{name}-last.jpg"], capture_output=True)
            check(os.path.exists(f"{T}/{name}-last.jpg"), f"{name}: the last second is there")
            dur = await pg.evaluate("async b64 => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([u], {type:'video/mp4'})); await new Promise(r => { v.onloadedmetadata = r; v.onerror = r; }); return v.duration; }", r["b64"])
            check(dur and abs(dur - 10) < 0.2, f"{name}: the browser reads 10 s ({dur})")
        # a broken file never stops the save: the original is kept
        ok = await pg.evaluate("async () => { const b = new Blob([new Uint8Array([0,0,0,8,109,111,111,102,1,2,3])], {type:'video/mp4'}); return (await JundMp4.fix(b)) === b; }")
        check(ok, "a file that cannot be read is saved as it is")
        await b.close()
asyncio.run(main())
print("\n" + (f"{len(fails)} check(s) failed" if fails else "All checks passed")); sys.exit(1 if fails else 0)
