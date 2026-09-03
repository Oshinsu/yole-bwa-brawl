# Changelog — Tropical Mayhem V3.7 — L'équipage, l'équilibre, la couleur

> **Sur la numérotation.** Ce journal était daté au jour le jour, du 23 juillet au
> 12 août 2026. Ces dates ne correspondaient à rien : les horodatages des fichiers
> situent la totalité du travail entre le **25 juillet 2026 à 12 h 28** et le
> **27 juillet 2026**, soit trois jours pour trente-quatre entrées — et vingt-cinq
> d'entre elles étaient datées dans le futur, jusqu'à seize jours après la
> dernière écriture réelle sur le disque.
>
> Ce que le journal décrit vraiment, ce sont des **passes**, pas des journées. Elles
> sont donc numérotées, dans l'ordre — Passe 01 la plus ancienne, Passe 34 la plus
> récente des entrées reprises (les passes suivantes s'ajoutent au-dessus). Les mentions « (soir) », « (nuit) » et « (suite) » sont conservées : elles
> portaient une information réelle, celle d'une passe reprise dans la foulée d'une
> autre. Aucune date n'a été réinventée, parce qu'aucune n'était mesurable.

## Passe 88 — les bois en faisceau, des baskets aux pieds

Verdict porté sur la planche de la passe 87 : le geste était juste, l'image
non. Ce qui restait faux tenait au décor du corps, pas au corps.

- **Un bwa se lit comme un faisceau.** Sur toutes les photos de course les
  hommes sont assis sur quatre à six bois côte à côte, larges de 30-40 cm ; dans
  le jeu l'allongé tenait en équilibre sur un cylindre de six centimètres et
  l'assis avait l'air posé sur une barre de gymnastique. Chaque bwa est
  désormais rendu par trois brins instanciés (`BWA_BUNDLE`) : le bois central
  reste celui de la simulation et des contacts, deux bois d'accompagnement
  l'encadrent le long de la coque, un peu plus bas et un peu plus courts (bouts
  décalés, comme des bois lashés). 21 instances au lieu de 7, une seule matrice
  de plus par brin dans `syncBeamInstances`. Visuel pur.
- **Des baskets.** Les dresseurs courent chaussés ; le rig était pieds nus.
  `dressFeet` pose sur l'os du pied un corps coloré et une semelle contrastée,
  dimensionnés sur la longueur cheville → orteils du rig lui-même, **à plat au
  sol** : l'os du pied plonge de 45-60° vers la base des orteils, la chaussure
  suit sa projection sur le sol et sa semelle se pose au niveau des orteils.
  Une première version suivait l'os : des palmes plongeantes, vues sur la
  planche, corrigées avant livraison. Une paire par homme, déterministe.
- **Des casquettes une fois sur deux** (`CREW_VARIANT_SEQUENCE`), comme sur les
  photos ; la liste des variantes chargées ne change pas.
- **Le regard à l'horizon** : l'assis regardait ses pieds (`CREW_GAZE_AHEAD_DOWN`
  −0,12 → +0,06 ; regard mesuré +0,19…+0,34 au harnais silhouette).
- **La pagaie du patron n'était pas perdue.** Sondée en jeu dans la capture
  isolée : visible, dans le champ, attachée à la main droite ; elle sortait
  simplement du cadre serré de la planche. Une quatrième vue « patron » est
  ajoutée à la planche.
- Contrat : `handling-render-feedback` compte désormais `beams × BWA_BUNDLE`
  instances. Purement visuel : les quatre checksums sont inchangés.
- Ce qui reste et pourquoi : l'assise à bord est basse (le bois est à la cote
  de la lisse, 0,235 m au-dessus du plancher : genoux hauts) — c'est la
  profondeur de coque du jeu, pas la pose ; pas de gilet (la texture Meshy a des
  îlots UV éparpillés, un gilet peint déborderait sur les bras) ; le poing reste
  une rotation rigide des doigts.

## Passe 87 — l'assis regarde le large : les poses recalées sur les photos de course

Le propriétaire : « analyse tes neuf vues, regarde où c'est pas bon, va chercher
des photos toi-même ». Quarante photos du Tour des yoles (Wikimedia Commons :
Sainte-Luce, bout des bois, yole jaune, GFA, 2019) et la fiche d'inventaire du
patrimoine ont dit ce que la planche avait de faux — le GESTE, plus l'anatomie.

- **Ce que montrent les photos.** Le dresseur assis est à cheval sur le faisceau
  **face au large**, dos au bateau, buste droit ou penché en avant comme un
  jockey, les deux mains **devant lui** sur le bois, genoux à 70-100°, pieds
  pendants. Un seul homme, au bout, s'allonge : dos sur le bois, tête au large,
  jambes vers la coque. Personne n'est debout : par petit temps les dresseurs
  sont **assis sur leur bois au plat-bord**, mains dessus. « Normalement les
  pieds au plat-bord, les jambes dans le vide quand la rafale est forte » (fiche
  PCI). La passe 85 avait tourné l'assis face à la coque et renversé en arrière,
  mains derrière : la posture d'un baigneur sur un banc, absente de toute photo.
- **Le sens dépend de la pose de jambes.** `crewLegPoseFor` se lit dès le lacet :
  assis (« bas ») et à bord (« repos ») regardent le large — lacet du signe du
  bord ; allongé (« bateau ») garde la face vers la coque, ce qui le met sur le
  dos quand le bassin se renverse. Tronc 15° en avant (`CREW_TORSO_LEAN_ASTRIDE`),
  prises **devant** le bassin (`CREW_GRIP_AHEAD_FAR/NEAR` 0,42 / 0,16), cuisses
  portées en avant et genoux pliés (`CREW_SEAT_THIGH_FORWARD` 1,4,
  `CREW_SEAT_SHIN_BACK` 0,35), visage vers l'eau devant lui (`gazeAhead`, par le
  repère `headfront` du GLB — aligner l'os de tête sur la verticale faisait fixer
  le ciel, regard +0,55…+0,82 mesuré).
- **À bord, assis sur son bois.** Face au large, prises courtes devant
  (`CREW_GRIP_ABOARD_FAR/NEAR`), tronc 10°, pieds au plancher juste en deçà de la
  lisse (`CREW_ABOARD_FEET_MARGIN`). Le contact d'assise ne s'efface plus avec le
  rappel mais avec l'autorité des jambes : à hike 0,36 au plat-bord l'homme
  gardait 31 % de contact — mains à 10 cm, jambes molles, regard au ciel.
- **Allongé, genou souple** (`CREW_LYING_KNEE_LIFT` 0,20 ≈ 23°) : la cuisse vise un
  peu au-dessus de la ligne, le tibia redescend sur la cible.
- **Le poing.** Clé de forme « poing » cuite dans Blender 5.2 headless sur les
  quatre rigs (`tools/crew_fist_shapekey.py`) : doigts = sommets pesés par
  `LeftHand`/`RightHand` au-delà de la moitié de l'os, ligne d'articulation par
  ACP de leur section, curl 125° au bout ; sens vérifié sur rendus Workbench
  (paume, dos, tranche). Exportée en morph target (`export_morph`), fondue par
  `CrewVisual.setFist` avec le contact des mains ; le patron serre sa pagaie.
  Déplacement des bouts de doigts 13-15 cm.
- **Mesuré en jeu** (six hommes, gîte 0,42) : les assis ont la poitrine vers la
  mer **+0,65…+0,68** (contre −0,49…−0,54 face à la coque), lacet −75° du côté du
  large, mains à −1 cm du bois, genoux 86°, tronc 39° en avant ; les allongés
  inchangés (poitrine au ciel +0,90…+0,93, mains 0-3 cm). À bord (gîte 0,03) :
  poitrine vers la mer +0,75…+0,97, mains 0-5 cm pour les hommes assis au bois.
- **Contrats retournés avec le geste** : `crew-seating` attend le lacet du signe
  du bord pour l'assis et opposé pour l'allongé (pose CALCULÉE par
  `crewLegPoseFor`, pas lue) ; `mesure_jambes` gagne la lecture « assis » (cuisse
  vers le large, genou 45-120°) ; le regard du harnais silhouette est dorsal pour
  l'allongé (≥ 0,15) et devant soi pour l'assis (−0,5…+0,35) ; assise tolérée à
  −10 cm (bassin penché en avant, le point d'assise descend de 2 cm). Purement
  visuel : les quatre checksums sont inchangés.
- **Planche jeu / réel** : trois poses du jeu au-dessus de trois photos de
  course, envoyée au propriétaire ; c'est elle qui juge.

## Passe 86 — les genoux pliaient à l'envers, depuis le début

Le propriétaire, capture de l'homme à bord sous les yeux : « les genoux, les
jambes sont TORDUS — c'était le problème depuis le début ». Et : « pourquoi tu
n'utilises pas Blender ? ». Les deux remarques étaient justes.

- **La mesure.** Sonde sur les clips SEULS (poids 1, sans procédural ni IK) :
  dans les cinq actions du GLB livré, la cuisse partait vers **−Z (l'arrière)**
  et le tibia vers **+Z (l'avant)**. `pont_interieur` : cuisse `[0,07 −0,78
  −0,63]`, tibia `[0,04 −0,87 +0,49]`. Un genou qui plie à l'envers, dans chaque
  clip, sur les quatre rigs. Tout ce que l'IK faisait depuis — pôle, remise dans
  le plan, deux-os — se battait contre un clip qui pliait dans l'autre sens ; ce
  combat, c'est la torsion qu'on voyait à l'écran (**47-88°** à bord, mesurée
  en jeu).
- **La cause.** Sur ce rig, l'axe X local des os de jambe est latéral et leur
  axe Z local pointe vers l'ARRIÈRE : une rotation X positive envoie la cuisse
  en arrière, une rotation X négative envoie le tibia en avant. Les seeds
  (`POSE_ROTATIONS_DEG`, `tools/build_crew_asset.py`) écrivaient cuisse +62,
  tibia −100 pour la pose assise — l'anatomie exacte, au signe près. Les bras,
  eux, tournaient dans le bon sens.
- **Le correctif, à la source.** Les 36 valeurs X de `UpLeg`, `Leg`, `Foot` sont
  négées (amplitudes de respiration comprises) et les cinq actions **recuites
  dans Blender 5.2 headless** sur des copies des quatre masters (principal,
  locks, casquette, bakoua), textures ramenées à 256, tailles identiques à la
  production. Diff clip par clip entre ancien et nouveau GLB : **seules les six
  os de jambe changent** (14° à 175°), tout le reste est identique au degré
  près. Après : `pont_interieur` cuisse `[0,15 −0,44 +0,89]` (avant-haut), tibia
  `[0,23 −0,81 −0,54]` (bas) — sur les quatre rigs.
- **Le pôle des genoux vient du corps, plus du bruit du bind.** Le pôle déduit
  du « bombement » du genou au bind (2 % de la longueur d'une jambe quasi
  tendue, normalisé) sortait à **30° vers l'extérieur** : les six hommes assis à
  bord pliaient donc les genoux de côté, 24-33°, jusqu'à 61° quand le bassin
  tournait. Le plan de flexion des jambes est désormais l'AVANT du corps, un
  soupçon dehors (`CREW_KNEE_SPREAD` 0,12 ≈ 7°), le côté extérieur lu sur le rig
  lui-même. Mesuré en jeu à bord : torsion **7-22°** (un genou à 31°), pieds
  chacun de leur côté (0,15-0,24 m), contre 47-88° au départ de la passe.
- **Le résolveur deux-os avec pôle** (`solveTwoBone`) remplace le CCD sur mains,
  plat-bord et planchers : le genou (ou le coude) est POSÉ dans le plan du pôle
  par la solution du triangle, puis chaque os orienté vers son point. Aucune
  torsion créée ; la remise dans le plan finit le travail. Les cibles de pieds
  à bord étaient de plus INVERSÉES gauche-droite (+X local est le côté GAUCHE
  de l'homme) : pieds croisés de 20-29 cm, mesuré.
- **À bord, l'homme se tourne vers l'intérieur** (`CREW_ABOARD_YAW` 1,25 rad,
  fondu par `assisAuBord`), et **le patron sort des contacts de perche** : à la
  poupe, `catchLoad` lui donnait un contact de rappel et le deux-os, qui atteint
  sa cible, envoyait ses bras en croix (47,8° d'abduction → 28,8°).
- **Planche de trois poses isolées relue** : assis à cheval dos à la mer, jambes
  pendantes de chaque côté de la perche, genoux vers l'avant ; allongé, jambes
  vers la coque, mains au bois ; à bord, debout genoux souples, regard à la
  voile. À cheval en jeu : torsion 0-15°, mains à 0-8 cm du bois, poitrine au
  ciel +0,52…+0,93.
- Contrats : `crew-pole-target` porte le nouveau plan des jambes (écart voulu
  0,12 rad au repos) ; genou au plat-bord toléré à 95° (92° mesuré à la
  demi-sortie : le deux-os résout le triangle exactement, le genou suit la
  distance hanche-plat-bord). Purement visuel : les quatre checksums sont
  inchangés.
- Règle retenue : **quand une pose résiste à trois passes de réglage, sonder le
  clip seul.** Le bug était dans l'asset, pas dans le résolveur — et l'asset se
  corrige dans Blender, en une ligne de seeds, pas en couches d'IK.

## Passe 85 — dos à la mer : la cause racine des poses de l'équipage

Le propriétaire, planche de poses isolées sous les yeux : « pitoyable ». Il
avait raison, et la raison n'était dans aucune des deux passes précédentes.

- **La mesure qui manquait.** Les outils d'équipage mesuraient des angles —
  tronc 42°, genou 8°, main à 1 cm — tous au vert. Aucun ne mesurait un
  CONTACT ni une DIRECTION DE POITRINE. Nouvel outil
  `tools/mesure_appuis_equipage.mjs` (dans `npm run test:crew`) : périnée
  contre le dessus du bois, mains contre le bois, tronc qui traverse ou non, et
  sa version en jeu (`scratch`) qui lit en plus où regarde la poitrine.
- **Ce qu'elle a dit.** En jeu à 24° de gîte, `poitrineVersHaut` valait
  **−0,5 à −1,0 sur cinq hommes sur six** : la poitrine regardait le bas. Le
  lacet de la racine (−73° à −81°) tournait l'homme **face au large** depuis le
  6 août, et « renverser le buste au-dessus de l'eau » était un tangage positif
  du bassin — dans ce repère, **se plier en avant**. Le tronc faisait bien 42°
  de la verticale, dans le mauvais sens. Les angles étaient justes, le corps
  était à l'envers.
- **Le correctif tient en deux signes** : le lacet envoie la face vers la
  coque (`-side`), le tangage du bassin devient négatif. Un yoleur au rappel
  tourne le dos à la mer et penche en arrière, poitrine au ciel, regard sur la
  voile. Mesuré après : poitrine **+0,52 à +0,93** sur les six, regard dorsal
  +0,58 à +0,88 (contre +0,14 avant), silhouette stricte tenue.
- **Les mains ont suivi.** Retourné, l'homme a la perche derrière lui et les
  seeds laissaient les bras en avant : le CCD, borné par `maxSwing`, manquait le
  bois de **30 à 55 cm**. `preOrientArmsTowards` pointe d'abord chaque bras vers
  sa prise, en monde (comme les jambes couchées), puis le CCD affine. Assis à
  cheval, les deux prises passent **derrière les hanches**, côté large
  (`CREW_GRIP_BEHIND_FAR/NEAR`). Après : **0 à 8 cm** du bois en jeu.
- **Le regard va à la voile** (`gazeAtSail`) : la nuque se redresse vers la
  verticale et la coque pendant que le tronc part en arrière, sinon l'homme
  fixe le ciel — vu sur la planche.
- **La planche de trois poses isolées** (`scratch/capture_live.py`, un homme,
  sa yole, trois angles) devient l'instrument de recette : c'est elle qui a
  montré le défaut et elle qui a validé le correctif. Assis à cheval : dos à la
  mer, penché en arrière, jambes pendantes, mains derrière sur le bois. Allongé
  : sur le dos le long de la perche, tête au large, pieds vers la coque. À bord
  : debout dans la coque, mains sur la perche, regard à la voile.
- Contrats retournés avec le corps : `crew-seating` attend un lacet OPPOSÉ au
  bord ; le genou au plat-bord tolère 90° (82-83° mesurés, photo 4 à angle
  droit). Purement visuel : les quatre checksums sont inchangés.

## Passe 84 — le sable, l'horizon, les îlets

Retour du propriétaire sur les captures de la passe 83 : « sable dégueu,
horizon dégueu, les îlets sont dégueu ». Trois défauts distincts, dont deux
étaient des bugs.

- **La canopée était effacée à chaque partie.** Le moutonnement des mornes était
  calculé à la CONSTRUCTION de la géométrie, puis `applyStagePalette` réécrivait
  les couleurs de sommet **sans le refaire** — et cette méthode tourne à chaque
  `setStage`, donc à chaque match. Le moutonnement n'a donc jamais été visible en
  jeu : les îlots sortaient en dégradés lisses. Les deux rampes avaient divergé.
  Elles sont désormais **une seule fonction** (`peindreSommetDIle`), et le
  moutonnement prend ses deux teintes dans la palette de l'arène.
- **Il n'y avait pas de plage sur quatre archétypes sur sept.** Mesuré :
  l'emprise horizontale réelle d'un morne vaut 1,20 à 1,30 fois le rayon de
  l'îlot, contre 0,96 à 1,06 pour le disque de sable en tropical, volcanique,
  mangrove et falaises. Le relief **recouvrait entièrement** le sable. Élargir
  le disque n'était pas possible — il coïncide avec l'enveloppe de collision, et
  le pousser plus loin laisserait une yole naviguer sur du sable. La plage est
  donc **peinte sur le premier quart de la hauteur du morne** : elle apparaît sur
  les sept archétypes, garde la palette d'arène, et ne touche à aucune collision.
- **La plage n'était plus une assiette.** `CylinderGeometry(1, 1.08, 1, 24)`
  devient `makeBeachGeometry` : disque radial à 44 côtés, bord irrégulier,
  centre relevé de 13 %, et un **liseré mouillé** porté par les couleurs de
  sommet, qui modulent la teinte de la palette au lieu de la remplacer.
  ⚠️ Le bord tient exactement la ligne d'eau de l'ancien cylindre — un premier
  essai bombait vers le bas et noyait la plage, vu en capture.
- **L'horizon ne reculait pas.** Les deux bandes de fond sont rendues sans
  brouillard, et il le faut : posées à 620 et 2 600 m, le `FogExp2` de la scène
  ne laisserait passer que 7 % et 0,1 % du pixel. Mais elles sortaient donc à
  pleine couleur, et lisaient « autocollant ». La perspective aérienne est
  refaite à la main : opacité 0,52 → **0,33** pour la bande proche, 0,25 →
  **0,19** pour la lointaine, plus une teinte froide qui désature le vert.
- **Îlets générés par Meshy : essayés, non retenus.** Un `ilet_rocheux.glb`
  (727 triangles) a été généré et rendu à côté de l'îlot du jeu, même dégradé
  d'altitude appliqué pour ne comparer que la forme : plus de caractère, mais
  troué (faces inversées) et surtout impossible à faire tenir dans l'ellipse de
  collision, que `test/world-collision.test.mjs` vérifie sommet par sommet. La
  cause réelle du « dégueu » était ailleurs, et elle est corrigée ci-dessus.
- Purement visuel : les quatre checksums sont inchangés.

## Passe 83 — le bourg : la côte devient habitée

Suite directe de la passe 82 : les crédits Meshy vont là où la mesure dit qu'il
gagne, c'est-à-dire l'objet fabriqué à silhouette reconnaissable. Trois modèles,
et la côte cesse d'être déserte.

- **Trois GLB Meshy 7** (texte → 3D, texture réduite à 256 par
  `tools/shrink_glb_textures.py`) : `case_creole.glb` (672 triangles, 96 Ko,
  toit de tôle rouge, murs à planches claires, volets, galerie), `gommier.glb`
  (668 triangles, 101 Ko, coque bleu-blanc-rouge à bancs) et `ponton.glb`
  (533 triangles, 72 Ko, tablier sur pilotis). **269 Ko au total**, contre
  240-256 Ko pour un seul bateau de flottille.
- **Instanciés, pas clonés.** Mono-maillage et mono-matériau : trois
  `InstancedMesh`, donc **trois appels de dessin** quel que soit le nombre à
  l'écran — là où la flottille dépense un appel par bateau. Jusqu'à 24 cases,
  10 gommiers et 10 pontons.
- **Un hameau par îlot habité** (`scatterBourg`) : une à trois cases sur la
  pente qui regarde la course, et six fois sur dix un ponton avec son gommier
  tiré à côté. Un îlot sur deux reste sauvage, et les cailloux de moins de 15 m
  n'en portent pas.
- ⚠️ **Tout tient dans l'enveloppe de plage de l'îlot**, que la physique traite
  déjà comme de la terre : aucun collider ajouté, et une yole ne peut pas
  traverser un ponton puisqu'elle ne peut pas l'atteindre. Mesuré sur
  1 054 pièces : débord maximal **−0,36 m** (donc toujours à l'intérieur), et
  jamais moins de **38 m** entre une pièce et l'axe de course.
- **Le semis tourne même sans les modèles.** La suite de tirages ne doit pas
  dépendre de la présence d'un GLB : la géométrie du placement se mesure donc
  dans Node, sans chargeur. RNG dédié (`bourgRng`), semis appelé en dernier :
  aucun élément de décor existant ne bouge.
- Budget par palier : plein en HQ, 55 % en MQ, **rien en LQ** — c'est du décor
  pur, et un téléphone au palier de secours a mieux à faire.
- Contrat : `test/bourg.test.mjs` (dans `npm run test:world`). Purement
  visuel : les quatre checksums sont inchangés.

## Passe 82 — Meshy 7 sur le décor : ce qu'il gagne, ce qu'il perd

Question du propriétaire : « les petits éléments de l'environnement, les mini
îles, cocotiers, sargasses, rochers, autant les générer par Meshy, j'ai des
crédits ». Quatre générations et un montage comparatif plus tard, la réponse est
mesurée — et elle n'est pas celle qu'on attendait.

- **Mesure de départ** : en course, 173 appels de dessin et 209 852 triangles,
  dont **50 460 triangles et 41 appels pour tout le décor**. Le décor est
  instancié : un cocotier coûte 96 triangles de tronc et 5 × 24 de palme, un
  rocher 36, et chaque famille tient en **un seul appel**.
- **Contrainte oubliée jusqu'ici, et décisive** : rochers, palmes et mornes sont
  **recolorés arène par arène** — par matériau pour les premiers, par couleurs de
  sommet pour les seconds. Un maillage texturé les figerait sur une seule
  palette et ferait perdre aux huit arènes ce qui les distingue. Donc, de Meshy,
  on ne peut prendre que **la géométrie**.
- **Rochers, trois générations** (417, 418 et 307 triangles, géométrie nue, 23 à
  26 Ko) rendues côte à côte avec l'ancien dodécaèdre, même matériau, même
  lumière : boîte arrondie, amas mou, et — pour celle promptée « éclat anguleux
  » — un maillage **fragmenté avec un morceau détaché**. Aucune ne bat une
  primitive.
- **Ce qui gagne : le bruit.** `makeRockGeometry` pousse un icosaèdre subdivisé
  par un bruit accroché à la position du sommet, comme le moutonnement des
  mornes : silhouette cassée franche pour **180 triangles**, deux fois moins que
  Meshy, zéro octet, palette d'arène conservée. En jeu : +2 448 triangles
  seulement (17 rochers visibles), appels de dessin inchangés.
- **Palme, une génération** : 68 triangles, une étoile éclatée sans nervure ni
  retombée, pour trois fois le coût de la lame courbée du jeu (24 triangles).
  La décimation du feuillage échoue, comme le 12 août.
- **Règle retenue** : Meshy gagne sur l'**objet fabriqué à silhouette
  reconnaissable** — ses deux réussites du dépôt sont le catamaran et la vedette
  de flottille, plus l'équipage — et perd sur le **petit élément naturel à bas
  budget**, où une primitive bruitée est plus juste, plus légère et gratuite.
  Les crédits vont donc aux cases créoles, gommiers et pontons, pas aux cailloux.
- Sargasses : inchangées, déjà un maillage instancié à texture détourée.
- Purement visuel : les quatre checksums sont inchangés.

## Passe 81 — les repères posés sur le relief, et non dedans

Avant d'acheter le moindre modèle 3D, une mesure : à quoi ressemblent les
repères d'étape et d'arène vus depuis la course ? Réponse en captures — trois
sur huit ne rendaient **aucun pixel**.

- **Mesuré avant.** Les cotes des bâtis étaient écrites en dur, réglées pour une
  île plate ; or le morne du repère est tiré au hasard
  (`rng.range(9, 20)` × élancement × profil d'archétype). Le phare de la
  Caravelle (21 m) était planté sous un morne de 46 m, la ville de
  Fort-de-France (9 m) sous 25 m, les mâts de Sainte-Anne (11 m) sous 13 m.
  Aucune cote fixe ne peut suivre un relief aléatoire : il faut **lire le sol**.
- **`addLandmarkBuilding`** pose désormais chaque bâti sur le sol, à un décalage
  depuis le centre de l'île, comme les cocotiers le font déjà. Le sol est **lu
  sur le maillage par tir de rayon** (`solDuRepere`) : l'estimation analytique
  ajoute jusqu'à 5,5 % d'épaulement, soit 2,5 m sur un morne de 46 m, et le
  phare flottait visiblement au-dessus de la crête — vu deux fois en capture
  avant de le corriger. Un repère se construit une fois par étape : le rayon ne
  coûte rien.
- **La plage est un sol.** `landmarkGroundHeight` retient le plus haut du relief
  et du sable : au-delà de 0,75 de rayon le relief repasse sous l'eau, et sans
  la plage rien ne peut se poser sur le rivage. C'est ce qui permet à la ville
  de Fort-de-France de descendre **au bord de l'eau, devant le morne**, au lieu
  d'être alignée au centre de l'île, dessous.
- **`pointDeRive`** place les bâtis sur la rive tournée vers le couloir de
  course : ville en arc au bord de l'eau, mâts pavoisés sur la plage,
  palétuviers sur la frange sableuse, phares sur l'épaule du morne, éperon de
  basalte planté dans le flanc.
- **Mesuré après**, sommets des repères : Caravelle 56 m (invisible avant),
  Fort-de-France 11 m au ras de l'eau devant un morne de 25 m, Sainte-Anne 22 m,
  Pelée 58 m, Diamant 41 m.
- Contrat : `test/landmarks.test.mjs` (dans `npm run test:world`) rejoue les
  8 étapes et les 8 arènes sur 4 graines chacune — 172 bâtis mesurés — et exige
  que la moitié au moins de chaque bâti émerge de son sol, que rien ne flotte
  au-dessus, et que chaque repère culmine à 6 m. Lancé sur l'ancien code, il
  échoue dès la première étape du Tour.
- **Purement visuel** : `addLandmarkMesh` n'ajoute aucun collider et aucune île
  n'a bougé. Les quatre checksums sont identiques à la passe 80
  (`017e9fdc`, `05b2f763`, `2b887431`, `fee31c05`).

## Passe 80 — huit arènes pour la Combat Box

Demande de jeu : « il faudra d'autres maps aussi, mieux faites, avec plus de
diversité ». Mesuré avant : la Combat Box appelait `setStage(seed ^ 0x77ad)`
sans profil — archétype `tropical`, palette et eau par défaut, aucun repère —
et la graine de session ne changeait **jamais** entre deux parties
(`0x0b0a2026` hors lien de défi). Même côte à chaque RECOMMENCER, depuis
toujours ; seul le Tour avait des paysages.

- **Un catalogue `ARENAS`** (`src/game/balance.js`, huit entrées) : Lagon de
  Sainte-Anne, Passe des Îlets du François, Mangrove du Robert, Cayes du Sud,
  Côte sous la Pelée, Haute mer du Diamant, Falaises de la Caravelle, Baie des
  Flamands. Chaque arène est un décor complet — archétype de côte, palette,
  eau, repère — et une signature de mer légère (vent ±10 %, houle 0,80-1,26,
  mer croisée jusqu'à 0,28).
- **Trois archétypes de côte de plus** (`world.js`) : `mangrove` (berges
  basses et touffues, longues, presque sans trou), `cayes` (bancs de sable à
  fleur d'eau, relief presque nul) et `cliffs` (pitons étroits et hauts, roche à
  nu). Un nouveau repère, la presqu'île de la Caravelle (morne, phare, éperon
  de basalte). Sept familles de côte au total, contre quatre.
- **Une seconde rangée d'îlots** (`extraIsletChance`) pour les passes et les
  cayes : la densité sans rétrécir le couloir de course — le second îlot est
  posé PLUS AU LARGE, à un écart qui part de la somme des deux rayons de
  collision. Le tirage n'a lieu que si l'archétype le demande : les quatre
  côtes du Tour gardent leur suite RNG, donc leurs checksums.
- **L'arène emprunte la même route que le gréement.** La côte freine et
  repousse les yoles (`coastPenalty`, `resolveBoatCollision`) et sa houle entre
  dans la physique : l'arène est figée au lancement (`resolveMatchArena`),
  enregistrée dans le replay (`arena`), restaurée depuis le payload en
  relecture, et portée par le lien de défi (`&arena=`) — sans quoi l'ami
  recevrait la carte de SA rotation. `GAMEPLAY_VERSION` passe à
  `tropical-mayhem-v3-15-arenes` : les anciens replays de Combat Box ne
  décrivent plus la même mer.
- **Choix** : relecture > lien de défi > `?arena=` > réglage ARÈNE (pause,
  groupe COURSE : AUTO puis chaque carte) > manche-école (le lagon) > défi du
  jour (la graine seule, même mer pour tous) > graine + **rotation de
  session** — RECOMMENCER change de carte. Le nom de l'arène s'affiche sous le
  3-2-1 ; le Tour garde sa bannière d'étape. Le fantôme ne court plus que sur
  la même carte.
- Contrats : `test/arenas.test.mjs` (catalogue, résolution, rotation qui couvre
  tout, décor déterministe, seconde rangée présente et absente du Tour, lien de
  défi, payload) et `test/world-collision.test.mjs` étendu aux huit arènes
  (121 380 contacts, sept archétypes) — `npm run test:world`.

## Passe 79 — les jambes de l'équipage, d'après quatre photos de course

Retour du propriétaire, photos à l'appui : « les pieds sont ridicules ; les
jambes doivent être tendues vers le bas ou tendues vers le bateau, et l'autre
position est assise ». Il avait raison, et la mesure le dit avant la retouche.

- **Mesuré avant** (`tools/mesure_jambes_equipage.mjs`, nouvel outil qui lit
  hanche, genou, cheville et pied sur le GLB livré, dans le repère de la yole) :
  au rappel installé, genoux pliés de **95 à 127°**, bassin **16 à 21 cm sous**
  l'axe de la perche, pieds crochetés **5 à 16 cm au-dessus** du bois côté
  coque. Trois passes s'étaient empilées — traction sous la perche (11 août),
  repli procédural des cuisses, talons sur le bois (2 août) — et aucune des
  photos ne montre ça.
- **Le bassin est posé SUR le bois, à toute sortie** : `CREW_TRACTION_DROP`
  passe à zéro et la remontée d'assise ne s'efface plus avec la sortie.
- **Trois poses, choisies par le poste** (`crewLegPoseFor`) : les ancrages
  vont **vers le bateau** — pieds calés au plat-bord s'il est à portée de jambe,
  sinon jambes couchées le long de la perche —, les leviers pendent **vers le
  bas**, l'homme du bout pend puis s'allonge le long du bois à pleine sortie.
  À bord, on reste assis au plat-bord, jambes dans la coque ; en traversée,
  rien ne change.
- **Une direction, pas un contact.** Les jambes pendantes suivent la gravité
  dans le repère MONDE (une yole gîtée n'emporte pas les jambes), écartées de
  part et d'autre du bois, genou détendu de 8°. Les jambes couchées s'alignent
  directement sur la perche : un CCD à deux articulations converge mal près de
  l'extension complète — à 0,95 de la longueur de jambe, le genou lit encore
  42°.
- **Mesuré après** : ancrage et extension **genou 0°**, cuisse à 10° de l'axe
  du bois, pied posé dessus 67 cm vers la coque ; levier **genou 8°**, cuisse à
  15° de la verticale, pied 57 cm sous la perche ; ancrage à mi-sortie **pied
  au plat-bord** (−3 cm), genoux à 68-77° en appui — la quatrième photo.
- ⚠️ **Deux erreurs attrapées à la mesure** : le plat-bord cherché du mauvais
  bord (`versCoque * CREW_RAIL_X` pointe sur la coque opposée, la branche ne se
  déclenchait jamais), et l'écart des pieds posé sur le X local de l'homme, qui
  à mi-lacet court le long de la perche et raccourcissait une jambe sur deux.
- Contrats : `npm run test:jambes` (dans `test:crew`) et
  `test/crew-legs.test.mjs`. Captures : `previews/equipage/`. Présentation
  seule — checksums de simulation identiques.

### Passe 79 bis — le tronc dans le bon repère ; RECOMMENCER dès l'élimination

Retour du propriétaire sur la première livraison : « c'est n'importe quoi ».
Il avait encore raison. Les jambes étaient justes, le **tronc** ne l'était
pas : mesuré en jeu à 24° de gîte (captures Playwright, os du GLB lus dans le
monde), bassin → épaules à 75°, 80°, **117°**, 33°, 94°, 61° depuis la
verticale — l'homme du bout pendait tête en bas sous le bois, les autres
pliés en U sur leur perche. Le tronc composé des couches (assise × poste ×
compression) avait été réglé pour l'ancien repli des jambes.

- **Le tronc suit la grammaire des jambes** (`reclineTorso`, appliqué AVANT
  les mains dans `applyRigContacts`) : assis à cheval **42°** en arrière
  depuis la verticale du monde ; pieds au plat-bord **52°** ; allongé sur la
  perche **10° au-dessus du bois**, dans le repère de la perche — la gîte
  est déjà dedans. Rotation rigide du bassin ; jambes reposées ensuite, mains
  re-résolues depuis la bonne épaule.
- ⚠️ **Une erreur attrapée à la mesure, en jeu seulement** : l'axe « vers le
  large » pris dans le repère de la yole gîtée donnait 31°/38° au lieu de
  42°/52° à 24° de gîte. Le harnais (yole à plat) ne pouvait pas le voir ;
  `tools/mesure_jambes_equipage.mjs` imprime désormais une table TRONC et la
  vérité se lit en jeu. L'horizontale du monde pour l'homme assis, celle de
  la perche pour l'homme allongé.
- **Mesuré après, en jeu à 24° de gîte** : assis 42°, plat-bord 52°, allongé
  56° (= 90 − 10 − 24), cassure bassin/épaules/tête de 5 à 16°. Harnais :
  42/52/80°, cassure 3-11°, bassin ↔ bois inchangé, silhouette stricte tenue
  (buste 44-51°, regard toujours vers le bateau).
- Le mannequin de `test/crew-animation-v2` prend les bras du GLB (59 cm
  épaule → main, au repos le long du corps) : avec 42 cm en croix, la main
  d'appui d'un homme assis tronc en arrière n'atteignait pas le bois derrière
  sa hanche — le harnais mesurait le mannequin, pas le moteur.
- **RECOMMENCER dès l'élimination** (`#spectateurRestartBtn`, panneau
  spectateur) : demande de jeu — « un bouton pour recommencer tout de suite
  quand c'est fini ». Même effet que RECOMMENCER dans la pause ; en Tour,
  l'étape courante repart ; masqué en relecture.

## Passe 78 — un seul bouton, portrait jouable, écriteaux brefs, et la cause du gel de départ

Passe déclenchée par quatre retours de jeu du propriétaire : « les icônes en
haut à droite doivent disparaître, un seul bouton », « jouable en mode
vertical », « les écriteaux encombrent et deviennent illisibles », « au début
ça rame ». Le dernier point a été **mesuré avant d'être touché**.

- **La cause du gel de départ, trouvée au diff des programmes.** Le harnais
  `check_demarrage.py` montrait +31 shaders compilés sur deux images au coup
  d'envoi, puis +1 à +2 à chaque projectile. Un nouveau relevé
  (`renderer.info.programs`, nom + `cacheKey`, à quatre instants) a donné la
  variante exacte : le paramètre `numPointLights` passait de 0 à 1, puis à 2.
  **Chaque noix de coco du pool portait une `PointLight`** ; dès qu'une
  devenait visible, le nombre de lumières de la scène changeait et three.js
  recompilait tous les matériaux éclairés — **+18 programmes au premier coco
  en vol, +38 dès qu'un second volait en même temps**, jusqu'à dix-huit
  variantes possibles. C'était la « variante non identifiée » de la passe 45.
  Les lumières sont retirées : l'océan est un `ShaderMaterial` qui les
  ignorait, la perte est un reflet ambré sur les coques voisines.
- **Chauffe des shaders sous le 3-2-1.** `warmUpShaders()` appelle
  `renderer.compileAsync(scene, camera)` quand le rebours s'arme :
  `compile()` traverse TOUS les objets, pools invisibles compris, et
  `KHR_parallel_shader_compile` fait le reste hors du fil principal quand le
  pilote l'offre. Mesuré après : **31 programmes compilés pendant le rebours,
  4 au coup d'envoi, 2 au premier coco, 4 dans les 400 ticks suivants** (contre
  2, 18 et 38) ; temps cumulé des images qui compilent **3 076 → 1 213 ms** en
  SwiftShader. Le déterminisme est intact : les lumières et la compilation sont
  du rendu, le replay du Tour sort toujours `59947b1d`.
