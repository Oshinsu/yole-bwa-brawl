# Meshy 7 — évaluation sur pièces, 12 août 2026

Test réalisé le lendemain du lancement de Meshy 7, sur l'API directe
(`ai_model: "meshy-7"`, accepté et servi), avec la planche du dépôt
`art-source/yoleur_stylise.png` comme unique référence. Objectif : vérifier le
pitch officiel — « réduire l'écart entre l'image de référence et le 3D
généré » — contre NOTRE référence, et mesurer ce qui séparerait la sortie brute
d'un équipier en jeu.

## Chaîne testée, de bout en bout

    image-to-3d (meshy-7, texture, symétrie forcée, A-pose)
      → remesh (target 2 600, triangle, origine au sol)
      → rigging (1,70 m)
      → shrink texture 256 (tools/shrink_glb_textures.py)
      → binder du jeu (tools/mesure_silhouette_equipage.mjs --glb)

Trois tâches API, ~35 crédits Meshy au total, ~12 minutes de génération
cumulées.

## Résultats mesurés

| étape | mesure |
|---|---|
| brut image-to-3d | 1 997 324 triangles, 75,4 Mo, texture 2K (1,86 Mo) |
| après remesh | **2 709 triangles** (contrat : 2 000-3 000), 6,8 Mo |
| après shrink 256 | **197 Ko** (le rig en production fait 235 Ko) |
| squelette d'auto-rig | **24 os, noms IDENTIQUES au contrat du jeu** |
| os de doigts | 0 (doigts modelés dans le maillage, mais rigides) |
| binder + jauges de silhouette | **toutes vertes** sur le GLB riggé brut |

### L'alignment (la promesse du produit)

Vérifié à l'image sur un montage trois colonnes (planche | ancienne
génération | Meshy 7, rendu Blender neutre au même cadrage) : teinte de peau
juste là où l'ancienne génération tirait vers la brique, bandeau présent et à
la bonne couleur, coupe du marcel et du short respectée, visage lisible
(sourcils, yeux, bouche), proportions fidèles (1,90 m, ratio h/l 1,74),
doigts séparés et modelés. Un seul essai, aucune itération. **Le pitch tient.**

### La décimation (là où ça se paie)

