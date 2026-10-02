# 10 — Installation familiale (sideload) — notice pas à pas

Cette notice s'adresse au **parent**, sans connaissance technique. L'app enfant n'est
**pas** distribuée sur le Play Store : on installe directement le fichier **APK** sur le
téléphone de l'enfant (« sideload »). La console parent est un site web.

> **Rappel transparence** (docs/02-CONFORMITE.md) : l'app est **visible** sur le téléphone
> de l'enfant, affiche une **notification de supervision permanente** et un écran
> **« mes données »**. Expliquez-la à votre enfant avant de l'installer. Le **112** reste
> toujours joignable.

---

## 0. Une seule fois : créer la clé de signature (indispensable pour les mises à jour)

Android n'accepte d'installer une mise à jour **par-dessus** l'app existante que si le
nouvel APK est signé avec **la même clé** que le précédent. Sans clé stable, le CI produit
un APK « DEBUG » dont la clé **change à chaque construction** : chaque mise à jour
obligerait à **désinstaller** l'app (et à refaire l'appairage).

Faites donc ceci **une fois**, sur un ordinateur où Java est installé. La commande
`keytool` est fournie avec Java. **Windows** : installez le JDK **Temurin 17**
(<https://adoptium.net>, cochez « Add to PATH »), ou utilisez celui d'Android Studio :
`"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"`.

> ⚠️ Travaillez dans un dossier **HORS du projet** (ex. `Documents/cle-controle-parental`),
> jamais dans le dossier du dépôt Git : la clé ne doit jamais être commitée.

1. Générer la clé (choisissez un **mot de passe long** et notez-le dans un gestionnaire
   de mots de passe). Commande sur **une seule ligne** :
   ```bash
   keytool -genkeypair -v -keystore controle-parental.keystore -alias controle-parental -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12
   ```
   Répondez aux questions (nom, ville… — valeurs libres), puis répondez **oui** (ou `yes`)
   à la confirmation finale. Avec le format PKCS12, le mot de passe de la clé est **le
   même** que celui du fichier.
2. Copier le fichier sous forme de texte (base64) **directement dans le presse-papier**
   (évite de laisser un fichier texte traîner) :
   - macOS : `base64 -i controle-parental.keystore | pbcopy`
   - Linux : `base64 -w 0 controle-parental.keystore | xclip -selection clipboard`
   - Windows (PowerShell) :
     `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\controle-parental.keystore")) | Set-Clipboard`
3. Sur GitHub, créer un **environnement** dédié qui détient la clé (seuls les builds de
   `main` et des tags `v*` y ont accès, jamais les PR) : dépôt → **Settings** →
   **Environments** → **New environment** → nom `release` → **Configure environment**.
   Dans **Environment secrets** → **Add environment secret**, créer ces **4 secrets**
   (noms exacts) :

   | Nom du secret | Valeur |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | coller le presse-papier (étape 2) |
   | `ANDROID_KEYSTORE_PASSWORD` | le mot de passe choisi |
   | `ANDROID_KEY_ALIAS` | `controle-parental` |
   | `ANDROID_KEY_PASSWORD` | le même mot de passe (PKCS12) |

   (Des secrets de dépôt — *Settings → Secrets and variables → Actions* — fonctionnent
   aussi, mais l'environnement `release` est plus sûr.)
4. **Sauvegardez** `controle-parental.keystore` + le mot de passe **hors de l'ordinateur**
   (clé USB, gestionnaire de mots de passe). **Ne le mettez jamais dans le dépôt Git.**
   Si vous perdez la clé, plus aucune mise à jour ne pourra s'installer par-dessus :
   il faudra désinstaller puis réinstaller l'app sur chaque téléphone.
5. Vérifier : onglet **Actions** → workflow **Build APK & console** → **Run workflow**
   (branche `main`) → à la fin, le job **« App enfant — release signé »** doit être vert
   et l'artefact **`apk-enfant-release-N`** doit contenir
   `controle-parental-enfant-release-vN.apk`.

Dès que les secrets existent, chaque build de `main` (et chaque tag `v*`) produit un APK
**release signé** (`controle-parental-enfant-release-vN.apk`). Tant qu'ils manquent, seul
l'APK `…-DEBUG-vN.apk` est produit et un avertissement jaune s'affiche ; un **tag `v*`
échoue** volontairement (une Release ne contient jamais d'APK DEBUG).

> Si vous avez déjà installé un APK DEBUG, la première installation de l'APK release
> exige de **désinstaller** l'APK DEBUG (clés différentes). Ensuite, toutes les mises à
> jour release s'installent par-dessus. **N'utilisez l'APK DEBUG que pour un essai.**

---

## 1. Télécharger l'APK

**Option A — Release (le plus simple, recommandé)** : pour publier une version, sur
GitHub : dépôt → **Releases** → **Draft a new release** → *Choose a tag* → taper
`v0.1.0` → **Create new tag** → **Publish release**. Le CI construit alors l'APK signé
et l'ajoute à la Release en quelques minutes. Ensuite : **Releases** → dernière version
→ fichier `controle-parental-enfant-release-vN.apk`. Pas d'expiration.

**Option B — Onglet Actions** : dépôt → **Actions** → workflow **Build APK & console** →
**dernier run vert (✓) sur la branche `main`** → section **Artifacts** en bas →
`apk-enfant-release-N` (ou `apk-enfant-DEBUG-N` pour un essai). GitHub le livre dans un
**.zip** : décompressez-le pour obtenir l'APK. (Connexion GitHub requise ; les artefacts
expirent après 90 jours.)

Pour transférer l'APK sur le téléphone de l'enfant : téléchargez-le directement depuis le
téléphone (navigateur), ou copiez-le par câble USB / Google Drive.

> Préférez toujours le fichier **release** quand il existe. N'installez que des APK venant
> de **votre** dépôt.

---

## 2. Installer l'APK sur le téléphone de l'enfant

1. Ouvrez le fichier APK (depuis *Téléchargements* ou le gestionnaire de fichiers).
2. Android demande d'**autoriser l'installation d'applis inconnues** pour l'application
   qui ouvre le fichier (Chrome, Fichiers, Drive…) : appuyez sur **Paramètres** → activez
   **Autoriser cette source** → revenez → **Installer**.
   Après l'installation, vous pouvez **désactiver** à nouveau cette autorisation
   (Paramètres → Applications → Accès spécial → Installer des applis inconnues).
3. **Google Play Protect** peut afficher « Application non reconnue » ou proposer
   d'**analyser** l'app : c'est normal, l'app ne vient pas du Play Store et Google ne la
   connaît pas. Choisissez **Plus de détails → Installer quand même** (ou **Envoyer pour
   analyse / Installer sans analyse**). Play Protect peut aussi la signaler plus tard :
   l'app demande des autorisations de supervision (c'est son rôle), et elle reste visible.
   Ne désactivez **pas** Play Protect globalement.

---

## 3. ⚠️ « Paramètres restreints » (Android 13 et plus)

Pour les apps installées **hors Play Store** depuis un navigateur ou un gestionnaire de
fichiers, Android bloque par défaut certaines autorisations sensibles. Sur **Android 15**,
la liste comprend notamment : **accès aux données d'usage**, **affichage par-dessus les
autres apps**, **administrateur de l'appareil** et l'**accès aux notifications**. Sur
Android 13/14, la restriction vise surtout l'**accessibilité** (que notre app n'utilise
pas) et l'**accès aux notifications**, mais certains constructeurs l'étendent.