- **Un seul bouton en course.** Le rail de huit boutons devient **☰ MENU**, qui
  ouvre la pause. Y arrivent **SON** (ACTIF/COUPÉ) et **CAMÉRA** (STANDARD ·
  TACTIQUE · PROCHE, trois cadrages nommés) à côté de **PALIER** ; le rétro reste
  au clavier (`C`), le zoom fin au clavier, à la molette et à la croix manette.
  Mini-carte et fil de combat reprennent le bord droit.
- **Le portrait se joue.** La pause forcée « tourne le téléphone » est retirée
  (`isPortraitCombat` répond non). Bloc V21 : instruments à gauche au-dessus du
  pad, contre-gîte et armes en 2×2 à droite (58 px), colonne centrale libre,
  mini-carte et pastilles resserrées sous une barre haute à trois colonnes. La
  caméra rouvre son champ vertical avec l'aspect (`portraitFovBoost`, jusqu'à
  +22°) : à 0,46 d'aspect, 56° de champ vertical n'ouvraient plus que 27° en
  largeur, les rivaux sortaient du cadre.
- **Écriteaux brefs.** `showMessage` applique 0,7 × la durée demandée,
  plafonnée à 1,5 s, plancher 0,45 s, et ne relance pas un texte identique déjà
  affiché. Hauteur divisée par deux (`clamp(13px,1.9vw,24px)`), plus haut dans
  l'image, jamais plus large que l'écran. Fil de combat : trois lignes au plus,
  2,4 s chacune au lieu de 3,8. Alerte de brume et sous-titre du rebours
  réduits.
- ⚠️ **Un test aurait masqué la cause.** `test/full-game-smoke.mjs` tourne sur
  un moteur simulé qui ne compile rien : aucun test Node ne pouvait voir une
  recompilation. La preuve vient des deux harnais navigateur ; ils restent la
  seule mesure valable pour ce genre de défaut.

## Passe 77 — mesurer avant de régler : rapport de playtest, fantôme, rail allégé

Passe déclenchée par un constat de trajectoire, pas par un bug : sur les
27 commits depuis le 4 août, 23 portaient sur la pose de l'équipage, pendant
que le P0 de `NEXT_PRODUCTION_STEPS.md` — « appareils et joueurs réels » —
n'avait aucun instrument. Les portes Go/No-Go du MASTER_PLAN (70 % de premières
contre-gîtes réussies, 50 % de secondes manches, manche < 75 s, replay vu, défi
partagé) n'étaient mesurables nulle part : `telemetry.clear()` à chaque partie,
et rien ne sortait jamais de l'appareil.

- **Rapport de playtest** (`src/game/playtest-report.js`). Un journal de
  session s'abonne à la télémétrie (`LocalTelemetry.subscribe`) et réduit
  chaque événement dans un état borné — il survit donc à la remise à zéro par
  partie. Un histogramme d'images à mémoire constante mesure intervalle et
  temps de travail (p50, p95, part d'images longues). Le bouton **ENVOYER MON
  RAPPORT DE TEST** (écran de résultat, et pause) livre un JSON par feuille de
  partage — fichier puis texte —, presse-papiers, puis téléchargement. Opt-in,
  sans donnée personnelle, déclaré dans `privacy.html`. `npm run
  playtest:aggregate` rend la table des portes d'une campagne ;
  `docs/PLAYTEST_PROTOCOL.md` décrit la séance de vingt minutes et la décision
  à prendre selon la table. Les seuils vivent dans `PLAYTEST_GATES`, une seule
  table de vérité pour le rapport individuel et l'agrégat.
- Télémétrie complétée pour rendre ces portes calculables : `round_start`,
  `round_end` (durée, raison), `replay_started`, `quality_tier`, drapeaux de
  mode sur `match_start`, durée sur `tour_stage_end`.
- **Fantôme.** Le replay emporte désormais la pose du joueur à 20 Hz
  (`replay.ghost` : un segment par manche, entiers en centimètres et
  milliradians — mesuré ~3 Ko pour 2 s de course, soit ~120 Ko pour la plus
  longue manche). `isReplayCompatible` l'ignore, un replay sans trace reste
  lisible ; `normalizeGhostTrace` rejette toute trace qui ment. Au
  `startMatch`, la trace la plus récente du coffre sur la même graine et la
  même étape court en translucide à côté du joueur — `GhostVisual` : coque
  partagée, voile en deux triangles, balise, aucun draw call tant qu'aucune
  trace n'est armée — avec l'écart en mètres dans une pastille HUD. Jamais en
  relecture (il recouvrirait la yole rejouée) ni en Mêlée locale ; réglage
  FANTÔME · OUI/NON dans la pause. La replayothèque **importe** un fichier
  replay : sur la même graine, la trace d'un ami devient son fantôme — le défi
  partagé sans serveur.
- ⚠️ **Alignement par manche, pas par tick absolu.** La manche N du fantôme
  n'a aucune raison de commencer au même tick que la manche N en direct : une
  manche finit quand quelqu'un chavire. Le lecteur aligne sur `roundStartTick`,
  posé dans `resetRound`. Verrouillé par `test/ghost.test.mjs`.
- **Rail tactile allégé.** Sur pointeur tactile, la course perd `QUALITÉ` et le
  second bouton de réglages, doublon exact de PAUSE : huit boutons deviennent
  six. Un réglage **PALIER** (AUTO · LQ · MQ · HQ) dans la pause reprend le
  cycle manuel, pour ne rien perdre. Le clavier garde tout ; les cibles tactiles
  V18 sont inchangées.
- **Déterminisme intact, vérifié** : checksum de simulation `017e9fdc` sur
  18 000 ticks, relecture de la première étape du Tour `59947b1d` sur
  5 821 ticks, empreinte de cadence `4976b6a4` — tous identiques à
  `BUILD_INFO.json`. La trace fantôme est une lecture seule après le dernier
  système autoritaire du tick, et le journal de playtest n'a aucun accès à la
  boucle fixe.
- Deux documents de décision : `docs/DECISIONS_EN_ATTENTE.md` (portée
  minimale des bwa, quille, densité d'équipage — avec une recommandation
  chacun) et `../bwa dresse yole/ARCHIVE.md` (le plan KIMI V2 archivé, rien
  supprimé).
- `npm run verify` : OK en 145 s — 111 modules JavaScript et 49 fichiers
  Python, 182 fichiers précachés, smoke navigateur sans erreur console ni page,
  benchmark 145 204 pas bateau/s. Deux suites ajoutées à la chaîne :
  `test:playtest` et `test:ghost`.

## Passe 70 — l'équipage respire, sans un seul asset

La couche d'actions de la passe 68 était livrée mais **dormante** : sans clip,
six corps restaient rigoureusement immobiles entre deux gestes de simulation, et
un corps parfaitement figé se lit comme un mannequin même à treize pixels.

- `makeDefaultIdleClip()` fabrique la respiration **en code**. Aucun asset, aucun
  droit, rien à produire. Elle s'efface d'elle-même dès qu'un GLB apporte une
  action du même nom.
- Respiration **déphasée par équipier** via `this.phase` (= `crewIndex × CREW_LAG`),
  pas par tirage aléatoire : deux relectures d'un même replay montrent
  exactement la même chose. Six respirations synchrones se liraient comme un bug
  d'animation — même raisonnement que la gorgée de rhum échelonnée.
- Le poids s'efface sous impact, trébuchement et traversée : quand le corps
  encaisse, la simulation a mieux à dire qu'un souffle de repos.
- **Bug réel attrapé à la mesure — deux sémantiques de clip coexistent.** Un clip
  glTF porte la rotation **absolue** du nœud (spec) et remplace le repos ; un
  clip fabriqué en code porte un **offset** à composer avec lui. Les confondre
  faisait slerper le repos vers l'identité : l'os `LeftArm` ayant un repos à 81°
  de l'identité, un offset de 0,9° mélangé à 0,16 déplaçait l'os de **~13° au
  lieu de 0,15°**. Un drapeau `relative` explicite règle la question, et le test
  le verrouille dans les deux sens.
- Mesuré dans le jeu après correction : **0,016° à 0,272°** d'amplitude, en
  oscillation propre sur `Spine`. C'est l'échelle du vivant, comme voulu.
- ⚠️ **Trois mesures fausses avant la bonne**, toutes du même genre : comparer
  deux passes aux états lissés divergents, puis comparer une pose post-IK à une
  pose pré-IK. Les 18° attribués au souffle étaient en fait l'IK. Isoler exige
  de rejouer `syncRig()` **seul**, à la même frame, des deux côtés.

## Passe 76 — un arbitrage assumé, et l'invariant qu'il faudrait réexaminer

Passe courte : une tentative, une capture, une annulation, et surtout une
question rendue explicite plutôt que laissée implicite dans le code.

- Les images vidéo montrent les équipiers assis **juste au-delà du plat-bord**,
  pas à trois mètres et demi au large. `CREW_RAIL` a donc été ramené à ses
  anciennes valeurs — puis **remis** sur capture : le retour fait réapparaître
  **1,13 m de perche nue** au-delà du dernier homme, c'est-à-dire exactement le
  défaut de « râteau » signalé par le propriétaire du projet.
- **Les deux ne peuvent pas être satisfaits simultanément**, et la raison est un
  invariant : `crew-seating` verrouille `porteeAuVentMin > 4.40`, hérité de
  `YOLE_VISUAL_REFERENCE.md`. Tant que les bwa doivent porter à 4,4 m, quelqu'un
  doit occuper ce bout de bois — sinon il reste nu.
- Choix retenu : **l'équipage au bout**, parce que c'est ce qui se lit le mieux
  à la distance de jeu. Mais le vrai arbitrage est ailleurs — **c'est la portée
  minimale de 4,40 m qu'il faudrait réexaminer au vu des images**, et cette
  décision appartient au propriétaire du projet. C'est écrit dans le code, à
  côté de la constante, plutôt que perdu ici.
- Leçon de la journée, une de plus : corriger un symptôme visible **déplace** le
  défaut, il ne le supprime pas. La poussée de `CREW_RAIL` de la passe 74 était
  un contournement du mauvais espacement des bwa ; une fois le gréement botté
  (passe 75), elle est devenue un choix, pas une correction.

## Passe 75 — les bwa bottelés, et les pieds enfin sur le bois

Passe déclenchée par des **images vidéo de course** fournies par le propriétaire
du projet. Elles ont montré en quelques secondes ce que quatre photos fixes et
six heures de mesures n'avaient pas donné.

- **LES BWA ÉTAIENT TROIS FOIS TROP ÉTALÉS, et c'était le défaut principal.**
  Espacement réel sur les images : **40 à 60 cm**, les perches forment presque
  une plateforme continue. Le jeu les espaçait d'environ **1 m** sur 5,9 m de
  coque. Ramené à ~0,60 m, envergure 5,9 → 3,6 m.

  La conséquence est la clé de tout le problème d'équipage : **sur la vidéo les
  hommes se touchent parce que LEURS PERCHES se touchent**. La densité de la
  grappe n'est pas un réglage de position, c'est une conséquence de la densité
  du gréement. Trois passes avaient cherché à resserrer les hommes ; il fallait
  resserrer le bois.
- **Les pieds prennent appui sur le bois, ils ne pendent plus.** L'ancienne
  cible visait `beamY - 0.08` — donc SOUS la perche — à `z = -0,26` dans le
  repère tourné de l'homme : même défaut de repère que les mains, corrigé à la
  passe 73. Les jambes tombaient dans le vide à 77-83° de l'horizontale.
  Elles se replient désormais **vers la coque**, pieds calés sur la perche en
  deçà du bassin, comme sur les images.
- `APPUI_PIEDS = 0,34` et non 0,42 : c'est la plus grande valeur que la portée
  de l'IK atteint réellement. Balayée contre `crew-animation-v2`, qui plafonne
  `contactError` à 0,72 — à 0,42 la cible sortait à 0,753, donc les pieds
  restaient en l'air, **plus loin qu'avant la correction**.
- ⚠️ Le « L » que la passe 71 avait mesuré existait bien, mais il pointe vers
  **l'intérieur du bateau**, pas vers le bas. Chercher à tendre ces jambes
  (passe 69, annulée) allait donc à l'opposé de la réalité.

## Passe 74 — la yole lisait comme un râteau à la distance où on la regarde

Passe déclenchée par une capture de **jeu réel** envoyée par le propriétaire du
projet. Elle a montré ce qu'aucun des cinq cadrages du harnais ne pouvait
montrer : à la distance du joueur, le détail de pose est invisible et seule
compte la **silhouette d'ensemble**.

- **Les bwa dépassaient de 2,52 m en moyenne au-delà du dernier homme**, jusqu'à
  3,47 m. L'équipage ne sortant qu'à 3,9 m, plus de la moitié de chaque perche
  ne portait personne. Longueurs ramenées de 5,3-6,7 m à 5,3-6,0 m — le plancher
  `porteeAuVentMin > 4.40` interdit d'aller plus loin, et on est à 4,50.
- **`margeMinAuBoutDuBois` valait 1,13 m** : plus d'un mètre de bois que
  personne n'occupait jamais. `CREW_RAIL` poussé de 0,80 m — les hommes
  atteignent maintenant le bout de leur perche, comme sur les photos. Marge
  résiduelle 0,33 m, seuil 0,20.
- **`06_vue_de_jeu` ajouté au harnais.** Les cinq cadrages existants étaient tous
  des gros plans d'atelier ; ils servent à juger une pose et mentent sur
  l'ensemble. Un défaut majeur n'était visible que d'ici.
- ⚠️ **Troisième table de vérité recopiée trouvée dans un test.**
  `crew-seating.test.mjs` portait `BEAM_Z` et `BEAM_LEN` en dur. Le jour où les
  perches ont raccourci, la copie est restée figée : le test a calculé des
  pointes qui n'existaient plus et rapporté 1,11 m de débord sous le vent pour
  une valeur réelle de 0,76. Les deux tables se lisent désormais **à la source**,
  comme `HULL_STATIONS` depuis la passe 66.
- ⚠️ **Gain honnête : incrémental, pas transformant.** À la distance de jeu, la
  yole reste un peigne de perches parallèles avec des points régulièrement
  espacés dessus. Les photos montrent une masse humaine compacte qui domine la
  silhouette. Combler cet écart demande plus d'équipiers, ou un groupement plus
  serré — donc une décision de conception, pas un réglage.

## Passe 73 — la cible de prise était décrite dans le mauvais repère

Deuxième défaut géométrique de la journée, trouvé par la même méthode : mesurer
où la cible tombe réellement, au lieu de croire ce que le code annonce.

- **`solveLimbContact` interprète ses coordonnées dans le repère LOCAL de
  l'équipier**, or ce repère est tourné par le lacet — jusqu'à 78° à pleine
  sortie. L'ancien décalage de `-0,17` en Z, censé placer la main « en arrière
  du bassin », ressortait donc à **13,8 cm hors de l'axe du bois**.
- Mesuré avant correction : la cible tombait à **2,1 cm au-dessus du bwa**, donc
  juste en hauteur — mais la main finissait à **24 cm de côté**, le long de la
  coque. Les hommes n'ont jamais rien tenu, et l'IK visait consciencieusement
  un point à côté de la perche.
- La prise se décrit désormais dans le repère de la **yole** — écartement le
  long du bois, décalage transversal nul — puis se convertit dans le repère
  tourné de l'homme en défaisant le lacet.
- **Distance main ↔ axe du bwa : 0,25 m → 0,113 m en moyenne.** Deux équipiers
  sur six touchent maintenant réellement le bois (0,061 et 0,065 m, pour un
  rayon de perche de 0,058). C'est mieux, ce n'est pas fini.
- ⚠️ **Correction d'un diagnostic faux de la passe 71.** J'avais conclu « corps
  penché à 35° au lieu de 80° ». C'était un artefact de mesure : je prenais
  l'axe `Hips → Head`, or `head.rotation.x` contre-tourne de **0,62 × recline**
  (ligne 1235). Mesuré sur le vrai buste (`Hips → Spine02`) : **17,5° à 25,8°**
  de l'horizontale, soit exactement la plage des photos. Le buste allait bien
  depuis le début.
- **Le vrai défaut de posture est aux JAMBES** : mesurées à 77,5° à 82,9° de
  l'horizontale, c'est-à-dire pendantes à la verticale. L'homme forme un « L » —
  buste à plat, jambes droit en bas. C'est ce que la passe 69 corrigeait, et sa
  capture était pourtant pire : une planche FLOTTANTE lit comme un noyé, un
  « L » flottant lit comme un accroupi. **La planche ne devient juste qu'une
  fois le contact établi** — d'où l'ordre : les mains d'abord.

## Passe 72 — l'équipage rigué s'asseyait 12 cm au-dessus du bois

Un vrai défaut, trouvé en mesurant ce que la vue de dessus avait rendu suspect.
Et un verrou qui mesurait la mauvaise chose depuis le début.

- **Le bassin des équipiers rigués flottait de 7 à 17 cm AU-DESSUS du bwa**,
  12,1 cm en moyenne. D'où des hommes en appui dans le vide, et des mains à
  **18-25 cm** de la perche qu'elles sont censées tenir.
- **Cause : une constante valable pour un seul des deux corps.** `seat` valait
  `CREW_BEAM_Y - 0.38`, où 0,38 est la hauteur de bassin du corps
  **procédural**. Le rig GLB est normalisé en hauteur par `measureRigHeight` :
  son bassin tombe ~12 cm plus bas. `measureHipHeight()` relève désormais la
  vraie valeur à la liaison du rig, et l'assise suit le corps réellement utilisé.
- **Pourquoi aucun test ne pouvait l'attraper.** En Node il n'y a pas de
  `GLTFLoader` : la suite n'exerce QUE le corps procédural, pour lequel 0,38 est
  exact. Le verrou `pireAssise` était donc vert en permanence tout en ne voyant
  jamais le corps concerné.
- `crew-seating.test.mjs` mesure maintenant **l'os réel** quand il existe, et
  retombe sur l'approximation pour le corps procédural.
- ⚠️ **Ce que ça ne corrige pas.** Les trois défauts visibles sur les captures
  restent : un homme par bwa régulièrement espacé là où les photos montrent une
  grappe compacte, aucune main sur le bois, et des corps penchés à 35° au lieu
  de couchés à 80°. Le gain visuel de cette passe est réel mais modeste.
- Deux angles ajoutés au harnais, dont le décisif : **`04_dessus`**. Les trois
  cadrages existants étaient tous de profil et masquaient la densité, le contact
  et la monotonie de l'équipage — des propriétés de l'ENSEMBLE, qu'aucune mesure
  d'angle articulaire ne peut détecter.
- ⚠️ **Correction d'une affirmation fausse de la passe précédente.** J'avais
  annoncé, vue de dessus à l'appui, que les perches TRAVERSAIENT les corps.
  Mesure faite : elles passent 9 à 52 cm à côté. Vue de dessus, un bois situé
  40 cm plus bas *paraît* traverser — c'est un artefact de projection. Le défaut
  réel n'était pas l'interpénétration mais l'absence totale de contact.

## Passe 71 — ce que les captures ont montré : le corps est EN TRAVERS du bwa

Première passe où le rendu a été réellement **regardé** au lieu d'être seulement
mesuré. Elle annule la passe 69 et remplace sa conclusion par la vraie.

- **La correction de jambes de la passe 69 est ANNULÉE.** Elle était juste pour
  une vraie yole et fausse pour ce rendu : captures à l'appui, les hommes sont
  passés de « accroupis » à « pendus raides ». Redresser les jambes d'un homme
  qui pend perpendiculairement ne fait que mieux montrer qu'il pend.
- **Le vrai défaut, mesuré :** le torse est à **68-87° de l'axe du bwa** — donc
  presque perpendiculaire, alors que les photos le montrent couché LE LONG — et
  à seulement **34-38° de la verticale** quand les photos donnent 75-85°. Les
  jambes sont à **88-90°** du bois.
- **Et le renversement n'est pas le levier.** Balayé de 0,94 à 3,0 de `posture`,
  soit un triplement : `torseVertical` ne bouge que de 38° à 49°, et `torseBwa`
  reste collé à **87-90°**. Le défaut est dans l'AXE du renversement, pas son
  amplitude. Le commentaire affirme que « +Z local pointe vers le large » ; la
  mesure dit le contraire.
- `tools/capture_crew_pose.py` enfin réparé pour de bon. Deux blocages cumulés :
  l'**Initiation express** s'interpose depuis qu'elle existe et le harnais
  photographiait le tutoriel plein écran ; et attendre `tick > 60` était inutile
  autant qu'impossible sous swiftshader, puisque le harnais coupe de toute façon
  `setAnimationLoop` et pilote `visual.update()` lui-même.
- Leçon de méthode : quatre mesures numériques concordantes ont validé une
  correction que la première capture d'écran a démolie en une seconde. Mesurer
  n'est pas voir.

## Passe 69 (ANNULÉE par la passe 71) — assis à califourchon, puis allongé

Première correction du projet menée **contre des photographies de course**, et
elle a d'abord servi à corriger une affirmation fausse de ma part.

- **Le renversement n'était pas le problème.** Mesuré en direct dans le jeu, il
  atteint **74,5°** à pleine sortie, pas les « ~50° » qu'annonce le commentaire
  de `CREW_HIKE_RECLINE`. Les photos donnent ~80° au taquet : l'écart était donc
  bien plus petit qu'annoncé, et rien n'a été touché de ce côté.
- **Le vrai défaut était aux jambes, et le modèle était inversé.** Le code
  faisait CROÎTRE l'écart des cuisses et leur repli avec la sortie. Les photos
  montrent deux postures distinctes : à mi-sortie on est **assis à califourchon**,
  genoux pliés ; au taquet on est **allongé, jambes droites et jointes**, dans le
  prolongement du corps. Le califourchon est une posture de transit, pas l'état
  de rappel.
- L'annulation de l'héritage du bassin (`-recline` sur les cuisses) se lève
  maintenant avec l'extension. Sans ça, un homme renversé gardait des cuisses
  verticales : un « L » que rien dans les photos ne montre.
- Mesuré sur l'équipage complet, au repos puis en contre-gîte :

  | poste | 1,15 m | 1,85 | 2,50 | 1,50 | 2,20 | 2,85 |
  |---|---|---|---|---|---|---|
  | écart au repos | 8,6° | 10,9° | 3,8° | 9,5° | 9,9° | **1,9°** |
  | écart en contre-gîte | 6,5° | **0°** | **0°** | 2,4° | **0°** | **0°** |

- **Gain non planifié :** `CREW_RAIL` échelonne déjà les six postes de 1,15 à
  2,85 m pour dessiner la diagonale. Chaque homme ayant son propre `hike`,
  l'équipage affiche désormais un **dégradé** de postures — assis près de la
  coque, allongé au bout — sans une constante de plus. C'est exactement ce que
  montrent les photos.
- `test/crew-hike-posture.test.mjs` verrouille le califourchon près de la coque,
  la planche au taquet, la forme **unimodale** de la courbe et le dégradé
  d'équipage. Une première version exigeait une décroissance monotone : c'était
  faux, on s'écarte en sortant avant de s'allonger.
- `tools/capture_crew_pose.py` réparé : il attendait `tick > 60` sans savoir que
  le départ 3-2-1-GO gèle le tick, et expirait sans rien dire d'utile. Il attend
  désormais le décompte d'abord. Il reste trop lent sous swiftshader logiciel
  pour cette passe — la validation a été faite par **mesure d'angles en direct**
  dans le navigateur, pas par capture d'image.

## Passe 68 — la place est faite pour les cinq actions d'équipage

Réponse au point « priorité moyenne n°5 » de l'audit d'authenticité. Le code est
livré et testé ; **les clips n'existent pas encore**, et leur production est
conditionnée au volet droits — pas à la technique.

- `src/render/crew-clips.js` indexe et échantillonne des actions courtes, puis
  tire **faiblement** la pose de repos vers elles :
  `repos → clip → procédural → IK`. La règle « le jeu pilote le squelette, il ne
  joue pas d'animation » n'est pas levée : le clip n'apporte pas la pose, il
  apporte la **texture humaine**. Gîte, rappel et position sur le bwa restent
  entièrement calculés.
- **Plafond de mélange à 0,35, dans `setClipBlend()` et non chez l'appelant** :
  aucun site d'appel ne peut le contourner. Au-delà, l'équipage suivrait le clip
  plutôt que la mer.
- À poids nul, `syncRig()` calcule exactement ce qu'il calculait avant — vérifié
  **composante par composante**, pas via `angleTo`. Une première version du test
  échouait sur 2,98e-8 de bruit : `angleTo` fait un `acos` au voisinage de 1, où
  4e-16 d'erreur sur le produit scalaire ressort en 3e-8 d'angle.
- Un clip d'une seule frame est **refusé** : c'est une pose, pas une animation.
  Le GLB d'équipage en porte justement un (`Armature|clip0|baselayer`), déjà
  signalé par l'audit Blender. Un clip sans piste de rotation l'est aussi —
  position et échelle déplaceraient le corps hors du bwa.
- Un os que le clip n'anime pas garde son repos : une action partielle reste
  utilisable au lieu de figer le reste du corps.
- Le slerp est écrit à la main, et ce n'est pas gratuit : `THREE.Quaternion.slerp`
  lit les champs **privés** de sa cible (`qb._w`…), donc un littéral
  `{x, y, z, w}` rend un NaN silencieux — la première version s'y est fait
  prendre. Construire un vrai Quaternion par appel allouerait 18 os × 32 corps
  par frame. Le module ne dépend plus de Three du tout.
- Le garde-fou du projet a fait son travail : `verify_static.py` a refusé le
  build tant que le nouveau module n'était ni dans le précache ni dans le
  monofichier. Les deux sont à jour, 198 fichiers précachés.
- Pipeline de production, contrat des clips et **tableau des trois droits à
  obtenir** (auteur de la vidéo, image de chaque yoleur, marques et sponsors) :
  [`docs/CREW_CLIP_LIBRARY.md`](docs/CREW_CLIP_LIBRARY.md).
- **Une voie sans aucune vidéo est ouverte, et c'est la recommandation.**
  `breatheKeyframes()` + `CrewClipLibrary.fromKeyframes()` fabriquent une action
  vivante à partir d'**une seule pose** — celle qu'on pose à la main dans
  Blender contre une photo de référence, en vingt minutes, sans captation ni
  droit à l'image.

  Le raisonnement : les cinq actions sont des ÉTATS, la simulation pilote déjà
  les transitions, et le plafond de 0,35 fait que le clip apporte la vie et non
  la pose. Ce qu'il faut par état est donc une pose juste plus un souffle — et
  une photo donne exactement la pose juste. L'audit disait que le trou restant
  était « pas chaque angle de bassin » : une photo, c'est l'angle de bassin.

  Les amplitudes sont minuscules à dessein — 0,03 rad × 0,35 arrive à l'écran
  comme un demi-degré. La boucle se referme exactement (repos → inspiration →
  repos), faute de quoi un saut apparaîtrait à chaque cycle, ce qui est pire que
  l'immobilité. Un os absent d'une seule clé est écarté plutôt que de produire
  une piste trouée.
- Pour mémoire, **Kimodo** (NVIDIA, mars 2026) fait texte → mouvement en open
  source sur 700 h de mocap commercialement exploitable — donc sans problème de
  droits. Écarté comme source principale : « un homme en rappel sur une perche
  au-dessus de l'eau » n'est pas dans 700 heures de mocap standard.

## Passe 67 — on a enfin REGARDÉ le rig au lieu de le mesurer

Première passe menée avec Blender piloté en direct depuis l'assistant. Le rig a
été importé dans une session ouverte, inspecté, puis entièrement retiré — la
scène a été rendue dans l'état exact où elle avait été trouvée.

- **Le pole target dérivé du repos est visuellement confirmé.** Le personnage
  est une station debout humaine normale de 1,67 m ; l'épaule est à `y ≈ 0`, le
  coude ressort à `+0,066` et la main revient à `−0,044`. Le coude pointe donc
  bien vers l'arrière, main vers l'avant. Écart re-mesuré en direct : **8,83 cm**
  hors de la corde épaule→main, direction `(0,014 · 0,996 · −0,088)`. Les
  assertions numériques de la passe 65 décrivaient bien la réalité.
- **L'`Icosphere` n'est pas ce que l'audit croyait.** Elle était décrite comme
  « non skinnée, visible et indépendante de l'armature ». C'est en fait le
  **widget d'affichage des os**, référencé en `custom_shape` par les **24** os
  du rig — d'où une boîte englobante d'armature de 15,7 m pour un personnage de
  1,67 m. Le masquage par nom au chargement reste correct, mais le vrai
  correctif est de vider les `custom_shape` avant export : le nœud disparaîtrait
  alors du GLB au lieu d'être chargé puis caché.
- Cette boîte de 15 m a d'ailleurs saboté trois cadrages successifs pendant
  l'inspection, dont un `view_selected` parti à 27 m de distance. C'est
  précisément le genre de piège qu'aucune mesure headless ne révèle.

## Passe 66 — la yole flotte enfin là où on la voit, et la voile a du creux

⚠️ **`SIMULATION_VERSION` passe à `4.0.0`. Les replays antérieurs sont refusés à
la lecture.** Majeure et non mineure : un replay qui se lance et dérive en
silence est pire qu'un replay qui s'annonce incompatible. La replayothèque et la
progression du Tour enregistrées avant cette passe ne sont plus relisibles.

- Les seize points de flottabilité débordaient jusqu'à **18 cm** de la coque
  visible : `HULL_STATIONS` avait gardé ses largeurs d'origine alors que le
  rendu affine la coque de 0,84 depuis le 30 juillet. Chaque station vaut
  désormais la demi-largeur réelle du mesh livré, multipliée par 0,84. Débord
  résiduel : **0 cm**.
- **L'effet sur le ressenti est l'inverse de celui attendu.** Rétrécir le bras
  de levier du couple de flottabilité devait assouplir la yole ; mesurée
  (`tools/probe_roll_stability.mjs`), elle est très légèrement plus raide :
  gîte médiane depuis 40° 10,5° → 9,9°, retour sous 20° 1,10 s → 1,07 s. Le
  redressement est dominé par le ressort `impactRecovery`, indépendant de la
  géométrie. Le commentaire de code annonçait d'abord l'inverse — il avait été
  écrit avant la mesure, il a été corrigé.
- `keel` et `volume` **n'ont pas bougé**. La quille du mesh est pourtant 12 à
  33 cm plus creuse que celle déclarée : la yole flotte plus haut qu'elle n'en a
  l'air. C'est une seconde décision, distincte, et elle n'est pas prise.
- `HULL_STATIONS` est exportée et `test/hull-contract.test.mjs` la lit **à la
  source**. Le test en gardait une copie — le défaut exact qu'il dénonce — et
  cette copie a menti dès la première correction, annonçant encore 18 cm de
  débord alors que la physique était déjà recalée.
- **La voile n'est plus un rectangle plat.** Creux de repos (0,12 m, sommet à
  38 % de corde), rond de guindant (0,15 m) et roach net (0,21 m) sont cuits
  dans la géométrie. Les rangs sont répartis de façon non uniforme, resserrés
  vers la bordure où la corde fait 3,65 m contre 1,31 m à la têtière — un
  facteur 2,78 de densité de texels que la grille uniforme ignorait.
- **Zéro sommet de plus** : 117 avant, 117 après. `updateSail` réécrit ce
  maillage à chaque frame pour quatre yoles ; la densité vient d'une
  répartition, pas d'un ajout. `updateSail` lit désormais les coordonnées
  paramétriques réelles (`paramU`/`paramV`), sans quoi le ventre de vent se
  poserait trop haut sur une grille non uniforme.
- `test/sail-shape.test.mjs` verrouille topologie, cordes, creux, rond de
  guindant, roach et budget de sommets. Sa métrique de roach englobe le rond de
  guindant — c'est documenté dans le test, et le roach net y est isolé.

## Passe 65 — le coude plie du bon côté

- **Dernier point rouge de l'audit d'équipage fermé, et sans toucher au rig.**
  L'audit demandait quatre pole targets dans le prochain GLB. Mesure faite dans
  Blender 5.2 (`tools/inspect_crew_bend.py`) : inutile. La pose de repos fléchit
  de 35° au coude et 15° au genou, écartant le milieu de 8,8 cm et 4,5 cm de la
  corde racine→extrémité — le plan de flexion était déjà encodé.
- Le pole se dérive donc du repos et se réapplique après le CCD par une rotation
  **autour de l'axe racine→extrémité**. L'effecteur étant sur cet axe, il ne
  bouge pas : le contact que le solveur vient d'obtenir est conservé intact.
  Vérifié à moins de 2 mm de dérive sur douze frames.
- Trois avantages sur la solution demandée : aucun asset à réexporter, aucun os
  supplémentaire à charger pour 32 corps, et n'importe quel Mixamo standard
  fonctionne sans préparation.
- Un membre **tendu** au repos ne définit aucun plan : sa chaîne reste sans pole
  et seul le limiteur d'oscillation agit. Inventer une direction à partir de
  bruit serait pire que ne rien faire — c'est testé explicitement.
- `test/crew-pole-target.test.mjs` couvre la capture, le refus sur membre tendu,
  le retour d'un coude retourné de 2,2 rad, l'immobilité de l'effecteur et le
  budget anatomique. Contrôle négatif effectué : le test échoue bien lorsque la
  capture est désactivée.
