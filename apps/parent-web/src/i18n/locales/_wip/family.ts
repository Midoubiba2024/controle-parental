// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.family
export default {
  childrenTitle: "Enfants & appareils",
  noChildTitle: "Aucun enfant pour l'instant",
  noChildHint: "Ajoutez un profil, puis générez un code d'appairage pour son appareil.",
  noDevice: "Aucun appareil appairé.",
  // Badge d'un appareil appairé : {name} = nom/modèle, {mode} = libellé du mode.
  deviceBadge: "📱 {name} · {mode}",
  deviceBadgeRevoked: "📱 {name} · {mode} (révoqué)",
  // Mode d'appareil (valeurs de l'enum DeviceMode).
  deviceMode: {
    standard: "Standard",
    reinforced: "Renforcé",
  },

  // Journal d'audit : <muted>…</muted> = précision atténuée.
  auditTitle: "Journal d'audit <muted>(transparence)</muted>",
  auditEmpty: "Aucune activité.",
  // Suite d'une ligne du journal, après le libellé de l'action (espace initiale voulue).
  auditMeta: " · {role} · {date}",

  addChild: {
    nameLabel: "Prénom de l'enfant",
    namePlaceholder: "Prénom",
    birthLabel: "Date de naissance",
    submit: "+ Enfant",
    birthHint: "La date de naissance adapte automatiquement les protections à l'âge de l'enfant (profil « jeune enfant » / « préado » / « ado »). Elle est facultative.",
  },

  pairing: {
    modeStandard: "Standard",
    modeReinforced: "Renforcé (appareil dédié)",
    generate: "Générer un code d'appairage",
    code: "Code : <b>{code}</b>",
    // Suite de la ligne du code (espace initiale voulue) ; {time} = heure d'expiration.
    expires: " · expire {time}",
  },
} as const;
