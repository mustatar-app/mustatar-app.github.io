package sa.jund.notes;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.UUID;

public class MainActivity extends Activity {
    // the app's home on Cloudflare; the old GitHub address is opened only once, to carry notes over
    private static final String ORIGIN = "https://mustatar.dawajund.workers.dev";
    private static final String OLD_ORIGIN = "https://mustatar-app.github.io";
    private static final String SHARE_PATH = "/__mustatar_share/";
    private static final int PICK = 1, AUDIO = 2, NOTIFY = 3, LOCATION = 4, CALENDAR = 5, HEALTH = 6, FOLDER = 7;
    private static final String FILE_PATH = "/__mustatar_file/";
    // files from a folder the person chose (their recordings, their screenshots), handed to the page one by one
    private final java.util.Map<String, String[]> served = new java.util.concurrent.ConcurrentHashMap<>();
    // a request waiting for the person's answer (calendar or health permission)
    private String waitingJob; private androidx.webkit.JavaScriptReplyProxy waitingReply;
    private WebView web;
    private ValueCallback<Uri[]> picker;
    private PermissionRequest microphone;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;
    private volatile SharedFile shared;
    // the second and later files when several are shared at once
    private final java.util.List<SharedFile> sharedMore = new java.util.concurrent.CopyOnWriteArrayList<>();
    private String sharedText;
    private boolean sharePending;
    private boolean ready;
    private FileOut files;
    private android.speech.tts.TextToSpeech tts;
    private boolean ttsReady;
    private final java.util.Map<String, androidx.webkit.JavaScriptReplyProxy> speaking = new java.util.HashMap<>();
    // test builds only: the automatic phone test opens the app's pages from the test computer instead
    private static Uri testHome;

