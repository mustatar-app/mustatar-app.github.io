"""The habit tracker made like his sheets (habits × days, the day's score, progress) and the coach (SWOT, gaps, what is missing).
Run: python3 tests/habits_test.py http://localhost:8765/"""
import asyncio, json, sys, datetime as dt
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp"
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what); (None if ok else fails.append(what))
T = dt.date.today(); d = lambda n: (T + dt.timedelta(days=n)).isoformat()
NAMES = ["⏰ Wake up early", "📈 Learn language", "💧 Water", "🏋️ Workout", "🧘 Meditation", "📚 Study", "🚫 Stop fake dopamine", "🧠 Learn new things", "💤 Sleep before 10 pm", "📝 Plan next day"]
PAT = [0b1110111, 0b1111111, 0b1101101, 0b0000001, 0b0010000, 0b1111111, 0b0000001, 0b1111111, 0b0100100, 0b1111111]
H = [{"id": f"h{i}", "name": n, "target": "20 min" if i in (1, 3) else "", "created": d(-20), "days": {d(-k): True for k in range(1, 15) if PAT[i] >> (k % 7) & 1}, "miss": {}} for i, n in enumerate(NAMES)]
H[4]["days"] = {}  # meditation: slipped for days
COACH = {"summary": "You are steady on study and planning, but sleep and workouts are slipping.", "score": 62,
  "swot": {"strengths": ["Study every day (100%)"], "weaknesses": ["Workout 1 in 7 days"], "opportunities": ["Tie water to prayer times"], "threats": ["Exams soon while sleep is weak"]},
  "gaps": [{"goal": "Wake for Fajr daily", "now": "5 of 7 days", "fix": "Sleep by 10 pm"}],
  "difficulties": ["Exam week will push out workouts"], "missing": ["No weekly review"], "next": ["Sleep by 10 tonight", "10-minute workout", "Sunday review"],
  "habits": [{"name": "Weekly review", "target": "Sunday 20 min", "why": "You have no weekly review"}]}

