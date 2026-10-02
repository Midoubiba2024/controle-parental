# Console parent (web)

Console d'administration du contrôle parental : authentification parent, création de
famille, gestion des enfants, génération de codes d'appairage, visualisation des appareils
et du journal d'audit (transparence).

## Stack
React 18 + Vite 5 + TypeScript + `@supabase/supabase-js`.

## Lancer en local
```bash
cp .env.example .env.local      # renseigner URL + clé anon (voir ../../SETUP.md)
npm install
npm run dev                     # http://localhost:5173
```

## Ce que fait le squelette (LOT 0)
- Connexion / création de compte parent (MFA à activer côté Supabase, cf. SETUP.md).
- **Créer une famille** → appelle l'Edge Function `create-family` (famille + owner atomiques).
- **Ajouter un enfant** → insert RLS sur `children` (profil d'âge déduit de la date de naissance).
- **Générer un code d'appairage** (mode Standard/Renforcé) → Edge Function `pairing-start`
  (code haché, TTL 10 min, usage unique). Le code s'affiche une seule fois.
- **Appareils** et **journal d'audit** de la famille (lecture via RLS).

## À venir
Carte de localisation, règles (temps d'écran, apps, filtrage), messagerie, approbations —
lots suivants (voir `../../docs/04-LOTS.md`).
