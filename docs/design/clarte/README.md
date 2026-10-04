# Identité « Clarté »

Calme, nette, très professionnelle : l'esprit d'une application de banque ou de santé. Elle peut être choisie dans **Réglages**, à côté de Cocon (défaut) et de Jardin.

Les maquettes `vue-ensemble.dc.html` et `famille.dc.html` sont des **références de conception**. Leurs données sont 100 % fictives (famille DURAND, enfant Léa). Ce sont du HTML à styles en ligne, au format d'un outil de conception, qu'on ne peut pas ouvrir tel quel. Elles ne sont jamais embarquées dans l'application.

## Ce qui fait foi (LOT 11)

L'identité est **implémentée** dans la console. En cas d'écart avec les maquettes ou les jetons de départ ci-dessous, l'application fait foi :

- **jetons** (couleurs claires et sombres, rayons, ombres, polices, séries de graphiques) : `apps/parent-web/src/themes/clarte.css`, contrôlés par `npm run check:theme` (mêmes noms de jetons que Cocon, blocs sombres identiques, contrastes WCAG) ;
- **polices** : Sora et Manrope, auto-hébergées (`@fontsource-variable`, latin et latin-ext) et **chargées à la demande** (`apps/parent-web/src/fonts/clarte.css`) : un utilisateur de Cocon ne les télécharge jamais ;
- **textes** : le catalogue `apps/parent-web/src/i18n/locales/fr.ts`.

## Jetons de départ (intention de conception)

**Couleurs**
- Fond `#EEF2F7` ; surface `#FFFFFF`.
- Bordures `#DCE3EC` ; séparateurs `#EDF1F6`.
- Encre `#0F1B2D` ; texte secondaire `#4A5A70` ; légende `#5B6B80`.
- Barre latérale bleu nuit (vers `#0E1E3A`).
- Accent bleu franc (vers `#1D5FD1`) ; succès `#1F9D5C`.

**Typographie**
- Titres en **Sora**, texte en **Manrope**.
- Chiffres tabulaires.

**Formes**
- Rayons de 10 à 12 px.
- Bordures fines de 1 px, ombres quasi absentes.
