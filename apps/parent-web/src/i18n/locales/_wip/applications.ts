// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.applications
export default {
  emptyTitle: "Aucune application inventoriée",
  emptyHint: "L'inventaire (apps installées) remonte depuis l'appareil enfant une fois la supervision active.",
  // {count} = nombre d'applications listées ; <muted>…</muted> = partie atténuée.
  listTitle: "Applications <muted>({count})</muted>",
  searchPlaceholder: "Rechercher une application…",
  // Ligne de méta d'une app système : {category} = catégorie de l'app.
  categorySystem: "{category} · système",
  noMatch: "Aucune application ne correspond.",
  detail: {
    systemApp: "Application système",
    installedOn: "Installée le {date}",
    // « j » = jours.
    time7d: "Temps (7 j)",
    launches7d: "Ouvertures (7 j)",
    usage7d: "Usage des 7 derniers jours",
    noUsage: "Pas d'usage mesuré cette semaine.",
    lastUsed: "Dernière utilisation : {date}",
  },
} as const;
