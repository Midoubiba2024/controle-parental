package fr.controleparental.child

import fr.controleparental.child.BuildConfig

/** Configuration Supabase (injectée via BuildConfig depuis build.gradle.kts). */
object Config {
    /**
     * Numéro d'URGENCE — SOURCE UNIQUE (ligne rouge : jamais bloqué). Utilisé à la
     * fois pour composer (`tel:`) et dans les libellés (injecté en %1$s) : aucune
     * traduction ne peut afficher un numéro différent de celui réellement composé.
     */
    const val EMERGENCY_NUMBER = "112"

    val supabaseUrl: String = BuildConfig.SUPABASE_URL
    val supabaseAnonKey: String = BuildConfig.SUPABASE_ANON_KEY

    /** Inscription ANONYME de l'appareil (GoTrue) — docs/14-APPAIRAGE.md §2. */
    val anonymousSignupUrl: String get() = "$supabaseUrl/auth/v1/signup"

    /** RPC PostgREST d'appairage `pairing_complete` — docs/14-APPAIRAGE.md §3. */
    val pairingCompleteRpcUrl: String get() = restUrl("rpc/pairing_complete")

    /** Endpoint de rafraîchissement de session (GoTrue). */
    val tokenRefreshUrl: String get() = "$supabaseUrl/auth/v1/token?grant_type=refresh_token"

    /** Base PostgREST pour la remontée des agrégats (tables L1). */
    fun restUrl(table: String): String = "$supabaseUrl/rest/v1/$table"

    /**
     * LOT 4 — Filtrage réseau (sinkhole DNS local).
     *
     * [dnsUpstream] : résolveur public amont pour les requêtes AUTORISÉES
     * (défaut Quad9). On ne lui transfère QUE la requête DNS — jamais le trafic
     * applicatif, aucun MITM. [featureNetworkFilter] gate l'exposition de la
     * fonction (le VpnService exige en plus le consentement runtime, visible).
     */
    val dnsUpstream: String = BuildConfig.DNS_UPSTREAM
    val featureNetworkFilter: Boolean = BuildConfig.FEATURE_NETWORK_FILTER

    /**
     * LOT 6 — Détection de bien-être/sécurité ON-DEVICE (profil ado).
     *
     * Quand true, l'app peut proposer l'analyse LOCALE du texte des notifications
     * (NotificationListenerService) pour en déduire des SIGNAUX de risque
     * (catégorie/gravité) remontés en MÉTADONNÉES. 🔴 LIGNE ROUGE : le contenu
     * analysé ne quitte JAMAIS l'appareil (docs/11-LOT6-BIEN-ETRE.md). L'analyse
     * reste gardée au runtime par : le profil (preteen/teen uniquement — jamais
     * young_child), le consentement (`safety_settings.analysis_enabled`, OFF par
     * défaut) et l'accès aux notifications accordé par l'ado dans les Réglages.
     */
    val featureSafetySignals: Boolean = BuildConfig.FEATURE_SAFETY_SIGNALS

    /**
     * Journal d'appels (métadonnées) : fonction SENSIBLE, OFF par défaut.
     *
     * NE PAS activer en release tant que le hachage des numéros n'est pas déplacé
     * CÔTÉ SERVEUR (voir [commHashPepper]). Même désactivée par défaut, l'activer
     * avec le hachage local actuel réintroduirait la faille décrite ci-dessous.
     */
    val featureCallLog: Boolean = BuildConfig.FEATURE_CALL_LOG

    /**
     * Localisation en arrière-plan (LOT 3). Permission SENSIBLE Play (formulaire +
     * vidéo). Quand false, on ne demande jamais ACCESS_BACKGROUND_LOCATION : le
     * suivi périodique ne fonctionne qu'app ouverte / service au premier plan, et
     * le geofencing peut manquer des transitions app fermée. Le check-in à la
     * demande (D2) et le SOS restent possibles. Voir docs/08-LOT3-LOCALISATION.md.
     */
    val featureBackgroundLocation: Boolean = BuildConfig.FEATURE_BACKGROUND_LOCATION

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
