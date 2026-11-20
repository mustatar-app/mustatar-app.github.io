package sa.jund.notes;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/** Shown by Health Connect when someone asks why Mustatar reads their steps and sleep: opens the privacy page. */
public class HealthPrivacyActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://mustatar.dawajund.workers.dev/privacy.html#health"))); } catch (Exception ignored) {}
        finish();
    }
}
