# Protocole de playtest — dix joueurs, trois téléphones, une décision

> Pourquoi ce document existe. Le `MASTER_PLAN` fixe des portes Go/No-Go
> (70 % de premières contre-gîtes réussies, 50 % de secondes manches, manche
> < 75 s, replay vu, défi partagé) et le P0 de `NEXT_PRODUCTION_STEPS.md`
> demande de valider le jeu « sur du matériel réel et des joueurs réels ».
> Jusqu'ici rien ne permettait de le mesurer : la télémétrie était remise à
> zéro à chaque partie et ne quittait jamais l'appareil. Le bouton
> **ENVOYER MON RAPPORT DE TEST** et l'agrégateur `tools/playtest_aggregate.mjs`
> ferment cette boucle. Ce protocole dit comment s'en servir.

## Ce qu'un rapport contient — et ne contient pas

Le rapport est un JSON produit sur l'appareil, **uniquement quand le joueur
appuie sur le bouton** (écran de résultat, ou pause). Il porte :

- l'appareil : GPU (chaîne du pilote), fenêtre, densité de pixels, pointeur
  tactile ou souris, langue, installation PWA ;
- le rendu : palier LQ/MQ/HQ atteint, manuel ou automatique, intervalle entre
  images p50/p95, temps de travail par image, part d'images longues ;
- les portes Go/No-Go de la session, déjà calculées ;
- les compteurs de jeu (parties, manches, contre-gîtes, takedowns, armes,
  éliminations par famille) ;
- une queue des 400 derniers événements de télémétrie, horodatés en
  millisecondes depuis le début de la session.

Il ne porte **ni nom, ni adresse, ni identifiant de compte** : il n'y en a pas
dans le jeu. `privacy.html` le déclare. Le résumé texte joint au partage est
lisible par un humain et suffit pour un premier tri.

## Matériel

Trois téléphones **réels**, pas des émulateurs — c'est tout l'objet :

| Poste | Cible | Pourquoi |
|---|---|---|
| A | Android milieu de gamme, 3 à 4 ans (Mali ou Adreno 6xx) | le palier LQ est fait pour lui |
| B | Android récent | valide MQ/HQ mobile et la remontée automatique |
| C | iPhone (Safari) | WebGL2, audio et installation se comportent autrement |

Un ordinateur portable en plus, pour un témoin clavier.

## Recrutement

Dix personnes qui **n'ont jamais vu le jeu**. Mélanger : deux qui jouent
beaucoup sur téléphone, deux qui n'y jouent jamais, deux qui connaissent la
yole ronde, quatre au hasard. Une seule séance par personne, 20 minutes,
seule face à l'écran, l'organisateur derrière et muet.

## Déroulé d'une séance (20 min)

1. **0 min** — ouvrir l'URL publique sur le téléphone du poste, en paysage.
   Ne rien expliquer. Dire seulement : « Joue comme tu veux, dis à voix haute
   ce que tu penses. Tu peux arrêter quand tu veux. »
2. **0 à 12 min** — laisser faire. Noter à la main, horodaté :
   - le moment où la personne comprend la contre-gîte (elle le dit, ou elle
     l'exécute au bon moment) ;
   - la première fois qu'elle relance une manche ou une partie de son plein
     gré ;
   - chaque phrase de confusion (« pourquoi j'ai perdu ? », « c'est quoi ce
     bouton ? »).
3. **12 min** — si elle n'y est pas allée seule, proposer : « Il y a un
   défi du jour et une replayothèque dans le menu, si tu veux. » Noter si
   elle regarde un replay ou partage un défi.
4. **17 min** — trois questions, réponses notées mot pour mot :
   - « Qu'est-ce qui te fait chavirer ? »
   - « À quoi sert le bouton du milieu ? » (contre-gîte)
   - « Tu y rejouerais demain ? Pourquoi ? »
5. **19 min** — demander d'appuyer sur **ENVOYER MON RAPPORT DE TEST**
   (écran de résultat, ou pause puis le bouton sous AIDE & CONTRÔLES) et de
   l'envoyer dans le groupe de test ou par mail. Sur iPhone, la feuille de
   partage propose le fichier ; sur Android aussi ; à défaut le rapport est
   copié dans le presse-papiers.

## Collecte et agrégation

Ranger les fichiers reçus dans un dossier, un sous-dossier par poste :

```text
playtests/2026-09/
  A-android-milieu/  joueur-01.json  joueur-02.json ...
  B-android-recent/  ...
  C-iphone/          ...
```

Puis :

```bash
npm run playtest:aggregate -- playtests/2026-09 --markdown playtests/2026-09/RAPPORT.md
```

La table sort avec, par porte : la mesure agrégée, le seuil du plan, le
verdict et l'effectif. Les seuils sont ceux de `PLAYTEST_GATES` dans
`src/game/playtest-report.js` — une seule table de vérité, la même que celle
qui étiquette chaque rapport individuel.

## Décision

| Résultat | Décision |
|---|---|
| Les trois portes principales passent (contre-gîte, seconde manche, durée) | le cœur tient : passer aux portes sociales (replay, partage) et au réseau asynchrone |
| La contre-gîte passe mais pas la seconde manche | la boucle est comprise mais ne retient pas : travailler la revanche, le fantôme, le défi — pas la physique |
| La contre-gîte échoue (< 70 %) | c'est le pilier du jeu qui vacille : revoir l'initiation et le retour du bouton **avant** tout autre chantier, y compris visuel |
| p50 > 33 ms sur le poste A en LQ | le palier bas ne tient pas : chantier performance prioritaire sur l'art |

Les notes manuscrites comptent autant que les JSON : une porte qui passe avec
des joueurs qui disent « je ne comprends pas pourquoi j'ai perdu » ne passe
pas vraiment.

## Ce que ce protocole ne fait pas

- Il ne remplace pas une mesure de rétention D1/D7 : dix personnes en une
  séance ne disent rien du retour le lendemain. Le fantôme et le défi du jour
  sont là pour ça ; leur effet se mesurera sur la durée.
- Il ne collecte rien automatiquement. Si un jour un point de collecte est
  ajouté (Railway ou autre), `privacy.html` devra le dire **avant** le premier
  envoi, et le bouton devra rester opt-in.
