package fr.controleparental.child

import fr.controleparental.child.BuildConfig

/** Configuration Supabase (injectée via BuildConfig depuis build.gradle.kts). */
object Config {
    val supabaseUrl: String = BuildConfig.SUPABASE_URL
    val supabaseAnonKey: String = BuildConfig.SUPABASE_ANON_KEY

    val pairingCompleteUrl: String get() = "$supabaseUrl/functions/v1/pairing-complete"

    /** Endpoint de rafraîchissement de session (GoTrue). */
    val tokenRefreshUrl: String get() = "$supabaseUrl/auth/v1/token?grant_type=refresh_token"

    /** Base PostgREST pour la remontée des agrégats (tables L1). */
    fun restUrl(table: String): String = "$supabaseUrl/rest/v1/$table"

    /** Journal d'appels (métadonnées) : fonction sensible, off par défaut. */
    val featureCallLog: Boolean = BuildConfig.FEATURE_CALL_LOG

    /** Poivre de hachage des numéros (jamais stockés en clair). */
    val commHashPepper: String = BuildConfig.COMM_HASH_PEPPER
}
