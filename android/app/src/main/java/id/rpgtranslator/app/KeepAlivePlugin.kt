package id.rpgtranslator.app

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.DocumentsContract
import android.provider.Settings
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.OutputStream
import java.util.UUID

@CapacitorPlugin(
    name = "KeepAlive",
    permissions = [Permission(alias = "notifications", strings = ["android.permission.POST_NOTIFICATIONS"])]
)
class KeepAlivePlugin : Plugin() {
    private val streams = HashMap<String, OutputStream>()
    private var receiver: BroadcastReceiver? = null
    private var serviceOn = false

    override fun load() {
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) {
                notifyListeners("stopClicked", JSObject())
            }
        }
        receiver = r
        ContextCompat.registerReceiver(
            context, r, IntentFilter(KeepAliveService.ACTION_STOPPED), ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    override fun handleOnPause() {}

    override fun handleOnResume() {}

    override fun handleOnDestroy() {
        receiver?.let { runCatching { context.unregisterReceiver(it) } }
        receiver = null
        serviceOn = false
        runCatching { context.stopService(Intent(context, KeepAliveService::class.java)) }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        try {
            val intent = Intent(context, KeepAliveService::class.java).apply {
                action = KeepAliveService.ACTION_START
                putExtra("title", call.getString("title") ?: "Menerjemahkan")
                putExtra("body", call.getString("body") ?: "Proses berjalan")
                putExtra("progress", call.getInt("progress") ?: -1)
            }
            ContextCompat.startForegroundService(context, intent)
            serviceOn = true
            call.resolve()
        } catch (e: Throwable) {
            KeepAliveService.saveError(context, e)
            call.reject(e.message ?: "Gagal memulai layanan latar belakang")
        }
    }

    @PluginMethod
    fun lastError(call: PluginCall) {
        val p = context.getSharedPreferences(KeepAliveService.PREFS, Context.MODE_PRIVATE)
        val o = JSObject()
        o.put("error", p.getString(KeepAliveService.KEY_ERROR, "") ?: "")
        o.put("at", p.getLong(KeepAliveService.KEY_AT, 0L))
        call.resolve(o)
    }

    @PluginMethod
    fun clearError(call: PluginCall) {
        context.getSharedPreferences(KeepAliveService.PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        call.resolve()
    }

    @PluginMethod
    fun update(call: PluginCall) {
        if (!serviceOn) return call.resolve()
        val n = KeepAliveService.build(
            context,
            call.getString("title") ?: "Menerjemahkan",
            call.getString("body") ?: "Proses berjalan",
            call.getInt("progress") ?: -1
        )
        context.getSystemService(android.app.NotificationManager::class.java).notify(KeepAliveService.NOTIF_ID, n)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        serviceOn = false
        context.sendBroadcast(Intent(KeepAliveService.ACTION_STOPPED).setPackage(context.packageName))
        context.stopService(Intent(context, KeepAliveService::class.java))
        call.resolve()
    }

    @PluginMethod
    fun requestNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) return resolveNotifications(call)
        requestPermissionForAlias("notifications", call, "notificationsCallback")
    }

    @PermissionCallback
    private fun notificationsCallback(call: PluginCall) {
        resolveNotifications(call)
    }

    private fun resolveNotifications(call: PluginCall) {
        val granted = Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED
        val o = JSObject()
        o.put("granted", granted)
        call.resolve(o)
    }

    @PluginMethod
    fun requestIgnoreBatteryOptimizations(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 23) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(context.packageName)) {
                val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.packageName))
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { context.startActivity(i) }.onFailure {
                    runCatching { context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun pickFolder(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(call, intent, "folderPicked")
    }

    @ActivityCallback
    private fun folderPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            val o = JSObject(); o.put("files", JSArray()); return call.resolve(o)
        }
        runCatching {
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val out = ArrayList<JSObject>()
        try {
            walk(uri, DocumentsContract.getTreeDocumentId(uri), "", out)
        } catch (e: Exception) {
            return call.reject(e.message ?: "Folder tidak bisa dibaca")
        }
        val arr = JSArray()
        out.forEach { arr.put(it) }
        val res = JSObject(); res.put("files", arr); call.resolve(res)
    }

    private fun walk(tree: Uri, docId: String, prefix: String, out: MutableList<JSObject>) {
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId)
        context.contentResolver.query(
            children,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE
            ),
            null, null, null
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getString(0) ?: continue
                val name = c.getString(1) ?: continue
                val mime = c.getString(2) ?: ""
                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    if (prefix.isEmpty() || name.equals("data", true) || name.equals("js", true) || name.equals("www", true)) {
                        walk(tree, id, "$prefix$name/", out)
                    }
                } else if (
                    name.endsWith(".json", true) || name.endsWith(".rvdata2", true) || name.equals("plugins.js", true)
                ) {
                    val o = JSObject()
                    o.put("path", "$prefix$name")
                    o.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString())
                    out.add(o)
                }
            }
        }
    }

    @PluginMethod
    fun saveStart(call: PluginCall) {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = call.getString("mime") ?: "application/octet-stream"
            putExtra(Intent.EXTRA_TITLE, call.getString("name") ?: "berkas")
        }
        startActivityForResult(call, intent, "savePicked")
    }

    @ActivityCallback
    private fun savePicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            val o = JSObject(); o.put("cancelled", true); return call.resolve(o)
        }
        val out = context.contentResolver.openOutputStream(uri)
        if (out == null) return call.reject("Tidak bisa membuka file tujuan")
        val token = UUID.randomUUID().toString()
        streams[token] = out
        val o = JSObject(); o.put("token", token); call.resolve(o)
    }

    @PluginMethod
    fun saveChunk(call: PluginCall) {
        val token = call.getString("token")
        val data = call.getString("data")
        val out = token?.let { streams[it] }
        if (out == null || data == null) return call.reject("Sesi simpan tidak ditemukan")
        try {
            out.write(Base64.decode(data, Base64.DEFAULT))
        } catch (e: Exception) {
            runCatching { out.close() }
            streams.remove(token)
            return call.reject(e.message ?: "Gagal menulis file")
        }
        call.resolve()
    }

    @PluginMethod
    fun saveEnd(call: PluginCall) {
        val token = call.getString("token")
        val out = token?.let { streams.remove(it) }
        runCatching { out?.close() }
        call.resolve()
    }
}