async def run(b, lang):
    c = await b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, service_workers="block")
    await c.add_init_script(f"if (!sessionStorage.x) {{ sessionStorage.x = 1; localStorage.clear(); localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');localStorage.setItem('jn_habits', JSON.stringify({json.dumps(H)})); }}")
    await c.route("**/api.aladhan.com/**", lambda r: r.abort())
    pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1300)
    # Today: quick ticks and the link to the tracker
    check(await pg.evaluate("document.querySelector('#hm-habits .hb-body').hidden"), f"[{lang}] on Today, habits are one folded line")
    await pg.click("#hb-fold"); await pg.wait_for_timeout(200)
    chips = await pg.evaluate("document.querySelectorAll('#hm-habits .hb-chip').length")
    check(chips == 10, f"[{lang}] Today shows each habit as a quick tick ({chips})")
    await pg.click("#hm-habits .hb-chip >> nth=0"); await pg.wait_for_timeout(200)
    on = await pg.evaluate(f"JundHabits.all()[0].days['{d(0)}'] === true")
    check(on, f"[{lang}] one tap on Today ticks the habit for today")
    await pg.click("#hb-open"); await pg.wait_for_timeout(400)
    vis = await pg.evaluate("!document.querySelector('#screen-habits').hidden")
    check(vis, f"[{lang}] 'Tracker' opens the full habit tracker")
    # the sheet: habits × 7 days, the day's score under each day
    rows = await pg.evaluate("document.querySelectorAll('.hb-grid tbody tr').length")
    cols = await pg.evaluate("document.querySelectorAll('.hb-grid thead th').length")
    check(rows == 10 and cols == 8, f"[{lang}] a table like his sheet: 10 habits × 7 days ({rows}×{cols - 1})")
    foot = await pg.evaluate("document.querySelector('.hb-grid tfoot td:last-child').innerText.replace(/\\s/g,'')")
    check(foot.startswith("1/10") or foot.startswith("1/") , f"[{lang}] under each day, the day's score like 9/13 ({foot})")
    # tap: ✓ → ✕ → empty
    sel = f".hb-c[data-h=h3][data-d='{d(-1)}']"
    before = await pg.evaluate(f"document.querySelector(\"{sel}\").className")
    await pg.click(sel); await pg.wait_for_timeout(120)
    s1 = await pg.evaluate(f"document.querySelector(\"{sel}\").className")
    await pg.click(sel); await pg.wait_for_timeout(120)
    s2 = await pg.evaluate(f"document.querySelector(\"{sel}\").className")
    check("done" not in before and "done" in s1 and "miss" in s2, f"[{lang}] tapping a box: ✓ done, then ✕ missed (like his notebook)")
    fut = await pg.evaluate("document.querySelectorAll('.hb-grid thead th.fut').length")
    check(fut == 0, f"[{lang}] the week view ends today (no empty future days)")
    nudge = await pg.inner_text(".hb-nudge") if await pg.query_selector(".hb-nudge") else ""
    check(("Workout" in nudge or "Meditation" in nudge) and ("3" in nudge or "٣" in nudge), f"[{lang}] the coach line warns about the habit that slipped 3 days: {nudge[:70]}")
    top = await pg.evaluate("document.querySelectorAll('.hb-top li').length")
    check(top == 10, f"[{lang}] top habits ranked with percentages ({top})")
    await pg.screenshot(path=f"{OUT}/hb_week_{lang}.png", full_page=True)
    # month view
    await pg.click("[data-v=month]"); await pg.wait_for_timeout(300)
    mcols = await pg.evaluate("document.querySelectorAll('.hb-grid thead th').length - 2")
    check(mcols >= 28, f"[{lang}] month view: the whole month like the 'Self-upgrading OS' sheet ({mcols} days)")
    await pg.screenshot(path=f"{OUT}/hb_month_{lang}.png")
    await pg.click("[data-v=week]"); await pg.wait_for_timeout(200)
    # add a habit with the editor
    await pg.click("#hb-add"); await pg.fill("#hd-n", "📖 Read a book"); await pg.fill("#hd-t", "5 pages"); await pg.click(".hb-dlg button[type=submit]"); await pg.wait_for_timeout(300)
    n = await pg.evaluate("JundHabits.all().length")
    check(n == 11, f"[{lang}] + Habit adds one with a target ({n})")
    # the coach (AI answer mocked)
    await pg.evaluate(f"JN.callServer = async () => ({{ text: {json.dumps(json.dumps(COACH))} }})")
    prof = await pg.evaluate("JundHabits.profileText()")
    check("Workout" in prof and "streak" in prof and "CALENDAR" in prof, f"[{lang}] the coach is given the record: habits, streaks, weak days, tasks")
    await pg.fill("#hc-goals", "Wake for Fajr daily, finish the semester strong")
    await pg.click("#hc-go"); await pg.wait_for_timeout(500)
    sw = await pg.evaluate("document.querySelectorAll('.hc-swot > div').length")
    gp = await pg.evaluate("document.querySelectorAll('.hc-gap').length")
    txt = await pg.inner_text("#hb-coach")
    check(sw == 4 and gp == 1 and "No weekly review" in txt and "Exam week" in txt, f"[{lang}] the coach shows SWOT, gap analysis, difficulties ahead and what is missing")
    await pg.click("[data-sug='0']"); await pg.wait_for_timeout(300)
    check(await pg.evaluate("JundHabits.all().some(h => h.name === 'Weekly review')"), f"[{lang}] a suggested habit is added in one tap")
    await pg.click("#hc-tasks"); await pg.wait_for_timeout(300)
    k = await pg.evaluate("JundCal.events().filter(e => e.title === 'Sleep by 10 tonight' || e.title === 'Sunday review').length")
    check(k == 2, f"[{lang}] the next steps become tasks, one a day ({k})")
    await pg.evaluate("document.querySelector('#hb-coach').scrollIntoView()"); await pg.wait_for_timeout(200)
    await pg.screenshot(path=f"{OUT}/hb_coach_{lang}.png", full_page=True)
    # the menu
    await pg.evaluate("window.JundDrawer?.open?.()"); await pg.wait_for_timeout(300)
    has = await pg.evaluate("!!document.querySelector('[data-nav-to=habits]')")
    check(has, f"[{lang}] the menu has 'Habit tracker & coach'")
    check(not errs, f"[{lang}] no page errors {errs[:2]}")
    await c.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for lang in ("en", "ar"): await run(b, lang)
        await b.close()
    print("ALL PASS" if not fails else f"{len(fails)} FAILED")
    sys.exit(1 if fails else 0)
asyncio.run(main())
