# Mustatar — project map

Mustatar (مستطر) turns recordings, files and text into notes and meeting minutes, in Arabic and English, for
meetings, lectures and everything else. It also has a calendar, an assistant and a studio. The app is plain
HTML, CSS and JavaScript with no build step, and it runs in any phone browser, plus a small Android wrapper.

## Where it runs

| Part | Where | Published by |
|---|---|---|
| The app (these files) | GitHub Pages: `mustatar-app.github.io`, and Cloudflare: `mustatar.<account>.workers.dev` | GitHub Pages on every change to `main`; `.github/workflows/deploy-app.yml` (config: `site/wrangler.toml`, left-out files: `.assetsignore`) |
| The server (AI, reminders, reports) | Cloudflare Worker `jund-notes-ai` | `.github/workflows/deploy-server.yml` (config: `server/wrangler.toml`) |
| Android app | `Mustatar.apk` on the GitHub releases page; app id `app.mustatar` | `.github/workflows/build-apk.yml` (signing key only in GitHub secrets) |
| Automatic checks | GitHub Actions on every change | `.github/workflows/tests.yml` runs `tests/engine_test.mjs` and the `tests/*_test.py` files |
| Every button | GitHub Actions when the app changes | `.github/workflows/click-all.yml` runs `tests/click_all.py`: every button on every screen, English and Arabic |
| Live check | Started by hand | `.github/workflows/live-check.yml` runs `tests/live_check.py` on the real server and app: Google and passkey sign-in, assistant speed, app speed |

The app finds its server through `server.json`, which the server workflow writes.

## Secrets (never in this code)

| Secret in GitHub | Used for |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Publishing the server and the app on Cloudflare |
| `GROQ_API_KEY` | The free AI on Groq (Whisper hearing, gpt-oss writing); handed to the server by the deploy workflow |
| `GEMINI_API_KEY` | Only YouTube links (Gemini watches the public video); nothing else uses Google |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_PASSWORD` | Signing the Android app |

Cloudflare's own AI (Whisper, Gemma 4) needs no key: it is the `[ai]` binding in `server/wrangler.toml`. The owner code for the
reports page is stored only as a hash in `server/worker.js`.

## The app's files

| File | What it does |
|---|---|
| `index.html`, `style.css` | The page and its look |
| `privacy.html` | The privacy page (English and Arabic) |
| `app.js` | The core: making notes from recordings, files and text; the library; settings; backup and restore |
| `prompt.js` | How notes are written ("the Jund way"); edit this to change the note style |
| `subjects.js` | Subjects or projects and their colours |
| `media.js`, `recorder.js`, `rec-worker.js` | Cutting audio and video into pieces; long recordings saved every 15 seconds; small MP3s |
| `recordings.js` | Recordings and meetings list; the sound is deleted as soon as its text is ready, unless "Keep the audio" is ticked |
| `offline.js`, `offline-worker.js` | Whisper on the phone, with no internet |
| `local-ai.js`, `ai-worker.js` | An AI that runs on the phone |
| `scan-ocr.js` | Reading text from photos and scans on the phone |
| `quran.js`, `data/quran.json` | Checks quoted verses against the Mushaf text |
| `calendar.js`, `ical.js`, `inbox.js`, `reminders.js`, `pending.js` | Calendar, other calendars, reminders, daily reminder, "left to do". `toast()` is the small banner under the top bar (coloured dot, tap or swipe up to hide) |
| `assistant.js`, `voice.js`, `dictate.js`, `attach.js`, `thumbs.js` | The assistant: typing, voice, dictation, attached files. "From my notes: …" (Notes → Ask my notes) searches more notes and names the lesson |
| `study.js` | Flashcards, quizzes, exam planner, memorisation |
| `studio.js` | Studio, a full-screen editor like Instagram's: Aa writes over the picture (fonts, colours, the A style button, size, harakat); drag to move, two fingers to resize and turn, ↔ for the box width, ⤡ for size, drop on the bin to remove; ★ Saved texts; Colour, Translate, Ideas; More holds drafts, carousel, captions and post ideas |
| `features.js` | Prayer times, morning brief, habits, focus timer and other tools |
| `nav.js` | The bottom bar (Today · Notes · ＋ · Calendar · Me), the ＋ sheet (capture, create a post in Studio, or plan), the Me screen and the back arrow on screens that are not tabs. The phone's back button goes back through screens (app.js `remember`/`popstate`) |
| `plan.js` | Plans and fair limits: Basic is free and runs only on the free daily AI allowance; the per-day and per-month counts, the plan card on Me and the plans page |
| `drawer.js`, `busy.js`, `mark.js`, `welcome.js`, `i18n.js` | Side menu like Claude's, opened by ☰ at the top of the tab screens: New chat, Studio card, past chats each with a one-line summary, projects, recent notes. The app starts a fresh chat when opened after 30 minutes and summarises the old one (assistant.js `summarize`), "working" spinner, the logo mark, the opening screen (Google, passkey, or continue without an account) and first-open questions (name, roles, languages, hours, what is hard, tools), Arabic interface |
| `report.js` | Problem reports and anonymous usage counts to the owner |
| `sw.js` | Offline opening and receiving shared files; change `CACHE` when shipping |
| `vendor/` | Outside libraries kept in the project (PDF reader, MP3 maker, on-phone AI, video reader, HEIC photos) |
| `server/worker.js` | The server: AI routes, transcription, YouTube, reminders (Web Push), reports |
| `server/engine.js` | The free AI engine: which source does each job (Groq or Cloudflare), the fallback, "wait in line", the meter and the brake. Tested by `tests/engine_test.mjs` |
| `server/space.js` | Accounts (passkeys, "Continue with Google") and each person's own private database (one Durable Object per person); sync, usage, delete my data |
| `android/` | The Android wrapper: the app in a web view, plus four home-screen widgets and reminders |

## Data

Notes live on the phone in the browser's storage (database `jund-notes` — the old name is kept on purpose,
because renaming it would lose people's notes). When signed in, `space` in `app.js` copies every lesson and
app data (calendar, habits, memorisation, studio, captions, assistant, About me and tools) to the person's own
database and back. `GOOGLE_CLIENT_ID` in `server/wrangler.toml` switches on "Continue with Google".

## Checking a change

```
python3 -m http.server 8765 &
python3 tests/app_test.py http://localhost:8765/
```

## The move to Cloudflare (step 2, part 4)

The app's home is `https://mustatar.dawajund.workers.dev`. The old address (`mustatar-app.github.io`, still published
by GitHub Pages) shows a "new address" banner that carries every note and setting to the new address
(`exportAll`/`importAll` in `app.js`). The Android app does the same once on its first start
(`MainActivity`: `?move=export` at the old address → `?move=import` at the new one), then opens only the new address.
Passkeys inside the Android app use the app's identity (`android:apk-key-hash:…`, accepted in `server/space.js`) and the
`get_login_creds` relation in `.well-known/assetlinks.json`.

