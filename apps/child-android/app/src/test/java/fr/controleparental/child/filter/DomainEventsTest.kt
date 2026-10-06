package fr.controleparental.child.filter

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Journal de domaines (LOT 12b) : un événement capturé sous un ancien enrôlement
 * n'est jamais envoyé sous l'identité du nouvel appareil. Données FICTIVES.
 */
class DomainEventsTest {

    private fun ev(domain: String, device: String) =
        FilterClient.DomainEvent(domain, null, "blocked", "2026-01-15T10:00:00Z", device)

    @Test fun onlyEventsOfTheCurrentDeviceAreKept() {
        val old = ev("jeu.exemple.fr", "appareil-ancien")
        val cur = ev("ecole.exemple.fr", "appareil-courant")
        assertEquals(listOf(cur), eventsForDevice(listOf(old, cur, old), "appareil-courant"))
    }

    @Test fun eventsOfARevokedDeviceAreAllDropped() {
        val events = listOf(ev("a.exemple.fr", "appareil-retire"), ev("b.exemple.fr", "appareil-retire"))
        assertEquals(emptyList<FilterClient.DomainEvent>(), eventsForDevice(events, "appareil-nouveau"))
    }
}
