// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.wellbeing
export default {
  loading: "Chargement de la sécurité ado…",

  // Affiché à la place de la vue pour un profil « jeune enfant » (fonction désactivée)
  youngChild: {
    title: "Sécurité ado — non applicable",
    intro: "L'analyse de bien-être sur l'appareil est <b>réservée au profil ado</b> (pré-ado / ado).",
    body: "Pour <b>{name}</b> (profil jeune enfant), cette fonction est <b>totalement désactivée</b> : aucun service d'analyse n'est actif et aucune permission n'est demandée. La protection passe par le <b>filtrage</b>, les <b>limites de temps</b> et la <b>localisation transparente</b>. Elle pourra être proposée, de façon transparente et co-consentie, lorsque l'enfant grandira (gradation par âge — CNIL/RGPD art. 8).",
  },

  // Réglages « mode ado » (K6), état de l'analyse, pause de confidentialité (K8)
  settings: {
    title: "Analyse de bien-être (sur l'appareil)",
    intro: "Le texte des notifications est analysé <b>sur le téléphone de {name}</b>. Vous ne recevez qu'une <b>alerte de catégorie</b> (ci-dessous) — <b>jamais</b> ses messages, jamais le texte. L'ado le voit dans « mes données » et peut la désactiver ou la mettre en pause.",
    enableToggle: "<b>Activer l'analyse</b> (nécessite le co-consentement de l'ado)",
    enableHint: "Désactivée par défaut (privacy by default). L'analyse ne tourne que si l'ado accorde aussi l'accès aux notifications sur son appareil.",
    mutualToggle: "<b>Visibilité mutuelle</b> (mode ado, K6) — l'ado voit ce que vous voyez",
    // {name} = prénom de l'ado ; {ago} = temps relatif (« il y a 5 min »)
    pauseNoticeSince: "<b>⏸ Pause de confidentialité active.</b> {name} a suspendu l'analyse (depuis {ago}). Vous voyez qu'une pause est en cours — <b>jamais</b> ce qu'elle masque (K8). C'est à l'ado de la lever.",
    pauseNotice: "<b>⏸ Pause de confidentialité active.</b> {name} a suspendu l'analyse. Vous voyez qu'une pause est en cours — <b>jamais</b> ce qu'elle masque (K8). C'est à l'ado de la lever.",
    statusTitle: "État de l'analyse",
    noDevice: "Aucun appareil n'a encore signalé l'état de l'analyse. Il apparaîtra ici une fois l'accès aux notifications accordé sur l'appareil de l'ado.",
    device: "Appareil",
    // Badges au féminin : « l'analyse »
    badgeInactive: "⏸ inactive",
    badgeUncertain: "⚠️ état incertain",
    badgeActive: "🫶 active",
    cutAgo: "coupée {ago}",
    silentSince: "silencieuse depuis {ago}",
    lastSeen: "dernière nouvelle {when}",
    transparency: "Transparence : si l'ado retire l'accès (son droit), c'est signalé ici — jamais en cachette.",
  },

  // Tableau agrégé par catégorie (G6)
  categories: {
    title: "Par catégorie",
    subtitle: "(alertes de métadonnées)",
    intro: "Regroupement des signaux détectés sur l'appareil. <b>Aucun contenu</b> — seulement catégorie, gravité et compte.",
    emptyTitle: "Aucun signal",
    emptyHint: "Tant que rien n'est détecté, rien n'apparaît ici. C'est bon signe.",
  },

  // Journal des signaux (métadonnées seulement)
  signals: {
    title: "Signaux récents",
    subtitle: "(métadonnées)",
    intro: "Catégorie + gravité + application source + heure. <b>Jamais</b> le texte, l'extrait ou le message.",
    emptyTitle: "Aucun signal",
    emptyHint: "Les alertes de catégorie remonteront ici.",
    colCategory: "Catégorie",
    colSeverity: "Gravité",
    colApp: "Application",
    // Abréviation de « occurrences » (colonne étroite)
    colOccurrences: "Occur.",
    colWhen: "Quand",
    seen: "vu",
    markSeen: "Marquer vu",
  },

  // Ressources d'aide (V12)
  resources: {
    title: "Ressources d'aide",
    intro: "En cas de difficulté, ces services d'écoute et de signalement peuvent aider — vous et l'ado.",
    open: "ouvrir ↗",
  },
} as const;
