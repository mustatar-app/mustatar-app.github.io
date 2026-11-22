/* Mustatar — Arabic interface. Every label the app shows is looked up here and shown in Arabic, right to left.
   Notes, lesson names and anything the person writes are never touched. */
(() => {
'use strict';
const KEY = 'jn_uiLang';
let lang; try { lang = JSON.parse(localStorage.getItem(KEY)); } catch {}
if (!lang) lang = /^ar/i.test(navigator.language || '') ? 'ar' : 'en';
window.ZadLang = lang;
if (lang !== 'ar') return;
document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl';

const T = {
"Background": "الخلفية",
"On the Today screen": "في شاشة «اليوم»",
"Save to Google Drive": "احفظ في Google Drive",
"Text size": "حجم النص", "Mustatar · مستطر — the size of the words in the whole app": "مستطر — حجم الكلمات في التطبيق كله",
"Reminders": "التذكيرات",
"What is coming — exams, homework, projects and tasks (your daily classes are left out). Mustatar reminds you here, and plans study time in the free gaps of your timetable.": "ما هو قادم — الاختبارات والواجبات والمشاريع والمهام (دروسك اليومية غير مذكورة هنا). يذكّرك مستطر هنا، ويخطط وقت المذاكرة في الفراغات بين دروسك.",
"Coming up": "القادم",
"Nothing coming in the next 30 days. Tell the assistant about an exam, homework or project and it appears here.": "لا شيء قادم في الثلاثين يومًا القادمة. أخبر المساعد عن اختبار أو واجب أو مشروع وسيظهر هنا.",
"Add these to my calendar": "أضف هذه إلى تقويمي",
"Free times in your timetable:": "أوقات فراغ في جدولك:",
"Missed": "فاتت",
"No free time found before it — try fewer classes or add it yourself.": "لم أجد وقت فراغ قبله — جرّب دروسًا أقل أو أضفه بنفسك.",
"Not now": "ليس الآن",
"Plan study time": "خطط وقت المذاكرة",
"✓ Study time planned": "✓ خُطط وقت المذاكرة",
"Done": "تم",
"Left to do": "ما تبقّى",
"Where you stopped, and everything still pending.": "أين توقفت، وكل ما لم يُنجز بعد.",
"Where I stopped": "أين توقفت",
"Nothing saved. When you stop in the middle of something, write it here so you can pick it up later.": "لا شيء محفوظ. إذا توقفت في منتصف عمل فاكتبه هنا لتكمله لاحقًا.",
"Save where I stopped": "احفظ أين توقفت",
"No missed tasks. ✓": "لا مهام فائتة. ✓",
"All recordings are transcribed. ✓": "كل التسجيلات مكتوبة. ✓",
"Open Recordings": "افتح التسجيلات",
"Still open today": "ما زال مفتوحًا اليوم",
"What were you doing? (e.g. Revising Ayat al-Ahkam)": "ماذا كنت تعمل؟ (مثال: مراجعة آيات الأحكام)",
"Where did you stop? (e.g. verse 255, page 40)": "أين توقفت؟ (مثال: الآية ٢٥٥، صفحة ٤٠)",
"What is next? (optional)": "ما التالي؟ (اختياري)",
"Recordings & meetings": "التسجيلات والاجتماعات",
"Every recording is saved here as a dated text copy. The sound is deleted as soon as its text is ready, unless you tick “Keep the audio”.": "كل تسجيل يُحفظ هنا نسخةً نصية بتاريخها. يُحذف الصوت بمجرد جاهزية نصه، إلا إذا اخترت «احتفظ بالصوت».",
"● Record a meeting or class": "● سجّل اجتماعًا أو درسًا",
"＋ Add a file": "＋ أضف ملفًا",
"Copy text": "انسخ النص",
"Delete": "حذف",
"Finish and transcribe": "أنهِ واكتب النص",
"It is being transcribed now. You can leave this screen; it carries on.": "يُكتب نصه الآن. يمكنك مغادرة هذه الشاشة؛ يستمر العمل.",
"Make notes / minutes": "اكتب الملاحظات / المحضر",
"See progress": "اعرض التقدم",
"The app closed while recording. The sound is saved — finish it to transcribe.": "أُغلق التطبيق أثناء التسجيل. الصوت محفوظ — أنهِه لتُكتب نصوصه.",
"Transcribe now": "اكتب النص الآن",
"▶ Listen": "▶ استمع",
"⤓ Save text (.txt)": "⤓ احفظ النص (.txt)",
"No recordings yet. Record a class or a meeting, or add an audio file.": "لا تسجيلات بعد. سجّل درسًا أو اجتماعًا، أو أضف ملفًا صوتيًا.",
"Widget style": "شكل الأداة",
"Transparent (white text)": "شفاف (نص أبيض)",
"Dark": "داكن",
"Black": "أسود",
"White": "أبيض",
"Your subjects or projects appear here after you make your first notes. Each gets its own colour.": "تظهر موادك أو مشاريعك هنا بعد أول ملاحظات تكتبها، ولكل واحدة لونها.",
"e.g. Arabic, English, Urdu": "مثال: العربية، الإنجليزية، الأردية",
"Other — I'll describe it…": "غير ذلك — سأصفه…",
"Other": "أخرى",
"New project or area…": "مشروع أو مجال جديد…",
"Correct the transcript first (fixes mishearings — better notes)": "صحّح النص أولًا (يصلح ما أُسيء سماعه — ملاحظات أفضل)",
"Make the notes by itself when the transcription is ready": "اكتب الملاحظات تلقائيًا عند جاهزية النص",
"Nothing learned yet from how you use the app.": "لم يتعلّم شيئًا بعد من طريقة استخدامك.",
'Privacy: what is kept, where, and how to delete it': 'الخصوصية: ماذا يُحفظ، وأين، وكيف تحذفه',
'About me': 'عني', 'Your tools': 'أدواتك', 'Languages you speak or record in': 'اللغات التي تتكلم أو تسجّل بها', 'Your usual working or study hours': 'ساعات عملك أو مذاكرتك المعتادة', 'to': 'إلى',
'What is hardest for you? (choose any)': 'ما أصعب شيء عليك؟ (اختر ما شئت)', 'What Mustatar has learned about you': 'ما تعلّمه مستطر عنك',
'Let Mustatar learn from how I use it, to suggest what fits me': 'اسمح لمستطر أن يتعلّم من استخدامي ليقترح ما يناسبني',
'This stays in your own space. It is never sold and never used to train any AI.': 'يبقى هذا في مساحتك الخاصة، ولا يُباع ولا يُستخدم لتدريب أي ذكاء اصطناعي.',
'Forget what Mustatar learned': 'انسَ ما تعلّمه مستطر', 'Show only the tools you use. You can switch any of them back on at any time.': 'أظهر الأدوات التي تستخدمها فقط، ويمكنك إعادة تفعيل أي منها متى شئت.',
'Forgetting tasks': 'نسيان المهام', 'Too many meetings': 'كثرة الاجتماعات', 'Getting started': 'البدء في العمل', 'Staying focused': 'التركيز', 'Keeping habits': 'الاستمرار على العادات', 'Revising and memorising': 'المراجعة والحفظ', 'Keeping notes organised': 'ترتيب الملاحظات',
'Habit tracker': 'متابعة العادات', 'Prayer times': 'أوقات الصلاة', 'Study tools (flashcards, quizzes, exams)': 'أدوات المذاكرة (بطاقات، اختبارات، امتحانات)', 'Recordings and meetings': 'التسجيلات والاجتماعات', 'Studio (text on photos and videos)': 'الاستوديو (نص على الصور والفيديو)',
'Your account': 'حسابك', 'Your name': 'اسمك', 'Create my account': 'أنشئ حسابي', 'I already have an account': 'لدي حساب',
'Sign in to keep your notes, calendar and habits in your own private space. They come back on any phone, and nobody else can see them. No password: your fingerprint or face is the key (a passkey).': 'سجّل الدخول لتُحفظ ملاحظاتك وتقويمك وعاداتك في مساحتك الخاصة. تعود إليك على أي جوال، ولا يراها أحد غيرك. بلا كلمة مرور: بصمتك أو وجهك هو المفتاح (مفتاح مرور).',
'Signed in as': 'مسجّل الدخول باسم', 'Your notes are kept in your own private space.': 'ملاحظاتك محفوظة في مساحتك الخاصة.',
'Sync now': 'زامِن الآن', 'Add a passkey for another phone': 'أضف مفتاح مرور لجوال آخر', 'Sign out': 'تسجيل الخروج', 'Delete my data': 'احذف بياناتي',
'This removes your account and everything in your private space, for good. Notes on this phone stay until you remove them.': 'يحذف هذا حسابك وكل ما في مساحتك الخاصة نهائيًا. تبقى الملاحظات على هذا الجوال حتى تحذفها.',
'Delete my account and data': 'احذف حسابي وبياناتي',
'+ Add': '+ إضافة', '+ Add text': '+ إضافة نص', '+ New notes': '+ ملاحظات جديدة', '+ habit': '+ عادة',
'1 day before': 'قبل يوم', '1 hour before': 'قبل ساعة', '10 min before': 'قبل ١٠ دقائق', '10 minutes before': 'قبل ١٠ دقائق', '30 min before': 'قبل ٣٠ دقيقة', '30 minutes before': 'قبل ٣٠ دقيقة',
'1 · Add what you heard or read': '١ · أضف ما سمعته أو قرأته', '2 · Details': '٢ · التفاصيل', '25 min': '٢٥ دقيقة', '45 min': '٤٥ دقيقة', '60 min': '٦٠ دقيقة',
'A book passage or topic': 'مقطع من كتاب أو موضوع', 'AI on my phone — trial, weaker': 'ذكاء على جوالي — تجريبي وأضعف',
'About you': 'عنك', 'Add': 'إضافة', 'Add something': 'أضف شيئًا', 'Add what you memorise; the app brings it back after 1, 3, 7, 14, 30 and 60 days.': 'أضف ما تحفظه، ويعيده لك التطبيق بعد ١ و٣ و٧ و١٤ و٣٠ و٦٠ يومًا.',
'Allow reminders on this phone': 'السماح بالتنبيهات على هذا الجوال', 'Always on the phone (private, slower)': 'دائمًا على الجوال (خاص وأبطأ)',
'Amiri — classic': 'أميري — كلاسيكي', 'Another': 'أخرى', 'Another subject…': 'مادة أخرى…', 'Appearance': 'المظهر', 'Arabic': 'العربية', 'Arabic font in notes': 'الخط العربي في الملاحظات',
'Ask for a change or a question': 'اطلب تعديلًا أو اسأل سؤالًا', 'Audio, video, photos of pages, PDF or text': 'صوت، فيديو، صور صفحات، PDF أو نص', 'Automatic — same as the lesson': 'تلقائي — بلغة الدرس',
'Background colour': 'لون الخلفية', 'Backup file': 'ملف النسخة الاحتياطية', 'Best in Arabic (Opus) — about 2 SAR a lesson': 'الأفضل في العربية (Opus) — نحو ٢ ريال للدرس', 'Better Arabic — about 250 MB, slower': 'عربية أفضل — نحو ٢٥٠ م.ب، أبطأ',
'Board': 'اللوحة', 'Calendar': 'التقويم', 'Calendar and reminders': 'التقويم والتنبيهات', 'Cancel': 'إلغاء', 'Captions you save, and the ones from post ideas, appear here.': 'تظهر هنا التعليقات التي تحفظها وتعليقات أفكار المنشورات.',
'Carousel': 'كاروسيل', 'Centre': 'وسط', 'Check report': 'تقرير المراجعة', 'Check the server': 'فحص الخادم', 'Choose files': 'اختر الملفات', 'City': 'المدينة', 'Class': 'درس', 'Classic': 'كلاسيكي',
'Claude key': 'مفتاح Claude', 'Claude — with my paid key': 'Claude — بمفتاحي المدفوع', 'Clean script': 'نص مرتب', 'Close': 'إغلاق', 'Colour': 'اللون', 'Coming up': 'القادم',
'Compatibility mode (if the AI stops while writing)': 'وضع التوافق (إذا توقف الذكاء أثناء الكتابة)', 'Connect widget': 'ربط الأداة', 'Connect widget (older app versions)': 'ربط الأداة (للإصدارات القديمة)', 'Drag “today”, “next prayer”, “month”, “my day” or “reminder” onto the screen.': 'اسحب «اليوم» أو «الصلاة القادمة» أو «الشهر» أو «يومي» أو «التذكير» إلى الشاشة.', 'Copy': 'نسخ', 'Dammam': 'الدمام', 'Dark blue': 'أزرق داكن',
'Date': 'التاريخ', 'Default notes language': 'لغة الملاحظات الافتراضية', 'Default reminder': 'التنبيه الافتراضي', 'Delete': 'حذف', 'Details': 'التفاصيل', 'Discard': 'تجاهل', 'Doing': 'قيد العمل', 'Done': 'تم',
'Download for offline use': 'تنزيل للعمل بلا إنترنت', 'Download the AI to my phone': 'تنزيل الذكاء إلى جوالي', 'Drafts': 'المسودات', 'Drag “prayer and tasks” or “next prayer” onto the screen.': 'اسحب «الصلاة والمهام» أو «الصلاة القادمة» إلى الشاشة.',
'Editing…': 'يعدّل…', 'Elegant': 'أنيق', 'Empty': 'فارغ', 'End': 'نهاية', 'English': 'الإنجليزية', 'Every week': 'كل أسبوع', 'Exam': 'اختبار',
'Everyone without a key shares one free daily limit. Add your own free key and you get your own limit. It takes 2 minutes: open': 'كل من ليس عنده مفتاح يتشارك حدًّا يوميًا مجانيًا واحدًا. أضف مفتاحك المجاني ليكون لك حدّك الخاص. يأخذ دقيقتين: افتح',
', sign in with Google, press “Create API key”, copy it and paste it here.': '، وسجّل الدخول بحساب Google، واضغط «Create API key»، ثم انسخه والصقه هنا.',
'Fast — about 2.5 GB': 'سريع — نحو ٢٫٥ غ.ب', 'Fast — about 80 MB': 'سريع — نحو ٨٠ م.ب', 'Find homework, exams and deadlines in lessons and offer to add them to the calendar': 'استخراج الواجبات والاختبارات والمواعيد من الدروس واقتراح إضافتها إلى التقويم',
'Focus': 'تركيز', 'Focus timer': 'مؤقت التركيز', 'Font': 'الخط', 'Free': 'فارغ', 'Full name in Arabic (for book covers)': 'الاسم الكامل بالعربية (لأغلفة الكتب)', 'Gemini key': 'مفتاح Gemini', 'Get ideas': 'هات أفكارًا',
'GitHub key (saves your lessons in your private storage)': 'مفتاح GitHub (يحفظ دروسك في مخزنك الخاص)', 'Good and cheaper (Sonnet) — about 1 SAR a lesson': 'جيد وأرخص (Sonnet) — نحو ١ ريال للدرس',
'Good evening': 'مساء الخير', 'Good morning': 'صباح الخير', 'Salam': 'السلام عليكم', 'Handwritten': 'خط يد', 'Heavy': 'عريض', 'Hide': 'إخفاء', 'Hold to compare': 'اضغط مطولًا للمقارنة', 'Home': 'الرئيسية',
'Home-screen widgets (Android app)': 'أدوات الشاشة الرئيسية (تطبيق أندرويد)', 'Homework': 'واجب', 'How long?': 'كم المدة؟', 'I use the app for': 'أستخدم التطبيق في',
'Ideas for your page from what you studied this week. Tap “Use” to put the hook on the picture.': 'أفكار لصفحتك مما درسته هذا الأسبوع. اضغط «استخدم» لوضع العبارة على الصورة.',
'Jeddah': 'جدة', 'Keep a copy in Google Drive now and then, especially before changing phones. It includes your calendar.': 'احتفظ بنسخة في Google Drive بين حين وآخر، خاصة قبل تغيير الجوال. تشمل تقويمك.',
'Keep the app open and the screen on until it finishes.': 'أبقِ التطبيق مفتوحًا والشاشة مضاءة حتى ينتهي.', 'Kufi': 'كوفي', 'Lesson or meeting recording': 'تسجيل درس أو اجتماع', 'Lesson or unit': 'الدرس أو الوحدة',
'Light': 'فاتح', 'Light — about 1.5 GB, weaker': 'خفيف — نحو ١٫٥ غ.ب، أضعف', 'Loading prayer times…': 'تحميل أوقات الصلاة…', 'Long-press an empty spot on your home screen →': 'اضغط مطولًا على مكان فارغ في الشاشة الرئيسية ←',
'Look': 'الشكل', 'Madinah': 'المدينة المنورة', 'Main': 'الرئيسية', 'Make my year book': 'اصنع كتاب سنتي', 'Make notes': 'اصنع الملاحظات', 'Make the carousel': 'اصنع الكاروسيل', 'Making the video…': 'يصنع الفيديو…',
'Makkah': 'مكة المكرمة', 'My location': 'موقعي', 'Madinah': 'المدينة المنورة', 'Jeddah': 'جدة', 'Riyadh': 'الرياض', 'Taif': 'الطائف', 'Dammam': 'الدمام', 'Meeting': 'اجتماع', 'Meeting recording → minutes': 'تسجيل اجتماع ← محضر', 'Meeting minutes': 'محضر الاجتماع', 'Memorisation': 'الحفظ', 'Message Mustatar…': 'اكتب إلى مستطر…', 'Mind map': 'خريطة ذهنية',
'Model': 'النموذج', 'Modern': 'حديث', 'Month': 'شهر', 'Naskh': 'نسخ', 'Neon': 'نيون', 'New': 'جديد', 'New chat': 'محادثة جديدة', 'Search notes': 'ابحث في الملاحظات', 'New item': 'عنصر جديد', 'Edit item': 'تعديل العنصر', 'New notes': 'ملاحظات جديدة',
'Next month': 'الشهر التالي', 'Previous month': 'الشهر السابق', 'No lessons yet.': 'لا توجد دروس بعد.', 'No reminder': 'بلا تنبيه', 'No text yet. Tap “+ Add text”.': 'لا نص بعد. اضغط «+ إضافة نص».', 'None': 'لا شيء',
'Not downloaded yet. Best on Wi-Fi. After that, transcription works with no internet.': 'لم يُنزَّل بعد. الأفضل على الواي فاي. بعدها يعمل التفريغ بلا إنترنت.',
'Notes': 'الملاحظات', 'Notes I wrote myself': 'ملاحظات كتبتها بنفسي', 'Notes language': 'لغة الملاحظات', 'Nothing coming up. Tell me below, e.g. “exam on Tuesday at 9”.': 'لا شيء قادم. أخبرني بالأسفل، مثل: «اختبار يوم الثلاثاء الساعة ٩».',
'Nothing in the next two weeks.': 'لا شيء في الأسبوعين القادمين.', 'Nothing on this day.': 'لا شيء في هذا اليوم.', 'Nothing yet.': 'لا شيء بعد.', 'Nothing planned this week yet. Tap': 'لم تخطط لشيء هذا الأسبوع بعد. اضغط',
', or let the app find homework and exams in your lessons.': '، أو دع التطبيق يستخرج الواجبات والاختبارات من دروسك.',
'Notifications are blocked. Allow them for this app in your phone settings.': 'التنبيهات محظورة. اسمح بها لهذا التطبيق من إعدادات الجوال.', 'Offline transcription': 'التفريغ بلا إنترنت',
'Once': 'مرة واحدة', 'One slide per paragraph (leave an empty line between slides). Each slide uses the look, font, colour and background chosen above.': 'شريحة لكل فقرة (اترك سطرًا فارغًا بين الشرائح). كل شريحة تأخذ الشكل والخط واللون والخلفية المختارة بالأعلى.',
'One step first:': 'خطوة واحدة أولًا:', 'Only when there is no internet': 'فقط عند انقطاع الإنترنت', 'Open Settings → About you': 'افتح الإعدادات ← عنك', 'Open in email': 'افتح في البريد', 'Or paste text': 'أو الصق نصًا',
'Outline': 'محدد', 'Paste a transcript, your own notes, or a passage': 'الصق تفريغًا أو ملاحظاتك أو مقطعًا', 'Paste a video or playlist link': 'الصق رابط فيديو أو قائمة تشغيل', 'Pause': 'إيقاف مؤقت', 'Resume': 'استئناف',
'Phone AI size': 'حجم ذكاء الجوال', 'Photo or video': 'صورة أو فيديو', 'Plan an exam': 'خطط لاختبار', 'Post 4:5': 'منشور ٤:٥', 'Post ideas': 'أفكار منشورات', 'Post ideas from your notes': 'أفكار منشورات من ملاحظاتك',
'Prayer times': 'أوقات الصلاة', 'Prayer times will show here.': 'ستظهر أوقات الصلاة هنا.', 'Preparing the book…': 'يجهّز الكتاب…', 'Project (optional)': 'المشروع (اختياري)', 'Quality': 'الجودة', 'Record': 'تسجيل',
'Recording': 'التسجيل', 'Recordings': 'التسجيلات', 'Reminder': 'التنبيه', 'Reminders book for all subjects': 'كتاب المواعظ لكل المواد', 'Remove': 'إزالة', 'Remove photo': 'إزالة الصورة', 'Remove the AI from the phone': 'حذف الذكاء من الجوال',
'Repeat': 'التكرار', 'Restore from a backup': 'الاسترجاع من نسخة احتياطية', 'Riyadh': 'الرياض', 'Taif': 'الطائف', 'Save': 'حفظ', 'Save PDF': 'حفظ PDF', 'Save a backup': 'حفظ نسخة احتياطية', 'Save and connect': 'حفظ وربط',
'Save as text file': 'حفظ كملف نصي', 'Save caption': 'حفظ التعليق', 'Save draft': 'حفظ مسودة', 'Save image': 'حفظ الصورة', 'Save video': 'حفظ الفيديو', 'Saved captions — tap to copy': 'التعليقات المحفوظة — اضغط للنسخ',
'Saved texts — tap to use': 'النصوص المحفوظة — اضغط للاستخدام', 'Saving and backup': 'الحفظ والنسخ الاحتياطي', 'Scheherazade New — clearer and larger': 'شهرزاد — أوضح وأكبر', 'Search your notes': 'ابحث في ملاحظاتك',
'Send': 'إرسال', 'Send a test reminder': 'إرسال تنبيه تجريبي', 'Server': 'الخادم', 'Settings': 'الإعدادات', 'Share': 'مشاركة', 'Show': 'إظهار',
'Show the daily reminder (Quran verse and words of the scholars) on Home': 'إظهار التذكير اليومي (آية وكلام أهل العلم) في الرئيسية', 'Show the next prayer and your upcoming tasks on your home screen.': 'اعرض الصلاة القادمة ومهامك القادمة على شاشتك الرئيسية.',
'Size': 'الحجم', 'Soft box': 'خلفية شفافة', 'Speak': 'تحدث', 'Spent so far': 'المصروف حتى الآن', 'Square': 'مربع', 'Start': 'بداية', 'Start focus timer': 'ابدأ مؤقت التركيز', 'Stop': 'إيقاف',
'Stop and make notes': 'أوقف واصنع الملاحظات', 'Stop and save': 'أوقف واحفظ', 'Story 9:16': 'ستوري ٩:١٦', 'Strong box': 'خلفية بارزة', 'Stronger — about 5 GB, slower': 'أقوى — نحو ٥ غ.ب، أبطأ', 'Studio': 'الاستوديو',
'Study file': 'ملف المذاكرة', 'Study time': 'وقت مذاكرة', 'Study — lessons, subjects, exams': 'الدراسة — دروس ومواد واختبارات', 'Subject': 'المادة', 'Subject colours': 'ألوان المواد', 'Subject name': 'اسم المادة',
'Tap': 'اضغط', 'Tap a card to move it: To do → Doing → Done.': 'اضغط البطاقة لتنقلها: للعمل ← قيد العمل ← تم.', 'Tap “Save draft” to keep your work and finish it later.': 'اضغط «حفظ مسودة» لتحفظ عملك وتكمله لاحقًا.', 'Task': 'مهمة',
'Tell the app your name, and whether you use it for study or work, so everything fits you.': 'أخبر التطبيق باسمك، وهل تستخدمه للدراسة أم للعمل، ليناسبك كل شيء.', 'Test the key': 'اختبر المفتاح', 'Test the phone AI': 'اختبر ذكاء الجوال',
'Text': 'النص', 'Texts on the picture': 'النصوص على الصورة', 'Texts you save appear here. Next time, one tap puts the same text and look back.': 'تظهر هنا النصوص التي تحفظها. في المرة القادمة تعيدها بضغطة واحدة بالشكل نفسه.',
'The Assistant and your notes use this, so they fit you.': 'يستخدم المساعد وملاحظاتك هذا ليناسبوك.', "The app's server — free, no keys": 'خادم التطبيق — مجاني وبلا مفاتيح', 'The first notes you make will appear here.': 'ستظهر هنا أول ملاحظات تصنعها.',
'The key stays on this phone and is only sent to Anthropic when notes are made.': 'يبقى المفتاح على هذا الجوال، ولا يُرسل إلا إلى Anthropic عند صنع الملاحظات.', 'Theme': 'السمة', 'Time': 'الوقت', 'Timetable': 'الجدول', 'Title': 'العنوان',
'To do': 'للعمل', 'Today': 'اليوم', 'Me': 'أنا', 'Word': 'وورد', 'My notes': 'ملاحظاتي', 'Note': 'ملاحظة', 'Lessons and files': 'الدروس والملفات', '✦ Ask my notes': '✦ اسأل ملاحظاتي', 'Ask Mustatar': 'اسأل مستطر', 'Reminders': 'التذكيرات', 'Tomorrow': 'غدًا', 'Yesterday': 'أمس', 'Overdue': 'متأخر', 'Trim the video': 'قص الفيديو', 'Type': 'النوع', 'Type the subject': 'اكتب المادة', 'Typewriter': 'آلة كاتبة', 'Up next': 'القادم',
'Upload': 'رفع', 'Use in Studio': 'استخدم في الاستوديو', 'Use my location': 'استخدم موقعي', 'Week starts on': 'بداية الأسبوع', 'Welcome!': 'أهلًا بك!', 'What are you working on?': 'على ماذا تعمل؟',
'What did you memorise today? e.g. Surah al-Mulk 1–10': 'ماذا حفظت اليوم؟ مثل: سورة الملك ١–١٠', 'What do I have this week?': 'ما الذي عندي هذا الأسبوع؟', 'What is it?': 'ما هو؟', 'When to use it': 'متى يُستخدم',
'Where I am now (location)': 'مكاني الآن (الموقع)', 'Where and what you study': 'أين وماذا تدرس', 'Who does it (optional)': 'من يقوم به (اختياري)', 'Who writes the notes?': 'من يكتب الملاحظات؟', 'Widgets': 'الأدوات',
'With this key every lesson is saved in jund-notes-data, so it comes back on any phone.': 'بهذا المفتاح يُحفظ كل درس في مخزنك الخاص، فيعود على أي جوال.', 'Work — meetings, projects, tasks': 'العمل — اجتماعات ومشاريع ومهام',
'Write a caption or hashtags to keep': 'اكتب تعليقًا أو وسومًا لحفظها', 'Write in Arabic or English — then drag it on the picture': 'اكتب بالعربية أو الإنجليزية — ثم اسحبه على الصورة', 'Write my weekly report': 'اكتب تقريري الأسبوعي',
'Write slides from my last note': 'اكتب الشرائح من آخر ملاحظة', 'Writing…': 'يكتب…', 'You can close this; the timer keeps running.': 'يمكنك الإغلاق؛ المؤقت يستمر.', 'YouTube': 'يوتيوب', 'YouTube link': 'رابط يوتيوب', 'Paste a link': 'الصق رابطًا', 'YouTube, Drive, Dropbox, podcast, audio or video, web page': 'يوتيوب، درايف، دروب بوكس، بودكاست، صوت أو فيديو، صفحة ويب', 'Opening…': 'أفتح الرابط…',
'Your first name': 'اسمك الأول', 'Your name': 'اسمك', 'Your own AI key (optional)': 'مفتاح الذكاء الخاص بك (اختياري)', 'Mustatar': 'مستطر', 'add your key in': 'أضف مفتاحك في', 'done': 'تم', 'lessons made': 'دروس صُنعت', 'next 7 days': 'الأيام السبعة القادمة',
'e.g. Ahmed': 'مثل: أحمد', 'e.g. Fiqh homework': 'مثل: واجب الفقه', 'e.g. Lesson 3': 'مثل: الدرس ٣', 'e.g. Sales': 'مثل: المبيعات', "e.g. Make the table clearer, or add the teacher's example about…": 'مثل: وضّح الجدول، أو أضف مثال الشيخ عن…',
'e.g. Dar al-Hadith al-Khayriyyah and Kulliyat al-Masjid al-Haram, Makkah': 'مثل: دار الحديث الخيرية وكلية المسجد الحرام، مكة', '“Save PDF” opens the print window: choose “Save as PDF”, then tap save.': '«حفظ PDF» يفتح نافذة الطباعة: اختر «حفظ كـ PDF» ثم اضغط حفظ.',
'↶ Undo': '↶ تراجع', '▶ Play the part': '▶ شغّل المقطع', '☆ Save this text': '☆ احفظ هذا النص', 'Language': 'اللغة', 'Interface language': 'لغة الواجهة', 'Monday': 'الاثنين', 'Saturday': 'السبت', 'Sunday': 'الأحد',
'Ask': 'اسأل', 'Calendar': 'التقويم', 'Delete every week': 'حذف كل الأسابيع', 'Tap again to delete': 'اضغط مرة أخرى للحذف', 'Delete?': 'حذف؟', 'Revise today': 'للمراجعة اليوم', 'Revised ✓': 'راجعت ✓',
'Waiting on others': 'بانتظار الآخرين', 'Follow up': 'متابعة', 'Your day is clear': 'يومك خالٍ', 'Tell me below, e.g. “exam on Tuesday at 9”': 'أخبرني بالأسفل، مثل: «اختبار يوم الثلاثاء الساعة ٩»', 'Up next': 'القادم', 'Auto (follows your phone)': 'تلقائي (حسب الجوال)', 'Night': 'ليلي', 'Day': 'نهاري', 'Glass': 'زجاجي', 'Glass (light)': 'زجاجي (فاتح)', 'App font': 'خط التطبيق', 'Make flashcards': 'اصنع بطاقات', 'Review cards': 'راجع البطاقات', 'Show answer': 'أظهر الجواب', 'Again': 'مرة أخرى', 'Good': 'جيد', 'Easy': 'سهل', 'Next': 'التالي',
'Try again': 'حاول مرة أخرى', 'Make my revision plan': 'اصنع خطة مراجعتي', 'Exam name': 'اسم الاختبار', 'Exam date': 'تاريخ الاختبار', 'Exam time': 'وقت الاختبار', 'Revise each day at': 'المراجعة يوميًا الساعة', 'Minutes each time': 'الدقائق كل مرة',
'Lessons to revise': 'الدروس للمراجعة', 'Also make flashcards for lessons that don\'t have them (uses the internet)': 'اصنع أيضًا بطاقات للدروس التي ليست لها (يحتاج الإنترنت)', 'Another (no notes yet)': 'أخرى (بلا ملاحظات بعد)',
'Follow-up email': 'بريد متابعة', 'Reel script': 'نص ريلز', 'Share as text': 'مشاركة كنص', 'Weekly report': 'التقرير الأسبوعي', 'Make the subject book': 'اصنع كتاب المادة', 'Draft': 'مسودة', 'Finish': 'إكمال', 'Transcribe': 'تفريغ',
'Saved': 'حُفظ', 'Copied': 'نُسخ', 'Export audio': 'تصدير الصوت', 'Save transcript': 'حفظ التفريغ', 'Clear files': 'إلغاء الملفات', 'Pages: from': 'الصفحات: من', 'to': 'إلى', 'Chosen file:': 'الملف المختار:',
'Working…': 'يعمل…', 'Reading…': 'يقرأ…', 'Checking…': 'يفحص…', 'Testing…': 'يختبر…', 'Finishing…': 'ينهي…', 'Cancelled.': 'أُلغي.', 'Starting the microphone…': 'يشغّل الميكروفون…', 'Reading the files…': 'يقرأ الملفات…',
'Reading and writing…': 'يقرأ ويكتب…', 'Preparing your year book…': 'يجهّز كتاب سنتك…', 'Reading your week…': 'يقرأ أسبوعك…', 'Finding your location…': 'يحدد موقعك…', '✓ Saved': '✓ حُفظ', '✓ Copied': '✓ نُسخ', '✓ Copied.': '✓ نُسخ.',
'✓ Ready': '✓ جاهز', '✓ Ready.': '✓ جاهز.', '✓ Transcribed': '✓ فُرّغ', '⏳ Waiting': '⏳ ينتظر', '☁ Waiting for internet': '☁ ينتظر الإنترنت', '✓ Revision plan added': '✓ أُضيفت خطة المراجعة', '✓ Caption copied': '✓ نُسخ التعليق',
'Nothing was recorded.': 'لم يُسجَّل شيء.', 'The recording was too short.': 'التسجيل قصير جدًا.', '✓ Recording saved. Transcribing now…': '✓ حُفظ التسجيل. يفرّغه الآن…', 'Paste a YouTube link first.': 'الصق رابط يوتيوب أولًا.',
'Recording. Keep Mustatar open; the screen stays on (you can turn the brightness down). The sound is saved every 15 seconds.': 'جارٍ التسجيل. أبقِ مستطر مفتوحًا؛ تبقى الشاشة مضاءة (يمكنك خفض السطوع). يُحفظ الصوت كل ١٥ ثانية.',
'✗ The microphone is not allowed. Allow it for this app in your phone settings, then try again.': '✗ الميكروفون غير مسموح. اسمح به لهذا التطبيق من إعدادات الجوال ثم حاول.',
'✗ No speech was heard in this file.': '✗ لم يُسمع كلام في هذا الملف.', '✗ YouTube needs the internet. Connect, then add it again.': '✗ يوتيوب يحتاج الإنترنت. اتصل ثم أضفه مرة أخرى.',
'Wait until the transcription finishes (see ⏳ above), then tap again.': 'انتظر حتى ينتهي التفريغ (انظر ⏳ بالأعلى)، ثم اضغط مرة أخرى.', 'The text is too short. Paste all of it or choose more pages.': 'النص قصير جدًا. الصقه كاملًا أو اختر صفحات أكثر.',
'No internet right now. A quick draft is saved in the Library, and the full notes are written automatically when you are back online.': 'لا يوجد إنترنت الآن. حُفظت مسودة سريعة، وتُكتب الملاحظات كاملة تلقائيًا عند عودة الاتصال.',
'Choose an exam date after today.': 'اختر تاريخ اختبار بعد اليوم.', 'Make some notes first.': 'اصنع بعض الملاحظات أولًا.', 'Write the slides first.': 'اكتب الشرائح أولًا.',
'Press and hold again to remove this habit': 'اضغط مطولًا مرة أخرى لحذف هذه العادة', 'Voice typing is not available here — use the microphone on your keyboard instead.': 'الكتابة بالصوت غير متاحة هنا — استخدم ميكروفون لوحة المفاتيح.',
'Thinking…': 'يفكر…', 'Add study time': 'أضف وقت مذاكرة', 'Open calendar': 'افتح التقويم', '(once).': '(مرة واحدة).',
'✗ The server could not be reached. Check the internet.': '✗ تعذّر الوصول إلى الخادم. تحقق من الإنترنت.', '✓ The server is running and has its AI key.': '✓ الخادم يعمل ومعه مفتاح الذكاء.',
'You have': 'لديك', 'unfinished items from earlier days. Finish them or move them to a new day.': 'مهام لم تنتهِ من أيام سابقة. أنهها أو انقلها إلى يوم جديد.',
'unfinished item from earlier days. Finish it or move it to a new day.': 'مهمة لم تنتهِ من يوم سابق. أنهها أو انقلها إلى يوم جديد.',
'Less than half of this week is done yet. Pick the two most important items and do them first.': 'لم يُنجز نصف هذا الأسبوع بعد. اختر أهم أمرين وابدأ بهما.',
'Good week so far. Keep going.': 'أسبوع جيد حتى الآن. واصل.', 'Nothing planned today.': 'لا شيء مخطط اليوم.', 'Revision': 'المراجعة', 'Quiz': 'اختبار قصير',
'Reminders pop up while the app is open. Allow notifications to get them on the phone too.': 'تظهر التنبيهات والتطبيق مفتوح. اسمح بالإشعارات لتصلك على الجوال أيضًا.',
'Allow notifications to get reminders on the phone, even when the app is closed.': 'اسمح بالإشعارات لتصلك التنبيهات حتى والتطبيق مغلق.',
'✓ Reminders reach this phone even when Mustatar is closed.': '✓ تصل التنبيهات إلى هذا الجوال حتى ومستطر مغلق.',
'Reminders pop up while the app is open, and missed ones show when you open it.': 'تظهر التنبيهات والتطبيق مفتوح، وتظهر الفائتة عند فتحه.', 'Nothing else today': 'لا شيء آخر اليوم', 'your location': 'موقعك', 'Prayer and tasks': 'الصلاة والمهام', 'Waiting': 'ينتظر',
'Make flashcards': 'اصنع بطاقات', 'Review cards': 'راجع البطاقات', 'Follow-up email': 'بريد متابعة', 'Talk with Mustatar': 'تحدّث مع مستطر',
'Your weekly review is ready': 'مراجعتك الأسبوعية جاهزة', 'See what you did and what is coming this week.': 'اطّلع على ما أنجزته وما ينتظرك هذا الأسبوع.',
'Your weekly review is ready — See what you did and what is coming this week.': 'مراجعتك الأسبوعية جاهزة — اطّلع على ما أنجزته وما ينتظرك هذا الأسبوع.',
};
const DAYS = { Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت',
  Sun: 'الأحد', Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء', Thu: 'الخميس', Fri: 'الجمعة', Sat: 'السبت', Su: 'ح', Mo: 'ن', Tu: 'ث', We: 'ر', Th: 'خ', Fr: 'ج', Sa: 'س' };
const MONTHS = { January: 'يناير', February: 'فبراير', March: 'مارس', April: 'أبريل', May: 'مايو', June: 'يونيو', July: 'يوليو', August: 'أغسطس', September: 'سبتمبر', October: 'أكتوبر', November: 'نوفمبر', December: 'ديسمبر',
  Jan: 'يناير', Feb: 'فبراير', Mar: 'مارس', Apr: 'أبريل', Jun: 'يونيو', Jul: 'يوليو', Aug: 'أغسطس', Sep: 'سبتمبر', Oct: 'أكتوبر', Nov: 'نوفمبر', Dec: 'ديسمبر' };
const HIJRI = { 'Muharram': 'محرم', 'Safar': 'صفر', "Rabiʻ I": 'ربيع الأول', "Rabiʻ II": 'ربيع الآخر', 'Jumada I': 'جمادى الأولى', 'Jumada II': 'جمادى الآخرة', 'Rajab': 'رجب', "Shaʻban": 'شعبان', 'Ramadan': 'رمضان', 'Shawwal': 'شوال', "Dhuʻl-Qiʻdah": 'ذو القعدة', "Dhuʻl-Hijjah": 'ذو الحجة', 'AH': 'هـ' };
const PRAY = { Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
const TYPES = { Task: 'مهمة', Homework: 'واجب', Exam: 'اختبار', Class: 'درس', Meeting: 'اجتماع', 'Study time': 'وقت مذاكرة' };
const words = Object.assign({}, MONTHS, PRAY, TYPES, { Today: 'اليوم', Tomorrow: 'غدًا', Yesterday: 'أمس', Overdue: 'متأخر', 'every week': 'كل أسبوع', doing: 'قيد العمل', min: 'د', am: 'ص', pm: 'م', in: 'بعد', today: 'اليوم', overdue: 'متأخر', 'Week of': 'أسبوع', 'This week': 'هذا الأسبوع', 'Good evening': 'مساء الخير', 'Good morning': 'صباح الخير', 'Salam': 'السلام عليكم', parts: 'أجزاء', part: 'جزء', strong: 'متقن', saved: 'محفوظ', 'on this phone': 'على هذا الجوال', 'cards to revise': 'بطاقات للمراجعة', 'memorisation parts to revise': 'أجزاء حفظ للمراجعة', 'memorisation part to revise': 'جزء حفظ للمراجعة', 'Recording': 'تسجيل', 'Colour of': 'لون', 'Make the subject book': 'اصنع كتاب المادة', lessons: 'دروس', words: 'كلمة', pages: 'صفحات', of: 'من', Part: 'الجزء', 'Transcribing part': 'يفرّغ الجزء', 'Transcribing minutes': 'يفرّغ الدقائق', 'Taking out the sound…': 'يستخرج الصوت…', Transcribing: 'يفرّغ', 'Reading page': 'يقرأ الصفحة', 'Reading the photo…': 'يقرأ الصورة…', 'Writing…': 'يكتب…', 'Laying out lesson': 'يرتب الدرس', 'Found': 'وُجد', 'for your calendar': 'لتقويمك', 'Add to calendar': 'أضف إلى التقويم', 'Not now': 'ليس الآن', 'no day was said — check it': 'لم يُذكر يوم — تحقق منه', 'Weekly review': 'المراجعة الأسبوعية', 'Today in': 'اليوم في', done: 'تم', 'Focus time this week': 'وقت التركيز هذا الأسبوع', Daily: 'يومي', 'Next prayer': 'الصلاة القادمة', more: 'المزيد', less: 'أقل' });
Object.assign(words, DAYS, HIJRI);
const wordRe = new RegExp('\\b(' + Object.keys(words).sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\ʻ]/g, '\\$&')).join('|') + ')(?![A-Za-z])', 'g');
function tr(s) {
  const t = s.trim(); if (!t || !/[A-Za-z]/.test(t)) return null;
  if (T[t]) return s.replace(t, T[t]);
  const em = t.match(/^([^\sA-Za-z0-9]{1,3}\s+)(.+)$/u);   // "🎬 Reel script"
  if (em && T[em[2]]) return s.replace(t, em[1] + T[em[2]]);
  // short dynamic labels: dates, times, counts, prayer names
  const m = t.match(/^is on (.+)\. Block study time before it\.$/);
  if (m) return s.replace(t, `يوم ${m[1].replace(wordRe, w => words[w])}. خصّص وقتًا للمذاكرة قبله.`);
  if (t.length <= 60 || /^Today in /.test(t)) {
    const out = s.replace(wordRe, w => words[w]).replace(/(\d+)h (\d+)m/g, '$1س $2د').replace(/,(?=\s*\d)/g, '،');
    // only when the whole label becomes Arabic (dates, times, counts): a sentence someone wrote is never half-translated
    // (that turned "increase me in knowledge" into "increase me بعد knowledge")
    if (!/^Today in /.test(t) && /[A-Za-z]{2,}/.test(out)) return null;
    return out !== s ? out : null;
  }
  return null;
}
const SKIP = '.page, #measure, script, style, textarea, .sx-sv-t, .ci-t b, .sr-t, .al-t small, .ev-title, .tk-title, .as-log, .lib-item .open, .ev .t, .ev .d, .bcard b, .week-item, .nx b, .rc, .st-lt, .saved-chip, .cap-t, .idea, .rm-en, .rm-verse, .rm-say, [data-noi18n], #hm-recent, .habit, #rec-list b, .st-draft, select#subject, #palette-list .pal-name, .who-g b, .fq, .fa, .qopt, .flash';
function walk(root) {
  if (root.nodeType === 3) { fix(root); return; }
  if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => n.nodeType === 1 ? (n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT });
  let n; while ((n = w.nextNode())) fix(n);
  attrs(root); root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(attrs);
}
function fix(n) { if (n.parentElement?.closest(SKIP)) return; const v = tr(n.nodeValue); if (v != null && v !== n.nodeValue) n.nodeValue = v; }
function attrs(e) { if (!e.getAttribute) return; for (const k of ['placeholder', 'aria-label', 'title']) { const v = e.getAttribute(k); if (v) { const x = tr(v); if (x != null && x !== v) e.setAttribute(k, x); } } }
const start = () => {
  walk(document.body);
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') fix(m.target); else if (m.type === 'attributes') attrs(m.target); else m.addedNodes.forEach(walk); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
window.ZadT = s => tr(s) ?? s;
})();
