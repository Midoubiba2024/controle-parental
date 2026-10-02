package fr.controleparental.child.data

import okhttp3.OkHttpClient

/**
 * Instance OkHttpClient PARTAGÉE (pool de connexions, threads et cache réutilisés).
 * Évite d'allouer un nouveau client à chaque appel réseau (coûteux, fuite de
 * ressources). Utilisée par SupabaseClient et PairingClient.
 */
object Http {
    val client: OkHttpClient = OkHttpClient()
}
