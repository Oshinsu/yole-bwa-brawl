# Rapport de validation — YOLE: BWA BRAWL Tropical Mayhem V3.2

## Passe 83 — le bourg

Validation du 2 septembre 2026 :

- `npm run verify` : **OK** ; **185 fichiers précachés** (182 + les trois
  modèles) ; smoke navigateur sans erreur console ni page ;
- **les quatre checksums sont inchangés** (`017e9fdc`, `05b2f763`, `2b887431`,
  `fee31c05`) : le semis tire sur un RNG dédié et n'ajoute aucun collider ;
- `test/bourg.test.mjs` : 16 côtes × 3 graines, **1 054 pièces** mesurées,
  débord maximal **−0,36 m** hors de l'enveloppe de plage (donc toutes à
  l'intérieur, emprise du modèle comprise), distance minimale à l'axe de course
  **38 m**, autant de pontons que de gommiers, semis déterministe ;
- poids ajouté : **269 Ko** pour les trois modèles, soit +2,7 % du précache ;
- captures en jeu sur trois arènes : cases à toit rouge sur la pente, gommier
  tiré sur le sable, ponton sur la grève ; 19 à 24 cases, 6 à 10 gommiers et
  pontons affichés, pour **trois appels de dessin**.

### Ce qui n'est pas vérifié ici

- le rendu du bourg sur téléphone réel ;
- le sable, l'horizon et la silhouette des îlots, jugés insuffisants par le
  propriétaire sur ces mêmes captures — objet de la passe suivante.


## Passe 82 — Meshy 7 sur le décor, et le rocher procédural

Validation du 2 septembre 2026 :

- `npm run verify` : **OK** ; 182 fichiers précachés ; smoke navigateur sans
  erreur console ni page ; benchmark 149 461 pas bateau/s ;
- **les quatre checksums sont inchangés** (`017e9fdc`, `05b2f763`, `2b887431`,
  `fee31c05`) : la géométrie du rocher est construite une fois, sur une graine
  CONSTANTE, hors de tout flux RNG contractuel ;
- charge de rendu re-mesurée en course (1280×720) : 212 300 triangles en HQ
  contre 209 852 avant, soit **+2 448** — 17 rochers visibles, pas 96 — et
  **173 appels de dessin, inchangés** ;
- quatre générations Meshy 7 mesurées et rendues côte à côte avec les
  géométries du jeu, mêmes matériaux et mêmes lumières : roches à 417, 418 et
  307 triangles, palme à 68 ;
- `test/mock-three.module.js` expose `IcosahedronGeometry`, et
  `makeRockGeometry` rend la géométrie telle quelle quand le moteur simulé la
  livre creuse — les suites qui montent un `Game` complet passent sans toucher
  au rendu.

### Ce qui n'est pas vérifié ici

- l'aspect du rocher sur téléphone réel, à la distance de jeu ;
- une génération Meshy à partir d'une planche de référence plutôt que d'un
  texte : l'évaluation du 12 août montre que l'alignement y est bien meilleur,
  et ce test n'a porté que sur du texte.


## Passe 81 — les repères posés sur le relief

Validation du 2 septembre 2026 :

- `npm run verify` : **OK** ; 182 fichiers précachés ; smoke navigateur sans
  erreur console ni page ;
- **les quatre checksums sont identiques à la passe 80** (`017e9fdc` simulation,
  `05b2f763` Combat Box, `2b887431` première étape du Tour, `fee31c05` cadence) :
  la passe est purement visuelle, aucune île n'a bougé ;
- `test/landmarks.test.mjs` (dans `npm run test:world`) : 8 étapes + 8 arènes,
  4 graines chacune, **172 bâtis** mesurés contre le sol lu au rayon. Lancé sur
  l'ancien code il échoue dès l'étape 1 du Tour (« bâti de 13 m enterré dans un
  morne de 12 m — il n'en sort que 3,1 m ») ;
- captures avant/après des huit repères d'arène relues : la ville de
  Fort-de-France est passée d'invisible à une façade au bord de l'eau, le phare
  de la Caravelle d'invisible à 56 m de haut, les mâts de Sainte-Anne d'invisible
  à cinq mâts sur la plage ;
- mesure de charge de rendu en course (1280×720, atelier Playwright) :
  173 appels de dessin et 209 852 triangles en HQ, 154 et 157 127 en LQ — dont
  50 460 triangles et 41 appels pour le décor. C'est le budget de référence pour
  la passe de modèles qui suit.

### Ce qui n'est pas vérifié ici

- la lecture des repères sur téléphone réel ;
- l'aspect des bâtis eux-mêmes, qui restent des primitives (boîtes, cylindres,
  cônes) : c'est l'objet de la passe de modèles.


## Passe 80 — huit arènes pour la Combat Box

Validation du 1er septembre 2026 :

- `npm run verify` : **OK** en 138 s ; 182 fichiers précachés ; smoke navigateur
  sans erreur console ni page ; benchmark 142 472 pas bateau/s ;
- checksums : scénario de simulation pure **identique** (`017e9fdc`), première
  étape du Tour **identique** (`2b887431`) — la côte du Tour n'a pas bougé
  d'un tirage ; scénario Combat Box du smoke complet `3287b0ad` → `05b2f763`,
  attendu et voulu : la Combat Box court désormais sur une arène (côte, houle,
  vent), d'où le passage de `GAMEPLAY_VERSION` à `tropical-mayhem-v3-15-arenes` ;
  même raison pour le scénario de cadence (`7617385f` → `fee31c05`), dont les
  trois cadences restent d'accord entre elles (`framerateOk: true`) ;
- `test/world-collision.test.mjs` étendu : 8 étapes + 8 arènes, **121 380
  contacts** résolus sans pénétration, axe de course libre partout, caméra hors
  relief, garantie conservée après recyclage, sept archétypes couverts ;
- `test/arenas.test.mjs` (dans `npm run test:world`) : catalogue (slugs uniques,
  palettes, eau, repère, signature de mer bornée), résolution (`auto`, vide,
  inconnu → `null`), rotation qui couvre les huit cartes pour six graines, côte
  déterministe, seconde rangée présente aux passes et aux cayes et absente des
  huit étapes du Tour, lien de défi (`&arena=` en Combat Box seulement),
  payload de replay ;
- en navigateur headless (Playwright, atelier `scratch`) : les huit arènes se
  chargent avec leur archétype, leur repère et leur signature (20 à 31 îlots,
  9 pour la haute mer du Diamant), aucune erreur de page ; réglage ARÈNE de la
  pause : AUTO → huit libellés → AUTO, CAYES choisi court sur les cayes à la
  partie suivante, AUTO enchaîne deux cartes différentes ; le nom de l'arène
  s'affiche sous le 3-2-1 ;
- captures des huit arènes (vue large et vue de jeu) relues : mangrove verte et
  basse, cayes blanches sur eau turquoise, pitons sombres de la Caravelle,
  double rangée d'îlets, mornes noirs sous la Pelée, haute mer autour du Rocher ;