Notre app a besoin de **l'accès à l'usage** (temps d'écran), de la **superposition**
(écran de blocage), en option de l'**administrateur d'appareil** (verrouillage), et — **pour
le profil ado uniquement** (LOT 6, `docs/11-LOT6-BIEN-ETRE.md`) — de l'**accès aux
notifications** (analyse de bien-être **sur l'appareil** ; voir §5). Cet accès aux
notifications est **précisément** l'un des paramètres restreints visés par Android 13+ :
l'interrupteur apparaît grisé tant que l'étape ci-dessous n'a pas été faite.
Symptôme : l'interrupteur est grisé, ou un message « Paramètre restreint — pour votre
sécurité, ce paramètre n'est pas disponible » apparaît.

**Marche à suivre** (à faire par le parent, une fois) :
1. Essayez d'abord d'activer l'autorisation (le message « Paramètre restreint » s'affiche :
   c'est ce qui débloque l'option suivante).
2. Ouvrez **Paramètres → Applications → Supervision familiale** (l'app enfant).
3. Appuyez sur le menu **⋮** (en haut à droite) → **Autoriser les paramètres restreints**
   → confirmez (code du téléphone).
4. Revenez dans l'app et accordez l'autorisation normalement.

> Astuce : une app installée par câble avec `adb install` (voir §6) n'est pas concernée
> par cette restriction.

---

## 4. Appairage

1. Sur la **console parent** (ordinateur) : onglet **Famille** → profil de l'enfant →
   laissez le mode sur **Standard** (par défaut ; **Renforcé** seulement si vous avez
   suivi le §6) → **Générer un code d'appairage** → un **code à 8 chiffres** s'affiche
   (valable **10 minutes**, usage unique).
2. Sur le téléphone de l'enfant, ouvrez l'app **Supervision familiale** → saisissez le code →
   **Valider**. L'app enregistre l'appareil et affiche l'écran **« mes données »**.
3. Une **notification permanente** « supervision parentale active » apparaît : elle doit
   rester visible (c'est volontaire, pour la transparence). Sur **Android 14 et plus**,
   Android permet de la balayer : la supervision **reste active** et l'écran « mes
   données » reste consultable.

---

## 5. Accorder les autorisations (une par une, avec l'enfant)

La plupart se gèrent depuis l'écran **« mes données »** de l'app, qui explique chaque
usage ; chaque bouton ouvre la bonne fenêtre ou le bon écran des Réglages. Exceptions :
les **notifications** (demandées au premier lancement), l'**administrateur de l'appareil**
et le **VPN permanent** (à régler dans les Paramètres Android, voir le tableau).

| Autorisation | Pourquoi | Comment |
|---|---|---|
| **Notifications** | Afficher la notification de supervision (transparence), les messages du parent, les alertes | Demandée au premier lancement → **Autoriser** |
| **Accès aux données d'usage** | Calculer le **temps d'écran** par application (agrégats, jamais le contenu) et appliquer les limites | Bouton → Réglages → *Accès aux données d'usage* → Supervision familiale → activer (voir §3 si grisé) |
| **Afficher par-dessus les autres apps** | Afficher l'**écran de blocage** quand une app est bloquée ou le temps dépassé (avec bouton « demander plus de temps » et **appel 112**) | Bouton → Réglages → activer (voir §3 si grisé) |
| **Localisation — pendant l'utilisation** | Position ponctuelle, zones (« bien arrivé »), **SOS** | Bouton → **Lorsque l'app est en cours d'utilisation** (+ *Position exacte*). Si la fenêtre n'apparaît pas (refus précédent) : **Paramètres → Applications → Supervision familiale → Autorisations → Position → Autoriser seulement si l'appli est en cours d'utilisation** + *Utiliser la position exacte* |
| **Localisation — tout le temps (arrière-plan)** | Relevés périodiques et zones même app fermée | Après la précédente : bouton → Réglages → **Toujours autoriser**. Android impose cette 2ᵉ étape séparée |
| **Connexion VPN (filtrage)** | Filtrage des sites par **nom de domaine** (DNS), **en local** sur le téléphone : aucun trafic détourné vers un serveur, aucun déchiffrement, aucun contenu lu | Bouton → fenêtre Android « Demande de connexion » → **OK**. Une **icône clé** reste visible dans la barre d'état |
| **VPN permanent** (recommandé) | Pour que le filtrage **redémarre tout seul** après un redémarrage du téléphone ou une mise à jour de l'app (sinon il faut rouvrir l'app) | **Paramètres → Réseau et Internet → VPN** → ⚙ à côté de *Supervision familiale* → activer **VPN permanent** (*Always-on VPN*). Ne cochez **pas** « Bloquer les connexions sans VPN » |
| **Journal d'appels** | Uniquement si la fonction a été **activée à la compilation** (désactivée par défaut) : qui/quand/durée, numéro **haché**, jamais le contenu | Bouton visible seulement si la fonction est active → **Autoriser** |
| **Accès aux notifications** (profil **ado** uniquement, optionnel) | Analyse de **bien-être / sécurité SUR L'APPAREIL** : repère des situations de danger (harcèlement, mal-être, contact suspect). Le parent ne reçoit qu'une **alerte de catégorie** — **jamais** le texte des notifications. Désactivé par défaut ; l'ado le voit et peut le couper/mettre en pause (K8). Rien pour le jeune enfant | Depuis « mes données » (section ado) → bouton → **Réglages → Accès aux notifications → Supervision familiale → activer** (voir §3 : **paramètre restreint** sur app sideloadée) |
| **Administrateur de l'appareil** (optionnel) | Verrouiller l'écran à distance (« verrouiller maintenant ») | Paramètres → Sécurité → *Applis d'administration de l'appareil* → Supervision familiale → activer (voir §3) |

Conseils :
- **Batterie** : si le téléphone coupe l'app en arrière-plan (Xiaomi, Huawei, Samsung…),
  réglez **Paramètres → Applications → Supervision familiale → Batterie → Sans restriction**.
- Vous pouvez à tout moment vérifier l'état de chaque autorisation dans « mes données ».

---

## 6. Mode Renforcé (optionnel, utilisateurs avancés)

Le mode **Renforcé** rend l'app **propriétaire de l'appareil** (*device owner*) : blocage
d'apps par suspension et réglages protégés (date/heure, comptes, options de
développement). L'app reste visible.

> ⚠️ **À lire avant de commencer**
> - Le mode Renforcé **ne peut être retiré que par une réinitialisation d'usine** (l'app
>   ne propose pas de le désactiver).
> - **N'activez JAMAIS le mode Renforcé avec un APK DEBUG** : passer ensuite à l'APK
>   release (autre clé) imposerait une réinitialisation d'usine. Utilisez uniquement
>   l'APK **release signé**.
> - Quand « verrouiller les réglages » est actif, le **débogage USB est bloqué** : `adb`
>   ne fonctionne plus (mises à jour à faire en ouvrant l'APK sur le téléphone, §7).

**Conditions** : le téléphone doit être **réinitialisé** et **sans aucun compte**
(*Paramètres → Comptes* doit être vide, tous types confondus : Google, Samsung, Xiaomi…),
et il faut un ordinateur avec les **platform-tools** Android
(<https://developer.android.com/tools/releases/platform-tools>, dézipper puis ouvrir un
terminal dans le dossier).

1. Réinitialiser le téléphone, passer l'assistant **sans ajouter de compte**.
2. Activer les **Options pour les développeurs** (Paramètres → À propos → appuyer 7 fois
   sur *Numéro de build*) → activer **Débogage USB**.
3. Brancher le téléphone, accepter « Autoriser le débogage USB » sur le téléphone, puis
   sur l'ordinateur vérifier qu'il est reconnu :
   ```bash
   adb devices
   ```
   Le téléphone doit apparaître avec l'état **`device`** (`unauthorized` = accepter la
   fenêtre sur le téléphone ; rien = changer de câble / port USB).