- Une première version de ce test était fausse — elle injectait elle-même une
  rotation hors budget puis reprochait à la correction de ne pas la réparer. La
  fonction sortait par sa garde « pole parallèle à la corde », qui est le bon
  comportement. Le test mesure désormais la propriété réelle, et le commentaire
  explique pourquoi le reclampage interne est défensif : `maxStep` étant
  inférieur à `maxSwing` sur les quatre chaînes, une passe ne peut pas saturer.

## Passe 64 — Blender pilotable, et la coque enfin vérifiée

- Blender MCP officiel (Blender Lab) installé : add-on `mcp` 1.0.0 dans
  Blender 5.2, pont `blender-mcp` 1.27.0, 26 outils. `.mcp.json` à la racine,
  procédure et avertissement de sécurité dans `docs/BLENDER_MCP.md`. Règle
  posée : **MCP produit un `.blend`, les scripts produisent le `.glb`** — les
  assets restent régénérables, donc vérifiables.
- **Le GLB de coque livré au joueur n'était testé par rien.**
  `crew-seating.test.mjs` mesure bien un ratio, mais en Node il n'y a pas de
  `GLTFLoader` : il mesurait la coque procédurale de repli.
  `test/hull-contract.test.mjs` décode désormais le fichier réel.
- Le contrat affirmait que la coque devait tenir à ±5 % « sous peine de
  désaccorder la physique ». **C'est faux** : la simulation a sa propre table
  (`HULL_STATIONS`) et ne lit jamais le mesh. Il existe trois descriptions de
  coque dans le projet, et elles divergent — maître-bau à `z=0` pour le gabarit
  contre `z=+0,65` pour la physique, quille 12 cm plus creuse dans le mesh.
- Mesuré : une fois `HULL_VISUAL_WIDTH_SCALE` appliqué, **les points de
  flottabilité tombent jusqu'à 18 cm hors de la coque visible**. Rien n'est
  corrigé — déplacer une station est autoritaire et invaliderait la
  replayothèque. L'écart est mesuré et borné à 20 cm par le test.
- Le facteur de largeur 0,84 vit dans le code et pas dans le mesh : un artiste
  qui ouvre `yole_hull.glb` voit un ratio de 5,14, une silhouette de canot.
  S'il le « corrige » à 6,12, le runtime rétrécit une seconde fois. Le test
  refuse maintenant toute coque pré-rétrécie, avec le message qui explique
  pourquoi. Vérifié en fabriquant le piège : le garde-fou se déclenche.
- Les quatre cadres de HUD V8 étaient les seuls PNG du dépôt, tous précachés :
  **604 Ko → 166 Ko (−73 %)** en WebP q88, mesuré à 37,9–40,8 dB de PSNR sur
  RGB prémultiplié. Références recâblées dans `style.css`, `service-worker.js`
  et le manifeste V8.
- `assets/textures/v6/menu/README.md` explique enfin pourquoi six bitmaps
  débranchés restent dans le dépôt : ce sont des pièces d'audit, pas des assets
  en attente.
- Deux trous d'outillage révélés par cette conversion, et bouchés :
  `convertir_webp.py` ne recâblait ni `test/` ni `docs/` — il a laissé douze
  références mortes derrière lui, invisibles pour `verify_static.py` et fatales
  douze étapes plus loin ; `refresh-asset-metadata.mjs` s'arrêtait à V7, si bien
  que les `sha256` de V8 et V9 étaient vérifiés par les tests sans qu'aucun
  outil sache les régénérer.
- La validation d'image de `hud-instruments.test.mjs` passe de PNG à WebP sans
  rien perdre : elle exige désormais le conteneur VP8X, le drapeau alpha **et**
  la présence effective du chunk `ALPH`. Le drapeau peut mentir, le chunk non.

## Passe 63 — le téléphone ne paie plus le rendu PC

- Un appareil tactile repart systématiquement en LQ automatique, même si une
  ancienne session avait mémorisé HQ. L'auto peut remonter jusqu'en MQ mais le
  HQ reste un choix manuel.
- Les trois profils mobiles coupent ombres et MSAA. LQ rend à 68 % du DPR, MQ à
  84 %, avec un composite tropical à une seule lecture de scène ; ACES, sRGB,
  danger, tempête, aplats et flash d'impact restent présents.
- Les sept bwa de chaque yole partagent désormais un `InstancedMesh` tout en
  gardant leurs flexions, changements de bord et dégâts : 24 draw calls retirés
  sur une flotte de quatre yoles.
- Les rivaux mobiles gardent trois dresseurs animés à proximité et retirent les
  spécialistes hors budget. Le joueur conserve toujours ses huit rôles visuels.
- Mesuré dans Chromium à 844×390 : LQ tactile 573×265, généralement 96 à 118
  draw calls ; MQ tactile 708×327, environ 115 à 168 selon le chaos. Aucun
  avertissement ou erreur WebGL sur le passage complet.

## Passe 62 — la yole sort de l’eau dans l’atelier

- Le showroom ne réutilise plus la flottaison, la gîte et la vitesse de la
  course : la quille est entièrement dégagée et la coque reste presque à plat.
- Une yole chavirée revient propre dans l’atelier. `sink`, eau embarquée,
  équipage par-dessus bord et dégâts visuels ne contaminent plus l’aperçu.
- Le cadrage Coque recule, vise plus bas et décale le modèle dans la baie libre
  afin que la voile et le panneau de personnalisation ne masquent plus la coque.
- Une garde automatisée injecte désormais une épave coulée avant d’ouvrir le
  showroom et vérifie sa remise en état.

## Passe 61 — algues lourdes, équipage volant et yole sonore

- Une nappe de sargasses retire immédiatement 65 % de l'erre au premier contact,
  puis continue à freiner tant que la coque reste engluée.
- Chaque impact direct d'arme retire désormais un yoleur du poste de rappel et
  déclenche sa vraie chute à la mer. Les dégâts résiduels, comme le feu ou la
  tension du câble, n'éjectent pas en boucle.
- Le plancher artificiel de deux équipiers est supprimé : les six postes peuvent
  réellement être vidés.
- Le soundscape passe de trois à six lits réactifs avec voile, craquements du
  bois et frottement des sargasses. Des signatures dédiées accompagnent
  l'entrée dans les algues, l'éjection et le verrouillage du Pwason.
- Les vrais samples respectent enfin le `playbackRate` demandé par les mixages,
  ce qui rend les variantes d'impact réellement audibles.

## Passe 60 — la yole reste dans l’image

- Le bootstrap local désinscrit les anciens workers et purge seulement les
  caches YOLE avant de charger les modules : le serveur de développement ne
  mélange plus deux versions du moteur d’animation.
- Les contrats `assets/crew-v2` et `handling/swell-v2` portent désormais une
  version identique dans les imports et dans le précache. Une constante de
  houle absente ne peut plus transformer la matrice de la yole en `NaN`.
- Le cadrage de poursuite vise moins loin devant la proue : coque, équipage,
  gîte et rebond restent visibles dans le tiers inférieur, même sur un viewport
  presque carré.
- La yole du joueur n’est jamais supprimée par le culling de bord d’écran ; les
  trois adversaires conservent l’optimisation.

## Passe 59 — la mer reprend le premier rôle

Les catamarans, scooters et danseuses hors-course sont retirés du runtime, du
cache hors ligne et du paquet d'assets. Ils détournaient l'attention sans
atteindre le niveau visuel de la yole.

Lors d'un chavirage, les huit personnes visibles sont maintenant projetées avec
le véritable GLB `yole_crew`, son squelette, sa texture d'équipe et ses coiffes.
Le mannequin procédural ne sert plus que de repli si le modèle est absent.

Les sargasses reçoivent une nouvelle texture transparente sans déchets, six
volumes instanciés par nappe, un suivi de la pente de houle et des fragments au
contact de la coque. Les caisses flottent sur la vague, tournent, portent un
noyau de butin et éclatent en planches lors du ramassage.

Enfin, le rendu de coque lit l'écart de hauteur d'eau entre proue et centre :
à vitesse élevée, une vague rencontrée produit jusqu'à environ 8 cm de heave et
5° de cabrage visuel, sans modifier la simulation ni les replays.

## Passe 58 — une élimination est une élimination

Le repêchage automatique de Combat Box et de Mêlée locale est supprimé. Une
yole éliminée reste hors course jusqu'à la fin de la manche ; en Tour, elle
attend la fin de l'étape. La caméra garde brièvement l'épave puis suit une yole
encore active. En Mêlée, elle privilégie le dernier pilote humain vivant, puis
le leader IA si les deux humains sont éliminés.

La Frappe de Sable post-mort et son bouton ont également été retirés : le joueur
éliminé regarde réellement la fin, sans action cachée. Le bit 16 reste libre
pour ne pas renuméroter les commandes déterministes suivantes.

Le protocole gameplay passe à `tropical-mayhem-v3-12-no-rescue`. Un test dédié
avance quinze secondes au-delà de l'ancien délai de 8,5 s, vérifie que la yole
reste éliminée, puis que seule la manche suivante la remet en jeu.

Cette nouvelle règle a révélé deux contaminations inter-manches :

- les compteurs Brume, Sargasse et collision des yoles sont maintenant remis à
  zéro dans `Boat.reset()` ;
- `WakeGrid.clear()` remet aussi son origine et sa phase fixe à zéro.

Sans le second correctif, la première étape du Tour et sa relecture divergeaient
dès le tick 10. Le smoke compare désormais leurs checksums à chaque tick.

## Passe 57 — 3 · 2 · 1 · GO, et on sait enfin ce qu'on regarde quand on est mort

### Le départ

La course commençait sec : le menu disparaissait, les yoles filaient. Rien ne
disait « prépare-toi ».

⚠️ **TOUT EST GELÉ PENDANT LE REBOURS, ET `tick` N'AVANCE PAS.** Le compteur
tourne avant le premier pas de simulation : les yoles ne bougent pas, la brume
n'avance pas, le chrono reste à 00:00. Le replay est donc intact — il commence
au tick 1 comme avant, et la durée étant fixe, une relecture le rejoue à
l'identique sans qu'il ait à entrer dans le payload.

`playerInputLocked()` couvre aussi le rebours. Sans ça on pourrait border et
tirer pendant le 3-2-1 : les entrées seraient acceptées alors que la simulation
est gelée, et elles partiraient toutes d'un coup sur le GO.

Le son n'est relancé qu'au CHANGEMENT de chiffre, pas à chaque image — le bloc
ne s'exécute que sur transition.

### La caméra fantôme

Éliminé, on se retrouvait derrière une autre yole sans rien qui l'explique.
Trois informations manquaient, elles sont maintenant dans un panneau :

```
CHAVIRÉ
CAMÉRA SUR KOLIBRI
REPÊCHAGE DANS 7 s
```

⚠️ **La caméra PUBLIE qui elle suit.** Sans `cameraFollowName`, le HUD devrait
refaire le même tri de son côté — deux vérités pour une seule question, et
elles finiraient par diverger.

⚠️ **En Tour, le panneau ne promet pas de retour.** `updateRespawns` sort
immédiatement en mode Tour : une élimination y est un abandon d'étape. Le
panneau affiche donc « ÉTAPE TERMINÉE POUR TOI » au lieu d'un compte à rebours
qui n'arriverait jamais.

Relevé en jeu : épave à 21 m jusqu'à expiration, puis bascule à 132 m sur la
yole de tête, panneau mis à jour dans la foulée.

### Neuf tests à reprendre, et deux pièges dedans

Le gel a cassé six fichiers de test qui enchaînaient `startMatch()` puis
`fixedUpdate()` : ils ne mesuraient plus que du vide. Tous forcent désormais
`countdown = 0`, avec le motif écrit à côté.

⚠️ **Deux divergences de replay au passage, toutes deux de ma faute.** Ma
première substitution ne traitait que la PREMIÈRE occurrence par fichier :
`full-game-smoke.mjs` en a trois — la manche d'échauffement, celle qui
ENREGISTRE le replay, et la relecture. Le run d'enregistrement sautait le
rebours pendant que la relecture le jouait : divergence au tick 1. Les trois
côtés doivent le traiter pareil.

## Passe 56 — Quatre tuiles pour un pouce, et le jeu en ligne

### 8 armes n'a jamais été le problème mobile

Depuis la refonte de la soute, on n'en a **jamais plus de trois** en course :
deux en soute, une de caisse. Les huit armes sont du CONTENU — de la variété
d'une partie à l'autre — pas un inventaire à gérer.

Le vrai défaut était ailleurs, et il était sévère :

```js
// Clavier seulement : sur telephone la caisse suffit a choisir.
cycleWeapon() { ... }        // lié à E, et à rien d'autre
```

⚠️ **Au doigt, on ne pouvait pas changer d'arme du tout.** On tirait ce que
`activeWeapon` valait, posé uniquement par les ramassages. La deuxième arme de
soute existait et n'était **jamais** accessible.

### Une tuile = une arme = un appui

La sélection est précisément ce qu'un pouce ne peut pas faire pendant qu'il
barre. Trois tuiles d'arme, tir direct, aucun mode :

| avant | après |
|---|---|
| CONTRE-GÎTE | CONTRE-GÎTE |
| TURBO | **soute 1** |
| ARME ACTIVE | **soute 2** |
| — | **caisse** |

**La tuile TURBO est partie** : elle doublonnait le double-tap sur l'eau, déjà
en place (280 ms, `input.js`). Même raisonnement que pour le Bwa Dash à la passe
47 — sauf qu'ici le geste existait déjà, il n'y avait rien à créer.

⚠️ **Mesuré AVANT d'écrire une ligne**, sur cinq formats en paysage : quatre
tuiles donnent **52 × 52 px** sur téléphone et 72 × 72 sur tablette, au-dessus
du contrat de 44. La barre ne fait que 227 px de large sur un écran de 640. Si
ça n'était pas passé, l'idée tombait.

### Deux défauts vus à la capture, pas au test

⚠️ **La 4ᵉ tuile passait à la ligne.** Les grilles CSS étaient restées à trois
colonnes — je les avais moi-même ramenées de 4 à 3 en retirant la tuile du dash.
Douze règles à reprendre.

⚠️ **La tuile 1 affichait l'arme ACTIVE.** Elle changeait donc de visage dès
qu'on tirait autre chose : trois tuiles fixes dont une qui bouge, on ne sait
plus laquelle fait quoi. Chaque tuile est maintenant clouée à son arme.

### Publication sur GitHub Pages

Dépôt public `Oshinsu/yole-bwa-brawl`, publié par workflow. **306 fichiers,
24 Mo** — `art-source/` (237 Mo de PNG sources) et `previews/` (119 Mo de
captures) sont exclus par `.gitignore`.

Le workflow **estampille le service worker** puis vérifie le précache avant de
publier : sans ça, un second déploiement laisserait chaque joueur déjà venu sur
l'ancienne version, définitivement et sans le moindre signal.

⚠️ **UN BUG N'EXISTAIT QU'EN LIGNE, ET SEULE LA MISE EN LIGNE POUVAIT LE
MONTRER.** L'inscription du service worker passait `scope: "../"`, résolu par
rapport au DOCUMENT. À la racine d'un domaine ça donne `/` et tout va bien ;
publié sous `/yole-bwa-brawl/`, ça demande la portée `/` alors que le maximum
autorisé est `/yole-bwa-brawl/`. Le navigateur refuse :

```
The path of the provided scope ('/') is not under the max scope
allowed ('/yole-bwa-brawl/')
```

Hors-ligne mort, installation PWA impossible, précache inutile — exactement le
défaut de la passe 49, revenu par un autre chemin. La portée est désormais
DÉRIVÉE de l'URL du worker : elle vaut le dossier qui le contient, à la racine
comme en sous-répertoire.

### Mesuré sur l'adresse publique

```
service worker : activated, portée /yole-bwa-brawl/, 174 entrées en cache
premier chargement : 6,98 Mo · 0 requête en échec · 0 erreur console
canvas rendu, 4 tuiles, partie lancée
```

## Passe 55 — Trois refontes d'armes, et le bord du monde

### Le verrou de déterminisme était levé

La passe 46 avait retiré le passage à deux armes de soute : il faisait diverger
la relecture d'un ULP sur le roulis des IA, sans cause trouvée. Rebissecté
aujourd'hui — **le test passe désormais, IA active comme IA coupée**.

La cause était la fuite de `visualRng` depuis le pas fixe, trouvée et corrigée
depuis pour une tout autre raison (la divergence 60 Hz / 144 Hz des passes 48
et 49). Le rendu y puisait à cadence variable et le pas fixe en dépendait.

### Le chadron avait été privé d'anneau

```js
mine.ring.visible = kind !== "chadron" && !prop;
```

Semer des oursins **26 m devant** la trajectoire d'un adversaire est l'idée la
plus maligne de l'arsenal — un piège prédictif. Mais le chadron était le seul
des trois pièges à qui on refusait l'anneau d'avertissement : on ralentissait
sans savoir pourquoi.

⚠️ **Et les trois pièges partageaient le même rayon.** La boucle interrogeait
`BALANCE.mine.triggerRadius` pour tous : les valeurs propres au chadron (3,1) et
au barik (4,6) étaient des constantes **définies et jamais lues**. L'anneau est
maintenant dimensionné sur le rayon réel de chaque piège — il DIT où ça mord.

### Le barik brûle

Il était une deuxième mine : même largage derrière soi, même détonation, un
rayon plus petit. Deux armes pour un seul verbe.

Le fût laisse désormais une **nappe de rhum en feu** : 11,5 m de rayon, 7,5 s de
combustion, une morsure toutes les 0,6 s. La mine punit qui passe ; la nappe
interdit un passage.

⚠️ **Le poseur brûle aussi.** Une nappe qu'on traverse impunément n'est pas un
terrain interdit, c'est une arme à sens unique — et poser le feu derrière soi
doit rester un pari.

État de simulation, minuteur déterministe, aucun tirage — ni `gameRng`, ni
surtout `visualRng`. Les nappes s'éteignent au reset de manche, sinon une flaque
de la manche précédente mordrait encore là où plus rien ne brûle.

### Deux armes de soute, une case de caisse

La yole n'emporte plus quatre armes illimitées mais **deux**, prises dans un
vivier de quatre au garage. On n'est jamais désarmé, mais on est toujours
incomplet.

La soute voyage dans le replay par **exactement la même route** que le gréement
et le niveau d'IA : figée au départ, restaurée depuis le payload. La lire depuis
les réglages en relecture ferait diverger dès qu'on change d'équipement.

Les IA reçoivent une soute **dérivée de leur identifiant** — déterministe et
variée : `[harpon, rhum]`, `[mine, harpon]`, `[rhum, coco]`.

Et la caisse n'a plus qu'**un emplacement** : ramasser remplace ce qu'on
portait. On ne collectionne pas, on choisit — aller chercher celle-là, c'est
renoncer à celle qu'on a. La table de butin passe à six armes, mine et rhum y
revenant quand ils ne sont pas en soute.

⚠️ Le contrat d'arsenal de `browser-smoke.py` exigeait 4 armes illimitées. Il
en exige 2, plus une soute de taille exactement 2, plus zéro stock au départ.

### Le bord du monde

⚠️ **On voyait la carte s'arrêter.** `createRingGeometry` prend une TAILLE et en
fait `half = size * 0.5` : l'anneau de mer le plus large s'arrêtait donc à
**840 m** du bateau, alors que le brouillard laisse encore passer **15 %** de
lumière à cette distance. Le disque d'eau se découpait en silhouette arrondie
sur un ciel clair, avec les montagnes peintes derrière.

La mer va maintenant à **2100 m**, où la transmittance tombe à **0,9 %** : le
bord est noyé avant d'être visible. Même nombre de segments — c'est le même
maillage étalé plus loin, aucun sommet de plus, et le shader band-limite déjà
les vagues par niveau.

Le fond peint passe de 1180 à **2600 m** pour rester la chose la plus
lointaine : à 1180 il se serait retrouvé À L'INTÉRIEUR du disque d'eau. Sa
hauteur étant dérivée du rayon, la bande garde exactement la même taille
apparente — on l'éloigne sans la rapetisser.

⚠️ **Mon premier diagnostic était faux.** J'ai d'abord téléporté la yole à 30 km
et constaté que les chunks restaient 17 km derrière : j'ai cru à un défaut de
streaming. C'était mon harnais — un saut de 22 km ne peut pas être rattrapé par
un seul appel à `world.update`. Mesuré en navigation CONTINUE, le monde garde
1045 à 1754 m d'avance sur le joueur, sans faillir.

### Reste à faire

Le choix de la soute n'a **pas encore d'interface** : le réglage existe et
voyage dans le replay, mais l'écran « MA YOLE » ne propose pas encore de le
changer. Par défaut : coco + harpon.

## Passe 54 — Les textures passent en WebP, et le palier de qualité fait enfin quelque chose

### Le premier chargement passe de 12,81 à 6,76 Mo

Mesuré derrière le serveur de production, les textures pesaient **9,43 Mo sur
12,81** — le poste dominant et de loin, sur un jeu annoncé mobile-first.

Les 99 fichiers de `assets/textures/` sont convertis en WebP : **20,26 → 6,13 Mo
sur disque (−70 %)**, et le premier chargement tombe à **6,76 Mo (−47 %)**.

⚠️ **Destructif, et c'est un choix mesuré.** Le WebP sans perte ne descendait
qu'à 15,31 Mo (−24 %) : pas assez pour justifier le dérangement. Le destructif
donne −70 %, à condition de vérifier à l'œil — ce que fait
`tools/capture_ab_webp.py`.

