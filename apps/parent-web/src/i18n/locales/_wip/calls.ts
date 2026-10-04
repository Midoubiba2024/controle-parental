// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.calls
export default {
  // Bandeau de transparence : <b>…</b> = en gras, <muted>…</muted> = texte atténué.
  notice: "<b>Métadonnées uniquement.</b> <muted>Qui (numéro jamais stocké en clair), quand et combien de temps — jamais le contenu des appels, qui n'est ni écouté ni enregistré. Ces informations sont aussi visibles par l'enfant.</muted>",
  emptyTitle: "Aucune métadonnée d'appel",
  emptyHint: "Cette fonction est facultative et sensible (permission READ_CALL_LOG). Elle est désactivée par défaut dans l'app enfant et n'est collectée qu'avec le consentement explicite.",
  tiles: {
    incoming: "Entrants",
    outgoing: "Sortants",
    unanswered: "Manqués / rejetés",
    totalDuration: "Durée totale",
  },
  // {total} = nombre total d'événements ; <muted>…</muted> = partie atténuée.
  logTitle: "Journal des appels <muted>(métadonnées · {total} au total)</muted>",
  columns: {
    direction: "Sens",
    counterparty: "Correspondant",
    duration: "Durée",
    date: "Date",
  },
  // Sens d'un appel (valeurs de l'enum CommDirection).
  direction: {
    incoming: "Entrant",
    outgoing: "Sortant",
    missed: "Manqué",
    rejected: "Rejeté",
    blocked: "Bloqué",
  },
  hiddenNumber: "Numéro masqué",
  // {id} = identifiant de regroupement anonyme (préfixe de hash).
  hiddenNumberWithId: "Numéro masqué · {id}",
} as const;
