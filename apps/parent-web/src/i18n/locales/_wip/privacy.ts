// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.privacy
// Balises : <muted>…</muted> = précision atténuée dans un titre ; <b>…</b> = gras ;
// <code>…</code> = chemin de fichier.
export default {
  cancel: "Annuler",
  deleting: "Suppression…",

  // Droit d'accès (export JSON).
  export: {
    title: "Exporter les données de {name} <muted>(droit d'accès)</muted>",
    intro: "Télécharge au format JSON toutes les données enregistrées pour cet enfant (métadonnées et agrégats — jamais le contenu de tiers). L'export est journalisé dans l'audit, visible de l'enfant.",
    preparing: "Préparation…",
    button: "⬇ Télécharger l'export JSON",
    done: "Export téléchargé.",
  },

  // Politique de rétention (purge automatique).
  retention: {
    title: "Conservation des données <muted>(purge automatique)</muted>",
    intro: "Les données anciennes sont supprimées automatiquement selon leur type (minimisation RGPD). Détail et justification : <code>docs/12-RETENTION-RGPD.md</code>.",
    colData: "Donnée",
    colRetention: "Conservation",
    // Durée de conservation en jours (« j » = jours).
    days: "{days} j",
    perChildDefault: "réglable par enfant — défaut {days} j",
    rows: {
      locations: "Positions (localisation)",
      domainLog: "Journal des domaines (filtrage)",
      deviceState: "État de l'appareil (batterie/stockage)",
      callSmsMetadata: "Métadonnées d'appels/SMS",
      zoneTransitions: "Transitions de zones",
      safetySignals: "Signaux de sécurité (ado, on-device)",
      alerts: "Alertes (batterie faible…)",
      screenTime: "Temps d'écran (agrégats quotidiens)",
      timeBonuses: "Bonus de temps accordés",
      commands: "Commandes",
      messaging: "Messagerie interne",
      sosEpisodes: "Épisodes SOS",
      auditLog: "Journal d'audit (traçabilité)",
    },
  },

  // Droit à l'effacement — un enfant. {name} = prénom de l'enfant, que le parent
  // doit ressaisir à l'identique pour confirmer (comparaison non traduite).
  deleteChild: {
    title: "Supprimer les données de {name} <muted>(droit à l'effacement)</muted>",
    intro: "Efface <b>définitivement</b> cet enfant et toutes ses données (positions, temps d'écran, messages, signaux…). Les autres membres de la famille ne sont pas affectés. <b>Action irréversible.</b>",
    button: "Supprimer cet enfant…",
    confirmPrompt: "Confirmation : saisissez le prénom <b>{name}</b> pour confirmer.",
    confirmButton: "Confirmer la suppression définitive",
  },

  // Droit à l'effacement — toute la famille. {name} = nom du foyer, à ressaisir.
  deleteFamily: {
    title: "Supprimer toute la famille « {name} » <muted>(réservé au propriétaire)</muted>",
    intro: "Efface <b>définitivement</b> la famille entière : tous les enfants, appareils, règles et données. Seul le <b>propriétaire</b> du foyer peut le faire.<b> Action irréversible.</b>",
    button: "Supprimer toute la famille…",
    confirmPrompt: "Confirmation : saisissez le nom du foyer <b>{name}</b> pour confirmer.",
    confirmButton: "Confirmer la suppression de la famille",
  },
} as const;