- `test/crew-seating.test.mjs` court désormais sur une arène fixée (baie des
  Flamands, vent et houle à 1,0) : il mesure la pose de l'équipage, pas la
  météo d'une carte — sur le lagon (vent 0,94) l'occupation hors coque tombait à
  44,4 % pour un plancher à 45 %.

### Ce qui n'est pas vérifié ici

- l'équilibre de jeu carte par carte (durée des manches, taux d'élimination) :
  les signatures de mer sont bornées à ±10 % de vent, mais seul un playtest les
  départagera — voir `docs/PLAYTEST_PROTOCOL.md` ;
- le rendu des nouvelles côtes sur téléphone réel.


## Passe 79 — les jambes de l'équipage

Validation du 1er septembre 2026 — deux livraisons, la seconde après le
retour du propriétaire sur la première (« c'est n'importe quoi ») :

- `npm run verify` : **OK** en 114 s, les deux fois ; 182 fichiers précachés ;
  smoke navigateur sans erreur console ni page ; benchmark 149 908 puis
  136 853 pas bateau/s (bruit de machine, la simulation n'a pas bougé) ;
- checksums de simulation **identiques** à la passe 78 (`017e9fdc` sur
  18 000 ticks, `2b887431` pour la première étape du Tour, `7617385f` pour la
  cadence) : la passe est purement visuelle ;
- nouvel outil `tools/mesure_jambes_equipage.mjs` (mode `--strict` dans
  `npm run test:crew`), qui lit hanche, genou, cheville et pied sur le GLB livré
  dans le repère de la yole. Avant : genoux à 95-127° au rappel, bassin 16-21 cm
  sous l'axe du bois, pieds crochetés 5-16 cm au-dessus. Après : ancrage et
  extension genou 0° couchés le long de la perche (pied posé dessus, 67 cm vers
  la coque), levier genou 8° pendu à la verticale (pied 57 cm sous le bois),
  ancrage à mi-sortie pied au plat-bord (−3 cm) genoux à 68-77° en appui ;
- `test/crew-legs.test.mjs` : grammaire des quatre poses, autorité de la pose,
  assise constante — OK ;
- suites équipage existantes (`crew-staging`, `crew-seating`,
  `crew-animation-v2`, `crew-pole-target`, `crew-clips`, `crew-weight-spring`,
  silhouette stricte) : OK sans retouche de seuil — le bassin ↔ bois reste à
  ±0,0 cm, les bras et le regard n'ont pas bougé ;
- captures `previews/equipage/01…06` régénérées (`tools/capture_crew_pose.py`)
  : hommes allongés le long des perches, hommes assis à cheval jambes tendues
  vers l'eau, plus aucun genou replié ni talon crocheté ;
- **tronc (79 bis)** : mesuré en jeu à 24° de gîte par captures Playwright,
  os du GLB lus dans le monde — avant : bassin → épaules à 75°, 80°, 117°,
  33°, 94°, 61° depuis la verticale (un homme tête en bas) ; après : assis
  42°, pieds au plat-bord 52°, allongé 56° (= 90 − 10 − 24), cassure
  bassin/épaules/tête de 5 à 16°. Harnais à plat (table TRONC de
  `tools/mesure_jambes_equipage.mjs`) : 42/52/80°, cassure 3-11° ;
- silhouette stricte tenue après le tronc : buste 44-51°, regard +0,14 à
  +0,84, bassin ↔ bois ±0,0 cm ; `crew-animation-v2` avec un mannequin aux
  bras du GLB (59 cm, au repos le long du corps) : erreur de contact 0,001 m ;
- bouton RECOMMENCER du panneau spectateur : vérifié bout en bout en
  navigateur headless — caché avant l'élimination, visible dès `eliminated`,
  un clic relance la partie (compte à rebours à 3,55 s, joueur vivant, bouton
  à nouveau caché), aucune erreur de page.

### Ce qui n'est pas vérifié ici

- la lecture à distance de jeu sur téléphone réel ; les captures d'atelier et la
  vue de jeu du harnais sont les seuls cadrages mesurés ;
- le tronc à d'autres gîtes que 24° (captures) et 30° (previews) : la table
  TRONC du harnais est à plat, la vérité de la gîte se lit en jeu.


## Passe 78 — bouton unique, portrait, écriteaux, coup d'envoi sans gel

Validation du 1er septembre 2026 :

- `npm run verify` : **OK** en 147 s sur 111 modules JavaScript et 49 fichiers
  Python ; cache PWA `c720fe50fd6e`, 182 fichiers précachés ; benchmark
  145 876 pas bateau/s ;
- `tools/check_demarrage.py` (Chromium SwiftShader, 260 images) : images ayant
  compilé un shader **9 → 6**, temps cumulé sur ces images **3 076 → 1 213 ms**,
  dernière compilation à l'image 104 dans les deux cas, mais les +17/+14
  programmes du coup d'envoi ont disparu ;
- diff des programmes (`renderer.info.programs`) : rebours **0 → 31**
  compilations (déplacées sous le 3-2-1), coup d'envoi **2 → 4**, premier coco
  **18 → 2**, 400 ticks suivants **38 → 4** ; lumières ponctuelles dans la scène
  **18 → 0** ;
- replay de la première étape du Tour : `59947b1d` sur 5 821 ticks, identique
  à `BUILD_INFO.json` — retirer des lumières et compiler plus tôt ne touche pas
  la simulation ;
- suites `test:hud`, `test:input`, `test:ui`, `test:touch`, `test:game`,
  `test:combat`, `test:fun`, `test:versus`, `test:elimination`,
  `test:handling-render`, `test:ghost`, `test:playtest` : OK après la refonte
  du rail et des écriteaux ;
- après rebasage sur les quatre commits du propriétaire du 14 au 16 août
  (PWA réseau d'abord, touche 3 pour la caisse, brume reculée à 148 m,
  plancher de lisibilité V19) : `npm run verify` **OK en 158 s**, cache PWA
  `2429f9ebf163`, 182 fichiers précachés, 0 erreur navigateur. Le checksum
  18 000 ticks reste `017e9fdc` ; le replay de la première étape du Tour
  sort désormais `2b887431` parce que la brume reculée change les
  trajectoires — c'est l'effet du commit #3 du propriétaire, pas de cette
  passe, dont aucune ligne ne touche la simulation ;
- contrôle manuel dans Chromium à **390 × 844** : un seul bouton dans la barre
  haute, contre-gîte et trois armes en 2×2 à droite, pad à gauche, instruments
  au-dessus du pad, champ de caméra élargi, aucune pause forcée en portrait.


## Passe 77 — rapport de playtest, fantôme et rail tactile allégé

Validation du 1er septembre 2026 :

- `npm run verify` : **OK** en 145 s sur 111 modules JavaScript et 49 fichiers
  Python ;
- deux suites ajoutées à la chaîne : `test:playtest` (réducteur des portes
  Go/No-Go, journal survivant à `telemetry.clear()`, histogramme d'images,
  livraison fichier/texte/presse-papiers/téléchargement, agrégation d'une
  campagne) et `test:ghost` (trace à 20 Hz, validation, interpolation, cap par
  le plus court arc, alignement par manche, sélection sur graine et étape,
  visuel avec le moteur simulé, import d'un replay) ;
- simulation déterministe : `017e9fdc` sur 18 000 ticks, identique à
  `BUILD_INFO.json` ;
- replay de la première étape du Tour : `59947b1d` sur 5 821 ticks, identique
  à `BUILD_INFO.json` ;
- empreinte de cadence 30/60/144 Hz : `4976b6a4`, identique ;
- cache PWA `76924fb2ba8f`, **182 fichiers précachés**, dont les trois nouveaux
  modules (`playtest-report.js`, `ghost.js`, `ghost-visual.js`) ;
- monofichier reconstruit avec les trois modules, ordre de concaténation
  respecté (aucune collision de nom de haut niveau : préfixes `playtest*`,
  `ghost*`) ;
- smoke navigateur Chromium : **0 erreur console, 0 erreur de page** ;
- préparation de release (`npm run test:release`) : 10 tests OK ;
- benchmark : **145 204 pas bateau/s** pour 480 000 pas.

### Ce qui est vérifié par les nouvelles suites

- le journal de session compte bien deux parties quand la télémétrie de partie
  a été remise à zéro entre les deux ;
- une contre-gîte de J2 en Mêlée locale n'entre pas dans la porte du joueur ;
- le rapport ne transporte ni la personnalisation ni aucune clé inconnue des
  réglages, et tronque le user agent ;
- la trace fantôme pèse moins de 4 Ko pour 120 ticks, ne modifie jamais la
  pose lue, et n'est produite que sur un enregistreur actif avec une manche
  marquée ;
- une trace à longueur non multiple de six, à flottant, à manche dupliquée ou
  à `firstTick` négatif est rejetée sans exception ;
- le fantôme ne s'arme ni en relecture, ni en Mêlée locale, ni avec le réglage
  coupé, ni sur une autre graine, et un coffre en panne ne fait pas tomber la
  partie ;
- contrôle manuel dans Chromium (`?debug=1`) : une partie accélérée par
  `fixedUpdate` produit un replay de 41 Ko dont 37 Ko de trace pour
  4 485 ticks et deux manches ; la revanche sur la même graine arme le
  fantôme, l'ajoute à la scène et le confond avec la yole du joueur à
  entrées identiques (même position au tick 45) ; le rapport se construit
  avec la chaîne GPU, la fenêtre et les portes de la session.

### Ce qui n'est pas vérifié ici

- aucune mesure sur téléphone réel : c'est précisément l'objet du protocole
  `docs/PLAYTEST_PROTOCOL.md` que cette passe outille ;
- la feuille de partage avec fichier (`navigator.canShare({ files })`) n'est
  couverte qu'en simulation ; son comportement réel dépend du navigateur.


## Passe 44 — élimination définitive et attente spectateur

Validation finale du 30 juillet 2026 :

- `npm test` : **OK** en 117,7 s sur 78 modules JavaScript et 42 fichiers
  Python ;
- test dédié : une yole reste éliminée pendant 15 s, au-delà de l'ancien délai
  de repêchage de 8,5 s, et seule la manche suivante la remet en jeu ;
- simulation déterministe : `058d13e0` sur 18 000 ticks ;
- scénario Combat intégré : `1a74a985` sur 30 000 ticks, état final
  `ee1766f7` ;
- replay Combat : `95198034` ;
- replay de la première étape du Tour : `6061a6ed` sur 4 038 ticks, comparé
  sans divergence à chaque tick ; Tour complet sur 40 414 ticks ;
- déterminisme 30/60/144 Hz : `067e1cd2` ;
- cache PWA `f8e4c9953eaa`, **175 fichiers précachés** ;
- benchmark : **146 047 pas bateau/s** pour 480 000 pas.

### Règle de manche

- aucun `respawn`, `updateRespawns`, timer de repêchage ou réglage
  `BALANCE.respawn` ne subsiste dans le runtime ;
- Combat Box et Mêlée locale : une yole éliminée attend la fin de la manche ;
- Tour : un abandon attend la fin de l'étape ;
- la Frappe de Sable et son bouton post-mort ont été retirés : le joueur
  éliminé n'exécute plus aucune action de gameplay ;
- le HUD affiche la raison réelle de l'élimination et le statut spectateur ;
- en Mêlée, la caméra ignore l'épave, suit le dernier humain actif puis le
  leader IA si les deux humains sont éliminés.

### Déterminisme et artefacts livrés

- les compteurs Brume, Sargasse, collision et avertissement sont remis à zéro
  entre manches ;
- la wake grid remet son origine et sa phase fixe à zéro, supprimant une
  divergence du Tour qui apparaissait dès le tick 10 ;
- protocole gameplay : `tropical-mayhem-v3-12-no-rescue` ;
- le monofichier a été reconstruit et le test vérifie qu'il ne contient ni
  ancien repêchage, ni action post-mort, ni version v3-11 ;
- syntaxe, vérification statique, PWA, serveur, entrées, HUD, IA, shaders et
  benchmark : **OK**. Les sondes Python Playwright et EGL restent ignorées
  localement faute de leurs runtimes optionnels.

Le statut de publication est désormais `ready` sur la base
`owner-attested` : le propriétaire a autorisé explicitement les 8 musiques et
15 effets MP3 le 30 juillet 2026. Les pièces individuelles restent non fournies
et les droits ne sont pas présentés comme vérifiés indépendamment
(`AUDIO_RIGHTS.md`).

## Passe 43 — menu live, atelier 3D et sortie de pause

Validation finale du 30 juillet 2026 :

- `npm test` : **OK** en 118,6 s sur 77 modules JavaScript et 42 fichiers
  Python ;
- simulation déterministe : `058d13e0` sur 18 000 ticks ;
- scénario intégré : `3279600a` sur 30 000 ticks, état final `4dacd0b1` ;
- replay de partie complète : `737160a2` ;
- replay de la première étape du Tour : `8cd4b68c` sur 4 035 ticks ; Tour
  complet sur 40 818 ticks ;
- déterminisme 30/60/144 Hz : `067e1cd2` ;
- cache PWA `e0e2ee833d47`, **175 fichiers précachés** ;
- monofichier reconstruit avec le nouveau module de personnalisation ;
- benchmark : **141 529 pas bateau/s** pour 480 000 pas.

### Menu et atelier contrôlés dans le navigateur

- le menu utilise la vraie yole `YoleVisual` en mouvement et la cadre dans la
  baie libre à droite du panneau de modes ;
- les cartes de modes sont composées en HTML/CSS : aucun des six anciens
  bitmaps V6 contenant une yole n'est référencé par l'UI ou le précache ;
- l'atelier masque correctement la couche menu, ne floute pas le canvas et
  isole J1 des trois rivaux ;
- la caméra orbitale recadre la pièce choisie : gros plan coque/bordage,
  bwa/bois, équipage et soute ; cadrage haut pour la voile et le gréement ;
- les choix sont appliqués en direct puis sauvegardés, tandis qu'Annuler et
  Échap restaurent l'instantané d'ouverture ;
- catalogue vérifié : 6 coques, 6 bordages, 4 bois, 6 équipages, 4 livrées,
  3 gréements et une soute de 2 armes parmi 4 ;
- chargement propre : **0 nouvelle erreur ou avertissement console**.

### Pause → menu principal

- le rail `Reprendre / Recommencer / Menu principal` reste visible sans
  parcourir tous les réglages, y compris sur l'écran étroit ;
- la confirmation rend la pause sous-jacente `aria-hidden` et `inert` ;
- Annuler restaure la pause et son focus ; Confirmer ferme le HUD, la pause et
  la confirmation, puis redonne le focus à Jouer ;
- navigation manette couverte : Back ouvre, A confirme, B annule et Start ne
  traverse pas une confirmation.

La sonde Python Playwright et la sonde EGL restent ignorées localement faute de
leurs runtimes optionnels. Elles sont complétées ici par la QA réelle dans le
navigateur intégré ; les tests Node couvrent la machine d'état, les mappings
Gamepad API et tous les contrats statiques.

### Assets et publication

- **0 asset technique manquant** ;
- **0 bitmap généré de yole actif** ;
- les 6 bitmaps V6 non authentiques restent seulement sur disque comme archives
  d'audit, hors UI, hors précache et hors paquet de release ; les 2 badges
  joueurs V6 restent actifs ;
- le pilote d'image généré hors dépôt n'a jamais été intégré ;
- la publication est autorisée sur attestation explicite du propriétaire pour
  8 musiques et 15 effets MP3 ; les preuves individuelles restent une dette
  documentaire déclarée (`AUDIO_RIGHTS.md`).

## Passe 42 — archive avant le menu live et l'atelier 3D

> État historique remplacé par la Passe 43 ci-dessus.

Validation du 30 juillet 2026 :

- `npm test` : **OK** sur 75 modules JavaScript et 42 fichiers Python ;
- décrément des cooldowns Mine/Rhum corrigé à un seul tick, protocole de gameplay
  passé en `v3-10-cooldown-integrity` et test de non-régression ajouté ;
- garde-fous Start/manette/dialogues et navigation des onglets clavier : **OK** ;
- syntaxe, estampille PWA, monofichier et vérification statique : **OK** ;
- cache PWA `9fddf970fff2`, **180 fichiers précachés** ;
- simulation déterministe : `058d13e0` sur 18 000 ticks ;
- scénario intégré : `3279600a` sur 30 000 ticks, état final `4dacd0b1` ;
- replay de partie complète : `737160a2` ;
- replay déterministe de la première étape du Tour : `8cd4b68c`
  sur 4 035 ticks ; Tour complet sur 40 818 ticks ;
- déterminisme 30/60/144 Hz : `067e1cd2` ;
- benchmark : **139 159 pas bateau/s** pour 480 000 pas.

### Ce qui est désormais réellement disponible

- Grand Tour persistant en huit étapes, classement et reprise ;
- Mêlée locale à deux pilotes et deux IA avec caméra commune ;
- garage avec choix de deux armes parmi quatre ;
- replayothèque locale plafonnée à huit, lecture compatible, téléchargement,
  suppression unitaire et effacement confirmé ;
- panneau Yole & crédits avec repères culturels, sources, installation hors
  ligne, non-affiliation et avertissement sur les droits ;
- réglages audio séparés, réinitialisation confirmée, aide adaptative,
  initiation en quatre écrans et navigation clavier restaurée ;
- intégrité des replays, récupération WebGL, serveur en allowlist, CSP, cache
  isolé et CI renforcée.
- relecture d'une étape du Tour dans son décor et ses règles d'origine, puis
  relance du même replay depuis son écran de résultat ;
- dialogues Tour, replayothèque et informations alignés sur le même contrat
  clavier, y compris sans prise en charge native de `showModal()`.

### Contrôle navigateur réel

Le menu, l'initiation, le Tour, le garage, la Mêlée, les réglages, les contrôles,
la replayothèque et Yole & crédits ont été ouverts dans le navigateur intégré
aux formats bureau, portrait 390×844 et paysage 844×390. Les débordements des
réglages et du lobby ont été corrigés. Le chargement final propre produit
**0 nouvelle erreur ou avertissement console**.

La sonde Python Playwright et la sonde EGL restent ignorées localement faute de
leurs runtimes optionnels. La première a été remplacée dans cette passe par la
QA navigateur ci-dessus ; la CI installe toujours Chromium pour son propre
contrôle.

### État des assets alors observé

- **0 asset technique manquant** : tous les fichiers déclarés sont présents ;
- cette passe comptait encore **6 bitmaps de menu à remplacer** : hero, quatre
  cartes de mode et fond de lobby Mêlée ;
- les fichiers V6 étaient alors actifs, mais leurs yoles n'étaient pas validées
  culturellement ni visuellement ;
- aucun remplacement généré n'était branché et la génération était en pause ;
- la silhouette 3D procédurale a été corrigée sans toucher à la physique :
  coque à 6,12 de ratio, bwa principalement au vent, équipage bas/en rappel.

### Blocages alors déclarés

La candidate n'est pas publiée et aucune nouvelle archive n'est déclarée :

1. validation visuelle des six remplacements de menu — levé par la Passe 43,
   qui les a retirés du runtime ;
2. preuve de droits pour 8 musiques et 15 effets MP3
   — blocage levé le 30 juillet 2026 par attestation propriétaire, sans
   prétendre à une vérification documentaire (voir `AUDIO_RIGHTS.md`).

## Passe 40 — visée corrigée, turbo à 10 s, harpon renforcé

`npm run verify` : **OK**. Benchmark 145 251 pas/s.

### Visée — le test verrouillait le bug

Mesuré par projection écran (`camera.project`), qui ne suppose rien sur la base
de la caméra :

| `aim` | Viseur | Tir (NDC) | Accord |
|---:|---:|---:|---|
| +1 | 74 % (droite) | −0,187 (gauche) | **avant : non** |
| +1 | 74 % (droite) | **+0,187 (droite)** | **après : oui** |

`input-pause.test.mjs` assertait le signe **inversé** : il encodait la convention
interne au lieu de l'écran, passait au vert, et validait le défaut.

### Turbo à 10 s — effet mesuré

3 graines × 35 s, pilote compétent, TOUR :

| Mesure | Avant (3,1 s) | Après (10 s) |
|---|---:|---:|
| Vitesse moyenne | 76,2 km/h | **58,9 km/h** |
| Gîte moyenne | 0,23 rad | 0,214 rad |
| Hors contrôle | 17,1 % | 18,4 % |
| Chavirages | 0 | **0** |
| Éliminations | 0 | **0** |

### Limite transparente

Le −23 % de vitesse est la conséquence directe de la demande, pas un effet de
bord. Je n'ai **pas** compensé ailleurs (poussée vélique, seuils du Grain) :
si la course paraît molle en jeu, c'est ce couple-là qu'il faudra rééquilibrer,
et ça demande un ressenti humain, pas une mesure.

## Passe 39 — contrat tactile testé, abordages enfin mesurables

`npm run verify` : **OK**. Le smoke navigateur couvre désormais le contrat 44 px.

### Cibles tactiles — les deux contextes

| Contexte | `pointer:coarse` | Cible minimale | Seuil applicable |
|---|---|---:|---|
| Souris, 640×360 | `false` | 31 px | WCAG 2.5.8 : **24 px** |
| Tactile, 640×360 | `true` | **46 px** | contrat projet : **44 px** |

Le smoke ouvre un contexte tactile dédié (`has_touch`, `is_mobile`) sur le même
monofichier instrumenté : **8 contrôles, minimum 46 px, aucun sous 44**. Jusqu'ici
la promesse du README n'était vérifiée par aucun test — le seul contrôle existant
mesurait le contexte souris, où le seuil de 44 px ne s'applique pas.

### Playtest multi-graines (`YOLE_GRAINES=a,b,c,d,e`)

Cinq graines × 35 s, pilote compétent, niveau TOUR :

| Mesure | Médiane | Étendue |
|---|---:|---|
| Gîte moyenne | 0,23 rad | 0,21 – 0,266 |
| Hors contrôle | 17,1 % | 14,6 – 26,7 |
| Vitesse | 76,2 km/h | 64,9 – 78 |
| Chavirages | **0** | 0 – 0 |
| Éliminations | **0** | 0 – 1 |
| Tirs IA | 27,9 / min | 21,7 – 36,3 |
| Roulis d'armes subi | 3,67 rad/min | 2,13 – 8,25 |
| Roulis d'abordage subi | 4,71 rad/min | 0 – 10,56 |

### Limite transparente, maintenue

La fréquence d'abordage va de 0 à 30,4 par minute selon la graine. Cette
dispersion n'est pas un défaut de calage : elle dit si la trajectoire croise
celle d'un adversaire. **Aucun réglage n'a été fait dessus** — fixer une
fréquence cible relève du design, pas de la mesure.

## Passe 38 — correctif d'équilibrage, trouvé par un harnais qui joue

`npm run verify` : **OK** — et il l'était déjà pendant que le jeu était
injouable. C'est le point important de cette passe.

### Nouveau contrôle : `npm run playtest`

Il joue une vraie partie et rapporte ce qu'un pilote subit. Deux modes :
`YOLE_PILOTE=manuel` (pilotage grossier) et `YOLE_PILOTE=competent`.

| Mesure | Avant correctif | Après |
|---|---:|---:|
| Tirs des trois IA | 63,2 / min | **25 à 32 / min** |
| Roulis par coup encaissé | 0,889 rad | **0,336 rad** |
| Gîte moyenne, pilote compétent | — | **0,209 à 0,281 rad** |
| Chavirages, pilote compétent | — | **0** |
| Éliminations, pilote compétent | — | **0 à 1** |

### A/B contre les constantes d'origine (`npm run playtest:ab`)

Avec le harnais au pilotage grossier, les constantes d'AVANT donnaient
0,925 rad de gîte moyenne contre 0,898 après. **Le désastre observé n'était donc
pas une régression** : c'était le pilote du harnais. Le vrai défaut, lui, était
ailleurs — dans le produit munition illimitée × roulis doublé.

### Limite transparente

Le taux d'abordage mesuré varie de 3,5 à 37,6 par minute d'un niveau à l'autre
sur un échantillon unique de 45 s. Ce n'est pas exploitable ; aucun réglage n'a
été fait dessus. Il faudrait plusieurs graines et des manches complètes.

## Passe 37 — pose d'équipage : lacet, assise, accroche

`npm run verify` : **OK**. Le contrôle dédié `npm run test:crew` est étendu.

### Rendu pur, déterminisme intact

Checksum simulation `a9818132` **inchangé**. La pose d'équipage ne touche que le
rendu : c'est `crewPositions[i]`, calculé par la simulation, qui décide seul du
déport.

### Mesuré sur 33 768 échantillons (`npm run test:crew`)

| Contrôle | Avant | Après |
|---|---:|---:|
| Lacet des équipiers sortis | **0°** | 78° au bout du bois |
| Lacet du bon bord | — | **100 %** |
| Lacet franc (> 0,9 rad) au bout | — | **100 %** |
| Écart bassin / bois | **0,41 m** | **0,086 m** |
| Marge au bout de la perche | 0,50 m | **0,50 m** |
| Portée sur le bois | 20 à 49 % | **52 à 89 %** |
| Équipage hors coque | 91,8 % | 91,8 % |
| Équipage du côté haut | 81,4 % | 81,4 % |

### Deux défauts que seule la capture a révélés

- La pose se calculait sur la position **visée** au lieu de la position dessinée
  (amortie à 10,5) : écart d'assise mesuré **0,36 m** pendant les rappels.
- L'assise était liée à la distance de sortie et non au franchissement du
  plat-bord : un homme à 1,6 m restait à moitié debout.

### Limite transparente

Le renversement du buste (1,30 rad) et le lacet (1,36 rad) sont **retenus après
capture**, pas calculés. Une première valeur à 1,62 rad faisait lire les hommes
comme des plongeurs en vol. Ce sont des choix d'image, jugés sur
`previews/equipage/` — ils n'ont pas de valeur « correcte » démontrable.

Le rig GLB importé emprunte les mêmes rotations via ses proxys ; il n'a pas été
vérifié en capture dans cette passe, faute d'asset d'équipage sur cet hôte.

## Passe 36 — jouabilité : équilibre, turbo, arsenal, IA, accélérateur

`npm run verify` : **OK**. Nouveau maillon dans la chaîne : `npm run test:ai`.

⚠️ **Checksums volontairement changés.** `SIMULATION_VERSION` passe à **3.7.0** et
`GAMEPLAY_VERSION` à `tropical-mayhem-v3-7-equilibre`. Le gameplay a changé —
cooldowns, coût d'équilibre du turbo, munitions de base, comportement d'IA — donc
les replays antérieurs sont refusés par construction. Les relectures **de cette
version** restent bit-exactes : `replayOk: true`.

### Mesuré en navigateur réel (`npm run check:gameplay`)

Zéro erreur console, zéro exception de page.

| Contrôle | Mesure |
|---|---|
| Cooldown turbo | **3,10 s**, second appel immédiat refusé |
| Couple de roulis du turbo | **+0,55 rad/s**, cohésion **−0,045** |
| Gain de vitesse du turbo | +3,65 m/s |
| Fenêtre de contre-gîte | 0 à 0,10 rad · 0,443 à 0,45 · **0,931 à 0,64** · 0,169 à 0,95 |
| HUD de contre-gîte | classes `shift-open shift-perfect`, libellé « MAINTENANT ! » |
| Armes de base | wave/harpoon/mine/rhum en munition infinie, **10 tirs sur 10** |
| Armes de caisse | barik/chadron/lanbi/pwason à 0 au départ |
| Écoute clavier | 0,82 → **0,58** (choquée) → **1,00** (bordée) → 0,82 (retour) |
| IA en course | 5 turbos, **5 hors zone de survie**, écart médian au Grain 108 m |

### Niveaux d'IA (`npm run test:ai`, 100 s, même graine)

| Niveau | Turbos | Dashs | Total boosts |
|---|---:|---:|---:|
| PEYI | 6 | 0 | **6** |
| TOUR | 45 | 8 | **53** |
| CHANNPYON | 36 | 14 | **50** |

PEYI sert de témoin : `boostRace: 0` reproduit exactement l'ancien comportement.

### Invariant de vitesse

Les impulsions hors `fixedStep` franchissaient le plafond dès que les IA se sont
mises à courir : **37,85 m/s** mesurés. `clampImpulseSpeed()` est maintenant
appelée par le turbo, le dash et le slingshot, et le test l'exerce à charge
maximale.

### Limite transparente de cette passe

Le harnais `test:ai` pilote un joueur qui barre sur une sinusoïde et tient le
turbo enfoncé. Il chavire beaucoup et finit 380 à 410 m derrière **à tous les
niveaux** ; l'écart entre niveaux (12 m sur 400) est du bruit. Ces tests prouvent
que le curseur de difficulté agit, et dans quel sens — **pas qu'il est bien
calé**. Le calage demande un playtest humain, qui reste ouvert.

## Passe 35 — pipeline colorimétrique, bloom séparable, allocations

`npm run verify` : **OK** — 59 modules JavaScript, 20 fichiers Python, zéro
erreur console, zéro exception de page.

### Déterminisme préservé

Le rendu n'a aucune autorité sur la simulation, et c'est vérifié plutôt
qu'affirmé : les trois checksums sont **identiques** à ceux d'avant la passe.

| Mesure | Avant | Après |
|---|---|---|
| Simulation, 18 000 ticks | `a9818132` | `a9818132` |
| Scénario Combat Box, 30 000 ticks | `f8a22c50` | `f8a22c50` |
| Cadence 30/60/144 Hz | `dd2eaf6a` | `dd2eaf6a` |
| Replay live/relecture | `36f707b0` | `36f707b0` |

C'est le contrôle qui compte pour l'optimisation de `nearestIslands` : elle
alimente `coastPenalty`, donc la physique. Sa réécriture sans allocation
conserve exactement le même ensemble d'îles retenu, dans le même ordre.

Benchmark CPU : **149 370 pas de yole par seconde** sur 480 000 pas (seuil
anti-régression : 60 000).

### Correction du pipeline colorimétrique

Défaut mesuré en WebGL réel (Chromium/ANGLE, r185), pas déduit : un
`ShaderMaterial` écrivant `0.5` rendait **128** à l'écran là où l'encodage sRGB
donne **188**, aussi bien en rendu direct qu'à travers une `WebGLRenderTarget`.
Avec `THREE.ColorManagement` actif, toutes les couleurs authorées en hexadécimal
sont converties en linéaire ; rien ne les ré-encodait à la sortie.

La passe de composition fait désormais exposition → ACES → sRGB → grade →
tramage. Résultat mesuré sur une frame gelée (`npm run render:tiers`) :

| Palier | Luma médiane | p05 | p95 | Écrêtage | Saturation |
|---|---:|---:|---:|---:|---:|
| LQ | 0,413 | 0,249 | 0,781 | 0 % | 0,623 |
| MQ | 0,331 | 0,238 | 0,785 | 0 % | 0,662 |
| HQ | 0,331 | 0,239 | 0,791 | 0 % | 0,661 |

MQ et HQ se superposent à 0,0003 de luma médiane près. L'écart LQ subsistant
s'explique entièrement par l'absence d'ombres portées à ce palier.

Exposition retenue à **0,90**, choisie par balayage 0,55 → 1,25 sur frame gelée
(`npm run render:exposure`) et non à l'œil.

### Shaders

**9/9 programmes liés** dans un vrai contexte WebGL Chromium — les sept
précédents plus `bloom-prefilter` et `bloom-blur`. La compilation EGL locale
reste ignorée faute de bibliothèques sur cet hôte.

### Coût du bloom

Mesuré avec synchronisation GPU forcée (`readPixels` 1×1 après chaque image,
alternance A/B/A/B) : **+5 ms sur ~93 ms** sous SwiftShader, rasteriseur
purement logiciel, à 1 280 × 760 en HQ.

⚠️ Une première mesure sans synchronisation annonçait +96,8 ms — elle ne
chronométrait que la soumission des commandes, la file GPU se vidant pendant la
seconde boucle. Le protocole corrigé est dans `tools/check_render_tiers.py`.

### Limites de cette passe

- Les mesures colorimétriques et de coût sont prises sous **SwiftShader**. Les
  couleurs sont exactes (ce sont des calculs), les **temps** ne transposent pas
  à un GPU réel.
- La cible de rendu reste en **8 bits par canal**. Le tone mapping travaille
  donc sur une image déjà écrêtée à 1,0 : le bloom n'a pas de vraie réserve de
  hautes lumières. Passer la cible en `HalfFloatType` est le prochain gain
  visuel identifié, et il demandera de re-étalonner l'exposition.
- `minTouchTarget` mesuré à **31 px** en paysage compact 640 × 360, alors que le
  README annonce 44 px. Le seuil du test est à 24. Écart non corrigé dans cette
  passe.

## Passe 34 — maniabilité, Combat Juice et micro-interactions

Validation ciblée exécutée pendant la passe documentaire :

- `npm run test:handling` : **OK** — réponse progressive de propulsion, freinage
  par relâchement, barre à basse vitesse, contre-braquage, drift borné, dash
  correctif et contre-gîte parfaite déterministes ;
- `npm run test:handling-feedback` : **OK** — états HUD stable/surf/dérive/
  rattrapage/danger et mix d’eau continu, croissant et borné ;
- `npm run test:handling-render` : **OK** — dérive caméra à 2,25 m, surf à
  +2,35° de FOV, mouvement ajouté strictement nul avec mouvement réduit, V de
  mousse directionnel et lobe solaire à 12° réduit de 78 % ;
- `npm run test:combat` : **OK** — Coco à 9,5 m, harpon cible-ancre avec ratio de
  traction tireur/cible 12,5, durée 6,2 s et dégâts de tension cadencés ;
- `npm run test:juice` : **OK** — paliers d’impact harpon/Coco/mine, couches
  audio, motifs haptiques TOTAL/DOUX et atlas V7 1024×1024, 2×2, un draw call ;
- `npm run test:ui` : **OK** — contrats accessibilité, tactile, mouvement réduit,
  focus et feedback transitoire.

État produit confirmé :

- `SIMULATION_VERSION` : `3.6.0` ;
- `GAMEPLAY_VERSION` : `tropical-mayhem-v3-6-gamefeel` ;
- réglage HAPTIQUE à trois niveaux `[1, 0.5, 0]`, avec repli silencieux lorsque
  l’API de vibration n’est pas disponible ;
- micro-interactions sans boucle infinie : action acceptée, cooldown, ressource
  basse, visée/cible, score, statut critique et avantage Duel local ;
- quatre signatures V7 intégrées par `assets/textures/v7/juice/juice_vfx_atlas.png` ;
- inventaire cumulé : **74 signatures artistiques** et **75 fichiers** lorsque
  l’atlas d’agrégation est compté.

La chaîne complète `npm run verify` a été relancée après intégration finale :

- **59 modules JavaScript** et **17 fichiers Python** valides ;
- build monofichier, graphe runtime, cache PWA et importmap SRI : **OK** ;
- simulation : checksum `a9818132` ; scénario 30 000 ticks : `f8a22c50` ;
- replay : checksum `04e99ddb` ; cadence 30/60/144 Hz : `dd2eaf6a` identique ;
- Chromium : **7/7 shaders liés**, mini-carte et visée validées, aucune erreur
  console/page ;
- UI réelle : 1440×900 sans chevauchement ; 844×390 tactile avec 11/11
  contrôles visibles ≥44 px et zoom 46×46 ;
- benchmark : **147 622 boat-steps/s** sur 480 000 pas.

La compilation EGL locale est ignorée faute de bibliothèques sur cet hôte ; la
compilation WebGL Chromium réelle passe. La validation haptique sur matériel
mobile réel reste explicitement ouverte dans la section « Limite transparente ».

Références : [Asset Pack V7](docs/ASSET_PACK_V7.md) et
[planche-contact V7](previews/v7_juice_contact.png).

## Passe 33 — combat, visée, menus et Duel local

- `npm run verify` : **OK** sur les 52 modules JavaScript et 17 fichiers Python.
- Coco : rayon AOE 9,5 m et feedback d'explosion renforcé.
- Harpon : cible-ancre, traction élastique, dégâts d'impact/tension et slingshot directionnel.
- Visée : clic droit desktop et second doigt mobile, enregistrée dans le replay solo.
- Raccourcis AZERTY : `& é " '` pour Coco, Harpon, Mine et Rhum.
- Duel local : J1 + J2 + deux IA, caméra partagée, HUD dédié et replay volontairement désactivé.
- Pack d'entrée V6 : 8 nouveaux rasters ; total V5 + V6 : **70 assets**.
  **État historique :** les 6 images contenant une yole sont aujourd'hui
  validées techniquement seulement, pas culturellement/visuellement ; les
  2 badges ne sont pas concernés.
- Simulation : checksum `cdf86f66` ; replay gameplay : `0156d406`.
- Navigateur : 7 programmes WebGL liés, aucune erreur console/page, visée +9° et tir au relâchement validés.
- Benchmark : **155 958 boat-steps/s**.

Cette passe correspond à l'entrée **Passe 33** du [journal](CHANGELOG.md).

## Armes ramassables — Passe 20

- physique pure **`3ebe9ca8` inchangée** : les caisses ne touchent pas la coque ;
- gameplay : scénario `1a9df2a3`, Combat Box `1857be84`, replay `35c439b1` ;
- **`replayOk: true`** — live et relecture identiques au bit près, le nouveau système reste déterministe ;
- 15 ramassages observés sur le scénario, IA armée en cours de manche ;
- deux tests dédiés : l'IA ne tire jamais à vide, et cherche une caisse quand elle est à sec ;
- `simulationVersion` `3.3.0`, `gameplayVersion` `tropical-mayhem-v3-3-pickups` — replays antérieurs incompatibles.

## Résultat

La commande complète suivante passe, nativement sous Windows :

```bash
npm run verify
```

Elle reconstruit le monofichier, valide le graphe de modules, la PWA et l'importmap SRI, exécute les simulations, les replays, la Combat Box, **le Tour des Yoles complet**, la compilation GLSL (skip EGL faute de bibliothèques sur cet hôte, mais **compilation WebGL réelle dans Chromium**), le smoke navigateur réel et le benchmark CPU à seuil.

## Coque générée — Passe 14

- coque conforme à la documentation réelle (fond rond, sans quille) en place : `[-1.08, -0.58, -5.55] → [1.08, 0.04, 5.55]`, 3 061 triangles ;
- `fit_hull_glb.py` validé par **aller-retour sur la coque procédurale connue** : ressort à 11,100 / 1,080 / −0,620 / +0,040 à l'identique ;
- détection automatique de l'axe long et de la proue (extrémité la plus effilée) ;
- 219 DC / 122 260 triangles, zéro erreur console ;
- checksums `3ebe9ca8`, `149bc2cf`, `f9a07291` inchangés.

## Rig d'équipage — Passe 12

- `AssetLibrary` accepte les pièces articulées : scène complète conservée, clone par `SkeletonUtils`, résolution d'articulation par alias ;
- navigateur réel, gabarit servi sous le nom de production : **24/24 équipiers liés**, **24 squelettes distincts**, articulations pilotées par la simulation (6/6 bassins répondent à un Bwa Shift) ;
- repli inchangé : rig absent → équipage procédural, aucune levée (`assetRigsDeclared: 1`, `crewJoints: 7`) ;
- test dédié du piège `GLTFLoader` qui assainit `arm.L` en `armL` ;
- checksums `3ebe9ca8`, `149bc2cf`, `f9a07291` inchangés ; zéro erreur console ;
- capture : `previews/tropical_mayhem_v3_2_crew_rig.jpeg`.

## Passe rendu — Passe 10

- **caméra retournée corrigée** (bug pré-existant) : `up.y` passe de `−0,967` à `+0,966`, le haut de l'image regarde enfin vers le haut. Attribué par A/B : identique avec `impact` à 0 et à 1, donc antérieur à la passe impact ;
- **MSAA** activé sur la cible de rendu (LQ 0 / MQ 2 / HQ 4) — la chaîne post-FX était rendue sans aucun antialiasing ;
- **océan** : atténuation du détail spéculaire (45→260 m) et du déplacement géométrique (120→600 m) avec la distance — moiré et bandes supprimés ;
- **couleur d'horizon unifiée** : brouillard, brume océan et ciel partagent `#d1f3f7`, mesuré identique sur les trois ;
- 349 DC / 54 876 tris, **inchangés** ; checksums `3ebe9ca8`, `149bc2cf`, `f9a07291` inchangés ; zéro erreur console ;
- captures : `previews/tropical_mayhem_v3_2_polish_after.jpeg`, `_after_wide.jpeg`.

## Modèles GLB — Passe 09

- **chargement GLB opérationnel** : GLTFLoader vendoré, `AssetLibrary`, coque de référence cuite depuis les mêmes sections que le procédural ;
- navigateur réel : `status: ready`, 4 yoles en `fromAsset: true`, **géométrie partagée** (uuid unique) et 4 couleurs distinctes ; 353 DC / 54 812 tris, inchangés ;
- **repli vérifié** : modèles forcés en 404 → `status: fallback`, retour procédural, partie qui tourne, zéro exception de page ;
- test node du repli (`assetFallbackStatus: fallback`) : absence d'addon ou de fichier ne lève jamais ;
- checksums simulation `3ebe9ca8`, scénario `149bc2cf` et replay `f9a07291` **inchangés** — le rendu n'a aucune autorité ;
- capture : `previews/tropical_mayhem_v3_2_glb_hull.jpeg`.

## Directeur d'impact — Passe 04

- **Directeur d'impact** : 4 paliers, hitstop 42→125 ms plafonné à 160 ms, recul caméra directionnel, flash sous le HUD, réglage `TOTAL / DOUX / SANS` ;
- **hitstop sans effet sur la simulation** : checksum simulation `3ebe9ca8` et checksum replay `f9a07291` **inchangés**, test unitaire `hitstopLeak: 0` et gel cumulé borné ;
- `scenarioChecksum` `149bc2cf` ajouté au smoke : mesuré sur la simulation pure, identique avec IMPACT à TOTAL et à SANS (le checksum mesuré après les frames temps réel, lui, bouge légitimement : `fd6e55ca` sans gel, `3b364474` avec) ;
- **bug caméra corrigé** : recul et secousse étaient réinjectés dans la pose amortie et s'intégraient au lieu de rester transitoires (horizon basculé). Roulis de pointe 5,2° sur 8 takedowns enchaînés, retour à 0,1° ;
- **banque sonore 22 voix** synthétisée, 3 lits continus, zéro asset externe ;
  rendu par tranches après avoir mesuré un hoquet de 162 ms au coup d'envoi —
  `startMatch` retombé à ~15 ms, banque complète en < 1,5 s, zéro erreur
  console. **État de la Passe 04 seulement :** le runtime charge depuis 15
  effets MP3 et 8 musiques dont les droits ne sont pas encore établis ;
- capture : `previews/tropical_mayhem_v3_2_impact_flash.jpeg`.

## Tour des Yoles et navigateur réel — Passe 03

- **Mode Tour des Yoles 2026** : 8 étapes point-à-point, points 4/3/2/1, classement général cumulé, écrans d'étape et podium ;
- **browser-smoke réel** : Playwright + Chromium embarqué — le harnais shader WebGL et la boucle UI s'exécutent pour de vrai, plus en skip ;
- bug de harnais intercepté par cette première exécution réelle : uniform déclaré avant tout qualifieur de précision dans le préambule fragment (rejeté par ANGLE, toléré par Mesa) ;
- lanceur Windows réparé (imbrication de quotes), détection de Python ;
- favicon, `PCFShadowMap` (r185), compteurs `renderer.info` fiables (336 DC / ~55k tris mesurés en HQ sur GPU logiciel, 294 DC en MQ) ;
- validation du jeu servi localement en conditions réelles : zéro erreur console, captures dans `previews/`.

## Simulation déterministe

- deux exécutions de **18 000 ticks** ;
- checksum identique : `3ebe9ca8` (inchangé) ;
- 30 checkpoints identiques ;
- vitesse maximale observée : `28,6673` ;
- récupération passive : 89 ticks ;
- récupération avec Bwa Shift : 67 ticks.

## Combat Box intégrée

- **30 000 ticks**, quatre yoles ;
- vitesse maximale : `30,9692` ;
- checksum final du scénario : `fd6e55ca` (inchangé après ajout du Tour) ;
- événements de la dernière manche observée : 57 tirs Coco, 56 impacts · 11 slingshots · 54 Bwa Dash · 79 Bwa Slams · 2 Turbo · 3 Takedowns.

## Tour des Yoles intégré

- **8 étapes enchaînées** en 37 865 ticks ;
- points cumulés `[0, 13, 11, 26]`, champion : **LANMÈ ROUGE** (meilleur total, vérifié par assertion) ;
- chaque étape classe les 4 yoles exactement une fois (finishers à la ligne, non-finisseurs par z) ;
- seeds déterministes par étape, replay d'étape sauvegardé ;
- parcours utilisateur validé en navigateur réel : clic menu → ÉTAPE 1/8, HUD distance/place, aucune erreur.

## Replay

- replay intégré : 1 800 ticks, 1 743 trames compressées ;
- checksum live/relecture : `f9a07291` (inchangé).

## Shaders

Les six programmes (océan, ciel, Mur du Grain, pluie, particules, post-traitement) sont **compilés et liés dans un vrai contexte WebGL Chromium** (`linked: true` ×6) — première exécution effective de ce harnais, qui a intercepté le bug de précision du préambule. La validation EGL 1.5 / GLES 3.2 Mesa de la Passe 01 reste la référence hors navigateur (skip gracieux sur cette machine).

## Browser smoke

Chromium embarqué Playwright, monofichier avec mock Three déterministe :

- chargement, match, boucle d'animation (tick 126 et plus), direction, armes, boosts, zoom, réglages, HUD, télémétrie ;
- **zéro erreur console, zéro exception de page** ;
- captures : `previews/tropical_mayhem_v3_2_browser_mock.png` (UI, Three simulé), `previews/tropical_mayhem_v3_2_real_render.jpeg` (rendu WebGL réel Combat Box), `previews/tropical_mayhem_v3_2_tour_mode.jpeg` (rendu réel mode Tour), `previews/tropical_mayhem_v3_2_beauty_menu.jpeg`, `_beauty_pass.jpeg` et `_beauty_calm.jpeg` (passe beauté shaders : micro-normales, traînée de soleil, crêtes translucides, mousse dentelle, perspective aérienne, grade split-tone).

## Performance CPU

- 120 000 ticks × 4 yoles, 480 000 étapes ;
- 3 115,59 ms ;
- **154 064 étapes de yole par seconde** (seuil anti-régression : 60 000).

## Limite transparente

Le rendu est désormais validé sous WebGL logiciel (SwiftShader) — compilation, boucle, HUD, qualité auto qui rétrograde HQ→MQ comme prévu. Reste à valider sur matériel réel :

- GPU réel (frame pacing 15 minutes, chauffe, mémoire GPU) ;
- Safari iOS et Chrome Android ;
- haptique et manette ;
- 336 draw calls en HQ à réduire pour le mobile (instancing/fusion).
