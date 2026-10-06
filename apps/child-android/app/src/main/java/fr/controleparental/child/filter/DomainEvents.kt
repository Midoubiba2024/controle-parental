package fr.controleparental.child.filter

/**
 * Filtrage PUR du journal de domaines (LOT 12b) : n'envoie que les événements
 * capturés sous l'enrôlement COURANT. Un événement mis en file avant un
 * désenrôlement n'est jamais attribué au prochain enfant appairé.
 */
fun eventsForDevice(events: List<FilterClient.DomainEvent>, deviceId: String): List<FilterClient.DomainEvent> =
    events.filter { it.deviceId == deviceId }