4. Installer et activer :
   ```bash
   adb install controle-parental-enfant-release-vN.apk
   adb shell dpm set-device-owner fr.controleparental.child/.service.AdminReceiver
   ```
   Réponse attendue : `Success: Device owner set to package …`.
   Erreurs courantes : *« there are already some accounts on the device »* → un compte
   existe encore (Paramètres → Comptes, le supprimer) ; *« already several users »* →
   supprimer les autres utilisateurs / profils (Paramètres → Utilisateurs, espace
   sécurisé Samsung…) ; *« device is already provisioned »* → réinitialiser à nouveau.
5. Ajouter ensuite le compte Google de l'enfant, puis faire l'appairage (§4, mode
   **Renforcé**) et les autorisations (§5).
6. Désactiver le **Débogage USB**.

---

## 7. Mettre à jour l'app

1. Téléchargez le **nouvel APK release** (§1) : son numéro `vN` doit être **plus grand**
   que celui installé (Android refuse une version plus ancienne). La version installée
   s'affiche dans **Paramètres → Applications → Supervision familiale** (en bas :
   « version 0.1.0 (build N) »).
2. Ouvrez-le sur le téléphone → **Mettre à jour**. Les données, l'appairage et les
   autorisations sont **conservés**.
3. **Rouvrez l'app** une fois et vérifiez l'**icône clé** du filtrage dans la barre
   d'état (inutile si le **VPN permanent** est activé, §5).
