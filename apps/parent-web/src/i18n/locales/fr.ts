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
    unexpectedError: "Un problème inattendu a interrompu l'affichage.",
    reload: "Recharger",
  },

  nav: {
    overview: "Vue d'ensemble",
    screen: "Temps d'écran",
    apps: "Applications",
    calls: "Appels",
    rules: "Règles d'accès",
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
    footerPrivacy: "Métadonnées & agrégats seulement — jamais le contenu.",
    viewTitle: {
      overview: "Vue d'ensemble",
      screen: "Temps d'écran",
      apps: "Applications",
      calls: "Appels",
      rules: "Règles d'accès",
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
    deviceStatusTitle: "État de l'appareil (dernier relevé)",
    // Infobulle de la pastille d'appareil : batterie (%) · stockage libre.
    deviceStatus: "Batterie {battery} % · stockage libre {storage}",
    // Pastille d'état : {name} = prénom, {ago} = temps relatif (« il y a 5 min »).
    deviceFreshness: "Appareil de {name} · relevé {ago}",
    // Ligne au-dessus des commandes : {date} = date du jour en toutes lettres.
    headerDate: "{date}",
    headerDateWithProfile: "{date} · Profil « {profile} »",
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
    closeMenu: "Fermer le menu",
    loadingView: "Chargement de la vue…",
    theme: {
      light: "Thème clair",
      dark: "Thème sombre",
      system: "Thème système",
    },
    signOut: "Déconnexion",
    noChild: "Ajoutez un enfant dans l'onglet <b>Famille</b> pour voir ses données.",
    protection: {
      title: "Une protection est désactivée",
      body: "Sur l'appareil : <b>{labels}</b>. Une autorisation nécessaire a été retirée. Demandez à l'enfant de la réactiver depuis son écran « Mes données » (rien n'est caché — l'app reste visible et transparente).",
      separator: " · ",
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
    switchToSignIn: "J'ai déjà un compte",
    accountCreated: "Compte créé. Vérifiez vos e-mails si la confirmation est requise, puis connectez-vous.",
    mfaNotice: "La double authentification (MFA) sera exigée pour les comptes parents (voir SETUP.md).",
    // Panneau de marque (écran de connexion)
    headline: "Veiller sur eux, en toute transparence.",
    lead: "Un contrôle parental visible et bienveillant : votre enfant voit à tout moment ce qui est partagé avec vous.",
    points: {
      visible: "Toujours visible sur l'appareil de l'enfant, jamais caché.",
      metadata: "Métadonnées et agrégats seulement — jamais le contenu.",
      audit: "Chaque action est tracée dans un journal d'audit.",
    },
    signInSubtitle: "Connectez-vous à votre espace parent.",
    signUpSubtitle: "Créez votre compte parent.",
    showPassword: "Afficher le mot de passe",
    hidePassword: "Masquer le mot de passe",
  },

  ui: {
    tile: {
      deltaPct: "{pct}%",
      vsPrevious: "vs période précédente",
    },
  },

  units: {
    duration: {
      seconds: "{s} s",
      minutes: "{m} min",
      hours: "{h} h",
      hoursMinutes: "{h} h {mm}",
    },
    durationShort: {
      minutes: "{m}m",
      hours: "{h}h",
      hoursMinutes: "{h}h{m}",
    },
    bytes: {
      pattern: "{value} {unit}",
      b: "o",
      kb: "Ko",
      mb: "Mo",
      gb: "Go",
      tb: "To",
    },
    justNow: "à l'instant",
  },

  errors: {
    generic: "Une erreur est survenue.",
    network: "Connexion au serveur impossible. Vérifiez votre accès à Internet.",
    unauthenticated: "Session expirée ou absente : reconnectez-vous.",
    sessionExpired: "Votre session a expiré : reconnectez-vous.",
    forbidden: "Accès refusé : autorité parentale requise sur cette famille.",
    ownerRequired: "Accès refusé : seul le propriétaire (owner) de la famille peut tout effacer.",
    invalidName: "Nom invalide.",
    missingParams: "Informations manquantes.",
    childNotInFamily: "Cet enfant n'appartient pas à cette famille.",
    childNotFound: "Enfant introuvable.",
    invalidCode: "Code d'appairage invalide.",
    codeExpired: "Code d'appairage expiré.",
    codeAlreadyUsed: "Code d'appairage déjà utilisé.",
    invalidCredentials: "E-mail ou mot de passe incorrect.",
    emailNotConfirmed: "Adresse e-mail non confirmée : vérifiez vos e-mails.",
    userAlreadyExists: "Un compte existe déjà avec cette adresse e-mail.",
    weakPassword: "Mot de passe trop faible.",
    rateLimited: "Trop de tentatives : réessayez dans quelques minutes.",
    duplicate: "Cet élément existe déjà.",
    notFound: "Élément introuvable (il a peut-être été supprimé).",
    invalidInput: "Valeur invalide ou hors limites : vérifiez la saisie.",
    serviceUnavailable: "Service momentanément indisponible. Réessayez dans quelques instants.",
    samePassword: "Le nouveau mot de passe doit être différent de l'ancien.",
    emailInvalid: "Adresse e-mail invalide.",
    emailNotAuthorized: "L'envoi d'e-mail vers cette adresse est refusé par le service (configuration de l'envoi d'e-mails).",
    signupDisabled: "Les inscriptions sont actuellement fermées.",
    captchaFailed: "Vérification anti-robot échouée : réessayez.",
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
      young_child: "Jeune enfant (~6 ans)",
      preteen: "Pré-ado (~12 ans)",
      teen: "Ado (15 ans+)",
    },
    role: {
      owner: "Propriétaire",
      parent: "Parent",
      guardian: "Tuteur",
      child: "Enfant",
    },
    scheduleKind: {
      downtime: "Downtime / coucher",
      allowed: "Plages autorisées",
      blocked: "Plages interdites",
      school: "Mode École",
    },
    requestKind: {
      extra_time: "Temps supplémentaire",
      unblock_app: "Débloquer une app",
      reward: "Récompense",
      browse: "Accès à un site (Ask-to-Browse)",
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
      on_demand: "À la demande (check-in)",
      periodic: "Périodique (suivi de fond)",
    },
    youtubeMode: {
      off: "Désactivé",
      moderate: "Modéré",
      strict: "Strict",
    },
    domainAction: {
      blocked: "Bloqué",
      allowed: "Autorisé",
      rewritten: "Réécrit (SafeSearch)",
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
      adult: { label: "Contenu adulte", hint: "Pornographie et contenu explicite (C7)." },
      violence: { label: "Violence", hint: "Sites violents ou choquants." },
      gambling: { label: "Jeux d'argent", hint: "Paris, casinos, loteries." },
      drugs: { label: "Drogues", hint: "Vente / promotion de stupéfiants." },
      weapons: { label: "Armes", hint: "Vente d'armes." },
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
      harassment: { label: "Harcèlement", hint: "Insultes répétées, menaces, mise à l'écart." },
      grooming: { label: "Contact suspect", hint: "Motif de sollicitation par un contact inconnu (secret, rendez-vous…)." },
      sexual_content: { label: "Contenu sexuel", hint: "Sollicitation de photos / propos à caractère sexuel." },
      self_harm: { label: "Mal-être", hint: "Détresse, auto-agression, idées noires." },
      drugs: { label: "Drogues", hint: "Substances / produits illicites." },
    },
    // Autorisations Android surveillées (bannière de protection, LOT 8b).
    protection: {
      perm_usage_access: "Accès au temps d'écran",
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
      ruleAction: {
        free: "Libre",
        limit: "Limiter",
        block: "Bloquer",
        allow: "Autoriser",
        alwaysAllow: "Toujours autoriser",
      },

      timeLimits: {
        title: "Temps d'écran",
        today: "Aujourd'hui",
        // {used} = durée déjà formatée (ex. « 1 h 05 »), {limit} = minutes.
        usageOfLimit: "{used} / {limit} min",
        bonusToday: "+ {minutes} min de bonus aujourd'hui",
        presetsTitle: "Préréglages par âge",
        presetsHint: "Repères d'aide à la décision — ajustables ci-dessous à tout moment.",
        dailyLimitTitle: "Limite quotidienne (globale)",
        dailyLimitPlaceholder: "aucune",
        minutesPerDay: "minutes / jour",
        save: "Enregistrer",
        weekdayTitle: "Par jour de semaine (surcharge)",
        graceTitle: "Délai de grâce « encore 1 min »",
        graceToggle: "Autoriser une courte prolongation à l'atteinte d'un quota",
        graceDuration: "Durée (min)",
        graceUsesPerDay: "Fois / jour",
      },

      instantControl: {
        title: "Pause & verrouillage",
        intro: "Action <b>visible</b> par l'enfant, réversible. L'appel d'urgence (112) n'est jamais bloqué.",
        noDeviceTitle: "Aucun appareil appairé",
        noDeviceHint: "Appairez un appareil dans l'onglet Famille.",
        pause: "Pause",
        resume: "Reprendre",
        lock: "Verrouiller",
        ring: "Faire sonner",
        messagePlaceholder: "Message sur l'écran (ex. « À table ! »)",
        send: "Envoyer",
        recentCommands: "Dernières commandes",
        // Statut d'une commande envoyée à l'appareil.
        commandStatus: {
          pending: "En attente",
          delivered: "Délivrée",
          acked: "Acquittée",
          expired: "Expirée",
          cancelled: "Annulée",
        },
      },

      guards: {
        title: "Mode vacances & verrous",
        vacationTitle: "Mode vacances / pause de planning",
        vacationHint: "Suspend temporairement les plannings (horaires, Downtime, École). Reprise automatique à la fin.",
        vacationActive: "actif",
        // Libellés « Du [date] » / « Au [date] ».
        from: "Du",
        until: "Au",
        clear: "Effacer",
        installTitle: "Validation d'installation",
        blockNewApps: "Bloquer toute <b>nouvelle application</b> jusqu'à validation du parent",
        systemLockTitle: "Verrouillage des réglages système",
        systemLockToggle: "Empêcher la modification de l'heure, des comptes et des options développeur",
        systemLockHint: "Effectif en mode <b>Renforcé</b> (device owner).",
        ratingTitle: "Classification d'âge",
        ratingNone: "Aucune restriction",
        ratingHint: "niveau maximal autorisé",
      },

      categoryRules: {
        title: "Règles par catégorie",
        colCategory: "Catégorie",
        colToday: "Aujourd'hui",
        colRule: "Règle",
        colQuota: "Quota",
      },

      appRules: {
        title: "Règles par application",
        searchPlaceholder: "Rechercher une application…",
        newApps: "Nouvelles apps",
        newAppsWithCount: "Nouvelles apps <b>({count})</b>",
        emptyTitle: "Aucune application",
        emptyHint: "L'inventaire remonte depuis l'appareil enfant une fois la supervision active.",
        // {category} = catégorie de l'app, {duration} = durée d'utilisation formatée.
        categoryWithUsage: "{category} · {duration} aujourd'hui",
      },

      schedules: {
        title: "Plannings <note>(réutilisables entre enfants)</note>",
        intro: "Horaires autorisés/interdits (A4), Downtime/coucher (A5), mode École (A6). Assignez un planning à cet enfant via la case ; les fenêtres horaires s'éditent ci-dessous.",
        namePlaceholder: "Nom (ex. Nuit en semaine)",
        addSchedule: "Planning",
        emptyTitle: "Aucun planning",
        emptyHint: "Créez un premier planning (ex. Downtime du soir) puis assignez-le.",
        assigned: "Appliqué à cet enfant",
        noWindows: "Aucune fenêtre horaire.",
        // {days} = jours (ex. « Lun–Ven »), {start}/{end} = heures HH:MM.
        window: "{days} · {start}→{end}",
        rangeArrow: "→",
        removeWindow: "Supprimer ce créneau",
        kindLabel: "Type de planning",
        startLabel: "Début du créneau",
        endLabel: "Fin du créneau",
        addWindow: "Fenêtre",
      },
    },
    requests: {
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
    },
    filtering: {
      loading: "Chargement du filtrage…",

      // Carte « Filtrage du web » : interrupteur général, état VPN, préréglages
      status: {
        title: "Filtrage du web",
        intro: "Filtrage par <b>nom de domaine (DNS) sur l'appareil</b> — aucune inspection du contenu, aucun déchiffrement. Visible par l'enfant dans « mes données ».",
        enableToggle: "<b>Activer le filtrage</b> pour {name}",
        protectionTitle: "État de la protection",
        noDevice: "Aucun appareil n'a encore signalé l'état du filtrage. Il apparaîtra ici une fois le filtrage autorisé sur l'appareil enfant.",
        device: "Appareil",
        badgeDisabled: "désactivé",
        badgeUncertain: "état incertain",
        badgeActive: "actif",
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
        addButton: "Ajouter",
        invalidDomain: "Domaine invalide (ex. exemple.com).",
        allowTitle: "Liste blanche",
        allowEmpty: "Aucun domaine explicitement autorisé.",
        blockTitle: "Liste noire",
        blockEmpty: "Aucun domaine explicitement bloqué.",
        count: "({count})",
        // Règle créée suite à une demande Ask-to-Browse
        requested: "demandé",
        // Bouton icône (accessible) de retrait d'un domaine.
        remove: "Retirer {domain}",
      },

      // Journal des domaines (métadonnées)
      journal: {
        title: "Journal des domaines",
        subtitle: "(métadonnées)",
        // {count} = durée de conservation en jours (pluriel)
        intro: {
          one: "Domaine + catégorie + action + heure. <b>Jamais</b> d'URL complète, de requête ni de contenu. Conservé {count} jour (purge automatique).",
          other: "Domaine + catégorie + action + heure. <b>Jamais</b> d'URL complète, de requête ni de contenu. Conservé {count} jours (purge automatique).",
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
        title: "Sécurité ado — non applicable",
        intro: "L'analyse de bien-être sur l'appareil est <b>réservée au profil ado</b> (pré-ado / ado).",
        body: "Pour <b>{name}</b> (profil jeune enfant), cette fonction est <b>totalement désactivée</b> : aucun service d'analyse n'est actif et aucune permission n'est demandée. La protection passe par le <b>filtrage</b>, les <b>limites de temps</b> et la <b>localisation transparente</b>. Elle pourra être proposée, de façon transparente et co-consentie, lorsque l'enfant grandira (gradation par âge — CNIL/RGPD art. 8).",
      },

      // Réglages « mode ado » (K6), état de l'analyse, pause de confidentialité (K8)
      settings: {
        title: "Analyse de bien-être (sur l'appareil)",
        intro: "Le texte des notifications est analysé <b>sur le téléphone de {name}</b>. Vous ne recevez qu'une <b>alerte de catégorie</b> (ci-dessous) — <b>jamais</b> ses messages, jamais le texte. L'ado le voit dans « mes données » et peut la désactiver ou la mettre en pause.",
        enableToggle: "<b>Activer l'analyse</b> (nécessite le co-consentement de l'ado)",
        enableHint: "Désactivée par défaut (privacy by default). L'analyse ne tourne que si l'ado accorde aussi l'accès aux notifications sur son appareil.",
        mutualToggle: "<b>Visibilité mutuelle</b> (mode ado, K6) — l'ado voit ce que vous voyez",
        // {name} = prénom de l'ado ; {ago} = temps relatif (« il y a 5 min »)
        pauseNoticeSince: "<b>Pause de confidentialité active.</b> {name} a suspendu l'analyse (depuis {ago}). Vous voyez qu'une pause est en cours — <b>jamais</b> ce qu'elle masque (K8). C'est à l'ado de la lever.",
        pauseNotice: "<b>Pause de confidentialité active.</b> {name} a suspendu l'analyse. Vous voyez qu'une pause est en cours — <b>jamais</b> ce qu'elle masque (K8). C'est à l'ado de la lever.",
        statusTitle: "État de l'analyse",
        noDevice: "Aucun appareil n'a encore signalé l'état de l'analyse. Il apparaîtra ici une fois l'accès aux notifications accordé sur l'appareil de l'ado.",
        device: "Appareil",
        // Badges au féminin : « l'analyse »
        badgeInactive: "inactive",
        badgeUncertain: "état incertain",
        badgeActive: "active",
        cutAgo: "coupée {ago}",
        silentSince: "silencieuse depuis {ago}",
        lastSeen: "dernière nouvelle {when}",
        transparency: "Transparence : si l'ado retire l'accès (son droit), c'est signalé ici — jamais en cachette.",
      },

      // Tableau agrégé par catégorie (G6)
      categories: {
        title: "Par catégorie",
        subtitle: "(alertes de métadonnées)",
        intro: "Regroupement des signaux détectés sur l'appareil. <b>Aucun contenu</b> — seulement catégorie, gravité et compte.",
        emptyTitle: "Aucun signal",
        emptyHint: "Tant que rien n'est détecté, rien n'apparaît ici. C'est bon signe.",
      },

      // Journal des signaux (métadonnées seulement)
      signals: {
        title: "Signaux récents",
        subtitle: "(métadonnées)",
        intro: "Catégorie + gravité + application source + heure. <b>Jamais</b> le texte, l'extrait ou le message.",
        emptyTitle: "Aucun signal",
        emptyHint: "Les alertes de catégorie remonteront ici.",
        colCategory: "Catégorie",
        colSeverity: "Gravité",
        colApp: "Application",
        // Abréviation de « occurrences » (colonne étroite)
        colOccurrences: "Occur.",
        colWhen: "Quand",
        seen: "vu",
        markSeen: "Marquer vu",
      },

      // Ressources d'aide (V12)
      resources: {
        title: "Ressources d'aide",
        intro: "En cas de difficulté, ces services d'écoute et de signalement peuvent aider — vous et l'ado.",
        open: "Ouvrir le site",
      },
    },
    security: {
      history: {
        title: "Historique SOS",
        emptyTitle: "Aucun SOS",
        emptyHint: "Le bouton SOS est déclenché par l'enfant depuis son application. Un épisode apparaît ici avec sa position en direct.",
        colStatus: "Statut",
        colStart: "Début",
        colEnd: "Fin",
      },
      // Statut d'un épisode SOS
      sosStatus: {
        active: "Actif",
        acked: "Aide en route",
        resolved: "Clos",
      },
      banner: {
        title: "SOS — {status}",
        triggered: "Déclenché {ago} · {date}",
        triggeredWithMessage: "Déclenché {ago} · {date} · « {message} »",
        ackTitle: "Prévenir l'enfant que l'aide arrive",
        ackButton: "Aide en route",
        resolveButton: "Clôturer",
        // Popups de carte
        sosPositionLabel: "Position SOS · {date}",
        lastKnownBeforeSosLabel: "Dernière position connue avant le SOS · {date}",
        liveCaption: "Dernière position SOS {ago} · ±{accuracy} m",
        liveCaptionStreaming: "Dernière position SOS {ago} · ±{accuracy} m · diffusion en direct",
        noSosPositionCaption: "Pas encore de position SOS — dernière position connue {ago} · ±{accuracy} m",
        waitingFirstPosition: "En attente de la première position de l'appareil…",
      },
      settings: {
        title: "Partage de position",
        titleHint: "(adapté à l'âge)",
        youngChildAdvice: "Profil jeune enfant : le suivi périodique est adapté. Il reste visible de l'enfant (notification permanente).",
        teenAdvice: "Profil (pré)ado : privilégiez le check-in à la demande — plus respectueux de l'autonomie. L'enfant voit chaque partage.",
        modeLabel: "Mode de partage",
        modeOff: "Désactivé",
        modeOnDemand: "À la demande (check-in)",
        modeOnDemandRecommended: "À la demande (check-in) — conseillé",
        modePeriodic: "Périodique (suivi de fond)",
        modePeriodicRecommended: "Périodique (suivi de fond) — conseillé",
        frequencyLabel: "Fréquence",
        every5Min: "Toutes les 5 min",
        every15Min: "Toutes les 15 min",
        every30Min: "Toutes les 30 min",
        everyHour: "Toutes les heures",
        retentionLabel: "Conservation",
        retentionDays: "{days} jours",
        accuracyLabel: "Précision",
        accuracyBalanced: "Équilibrée (moins de batterie)",
        accuracyHigh: "Haute (GPS précis)",
      },
      zones: {
        title: "Zones de sécurité",
        titleHint: "(maison, école…)",
        addButton: "Ajouter une zone",
        emptyTitle: "Aucune zone définie",
        emptyHint: "Ajoutez la maison et l'école pour recevoir une alerte « bien arrivé » lors des trajets.",
        // {alerts} = une des valeurs notify* ci-dessous (ou vide)
        summary: "rayon {radius} m · {alerts}",
        summaryDisabled: "rayon {radius} m · {alerts} · désactivée",
        notifyEnter: "alerte arrivée",
        notifyExit: "alerte départ",
        notifyBoth: "alerte arrivée + alerte départ",
        disable: "Désactiver",
        enable: "Activer",
        edit: "Modifier",
        delete: "Supprimer",
        confirmDelete: "Supprimer « {name} » ?",
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
        radiusLabel: "Rayon : {radius} m",
        notifyEnter: "Alerte « bien arrivé »",
        notifyExit: "Alerte au départ",
        center: "Centre : {lat}, {lng}",
        save: "Enregistrer",
        create: "Créer la zone",
        cancel: "Annuler",
      },
      alerts: {
        title: "Alertes de sécurité",
        unseen: { one: "({count} non vue)", other: "({count} non vues)" },
        colAlert: "Alerte",
        colWhen: "Quand",
        lowBattery: "Batterie faible",
        lowBatteryLevel: "Batterie faible ({level}%)",
        seen: "vue",
        markSeen: "Marquer vue",
      },
    },
    location: {
      loading: "Chargement de la localisation…",
      checkInRequested: "Check-in demandé — la position arrivera dès que l'appareil répond.",
      transparency: {
        title: "Localisation transparente.",
        // <b> = mode de partage actuel
        // {count} = durée de conservation en jours (pluriel)
        body: {
          one: "Seules les positions de cette application sont partagées — jamais à l'insu de l'enfant : il voit dans « mes données » quand et comment sa position est transmise. Partage actuel : <b>{mode}</b>. Les positions sont conservées {count} jour puis supprimées.",
          other: "Seules les positions de cette application sont partagées — jamais à l'insu de l'enfant : il voit dans « mes données » quand et comment sa position est transmise. Partage actuel : <b>{mode}</b>. Les positions sont conservées {count} jours puis supprimées.",
        },
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
        requestCheckIn: "Demander un check-in",
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
        title: "Exporter les données de {name} <muted>(droit d'accès)</muted>",
        intro: "Télécharge au format JSON toutes les données enregistrées pour cet enfant (métadonnées et agrégats — jamais le contenu de tiers). L'export est journalisé dans l'audit, visible de l'enfant.",
        preparing: "Préparation…",
        button: "Télécharger l'export JSON",
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
    },
    family: {
      childrenTitle: "Enfants & appareils",
      noChildTitle: "Aucun enfant pour l'instant",
      noChildHint: "Ajoutez un profil, puis générez un code d'appairage pour son appareil.",
      noDevice: "Aucun appareil appairé.",
      // Badge d'un appareil appairé : {name} = nom/modèle, {mode} = libellé du mode.
      deviceBadge: "{name} · {mode}",
      deviceBadgeRevoked: "{name} · {mode} (révoqué)",
      childrenSubtitle: "Profils et appareils reliés à votre famille",
      childrenCount: { one: "{count} enfant", other: "{count} enfants" },
      devicesCount: { one: "{count} appareil appairé", other: "{count} appareils appairés" },
      noDevicePaired: "aucun appareil appairé",
      // {a} · {b} : résumé « 1 enfant · aucun appareil appairé »
      summary: "{children} · {devices}",
      age: { one: "{count} an", other: "{count} ans" },
      noDeviceTitle: "Aucun appareil appairé pour l'instant",
      noDeviceHint: "Installez l'application enfant sur l'appareil de {name}, ouvrez-la, puis saisissez le code d'appairage avant son expiration. L'appareil apparaîtra ici dès qu'il sera relié.",
      devicesTitle: "Appareils",
      // Mode d'appareil (valeurs de l'enum DeviceMode).
      deviceMode: {
        standard: "Standard",
        reinforced: "Renforcé",
      },

      // Journal d'audit : <muted>…</muted> = précision atténuée.
      auditTitle: "Journal d'audit",
      auditSubtitle: "Transparence : chaque action est tracée",
      auditEmpty: "Aucune activité.",

      addChild: {
        nameLabel: "Prénom de l'enfant",
        namePlaceholder: "Prénom",
        birthLabel: "Date de naissance",
        submit: "Ajouter l'enfant",
        title: "Ajouter un enfant",
        birthHint: "La date de naissance adapte automatiquement les protections à l'âge de l'enfant (profil « jeune enfant » / « préado » / « ado »). Elle est facultative.",
      },

      pairing: {
        modeStandard: "Standard",
        modeReinforced: "Renforcé (appareil dédié)",
        generate: "Générer un code d'appairage",
        title: "Appairage de l'appareil",
        hint: "Un code à usage unique relie l'appli enfant à cette famille.",
        modeLabel: "Mode",
        kicker: "Code d'appairage",
        // {time} = heure d'expiration (« 10:42 »).
        expiresAt: "Expire à {time} · usage unique",
        copy: "Copier",
        copied: "Copié",
        copyAria: "Copier le code d'appairage",
        copiedAnnounce: "Code d'appairage copié dans le presse-papiers.",
        copyFallback: "Copie impossible ici : sélectionnez le code pour le copier.",
      },
    },
    messages: {
      // {name} = prénom de l'enfant ; <muted>…</muted> = partie atténuée du titre.
      title: "Messages <muted>avec {name}</muted>",
      intro: "Messagerie interne, visible par l'enfant. On n'accède jamais à ses autres applications de messagerie.",
      emptyTitle: "Aucun message",
      emptyHint: "Écrivez un premier mot — il apparaîtra sur l'appareil de l'enfant.",
      // Horodatage d'un message du parent déjà lu par l'enfant ; {date} = date/heure.
      sentAtRead: "{date} · lu",
      placeholder: "Écrire un message…",
      send: "Envoyer",
    },
    overview: {
      tiles: {
        screenTimeToday: "Temps d'écran aujourd'hui",
        installedApps: "Applications installées",
        battery: "Batterie",
        // Niveau de batterie en pourcentage.
        batteryValue: "{level}%",
        freeStorage: "Stockage libre",
        charging: "En charge",
        notCharging: "Pas en charge",
        // {app} = nom de l'application ; {date} = date courte.
        lastInstalled: "Dernière installée : {app} · {date}",
      },
      last7Days: "7 derniers jours",
      noScreenTimeTitle: "Pas encore de données de temps d'écran",
      noScreenTimeHint: "Elles apparaîtront après l'activation de l'accès à l'usage sur l'appareil.",
      todayByCategory: "Aujourd'hui par catégorie",
      // Sous-titre au centre de l'anneau, sous la durée totale du jour.
      donutToday: "aujourd'hui",
      noActivityToday: "Aucune activité aujourd'hui",
      topAppsToday: "Applications les plus utilisées aujourd'hui",
      tilesLabel: "Indicateurs du jour",
      topAppsSubtitle: "Durées cumulées, sans aucun contenu consulté",
      seeAllApps: "Toutes les applications",
      categorySubtitle: "Répartition du temps d'écran",
      donutTotal: "au total",
      // {avg} = durée moyenne formatée (« 2 h 06 »)
      averagePerDay: "Temps d'écran quotidien · moyenne {avg} par jour",
      legend: {
        today: "Aujourd'hui",
        previousDays: "Jours précédents",
        overLimit: "Limite dépassée",
        dailyLimit: "Limite quotidienne",
      },
      // {value} = limite formatée (« 2 h 30 ») ; affichée à côté de la ligne.
      // <l>…</l> = mot mis sur sa propre ligne, au-dessus de la valeur.
      limitLabel: "<l>Limite</l> {value}",
      limitExceeded: {
        one: "Limite dépassée {count} fois sur ces 7 jours.",
        other: "Limite dépassée {count} fois sur ces 7 jours.",
      },
      limitNeverExceeded: "Limite quotidienne respectée sur ces 7 jours.",
      // Tendance par rapport à la veille ({duration} = écart formaté).
      trend: {
        less: "−{duration} vs hier",
        more: "+{duration} vs hier",
        same: "Comme hier",
      },
      transparency: {
        title: "Supervision active et visible sur l'appareil de {name}",
        titleNoDevice: "Aucun appareil relié pour {name} : rien n'est collecté",
        subtitle: "{name} voit à tout moment ce qui est partagé avec vous.",
        youSee: "Vous voyez",
        youNeverSee: "Vous ne voyez jamais",
        see: {
          usage: "Les durées d'utilisation par application et par catégorie",
          device: "L'état de l'appareil : batterie, stockage",
          calls: "Les appels : sens et durée — jamais le numéro en clair",
        },
        never: {
          content: "Le contenu des messages, des appels et des notifications",
          files: "Les photos, fichiers et saisies de {name}",
        },
        link: "Voir la page Confidentialité",
      },
      storage: {
        title: "Stockage de l'appareil",
        // {used}, {total}, {free} = tailles déjà formatées (« 12 Go »).
        used: "{used} utilisés sur {total}",
        free: "{free} libres",
      },
    },
    screenTime: {
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
    },
    applications: {
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
    },
    calls: {
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
    },
    charts: {
      // aria-label du graphique en anneau ; {total} = total déjà formaté (ex. « 2 h 35 »).
      donutAriaLabel: "Répartition : total {total}",
      // Infobulles au survol : <k>…</k> = libellé atténué, <v>…</v> = valeur mise en avant.
      tooltip: "<k>{label} · </k><v>{value}</v>",
      tooltipWithPercent: "<k>{label} · </k><v>{value}</v><k> ({pct}%)</k>",
      noData: "Aucune donnée.",
      // Description accessible d'un histogramme : liste « libellé : valeur ».
      point: "{label} : {value}",
      pointSeparator: " ; ",
    },
  },

  // Actions du journal d'audit → phrases lisibles.
  audit: {
    fallback: "Action",
    actions: {
      family_created: "Famille créée",
      pairing_code_created: "Code d'appairage généré",
      device_enrolled: "Appareil appairé",
      rgpd_export: "Export des données (RGPD)",
      rgpd_delete_child: "Suppression d'un profil enfant (RGPD)",
      rgpd_delete_family: "Suppression de la famille (RGPD)",
    },
  },

  // Ressources d'aide (V12) — services FRANÇAIS : à adapter par pays/langue.
  helpResources: {
    r3018: { contact: "3018 (appel/chat)", desc: "Cyberharcèlement et violences numériques (e-Enfance). Gratuit, anonyme." },
    r3114: { contact: "3114 (24h/24)", desc: "Souffrance psychique et prévention du suicide. Écoute par des soignants." },
    pharos: { contact: "internet-signalement.gouv.fr", desc: "Signalement officiel de contenus et comportements illicites en ligne." },
  },
} as const;

export default fr;
