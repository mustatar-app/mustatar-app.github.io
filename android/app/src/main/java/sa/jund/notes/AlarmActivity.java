package sa.jund.notes;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/* the page that comes up when an alarm rings — also on the lock screen: the time, its name, Stop and Snooze */
public class AlarmActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true); setTurnScreenOn(true);
            KeyguardManager km = getSystemService(KeyguardManager.class);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        float dp = getResources().getDisplayMetrics().density;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER); root.setBackgroundColor(0xFF0C1428);
        root.setPadding((int) (28 * dp), (int) (40 * dp), (int) (28 * dp), (int) (40 * dp));
        TextView time = new TextView(this);
        time.setText(DateFormat.getTimeFormat(this).format(new java.util.Date()));
        time.setTextColor(Color.WHITE); time.setTextSize(64); time.setTypeface(Typeface.DEFAULT_BOLD); time.setGravity(Gravity.CENTER);
        TextView name = new TextView(this);
        String label = getIntent().getStringExtra("label");
        name.setText(label == null || label.isEmpty() ? "⏰ مستطر · Mustatar" : "⏰ " + label);
        name.setTextColor(0xFFB9C6E4); name.setTextSize(22); name.setGravity(Gravity.CENTER); name.setPadding(0, (int) (10 * dp), 0, (int) (48 * dp));
        root.addView(time); root.addView(name);
        root.addView(button("إيقاف · Stop", 0xFFE5484D, Color.WHITE, dp, () -> { sendBroadcast(new Intent(this, AlarmClock.class).setAction(AlarmClock.STOP)); finish(); }));
        LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(1, (int) (16 * dp)); TextView space = new TextView(this); root.addView(space, gap);
        root.addView(button("غفوة ٥ دقائق · Snooze 5 min", 0xFF22304F, Color.WHITE, dp, () -> { sendBroadcast(new Intent(this, AlarmClock.class).setAction(AlarmClock.SNOOZE)); finish(); }));
        setContentView(root);
    }

    private Button button(String text, int bg, int fg, float dp, Runnable run) {
        Button b = new Button(this);
        b.setText(text); b.setTextColor(fg); b.setTextSize(20); b.setAllCaps(false);
        GradientDrawable d = new GradientDrawable(); d.setColor(bg); d.setCornerRadius(40 * dp); b.setBackground(d);
        b.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (int) (72 * dp)));
        b.setOnClickListener(v -> run.run());
        return b;
    }

    // leaving the page with the back button does not stop the alarm by mistake: Stop or Snooze must be tapped
    @Override public void onBackPressed() { }
    @Override protected void onDestroy() { super.onDestroy(); }
}
