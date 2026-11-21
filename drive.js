/* Mustatar — Google Drive, both ways, without any extra account or subscription:
   • Save to Drive: the file goes to the phone's share list, where "Drive" (Save to Drive) is one tap; on a computer
     it is downloaded and Drive opens, to drop it in.
   • From Drive: paste the Drive or Google Docs link (it must be shared "Anyone with the link"), or Choose files →
     Drive (a Google Doc must first be downloaded as Word: File → Download → .docx). */
(() => {
'use strict';
const J = window.JN; if (!J) return;
const AR = () => window.ZadLang === 'ar';
const L = (en, ar) => AR() ? ar : en;
const $ = (s, r = document) => r.querySelector(s);
async function save(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      window.JundCal?.toast(L('Choose “Drive” (Save to Drive) in the list', 'اختر «Drive» (الحفظ في Drive) من القائمة'), 4000);
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) { if (e.name === 'AbortError') return false; }
  // a computer: download it, and open Drive in a new tab to drop it in
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener');
  window.JundCal?.toast(L('Downloaded. Drag it into the Drive tab that just opened.', 'نُزّل الملف. اسحبه إلى صفحة Drive التي فُتحت.'), 6000);
  return true;
}
function help() {
  let d = $('#dv-dlg'); d?.remove();
  d = document.createElement('dialog'); d.id = 'dv-dlg'; d.className = 'al-dlg'; d.setAttribute('data-noi18n', ''); d.dir = AR() ? 'rtl' : 'ltr';
  d.innerHTML = `<div class="row-between"><b class="card-h" style="margin:0">Google Drive</b><button type="button" class="icon-btn" id="dv-x" aria-label="${L('Close', 'إغلاق')}">✕</button></div>
    <div class="dv-sec"><b>${L('Save from Mustatar to Drive', 'الحفظ من مستطر إلى Drive')}</b><ol>
      <li>${L('In a note (My notes): ⋮ → Save to Google Drive. For notes and lessons: Share / Send.', 'في الملاحظة (ملاحظاتي): ⋮ ← احفظها في Google Drive. وللملاحظات والدروس: مشاركة / إرسال.')}</li>
      <li>${L('In the list that opens, tap “Drive” (Save to Drive), pick the folder, then Save.', 'في القائمة التي تظهر اضغط «Drive» (الحفظ في Drive)، واختر المجلد، ثم حفظ.')}</li>
      <li>${L('No “Drive” in the list? Install the Google Drive app and sign in once.', 'لا يظهر «Drive» في القائمة؟ ثبّت تطبيق Google Drive وسجّل الدخول مرة واحدة.')}</li></ol></div>
    <div class="dv-sec"><b>${L('Bring from Drive into Mustatar', 'الإحضار من Drive إلى مستطر')}</b><ol>
      <li>${L('In Drive: ⋮ on the file → Share → General access: “Anyone with the link” → Copy link.', 'في Drive: ⋮ على الملف ← مشاركة ← الوصول العام: «أي شخص لديه الرابط» ← نسخ الرابط.')}</li>
      <li>${L('In Mustatar: ＋ → Paste a link, and paste it. Recordings, videos, PDFs and Google Docs all work.', 'في مستطر: ＋ ← الصق رابطًا، والصقه. التسجيلات والفيديو وPDF ومستندات Google كلها تعمل.')}</li>
      <li>${L('Or: Choose files → Drive. A Google Doc must first be downloaded as Word (File → Download → .docx).', 'أو: اختر الملفات ← Drive. مستند Google يُنزّل أولًا بصيغة Word (ملف ← تنزيل ← ‎.docx).')}</li></ol></div>
    <button type="button" class="primary" style="width:100%" id="dv-link">${L('Paste a Drive link now', 'الصق رابط Drive الآن')}</button>`;
  document.body.appendChild(d); d.addEventListener('close', () => d.remove()); d.showModal();
  $('#dv-x', d).onclick = () => d.close();
  $('#dv-link', d).onclick = () => { d.close(); J.show('new'); setTimeout(() => $('#yt')?.focus(), 80); };
}
window.JundDrive = { save, help };
})();
