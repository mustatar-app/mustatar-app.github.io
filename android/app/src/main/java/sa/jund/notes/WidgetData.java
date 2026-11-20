package sa.jund.notes;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The home-screen widgets. The app hands them their data directly (prayer times for the coming days, your items,
 * the Hijri date, the style and the language), so they work without any set-up and without the internet.
 * If the app has not opened since this version, the older way (the app's server) is used.
 *
 *   Today        — the date, the next prayer, and what comes next today (your items and the prayers, in time order)
 *   Next prayer  — its name and time, a countdown that moves by itself, and the five prayers as dots
 *   My day       — the whole day on one line (prayers, your items, and where you are now)
 *   Month        — this month at a glance, with the next two items
 *   Reminder     — a short Quran / hadith / wisdom line that changes through the day
 */
public final class WidgetData {
    static final String PREFS = "daftar_widget";
    static final String TICK = "app.mustatar.WIDGET_TICK";
    private static final String[] PRAYERS = {"Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"};
    private static final String[] PRAYERS_AR = {"الفجر", "الظهر", "العصر", "المغرب", "العشاء"};

    private WidgetData() {}

    /** The app sends the widgets' data (MainActivity, action "widget"). */
    static void saveLocal(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("local", json).putLong("localAt", System.currentTimeMillis()).apply();
        refreshAll(ctx);
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] big = m.getAppWidgetIds(new ComponentName(ctx, DaftarWidget.class));
        int[] small = m.getAppWidgetIds(new ComponentName(ctx, PrayerWidget.class));
        int[] day = m.getAppWidgetIds(new ComponentName(ctx, DayWidget.class));
        int[] wis = m.getAppWidgetIds(new ComponentName(ctx, WisdomWidget.class));
        int[] mon = m.getAppWidgetIds(new ComponentName(ctx, MonthWidget.class));
        new Thread(() -> {
            JSONObject data = load(ctx);
            for (int id : big) safe(m, id, () -> drawToday(ctx, data, rowsFor(m, id)));
            for (int id : small) safe(m, id, () -> drawPrayer(ctx, data));
            for (int id : day) safe(m, id, () -> drawDay(ctx, data));
            for (int id : wis) safe(m, id, () -> drawWisdom(ctx, data));
            for (int id : mon) safe(m, id, () -> drawMonth(ctx, data));
            if (big.length + small.length + day.length + mon.length > 0) scheduleTick(ctx, data);
        }).start();
    }
    private interface Draw { RemoteViews run() throws Exception; }
    /** How many rows fit in the Today widget at the size the person made it (no half-cut last row). */
    static int rowsFor(AppWidgetManager m, int id) {
        try {
            android.os.Bundle o = m.getAppWidgetOptions(id);
            int h = Math.max(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0), o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0));
            if (h <= 0) return 3;
            return Math.max(1, Math.min(5, (h - 96) / 27));
        } catch (Exception e) { return 3; }
    }
    /** Arabic: the whole widget runs right to left. */
    private static void direction(RemoteViews v, JSONObject d) { if (ar(d)) v.setInt(R.id.w_root, "setLayoutDirection", View.LAYOUT_DIRECTION_RTL); }
    private static void safe(AppWidgetManager m, int id, Draw d) { try { m.updateAppWidget(id, d.run()); } catch (Exception ignored) {} }

    /* ---------- data ---------- */
    static JSONObject load(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String local = p.getString("local", null);
        if (local != null) try { return new JSONObject(local); } catch (Exception ignored) {}
        JSONObject s = fetch(ctx);
        if (s == null) return null;
        // the server's older shape → the same shape the app sends
        try {
            JSONObject out = new JSONObject();
            JSONObject prayers = new JSONObject();
            Calendar c = Calendar.getInstance();
            if (s.optJSONObject("today") != null) prayers.put(key(c), s.optJSONObject("today"));
            c.add(Calendar.DAY_OF_MONTH, 1);
            if (s.optJSONObject("tomorrow") != null) prayers.put(key(c), s.optJSONObject("tomorrow"));
            out.put("prayers", prayers).put("items", s.optJSONArray("upcoming") == null ? new JSONArray() : s.optJSONArray("upcoming"))
                .put("style", s.optString("style", "dark")).put("wisdom", s.optJSONArray("wisdom"));
            return out;
        } catch (Exception e) { return null; }
    }

    static JSONObject fetch(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = p.getString("id", null), server = p.getString("server", null);
        if (id == null || server == null) return null;
        try {
            String date = new SimpleDateFormat("dd-MM-yyyy", Locale.US).format(Calendar.getInstance().getTime());
            HttpURLConnection c = (HttpURLConnection) new URL(server + "/widget?id=" + id + "&date=" + date).openConnection();
            c.setConnectTimeout(8000); c.setReadTimeout(8000);
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                String line; while ((line = r.readLine()) != null) sb.append(line);
            }
            p.edit().putString("last", sb.toString()).apply();
            return new JSONObject(sb.toString());
        } catch (Exception e) {
            try { String last = p.getString("last", null); return last == null ? null : new JSONObject(last); } catch (Exception ignored) { return null; }
        }
    }

    static String key(Calendar c) { return String.format(Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH)); }
    private static boolean ar(JSONObject d) { return d != null && "ar".equals(d.optString("lang")); }
    private static String t(JSONObject d, String en, String a) { return ar(d) ? a : en; }

    /** A colour set for the chosen style. */
    private static final class Look {
        final boolean light; final int bg, ink, sub, faint, accent, chip;
        Look(JSONObject d) {
            String style = d == null ? "dark" : d.optString("style", "dark");
            light = "white".equals(style);
            bg = "clear".equals(style) ? R.drawable.widget_bg_clear : "black".equals(style) ? R.drawable.widget_bg_black : light ? R.drawable.widget_bg_white : R.drawable.widget_bg_dark;
            ink = light ? 0xFF111113 : 0xFFFFFFFF; sub = light ? 0xFF5F6170 : 0xCCFFFFFF; faint = light ? 0xFF8A8D99 : 0x99FFFFFF;
            accent = light ? 0xFF1A6FD8 : 0xFF8CCBFF; chip = light ? R.drawable.widget_chip_light : R.drawable.widget_chip;
        }
    }
    private static void openOnTap(Context ctx, RemoteViews v, String view, int code) {
        Intent open = new Intent(ctx, MainActivity.class).setAction(Intent.ACTION_VIEW)
            .setData(android.net.Uri.parse("https://mustatar.dawajund.workers.dev/?view=" + view));
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, code, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
    }

    private static int minutes(String hhmm) {
        String[] x = hhmm.substring(0, 5).split(":");
        return Integer.parseInt(x[0]) * 60 + Integer.parseInt(x[1]);
    }
    static String clock(JSONObject d, int mins) {
        int h = mins / 60 % 24, m = mins % 60;
        if (ar(d)) return String.format(new Locale("ar"), "%d:%02d %s", (h % 12) == 0 ? 12 : h % 12, m, h < 12 ? "ص" : "م");
        return String.format(Locale.US, "%d:%02d %s", (h % 12) == 0 ? 12 : h % 12, m, h < 12 ? "am" : "pm");
    }
    static String inTime(JSONObject d, long ms) {
        long min = Math.max(0, (ms + 59_999) / 60_000);
        if (ar(d)) return min >= 60 ? "بعد " + (min / 60) + " س " + (min % 60) + " د" : "بعد " + min + " د";
        return min >= 60 ? "in " + (min / 60) + "h " + (min % 60) + "m" : "in " + min + " min";
    }
    private static JSONObject prayersOn(JSONObject d, Calendar day) {
        JSONObject all = d == null ? null : d.optJSONObject("prayers");
        return all == null ? null : all.optJSONObject(key(day));
    }

    /** One thing on a day's line: a prayer or an item. */
    static final class Entry implements Comparable<Entry> {
        final long at, end; final String title; final boolean prayer, timed; final int color;
        Entry(long at, long end, String title, boolean prayer, boolean timed, int color) { this.at = at; this.end = end; this.title = title; this.prayer = prayer; this.timed = timed; this.color = color; }
        @Override public int compareTo(Entry o) { return Long.compare(at, o.at); }
    }
    private static int typeColor(String type, Look k) {
        switch (type == null ? "" : type) {
            case "class": return 0xFF34D399; case "exam": return 0xFFF87171; case "meeting": return 0xFFC084FC;
            case "homework": return 0xFFFBBF24; case "study": return 0xFF60A5FA; default: return k.accent;
        }
    }
    /** Today's (and, after Isha, tomorrow morning's) prayers and items that have not ended, in time order. */
    static List<Entry> ahead(JSONObject d, Look k, long now, int days) {
        List<Entry> out = new ArrayList<>();
        Calendar c = Calendar.getInstance();
        for (int i = 0; i < days; i++) {
            JSONObject p = prayersOn(d, c);
            if (p != null) for (int j = 0; j < 5; j++) {
                String s = p.optString(PRAYERS[j], "");
                if (s.length() < 5) continue;
                Calendar at = (Calendar) c.clone(); int mm = minutes(s);
                at.set(Calendar.HOUR_OF_DAY, mm / 60); at.set(Calendar.MINUTE, mm % 60); at.set(Calendar.SECOND, 0); at.set(Calendar.MILLISECOND, 0);
                long ms = at.getTimeInMillis();
                if (ms + 20 * 60_000L >= now) out.add(new Entry(ms, ms + 20 * 60_000L, ar(d) ? PRAYERS_AR[j] : PRAYERS[j], true, true, k.accent));
            }
            c.add(Calendar.DAY_OF_MONTH, 1);
        }
        JSONArray items = d == null ? null : d.optJSONArray("items");
        if (items != null) for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i); if (it == null) continue;
            long at = it.optLong("at"), end = it.optLong("end", at + 3600_000L);
            if (end < now) continue;
            out.add(new Entry(at, end, it.optString("title"), false, it.optBoolean("timed", true), typeColor(it.optString("type"), k)));
        }
        Collections.sort(out);
        return out;
    }
    private static boolean sameDay(long a, long b) {
        Calendar x = Calendar.getInstance(), y = Calendar.getInstance(); x.setTimeInMillis(a); y.setTimeInMillis(b);
        return x.get(Calendar.YEAR) == y.get(Calendar.YEAR) && x.get(Calendar.DAY_OF_YEAR) == y.get(Calendar.DAY_OF_YEAR);
    }
    /** The next prayer from now: [index, time in ms], or null. */
    private static long[] nextPrayer(JSONObject d, long now) {
        Calendar c = Calendar.getInstance();
        for (int i = 0; i < 2; i++) {
            JSONObject p = prayersOn(d, c);
            if (p != null) for (int j = 0; j < 5; j++) {
                String s = p.optString(PRAYERS[j], ""); if (s.length() < 5) continue;
                Calendar at = (Calendar) c.clone(); int mm = minutes(s);
                at.set(Calendar.HOUR_OF_DAY, mm / 60); at.set(Calendar.MINUTE, mm % 60); at.set(Calendar.SECOND, 0); at.set(Calendar.MILLISECOND, 0);
                if (at.getTimeInMillis() > now) return new long[]{j, at.getTimeInMillis()};
            }
            c.add(Calendar.DAY_OF_MONTH, 1);
        }
        return null;
    }
    private static String hijri(JSONObject d, Calendar c) {
        JSONObject h = d == null ? null : d.optJSONObject("hijri");
        return h == null ? "" : h.optString(key(c), "");
    }
    private static Locale loc(JSONObject d) { return ar(d) ? new Locale("ar") : Locale.UK; }

    /* ---------- Today ---------- */
    static RemoteViews drawToday(Context ctx, JSONObject d, int maxRows) {
        Look k = new Look(d);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);
        direction(v, d);
        v.setInt(R.id.w_root, "setBackgroundResource", k.bg);
        openOnTap(ctx, v, "assistant", 10);
        long now = System.currentTimeMillis();
        Calendar today = Calendar.getInstance();
        v.setTextViewText(R.id.w_day, new SimpleDateFormat("EEEE", loc(d)).format(today.getTime()));
        v.setTextViewText(R.id.w_date, new SimpleDateFormat(ar(d) ? "d MMMM" : "d MMMM", loc(d)).format(today.getTime()));
        String hj = hijri(d, today);
        v.setTextViewText(R.id.w_hijri, hj); v.setViewVisibility(R.id.w_hijri, hj.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextColor(R.id.w_day, k.accent); v.setTextColor(R.id.w_date, k.ink); v.setTextColor(R.id.w_hijri, k.faint);
        if (d == null) {
            v.setViewVisibility(R.id.w_chip, View.GONE);
            v.setTextViewText(R.id.w_empty, "Open Mustatar once to fill this in."); v.setViewVisibility(R.id.w_empty, View.VISIBLE);
            v.setTextColor(R.id.w_empty, k.faint);
            return v;
        }
        long[] np = nextPrayer(d, now);
        if (np != null) {
            v.setViewVisibility(R.id.w_chip, View.VISIBLE); v.setInt(R.id.w_chip, "setBackgroundResource", k.chip);
            int i = (int) np[0];
            Calendar at = Calendar.getInstance(); at.setTimeInMillis(np[1]);
            v.setTextViewText(R.id.w_next_name, (ar(d) ? PRAYERS_AR[i] : PRAYERS[i]) + "  " + clock(d, at.get(Calendar.HOUR_OF_DAY) * 60 + at.get(Calendar.MINUTE)));
            v.setTextViewText(R.id.w_next_in, inTime(d, np[1] - now));
            v.setTextColor(R.id.w_next_name, k.accent); v.setTextColor(R.id.w_next_in, k.sub);
        } else v.setViewVisibility(R.id.w_chip, View.GONE);
        // what comes next: today's items and prayers (after the next prayer, which is in the corner)
        List<Entry> list = ahead(d, k, now, 2);
        int[] rows = {R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4, R.id.w_r5}, times = {R.id.w_t1, R.id.w_t2, R.id.w_t3, R.id.w_t4, R.id.w_t5},
            bars = {R.id.w_b1, R.id.w_b2, R.id.w_b3, R.id.w_b4, R.id.w_b5}, names = {R.id.w_n1, R.id.w_n2, R.id.w_n3, R.id.w_n4, R.id.w_n5};
        int shown = 0;
        for (Entry e : list) {
            if (shown >= maxRows) break;
            if (!sameDay(e.at, now) && !(e.prayer && shown < 2 && e.at - now < 12 * 3600_000L) && !(!e.prayer && e.at - now < 18 * 3600_000L)) continue;
            Calendar c = Calendar.getInstance(); c.setTimeInMillis(e.at);
            boolean doing = e.at <= now && e.end > now;
            String time = doing ? t(d, "Now", "الآن") : !e.timed ? t(d, "All day", "اليوم") : clock(d, c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE));
            if (!sameDay(e.at, now)) time = t(d, "Tmrw ", "غدًا ") + (e.timed ? clock(d, c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)).replace(" am", "").replace(" pm", "") : "");
            v.setViewVisibility(rows[shown], View.VISIBLE);
            v.setTextViewText(times[shown], time); v.setTextColor(times[shown], doing ? k.accent : k.sub);
            v.setInt(bars[shown], "setColorFilter", e.prayer ? ((k.ink & 0x00FFFFFF) | 0x55000000) : e.color);
            v.setTextViewText(names[shown], e.title); v.setTextColor(names[shown], e.prayer ? k.sub : k.ink);
            shown++;
        }
        for (int i = shown; i < 5; i++) v.setViewVisibility(rows[i], View.GONE);
        if (shown == 0) { v.setTextViewText(R.id.w_empty, t(d, "Nothing else today.", "لا شيء آخر اليوم.")); v.setTextColor(R.id.w_empty, k.faint); v.setViewVisibility(R.id.w_empty, View.VISIBLE); }
        else v.setViewVisibility(R.id.w_empty, View.GONE);
        return v;
    }

    /* ---------- Next prayer ---------- */
    static RemoteViews drawPrayer(Context ctx, JSONObject d) {
        Look k = new Look(d);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_prayer2);
        direction(v, d);
        v.setInt(R.id.w_root, "setBackgroundResource", k.bg);
        openOnTap(ctx, v, "assistant", 11);
        long now = System.currentTimeMillis();
        Calendar today = Calendar.getInstance();
        String hj = hijri(d, today);
        v.setTextViewText(R.id.w_hijri, hj.isEmpty() ? new SimpleDateFormat("EEEE d MMM", loc(d)).format(today.getTime()) : hj);
        v.setTextColor(R.id.w_hijri, k.faint); v.setTextColor(R.id.w_pname, k.ink); v.setTextColor(R.id.w_ptime, k.sub); v.setTextColor(R.id.w_count, k.accent);
        long[] np = d == null ? null : nextPrayer(d, now);
        if (np == null) { v.setTextViewText(R.id.w_pname, "Mustatar"); v.setTextViewText(R.id.w_ptime, d == null ? "Open Mustatar once" : ""); v.setViewVisibility(R.id.w_count, View.GONE); return v; }
        int i = (int) np[0];
        Calendar at = Calendar.getInstance(); at.setTimeInMillis(np[1]);
        v.setTextViewText(R.id.w_pname, ar(d) ? PRAYERS_AR[i] : PRAYERS[i]);
        v.setTextViewText(R.id.w_ptime, clock(d, at.get(Calendar.HOUR_OF_DAY) * 60 + at.get(Calendar.MINUTE)));
        // a countdown the phone moves by itself, every second (no need to wake the app)
        if (Build.VERSION.SDK_INT >= 24) {
            v.setChronometer(R.id.w_count, SystemClock.elapsedRealtime() + (np[1] - now), (ar(d) ? "بعد " : "in ") + "%s", true);
            v.setChronometerCountDown(R.id.w_count, true);
            v.setViewVisibility(R.id.w_count, View.VISIBLE);
        } else { v.setViewVisibility(R.id.w_count, View.GONE); v.setTextViewText(R.id.w_ptime, clock(d, at.get(Calendar.HOUR_OF_DAY) * 60 + at.get(Calendar.MINUTE)) + " · " + inTime(d, np[1] - now)); }
        // the five prayers of today: passed (filled), next (bright and bigger), later (rings)
        JSONObject p = prayersOn(d, today);
        int W = 500, H = 44, x0 = 22, x1 = W - 22, y = H / 2;
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG); line.setStrokeWidth(4); line.setColor((k.ink & 0x00FFFFFF) | 0x33000000);
        c.drawLine(x0, y, x1, y, line);
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        boolean tomorrow = !sameDay(np[1], now);
        boolean rtl = ar(d);   // Arabic: Fajr on the right
        for (int j = 0; j < 5; j++) {
            float x = rtl ? x1 - (x1 - x0) * j / 4f : x0 + (x1 - x0) * j / 4f;
            boolean past = !tomorrow && j < i, next = j == i;
            if (past) { line.setColor((k.ink & 0x00FFFFFF) | 0x99000000); if (j > 0) c.drawLine(rtl ? x1 - (x1 - x0) * (j - 1) / 4f : x0 + (x1 - x0) * (j - 1) / 4f, y, x, y, line); }
            dot.setStyle(past || next ? Paint.Style.FILL : Paint.Style.STROKE); dot.setStrokeWidth(4);
            dot.setColor(next ? k.accent : past ? ((k.ink & 0x00FFFFFF) | 0x99000000) : ((k.ink & 0x00FFFFFF) | 0x80000000));
            if (next) { Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG); glow.setColor((k.accent & 0x00FFFFFF) | 0x40000000); c.drawCircle(x, y, 19, glow); }
            c.drawCircle(x, y, next ? 11 : 8, dot);
        }
        v.setImageViewBitmap(R.id.w_dots, bmp);
        if (p == null) v.setViewVisibility(R.id.w_dots, View.GONE);
        return v;
    }

    /* ---------- Month ---------- */
    static RemoteViews drawMonth(Context ctx, JSONObject d) {
        Look k = new Look(d);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_month);
        direction(v, d);
        v.setInt(R.id.w_root, "setBackgroundResource", k.bg);
        openOnTap(ctx, v, "calendar", 12);
        long now = System.currentTimeMillis();
        Calendar today = Calendar.getInstance();
        v.setTextViewText(R.id.w_date, new SimpleDateFormat("MMMM yyyy", loc(d)).format(today.getTime()));
        String hj = hijri(d, today); int sp = hj.indexOf(' ');
        v.setTextViewText(R.id.w_hijri, sp > 0 ? hj.substring(sp + 1) : hj);
        v.setTextColor(R.id.w_date, k.ink); v.setTextColor(R.id.w_hijri, k.faint);
        // days that have something
        Set<String> busy = new HashSet<>();
        JSONArray items = d == null ? null : d.optJSONArray("items");
        if (items != null) for (int i = 0; i < items.length(); i++) { JSONObject it = items.optJSONObject(i); if (it == null) continue; Calendar c = Calendar.getInstance(); c.setTimeInMillis(it.optLong("at")); busy.add(key(c)); }
        JSONArray marked = d == null ? null : d.optJSONArray("busyDays");
        if (marked != null) for (int i = 0; i < marked.length(); i++) busy.add(marked.optString(i));
        // the grid
        int weekStart = d == null ? Calendar.SUNDAY : d.optInt("weekStart", 0) + 1;   // the app's setting: 0 = Sunday
        int W = 700, H = 470, cols = 7;
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG); tp.setTextAlign(Paint.Align.CENTER); tp.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        float cw = W / (float) cols, top = 44;
        Calendar head = Calendar.getInstance(); head.set(Calendar.DAY_OF_WEEK, weekStart);
        SimpleDateFormat dow = new SimpleDateFormat("EEEEE", loc(d));
        tp.setTextSize(26); tp.setColor(k.faint);
        boolean rtl = ar(d);   // Arabic: the week runs from right to left
        for (int i = 0; i < 7; i++) { float hx = rtl ? W - (cw * i + cw / 2) : cw * i + cw / 2; c.drawText(dow.format(head.getTime()), hx, 30, tp); head.add(Calendar.DAY_OF_MONTH, 1); }
        Calendar first = Calendar.getInstance(); first.set(Calendar.DAY_OF_MONTH, 1);
        int offset = (first.get(Calendar.DAY_OF_WEEK) - weekStart + 7) % 7, daysIn = first.getActualMaximum(Calendar.DAY_OF_MONTH);
        int rowsN = (offset + daysIn + 6) / 7; float rh = (H - top) / (float) rowsN;
        for (int n = 1; n <= daysIn; n++) {
            int cell = offset + n - 1; float cx = cw * (cell % 7) + cw / 2, cy = top + rh * (cell / 7) + rh / 2;
            if (rtl) cx = W - cx;
            Calendar day = (Calendar) first.clone(); day.set(Calendar.DAY_OF_MONTH, n);
            boolean isToday = n == today.get(Calendar.DAY_OF_MONTH), past = n < today.get(Calendar.DAY_OF_MONTH);
            if (isToday) { dot.setColor(k.accent); c.drawCircle(cx, cy - 4, Math.min(cw, rh) * 0.36f, dot); }
            tp.setTextSize(30); tp.setColor(isToday ? (k.light ? 0xFFFFFFFF : 0xFF0B0B0D) : past ? k.faint : k.ink);
            c.drawText(String.valueOf(n), cx, cy + 6, tp);
            if (busy.contains(key(day)) && !isToday) { dot.setColor(past ? k.faint : k.accent); c.drawCircle(cx, cy + rh * 0.3f, 4.5f, dot); }
        }
        v.setImageViewBitmap(R.id.w_grid, bmp);
        // the next two items
        List<Entry> list = ahead(d, k, now, 0);
        int[] rows = {R.id.w_r1, R.id.w_r2}, times = {R.id.w_t1, R.id.w_t2}, bars = {R.id.w_b1, R.id.w_b2}, names = {R.id.w_n1, R.id.w_n2};
        int shown = 0;
        for (Entry e : list) {
            if (shown >= 2 || e.prayer) continue;
            Calendar ce = Calendar.getInstance(); ce.setTimeInMillis(e.at);
            String when = sameDay(e.at, now) ? (e.timed ? clock(d, ce.get(Calendar.HOUR_OF_DAY) * 60 + ce.get(Calendar.MINUTE)) : t(d, "Today", "اليوم"))
                : new SimpleDateFormat("EEE d", loc(d)).format(ce.getTime());
            v.setViewVisibility(rows[shown], View.VISIBLE);
            v.setTextViewText(times[shown], when); v.setTextColor(times[shown], k.sub);
            v.setInt(bars[shown], "setColorFilter", e.color);
            v.setTextViewText(names[shown], e.title); v.setTextColor(names[shown], k.ink);
            shown++;
        }
        for (int i = shown; i < 2; i++) v.setViewVisibility(rows[i], View.GONE);
        return v;
    }

    /* ---------- Reminder (wisdom) ---------- */
    static RemoteViews drawWisdom(Context ctx, JSONObject data) {
        Look k = new Look(data);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_wisdom);
        v.setInt(R.id.w_root, "setBackgroundResource", k.bg);
        v.setTextColor(R.id.w_wis, k.ink);
        v.setTextColor(R.id.w_wis_src, k.faint);
        openOnTap(ctx, v, "assistant", 3);
        JSONArray list = data == null ? null : data.optJSONArray("wisdom");
        if (list == null || list.length() == 0) {
            v.setTextViewText(R.id.w_wis, "Mustatar");
            v.setTextViewText(R.id.w_wis_src, data == null ? "Open Mustatar once" : "");
            return v;
        }
        int i = (int) ((System.currentTimeMillis() / (3L * 3600000L)) % list.length());
        JSONObject it = list.optJSONObject(i);
        if (it != null) { v.setTextViewText(R.id.w_wis, it.optString("t")); v.setTextViewText(R.id.w_wis_src, it.optString("s")); }
        return v;
    }

    /* ---------- My day: the whole day on one line ---------- */
    static RemoteViews drawDay(Context ctx, JSONObject data) {
        Look k = new Look(data);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_day);
        direction(v, data);
        v.setInt(R.id.w_root, "setBackgroundResource", k.bg);
        int ink = k.ink, sub = k.sub, accent = k.accent;
        v.setTextColor(R.id.w_prayer, ink); v.setTextColor(R.id.w_prayer_time, sub);
        openOnTap(ctx, v, "assistant", 2);
        if (data == null) { v.setTextViewText(R.id.w_prayer, "Mustatar"); v.setTextViewText(R.id.w_prayer_time, "Open Mustatar once"); return v; }
        long nowMs = System.currentTimeMillis();
        Calendar now = Calendar.getInstance();
        int mins = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        JSONObject today = prayersOn(data, now);
        // the header: the next thing (an item, or the next prayer)
        List<Entry> list = ahead(data, k, nowMs, 1);
        Entry next = null; for (Entry e : list) if (e.at > nowMs) { next = e; break; }
        if (next != null) {
            Calendar ce = Calendar.getInstance(); ce.setTimeInMillis(next.at);
            v.setTextViewText(R.id.w_prayer, next.title + "  " + (next.timed ? clock(data, ce.get(Calendar.HOUR_OF_DAY) * 60 + ce.get(Calendar.MINUTE)) : ""));
            v.setTextViewText(R.id.w_prayer_time, inTime(data, next.at - nowMs));
        } else { v.setTextViewText(R.id.w_prayer, new SimpleDateFormat("EEEE", loc(data)).format(now.getTime())); v.setTextViewText(R.id.w_prayer_time, ""); }

        // the picture: a 24-hour line, the five prayers (passed / next / later), today's items as small squares, and "now"
        int W = 1000, H = 230, x0 = 40, x1 = W - 40, y = 120;
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG); line.setStrokeWidth(8); line.setStrokeCap(Paint.Cap.ROUND);
        line.setColor((ink & 0x00FFFFFF) | 0x40000000); c.drawLine(x0, y, x1, y, line);
        float nowX = x0 + (x1 - x0) * mins / 1440f;
        line.setColor((ink & 0x00FFFFFF) | 0x99000000); c.drawLine(x0, y, nowX, y, line);
        Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG); txt.setTextAlign(Paint.Align.CENTER); txt.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        if (!k.light) txt.setShadowLayer(4, 0, 2, 0x66000000);
        for (Entry e : list) {
            if (e.prayer || !e.timed || !sameDay(e.at, nowMs)) continue;
            Calendar ci = Calendar.getInstance(); ci.setTimeInMillis(e.at);
            float ix = x0 + (x1 - x0) * (ci.get(Calendar.HOUR_OF_DAY) * 60 + ci.get(Calendar.MINUTE)) / 1440f;
            dot.setColor(e.color); c.drawRoundRect(new RectF(ix - 9, y - 9, ix + 9, y + 9), 4, 4, dot);
        }
        int nextIdx = -1;
        if (today != null) for (int i = 0; i < 5; i++) { String s = today.optString(PRAYERS[i], ""); if (s.length() >= 5 && minutes(s) > mins) { nextIdx = i; break; } }
        if (today != null) for (int i = 0; i < 5; i++) {
            String s = today.optString(PRAYERS[i], ""); if (s.length() < 5) continue;
            int pm = minutes(s); float px = x0 + (x1 - x0) * pm / 1440f;
            boolean past = pm <= mins, isNext = i == nextIdx;
            dot.setStyle(past || isNext ? Paint.Style.FILL : Paint.Style.STROKE); dot.setStrokeWidth(5);
            dot.setColor(isNext ? accent : past ? ((ink & 0x00FFFFFF) | 0x99000000) : ink);
            c.drawCircle(px, y, isNext ? 14 : 10, dot);
            boolean upLabel = i % 2 == 1;
            txt.setColor(isNext ? accent : ink); txt.setTextSize(30); txt.setFakeBoldText(isNext);
            c.drawText(ar(data) ? PRAYERS_AR[i] : PRAYERS[i], px, upLabel ? y - 52 : y + 62, txt);
            txt.setColor(sub); txt.setTextSize(24); txt.setFakeBoldText(false);
            c.drawText(clock(data, pm).replace(" am", "").replace(" pm", "").replace(" ص", "").replace(" م", ""), px, upLabel ? y - 24 : y + 90, txt);
        }
        dot.setStyle(Paint.Style.FILL); dot.setColor(ink); c.drawCircle(nowX, y, 12, dot);
        dot.setColor((ink & 0x00FFFFFF) | 0x33000000); c.drawCircle(nowX, y, 22, dot);
        v.setImageViewBitmap(R.id.w_day, bmp);
        return v;
    }

    /* ---------- keep them right through the day: wake at the next change (a prayer, an item, midnight) ---------- */
    static void scheduleTick(Context ctx, JSONObject d) {
        long now = System.currentTimeMillis(), next = now + 30 * 60_000L;
        Calendar mid = Calendar.getInstance(); mid.add(Calendar.DAY_OF_MONTH, 1);
        mid.set(Calendar.HOUR_OF_DAY, 0); mid.set(Calendar.MINUTE, 0); mid.set(Calendar.SECOND, 30);
        next = Math.min(next, mid.getTimeInMillis());
        if (d != null) for (Entry e : ahead(d, new Look(d), now, 2)) {
            if (e.at > now + 1000) { next = Math.min(next, e.at + 1000); break; }
            if (e.end > now + 1000) next = Math.min(next, e.end + 1000);
        }
        Intent i = new Intent(ctx, DaftarWidget.class).setAction(TICK);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 77, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        try { am.setAndAllowWhileIdle(AlarmManager.RTC, Math.max(now + 60_000L, next), pi); } catch (Exception ignored) {}
    }

    /** Test builds: each widget drawn into a picture (files/widgets/*.png), so the automatic test can look at them. */
    static void preview(Context ctx) {
        JSONObject d = load(ctx);
        java.io.File dir = new java.io.File(ctx.getFilesDir(), "widgets"); dir.mkdirs();
        String[] names = {"today", "prayer", "day", "month", "wisdom"};
        int[][] size = {{360, 190}, {180, 180}, {360, 120}, {360, 300}, {360, 120}};
        for (int n = 0; n < names.length; n++) {
            try {
                RemoteViews rv = n == 0 ? drawToday(ctx, d, 3) : n == 1 ? drawPrayer(ctx, d) : n == 2 ? drawDay(ctx, d) : n == 3 ? drawMonth(ctx, d) : drawWisdom(ctx, d);
                android.widget.FrameLayout host = new android.widget.FrameLayout(ctx);
                View view = rv.apply(ctx, host);
                float dp = ctx.getResources().getDisplayMetrics().density;
                int w = (int) (size[n][0] * dp), h = (int) (size[n][1] * dp);
                view.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
                view.layout(0, 0, w, h);
                Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                Canvas c = new Canvas(b); c.drawColor(0xFF3A4A5E); view.draw(c);
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(new java.io.File(dir, names[n] + ".png"))) { b.compress(Bitmap.CompressFormat.PNG, 100, out); }
            } catch (Exception e) {
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(new java.io.File(dir, names[n] + ".err"))) { out.write(String.valueOf(e).getBytes()); } catch (Exception ignored) {}
            }
        }
    }
}
