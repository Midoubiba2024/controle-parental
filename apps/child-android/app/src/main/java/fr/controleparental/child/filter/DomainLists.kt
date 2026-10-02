package fr.controleparental.child.filter

/**
 * LOT 4 — Listes de domaines embarquées et réécritures SafeSearch (données
 * statiques, pures). Approche DNS : on ne connaît QUE des noms de domaine.
 *
 * ⚠️ Ces listes sont des GRAINES de démonstration (quelques domaines par
 * catégorie), pas un blocage exhaustif. En production, elles seraient
 * complétées/mises à jour depuis une source de listes maintenue (sync
 * périodique) — voir docs/09-LOT4-FILTRAGE.md (reporté tranche 2). La LIGNE
 * ROUGE reste identique quelle que soit la taille des listes : filtrage par
 * nom de domaine uniquement, aucun MITM.
 */
object DomainLists {

    /**
     * Liste blanche SYSTÈME/ESSENTIELLE — toujours résolue, même en liste blanche
     * stricte, pour ne JAMAIS casser la connectivité vitale ni entraver les
     * services d'urgence/OS (docs/02-CONFORMITE.md). Inclut la mise à jour de
     * l'heure, la connectivité Android, les services d'urgence en ligne, et les
     * cibles de réécriture SafeSearch (qui doivent pouvoir se résoudre).
     *
     * Note : les appels d'urgence (112) passent par le réseau TÉLÉPHONIQUE, pas
     * par le DNS — ils ne sont de toute façon jamais concernés par ce filtrage.
     */
    val ESSENTIAL: Set<String> = setOf(
        // Connectivité / captive portal / heure. NB : google.com et googleapis.com
        // sont volontairement ABSENTS — non vitaux, et leur présence court-circuiterait
        // la réécriture SafeSearch/YouTube (on ne garde ici que les sondes de
        // connectivité et l'heure, listées explicitement).
        "android.com", "gstatic.com",
        "connectivitycheck.gstatic.com", "clients3.google.com",
        "pool.ntp.org", "time.android.com", "time.google.com",
        // Mises à jour système & store (ne pas bloquer)
        "play.google.com", "googleusercontent.com",
        // Services d'urgence / secours en ligne (France)
        "sgma.sante.gouv.fr", "service-public.fr", "gouv.fr",
        "sante.fr", "sos-medecins-france.fr",
        // Notre propre backend (supervision + transparence)
        "supabase.co", "supabase.com",
        // Cibles de réécriture SafeSearch / YouTube restreint (doivent résoudre)
        "forcesafesearch.google.com", "strict.bing.com", "safe.duckduckgo.com",
        "restrict.youtube.com", "restrictmoderate.youtube.com",
        "safesearch.pixabay.com",
    )

    /**
     * Domaines → catégorie (app.filter_category). Graines de démonstration.
     * La correspondance se fait par SUFFIXE (domaine et sous-domaines).
     */
    val CATEGORY_OF: Map<String, String> = buildMap {
        // adult (C7)
        for (d in listOf("pornhub.com", "xvideos.com", "xnxx.com", "youporn.com",
            "redtube.com", "xhamster.com", "onlyfans.com")) put(d, "adult")
        // gambling
        for (d in listOf("bet365.com", "pokerstars.com", "winamax.fr", "unibet.fr",
            "betclic.fr", "pmu.fr", "888casino.com")) put(d, "gambling")
        // violence / hate (démonstration)
        for (d in listOf("liveleak.com")) put(d, "violence")
        // drugs
        for (d in listOf("leafly.com", "weedmaps.com")) put(d, "drugs")
        // dating
        for (d in listOf("tinder.com", "badoo.com", "meetic.fr", "adopteunmec.com")) put(d, "dating")
        // social (médiation par âge — bloqué seulement si la catégorie est activée)
        for (d in listOf("facebook.com", "instagram.com", "tiktok.com", "snapchat.com",
            "x.com", "twitter.com")) put(d, "social")
        // piracy
        for (d in listOf("thepiratebay.org", "1337x.to", "yggtorrent.wtf")) put(d, "piracy")
        // malware / phishing (démonstration — en prod : flux type Quad9/ threat feeds)
        for (d in listOf("testsafebrowsing.appspot.com")) put(d, "malware")
        // ads_trackers (démonstration)
        for (d in listOf("doubleclick.net", "googlesyndication.com", "adservice.google.com",
            "ads.yahoo.com", "scorecardresearch.com")) put(d, "ads_trackers")
    }

    /**
     * Réécritures SafeSearch (C3) : domaine de recherche → hôte « forcé ». On
     * répond un CNAME host→cible ; le client résout alors la cible (essentielle).
     */
    val SAFE_SEARCH_REWRITE: Map<String, String> = mapOf(
        "google.com" to "forcesafesearch.google.com",
        "www.google.com" to "forcesafesearch.google.com",
        "google.fr" to "forcesafesearch.google.com",
        "www.google.fr" to "forcesafesearch.google.com",
        "bing.com" to "strict.bing.com",
        "www.bing.com" to "strict.bing.com",
        "duckduckgo.com" to "safe.duckduckgo.com",
        "www.duckduckgo.com" to "safe.duckduckgo.com",
    )

    /** Domaines YouTube à réécrire selon le mode restreint (C4). */
    val YOUTUBE_HOSTS: Set<String> = setOf(
        "youtube.com", "www.youtube.com", "m.youtube.com", "youtubei.googleapis.com",
        "youtube.googleapis.com", "www.youtube-nocookie.com",
    )

    fun youtubeTarget(mode: String): String? = when (mode) {
        "strict" -> "restrict.youtube.com"
        "moderate" -> "restrictmoderate.youtube.com"
        else -> null
    }

    /** Vrai si [host] correspond (suffixe) à un domaine de [set]. */
    fun matches(host: String, set: Set<String>): Boolean {
        for (d in set) if (host == d || host.endsWith(".$d")) return true
        return false
    }

    /** Catégorie de [host] par suffixe, ou null. Renvoie la correspondance la plus longue. */
    fun categoryOf(host: String): String? {
        var best: String? = null
        var bestLen = -1
        for ((d, cat) in CATEGORY_OF) {
            if ((host == d || host.endsWith(".$d")) && d.length > bestLen) {
                best = cat; bestLen = d.length
            }
        }
        return best
    }
}
