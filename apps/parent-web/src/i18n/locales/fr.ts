/* =============================================================================
   Catalogue SOURCE (français) de la console parent.

   - Toute chaîne visible de l'interface vit ici (jamais en dur dans le JSX).
   - Paramètres : `{nom}` ; pluriels : `{ one: "…", other: "…" }` + `count`.
   - Texte riche : balises simples `<b>…</b>` rendues via <Trans>.
   - Les autres langues copient CE fichier (mêmes clés) et finissent par
     `satisfies Messages` : voir docs/13-I18N.md.
   ============================================================================= */

const fr = {
  app: {
    documentTitle: "Console parent — Contrôle parental",
    loading: "Chargement…",
  },

  common: {
    none: "—",
    busy: "…",
    language: "Langue",
    unexpectedError: "Un problème inattendu a interrompu l’affichage.",
    reload: "Recharger",
    retry: "Réessayer",
    // Liste tronquée : bouton pour afficher le reste.
    showMore: { one: "Afficher l’autre élément", other: "Afficher les {count} autres" },
    showLess: "Afficher moins",
    // Préfixe d'une cellule de tableau en vue mobile (« Durée : 4 min »).
    cellLabel: "{label} :",
  },

  nav: {
    overview: "Vue d’ensemble",
    screen: "Temps d’écran",
    apps: "Applications",
    calls: "Appels",
    rules: "Règles d’accès",
    filter: "Filtrage",
    location: "Localisation",
    security: "Sécurité / SOS",
    wellbeing: "Sécurité ado",
    requests: "Demandes",
    messages: "Messages",
    family: "Famille",
    privacy: "Confidentialité",
  },

  dashboard: {
    brand: "Supervision",
    brandSub: "Console parent",
    footerTagline: "Contrôle parental transparent.",
    footerPrivacy: "Jamais le contenu de ses messages, appels ou pages web — seulement ce qui est listé dans « Mes données ».",
    // Pied de barre latérale et de l'écran de connexion (phrase de transparence).
    footerNote: "Contrôle parental transparent. Jamais le contenu de ses messages, appels ou pages web — seulement ce qui est listé dans « Mes données ».",
    viewTitle: {
      overview: "Vue d’ensemble",
      screen: "Temps d’écran",
      apps: "Applications",
      calls: "Appels",
      rules: "Règles d’accès",
      filter: "Filtrage web & contenu",
      location: "Localisation",
      security: "Sécurité & SOS",
      wellbeing: "Sécurité ado — bien-être",
      requests: "Demandes",
      messages: "Messages",
      family: "Famille & appareils",
      privacy: "Confidentialité & RGPD",
    },
    loadFailed: "Chargement impossible",
    retry: "Réessayer",
    loadingData: "Chargement des données…",
    familyBadgeTitle: "Famille",
    // Pastille d'état : {name} = prénom, {ago} = temps relatif (« il y a 5 min »).
    deviceFreshness: "Appareil de {name} · relevé {ago}",
    // Ligne au-dessus des commandes : {date} = date du jour en toutes lettres.
    headerDate: "{date}",
    // Profil de l’enfant à la suite de la date (masqué sur petit écran ; repris, pour
    // les lecteurs d’écran, dans le nom accessible du sélecteur d’enfant).
    headerProfileInline: "\u00A0· Profil « {profile} »",
    childLabel: "Enfant",
    familyLabel: "Famille",
    navLabel: "Navigation principale",
    navSections: {
      follow: "Suivi",
      protect: "Protection",
      exchange: "Échanges",
      account: "Compte",
    },
    openMenu: "Ouvrir le menu",
    // Bouton menu (mobile) quand des demandes attendent une réponse.
    openMenuPending: {
      one: "Ouvrir le menu — {count} demande en attente",
      other: "Ouvrir le menu — {count} demandes en attente",
    },
    closeMenu: "Fermer le menu",
    loadingView: "Chargement de la vue…",
    viewError: "Cette page n’a pas pu se charger (connexion interrompue ou nouvelle version publiée).",
    // Badge discret sur l'entrée « Sécurité ado » quand l'enfant sélectionné est jeune.
    teenOnly: "Préado / ado",
    // Compteur des demandes en attente (badge de navigation, lecture d'écran).
    pendingRequests: { one: "{count} demande en attente", other: "{count} demandes en attente" },
    theme: {
      light: "Thème clair",
      dark: "Thème sombre",
      system: "Thème système",
    },
    signOut: "Déconnexion",
    noChild: "Ajoutez un enfant dans l’onglet <b>Famille</b> pour voir ses données.",
    protection: {
      title: "Une protection est désactivée",
      body: "Sur l’appareil : <b>{labels}</b>. Une autorisation nécessaire a été retirée. Demandez à l’enfant de la réactiver depuis son écran « Mes données » (rien n’est caché — l’app reste visible et transparente).",
      separator: " · ",
    },
    createFamily: {
      title: "Créer une famille",
      namePlaceholder: "Nom du foyer",
      submit: "Créer la famille",
    },
  },

  login: {
    title: "Console parent",
    tagline: "Contrôle parental transparent",
    email: "E-mail",
    password: "Mot de passe",
    signIn: "Se connecter",
    signUp: "Créer un compte",
    switchToSignUp: "Créer un compte parent",
    switchToSignIn: "J’ai déjà un compte",
    accountCreated: "Compte créé. Vérifiez vos e-mails si la confirmation est requise, puis connectez-vous.",
    // Panneau de marque (écran de connexion)
    headline: "Veiller sur eux, en toute transparence.",
    lead: "Un contrôle parental visible et bienveillant : votre enfant voit à tout moment ce qui est partagé avec vous.",
    points: {
      visible: "Toujours visible sur l’appareil de l’enfant, jamais caché.",
      metadata: "Jamais le contenu de ses messages, appels ou pages web.",
      audit: "Chaque action est tracée dans un journal d’audit.",
    },
    // Variante courte des points (petits écrans, < 480 px) : une ligne chacun.
    pointsShort: {
      visible: "Toujours visible sur son appareil",
      metadata: "Jamais le contenu",
      audit: "Chaque action est tracée",
    },
    signInSubtitle: "Connectez-vous à votre espace parent.",
    signUpSubtitle: "Créez votre compte parent.",
    showPassword: "Afficher le mot de passe",
    hidePassword: "Masquer le mot de passe",
  },

  ui: {
    tile: {
      // {pct} = variation déjà formatée avec son signe (« +32 % »).
      deltaVsPrevious: "{pct} par rapport à la période précédente",
    },
  },

  units: {
    duration: {
      seconds: "{s} s",
      minutes: "{m} min",
      hours: "{h} h",
      hoursMinutes: "{h} h {mm}",
    },
    durationShort: {
      minutes: "{m} min",
      hours: "{h} h",
      hoursMinutes: "{h} h {m}",
    },
    bytes: {
      pattern: "{value}\u00A0{unit}",
      b: "o",
      kb: "Ko",
      mb: "Mo",
      gb: "Go",
      tb: "To",
    },
    justNow: "à l’instant",
    // Dates relatives : {time} = heure « 18:12 », {date} = « 2 oct. ».
    // fmt.dateTime (cellules, listes) : « 18:12 », « hier à 18:12 », « 2 oct. à 18:12 ».
    // fmt.at (dans une phrase) : « à 18:12 », « hier à 18:12 », « le 2 oct. à 18:12 ».
    when: {
      today: "à {time}",
      yesterday: "hier à {time}",
      dated: "{date} à {time}",
      datedInSentence: "le {date} à {time}",
    },
    // Initiales des jours pour les axes très étroits (< 400 px), sans ambiguïté.
    weekdayMin: { mon: "L", tue: "Ma", wed: "Me", thu: "J", fri: "V", sat: "S", sun: "D" },
  },

  errors: {
    generic: "Une erreur est survenue.",
    network: "Connexion au serveur impossible. Vérifiez votre accès à Internet.",
    unauthenticated: "Session expirée ou absente : reconnectez-vous.",
    sessionExpired: "Votre session a expiré : reconnectez-vous.",
    forbidden: "Accès refusé : autorité parentale requise sur cette famille.",
    ownerRequired: "Accès refusé : seul le propriétaire de la famille peut tout effacer.",
    invalidName: "Nom invalide.",
    missingParams: "Informations manquantes.",
    childNotInFamily: "Cet enfant n’appartient pas à cette famille.",
    childNotFound: "Enfant introuvable.",
    invalidCode: "Code d’appairage invalide.",
    codeExpired: "Code d’appairage expiré.",
    codeAlreadyUsed: "Code d’appairage déjà utilisé.",
    invalidCredentials: "E-mail ou mot de passe incorrect.",
    emailNotConfirmed: "Adresse e-mail non confirmée : vérifiez vos e-mails.",
    userAlreadyExists: "Un compte existe déjà avec cette adresse e-mail.",
    weakPassword: "Mot de passe trop faible.",
    rateLimited: "Trop de tentatives : réessayez dans quelques minutes.",
    duplicate: "Cet élément existe déjà.",
    notFound: "Élément introuvable (il a peut-être été supprimé).",
    invalidInput: "Valeur invalide ou hors limites : vérifiez la saisie.",
    serviceUnavailable: "Service momentanément indisponible. Réessayez dans quelques instants.",
    samePassword: "Le nouveau mot de passe doit être différent de l’ancien.",
    emailInvalid: "Adresse e-mail invalide.",
    emailNotAuthorized: "L’envoi d’e-mail vers cette adresse est refusé par le service (configuration de l’envoi d’e-mails).",
    signupDisabled: "Les inscriptions sont actuellement fermées.",
    captchaFailed: "Vérification anti-robot échouée : réessayez.",
    userBanned: "Ce compte est bloqué.",
  },

  enums: {
    ageProfile: {
      young_child: "Jeune enfant",
      preteen: "Préado",
      teen: "Ado",
    },
    // Libellés des préréglages par âge (règles d'accès & filtrage).
    ageProfilePreset: {
      young_child: "Jeune enfant (~6 ans)",
      preteen: "Préado (~12\u00A0ans)",
      teen: "Ado (15\u00A0ans et\u00A0+)",
    },
    role: {
      owner: "Propriétaire",
      parent: "Parent",
      guardian: "Tuteur",
      child: "Enfant",
    },
    scheduleKind: {
      downtime: "Coucher (pause du soir)",
      allowed: "Plages autorisées",
      blocked: "Plages interdites",
      school: "Mode École",
    },
    requestKind: {
      extra_time: "Temps supplémentaire",
      unblock_app: "Débloquer une app",
      reward: "Récompense",
      browse: "Accès à un site",
    },
    geofenceType: {
      home: "Maison",
      school: "École",
      custom: "Lieu",
    },
    geofenceTransition: {
      enter: "Arrivée",
      exit: "Départ",
      dwell: "Présence",
    },
    locationMode: {
      off: "Désactivé",
      on_demand: "À la demande",
      periodic: "Périodique",
    },
    youtubeMode: {
      off: "Désactivé",
      moderate: "Modéré",
      strict: "Strict",
    },
    domainAction: {
      blocked: "Bloqué",
      allowed: "Autorisé",
      rewritten: "Réécrit (recherche sécurisée)",
    },
    severity: {
      low: "Faible",
      medium: "Moyenne",
      high: "Élevée",
    },
    // Catégories d'applications (temps d'écran).
    appCategory: {
      social: "Réseaux sociaux",
      game: "Jeux",
      video: "Vidéo",
      audio: "Audio / musique",
      productivity: "Productivité",
      maps: "Cartes",
      news: "Actualités",
      image: "Photo / image",
      other: "Autres",
    },
    // Catégories de filtrage web (LOT 4).
    filterCategory: {
      blacklist: "Liste noire",
      adult: { label: "Contenu adulte", hint: "Pornographie et contenu explicite." },
      violence: { label: "Violence", hint: "Sites violents ou choquants." },
      gambling: { label: "Jeux d’argent", hint: "Paris, casinos, loteries." },
      drugs: { label: "Drogues", hint: "Vente / promotion de stupéfiants." },
      weapons: { label: "Armes", hint: "Vente d’armes." },
      hate: { label: "Haine", hint: "Discours de haine, extrémisme." },
      dating: { label: "Rencontres", hint: "Sites et applications de rencontre." },
      social: { label: "Réseaux sociaux", hint: "Plateformes sociales (médiation par âge)." },
      piracy: { label: "Piratage", hint: "Téléchargement illégal, torrents." },
      malware: { label: "Sites malveillants", hint: "Hameçonnage, logiciels malveillants." },
      ads_trackers: { label: "Pubs & traceurs", hint: "Publicités et pisteurs." },
    },
    // Catégories de signaux bien-être (LOT 6).
    safetyCategory: {
      other: "Autre",
      harassment: { label: "Harcèlement", hint: "Insultes répétées, menaces, mise à l’écart." },
      grooming: { label: "Contact suspect", hint: "Motif de sollicitation par un contact inconnu (secret, rendez-vous…)." },
      sexual_content: { label: "Contenu sexuel", hint: "Sollicitation de photos / propos à caractère sexuel." },
      self_harm: { label: "Mal-être", hint: "Détresse, auto-agression, idées noires." },
      drugs: { label: "Drogues", hint: "Substances / produits illicites." },
    },
    // Autorisations Android surveillées (bannière de protection, LOT 8b).
    protection: {
      perm_usage_access: "Accès au temps d’écran",
      perm_overlay: "Écran de pause (superposition)",
      perm_notifications: "Notifications",
      perm_location: "Localisation",
    },
    // Jours de la semaine, index 0 = dimanche (aligné sur Date.getDay()).
    dowShort: {
      d0: "Dim",
      d1: "Lun",
      d2: "Mar",
      d3: "Mer",
      d4: "Jeu",
      d5: "Ven",
      d6: "Sam",
    },
    dowMask: {
      everyDay: "Tous les jours",
      weekdays: "En semaine",
      weekend: "Week-end",
      separator: ", ",
    },
  },

  views: {
    rules: {
      loading: "Chargement des règles…",

      // Actions possibles d'une règle (catégorie ou application).
      // Type d'une commande envoyée à l'appareil (liste « Dernières commandes »).
      commandType: {
        lock_now: "Verrouillage",
        pause: "Pause",
        resume: "Reprise",
        ring: "Sonnerie",
        message: "Message à l’écran",
        locate: "Demande de position",
      },
      ruleAction: {
        free: "Libre",
        limit: "Limiter",
        block: "Bloquer",
        allow: "Autoriser",
        alwaysAllow: "Toujours autoriser",
      },

      timeLimits: {
        title: "Temps d’écran",
        today: "Aujourd’hui",
        // {used} = durée déjà formatée (ex. « 1 h 05 »), {limit} = minutes.
        // {used} et {limit} = durées formatées (« 2 h 05 / 2 h 30 »).
        usageOfLimit: "{used} / {limit}",
        bonusToday: "+{minutes} min de bonus aujourd’hui",
        presetsTitle: "Préréglages par âge",
        presetsHint: "Repères d’aide à la décision — ajustables ci-dessous à tout moment.",
        dailyLimitTitle: "Limite quotidienne (tous les jours)",
        dailyLimitPlaceholder: "aucune",
        minutesPerDay: "minutes / jour",
        save: "Enregistrer",
        weekdayTitle: "Par jour de la semaine (remplace la limite quotidienne)",
        graceTitle: "Délai de grâce « encore 1 min »",
        graceToggle: "Autoriser une courte prolongation à l’atteinte d’un quota",
        graceDuration: "Durée (min)",
        graceUsesPerDay: "Fois / jour",
      },

      instantControl: {
        title: "Pause & verrouillage",
        intro: "Action <b>visible</b> par l’enfant, réversible. L’appel d’urgence (112) n’est jamais bloqué.",
        noDeviceTitle: "Aucun appareil appairé",
        noDeviceHint: "Appairez un appareil dans l’onglet Famille.",
        pause: "Pause",
        resume: "Reprendre",
        lock: "Verrouiller",
        ring: "Faire sonner",
        messagePlaceholder: "Message à afficher",
        messageHint: "Par exemple : « À table ! » — affiché sur l’écran de l’enfant.",
        send: "Envoyer",
        recentCommands: "Dernières commandes",
        // Statut d'une commande envoyée à l'appareil.
        commandStatus: {
          pending: "En attente",
          delivered: "Reçue par l’appareil",
          acked: "Appliquée sur l’appareil",
          expired: "Expirée",
          cancelled: "Annulée",
        },
      },

      guards: {
        title: "Mode vacances & verrous",
        vacationTitle: "Mode vacances / pause de planning",
        vacationHint: "Suspend temporairement les plannings (horaires, coucher, école). Reprise automatique à la fin.",
        vacationActive: "actif",
        // Libellés « Du [date] » / « Au [date] ».
        from: "Du",
        until: "Au",
        clear: "Effacer",
        installTitle: "Validation d’installation",
        blockNewApps: "Bloquer toute <b>nouvelle application</b> jusqu’à validation du parent",
        systemLockTitle: "Verrouillage des réglages système",
        systemLockToggle: "Empêcher la modification de l’heure, des comptes et des options développeur",
        systemLockHint: "Effectif seulement en mode <b>Renforcé</b> (appareil dédié).",
        ratingTitle: "Classification d’âge",
        ratingNone: "Aucune restriction",
        ratingHint: "niveau maximal autorisé",
      },

      categoryRules: {
        title: "Règles par catégorie",
        colCategory: "Catégorie",
        colToday: "Aujourd’hui",
        colRule: "Règle",
        colQuota: "Quota par jour",
        quotaUnit: "min",
      },

      appRules: {
        title: "Règles par application",
        searchPlaceholder: "Rechercher une application…",
        newApps: "Nouvelles apps",
        newAppsWithCount: "Nouvelles apps <b>({count})</b>",
        emptyTitle: "Aucune application",
        emptyHint: "L’inventaire remonte depuis l’appareil enfant une fois la supervision active.",
        // {category} = catégorie de l'app, {duration} = durée d'utilisation formatée.
        categoryWithUsage: "{category} · {duration} aujourd’hui",
      },

      schedules: {
        title: "Plannings <note>(réutilisables pour tous vos enfants)</note>",
        intro: "Horaires autorisés ou interdits, heure du coucher, mode École. Cochez « Appliqué à cet enfant » pour l’activer ; les créneaux se règlent dans chaque planning.",
        namePlaceholder: "Nom du planning",
        nameHint: "Par exemple : Nuit en semaine.",
        addSchedule: "Ajouter le planning",
        emptyTitle: "Aucun planning",
        emptyHint: "Créez un premier planning (par exemple : coucher du soir), puis appliquez-le.",
        assigned: "Appliqué à cet enfant",
        noWindows: "Aucun créneau.",
        addWindowTitle: "Ajouter un créneau",
        // {days} = jours (ex. « Lun–Ven »), {start}/{end} = heures HH:MM.
        window: "{days}\u00A0· {start}\u202F→\u202F{end}",
        // Libellés visibles des heures d’un créneau (le nom accessible reste startLabel / endLabel).
        fromLabel: "De",
        toLabel: "À",
        removeWindow: "Supprimer ce créneau",
        kindLabel: "Type de planning",
        startLabel: "Début du créneau",
        endLabel: "Fin du créneau",
        addWindow: "Ajouter le créneau",
      },
    },
    requests: {
      pendingTitle: "En attente <count>({count})</count>",
      emptyPendingTitle: "Aucune demande en attente",
      emptyPendingHint: "Les demandes de temps ou de déblocage de l’enfant apparaissent ici.",
      // Commentaire libre de l'enfant, cité.
      childNote: "« {note} »",
      approve: "Approuver",
      deny: "Refuser",
      historyTitle: "Historique",
      // Ligne d'historique : <b>…</b> = prénom ; {kind} = type ; {detail} = résumé.
      historyLine: "<b>{child}</b>\u00A0· {kind}\u00A0· {detail}",
      emptyHistory: "Aucune décision pour l’instant.",

      status: {
        pending: "En attente",
        approved: "Approuvée",
        denied: "Refusée",
        cancelled: "Annulée",
      },

      // Résumé d'une demande ({minutes} peut valoir « ? » si inconnu).
      describe: {
        unknownMinutes: "?",
        extraTimeGlobal: "+{minutes} min sur la journée",
        extraTimeApp: "+{minutes} min sur {app}",
        reward: "+{minutes} min de récompense",
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
    },
    filtering: {
      loading: "Chargement du filtrage…",

      // Carte « Filtrage du web » : interrupteur général, état VPN, préréglages
      status: {
        title: "Filtrage du web",
        intro: "Filtrage par <b>nom de site</b>, directement sur l’appareil — aucune lecture des pages, aucun déchiffrement. Visible par l’enfant dans « Mes données ».",
        enableToggle: "<b>Activer le filtrage</b> pour {name}",
        protectionTitle: "État de la protection",
        noDevice: "Aucun appareil n’a encore signalé l’état du filtrage. Il apparaîtra ici une fois le filtrage autorisé sur l’appareil enfant.",
        device: "Appareil",
        badgeDisabled: "désactivé",
        badgeUncertain: "état incertain",
        badgeActive: "actif",
        // {ago} = temps relatif (« il y a 5 min »), {when} = date/heure courte
        cutAgo: "coupé {ago}",
        silentSince: "silencieux depuis {ago}",
        lastSeen: "dernier signal {when}",
        antiBypass: "Protection contre le contournement, <b>en toute transparence</b> : si le filtrage est coupé (ou ne donne plus de nouvelles), c’est signalé ici et à l’enfant — jamais en cachette.",
        presetsTitle: "Préréglages par âge",
        presetsHint: "Jeune enfant : seulement les sites autorisés. Préado et ado : catégories bloquées et demandes d’accès. Chaque réglage reste ajustable.",
      },

      // Carte SafeSearch / YouTube / modes
      safeSearch: {
        title: "Recherche sécurisée & modes",
        forceSafeSearch: "Forcer la <b>recherche sécurisée</b> (SafeSearch : Google, Bing, DuckDuckGo)",
        youtubeTitle: "YouTube en mode restreint",
        // Aide sous le sélecteur : suit l'option choisie.
        youtubeHint: {
          off: "Aucun filtrage des vidéos YouTube.",
          moderate: "Masque les vidéos signalées comme inappropriées.",
          strict: "Masque davantage de vidéos, y compris certaines tout public.",
        },
        whitelistTitle: "Liste blanche stricte",
        whitelistOnly: "N’autoriser <b>que</b> les domaines de la liste blanche (+ services essentiels)",
        whitelistHint: "Recommandé pour le jeune enfant. Les services système et les urgences restent toujours accessibles.",
        askToBrowseTitle: "Demande d’accès à un site",
        askToBrowse: "Permettre à l’enfant de <b>demander l’accès</b> à un site bloqué",
        journalTitle: "Journal des domaines",
        logAllowed: "Consigner aussi les domaines <b>autorisés</b> (sinon : seulement les blocages)",
        retentionLabel: "Conservation (jours)",
        retentionHint: "noms de sites seulement — jamais d’adresse complète ni de contenu",
      },

      // Carte catégories bloquées
      categories: {
        title: "Catégories bloquées",
        intro: "Le contenu adulte est bloqué dans tous les préréglages.",
      },

      // File d'approbation Ask-to-Browse
      askToBrowse: {
        title: "Demandes d’accès",
        count: "({count})",
        emptyTitle: "Aucune demande en attente",
        emptyHint: "Quand l’enfant demande l’accès à un site bloqué, il apparaît ici.",
        unknownDomain: "domaine inconnu",
        badge: "Demande d’accès",
        // Note libre écrite par l'enfant, entre guillemets
        childNote: "« {note} »",
        allowButton: "Autoriser le domaine",
        denyButton: "Refuser",
      },

      // Listes blanche / noire
      lists: {
        title: "Listes de domaines",
        intro: "Une règle s’applique au domaine <b>et à ses sous-domaines</b>. « Autoriser » surclasse un blocage de catégorie ; « Bloquer » interdit un domaine précis.",
        domainPlaceholder: "exemple.com",
        actionBlock: "Bloquer (liste noire)",
        actionAllow: "Autoriser (liste blanche)",
        addButton: "Ajouter",
        invalidDomain: "Domaine invalide (ex. exemple.com).",
        allowTitle: "Liste blanche",
        allowEmpty: "Aucun domaine explicitement autorisé.",
        blockTitle: "Liste noire",
        blockEmpty: "Aucun domaine explicitement bloqué.",
        count: "({count})",
        // Règle créée suite à une demande Ask-to-Browse
        requested: "demandé par l’enfant",
        domainLabel: "Domaine",
        actionLabel: "Action (bloquer ou autoriser)",
        // Bouton icône (accessible) de retrait d'un domaine.
        remove: "Retirer {domain}",
      },

      // Journal des domaines (métadonnées)
      journal: {
        title: "Journal des domaines",
        subtitle: "(noms de sites)",
        // {count} = durée de conservation en jours (pluriel)
        intro: {
          one: "Nom de site, catégorie, action et heure. <b>Jamais</b> d’adresse complète, de recherche ni de contenu. Conservé {count} jour (suppression automatique).",
          other: "Nom de site, catégorie, action et heure. <b>Jamais</b> d’adresse complète, de recherche ni de contenu. Conservé {count} jours (suppression automatique).",
        },
        emptyTitle: "Aucun événement",
        emptyHint: "Les domaines bloqués (et autorisés, si activé) remonteront ici.",
        colDomain: "Domaine",
        colCategory: "Catégorie",
        colAction: "Action",
        colWhen: "Quand",
      },
    },
    wellbeing: {
      loading: "Chargement de la sécurité ado…",

      // Affiché à la place de la vue pour un profil « jeune enfant » (fonction désactivée)
      youngChild: {
        title: "Pas encore concerné",
        body: "Réservées aux profils préado et ado. Pour {name} (jeune enfant), elles sont désactivées : rien n’est analysé, aucune permission n’est demandée.",
        protectedBy: "Pour l’instant, la protection passe par :",
      },

      // Réglages « mode ado » (K6), état de l'analyse, pause de confidentialité (K8)
      settings: {
        title: "Analyse de bien-être (sur l’appareil)",
        intro: "Le texte des notifications est analysé <b>sur le téléphone de {name}</b>. Vous ne recevez qu’une <b>alerte de catégorie</b> (ci-dessous) — <b>jamais</b> ses messages, jamais le texte. L’ado le voit dans « Mes données » et peut la désactiver ou la mettre en pause.",
        enableToggle: "<b>Activer l’analyse</b> (nécessite le co-consentement de l’ado)",
        enableHint: "Désactivée par défaut, par respect de la vie privée. L’analyse ne tourne que si l’ado accorde aussi l’accès aux notifications sur son appareil.",
        mutualToggle: "<b>Visibilité mutuelle</b> — l’ado voit exactement ce que vous voyez",
        // {name} = prénom de l'ado ; {ago} = temps relatif (« il y a 5 min »)
        pauseNoticeSince: "<b>Pause de confidentialité active.</b> {name} a suspendu l’analyse (depuis {ago}). Vous voyez qu’une pause est en cours — <b>jamais</b> ce qu’elle masque. C’est à l’ado de la lever.",
        pauseNotice: "<b>Pause de confidentialité active.</b> {name} a suspendu l’analyse. Vous voyez qu’une pause est en cours — <b>jamais</b> ce qu’elle masque. C’est à l’ado de la lever.",
        statusTitle: "État de l’analyse",
        noDevice: "Aucun appareil n’a encore signalé l’état de l’analyse. Il apparaîtra ici une fois l’accès aux notifications accordé sur l’appareil de l’ado.",
        device: "Appareil",
        // Badges au féminin : « l'analyse »
        badgeInactive: "inactive",
        badgeUncertain: "état incertain",
        badgeActive: "active",
        cutAgo: "coupée {ago}",
        silentSince: "silencieuse depuis {ago}",
        lastSeen: "dernier signal {when}",
        transparency: "Transparence : si l’ado retire l’accès (son droit), c’est signalé ici — jamais en cachette.",
      },

      // Tableau agrégé par catégorie (G6)
      categories: {
        title: "Par catégorie",
        subtitle: "(alertes, sans contenu)",
        intro: "Regroupement des signaux détectés sur l’appareil. <b>Aucun contenu</b> — seulement catégorie, gravité et compte.",
        emptyTitle: "Aucun signal",
        emptyHint: "Tant que rien n’est détecté, rien n’apparaît ici. C’est bon signe.",
      },

      // Journal des signaux (métadonnées seulement)
      signals: {
        title: "Signaux récents",
        subtitle: "(sans contenu)",
        intro: "Catégorie + gravité + application source + heure. <b>Jamais</b> le texte, l’extrait ou le message.",
        emptyTitle: "Aucun signal",
        emptyHint: "Les alertes de catégorie remonteront ici.",
        colCategory: "Catégorie",
        colSeverity: "Gravité",
        colApp: "Application",
        // Abréviation de « occurrences » (colonne étroite)
        colOccurrences: "Nombre",
        occurrences: { one: "{count}\u00A0fois", other: "{count}\u00A0fois" },
        colWhen: "Quand",
        seen: "vu",
        markSeen: "Marquer vu",
      },

      // Ressources d'aide (V12)
      resources: {
        title: "Ressources d’aide",
        intro: "En cas de difficulté, ces services d’écoute et de signalement peuvent aider — vous et l’ado.",
        open: "Ouvrir le site",
      },
    },
    security: {
      history: {
        title: "Historique SOS",
        emptyTitle: "Aucun SOS",
        emptyHint: "Le bouton SOS est déclenché par l’enfant depuis son application. Un épisode apparaît ici avec sa position en direct.",
        colStatus: "Statut",
        colPeriod: "Période",
        // {start} = date et heure de début, {end} = heure de fin (ou date si autre jour).
        range: "{start}\u202F→\u202F{end}",
        ongoing: "depuis {start}",
      },
      // Statut d'un épisode SOS
      sosStatus: {
        active: "Actif",
        acked: "Aide en route",
        resolved: "Clos",
      },
      banner: {
        title: "SOS — {status}",
        triggered: "Déclenché {ago} · {date}",
        triggeredWithMessage: "Déclenché {ago} · {date} · « {message} »",
        ackTitle: "Prévenir l’enfant que l’aide arrive",
        ackButton: "Aide en route",
        resolveButton: "Clôturer",
        // Popups de carte
        sosPositionLabel: "Position SOS · {date}",
        lastKnownBeforeSosLabel: "Dernière position connue avant le SOS · {date}",
        liveCaption: "Dernière position SOS {ago} · ±{accuracy} m",
        liveCaptionStreaming: "Dernière position SOS {ago} · ±{accuracy} m · diffusion en direct",
        noSosPositionCaption: "Pas encore de position SOS — dernière position connue {ago} · ±{accuracy} m",
        waitingFirstPosition: "En attente de la première position de l’appareil…",
      },
      settings: {
        title: "Partage de position",
        titleHint: "(adapté à l’âge)",
        youngChildAdvice: "Profil jeune enfant : le suivi périodique est adapté. Il reste visible de l’enfant (notification permanente).",
        teenAdvice: "Profil préado ou ado : privilégiez le partage à la demande — plus respectueux de l’autonomie. L’enfant voit chaque partage.",
        modeLabel: "Mode de partage",
        modeOff: "Désactivé",
        modeOnDemand: "À la demande",
        modeOnDemandRecommended: "À la demande — conseillé",
        modePeriodic: "Périodique",
        modePeriodicRecommended: "Périodique — conseillé",
        frequencyLabel: "Fréquence",
        every5Min: "Toutes les 5 min",
        every15Min: "Toutes les 15 min",
        every30Min: "Toutes les 30 min",
        everyHour: "Toutes les heures",
        retentionLabel: "Conservation",
        retentionDays: "{days} jours",
        accuracyLabel: "Précision",
        accuracyBalanced: "Équilibrée (moins de batterie)",
        accuracyHigh: "Haute (GPS précis)",
      },
      zones: {
        title: "Zones de sécurité",
        titleHint: "(maison, école…)",
        addButton: "Ajouter une zone",
        emptyTitle: "Aucune zone définie",
        emptyHint: "Ajoutez la maison et l’école pour recevoir une alerte « bien arrivé » lors des trajets.",
        // Réglage SÉPARÉ du partage de position (location_settings.geofence_alerts_enabled).
        alertsToggle: "<b>Alertes d’entrée et de sortie de zones</b>",
        alertsHint: "Fonctionne indépendamment du partage de position. {name} en est informé(e) dans « Mes données ».",
        alertsUnavailable: "Réglage bientôt disponible : la mise à jour du serveur n’est pas encore appliquée.",
        // {alerts} = une des valeurs notify* ci-dessous (ou vide)
        summary: "rayon {radius} m · {alerts}",
        summaryDisabled: "rayon {radius} m · {alerts} · désactivée",
        notifyEnter: "alerte arrivée",
        notifyExit: "alerte départ",
        notifyBoth: "alerte arrivée + alerte départ",
        disable: "Désactiver",
        enable: "Activer",
        edit: "Modifier",
        delete: "Supprimer",
        confirmDelete: "Supprimer « {name} » ?",
      },
      zoneForm: {
        centerMarker: "Centre de la zone",
        mapHint: "Cliquez sur la carte pour placer le centre de la zone, puis ajustez le rayon.",
        nameLabel: "Nom",
        namePlaceholder: "Maison, École…",
        typeLabel: "Type",
        typeHome: "Maison",
        typeSchool: "École",
        typeCustom: "Autre lieu",
        radiusLabel: "Rayon : {radius} m",
        notifyEnter: "Alerte « bien arrivé »",
        notifyExit: "Alerte au départ",
        center: "Centre : {lat}, {lng}",
        save: "Enregistrer",
        create: "Créer la zone",
        cancel: "Annuler",
      },
      alerts: {
        title: "Alertes de sécurité",
        unseen: { one: "({count} non vue)", other: "({count} non vues)" },
        colAlert: "Alerte",
        colWhen: "Quand",
        colState: "État",
        lowBattery: "Batterie faible",
        // {level} = niveau formaté (« 14 % »).
        lowBatteryLevel: "Batterie faible ({level})",
        seen: "Vue",
        markSeen: "Marquer vue",
      },
    },
    location: {
      loading: "Chargement de la localisation…",
      checkInRequested: "Position demandée — elle arrivera dès que l’appareil répondra.",
      transparency: {
        title: "Localisation transparente.",
        // <b> = mode de partage actuel
        // {count} = durée de conservation en jours (pluriel)
        body: {
          one: "Seules les positions de cette application sont partagées — jamais à l’insu de l’enfant : il voit dans « Mes données » quand et comment sa position est transmise. Partage actuel : <b>{mode}</b>. Les positions sont conservées {count} jour puis supprimées.",
          other: "Seules les positions de cette application sont partagées — jamais à l’insu de l’enfant : il voit dans « Mes données » quand et comment sa position est transmise. Partage actuel : <b>{mode}</b>. Les positions sont conservées {count} jours puis supprimées.",
        },
        defaultMode: "à la demande",
      },
      sos: {
        title: "<strong>SOS en cours</strong> — déclenché {ago}.",
        hint: "La position est diffusée en direct ci-dessous. Détails et accusé de réception dans l’onglet <b>Sécurité / SOS</b>.",
      },
      tiles: {
        lastPosition: "Dernière position",
        accuracy: "Précision",
        accuracyValue: "±{accuracy} m",
        zones: "Zones de sécurité",
        // « En direct » est réservé au SOS : ici, seulement la mise à jour de la page.
        realtime: "Mise à jour de la page",
        connected: "Automatique",
        pollingFallback: "Régulière",
      },
      map: {
        title: "Carte",
        realtime: "mise à jour automatique",
        noDevice: "Aucun appareil appairé",
        requestCheckIn: "Demander la position",
        emptyTitle: "Aucune position pour l’instant",
        emptyHint: "Dès que l’appareil enfant partage une position (périodique ou à la demande), elle apparaît ici. Les zones de sécurité se dessinent même sans position.",
        recent: "Récent",
        dayTrace: { one: "Trajet du jour sélectionné ({count} point).", other: "Trajet du jour sélectionné ({count} points)." },
        recentHint: "Points récents, tous jours confondus. Choisissez un jour pour voir le trajet détaillé.",
        // Bouton d'un jour : {day} = date courte, {count} = nombre de positions.
        dayChip: { one: "{day} · {count} point", other: "{day} · {count} points" },
        // Popups de carte
        zoneLabel: "{type} · {name} ({radius} m)",
        traceDotLabel: "{date} · ±{accuracy} m",
        positionLabel: "Position · {date} · ±{accuracy} m",
        sosPositionLabel: "SOS — Position · {date} · ±{accuracy} m",
      },
      events: {
        title: "Arrivées & départs",
        titleHint: "(zones de sécurité)",
        emptyTitle: "Aucun passage de zone",
        emptyHint: "Les alertes « bien arrivé » (école, maison) s’affichent ici dès qu’une zone est définie et franchie.",
        colEvent: "Événement",
        colZone: "Zone",
        colWhen: "Quand",
        deletedZone: "Zone supprimée",
      },
    },
    map: {
      // Attribution des tuiles (HTML autorisé : entité &copy;)
      attribution: "&copy; contributeurs OpenStreetMap",
    },
    privacy: {
      cancel: "Annuler",
      deleting: "Suppression…",

      // Droit d'accès (export JSON).
      export: {
        title: "Exporter les données de {name} <muted>(droit d’accès)</muted>",
        intro: "Télécharge un fichier JSON (format de données standard, lisible par d’autres logiciels) avec toutes les données enregistrées pour cet enfant (métadonnées et agrégats — jamais le contenu de tiers). L’export est inscrit au journal d’audit.",
        preparing: "Préparation…",
        button: "Télécharger l’export (fichier JSON)",
        done: "Export téléchargé.",
      },

      // Politique de rétention (purge automatique).
      retention: {
        title: "Conservation des données <muted>(suppression automatique)</muted>",
        intro: "Les données anciennes sont supprimées automatiquement selon leur type, pour ne garder que le strict nécessaire (principe de minimisation du RGPD).",
        colData: "Donnée",
        colRetention: "Conservation",
        // Durée de conservation en jours (« j » = jours).
        days: "{days} jours",
        perChildDefault: "{days} jours (réglable par enfant)",
        rows: {
          locations: "Positions (localisation)",
          domainLog: "Journal des domaines (filtrage)",
          deviceState: "État de l’appareil (batterie/stockage)",
          callSmsMetadata: "Journal des appels (sans contenu)",
          zoneTransitions: "Entrées et sorties de zones",
          safetySignals: "Alertes de sécurité ado (calculées sur l’appareil)",
          alerts: "Alertes (batterie faible…)",
          screenTime: "Temps d’écran (agrégats quotidiens)",
          timeBonuses: "Bonus de temps accordés",
          commands: "Commandes envoyées à l’appareil",
          messaging: "Messagerie interne",
          sosEpisodes: "Épisodes SOS",
          auditLog: "Journal d’audit (traçabilité)",
        },
      },

      // Droit à l'effacement — un enfant. {name} = prénom de l'enfant, que le parent
      // doit ressaisir à l'identique pour confirmer (comparaison non traduite).
      deleteChild: {
        title: "Supprimer les données de {name} <muted>(droit à l’effacement)</muted>",
        intro: "Efface <b>définitivement</b> cet enfant et toutes ses données (positions, temps d’écran, messages, signaux…). Les autres membres de la famille ne sont pas affectés. <b>Action irréversible.</b>",
        button: "Supprimer cet enfant…",
        confirmPrompt: "Confirmation : saisissez le prénom <b>{name}</b> pour confirmer.",
        confirmLabel: "Saisissez « {name} » pour confirmer",
        confirmButton: "Confirmer la suppression définitive",
      },

      // Droit à l'effacement — toute la famille. {name} = nom du foyer, à ressaisir.
      deleteFamily: {
        title: "Supprimer toute la famille « {name} » <muted>(réservé au propriétaire)</muted>",
        intro: "Efface <b>définitivement</b> la famille entière : tous les enfants, appareils, règles et données. Seul le <b>propriétaire</b> du foyer peut le faire.<b> Action irréversible.</b>",
        button: "Supprimer toute la famille…",
        confirmPrompt: "Confirmation : saisissez le nom du foyer <b>{name}</b> pour confirmer.",
        confirmLabel: "Saisissez « {name} » pour confirmer",
        confirmButton: "Confirmer la suppression de la famille",
      },
    },
    family: {
      childrenTitle: "Enfants",
      noChildTitle: "Aucun enfant pour l’instant",
      noChildHint: "Ajoutez un profil, puis générez un code d’appairage pour son appareil.",
      noDevice: "Aucun appareil appairé.",
      // Badge d'un appareil appairé : {name} = nom/modèle, {mode} = libellé du mode.
      deviceBadge: "{name}\u00A0· {mode}",
      deviceBadgeRevoked: "{name}\u00A0· {mode} (révoqué)",
      childrenSubtitle: "Profils et appareils reliés à votre famille",
      childrenCount: { one: "{count} enfant", other: "{count} enfants" },
      devicesCount: { one: "{count} appareil appairé", other: "{count} appareils appairés" },
      noDevicePaired: "aucun appareil appairé",
      // {a} · {b} : résumé « 1 enfant · aucun appareil appairé »
      summary: "{children} · {devices}",
      age: { one: "{count} an", other: "{count} ans" },
      noDeviceTitle: "Aucun appareil appairé pour l’instant",
      noDeviceHint: "Installez l’application enfant sur l’appareil de {name}, ouvrez-la, puis saisissez le code d’appairage avant son expiration. L’appareil apparaîtra ici dès qu’il sera relié.",
      devicesTitle: "Appareils",
      // Mode d'appareil (valeurs de l'enum DeviceMode).
      deviceMode: {
        standard: "Standard",
        reinforced: "Renforcé",
      },

      // Journal d'audit : <muted>…</muted> = précision atténuée.
      auditTitle: "Journal d’audit",
      auditSubtitle: "Transparence : chaque action est tracée",
      auditEmpty: "Aucune activité.",

      addChild: {
        nameLabel: "Prénom de l’enfant",
        namePlaceholder: "Prénom",
        birthLabel: "Date de naissance",
        submit: "Ajouter l’enfant",
        title: "Ajouter un enfant",
        birthHint: "La date de naissance adapte automatiquement les protections à l’âge de l’enfant (profil « jeune enfant » / « préado » / « ado »). Elle est facultative.",
      },

      pairing: {
        modeStandard: "Standard",
        modeReinforced: "Renforcé (appareil dédié)",
        generate: "Générer un code d’appairage",
        title: "Appairage de l’appareil",
        hint: "Un code à usage unique relie l’appli enfant à cette famille.",
        modeLabel: "Mode",
        kicker: "Code d’appairage",
        // {time} = heure d'expiration (« 10:42 »).
        expiresAt: "Expire à {time} · usage unique",
        copy: "Copier",
        copied: "Copié",
        copyAria: "Copier le code d’appairage",
        copiedAnnounce: "Code d’appairage copié dans le presse-papiers.",
        copyFallback: "Copie impossible ici : sélectionnez le code pour le copier.",
        expired: "Code expiré — générez-en un nouveau.",
      },
    },
    messages: {
      // {name} = prénom de l'enfant.
      title: "Conversation avec {name}",
      // Annonce (lecteur d'écran) d'un nouveau message reçu de l'enfant.
      newFromChild: "Nouveau message de {name} : {body}",
      intro: "Messagerie interne, visible par l’enfant. On n’accède jamais à ses autres applications de messagerie.",
      emptyTitle: "Aucun message",
      emptyHint: "Écrivez un premier mot — il apparaîtra sur l’appareil de l’enfant.",
      // Horodatage d'un message du parent déjà lu par l'enfant ; {date} = date/heure.
      sentAtRead: "{date} · lu",
      placeholder: "Écrire un message…",
      send: "Envoyer",
    },
    overview: {
      tiles: {
        screenTimeToday: "Temps d’écran aujourd’hui",
        installedApps: "Applications installées",
        battery: "Batterie",
        // Niveau de batterie en pourcentage.
        batteryValue: "{level}",
        freeStorage: "Stockage libre",
        charging: "En charge",
        notCharging: "Pas en charge",
        // {app} = nom de l'application ; {date} = date courte.
        lastInstalled: "Dernière installée : {app} · {date}",
      },
      last7Days: "7 derniers jours",
      noScreenTimeTitle: "Pas encore de données de temps d’écran",
      noScreenTimeHint: "Elles apparaîtront après l’activation de l’accès à l’usage sur l’appareil.",
      todayByCategory: "Aujourd’hui par catégorie",
      // Sous-titre au centre de l'anneau, sous la durée totale du jour.
      donutToday: "aujourd’hui",
      noActivityToday: "Aucune activité aujourd’hui",
      topAppsToday: "Applications les plus utilisées aujourd’hui",
      tilesLabel: "Indicateurs du jour",
      topAppsSubtitle: "Durées cumulées, sans aucun contenu consulté",
      seeAllApps: "Toutes les applications",
      categorySubtitle: "Répartition du temps d’écran",
      donutTotal: "au total",
      // {avg} = durée moyenne formatée (« 2 h 06 »)
      averagePerDay: "Temps d’écran quotidien · moyenne {avg} par jour",
      legend: {
        today: "Aujourd’hui",
        previousDays: "Jours précédents",
        overLimit: "Limite dépassée",
        dailyLimit: "Limite quotidienne",
      },
      // {value} = limite formatée (« 2 h 30 ») ; affichée à côté de la ligne.
      // <l>…</l> = mot mis sur sa propre ligne, au-dessus de la valeur.
      limitLabel: "<l>Limite</l> {value}",
      limitExceeded: {
        one: "{count} jour au-delà de la limite actuelle sur ces 7 jours (bonus non comptés).",
        other: "{count} jours au-delà de la limite actuelle sur ces 7 jours (bonus non comptés).",
      },
      limitNeverExceeded: "Aucun jour au-delà de la limite actuelle sur ces 7 jours.",
      // Tendance : aujourd'hui (jusqu'ici) par rapport à hier (journée entière).
      trend: {
        less: "−{duration} par rapport à hier",
        more: "+{duration} par rapport à hier",
        same: "Autant qu’hier",
        caption: "aujourd’hui jusqu’ici, hier en journée entière",
      },
      transparency: {
        title: "Supervision active et visible sur l’appareil de {name}",
        titleNoDevice: "Aucun appareil relié pour {name} : rien n’est collecté",
        subtitle: "{name} voit à tout moment ce qui est partagé avec vous.",
        youSee: "Vous voyez",
        youNeverSee: "Vous ne voyez jamais",
        // MÊME liste, dans le même ordre, que « Mes données » côté enfant (app enfant,
        // strings.xml : une clé see.* par ligne shared_*, une clé never.* par élément
        // de never_shared). Toute modification se fait des DEUX côtés.
        see: {
          usage: "Le temps passé et le nombre d’ouvertures par application et par jour, avec l’heure de dernière utilisation et le type d’application",
          inventory: "La liste des applications installées, leur date d’installation, et quand une application apparaît ou disparaît",
          device: "Le modèle de l’appareil, sa batterie, son stockage et l’état des autorisations de l’appli",
          location: "La position selon le mode choisi (périodique ou à la demande, et en cas de batterie faible), sur une carte avec le trajet du jour",
          sos: "La position en direct pendant un SOS déclenché par l’enfant, même si le partage de position est désactivé",
          zones: "Les arrivées dans les zones (et les départs si vous les avez choisis), si les alertes de zones sont activées — même quand le partage de position est désactivé",
          calls: "Le journal des appels, s’il est activé : sens, date, durée et un code à la place du numéro (« Numéro masqué » si l’appelant le cache) — jamais ce qui a été dit",
          filter: "Le filtrage web : nom, catégorie et heure des sites bloqués — et de chaque site visité si vous activez ce journal — et l’état du filtrage ; jamais les pages ni leur contenu",
          safety: "Les alertes de sécurité (préado et ado) : catégorie, gravité, appli concernée, nombre et heure, calculées sur l’appareil — jamais le texte ; ainsi que l’état de l’analyse et les pauses",
          requests: "Ses demandes de temps supplémentaire",
          messages: "La lecture de vos messages et la bonne réception de vos actions (pause, sonnerie, demande de position…)",
          export: "Un export de toutes ces informations dans un fichier",
          retention: "Ces informations pendant une durée limitée, puis effacement automatique (de 1 mois à 1 an selon le type ; la liste des applis et les demandes jusqu’à ce que vous les effaciez)",
        },
        never: {
          content: "Le contenu de ses messages et de ses appels (hors messagerie de l’appli)",
          contacts: "Le nom de ses contacts",
          notifications: "Le texte des notifications",
          pages: "Les pages web consultées",
          passwords: "Les mots de passe",
          media: "L’image de l’écran, de la caméra ou du micro",
        },
        sameList: "{name} voit cette même liste dans « Mes données » sur son appareil, ajustée à vos réglages actuels.",
        link: "Voir la page Confidentialité",
      },
      storage: {
        title: "Stockage de l’appareil",
        // {used}, {total}, {free} = tailles déjà formatées (« 12 Go »).
        used: "{used} utilisés sur {total}",
        free: "{free} libres",
      },
    },
    screenTime: {
      // Période d'analyse (boutons 7 / 30 jours, sous-titre de l'anneau).
      periodDays: { one: "{count} jour", other: "{count} jours" },
      tiles: {
        // {days} = durée de la période (« j » = jours).
        total: "Temps total ({days} jours)",
        averagePerDay: "Moyenne par jour",
        appLaunches: "Ouvertures d’apps",
      },
      dailyTrend: "Tendance quotidienne",
      noDataInPeriod: "Aucune donnée sur la période",
      byCategory: "Répartition par catégorie",
      noActivity: "Aucune activité",
      topApps: "Top applications",
    },
    applications: {
      emptyTitle: "Aucune application inventoriée",
      emptyHint: "L’inventaire (apps installées) remonte depuis l’appareil enfant une fois la supervision active.",
      // {count} = nombre d'applications listées ; <muted>…</muted> = partie atténuée.
      listTitle: "Applications <muted>({count})</muted>",
      // Sous-titre de la liste : période du temps affiché.
      listPeriod: { one: "Temps d’usage sur {count} jour", other: "Temps d’usage sur {count} jours" },
      searchPlaceholder: "Rechercher une application…",
      // Ligne de méta d'une app système : {category} = catégorie de l'app.
      categorySystem: "{category} · système",
      noMatch: "Aucune application ne correspond.",
      detail: {
        systemApp: "Application système",
        installedOn: "Installée le {date}",
        time: { one: "Temps ({count} jour)", other: "Temps ({count} jours)" },
        launches: { one: "Ouvertures ({count} jour)", other: "Ouvertures ({count} jours)" },
        usage: { one: "Usage du dernier jour", other: "Usage des {count} derniers jours" },
        noUsage: "Pas d’usage mesuré sur la période.",
        lastUsed: "Dernière utilisation : {date}",
      },
    },
    calls: {
      // Bandeau de transparence : <b>…</b> = en gras, <muted>…</muted> = texte atténué.
      notice: "<b>Métadonnées uniquement.</b> <muted>Qui (numéro jamais stocké en clair), quand et combien de temps — jamais le contenu des appels, qui n’est ni écouté ni enregistré. Ces informations sont aussi visibles par l’enfant.</muted>",
      emptyTitle: "Aucune métadonnée d’appel",
      emptyHint: "Cette fonction est facultative et sensible. Elle est désactivée par défaut dans l’app enfant et n’est collectée qu’avec le consentement explicite.",
      tiles: {
        incoming: "Entrants",
        outgoing: "Sortants",
        unanswered: "Manqués / rejetés",
        totalDuration: "Durée totale",
      },
      // {total} = nombre total d'événements ; <muted>…</muted> = partie atténuée.
      logTitle: "Journal des appels <muted>(sans contenu · {total} au total)</muted>",
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
      // Appel réellement anonyme (aucun identifiant).
      hiddenNumber: "Numéro masqué",
      // {id} = identifiant masqué STABLE du correspondant (préfixe de hash) — jamais le numéro.
      counterpartyWithId: "Correspondant · {id}",
    },
    charts: {
      // aria-label du graphique en anneau ; {total} = total déjà formaté (ex. « 2 h 35 »).
      donutAriaLabel: "Répartition : total {total}",
      // Infobulles au survol : <k>…</k> = libellé atténué, <v>…</v> = valeur mise en avant.
      tooltip: "<k>{label} · </k><v>{value}</v>",
      tooltipWithPercent: "<k>{label} · </k><v>{value}</v><k> ({pct})</k>",
      noData: "Aucune donnée.",
      // Description accessible d'un histogramme : liste « libellé : valeur ».
      point: "{label} : {value}",
      pointSeparator: " ; ",
    },
  },

  // Actions du journal d'audit → phrases lisibles.
  audit: {
    fallback: "Action",
    actions: {
      family_created: "Famille créée",
      pairing_code_created: "Code d’appairage généré",
      device_enrolled: "Appareil appairé",
      rgpd_export: "Export des données (RGPD)",
      rgpd_delete_child: "Suppression d’un profil enfant (RGPD)",
      rgpd_delete_family: "Suppression de la famille (RGPD)",
    },
  },

  // Ressources d'aide (V12) — services FRANÇAIS : à adapter par pays/langue.
  helpResources: {
    r3018: { contact: "3018 (appel/chat)", desc: "Cyberharcèlement et violences numériques (e-Enfance). Gratuit, anonyme." },
    r3114: { contact: "3114 (24 h/24)", desc: "Souffrance psychique et prévention du suicide. Écoute par des soignants." },
    pharos: { contact: "internet-signalement.gouv.fr", desc: "Signalement officiel de contenus et comportements illicites en ligne." },
  },
} as const;

export default fr;
