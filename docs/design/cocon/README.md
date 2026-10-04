# Identité visuelle « Cocon » — console parent

Direction retenue (A · Cocon) : chaleureuse, rassurante et raffinée. C'est une évolution
de l'identité crème/corail d'origine, en plus élégant.

Les deux maquettes de ce dossier servent de **référence de conception** à la refonte
de la console (`apps/parent-web`) :

| Fichier | Écran |
|---|---|
| `vue-ensemble.dc.html` | Vue d'ensemble : coquille commune, tuiles, histogramme 7 jours, anneau par catégorie, top des applications, carte de transparence |
| `famille.dc.html` | Famille & appareils : ajout d'un enfant, fiche enfant, code d'appairage, journal d'audit |

Ce sont des maquettes HTML à styles en ligne, au format d'un outil de conception
(balise `<x-dc>`, trou `{{accent}}`). Elles **ne s'ouvrent pas telles quelles**
dans un navigateur, mais se lisent comme du HTML : valeurs de couleurs, tailles,
espacements, rayons, ombres et structure. **Elles ne sont jamais embarquées dans
l'application.**

## Jetons (résumé)

- **Couleurs (clair)**
  - fond ivoire `#FAF6EF`, surface des cartes `#FFFDF9`
  - bordure `#ECE2D3` (contrôles `#E2D6C4`, champs de saisie `#9C8B7E`)
  - encre aubergine `#2A1B2D`, texte secondaire `#6E5F69`
- **Barre latérale** : prune `#2A1B2D`, liens `#E8DEE5`, titres de section `#A9949F`, pied `#BFAFC0`.
- **Accent** corail profond `#B5472F` (5,4:1 avec du blanc).
  - teinte claire de l'accent `#F6E3DC`
  - survol des liens `#8E3522`
- **Couleurs secondaires**
  - sable `#F1E6D5` / `#E4D3BA` / `#D9B47A`
  - prune `#4A2F4E`
  - sauge `#7FA486`
  - états positifs : `#2B5236` sur `#E9F0E6`
  - mentions « ne voit jamais » en brique `#7A3524`
- **Typographie**
  - Fraunces : titres, h1 34 px/500, titres de cartes 18 px/600, grands chiffres 32 px, nom de famille ;
  - Figtree : texte 15 px, légendes 12–13 px, code d'appairage 40 px en chiffres tabulaires.
- **Formes**
  - rayons 12 px (contrôles) à 18 px (cartes et barre latérale) ;
  - ombres très douces sur deux couches ;
  - aucun dégradé, aucune bordure gauche colorée ;
  - cibles d'au moins 44 px.
