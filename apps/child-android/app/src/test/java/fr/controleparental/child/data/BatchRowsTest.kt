package fr.controleparental.child.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests de la construction PURE des lots PostgREST (LOT 10b). PostgREST rejette un
 * lot entier si ses objets n'ont pas tous le même jeu de clés (PGRST102) : une
 * colonne facultative doit être PRÉSENTE avec null, jamais omise.
 *
 * Données FICTIVES uniquement (identifiants et paquets d'exemple).
 */
class BatchRowsTest {

    private val ids = BatchRows.base("famille-test", "enfant-test", "appareil-test")

    @Test fun unknownLabelOrCategoryIsDroppedSoAKnownValueIsNotOverwritten() {
        val rows = listOf(
            UsageStatsCollector.UsageRow("2026-01-15", "org.exemple.jeu", "Jeu", "game", 60_000, 3, 1_000L),
            UsageStatsCollector.UsageRow("2026-01-15", "org.exemple.inconnu", null, null, 1_000, 1, 2_000L),
            UsageStatsCollector.UsageRow("2026-01-16", "org.exemple.jeu", "Jeu", "game", 5_000, 1, 3_000L),
        ).map { BatchRows.usage(ids, it) }
        assertFalse(rows[1].containsKey("app_label"))
        assertFalse(rows[1].containsKey("category"))
        // Un upsert par jeu de clés : chaque sous-lot est homogène (PGRST102).
        val groups = BatchRows.groupByKeys(rows)
        assertEquals(2, groups.size)
        assertEquals(listOf(2, 1), groups.map { it.size })
        assertTrue(groups.all { BatchRows.haveSameKeys(it) })
    }

    @Test fun inventoryNeverDropsRemovedAtAndDropsUnknownInstallDate() {
        val rows = listOf(
            AppInventoryCollector.AppRow("org.exemple.dessin", "Dessin", "image", false, 1_700_000_000_000L),
            AppInventoryCollector.AppRow("org.exemple.systeme", null, null, true, null),
        ).map { BatchRows.inventory(ids, it, seenAtMs = 1_700_000_100_000L) }
        assertFalse(rows[1].containsKey("installed_at"))
        assertTrue(rows.all { it.containsKey("removed_at") && it["removed_at"] == null })
        assertTrue(BatchRows.groupByKeys(rows).all { BatchRows.haveSameKeys(it) })
    }

    @Test fun anonymousCallKeepsTheCounterpartyKeyWithNull() {
        val rows = listOf(
            CallLogCollector.CallRow("incoming", "a".repeat(64), 30_000, 1_000L),
            CallLogCollector.CallRow("missed", null, 0, 2_000L),
        ).map { BatchRows.call(ids, it) }
        assertTrue(BatchRows.haveSameKeys(rows))
        assertTrue(rows[1].containsKey("counterparty_hash"))
        assertNull(rows[1]["counterparty_hash"])
    }

    @Test fun domainEventsKeepTheSameKeysWhenCategoryIsUnknown() {
        val rows = listOf(
            BatchRows.domainEvent(ids, "bloque.example", "adult", "blocked", "2026-01-15T10:00:00Z"),
            BatchRows.domainEvent(ids, "recherche.example", null, "rewritten", "2026-01-15T10:01:00Z"),
        )
        assertTrue(BatchRows.haveSameKeys(rows))
        assertNull(rows[1]["category"])
    }

    @Test fun safetySignalsAlwaysCarrySourceAppKey() {
        val withApp = BatchRows.safetySignal(ids, "harassment", "high", 2, "2026-01-15T10:00:00Z", "org.exemple.chat")
        val withoutApp = BatchRows.safetySignal(ids, "drugs", "low", 1, "2026-01-15T10:00:00Z", "  ")
        assertTrue(BatchRows.haveSameKeys(listOf(withApp, withoutApp)))
        assertNull(withoutApp["source_app"])
        assertEquals(200, BatchRows.safetySignal(ids, "drugs", "low", 1, "t", "x".repeat(300))["source_app"].toString().length)
    }

    @Test fun everyRowStartsWithTheIdentityColumns() {
        val row = BatchRows.call(ids, CallLogCollector.CallRow("outgoing", null, 0, 0L))
        assertEquals(listOf("family_id", "child_id", "device_id"), row.keys.take(3))
        assertEquals("enfant-test", row["child_id"])
    }

    @Test fun nullBecomesJsonNullAndTheKeyStaysPresent() {
        val arr = BatchRows.toJsonArray(listOf(BatchRows.call(ids, CallLogCollector.CallRow("missed", null, 0, 0L))))
        val o = arr.getJSONObject(0)
        assertTrue(o.has("counterparty_hash"))
        assertTrue(o.isNull("counterparty_hash"))
        assertEquals(org.json.JSONObject.NULL, o.get("counterparty_hash"))
    }

    @Test(expected = IllegalStateException::class)
    fun heterogeneousBatchIsRefused() {
        BatchRows.toJsonArray(listOf(mapOf("a" to 1, "b" to null), mapOf("a" to 2)))
    }

    @Test fun heterogeneousBatchIsDetected() {
        assertFalse(BatchRows.haveSameKeys(listOf(mapOf("a" to 1, "b" to null), mapOf("a" to 2))))
        assertTrue(BatchRows.haveSameKeys(emptyList()))
    }

    @Test fun isoIsUtcAndLocaleIndependent() {
        assertEquals("1970-01-01T00:00:01Z", BatchRows.iso(1_000L))
    }
}