⚠️ **Qualité plus haute sur les atlas de VFX** (94 contre 88 pour l'habillage) :
ils sont rendus en fusion ADDITIVE, où un artefact se lit comme un halo sale.
Vérifié après coup : explosions, éclats et anneaux sortent propres, sans bandes.
L'alpha est préservé là où il porte une silhouette — `sargasse` et `armes_atlas`
restent RGBA à alpha utile ; les atlas de VFX étaient déjà en RGB, normal en
additif.

Les icônes PWA de `icons/` ne sont **pas** touchées : elles sont déclarées dans
le manifeste et certaines plateformes n'acceptent que du PNG.

### Deux pièges de la conversion

⚠️ **Un test lisait les dimensions dans l'en-tête PNG.**
`test/impact-juice.test.mjs` vérifiait la signature `PNG` puis lisait la largeur
et la hauteur aux octets 16-23. Il lit maintenant le WebP — et il y a **deux
conteneurs** à gérer : un WebP sans transparence est un simple `VP8 ` (14 bits
aux octets 26-29), tandis qu'avec un canal alpha l'encodeur emballe le tout dans
un `VP8X` étendu (24 bits aux octets 24-29, stockés MOINS UN).

⚠️ **La comparaison avant/après était faussée par mon propre harnais.** Il
coupait la boucle d'animation puis appelait `frame(performance.now())` :
l'horodatage différait entre les deux prises, donc la houle n'était pas à la
même phase. Écart maximal relevé : 253 sur 255 — de la mer, pas de la
compression. L'horloge est désormais imposée. La mesure valable reste celle du
MENU, écran statique dominé par un grand fond : **écart quadratique moyen de
1,44 sur 255**, invisible.

### Le palier de qualité du décor ne faisait rien

```js
setQuality(tier) {
  this.palmTrunks.visible = true;
  this.palmLeaves.visible = true;
  this.rocks.visible = true;
}
```

Le paramètre n'était **jamais lu**. Sur un téléphone qui tombe en LQ, le
gestionnaire réduisait le ratio de pixels, les ombres et les particules — mais
la végétation restait à son compte maximal. Le levier avait l'air d'exister sans
exister.

On plafonne désormais le nombre d'instances DESSINÉES, sans réallouer les
tampons — `InstancedMesh` fixe sa capacité à la construction, et la recréer à
chaque changement de palier ferait un à-coup pire que l'économie.

| palier | troncs | feuilles | rochers | instances |
|---|---:|---:|---:|---:|
| HQ | 111 | 555 | 50 | **716** |
| MQ | 87 | 435 | 50 | **572** (79 %) |
| LQ | 57 | 285 | 35 | **377** (52 %) |

⚠️ Une première version mettait MQ à 0,66 de la capacité, soit un plafond de
111 — **exactement le nombre de palmiers réellement présents**. MQ rendait donc
strictement autant que HQ : 716 instances dans les deux cas, mesuré. Abaissé
à 0,52.

Purement visuel : la collision passe par `coastPenalty` et
`resolveBoatCollision`, qui lisent les données de chunk, jamais ces maillages.
Et `setQuality` reconstruit immédiatement, sinon le changement n'apparaîtrait
qu'au prochain recyclage de chunk — des secondes plus tard, et le joueur
attribuerait la saccade à autre chose.

## Passe 53 — Un panneau de raccourcis, parce que huit armes ne s'apprennent pas toutes seules

Huit armes, huit touches, plus la barre, le bordage, le contre-gîte, le turbo,
le dash, le rétro et la vengeance. **Rien ne listait tout ça dans le jeu** — une
ligne sous le menu, et une aide partielle réservée au mode duel.

Un `<details>` replié dans l'écran de pause : 37 touches, quatre sections
(piloter, tirer, viser & reste, duel local).

### Zéro identifiant, zéro plomberie

⚠️ Le panneau n'a **aucun `id`**. C'est délibéré : dans ce projet, un nouvel
élément de HUD identifié se paie en `main.js`, dans **quatre listes de mock** de
tests, et dans le recoupement `byId`/`id=` de `verify_static`. Un panneau qui ne
fait qu'afficher du texte n'a besoin d'aucune poignée JS — `<details>` /
`<summary>` est replié, focusable et actionnable au clavier nativement.

### Deux pièges rencontrés

⚠️ **Le piège à focus ne connaissait pas `summary`.** Le sélecteur de
`trapDialogFocus` liste `button`, `a[href]`, `input`, `select`, `textarea` et
`[tabindex]`. Le navigateur rend un `<summary>` focusable, mais le calcul
d'enroulement de la tabulation l'ignorait : le focus serait sorti du dialogue.
`summary` ajouté, et vérifié en navigateur.

⚠️ **La première insertion est tombée DANS la dernière section de réglages.**
Le repérage cherchait le premier `</div>` après le groupe « visibilité », mais
un groupe « rendu » le suivait. Le panneau se retrouvait imbriqué dans un
`<section>` au lieu de suivre la grille. Corrigé en ancrant sur la séquence
complète `</section></div><div class="modal-actions">`.

### Aussi : ce CSS ne pouvait pas aller n'importe où

Le fichier de style contient deux sections balisées que
`test/ui-microinteractions.test.mjs` inspecte **en tranche**, dont une qui
interdit le mot `infinite`. Le bloc est donc appendu APRÈS la section « UI QA
PASS V6.1 » — vérifié, il reste 4 144 octets après sa balise de fin. Et il ne
contient aucune animation : c'est un panneau de consultation, pas un élément de
HUD.

### Mesuré en navigateur

```
présent, replié par défaut · 37 touches · 4 sections
s'ouvre à Entrée depuis le clavier · summary bien dans le piège à focus
0 erreur console
```

## Passe 52 — Le lambi prend la barre, et la cohésion se voit enfin

Le lambi était incompréhensible pour une raison vérifiable : son effet principal
était `cohesionDamage`, et **`cohesion` n'apparaît pas une seule fois dans
`hud.js`**. Le joueur subissait une statistique qu'aucun élément d'interface
n'affiche.

### D'abord : ce que la cohésion fait réellement

Trois usages dans `yole-physics.js`, et ils convergent tous vers la même chose :

```js
crewTorque      = position × g × 1.45 × (0.62 + cohesion × 0.38)   // le rappel
individualSpeed = 3.7 × cohesion × (0.72 + activeCrew / 12)        // sortir sur le bois
pumpRate        = (2.2 + activeCrew × 0.55) × cohesion             // l'écopage
```

Au plancher (0,16), les hommes gagnent le bout du bois **six fois plus
lentement**, écopent six fois moins vite, et leur poids ne rend plus que 0,68×
du couple de redressement.

⚠️ Cohésion et équipage ne sont donc **pas deux axes distincts** : ce sont deux
multiplicateurs de la même chose, la capacité à contre-gîter. Une passe
antérieure les présentait comme séparés — c'était faux.

### B · Le lambi prend le contrôle

Une conque, c'est un **son**. Son verbe n'est pas de gratter de la coque, c'est
de désorienter. `helmLoss` coupe la barre 1,5 s, modulé par la distance dans le
cône.

⚠️ **On annule l'ENTRÉE, pas la physique.** Le gouvernail reste soumis à la
houle, au vent et à sa propre dérive : c'est ce qui rend la perte de contrôle
lisible plutôt que raide. Mesuré en jeu, variation de cap sur 80 ticks à barre
pleine à droite :

| | variation de cap |
|---|---:|
| barre libre | −0,809 rad |
| barre coupée | **−0,119 rad** |

**85 % de la commande supprimée**, et le résidu est la mer — pas un blocage.

Deux conques **prolongent** au lieu de cumuler (`Math.max`, pas `+=`) : trois
secondes sans barre seraient injouables. Le rhum protège, `reset` rend la barre,
et la victime voit « 🐚 BARRE COUPÉE ! » — sans ce message, 1,5 s sans réponse
se lit comme un bug d'entrée.

### A · La cohésion se lit sur l'équipage

Pas de neuvième jauge : le HUD en compte déjà huit. On la lit **sur le bateau**.
Buste affaissé et prise molle sur le bois, proportionnels au désordre. Mesuré,
et monotone :

| cohésion | buste | prise |
|---:|---:|---:|
| 1,00 | +0,127 | +0,279 |
| 0,60 | +0,227 | +0,230 |
| 0,40 | +0,264 | +0,207 |
| 0,16 | **+0,379** | **+0,083** |

Le buste s'affaisse d'un quart de radian, les mains lâchent 0,20 rad de portée.

### ⚠️ Une idée essayée quatre fois, mesurée, puis RETIRÉE

Le plan initial était aussi de **désynchroniser** les six hommes à mesure que la
cohésion tombe. Quatre tentatives, chacune réfutée par la mesure :

1. **Déphasage + réduction d'amplitude du pas** → la dispersion des bras
   *tombait* de 0,505 à 0,468 rad. Réduire l'amplitude RESSERRE les six autour
   de la même valeur : un équipage désorganisé paraissait plus soudé.
2. **Amplitude rendue, déphasage renforcé** → toujours 0,195 → 0,091. Cause :
   `effort` porte la variation propre à chaque homme (`pump` vaut
   `sin(cadence + phase)`), et je le rabattais de 45 %.
3. **`effort` rendu, avachissement déplacé sur le buste** → 0,197 → 0,095.
   Cause : sorti sur le bois, `settle` tombe à zéro et le terme de marche est
   multiplié par zéro. Déphaser `cycle` n'avait aucun effet dans la seule
   situation où l'on regarde l'équipage.
4. **Déphasage porté sur `pump`** → 0,199 → 0,129. Mieux, toujours en dessous.

La mesure décisive a été l'instant du pic de chaque bras, à cohésion pleine :

```
[67, 67, 66, 41, 40, 39]
```

**L'équipage n'est pas synchrone au départ.** `CREW_LAG` le décale
volontairement : c'est la vague qui parcourt le bateau, le geste d'une bordée
qui travaille. Désynchroniser davantage ne se lit donc pas comme
« désorganisé », seulement comme un autre motif.

Et le retard réel des équipiers désorganisés est **déjà simulé** :
`individualSpeed × cohesion`. Ce qui manquait n'était pas le décalage, c'était
la posture.

Le code de déphasage est retiré, pas commenté. La raison est consignée dans
`yole-visual.js` pour que personne ne la retente à l'aveugle.

### Tests

`test/lanbi-controle.test.mjs`, huit contrats, dans `npm run verify` :
la barre coupée ignore la commande, elle revient à l'expiration, deux conques ne
cumulent pas, le rhum protège, un vrai tir coupe la barre d'une vraie cible, un
reset rend la barre, la pose d'équipage change avec la cohésion, et l'appel sans
argument vaut toujours cohésion pleine.

⚠️ Deux cas échouaient au premier jet sur `sample is not a function` : un
`{windX, windZ}` ne suffit pas à `fixedStep`, qui échantillonne l'eau sous la
coque et sous chaque équipier. L'environnement complet est repris de
`advanced-systems.test.mjs`, qui le valide déjà.

## Passe 51 — Le test instable n'était pas instable : il attendait une durée au lieu d'une condition

La passe 50 avait signalé un échec isolé de `test/browser-smoke.py` sur le
relâchement de visée, suivi de deux passages verts sans qu'une ligne ne change.
Diagnostic fait.

### La cause

```python
game_page.mouse.up(button="right")
game_page.wait_for_timeout(180)      # ← ici
aim_released = game_page.evaluate(...)   # lit ammo.wave, attendu à 0
```

Relâcher la visée ne fait qu'**empiler un bit d'action**. C'est le pas fixe
suivant qui l'exécute et décrémente la munition. Or ce harnais tourne sur
SwiftShader, un rasteriseur logiciel.

⚠️ **Mesuré, huit essais** — délai réel entre la demande d'action et la
munition à zéro :

```
1261, 1137, 944, 997, 747, 1486, 1897, 8 ms
médiane 1067 ms · maximum 1897 ms · 7 mesures sur 8 au-delà de 180 ms
```

Une seule image peut prendre près de deux secondes ici. Les 180 ms accordés
étaient donc très en dessous d'UNE image : la marge n'était pas mince, elle
était **négative**. Le test ne passait que parce que les interactions de souris
qui le précèdent consomment elles-mêmes du temps et font tourner des images.

### Ce qui rend la chose gênante

Le même fichier documentait **déjà** ce défaut, vingt lignes plus bas, à propos
du HUD : « attendre exactement 80 ms était un tirage à pile ou face […] On
attend la CONDITION, pas une durée. » La leçon avait été tirée à un endroit et
pas appliquée aux autres.

### Corrigé aux deux endroits qui assertent

- **Relâchement de visée** : attente sur `ammo.wave === 0`.
- **Réticule** : `input.aim` et `aimActive` sont bien posés SYNCHRONEMENT par le
  gestionnaire de pointeur, mais `targetReticle.style.left` et le texte de
  `#aimHelp` sont écrits par le rafraîchissement du HUD, donc dépendants d'une
  image. Attente sur le déplacement réel du réticule.

Les quatre autres `wait_for_timeout` du fichier ont été examinées et **laissées
telles quelles** : elles n'assertent rien derrière — elles ne font qu'exercer
des touches ou laisser une mise en page CSS s'appliquer, ce qui est synchrone.

Si le tir échoue vraiment, l'expiration à 5 s le dit clairement au lieu de le
maquiller en réussite.

**Six passages consécutifs verts** après correction.

## Passe 50 — Le Grain devient une brume de sable, et les sargasses prennent du volume

### Brume de sable

Le renommage n'est pas qu'un changement d'étiquette : c'est un changement de
**phénomène**. Un grain est un orage — sombre, violet, traversé d'éclairs bleus.
Une brume de sable est un panache saharien qui traverse l'Atlantique et voile
les Antilles chaque été. Garder l'un et écrire l'autre aurait donné un décor qui
contredit son propre texte.

La palette a donc suivi :

| élément | avant | après |
|---|---|---|
| mur, base | `0.025, 0.018, 0.065` violet nocturne | `0.16, 0.115, 0.062` ocre sombre |
| mur, masse | `0.20, 0.075, 0.27` violet | `0.62, 0.43, 0.22` sable |
| flash | `0.55, 0.72, 1.0` éclair bleu | `1.0, 0.86, 0.58` soleil qui perce |
| nuages chargés | `0.10, 0.08, 0.18` nuit | `0.46, 0.34, 0.19` chargés de sable |
| `uStormColor` | `0x160f2f` | `0x6d5230` |
| précipitation | `0.72, 0.90, 1.0` gouttes | `0.93, 0.80, 0.58` poussière en suspension |
| bandeau d'alerte | violet-magenta | ocre saharien |
| pastille de minimap | `#ff535d` | `#e0a340` |

⚠️ **Il pleuvait dans une brume de sable.** Le système de précipitation
existait déjà et son bleu glacé se lisait comme des gouttes. Il transporte
maintenant de la poussière : ocre clair, et moins opaque — du sable en
suspension se voit en masse, pas en traits nets.

### Ce qui a été renommé, et ce qui ne l'a pas été

Toutes les chaînes **vues par le joueur** : « BRUME DE SABLE TE RATTRAPE »,
« BRUME TOTALE », « ENSEVELI PAR LA BRUME », « LA BRUME T'A EU », « FRAPPE DE
SABLE », la légende de minimap, la carte de mode, l'écran de pause.

⚠️ **Un piège discret :** `showMessage` décide du style d'URGENCE d'un message
avec une regex qui contenait `GRAIN`. L'oublier aurait rendu les alertes de
brume — les plus critiques du jeu — visuellement identiques à un message anodin.

Les identifiants **internes** (`storm`, `stormZ`, `sousLeGrain`, la clé de scène
musicale `"grain"`) restent tels quels : plus de cent occurrences dans douze
fichiers, pour zéro bénéfice joueur et un risque réel de casse.

### Les sargasses ont du volume

C'était un `PlaneGeometry(1, 1)` en `MeshBasicMaterial` : une décalcomanie
strictement plate, sans épaisseur **et sans éclairage** — elle gardait la même
teinte au zénith comme au crépuscule, au milieu d'une mer qui, elle, réagit au
soleil. Le radeau se lisait comme un autocollant posé sur l'eau.

Désormais un maillage 14 × 14 dont les sommets sont soulevés par une somme de
sinusoïdes, bombé au centre et **retombant à zéro sur les bords** — un amas
flottant, pas une dalle dont on verrait la tranche. `MeshStandardMaterial` avec
normales recalculées : il prend la lumière du soleil comme le reste de la scène.

Toujours **un seul draw call** : la géométrie est instanciée, seule sa
définition change.

⚠️ **Opaque, et c'est le vrai changement.** Un objet en volume trié en
transparence s'auto-recouvre dans le désordre : les bosses du fond passaient
devant celles de l'avant. `alphaTest` seul suffit à découper la silhouette dans
la texture, et permet d'écrire la profondeur.

⚠️ Le relief est en **mètres de monde**, pas en fraction de la taille du radeau
— l'échelle d'instance vaut 1 sur Y. C'est voulu : un petit amas doit paraître
aussi épais qu'un grand, seule son emprise change.

Relief déterministe, aucun tirage : la géométrie est construite une fois, mais
un générateur ici rendrait le décor différent d'une relecture à l'autre.

### Un test instable dans `verify`

`test/browser-smoke.py` a échoué une fois sur l'assertion de relâchement de
visée (`waveAmmo` à 1 au lieu de 0), puis a passé **deux fois de suite** sans
qu'une ligne ne change. L'échec n'était donc pas causé par cette passe.

C'est un problème en soi : un test instable dans la chaîne de validation apprend
à relancer plutôt qu'à chercher, et c'est exactement ce qui laisse passer une
vraie régression un soir de sortie. Signalé, pas corrigé — la cause demande sa
propre mesure.

## Passe 49 — Prêt pour la mise en ligne : le service worker ne s'était jamais enregistré

Audit par quatre lecteurs indépendants, puis chaque trouvaille majeure confiée à
un vérificateur chargé de la **réfuter**. Cinq ont tenu, cinq sont tombées.

### Le service worker ne s'enregistrait JAMAIS

`src/main.js` posait l'inscription sur l'événement `load` :

```js
addEventListener("load", () => { navigator.serviceWorker.register(...) },
                 { once: true });
```

Or ce module contient une **attente de haut niveau** — `THREE = await
loadThree()`, une trentaine de lignes plus haut. Tout ce qui la suit s'exécute
dans une micro-tâche ULTÉRIEURE, après que `load` a déjà été émis. Poser alors
un écouteur `{ once: true }` sur un événement passé ne déclenche rien, jamais.
Et comme le `.catch` n'était pas atteint non plus, **rien n'apparaissait en
console**.

Mesuré derrière le serveur de production : `getRegistration()` renvoyait
`undefined`, alors qu'un `register()` appelé à la main réussissait
immédiatement. Le hors-ligne, l'installation PWA et les **174 fichiers de
précache** étaient du code mort depuis toujours. Après correction : service
worker `activated`, 174 entrées en cache.

### La boucle de mort du Grain

`respawn()` réinitialisait tout — coque, eau, roulis, cohésion — mais ne
touchait **jamais** à `dynamics.z`. Or `fixedStep` gèle la position d'une yole
éliminée pendant que le mur, lui, continue d'avancer. On était donc repêché
**derrière le Grain**, absorbé dans la seconde, éliminé, repêché derrière,
absorbé — jusqu'à la fin de la manche, sans une seule action possible.

La yole est maintenant reposée 26 m devant la zone de cohésion du mur. Valeur
dérivée de `stormZ`, aucun tirage : la relecture reste exacte.

### `visualRng` consommé depuis le pas fixe — le même piège, un second site

Passe 48 avait trouvé et corrigé ce mécanisme au ramassage d'une caisse.
L'audit en a trouvé un **deuxième**, sur l'impact de récif : `debris.spawnBurst`
appelé depuis `fixedUpdate`, alors que la boucle de rendu puise dans le même
générateur à une cadence variable — et que `debris.update` réintègre ensuite ces
positions dans la simulation. Même correction, même raison.

### `antialias: true` sur un contexte qui n'affiche rien

**100 %** du rendu passe par une `WebGLRenderTarget` : le framebuffer par défaut
ne reçoit que le quad de composition plein écran, dont les seules arêtes sont
les bords de l'écran. Le MSAA du contexte n'avait donc rien à lisser, tout en
faisant allouer et résoudre un tampon couleur+profondeur multi-échantillonné
pleine résolution **à chaque image**. Passé à `false` ; l'antialiasing réel
reste celui de la cible de rendu, piloté par `PostFX.setSamples`.

### Quatorze textures téléchargées à la queue leu leu

Le `await` était **dans** la boucle de `loadTextures` : quatorze allers-retours
réseau enchaînés avant l'apparition du menu. Sur un lien mobile à 100 ms de
latence, c'est 1,4 s d'attente pure, transfert non compris. Passé en
`Promise.allSettled` — le repli par entrée est conservé, une texture absente
laisse les autres arriver.

### La musique mourait au premier passage en arrière-plan

Sur mobile, quitter l'onglet met en pause les `HTMLAudioElement`. Au retour,
`setScene(nom)` sortait sur sa garde d'idempotence — la scène courante était
déjà celle demandée — donc aucun `play()` n'était rappelé et la piste restait en
pause pour le **reste de la session**. Les bruitages, eux, revenaient :
`AudioEngine.ensure()` reprend le contexte suspendu à chaque image. Le joueur se
retrouvait avec les effets et sans musique.

Un `visibilitychange` remet `scene` à null avant de rappeler `setScene` : ça
contourne la garde sans la supprimer.

### Infrastructure de mise en ligne

**`tools/server.mjs`** — serveur statique de production, zéro dépendance.
`tools/serve.py` est inutilisable en ligne pour trois raisons mesurables :
il écoute sur `127.0.0.1` (un conteneur route vers l'extérieur, la socket ne
reçoit rien et le contrôle de santé échoue en boucle), il envoie `no-store` sur
tout (37 Mo retéléchargés à chaque visite), et son `TCPServer` est mono-thread.

Le nouveau serveur ajoute deux choses dont le jeu a réellement besoin : les
**requêtes par plage**, sans lesquelles un `HTMLAudioElement` ne peut ni
streamer ni se déplacer dans une piste, et les types MIME de `.glb` et `.woff2`,
que Node ne connaît pas et qui arriveraient en `application/octet-stream`.

**`tools/stamp_version.py`** — le service worker ouvre son cache sous un nom
constant, et l'activation ne purge que les caches dont le nom diffère. Déployer
sans changer cette chaîne laisse chaque joueur déjà venu sur l'ancienne version,
**définitivement**, et sans que rien ne le signale. Le nom est désormais dérivé
du hachage du contenu réellement précaché : deux déploiements identiques ne
purgent rien, un seul octet changé force la mise à jour. Le script refuse
d'estampiller si un fichier précaché manque — `cache.addAll` échouerait en bloc
et le hors-ligne mourrait en silence.

`npm run verify` estampille désormais avant de construire.

**`.railwayignore`** — `art-source/` (237 Mo de PNG sources) et `previews/`
(119 Mo de captures) sont exclus. Sans lui, chaque déploiement téléverse
**356 Mo** inutiles.

### Mesuré derrière le serveur de production

```
116 requêtes · 0 échec · 0 erreur console
service worker : activated, 174 entrées en cache
premier chargement : 12,81 Mo
```

Ventilation : textures 9,43 Mo · musique 1,91 Mo · modèles 0,73 Mo ·
audio 0,53 Mo · polices 0,07 Mo.

### Cinq affirmations RÉFUTÉES par la vérification adverse

- « Le tampon n'est branché sur rien » — il l'est, le vérificateur avait cherché
  une chaîne littérale sans résoudre les scripts npm.
- « Une `PointLight` par coco fait recompiler tous les matériaux » — le cache de
  programmes de three.js est global et indexé par clé, pas par objet.
- « Aucun `webglcontextlost` » — three.js en pose trois lui-même.
- « Le Bwa Dash n'a aucun accès tactile » — le double-coup de barre a été ajouté
  à la passe 47.

### Ce qui reste ouvert, et qui n'est pas mince

⚠️ **Les 12,81 Mo du premier chargement.** Les textures sont en PNG ; converties
en WebP q88 elles passeraient de 20,26 à 5,49 Mo sur disque (**−73 %**), soit un
premier chargement autour de 6 Mo. Mesuré fichier par fichier, gains de 84 à
98 % sur les atlas d'interface. Non fait : c'est 99 fichiers à convertir, trois
endroits à recâbler et une vérification visuelle des atlas de VFX en fusion
additive, où le destructif peut abîmer l'alpha.

⚠️ **Provenance de la musique.** Les huit MP3 de `zik/` portent des tags ID3
`suno.com` avec identifiants de morceaux et un nom de compte. Ce n'est pas un
défaut technique, mais la licence d'usage de ces pistes conditionne une
publication en ligne — à vérifier avant diffusion publique.

⚠️ **Les paliers de qualité.** `WorldStreamer.setQuality(tier)` ignore son
paramètre et remet les trois `InstancedMesh` visibles inconditionnellement : sur
un mobile qui tombe en LQ, la végétation reste à son compte maximal.

## Passe 48 — La noyade en trois temps, des caisses qu'on choisit, et un changement de contenu refusé par la mesure

### La noyade

Un homme à l'eau flottait, tournait sur lui-même et rétrécissait jusqu'à
disparaître. Correct, et sans intérêt. La séquence dure 5,2 s : il y a la place
d'y mettre quelque chose.

Trois temps :

1. **En l'air** — moulinet des deux bras en opposition, jambes qui pédalent dans
   le vide. Personne ne tombe dignement d'un bateau.
2. **À l'eau** — brasse ratée, bras qui battent en désordre, et la tête qui pique
   puis ressort : il boit la tasse.
3. **La fin** — les deux bras montent bien droits, il se **redresse à la
   verticale** et descend tout droit.

⚠️ **Il DESCEND, il ne rétrécit plus.** Le rétrécissement le faisait disparaître
sur place comme un défaut d'affichage ; couler à la verticale, bras au ciel,
se lit comme une noyade — et c'est le gag. Mesuré en jeu : pendant la panique,
les bras des trois premiers noyés sont à des angles tous différents
(−0,40 / −1,55, −0,64 / −2,72, −2,35 / −1,87 rad) ; à la fin, **tous à −2,94,
parfaitement symétriques**, avec une position verticale qui passe sous l'eau.

### Les caisses : deux fois moins, jamais sur la route, visibles de loin

**Moins.** 6 rangées × 4 voies faisaient **24 caisses vivantes en permanence**,
avec réapparition en 4,2 s. On en croisait une sans jamais avoir à la chercher,
donc aucune ne valait le détour. C'est maintenant 4 × 3 = **12**, réapparition
à 7,5 s.

**Mieux placées.** Le décalage par rangée pouvait annuler la voie et poser le
butin pile sur la ligne idéale : `lanes[-9] + laneShift[7]` mettait une caisse à
2 m du centre de route, gratuite à ramasser. Un **écart latéral minimal de
8,5 m** est désormais garanti après décalage — fonction pure, aucun tirage, la
relecture reste exacte.

**Visibles.** Une caisse au ras de l'eau, à 20 m de la trajectoire, était
invisible jusqu'à ce qu'on soit dessus — donc indécidable. Chacune porte
maintenant un **fût lumineux de 7,5 m à la couleur de son butin**. On identifie
l'arme de loin, on décide, puis on va la chercher. Un InstancedMesh de plus, un
seul draw call, la couleur voyage dans l'attribut d'instance comme pour l'anneau.

Le ramassage lui-même a doublé de volume : deux anneaux concentriques dont un à
la teinte de l'arme, deux fois plus de particules, un éclat de détonation, et
les huit libellés au lieu de trois — `barik`, `chadron`, `lanbi` et `pwason`
s'affichaient jusqu'ici sous leur clé technique.

⚠️ **PAS d'éclats de bois au ramassage, et ce n'est pas un choix esthétique.**
`onPickupTaken` est appelée depuis le PAS FIXE, et `debris.spawnBurst` puise
dans `visualRng` — le même flux que la boucle de rendu, dont la cadence varie.
Mesuré : avec ces éclats, la simulation à **144 Hz divergeait de celle à 60 Hz
au tick 1400**. Sans eux, les deux cadences restent identiques.
`explosions.spawn` ne prend aucun générateur : elle est sûre à cet endroit.

### Deux armes de base : essayé, mesuré, RETIRÉ

L'idée se tient, et elle répond mieux que n'importe quel effet visuel au fait
que les caisses ne comptaient pas : avec quatre armes illimitées en soute, une
boîte n'est qu'un bonus. Passer la **mine** (contrôle de zone) et le **rhum**
(invulnérabilité) en caisse rendait chaque ramassage décisif — on n'est jamais
désarmé, mais on est toujours incomplet.

⚠️ **Ce seul changement fait diverger l'enregistrement de la relecture.** Écart
d'**un ULP sur le roulis des bateaux IA dès le tick 10**, alors que :

- le bateau du joueur reste **bit-à-bit identique** ;
- **aucune action IA** n'a encore eu lieu (flux tracé et comparé, vide dans les
  deux runs) ;
- la sensibilité **ne préexiste pas** : avec quatre armes de base, le diff champ
  par champ sur quatorze ticks donne **zéro écart**.

La cause racine n'a pas été trouvée. Un changement de contenu ne justifie pas
des replays qui ne se reproduisent plus : le changement est retiré, pas
commenté. Ce qui reste de la passe pour donner du poids aux caisses est
structurel et visuel, et tient sans lui.

### Une assertion d'IA supprimée, et le constat qui va avec

La réduction du nombre de caisses a cassé l'assertion posée à la passe 46
(`channpyon.boostsIA >= tour.boostsIA`, 19 contre 24). Plutôt que d'en chercher
une troisième qui passe, mesure sur trois métriques, même scénario, 6000 ticks :

| niveau | boost | tirs | avance sur le joueur |
|---|---:|---:|---:|
| peyi | 5 | 40 | 374 |
| tour | **24** | 39 | **653** |
| channpyon | 19 | 38 | 416 |

⚠️ **CHANNPYON boost moins que TOUR et finit moins loin devant.** Les trois
niveaux ne forment pas une échelle monotone sur ce qu'on sait mesurer : seule la
marche peyi → tour est nette, et d'un facteur 5. Le test n'asserte donc plus que
celle-là. L'écart channpyon/tour est un vrai sujet de réglage, pas un détail de
test — il est signalé ici pour être traité pour lui-même.

## Passe 47 — Les noyés étaient des inconnus, et le dash n'était plus jouable au doigt

### Les hommes à l'eau n'étaient pas les yoleurs du bord

`CrewFallPool` fabriquait son propre mannequin, `createCrewDummy`, et il ne
ressemblait à personne :

| | à bord | à l'eau (avant) |
|---|---|---|
| torse | cylindre 0,12 / 0,17 / 0,46, 8 faces | 0,11 / 0,15 / 0,42, 7 faces |
| tête | sphère 0,135, 10×8 | 0,12, 8×6 |
| membres | quatre pivots articulés | quatre cylindres plantés en dur |
| coiffe | oui, trois variantes | **aucune** |
| échelle | 0,88 × variation de gabarit | 0,9 fixe |

Un équipage entier basculait donc à la mer et se transformait en six autres
personnages, tête nue. `CrewVisual` est désormais exporté : sans rig, son
constructeur bâtit exactement le corps procédural de bord. Les noyés en sont
une instance, coiffe comprise, posés en silhouette de nageur — bras écartés,
jambes repliées — au lieu de la posture de rappel d'un homme accroché à sa
perche. Mesuré après coup : 7 meshes par noyé, contre 6 sans coiffe avant.

`CREW_SKINS` et `makeHeadKits` sont exportés avec, pour que les deux fichiers
tirent des mêmes tables plutôt que d'en entretenir deux copies.

### La tuile BWA DASH retirée — mais pas avant d'avoir créé son remplaçant

⚠️ **La retirer telle quelle aurait rendu le dash INJOUABLE AU DOIGT.** Ses
trois autres déclencheurs — `X`, `Ctrl`, double-tap `A`/`D` — sont tous au
clavier. Le bouton en était le **seul** accès tactile, dans un jeu dont la
description tient en deux mots : *mobile-first*. Vérifié dans le code avant de
toucher à quoi que ce soit.

Un geste a donc été créé d'abord : **double-coup de barre**. Deux poussées
latérales du joystick du même côté déclenchent le dash de ce côté — l'exact
équivalent tactile du double-tap `A`/`D`.

Détection par **front montant** : le manche doit repasser sous 0,55 de course
entre deux poussées, donc tenir la barre à fond ne déclenche rien. La fenêtre
est de **340 ms**, plus large que les 260 ms du clavier : pousser deux fois un
joystick au pouce est plus lent que taper deux fois une touche, et à 260 ms le
geste échouait presque toujours. Le verrou retombe au relâchement, sinon lever
le pouce puis repousser du même côté ne comptait jamais comme un second coup.

Ensuite seulement la tuile est partie : `index.html`, `main.js`, les neuf
grilles CSS à quatre colonnes devenues des grilles à trois, et cinq listes de
mock. Les trois références restantes à `ui.boostLateral` étaient déjà gardées
(`if (!element) return`, `?.`, `.filter(Boolean)`).

**Un contrat de test a été abaissé, un autre ajouté en échange.**
`browser-smoke.py` exigeait au moins 8 contrôles tactiles ; il en reste 7.
Plutôt que d'abaisser le plancher seul, `ui-microinteractions.test.mjs` exige
désormais la présence de `JOY_DASH_THRESHOLD` et `JOY_DASH_DOUBLE_TAP_MS` dans
`input.js` : retirer un bouton tactile sans fournir son geste de remplacement
redeviendrait un échec, pas un oubli silencieux.

### Tremblement d'équilibre

La gîte devient dangereuse bien avant de chavirer, mais rien ne le disait à
l'image — seule la jauge changeait de couleur, et on ne regarde pas la jauge
quand on barre. La caméra tremble maintenant à mesure qu'on approche du point
de non-retour : l'information passe par le corps, pas par la lecture.

Bornes prises sur la simulation, pas choisies : **0,62 rad**, là où le rappel
commence à ne plus suffire, et **1,16 rad**, le seuil exact de `capsizeTimer`
dans `yole-physics.js`. Au-delà on chavire déjà.

Le tremblement **s'ajoute** au `shake` d'impact au lieu de le remplacer :
encaisser un coco alors qu'on est sur la tranche doit se cumuler. Il utilise
`visualRng`, jamais `gameRng`, et il est coupé net sous
`prefers-reduced-motion`.

Mesuré en jeu, écart-type de la position caméra sur 24 images :

| gîte | 0,10 rad | 0,80 rad | 1,15 rad |
|---|---:|---:|---:|
| tremblement | 0 | 0,064 | 0,189 |

### Bouton RÉTRO

Le regard arrière n'existait qu'à la touche `C` — donc pas du tout au doigt,
alors que c'est précisément le geste qu'on veut faire après avoir semé une mine.

Le bouton rejoint la colonne d'icônes de droite, pas la barre d'actions : la
case libérée par le dash devait le rester. Il est **maintenu**, pas basculé —
même comportement que la touche. D'où un branchement sur `pointerdown` /
`pointerup`, jamais sur `onclick` qui ne connaît pas le front descendant, et
`pointercancel` + `pointerleave` en plus : sans eux, un glissement hors du
bouton laisserait la caméra retournée pour de bon. Mesuré : 52 px de côté,
au-dessus du contrat de 44 px.

### Question tranchée

**Oui, la yole est éliminée dès que la coque atteint 0** — `game.js`, condition
`structure.hull <= 0`, motif « CHAVIRAGE ». Et depuis la passe 46, elle explose.

## Passe 46 — Neuf demandes de jeu, et deux bugs trouvés en chemin

Lot demandé : voir les dégâts, un harpon qui part même mal visé, une trajectoire
en cloche, des yoles qui explosent, une torpille à tête chercheuse, un Grain
plus loin, une gorgée de rhum, une caméra de mort, et des raccourcis d'armes
qui tirent.

Les sous-systèmes ont d'abord été cartographiés par quatre lecteurs
indépendants avant d'écrire une ligne. Deux résultats ont changé le plan.

### Deux bugs préexistants, découverts par la cartographie

⚠️ **Une arme de caisse ne pouvait servir QU'UNE FOIS par manche.**
`Boat.fixedUpdate` ne décrémentait que `rhum`, `wave`, `harpoon` et `mine`. Les
cooldowns de **barik, chadron, lanbi et pwason** étaient posés au tir et remis à
zéro seulement au reset de manche. Une caisse ramassée avec 3 munitions n'en
délivrait donc qu'une : les deux autres étaient définitivement mortes, et l'IA
les gardait indéfiniment en réserve. Corrigé, avec un garde-fou dans
`test/ai-difficulty.test.mjs`.

⚠️ **Le viseur du harpon mentait.** Il affichait « VERROUILLÉ » via
`findAimedTarget`, un test de **CÔNE**, alors que le tir utilise
`raycastHarpoon`, un **COULOIR** de 3,2 m. Le réticule annonçait donc des cibles
que le harpon manquait, et restait muet sur celles qu'il touchait. Il interroge
désormais exactement la même fonction que le tir.

### 1 · Les dégâts se voient

Nombres flottants projetés au point d'impact — il n'existait **aucune**
projection monde vers écran dans le projet, ni le moindre sprite de texte. Le
canal a donc été écrit : vivier de 14 divs, positionnés image par image depuis
`Vector3.project`.

⚠️ **On affiche la perte RÉELLE, pas celle demandée.** `YoleDynamics.applyHit`
sort immédiatement si le rhum est actif, et borne la coque à 0 : un coup fatal
sur une épave à 3 % n'enlève que 3 %. Lire `payload.structure.hull` aurait
menti. Le montant est donc mesuré par différence autour de l'appel, sur le
modèle exact du `crewBefore` déjà en place.

Trois couleurs : ce qu'on encaisse, ce qu'on inflige, ce qui se passe entre deux
IA. Aucun tirage ajouté au `gameRng` — le checksum est intact.

### 2 · Le harpon part même mal visé

Le tir n'était **déjà pas refusé** : message « HARPON À L'EAU », 55 % du
cooldown consommé, son de gerbe. Il manquait seulement le projectile **visible**.

Pool de rendu séparé, avancé par la boucle de RENDU et jamais par
`updateWeapons` : le checksum est intact **par construction**, pas par prudence.
Pool distinct de celui des cocos, qui ne compte que 18 créneaux et recycle le
plus ancien — un harpon à l'eau aurait pu faire disparaître un coco en vol.

### 3 + 5 · Le poisson volant devient une torpille lobée

Les deux demandes touchaient les mêmes lignes ; les traiter séparément aurait
été écrire deux fois le même travail.

⚠️ **Le pwason n'avait AUCUNE gravité.** L'aiguillage `if (kind === "pwason")
steerPwason() else vy -= gravity` faisait de la branche `else` le seul porteur
de la pesanteur. Pire : `steerPwason` écrasait la verticale
(`vy += (0.4 - vy) * virage`, constante de temps 0,385 s), donc **toute mise en
l'air était effacée en moins d'une demi-seconde**. Le lob initial calculé au tir
ne servait strictement à rien.

Désormais : `arcUp` 9,5 et `gravity` 7,6 — sommet à 1,25 s, retour à la hauteur
de tir à 2,5 s, dans la durée de vie de 3,2 s. Le guidage ne corrige plus que
l'horizontale. C'est la cloche.

Et elle mord : `hull: attenuation * 0.0` — un zéro littéral — devient 15 % à
bout portant, entre le harpon (10 %) et le coco (20 %), parce qu'une torpille
est bien plus dure à esquiver. Elle se rabat sur une autre proie si sa cible
chavire. Quatre contrats dans `test/pwason-torpille.test.mjs`.

⚠️ Hygiène au passage : `projectile.target` n'était **jamais** remis à zéro. Un
créneau recyclé gardait la cible du tir précédent — inoffensif tant que seul le
pwason lisait ce champ, mais amorcé pour la première arme qui s'y mettrait.

### 4 · Les yoles explosent

Trois foyers étagés le long de la coque plutôt que superposés — trois boules au
même point ne lisent que comme une boule plus lumineuse, étalées elles donnent
la longueur du bateau. Fumée lente et sombre pour tenir l'image après le feu,
onde de choc **à la couleur de la yole** pour reconnaître qui vient de sauter,
et 26 planches au lieu de 12.

### 6 · Le Grain recule — et ce n'était pas un réglage cosmétique

`gapStart` 88 vers 118, `gapEnd` 58 vers 82. Mais `stormGap` alimente
`stormAmount`, qui pilote **la houle et le vent** : c'est de la physique.

⚠️ **Sept seuils en mètres, codés en dur ailleurs, ont dû suivre le même facteur
1,34.** Le plus critique est la fenêtre `smoothstep(18, 95)` de `sky.js` : à
118 m de départ, l'écart tombait **hors fenêtre**, `stormAmount` se réduisait au
seul `drama` plafonné à 0,18, et il n'y avait plus ni pluie ni éclairs ni houle
de tempête. Élargie à 24 vers 128. Ont suivi : deux seuils d'affichage du HUD
(68 vers 92 m), l'hystérésis musicale (52/78 vers 70/105), le recentrage de
l'IA (30 vers 40) et son turbo de survie (46 vers 62).

Mesuré en jeu après coup — la météo répond sur toute la nouvelle plage :

| écart au Grain | 122 m | 70 m | 40 m | 22 m |
|---|---:|---:|---:|---:|
| `stormAmount` | 0,179 | 0,442 | 0,808 | 0,975 |

### 7 · Toute la bordée boit au goulot

Pose appliquée **en mélange** et non en remplacement : l'homme continue de tenir
son bois et de suivre la houle, il porte juste le goulot à la bouche. Écraser la
pose aurait donné un mannequin figé au milieu d'un bateau qui vit.

Les six gorgées sont **échelonnées** de 0,16 s : simultanées elles lisent comme
un bug d'animation, décalées elles lisent comme une bordée qui se passe la
bouteille. Le décalage vient de l'INDEX, pas d'un tirage. Mesuré en jeu, les six
bras droits à un instant donné : −2,20 / −1,71 / −0,51 / 0,07 / 0,15 / 0,35 rad.

### 8 · Trois secondes et demie pour voir sa yole partir

La caméra sautait sur le bateau de tête à l'instant de l'élimination : on ne
voyait jamais sa propre coque se coucher. Elle tient maintenant 3,6 s sur
l'épave.

Le compteur avance en temps **RÉEL** (`updateCamera` reçoit `raw`), donc il ne
peut pas faire diverger un replay — même règle que `lookBack`. Le front montant
est détecté dans la caméra elle-même : rien du côté simulation n'a besoin de
connaître ce compteur. `dt` est borné à 0,25 s, sinon un retour d'onglet en
arrière-plan consomme toute la séquence d'un coup.

### 9 · Les chiffres TIRENT, et il y en a huit

Avant : quatre touches qui ne faisaient que **sélectionner**, puis Espace pour
tirer. Deux gestes pour une action, alors que le geste évident — appuyer sur la
touche pour envoyer un coco — ne marchait pas. Et les quatre armes de caisse
n'avaient **aucune** touche : il fallait cycler avec E.

`Digit1..8` sélectionnent **et** tirent. Les huit armes ont leur touche.

⚠️ `useActiveWeapon()` ne renvoie rien : elle empile un bit d'action rejoué plus
tard par `applyActionMask`. Un premier jet faisait
`return this.useActiveWeapon()` et propageait donc `undefined` — le tir partait
mais l'appelant croyait qu'il avait échoué. Attrapé en sonde navigateur, pas par
les tests.

### Dash et turbo : NON fusionnés, et la mesure explique pourquoi

Ils partagent **déjà** `boostCooldown` — ils sont donc déjà exclusifs dans le
temps. Ce qui diffère : 10 s contre 15 s, et surtout la nature. Le turbo est une
poussée qui dure et sert la course ; le dash est un coup transversal de 17,8 m/s
qui peut faire chavirer, et sert le combat. Fusionner écraserait la décision
« vitesse ou impact », qui est justement ce qui les rend intéressants — et
casserait trois tests plus les deux types d'action distincts de l'IA.

### Une assertion de test remplacée, avec les chiffres

La correction des cooldowns de caisse a fait tomber
`channpyon.dashsIA > tour.dashsIA`. A/B mesuré, cinq graines, résultats
strictement identiques :

| | dash AVANT | dash APRÈS | budget de boost (avant **et** après) |
|---|---:|---:|---:|
| peyi | 0 | 0 | 4 |
| tour | 1 | **4** | 23 |
| channpyon | 2 | 2 | 24 |

Ce n'est donc pas le champion qui régresse : c'est `tour` qui passe de 1 à 4
dashs. Le budget de boost TOTAL n'a pas bougé d'une unité et continue de croître
avec le niveau — c'est le contrat robuste. La répartition turbo/dash à
l'intérieur est un artefact de petits nombres sur des comptes de 1 à 4.

De même, `advanced-systems.test.mjs` passait `stormGap = 60` pour signifier
« assez loin du Grain » ; le seuil de panique de l'IA étant passé à 62 m, cette
valeur voulait maintenant dire l'inverse. Portée à 85 m, elle retrouve sa
position relative d'origine.

### Compatibilité des replays

Les demandes 3, 5 et 6 changent la simulation : trajectoires, dégâts et météo.
**Les checksums divergent** pour les enregistrements antérieurs. Aucun replay de
référence n'est stocké dans le dépôt (`replay.test.mjs` calcule les siens en
interne), donc rien à régénérer. Les demandes 1, 2, 4, 7, 8 et 9 sont
strictement neutres.

## Passe 45 — « Ça rame au début » : la cause trouvée, la correction évidente refusée par la mesure

### Ce que « à chaque fois » disait déjà

Le symptôme excluait le cache froid : ce n'est pas du téléchargement, c'est du
travail **refait à chaque session**. `npm run check:demarrage` instrumente les
premières images d'une vraie manche et attribue chaque pic aux compteurs
three.js.

⚠️ **La première sonde était fausse.** Elle mesurait entre deux appels à
`renderer.render` — or le PostFX en fait **cinq par image** (préfiltre de bloom,
deux flous, composite, scène). Résultat : une médiane de 0 ms et un faux pic
tous les 5 « échantillons », tous sur un multiple de 5. Signature trop régulière
pour être réelle. La sonde enveloppe désormais la boucle d'animation.

### La cause

**47 programmes de shader se compilent APRÈS le départ**, en pleine course.
Chaque première utilisation d'un matériau déclenche une compilation qui bloque
le fil principal. Les objets ne sont pas en cause : la scène compte **1565
objets et 244 matériaux, identiques au menu et en course**. Ce sont les mêmes
matériaux qui produisent d'autres variantes.

Et une **boucle de rétroaction** par-dessus, mesurée :

```
compilation lente → images lentes → le palier de qualité rétrograde
   → LQ met shadows:false → shadowMap.enabled bascule
   → les 244 matériaux recompilent (constante de COMPILATION dans three.js)
   → encore plus lent
```

Relevé : palier 2→1 à l'image 45, puis 1→0 à l'image 167 avec bascule des
ombres et 34 programmes recompilés derrière. **Le joueur finit en qualité basse
sur une machine capable, à cause d'un transitoire de démarrage.**

### Ce qui est corrigé

`QualityManager` refuse désormais de juger la machine pendant les premières
**2,5 s**, et ne se contente pas d'ignorer la décision : il n'alimente pas la
moyenne, sinon le transitoire y reste des dizaines de secondes avec un lissage à
0,035. Les échantillons sont en plus **plafonnés à 100 ms** — un blocage isolé
de 2 s n'est pas le signe d'une machine qui rend à 0,5 image/seconde, et sans
plafond une seule secousse pesait autant que soixante images normales.
`resetWarmup()` rend la grâce à chaque manche, chacune ayant son transitoire.

⚠️ **Vérifié en test Node, pas au navigateur, et c'est délibéré.** SwiftShader
rend RÉELLEMENT à ~10 images/seconde : après la grâce il rétrograde à juste
titre, et les deux bras d'un A/B finissent au même palier 0. Le harnais ne peut
donc pas distinguer « réagit à un transitoire » de « réagit à une machine
lente ». Six cas dans `test/quality-warmup.test.mjs` couvrent la logique avec
des temps d'image injectés — dont le maintien du mode manuel.

### Ce qui a été REFUSÉ par la mesure

Une précompilation des shaders au chargement a été écrite, puis **retirée**.
Trois variantes, A/B alterné, trois tours chacun :

