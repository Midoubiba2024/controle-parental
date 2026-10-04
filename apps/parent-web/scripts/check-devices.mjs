// Test unitaire (sans dépendance de test) de src/lib/devices.ts — LOT 12, revue #9.
// Un téléphone réinitialisé puis ré-appairé laisse un ancien appareil : les vues
// « Localiser » et « Contrôle instantané » doivent viser l'appareil ACTIF le plus
// RÉCENT, jamais le premier créé ni un appareil retiré.
// Transpile le module TypeScript avec le compilateur du projet (Node 20 compatible).
import { readFileSync } from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";

async function load(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
}
const { activeDevicesNewestFirst, latestActiveDevice } = await load("../src/lib/devices.ts");
const { formatPairingCode, pairingDisplay, pairingGroups } = await load("../src/lib/pairing.ts");

const dev = (id, o = {}) => ({
  id, family_id: "f", child_id: "c", platform: "android", mode: "standard",
  label: null, model: null, enrolled_at: null, last_seen_at: null, revoked_at: null, ...o,
});

// D1 = appareil « fantôme » (créé en premier, plus de contact), D2 = ré-appairé.
const d1 = dev("D1", { enrolled_at: "2026-09-01T10:00:00Z", last_seen_at: "2026-09-20T08:00:00Z" });
const d2 = dev("D2", { enrolled_at: "2026-10-01T10:00:00Z", last_seen_at: "2026-10-04T07:00:00Z" });
const d0 = dev("D0", { enrolled_at: "2026-10-03T10:00:00Z", revoked_at: "2026-10-03T11:00:00Z" });
// Liste triée par created_at croissant, comme la renvoie la base.
const list = [d1, d2, d0];

assert.equal(latestActiveDevice(list)?.id, "D2", "l'appareil actif le plus récent est choisi");
assert.deepEqual(activeDevicesNewestFirst(list).map((d) => d.id), ["D2", "D1"], "actifs, plus récent d'abord, révoqués exclus");
assert.equal(latestActiveDevice([d0]), null, "aucun appareil actif → null");
assert.equal(latestActiveDevice([]), null, "liste vide → null");
// Sans horodatage : le dernier de la liste (créé le plus tard) l'emporte.
assert.equal(latestActiveDevice([dev("A"), dev("B")])?.id, "B", "sans horodatage : le plus récemment créé");
// Un ancien appareil qui a contacté le serveur récemment reste prioritaire (il est vivant).
const d1live = { ...d1, last_seen_at: "2026-10-04T09:00:00Z" };
assert.equal(latestActiveDevice([d1live, d2])?.id, "D1", "dernier contact le plus récent l'emporte");

console.log("✓ devices : sélection de l'appareil actif le plus récent (6 assertions)");

// Code d'appairage (LOT 12) : 10 caractères base32 Crockford, affiché et copié en 5+5.
assert.equal(formatPairingCode("7KQ2MX9D4F"), "7KQ2M-X9D4F", "forme brute → groupée 5+5");
assert.equal(formatPairingCode(" 7kq2m x9d4f "), "7KQ2M-X9D4F", "espaces retirés, majuscules");
assert.equal(formatPairingCode("7KQ2M-X9D4F"), "7KQ2M-X9D4F", "forme déjà groupée inchangée");
assert.equal(formatPairingCode("53381539"), "53381539", "autre longueur : pas de découpage inventé");
assert.equal(pairingDisplay({ code: "7KQ2MX9D4F", code_display: "7KQ2M-X9D4F" }), "7KQ2M-X9D4F", "code_display du serveur prioritaire");
assert.equal(pairingDisplay({ code: "7KQ2MX9D4F" }), "7KQ2M-X9D4F", "sans code_display : calculé");
assert.deepEqual(pairingGroups("7KQ2M-X9D4F"), ["7KQ2M", "X9D4F"], "deux groupes de 5");

console.log("✓ appairage : code groupé 5+5 affiché et copié (7 assertions)");
