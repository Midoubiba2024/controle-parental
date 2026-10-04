/* =============================================================================
   Catalogue SOURCE (français) de la console parent.

   - Toute chaîne visible de l'interface vit ici (jamais en dur dans le JSX).
   - Paramètres : `{nom}` ; pluriels : `{ one: "…", other: "…" }` + `count`.
   - Texte riche : balises simples `<b>…</b>` rendues via <Trans>.
   - Les autres langues copient CE fichier (mêmes clés) et finissent par
     `satisfies Messages` : voir docs/13-I18N.md.
   ============================================================================= */

import rules from "./_wip/rules";
import requests from "./_wip/requests";
import filtering from "./_wip/filtering";
import wellbeing from "./_wip/wellbeing";
import security from "./_wip/security";
import location from "./_wip/location";
import map from "./_wip/map";
import privacy from "./_wip/privacy";
import family from "./_wip/family";
import messages from "./_wip/messages";
import overview from "./_wip/overview";
import screenTime from "./_wip/screenTime";
import applications from "./_wip/applications";
import calls from "./_wip/calls";
import charts from "./_wip/charts";

const fr = {
  app: {
    documentTitle: "Console parent — Contrôle parental",
    loading: "Chargement…",
  },

  common: {
    none: "—",
    busy: "…",
    language: "Langue",
  },

  nav: {
    overview: "Vue d'ensemble",
    screen: "Temps d'écran",
    apps: "Applications",
    calls: "Appels",
    rules: "Règles d'accès",
    filter: "Filtrage",
    location: "Localisation",
    security: "Sécurité / SOS",
    wellbeing: "Sécurité ado",
    requests: "Demandes",
    messages: "Messages",
    family: "Famille",
    privacy: "Confidentialité",
  },

  dashboard: {
    brand: "Supervision",
    footerTagline: "Contrôle parental transparent.",
    footerPrivacy: "Métadonnées & agrégats seulement — jamais le contenu.",
    viewTitle: {
      overview: "Vue d'ensemble",
      screen: "Temps d'écran",
      apps: "Applications",
      calls: "Appels",
      rules: "Règles d'accès",
      filter: "Filtrage web & contenu",
      location: "Localisation",
      security: "Sécurité & SOS",
      wellbeing: "Sécurité ado — bien-être",
      requests: "Demandes",
      messages: "Messages",
      family: "Famille & appareils",
      privacy: "Confidentialité & RGPD",
    },
    loadFailed: "Chargement impossible",
    retry: "Réessayer",
    loadingData: "Chargement des données…",
    familyBadgeTitle: "Famille",
    deviceStatusTitle: "État de l'appareil (dernier relevé)",
    // Badge d'état : batterie (%) · stockage libre (précédés d'icônes dans le code).
    deviceStatus: "{battery}% · 💾 {storage}",
    theme: {
      light: "Thème clair",
      dark: "Thème sombre",
      system: "Thème système",
    },
    signOut: "Déconnexion",
    noChild: "Ajoutez un enfant dans l'onglet <b>Famille</b> pour voir ses données.",
    protection: {
      title: "⚠️ Une protection est désactivée",
      body: "Sur l'appareil : <b>{labels}</b>. Une autorisation nécessaire a été retirée. Demandez à l'enfant de la réactiver depuis son écran « Mes données » (rien n'est caché — l'app reste visible et transparente).",
      separator: " · ",
    },
    createFamily: {
      title: "Créer une famille",
      namePlaceholder: "Nom du foyer",
      submit: "Créer la famille",
    },
  },

  login: {
    title: "Console parent",
    tagline: "Contrôle parental transparent",
    email: "E-mail",
    password: "Mot de passe",
    signIn: "Se connecter",
    signUp: "Créer un compte",
    switchToSignUp: "Créer un compte parent",
    switchToSignIn: "J'ai déjà un compte",
    accountCreated: "Compte créé. Vérifiez vos e-mails si la confirmation est requise, puis connectez-vous.",
    mfaNotice: "La double authentification (MFA) sera exigée pour les comptes parents (voir SETUP.md).",
  },

  ui: {
    tile: {
      deltaPct: "{pct}%",
      vsPrevious: "vs période précédente",
    },
  },

  units: {
    duration: {
      seconds: "{s} s",
      minutes: "{m} min",
      hours: "{h} h",
      hoursMinutes: "{h} h {mm}",
    },
    durationShort: {
      minutes: "{m}m",
      hours: "{h}h",
      hoursMinutes: "{h}h{m}",
    },
    bytes: {
      pattern: "{value} {unit}",
      b: "o",
      kb: "Ko",
      mb: "Mo",
      gb: "Go",
      tb: "To",
    },
    justNow: "à l'instant",
  },

  errors: {
    generic: "Une erreur est survenue. Réessayez.",
    network: "Connexion au serveur impossible. Vérifiez votre accès à Internet.",
    unauthenticated: "Session expirée ou absente : reconnectez-vous.",
    sessionExpired: "Votre session a expiré : reconnectez-vous.",
    forbidden: "Accès refusé : autorité parentale requise sur cette famille.",
    ownerRequired: "Accès refusé : seul le propriétaire (owner) de la famille peut tout effacer.",
    invalidName: "Nom invalide.",
    missingParams: "Informations manquantes.",
    childNotInFamily: "Cet enfant n'appartient pas à cette famille.",
    childNotFound: "Enfant introuvable.",
    invalidCode: "Code d'appairage invalide.",
    codeExpired: "Code d'appairage expiré.",
    codeAlreadyUsed: "Code d'appairage déjà utilisé.",
    invalidCredentials: "E-mail ou mot de passe incorrect.",
    emailNotConfirmed: "Adresse e-mail non confirmée : vérifiez vos e-mails.",
    userAlreadyExists: "Un compte existe déjà avec cette adresse e-mail.",
    weakPassword: "Mot de passe trop faible.",
    rateLimited: "Trop de tentatives : réessayez dans quelques minutes.",
    duplicate: "Cet élément existe déjà.",
  },

  enums: {
    ageProfile: {
      young_child: "Jeune enfant",
      preteen: "Préado",
      teen: "Ado",
    },
    // Libellés des préréglages par âge (règles d'accès & filtrage).
    ageProfilePreset: {
      young_child: "Jeune enfant (~6 ans)",
      preteen: "Pré-ado (~12 ans)",
      teen: "Ado (15 ans+)",
    },
    role: {
      owner: "Propriétaire",
      parent: "Parent",
      guardian: "Tuteur",
      child: "Enfant",
    },
    scheduleKind: {
      downtime: "Downtime / coucher",
      allowed: "Plages autorisées",
      blocked: "Plages interdites",
      school: "Mode École",
    },
    requestKind: {
      extra_time: "Temps supplémentaire",
      unblock_app: "Débloquer une app",
      reward: "Récompense",
      browse: "Accès à un site (Ask-to-Browse)",
    },
    geofenceType: {
      home: "Maison",
      school: "École",
      custom: "Lieu",
    },
    geofenceTransition: {
      enter: "Arrivée",
      exit: "Départ",
      dwell: "Présence",
    },
    locationMode: {
      off: "Désactivé",
      on_demand: "À la demande (check-in)",
      periodic: "Périodique (suivi de fond)",
    },
    youtubeMode: {
      off: "Désactivé",
      moderate: "Modéré",
      strict: "Strict",
    },
    domainAction: {
      blocked: "Bloqué",
      allowed: "Autorisé",
      rewritten: "Réécrit (SafeSearch)",
    },
    severity: {
      low: "Faible",
      medium: "Moyenne",
      high: "Élevée",
    },
    // Catégories d'applications (temps d'écran).
    appCategory: {
      social: "Réseaux sociaux",
      game: "Jeux",
      video: "Vidéo",
      audio: "Audio / musique",
      productivity: "Productivité",
      maps: "Cartes",
      news: "Actualités",
      image: "Photo / image",
      other: "Autres",
    },
    // Catégories de filtrage web (LOT 4).
    filterCategory: {
      blacklist: "Liste noire",
      adult: { label: "Contenu adulte", hint: "Pornographie et contenu explicite (C7)." },
      violence: { label: "Violence", hint: "Sites violents ou choquants." },
      gambling: { label: "Jeux d'argent", hint: "Paris, casinos, loteries." },
      drugs: { label: "Drogues", hint: "Vente / promotion de stupéfiants." },
      weapons: { label: "Armes", hint: "Vente d'armes." },
      hate: { label: "Haine", hint: "Discours de haine, extrémisme." },
      dating: { label: "Rencontres", hint: "Sites et applications de rencontre." },
      social: { label: "Réseaux sociaux", hint: "Plateformes sociales (médiation par âge)." },
      piracy: { label: "Piratage", hint: "Téléchargement illégal, torrents." },
      malware: { label: "Sites malveillants", hint: "Hameçonnage, logiciels malveillants." },
      ads_trackers: { label: "Pubs & traceurs", hint: "Publicités et pisteurs." },
    },
    // Catégories de signaux bien-être (LOT 6).
    safetyCategory: {
      other: "Autre",
      harassment: { label: "Harcèlement", hint: "Insultes répétées, menaces, mise à l'écart." },
      grooming: { label: "Contact suspect", hint: "Motif de sollicitation par un contact inconnu (secret, rendez-vous…)." },
      sexual_content: { label: "Contenu sexuel", hint: "Sollicitation de photos / propos à caractère sexuel." },
      self_harm: { label: "Mal-être", hint: "Détresse, auto-agression, idées noires." },
      drugs: { label: "Drogues", hint: "Substances / produits illicites." },
    },
    // Autorisations Android surveillées (bannière de protection, LOT 8b).
    protection: {
      perm_usage_access: "Accès au temps d'écran",
      perm_overlay: "Écran de pause (superposition)",
      perm_notifications: "Notifications",
      perm_location: "Localisation",
    },
    // Jours de la semaine, index 0 = dimanche (aligné sur Date.getDay()).
    dowShort: {
      d0: "Dim",
      d1: "Lun",
      d2: "Mar",
      d3: "Mer",
      d4: "Jeu",
      d5: "Ven",
      d6: "Sam",
    },
    dowMask: {
      everyDay: "Tous les jours",
      weekdays: "En semaine",
      weekend: "Week-end",
      separator: ", ",
    },
  },

  views: {
    rules,
    requests,
    filtering,
    wellbeing,
    security,
    location,
    map,
    privacy,
    family,
    messages,
    overview,
    screenTime,
    applications,
    calls,
    charts,
  },

  // Actions du journal d'audit → phrases lisibles.
  audit: {
    fallback: "Action",
    actions: {
      family_created: "Famille créée",
      pairing_code_created: "Code d'appairage généré",
      device_enrolled: "Appareil appairé",
      rgpd_export: "Export des données (RGPD)",
      rgpd_delete_child: "Suppression d'un profil enfant (RGPD)",
      rgpd_delete_family: "Suppression de la famille (RGPD)",
    },
  },

  // Ressources d'aide (V12) — services FRANÇAIS : à adapter par pays/langue.
  helpResources: {
    r3018: { contact: "3018 (appel/chat)", desc: "Cyberharcèlement et violences numériques (e-Enfance). Gratuit, anonyme." },
    r3114: { contact: "3114 (24h/24)", desc: "Souffrance psychique et prévention du suicide. Écoute par des soignants." },
    pharos: { contact: "internet-signalement.gouv.fr", desc: "Signalement officiel de contenus et comportements illicites en ligne." },
  },
} as const;

export default fr;
