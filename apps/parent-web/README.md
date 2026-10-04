# Console parent (web)

Console d'administration du contrôle parental : authentification parent, création de
famille, gestion des enfants, génération de codes d'appairage, **tableaux de bord
d'observation** (temps d'écran, applications, appels en métadonnées, batterie/stockage)
et journal d'audit (transparence).

## Stack
React 18 + Vite 5 + TypeScript + `@supabase/supabase-js`. Graphiques en **SVG maison**
(anneau, barres, barres horizontales), palette CVD-safe validée, thème **clair/sombre**,
pensée **iPhone d'abord** (tiroir de navigation, zones sûres, ajout à l'écran d'accueil).

Identité **« Cocon »** (LOT 10, maquettes : `../../docs/design/cocon/`) : fond ivoire, encre
aubergine, barre latérale prune flottante, accent corail profond, touches sable et sauge.
- Jetons CSS = **seule source de vérité** (`src/styles.css`, `:root` + thème sombre).
- Polices **auto-hébergées** (OFL, aucun CDN — RGPD) : Fraunces (titres) et Figtree (texte),
  sous-ensembles latin/latin-ext (`src/fonts.css`), police de texte préchargée.
- Icônes `lucide-react` (ISC) + logo maison (`src/components/icons.tsx`) ; aucun emoji.
- Vues chargées à la demande (`React.lazy`) ; chunks `react`, `supabase`, `leaflet`, `i18n-fr`.

## Lancer en local
```bash
cp .env.example .env.local      # renseigner URL + clé anon (voir ../../SETUP.md)
npm install
npm run dev                     # http://localhost:5173
```

### Captures visuelles (hors CI)
```bash
npm run e2e:visual              # captures PNG dans $SHOTS_DIR (défaut : <tmp>/cocon-shots)
```
Construit l'appli avec une URL Supabase factice, la sert (`vite preview`) et intercepte tout
le réseau avec des fixtures (`e2e/fixtures.mjs`) — aucun mode démo dans le code de production.
Connexion + 13 vues, 1440×900 et 390×844, clair et sombre, tiroir mobile ouvert. Chromium :
`PW_CHROMIUM`, sinon `/opt/pw-browsers/chromium`. Icônes PNG : `node scripts/gen-icons.mjs`.

## Ce que fait le squelette (LOT 0)
- Connexion / création de compte parent (MFA à activer côté Supabase, cf. SETUP.md).
- **Créer une famille** → appelle l'Edge Function `create-family` (famille + owner atomiques).
- **Ajouter un enfant** → insert RLS sur `children` (profil d'âge déduit de la date de naissance).
- **Générer un code d'appairage** (mode Standard/Renforcé) → Edge Function `pairing-start`
  (code haché, TTL 10 min, usage unique). Le code s'affiche une seule fois.
- **Appareils** et **journal d'audit** de la famille (lecture via RLS).

## Observation transparente (LOT 1)
Navigation par barre latérale ; sélecteur d'enfant + état de l'appareil (batterie/stockage)
en en-tête. Vues :
- **Vue d'ensemble** : temps d'écran du jour (+ tendance), anneau par catégorie, barres 7 jours,
  top apps, tuiles batterie/stockage.
- **Temps d'écran** : périodes 7/30 j, tendance quotidienne, répartition par catégorie,
  comparaison vs période précédente, top apps, ouvertures.
- **Applications** : maître-détail (recherche, usage par app sur 7 jours, catégorie, dernière
  utilisation).
- **Appels** : journal en **métadonnées seulement** (sens / correspondant / durée / date),
  jamais le contenu.

Toutes les données sont des **agrégats / métadonnées** lues sous RLS (le parent ne voit que
sa famille ; l'enfant voit aussi les siennes).

## À venir
Carte de localisation, règles (blocage apps, filtrage), messagerie, approbations —
lots suivants (voir `../../docs/04-LOTS.md`).
