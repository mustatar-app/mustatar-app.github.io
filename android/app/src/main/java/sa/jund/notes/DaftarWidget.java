package sa.jund.notes;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/** "Today": the date, the next prayer, and what comes next today. Also wakes all the widgets at each change. */
public class DaftarWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) { WidgetData.refreshAll(ctx); }
    @Override public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, android.os.Bundle o) { WidgetData.refreshAll(ctx); }
    @Override public void onReceive(Context ctx, Intent intent) {
        if (WidgetData.TICK.equals(intent.getAction())) { WidgetData.refreshAll(ctx); return; }
        super.onReceive(ctx, intent);
    }
}
