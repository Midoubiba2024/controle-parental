plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// URL + clé publiable Supabase injectées dans BuildConfig.
// Surchargables via -PsupabaseUrl=... -PsupabaseAnonKey=... ou gradle.properties.
val supabaseUrl: String = (project.findProperty("supabaseUrl") as String?)
    ?: "https://xjfuaszukuumqxgzitzq.supabase.co"
val supabaseAnonKey: String = (project.findProperty("supabaseAnonKey") as String?)
    ?: "sb_publishable_BJow0lDQQdmoiiDE1JUXYg_9Dw_DnBI"

// --- LOT 8a — Signature release STABLE (sideload familial) -------------------
// Une mise à jour installée par-dessus doit être signée avec la MÊME clé, sinon
// Android refuse l'installation. Le keystore n'est JAMAIS commité : il est fourni
// par l'environnement (secrets GitHub en CI, variables locales sinon). Si l'une des
// 4 valeurs manque, aucune signature release n'est configurée (APK debug seulement).
// Voir docs/10-INSTALLATION.md §Signature.
fun signingValue(name: String): String? =
    ((project.findProperty(name) as String?) ?: System.getenv(name))?.takeIf { it.isNotBlank() }

val releaseKeystorePath: String? = signingValue("ANDROID_KEYSTORE_PATH")
val releaseKeystorePassword: String? = signingValue("ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias: String? = signingValue("ANDROID_KEY_ALIAS")
val releaseKeyPassword: String? = signingValue("ANDROID_KEY_PASSWORD")
val hasReleaseSigning: Boolean = releaseKeystorePath != null && file(releaseKeystorePath).exists() &&
    releaseKeystorePassword != null && releaseKeyAlias != null && releaseKeyPassword != null

// versionCode croissant obligatoire pour installer une mise à jour par-dessus :
// le CI passe -PversionCode=<numéro de run>. Défaut 1 en local.
val appVersionCode: Int = (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 1

android {
    namespace = "fr.controleparental.child"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.controleparental.child"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = "0.1.0"

        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")

        // --- LOT 1 — Observation transparente ---------------------------------
        // Journal d'appels (métadonnées) : fonction SENSIBLE (READ_CALL_LOG).
        // Désactivée par défaut pour limiter le risque de refus Play ; activable
        // via -PfeatureCallLog=true à la compilation. Même activée, elle reste
        // conditionnée au consentement runtime et visible par l'enfant.
        // NE PAS activer en release tant que le hachage des numéros n'est pas
        // déplacé côté serveur (voir ci-dessous et Config.commHashPepper).
        val featureCallLog: Boolean =
            (project.findProperty("featureCallLog") as String?)?.toBoolean() ?: false
        buildConfigField("boolean", "FEATURE_CALL_LOG", featureCallLog.toString())

        // Poivre (pepper) de hachage LOCAL des numéros de correspondants.
        // LIMITE CONNUE : compilé dans l'APK, donc extractible → le hash local est
        // réversible par force brute (numéros à faible entropie). Ce n'est PAS une
        // protection réelle du numéro, seulement une clé de regroupement. Le
        // hachage/HMAC doit passer CÔTÉ SERVEUR (Edge Function) avant toute
        // activation de FEATURE_CALL_LOG en release.
        val commHashPepper: String =
            (project.findProperty("commHashPepper") as String?) ?: "dev-pepper-change-me"
        buildConfigField("String", "COMM_HASH_PEPPER", "\"$commHashPepper\"")

        // --- LOT 4 — Filtrage réseau (sinkhole DNS local) ---------------------
        // Résolveur public amont pour les requêtes AUTORISÉES. Quad9 (9.9.9.9) par
        // défaut : respectueux de la vie privée et bloque lui-même les domaines
        // malveillants (défense en profondeur). Aucun MITM : on ne transfère que la
        // requête DNS, jamais le trafic applicatif. Surchargeable -PdnsUpstream=.
        val dnsUpstream: String = (project.findProperty("dnsUpstream") as String?) ?: "9.9.9.9"
        buildConfigField("String", "DNS_UPSTREAM", "\"$dnsUpstream\"")

        // Filtrage réseau (VpnService local). ON par défaut ; désactivable via
        // -PfeatureNetworkFilter=false pour une variante/soumission Play sans VPN
        // (voir docs/09-LOT4-FILTRAGE.md §déclaration Play). Le VpnService exige en
        // plus le consentement runtime (VpnService.prepare), toujours visible.
        val featureNetworkFilter: Boolean =
            (project.findProperty("featureNetworkFilter") as String?)?.toBoolean() ?: true
        buildConfigField("boolean", "FEATURE_NETWORK_FILTER", featureNetworkFilter.toString())

        // --- LOT 3 — Localisation EN ARRIÈRE-PLAN -----------------------------
        // ACCESS_BACKGROUND_LOCATION = permission SENSIBLE Play. Pilotée par un
        // PRODUCT FLAVOR (ci-dessous), PAS seulement par BuildConfig : la variante
        // « noBgLocation » RETIRE réellement la permission du manifeste fusionné
        // (overlay tools:node="remove"), pour une soumission Play sans arrière-plan
        // si Google refuse la justification. BuildConfig.FEATURE_BACKGROUND_LOCATION
        // (défini par flavor) gate en plus la demande au runtime.

        // Déclaration anti-stalkerware : l'app est un outil de surveillance PARENTALE.
        // (Le flag Play Console child_monitoring se règle à la publication ; voir docs.)
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseKeystorePath!!)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            // Sans secrets de signature, l'APK release reste NON signé (non installable) :
            // le CI produit alors l'APK debug et l'indique clairement.
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // --- LOT 3 — Variantes de localisation en arrière-plan --------------------
    // withBgLocation (défaut) : conserve ACCESS_BACKGROUND_LOCATION (manifeste
    //   principal) ; FEATURE_BACKGROUND_LOCATION=true.
    // noBgLocation : l'overlay src/noBgLocation/AndroidManifest.xml RETIRE la
    //   permission du manifeste fusionné (tools:node="remove") ;
    //   FEATURE_BACKGROUND_LOCATION=false. Variante de repli pour Play.
    // Build : ./gradlew :app:assembleWithBgLocationDebug (ou assembleNoBgLocationDebug).
    flavorDimensions += "backgroundLocation"
    productFlavors {
        create("withBgLocation") {
            dimension = "backgroundLocation"
            isDefault = true
            buildConfigField("boolean", "FEATURE_BACKGROUND_LOCATION", "true")
        }
        create("noBgLocation") {
            dimension = "backgroundLocation"
            buildConfigField("boolean", "FEATURE_BACKGROUND_LOCATION", "false")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.activity:activity-compose:1.9.2")
    // play-services-location tire transitivement androidx.fragment 1.0 : avant 1.3,
    // FragmentActivity casse le retour des demandes de permission (ActivityResult).
    // Version explicite récente (lint InvalidFragmentVersionForActivityResult).
    implementation("androidx.fragment:fragment-ktx:1.8.5")

    val composeBom = platform("androidx.compose:compose-bom:2024.09.03")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Réseau (appel des Edge Functions / PostgREST)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Stockage chiffré de la session + identifiants d'appareil
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Planification de la collecte d'agrégats (repli fiable hors du service,
    // résistant à Doze : contrainte réseau + périodicité ~ toutes les heures).
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // LOT 3 — Localisation : FusedLocationProviderClient + GeofencingClient.
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // Tests unitaires JVM (moteur de règles PUR, sans dépendance Android).
    testImplementation("junit:junit:4.13.2")
}
