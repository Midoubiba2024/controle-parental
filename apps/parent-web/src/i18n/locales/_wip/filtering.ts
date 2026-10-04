// Fragment temporaire (fusionné dans fr.ts en fin de lot) — namespace views.filtering
export default {
  loading: "Chargement du filtrage…",

  // Carte « Filtrage du web » : interrupteur général, état VPN, préréglages
  status: {
    title: "Filtrage du web",
    intro: "Filtrage par <b>nom de domaine (DNS) sur l'appareil</b> — aucune inspection du contenu, aucun déchiffrement. Visible par l'enfant dans « mes données ».",
    enableToggle: "<b>Activer le filtrage</b> pour {name}",
    protectionTitle: "État de la protection",
    noDevice: "Aucun appareil n'a encore signalé l'état du filtrage. Il apparaîtra ici une fois le filtrage autorisé sur l'appareil enfant.",
    device: "Appareil",
    badgeDisabled: "⚠️ désactivé",
    badgeUncertain: "⚠️ état incertain",
    badgeActive: "🛡️ actif",
    // {ago} = temps relatif (« il y a 5 min »), {when} = date/heure courte
    cutAgo: "coupé {ago}",
    silentSince: "silencieux depuis {ago}",
    lastSeen: "dernière nouvelle {when}",
    antiBypass: "Anti-contournement <b>transparent</b> (C9) : si le filtrage est désactivé (ou silencieux trop longtemps), c'est signalé ici et à l'enfant — jamais en cachette.",
    presetsTitle: "Préréglages par âge",
    presetsHint: "Jeune enfant → liste blanche stricte ; (pré)ado → catégories + Ask-to-Browse. Ajustable ci-contre.",
  },

  // Carte SafeSearch / YouTube / modes
  safeSearch: {
    title: "SafeSearch & modes",
    forceSafeSearch: "Forcer <b>SafeSearch</b> (Google, Bing, DuckDuckGo) — réécriture DNS (C3)",
    youtubeTitle: "YouTube mode restreint (C4)",
    youtubeVia: "via restrict(moderate).youtube.com",
    whitelistTitle: "Liste blanche stricte (C5)",
    whitelistOnly: "N'autoriser <b>que</b> les domaines de la liste blanche (+ services essentiels)",
    whitelistHint: "Recommandé pour le jeune enfant. Les services système et les urgences restent toujours accessibles.",
    askToBrowseTitle: "Ask-to-Browse (C6)",
    askToBrowse: "Permettre à l'enfant de <b>demander l'accès</b> à un site bloqué",
    journalTitle: "Journal des domaines",
    logAllowed: "Consigner aussi les domaines <b>autorisés</b> (sinon : seulement les blocages)",
    retentionLabel: "Rétention (jours)",
    retentionHint: "métadonnées seulement — jamais d'URL ni de contenu",
  },

  // Carte catégories bloquées
  categories: {
    title: "Catégories bloquées",
    intro: "Le contenu adulte (C7) est bloqué par défaut dans tous les préréglages.",
  },

  // File d'approbation Ask-to-Browse
  askToBrowse: {
    title: "Demandes d'accès",
    count: "({count})",
    emptyTitle: "Aucune demande en attente",
    emptyHint: "Quand l'enfant demande l'accès à un site bloqué, il apparaît ici.",
    unknownDomain: "domaine inconnu",
    badge: "Ask-to-Browse",
    // Note libre écrite par l'enfant, entre guillemets
    childNote: "« {note} »",
    allowButton: "Autoriser le domaine",
    denyButton: "Refuser",
  },

  // Listes blanche / noire
  lists: {
    title: "Listes de domaines",
    intro: "Une règle s'applique au domaine <b>et à ses sous-domaines</b>. « Autoriser » surclasse un blocage de catégorie ; « Bloquer » interdit un domaine précis.",
    domainPlaceholder: "exemple.com",
    actionBlock: "Bloquer (liste noire)",
    actionAllow: "Autoriser (liste blanche)",
    addButton: "+ Ajouter",
    invalidDomain: "Domaine invalide (ex. exemple.com).",
    allowTitle: "Liste blanche",
    allowEmpty: "Aucun domaine explicitement autorisé.",
    blockTitle: "Liste noire",
    blockEmpty: "Aucun domaine explicitement bloqué.",
    count: "({count})",
    // Règle créée suite à une demande Ask-to-Browse
    requested: "demandé",
  },

  // Journal des domaines (métadonnées)
  journal: {
    title: "Journal des domaines",
    subtitle: "(métadonnées)",
    // {days} = durée de conservation en jours
    intro: "Domaine + catégorie + action + heure. <b>Jamais</b> d'URL complète, de requête ni de contenu. Conservé {days} jours (purge automatique).",
    emptyTitle: "Aucun événement",
    emptyHint: "Les domaines bloqués (et autorisés, si activé) remonteront ici.",
    colDomain: "Domaine",
    colCategory: "Catégorie",
    colAction: "Action",
    colWhen: "Quand",
  },
} as const;
