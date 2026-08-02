# Contrat d'export des modèles — YOLE: BWA BRAWL

Ce document joue pour la 3D le rôle que `SPRITE_BIBLE.md` joue pour Moostik
Combat : il verrouille le gabarit **avant** toute production d'art. Un modèle qui
ne respecte pas ce contrat sera chargé mais mal placé, et le bug se paiera en
allers-retours avec l'artiste.

## Règle fondatrice

> Le GLB fournit une **géométrie**. Le jeu fournit le **matériau**.

Les quatre yoles partagent une seule géométrie de coque et ne diffèrent que par
la couleur d'équipage, appliquée à l'exécution (`hullMaterial`). Un GLB qui
embarque ses propres matériaux les verra ignorés — et s'il embarque quatre
variantes de coque, il quadruple la mémoire pour rien.

Corollaire vérifié en test : les quatre yoles pointent le même `geometry.uuid`.

## Repère et unités

| Élément | Valeur |
|---|---|
| Unités | mètres, échelle **1.0** (pas de conversion à l'import) |
| +Z | **avant** (proue) |
| +Y | **haut** |
| +X | **tribord** |
| Origine | centre de flottaison, au niveau du plat-bord (`y = 0`) |

⚠️ Blender exporte en Y-up avec −Z en avant par défaut. Vérifier l'orientation
sur le modèle chargé, pas sur la vue Blender.

## Gabarit de la coque (`yole_hull.glb`)

> **Ce qu'est vraiment une yole ronde** (fiche d'inventaire PCI, ministère de la
> Culture) : 10,50 m, « étroite, rapide, légère et ronde », **sans lest, sans
> dérive ni gouvernail**, à faible tirant d'eau. Étrave taillée en L, tableau
> arrière en bois massif d'une seule pièce. Le règlement de course est explicite :
> **« toute excroissance rappelant une quille est interdite »**.
>
> La coque procédurale d'origine avait une quille marquée à −0,62 m : ce n'était
> pas une yole. Le fond doit être **rond**.

### Ce qui est strict : l'enveloppe

| Mesure | Valeur | Tolérance |
|---|---|---|
| Longueur hors tout | **11,10 m** (`z` de −5,55 à +5,55) | ±1 % |
| Demi-largeur maximale | **1,08 m** | ±2 cm |
| Plat-bord (point le plus haut) | `y = +0,04 m` | ±1 cm |
| Profondeur sous plat-bord | ≤ **0,62 m** | plafond |
| Origine | milieu de `z` au centre de flottaison | ±5 cm |
| Nom du nœud et du mesh | `hull` | exact |

Verrouillé par `npm run test:hull`, qui décode le GLB **réellement livré**.

### Ce qui est libre : la carène

Tonture, rocker et forme de sections sont **à la main de l'artiste**, tant que
l'enveloppe ci-dessus tient. Une yole réelle a de la tonture ; un plat-bord
parfaitement plat d'un bout à l'autre n'en est pas une.

Les sections de référence (`SECTION_Z` / `SECTION_WIDTH` dans
`tools/bake_yole_glb.py`, identiques à `makeHullGeometry()` de
`src/render/yole-visual.js`) sont un **point de départ**, pas un gabarit à
respecter au millimètre. La coque livrée s'en écarte aujourd'hui de 207 mm en
médiane sur la ligne de quille, et c'est accepté.

### ⚠️ Correction du 2 août 2026 : la physique ne lit pas ce mesh

Ce document affirmait que les mesures devaient tenir à ±5 % « sous peine de
désaccorder la physique (les 16 points de flottabilité et les capsules de
collision sont définis en dur dans `src/sim/`) ». **C'est faux, et dans les deux
sens.** Ils sont bien définis en dur — c'est justement pour ça que le mesh ne
peut rien y désaccorder : la simulation ne le lit jamais.

Il existe en réalité **trois descriptions de coque** dans le projet :

| # | Où | Forme | Autorité |
|---|---|---|---|
| 1 | `HULL_STATIONS`, `src/sim/yole-physics.js` | 8 stations, quille −0,22 à −0,44 | **autoritaire** — flottabilité, replays |
| 2 | `SECTION_Z/WIDTH`, contrat + `yole-visual.js` | 9 sections, quille −0,62 au centre | gabarit de départ |
| 3 | `assets/models/yole_hull.glb` | sculpté, 1 333 sections | ce que le joueur voit |

Elles n'étaient pas d'accord. La physique plaçait son maître-bau à `z = +0,65`,
le gabarit à `z = 0`, et une fois `HULL_VISUAL_WIDTH_SCALE` appliqué **les points
de flottabilité tombaient jusqu'à 18 cm en dehors de la coque visible** — le
bateau flottait sur des points qu'aucun joueur ne voyait.

### Résolu le 2 août 2026 — la physique a été recalée sur le visuel

Décision du propriétaire du projet, prise en connaissance du coût. Chaque
largeur de `HULL_STATIONS` vaut désormais la demi-largeur réelle du mesh livré à
cette station, multipliée par 0,84. Débord résiduel : **0 cm**, et
`test/hull-contract.test.mjs` — qui importe la table **à la source** au lieu
d'en garder une copie — refuse tout retour au-delà de 2 cm.