    private static boolean local(Uri url) {
        if (testHome != null && testHome.getScheme().equals(url.getScheme()) && testHome.getHost().equals(url.getHost())
            && testHome.getPort() == url.getPort()) return true;
        return "https".equals(url.getScheme())
            && ("mustatar.dawajund.workers.dev".equals(url.getHost()) || "mustatar-app.github.io".equals(url.getHost()))
            && (url.getPort() == -1 || url.getPort() == 443);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        boolean debuggable = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debuggable) {
            WebView.setWebContentsDebuggingEnabled(true);
            String t = getIntent().getStringExtra("testHome");
            if (t != null && t.startsWith("http://localhost:")) testHome = Uri.parse(t);
        }
        files = new FileOut(this);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        // the app sizes its own words (Me → Appearance → Text size, "Phone" follows the phone's setting within safe limits),
        // so the page is not blown up by a very large phone font and nothing spills out of its box
        web.getSettings().setTextZoom(100);
        // Studio plays the chosen video while it makes the new one (a few moments after the tap): allow it
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        web.getSettings().setGeolocationEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        // passkeys (fingerprint or face sign-in) inside the app, with the app's own identity
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION))
            WebSettingsCompat.setWebAuthenticationSupport(web.getSettings(), WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame() || local(request.getUrl())) return false;
                Uri url = request.getUrl();
                if ("https".equals(url.getScheme()) || "mailto".equals(url.getScheme())
                    || ("daftar".equals(url.getScheme()) && "widget".equals(url.getHost()))) {
                    Intent link = "daftar".equals(url.getScheme())
                        ? new Intent(MainActivity.this, WidgetLinkActivity.class).setData(url)
                        : new Intent(Intent.ACTION_VIEW, url);
                    try { startActivity(link); } catch (ActivityNotFoundException ignored) {}
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return sharedResponse(request.getUrl());
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                ready = false;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
            && WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            androidx.webkit.ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(
                new androidx.webkit.ServiceWorkerClientCompat() {
                    @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                        return sharedResponse(request.getUrl());
                    }
                });
        }
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (picker != null) picker.onReceiveValue(null);
                picker = callback;
                try { startActivityForResult(params.createIntent(), PICK); }
                catch (ActivityNotFoundException e) { picker.onReceiveValue(null); picker = null; }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    String audio = PermissionRequest.RESOURCE_AUDIO_CAPTURE;
                    if (!local(request.getOrigin()) || !java.util.Arrays.asList(request.getResources()).contains(audio)) {
                        request.deny();
                    } else if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{audio});
                    } else {
                        if (microphone != null) microphone.deny();
                        microphone = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO);
                    }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (microphone == request) microphone = null;
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!local(Uri.parse(origin))) { callback.invoke(origin, false, false); return; }
                if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    locationOrigin = origin;
                    locationCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION);
                }
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            java.util.Set<String> origins = new java.util.HashSet<>(java.util.Arrays.asList(ORIGIN, OLD_ORIGIN));
            if (testHome != null) origins.add(testHome.getScheme() + "://" + testHome.getHost() + ":" + testHome.getPort());
            WebViewCompat.addWebMessageListener(web, "MustatarAndroid", origins,
                (view, message, origin, mainFrame, reply) -> {
                    if (!mainFrame || !local(origin)) return;
                    try {
                        JSONObject command = new JSONObject(message.getData());
                        switch (command.optString("action")) {
                            case "ready": ready = true; deliverShare(); break;
                            // the one-time move from the old address (app.js, "moving to Mustatar's new address")
                            case "moveExport":
                                writeMove(command.optString("data"));
                                runOnUiThread(() -> web.loadUrl(ORIGIN + "/?move=import"));
                                return;
                            case "moveTake":
                                String moved = readMove();
                                reply.postMessage("{\"move\":" + (moved.isEmpty() ? "null" : moved) + "}");
                                return;
                            case "moveDone":
                                new java.io.File(getFilesDir(), "move.json").delete();
                                getSharedPreferences("mustatar", MODE_PRIVATE).edit().putBoolean("moved", true).apply();
                                return;
                            case "shareDone":
                                SharedFile file = shared;
                                if (file != null && (SHARE_PATH + file.token).equals(command.optString("path"))) shared = null;
                                for (SharedFile m : sharedMore) if ((SHARE_PATH + m.token).equals(command.optString("path"))) sharedMore.remove(m);
                                break;
                            case "sync": ReminderReceiver.replace(this, command.getJSONArray("items")); break;
                            case "permissions": notificationPermissions(); break;
                            case "test": ReminderReceiver.test(this); break;
                            // a file made in the app leaves it: sent in pieces, then saved on the phone or shared
                            case "fileStart": files.start(command.getString("id"), command.optString("name"), command.optString("mime")); return;
                            case "fileChunk": files.chunk(command.getString("id"), command.getString("data")); return;
                            case "fileEnd": files.end(command.getString("id")); return;
                            case "fileSave": case "fileShare": {
                                java.util.List<String> ids = new java.util.ArrayList<>();
                                org.json.JSONArray a = command.getJSONArray("ids");
                                for (int i = 0; i < a.length(); i++) ids.add(a.getString(i));
                                String job = command.optString("job");
                                FileOut.Done done = json -> reply.postMessage("{\"file\":" + JSONObject.quote(job) + ",\"result\":" + json + "}");
                                if ("fileSave".equals(command.optString("action"))) files.save(ids, done); else files.share(ids, done);
                                return;
                            }
                            case "shareText": {
                                String job = command.optString("job");
                                files.shareText(command.optString("text"), command.optString("title"),
                                    json -> reply.postMessage("{\"file\":" + JSONObject.quote(job) + ",\"result\":" + json + "}"));
                                return;
                            }
                            // reading the assistant's answer aloud (a web view has no voice of its own)
                            case "speak": speak(command.optString("id"), command.optString("text"), command.optString("lang"), command.optDouble("rate", 1), reply); return;
                            case "stopSpeaking": if (tts != null) tts.stop(); return;
                            // "Continue with Google" inside the app: Android's own Google sheet gives a signed ID token,
                            // which the page sends to the server (the same check as on the website)
                            case "googleSignIn": googleSignIn(command.optString("job"), command.optString("clientId"), reply); return;
                            // "Continue with Google" in the phone's browser (works without the Android sign-in set-up in Google Cloud);
                            // the browser comes back with app.mustatar://signin
                            // which version this app is, so the page can offer a newer one
                            // the alarm clock (AlarmClock.java) and the focus lock
                            case "alarmSet": AlarmClock.replace(this, command.optJSONArray("alarms") == null ? new JSONArray() : command.getJSONArray("alarms")); answer(reply, command.optString("job"), AlarmClock.status(this)); return;
                            case "alarmStatus": answer(reply, command.optString("job"), AlarmClock.status(this)); return;
                            case "alarmTest": AlarmClock.ring(this, command.optString("label")); answer(reply, command.optString("job"), new JSONObject().put("ok", true)); return;
                            case "alarmPerm": {
                                Intent go;
                                if (!ReminderReceiver.exact(this)) go = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()));
                                else if (Build.VERSION.SDK_INT >= 34 && !getSystemService(NotificationManager.class).canUseFullScreenIntent()) go = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName()));
                                else go = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                                try { startActivity(go); } catch (ActivityNotFoundException ignored) {}
                                answer(reply, command.optString("job"), new JSONObject().put("ok", true)); return;
                            }
                            case "focusLock": {
                                NotificationManager nm = getSystemService(NotificationManager.class);
                                boolean dnd = command.optBoolean("dnd", true) && nm.isNotificationPolicyAccessGranted();
                                if (dnd) { getPreferences(MODE_PRIVATE).edit().putInt("filterBefore", nm.getCurrentInterruptionFilter()).apply(); nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS); }
                                boolean pinned = true; try { startLockTask(); } catch (Exception e) { pinned = false; }
                                answer(reply, command.optString("job"), new JSONObject().put("ok", true).put("pinned", pinned).put("dnd", dnd).put("dndAllowed", nm.isNotificationPolicyAccessGranted())); return;
                            }
                            case "focusUnlock": {
                                try { stopLockTask(); } catch (Exception ignored) {}
                                NotificationManager nm = getSystemService(NotificationManager.class);
                                int before = getPreferences(MODE_PRIVATE).getInt("filterBefore", 0);
                                if (before != 0 && nm.isNotificationPolicyAccessGranted()) { nm.setInterruptionFilter(before); getPreferences(MODE_PRIVATE).edit().remove("filterBefore").apply(); }
                                answer(reply, command.optString("job"), new JSONObject().put("ok", true)); return;
                            }
                            case "focusStatus": {
                                NotificationManager nm = getSystemService(NotificationManager.class);
                                android.app.ActivityManager am = getSystemService(android.app.ActivityManager.class);
                                answer(reply, command.optString("job"), new JSONObject().put("ok", true).put("dndAllowed", nm.isNotificationPolicyAccessGranted())
                                    .put("pinned", Build.VERSION.SDK_INT >= 23 && am.getLockTaskModeState() != android.app.ActivityManager.LOCK_TASK_MODE_NONE)); return;
                            }
                            case "dndAsk": {
                                try { startActivity(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)); } catch (ActivityNotFoundException ignored) {}
                                answer(reply, command.optString("job"), new JSONObject().put("ok", true)); return;
                            }
                            case "appInfo": {
                                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                                answer(reply, command.optString("job"), new JSONObject().put("ok", true).put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : (long) pi.versionCode)
                                    .put("versionName", pi.versionName).put("canInstall", getPackageManager().canRequestPackageInstalls())
                                    .put("fontScale", (double) getResources().getConfiguration().fontScale));
                                return;
                            }
                            // updating itself: download the new version, then Android's installer asks the person to confirm
                            case "appUpdate": {
                                String job = command.optString("job"), url = command.optString("url");
                                if (!url.startsWith("https://github.com/mustatar-app/")) { answer(reply, job, new JSONObject().put("ok", false).put("error", "url")); return; }
                                if (!getPackageManager().canRequestPackageInstalls()) {
                                    // once: Android asks to allow Mustatar to install its own updates
                                    pendingUpdate = url;
                                    try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) {}
                                    answer(reply, job, new JSONObject().put("ok", true).put("step", "allow"));
                                    return;
                                }
                                downloadUpdate(url, ok -> answer(reply, job, jsonOk(ok)));
                                return;
                            }
                            case "openBrowser": {
                                boolean ok = openInBrowser(Uri.parse(command.optString("url")));
                                reply.postMessage("{\"file\":" + JSONObject.quote(command.optString("job")) + ",\"result\":{\"ok\":" + ok + "}}");
                                return;
                            }
                            // the widgets: the app hands them their data (prayer times, items, Hijri date, style, language)
                            case "widget": WidgetData.saveLocal(this, command.getJSONObject("data").toString()); break;
                            case "widgetPreview": {   // test builds only: draw each widget into a picture
                                boolean dbg = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
                                if (dbg) WidgetData.preview(this);
                                answer(reply, command.optString("job"), new JSONObject().put("ok", dbg));
                                return;
                            }
                            // the phone's own calendars, both ways
                            case "calendarAsk": {
                                if (hasCalendar()) { answer(reply, command.optString("job"), new JSONObject().put("ok", true)); return; }
                                waitingJob = command.optString("job"); waitingReply = reply;
                                requestPermissions(new String[]{Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR}, CALENDAR);
                                return;
                            }
                            case "calendarList": calendarJob(reply, command, () -> new JSONObject().put("ok", true).put("calendars", PhoneCalendar.calendars(this))); return;
                            case "calendarRead": calendarJob(reply, command, () -> new JSONObject().put("ok", true).put("events",
                                PhoneCalendar.events(this, command.getLong("from"), command.getLong("to"), command.optJSONArray("ids")))); return;
                            case "calendarWrite": calendarJob(reply, command, () -> PhoneCalendar.write(this, command.getLong("cal"), command.getJSONArray("items"))); return;
                            case "calendarClear": calendarJob(reply, command, () -> new JSONObject().put("ok", true).put("removed", PhoneCalendar.clear(this))); return;
                            case "calendarForget": calendarJob(reply, command, () -> { PhoneCalendar.forget(this, command.getJSONArray("ids"), command.optBoolean("resign")); return new JSONObject().put("ok", true); }); return;
                            // the fitness tracker (Health Connect)
                            case "healthStatus": {
                                String st = HealthBridge.status(this);
                                if (!"ok".equals(st)) { answer(reply, command.optString("job"), new JSONObject().put("ok", true).put("status", st)); return; }
                                String job = command.optString("job");
                                HealthBridge.granted(this, json -> runOnUiThread(() -> {
                                    try { answer(reply, job, new JSONObject(json).put("status", "ok")); } catch (Exception ignored) {}
                                }));
                                return;
                            }
                            case "healthAsk": {
                                String st = HealthBridge.status(this), job = command.optString("job");
                                if ("update".equals(st)) {
                                    try { startActivity(HealthBridge.installIntent()); } catch (ActivityNotFoundException ignored) {}
                                    answer(reply, job, new JSONObject().put("ok", false).put("status", st)); return;
                                }
                                if (!"ok".equals(st)) { answer(reply, job, new JSONObject().put("ok", false).put("status", st)); return; }
                                waitingJob = job; waitingReply = reply;
                                try { startActivityForResult(HealthBridge.permissionIntent(this), HEALTH); }
                                catch (Exception e) { waitingJob = null; answer(reply, job, new JSONObject().put("ok", false).put("error", String.valueOf(e))); }
                                return;
                            }
                            case "healthRead": {
                                String job = command.optString("job");
                                if (!"ok".equals(HealthBridge.status(this))) { answer(reply, job, new JSONObject().put("ok", false).put("status", HealthBridge.status(this))); return; }
                                HealthBridge.read(this, Math.max(1, Math.min(31, command.optInt("days", 7))), json -> runOnUiThread(() -> {
                                    try { answer(reply, job, new JSONObject(json)); } catch (Exception ignored) {}
                                }));
                                return;
                            }
                            // a folder on the phone the person chooses once (Samsung Voice Recorder's recordings, screenshots…)
                            case "folderPick": {
                                waitingJob = command.optString("job"); waitingReply = reply;
                                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                                String start = command.optString("start");
                                if (!start.isEmpty()) pick.putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI,
                                    android.provider.DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:" + start));
                                try { startActivityForResult(pick, FOLDER); }
                                catch (ActivityNotFoundException e) { waitingJob = null; answer(reply, command.optString("job"), new JSONObject().put("ok", false)); }
                                return;
                            }
                            case "folderList": {
                                String job = command.optString("job"), tree = command.optString("uri"); long since = command.optLong("since");
                                new Thread(() -> {
                                    JSONObject out = new JSONObject();
                                    try {
                                        Uri t = Uri.parse(tree);
                                        Uri kids = android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(t, android.provider.DocumentsContract.getTreeDocumentId(t));
                                        org.json.JSONArray list = new org.json.JSONArray();
                                        try (Cursor c = getContentResolver().query(kids, new String[]{"document_id", "_display_name", "mime_type", "last_modified", "_size"}, null, null, null)) {
                                            while (c != null && c.moveToNext()) {
                                                String mime = c.getString(2);
                                                if (mime == null || android.provider.DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) continue;
                                                long mod = c.getLong(3);
                                                if (mod <= since) continue;
                                                list.put(new JSONObject().put("doc", c.getString(0)).put("name", c.getString(1)).put("mime", mime).put("modified", mod).put("size", c.getLong(4)));
                                            }
                                        }
                                        out.put("ok", true).put("files", list);
                                    } catch (Exception e) { try { out.put("ok", false).put("error", String.valueOf(e)); } catch (Exception ignored) {} }
                                    answer(reply, job, out);
                                }).start();
                                return;
                            }
                            case "folderFile": {
                                Uri t = Uri.parse(command.optString("uri"));
                                Uri doc = android.provider.DocumentsContract.buildDocumentUriUsingTree(t, command.optString("doc"));
                                String token = UUID.randomUUID().toString();
                                served.put(token, new String[]{doc.toString(), command.optString("mime", "application/octet-stream")});
                                answer(reply, command.optString("job"), new JSONObject().put("ok", true).put("path", FILE_PATH + token));
                                return;
                            }
                            case "print":
                                getSystemService(PrintManager.class).print("Mustatar",
                                    web.createPrintDocumentAdapter("Mustatar"), null);
                                break;
                        }
                        reply.postMessage(ReminderReceiver.status(this).toString());
                    } catch (Exception e) {
                        try {
                            JSONObject command = new JSONObject(message.getData());
                            if (command.has("job")) reply.postMessage("{\"file\":" + JSONObject.quote(command.optString("job"))
                                + ",\"result\":{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}}");
                        } catch (Exception ignored) {}
                    }
                });
        }
        setContentView(web);
        receive(getIntent(), true);
    }

    private String pendingUpdate;
    private interface Done { void done(boolean ok); }
    private static JSONObject jsonOk(boolean ok) { try { return new JSONObject().put("ok", ok); } catch (Exception e) { return new JSONObject(); } }
    private void downloadUpdate(String url, Done done) {
        new Thread(() -> {
            boolean ok = false;
            try {
                java.io.File dir = new java.io.File(getCacheDir(), "update"); dir.mkdirs();
                java.io.File apk = new java.io.File(dir, "Mustatar.apk");
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setInstanceFollowRedirects(true); c.setConnectTimeout(15000); c.setReadTimeout(30000);
                // GitHub sends the file from another address: follow it by hand if needed
                for (int i = 0; i < 5 && c.getResponseCode() / 100 == 3; i++) {
                    String next = c.getHeaderField("Location"); c.disconnect();
                    c = (java.net.HttpURLConnection) new java.net.URL(next).openConnection(); c.setConnectTimeout(15000); c.setReadTimeout(30000);
                }
                if (c.getResponseCode() != 200) throw new java.io.IOException("HTTP " + c.getResponseCode());
                try (java.io.InputStream in = c.getInputStream(); java.io.OutputStream out = new java.io.FileOutputStream(apk)) {
                    byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                if (apk.length() < 500_000) throw new java.io.IOException("too small");
                Uri uri = androidx.core.content.FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                runOnUiThread(() -> { try { startActivity(install); } catch (Exception ignored) {} });
                ok = true;
            } catch (Exception ignored) {}
            done.done(ok);
        }).start();
    }

    private void answer(androidx.webkit.JavaScriptReplyProxy reply, String job, JSONObject result) {
        Runnable send = () -> reply.postMessage("{\"file\":" + JSONObject.quote(job) + ",\"result\":" + result + "}");
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) send.run(); else runOnUiThread(send);
    }
    private boolean hasCalendar() {
        return checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED
            && checkSelfPermission(Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }
    private interface Job { JSONObject run() throws Exception; }
    // calendar work runs away from the screen's thread, then answers the page
    private void calendarJob(androidx.webkit.JavaScriptReplyProxy reply, JSONObject command, Job job) {
        String id = command.optString("job");
        if (!hasCalendar()) { try { answer(reply, id, new JSONObject().put("ok", false).put("error", "permission")); } catch (Exception ignored) {} return; }
        new Thread(() -> {
            JSONObject out;
            try { out = job.run(); } catch (Exception e) { try { out = new JSONObject().put("ok", false).put("error", String.valueOf(e)); } catch (Exception x) { return; } }
            answer(reply, id, out);
        }).start();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receive(intent, false);
    }

    // opens a page in the phone's browser, never in this app (this app also opens the app's own address)
    private boolean openInBrowser(Uri url) {
        if (!"https".equals(url.getScheme())) return false;
        android.content.pm.PackageManager pm = getPackageManager();
        String pkg = null;
        android.content.pm.ResolveInfo def = pm.resolveActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.example.com")), android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
        if (def != null && def.activityInfo != null && !"android".equals(def.activityInfo.packageName) && !getPackageName().equals(def.activityInfo.packageName)) pkg = def.activityInfo.packageName;
        if (pkg == null) for (android.content.pm.ResolveInfo r : pm.queryIntentActivities(new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.example.com")).addCategory(Intent.CATEGORY_BROWSABLE), 0)) {
            if (!getPackageName().equals(r.activityInfo.packageName)) { pkg = r.activityInfo.packageName; if ("com.android.chrome".equals(pkg)) break; }
        }
        if (pkg == null) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true; }
        catch (ActivityNotFoundException e) { return false; }
    }

    private void receive(Intent intent, boolean first) {
        Uri data = intent.getData();
        // back from Google in the browser: open the app with the sign-in, which the page keeps (and then removes from the address)
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && data != null && "app.mustatar".equals(data.getScheme()) && "signin".equals(data.getHost())) {
            String t = data.getQueryParameter("t");
            String home = testHome != null ? testHome.toString() : ORIGIN;
            if (t != null && t.matches("[A-Za-z0-9_-]{20,20000}")) {
                getSharedPreferences("mustatar", MODE_PRIVATE).edit().putBoolean("moved", true).apply();
                web.loadUrl(home + "/?signin=" + System.currentTimeMillis() + "#signin=" + t);   // a new address, so the page loads again
                return;
            }
        }
        if (first && testHome != null) { getSharedPreferences("mustatar", MODE_PRIVATE).edit().putBoolean("moved", true).apply(); web.loadUrl(testHome.toString() + "/"); return; }
        if (Intent.ACTION_SEND.equals(intent.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            CharSequence tx = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            sharedText = tx == null ? null : tx.toString();
            java.util.List<Uri> streams = new java.util.ArrayList<>();
            if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
                java.util.ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) streams.addAll(list);
            } else {
                Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (one != null) streams.add(one);
            }
            if (streams.isEmpty() && intent.getClipData() != null)
                for (int i = 0; i < intent.getClipData().getItemCount(); i++) { Uri u = intent.getClipData().getItemAt(i).getUri(); if (u != null) streams.add(u); }
            sharedMore.clear(); shared = null;
            for (Uri u : streams) {
                if (u == null || !"content".equals(u.getScheme())) continue;
                if (sharedMore.size() >= 50) break;
                SharedFile f = new SharedFile(u, intent.getType());
                if (shared == null) shared = f; else sharedMore.add(f);
            }
            sharePending = true;
            deliverShare();
        }
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && data != null && local(data)) web.loadUrl(data.toString());
        else if (first) {
            if (getSharedPreferences("mustatar", MODE_PRIVATE).getBoolean("moved", false)) web.loadUrl(ORIGIN + "/");
            else {
                // first start at the new address: collect the notes kept at the old one, then open the new one
                web.loadUrl(OLD_ORIGIN + "/?move=export");
                // if the old address does not answer (offline, or not updated yet), open the new one and
                // try again at the next start; after three tries, stop asking
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                    android.content.SharedPreferences prefs = getSharedPreferences("mustatar", MODE_PRIVATE);
                    if (!prefs.getBoolean("moved", false) && !new java.io.File(getFilesDir(), "move.json").exists()) {
                        int tries = prefs.getInt("moveTries", 0) + 1;
                        prefs.edit().putInt("moveTries", tries).putBoolean("moved", tries >= 3).apply();
                        web.loadUrl(ORIGIN + "/");
                    }
                }, 25000);
            }
        }
    }

    private void googleSignIn(String job, String clientId, androidx.webkit.JavaScriptReplyProxy reply) {
        java.util.function.BiConsumer<String, String> answer = (token, problem) -> reply.postMessage("{\"file\":" + JSONObject.quote(job)
            + ",\"result\":{\"ok\":" + (token != null) + (token != null ? ",\"token\":" + JSONObject.quote(token) : "")
            + (problem != null ? ",\"error\":" + JSONObject.quote(problem) : "") + "}}");
        try {
            androidx.credentials.CredentialManager cm = androidx.credentials.CredentialManager.create(this);
            com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption option =
                new com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption.Builder(clientId).build();
            androidx.credentials.GetCredentialRequest request = new androidx.credentials.GetCredentialRequest.Builder().addCredentialOption(option).build();
            cm.getCredentialAsync(this, request, null, androidx.core.content.ContextCompat.getMainExecutor(this),
                new androidx.credentials.CredentialManagerCallback<androidx.credentials.GetCredentialResponse, androidx.credentials.exceptions.GetCredentialException>() {
                    @Override public void onResult(androidx.credentials.GetCredentialResponse response) {
                        androidx.credentials.Credential c = response.getCredential();
                        if (c instanceof androidx.credentials.CustomCredential && com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
                                .TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                            try {
                                answer.accept(com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.createFrom(c.getData()).getIdToken(), null);
                            } catch (Exception e) { answer.accept(null, "unreadable answer from Google"); }
                        } else answer.accept(null, "not a Google account");
                    }
                    @Override public void onError(androidx.credentials.exceptions.GetCredentialException e) {
                        String kind = e.getClass().getSimpleName();
                        answer.accept(null, kind.contains("Cancellation") ? "cancelled" : kind + ": " + e.getMessage());
                    }
                });
        } catch (Exception e) { answer.accept(null, "Google sign-in is not available on this phone: " + e.getMessage()); }
    }

    private void speak(String id, String text, String lang, double rate, androidx.webkit.JavaScriptReplyProxy reply) {
        if (tts == null) {
            tts = new android.speech.tts.TextToSpeech(this, status -> {
                ttsReady = status == android.speech.tts.TextToSpeech.SUCCESS;
                if (!ttsReady) { finishSpeaking(id, false, "no voice"); return; }
                tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                    @Override public void onStart(String u) {}
                    @Override public void onDone(String u) { runOnUiThread(() -> finishSpeaking(u, true, null)); }
                    @Override public void onError(String u) { runOnUiThread(() -> finishSpeaking(u, false, "error")); }
                    @Override public void onStop(String u, boolean interrupted) { runOnUiThread(() -> finishSpeaking(u, true, null)); }
                });
                runOnUiThread(() -> speakNow(id, text, lang, rate));
            });
            speaking.put(id, reply);
            return;
        }
        speaking.put(id, reply);
        if (ttsReady) speakNow(id, text, lang, rate);
        else finishSpeaking(id, false, "no voice");
    }
    private void speakNow(String id, String text, String lang, double rate) {
        if (!ttsReady) { finishSpeaking(id, false, "no voice"); return; }
        int ok = tts.setLanguage(java.util.Locale.forLanguageTag("ar".equals(lang) ? "ar" : "en".equals(lang) ? "en-US" : lang));
        if (ok == android.speech.tts.TextToSpeech.LANG_MISSING_DATA || ok == android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED) {
            finishSpeaking(id, false, "missing " + lang);
            return;
        }
        tts.setSpeechRate((float) Math.max(0.5, Math.min(2, rate)));
        tts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, id);
    }
    private void finishSpeaking(String id, boolean ok, String problem) {
        androidx.webkit.JavaScriptReplyProxy r = speaking.remove(id);
        if (r != null) r.postMessage("{\"spoke\":" + JSONObject.quote(id) + ",\"ok\":" + ok + (problem == null ? "" : ",\"problem\":" + JSONObject.quote(problem)) + "}");
    }

    private void writeMove(String data) {
        try (java.io.FileOutputStream out = new java.io.FileOutputStream(new java.io.File(getFilesDir(), "move.json"))) {
            out.write(data.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception ignored) {}
    }
    private String readMove() {
        java.io.File f = new java.io.File(getFilesDir(), "move.json");
        if (!f.exists()) return "";
        try { return new String(java.nio.file.Files.readAllBytes(f.toPath()), java.nio.charset.StandardCharsets.UTF_8); }
        catch (Exception e) { return ""; }
    }

    private void deliverShare() {
        SharedFile file = shared;
        if (!ready || !sharePending) return;
        sharePending = false;
        web.evaluateJavascript("window.JundNativeShare?.(" + JSONObject.quote(sharedText) + ","
            + (file == null ? "null" : JSONObject.quote(SHARE_PATH + file.token)) + ","
            + (file == null ? "null" : JSONObject.quote(file.name)) + "," + moreJson() + ")", null);
        sharedText = null;
    }

    private String moreJson() {
        org.json.JSONArray a = new org.json.JSONArray();
        for (SharedFile m : sharedMore) a.put(new org.json.JSONArray().put(SHARE_PATH + m.token).put(m.name));
        return a.toString();
    }

    private WebResourceResponse sharedResponse(Uri url) {
        String p = url.getPath();
        if (p != null && p.startsWith(FILE_PATH) && local(url)) {
            String[] f = served.remove(p.substring(FILE_PATH.length()));
            if (f == null) return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), null);
            try {
                java.io.InputStream input = getContentResolver().openInputStream(Uri.parse(f[0]));
                if (input != null) return new WebResourceResponse(f[1], null, 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), input);
            } catch (Exception ignored) {}
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), null);
        }
        SharedFile file = shared;
        if (file != null && !(SHARE_PATH + file.token).equals(url.getPath())) file = null;
        if (file == null) for (SharedFile m : sharedMore) if ((SHARE_PATH + m.token).equals(url.getPath())) { file = m; break; }
        if (file == null || !local(url)) return null;
        try {
            java.io.InputStream input = getContentResolver().openInputStream(file.uri);
            if (input != null) return new WebResourceResponse(file.type, null, 200, "OK",
                Collections.singletonMap("Cache-Control", "no-store"), input);
        } catch (Exception ignored) {}
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), null);
    }

    private class SharedFile {
        final Uri uri;
        final String token = UUID.randomUUID().toString();
        final String name, type;
        SharedFile(Uri uri, String mime) {
            this.uri = uri;
            String display = null;
            try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) display = c.getString(0);
            } catch (Exception ignored) {}
            String own = null;
            try { own = getContentResolver().getType(uri); } catch (Exception ignored) {}
            // each file's own type (several shared at once arrive as "*/*")
            type = own != null ? own : mime == null || mime.contains("*") ? "application/octet-stream" : mime;
            name = display == null ? ("application/pdf".equals(type) ? "Shared.pdf" : "Shared file") : display;
        }
    }

    private void notificationPermissions() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            if (getPreferences(MODE_PRIVATE).getBoolean("requestedNotifications", false)
                && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } else {
                getPreferences(MODE_PRIVATE).edit().putBoolean("requestedNotifications", true).apply();
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFY);
            }
        } else if (!ReminderReceiver.exact(this)) {
            try { startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()))); }
            catch (ActivityNotFoundException ignored) {}
        } else if (!ReminderReceiver.notifications(this)) {
            startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code == AUDIO && microphone != null) {
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED)
                microphone.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else microphone.deny();
            microphone = null;
        }
        if (code == NOTIFY) refreshReminders();
        if (code == CALENDAR && waitingJob != null) {
            try { answer(waitingReply, waitingJob, new JSONObject().put("ok", hasCalendar())); } catch (Exception ignored) {}
            waitingJob = null; waitingReply = null;
        }
        if (code == LOCATION && locationCallback != null) {
            locationCallback.invoke(locationOrigin, grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED, false);
            locationCallback = null;
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FileOut.CREATE) files.placed(result, data);
        if (code == FOLDER && waitingJob != null) {
            String job = waitingJob; androidx.webkit.JavaScriptReplyProxy reply = waitingReply;
            waitingJob = null; waitingReply = null;
            try {
                Uri tree = result == RESULT_OK && data != null ? data.getData() : null;
                if (tree == null) { answer(reply, job, new JSONObject().put("ok", false)); }
                else {
                    getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    String id = android.provider.DocumentsContract.getTreeDocumentId(tree);
                    answer(reply, job, new JSONObject().put("ok", true).put("uri", tree.toString()).put("name", id.substring(id.indexOf(':') + 1)));
                }
            } catch (Exception e) { try { answer(reply, job, new JSONObject().put("ok", false).put("error", String.valueOf(e))); } catch (Exception ignored) {} }
        }
        if (code == HEALTH && waitingJob != null) {
            String job = waitingJob; androidx.webkit.JavaScriptReplyProxy reply = waitingReply;
            waitingJob = null; waitingReply = null;
            HealthBridge.granted(this, json -> runOnUiThread(() -> { try { answer(reply, job, new JSONObject(json)); } catch (Exception ignored) {} }));
        }
        if (code == PICK && picker != null) {
            picker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            picker = null;
        }
    }

    @Override protected void onResume() {
        super.onResume(); refreshReminders();
        // came back from "allow installing updates": carry on with the update
        if (pendingUpdate != null && getPackageManager().canRequestPackageInstalls()) {
            String url = pendingUpdate; pendingUpdate = null;
            if (web != null) web.evaluateJavascript("window.JundAppUpdate?.downloading?.()", null);
            downloadUpdate(url, ok -> runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.JundAppUpdate?.done?.(" + ok + ")", null); }));
        }
    }

    private void refreshReminders() {
        ReminderReceiver.schedule(this);
        if (web != null) web.evaluateJavascript("window.JundCal?.pushSync()", null);
    }

    /* the back button: the app decides (close a window, go to the previous screen, or leave). It never walks back
       through old pages such as the sign-in page. */
    @Override public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.JundHardBack ? window.JundHardBack() : 'old')", v -> {
            String r = v == null ? "" : v.replace("\"", "");
            if ("done".equals(r)) return;
            if ("old".equals(r) && web.canGoBack()) { web.goBack(); return; }
            moveTaskToBack(true);
        });
    }

    @Override protected void onDestroy() {
        if (picker != null) picker.onReceiveValue(null);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
            && WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            androidx.webkit.ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(null);
        }
        if (tts != null) tts.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