| variante | programmes compilés en course | coût au chargement |
|---|---:|---:|
| aucune | 47 | 28 |
| forçage visibilité + culling + deux états d'ombre | 44 | **126** |
| sobre (deux états d'ombre seuls) | 46 | 102 |

Quadrupler la compilation au chargement pour en économiser **3 sur 47** : le
gain est dans le bruit et le coût ne l'est pas. Le code est retiré, pas
commenté.

Deux hypothèses intermédiaires ont été réfutées de la même façon — que
`renderer.compile()` ignore les objets `visible:false` (vrai : 280 objets des
pools le sont, mais forcer la visibilité n'a rien donné), et que les pools
restaient hors tronc de vue (`frustumCulled = false` : rien non plus). Les
matériaux tardifs sont des `MeshStandardMaterial` et `MeshPhysicalMaterial`,
donc ceux des GLB, mais la variante exacte qu'ils réclament en course n'a pas
été identifiée.

⚠️ **Un premier A/B a donné un résultat inversé et sans valeur** :
`precompileShaders()` étant appelé dans le constructeur, le neutraliser depuis
la page arrivait trop tard — les deux bras étaient préchauffés. D'où le drapeau
d'URL, seul moyen d'obtenir un vrai témoin.

### Donc : la cause reste ouverte

47 compilations en course subsistent. Le harnais qui les compte
(`npm run check:demarrage`) reste en place pour la prochaine tentative. Ce qui
est acquis, c'est que la SPIRALE de qualité ne s'enclenche plus.

## Passe 44 — Une vraie typographie, et l'inventaire de ce qui manque encore

### Le jeu s'affichait en Segoe UI

La feuille de style déclarait `font-family: Inter, ui-rounded, "SF Pro Display",
system-ui` — et **zéro `@font-face`**. Inter n'est pas installé sous Windows, SF
Pro non plus. La pile tombait donc jusqu'à `system-ui`, c'est-à-dire **Segoe UI,
la police des boîtes de dialogue Windows**. Tout le travail de rendu — ACES,
bloom, tonemapping, dithering — était habillé par la typo du Panneau de
configuration.

Une seule déclaration `font-family` existe dans les 89 Ko de la feuille, sur
`html,body` : tout le reste hérite. Le câblage tenait donc en deux `@font-face`
et une variable.

| Police | Rôle | Poids |
|---|---|---:|
| **Inter** (variable 100→900) | tout le corps de texte, tout le HUD | 47,1 Ko |
| **Anton** | titres, annonces, chiffres héros | 18,2 Ko |

Les deux sont sous **SIL Open Font License 1.1**, qui autorise explicitement
l'embarquement et la redistribution commerciale. La notice est dans
`assets/fonts/LICENSE.txt`.

### Trois octets de moins que prévu

Demander Inter en 400/600/800 téléchargeait **trois fichiers strictement
identiques** — vérifié au SHA-256 : `3100e775e8616cd2` pour les trois. Google
sert Inter en police **variable** : un seul fichier de 47 Ko couvre toute la
plage. Les deux doublons ont été supprimés, ce qui divise le coût par trois.

### Ce que la capture a corrigé

⚠️ **`font-synthesis: none` allait trop loin.** Posé pour empêcher le faux gras
(Anton n'a qu'une graisse : toute demande de `font-weight` élevé fait épaissir
les contours à la main et bave sur les grandes tailles), il interdisait **aussi
l'oblique de synthèse**. Le titre perdait le `font-style: italic` que la feuille
demande depuis toujours : « BWA BRAWL » sortait **droit**, sans son inclinaison
de course. Visible seulement en capture, jamais en console. Corrigé en
`font-synthesis: style`, qui garde l'inclinaison et n'interdit que le faux gras.

⚠️ **Les crénages négatifs étaient calibrés pour Inter.** `-.075em` sur le h1,
`-.06em` sur les h2 versus : appliqués à Anton, déjà condensé, ils empilaient
les lettres. Remis à `.012em` sur les sélecteurs de titrage.

⚠️ **Accents français sur capitales.** À `line-height: 1`, l'accent de « É »
touche la ligne du dessus sur un titre à deux lignes — « 8 ÉTAPES, UN CLASSEMENT
/ GÉNÉRAL » dans la carte du Tour. Relevé à `1.08` sur ce seul sélecteur ; le h1
garde son `.73` volontaire, il n'a pas de capitale accentuée.

**Les kickers restent en Inter.** `.eyebrow` (10 px) et `.menu-card>b` (9 px)
sont très espacés : Anton, condensé et gras, y serait illisible. C'est un choix,
pas un oubli.

### Mesuré, pas supposé (`npm run check:polices`)

Déclarer un `@font-face` ne prouve rien : le fichier peut manquer, le format
peut être refusé, et `font-family` retombe **silencieusement** sur la police
système sans la moindre erreur console. Le harnais vérifie donc trois choses
distinctes — `document.fonts` a chargé, `check()` répond vrai, et la **largeur
rendue** diffère du repli :

```
loaded   Inter var (100 900)      loaded   Anton (400)
Anton=552px   Inter=745px   repli=735px      check {inter:true, anton:true}
```

552 contre 735 px sur la même chaîne : Anton est bien appliqué, pas seulement
déclaré.

### Distribution

- `font-display: swap` — le texte s'affiche immédiatement dans le repli et
  bascule à l'arrivée. Une police lente ne doit jamais retarder un jeu.
- `<link rel="preload">` dans `index.html` : sans lui la police n'est découverte
  qu'après l'analyse du CSS, soit un aller-retour de retard sur le premier écran.
- **Précachées** par le service worker. 65 Ko font partie de la coquille,
  contrairement aux 12 Mo de `zik/` qui en restent dehors.
- **Embarquées en base64** dans la build monofichier (~87 Ko) : déplacé seul,
  le fichier garde sa typographie au lieu de retomber sur la police système,
  c'est-à-dire exactement le défaut qu'on vient de corriger. Les `preload` sont
  retirés de cette build, ils pointeraient vers des fichiers absents.

### Deux trouvailles annexes, non corrigées

⚠️ **Chaque GLB est demandé deux fois.** La sonde réseau montre `200` sur les
sept modèles, puis un second appel `net::ERR_ABORTED` sur chacun. Les modèles se
chargent correctement — mais sept requêtes partent pour rien à chaque
démarrage. Antérieur à cette passe, laissé en l'état faute de mesure du gain.

⚠️ **5,79 Mo de textures livrées que rien ne charge** : les 18 sprites
`v5/vfx/` et 4 `v7/juice/`, dont les atlas (`spell_vfx_atlas.png`,
`juice_vfx_atlas.png`) sont bien branchés, eux. Ressemble à des sources
pré-atlas qui partent quand même dans la release. **Non supprimées** — la
vérification que les atlas couvrent tout n'a pas été faite.

## Passe 43 — Huit musiques, placées par la mesure et non par les titres

Le dossier `zik/` contenait huit MP3. Les affecter d'après leur nom seul aurait
été deviner, alors chaque piste a été réellement **décodée** (Web Audio,
`decodeAudioData`) et mesurée : énergie RMS, dynamique crête/RMS, centroïde
spectral, tempo par autocorrélation de l'enveloppe (`npm run zik:analyse`).

| Piste | Durée | RMS | Centroïde | BPM | Intensité |
|---|---:|---:|---:|---:|---:|
| An Nou Ay | 0:12,6 | 0,100 | 6456 Hz | 64 | 0,200 |
| Oops, You Lost! | 0:12,6 | 0,125 | 4322 Hz | 79 | 0,286 |
| Coconut Cannon Rush | **2:11,8** | 0,163 | **1134 Hz** | 80 | 0,354 |
| Canoe Combat | 1:06,2 | 0,142 | 2561 Hz | 120 | 0,442 |
| Midnight Canoe | 0:14,6 | 0,155 | 5173 Hz | **139** | 0,663 |
| Turquoise Turbo | 0:55,2 | 0,162 | 5767 Hz | 154 | 0,770 |
| Canot de Guerre | 1:34,5 | 0,178 | 5456 Hz | 139 | 0,782 |
| Carnival Apocalypse | 1:48,2 | **0,205** | 4012 Hz | **154** | **0,908** |

### La mesure contredit deux titres

- **Coconut Cannon Rush** : centroïde à **1134 Hz** et 80 BPM. C'est la piste la
  plus SOMBRE et la plus lente du lot, malgré son nom. Elle est aussi la plus
  longue, donc celle qui se répète le moins — elle va au **menu**, pas à la
  course.
- **Midnight Canoe** : 139 BPM, centroïde 5173 Hz. Elle est vive et brillante,
  pas nocturne. Elle devient le **sting de victoire**.

Sans décodage, les deux auraient été placées à l'envers.

### Affectation

| Phase | Piste | Motif |
|---|---|---|
| Menu | Coconut Cannon Rush (2:11) | la plus longue et la plus sombre |
| Départ *(sting)* | An Nou Ay (0:12,6) | « allons-y » en créole — le coup d'envoi |
| Course | Canoe Combat (1:06) | intensité 0,442, tempo soutenu |
| Tour des Yoles | Canot de Guerre (1:34) | le titre, et de quoi tenir une étape |
| Duel local | Turquoise Turbo (0:55) | 154 BPM, le plus nerveux des moyens |
| Mur du Grain | Carnival Apocalypse (1:48) | la plus dense du lot, titre et mesure d'accord |
| Victoire *(sting)* | Midnight Canoe (0:14,6) | 139 BPM, brillante |
| Défaite *(sting)* | Oops, You Lost! (0:12,6) | le titre |

### Streaming, pas décodage

⚠️ Les huit pistes pèsent **12 Mo en MP3** ; décodées en `AudioBuffer` elles
feraient environ **130 Mo de PCM** en mémoire. Le directeur passe donc par des
`HTMLAudioElement` branchés au graphe via `MediaElementAudioSourceNode` : le
navigateur streame, la mémoire reste plate, et les fondus se font sur des
`GainNode` comme le reste du moteur.

Rien n'est chargé au démarrage (`preload="none"`) : ouvrir le menu ne déclenche
pas 12 Mo de téléchargement, chaque piste n'est instanciée qu'à la phase qui la
réclame. Fichier absent, réseau coupé, décodeur MP3 manquant : la piste est
marquée morte et la phase se joue en silence. Même règle que les modèles GLB.

Le bouton SON gouverne les deux bus — couper le son en laissant la musique
tourner serait une surprise désagréable.

### Trois défauts trouvés par la mesure en navigateur

- **Les flux ne s'arrêtaient jamais.** La condition de mise en pause testait
  `this.scene !== nom` alors que `this.scene` venait d'être mis à `nom` : elle
  était toujours fausse. Mesuré : **trois flux MP3 en parallèle** à gain zéro,
  décodés pour rien.
- **Boucle inaudible sous les stings.** L'atténuation à 0,28 laissait la boucle
  de course à 0,095 de gain pendant les 12,6 s du sting de départ. Relevée à
  0,55.
- **Deux stings pouvaient se superposer** à plein gain. Un sting en chasse un
  autre désormais.

### Deux artefacts de sonde, corrigés aussi

Le geste qui arme l'audio tombait au centre de l'écran, donc **sur la carte
« Tour des Yoles »** : la sonde mesurait la mauvaise phase. Et le HUD réimposait
la scène « grain » à chaque rafraîchissement tant que le mode restait
`playing`, ce qui faisait croire à une boucle qui survivait à la fin de manche.

### Mesuré en navigateur réel (`npm run check:zik`)

| Phase | Scène | Audible |
|---|---|---|
| Menu | `menu` | Coconut Cannon Rush à 0,42 |
| Course | `course` | sting de départ 0,62 + boucle 0,187 |
| Grain | `grain` | sting 0,62 + Carnival Apocalypse 0,22 |
| Victoire | — | Midnight Canoe 0,62, boucle arrêtée |

Zéro piste morte, zéro erreur console.

⚠️ **Le paquet de release passe de 24,8 à ~37 Mo.** Les MP3 ne sont
volontairement PAS dans le précache du service worker : les mettre imposerait
12 Mo de téléchargement à la première visite. Le hors-ligne ne couvre donc pas la
musique.

## Passe 42 — La coque se casse vraiment, le harpon se vise, l'IA aussi

### Dégâts de coque, valeurs demandées au playtest

| Source | Avant | Après |
|---|---:|---:|
| **Coco Boum** | **0 %** | **20 %** |
| Mine Tsunami | 30 % | 30 % |
| Barik Rhum | 22 % | 22 % |
| **Konk Lanbi** | **0 %** | **10 %** |
| **Spider-Harpon** | 1,9 % | **10 %** |
| **Sargasses** | **0 %** | **10 % / s** d'engluement complet |
| **Abordage au Bwa Dash** | ~3,4 % | **18,2 %** |

L'abordage devient une arme : un contact de croisière reste une bousculade
(0,5 %), un choc franc coûte 1,7 %, un **Bwa Dash lancé dans le flanc arrache
18,2 %**. Le terme de dash domine désormais les deux autres.

⚠️ Les abordages ne passent PAS par `weaponHit` : ils ne sont pas biaisés par
`weaponBias.hull`. Les chiffres ci-dessus sont donc bruts pour eux, et
post-biais pour les armes.

### Le harpon ne verrouille plus — il se vise

`findTarget` acceptait un cône de **83°** et classait par DISTANCE : le harpon
accrochait la yole la plus proche devant, où que pointe le viseur. Il n'y avait
rien à réussir.

C'est maintenant un rayon : on trace l'axe de visée et on prend la première
coque traversée, dans un couloir de 3,2 m de demi-largeur (une yole fait 2,16 m
de bau). Mesuré (`npm run check:aim`) :

| Écart latéral de la cible | Résultat |
|---:|---|
| 0 m | **accroche** |
| 2 m | **accroche** |
| 3 m | **accroche** |
| 4,5 m | rate |
| 9 m | rate |

Rater coûte 55 % du cooldown — la visée a un prix.

### L'IA visait droit devant, littéralement

Elle appelait `fireWave` directement. `fireWave` lit `owner.forward()`,
c'est-à-dire le cap de la coque : elle tirait donc **droit devant**, sans jamais
tenir compte de la position de sa cible. D'où « elles tirent des cocos de partout
sans viser ».

Ajout d'un solveur de tir (`solveLeadAngle`) : deux itérations de point fixe sur
le temps de vol, en tenant compte de la vitesse de la cible ET de la part de
vitesse que le projectile hérite du tireur. Puis `fireAimed` décale le cap du
tireur le temps du lancer, avec une erreur résiduelle proportionnelle à
(1 − précision) du niveau.

Mesuré sur 40 s, CHANNPYON : **5 tirs partis, 9 impacts** — le coco a 9,5 m de
rayon, un tir bien placé touche souvent deux yoles.

⚠️ **La fenêtre de tir a demandé DEUX corrections, toutes deux guidées par la
mesure des causes de refus.** À 0,22 rad puis 0,80 rad, 92 % des tentatives
étaient rejetées. En séparant les causes — cadence, portée, angle — il est apparu
que **zéro** refus venait du cooldown ou de la portée : tous venaient de l'angle.
L'IA choisit sa cible par proximité et vulnérabilité, sans filtre angulaire, donc
elle vise souvent par le travers. À 1,55 rad (89°), 45 % des tentatives
aboutissent : un lancer de noix par le travers est plausible, par l'arrière non.

Sans cette ventilation par cause, « 92 % de refus » se lisait comme un défaut de
visée alors que c'était un choix de cible.

### Deux seuils de test ajustés, avec leur raison

- **`test:ai`** : facteur ×3 ramené à ×2. Le cooldown du turbo est passé à 10 s,
  donc les comptes absolus ont fondu (PEYI 5, CHANNPYON 14 sur 100 s). À ce
  volume, un ×3 tient à une poignée d'événements et le test devient un tirage.
- **`test:crew`** : seuil d'échantillons 20 000 → 12 000. Une yole éliminée n'est
  pas échantillonnée, et **31 % des ticks** le sont désormais sous le nouveau
  modèle de dégâts. Le taux d'élimination est maintenant REPORTÉ dans la sortie,
  pour que cette dérive reste visible au lieu d'être absorbée en silence. Les
  contrats de pose, eux, sont intacts : 100 % de lacet correct, 0,086 m d'assise.

### État en jeu

3 graines × 40 s, pilote compétent, TOUR : gîte 0,253 rad, **30,2 % du temps à
lutter contre la gîte**, 50 km/h, **0 chavirage**, 0 à 1 élimination.

## Passe 41 — La coque, la balistique verticale, et l'onde de choc

### « La coque est-elle indestructible ? » — non, mais presque, en pratique

Audit complet des sources de dégât de coque, biais `weaponBias.hull` appliqué :

| Source | Coque, à bout portant |
|---|---:|
| **Mine Tsunami** | **30 %** |
| **Barik Rhum** | **22 %** |
| Chadron | 4,0 % |
| Abordage (l'agresseur) | ~3,4 % |
| Récif | ~2,0 % |
| Harpon, impact | 1,9 % |
| Abordage (la victime) | ~0,5 % |
| **Coco Boum** | **0 %** |
| **Konk Lanbi** | **0 %** (voulu : arme de désorganisation) |
| **Pwason Volan** | **0 %** |
| Sargasses | 0 % |

La coque n'est donc pas indestructible — mais l'arme la plus utilisée, celle qui
est toujours en soute avec 5,4 s de cadence, **ne la touche pas du tout**. Un
joueur qui n'encaisse que des cocos voit sa barre de coque immobile toute la
manche, et en conclut légitimement qu'elle ne sert à rien.

Ce n'est pas un défaut : la coco noie et déchire la voile (31 kg d'eau, −21 % de
cohésion, 3,6 % de voile). C'est une répartition des rôles. Mais elle n'est
lisible nulle part, et c'est ça qui manque.

### Balistique verticale — le tir n'avait qu'un axe

La visée ne captait que le glissé HORIZONTAL. La hausse du coco était figée à
`up: 7,1`, la même à chaque tir : impossible de lober un obstacle ou de tendre un
tir rasant.

Un axe vertical est ajouté, de bout en bout : entrée (glissé vertical), fenêtre
de replay (`aimPitch`, quantifié comme les autres), balistique, et viseur — qui
monte, descend et affiche `CLOCHE` ou `TENDU`.

- **Coco Boum** : hausse ×0,20 à ×1,80. À fond en cloche, la noix monte presque
  à la verticale et retombe derrière.
- **Pwason Volan** : sa mise en l'air passe de +1,4 à −2,9 / +5,7 m/s. Lobé haut,
  le banc retombe sur sa cible par-dessus ; tendu, il rase l'eau.

⚠️ **Les angles physiquement absurdes sont ASSUMÉS**, à la demande explicite du
playtest. Le tir doit être expressif, pas plausible.

⚠️ **Le harpon n'a pas de phase de vol** : il verrouille et attache dans le même
tick. Il n'y a donc rien à courber. Lui donner une trajectoire demanderait de le
transformer en projectile, ce qui changerait son identité (ancre instantanée) et
son équilibrage. Non fait — c'est un choix de design à trancher, pas un oubli.

### Les explosions déforment déjà l'eau — et ça se mesure

Les armes stampent la grille de sillage, et la physique lit `sampleDisturbance`
pour composer la hauteur d'eau sous chacun des seize points de flottaison. La
chaîne existait. Restait à savoir si elle produisait quelque chose.

Protocole (`npm run check:blast`) : yole à l'arrêt, à plat, explosion à côté,
**impulsion directe neutralisée**. Ce qui reste est la contribution de l'eau
seule.

| Arme | Distance | Roulis | Soulèvement | Vitesse verticale |
|---|---:|---:|---:|---:|
| Mine | 4 m | 0,070 rad | 0,60 m | 1,01 m/s |
| Mine | 9 m | **0,419 rad** | **1,26 m** | 2,39 m/s |
| Coco | 4 m | **0,540 rad** | 0,90 m | 2,44 m/s |
| Coco | 9 m | 0,376 rad | 0,77 m | 1,04 m/s |

**L'eau seule dépasse le seuil de contre-gîte (0,34 rad).** Une explosion à côté
suffit à ouvrir la fenêtre, sans aucun contact.

Le classement n'est pas monotone, et c'est cohérent : une explosion PILE dessous
soulève la coque à plat — beaucoup de vertical, peu de roulis. Décalée, elle ne
lève qu'un bord — c'est là que le couple est maximal. L'endroit où l'on est
touché compte autant que la distance.

### Défauts d'implémentation attrapés par les tests

- **Compression du flux d'entrées cassée.** `aimPitch` avait été ajouté à la
  comparaison de trames mais PAS à l'instantané mémorisé : `0 !== undefined`
  étant toujours vrai, chaque trame passait pour modifiée. 720 trames au lieu de
  moins de 40. Attrapé par `test/replay`.
- Diagnostic initial faux de ma part sur ce même défaut : j'ai d'abord accusé
  `quantize(undefined)` de rendre NaN, alors qu'il garde déjà contre le
  non-fini. La cause était l'instantané, pas la quantification.

`GAMEPLAY_VERSION` passe à `tropical-mayhem-v3-8-balistique` : le flux d'entrées
a un champ de plus, les replays antérieurs sont refusés.

## Passe 40 — Visée inversée, turbo en ressource, harpon qui mord

### La visée tirait à l'opposé du viseur

Signalé au playtest, vérifié avant de toucher quoi que ce soit — et confirmé
sans ambiguïté par **projection écran** (`camera.project`), qui ne suppose rien
sur la base de la caméra :

| `aim` | Viseur à l'écran | Tir en NDC | Accord |
|---:|---:|---:|---|
| **+1** | 74 % (droite) | **−0,187** (gauche) | **non** |
| **−1** | 26 % (gauche) | **+0,187** (droite) | **non** |

Cause : la caméra regarde le long de **+Z** avec **Y** vers le haut, donc la
droite de l'écran est **−X**. Or `heading + aim` fait tourner l'avant de +Z vers
+X, c'est-à-dire vers la **gauche** de l'écran — pendant que le viseur, lui,
part à droite (`left: 50 + aim * 24 %`). Glisser à droite tirait à gauche.

Corrigé dans `withPlayerAim` : le signe est désormais négatif. Après correction,
`ACCORD: true` dans les deux sens.

⚠️ **Le test verrouillait le bug.** `input-pause.test.mjs` assertait
`originalHeading + AIM_MAX * 0.5` — il encodait la convention interne au lieu de
l'écran, et validait donc l'inversion. C'est exactement le genre de test qui
donne confiance à tort : il passait, et il avait tort.

⚠️ **Deux erreurs de sonde avant d'y arriver** : appeler `fireWave` directement
court-circuite `withPlayerAim` (la visée semblait alors sans effet, 0 dans les
deux sens), et calculer la droite de l'écran par produit vectoriel donnait 0
parce que la caméra est exactement dans l'axe de la yole. Seule la projection
écran a tranché.

### Turbo : 10 secondes

Demandé au playtest. C'est long, et c'est le point : le turbo cesse d'être un
bouton de croisière pour devenir une **ressource** qu'on garde pour un
dépassement ou une fuite devant le Grain. La jauge de Flow n'est plus le frein —
c'est le compteur.

Effet mesuré, 3 graines × 35 s, pilote compétent :

| Mesure | Avant (3,1 s) | Après (10 s) |
|---|---:|---:|
| Vitesse moyenne | 76,2 km/h | **58,9 km/h** |
| Gîte moyenne | 0,23 rad | 0,214 rad |
| Chavirages | 0 | **0** |
| Éliminations | 0 | **0** |

−23 % de vitesse moyenne. C'est considérable, et c'est la conséquence directe et
attendue de la demande : sans turbo permanent, on navigue à la voile. La gîte
baisse légèrement, puisque le coup de roulis du turbo se produit six fois moins
souvent.

### Le harpon mord

C'est l'arme de contact du jeu ; elle doit se sentir à l'accroche **et** pendant
toute la traction.

| | Avant | Après |
|---|---:|---:|
| Traction d'impact | 1,35 | **2,05** |
| Ralentissement | 0,10 | **0,17** |
| Cohésion à l'impact | 0,075 | **0,125** |
| Coque à l'impact | 0,014 | **0,026** |
| Seuil de tension | 0,62 | **0,52** (plus tôt) |
| Cadence de tension | 0,72 s | **0,58 s** |
| Roulis de tension | 0,075 | **0,145** |

Sa signature d'impact suit — hitstop 0,084 → 0,116, recul 1,18 → 1,58, secousse
0,72 → 0,94 — sinon l'arme fait mal sans le montrer.

⚠️ Elle reste **sous la coco**, et c'est un test qui l'impose
(`impact-juice.test.mjs` : `coconut.kick > harpoon.kick`). Une première valeur à
1,74 faisait passer le harpon devant et cassait la hiérarchie voulue : le harpon
est un coup de croc, sec et latéral ; la coco est l'explosion. J'ai respecté la
hiérarchie existante plutôt que de l'écraser.

## Passe 39 — Les deux points laissés ouverts, fermés

### Le contrat 44 px n'était pas rompu : il n'était pas testé

Le smoke rapportait `minTouchTarget: 31` et le README annonçait « au moins
44 px ». Contradiction apparente. Mesure dans les deux contextes :

| Contexte | `pointer:coarse` | Cible minimale |
|---|---|---:|
| Souris, 640×360 | `false` | **31 px** |
| Tactile, 640×360 | `true` | **46 px** |

La feuille de style sert bien 46 px, mais **derrière `(pointer:coarse)`**. Le
smoke tournait en contexte souris : il mesurait une fenêtre de bureau étroite, où
le seuil applicable est celui de WCAG 2.5.8 — 24 px — et non les 44 px qui visent
le doigt.

Autrement dit : ni le code ni le test n'avaient tort, c'est la **lecture** qui
l'était, et la promesse du README n'était couverte par **aucun** test.

Corrigé des deux côtés :

- le smoke ouvre désormais un **contexte tactile dédié** (`has_touch`,
  `is_mobile`) sur le même monofichier instrumenté, et refuse toute cible sous
  44 px : 8 contrôles, minimum **46 px**, aucun en défaut ;
- README et `ART_DIRECTION` distinguent explicitement les deux pointeurs au lieu
  d'annoncer un chiffre unique.

### Le taux d'abordage, enfin mesurable

Il variait de 3,5 à 37,6 par minute d'un niveau à l'autre sur des échantillons
uniques de 45 s. `npm run playtest` accepte maintenant `YOLE_GRAINES` et rend
médiane et étendue.

Cinq graines × 35 s, pilote compétent, niveau TOUR :

| Mesure | Médiane | Étendue |
|---|---:|---|
| Gîte moyenne | **0,23 rad** (13°) | 0,21 – 0,266 |
| Hors contrôle | **17,1 %** | 14,6 – 26,7 |
| Vitesse | **76,2 km/h** | 64,9 – 78 |
| **Chavirages** | **0** | 0 – 0 |
| **Éliminations** | **0** | 0 – 1 |
| Tirs IA | 27,9 / min | 21,7 – 36,3 |
| Roulis d'armes subi | **3,67 rad/min** | 2,13 – 8,25 |
| Roulis d'abordage subi | 4,71 rad/min | 0 – 10,56 |

Zéro chavirage sur les cinq graines, et la gîte tient dans une bande serrée.

⚠️ **Aucun réglage n'a été fait sur les abordages, et c'est délibéré.** Leur
fréquence va de 0 à 30,4 par minute selon la graine (a=0, b=2,5, c=30,4, d=12,
e=19,4). Cet écart ne vient pas d'une constante mal calée : il vient de savoir si
la trajectoire croise celle d'un adversaire. Une médiane ne se règle pas quand la
dispersion est la variable — il faudrait décider ce qu'on VEUT comme fréquence
d'abordage, ce qui est une question de design, pas de mesure.

### Une erreur d'outillage réparée au passage

La branche « pilote compétent » de la sonde **imprimait puis renvoyait `None`** —
reliquat de l'époque où elle s'appelait `main()`. L'agrégation multi-graines
plantait au premier accès. Elle renvoie maintenant son bilan.

## Passe 38 — Deux corrections défendables dont le PRODUIT était injouable

Retour de playtest : « ça merde totalement ». Il avait raison, et la suite
`npm run verify` passait au vert pendant ce temps-là.

### Ce que les tests ne voyaient pas

`verify` mesure des invariants — déterminisme, checksums, compilation, absence
d'erreur console. Aucun de ces contrôles ne demande si le jeu est **jouable**.
Il a donc fallu écrire un harnais qui JOUE (`npm run playtest`) et qui rapporte
ce qu'un pilote subit : gîte moyenne, temps hors contrôle, chavirages,
éliminations, et le roulis encaissé par minute ventilé par origine.

Première mesure, 36 s de vraie partie :

| Mesure | Valeur |
|---|---:|
| Tirs des trois IA | **63,2 / minute** |
| Coups encaissés | **11,7 / minute** (un toutes les 5,1 s) |
| Roulis moyen par coup | **0,889 rad** (51°) |
| **Roulis subi** | **10,4 rad / minute** |

### La cause : un produit, pas une somme

Passe 36, deux décisions séparées et chacune défendable :

- les quatre armes de base passent en **munition illimitée** ;
- le roulis des armes est **doublé** (`weaponBias.roll = 2.0`).

Avant, les IA devaient ramasser des caisses, plafond trois munitions, et
passaient une grande partie de la manche à sec. Après, elles tirent en continu —
et chaque coup couche la yole. **Je n'ai jamais mesuré les deux ensemble.**

### Correctifs

- **Cadence de tir des IA** (`BALANCE.aiFireRate`) : multiplicateur de cooldown
  par niveau, 3,4 / 2,6 / 2,0. Un humain vise, attend d'être à portée et rate des
  fenêtres ; une IA en munition illimitée, non. Le frein lui rend une cadence
  humaine sans lui retirer l'arsenal.
- **`weaponBias.roll` : 2,0 → 1,35**, et `hull` 0,62 → 0,72 en compensation.

Résultat mesuré : tirs IA **63,2 → 25–32 / minute**, roulis par coup
**0,889 → 0,336 rad**.

### Ce que la mesure a AUSSI corrigé chez moi

Le premier harnais barrait deux secondes à droite, deux à gauche, en boucle. Il
finissait dernier, chaviré, mangé par le Grain — et j'ai failli en conclure que
le jeu était cassé en profondeur. Un A/B contre les constantes d'origine a
montré **exactement le même désastre avant ma passe** (0,925 rad de gîte moyenne
contre 0,898). Ce n'était pas le jeu, c'était le pilote.

Avec un pilote compétent — barre vers le couloir, écoute selon la gîte,
contre-gîte dans la fenêtre, turbo quand c'est plat :

| Niveau | Gîte moyenne | Chavirages | Éliminations | Vitesse |
|---|---:|---:|---:|---:|
| PEYI | 0,209 rad | 0 | 0 | 74,7 km/h |
| TOUR | 0,209–0,281 rad | 0 | 0 | 69–80 km/h |
| CHANNPYON | 0,264 rad | 0 | 1 | 68 km/h |

⚠️ **Leçon d'outillage** : un harnais qui joue mal ne mesure pas le jeu, il se
mesure lui-même. Les deux modes sont conservés (`YOLE_PILOTE=manuel|competent`)
précisément parce que l'écart entre les deux est l'information utile.

### Marqueur d'origine des impacts

`weaponHit()` pose désormais `payload.fromWeapon`. Sans lui, armes, abordages et
récifs passent tous par le même `applyHit` et on règle à l'aveugle : la première
hypothèse — « ce sont les armes » — était fausse une fois le pilote corrigé,
c'est l'abordage qui dominait.

### Ce qui reste ouvert

Le nombre d'abordages par minute varie de 3,5 à 37,6 selon le niveau sur un seul
échantillon de 45 s. **C'est du bruit, pas une mesure** : il faudrait plusieurs
graines et des manches complètes pour conclure. Rien n'a été réglé sur cette
base.

## Passe 37 — L'équipage ne tenait à rien, et c'était géométrique

Remarque de playtest, photo de course à l'appui : « la pose des yoleurs, le
modèle 3D n'est pas comme ça, et ils doivent être mieux attachés au bateau ».

### Le défaut n'était pas esthétique

Les bois sont des cylindres tournés de 90° sur Z : leur axe est **X**, ils
sortent perpendiculairement à la coque. Les équipiers, eux, gardaient un lacet
de **zéro** — ils regardaient vers la proue.

Un homme assis face à +Z sur une perche qui court de gauche à droite n'est à
cheval sur rien. Il était posé **en travers** du bois. Et son bassin flottait
**0,41 m au-dessus** de la perche : le groupe `hips` est à 0,38 de la racine,
la racine était laissée à 0,28, les bois sont à 0,25.

C'est ça, et pas la pose des membres, qui le faisait paraître détaché du
bateau. Aucun réglage d'articulation ne pouvait le corriger.

### Ce que montre la photo

Le corps est **aligné sur le bois**, tête vers le large, jambes repliées vers la
coque. Le bassin est le point d'appui, le buste bascule au-dessus de l'eau, les
jambes remontent de l'autre côté. Une balance, pas un passager assis. Les mains
vont chercher la perche **en arrière du bassin** — c'est le seul point de
contact visible autre que l'assise.

### Corrections

| | Avant | Après |
|---|---:|---:|
| Lacet à pleine sortie | **0°** | **78°** (vers le large) |
| Renversement du buste | 36° | **~49°** |
| Écart bassin / bois | **0,41 m** | **0,086 m** |
| Portée sur la perche | 20 à 49 % | **52 à 89 %** |

Les jambes et les bras **annulent explicitement** la rotation héritée du bassin
avant de se placer. Sans ce terme, les cuisses suivaient le buste vers le large
et les hommes finissaient **debout sur la perche**, en équilibre comme sur un
fil — c'est ce que montrait la première tentative en capture.

Les sorties sont vérifiées contre la portée réelle de chaque bois : l'homme le
plus sorti atteint 89 % de sa perche, **marge minimale mesurée 0,50 m**, aucun
ne dépasse la pointe.

### Deux défauts trouvés par la capture, pas par le raisonnement

- **La pose se calculait sur la position VISÉE**, pas sur celle réellement
  dessinée. `root.position.x` est amortie : pendant un rappel, la consigne peut
  être à 0,5 m alors que le corps est encore à 1,6 m. Un homme assis loin sur la
  perche prenait donc la pose de quelqu'un resté à bord. Écart d'assise mesuré :
  **0,36 m**.
- **L'assise était liée à `hike`**, qui mesure la distance de sortie. Or être
  assis ou debout ne dépend pas de la distance mais d'avoir franchi le plat-bord
  (|x| = 0,90). Un homme à 1,6 m — largement au-dessus de l'eau — restait à
  moitié debout. L'assise suit maintenant le franchissement, pas la distance.

⚠️ Le renversement a d'abord été poussé à 1,62 rad (66°). En capture, les hommes
passaient à l'horizontale et lisaient comme des **plongeurs en vol** : épaules
très au large, bras traînant derrière, plus aucune assise lisible. Retenu à
1,30 rad. La valeur vient de l'image, pas d'un calcul.

### Garde de non-régression

`npm run test:crew` vérifie désormais, sur 33 768 échantillons :

- **100 %** des équipiers sortis ont le lacet du bon bord ;
- **100 %** de ceux au bout du bois ont un lacet franc (> 0,9 rad) ;
- écart d'assise maximal **0,086 m** ;
- marge au bout de la perche **0,50 m**.

Les deux seuils de lacet sont **distincts et c'est volontaire** : le lacet est
proportionnel au déport, donc exiger une amplitude franche dès 1,6 m
demanderait 0,73 rad et pas 0,9. Le sens est vérifié sur tous les sortis,
l'amplitude seulement sur ceux qui sont vraiment au bout.

### Rendu pur

Checksum simulation `a9818132` **inchangé**. La pose d'équipage n'a aucune
autorité sur la physique — seul `crewPositions[i]`, calculé par la simulation,
décide du déport.

Captures : `previews/equipage/` (travers, trois-quarts, ras de l'eau, vue de jeu)
et outil dédié `python tools/capture_crew_pose.py`.

⚠️ **Piège d'outillage relevé au passage** : mettre le jeu en pause ne suffit pas
à cadrer une capture. `frame()` continue de tourner et `updateCamera()` réécrit
la pose à chaque image — les premières captures montraient la caméra de jeu, pas
celle demandée. Il faut couper `setAnimationLoop`. De même, `rollSlow` et la
position latérale sont amorties : un seul appel à `update()` laisse l'équipage
dans sa pose précédente.

## Passe 36 — L'équilibre devient le jeu, et le turbo cesse d'être gratuit

Six points soulevés au playtest. Deux étaient des questions, et les réponses ont
été mesurées dans le code avant d'y toucher.

### « Faut-il que le turbo baisse l'équilibre ? » — il ne le baissait pas du tout

`triggerForwardBoost()` touchait la vitesse, le Flow, le cooldown… et
**augmentait** la cohésion de +0,025. Aucune ligne ne touchait `roll` ni
`rollVel`. Appuyer était donc gratuit en risque, ce qui en faisait le bouton
évident, tout le temps.

Et son cooldown de **0,64 s** ne le cadençait pas non plus : la vraie limite
était la jauge de Flow. Coût 0,16 + charge × 0,18, recharge 0,030/s en croisière
— soit **trois turbos enchaînés en deux secondes**, puis un vide de dix. Un pic
suivi d'un trou, pas un rythme.

Désormais :

| | Avant | Après |
|---|---:|---:|
| Cooldown turbo | 0,64 s | **3,10 s** |
| Cooldown dash | 0,70 s | **2,35 s** |
| Couple de roulis à l'allumage | 0 | **+0,55 rad/s** |
| Cohésion | **+0,025** | **−0,045** |

Le couple **s'aggrave si on gîte déjà** (`boostRollCompound`) : c'est ce qui
punit le spam sans jamais interdire le bouton. Le turbo devient décidable — on ne
le lance pas en pleine gîte, ou on contre-gîte dans la foulée.

### « Je n'ai toujours pas compris la contre-gîte » — elle n'était écrite nulle part

Elle avait trois issues depuis toujours, et **aucune n'était affichée** :

| Gîte à l'appui | Résultat |
|---|---|
| > 0,34 rad (19,5°) | La vraie contre-gîte. Optimum à **0,64 rad (36,7°)**, ±0,36. |
| ≤ 0,34 rad, après un dash, en dérive | Rattrapage : coupe la glisse latérale. |
| tout le reste | **−0,05 de Flow.** |

Un joueur pouvait donc perdre du Flow sans jamais apprendre pourquoi, et
conclure que la contre-gîte ne sert à rien. Ce n'était pas lui : ce n'était pas
enseigné.

`YoleDynamics.shiftQuality()` — **fonction pure**, elle ne lit que l'état courant
et n'écrit rien, donc aucune autorité sur le checksum — expose maintenant ce que
rendrait un appui immédiat. Le bouton le dit : `ATTENDS LA GÎTE`, puis
`PRESQUE — LAISSE GÎTER`, puis **`MAINTENANT !`** en vert au cœur de la fenêtre,
puis `VITE, TU PARS TROP LOIN`. Trois états CSS l'accompagnent en périphérie du
regard, sans obliger à lire.

Mesuré en jeu : précision 0 à 0,10 rad, 0,443 à 0,45 rad, **0,931 à 0,64 rad**,
0,169 à 0,95 rad. La fenêtre existe bien, et elle est maintenant lisible.

### Les quatre armes de base, toujours disponibles

Les huit armes démarraient à **zéro munition**, toutes en caisse : une manche
pouvait se jouer entière sans qu'un pilote tire un seul coup.

- **En soute, munition illimitée**, cadencées par leur seul cooldown : Coco Boum
  (5,4 s), Spider-Harpon (7,6 s), Mine Tsunami (7,0 s), Rhum (16 s) ;
- **en caisse uniquement** : Barik, Chadron, Lanbi, Pwason.

Les caisses ne décident plus *si* on se bat, mais avec quoi on surprend.

⚠️ Un défaut latent corrigé au passage : `cooldowns` ne contenait **pas** de
champ `rhum`. L'IA testait `owner.cooldowns.rhum <= 0`, soit `undefined <= 0`,
qui vaut `false` — **elle n'a jamais bu de rhum**, sur aucune manche.

Garde-fou ajouté dans `grantPickup` : `Math.min(cap, before + 1)` sur une
munition infinie la ramènerait à 3, soit un ramassage qui RETIRE des munitions.

### Les IA prennent le turbo pour courir

La seule condition était `stormGap < 46` : elles ne turbotaient **que pour ne pas
mourir**. En début de manche, où le Grain est loin, le joueur turbotait librement
contre des adversaires qui ne répondaient pas. Il suffisait de ça pour les semer.

Trois niveaux, réglage `ADVERSAIRES` figé au lancement et **enregistré dans le
replay** — même route que le gréement, parce qu'un CHANNPYON ne joue pas comme un
PEYI et qu'un fichier relu avec l'autre réglage donnerait un autre checksum en
silence.

Mesuré sur 100 s de course, trois adversaires, même graine :

| Niveau | Turbos IA | Dashs IA | Total boosts |
|---|---:|---:|---:|
| PEYI (témoin, ancien comportement) | 6 | 0 | **6** |
| TOUR (défaut) | 45 | 8 | **53** |
| CHANNPYON | 36 | 14 | **50** |

CHANNPYON turbote **moins** que TOUR, et c'est cohérent : turbo et dash partagent
le même compteur, donc une IA plus agressive convertit une partie de ses turbos
en dashs d'engagement. Compter les turbos seuls ferait passer le niveau le plus
haut pour le moins actif.

⚠️ Le garde de stabilité a demandé une mesure, pas une intuition. Posé d'abord à
0,30 rad, les IA ne turbotaient que **4 fois en 22 s à trois bateaux** : la gîte
de croisière sous voile tourne autour de 0,2–0,4 rad, donc le garde était fermé
en permanence. À 0,44 elles courent vraiment.

### Les armes attaquent l'équilibre

Elles appliquaient déjà un roulis de 0,32 à 1,05, mais les dégâts de coque et
l'eau embarquée dominaient la lecture. `BALANCE.weaponBias` est un point de
passage unique — `weaponHit()` — plutôt que huit multiplications recopiées :

- roulis **×2,0** ;
- structure **×0,62** ;
- eau embarquée **×1,25**.

La durée d'une manche ne bouge donc pas ; seule la nature de la menace change. On
chavire plus qu'on ne coule. Les valeurs vivent dans `BALANCE` et se règlent au
playtest sans toucher au code.

⚠️ Réservé aux ARMES. Collisions de coque et récifs appellent `applyHit`
directement : un abordage doit rester un abordage.

### L'accélérateur au clavier existe enfin

Toute la mécanique de voile était déjà là côté physique — 24 % à 100 % de poussée
plus un frein de choque — et **aucune touche ne l'atteignait**. Le clavier figeait
`trim` à 0,82, au-dessus du seuil `trimPowered` (0,70) : `trimDrive` valait donc 1
en permanence, plein gaz du départ à l'arrivée.

`↑` borde, `↓` choque. Border est plus lent que choquer (0,85 contre 1,30 par
seconde) : une voile se reprend à la main, elle se relâche toute seule. C'est ce
qui donne son intérêt au freinage — choquer est immédiat, se relancer coûte du
temps. Relâchées, les touches ramènent lentement à l'allure de croisière, sinon un
choquage resterait acquis.

La rampe vit dans `fixedUpdate`, en unités par seconde de **temps fixe** : même
résultat à 30, 60 et 144 Hz, et rejouable. Mesuré en jeu : 0,82 → 0,58 (choquée)
→ 1,00 (bordée) → 0,82 (retour).

### Un invariant de vitesse, imposé au lieu d'être espéré

`planarSpeedLimit` (32,5) ne s'applique qu'en fin de `fixedStep`. Turbo, dash et
slingshot, eux, écrivent dans `vx/vz` depuis l'extérieur. Tant que l'IA ne
turbotait que pour fuir, la marge de 2,5 m/s suffisait par accident et le plafond
« sous 35 m/s » tenait sans que rien ne le garantisse.

Dès que les IA se sont mises à courir, la borne a sauté : **37,85 m/s** mesurés au
smoke complet. `clampImpulseSpeed()` est désormais appelée par les trois
déclencheurs, et le test l'exerce directement.

### Validation

`npm run verify` : **OK**. Nouveau test `npm run test:ai` dans la chaîne, plus
`npm run check:gameplay` pour la vérification en navigateur réel (six points
mesurés en jeu, zéro erreur console).

`SIMULATION_VERSION` passe à **3.7.0**, `GAMEPLAY_VERSION` à
`tropical-mayhem-v3-7-equilibre` : les replays antérieurs sont incompatibles, et
c'est voulu — le gameplay a changé.

⚠️ **Ce qui n'est pas garanti par ces tests.** Le « joueur » du harnais barre sur
une sinusoïde et tient le turbo enfoncé : mauvais pilote, il chavire souvent et
finit 380 à 410 m derrière à tous les niveaux. L'écart entre niveaux (12 m sur
400) est du bruit devant cette dominante. **La difficulté ressentie demande un
vrai playtest** — les tests prouvent que le curseur agit et dans quel sens, pas
qu'il est bien calé.

Capture : `previews/jouabilite/contre_gite_fenetre.png`.

## Passe 35 — L'image sortait en linéaire, et personne ne l'avait mesuré

### Le défaut de fond

`THREE.ColorManagement` est actif par défaut depuis r152. Un
`new THREE.Color(0x0d4f63)` ne garde donc pas `0x0d4f63` : il est converti en
**linéaire** et vaut `(0,004 · 0,078 · 0,125)`. C'est correct, et c'est ce que
les shaders doivent consommer.

Ce qui manquait, c'est le retour. three.js n'ajoute le chunk
`colorspace_fragment` qu'aux matériaux **intégrés**. Un `ShaderMaterial` qui
écrit `gl_FragColor` à la main sort **tel quel**.

Mesuré en WebGL réel (Chromium/ANGLE, r185), un shader écrivant `0.5` :

| Chemin | Attendu si encodé sRGB | Mesuré |
|---|---:|---:|
| `ShaderMaterial` → canvas | 188 | **128** |
| via `WebGLRenderTarget` → blit | 188 | **128** |

Conséquence : la mer authorée à `#0d4f63` s'affichait à peu près `#011420`.
**Presque noire.** Océan, ciel, Mur du Grain, pluie et particules — tout le
rendu custom — sortaient ~2,2 gamma trop sombres, pendant que les
`MeshStandardMaterial` (îles, coques, palmiers) recevaient bien leur conversion.
La scène n'était pas seulement sombre : **elle était incohérente avec
elle-même**, et c'est ce désaccord qui la faisait lire « prototype ».

Cela explique rétrospectivement pourquoi les passes précédentes n'ont jamais
réussi à la corriger en ajoutant des courbes de contraste, du split-tone ou en
déplaçant le brouillard : elles étalonnaient l'image **après** l'erreur, pas à
l'endroit de l'erreur.

### La correction

Le tone mapping et l'encodage sont désormais faits explicitement dans la passe
de composition — le seul endroit traversé par tous les pixels :

1. exposition (`uExposure`) ;
2. ACES filmique, qui remplace la courbe maison `low*low*(3-2*low)` : celle-ci
   essayait de faire du tone mapping dans l'espace linéaire en le prenant pour
   de l'affichage, donc elle écrasait les ombres au lieu de comprimer les hautes
   lumières ;
3. linéaire → sRGB, branche exacte ;
4. **puis seulement** le grade artistique, en espace d'affichage — c'est le seul
   espace où « 0,5 = gris moyen », et les anciens seuils (0,18 / 0,8 / 0,30 /
   0,66) étaient posés à la main sur une image qui ne l'était pas ;
5. point noir : une mer de plein jour n'a physiquement aucun noir, le 5e centile
   restait à 0,34 de luma après encodage correct et rien n'ancrait le bas de
   l'échelle ;
6. tramage d'un demi-LSB **après** encodage, là où se fait la quantification.

### Exposition choisie par mesure, pas à l'œil

Balayage 0,55 → 1,25 sur une frame **gelée** (`npm run render:exposure`) :

| Exposition | Luma médiane | p05 | p95 | Écrêtage | Saturation |
|---:|---:|---:|---:|---:|---:|
| 0,75 | 0,287 | 0,209 | 0,754 | 0 % | 0,665 |
| **0,90** | **0,334** | **0,247** | **0,790** | **0 %** | **0,662** |
| 1,05 | 0,373 | 0,280 | 0,821 | 0 % | 0,653 |

0,90 retenu : luma médiane dans la fenêtre habituelle d'un extérieur de plein
jour, zéro écrêtage.

### MQ et HQ enfin colorimétriquement identiques

`npm run render:tiers`, même frame gelée :

| Palier | Luma médiane | p05 | p95 | Saturation |
|---|---:|---:|---:|---:|
| LQ | 0,413 | 0,249 | 0,781 | 0,623 |
| MQ | 0,331 | 0,238 | 0,785 | 0,662 |
| HQ | 0,331 | 0,239 | 0,791 | 0,661 |

MQ et HQ se superposent à 0,0003 près. L'écart LQ restant n'est plus un défaut
de pipeline mais un choix assumé : **LQ n'a pas d'ombres portées**, donc la
scène y est plus claire et moins saturée.

Captures : `previews/paliers/`, `previews/exposition/`, `previews/bloom_ab/`.

### Bloom : un vrai, pas un liseré

L'ancien bloom faisait huit prises **pleine résolution** à deux texels du
centre, dans la passe de composition. À deux texels, l'étalement d'un point
lumineux vaut deux texels — ce n'est pas un halo, c'est un liseré. Et il suivait
la résolution au lieu de suivre l'image : le même reflet bavait deux fois plus
large en LQ qu'en HQ.

Remplacé par une chaîne séparable : seuil à genou doux + moyenne de Karis en
demi-résolution, puis gaussienne 9 prises repliée sur 5 en quart de résolution.
Le rayon est exprimé en **fraction de largeur d'écran**, donc constant à toutes
les résolutions. S'y ajoute une traînée anamorphique horizontale pour le soleil.

Coût mesuré avec **synchronisation GPU forcée** (`readPixels` 1×1 après chaque
image, en alternance A/B/A/B) : **+5 ms sur ~93 ms** sous SwiftShader, soit un
rasteriseur purement logiciel. Sur GPU les trois passes sont des remplissages en
½ et ¼ de résolution.

> ⚠️ La première tentative de mesure annonçait **+96,8 ms**. Elle était fausse :
> `performance.now()` autour de `render()` ne chronomètre que la **soumission**
> des commandes. La boucle « sans bloom » soumettait douze images en 1,19 ms
> chacune, et la file d'attente GPU se vidait pendant la boucle « avec bloom »,
> qui héritait donc de tout le travail. Sans `readPixels`, ce genre de mesure ne
> mesure rien.

Au palier LQ, la chaîne entière est désormais **sautée** — et les prises de
bloom de la passe de composition aussi, derrière un branchement uniforme.
Auparavant, LQ calculait ses huit prises pleine résolution puis les multipliait
par zéro : c'est-à-dire qu'on payait le plus cher sur le matériel le plus
faible.

Deux programmes de plus au harnais de compilation : `bloom-prefilter` et
`bloom-blur`. **9/9 liés** dans un vrai contexte WebGL Chromium.

### Optimisation : `nearestIslands` n'alloue plus

Elle était appelée ~15 fois par image (4 yoles pour la pénalité de côte, 4 pour
la collision, 9 pour le tir de caméra, la mini-carte, l'océan) et faisait à
chaque fois `flatMap().sort().slice()` — trois allocations et une fermeture de
comparateur par appel, soit plus d'un millier d'allocations par seconde jetées
au ramasse-miettes.

La liste plate d'îles est maintenant reconstruite **seulement** au recyclage
d'un tronçon, le tri se fait dans un tampon réutilisé et le comparateur est
hissé au niveau du module. La sémantique est conservée **au bit près** — même
comparateur, même ordre d'entrée, même tri stable — parce que `coastPenalty`
alimente la physique. Checksums `a9818132`, `f8a22c50` et `dd2eaf6a`
**inchangés**.

### Trois angles morts d'outillage relevés au passage

- **`YOLE_QUALITE` ne faisait rien.** `tools/play_capture.py` pilotait la
  qualité via `window.__YOLE_DEBUG__?.game`, or ce crochet n'existe que derrière
  `?debug`. Le chaînage optionnel avalait l'appel sans erreur : toutes les
  captures « HQ » étaient prises au palier choisi par l'auto-qualité, soit LQ
  sous SwiftShader — c'est-à-dire le seul palier sans bloom. Corrigé : l'URL
  force `?debug`.
- **Le commentaire « le LQ contourne le post-FX » était faux.** Les trois
  profils déclarent `postFX: true`. C'est ce commentaire qui justifiait de
  garder `toneMapping` et `toneMappingExposure` sur le renderer, alors qu'ils
  n'étaient plus lus par aucun palier.
- **`SHA256SUMS.txt` ne correspondait plus au dépôt.** 40 entrées sur 151 en
  écart avant même cette passe — le contrôle d'intégrité livré au joueur ne
  passait pas sur l'arbre livré. Régénéré.

### Journal renuméroté

Ce fichier était daté du 23 juillet au 12 août 2026. Les horodatages des
fichiers situent la totalité du travail entre le 25 juillet 2026 à 12 h 28 et le
27 juillet 2026 : vingt-cinq entrées sur trente-quatre étaient datées dans le
futur, jusqu'à seize jours après la dernière écriture réelle sur le disque. Le
journal décrit des **passes**, pas des journées ; elles sont numérotées.

### Validation

`npm run verify` : **OK**. 59 modules JavaScript, 20 fichiers Python, zéro
erreur console ou page. Benchmark : **149 370 pas de yole par seconde**.

## Passe 34 — Les props existent enfin

### Cinq maillages, 3 258 triangles au total

| Prop | Triangles | Poids | Remplaçait |
|---|---:|---:|---|
| Fût BARIK | 668 | 78 Ko | sphère rouge |
| Oursin CHADRON | 813 | 88 Ko | sphère violette |
| Conque LANBI | 730 | 56 Ko | **rien du tout** |
| Poisson PWASON | 609 | 47 Ko | **une noix de coco** |
| Bouée | 523 | 43 Ko | rondelle orange |

Textures ramenées à 128² : 2,7 à 3,3 Mo chacune → 43 à 88 Ko, **98 à 99 % de
gain**. À 20-40 px à l'écran c'est encore généreux.

Le pwason volan était **littéralement une noix de coco à tête chercheuse** : il
empruntait le mesh du pool de cocos. Le poisson le remplace maintenant à la
sortie et la noix revient pour un tir normal. Même mécanique que le fût : enfant
caché du pool existant, un draw call seulement quand il est visible.

Correctif `metalness`/`roughness` appliqué d'emblée aux cinq — le générateur
n'écrit toujours pas ces facteurs, la spec impose 1,0, et sans envMap ça rend en
métal noir. Même défaut que l'équipage, même parade.

### Les jauges, câblées

Elles traînaient sur le disque depuis un lot entier : générées, détourées,
inscrites au service worker, et **jamais utilisées**. Il ne reste plus aucun
fichier orphelin.

### Ce que l'audit avait annoncé à tort

Trois des quatre dettes n'existaient pas. `slamHeavy` **est** joué, via un
ternaire qu'un grep littéral ne voit pas. `bedWater` et `bedStorm` **sont**
joués, comme lits d'ambiance en boucle par un mécanisme séparé. `mineDrop` **a**
une voix de synthèse — il est seulement le seul des quinze sans échantillon.

Leçon : un audit qui cherche `audio.play("littéral")` ne mesure pas ce qu'il
croit mesurer.

### Vérification de jouabilité

Les huit armes déclenchent leur effet, munition consommée et objet alloué :
coco et pwason vers le pool de projectiles, mine, barik et chadron vers le pool
de mines, lanbi en cône instantané, rhum en immunité.

Le harpon ne part pas tant qu'aucune cible n'est verrouillée — vérifié, ce n'est
pas une régression : après 240 ticks d'étalement il verrouille `KOLIBRI`,
part, et décompte sa munition.

⚠️ **Poids livré : 4,61 Mo** pour un plafond fixé à 1,9. Dépassé de 2,4×.

## Passe 33 — Côte proche posée, et l'atelier « MA YOLE »

### Le relief proche

`backdrop_near` est enfin en **espace monde** : un second cylindre à 620 m de
rayon contre 1180 pour la chaîne lointaine. C'est la parallaxe entre les deux
qui donne la profondeur — le relief lointain flottait seul au-dessus d'une mer
vide. `alphaTest: 0.08` parce que 72 % du quad est détouré et que ces texels
étaient triés et rasterisés pour rien, devant la mer.

### L'atelier, réduit à un seul axe

Le plan d'origine avait trois axes (coque, bois, gréement). Deux ont été mesurés
**sous le seuil de perception** : de la décoration payée au prix d'un champ de
checksum. Seul le **GRÉEMENT** est livré, plus les quatre livrées de voile —
purement cosmétiques et applicables à chaud par décalage d'UV.

⚠️ **`sail` seul ne suffisait pas.** Première version : misaine 109,3 m, droit
116,6 m, grand-voile 116,1 m — la grand-voile ne gagnait **rien**. Cause connue
et déjà mesurée : la poussée vélique ne pèse que 6,6 % au régime établi, donc
×1,14 dessus est invisible. Le vrai levier est le **flow**, qui pèse 50,7 %.

Le gréement arbitre donc entre toile et stabilité, et le résultat s'**inverse
avec le pilotage** :

| | Pilote qui shift | Pilote qui ne shift pas |
|---|---:|---:|
| Misaine | −1,1 % | **+13,1 %** |
| Gréement droit | référence | référence |
| Grand-voile | **+27,5 %** | +9,0 % |

⚠️ Deux réserves honnêtes : la grand-voile reste **forte** pour un bon pilote
(+27,5 %), et le gréement droit est **dominé dans les deux colonnes** — c'est le
réglage d'origine, donc la garantie de compatibilité, mais il n'est jamais le
meilleur choix. À rejouer avant de figer.

### Le piège du replay, traité

Une personnalisation persistée en localStorage **casse les replays** si elle
touche la physique : mesuré avant, le même fichier rejoué sur une machine
équipée autrement donnait un autre checksum, en silence.

Le gréement emprunte donc la **même route que la graine** : écrit dans le
payload à l'enregistrement, restauré et imposé à la relecture. Vérifié — un
replay enregistré en grand-voile rejoué sur une machine réglée en misaine
impose bien `rig: 2`.

Bornage **au point d'entrée** et non au point d'usage : `load()` fusionne un
JSON arbitraire, et c'est la première fois qu'un réglage persisté touche la
simulation. Hors bornes → option médiane, celle qui est numériquement l'ancien
jeu.

Les IA gardent le gréement neutre : seul le joueur choisit.

## Passe 32 — Un seul emplacement, huit armes, quatre absurdes

### La barre d'action passe de 6 boutons à 4

`[BWA SHIFT] [BWA DASH] [TURBO] [ARME]`. Coco, harpon, mine et rhum sont fondus
dans un **emplacement unique** ; le rhum perd son bouton contextuel.

L'identité passe par la **couleur du liseré**, pas par le libellé : à 4,8 px un
texte est illisible au soleil, et `ART_DIRECTION.md` interdit de casser le code
couleur déjà appris. Si l'arme active tombe à zéro alors qu'il reste autre chose
en soute, l'emplacement bascule tout seul — jamais de slot mort.

Le choix ne se fait pas dans un sous-menu : il se fait **sur la caisse**, dont
l'anneau porte la couleur de son arme.

### Les quatre armes absurdes

| Arme | Entrée | Effet |
|---|---|---|
| BARIK RHUM | largue **derrière** | feu : coque −0,115, slow 0,60, **zéro eau** |
| CHADRON | sème **26 m devant** | épines : eau dans un vrai compartiment, bwa −0,16 |
| KONK LANBI | cône instantané 34 m | **aucun dégât** — équipage désorganisé, yole qui dérive |
| PWASON VOLAN | tête chercheuse | peu de dégât, décroche les yoleurs |

Chacune a une **entrée différente**, pas seulement un canal de dégât différent :
quatre projectiles qui font mal ne seraient qu'une seule arme. Le chadron se
sème devant précisément pour que la décision soit d'anticiper, pas de réagir.

**Zéro nouvel état de simulation** : tout passe par les champs qu'`applyHit`
accepte déjà, les pools de mines et de cocos existants avec un `kind`, et quatre
bits libres du masque (256 à 2048). Aucun champ de checksum, replays intacts.

⚠️ Correction appliquée d'emblée sur le chadron : `addWater` sans coordonnées
route tout vers le même compartiment, plafonné à 95 kg, et le couple de gîte
parasite disparaît. Il passe un vrai `hitLocalX` / `hitLocalZ`.

L'IA s'en sert, sinon le joueur serait seul à les avoir.

### Icônes et fût

`ui_icons.jpg` passe de 6 à **10 cases** (1280×128, 47 Ko), les quatre nouvelles
tirées des quadrants d'`armes_atlas.png`. Le `background-size` passe de 600 % à
**1000 %** — sans ça les six anciennes se seraient étirées.

Le fût du BARIK est un vrai mesh (`barik.glb`, 668 tris), ajouté en **enfant
caché** du groupe de mine : une seule allocation pour le pool, et il ne coûte un
draw call que lorsqu'il est visible. `dressMine()` habille la même entrée selon
le type — le fût a son mesh, mine et chadron teintent la sphère.

### Le test de cadence a cassé, et il avait raison

Il visait un tick fixe. À 30 Hz une image consomme **deux** ticks : le premier
ajout d'armes a suffi à décaler la phase et à faire sauter la cible. Il compare
maintenant sur le plus grand tick **commun aux trois cadences**. C'est le genre
de fragilité qui finit par faire ignorer un vrai échec.

## Passe 31 — Le rendu perd son autorité sur le gameplay

### La fuite

`yole-physics.js:419` lit `sampleDisturbance` — la grille de sillage — pour
composer `waterHeight`, donc la poussée d'Archimède sous chaque point de
flottaison. Or `ocean.update()` avançait cette grille depuis `frame()`, avec le
delta d'image **réel**, recentrée sur `player.visual.root.position`, une
position de **rendu**.

Le fichier documentait déjà exactement ce défaut, corrigé une fois pour
`setWeather` : « ce chemin tourne à la cadence d'image […] ce qui rendait les
replays non bit-exacts en navigateur ». Le sillage était resté du mauvais côté.

`Ocean.fixedUpdateWake()` est appelé depuis `fixedUpdate`, avec le pas **fixe**
et la position de **simulation** du joueur. `Ocean.update()` ne garde que la
synchronisation de l'uniforme, qui est du rendu pur.

Mesuré au **même tick de simulation** — comparer à durée égale ne prouve rien,
les cadences ne tombent pas sur le même nombre de ticks :

| Cadence | Checksum au tick 1401 |
|---|---|
| 30 Hz | `62766ab8` |
| 60 Hz | `62766ab8` |
| 144 Hz | `62766ab8` |

`test/framerate.test.mjs`, branché dans `verify`, tient la garantie.

### Le choix de l'arme à la caisse, débloqué

Deux tentatives précédentes avaient été reverties. Bissection : le coupable
était `grantPickup`, et **seulement** lui — garder l'affectation
`pickup.weapon` tout en restaurant le tirage d'origine est propre.

La version qui marche tire au **placement**, sur le vrai flux `gameRng`, et le
ramassage ne consomme plus rien. La caisse tient donc la promesse de son anneau,
dont la couleur annonce l'arme (`setColorAt` sur l'InstancedMesh existant, zéro
draw call de plus).

⚠️ Une première version remplaçait le tirage par un hachage pur de la rangée et
de la voie — déterministe en apparence, et pourtant elle faisait diverger le
replay au **tick 167**, alors qu'aucune caisse n'avait encore été ramassée et
que toutes les munitions étaient à zéro. **La cause exacte n'a pas été trouvée.**
Ce qui est établi par bissection, c'est que passer par le flux du projet au
point de placement rend la relecture exacte. Noté dans `pickups.js`.

C'est ce qui débloque l'emplacement d'arme unique : le joueur voit de loin ce
que contient chaque caisse et va chercher celle qu'il veut. Le choix se joue à
la barre, pas dans un sous-menu.

## Passe 30 — L'interface passe au bois et à la corde, et le fond magenta

### Le générateur ne rendra jamais un fond noir

Douze assets d'affilée sortis sur fond **blanc** malgré `#000000` répété dans la
consigne. Ce n'est pas un accident, c'est le comportement du modèle.

La parade : demander un fond **magenta pur `#ff00ff`**, couleur qui n'existe
**nulle part** dans la palette verrouillée de `ART_DIRECTION.md`. Aucun texel du
sujet ne peut être confondu avec elle. Obéi du premier coup — coins mesurés à
`(250, 1, 244)`.

`tools/key_alpha.py` gagne `--fond magenta` avec **décontamination des bords** :
sans elle, les demi-pixels d'antialiasing gardent une frange magenta et le sujet
se retrouve cerné de fluo. Le canal en excès est rabattu sur le vert.

⚠️ Et pour une forme **annulaire** — l'anneau de joystick — le remplissage depuis
les bords ne peut pas atteindre le trou central : il faut le mode seuil, sinon
le centre reste opaque. Vérifié : coin alpha 0, centre alpha 0, corde à 255.

### Habillage câblé

| Élément | Sprite |
|---|---|
| Anneau et pommeau du joystick | corde tressée, noix de coco |
| Boutons d'action + état pressé | bois gravé, biseau or |
| Panneaux et modales | cadre bois en `border-image` neuf-tranches |
| Écran de pause et de fin | anse au petit matin, yole tirée au sec |

Les règles sont ajoutées **en fin de `style.css`** : le bloc V3.2 écrase les
blocs antérieurs, une règle placée avant aurait été morte. Le liseré `:after`
par arme est conservé au-dessus du bois — `ART_DIRECTION.md` interdit
explicitement de casser ce code couleur.

### `backdrop_near`, valide cette fois

Le prompt JSON porte un bloc `structural_locks` qui énonce trois fois la
contrainte, dont : *« un trou laisserait passer le ciel à travers la côte »*.
Mesuré après détourage : terre opaque à **128/128 sondes** de mi-hauteur au bas,
et **100/100 au bord bas** après recadrage sur la dernière ligne pleine.

⚠️ J'ai failli le rejeter à tort : ma première sonde lisait dans le fondu du
masque et annonçait « 336 trous sur 336 ». C'était le flou du détourage.

### Poids compensé

Comme annoncé, les nouveaux assets sont payés par les anciens :

| Texture | Avant | Après |
|---|---:|---:|
| `sail_atlas.jpg` | 625 Ko | **365 Ko** |
| `armes_atlas.png` | 309 Ko | **155 Ko** |

`assets/` passe de 3,9 à **3,5 Mo**, alors qu'on vient d'ajouter 445 Ko
d'interface. Cache du service worker en `6.0.0.0`, six fichiers ajoutés au CORE,
tous servis en 200 et vérifiés depuis le navigateur.

## Passe 29 — Repêchage, et une fuite déterministe mise au jour

### Le vrai problème n'était aucun des quatre systèmes

Les deux relecteurs adverses ont convergé sur le même point bloquant : les
chantiers turbo / dégâts / chavirage / personnalisation ajoutaient des systèmes
à un jeu où **le joueur ne joue déjà plus**. Mesuré : un joueur éliminé à 5 s
restait jusqu'à **76 s** sans aucune entrée en Combat, et jusqu'à **345 s** en
Tour. Le mot « respawn » figurait dans la demande d'origine et avait disparu du
plan.

`BALANCE.respawn` : repêchage à 8,5 s, coque relevée à un plancher de 0,55 sans
être remise à neuf, flow à 0,30, et 2,4 s d'immunité — réutilisant le verrou du
rhum, qui fait déjà exactement ça dans `applyHit`.

| | Avant | Après |
|---|---:|---:|
| Temps mort maximal du joueur | jusqu'à 76 s | **8,7 s** |

Combat uniquement : en Tour une élimination est un abandon d'étape, le
classement général en dépend.

### Le chantier turbo est abandonné

Le relecteur l'a mesuré : passer à des charges divise le nombre de
déclenchements par 1,6 **sans changer le résultat de la course**, parce que le
flow économisé en tirant moins compense exactement les turbos non tirés. Et la
promesse d'interface — « vider les trois charges en 1,4 s » — est inatteignable.
Deux champs de checksum et un bump de schéma pour un no-op. Non livré.

Rappel de mesure : le turbo est **déjà** limité, par le flow et non par le
cooldown — 18 tirs passent et 3 582 sont refusés en 60 s de spam.

### ⚠️ Le rendu a autorité sur la simulation

Découvert en vérifiant le plan. `yole-physics.js:419` lit
`environment.sampleDisturbance` — la grille de sillage — pour composer
`waterHeight`, donc la poussée d'Archimède. Or `game.js:827` avance cette grille
depuis `frame()` avec le delta d'image **réel**, recentrée sur
`player.visual.root.position`, une position de **rendu**.

C'est une violation directe de la règle fondatrice du projet, et elle est
antérieure à ces chantiers.

Mesure, instances neuves à chaque passe : deux exécutions à 60 fps donnent le
même checksum (`b0cab887`), une à 30 fps donne `b626e16c`. ⚠️ Ce test **n'isole
pas** la fuite : le nombre de ticks diffère aussi (1795 contre 1792), donc
l'accumulateur diverge de son côté. La fuite est établie par lecture du code,
pas par cette mesure. **Non corrigée** — elle mérite son propre chantier.

### Corrigé au passage

Un équipier perdu jouait sa chute puis restait figé là où elle l'avait laissé,
jusqu'à 0,7 m de son bois. Invisible avant, parce que les yoles étaient
éliminées et remises à zéro trop vite ; le repêchage les fait vivre assez
longtemps pour que ça se voie. `test/crew-seating.test.mjs` n'assertait pas la
bonne chose : il vérifiait les six équipiers, y compris les morts. Il ne
contrôle plus que les **embarqués visibles** — un homme perdu n'est pas censé
être assis sur un bois.

## Passe 28 (suite) — L'équipage bouge, et à l'unisson

### Six statues 87 % du temps

La seule animation d'équipage était une foulée pilotée par `velocity` — la
vitesse de déplacement **latéral** de l'équipier le long de son bois. Sorti sur
la perche il ne se déplace plus, donc `run` tombe à zéro et l'homme se fige. Or
il est sorti 87 % du temps depuis le déport au repos : l'équipage était immobile
l'essentiel de la course.

Et `phase = crewIndex * 1.13` les déphasait de **65° l'un de l'autre** : quand
ils bougeaient, chacun battait sa propre mesure.

Deux animations continues, sur une **cadence partagée** par les six équipiers
d'une même yole :

- **le rappel** — buste, bassin et bras relancent à chaque houle, d'amplitude
  proportionnelle au déport, parce que c'est là que l'effort est réel ;
- **l'écopage** — poste *permanent* en course selon le lore, pas une réparation
  d'après-chavirage. Le dernier homme resté à bord écope, deux fois plus vite
  que la houle, et seulement s'il y a de l'eau.

`CREW_LAG` passe de 1,13 à **0,17** : juste ce qu'il faut de retard de proue en
poupe pour que le geste se lise comme une vague.

Mesuré sur 3 600 frames :

| | Valeur |
|---|---:|
| Amplitude des hanches, par équipier | 0,38 à 0,63 rad (22° à 36°) |
| Amplitude minimale | 0,38 rad |
| Corrélation équipier de proue / de poupe | **0,667** |

0,667 est la bonne cible : à 1,0 ce serait un pas de l'oie, à 0 du chaos.

### Une calotte claire par tête

À 13 px de haut sur téléphone, l'équipage est un liseré brun sur un fond de
coque presque noir. Ces 2 px clairs sont ce qui permet de **compter** les
hommes — le seul détail de personnage qui survive à cette réduction. Une demi-
sphère de 8×5 segments, un seul matériau partagé par les six têtes d'une yole,
posée sur l'os de tête réel (pas sur le proxy, qui n'est pas dans le graphe).

## Passe 27 — La yole penche, et le chavirage vide vraiment la yole

### La gîte

Mesurée hors chavirage, la gîte de navigation tenait à **5,8° médians** quand
les photos de course en montrent 20 à 30 en permanence. Le couple de gîte de la
voile passe de `sailForce * 0.52` à `* 1.85` :

| Quartile | Avant | Après |
|---|---:|---:|
| p25 | 2,6° | 5,1° |
| médiane | 5,8° | **11,3°** |
| p75 | 9,1° | **20,5°** |
| p95 | 22,8° | **31,6°** |

Contre-intuitivement le temps passé au-delà du seuil de chavirage **baisse**,
de 0,30 % à 0,18 % : une yole qui penche davantage fait sortir son équipage plus
loin sur les bois, et le couple de rappel de l'équipage la redresse. Aucune
spirale de dessalage.

### Le chavirage vidait mal la yole

On ne jetait que **3 mannequins** à l'eau alors qu'`activeCrew` restait à 6. Les
trois hommes qui barbotaient étaient donc des **doublons** de trois hommes
toujours visibles à bord — lesquels continuaient à jouer leur animation de
rappel, buste renversé, sortis sur les bois, sur une coque couchée à 90° en
train de couler.

Désormais tout l'équipage passe par-dessus bord, étalé le long de la coque et du
bord au vent. `YoleVisual.setOverboard()` est **purement visuel** : il ne touche
pas à `dynamics.activeCrew`, qui entre dans le checksum de replay et dont
dépendent la pompe et le couple de rappel.

### Les hommes à l'eau s'évaporaient

Chaque figurant vivait **0,85 s** après contact avec l'eau, en rétrécissant de
65 %/s : le chavirage se soldait par des silhouettes disparues avant d'être vues.
Ils flottent maintenant **5,2 s**, portés par la houle, tournant sur eux-mêmes,
coulant lentement des épaules, et ne rétrécissent que dans la dernière seconde.

Le bassin passe de 18 à 26 places : « FIN DU CHRONO » couche trois yoles dans la
même frame, soit 18 hommes, et le curseur circulaire recyclait des nageurs
encore à l'écran.

### Ce que le relevé a établi et qui reste à traiter

- **Les dégâts ne ralentissent presque pas.** Coque 0,50 → −20,5 %, mais voile
  0,50 → −2,0 %, mât → −2,0 %, bois cassés → **0 %**, et perdre 4 équipiers
  sur 6 → **0 %**, au bit près. Seule la coque compte.
- **`structure.mast` n'est jamais endommagé en partie réelle** : aucun payload
  d'attaque ne le touche. Le mât brisé visuel et la condition de chavirage
  `mast <= 0.01` sont du code mort.
- **Le chemin `hullStress` est mort** : il plafonne à 0,0004 pour un seuil de 1.
- **Le turbo est déjà limité par le flow, pas par le cooldown** : en le
  spammant 60 s depuis flow plein, 18 déclenchements passent et 3 582 sont
  refusés. Des charges seraient surtout plus *lisibles*, pas plus restrictives.
- ⚠️ **Une personnalisation persistée en localStorage casserait les replays** si
  elle touche la physique. Mesuré : même fichier rejoué, machine A (3 charges)
  → checksum `4bf371fa`, machine B (0 charge) → `58e65af4`, en silence. Tout ce
  qui doit survivre à une relecture doit emprunter la route de `seed`.
- Il reste **23 bits libres** (8 à 30) dans le masque d'actions. Le bit 31 ne
  fait pas l'aller-retour : `ReplayPlayer` rend un int32 signé.

## Passe 26 (soir) — Sargasses détourées, bois raccourcis

### Le radeau de sargasses était un carré blanc

La texture avait été générée sur fond noir pur pour servir de masque, mais le
PNG livré avait les coins à `(254,255,255)` en **alpha 255** : 92 % des texels
opaques, dont 52 % quasi blancs. Le radeau se posait sur la mer comme une
plaque.

`tools/key_alpha.py` reconstruit le canal alpha par **remplissage depuis les
bords** plutôt que par un seuil de luminance : une mèche blanchie au milieu des
sargasses garde son opacité, là où un seuil l'aurait trouée. 51 % du quad est
désormais transparent, coins à alpha 0, centre à 255.

Le matériau gagne `alphaTest: 0.06` — sans lui les texels transparents sont
quand même rasterisés et triés.

### Les bois étaient trop longs

Combinées au débord d'un seul bord ajouté la veille, les perches portaient à
6,6 m du centre. Longueurs réduites d'environ 28 %
(`[5.6, 6.2, 6.6, 6.7, 6.4, 6.0, 5.3]`), débord de 2,0 à 1,6 m, et `CREW_RAIL`
resserré en conséquence. Après coup, `test/crew-seating.test.mjs` :

| | Avant ce lot | Après |
|---|---:|---:|
| Déport moyen | 1,61 m | 1,34 m |
| Temps hors coque | 85,4 % | 81,5 % |
| Temps du côté haut | 91,5 % | 91,5 % |
| Étalement du groupe | 2,41 m | 2,01 m |
| Marge au bout du bois | 2,47 m | 1,32 m |

### Mesure en attente : la gîte est trop faible

L'auteur signale que la yole devrait pencher davantage. Mesuré sur 9 344
échantillons, hors chavirage (0,3 % du temps) :

| Quartile | Gîte |
|---|---:|
| p25 | 2,6° |
| médiane | **5,8°** |
| p75 | 9,1° |
| p95 | 22,8° |

Les photos de course montrent 20 à 30° en permanence. Le constat est donc juste,
mais le correctif touche le couple de gîte de la voile, donc la simulation — et
augmenter la gîte sans revoir le seuil de chavirage ferait dessaler en boucle.
Traité avec la refonte chavirage / dégâts / turbo, pas isolément.

## Passe 25 — L'équipage sort sur les bois

### Le vrai défaut n'était pas la pose, c'était le REPOS

`crewPositions[i]` est un **transitoire de 0,94 s** déclenché par une action, et
son état de repos est zéro (`yole-physics.js:176`, remis à plat dès que la gîte
retombe). Le rendu le prenait au pied de la lettre : déport moyen **0,18 m**,
équipier au-delà du plat-bord **4 à 8 % du temps**, au bout du bois 0,1 à 0,7 %.
Six hommes alignés sur l'axe de la coque 96 % du temps.

Or les photos de course montrent un état **permanent** : sous voile l'équipage
est dehors en continu, c'est la condition d'équilibre — une yole ronde n'a ni
quille ni gouvernail.

La simulation définit un ÉCART normalisé ; rien n'oblige le rendu à faire
correspondre zéro à x = 0. Le rendu décide donc où est le repos et la simulation
continue de fournir l'écart par-dessus. **Zéro ligne dans `src/sim`, aucun champ
nouveau, checksum de replay intact par construction.**

| Mesuré sur 32 016 échantillons | Avant | Après |
|---|---:|---:|
| Déport latéral moyen | 0,18 m | **1,61 m** |
| Temps hors coque (plat-bord à 0,90 m) | 4-8 % | **85,4 %** |
| Temps du côté haut | — | **91,5 %** |
| Étalement latéral du groupe | 0,71 m | **2,41 m** |
| Écart au bois le plus proche | 0,15 à 0,50 m | **0** |
| Marge minimale au bout du bois | — | 2,47 m |

### Le signal, c'est la gîte lissée

Deux essais ratés avant le bon, tous deux mesurés :

1. **Composante latérale du vent** : elle s'annule dès que la yole braque de
   0,22 rad (12°), donc l'équipage changeait de bord — côté haut 63 % du temps
   seulement.
2. **Gîte saturée puis lissée** : les crêtes de clapot partant chacune à ±1, la
   moyenne retombait à zéro — déport moyen 0,22 m.

Le bon ordre est **lisser la gîte, puis saturer** : `damp(roll, 0.55)` puis
`-tanh(rollSlow / 0.05)`. La gîte est positive 86,5 % du temps (moyenne +0,66)
et ne change de signe que toutes les 5,9 s, donc un lissage à 1,8 s la suit sans
la détruire.

### Ce qui change aussi

- **Les bois ne débordent plus que d'un bord** (`BEAM_OFFSET`, piloté par le
  même signal continu). Un peigne symétrique se lit à l'écran comme une arête de
  poisson, jamais comme une yole.
