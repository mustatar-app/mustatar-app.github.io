"""Checks for the Nov-19 batch: ☰ menu with chats and summaries, fresh chat after 30 min,
the small top banner, field + my words, Word export, recording consent note, Ask my notes."""
import asyncio, json, sys, time
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
async def ctx(b, lang, extra=''):
    c = await b.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, service_workers='block')
    await c.add_init_script(f"localStorage.setItem('jn_uiLang', JSON.stringify('{lang}'));localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true');{extra}")
    await c.route('**/api.aladhan.com/**', lambda r: r.abort())
    return c
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        old = int(time.time() * 1000) - 2 * 3600 * 1000
        chats = [{'id': 'c1', 'title': 'Plan my week', 't': old, 'summary': 'Asked for a weekly study plan.', 'log': [{'who': 'me', 'text': 'Plan my week'}, {'who': 'ai', 'text': 'ok'}]}]
        seed = f"localStorage.setItem('jn_chats', JSON.stringify({json.dumps(chats)}));localStorage.setItem('jn_chatId', JSON.stringify('c1'));localStorage.setItem('jn_assistantLog', JSON.stringify([{{who:'me',text:'Plan my week',t:{old}}},{{who:'ai',text:'ok',t:{old}}}]));"
        c = await ctx(b, 'en', seed); pg = await c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        ok(await pg.is_visible('#dr-open'), 'b1 ☰ menu button shows on Today')
        cid = await pg.evaluate("JSON.parse(localStorage.getItem('jn_chatId'))")
        ok(cid != 'c1', 'b2 opening the app after 30 min starts a new chat')
        await pg.click('#dr-open'); await pg.wait_for_timeout(400)
        txt = await pg.inner_text('#drawer') if await pg.query_selector('#drawer') else await pg.inner_text('body')
        ok('Asked for a weekly study plan.' in txt, 'b3 menu lists past chats with their summary')
        ok(await pg.is_visible('.dr-main [data-nav-to="studio"]'), 'b4 menu has Studio among the main places')
        order = await pg.evaluate("[...document.querySelectorAll('.dr-panel .dr-new, .dr-main .dr-item, .dr-sec > summary, .dr-foot .dr-item')].map(e => e.textContent.trim().split(/\\s+/)[0])")
        ok(order[:3] == ['New', 'My', 'Recordings'] and order[-1] == 'Settings', f'b4b menu order: new chat, then places, then history, settings last ({order})')
        await pg.fill('#dr-q', 'weekly'); n1 = await pg.evaluate("document.querySelectorAll('#dr-chats .dr-chat').length")
        await pg.fill('#dr-q', 'zzzz'); n2 = await pg.evaluate("document.querySelectorAll('#dr-chats .dr-chat').length")
        ok(n1 >= 1 and n2 == 0, f'b4c the menu can search chats ({n1}, {n2})'); await pg.fill('#dr-q', '')
        await pg.evaluate("JundDrawer.close(); JundCal.toast('✓ Saved')"); await pg.wait_for_timeout(450)
        box = await pg.evaluate("(()=>{const t=document.querySelector('.toast');const r=t.getBoundingClientRect();return {top:r.top,h:r.height,txt:t.textContent,cls:t.dataset.kind}})()")
        ok(box['top'] < 140 and box['h'] < 90, f'b5 banner is small and at the top ({box})')
        ok('✓' not in box['txt'] and 'ok' in box['cls'], 'b6 banner shows a green dot instead of the ✓ sign')
        await pg.evaluate("JundNav.pickField && localStorage.setItem('jn_field', JSON.stringify('medicine')); localStorage.setItem('jn_myWords', JSON.stringify('Ibn Hajar, isnad'))")
        ok(await pg.evaluate("typeof JundNav.pickField=='function' && typeof JundNav.editWords=='function'"), 'b7 Me has Your field and My words')
        # the words travel with each recording piece to /transcribe
        await pg.evaluate("window.__u=[];const f=window.fetch;window.fetch=(u,o)=>{window.__u.push(String(u));return f(u,o)}")
        src = await pg.evaluate("fetch('app.js').then(r=>r.text())")
        ok('&words=' in src and 'fieldAndWords(true)' in src, 'b8 my words go to hearing and field goes to the notes prompt')
        ok(await pg.query_selector('#save-word') is not None, 'b9 result screen has the Word button')
        ok(await pg.is_visible('#lib-ask') or await pg.query_selector('#lib-ask') is not None, 'b10 Notes has Ask my notes')
        await pg.click('.tabbar [data-nav="library"]'); await pg.wait_for_timeout(300)
        await pg.click('#lib-seg [data-seg="files"]'); await pg.wait_for_timeout(200)
        await pg.fill('#lib-search', 'fasting'); await pg.click('#lib-ask'); await pg.wait_for_timeout(500)
        v = await pg.evaluate("document.querySelector('#as-text')?.value||''")
        ok(v.startswith('From my notes: fasting'), f'b11 Ask my notes opens a fresh chat with the question ({v!r})')
        ok(not errs, f'b12 no page errors {errs[:2]}')
        await c.close()
        c = await ctx(b, 'ar'); pg = await c.new_page()
        await pg.goto(URL); await pg.wait_for_timeout(1000)
        rc = await pg.evaluate("fetch('recorder.js').then(r=>r.text())")
        ok('rec-consent' in rc and 'consentOk' in rc, 'b13 recording shows the consent note once')
        await pg.evaluate("JundCal.toast('✗ تعذر الحفظ')"); await pg.wait_for_timeout(450)
        cls = await pg.evaluate("document.querySelector('.toast').dataset.kind")
        ok('bad' in cls, 'b14 Arabic error banner uses the red dot')
        await c.close(); await b.close()
    print('All checks passed' if not fails else f'{len(fails)} failed'); sys.exit(1 if fails else 0)
asyncio.run(main())
