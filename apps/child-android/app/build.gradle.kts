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

android {
    namespace = "fr.controleparental.child"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.controleparental.child"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
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

        // --- LOT 3 — Localisation & Sécurité ----------------------------------
        // Localisation EN ARRIÈRE-PLAN (ACCESS_BACKGROUND_LOCATION) : permission
        // SENSIBLE Play (formulaire + vidéo de démo « child_monitoring »). On la
        // met derrière un flag Gradle pour pouvoir publier une variante SANS
        // arrière-plan si Google refuse la justification (le suivi périodique
        // fonctionne alors uniquement app ouverte / service au premier plan).
        // Le check-in à la demande (D2) et le SOS restent possibles sans ce flag.
        val featureBackgroundLocation: Boolean =
            (project.findProperty("featureBackgroundLocation") as String?)?.toBoolean() ?: true
        buildConfigField("boolean", "FEATURE_BACKGROUND_LOCATION", featureBackgroundLocation.toString())

        // Déclaration anti-stalkerware : l'app est un outil de surveillance PARENTALE.
        // (Le flag Play Console child_monitoring se règle à la publication ; voir docs.)
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
}
