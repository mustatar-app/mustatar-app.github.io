"""The Android app's own features (emulator): reminders that come with the app closed, the gentle prayer vibration,
the new home-screen widgets (drawn into pictures to look at), the phone's calendars both ways, and the fitness tracker.
Run by .github/workflows/phone-test.yml:  cd tests && python3 phone_more_test.py
"""
import base64, io, json, os, sys, time
from phone_test import Page, adb, check, wait, failures, PKG

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "phone-shots")
os.makedirs(OUT, exist_ok=True)

def show_png(name, data):
    with open(os.path.join(OUT, f"widget-{name}.png"), "wb") as f:
        f.write(data)
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(data)).convert("RGB"); im.thumbnail((520, 520))
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=70)
        b = base64.b64encode(buf.getvalue()).decode()
        for i in range(0, len(b), 8000):
            print(f"SHOT widget-{name} {i // 8000} {b[i:i + 8000]}")
    except Exception as e:
        print("     (picture not printed:", e, ")")

def start(page=None):
    adb("shell", "am", "start", "-n", f"{PKG}/sa.jund.notes.MainActivity", "--es", "testHome", "http://localhost:8765")
    time.sleep(7)
    page = Page(); wait(page, "document.readyState === 'complete' && !!window.JN && !!window.JundPhone", 30)
    return page