Conséquences assumées :

- `SIMULATION_VERSION` passe de `3.9.0` à **`4.0.0`**. Majeure, donc les replays
  antérieurs sont **refusés à la lecture** plutôt que rejoués faux : un replay
  qui se lance et dérive en silence est pire qu'un replay incompatible.
- La replayothèque et la progression du Tour enregistrées avant cette date ne
  sont plus relisibles.

Effet sur le ressenti, mesuré par `tools/probe_roll_stability.mjs` — et **il est
l'inverse de ce qu'on attendait**. Rétrécir le bras de levier du couple de
flottabilité devait assouplir la yole ; elle est très légèrement plus raide :

| | avant | après |
|---|---:|---:|
| gîte médiane depuis 40° | 10,5° | 9,9° |
| retour sous 20° depuis 40° | 1,10 s | 1,07 s |
| retour sous 20° depuis 60° | 1,28 s | 1,25 s |

Le redressement est dominé par le ressort `impactRecovery`, indépendant de la
géométrie ; la part de flottabilité est minoritaire et resserrer les points
change surtout la dissymétrie d'immersion — ici dans le sens favorable. Le
changement d'équilibrage est donc marginal : c'est bien la cohérence visuelle
qui motivait la manœuvre.

**Ce qui n'a pas été touché.** `keel` et `volume` sont inchangés. La quille du
mesh est pourtant 12 à 33 cm plus creuse que celle déclarée (−0,566 contre
−0,44 au maître-bau) : la yole flotte plus haut qu'elle n'en a l'air. Y toucher
change le tirant d'eau et toute la flottaison, pas seulement le bras de levier.
C'est une seconde décision, distincte, et elle n'est pas prise.

### ⚠️ Le facteur de largeur vit dans le code, pas dans le mesh

`HULL_VISUAL_WIDTH_SCALE = 0.84` (`src/render/yole-visual.js`) affine la coque
**à l'affichage**. Conséquence directe :

| | ratio longueur/largeur |
|---|---|
| le mesh dans Blender | **5,14** — une silhouette de canot |
| ce que le joueur voit | **6,12** — la yole |

**Un artiste qui ouvre `yole_hull.glb` voit donc la mauvaise coque.** S'il
l'affine lui-même jusqu'à 6,12 et réexporte, le runtime rétrécira une seconde
fois : ratio 7,3, une aiguille. Rien dans le format glTF ne peut porter cette
information — le seul garde-fou possible est un test, et il existe :
`npm run test:hull` refuse toute coque dont la demi-largeur n'est pas 1,08 m.

Le facteur est répliqué sept fois dans `yole-visual.js` (plat-bords, pont, eau
intérieure, fissures, contour) : il fait partie du modèle, pas d'un réglage.

## Ce que le chargeur fait du fichier

1. il prend le **premier mesh** rencontré dans le graphe ;
2. il **applique les transformations du graphe** à la géométrie (une échelle ou
   une rotation posée sur le nœud est donc absorbée, mais mieux vaut exporter
   propre) ;
3. il recalcule les normales si elles sont absentes ;
4. il ignore matériaux, textures, caméras et lumières.

Conséquence : un GLB à plusieurs pièces ne fonctionnera pas tel quel. Une pièce
= un fichier, déclarée dans `YOLE_PARTS` (`src/render/assets.js`).

## Repli

Modèle absent, `vendor/addons/` non peuplé, GLB corrompu : le jeu **repasse en
procédural sans erreur**. C'est l'état normal tant que l'art n'est pas produit,
et c'est couvert par un test. Le monofichier autonome reste procédural par
construction, puisqu'il n'a pas de dossier `assets/` à côté de lui.

## Produire un modèle

```bash
npm run assets:bake     # regénère la coque de référence depuis les sections
```

Le GLB produit est un **point de départ éditable** : l'ouvrir dans Blender,
sculpter la vraie coque de yole ronde martiniquaise en conservant le gabarit
ci-dessus, réexporter sous le même nom. Aucun code à toucher.

Pipeline studio réutilisable (identique à Moostik Combat 3D et PCS 26) :
`tools/meshy_char.py`, `tools/mixamo_to_glb.py`, `tools/rig_mesh.py`.

## Rig d'équipage (`yole_crew.glb`)

C'est la pièce qui paiera le plus : six dresseurs et deux spécialistes sont
affichés par yole, soit trente-deux squelettes dans la flotte complète.

### Le jeu pilote le squelette, il ne joue pas d'animation

Conformément à la règle d'architecture « la présentation anime chaque corps
au-dessus de cette donnée », le rig est **piloté par la simulation** : cadence de
foulée, appui, roulis, chute et déséquilibre viennent de la physique. Un GLB
avec ses propres animations verra donc ses clips ignorés — ce n'est pas un
oubli, c'est ce qui garde l'équipage couplé à la mer.

