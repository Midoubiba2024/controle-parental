# Conformité légale & garde-fous

> ⚠️ **Avertissement** : analyse d'ingénierie, **pas un avis juridique**. Faire valider l'AIPD/DPIA
> et les politiques par un juriste / DPO avant mise en service (contexte CNIL pour la France).

## 1. La ligne rouge : contrôle parental ≠ stalkerware

Ce qui sépare une app **légale et publiable** d'un logiciel espion illégal :

| Contrôle parental **légal** | Stalkerware **illégal** |
|-----------------------------|-------------------------|
| App **visible**, notification de supervision persistante | App **cachée** / mode furtif |
| **Consentement** (autorité parentale + assentiment de l'enfant) | Surveillance **à l'insu** |
| **Métadonnées / agrégats** (temps, domaines, zones) | Capture du **contenu** (messages, appels, écran) |
| **Alertes on-device** | Exfiltration du contenu brut vers le cloud |
| **Minimisation** + rétention bornée | Collecte exhaustive, conservation indéfinie |
| **Proportionné à l'âge**, dégressif | Surveillance totale constante |

## 2. Fonctions interdites (exclues par conception)

Chacune est illégale **même envers son propre enfant**, principalement parce qu'elle capte un **tiers
non consentant** (le correspondant) ou viole la vie privée de l'enfant lui-même :

1. **Enregistrement des appels** — FR art. 226‑1 (1 an, 45 000 €) ; US ECPA + États « à deux
   parties ». Le *vicarious consent* ne couvre jamais le tiers.
2. **Micro d'ambiance caché** — capte des paroles privées de tiers (226‑1 / wiretapping).
3. **Caméra cachée / image en lieu privé** — 226‑1 ; risque aggravé (images d'un mineur).
4. **Interception du contenu** des messages de tiers (SMS, messageries, e-mails) — secret des
   correspondances (226‑15) ; interception illégale (ECPA).
5. **Mode furtif / icône masquée / anti-désinstallation occulte** — non conforme RGPD (transparence),
   contraire aux politiques des stores, critères Coalition Against Stalkerware.
6. **Keylogging** (mots de passe, credentials de tiers).
7. **Lecture/exfiltration de comptes de tiers** (DM d'amis, groupes).
8. **Géolocalisation occulte** sans information (226‑1 + transparence CNIL).
9. **Revente / publicité ciblée / partage tiers** des données d'enfant (COPPA 2025, RGPD).
10. **Conservation indéfinie** sans politique de rétention écrite (RGPD art. 5, COPPA 2025).
11. **Surveillance après 18 ans** sans consentement propre (autorité parentale cessée).
12. **Collecte biométrique** sans régime renforcé (RGPD art. 9, COPPA 2025).

## 3. Contraintes réglementaires structurantes

### France / UE (RGPD, CNIL)
- **Base légale & âge du consentement** : en France, majorité numérique **15 ans** (RGPD art. 8). En
  dessous → **co-consentement** du titulaire de l'autorité parentale + assentiment de l'enfant « dans
  la mesure du possible ». Le parent ne peut pas consentir à la place de l'enfant pour légitimer une
  surveillance **occulte**. → *Onboarding distinguant parent/enfant, attestation d'autorité parentale.*
- **Transparence & proportionnalité (CNIL)** : information claire **adaptée à l'âge** ; surveillance
  secrète/très intrusive = non conforme. → *Notice visible persistante, langage adapté, pas de mode furtif.*
- **Minimisation (art. 5‑1‑c)** : collecte limitée au nécessaire. → *Alertes/filtrage on-device plutôt
  qu'exfiltration ; métadonnées plutôt que contenu.*
- **Privacy by default (art. 25)** : paramètres les plus protecteurs **activés par défaut** ; options
  intrusives **désactivées** par défaut.
- **Droits de l'enfant (art. 12‑22)** : information, accès, rectification, effacement — y compris pour
  le mineur. → *Portail de transparence + exercice des droits.*
- **Rétention (art. 5‑1‑e)** : durée limitée, politique écrite. → *Durées par type + purge auto.*
- **Secret des correspondances (art. 226‑15 + ePrivacy)** : ne jamais capter le contenu impliquant un
  tiers non consentant.
- **Audio/vidéo (art. 226‑1)** : exclure micro d'ambiance et caméra cachée ; géoloc transparente.
- **AIPD/DPIA (art. 35)** : **obligatoire** (traitement à grande échelle de personnes vulnérables).
  → *À réaliser avant mise en service ; registre des traitements ; référent/DPO.*
- **Contexte FR récent** : contrôle parental devant être activable gratuitement sur les terminaux ;
  restrictions d'accès aux réseaux sociaux sous 15 ans → oriente vers **filtrage & médiation** plutôt
  qu'espionnage.

### USA (COPPA 2025, ECPA)
- **Verifiable Parental Consent (VPC)** avant toute collecte pour les **< 13 ans** ; consentement
  **séparé** avant tout partage tiers (Final Rule 2025, conformité 22 avril 2026). → *Flux VPC réel
  (SMS text-plus, knowledge-based auth) ; pas de partage tiers par défaut.*
- **Lois d'écoute à 1 ou 2 parties** : dans les États « à deux parties » (CA, FL, PA, IL, WA…), toutes
  les parties doivent consentir → **feature-gating géographique** ; par prudence, **pas
  d'enregistrement audio/appels, nulle part**.
- **Interdiction de monétisation** des données d'enfants (pub ciblée, partage).
- **Identifiants étendus** (biométrie, identifiants d'État) = données personnelles protégées.

### Transversal (stores)
- **Interdiction stalkerware** (Apple/Google, Coalition Against Stalkerware) : utiliser les **API
  officielles**, app **visible et désinstallable** selon règles d'âge, flag **`isMonitoringTool =
  child_monitoring`** dans tous les manifests, **jamais** se présenter comme outil d'espionnage, usage
  réservé à la surveillance **d'un enfant** (jamais d'un adulte/conjoint). Retrait immédiat sinon.

## 4. Garde-fous obligatoires à implémenter

1. Onboarding **rôles séparés** parent/enfant + attestation d'autorité parentale + vérification
   d'identité/âge du parent (VPC pour < 13 ans).
2. **Co-consentement** du mineur < 15 ans (FR) / consentement direct ≥ 15 ans ; consentement **séparé
   par finalité** ; **aucun partage tiers par défaut**.
3. **Notice visible et permanente** côté enfant (icône d'état + notification + rappels) — **zéro mode furtif**.
4. **Minimisation & privacy by default** : seulement le nécessaire ; options intrusives off par défaut + justifiées.
5. Architecture **sans captation du contenu de tiers** : filtrage/détection **on-device**, alertes
   plutôt qu'exfiltration ; **aucun** enregistrement d'appels ni micro d'ambiance.
6. **Politique de rétention écrite et publiée** (durées par type + purge/anonymisation auto).
7. **Chiffrement** en transit et au repos ; contrôle d'accès strict ; MFA parent ; cloisonnement ;
   journal de sécurité ; procédure de notification de violation (art. 33‑34).
8. **Portail de transparence & droits** (accès, rectification, effacement, portabilité).
9. **AIPD/DPIA** avant mise en service ; registre ; référent/DPO.
10. **Feature-gating géographique** des fonctions à risque (audio off dans les États à deux parties).
11. **Politique de confidentialité** réelle + **notice spécifique enfant** ; pas de SDK pub/analytics
    invasifs ; pas de revente.
12. **API officielles** des OS ; app visible/désinstallable selon l'âge ; conforme aux stores.
13. Mécanisme de **fin de surveillance à 18 ans** + suppression des données.
14. **Intrusivité dégressive selon l'âge**, implication croissante de l'ado (dashboard partagé,
    localisation mutuelle plutôt qu'unilatérale).

## 5. Curseur par âge (nos deux profils)

| | **~6 ans (jeune enfant)** | **~12 ans (pré-ado)** |
|--|---------------------------|------------------------|
| Cadre admis | Le plus large : filtrage, limites de temps, géoloc transparente, blocage fort | Plus restreint : transparence **accrue**, autonomie, visibilité **mutuelle** |
| Consentement | Porté par le titulaire de l'autorité parentale | Co-consentement + assentiment ; information renforcée de l'ado |
| Fonctions sensibles (G/F) | Désactivées / minimales | Activables **en version transparente on-device**, affichées à l'ado |
| Esprit | Protection & encadrement | **Médiation & co-régulation**, pas espionnage |

À l'approche de **15 ans** (majorité numérique FR) puis **18 ans** : allègement automatique du
monitoring, bascule vers le consentement propre du jeune, puis arrêt.
