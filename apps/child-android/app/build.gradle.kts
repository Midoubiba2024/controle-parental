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
}
