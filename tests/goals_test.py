# Goals: add a goal (with why, date, importance), the AI planner adds steps / dated tasks / habits linked to it,
# progress follows them, the priorities matrix, the most important step today, and the assistant can add goals.
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
fails = []
def check(ok, w): print(("PASS " if ok else "FAIL ") + w); (None if ok else fails.append(w))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(service_workers="block", viewport={"width": 412, "height": 900})
        await c.add_init_script("if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.clear(); localStorage.setItem('jn_uiLang', JSON.stringify('ar')); localStorage.setItem('jn_welcomed','true'); localStorage.setItem('jn_opened','true'); }")
        pg = await c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE); await pg.wait_for_timeout(1500)
        await pg.evaluate("JundGoals.open()"); await pg.wait_for_timeout(300)
        check(await pg.is_visible('#screen-goals .gl-empty'), "Goals opens with a clear start")
        today = await pg.evaluate("(() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })()")
        d2 = await pg.evaluate("(() => { const d = new Date(Date.now() + 2 * 864e5), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })()")
        plan = {"milestones": [{"t": "حفظ الجزء الأول (١-٢٠ صفحة)", "date": "2027-01-15"}, {"t": "حفظ الجزء الثاني", "date": "2027-02-10"}],
                "tasks": [{"t": "احفظ صفحتين (٢-٣)", "date": today, "time": "05:30"}, {"t": "احفظ صفحتين (٤-٥)", "date": d2, "time": ""}],
                "habits": [{"t": "مراجعة نصف صفحة بعد الفجر", "time": "05:20"}], "first": "اقرأ الصفحة الأولى ثلاث مرات", "note": "ابدأ صغيرًا وثابر."}
        await pg.evaluate("JN.callServer = async () => ({ stop: 'STOP', text: %s }); 1" % json.dumps(json.dumps(plan, ensure_ascii=False)))
        await pg.click('#gl-new'); await pg.wait_for_timeout(200)
        await pg.fill('#gd-t', 'حفظ سورة البقرة'); await pg.fill('#gd-why', 'لأنها حصن من الشيطان')
        await pg.select_option('#gd-area', 'faith'); await pg.fill('#gd-due', '2027-03-01')
        await pg.click('.gl-dlg label:has(#gd-urg) .switch')
        await pg.click('#gd-s'); await pg.wait_for_timeout(800)
        check(await pg.is_visible('#gp-add'), "a new goal opens the AI planner")
        await pg.click('#gp-add'); await pg.wait_for_timeout(500)
        g = (await pg.evaluate("JundGoals.all()"))[0]
        evs = await pg.evaluate("JundCal.events().filter(e => e.goal === '%s').map(e => e.title)" % g['id'])
        hs = await pg.evaluate("JSON.parse(localStorage.jn_habits || '[]').map(h => h.name)")
        check(len(g['steps']) == 3 and len(evs) == 2 and 'مراجعة نصف صفحة بعد الفجر' in hs and len(g['habitIds']) == 1, f"the plan adds steps, linked calendar tasks and a linked habit ({len(g['steps'])} steps, {evs}, habits {hs})")
        check(g['imp'] and g['urg'], "importance and urgency are kept")
        # most important today = today's linked task
        await pg.evaluate("JundGoals.paint()"); await pg.wait_for_timeout(200)
        frog = await pg.inner_text('.gl-frog')
        check('احفظ صفحتين (٢-٣)' in frog, f"'most important today' shows today's step: {frog!r}")
        await pg.click('#gl-frog-do'); await pg.wait_for_timeout(200)
        p1 = await pg.evaluate("JundGoals.progress(JundGoals.all()[0])")
        check(abs(p1 - 1/5) < 0.01, f"progress follows done tasks and steps ({p1:.2f})")
        # matrix
        await pg.click('.gl-seg [data-v=matrix]'); await pg.wait_for_timeout(200)
        check('حفظ سورة البقرة' in await pg.inner_text('.gl-q.q-do'), "the goal sits in 'Do it now' (important and urgent)")
        await pg.screenshot(path='/tmp/goals-matrix.png')
        await pg.click('.gl-seg [data-v=list]'); await pg.click('.gl-head'); await pg.wait_for_timeout(200)
        await pg.screenshot(path='/tmp/goals.png', full_page=True)
        # the assistant adds a goal
        await pg.evaluate("JN.show('assistant'); JN.callServer = async (o) => { window.__u = o.user; return { stop: 'STOP', text: JSON.stringify({ reply: 'أضفت الهدف', actions: [{ do: 'goal', title: 'قراءة ١٢ كتابًا', due: '2027-12-31', area: 'knowledge', imp: true, urg: false, target: 12, unit: 'كتاب' }] }) }; }; 1")
        await pg.fill('#as-text', 'هدفي أن أقرأ ١٢ كتابًا هذه السنة'); await pg.click('#as-send'); await pg.wait_for_timeout(800)
        gs = await pg.evaluate("JundGoals.all().map(g => g.title + '|' + g.target)")
        check('قراءة ١٢ كتابًا|12' in gs, f"the assistant can add a goal ({gs})")
        check('GOALS (id | title' in (await pg.evaluate("window.__u")), "the assistant is told his goals")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
asyncio.run(main())
raise SystemExit(1 if fails else 0)