def main():
    for perm in ["POST_NOTIFICATIONS", "READ_CALENDAR", "WRITE_CALENDAR"]:
        adb("shell", "pm", "grant", PKG, "android.permission." + perm)
    adb("shell", "appops", "set", PKG, "SCHEDULE_EXACT_ALARM", "allow")
    adb("shell", "am", "force-stop", PKG)
    page = start()
    page.js("localStorage.setItem('jn_welcomed','true'); localStorage.setItem('jn_opened','true'); true")

    # 1. a reminder rings with the app closed (swiped away / killed in the background)
    # the test items go in through the app's own list (the app re-sends its whole list when it is opened or hidden)
    page.js("""(() => { const at = Date.now() + 40000;
      const brief = window.JundBrief.alarms; window.JundBrief.alarms = () => [...brief(), { id: 'closed-test', at, title: 'Closed-app reminder', body: 'It came with Mustatar closed' }];
      window.JundPhone.prayerAlarms = () => [{ id: 'pray-test', kind: 'prayer', at: at + 2000, title: 'It is time for Asr', body: 'gentle, no sound' }];
      JundCal.pushSync(true); return true; })()""")
    time.sleep(2)
    adb("shell", "input", "keyevent", "KEYCODE_HOME"); time.sleep(1)
    adb("shell", "am", "kill", PKG)   # what Android does to an app in the background (alarms stay)
    time.sleep(3)
    ps = adb("shell", "pidof", PKG).strip()
    print("     app process after closing:", ps or "(none)", flush=True)
    time.sleep(45)
    notes = adb("shell", "dumpsys", "notification", "--noredact")
    check("Closed-app reminder" in notes, "a reminder comes when the app is closed")
    check("It is time for Asr" in notes, "the prayer-time notice comes when the app is closed")
    ch = adb("shell", "dumpsys", "notification", "--noredact")
    import re
    m = re.search(r"NotificationChannel\{mId='mustatar-prayer-v1'[^}]*\}", ch)
    chan = m.group(0) if m else ""
    print("     prayer channel:", chan[:400], flush=True)
    check(bool(chan) and "mSound=null" in chan and "mVibrationEnabled=true" in chan, "prayer times: vibration on, no sound")

    # 2. the widgets, drawn from the data the app gives them
    page = start()
    page.js("""(() => { const d = new Date(), p = n => String(n).padStart(2, '0'), k = x => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
      const t = new Date(); const pr = {}; for (let i = 0; i < 3; i++) { const x = new Date(+t + i * 864e5); pr[k(x)] = { Fajr: '04:58', Dhuhr: '12:01', Asr: '15:12', Maghrib: '17:38', Isha: '19:08' }; }
      const m = (h, mi) => { const x = new Date(); x.setHours(h, mi, 0, 0); return x.getTime(); };
      const h = new Date().getHours();
      const items = [
        { title: 'Fiqh lesson — Book of Purification', at: m(Math.min(h + 1, 22), 30), end: m(Math.min(h + 2, 23), 15), timed: true, type: 'class' },
        { title: 'Team meeting', at: m(Math.min(h + 2, 23), 0), end: m(Math.min(h + 2, 23), 45), timed: true, type: 'meeting' },
        { title: 'Revise chapter 3', at: m(0, 1), end: m(23, 59), timed: false, type: 'homework' },
        { title: 'Exam: Hadith', at: +t + 3 * 864e5, end: +t + 3 * 864e5 + 7200e3, timed: true, type: 'exam' } ];
      MustatarAndroid.postMessage(JSON.stringify({ action: 'widget', data: { v: 1, lang: 'en', style: 'dark', weekStart: 0, prayers: pr,
        hijri: { [k(t)]: '29 Jumada I 1448' }, items, busyDays: [k(new Date(+t + 3 * 864e5)), k(new Date(+t + 6 * 864e5))],
        wisdom: [{ t: 'Indeed, with hardship comes ease.', s: 'Quran 94:6' }] } })); return true; })()""")
    time.sleep(2)
    r = page.js("JundPhone.previewWidgets()", timeout=40)
    print("     preview:", r, flush=True)
    time.sleep(2)
    files = adb("shell", "run-as", PKG, "ls", "files/widgets").split()
    print("     widget files:", files, flush=True)
    for f in files:
        if f.endswith(".err"):
            print("     ERROR", f, adb("shell", "run-as", PKG, "cat", "files/widgets/" + f), flush=True)
    ok = 0
    for name in ["today", "prayer", "day", "month", "wisdom"]:
        data = __import__("subprocess").run(["adb", "exec-out", "run-as", PKG, "cat", f"files/widgets/{name}.png"], capture_output=True).stdout
        if data[:4] == b"\x89PNG":
            ok += 1; show_png(name, data)
    check(ok == 5, f"all five widgets draw without a problem ({ok} of 5)")
    # the same in Arabic and in white
    page.js("""(() => { const p = n => String(n).padStart(2, '0'), k = x => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`, t = new Date();
      const pr = {}; for (let i = 0; i < 3; i++) { const x = new Date(+t + i * 864e5); pr[k(x)] = { Fajr: '04:58', Dhuhr: '12:01', Asr: '15:12', Maghrib: '17:38', Isha: '19:08' }; }
      const m = (h, mi) => { const x = new Date(); x.setHours(h, mi, 0, 0); return x.getTime(); }, h = new Date().getHours();
      MustatarAndroid.postMessage(JSON.stringify({ action: 'widget', data: { v: 1, lang: 'ar', style: 'white', weekStart: 6, prayers: pr, hijri: { [k(t)]: '٢٩ جمادى الأولى ١٤٤٨' },
        items: [{ title: 'درس الفقه — كتاب الطهارة', at: m(Math.min(h + 1, 22), 30), end: m(Math.min(h + 2, 23), 15), timed: true, type: 'class' }, { title: 'مراجعة الباب الثالث', at: m(0, 1), end: m(23, 59), timed: false, type: 'homework' }],
        busyDays: [], wisdom: [{ t: 'فإن مع العسر يسرا', s: 'الشرح ٦' }] } })); return true; })()""")
    time.sleep(2); page.js("JundPhone.previewWidgets()", timeout=40); time.sleep(2)
    for name in ["today", "prayer", "month"]:
        data = __import__("subprocess").run(["adb", "exec-out", "run-as", PKG, "cat", f"files/widgets/{name}.png"], capture_output=True).stdout
        if data[:4] == b"\x89PNG": show_png(name + "-ar-white", data)

    # 3. the phone's calendars: a calendar on the phone (made here, as an account would), both ways
    made = adb("shell", "content insert --uri 'content://com.android.calendar/calendars?caller_is_syncadapter=true&account_name=test@example.com&account_type=LOCAL'"
        " --bind account_name:s:test@example.com --bind account_type:s:LOCAL --bind name:s:Work --bind calendar_displayName:s:Work"
        " --bind calendar_access_level:i:700 --bind ownerAccount:s:test@example.com --bind visible:i:1 --bind sync_events:i:1"
        " --bind calendar_color:i:-14575885 --bind isPrimary:i:1")
    print("     made a test calendar:", made.strip() or "ok", flush=True)
    cals = page.js("JundNative.ask({ action: 'calendarList' }, 20000)", timeout=30)
    print("     calendars:", json.dumps(cals)[:400], flush=True)
    work = next((c for c in (cals or {}).get("calendars", []) if c.get("name") == "Work"), None)
    check(bool(work) and work.get("writable"), "the app sees the phone's calendars (and which it can write to)")
    if work:
        cid = work["id"]
        start_ms = int((time.time() + 3 * 3600) * 1000)
        # one string for the phone's shell, with the title quoted (it has spaces)
        import shlex
        out = adb("shell", f"content insert --uri content://com.android.calendar/events --bind calendar_id:i:{cid} --bind {shlex.quote('title:s:Dentist (from phone)')}"
            f" --bind dtstart:l:{start_ms} --bind dtend:l:{start_ms + 3600000} --bind eventTimezone:s:UTC")
        print("     phone event added:", out.strip() or "ok", flush=True)
        # connect in the app, as a person would (permission already given), showing Work and writing into it
        page.js(f"""(() => {{ localStorage.setItem('jn_phoneCal', JSON.stringify({{ on: true, show: [{cid}], write: {cid}, list: [{{ id: {cid}, name: 'Work', account: 'test@example.com', writable: true, color: '#1f5fd6' }}] }}));
          JundCal.add({{ title: 'Write the report (from Mustatar)', date: new Date(Date.now() + 864e5).toISOString().slice(0, 10), time: '10:00', type: 'task', remind: 15 }}); return true; }})()""")
        page.js("JundPhone.calRefresh(true)", timeout=40); time.sleep(4)
        got = page.js("JundCal.events().filter(e => e.ext === 'phone').map(e => e.title)")
        check(isinstance(got, list) and "Dentist (from phone)" in got, f"an event from the phone's calendar shows in Mustatar ({got})")
        rows = adb("shell", "content", "query", "--uri", "content://com.android.calendar/events", "--projection", "_id:title:uid2445", "--where", f"calendar_id={cid}")
        print("     phone calendar now:", rows[:600], flush=True)
        check("Write the report (from Mustatar)" in rows and "mustatar-" in rows, "Mustatar's item is written into the phone's calendar")
        # change it on the phone → it comes back into Mustatar
        import re as _re
        mm = _re.search(r"_id=(\d+), title=Write the report \(from Mustatar\)", rows)
        if mm:
            out = adb("shell", f"content update --uri content://com.android.calendar/events/{mm.group(1)} --bind {shlex.quote('title:s:Write the report — changed on phone')}")
            print("     changed on the phone:", out.strip() or "ok", flush=True)
            page.js("(() => { const c = JSON.parse(localStorage.getItem('jn_phoneCal')); c.at = 0; localStorage.setItem('jn_phoneCal', JSON.stringify(c)); return true; })()")
            page.js("JundPhone.calRefresh(true)", timeout=40); time.sleep(4)
            t2 = page.js("JundCal.events().filter(e => !e.ext).map(e => e.title)")
            check(isinstance(t2, list) and "Write the report — changed on phone" in t2, "a change made in the phone's calendar comes back into Mustatar")

    # 4. the app updates itself: it knows its version, downloads the newest one and opens Android's installer
    info = page.js("JundNative.ask({ action: 'appInfo' }, 10000)", timeout=20)
    print("     app info:", info, flush=True)
    check(isinstance(info, dict) and int(info.get("versionCode") or 0) > 0, "the app can say which version it is")
    adb("shell", "appops", "set", PKG, "REQUEST_INSTALL_PACKAGES", "allow")
    up = page.js("JundNative.ask({ action: 'appUpdate', url: 'https://github.com/mustatar-app/mustatar-app.github.io/releases/latest/download/Mustatar.apk' }, 180000)", timeout=200)
    time.sleep(3)
    top = adb("shell", "dumpsys", "activity", "activities")
    import re as _r
    shown = _r.search(r"(topResumedActivity|mResumedActivity)=.*", top)
    print("     update:", up, "|", shown.group(0)[:160] if shown else "", flush=True)
    check(isinstance(up, dict) and up.get("ok") and shown and "packageinstaller" in shown.group(0).lower(), "Update downloads the newest app and opens Android's installer")
    adb("shell", "input", "keyevent", "KEYCODE_BACK"); time.sleep(2)
    page = start()

    # 4b. the alarm clock: set an alarm a minute ahead; it is the phone's real next alarm, then it rings (full screen, alarm sound)
    adb("shell", "appops", "set", PKG, "SCHEDULE_EXACT_ALARM", "allow")
    fs = page.js("(() => { const d = new Date(Date.now() + 70e3); const t = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); localStorage.setItem('jn_alarms', JSON.stringify([{ id: 'Atest', time: t, days: [], label: 'Test alarm', on: true }])); return JundAlarm.sync().then(() => JundNative.ask({ action: 'alarmStatus' }, 8000)); })()", timeout=20)
    print("     alarm status:", fs, flush=True)
    check(isinstance(fs, dict) and fs.get("ok") and int(fs.get("nextAt") or 0) > 0, "an alarm set in Mustatar becomes the phone's next alarm")
    nxt = adb("shell", "dumpsys", "alarm")
    check("AlarmClock" in nxt or "sa.jund.notes" in nxt, "the phone's alarm list holds Mustatar's alarm")
    rang = page.js("JundNative.ask({ action: 'alarmTest', label: 'Test', opts: { ring: 2, vol: 80, rise: true, vib: true, snooze: 10 } }, 8000)", timeout=15); time.sleep(3)
    notes = adb("shell", "dumpsys", "notification", "--noredact")
    svc = adb("shell", "dumpsys", "activity", "services", "sa.jund.notes.AlarmService")
    audio = adb("shell", "dumpsys", "audio")
    print("     ringing service:", "AlarmService" in svc, flush=True)
    check(isinstance(rang, dict) and rang.get("ok") and "mustatar-alarm-v2" in notes, "the alarm shows on the alarm channel with Stop and Snooze")
    check("AlarmService" in svc and "isForeground=true" in svc, "the alarm plays its own sound for the chosen time (keeps ringing, not a short notification sound)")
    check("Snooze 10 min" in notes, "the chosen snooze length is on the alarm")
    check("USAGE_ALARM" in audio or "usage=USAGE_ALARM" in audio or "ALARM" in audio, "it plays on the phone's alarm volume")
    adb("shell", "cmd", "statusbar", "collapse")
    adb("shell", "am", "broadcast", "-a", "sa.jund.notes.ALARM_STOP", "-n", f"{PKG}/sa.jund.notes.AlarmClock")
    time.sleep(2)
    svc = adb("shell", "dumpsys", "activity", "services", "sa.jund.notes.AlarmService")
    check("isForeground=true" not in svc, "Stop ends the ringing")
    adb("shell", "input", "keyevent", "KEYCODE_HOME"); time.sleep(1)
    page = start()
    # 4c. focus lock: the app pins itself, then unpins
    lk = page.js("JundNative.ask({ action: 'focusLock', dnd: false }, 8000)", timeout=15); time.sleep(3)
    pinned = "mLockTaskModeState=PINNED" in adb("shell", "dumpsys", "activity", "activities") or "LOCKED" in adb("shell", "dumpsys", "activity", "lastanr") 
    print("     focus lock:", lk, pinned, flush=True)
    check(isinstance(lk, dict) and lk.get("ok"), "focus lock answers (pins Mustatar on the screen)")
    page.js("JundNative.ask({ action: 'focusUnlock' }, 8000)", timeout=15); time.sleep(2)
    # 4d. the back button never leaves to an old page: Calendar → back → Today
    page.js("JN.show('calendar')"); time.sleep(1)
    adb("shell", "input", "keyevent", "KEYCODE_BACK"); time.sleep(2)
    scr = page.js("[...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id")
    check(scr == "screen-assistant", f"the phone's back button goes from Calendar to Today, inside the app ({scr})")

    # 5. fitness: Health Connect is there, permission can be given, and the last 7 days can be read
    st = page.js("JundNative.ask({ action: 'healthStatus' }, 20000)", timeout=30)
    print("     health status:", st, flush=True)
    check(isinstance(st, dict) and st.get("status") in ("ok", "update", "none"), "the app can ask whether Health Connect is on the phone")
    if isinstance(st, dict) and st.get("status") == "ok":
        for p in ["READ_STEPS", "READ_SLEEP", "READ_DISTANCE", "READ_ACTIVE_CALORIES_BURNED", "READ_EXERCISE"]:
            print("     grant", p, adb("shell", "pm", "grant", PKG, "android.permission.health." + p).strip() or "ok", flush=True)
        rd = page.js("JundNative.ask({ action: 'healthRead', days: 7 }, 30000)", timeout=40)
        print("     health read:", json.dumps(rd)[:500], flush=True)
        check(isinstance(rd, dict) and rd.get("ok") and len(rd.get("days", [])) == 7, "the last 7 days of steps and sleep can be read (empty on a test phone)")
        page.js("localStorage.setItem('jn_fitness', JSON.stringify({ on: true })); JundPhone.fitRead(true).then(() => JundPhone.paintFitHome()); true")
        time.sleep(3)
        card = page.js("(() => { JN.show('assistant'); const c = document.querySelector('#hm-fit'); return c ? c.innerText : '' })()")
        check("steps" in (card or "").lower(), f"the fitness card shows on Today ({(card or '')[:80]!r})")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback; traceback.print_exc()
        print("FAIL the test stopped:", type(e).__name__, e); failures.append(str(e))
    print("\n" + (f"{len(failures)} check(s) failed" if failures else "All Android phone-feature checks passed"))
    sys.exit(1 if failures else 0)
