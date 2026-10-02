# Veille concurrentielle — fonctions & design à récupérer

> Analyse d'écart (gap analysis) : ce que les concurrents ont et qui **manque** à notre projet, comparé à nos 11 modules et au prototype. **Légaux/transparents uniquement** — les fonctions d'espionnage restent exclues (voir [`02-CONFORMITE.md`](02-CONFORMITE.md)).

Concurrents analysés : Google Family Link, Apple Screen Time/Family, Microsoft Family Safety, Qustodio, Bark, Norton Family, Life360, Kaspersky Safe Kids, Mobicip, Canopy, Aura, OurPact, FamiSafe, Boomerang, **MMGuardian** (analyse dédiée), + une revue design/UX et des dimensions transverses (multi-plateforme, IA, modèle).

**Récapitulatif** : 140 fonctions à intégrer (légales/conditionnelles), 46 motifs design/UX, 19 fonctions écartées (illégales). Priorités : `must` indispensable · `should` important · `nice` confort. ⚠️ = conditionnel (légal seulement si transparent + sans captation du contenu de tiers).

---

## 1. Fonctions à intégrer, par lot

### L1 — Observation transparente

| Fonction | Prio | Description | Concurrents |
|---|---|---|---|
| ⚠️ Journal des appels et SMS (métadonnées uniquement, transparent) | should | Historique des appels et SMS limité aux métadonnées (numéro/contact, sens entrant/sortant, horodatage, durée) — jamais le contenu des messages. Affic… | Microsoft Family Safety |
| ⚠️ Journal d'appels (métadonnées : qui/quand/durée, sans contenu) | should | Historique d'appels limité aux métadonnées, visible par l'enfant. | MMGuardian |
| Niveau de batterie et stockage de l'appareil dans la console | nice | Afficher dans l'en-tête d'appareil le niveau de batterie restant et l'espace de stockage, en plus de la fraîcheur et du badge « géré » déjà présents. | Google Family Link |
| Suivi de la consommation de données mobiles | nice | Rapport de consommation data mobile par app/période, avec alerte de dépassement optionnelle. | Microsoft Family Safety |
| Tendances et comparaisons dans les rapports | nice | Ajouter aux rapports des tendances semaine/mois, la comparaison à la semaine précédente et à la recommandation d'âge (ex. « +2 h de réseaux sociaux v… | Microsoft Family Safety, Apple Screen Time |

### L2 — Règles d'accès

