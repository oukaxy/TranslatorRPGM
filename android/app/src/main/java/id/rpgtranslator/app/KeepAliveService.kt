package id.rpgtranslator.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class KeepAliveService : Service() {
    companion object {
        const val ACTION_START = "id.rpgtranslator.app.KEEPALIVE_START"
        const val ACTION_UPDATE = "id.rpgtranslator.app.KEEPALIVE_UPDATE"
        const val ACTION_STOP = "id.rpgtranslator.app.KEEPALIVE_STOP"
        const val ACTION_STOPPED = "id.rpgtranslator.app.KEEPALIVE_STOPPED"
        const val CHANNEL = "rpg-translate"
        const val NOTIF_ID = 41
        const val PREFS = "keepalive"
        const val KEY_ERROR = "lastError"
        const val KEY_AT = "lastErrorAt"

        fun saveError(ctx: Context, e: Throwable) {
            runCatching {
                ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(KEY_ERROR, e.stackTraceToString())
                    .putLong(KEY_AT, System.currentTimeMillis())
                    .apply()
            }
        }

        fun build(ctx: Context, title: String, body: String, progress: Int): Notification {
            val open = PendingIntent.getActivity(
                ctx, 0, Intent(ctx, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val stop = PendingIntent.getService(
                ctx, 1, Intent(ctx, KeepAliveService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val b = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stop)
            if (progress in 0..100) b.setProgress(100, progress, false)
            return b.build()
        }
    }

    private var wake: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rpgtranslator:translate").apply {
                setReferenceCounted(false)
                acquire(8 * 60 * 60 * 1000L)
            }
            if (Build.VERSION.SDK_INT >= 26) {
                val ch = NotificationChannel(CHANNEL, "Terjemahan", NotificationManager.IMPORTANCE_LOW)
                getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
            }
        } catch (e: Throwable) {
            saveError(this, e)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return try {
            if (intent?.action == ACTION_STOP) {
                stopAndNotify()
            } else {
                val title = intent?.getStringExtra("title") ?: "Menerjemahkan"
                val body = intent?.getStringExtra("body") ?: "Proses berjalan"
                val progress = intent?.getIntExtra("progress", -1) ?: -1
                val n = build(this, title, body, progress)
                if (intent?.action == ACTION_UPDATE) {
                    getSystemService(NotificationManager::class.java).notify(NOTIF_ID, n)
                } else {
                    val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
                    ServiceCompat.startForeground(this, NOTIF_ID, n, type)
                }
            }
            START_NOT_STICKY
        } catch (e: Throwable) {
            saveError(this, e)
            stopSelf()
            START_NOT_STICKY
        }
    }

    override fun onBind(intent: Intent?) = null

    override fun onTimeout(startId: Int) {
        stopAndNotify()
    }

    private fun stopAndNotify() {
        sendBroadcast(Intent(ACTION_STOPPED).setPackage(packageName))
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        wake?.let { if (it.isHeld) it.release() }
        wake = null
        super.onDestroy()
    }
}