4. Si Android répond « **Application non installée** » / « conflit de package » : comparez
   d'abord le `vN` (un numéro plus petit est refusé). Si le numéro est bien plus grand,
   l'APK n'est pas signé avec la même clé (ex. passage DEBUG → release, ou clé perdue) :
   il faut alors désinstaller l'ancienne version puis réinstaller (et refaire
   l'appairage). Si l'app est **propriétaire de l'appareil** (mode Renforcé), elle ne peut
   pas être désinstallée : passer de DEBUG à release impose une **réinitialisation
   d'usine**.

---

## 8. Désinstaller / transparence

- L'enfant voit **toujours** que l'app est installée (icône, notification permanente,
  icône clé du VPN, écran « mes données »). Rien n'est caché.
- **Désinstaller** : Paramètres → Applications → Supervision familiale → **Désinstaller**.
  Si l'administrateur d'appareil est actif, désactivez-le d'abord (Paramètres → Sécurité →
  Applis d'administration). En mode Renforcé, seule une **réinitialisation d'usine**
  retire l'app.
- **Couper le VPN** de filtrage est **signalé** : au parent dans la console et à l'enfant
  par une notification — jamais en cachette.
- Le **retrait des autres autorisations** (usage, superposition, localisation…) est
  visible dans l'écran « mes données », mais **n'est pas encore signalé automatiquement**
  au parent (prévu dans un lot ultérieur) : vérifiez-le de temps en temps avec l'enfant.