## The free AI engine (server/engine.js)

| Job | First | Then | When all are full |
|---|---|---|---|
| Recordings into text | Whisper large-v3 on Groq (pieces up to 25 MB), then Whisper turbo on Groq | Whisper turbo on Cloudflare | `rate` (the app waits in line) or `quota` (used up today) |
| Notes, long text, page photos | Gemma 4 26B on Cloudflare | gpt-oss on Groq (only if it fits Groq's 8,000 tokens a minute); Qwen on Groq for 1–2 page photos | same |
| Assistant and voice | gpt-oss on Groq | Gemma 4 on Cloudflare | same |
| YouTube links | Gemini (the only Google use) | — | — |

Free allowances: Cloudflare 10,000 units a day for the whole account (the brake stops at 9,500; when the owner allows paying,
only paid plans go past it — free users never cost money); Groq 8 hours of sound a day per Whisper model and 200,000 tokens a day per text model. The owner
view (Settings → Send feedback → owner) shows today's use against each allowance and sets the brake.

Me → Your field and My words (nav.js) shape the notes prompt (app.js `fieldAndWords`) and are sent to hearing as `words` (worker.js → engine.js `hear`, as the prompt). The result screen saves Word (.doc) as well as PDF. Recording shows a one-time consent note. Checks: tests/batch_test.py.

`import.js`: Bring your work (Me → Bring your work, or empty Notes): reads Google Keep Takeout, Evernote .enex, Notion zips, Word, Markdown, text and web pages on the phone (its own small zip reader, zip64 too) and saves each as an ordinary note under its label, tag or folder; importing twice never doubles. Also the backup file (Settings → Save a backup) with every list the app keeps, never the sign-in. New notes reads Word (.docx) through it.
`proof.js`: under a note made from a recording, how much was heard (minutes with speech, quiet minutes); "Where is this from?" on any note: tap a line to see the minute and the words it came from (▶ listen from there while the sound is kept), or plainly "not found" when it was added while writing. Runs on the phone with no AI. hearFile (app.js) keeps each piece's place in time as `timeline` and `heard` on the note. Checks: tests/proof_import_test.py.
`countdown.js`: countdowns on Today (Ramadan, last ten nights, Eid al-Fitr, Day of Arafah, Eid al-Adha, Islamic New Year, Ashura on Umm al-Qura dates worked out on the phone; exams from the calendar in the next 60 days; your own, once or every year) and timers (several, pause, +1 min) and a stopwatch with laps. A running timer shows at the top and goes to the phone's alarms (calendar.js nativeReminders / reminderList) so it rings with the app closed. Opened from the Today row, ＋ → Timer / Countdown, Me → Countdowns and timers, or the assistant ("timer" and "countdown" actions; it is told the exact dates). Checks: tests/countdown_test.py.
`mp4fix.js`: Studio videos are recorded by the phone as a fragmented MP4 (pieces, no total length); WhatsApp and some galleries then played or sent only the first ~3 seconds. `JundMp4.fix` rewrites it as one ordinary MP4 (ftyp, moov with the full length and sample tables, mdat) with the same picture and sound, before saving or sharing. Checks: tests/mp4fix_test.py.
`keep.js`: My notes, like Google Keep (Notes tab → My notes; the other half is Lessons and files): cards in two columns or a list, Keep's colours, pin, labels, checklists, voice notes (/transcribe), reminders (to the calendar), search, archive, bin (7 days) with Undo. Saved at once in IndexedDB 'mustatar-keep', synced as 'keep:<id>' items to the private space, and in the backup. Press and hold to pick notes → ✦ Work on them with AI: ask about them (a chat that answers only from them, assistant.js `withNotes` / `scope`), combine, summarise, to-do list, study file (New notes), quiz, explain, post, merge without AI, or your own request; the AI's result is always a new note. Imports (Keep, Evernote, Notion, Markdown, Word) now land here, with Keep's colours, pins and labels. The assistant also reads matching quick notes and can save a note ("note" action). Checks: tests/keep_test.py.
Today (assistant.js): the verse, the date, prayer and what is coming, the nearest countdown as one line, four shortcuts (Note, My notes, Studio, Record), then the chat. Every opening of the app starts a new, empty chat; the last one is kept in the ☰ list with its summary. The assistant has no message limit (plan.js).
