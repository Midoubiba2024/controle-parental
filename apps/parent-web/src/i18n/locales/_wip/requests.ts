// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.requests
export default {
  pendingTitle: "En attente <count>({count})</count>",
  emptyPendingTitle: "Aucune demande en attente",
  emptyPendingHint: "Les demandes de temps ou de déblocage de l'enfant apparaissent ici.",
  // Commentaire libre de l'enfant, cité.
  childNote: "« {note} »",
  approve: "Approuver",
  deny: "Refuser",
  historyTitle: "Historique",
  emptyHistory: "Aucune décision pour l'instant.",

  status: {
    pending: "En attente",
    approved: "Approuvée",
    denied: "Refusée",
    cancelled: "Annulée",
  },

  // Résumé d'une demande ({minutes} peut valoir « ? » si inconnu).
  describe: {
    unknownMinutes: "?",
    extraTimeGlobal: "+{minutes} min (global)",
    extraTimeApp: "+{minutes} min sur {app}",
    reward: "+{minutes} min de récompense",
    unblockApp: "Débloquer {app}",
    unblockAnyApp: "Débloquer une app",
    browse: "Accès au site {domain}",
    browseUnknown: "Accès au site demandé",
  },

  grantBonus: {
    title: "Octroyer un bonus",
    hint: "Ajoute des minutes au quota du jour (récompense).",
    unit: "min",
    submit: "Offrir",
  },
} as const;