À 2 709 triangles + texture 256, la silhouette et les mains survivent ; **le
visage se noie** — traits fondus, bandeau mangé, coutures visibles. Invisible à
la caméra de jeu (l'équipier fait 13 à 40 px), réel en gros plan. Le personnage
« gros plan » reste donc un compromis : mains gagnées, visage perdu, sauf à
accepter un budget de texture supérieur pour lui seul.

## La découverte qui change le coût d'intégration

Le squelette produit par l'auto-rig Meshy est **exactement** celui du contrat
`EXPECTED_BONES` de `tools/build_crew_asset.py` — mêmes 24 os, mêmes noms,
jusqu'aux singularités `neck` (minuscule), `head_end` et `headfront`. Autrement
dit : **le « contrat des 24 os » du dépôt est le gabarit d'auto-rig Meshy** —
le rig de production en vient, et tout personnage généré puis riggé chez eux en
ressort compatible.

Conséquence : l'intégration d'un équipier Meshy 7 n'est PAS la semaine de
ré-seed redoutée. C'est le pipeline existant, inchangé :

    blender --background --factory-startup --python tools/build_crew_asset.py \
      -- --mode prepare --source <nouveau>.glb
    # puis --mode export ; le clip parasite Armature|clip0|baselayer est
    # supprimé à l'import (remove_null_actions), les cinq poses sont
    # ré-écrites depuis les seeds, les jauges strictes s'appliquent.

Le GLB riggé brut se lie d'ailleurs au jeu **tel quel** : passé dans
`mesure_silhouette_equipage.mjs --glb`, toutes les jauges tiennent (bras en
croix 9-23°, bassin-bois 0,0 cm, regard dorsal positif). Sans les cinq poses il
retombe sur le chemin procédural sans clips — d'où un buste plus faible au
rappel (37° contre 80° avec les seeds) : c'est le comportement attendu, les
poses sont notre couche, pas la leur.

## Restes ouverts avant un usage en production

- **qualité des poids de peau** sous les poses extrêmes (bassin 70°, genou
  −105°) : non testée — c'est la passe `prepare/export` du pipeline qui la
  révélera, avec la mesure de triangles écrasés du 4 août ;
- **le visage à 256 px** : à re-tenter avec `texture_prompt`/retexture, ou à
  accepter comme limite ;
- **les doigts rigides** : suffisants pour enrichir la silhouette des gros
  plans, insuffisants pour une vraie prise articulée sur le bwa.

## Verdict

L'alignment de Meshy 7 est réel et net contre notre propre planche — meilleure
fidélité que la génération dont le jeu est issu, doigts compris. La sortie
brute est inutilisable en l'état (×768 le budget triangles), mais la chaîne
remesh → shrink → pipeline la ramène au contrat en trois commandes, et le
squelette identique supprime l'essentiel du coût d'intégration estimé. Le
goulot du projet reste ce qu'il était — l'intégration et la mesure, pas la
génération — mais le jour où l'on veut des variantes d'équipiers ou un
personnage de gros plan, la porte est bien plus proche qu'estimé le 11 août.

Artefacts de session (non versionnés, scratchpad) : `meshy7.glb` (brut),
`meshy7_remesh.glb`, `meshy7_256.glb`, `meshy7_rig.glb`,
`comparaison_alignment.png`, `comparaison_decimation.png`. Tâches Meshy :
`019ff68f-1905…` (génération), `019ff69f-9981…` (remesh), `019ff6a1-c34f…`
(rig).


---

# Lot de variantes d'équipiers — 12 août 2026, même journée

Chaîne planches → 3D appliquée en série : la planche de référence éditée en
variantes 2D (nano-banana, pose/style/tenue préservés), puis chaque planche
dans meshy-7 → remesh 2 600 → shrink 256 → rig. Rangées dans
`art-source/variantes/` (hors dépôt, `art-source/` est ignoré).

| variante | triangles | poids (GLB riggé) | squelette | jauges du binder |
|---|---|---|---|---|
| locks (peau ébène) | 2 685 | 4,7 Mo* | 24 os CONFORME | vertes (hors clip0) |
| casquette rouge (peau médium) | 2 712 | 4,4 Mo* | 24 os CONFORME | vertes (hors clip0) |
| bakoua (peau claire) | 2 714 | 5,4 Mo* | 24 os CONFORME | ⚠️ regard 0,11/0,08 |

\* les GLB *riggés* gardent la texture 2K de Meshy ; la version 256 de chaque
maillage fait 216-246 Ko. Le shrink se rejoue à l'intégration.

Acquis notable : **locks et chapeaux survivent à la décimation en géométrie
réelle** — ils se liront en silhouette et de dos, pas seulement en texture.

Réserves du lot :

- le **bakoua** passe sous le plancher de regard dorsal (0,11/0,08 pour 0,15) :
  le chapeau a décalé le placement des os de tête à l'auto-rig. Correctif
  attendu : compensation `Head`/`neck` dans les seeds à la passe pipeline, ou
  régénération avec un prompt de bakoua plus fidèle (le rendu est sorti conique
  type chapeau asiatique — le vrai bakoua a une calotte ronde et un bord
  tombant) ;
- les **tresses** manquent : solde d'édition d'images épuisé avant la planche ;
- les **tailles** ne se génèrent pas : `CREW_BUILD` les gère déjà côté jeu.

## Intégration en jeu — même journée, plus tard

Fait. Les trois variantes sont passées par le pipeline complet
(`build_crew_asset.py` sur LEUR bind — 19 à 30° d'écart avec le rig de base,
jusqu'à 152° sur Spine02, donc aucun partage de clips possible), shrink 256,
jauges de silhouette toutes vertes, puis câblées dans le jeu :

- `YOLE_RIGS` expose `crew_locks`, `crew_casquette`, `crew_bakoua` ;
- assignation déterministe `(crewIndex + index de bateau) % 4`, spécialistes
  compris — un équipage est identique d'une relecture à l'autre et les quatre
  yoles décalent leur séquence ;
- une bibliothèque de clips et un matériau PAR variante et par yole
  (`crewClipsByPart`, `crewMaterials`), teinte d'équipe conservée ;
- les variantes qui portent cheveux ou chapeau dans le maillage ne reçoivent
  pas de coiffe procédurale par-dessus ;
- les trois GLB sont précachés par le service worker (+972 Ko installés).

Vérifié en jeu sur captures (repos assis, gîte 20°, traction 35°) : les quatre
identités se lisent dans la même rangée, chacune anime ses propres clips,
`replayChecksum` inchangé. Le bakoua reste conique (réserve maintenue), les
tresses restent à générer.

---

# Le décor : où Meshy gagne, où il perd — 2 septembre 2026

Question posée : puisqu'il reste des crédits, pourquoi ne pas générer aussi les
petits éléments d'environnement — mini-îles, cocotiers, sargasses, rochers ?
Quatre générations `meshy-7` en mode `preview` (géométrie nue, sans texture) et
un montage comparatif ont tranché.

## Le budget réel, mesuré en course

| | valeur |
|---|---|
| charge totale à l'écran (HQ, 1280×720) | 209 852 triangles, 173 appels de dessin |
| dont décor | 50 460 triangles, 41 appels |
| cocotier | 96 triangles de tronc, 5 × 24 de palme |
| rocher | 36 triangles, 96 instances, **un seul appel** |
| modèle Meshy livré (catamaran de flottille) | 2 343 triangles |

Un cocotier au tarif Meshy brut, c'est 1,97 million de triangles rien qu'en
palmes. Le remesh accepte une cible explicite, donc l'affaire n'est pas jouée
d'avance — d'où le test.

## La contrainte que personne n'avait écrite

Rochers, palmes et mornes sont **recolorés arène par arène** : les deux premiers
par leur matériau (`shallowRock`, `leaf`), le troisième par ses couleurs de
sommet le long d'une rampe sable → jungle → roche. Une texture Meshy les
figerait sur une seule palette et effacerait ce qui distingue les huit arènes.
**De Meshy, on ne peut donc prendre que la géométrie** — ce qui a l'avantage de
supprimer texture et poids : les trois roches font 23 à 26 Ko.

## Résultats

| pièce | triangles | verdict |
|---|---:|---|
| dodécaèdre du jeu (avant) | 36 | régulier, mais propre |
| roche Meshy A | 417 | boîte arrondie, sans caractère |
| roche Meshy B | 418 | amas mou, silhouette confuse |
| roche Meshy C (promptée « éclat anguleux ») | 307 | **fragmentée, un morceau détaché** |
| **icosaèdre bruité (retenu)** | **180** | silhouette cassée franche |
| palme du jeu | 24 | lame courbée, retombante |
| palme Meshy | 68 | étoile éclatée, sans nervure ni retombée |

Montages : `previews/meshy/comparaison.html` et `previews/meshy/palmes.html`
(hors dépôt), rendus avec les matériaux et les lumières du jeu.

## La règle qu'on en tire

**Meshy gagne sur l'objet fabriqué à silhouette reconnaissable, et perd sur le
petit élément naturel à bas budget.** Ses réussites dans ce dépôt le disent
déjà : catamaran et vedette de flottille, équipage et ses variantes — tous des
objets faits de main d'homme, vus entiers, à quelques exemplaires. Là où l'objet
est minuscule, répété par centaines, recoloré par arène et décrit par une forme
simple, une primitive bruitée est plus juste, plus légère et gratuite.

Les crédits vont donc aux **cases créoles, gommiers, pontons et bateaux de
flottille**, pas aux cailloux ni aux palmes.

## Et la règle a tenu — le bourg, même journée

Trois générations `meshy-7` en texte → 3D, puis `refine` pour la texture, puis
`shrink_glb_textures.py --size 256` :

| modèle | triangles | poids | rendu |
|---|---:|---:|---|
| `case_creole.glb` | 672 | 96 Ko | toit de tôle rouge, murs à planches, volets, galerie |
| `gommier.glb` | 668 | 101 Ko | coque bleu-blanc-rouge à bancs, double pointe |
| `ponton.glb` | 533 | 72 Ko | tablier sur pilotis |

Utilisables sans retouche, et **trois fois plus légers** que les bateaux de
flottille d'août (240-256 Ko) parce qu'ils passent en 256 dès la sortie. La
texture 2K brute pesait 2,5 à 3,9 Mo : le shrink rend 97 à 98 %.

Différence de traitement avec les rochers : ces trois-là **gardent leur
texture**, puisqu'ils ne sont pas recolorés par arène. Et comme ils sont
mono-maillage et mono-matériau, ils sont **instanciés** — trois appels de
dessin pour 44 objets, là où la flottille dépense un appel par bateau.