| Fonction | Prio | Description | Concurrents |
|---|---|---|---|
| Mode vacances / pause de planning temporaire | should | Suspension temporaire des plannings horaires et du mode École sur une plage de dates (vacances, week-end, jour férié, maladie), avec reprise automati… | Google Family Link |
| Verrouillage de paramètres système sensibles (anti-contournement) | should | Empêcher l'enfant de modifier les réglages utilisés pour contourner la supervision : ajout/suppression de compte, changement de la date et de l'heure… | Apple Screen Time |
| Préréglages de temps par catégorie recommandés par âge (Time Allowances) | should | Préréglages de limites par catégorie (réseaux sociaux, divertissement, jeux) fondés sur des recommandations d'experts et calibrés par tranche d'âge,… | Apple Screen Time |
| Gestion / silence des notifications pendant École et Downtime | nice | Pendant le mode École et le downtime, mettre en sourdine ou masquer les notifications (sauf apps autorisées) et prévoir des pauses planifiées (déjeun… | Google Family Link |
| Délai de grâce « encore une minute » à l'échéance | nice | À l'atteinte d'une limite ou au début du downtime, proposer un court délai de grâce paramétrable (ex. 1 à 5 min) pour terminer/sauvegarder, avant le… | Apple Screen Time |
| Masquer / désactiver des applications intégrées | nice | Possibilité de masquer ou désactiver des apps système/préinstallées (navigateur, appareil photo, store, assistant) en plus du blocage des apps tierce… | Apple Screen Time |

### L3 — Localisation & Sécurité

| Fonction | Prio | Description | Concurrents |
|---|---|---|---|
| Faire sonner l'appareil à distance (localiser un appareil égaré) | should | Action depuis la console pour faire sonner l'appareil enfant à plein volume même en silencieux, afin de le retrouver à la maison ou de joindre l'enfa… | Google Family Link |
| Sécurité au volant / rapport de conduite (profil ado) | nice | Pour le profil ado conducteur : historique des trajets en voiture avec vitesse, freinages brusques, usage du téléphone au volant et score de conduite… | Microsoft Family Safety |
| Automatisation de mode par géofence (École / Downtime déclenchés par lieu) | nice | Déclencher automatiquement un mode (École, downtime, pause) lorsque l'enfant entre/sort d'une zone (école, domicile), en combinant géofencing et règl… | Google Family Link |
| Faire sonner le téléphone (buzz) même en silencieux | nice | Retrouver un téléphone égaré ou obtenir une réponse. | MMGuardian |

### L4 — Filtrage réseau & contenu

| Fonction | Prio | Description | Concurrents |
|---|---|---|---|
| Gestion des assistants IA génératifs (Gemini / Siri / chatbots) | must | Réglage dédié pour activer/désactiver l'accès de l'enfant aux assistants IA génératifs et appliquer un filtrage de contenu adapté à l'âge (bloquer to… | Google Family Link, Apple Screen Time |
| Restrictions de contenu média (musique, podcasts, actualités, livres explicites) | should | Blocage de la lecture des contenus marqués explicites dans la musique, les clips, les podcasts, les actualités et les livres/ebooks — indépendamment… | Apple Screen Time |
| Restrictions sociales de jeu (multijoueur, ajout d'amis, chat in-game, enregistrement d'écran) | should | Réglages de type Game Center : autoriser/interdire le multijoueur (avec tout le monde / amis uniquement / personne), l'ajout d'amis, la messagerie pr… | Apple Screen Time |
| Choix d'expérience YouTube (YouTube Kids vs expérience supervisée + niveaux de contenu par âge) | should | Laisser le parent choisir entre l'app YouTube Kids et une expérience YouTube supervisée, et sélectionner le niveau de contenu adapté à l'âge (type «… | Google Family Link |

### L5 — Gestion à distance & communication

| Fonction | Prio | Description | Concurrents |
|---|---|---|---|
| Gestion des contacts autorisés (appels & SMS natifs) | must | Permettre au parent de gérer la liste des contacts que l'enfant peut appeler/texter via le téléphone et les SMS natifs : ajout de contacts depuis la… | Google Family Link, Apple Screen Time, Boomerang, TickTalk |
| Code d'accès parent temporaire (déverrouillage ponctuel hors-ligne) | must | Génération d'un code court à durée de vie limitée (ex. 30 min) que le parent saisit en personne sur l'appareil enfant pour accorder un déverrouillage… | Google Family Link, Apple Screen Time |
| Blocage de contacts (appels + SMS, listes allow/block) | should | Bloquer un numéro/contact nuisible ; liste blanche pour le jeune enfant. | MMGuardian |
| Verrouillage avec message personnalisé sur l'écran | nice | Lors d'un verrouillage/pause à distance, afficher un message personnalisé à l'enfant (ex. « À table ! » ou « Appelle maman ») sur l'écran bloqué. | Google Family Link |
| Verrouillage / effacement anti-vol à distance | nice | Protéger les données en cas de vol/perte (confirmation forte + audit). | MMGuardian |

### L6 — Bien-être & sécurité on-device

| Fonction | Prio | Description | Concurrents |
|---|---|---|---|
| Détection de contenu violent / gore (en plus de la nudité) | should | Étendre la détection on-device d'images sensibles pour couvrir aussi le contenu violent/gore (et pas seulement la nudité/sextos) : floutage et ressou… | Apple Screen Time |
| Détection en appel vidéo live et sur AirDrop / partage de proximité / albums partagés | should | Étendre la détection d'images sensibles aux surfaces supplémentaires : appels vidéo en direct (visio), partage de proximité type AirDrop, albums/phot… | Apple Screen Time |
| Signalement one-tap aux autorités (grooming) — 3018 / PHAROS | should | Parcours de signalement UE quand la détection grooming on-device se déclenche. | MMGuardian |
| Routage ressources prévention suicide (3114) | should | Numéro national + ressources côté enfant et parent lors d'une détection. | MMGuardian |
| Santé auditive : limite de volume et alertes casque | nice | Plafond de volume de sortie et notifications d'exposition sonore au casque (niveau et durée) pour protéger l'audition de l'enfant, avec réglage côté… | Apple Screen Time |
| Distance d'écran / santé visuelle (Screen Distance) | nice | Alerte on-device quand l'appareil est tenu trop près du visage trop longtemps, invitant l'enfant à l'éloigner (prévention de la myopie), à l'aide des… | Apple Screen Time |
| Protections étendues automatiquement et par défaut aux ados 13-17 | nice | Appliquer automatiquement, par défaut, un socle de protections (détection de contenu sensible, filtres, Communication Safety) aux comptes ados 13-17,… | Apple Screen Time |

### L8 — Privacy Ops & Publication

| Fonction | Prio | Description | Concurrents |
|---|---|---|---|
| API de tranche d'âge déclarée pour apps tierces | nice | Fournir aux apps tierces, de façon privée et avec consentement, la tranche d'âge de l'enfant (sans date de naissance exacte) pour qu'elles adaptent l… | Apple Screen Time |

### L9 — Famille & extras

| Fonction | Prio | Description | Concurrents |
|---|---|---|---|
| Portefeuille familial, plafonds de dépenses et historique d'achats | should | Solde d'achat de l'enfant visible par le parent, possibilité d'ajouter de l'argent, plafonds de dépenses, et historique détaillé des achats (apps, je… | Microsoft Family Safety, Apple Screen Time, Google Family Link |
| Partage familial des achats et abonnements (bibliothèque partagée) | nice | Permettre à la famille de partager les apps, abonnements et contenus achetés (une seule acquisition utilisable par les enfants), avec approbation d'a… | Apple Screen Time, Google Family Link |
| Gestion multi-plateformes (ChromeOS / Windows / Xbox / iOS) | nice | Étendre la supervision au-delà d'Android : Chromebook, PC Windows, console Xbox, iOS — mêmes règles de temps/contenu/achats agrégées par enfant. À co… | Microsoft Family Safety, Google Family Link, Apple Screen Time |

### Transverse / plateformes / modèle

| Fonction | Prio | Description | Concurrents |
|---|---|---|---|
| Notifications push temps réel vers le téléphone parent | must | Push instantané au parent pour alertes de risque, demandes de +temps/accès, entrée/sortie de géofence, check-in, batterie faible, SOS. Les trois conc… | Qustodio, Bark, Norton Family |
| Surveillance des apps de chat IA (ChatGPT, Character.AI, etc.) | must | Inventaire des assistants/compagnons IA utilisés et alertes sur conversations IA à risque (relation parasociale, conseils dangereux, contenu sensible… | Aura (AI App Monitoring), Bright Canary, Character.AI (parental insights) |
| App parent mobile native (iOS + Android) | should | Les trois concurrents proposent une app parent mobile native (gestion, carte, alertes, approbations en déplacement). Notre projet n'a qu'une console… | Qustodio, Bark, Norton Family |
| Alerte anti-sabotage active (tamper alert) | should | Au-delà de l'anti-désinstallation visible que nous avons déjà, notifier le parent lors des tentatives: désinstallation, désactivation de l'accessibil… | Qustodio |
| Alertes de tentative en temps réel ('Alert Me') | should | Notifier le parent quand l'enfant tente une action interdite par les règles: ouvrir une app bloquée, visiter un site bloqué, dépasser la limite, cont… | Norton Family, Qustodio |
| Protection des informations personnelles sortantes (PII) | should | Détection on-device si l'enfant s'apprête à partager des infos sensibles (numéro de téléphone, adresse postale, nom de l'école, email) en ligne, avec… | Norton Family |
| Taxonomie d'alertes élargie (santé mentale + risques) | should | Élargir nos catégories de détection on-device (aujourd'hui sextos/grooming/mots-clés de risque) vers le référentiel Bark: dépression, idées suicidair… | Bark |
| Déverrouillage d'urgence par code PIN côté enfant | should | Un code PIN permettant à l'enfant de débloquer temporairement l'appareil en cas d'urgence, même après la limite de temps atteinte / verrouillage inst… | Norton Family |
| Routines / profils de règles contextuels | should | Jeux de règles multiples activables selon le contexte (devoirs, coucher, week-end, vacances), au-delà d'un planning horaire unique. Qustodio 'Routine… | Qustodio |
| Support multi-plateforme (Windows, macOS, ChromeOS, iOS, Fire/Kindle) | should | Qustodio et Norton couvrent Windows, Mac, Chromebook, iOS et Android; Bark ajoute Chromebook, ordinateurs et tablettes Fire. Notre projet est Android… | Qustodio, Norton Family, Bark, Kaspersky Safe Kids |
| Détection automatique de trajets en voiture (drive detection) | should | Détecter automatiquement, via les capteurs et la localisation du téléphone, quand un membre est en voiture, et enregistrer chaque trajet (départ, arr… | Life360 |
| Analyse du comportement de conduite | should | Scorer chaque trajet : vitesse, vitesse maximale, freinages brusques, accélérations rapides, usage du téléphone au volant, nombre de km. Indicateurs… | Life360 |
| Répartition d'urgence 24/7 avec agent en direct | should | Escalade des SOS et de la détection d'accident vers un centre d'agents humains 24/7 qui peuvent contacter les secours locaux (911/112) et envoyer de… | Life360 |
| Filtrage IA contextuel temps réel + détection 'zone grise' | should | Analyser en temps réel le CONTENU réel des pages (images, texte, miniatures vidéo) plutôt qu'une simple liste d'URL, et signaler le contenu 'zone gri… | Canopy |
| ⚠️ Blocage actif on-device de l'envoi/réception d'images explicites | should | Au-delà de l'alerte : empêcher réellement l'envoi ET la réception d'images de nudité/partielle détectées sur l'appareil, en temps réel. Le projet dét… | Canopy |
| ⚠️ Analyse de contenu au sein des apps (au-delà du navigateur) | should | Étendre la détection (nudité, mots-clés de risque) au contenu affiché DANS les apps (TikTok, Instagram, YouTube, Discord, messageries), pas seulement… | Canopy, Mobicip |
| Conseils d'experts/psychologues contextuels pour les parents | should | Afficher, dans les réglages et dans les rapports, des conseils de psychologues déclenchés par la situation détectée (ex : 'comment parler à votre enf… | Kaspersky Safe Kids |
| Supervision des IA conversationnelles / compagnons IA | should | Résumé et alertes sur les échanges de l'enfant avec les IA génératives et compagnons (ChatGPT, Google Gemini, Character.AI, Replika) : temps passé, p… | Halo Aware, Sensible, Character.AI Parental Insights, ChatGPT parental controls |
| Analyse IA du bien-être et détection d'anomalies comportementales | should | Au-delà des mots-clés : analyse on-device du ton, de la fréquence, du style de communication et des routines pour repérer détresse (dépression, idées… | Aura Balance, Bark |
| Digest hebdomadaire IA en langage clair | should | Synthèse générée par IA couvrant réseaux sociaux, web, temps d'écran et localisation, avec mise en avant des risques et recommandations, à cadence co… | FamiSafe V9, Bark, Aura |
| ⚠️ Détection de risque multi-plateformes sociales (IA sémantique, 30+ apps) | should | Analyse sémantique IA couvrant explicitement 30+ apps nommées (Instagram, Snapchat, Discord, Reddit, Telegram, WhatsApp, GroupMe…) avec catégories de… | FamiSafe V9, Bark, Qustodio, Helmit |
| Floutage/blocage des images explicites en temps réel (avant affichage) | should | L'IA floute ou bloque l'image/vidéo explicite dans le flux de navigation AVANT que l'enfant ne la voie, et non seulement après coup. | Canopy |
| Prévention d'envoi de sextos (blocage sortant) | should | Empêche l'enfant d'envoyer ou de partager une photo intime et alerte le parent au moment de la tentative. | Canopy |
| ⚠️ Revue des journaux d'appels/SMS (métadonnées) + alertes mots-clés | should | Revue des journaux d'appels et SMS de l'appareil enfant (numéros, horodatage, fréquence) et alertes par mots-clés, sans lire le contenu des tiers. | Boomerang, Qustodio, FamiSafe |
| Règles automatiques déclenchées par contexte (géofence/routines) | should | Moteur de routines appliquant des règles selon le lieu ou le moment : ex. à l'école, bloquer automatiquement les jeux via géofence ; règles par 'mome… | Qustodio, OurPact |
| Anti-contournement renforcé niveau système (Knox/Android) | should | Protections OEM profondes : bloquer le Mode sans échec, désactiver invité/multi-utilisateur et DeX/multi-fenêtre, forcer le GPS actif, verrouiller le… | Boomerang (Samsung Knox) |
| Alertes changement de SIM / extinction / réinitialisation / hors-ligne | should | Notifier le parent si la carte SIM change, si l'appareil est éteint, réinitialisé en usine, ou passe hors-ligne de façon prolongée. | TickTalk, divers |
| Localiser/faire sonner un appareil perdu + traceurs d'objets | should | Faire sonner fort l'appareil même en silencieux, afficher la dernière position connue hors-ligne, et intégrer des traceurs Bluetooth (type Tile) pour… | Life360 (Tile), montres enfants (TickTalk, Bark Watch) |
| Support montres connectées / wearables enfant | should | Superviser une montre connectée enfant (Wear OS, Galaxy Watch, montres GPS dédiées) : contacts, SOS, localisation, mode école — en plus du smartphone. | Google Family Link, Bark Watch, TickTalk |
| App enfant iOS (iPhone/iPad) | should | Version iOS de l'app enfant via profil de configuration MDM/supervision. Notre projet est 100% Android ; la quasi-totalité des concurrents couvrent i… | Qustodio, Bark, Aura, Google Family Link (via Apple) |
| Agent Windows (bureau) | should | Filtrage web, temps d'écran, blocage d'apps et rapports sur PC Windows. Concurrents majeurs couvrent le poste fixe/portable, central pour les devoirs… | Qustodio, Kaspersky Safe Kids, Net Nanny, Mobicip |
| Agent macOS | should | Même couverture (filtrage, temps, apps, rapports) sur Mac. Attendu par les familles Apple. | Qustodio, Net Nanny, Mobicip, Norton Family |
| Support Chromebook / ChromeOS | should | Rapports d'usage apps/sites, blocage, quotas et planning sur Chromebook (extension + app). Très utilisé en milieu scolaire. | Qustodio, Google Family Link, Mobicip |
| Extension navigateur (Chrome/Firefox/Edge/Safari) | should | Extension de filtrage web et de collecte d'activité navigateur sur ordinateur (catégories, listes, SafeSearch, YouTube restreint côté desktop). Notre… | Qustodio (Chrome/Firefox/Edge/Safari/Silk) |
| Compatibilité montre connectée enfant (kids smartwatch) | should | Gestion d'une montre GPS enfant : localisation, géofencing, liste de contacts autorisés de la montre, appels/visio vers contacts validés, SOS montre,… | Bark Watch, Find My Kids, Angel Watch, Xplora |
| Résumé d'activité hebdomadaire généré par IA (langage naturel) | should | Synthèse automatique en langage clair : apps les plus utilisées, interlocuteurs fréquents, tendances, points d'attention — au-delà de nos tableaux de… | Bark, Character.AI parental insights, Aura |
| Détection de tendances / changements de comportement | should | Score d'évolution sociale et détection d'anomalies (ex : scroll nocturne, chute/pic d'activité, isolement) sans révéler le contenu privé. Complète no… | Aura (Social Patterns Score / Balance), Bark |
| Conseils conversationnels pour le parent (next steps) | should | Pour chaque alerte, suggestions de ressources et d'amorces de dialogue avec l'enfant (comment aborder le sujet), pas seulement la notification. | Bark |
| Détection de risque multilingue (on-device) | should | Nos détections on-device (mots-clés, grooming, sextos) doivent couvrir plusieurs langues et l'argot/emoji, pas uniquement le français. | Bark (multi-langue, 30+ apps) |
| Objectifs de bien-être numérique / coaching | should | Définition d'objectifs (réduire tel usage, se coucher plus tôt) avec suivi, encouragements et bilan — distinct de nos corvées/points, orienté habitud… | Aura (Wellbeing), Qustodio |
| Mode 'temps en famille' (pause simultanée de tous) | should | Coupure programmée ou instantanée de TOUS les appareils de la famille, y compris ceux des parents, pour les repas/activités communes. | Qustodio, Google Family Link |
| Assistant / chatbot IA de support | should | Chatbot répondant aux questions fréquentes et guidant le dépannage, avec escalade vers un humain. | Qustodio (chatbot IA), Bark (assistant virtuel) |
| Localisation multilingue de l'interface | should | Traduction de la console parent et de l'app enfant en plusieurs langues (ex : EN, ES, DE, IT, PT...) ; aujourd'hui vraisemblablement FR uniquement. | Qustodio (8 langues, 180+ pays), Kaspersky, Norton |
| Modèle freemium (offre gratuite) | should | Palier gratuit durable (fonctions de base) pour acquisition, en plus des offres payantes. | Qustodio (free forever), Google Family Link (gratuit) |
| Essai gratuit (7 à 30 jours) | should | Période d'essai complète sans engagement avant abonnement. | Bark (7 j), Norton (30 j), Mobicip (7 j) |
| Offres par paliers / nombre d'appareils + facturation in-app | should | Plans (basique/complet), limites d'appareils, gestion d'abonnement, codes promo, parrainage, dans l'app. | Qustodio, Mobicip, Bark, Life360 |
| Export PDF/CSV et impression des rapports | should | Export des tableaux de bord/historique en PDF/CSV et impression (en plus du rapport e-mail et de l'export RGPD déjà présents). Utile pour archivage,… | Qustodio, Net Nanny |
| Connexion SSO Google / Apple / e-mail magique | should | Authentification parent simplifiée via fournisseurs d'identité, en plus du compte classique. | Aura, Life360, Qustodio |
| Gestion native des contacts & blocage appels/SMS indésirables | should | Sur l'appareil de l'enfant : liste blanche/noire de contacts, blocage d'appels et SMS d'inconnus/indésirables (métadonnées uniquement). Légal sur l'a… | MMGuardian, Angel Watch (contacts), smartwatches |
| Sensibilité d'alerte réglable par catégorie | nice | Permettre au parent d'ajuster le seuil de sensibilité de chaque catégorie d'alerte (faible/moyen/élevé). Bark offre ce réglage fin. Nous n'avons que… | Bark |
| Analyse on-device étendue: vidéo, audio et texte incrusté | nice | Étendre notre détection d'image on-device aux vidéos (frames + audio parlé) et au texte incrusté dans les images (memes). Bark scanne nudité/violence… | Bark |
| ⚠️ Analyse de tonalité/sentiment des conversations (on-device) | nice | Détection on-device d'humeur/ton (détresse, agressivité, isolement) sur les échanges, avec remontée au parent sous forme d'indicateur agrégé sans exp… | Bark |
| Pause familiale globale du foyer | nice | Couper/pauser d'un seul geste tous les appareils de tous les enfants simultanément ('Family Pause' Qustodio, pause foyer Bark). Nous avons la pause i… | Qustodio, Bark |
| Filtrage au niveau réseau/routeur (whole-home) | nice | Boîtier/intégration routeur type 'Bark Home' étendant le filtrage et les plages horaires à TOUS les appareils connectés du foyer (smart TV, consoles… | Bark |
| Mode école instantané à la demande (durée choisie) | nice | Activer immédiatement le mode école/focus pour une durée définie, hors des plages planifiées ('Instant School Time' Norton). Nous avons un mode école… | Norton Family |
| ⚠️ Journal d'appels & SMS (métadonnées uniquement) | nice | Journal des appels et SMS en métadonnées seulement (interlocuteur, horodatage, durée/fréquence) — JAMAIS le contenu. Qustodio et Norton exposent l'ac… | Qustodio, Norton Family |
| Constructeur d'accord familial numérique + activités | nice | Assistant pour co-rédiger un 'accord familial numérique' (règles négociées, signé par parent et enfant) + activités/ressources téléchargeables. Qusto… | Qustodio |
| Hub bien-être numérique: guides + évaluations d'apps par âge | nice | Contenu éditorial intégré: guides de sécurité, fiches d'évaluation d'apps/jeux par âge, conseils de bien-être (Qustodio 'digital wellbeing hub' + rev… | Qustodio |
| ⚠️ Aperçu vignette/snippet des vidéos regardées | nice | Afficher une vignette/extrait des vidéos YouTube/streaming regardées, pas seulement le titre. Norton 'Video Supervision' montre un snippet de chaque… | Norton Family |
| Résumé hebdomadaire de conduite par membre + score | nice | Rapport hebdo par conducteur (nombre de trajets, km totaux, vitesse max de la semaine, score de conduite, tendances) partagé dans la famille. | Life360 |
| Alertes de vitesse | nice | Notifier le parent quand un membre dépasse un seuil de vitesse configurable pendant un trajet. | Life360 |
| Détection de conduite distraite + mode 'Ne pas déranger au volant' | nice | Détecter l'usage du téléphone en roulant, et proposer un mode conduite (DND, réponse automatique aux messages, intégration Android Auto/Ford Sync) qu… | Life360 |
| Assistance routière (dépannage) | nice | Demande en un tap d'assistance routière : remorquage, pneu crevé, clés enfermées, carburant, batterie. Service via partenaire. | Life360 |
| Assistance médicale 24/7 (ligne infirmière) | nice | Accès à une ligne téléphonique infirmière/conseil médical 24/7, orientation pharmacie et spécialistes, via partenaire. | Life360 |
| Alertes météo sévères géolocalisées | nice | Notifier toute la famille en temps réel quand un membre se trouve dans une zone touchée par un événement météo sévère (partenariat type AccuWeather),… | Life360 |
| Carte de criminalité / signalements par zone | nice | Afficher les incidents/crimes signalés récents dans les zones où se trouvent les membres de la famille. | Life360 |
| Notification d'atterrissage de vol | nice | Détecter un vol et notifier la famille à l'atterrissage (suivi de vol). | Life360 |
| Faire sonner / localiser l'appareil | nice | Déclencher à distance une sonnerie forte sur l'appareil enfant (même en silencieux) pour le retrouver, et afficher sa dernière position connue. | Life360, Kaspersky Safe Kids |
| Trackers d'objets et d'animaux (matériel type Tile) | nice | Support de balises Bluetooth/GPS attachées aux objets (cartable, clés, vélo) ou à un animal, visibles sur la même carte famille. | Life360 |
| Détection automatique des lieux fréquents (Smart Places) | nice | Apprendre automatiquement les lieux récurrents (école, domicile, sport) et proposer de créer des zones/alertes sans configuration manuelle. | Life360 |
| Surveillance de fuite de données / dark web | nice | Scanner le dark web pour détecter si les e-mails/comptes de la famille sont compromis et alerter en cas de fuite, avec guidage de remédiation. | Life360 |
| Protections assurance (vol de téléphone + vol d'identité & restauration) | nice | FUSION de deux fonctions Life360 : remboursement en cas de vol du téléphone, et protection/restauration contre le vol d'identité (couverture financiè… | Life360 |
| Niveaux de protection standard / strict pour la détection d'images | nice | Permettre au parent de choisir un niveau 'standard' ou 'strict' de sensibilité de la détection d'images, en plus des niveaux par âge déjà prévus. | Canopy |
| Partenaire de responsabilité (accountability partner) | nice | Permettre d'inviter une personne de confiance externe (conjoint, proche, mentor) qui reçoit certaines alertes pour un soutien mutuel, distinct de la… | Canopy |
| ⚠️ [CONDITIONNEL] Captures d'écran du contenu privé | nice | Capture périodique d'écrans de l'appareil enfant (proposée par certains concurrents type Qustodio/Bark). Non présent dans le projet. | (Qustodio, Bark) |
| Centre de répartition d'urgence 24/7 (dispatch professionnel) | nice | Escalade du SOS vers un centre de répartition professionnel qui envoie les secours à la position de l'enfant, 24/7. | Life360, Noonlight |
| Suivi du comportement de conduite / rapport jeune conducteur | nice | Score par trajet : vitesse excessive, freinage brusque, accélération rapide, usage du téléphone au volant ; résumé familial de conduite. | Life360, FamiSafe |
| Historique YouTube/TikTok (appli complète) + blocage par vidéo/chaîne | nice | Historique de recherche et de visionnage de l'appli YouTube complète (pas seulement YouTube Kids) et de TikTok, avec blocage d'une vidéo ou d'une cha… | Boomerang, FamiSafe |
| Détection des apps clonées / espaces dupliqués | nice | Repérer les applications dupliquées/clonées (ex. 'Dual WhatsApp', espaces sécurisés) utilisées pour masquer de l'activité. | FamiSafe |
| Apps encouragées + temps gagné via usage éducatif | nice | Mettre en avant des apps bénéfiques et créditer automatiquement du temps bonus pour l'usage d'apps éducatives. | Boomerang |
| Contrôle des casques VR / informatique spatiale | nice | Gérer le temps d'écran et le contenu sur les casques VR (Meta Quest, etc.). | Qustodio |
| Couverture multi-OS (iOS, Windows, Mac, ChromeOS) | nice | Étendre la supervision au-delà d'Android : iPhone/iPad, PC Windows, Mac, Chromebook, avec un profil enfant unique multi-appareils/multi-OS. | Aura, Qustodio, OurPact, Canopy |
| Protection identité/vie privée de l'enfant (dark web, fuites, VPN, antivirus) | nice | Surveillance des fuites de données (e-mail/téléphone de l'enfant) sur le dark web, VPN sans journaux, antivirus sur l'appareil enfant ; alertes de fu… | Aura Family |
| ⚠️ Captures d'écran périodiques / à la demande ('View') | nice | Captures d'écran programmées ou à la demande de l'appareil enfant, avec analyse OCR et catégorisation du contenu (sexuel, violence, injures, etc.). | OurPact, FamiSafe |
| ⚠️ Visualisation de l'écran en direct (screen mirroring) | nice | Voir l'écran de l'enfant en temps réel depuis l'app parent. | FamiSafe |
| Support tablettes Amazon Fire / Kindle | nice | Prise en charge des tablettes Fire OS (dérivé Android) souvent données aux jeunes enfants. | Qustodio (Kindle) |
| Contrôle Smart TV / Android TV / Google TV | nice | Companion app léger sur TV connectée pour filtrage et temps d'écran, piloté depuis le tableau parent. | Cylux, Google (Nest/TV) |
| Box / contrôle au niveau du routeur (réseau foyer) | nice | Filtrage et pause au niveau du réseau domestique (tous les appareils, y compris invités/IoT) via boîtier ou intégration routeur. | Bark Home, TP-Link HomeShield |
| Mode concentration / Focus Time | nice | Plages où seules des apps/sites choisis sont autorisés (devoirs, lecture), distinct du mode école lié à l'établissement. Activable ponctuellement. | Aura (Focus Time), Kidslox |
| Micro-pauses programmées pendant l'usage | nice | Interruptions courtes régulières (ex : 5 min toutes les heures) pour reposer les yeux/bouger, en plus du downtime et du planning. | Qustodio (scheduled breaks) |
| Suggestions d'activités hors écran | nice | Répertoire/recommandations d'activités offline adaptées à l'âge proposées lors des pauses ou downtime. | Aura, divers |
| Coaching parental / 'parler à un expert' (option premium) | nice | Accès payant à des conseillers pour l'accompagnement éducatif numérique. | Qustodio (Care Plus), Life360 (Live Advisor) |
| Garantie satisfait ou remboursé | nice | Remboursement sous 30 jours affiché, réduit le risque perçu à l'achat. | Mobicip (30 j) |
| Rapport de transparence périodique | nice | Publication régulière (demandes de données, incidents, pratiques) renforçant la posture éthique. | rare, différenciant |
| API publique & webhooks | nice | API/webhooks pour notifier des systèmes tiers (ex : alerte vers Slack/domotique/agenda) et intégrations personnalisées. | intégrations via Zapier/webhooks |
| Intégrations maison connectée (Alexa, Google Home, enceintes) | nice | Pilotage du downtime/filtrage sur enceintes connectées et annonces vocales d'alertes/limites. | Google Nest (Digital Wellbeing), Alexa + Zapier |
| App compagnon montre parent (Wear OS / Apple Watch) | nice | Réception d'alertes et actions rapides (pause, voir position) depuis la montre du parent. | Life360, Find My Kids |
| Rapports de conduite / score de conduite (ado au volant) | nice | Résumés de trajet (vitesse, freinage brusque, usage du téléphone au volant) et score. Nous avons déjà la détection d'accident dans le SOS, mais pas l… | Life360 |
| Assistance routière / dispatch secours 24/7 | nice | Dépannage (remorquage, crevaison) et mise en relation secours sur détection de collision. | Life360 (Roadside, emergency dispatch) |
| ⚠️ [POUR MÉMOIRE] Surveillance du contenu des messages privés (SMS/chat) | nice | Lecture du contenu des SMS/WhatsApp/Snap/Discord comme le font certains concurrents. En France/UE, lire la correspondance privée est juridiquement tr… | MMGuardian, Net Nanny Social |
| ⚠️ [POUR MÉMOIRE] Captures d'écran périodiques de l'appareil enfant | nice | Screenshots automatiques du contenu affiché (à la OurPact). Invasif et en tension avec notre minimisation/transparence ; non recommandé. | OurPact |
| ⚠️ Surveillance du contenu du stockage cloud (Drive/Dropbox/OneDrive) |  | POUR MÉMOIRE — À ÉVITER. Bark scanne documents, images et vidéos stockés dans Google Drive, Dropbox, OneDrive. Ces espaces contiennent fréquemment de… | Bark |
| ⚠️ Capture et envoi de screenshots déclencheurs au parent |  | POUR MÉMOIRE — À ÉVITER PAR DÉFAUT. Quand une alerte se déclenche, Bark envoie au parent le screenshot du contenu incriminé. Cela expose le contenu (… | Bark |
| ⚠️ Scan de la galerie photos & téléchargements stockés |  | POUR MÉMOIRE — PRUDENCE. Bark scanne les photos/vidéos de la galerie, photos de la caméra et téléchargements (memes sauvegardés). La galerie contient… | Bark |
| ⚠️ Connexion de comptes via OAuth (surveillance sans agent) |  | POUR MÉMOIRE. Bark surveille en reliant directement les comptes de l'enfant (OAuth Gmail/Google Drive/réseaux) côté serveur, sans agent sur l'apparei… | Bark |

---

## 2. Design & UX à intégrer au prototype

| Motif | Prio | Description | Vu chez |
|---|---|---|---|
| Accessibilité (WCAG 2.2 / European Accessibility Act) | must | Compatibilité lecteurs d'écran (TalkBack/VoiceOver), contraste AA/AAA, tailles de police dynamiques, navigation clavier, cibles tactiles. L'EAA s'app… | standard du secteur |
| Onglet « Temps d'écran » unifié avec contrôles rapides en un geste | should | Regrouper tous les outils de temps (limite jour, par app/catégorie, planning, downtime, bonus, pause) dans un seul onglet « Temps d'écran », avec des… | Google Family Link, Apple Screen Time |
| Hub de contrôles par service (cartes Play / YouTube / Chrome / Recherche / Photos / IA) | should | Un écran « Contrôles » présentant chaque service géré sous forme de carte distincte (Play Store, YouTube, navigateur, recherche, photos, assistant IA… | Google Family Link |
| Écran carte interactif (zones géofence éditables, trajets, membres) | should | Vue carte dédiée : tous les enfants sur une seule carte, édition des zones de géofencing directement sur la carte, timeline des trajets, lieux favori… | Google Family Link |
| Centre de notifications / alertes unifié | should | Fil d'alertes chronologique côté parent regroupant entrées/sorties de zone, SOS, batterie faible, alertes mots-clés/image, demandes en attente — dist… | Google Family Link, Microsoft Family Safety |
| Centre de demandes / approbations unifié | should | File d'attente unique regroupant toutes les demandes de l'enfant (installation d'app, achat, temps supplémentaire, ajout de contact, accès à un site)… | Apple Screen Time, Google Family Link |
| Actions rapides en un geste depuis le tableau de bord | should | Boutons d'action immédiate directement sur la tuile enfant/appareil : « +15 min », « Verrouiller maintenant », « Verrouiller jusqu'au coucher », « Fa… | Apple Screen Time |
| Assistant de configuration guidé par âge avec préréglages d'apps essentielles | should | Parcours d'onboarding qui, selon l'âge choisi (6 ou 12 ans), propose un jeu d'apps essentielles recommandées et des réglages par défaut adaptés, que… | Apple Screen Time, Qustodio, Bark, Aura |
| Sélecteur de profil enfant horizontal | should | Barre de profils enfants défilable horizontalement en haut de la console pour basculer d'un enfant à l'autre en un geste (nouveau design app Qustodio… | Qustodio |
| Carte familiale unique en temps réel (tous les enfants) | should | Une seule vue carte 'live' affichant tous les enfants simultanément avec leurs pastilles, lieux favoris et zones. Qustodio 'Family Locator' met tous… | Qustodio |
| Écran d'accueil 'Ma famille' / centre d'action | should | Un écran d'accueil regroupant alertes temps réel, demandes de +temps/accès en attente et localisation, avec actions directes (approuver, pauser) sans… | Qustodio |
| Assistant d'onboarding guidé (wizard par âge) | should | Wizard pas-à-pas après installation: ajouter l'enfant → choisir l'âge → sélectionner l'appareil → appliquer automatiquement des réglages par défaut a… | Qustodio, Norton Family |
| Fil d'activité chronologique (timeline) par enfant | should | Un flux chronologique de la journée de l'enfant (apps ouvertes, sites, trajets, alertes) sous forme de timeline lisible, en complément des tableaux d… | Qustodio, Bark, Norton Family, FamiSafe |
| Cartes d'alerte catégorisées avec code couleur de sévérité | should | Chaque alerte présentée comme une carte avec étiquettes de catégorie (ex: 'violence', 'automutilation') et un code couleur de sévérité, triable/filtr… | Bark |
| Vue carte familiale en direct dans la console | should | Écran carte dédié montrant en temps réel la position de chaque membre/appareil sur une carte, avec pastilles de profil. Les écrans actuels listés (Ap… | Life360, Canopy, Kaspersky Safe Kids |
| Chronologie / historique quotidien scrollable des déplacements | should | Timeline par jour listant les lieux visités, l'heure d'arrivée/départ et le temps passé à chaque endroit, avec un curseur pour rejouer la journée sur… | Life360 |
| Carte de profil membre enrichie | should | Fiche membre affichant niveau de batterie, signal réseau/Wi-Fi, dernière mise à jour, lieu actuel, et statut de conduite. Le projet a un en-tête d'ap… | Life360 |
| Assistant d'installation guidé / checklist d'onboarding | should | Parcours d'installation pas-à-pas avec checklist de progression (appairage, permissions, premières règles, invitation co-parent) et indicateur de com… | Life360, Mobicip, Kaspersky Safe Kids |
| Écran carte famille en direct | should | Vue carte plein écran montrant tous les membres en temps réel, fil d'Ariane des trajets, épingles de lieux favoris, niveau de batterie et dernière po… | Life360, Qustodio, OurPact |
| Assistant d'onboarding avec préréglages par âge | should | Configuration guidée qui applique en quelques taps un jeu de règles recommandées selon l'âge (profils 6 et 12 ans). | la plupart des apps |
| Boîte de réception unifiée des demandes/approbations | should | Un seul écran (et centre de notifications) où toutes les demandes — installation, achat, +temps, ask-to-browse, nouveau contact — se valident/refusen… | OurPact, Google Family Link |
| Centre d'alertes priorisé avec extrait de contexte et action | should | Écran d'alertes triées par gravité, chacune avec un court extrait de contexte et une action/ressource recommandée (snippet + 'que faire'). | Bark, Helmit, FamiSafe |
| Tableau de bord enfant gamifié | should | Côté enfant : séries (streaks), objectifs, anneaux de progression, avatar/mascotte et boutique de points pour échanger les récompenses. | apps enfants (Gabb, Troomi, diverses) |
| Écran 'santé de la protection' / vérification des permissions | should | Score de complétude de la configuration : permissions Android manquantes, protections actives/inactives, risques de contournement détectés, étapes à… | divers (Qustodio, Bark) |
| Tableau de bord d'auto-régulation côté enfant (gamifié) | should | Vue enfant de son propre temps/objectifs avec jalons, badges et progression personnelle — au-delà de nos 'insights partagés' et écran 'mes données',… | Aura, Google Family Link (côté enfant) |
| Chat de support en direct (live chat) | should | Support humain par chat en direct dans l'app/console, en plus d'un e-mail/ticket. | Bark, Life360 (Driver Care) |
| Badges de conformité affichés (RGPD-K, COPPA, kidSAFE+) | should | Affichage visible des certifications/engagements : RGPD/RGPD-K, COPPA (refonte avril 2025, mise en conformité avant avril 2026), certification safe h… | apps certifiées kidSAFE+/PRIVO |
| Trust center / page de confidentialité dédiée | should | Espace public expliquant clairement données collectées, durées, sous-traitants, droits — appuie notre privacy-by-default. | standard du secteur premium |
| Vue d'ensemble « coup d'œil » de l'usage (at-a-glance) | nice | Carte de synthèse glanceable en haut du tableau de bord : temps écran du jour vs limite, apps du moment, statut (à l'école / en pause / libre), posit… | Apple Screen Time |
| Graphe d'usage hebdomadaire empilé par catégorie | nice | Histogramme hebdomadaire du temps d'écran empilé par catégorie (réseaux sociaux, jeux, éducation, divertissement) avec code couleur cohérent, et comp… | Apple Screen Time, Microsoft Family Safety |
| Cartes de recommandations par âge dans l'interface | nice | Encarts contextuels « Recommandé pour 12 ans » proposant des réglages par défaut (limites, filtres, catégories) au moment où le parent configure une… | Apple Screen Time, Google Family Link |
| Widgets écran d'accueil (parent et enfant) | nice | Widget parent (statut de l'enfant, dernière position, temps restant du jour) et widget enfant (temps restant, prochaine échéance de downtime) posable… | Apple Screen Time, Google Family Link |
| État visuel « Mode École / Focus » côté enfant | nice | Écran simplifié côté enfant pendant le mode École/Focus : fond distinct, seules les apps autorisées visibles, compte à rebours de fin de session, ind… | Google Family Link |
| Sélecteur d'enfant et thématisation par profil | nice | Sélecteur rapide d'enfant (avatar + couleur) toujours accessible, chaque profil ayant un accent couleur propre pour se repérer instantanément dans un… | Apple Screen Time, Microsoft Family Safety |
| Safety Check enfant (revue et arrêt rapide des partages) | nice | Écran enfant listant qui/quoi est partagé (localisation, données, supervision) avec un bouton pour tout revoir et stopper/mettre en pause rapidement… | Apple Screen Time |
| Bouton d'action rapide / pause en un tap (FAB) | nice | Action flottante persistante pour déclencher les gestes fréquents (pause instantanée, +15 min, verrouiller) depuis n'importe quel écran. Cohérent ave… | Qustodio, Bark |
| Bascule type de carte + épingles de lieux personnalisées | nice | Choix du fond de carte (auto / rue / satellite) et épingles personnalisées pour les lieux favoris (maison, école, sport) avec icônes dédiées. | Life360 |
| Écran rapport de conduite | nice | Écran dédié affichant la liste des trajets, les événements (freinage, vitesse) positionnés sur la carte du trajet, et les scores. Dépend de la couche… | Life360 |
| Widget écran d'accueil (localisations famille) | nice | Widget Android pour la console parent affichant d'un coup d'œil la position/statut des membres sans ouvrir l'app. | Life360 |
| Widgets d'accueil (localisation + temps d'écran) | nice | Widget coup d'œil sur l'écran d'accueil du téléphone parent (et de la montre) affichant position et temps d'écran de l'enfant. | Life360, divers |
| Vue co-parentalité / planning de garde partagée | nice | Plannings et règles distincts par foyer en garde alternée, visibles par les deux parents. | divers |
| Centre d'aide intégré + tutoriels vidéo | nice | Base de connaissances contextuelle et vidéos accessibles directement depuis la console/app. | Bark (YouTube/guides), Qustodio |
| Widgets écran d'accueil (temps restant, statut) | nice | Widget côté enfant (temps restant du jour) et côté parent (statut/dernière position), sans ouvrir l'app. | divers (OurPact, Life360) |
| Plannings réutilisables entre fonctions | nice | Un horaire créé réutilisable pour verrou, blocage d'apps, localisation. | MMGuardian |
| Toggle « je choisis de ne pas voir X » (minimisation volontaire) | nice | Désactiver l'affichage de catégories de données : argument RGPD. | MMGuardian |
| Anneaux d'activite |  | Anneau style Apple Watch pour la limite du jour. |  |

---

## 3. MMGuardian — zone sensible → nos équivalents LÉGAUX

MMGuardian promet « tout voir » (contenu des SMS/chats, images). Illicite en France/UE (secret des correspondances art. 226-15, captation art. 226-1). Notre modèle **détecte on-device et n'alerte que sur le risque**, sans exfiltrer le contenu.

| Fonction MMGuardian (sensible) | Notre équivalent légal & transparent |
|---|---|
| Lecture intégrale des SMS/MMS | Détection on-device de signaux de risque → notification + ressources, sans le contenu |
| Lecture des chats réseaux sociaux (WhatsApp, Snap, Insta…) | Analyse on-device + alerte catégorielle ; temps par app social (métadonnée) |
| Alerte montrant le message déclencheur (verbatim) | Alerte = catégorie + gravité + heure + ressources ; servie d'abord à l'ado selon l'âge |
| Détection d'image + copie envoyée au parent | Détection on-device + floutage/blocage + notif ; l'image ne quitte jamais l'appareil |
| Sync App iPhone (aspiration iMessage/SMS) | Non reproduit ; tout reste on-device (périmètre Android) |
| Journal d'appels complet exposé au parent | Métadonnées agrégées, visibles par l'enfant, rétention courte, toggle de non-affichage |
| Uninstall protection « inviolable » / GPS caché | Anti-désinstallation VISIBLE + notification persistante + pause confidentialité |

---

## 4. Fonctions écartées (illégales — pour mémoire)

Remontées par la veille mais **exclues par conception** (surveillance cachée / captation de contenu de tiers).

| Fonction | Pourquoi exclue | Vu chez |
|---|---|---|
| Lecture du contenu des messages/SMS/chats de tiers | Noté pour mémoire uniquement. Des apps type stalkerware (mSpy, Qustodio en lecture de contenu) le font, mais cela viole… | Qustodio, Bark |
| Enregistrement des appels | Noté pour mémoire. Proposé par des apps espion ; illégal dans la plupart des juridictions (consentement des parties) et… | mSpy, Eyezy |
| Keylogger / capture de frappe | Noté pour mémoire. Typique du stalkerware ; disproportionné, non transparent, illégal. À exclure explicitement. |  |
| Mode furtif / application cachée | Noté pour mémoire. Le projet impose au contraire une notification de supervision persistante et une app visible. Le mod… |  |
| Activation cachée de la caméra / du micro et captures d'écran espionnes | Noté pour mémoire. Fonction de stalkerware, hautement intrusive et illégale ; incompatible avec la transparence et la m… |  |
| Lecture du contenu des SMS / iMessages | Listé uniquement pour cadrer notre refus: notre équivalent légal est la détection on-device de signaux (sans exposer le… | Qustodio |
| Surveillance du contenu des emails | Listé pour mémoire; notre alternative est la détection on-device de signaux de risque sans transmission du contenu. | Bark |
| Lecture/transmission du contenu des DM réseaux sociaux (30+ apps) | Distinguer clairement: l'analyse on-device de signaux (legal, déjà prévue) vs. l'exfiltration du contenu (illégal). Imp… | Bark |
| [POUR MÉMOIRE - ILLÉGAL] Surveillance cachée : caméra/micro à distance, enregistrement d'appels, keylogger, interception de messages de tiers, mode furtif | À NE PAS implémenter. Illégales (violation vie privée, interception de communications, RGPD, droit pénal) et contraires… | (outils de stalkerware tiers) |
| Mode furtif / supervision cachée | ILLÉGAL en France et contraire au cœur du projet (notification de supervision persistante, consentement co-signé). List… | mSpy, Eyezy |
| Écoute du micro / sons ambiants | ILLÉGAL (captation clandestine). FamiSafe le mentionne sur Android ; listé pour mémoire — à NE PAS implémenter. | FamiSafe (ambient sound), mSpy |
| Capture caméra à distance (furtive) | ILLÉGAL. Listé pour mémoire — à NE PAS implémenter. | mSpy, Eyezy |
| Keylogger (capture des frappes) | ILLÉGAL. Listé pour mémoire — à NE PAS implémenter. | mSpy, Eyezy |
| Interception du contenu des messages de tiers | ILLÉGAL en France (interception de contenu de tiers). Certaines apps le font (ex. Qustodio affiche le contenu des messa… | Qustodio (message content), mSpy |
| [ILLÉGAL] Écoute audio / vidéo à distance (listen-in / caméra cachée) | À exclure formellement. | Angel Watch (listen-in), apps espion |
| [ILLÉGAL] Enregistrement des appels | À exclure. | apps espion |
| [ILLÉGAL] Keylogger (enregistrement de frappe) | À exclure. | apps espion |
| [ILLÉGAL] Mode furtif / invisible | À exclure ; notre transparence est un atout. | mSpy, apps espion |
| [ILLÉGAL] Interception du contenu des communications de tiers | À exclure formellement. | apps espion |

---

## 5. Impact & prochaines étapes

- **À ajouter au cahier des charges** : les fonctions `must`/`should` ci-dessus rejoignent leurs modules (notamment contacts approuvés & code parent hors-ligne en L5, assistants IA & médias explicites & Game Center en L4, mode vacances & verrouillage des réglages système en L2, journal d'appels & SMS en L1, signalement autorités & ressources 3114 en L6, portefeuille familial en L9).

- **Design** : intégrer au prototype les motifs `must`/`should` (visualisations de temps d'écran, carte de localisation, onboarding guidé, états vides, gamification douce).

- **Différenciateurs à garder** : SOS enfant, messagerie interne, demandes/approbations, +temps/récompenses, check-in/trajet, outillage RGPD — absents de MMGuardian et de plusieurs concurrents.


> Doc d'ingénierie, **pas un avis juridique**. Les fonctions `conditional` (⚠️) exigent transparence, proportionnalité à l'âge et absence de captation du contenu de tiers — à valider par un juriste/DPO.
