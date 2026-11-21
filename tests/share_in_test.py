# Sharing several notes at once from Samsung Notes (as Word files) into the phone app
import asyncio, io, zipfile
from playwright.async_api import async_playwright
def docx(t):
    b=io.BytesIO(); z=zipfile.ZipFile(b,'w')
    z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
    z.writestr('word/document.xml',f'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{t}</w:t></w:r></w:p></w:body></w:document>')
    z.close(); return b.getvalue()
import sys
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
async def m():
  async with async_playwright() as p:
    b=await p.chromium.launch(); c=await b.new_context(service_workers="block")
    await c.add_init_script("localStorage.setItem('jn_uiLang','\"ar\"');localStorage.setItem('jn_welcomed','true');localStorage.setItem('jn_opened','true'); window.MustatarAndroid={postMessage:()=>{},addEventListener:()=>{}};")
    files={}
    for i,t in enumerate(['درس الفقه الأول','موعد مع الشيخ']): files[f'/__mustatar_share/0000000{i}-0000-0000-0000-000000000000']=docx(t)
    async def route(r):
      body=files.get(r.request.url.split('/__mustatar_share/')[0] and '/__mustatar_share/' + r.request.url.split('/__mustatar_share/')[1]); await r.fulfill(body=body, content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    await c.route('**/__mustatar_share/**', route)
    pg=await c.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1500)
    k=list(files)
    await pg.evaluate(f"JundNativeShare(null, '{k[0]}', 'Note 1.docx', [['{k[1]}','Note 2.docx']])"); await pg.wait_for_timeout(2500)
    texts = await pg.evaluate("JundKeep.all().then(a=>a.map(n=>n.text))")
    ok = sorted(texts) == sorted(['درس الفقه الأول', 'موعد مع الشيخ']) and not errs
    print(("PASS" if ok else "FAIL") + " two Samsung notes shared at once as Word go straight into My notes", texts, errs)
    await b.close()
    raise SystemExit(0 if ok else 1)
asyncio.run(m())
