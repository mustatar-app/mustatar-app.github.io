package sa.jund.notes;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/* Mustatar's own alarm clock. The app sends the alarms (time, days, label); this rings them even when Mustatar is
   closed or the phone was restarted: the phone's real alarm (shown in the status bar), a loud alarm sound that repeats
   until you stop it (it rings through "do not disturb" like any alarm), and a full-screen page with Stop and Snooze. */
public class AlarmClock extends BroadcastReceiver {
    static final String CHANNEL = "mustatar-alarm-v1";
    static final String RING = "sa.jund.notes.ALARM_RING", STOP = "sa.jund.notes.ALARM_STOP", SNOOZE = "sa.jund.notes.ALARM_SNOOZE";
    static final int NOTE = 7311;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("mustatar-alarms", Context.MODE_PRIVATE); }

    /* the app's list: [{id, h, m, days:[0..6] (Sunday = 0; empty = once), label, on}] */
    static void replace(Context c, JSONArray list) {
        if (list.length() > 50) return;
        prefs(c).edit().putString("list", list.toString()).apply();
        schedule(c);
    }

    static long next(JSONObject a, long from) {
        int h = a.optInt("h", 7), m = a.optInt("m", 0);
        JSONArray days = a.optJSONArray("days");
        Calendar cal = Calendar.getInstance(); cal.setTimeInMillis(from);
        cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0); cal.set(Calendar.HOUR_OF_DAY, h); cal.set(Calendar.MINUTE, m);
        for (int i = 0; i < 8; i++) {
            if (cal.getTimeInMillis() > from + 1000) {
                if (days == null || days.length() == 0) return cal.getTimeInMillis();
                int dow = cal.get(Calendar.DAY_OF_WEEK) - 1;
                for (int k = 0; k < days.length(); k++) if (days.optInt(k, -1) == dow) return cal.getTimeInMillis();
            }
            cal.add(Calendar.DAY_OF_YEAR, 1); cal.set(Calendar.HOUR_OF_DAY, h); cal.set(Calendar.MINUTE, m);
        }
        return 0;
    }

    /* the soonest alarm is given to the phone as a real alarm clock; when it rings, the next one is set */
    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent ring = pending(c, RING, null, 1);
        am.cancel(ring);
        long now = System.currentTimeMillis(), best = 0; String bestId = null, label = "";
        try {
            JSONArray list = new JSONArray(prefs(c).getString("list", "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.getJSONObject(i);
                if (!a.optBoolean("on", true)) continue;
                long at = next(a, now);
                if (at > 0 && (best == 0 || at < best)) { best = at; bestId = a.optString("id"); label = a.optString("label"); }
            }
        } catch (Exception ignored) {}
        long snooze = prefs(c).getLong("snoozeAt", 0);
        if (snooze > now && (best == 0 || snooze < best)) { best = snooze; bestId = "snooze"; label = prefs(c).getString("snoozeLabel", ""); }
        if (best == 0) return;
        prefs(c).edit().putString("nextId", bestId).putString("nextLabel", label).putLong("nextAt", best).apply();
        Intent show = new Intent(c, MainActivity.class).setAction(Intent.ACTION_VIEW).setData(Uri.parse("https://mustatar.dawajund.workers.dev/?view=alarm"));
        PendingIntent showPi = PendingIntent.getActivity(c, 7312, show, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try { am.setAlarmClock(new AlarmManager.AlarmClockInfo(best, showPi), pending(c, RING, bestId, 1)); }
        catch (SecurityException e) {
            // without the "alarms and reminders" permission: the closest the phone allows
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, best, pending(c, RING, bestId, 1));
        }
    }

    static PendingIntent pending(Context c, String action, String id, int code) {
        Intent i = new Intent(c, AlarmClock.class).setAction(action);
        if (id != null) i.putExtra("id", id);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void channel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Alarm · المنبّه", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Mustatar alarms ring loudly until you stop them");
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        ch.setSound(sound, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ch.enableVibration(true); ch.setVibrationPattern(new long[]{0, 600, 400, 600, 400, 600});
        ch.setBypassDnd(true); ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    @Override public void onReceive(Context c, Intent intent) {
        String action = intent.getAction() == null ? "" : intent.getAction();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (STOP.equals(action)) { AlarmService.stop(c); nm.cancel(NOTE); return; }
        if (SNOOZE.equals(action)) {
            AlarmService.stop(c); nm.cancel(NOTE);
            int min = prefs(c).getInt("ringSnooze", 5);
            prefs(c).edit().putLong("snoozeAt", System.currentTimeMillis() + min * 60_000L).putString("snoozeLabel", prefs(c).getString("ringLabel", ""))
                .putString("snoozeOpts", prefs(c).getString("ringOpts", "{}")).apply();
            schedule(c); return;
        }
        if (!RING.equals(action)) { schedule(c); return; }   // the phone restarted or the time changed
        String id = intent.getStringExtra("id"); String label = prefs(c).getString("nextLabel", "");
        SharedPreferences.Editor e = prefs(c).edit().putString("ringLabel", label);
        JSONObject opts = new JSONObject();
        if ("snooze".equals(id)) { e.remove("snoozeAt"); try { opts = new JSONObject(prefs(c).getString("snoozeOpts", "{}")); } catch (Exception ignored) {} }
        // an alarm without days rings once, then turns itself off
        try {
            JSONArray list = new JSONArray(prefs(c).getString("list", "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.getJSONObject(i);
                if (a.optString("id").equals(id)) opts = a;   // this alarm's own sound, length, volume, vibration and snooze
                if (a.optString("id").equals(id) && (a.optJSONArray("days") == null || a.optJSONArray("days").length() == 0)) a.put("on", false);
            }
            e.putString("list", list.toString());
        } catch (Exception ignored) {}
        e.apply();
        ring(c, label, opts);
        schedule(c);
    }

    // the alarm plays its own sound (AlarmService); if the phone refuses that, the older notification sound rings instead
    static void ring(Context c, String label, JSONObject opts) {
        try { AlarmService.start(c, label, opts); return; } catch (Exception ignored) {}
        ring(c, label);
    }

    static void ring(Context c, String label) {
        channel(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        Intent full = new Intent(c, AlarmActivity.class).putExtra("label", label).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent fullPi = PendingIntent.getActivity(c, 7313, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = label == null || label.isEmpty() ? "⏰ Mustatar · مستطر" : "⏰ " + label;
        String time = android.text.format.DateFormat.getTimeFormat(c).format(new java.util.Date());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_mustatar).setContentTitle(title).setContentText(time).setCategory(Notification.CATEGORY_ALARM)
            .setFullScreenIntent(fullPi, true).setContentIntent(fullPi).setOngoing(true).setAutoCancel(false).setColor(0xFF1A6FD8)
            .addAction(new Notification.Action.Builder(null, "Stop · إيقاف", pending(c, STOP, null, 2)).build())
            .addAction(new Notification.Action.Builder(null, "Snooze 5 min · غفوة", pending(c, SNOOZE, null, 3)).build())
            .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(10 * 60_000L);
        else b.setPriority(Notification.PRIORITY_MAX).setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), android.media.AudioManager.STREAM_ALARM);
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT;   // the sound repeats until Stop
        try { nm.notify(NOTE, n); } catch (SecurityException ignored) {}
    }

    static JSONObject status(Context c) throws org.json.JSONException {
        boolean full = Build.VERSION.SDK_INT < 34 || c.getSystemService(NotificationManager.class).canUseFullScreenIntent();
        return new JSONObject().put("ok", true).put("exact", ReminderReceiver.exact(c)).put("fullScreen", full)
            .put("notifications", ReminderReceiver.notifications(c)).put("nextAt", prefs(c).getLong("nextAt", 0));
    }
}
