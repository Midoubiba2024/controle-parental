// Build racine — versions des plugins (projet greenfield, AGP 8.7 (compileSdk 35) / Kotlin 2).
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false
}