- Les données côté serveur se suppriment depuis la console parent (droit à l'effacement).

---

## 9. Console parent (site web)

Le CI publie le site prêt à l'emploi en artefact **`console-parent-dist-N`** (et
`console-parent-dist.zip` dans les Releases). L'URL Supabase et la **clé publiable** y sont
intégrées : elles sont **publiques par conception** (la sécurité repose sur la RLS côté
base). La clé `service_role` n'y figure **jamais**.

Trois options simples et gratuites (aucune n'est imposée) :

1. **Netlify Drop** — <https://app.netlify.com/drop> : décompresser l'artefact puis
   glisser-déposer **le dossier qui contient `index.html`** → une URL
   `https://….netlify.app` est créée.
2. **Cloudflare Pages** — tableau de bord → *Workers & Pages* → *Create* → *Pages* →
   *Upload assets* → déposer **le dossier qui contient `index.html`**.
3. **Vercel** — importer le dépôt (dossier racine `apps/parent-web`, commande
   `npm run build`, sortie `dist`) et définir les variables `VITE_SUPABASE_URL` et
   `VITE_SUPABASE_ANON_KEY` (valeurs dans `SETUP.md`).

Ou **en local**, sans hébergement :
```bash
cd apps/parent-web
cp .env.example .env.local   # URL + clé publiable (SETUP.md)
npm ci && npm run build && npm run preview   # → http://localhost:4173
```

Après mise en ligne, ajoutez l'URL du site dans Supabase → **Authentication → URL
Configuration** (*Site URL* / *Redirect URLs*) pour que la connexion par e-mail fonctionne.
