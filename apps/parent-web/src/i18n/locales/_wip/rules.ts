// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.rules
export default {
  loading: "Chargement des règles…",

  // Actions possibles d'une règle (catégorie ou application).
  ruleAction: {
    free: "Libre",
    limit: "Limiter",
    block: "Bloquer",
    allow: "Autoriser",
    alwaysAllow: "Toujours autoriser",
  },

  timeLimits: {
    title: "Temps d'écran",
    today: "Aujourd'hui",
    // {used} = durée déjà formatée (ex. « 1 h 05 »), {limit} = minutes.
    usageOfLimit: "{used} / {limit} min",
    bonusToday: "+ {minutes} min de bonus aujourd'hui",
    presetsTitle: "Préréglages par âge",
    presetsHint: "Repères d'aide à la décision — ajustables ci-dessous à tout moment.",
    dailyLimitTitle: "Limite quotidienne (globale)",
    dailyLimitPlaceholder: "aucune",
    minutesPerDay: "minutes / jour",
    save: "Enregistrer",
    weekdayTitle: "Par jour de semaine (surcharge)",
    graceTitle: "Délai de grâce « encore 1 min »",
    graceToggle: "Autoriser une courte prolongation à l'atteinte d'un quota",
    graceDuration: "Durée (min)",
    graceUsesPerDay: "Fois / jour",
  },

  instantControl: {
    title: "Pause & verrouillage",
    intro: "Action <b>visible</b> par l'enfant, réversible. L'appel d'urgence (112) n'est jamais bloqué.",
    noDeviceTitle: "Aucun appareil appairé",
    noDeviceHint: "Appairez un appareil dans l'onglet Famille.",
    pause: "⏸ Pause",
    resume: "▶ Reprendre",
    lock: "🔒 Verrouiller",
    ring: "🔔 Faire sonner",
    messagePlaceholder: "Message sur l'écran (ex. « À table ! »)",
    send: "Envoyer",
    recentCommands: "Dernières commandes",
    // Statut d'une commande envoyée à l'appareil.
    commandStatus: {
      pending: "En attente",
      delivered: "Délivrée",
      acked: "Acquittée",
      expired: "Expirée",
      cancelled: "Annulée",
    },
  },

  guards: {
    title: "Mode vacances & verrous",
    vacationTitle: "Mode vacances / pause de planning",
    vacationHint: "Suspend temporairement les plannings (horaires, Downtime, École). Reprise automatique à la fin.",
    vacationActive: "actif",
    // Libellés « Du [date] » / « Au [date] ».
    from: "Du",
    until: "Au",
    clear: "Effacer",
    installTitle: "Validation d'installation",
    blockNewApps: "Bloquer toute <b>nouvelle application</b> jusqu'à validation du parent",
    systemLockTitle: "Verrouillage des réglages système",
    systemLockToggle: "Empêcher la modification de l'heure, des comptes et des options développeur",
    systemLockHint: "Effectif en mode <b>Renforcé</b> (device owner).",
    ratingTitle: "Classification d'âge",
    ratingNone: "Aucune restriction",
    ratingHint: "niveau maximal autorisé",
  },

  categoryRules: {
    title: "Règles par catégorie",
    colCategory: "Catégorie",
    colToday: "Aujourd'hui",
    colRule: "Règle",
    colQuota: "Quota",
  },

  appRules: {
    title: "Règles par application",
    searchPlaceholder: "Rechercher une application…",
    newApps: "Nouvelles apps",
    newAppsWithCount: "Nouvelles apps <b>({count})</b>",
    emptyTitle: "Aucune application",
    emptyHint: "L'inventaire remonte depuis l'appareil enfant une fois la supervision active.",
    // {category} = catégorie de l'app, {duration} = durée d'utilisation formatée.
    categoryWithUsage: "{category} · {duration} aujourd'hui",
  },

  schedules: {
    title: "Plannings <note>(réutilisables entre enfants)</note>",
    intro: "Horaires autorisés/interdits (A4), Downtime/coucher (A5), mode École (A6). Assignez un planning à cet enfant via la case ; les fenêtres horaires s'éditent ci-dessous.",
    namePlaceholder: "Nom (ex. Nuit en semaine)",
    addSchedule: "+ Planning",
    emptyTitle: "Aucun planning",
    emptyHint: "Créez un premier planning (ex. Downtime du soir) puis assignez-le.",
    assigned: "Appliqué à cet enfant",
    noWindows: "Aucune fenêtre horaire.",
    // {days} = jours (ex. « Lun–Ven »), {start}/{end} = heures HH:MM.
    window: "{days} · {start}→{end}",
    rangeArrow: "→",
    addWindow: "+ Fenêtre",
  },
} as const;
