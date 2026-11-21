package sa.jund.notes;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

/* The ringing itself. Mustatar plays the alarm sound on its own (not as a notification sound, which some phones
   cut short or play quietly): looping on the phone's alarm volume, for as long as the person chose (1–30 minutes),
   at the volume they chose, optionally starting softly and rising, with vibration — until Stop or Snooze. */
public class AlarmService extends Service {
    static final String CHANNEL = "mustatar-alarm-v2";   // silent: the sound comes from here, not from the notification
    static final String EXTRA_OPTS = "opts", EXTRA_LABEL = "label";

    private MediaPlayer player;
    private Vibrator vibrator;
    private final Handler h = new Handler(Looper.getMainLooper());
    private AudioManager audio;
    private int volumeBefore = -1;
    private PowerManager.WakeLock wake;

    static void start(Context c, String label, org.json.JSONObject opts) {
        Intent i = new Intent(c, AlarmService.class).putExtra(EXTRA_LABEL, label).putExtra(EXTRA_OPTS, opts == null ? "{}" : opts.toString());
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static void stop(Context c) { c.stopService(new Intent(c, AlarmService.class)); }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String label = intent == null ? "" : intent.getStringExtra(EXTRA_LABEL);
        org.json.JSONObject o;
        try { o = new org.json.JSONObject(intent == null || intent.getStringExtra(EXTRA_OPTS) == null ? "{}" : intent.getStringExtra(EXTRA_OPTS)); }
        catch (Exception e) { o = new org.json.JSONObject(); }
        int minutes = Math.max(1, Math.min(30, o.optInt("ring", 10)));
        int snooze = Math.max(1, Math.min(30, o.optInt("snooze", 5)));
        AlarmClock.prefs(this).edit().putString("ringOpts", o.toString()).putInt("ringSnooze", snooze).apply();

        Notification n = notification(label, snooze);
        if (Build.VERSION.SDK_INT >= 29) startForeground(AlarmClock.NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(AlarmClock.NOTE, n);

        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null && wake == null) { wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mustatar:alarm"); wake.acquire(minutes * 60_000L + 30_000L); }

        stopSound();
        play(o);
        if (o.optBoolean("vib", true)) vibrate();
        h.removeCallbacksAndMessages(null);
        h.postDelayed(this::stopSelf, minutes * 60_000L);   // rings for the chosen time, then stops by itself
        if (o.optBoolean("rise", false)) rise(0);
        return START_NOT_STICKY;
    }

    private void play(org.json.JSONObject o) {
        audio = getSystemService(AudioManager.class);
        // the chosen volume (percent of the phone's alarm volume range); the phone's own setting comes back after
        int vol = o.optInt("vol", 0);
        if (audio != null && vol > 0) {
            try {
                int max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                volumeBefore = audio.getStreamVolume(AudioManager.STREAM_ALARM);
                audio.setStreamVolume(AudioManager.STREAM_ALARM, Math.max(1, Math.round(max * Math.min(100, vol) / 100f)), 0);
            } catch (Exception ignored) { volumeBefore = -1; }
        } else if (audio != null && audio.getStreamVolume(AudioManager.STREAM_ALARM) == 0) {
            // alarm volume set to zero would mean a silent alarm: use a third of the range
            try { volumeBefore = 0; audio.setStreamVolume(AudioManager.STREAM_ALARM, Math.max(1, audio.getStreamMaxVolume(AudioManager.STREAM_ALARM) / 3), 0); } catch (Exception ignored) {}
        }
        String chosen = o.optString("sound", "");
        Uri[] tries = {
            chosen.isEmpty() || "default".equals(chosen) ? null : Uri.parse(chosen),
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
            RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM),
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
        };
        for (Uri u : tries) {
            if (u == null) continue;
            try {
                MediaPlayer p = new MediaPlayer();
                p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                p.setDataSource(this, u);
                p.setLooping(true);
                p.prepare();
                if (o.optBoolean("rise", false)) p.setVolume(0.08f, 0.08f);
                p.start();
                player = p;
                return;
            } catch (Exception ignored) {}
        }
    }

    // gentle start: from soft to full over about a minute
    private void rise(int step) {
        if (player == null || step > 20) return;
        float v = Math.min(1f, 0.08f + step * 0.046f);
        try { player.setVolume(v, v); } catch (Exception ignored) {}
        h.postDelayed(() -> rise(step + 1), 3000);
    }

    private void vibrate() {
        vibrator = getSystemService(Vibrator.class);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 800, 600, 800, 600};
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 1),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        else vibrator.vibrate(pattern, 1);
    }

    private Notification notification(String label, int snooze) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Alarm · المنبّه", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Mustatar alarms (the sound is played by the alarm itself)");
            ch.setSound(null, null); ch.enableVibration(false);
            ch.setBypassDnd(true); ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        Intent full = new Intent(this, AlarmActivity.class).putExtra("label", label).putExtra("snooze", snooze)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent fullPi = PendingIntent.getActivity(this, 7313, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = label == null || label.isEmpty() ? "⏰ Mustatar · مستطر" : "⏰ " + label;
        String time = android.text.format.DateFormat.getTimeFormat(this).format(new java.util.Date());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_mustatar).setContentTitle(title).setContentText(time).setCategory(Notification.CATEGORY_ALARM)
            .setFullScreenIntent(fullPi, true).setContentIntent(fullPi).setOngoing(true).setAutoCancel(false).setColor(0xFF1A6FD8)
            .addAction(new Notification.Action.Builder(null, "Stop · إيقاف", AlarmClock.pending(this, AlarmClock.STOP, null, 2)).build())
            .addAction(new Notification.Action.Builder(null, "Snooze " + snooze + " min · غفوة", AlarmClock.pending(this, AlarmClock.SNOOZE, null, 3)).build())
            .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MAX);
        return b.build();
    }

    private void stopSound() {
        if (player != null) { try { player.stop(); } catch (Exception ignored) {} try { player.release(); } catch (Exception ignored) {} player = null; }
        if (vibrator != null) { try { vibrator.cancel(); } catch (Exception ignored) {} }
    }

    @Override public void onDestroy() {
        h.removeCallbacksAndMessages(null);
        stopSound();
        if (audio != null && volumeBefore >= 0) { try { audio.setStreamVolume(AudioManager.STREAM_ALARM, volumeBefore, 0); } catch (Exception ignored) {} }
        if (wake != null && wake.isHeld()) wake.release();
        getSystemService(NotificationManager.class).cancel(AlarmClock.NOTE);
        sendBroadcast(new Intent(AlarmActivity.CLOSE).setPackage(getPackageName()));   // the full-screen page goes too
        super.onDestroy();
    }
}
