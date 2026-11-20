package sa.jund.notes

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId

/**
 * The fitness tracker reads the phone's own health data through Health Connect (Android's shared health store:
 * Samsung Health, Google Fit, Fitbit and watches put their steps and sleep there). Only with the person's permission,
 * only reading, and nothing leaves the phone except what the app shows them.
 */
object HealthBridge {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @JvmStatic
    val permissions: Set<String> = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    )

    /** "ok", "update" (Health Connect must be installed or updated), or "none" (this phone cannot have it). */
    @JvmStatic
    fun status(ctx: Context): String {
        if (Build.VERSION.SDK_INT < 28) return "none"
        return when (HealthConnectClient.getSdkStatus(ctx)) {
            HealthConnectClient.SDK_AVAILABLE -> "ok"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update"
            else -> "none"
        }
    }

    /** The screen where the person allows (or not) the app to read their steps and sleep. */
    @JvmStatic
    fun permissionIntent(ctx: Context): Intent =
        PermissionController.createRequestPermissionResultContract().createIntent(ctx, permissions)

    /** Where to get Health Connect when the phone does not have it yet (Android 13 and older). */
    @JvmStatic
    fun installIntent(): Intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(
        "market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding"))

    fun interface Done { fun done(json: String) }

    @JvmStatic
    fun granted(ctx: Context, done: Done) {
        scope.launch {
            val out = JSONObject()
            try {
                val g = HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions()
                out.put("ok", true).put("granted", permissions.count { it in g }).put("all", permissions.all { it in g })
                    .put("steps", HealthPermission.getReadPermission(StepsRecord::class) in g)
                    .put("sleep", HealthPermission.getReadPermission(SleepSessionRecord::class) in g)
            } catch (e: Exception) { out.put("ok", false).put("error", e.toString()) }
            done.done(out.toString())
        }
    }

    /** The last few days: steps, distance, active calories, sleep and workouts, one entry per day. */
    @JvmStatic
    fun read(ctx: Context, days: Int, done: Done) {
        scope.launch {
            val out = JSONObject()
            try {
                val client = HealthConnectClient.getOrCreate(ctx)
                val g = client.permissionController.getGrantedPermissions()
                val zone = ZoneId.systemDefault()
                val first = LocalDate.now(zone).minusDays((days - 1).toLong())
                val start = first.atStartOfDay()
                val end = LocalDate.now(zone).plusDays(1).atStartOfDay()
                val byDay = linkedMapOf<String, JSONObject>()
                for (i in 0 until days) byDay[first.plusDays(i.toLong()).toString()] = JSONObject().put("date", first.plusDays(i.toLong()).toString())
                val metrics = buildSet {
                    if (HealthPermission.getReadPermission(StepsRecord::class) in g) add(StepsRecord.COUNT_TOTAL)
                    if (HealthPermission.getReadPermission(DistanceRecord::class) in g) add(DistanceRecord.DISTANCE_TOTAL)
                    if (HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class) in g) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
                }
                if (metrics.isNotEmpty()) {
                    val groups = client.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(metrics, TimeRangeFilter.between(start, end), Period.ofDays(1)))
                    for (gr in groups) {
                        val d = byDay[gr.startTime.toLocalDate().toString()] ?: continue
                        gr.result[StepsRecord.COUNT_TOTAL]?.let { d.put("steps", it) }
                        gr.result[DistanceRecord.DISTANCE_TOTAL]?.let { d.put("meters", Math.round(it.inMeters)) }
                        gr.result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { d.put("kcal", Math.round(it.inKilocalories)) }
                    }
                }
                val from: Instant = start.atZone(zone).toInstant().minusSeconds(12 * 3600)
                val to: Instant = end.atZone(zone).toInstant()
                if (HealthPermission.getReadPermission(SleepSessionRecord::class) in g) {
                    // sleep counts for the day it ends (last night's sleep belongs to this morning)
                    for (s in client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(from, to))).records) {
                        val d = byDay[s.endTime.atZone(zone).toLocalDate().toString()] ?: continue
                        d.put("sleepMin", d.optLong("sleepMin") + java.time.Duration.between(s.startTime, s.endTime).toMinutes())
                        d.put("sleepFrom", s.startTime.toEpochMilli()).put("sleepTo", s.endTime.toEpochMilli())
                    }
                }
                if (HealthPermission.getReadPermission(ExerciseSessionRecord::class) in g) {
                    for (x in client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(from, to))).records) {
                        val d = byDay[x.startTime.atZone(zone).toLocalDate().toString()] ?: continue
                        val list = d.optJSONArray("workouts") ?: JSONArray().also { d.put("workouts", it) }
                        list.put(JSONObject().put("type", x.exerciseType).put("title", x.title ?: "")
                            .put("min", java.time.Duration.between(x.startTime, x.endTime).toMinutes()).put("at", x.startTime.toEpochMilli()))
                    }
                }
                out.put("ok", true).put("days", JSONArray(byDay.values.toList())).put("granted", permissions.count { it in g })
            } catch (e: Exception) { out.put("ok", false).put("error", e.toString()) }
            done.done(out.toString())
        }
    }
}
