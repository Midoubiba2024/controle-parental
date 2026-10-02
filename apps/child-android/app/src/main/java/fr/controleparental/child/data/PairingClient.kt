package fr.controleparental.child.data

import android.os.Build
import fr.controleparental.child.Config
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject

/** Appelle l'Edge Function pairing-complete pour enrôler l'appareil. */
class PairingClient {

    private val http = OkHttpClient()
    private val jsonType = "application/json".toMediaType()

    sealed interface Result {
        data class Ok(val enrollment: SupervisionStore.Enrollment) : Result
        data class Error(val code: String) : Result
    }

    suspend fun complete(code: String): Result = withContext(Dispatchers.IO) {
        val device = JSONObject()
            .put("platform", "android")
            .put("model", Build.MANUFACTURER + " " + Build.MODEL)
            .put("os_version", "Android " + Build.VERSION.RELEASE)
            .put("label", Build.MODEL)
        val body = JSONObject()
            .put("code", code)
            .put("device", device)
            .toString()
            .toRequestBody(jsonType)

        val req = Request.Builder()
            .url(Config.pairingCompleteUrl)
            .addHeader("apikey", Config.supabaseAnonKey)
            .addHeader("Authorization", "Bearer ${Config.supabaseAnonKey}")
            .post(body)
            .build()

        try {
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                val obj = if (text.isNotBlank()) JSONObject(text) else JSONObject()
                if (!resp.isSuccessful || obj.has("error")) {
                    return@withContext Result.Error(obj.optString("error", "http_${resp.code}"))
                }
                val session = obj.getJSONObject("session")
                Result.Ok(
                    SupervisionStore.Enrollment(
                        deviceId = obj.getString("device_id"),
                        familyId = obj.getString("family_id"),
                        childId = obj.getString("child_id"),
                        mode = obj.optString("mode", "standard"),
                        accessToken = session.getString("access_token"),
                        refreshToken = session.getString("refresh_token"),
                    ),
                )
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "network_error")
        }
    }
}
