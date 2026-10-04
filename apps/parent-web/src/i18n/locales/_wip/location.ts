// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.location
export default {
  loading: "Chargement de la localisation…",
  checkInRequested: "Check-in demandé — la position arrivera dès que l'appareil répond.",
  transparency: {
    title: "Localisation transparente.",
    // <b> = mode de partage actuel
    body: "Seules les positions de cette application sont partagées — jamais à l'insu de l'enfant : il voit dans « mes données » quand et comment sa position est transmise. Partage actuel : <b>{mode}</b>. Les positions sont conservées {days} jours puis supprimées.",
    defaultMode: "à la demande",
  },
  sos: {
    title: "<strong>SOS en cours</strong> — déclenché {ago}.",
    hint: "La position est diffusée en direct ci-dessous. Détails et accusé de réception dans l'onglet <b>Sécurité / SOS</b>.",
  },
  tiles: {
    lastPosition: "Dernière position",
    accuracy: "Précision",
    accuracyValue: "±{accuracy} m",
    zones: "Zones de sécurité",
    realtime: "Suivi temps réel",
    connected: "Connecté",
    pollingFallback: "Repli polling",
  },
  map: {
    title: "Carte",
    realtime: "temps réel",
    noDevice: "Aucun appareil appairé",
    requestCheckIn: "📍 Demander un check-in",
    emptyTitle: "Aucune position pour l'instant",
    emptyHint: "Dès que l'appareil enfant partage une position (périodique ou à la demande), elle apparaît ici. Les zones de sécurité se dessinent même sans position.",
    recent: "Récent",
    dayTrace: { one: "Trajet du jour sélectionné ({count} point).", other: "Trajet du jour sélectionné ({count} points)." },
    recentHint: "Points récents, tous jours confondus. Choisis un jour pour voir le trajet détaillé.",
    // Popups de carte
    zoneLabel: "{type} · {name} ({radius} m)",
    traceDotLabel: "{date} · ±{accuracy} m",
    positionLabel: "Position · {date} · ±{accuracy} m",
    sosPositionLabel: "SOS — Position · {date} · ±{accuracy} m",
  },
  events: {
    title: "Arrivées & départs",
    titleHint: "(zones de sécurité)",
    emptyTitle: "Aucun passage de zone",
    emptyHint: "Les alertes « bien arrivé » (école, maison) s'affichent ici dès qu'une zone est définie et franchie.",
    colEvent: "Événement",
    colZone: "Zone",
    colWhen: "Quand",
    deletedZone: "Zone supprimée",
  },
} as const;
