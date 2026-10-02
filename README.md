# Contrôle Parental

Suite de **contrôle parental transparent et légal** pour Android, pour deux profils
(~6 ans et ~12 ans). Monorepo : backend Supabase, console parent web, app enfant Android.

> **Principe non négociable — transparence.** App visible, notification de supervision
> persistante, consentement, aucune captation du contenu privé. Voir
> [`docs/02-CONFORMITE.md`](docs/02-CONFORMITE.md).

## Structure du dépôt

```
docs/                 Cadrage : plan, cahier des charges, conformité, architecture, lots
supabase/
  migrations/         Schéma SQL + RLS (source de vérité)
  functions/          Edge Functions (Deno) : create-family, pairing-start, pairing-complete
  config.toml         Config Supabase (hook de claims, verify_jwt par fonction)
apps/
  parent-web/         Console parent (React + Vite + supabase-js)
  child-android/      App enfant (Kotlin) — à venir (LOT 0, incrément suivant)
packages/             Code partagé (à venir)
SETUP.md              Étapes de mise en route (hook auth, secrets, variables)
```

## Démarrage rapide

1. **Backend** — le projet Supabase est provisionné (voir `SETUP.md` pour l'URL, les clés
   et les étapes manuelles : activation du hook de claims, secret `PAIRING_PEPPER`).
2. **Console parent** :
   ```bash
   cd apps/parent-web
   cp .env.example .env.local   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
   npm install && npm run dev
   ```
3. **App enfant Android** : à venir (incrément suivant du LOT 0).

## Avancement

| Lot | État |
|-----|------|
| Cadrage (docs) | ✅ (PR #1) |
| **L0 — Socle & Conformité** | ✅ (PR #2) : backend (migrations + RLS + Edge Functions), console parent web, app enfant Android (appairage + notification de supervision + « mes données ») |
| L1 → L9 | à venir — **une session dédiée par lot** |

Détail et suite : [`docs/04-LOTS.md`](docs/04-LOTS.md).
