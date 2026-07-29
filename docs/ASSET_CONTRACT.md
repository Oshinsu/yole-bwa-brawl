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

Mesures de la coque de référence, à respecter à ±5 % sous peine de désaccorder
la physique (les 16 points de flottabilité et les capsules de collision sont
définis en dur dans `src/sim/`) :

| Mesure | Valeur |
|---|---|
| Longueur hors tout | **11,10 m** (`z` de −5,55 à +5,55) |
| Demi-largeur maximale | **1,08 m** au maître-bau (`z = 0`) |
| Quille | **−0,62 m** au centre, remontant de `0,028 × |z|` vers les extrémités |
| Plat-bord | `y = +0,04 m` |
| Nom du nœud et du mesh | `hull` |

Les sections de référence (`SECTION_Z` / `SECTION_WIDTH`) sont dans
`tools/bake_yole_glb.py`, identiques à `makeHullGeometry()` de
`src/render/yole-visual.js`.

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

C'est la pièce qui paiera le plus : les équipiers sont six par yole, vingt-quatre
à l'écran, et ce sont aujourd'hui des cylindres.

### Le jeu pilote le squelette, il ne joue pas d'animation

Conformément à la règle d'architecture « la présentation anime chaque corps
au-dessus de cette donnée », le rig est **piloté par la simulation** : cadence de
foulée, appui, roulis, chute et déséquilibre viennent de la physique. Un GLB
avec ses propres animations verra donc ses clips ignorés — ce n'est pas un
oubli, c'est ce qui garde l'équipage couplé à la mer.

Sept articulations sont pilotées. Toutes doivent répondre : un rig partiel est
refusé en bloc et l'équipage repasse en procédural, parce que des membres figés
au milieu d'un corps animé sont pires que pas de rig du tout.

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