Sept articulations constituent le contrat minimal. Toutes doivent répondre : un
rig partiel est refusé en bloc et l'équipage repasse en procédural, parce que des
membres figés au milieu d'un corps animé sont pires que pas de rig du tout.

Le moteur Crew V2 recherche ensuite onze articulations optionnelles :
`Spine01`, `Spine02`, `Neck`, les deux avant-bras, les deux mains, les deux
tibias et les deux pieds. Un Mixamo standard les fournit directement. Si elles
sont présentes, la courbure est distribuée sur la colonne et quatre chaînes IK
verrouillent les mains et pieds sur le bwa ou le pont. Leur absence dégrade
seulement la finition : elle ne rejette jamais un rig qui respecte les sept
points minimaux.

| Articulation | Alias acceptés | Repos |
|---|---|---|
| bassin | `hips`, `Hips`, `mixamorigHips`, `bassin` | `y = 0,38` |
| buste | `torso`, `spine`, `Spine`, `Spine1`, `mixamorigSpine1` | `y = 0,26` |
| tête | `head`, `Head`, `mixamorigHead`, `tete` | `y = 0,66` |
| bras gauche | `arm.L`, `armL`, `LeftArm`, `upperArm.L`, `mixamorigLeftArm` | `(−0,16 · 0,48 · 0)` |
| bras droit | `arm.R`, `armR`, `RightArm`, `upperArm.R`, `mixamorigRightArm` | `(0,16 · 0,48 · 0)` |
| jambe gauche | `leg.L`, `legL`, `LeftUpLeg`, `thigh.L`, `mixamorigLeftUpLeg` | `(−0,075 · 0,05 · 0)` |
| jambe droite | `leg.R`, `legR`, `RightUpLeg`, `thigh.R`, `mixamorigRightUpLeg` | `(0,075 · 0,05 · 0)` |

Un rig **Mixamo s'accepte tel quel** : les noms `mixamorig*` sont dans la table,
aucun renommage manuel n'est demandé.

⚠️ `GLTFLoader` **assainit les noms de nœuds** : un `arm.L` exporté depuis Blender
arrive dans le moteur en `armL`. Les deux graphies sont donc dans les alias — ne
pas s'étonner de ne pas retrouver ses points.

### Gabarit

- hauteur totale ≈ **1,15 m** à l'échelle du jeu (le visuel est ensuite mis à
  l'échelle 0,88 par la yole) ;
- debout, bras le long du corps, **face à +Z** ;
- origine **entre les pieds**, au niveau du pont ;
- les membres pivotent à l'articulation : le maillage d'un bras est décalé sous
  son joint, pas centré dessus.

### Vérifier un rig avant de l'intégrer

```bash
python3 tools/inspect_glb.py assets/models/yole_crew.glb
```

Pour un audit plus profond — poids de skin, influences, armature, actions,
contraintes, meshes parasites — Blender 5.2 peut exécuter :

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  --background --factory-startup `
  --python tools/audit_crew_blender.py -- assets/models/yole_crew.glb
```

L'outil relit `CREW_JOINTS` **depuis la source** — pas une copie qui dériverait —
et répond à la seule question qui compte à l'import : le jeu saura-t-il piloter
ce rig ? En cas d'échec il liste les nœuds réellement présents dans le fichier,
pour choisir entre renommer l'export ou ajouter un alias.

Il reproduit aussi l'assainissement de noms de `GLTFLoader`, donc son verdict est
celui du moteur, pas une approximation.

### Point de départ

```bash
npm run assets:bake:crew   # écrit assets/models/reference/yole_crew_rig.glb
```

Le gabarit produit porte exactement les sept articulations aux bonnes positions.
L'ouvrir, remplacer les volumes par un vrai corps, réexporter en
`assets/models/yole_crew.glb` — aucun code à toucher. Il est délibérément rangé
dans `reference/` : le jeu ne le charge jamais par accident, et l'équipage
procédural reste en place tant que le vrai modèle n'est pas produit.

Squelette skinné et hiérarchie de nœuds simples sont tous deux acceptés : la
résolution passe par `getObjectByName`, et chaque équipier reçoit **son propre
squelette** (`SkeletonUtils.clone`), sinon les vingt-quatre partageraient la
même pose.

## Pièces à venir

`YOLE_PARTS` ne déclare aujourd'hui que `hull`. Les suivantes, par ordre de gain
visuel, demanderont chacune son gabarit dans ce document :

| Pièce | Point d'ancrage attendu | Remarque |
|---|---|---|
| `sail` | pied de mât `y = 0,48`, guindant en `x = 0,055` | la voile est déformée par vertex à l'exécution : conserver la densité de maillage |
| `mast` | base `y = 0`, hauteur 6,35 m | une version brisée de 3,10 m est aussi utilisée |
| `bwa` | cinq barres transversales, longueur 8,70 m | l'index de barre sert au calcul de dégâts |

Tant qu'une pièce n'est pas déclarée, elle reste procédurale : les pièces se
remplacent **une par une**, sans big-bang.