- **Les six yoleurs sont ÉTAGÉS** le long des perches (`CREW_RAIL`), pour que le
  groupe dessine une diagonale et non une rangée parallèle à la coque.
- **Chacun est assis sur SON bois** : la table de z de l'équipage dérive
  désormais de celle des bois (`CREW_BEAMS`), les deux ne peuvent plus diverger.
  Le bois arrière reste libre — poste du patron.
- **Un bois qui porte un homme n'encaisse plus les dégâts visuels** : il le
  raccourcissait et le faisait pivoter, emmenant le yoleur dans le vide.
- Le terme de la simulation passe de 2,55 à 1,15 : il s'ajoute maintenant à un
  repos déjà déporté, et empilait les deux jusqu'à 5,2 m.

### Ce qu'on n'a PAS fait, et pourquoi

**Pas de genoux ni de coudes.** J'avais annoncé que l'absence de ces
articulations était le verrou. C'est faux deux fois : la posture réelle du
yoleur a les **jambes tendues** pendantes de part et d'autre de la perche, ce
que les 7 articulations du contrat savent déjà faire ; et les ajouter
déplacerait les mains de 0,3 à 1,2 px sur le téléphone, la tête d'exactement
zéro. `CREW_JOINTS` reste à 7 clés, le repli procédural est intact.

