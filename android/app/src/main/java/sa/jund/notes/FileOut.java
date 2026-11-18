package sa.jund.notes;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Files made in the app (Studio pictures and videos, carousels, exported notes, recordings) leave the
 * app here. A web view cannot save a download or open the share sheet by itself, so the page sends the
 * file in pieces, and this class saves it in the phone's gallery or Downloads, or hands it to the
 * share sheet (Instagram, WhatsApp, Drive…).
 */
final class FileOut {
    static final int CREATE = 21;   // the "save as" screen, used on Android 9 and older

    interface Done { void done(String json); }

    private static final class Part {
        final File file; final String name, mime;
        OutputStream out;
        Part(File file, String name, String mime) { this.file = file; this.name = name; this.mime = mime; }
    }

    private final Activity activity;
    private final Map<String, Part> parts = new HashMap<>();
    private Part waitingForPlace;     // Android 9 and older: the file waiting for the "save as" screen
    private Done waitingDone;

    FileOut(Activity activity) {
        this.activity = activity;
        // files from earlier days are no longer needed (the share sheet has long finished with them)
        File[] old = dir().listFiles();
        if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 86_400_000L) f.delete();
    }

    private File dir() {
        File d = new File(activity.getCacheDir(), "out");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String safe(String name) {
        String s = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]+", " ").trim();
        if (s.isEmpty()) s = "Mustatar file";
        return s.length() > 90 ? s.substring(s.length() - 90) : s;
    }

    void start(String id, String name, String mime) throws Exception {
        Part old = parts.remove(id);
        if (old != null && old.out != null) old.out.close();
        File f = new File(dir(), id.replaceAll("[^A-Za-z0-9_-]", "") + "-" + safe(name));
        Part p = new Part(f, safe(name), mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
        p.out = new FileOutputStream(f);
        parts.put(id, p);
    }

    void chunk(String id, String base64) throws Exception {
        Part p = parts.get(id);
        if (p == null || p.out == null) throw new IllegalStateException("no such file");
        p.out.write(Base64.decode(base64, Base64.DEFAULT));
    }

    void end(String id) throws Exception {
        Part p = parts.get(id);
        if (p != null && p.out != null) { p.out.close(); p.out = null; }
    }

    private static String folderFor(String mime) {
        if (mime.startsWith("image/")) return Environment.DIRECTORY_PICTURES;
        if (mime.startsWith("video/")) return Environment.DIRECTORY_MOVIES;
        if (mime.startsWith("audio/")) return Environment.DIRECTORY_MUSIC;
        return Environment.DIRECTORY_DOWNLOADS;
    }

    /** Save each file where the phone keeps such files: pictures in the gallery, the rest in Downloads, in a "Mustatar" folder. */
    void save(List<String> ids, Done done) {
        List<Part> list = take(ids);
        if (list.isEmpty()) { done.done("{\"ok\":false,\"error\":\"nothing to save\"}"); return; }
        if (Build.VERSION.SDK_INT < 29) {
            // older phones: the "save as" screen for one file, the share sheet for several
            if (list.size() > 1) { share(ids, done); return; }
            waitingForPlace = list.get(0); waitingDone = done;
            Intent pick = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(waitingForPlace.mime).putExtra(Intent.EXTRA_TITLE, waitingForPlace.name);
            try { activity.startActivityForResult(pick, CREATE); }
            catch (ActivityNotFoundException e) { waitingForPlace = null; waitingDone = null; share(ids, done); }
            return;
        }
        new Thread(() -> {
            String where = "";
            try {
                ContentResolver cr = activity.getContentResolver();
                for (Part p : list) {
                    String folder = folderFor(p.mime);
                    Uri collection = folder.equals(Environment.DIRECTORY_PICTURES) ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                        : folder.equals(Environment.DIRECTORY_MOVIES) ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                        : folder.equals(Environment.DIRECTORY_MUSIC) ? MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                        : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, p.name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, p.mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, folder + "/Mustatar");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri item = cr.insert(collection, v);
                    if (item == null) throw new IllegalStateException("the phone did not make room for the file");
                    try (InputStream in = new FileInputStream(p.file); OutputStream out = cr.openOutputStream(item)) { copy(in, out); }
                    ContentValues ready = new ContentValues();
                    ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    cr.update(item, ready, null, null);
                    p.file.delete();
                    where = folder + "/Mustatar";
                }
                String w = where;
                activity.runOnUiThread(() -> done.done("{\"ok\":true,\"count\":" + list.size() + ",\"where\":\"" + w + "\"}"));
            } catch (Exception e) {
                String msg = String.valueOf(e.getMessage()).replace("\"", "'");
                activity.runOnUiThread(() -> done.done("{\"ok\":false,\"error\":\"" + msg + "\"}"));
            }
        }).start();
    }

    /** The "save as" screen answered (Android 9 and older). */
    void placed(int result, Intent data) {
        Part p = waitingForPlace; Done done = waitingDone;
        waitingForPlace = null; waitingDone = null;
        if (p == null || done == null) return;
        if (result != Activity.RESULT_OK || data == null || data.getData() == null) { done.done("{\"ok\":false,\"cancelled\":true}"); return; }
        try (InputStream in = new FileInputStream(p.file); OutputStream out = activity.getContentResolver().openOutputStream(data.getData())) {
            copy(in, out);
            p.file.delete();
            done.done("{\"ok\":true,\"count\":1,\"where\":\"chosen\"}");
        } catch (Exception e) {
            done.done("{\"ok\":false,\"error\":\"could not write the file\"}");
        }
    }

    /** Open the share sheet with the files (one or many). */
    void share(List<String> ids, Done done) {
        List<Part> list = take(ids);
        if (list.isEmpty()) { done.done("{\"ok\":false,\"error\":\"nothing to share\"}"); return; }
        ArrayList<Uri> uris = new ArrayList<>();
        String type = list.get(0).mime;
        for (Part p : list) {
            uris.add(FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", p.file, p.name));
            if (!p.mime.equals(type)) type = p.mime.split("/")[0].equals(type.split("/")[0]) ? type.split("/")[0] + "/*" : "*/*";
        }
        Intent send;
        if (uris.size() == 1) send = new Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris.get(0));
        else send = new Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
        send.setType(type);
        ClipData clip = ClipData.newRawUri(list.get(0).name, uris.get(0));
        for (int i = 1; i < uris.size(); i++) clip.addItem(new ClipData.Item(uris.get(i)));
        send.setClipData(clip);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
            done.done("{\"ok\":true,\"shared\":" + uris.size() + "}");
        } catch (ActivityNotFoundException e) {
            done.done("{\"ok\":false,\"error\":\"no app can take this file\"}");
        }
    }

    /** Share words (a note, a reminder, a caption) to any app. */
    void shareText(String text, String title, Done done) {
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        try { activity.startActivity(Intent.createChooser(send, null)); done.done("{\"ok\":true}"); }
        catch (ActivityNotFoundException e) { done.done("{\"ok\":false,\"error\":\"no app can take this text\"}"); }
    }

    private List<Part> take(List<String> ids) {
        List<Part> list = new ArrayList<>();
        for (String id : ids) {
            Part p = parts.remove(id);
            if (p == null) continue;
            if (p.out != null) { try { p.out.close(); } catch (Exception ignored) {} p.out = null; }
            if (p.file.exists() && p.file.length() > 0) list.add(p);
        }
        return list;
    }

    private static void copy(InputStream in, OutputStream out) throws Exception {
        if (out == null) throw new IllegalStateException("no place to write");
        byte[] buf = new byte[1 << 16];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }
}
