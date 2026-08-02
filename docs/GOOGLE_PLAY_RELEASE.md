# Publication Google Play / TWA

État du guide : **préparation technique**, mis à jour le 30 juillet 2026.

Ce dépôt contient une PWA. La voie Android retenue est une Trusted Web Activity
construite avec Bubblewrap, pas une WebView personnalisée.

## Ce qui est prêt

- manifeste PWA, icônes `any` et `maskable`, captures larges et étroites ;
- orientation paysage et affichage plein écran ;
- service worker et ressources de jeu hors-ligne ;
- politique de confidentialité : `/privacy.html` ;
- support : `/support.html` ;
- crédits et non-affiliation : `/credits.html` ;
- kit boutique contrôlé dans `assets/store/google-play/` : icône 512 × 512,
  bannière 1024 × 500, deux captures PNG 2560 × 1440 et textes `fr-FR` ;
- identifiant Android proposé : `com.oshinsu.yolebwabrawl` ;
- cible Android proposée : API 36.

`npm run check:play-assets` valide la partie préparable sans console. La
commande stricte `npm run check:play` reste rouge tant que les valeurs externes
ci-dessous manquent ; ce rouge est volontaire et empêche un faux AAB
« publiable ».

## Valeurs qui ne doivent pas être inventées

Les deux fichiers dans `twa/` sont des **templates non publiables**. Avant de
générer l'Android App Bundle :

1. choisir et figer le domaine HTTPS final ;
2. remplacer `REPLACE_WITH_FINAL_HTTPS_HOST` ;
3. activer Play App Signing ;
4. récupérer dans Play Console l'empreinte SHA-256 du **certificat de signature
   de l'application**, pas seulement celle de la clé d'upload ;
5. remplacer
   `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT` ;
6. publier le contenu validé de `twa/assetlinks.template.json` à l'adresse
   exacte `https://DOMAINE/.well-known/assetlinks.json` ;
7. contrôler cette URL sans redirection et avec un type JSON.

Tant que ces valeurs ne sont pas connues, aucun `assetlinks.json` factice ne
doit être déployé. Une association invalide ferait retomber l'application dans
un Custom Tab avec sa barre de navigateur.

L'URL GitHub Pages actuelle est un site de projet sous
`oshinsu.github.io/yole-bwa-brawl/`. Or Digital Asset Links se vérifie à la
racine de l'origine, donc `https://oshinsu.github.io/.well-known/assetlinks.json`.
Pour une TWA fiable, il faut soit contrôler le site Pages racine de cette
origine, soit brancher un domaine personnalisé dont la racine peut servir
`.well-known/assetlinks.json`.

## Ordre opératoire

1. Créer ou vérifier le compte Play Console.
2. Figer domaine, nom d'application et identifiant de package.
3. Installer Bubblewrap dans un environnement Android propre.
4. Initialiser le projet depuis l'URL publique de `manifest.webmanifest`.
5. Reporter les valeurs validées du template et cibler API 36.
6. Générer un `.aab` de test et activer Play App Signing.
7. Déployer `assetlinks.json` avec l'empreinte Play.
8. Vérifier la TWA sur un vrai téléphone Android, en ligne puis hors-ligne.
9. Renseigner la fiche, la classification, la politique de confidentialité et
   le formulaire Data Safety conformément au comportement réel.
10. Lancer le test interne puis le test fermé requis par le type de compte.

Pour un compte personnel créé après le 13 novembre 2023, l'accès à la
production exige actuellement au moins **12 testeurs inscrits sans interruption
pendant 14 jours** au test fermé. Ce délai est une étape Play Console, pas un
problème technique du jeu.

## Vérifications avant production

- aucun placeholder `REPLACE_WITH_` restant ;
- adresse e-mail publique du développeur renseignée dans la fiche ;
- démarrage sans barre de navigateur ;
- retour Android et reprise après arrière-plan ;
- rotation paysage et affichage bord à bord ;
- première visite avec réseau, puis démarrage hors-ligne ;
- son relancé après retour d'arrière-plan ;
- progression, replayothèque et atelier conservés après mise à jour ;
- page de confidentialité et support accessibles sans lancer WebGL ;
- aucun SDK de publicité ou d'analyse ajouté sans mise à jour préalable de la
  politique et de Data Safety ;
- assets de boutique issus du vrai jeu, sans logos ou sponsors réels.

À partir du 31 août 2026, les nouvelles applications et mises à jour Google
Play généralistes doivent cibler Android 16 / API 36. Le template est déjà
calé sur cette cible.

## Références officielles

- TWA :
  <https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities>
- Bubblewrap :
  <https://developer.chrome.com/docs/android/trusted-web-activity/quick-start>
- Exigences de test des nouveaux comptes personnels :
  <https://support.google.com/googleplay/android-developer/answer/14151465?hl=fr>
- API cible :
  <https://developer.android.com/google/play/requirements/target-sdk?hl=fr>
- Data Safety :
  <https://support.google.com/googleplay/android-developer/answer/10787469?hl=fr>