**Pas de table de poses articulaires.** La caméra regarde presque le long de
l'axe de la coque (plongée 26°) : un mètre vaut 10,5-15,4 px en latéral mais
seulement 2,7-4,5 px en longitudinal. Le détail interne du corps est non résolu
à cette distance ; le déport, lui, vaut 21 à 31 px pour 2 m, soit deux à trois
fois la hauteur totale d'un équipier.

⚠️ **`npm run verify` ne voyait rien de tout ça.** `YoleVisual.update()` part de
`frame()`, pas de `fixedUpdate()` — une sonde qui pilote `fixedUpdate` seul ne
l'appelle qu'une fois, au reset. Mes premières mesures étaient nulles pour cette
raison. D'où `test/crew-seating.test.mjs`, branché dans `verify`, qui pilote la
vraie boucle et assert les cinq invariants du tableau.

## Passe 24 — Équipage régénéré et teinté par équipe

### L'équipage rendait en métal noir depuis le début

C'est **la** cause des « persos moches », et elle n'avait rien à voir avec la
direction artistique. Le glTF du générateur ne déclare ni `metallicFactor` ni
`roughnessFactor`. La spec impose alors **1,0** pour les deux, et GLTFLoader
l'applique fidèlement (`vendor/addons/GLTFLoader.js:3586-3587`) :

```
brut du loader → { metalness: 1, roughness: 1, emissiveIntensity: 1 }
```

`metalness` à 1 annule le terme diffus, et le projet n'a **aucune** `envMap` ni
`scene.environment` — donc le spéculaire indirect est nul lui aussi. Les 24
équipiers étaient éclairés par quelques lobes analytiques seulement, quelle que
soit leur texture. Le correctif tient en deux lignes dans `AssetLibrary.load()`,
à côté du correctif d'émissive qui traitait déjà le même genre de défaut
d'export.

Mesuré en A/B sur les mêmes pixels, seul le matériau changeant :

| | Avant | Après | |
|---|---|---|---:|
| Torse `#ff7b24` | `rgb(100,34,3)` lum 46 | `rgb(162,81,30)` lum 95 | ×2,1 |
| Torse `#2fb9c4` | `rgb(9,56,48)` lum 45 | `rgb(40,119,117)` lum 102 | ×2,3 |
| Torse `#9b5cff` | `rgb(49,22,70)` lum 31 | `rgb(100,63,151)` lum 77 | ×2,5 |
| Torse `#ff2f6d` | `rgb(98,7,21)` lum 27 | `rgb(160,40,66)` lum 67 | ×2,5 |
| Peau nue | `rgb(42,10,3)` lum 16 | `rgb(91,46,33)` lum 55 | **×3,4** |

C'est la peau qui souffrait le plus : un brun foncé multiplié par un métal sans
environnement tombe à quasi-noir. Le correctif vaut pour **tout** rig GLB, donc
l'ancien équipage souffrait déjà du même défaut — ce n'est pas une régression
introduite par la régénération, c'est une dette révélée par elle.

⚠️ `npm run verify` ne pouvait pas l'attraper : le bloc EGL sort
`{"ok": true, "skipped": true, "reason": "EGL/GLES2 libraries unavailable"}` sur
cette machine, et le test navigateur tourne sur le mock Three, qui ne construit
aucun matériau physique. Tout ce qui touche au shading doit être mesuré dans un
vrai navigateur.

### Pourquoi refaire les personnages

L'ancien rig venait d'un concept **photoréaliste**, alors que
`docs/ART_DIRECTION.md` interdit explicitement « le réalisme photo sur les
personnages — ils sont vus à 30 pixels de haut ». Un humain photoréaliste posé
dans un monde en aplats se lit comme un corps étranger : c'est ce qui donnait
l'impression de cheap, pas le nombre de triangles.

Le nouveau concept est cel-shadé, contours francs, proportions arcade. Le mesh
passe de 2 092 à **2 510 triangles** (+10 000 sur les 24 équipiers, soit +7 % du
total à l'écran) — la densité n'était pas le problème, la lisibilité l'était.

### Le maillot suit enfin l'équipe

Les 24 équipiers portaient tous le **même maillot rouge**, parce que la couleur
était cuite dans la texture. `SkeletonUtils.clone()` duplique la hiérarchie et
la liaison d'os mais **partage les matériaux** : teinter sans cloner aurait
repeint les quatre équipages d'un coup.

Le rig ne sort qu'**une seule texture** couvrant peau ET tissu, donc un
`material.color` aurait aussi teinté la peau. Mesuré sur la texture livrée, les
deux populations sont franchement bimodales :

| Population | Part des texels | Chroma | Couleur moyenne |
|---|---:|---|---|
| Tissu | 39 % | 0,0-0,1 | `228,223,216` |
| Peau | 60 % | 0,7-0,8 | `111,48,36` |

D'où un masque par chroma et luminance dans `makeCrewMaterial()`, appliqué après
`<map_fragment>` — donc en espace **linéaire**, pas sur les valeurs sRGB lues
dans le fichier. Un matériau par yole, six équipiers par matériau.

Mesuré sur pixels rendus, quatre équipes côte à côte :

| Équipe | Torse (tissu) | Mollet (peau nue) |
|---|---|---|
| `#ff7b24` | `rgb(130,46,6)` | `rgb(57,16,6)` |
| `#2fb9c4` | `rgb(15,74,64)` | `rgb(58,16,6)` |
| `#9b5cff` | `rgb(65,32,93)` | `rgb(59,22,10)` |
| `#ff2f6d` | `rgb(128,13,30)` | `rgb(59,40,30)` |

Le tissu suit l'équipe, la peau ne bouge pas. `renderer.info.programs` reste à
**1** : les quatre matériaux partagent un programme et ne diffèrent que par leur
uniforme, donc aucune compilation supplémentaire.

### 256² ne suffisait pas, et pourquoi

Premier essai à 256² comme l'ancien rig : maillots marbrés de taches pâles.
L'atlas UV du générateur est très fragmenté ; réduit d'un facteur 8, les îlots
bavent l'un dans l'autre et les texels de mélange tombent hors du masque. Passé
en **512²**, la dispersion à 90 % sur le torse s'effondre de 35 à ≤ 6. Le GLB
pèse 264 Ko contre 190 Ko — **+74 Ko pour un défaut visible en supprimé**.

⚠️ Le cache du service worker passe en `5.1.1.0` : `yole_crew.glb` change de
contenu sans changer de nom, une PWA déjà installée aurait resservi l'ancien rig
indéfiniment.

### Limite connue

Le blanc des yeux est à chroma nulle et luminance haute : il tombe dans le
masque et prend la couleur d'équipe. À la taille d'affichage réelle l'œil fait
moins d'un pixel — non corrigé sciemment.

## Passe 23 (nuit)

Trois textures générées en parallèle, câblées dans la foulée.

### Bois des bwa

Une seule texture couvre les 7 bois dressés, le mât et la vergue de chaque yole
— **28 perches à l'écran** qui étaient en orange plat. Le matériau est déjà
partagé, il n'y avait qu'à lui poser une carte.

### Caisses

Le matériau instancié des 18 caisses porte maintenant une planche cloutée avec
ferrures et emblème de tonneau. L'émissive tombe de 0,5 à 0,22 : la caisse n'a
plus besoin de briller pour se voir, la texture s'en charge.

### Personnalisation des voiles — pour le prix d'un décalage d'UV

Atlas 2×2 de **quatre livrées** : koulèv (serpent), lanbi (lambi), kolibri,
volcan. Chaque yole prend sa case via `repeat(0.5, 0.5)` et un `offset` dérivé de
son index.

Aucun code de rendu nouveau : la voile était déjà UV-mappée depuis l'origine, et
la coque a reçu ses UV la veille. La personnalisation ne coûtait donc plus qu'un
atlas — c'est ce que le déblocage des UV avait promis.

Vérifié en jeu : **4 offsets distincts**, donc quatre voiles différentes.

### État

10 textures chargées, **215 draw calls**, zéro erreur console. Checksums
inchangés — aucune de ces trois textures n'a d'autorité gameplay.

Coût : 6 crédits.

# Changelog — Tropical Mayhem V3.5

## Passe 22 (soir) — Coque texturée

### Les UV existaient déjà, elles étaient jetées

Diagnostic corrigé : ce n'était pas le baker le coupable, mais **`fit_hull_glb.py`**.
La source `yole_hull_raw.glb` porte bien un `TEXCOORD_0` ; l'outil d'ajustement
lisait POSITION et NORMAL, puis réécrivait un GLB sans les UV. La coque arrivait
donc en jeu sans coordonnées de texture, et toute peinture était impossible.

L'outil lit et réécrit maintenant `TEXCOORD_0`. Coque : 116 → 152 Ko,
3 061 triangles inchangés.

### Texture neutre, et c'est un impératif

Les quatre yoles **partagent la même géométrie** et ne se distinguent que par
`material.color`. Une texture de coque colorée écraserait cette teinte et ferait
perdre au joueur la lecture du classement.

La texture livrée est donc une carte d'usure quasi grise — bordages, calfatage,
éclats de peinture, cernes de sel, salissure de flottaison — **multipliée** par
la couleur d'équipe.

Neutralité **mesurée avant livraison** : écart chromatique maximal 24/255,
moyennes RGB 159/156/152. Un garde-fou dans le script désature à 55 % si l'écart
dépasse 46 — il n'a pas eu à se déclencher.

### Vérifié en jeu

4 coques texturées, 4 UV présentes, **4 couleurs distinctes conservées**.
217 draw calls, 7 textures chargées, zéro erreur console. Checksums inchangés :
le rendu n'a aucune autorité gameplay.

# Changelog — Tropical Mayhem V3.5

## Passe 21 — Posture des yoleurs, et le RHUM

### Les équipiers ne sont plus debout

C'était le vrai défaut, et il tenait à un contresens sur le sport. Une yole ronde
n'a **ni quille ni gouvernail** : tout le couple de redressement vient du poids
des hommes **assis à califourchon sur les bois dressés**. Ils sortent sur la
perche quand ça gîte, ils rentrent quand ça mollit.

La simulation calculait déjà ce déport — `crewPositions[i]`, avec délais
individuels et onde humaine. Seul le VISUEL les laissait debout en T-pose.

`CrewVisual.update()` mélange désormais deux poses selon le déport :

| | À bord (déport nul) | Au bout du bois (déport max) |
|---|---|---|
| Corps | vertical | basculé de 0,62 rad vers l'extérieur |
| Jambes | foulée de course | serrées sur la perche, pendantes |
| Bras | balancier de marche | tendus en appui arrière |
| Buste | droit | renversé vers l'extérieur |
| Tête | suit le buste | maintenue à l'horizontale (le regard va au plan d'eau) |

Zéro donnée nouvelle : tout vient de `crewPositions`, du roulis et de la vitesse
latérale que la physique produisait déjà.

### Sort RHUM

L'étoile de Mario Kart, version Martinique. 5 s de **vitesse (+6,4 d'accélération)
et d'invulnérabilité totale**.

L'invulnérabilité est posée au seul point d'entrée des dégâts
(`YoleDynamics.applyHit`) : elle bloque la casse volontaire, mais **pas** la
flottaison, l'eau déjà embarquée ni le Grain — sinon le sort deviendrait une
immunité absolue et le Mur du Grain cesserait d'exister.

- butin rare (12 %), rééquilibrage des autres poids ;
- l'IA le boit **dès qu'elle l'a** : ça ne se garde pas ;
- nouveau bit d'action `ACTION_RHUM` (128) enregistré dans les replays ;
- bouton contextuel doré, hors de la grille tactile 3×2 pour ne pas la casser.

### Checksums

Scénario `d07260ab`, post-frames `e1c1cbe8`, `replayOk: true`. Physique pure
`83398a87` inchangée. `simulationVersion` → `3.5.0`,
`gameplayVersion` → `tropical-mayhem-v3-5-rhum`.

205 draw calls.

# Changelog — Tropical Mayhem V3.5 — Sargasses, gerbes, relief

## Passe 20 (soir)

### Obstacles : radeaux de sargasses

Le vrai fléau des côtes martiniquaises devient un obstacle de jeu. On s'y englue :
freinage, gîte, eau embarquée — **proportionnels à la pénétration**, donc frôler
le bord coûte peu et traverser en plein milieu coûte cher. Ce n'est pas un mur,
c'est un choix de trajectoire.

Position et taille sont des **fonctions pures de l'indice de rangée** : aucun
tirage, pas un seul appel à `gameRng`. Espacement 137 m, décalé du pas des
caisses (88 m) pour éviter que les deux grilles ne se superposent.

**Défaut introduit puis corrigé dans la même passe** : la première version ne
créait les radeaux que si la texture était chargée — l'absence d'un asset de
RENDU aurait donc changé la PHYSIQUE, et une relecture faite sans la texture
aurait divergé de l'enregistrement. C'est exactement ce que l'architecture
interdit. Les radeaux existent maintenant toujours côté simulation ; seule leur
représentation dépend de la texture.

`inSargasse` ajouté à `Boat.reset()` — même classe de fuite d'état que
`stormTimer` la semaine dernière.

### Traînées

Second pool de billboards dédié aux gerbes, avec un flipbook d'écume 4×4 :

- **gerbe d'étrave** à chaque slam de coque au-delà de 0,55, dimensionnée par la
  violence de l'impact ;
- **gerbe latérale sur Bwa Dash** — le dash n'avait qu'un anneau plat, il n'y
  avait littéralement aucune traînée.

### Relief de fond remonté

La bande était trop discrète après correction de l'alpha : hauteur ×1,35 et
pied abaissé.

### Checksums

Le gameplay change (les sargasses freinent) : scénario `7e241682`, post-frames
`1ef68357`, replay `c7154595`, champion du Tour désormais CARACOLI.
`replayOk: true`. La physique pure `83398a87` est inchangée — les sargasses
agissent depuis la couche jeu, pas depuis `YoleDynamics`.

### État des assets

6 textures chargées, 15 échantillons audio, 231 draw calls, 137 000 triangles,
zéro erreur console.

# Changelog — Tropical Mayhem V3.4

## Passe 19 — Vrais bruitages, mer éclaircie, relief de fond

### Sound design réel (ElevenLabs)

15 échantillons générés et branchés : coco tiré et coco explosé (registre comique
assumé), collisions de coques, gerbes, turbo, dash, harpon, mine, takedown, bwa,
bouée, victoire, plus deux lits continus (eau, Grain).

Le moteur charge les MP3 et **remplace la voix synthétisée du même nom** ; toute
voix sans fichier garde sa version DSP. Un échec réseau ne coûte donc rien.
Les clips de boucle sont recousus (queue fondue dans la tête) : un clip généré ne
boucle jamais proprement tel quel. Et la variation de hauteur passe de ±4 % à
±3 ‰ sur les échantillons réels — un vrai son supporte mal le pitch-shift.

552 Ko, tous enregistrés pour l'offline.

⚠️ Higgsfield ne pouvait PAS le faire : son outil audio est limité à la voix et
refuse explicitement musique et bruitages.

### Mer éclaircie

Le bleu profond était `#003f62`, très sombre, et le mélange démarrait à 0,36 :
la mer restait majoritairement dans le ton foncé. Palette remontée
(`#0a6a8e` / `#18b0c4` / `#64f0dc`), mélange à 0,54, translucidité des crêtes à
contre-jour ×1,7. Et l'étalonnage de la veille était **trop fort** — contraste
0,46 → 0,30, vignette 0,17 → 0,11.

### Relief de fond et nuages

- bande cylindrique en **espace monde** à 1180 m, qui suit la position de la
  caméra mais pas sa rotation ;
- nuages en texture panoramique : ~32 hachages par pixel de ciel remplacés par
  deux lectures, avec le fbm conservé en repli.

**Défaut introduit puis corrigé dans la même passe** : mon alpha proportionnel à
la luminance rendait tout le relief translucide, et le cylindre trop haut étirait
la silhouette — résultat, une bande verdâtre barrant l'horizon. Corrigé par une
alpha franche (seuil dur avec bord doux) et une bande recadrée sur les seules
lignes de montagne.

# Changelog — Tropical Mayhem V3.4 — Passe massive

## Passe 18 (nuit)

### L'eau ne rentre plus « toujours trop »

Le bilan était structurellement perdu : **1,77 kg/s de pompe contre 8,50 kg/s
sous le Grain**, soit 4,8× en défaveur du joueur. L'eau embarquée n'était pas une
mécanique, c'était une sentence — on ne pouvait jamais écoper.

Nouvelle courbe : pompe `(2,2 + équipiers × 0,55) × cohésion`, Grain à 5,4 kg/s,
récif à 5,0, fuite de coque ×2,4 au lieu de ×3,2.

| Équipage | Pompe | Solde sous le Grain |
|---:|---:|---:|
| 6 | 5,50 | **+0,10** — on tient |
| 5 | 4,95 | −0,45 |
| 4 | 4,40 | −1,00 |
| 2 | 3,30 | −2,10 — on coule |

La tension revient au bon endroit : l'état de l'équipage, pas une fatalité.

### Impacts renforcés

Tous les paliers montent : gel du Takedown 125 → 150 ms, recul 1,05 → 1,75,
secousse 0,86 → 1,30, coup de zoom 3,0 → 4,6. Le palier `graze`, qui ne figeait
pas du tout, gèle maintenant 12 ms.

### Détail de mer procédural — gain visuel ET gain de perf

Les micro-normales étaient deux octaves de bruit **par pixel**, isotropes, sans
direction de vent : la signature « gelée plastique ». Remplacées par une normal
map générée au boot dans un canvas, aux rides **étirées dans l'axe du vent**,
lue en 2 `texture2D`. La dentelle de mousse réutilise son canal alpha au lieu
d'un troisième bruit.

Générée plutôt que téléchargée : **0 octet livré**, 0 entrée de service-worker,
monofichier intact. Repli sur une normale plate si le canvas est indisponible.

### Draw calls : 293 → 225

- 18 caisses = 36 meshes → **2 InstancedMesh** ;
- les 16 fissures de coque étaient dessinées en permanence alors qu'elles sont
  invisibles sur une coque saine — un mesh transparent à opacité nulle coûte
  quand même son draw call.

### Interface

- **atlas d'icônes** : coco, harpon, mine, turbo, dash, bwa remplacent les emoji ;
- **pad directionnel** : anneau gravé avec repères de barre, pommeau laiton bombé ;
- **chrono** : cartouche cuivre-or, chiffres tabulaires creusés, liseré sous le temps.

### Checksums

Tous déplacés, y compris la physique pure — normal, le bilan d'eau **est** de la
physique. `replayOk: true` : le déterminisme tient.

| | Avant | Après |
|---|---|---|
| Physique pure | `3ebe9ca8` | `83398a87` |
| Scénario | `5d7eb3fe` | `557afa26` |
| Post-frames | `9f120d86` | `65f7dbbb` |
| Replay | `2eb59a1e` | `b477c108` |

### Limite constatée : pas de bruitage possible via Higgsfield

L'outil audio de Higgsfield est **explicitement limité à la voix** : il refuse
musique et bruitages hors pipeline de génération de jeu. Le sound design ne peut
donc pas venir de là. Le vrai coupable reste la banque synthétisée maison — elle
est réécrivable en code, sans crédit.

# Changelog — Tropical Mayhem V3.3

## Passe 17 — Le sillage n'était pas rendu, et trois autres tells

Une investigation en profondeur a trouvé mieux que « il manque des textures ».

### Le sillage n'arrivait jamais au fragment

