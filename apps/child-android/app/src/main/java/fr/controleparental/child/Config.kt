package fr.controleparental.child

import fr.controleparental.child.BuildConfig

/** Configuration Supabase (injectée via BuildConfig depuis build.gradle.kts). */
object Config {
    val supabaseUrl: String = BuildConfig.SUPABASE_URL
    val supabaseAnonKey: String = BuildConfig.SUPABASE_ANON_KEY
    val pairingCompleteUrl: String get() = "$supabaseUrl/functions/v1/pairing-complete"
}
