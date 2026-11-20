package sa.jund.notes;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** "Month": this month at a glance (today circled, a dot on days with something) and the next two items. */
public class MonthWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) { WidgetData.refreshAll(ctx); }
}
