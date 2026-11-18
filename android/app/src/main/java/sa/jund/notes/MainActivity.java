package sa.jund.notes;

import android.Manifest;
import android.app.Activity;
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

import org.json.JSONObject;

import java.util.Collections;
import java.util.UUID;

public class MainActivity extends Activity {
    // the app's home on Cloudflare; the old GitHub address is opened only once, to carry notes over
    private static final String ORIGIN = "https://mustatar.dawajund.workers.dev";
    private static final String OLD_ORIGIN = "https://mustatar-app.github.io";
    private static final String SHARE_PATH = "/__mustatar_share/";
    private static final int PICK = 1, AUDIO = 2, NOTIFY = 3, LOCATION = 4;
    private WebView web;
    private ValueCallback<Uri[]> picker;
    private PermissionRequest microphone;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;
    private volatile SharedFile shared;
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

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receive(intent, false);
    }

    private void receive(Intent intent, boolean first) {
        Uri data = intent.getData();
        if (first && testHome != null) { getSharedPreferences("mustatar", MODE_PRIVATE).edit().putBoolean("moved", true).apply(); web.loadUrl(testHome.toString() + "/"); return; }
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream == null && intent.getClipData() != null) stream = intent.getClipData().getItemAt(0).getUri();
            shared = stream != null && "content".equals(stream.getScheme()) ? new SharedFile(stream, intent.getType()) : null;
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
            + (file == null ? "null" : JSONObject.quote(file.name)) + ")", null);
        sharedText = null;
    }

    private WebResourceResponse sharedResponse(Uri url) {
        SharedFile file = shared;
        if (file == null || !local(url) || !(SHARE_PATH + file.token).equals(url.getPath())) return null;
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
            type = mime == null ? "application/octet-stream" : mime;
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
        if (code == LOCATION && locationCallback != null) {
            locationCallback.invoke(locationOrigin, grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED, false);
            locationCallback = null;
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FileOut.CREATE) files.placed(result, data);
        if (code == PICK && picker != null) {
            picker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            picker = null;
        }
    }

    @Override protected void onResume() { super.onResume(); refreshReminders(); }

    private void refreshReminders() {
        ReminderReceiver.schedule(this);
        if (web != null) web.evaluateJavascript("window.JundCal?.pushSync()", null);
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
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