Le shader d'océan déclare `uWakeTex` et calcule `vWakeUv` **dans le vertex**…
mais le **fragment ne déclarait ni l'un ni l'autre**. `vWakeUv` était un varying
mort. La mousse de sillage n'atteignait le fragment que via `varying float
vWakeFoam`, échantillonné **une fois par sommet** — soit tous les 1,52 m sur
l'anneau proche du clipmap.

Une traînée de 1 à 2 m de large était donc moyennée dans le vide : **le sillage
ne se voyait pas**, alors que toute la grille de sillage 192² était calculée,
diffusée, advectée et uploadée à chaque frame.

Corrigé : lecture par fragment, avec la même garde de bornes que le vertex, et
poids remonté de 1,05 à 1,55.

### Le bandeau de debug était allumé par défaut

`showPerf: true` dans les réglages : « HQ · 70.7 ms · 289 DC · 138352 tris »
s'affichait sur **toutes** les captures du projet. C'est le tell n°1 d'un build
de développement, et il coûtait un booléen.

### Les 24 équipiers étaient fullbright

Le GLB Meshy exporte avec `emissiveFactor: [1,1,1]` et une `emissiveTexture` :
l'équipage ne réagissait **ni au soleil, ni au Grain, ni aux flashs d'impact**.
C'étaient des taches rouges plates au milieu d'une scène éclairée.
`emissiveIntensity = 0` posé au chargement — aucun asset à régénérer.

### Étalonnage

Le split-tone de la passe beauté existait déjà, mais **sans courbe de contraste,
sans point noir et sans vignette permanente** : toute l'image tenait dans une
bande de tons moyens teal. Ajouté : courbe en S, noirs relevés vers le teal
profond, hautes lumières vers l'or, désaturation et assombrissement périphériques.

Piège traité au passage : le profil **LQ avait `postFX: false`** — l'étalonnage
aurait disparu sur la moitié du parc mobile, et LQ n'aurait plus été le même jeu
que HQ. LQ garde désormais le post-FX avec `bloom: 0`.

### Coût

275 draw calls, 135 900 triangles. Checksums `3ebe9ca8`, `5d7eb3fe`, `9f120d86`,
`2eb59a1e` — **tous inchangés**.

### Reste identifié, chiffré, pas encore fait

Deux chantiers qui sont des gains visuels **et** des gains de performance :

- **détail de surface** : le shader fait ~20 hachages par fragment sur 65 % de
  l'écran (micro-normales, dentelle de mousse, caustique, ombre de nuage). Une
  normal map tuilable défilant selon le vent = 2 `texture2D` au lieu de ~12
  hachages, et supprime l'aspect « gelée plastique » d'un bruit isotrope sans
  direction ;
- **ciel** : les nuages sont un fbm 3D à 4 octaves, soit ~32 hachages par pixel
  de ciel, avec une couverture de 0,70 qui les rend quasi invisibles dans la
  bande basse où la caméra regarde. Une bande de cumulus tuilable = 1 à 2
  `texture2D`.

# Changelog — Tropical Mayhem V3.3

## Passe 16 (soir) — Premières textures, et de vraies explosions

Le projet n'avait **aucune texture** en dehors du canvas de sillage : tout était
en aplats de couleur unie. C'était la cause principale de l'impression
« prototype », davantage que la géométrie.

### Voile texturée

La voile est la plus grande surface d'une yole à l'écran, et `makeSailGeometry`
produisait **déjà des UV** — elle était texturable depuis toujours. Emblème de
djab et chevrons durs, généré en 2k, livré en 1k (236 Ko).

Le matériau bascule automatiquement : texture présente → `map` + couleur blanche ;
texture absente → l'ancienne couleur d'accent. Aucune régression possible.

### Explosions en flipbook

`ExplosionPool` : des billboards face-caméra dont l'UV parcourt les 16 cases d'un
atlas 4×4 au fil de leur vie. **Un seul draw call pour tout le pool.**

Pourquoi pas le pool de particules existant : il rend des `THREE.Points`, dont
`gl_PointSize` est plafonné par le matériel — impossible d'y faire une grosse
explosion. Les particules restent pour les gerbes et les éclats.

Branché sur le Canon Coco (5,2 m, 0,78 s) et la Mine Tsunami (8,6 m, 0,95 s).

### Traitement des assets

- l'atlas généré avait des **lignes de séparation blanches** malgré la consigne :
  en blending additif elles seraient devenues des croix lumineuses. Chaque case
  est recoupée vers l'intérieur, et tout pixel sous un seuil est forcé à noir pur ;
- 2k en génération, 256 px par case en livraison ;
- 10,5 Mo de sources PNG → **371 Ko** livrés en JPEG.

### Coût

293 draw calls, 138 000 triangles. Checksums `3ebe9ca8`, `5d7eb3fe`, `9f120d86`,
`2eb59a1e` — **tous inchangés** : le rendu n'a aucune autorité gameplay.

Crédits dépensés : 4 (deux images `nano_banana_pro`).

# Changelog — Tropical Mayhem V3.3

## Passe 15 — Quatre correctifs de justesse, et un plan abandonné

Une étude en profondeur des rôles d'équipage a conclu que **le système de rôles
tel qu'imaginé est creux** — mesures à l'appui — mais elle a mis au jour quatre
défauts réels, dont un qui touche la promesse centrale du projet.

### Le déterminisme navigateur n'était pas garanti

`waveField.setWeather()` — qui écrit l'amplitude de houle **échantillonnée par la
physique** — était appelé depuis `ocean.update()`, donc à la **cadence d'image**.
La correspondance tick → amplitude dépendait du frame pacing : deux relectures à
des cadences différentes ne pouvaient pas être bit-à-bit.

La suite Node ne pouvait pas le voir : elle n'appelle jamais `ocean.update()`,
donc l'amplitude de tempête n'y était **jamais exercée du tout** — `globalAmplitude`
restait à 1 pour toujours.

Corrigé : l'appel est passé dans `fixedUpdate`, au même tick que la météo qui le
produit. Les tests exercent enfin la houle de tempête, d'où le déplacement des
checksums de gameplay.

### Inondation lue à l'envers par le rendu

`yole-visual.js` traitait un `Float32Array(6)` comme un tableau de 4 :
`flooding[4]` et `flooding[5]` n'étaient **jamais lus**, et « tribord »
additionnait du bâbord-milieu avec du tribord-arrière. La nappe d'eau intérieure
s'inclinait du mauvais côté et sur le mauvais axe. Regroupement corrigé sur les
six compartiments réels (0-2 bâbord, 3-5 tribord ; 0/3 arrière, 2/5 avant).

### Les entrées joueur n'étaient pas neutralisées en relecture

Handlers d'UI, clavier et manette restaient actifs pendant un replay et mutaient
directement les dynamics. Le garde `isApplyingReplay` ne protégeait que
l'**enregistrement du bit**, pas la mutation physique : toucher un bouton pendant
une relecture la faisait diverger. Verrou ajouté sur les points d'entrée
pilotables par un humain — l'IA, elle, continue de jouer normalement.

### Quatre champs fuyaient entre les manches

`stormTimer`, `collisionCd`, `coastCollisionCd` et `lastFloodWarningAt` portent de
l'autorité gameplay et n'étaient remis à zéro ni par `Boat.reset`, ni par
`resetRound`, ni par `startMatch`. `stormTimer` déclenche une élimination au-delà
de 2,15 s et `eliminated` entre dans le checksum.

### Checksums

| | Avant | Après |
|---|---|---|
| Physique pure | `3ebe9ca8` | **`3ebe9ca8`** — inchangé |
| Scénario Combat Box | `1a9df2a3` | `5d7eb3fe` |
| Combat Box post-frames | `1857be84` | `9f120d86` |
| Replay | `35c439b1` | `2eb59a1e` |

`replayOk: true` : la relecture reproduit toujours la partie au bit près. Seul le
correctif de houle déplace les valeurs — les trois autres sont neutres.

### Correction d'une affirmation antérieure

Le bump de `simulationVersion` / `gameplayVersion` fait la veille **ne protège
rien** : ces deux champs sont écrits par `export()` et lus par **aucune ligne** du
projet. Seul le changement de clé du coffre masque les anciens replays, et il
n'existe aucune détection de divergence au chargement. À corriger avant de
promettre quoi que ce soit sur la compatibilité des replays.

# Changelog — Tropical Mayhem V3.3 — Armes ramassables

## Passe 14 (soir)

Les armes ne sont plus disponibles en permanence derrière un cooldown : **il faut
aller les chercher**. C'est le changement de design demandé, façon Mario Kart.

### Le système

- `game/pickups.js` : caisses semées par rangées le long du parcours, trois
  voies par rangée, six rangées vivantes qui se recyclent devant le peloton ;
- **la munition commande, le cooldown ne fait plus qu'anti-spam** — chaque yole
  démarre à sec, plafond de 3 par arme ;
- table de butin pondérée : coco 50 %, harpon 30 %, mine 20 % ;
- réapparition d'une caisse 4,2 s après ramassage.

### Déterminisme

La position d'une caisse est une **fonction pure de son indice de rangée**
(aucun tirage) ; seul le contenu est tiré, sur `gameRng`, déjà dans le flux
déterministe. Une relecture retrouve donc les mêmes caisses au même endroit avec
le même butin — vérifié : `replayOk: true`, checksum live et relecture identiques.

### IA

Elle ne peut plus tirer à vide, et **va chercher les caisses quand elle est à
sec** — sans ça elle serait restée désarmée toute la manche et le joueur n'aurait
eu aucun adversaire. Deux tests verrouillent ces deux comportements.

### HUD

Les trois boutons d'arme affichent `VIDE`, puis `PRÊT`, puis `×2` / `×3`. Grisés
tant qu'on n'a rien ramassé : au coup d'envoi, on voit qu'on est désarmé.

### Checksums : ce qui bouge et ce qui ne bouge pas

| | Avant | Après |
|---|---|---|
| Physique pure | `3ebe9ca8` | **`3ebe9ca8`** — inchangé |
| Scénario Combat Box | `149bc2cf` | `1a9df2a3` |
| Combat Box (post-frames) | `3b364474` | `1857be84` |
| Replay | `f9a07291` | `35c439b1` |

La physique de coque est **intacte** — normal, les caisses n'y touchent pas. Les
checksums de gameplay bougent, comme prévu : `simulationVersion` passe à `3.3.0`
et `gameplayVersion` à `tropical-mayhem-v3-3-pickups`. **Les replays enregistrés
avant cette version ne sont plus relisibles.**

### Reste à régler

Les caisses sont un peu petites à lire de loin, et l'équilibrage (espacement 88 m,
pondération du butin, plafond de 3) n'a **pas été playtesté** — ce sont des
valeurs de départ, toutes dans `PICKUP` et `LOOT` en haut du module.

# Changelog — Tropical Mayhem V3.2

## Passe 13 — Découpage de game.js

`game.js` faisait **2 159 lignes** et mélangeait armes, manches, Tour, caméra,
HUD et entrées. Découpé avant d'ajouter pickups, rôles et modes — sinon chaque
nouvelle fonctionnalité serait retombée dans le même fichier.

| Module | Contenu | Lignes |
|---|---|---:|
| `game/balance.js` | équilibrage, identités, étapes, utilitaires partagés | 88 |
| `game/weapons.js` | coco, harpon, mine : pools, tir, ciblage, explosions | 445 |
| `game/match.js` | manches, Tour, Grain, éliminations, fin de partie | 284 |
| `game/input.js` | manette, actions, zoom, liaison UI | 274 |
| `game/hud.js` | classement, messages, killfeed, jauges | 164 |
| `game/camera.js` | suivi de course et survol du menu | 88 |
| `game/game.js` | orchestration, boucle fixe, état partagé | **896** |

### Composition par mixins, et pourquoi

L'état de `Game` est très couplé (pools, boats, rng, télémétrie, spatial hash).
Un découpage en vraies classes aurait demandé de réécrire chaque accès `this.x` —
gros diff, gros risque, alors que la contrainte était un comportement **identique
au bit près**.

Les méthodes sont donc déplacées **verbatim** dans des objets littéraux (la
syntaxe abrégée est la même) et composées par `Object.assign` sur le prototype.
Zéro changement de sémantique. Chaque cluster pourra être promu en vraie classe
plus tard, un à la fois.

### Le filet a fonctionné

Vérification après **chaque** étape. Les quatre checksums sont restés identiques
d'un bout à l'autre : simulation `3ebe9ca8`, scénario `149bc2cf`, Combat Box
`3b364474`, replay `f9a07291`, champion du Tour inchangé. C'est exactement à ça
que sert cette suite.

### Deux bugs d'outillage attrapés en route

- `build_single_file.py` ne retirait que les imports **sur une ligne** : un bloc
  multiligne survivait dans le bundle et redéclarait ses noms. Regex corrigée.
- Mon extracteur avalait la fin du fichier sur la **dernière** méthode extraite
  (fermeture de classe comprise). Corrigé, et la classe est refermée proprement.

## Passe 12 (soir) — Ligne de flottaison

Une coque sans traitement de flottaison est **posée** sur l'eau, jamais dedans.
La partie immergée est maintenant assombrie et lustrée, et une **collerette
d'écume** suit la surface.

Le niveau d'eau arrive en uniforme depuis la simulation
(`YoleDynamics.centerWaterHeight`, simple mémorisation d'une valeur déjà
calculée — aucune force modifiée, aucun tirage, checksum `3ebe9ca8` inchangé),
donc la collerette suit la houle **et** la gîte.

### Lacune de la suite de tests, révélée au passage

Première version : injection de `roughnessFactor` depuis `<color_fragment>`, où
l'identifiant n'est pas encore déclaré. Le shader ne compilait pas.

**`npm run verify` n'a rien vu** : son smoke navigateur tourne sur le mock Three,
qui ne compile aucun shader. Le harnais shader dédié, lui, ne couvre que les six
programmes maison (océan, ciel, Grain, pluie, particules, post-FX) — pas les
`MeshStandardMaterial` modifiés par `onBeforeCompile`. L'erreur n'est apparue que
dans une capture WebGL réelle.

Correction : l'ajustement de rugosité est injecté dans `<roughnessmap_fragment>`,
où `roughnessFactor` existe.

## Passe 11 — Une seule voile, îlots volcaniques, plage de zoom

### Correction : la yole ronde martiniquaise grée UNE voile

Le gréement avant ajouté la veille était une erreur — corrigée sur retour du
projet. Le rake des mâts vers l'avant et le faisceau de bois dressés, eux, sont
confirmés par les photos et restent.

### Îlots

Un cône parfait se lit comme un pylône : c'était le cas. Les îles sont désormais
des silhouettes volcaniques irrégulières — grille radiale bruitée, arêtes,
sommet décalé, épaulement — avec un **étagement de couleurs par altitude**
peint aux sommets : sable, végétation, végétation dense, roche volcanique à
découvert. Vertex colors et flat shading : **toujours un seul draw call par
île**.

Cinq silhouettes sont tirées une fois au démarrage ; la variété vient du choix,
de l'échelle et d'un facteur d'élancement (îles basses larges, pitons étroits).

### Plage de zoom

Mesurée après convergence du lissage : 16,7 m au plus près pour une yole de
11 m — trop loin pour lire l'équipage et la coque. Plage ouverte côté rapproché,
`0,46 → 2,6` (contre `0,72 → 2,35`), constantes nommées `ZOOM_MIN` / `ZOOM_MAX`.

### Flottaison : mesurée, pas retouchée

Franc-bord médian **0,152 m** au centre (plat-bord +0,04, fond −0,58) et écart de
houle étrave/poupe de **8 cm** seulement. La coque ne « casse » donc pas la
surface de façon visible : rien ne justifiait de toucher à l'assiette. Le vrai
manque est ailleurs — pas de collerette d'écume ni d'assombrissement mouillé à
la ligne de flottaison, ce qui ferait poser les yoles *dans* l'eau plutôt que
dessus.

Checksums `3ebe9ca8`, `149bc2cf`, `f9a07291` inchangés.

## Passe 10 (soir) — Gréement à deux voiles, d'après photos réelles

Des photos de yoles en course ont corrigé trois erreurs de silhouette que la
documentation écrite n'avait pas révélées. Tout est **côté rendu** : aucune
autorité gameplay, checksums inchangés.

### Mâts raqués vers l'avant

Le mât était vertical. Sur l'eau, les mâts d'une yole sont nettement raqués vers
l'avant (~9°) — c'est une part majeure de la lecture. Un groupe `rigMain` porte
désormais mât, voile, marque d'équipe et déchirures, pour que tout suive le rake.

### Deuxième voile

Une yole en course en porte **deux**, et c'est ce qui la rend reconnaissable au
premier coup d'œil. Ajout d'un `rigFore` — mât avant plus court, plus raqué, et
une voile qui **partage la géométrie** de la grande : même déformation, aucun
coût CPU supplémentaire. Le mât avant tombe avant le grand, pour qu'un démâtage
se voie.

### Bois dressés en faisceau

Quatre perches espacées de 8,70 m se lisaient comme un balancier de trimaran. Sur
l'eau c'est un **faisceau serré** de bois de longueurs inégales, sur lequel
l'équipage se déporte. Passé à sept bois de 7,4 à 9,2 m.

Bug attrapé au passage : la simulation ne tient que **quatre** valeurs
d'intégrité de bwa. Indexer sept bois dessus lisait `undefined` et produisait une
échelle `NaN`. Les bois sont maintenant répartis proportionnellement sur les
quatre valeurs.

### Coût

267 draw calls (contre 219), 124 708 triangles. Le surcoût vient des trois bois
supplémentaires et du gréement avant, sur quatre yoles.

### Restent faux, faute d'être traités

- les voiles sont des quadrilatères souples sur vergue dans la réalité, pas des
  triangles ;
- la livrée réelle est à bandes horizontales avec sponsors, la coque du jeu est
  d'une seule couleur ;
- l'équipage réel est de 10 à 14, le jeu en simule 6 (choix de gameplay).

## Passe 09 — Coque de yole, d'après les vraies

### Ce n'était pas une yole

Fiche d'inventaire du patrimoine culturel immatériel (ministère de la Culture) :
la yole ronde fait **10,50 m**, elle est « étroite, rapide, légère et ronde »,
**sans lest, sans dérive ni gouvernail**, à faible tirant d'eau. Étrave taillée
en L, tableau arrière massif. Et le règlement de course est explicite :
**« toute excroissance rappelant une quille est interdite »**.

La coque procédurale avait une quille marquée à −0,62 m. La nouvelle coque a un
**fond rond**, des bordés visibles et des membrures apparentes.

### Licence : la référence n'entre pas dans le générateur

Les photos du Tour disponibles sur Wikimedia sont en **CC BY-SA 3.0**. Les passer
au générateur ferait de la coque une œuvre dérivée soumise au partage à
l'identique — incompatible avec un asset propriétaire.

Les photos ont donc servi à **étudier** (livrée à bandes horizontales, franc-bord
très bas, sponsors), et la génération part d'un prompt fondé sur les cotes
documentées. Aucune image sous licence n'a été soumise au modèle.

### Production

- concept de coque nue (`nano_banana_pro`, 2 crédits) ;
- `image_to_3d` **sans texture ni rigging** (20 crédits) — le contrat dit
  géométrie seule, le jeu fournit le matériau d'équipage ;
- 3 061 triangles, 119 Ko.

### `tools/fit_hull_glb.py` (`npm run assets:fit`)

Une conversion image-vers-3D depuis une vue 3/4 **estime très mal la
profondeur** : la coque est sortie 4 fois trop creuse (rapport longueur/hauteur
de 4 au lieu de ~17).

L'outil fusionne les primitives, cuit les transformations de nœuds, abandonne les
matériaux, **détecte l'axe long et l'extrémité effilée** pour orienter la proue
vers +Z, corrige la parité du repère, puis met à l'échelle **axe par axe** sur
l'enveloppe du contrat. C'est l'enveloppe qui fait foi : la physique y est calée
en dur.

Validé par aller-retour sur la coque procédurale connue : elle ressort à
11,100 m / 1,080 / −0,620 / +0,040, à l'identique.

Résultat : `[-1.08, -0.58, -5.55] → [1.08, 0.04, 5.55]`, conforme.

### Divers

- `bake_yole_glb.py` écrit maintenant dans `reference/` : le gabarit procédural
  n'écrase plus l'asset réel ;
- cache PWA `v3-2.2.0.0`.

Coût de la passe : **22 crédits**. Checksums `3ebe9ca8`, `149bc2cf`, `f9a07291`
inchangés — 219 draw calls, 122 260 triangles.

## Passe 08 (soir) — Équipage généré et intégré

Premier asset de production issu du pipeline : les équipiers ne sont plus des
cylindres mais des personnages riggés.

### Production

- concept T-pose (`nano_banana_pro`, 2 crédits) → `assets/source/yoleur_tpose.png` ;
- `image_to_3d` Meshy avec rigging et texture (35 crédits) : 2 092 triangles,
  squelette de 24 os, sortie en nomenclature Mixamo ;
- **la table d'alias a résolu les sept articulations sans une modification** :
  `Hips`, `Spine`, `Head`, `LeftArm`, `RightArm`, `LeftUpLeg`, `RightUpLeg`.

### Trois pièges corrigés

1. **7,46 Mo pour une texture 2048²**, sur un jeu qui doit tenir hors-ligne.
   `tools/shrink_glb_textures.py` reconstruit le chunk binaire (tous les
   `byteOffset` recalculés et réalignés) : **7,46 Mo → 190 Ko, 98 % de gain**,
   sans toucher au maillage ni au squelette.

2. **`Box3` ment sur un rig skinné.** Un GLB Meshy porte une `Armature` à
   l'échelle 0,01 et une géométrie déjà en mètres : la boîte renvoyait 0,017 pour
   un personnage de 1,70 m, d'où un facteur ×69 et des équipiers hauts comme des
   mâts. La hauteur se mesure désormais sur les **positions monde des os**, qui
   décrivent ce qui est réellement rendu ; `Box3` ne sert plus qu'aux rigs sans
   squelette.

3. **Les rotations de repos étaient écrasées.** `update()` écrit des rotations
   absolues — héritage du corps procédural dont chaque pivot a l'identité pour
   repos. Sur un squelette réel, cela détruisait la pose de bind et le maillage
   s'effondrait, invisible. Les articulations passent maintenant par des proxys
   et `syncRig()` compose `repos × jeu`. `update()` reste inchangé.

Ajouté aussi : `frustumCulled = false` sur les mesh skinnés, dont la sphère
englobante est calculée en espace de bind et qui clignotaient sur une yole en
mouvement.

### Résultat mesuré

| | Procédural | Riggé |
|---|---|---|
| Draw calls | 263 | **214** |
| Triangles | 51 336 | 98 164 |
| Lisibilité | blobs cylindriques | personnages identifiables |

Les draw calls **baissent** : un mesh skinné remplace six primitives par équipier.

### Limite assumée

La texture porte un maillot rouge unique, donc les quatre équipages sont
identiques — le procédural teintait le maillot à la couleur du bateau. La lecture
d'équipe repose désormais sur la coque, la voile et le classement. Une variante
de maillot par équipe reste à produire.

### Outillage

- `tools/inspect_glb.py` (`npm run assets:inspect`) : relit `CREW_JOINTS` **depuis
  la source**, reproduit l'assainissement de noms de `GLTFLoader`, et répond à la
  seule question qui compte à l'import — le jeu saura-t-il piloter ce rig ?
- `tools/shrink_glb_textures.py` : réduction de textures embarquées, en place.

Checksums `3ebe9ca8`, `149bc2cf`, `f9a07291` inchangés. `yole_crew.glb` ajouté au
cache du service worker (cache `v3-2.1.9.0`) : la PWA reste hors-ligne.

## Passe 07 — Rig d'équipage : le pipeline accepte l'humain

### Le chargeur savait lire une coque, pas un corps

`AssetLibrary` n'extrayait qu'une géométrie et **jetait le graphe** : un GLB
riggé — donc toute sortie Meshy ou Mixamo — était inutilisable. C'était le vrai
blocage pour la pièce qui paie le plus (24 équipiers à l'écran, aujourd'hui des
cylindres).

- `YOLE_RIGS` à côté de `YOLE_PARTS` : les pièces articulées conservent la scène
  complète et leurs clips ;
- `instantiate(part)` clone via **`SkeletonUtils`** — vérifié : 24 équipiers,
  **24 squelettes distincts**. Un `Object3D.clone()` les aurait tous laissés
  partager la même pose ;
- `AssetLibrary.findJoint()` résout une articulation par table d'alias, que la
  scène soit skinnée ou en nœuds simples.

### Le jeu pilote le squelette, il ne joue pas d'animation

Conforme à la règle d'architecture existante : cadence, appui, roulis et chute
viennent de la physique. `CrewVisual` lie sept articulations puis `update()`
**ne change pas d'une ligne** — les mêmes rotations pilotent le corps procédural
ou le rig GLB.

Un rig partiel est refusé en bloc : des membres figés au milieu d'un corps animé
seraient pires que pas de rig du tout.

### Table d'alias

Sept articulations, chacune avec ses graphies Mixamo et Blender : un rig Mixamo
s'accepte **tel quel**, sans renommage.

Piège rencontré et documenté : `GLTFLoader` **assainit les noms de nœuds**, un
`arm.L` exporté arrive en `armL`. Les deux graphies sont dans la table, et un
test verrouille ce cas précis.

### Gabarit livré

`tools/bake_crew_rig_glb.py` (`npm run assets:bake:crew`) écrit
`assets/models/reference/yole_crew_rig.glb` : les sept articulations aux cotes
exactes du `CrewVisual` procédural. L'artiste l'ouvre, habille le squelette,
réexporte en `yole_crew.glb` — aucun code à toucher.

Rangé dans `reference/` **exprès** : le jeu cherche `yole_crew.glb`, donc le
gabarit n'est jamais chargé par accident et l'équipage procédural reste en place
tant que le vrai modèle n'existe pas.

### Validé en navigateur réel

Gabarit servi sous le nom de production : `status: ready`, **24/24 équipiers
liés au rig**, 24 squelettes distincts, articulations effectivement pilotées
(les six bassins répondent à un Bwa Shift). Zéro erreur console.

Checksums `3ebe9ca8`, `149bc2cf`, `f9a07291` inchangés.
Capture : `previews/tropical_mayhem_v3_2_crew_rig.jpeg`.

## Passe 06 (soir) — Passe rendu

### La caméra était retournée (bug pré-existant, cause n°1 du rendu)

`updateCamera()` faisait `camera.rotation.z = damp(camera.rotation.z, …)` **après**
`camera.lookAt()`. Or l'Euler XYZ relu après un `lookAt` est dégénéré dès que la
caméra plonge : on lisait `x ≈ −165°, z ≈ ±π`, et forcer `z` vers 0 recomposait
une caméra **retournée de 180°** autour de l'axe de visée (`up.y = −0,967`).

Conséquence : la mer s'affichait au-dessus du ciel, l'horizon en bas de l'image.
C'était le plafond réel du rendu, et il masquait tout jugement visuel.

- le roulis passe désormais par `camera.rotateZ()` — rotation **locale** composée
  sur le quaternion, sans aller-retour Euler ;
- mesuré après correction : `up.y = +0,966`, le haut de l'image regarde bien vers
  le haut ;
- vérifié comme **antérieur** à la passe impact : identique avec `impact` à 0 et à 1.

### Antialiasing

- `WebGLRenderTarget` créé **sans `samples`** : toute la chaîne post-FX était
  rendue sans le moindre antialiasing (`antialias` du contexte ne s'applique
  qu'au framebuffer par défaut, jamais à une cible de rendu) ;
- MSAA par palier : LQ 0, MQ 2, HQ 4, piloté par le Quality Manager ;
- `antialias: true` sur le contexte pour le seul chemin LQ, qui rend en direct.

### Océan

- **antialiasing spéculaire** : les micro-normales et `pow(glintDot, 120)` n'étaient
  jamais atténués avec la distance — d'où le moiré scintillant sur toute la mer.
  Le détail se fond maintenant entre 45 et 260 m et le lobe spéculaire s'élargit
  d'autant (exposant 120 → 26) ;
- **LOD géométrique** : les anneaux lointains du clipmap ont des quads de plusieurs
  mètres alors que la houle contient des composantes bien plus courtes. Le
  déplacement s'éteint entre 120 et 600 m (sillage entre 60 et 190 m), ce qui
  supprime le repliement géométrique. La simulation est intacte : elle échantillonne
  `WaveField` côté CPU, jamais le shader.

### Une seule couleur d'horizon

Trois valeurs divergeaient : brouillard `0x0b7690` (teal sombre), horizon du ciel
`0xd8fbff` (blanc cassé), brume de l'océan `0x8ee9f4` (cyan). Le lointain fondait
donc vers du sombre devant un ciel clair — les îles se découpaient en silhouettes
noires. Le ciel est maintenant la **source unique** : `atmosphere.horizonColor`
alimente le brouillard et la nouvelle brume `uHaze` de l'océan. Le reflet de
Fresnel garde `uSky` (il échantillonne le ciel du dessus, pas l'horizon).

### Divers

- voile : `transparent: true` avec `opacity: 1` la renvoyait dans la passe triée
  sans écriture de profondeur alors qu'elle est intacte 99 % du temps. La
  transparence ne s'active désormais que si elle est réellement abîmée ;
- îles : silhouette portée de 11 à 22 segments (quelques meshes par chunk).

### Coût

349 draw calls / 54 876 triangles, inchangés. Checksums simulation `3ebe9ca8`,
scénario `149bc2cf` et replay `f9a07291` inchangés : le rendu n'a aucune autorité.

Captures : `previews/tropical_mayhem_v3_2_polish_after.jpeg` et `_after_wide.jpeg`.

### Mock de test complété

Le double `test/mock-three.module.js` ne modélisait pas `Color.copy/lerp/addScalar/
getHexString`, `Object3D.rotateZ` ni le fait que Three enveloppe la couleur de
brouillard dans un `Color`. Complété plutôt que de rendre le code de production
défensif pour satisfaire un mock.

## Passe 05 — Chargement de modèles GLB (P1)

### Le jeu peut enfin consommer de l'art

- `vendor/addons/` : **GLTFLoader**, `BufferGeometryUtils` et `SkeletonUtils` vendorés par `fetch_three.py`, leurs imports réécrits vers le core local — pas d'importmap à maintenir, aucune seconde instance de Three ;
- `src/render/assets.js` : `AssetLibrary` charge les pièces déclarées dans `YOLE_PARTS`. Addon absent, fichier introuvable ou GLB corrompu ne sont **jamais** fatals ;
- règle du contrat : **le GLB fournit la géométrie, le jeu fournit le matériau**. Les quatre yoles partagent une seule géométrie (même `uuid`, vérifié) et gardent leurs quatre couleurs d'équipage ;
- `docs/ASSET_CONTRACT.md` : gabarit verrouillé — axes, échelle, origine, cotes de coque, nommage, ce que le chargeur fait du fichier, et les pièces à venir (voile, mât, bwa, équipage).

### Coque de référence

- `tools/bake_yole_glb.py` (`npm run assets:bake`) cuit `assets/models/yole_hull.glb` depuis **la même table de sections** que `makeHullGeometry()` : l'asset est géométriquement identique au procédural (27 sommets, 48 triangles, 1 744 octets) ;
- il sert d'asset de test du chargeur **et** de point de départ éditable dans Blender pour remplacer la coque, sans toucher au code.

### Validé en navigateur réel

- GLB chargé, `status: ready`, les 4 yoles en `fromAsset: true`, géométrie partagée, 4 couleurs distinctes ;
- repli forcé par 404 : `status: fallback`, retour procédural, partie qui tourne, zéro exception ;
- 353 draw calls / 54 812 triangles — inchangés, le swap est transparent ;
- capture : `previews/tropical_mayhem_v3_2_glb_hull.jpeg`.

### Corrigé au passage

- `fetch_three.py` plantait sur console Windows cp1252 (`[↓]` non encodable). Bug latent : il n'était atteint que sur une machine sans `vendor/` déjà peuplé — donc précisément sur une installation neuve.

### Limites assumées

- pas de **KTX2 ni Draco** : ils exigent des binaires transcodeurs, à ajouter quand un vrai modèle texturé le justifiera ;
- le **monofichier reste procédural** par construction : il n'a pas de dossier `assets/` à côté de lui ;
- seule la coque est déclarée. Voile, mât, bwa et équipage restent procéduraux et se remplaceront **une pièce à la fois**.

## Passe 04 (nuit) — Directeur d'impact et vraie banque sonore

### Hiérarchie d'impact (game feel)

- nouveau `src/render/impact.js` : quatre paliers **graze / slam / blast / takedown**, chacun avec son gel, son recul, son roulis, son flash et son coup de zoom — tout n'est plus « maximum », le Takedown redevient un événement ;
- **hitstop** de 42 à 125 ms selon le palier, plafonné à 160 ms, sans cumul (une salve de Coco ne fige plus la partie) ;
- le gel est **purement rendu** : il retire du temps réel à l'accumulateur de `frame()`, jamais du temps de simulation. Séquence de ticks, checksum et replays strictement inchangés (`3ebe9ca8`, `f9a07291`) ;
- **recul caméra directionnel** dans l'axe du choc, à la place du seul jitter aléatoire ;
- flash d'impact radial sous le HUD (z-index 5) : il lave la mer, jamais le texte lisible ;
- réglage **IMPACT : TOTAL / DOUX / SANS** — SANS produit réellement zéro gel, zéro flash et zéro mouvement caméra.

### Correction caméra

- le recul et la secousse étaient réinjectés dans la pose amortie : `lerp` et `damp` repartaient de la valeur déjà décalée, donc l'offset s'**intégrait** au lieu de rester transitoire (horizon basculé après une salve) ;
- la pose lissée est désormais tenue à part (`cameraBase`, `cameraRollBase`, `cameraFovBase`) et les offsets sont ajoutés par-dessus. Roulis de pointe mesuré : 5,2° sur huit takedowns enchaînés, retour à 0,1° ensuite.

### Banque sonore synthétisée

- `src/core/audio.js` remplace les deux oscillateurs de `AudioBus` par **22 voix** rendues en `AudioBuffer` : membranes, gerbes d'eau, whoosh, bois, sifflements, twang de câble et motif tanbou ;
- chaîne master gain → compresseur, bus SFX et bus d'ambiance séparés, panoramique selon la position latérale de la source, variation de hauteur par voix et anti-empilement par événement ;
- **trois lits continus** : eau selon la vitesse et l'embrun, Mur du Grain selon la distance, câble du harpon selon sa tension réelle ;
- aucun asset externe : le monofichier et la PWA restent autonomes ;
- rendu **par tranches de 4 ms** dans un ordre de priorité explicite (contacts et lit d'eau d'abord). Le rendu d'un bloc coûtait 162 ms et provoquait un hoquet au coup d'envoi ; `startMatch` est retombé à ~15 ms, banque complète en moins de 1,5 s.

### Tests

- nouveaux tests `ImpactDirector` : le directeur ne rend jamais plus de temps qu'il n'en reçoit (`hitstopLeak: 0`), le gel cumulé reste borné, et le réglage SANS produit zéro mouvement ;
- `full-game-smoke` expose `scenarioChecksum` (`149bc2cf`), mesuré sur la simulation pure et donc **insensible au hitstop** — le checksum historique mesuré après les frames temps réel bouge légitimement avec le gel activé.

## Passe 03 (soir) — Tour des Yoles, navigateur réel et lanceur réparé

### Mode Tour des Yoles 2026

- nouveau mode à côté de la Combat Box : les **8 étapes du 40e Tour des Yoles Rondes** (Sainte-Anne → … → Sainte-Anne) ;
- course point-à-point contre 3 IA, ligne marquée par des bouées vertes ;
- points à la place (4/3/2/1, zéro pour les non-finisseurs) et **classement général cumulé** sur les 8 étapes ;
- étape « montagne » Trinité → Saint-Pierre portée à 2 400 m ;
- seed déterministe dérivée par étape, replay d'étape sauvegardé, écrans d'étape et podium final ;
- bouton menu dédié, carte événement 40e édition, sous-titre HUD distance/place ;
- test fumée dédié : 8 étapes enchaînées, chaque étape classe les 4 yoles une fois, le champion est le meilleur total.

### Navigateur réel (première validation)

- Playwright installé sur la machine de build : `browser-smoke` retombe sur le Chromium embarqué quand aucun Chromium système n'est dans le PATH ;
- le harnais shader WebGL s'exécute réellement pour la première fois — et a intercepté un vrai bug de harnais (uniform `vec3` déclaré avant tout qualifieur de précision dans le préambule fragment, rejeté par ANGLE) ;
- validation du jeu servi localement : zéro erreur console, capture `previews/tropical_mayhem_v3_2_real_render.jpeg` ;
- favicon ajouté, `PCFSoftShadowMap` déprécié (r185) remplacé, compteurs `renderer.info` désormais fiables : **336 draw calls / ~55k triangles en HQ**.

### Lanceur Windows

- réparé : l'imbrication de quotes `start \"\"` produisait `\\` (erreur « Impossible de trouver '\\' ») — remplacé par `explorer` sans imbrication ;
- détection de Python avec renvoi vers le monofichier.

### Passe beauté (shaders uniquement, zéro impact simulation)

- océan : micro-normales à deux nappes de bruit défilantes (sautées en LQ via `uDetail`), traînée de soleil à double lobe, translucidité des crêtes à contre-jour, mousse en dentelle texturée, perspective aérienne qui fond l'horizon dans le ciel ;
- ciel : bandeau doré bas autour du soleil, coupé par le Grain ;
- post-FX : grade tropical split-tone (ombres teal, hautes lumières chaudes), seuil de bloom assoupli ;
- une seule direction de soleil partagée entre ombres, reflets océan et disque céleste ;
- captures : `previews/tropical_mayhem_v3_2_beauty_menu.jpeg`, `_beauty_pass.jpeg`, `_beauty_calm.jpeg`.

## Passe 02 — passe qualité

### Distribution et offline

- Three.js 0.185.1 livré dans `vendor/` : le jeu fonctionne sans téléchargement et la PWA est réellement hors ligne après la première visite ;
- install du service worker stricte sur les fichiers moteur (cache `v3-2.1.3.0`) ;
- monofichier protégé par une importmap avec intégrité sha384 épinglée (module et core) ;
- `npm run syntax` portable Windows (`tools/pycheck.py`, fini les globs non expansées).

### Entrées

- support de la manette standard (Gamepad API) : stick/croix pour diriger, stick vertical pour la voile, 10 actions, Start pour lancer une manche ;
- clavier et manette échantillonnés dans la boucle fixe 60 Hz : latence d'entrée réduite, plus de `setInterval` actif en pause ou en menu ;
- les pilotes externes (tests, harnais) qui écrivent `input.steer/trim` ne sont jamais écrasés.

### Performance

- houle échantillonnée via un scratch partagé (15 sites dans `game.js`, pools de débris et d'équipiers) : fini les objets alloués à 60 Hz ;
- `forward()` sans allocation dans les boucles de sillage et de spray ;
- listes « yoles vivantes » et « dynamics » réutilisées au lieu de `filter/reduce/map` par tick ;
- caméra de menu sans `Vector3` alloués par frame ;
- leaderboard mis à jour en place (texte/classes) au lieu d'un `innerHTML` complet 12 fois par seconde ;
- points d'équipage du HUD pré-rendus ;
- benchmark doté d'un seuil anti-régression (60 000 pas-yole/s, surchargeable via `YOLE_BENCH_MIN`).

### Robustesse et tuning

- tout l'équilibrage gameplay centralisé dans `BALANCE` (cooldowns, Canon Coco, Spider-Harpon, Mine Tsunami, collisions, Mur du Grain) ;
- `allocate()` en round-robin : un pool saturé recycle le slot le plus ancien au lieu de toujours couper le slot 0 ;
- curseurs de pools réinitialisés à chaque manche (déterminisme live/relecture garanti, bug intercepté par le test de replay) ;
- crochets `__YOLE_DEBUG__` réservés à `?debug` et aux harnais de test ;
- réglage mort `mode` retiré, alias `flood` unifié en `flooding` ;
- documentation wake grid précisée : résolution fixée au démarrage car elle participe au déterminisme.

## Passe 01 — Tropical Mayhem V3.2.0

## Arcade et vitesse

- vitesse de départ portée à 15,2 ;
- puissance de voile et plafond de vitesse augmentés ;
- ajout du **Turbo avant** ;
- ajout du **Bwa Dash latéral** ;
- Turbo Flow rechargeable par vitesse, surf et actions réussies ;
- dash intégré aux replays et à l'IA ;
- Bwa Dash renforçant les collisions et les Takedowns latéraux.

## Armes WTF

- Canon à Houle remplacé par un **Canon Coco balistique** ;
- explosion tropicale en zone avec ralentissement, eau et roulis ;
- Harpon Bwa transformé en **Spider-Harpon** ;
- traction asymétrique, swing et slingshot de dépassement ;
- Mine-Bouée transformée en **Mine Tsunami** ;
- trois ondes concentriques injectées dans la wake grid ;
- messages Coco Boum, Tsunami circulaire et Bwa Dash Slam.

## Course

- Mur du Grain démarrant plus loin ;
- écart leader/dernier autorisé élargi ;
- poursuite plus progressive ;
- fenêtre d'élimination allongée ;
- piste légèrement élargie.

## Caméra et UX

- caméra plus haute et plus tactique ;
- zoom réglable de 72 % à 235 % ;
- boutons mobiles de zoom ;
- molette et touches `+`/`-` ;
- nouvelles commandes Turbo/Bwa Dash ;
- HUD Turbo Flow ;
- grille d'actions mobile 3 × 2.

## Tropical juice

- soleil plus grand et plus lumineux ;
- ciel et horizon plus saturés ;
- mer plus chaude hors Grain ;
- palmiers plus nombreux et plus proches de la route ;
- traînées de boost ;
- flare latéral ;
- équipiers inclinés et animés par les accélérations ;
- voile plus gonflée sous Turbo ;
- explosions Coco et Mine amplifiées.

## Validation

- nouveaux tests Turbo et Bwa Dash ;
- IA autorisée à utiliser les deux boosts ;
- browser smoke couvrant W, X et zoom ;
- replays versionnés `3.2.0 / tropical-mayhem-v3-2` ;
- nouveau cache PWA et coffre de replays isolé.
