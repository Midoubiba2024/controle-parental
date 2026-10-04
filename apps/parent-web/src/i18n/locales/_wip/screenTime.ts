// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.screenTime
export default {
  // Période d'analyse (boutons 7 / 30 jours, sous-titre de l'anneau).
  periodDays: { one: "{count} jour", other: "{count} jours" },
  tiles: {
    // {days} = durée de la période (« j » = jours).
    total: "Temps total ({days} j)",
    averagePerDay: "Moyenne par jour",
    appLaunches: "Ouvertures d'apps",
  },
  dailyTrend: "Tendance quotidienne",
  noDataInPeriod: "Aucune donnée sur la période",
  byCategory: "Répartition par catégorie",
  noActivity: "Aucune activité",
  topApps: "Top applications",
} as const;
