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

    /**
     * Journal d'appels (métadonnées) : fonction SENSIBLE, OFF par défaut.
     *
     * NE PAS activer en release tant que le hachage des numéros n'est pas déplacé
     * CÔTÉ SERVEUR (voir [commHashPepper]). Même désactivée par défaut, l'activer
     * avec le hachage local actuel réintroduirait la faille décrite ci-dessous.
     */
    val featureCallLog: Boolean = BuildConfig.FEATURE_CALL_LOG

    /**
     * Poivre de hachage des numéros de correspondants.
     *
     * LIMITE DE SÉCURITÉ CONNUE (à corriger avant toute activation en release) :
     * ce poivre est compilé dans [BuildConfig] et donc présent dans l'APK. Un
     * tiers qui extrait l'APK récupère le poivre ; l'espace des numéros de
     * téléphone étant petit (quelques milliards), le hash SHA-256 local est alors
     * RÉVERSIBLE par force brute. Ce hachage côté appareil n'offre donc PAS de
     * protection réelle du numéro du correspondant — ce n'est qu'une clé de
     * regroupement, pas un anonymat.
     *
     * CORRECTIF REQUIS : effectuer le hachage/HMAC CÔTÉ SERVEUR (Edge Function
     * détenant un secret non distribué dans l'app) avant tout stockage, et activer
     * FEATURE_CALL_LOG en release uniquement une fois ce correctif en place.
     */
    val commHashPepper: String = BuildConfig.COMM_HASH_PEPPER
}
