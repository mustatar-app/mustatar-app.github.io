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
| Automatic checks | GitHub Actions on every change | `.github/workflows/tests.yml` runs `tests/app_test.py` |

The app finds its server through `server.json`, which the server workflow writes.

## Secrets (never in this code)

| Secret in GitHub | Used for |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Publishing the server and the app on Cloudflare |
| `GEMINI_API_KEY` | The server's current AI (to be replaced: the plan drops Google) |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_PASSWORD` | Signing the Android app |

`GROQ_FREE_API_KEY` and `OPENROUTER_API_KEY` are kept on the Cloudflare server itself. The owner code for the
reports page is stored only as a hash in `server/worker.js`.

## The app's files

| File | What it does |
|---|---|
| `index.html`, `style.css` | The page and its look |
| `app.js` | The core: making notes from recordings, files and text; the library; settings; backup and restore |
| `prompt.js` | How notes are written ("the Jund way"); edit this to change the note style |
| `subjects.js` | Subjects or projects and their colours |
| `media.js`, `recorder.js`, `rec-worker.js` | Cutting audio and video into pieces; long recordings saved every 15 seconds; small MP3s |
| `recordings.js` | Recordings and meetings list (keeps sound 30 days today — to change: delete after the notes are made) |
| `offline.js`, `offline-worker.js` | Whisper on the phone, with no internet |
| `local-ai.js`, `ai-worker.js` | An AI that runs on the phone |
| `scan-ocr.js` | Reading text from photos and scans on the phone |
| `quran.js`, `data/quran.json` | Checks quoted verses against the Mushaf text |
| `calendar.js`, `ical.js`, `inbox.js`, `reminders.js`, `pending.js` | Calendar, other calendars, reminders, daily reminder, "left to do" |
| `assistant.js`, `voice.js`, `dictate.js`, `attach.js`, `thumbs.js` | The assistant: typing, voice, dictation, attached files |
| `study.js` | Flashcards, quizzes, exam planner, memorisation |
| `studio.js` | Text on photos and videos |
| `features.js` | Prayer times, morning brief, habits, focus timer and other tools |
| `drawer.js`, `busy.js`, `mark.js`, `welcome.js`, `i18n.js` | Side menu, "working" spinner, the logo mark, first-open welcome (name, roles, languages, hours, what is hard, tools), Arabic interface |
| `report.js` | Problem reports and anonymous usage counts to the owner |
| `sw.js` | Offline opening and receiving shared files; change `CACHE` when shipping |
| `vendor/` | Outside libraries kept in the project (PDF reader, MP3 maker, on-phone AI, video reader, HEIC photos) |
| `server/worker.js` | The server: AI routes, transcription, YouTube, reminders (Web Push), reports |
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
