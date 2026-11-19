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
