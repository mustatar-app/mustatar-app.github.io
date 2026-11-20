package sa.jund.notes;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.TimeZone;

/**
 * The phone's own calendars (Google, Samsung, Outlook… whatever accounts are on the phone), both ways, with permission.
 *   IN:  events from the calendars the person picks show in Mustatar's calendar and timeline.
 *   OUT: Mustatar's own items are written into one calendar the person picks, and kept up to date; each one is marked
 *        (UID "mustatar-<id>") so a change made in the phone's calendar app comes back into Mustatar.
 */
final class PhoneCalendar {
    private PhoneCalendar() {}
    private static final String PREFS = "mustatar-phone-calendar";

    static JSONArray calendars(Context ctx) throws Exception {
        JSONArray out = new JSONArray();
        String[] cols = {CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.Calendars.CALENDAR_COLOR, CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
            CalendarContract.Calendars.VISIBLE, CalendarContract.Calendars.IS_PRIMARY};
        try (Cursor c = ctx.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, cols, null, null, null)) {
            while (c != null && c.moveToNext()) {
                int access = c.getInt(5);
                out.put(new JSONObject().put("id", c.getLong(0)).put("name", nz(c.getString(1))).put("account", nz(c.getString(2)))
                    .put("type", nz(c.getString(3))).put("color", String.format("#%06X", 0xFFFFFF & c.getInt(4)))
                    .put("writable", access >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)
                    .put("visible", c.getInt(6) == 1).put("primary", !c.isNull(7) && c.getInt(7) == 1));
            }
        }
        return out;
    }

    /** Events between two times from the chosen calendars (repeats already expanded by the phone). */
    static JSONArray events(Context ctx, long from, long to, JSONArray ids) throws Exception {
        Set<Long> want = new HashSet<>();
        for (int i = 0; ids != null && i < ids.length(); i++) want.add(ids.getLong(i));
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, from); ContentUris.appendId(b, to);
        String[] cols = {CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.CALENDAR_ID,
            CalendarContract.Instances.EVENT_LOCATION, CalendarContract.Events.UID_2445, CalendarContract.Instances.DESCRIPTION};
        JSONArray out = new JSONArray();
        try (Cursor c = ctx.getContentResolver().query(b.build(), cols, null, null, CalendarContract.Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext() && out.length() < 3000) {
                long cal = c.getLong(5);
                String uid = nz(c.getString(7));
                boolean mine = uid.startsWith("mustatar-");
                if (!mine && !want.contains(cal)) continue;
                out.put(new JSONObject().put("event", c.getLong(0)).put("title", nz(c.getString(1))).put("begin", c.getLong(2)).put("end", c.getLong(3))
                    .put("allDay", c.getInt(4) == 1).put("cal", cal).put("where", nz(c.getString(6))).put("mine", mine ? uid.substring(9) : ""));
            }
        }
        return out;
    }

    /** Writes Mustatar's items into one calendar: new ones added, changed ones updated, removed ones deleted. */
    static JSONObject write(Context ctx, long cal, JSONArray items) throws Exception {
        ContentResolver cr = ctx.getContentResolver();
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject map = new JSONObject(p.getString("map", "{}"));
        long mapCal = p.getLong("cal", -1);
        // a different calendar was chosen: take the old copies out of the old one first
        if (mapCal != -1 && mapCal != cal) { clear(ctx); map = new JSONObject(); }
        Set<String> seen = new HashSet<>();
        int added = 0, changed = 0, removed = 0;
        String zone = TimeZone.getDefault().getID();
        for (int i = 0; i < items.length() && i < 800; i++) {
            JSONObject it = items.getJSONObject(i);
            String id = it.getString("id"); seen.add(id);
            boolean allDay = it.optBoolean("allDay");
            ContentValues v = new ContentValues();
            v.put(CalendarContract.Events.TITLE, it.optString("title"));
            v.put(CalendarContract.Events.DESCRIPTION, it.optString("notes"));
            v.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
            v.put(CalendarContract.Events.DTSTART, it.getLong("start"));
            v.put(CalendarContract.Events.EVENT_TIMEZONE, allDay ? "UTC" : zone);
            String rrule = it.optString("rrule");
            if (rrule.isEmpty()) { v.put(CalendarContract.Events.DTEND, it.getLong("end")); v.putNull(CalendarContract.Events.RRULE); v.putNull(CalendarContract.Events.DURATION); }
            else { v.put(CalendarContract.Events.RRULE, rrule); v.put(CalendarContract.Events.DURATION, allDay ? "P1D" : "PT" + Math.max(1, (it.getLong("end") - it.getLong("start")) / 60000) + "M"); v.putNull(CalendarContract.Events.DTEND); }
            String sig = it.optString("title") + "|" + it.getLong("start") + "|" + it.getLong("end") + "|" + allDay + "|" + rrule + "|" + it.optString("notes");
            JSONObject had = map.optJSONObject(id);
            if (had != null && had.optString("sig").equals(sig) && exists(cr, had.getLong("ev"))) continue;
            if (had != null && exists(cr, had.getLong("ev"))) {
                cr.update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, had.getLong("ev")), v, null, null);
                had.put("sig", sig); changed++;
            } else {
                v.put(CalendarContract.Events.CALENDAR_ID, cal);
                v.put(CalendarContract.Events.UID_2445, "mustatar-" + id);
                Uri u = cr.insert(CalendarContract.Events.CONTENT_URI, v);
                if (u == null) continue;
                map.put(id, new JSONObject().put("ev", ContentUris.parseId(u)).put("sig", sig)); added++;
                int lead = it.optInt("remind", -1);
                if (lead >= 0 && !allDay) {
                    ContentValues r = new ContentValues();
                    r.put(CalendarContract.Reminders.EVENT_ID, ContentUris.parseId(u));
                    r.put(CalendarContract.Reminders.MINUTES, lead);
                    r.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
                    try { cr.insert(CalendarContract.Reminders.CONTENT_URI, r); } catch (Exception ignored) {}
                }
            }
        }
        for (Iterator<String> k = map.keys(); k.hasNext(); ) {
            String id = k.next();
            if (seen.contains(id)) continue;
            try { cr.delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, map.getJSONObject(id).getLong("ev")), null, null); } catch (Exception ignored) {}
            k.remove(); removed++;
        }
        p.edit().putString("map", map.toString()).putLong("cal", cal).apply();
        return new JSONObject().put("ok", true).put("added", added).put("changed", changed).put("removed", removed).put("count", map.length());
    }

    /** Takes every copy Mustatar wrote out of the phone's calendar (when the person turns this off). */
    static int clear(Context ctx) throws Exception {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject map = new JSONObject(p.getString("map", "{}"));
        int n = 0;
        for (Iterator<String> k = map.keys(); k.hasNext(); ) {
            try { n += ctx.getContentResolver().delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, map.getJSONObject(k.next()).getLong("ev")), null, null); } catch (Exception ignored) {}
        }
        p.edit().remove("map").remove("cal").apply();
        return n;
    }
    /** Forgets that an item was written (it was changed or deleted in the phone's calendar app, and the app took that in). */
    static void forget(Context ctx, JSONArray ids, boolean resign) throws Exception {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject map = new JSONObject(p.getString("map", "{}"));
        for (int i = 0; i < ids.length(); i++) {
            String id = ids.getString(i);
            if (resign) { JSONObject m = map.optJSONObject(id); if (m != null) m.put("sig", ""); } else map.remove(id);
        }
        p.edit().putString("map", map.toString()).apply();
    }

    private static boolean exists(ContentResolver cr, long ev) {
        try (Cursor c = cr.query(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, ev), new String[]{CalendarContract.Events.DELETED}, null, null, null)) {
            return c != null && c.moveToFirst() && c.getInt(0) == 0;
        } catch (Exception e) { return false; }
    }
    private static String nz(String s) { return s == null ? "" : s; }
}
