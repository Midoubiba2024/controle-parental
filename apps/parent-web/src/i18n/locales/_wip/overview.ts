// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.overview
export default {
  tiles: {
    screenTimeToday: "Temps d'écran aujourd'hui",
    installedApps: "Applications installées",
    battery: "Batterie",
    // Niveau de batterie en pourcentage.
    batteryValue: "{level}%",
    freeStorage: "Stockage libre",
  },
  last7Days: "7 derniers jours",
  noScreenTimeTitle: "Pas encore de données de temps d'écran",
  noScreenTimeHint: "Elles apparaîtront après l'activation de l'accès à l'usage sur l'appareil.",
  todayByCategory: "Aujourd'hui par catégorie",
  // Sous-titre au centre de l'anneau, sous la durée totale du jour.
  donutToday: "aujourd'hui",
  noActivityToday: "Aucune activité aujourd'hui",
  topAppsToday: "Applications les plus utilisées aujourd'hui",
  storage: {
    title: "Stockage de l'appareil",
    // {used}, {total}, {free} = tailles déjà formatées (« 12 Go »).
    used: "{used} utilisés sur {total}",
    free: "{free} libres",
  },
} as const;
