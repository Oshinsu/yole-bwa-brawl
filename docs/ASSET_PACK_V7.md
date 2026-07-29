# Asset Pack V7 — Combat Juice

Le pack V7 ajoute quatre signatures VFX de combat conçues pour rendre les impacts immédiatement lisibles et beaucoup plus violents : arrachement du harpon, onde de choc coco, détonation de mine et récompense de contre-gîte parfaite.

Ces quatre créations sont livrées séparément et réunies dans un atlas 2×2. Le fond noir, la forte séparation des couleurs et les silhouettes isolées sont prévus pour un rendu additif.

## Comptage

Deux nombres sont volontairement distingués :

- **Signatures artistiques : 74** au total, soit 70 assets précédents + 4 nouvelles signatures V7.
- **Fichiers de texture en comptant l’atlas : 75**, soit 70 précédents + 4 finals individuels + 1 atlas.

L’atlas n’est donc pas une cinquième signature artistique : c’est un fichier d’agrégation runtime des quatre effets.

## Inventaire

| Signature | Rôle | Final | Dimensions | Format |
| --- | --- | --- | ---: | --- |
| `harpoon_anchor_tear` | Morsure du harpon, tension et rappel élastique | `assets/textures/v7/juice/harpoon_anchor_tear.png` | 512×512 | PNG RGB |
| `coconut_shockwave` | Impact coco, gerbe et large anneau de pression | `assets/textures/v7/juice/coconut_shockwave.png` | 512×512 | PNG RGB |
| `mine_detonation` | Détonation de mine, concussion et débris | `assets/textures/v7/juice/mine_detonation.png` | 512×512 | PNG RGB |
| `perfect_counterheel` | Validation spectaculaire d’une contre-gîte parfaite | `assets/textures/v7/juice/perfect_counterheel.png` | 512×512 | PNG RGB |
| `juice_vfx_atlas` | Agrégation 2×2 des quatre signatures | `assets/textures/v7/juice/juice_vfx_atlas.png` | 1024×1024 | PNG RGB |

Les quatre sources ImageGen sont conservées en PNG RGB 1254×1254 sous `art-source/generated-v7/juice/`.

## Atlas 2×2

L’atlas est divisé en cellules de 512×512 :

| Ligne | Colonne 0 | Colonne 1 |
| --- | --- | --- |
| 0 | `harpoon_anchor_tear` — UV 0,0 → 0.5,0.5 | `coconut_shockwave` — UV 0.5,0 → 1,0.5 |
| 1 | `mine_detonation` — UV 0,0.5 → 0.5,1 | `perfect_counterheel` — UV 0.5,0.5 → 1,1 |

Le fichier est préparé pour regrouper les quatre signatures derrière **une texture et un batch/draw call atlas**. Ce pack ne modifie toutefois aucun code runtime.

## Génération et traçabilité

- Mode utilisé : **ImageGen intégré**.
- Exécution : un appel distinct par signature.
- L’image d’entrée servait uniquement de référence de style, jamais de cible d’édition.
- Les prompts exacts sont conservés ligne par ligne dans `art-source/generated-v7/juice/manifest.json`.
- Les chemins, rôles, dimensions, UV, tailles de fichiers et empreintes SHA-256 sont consolidés dans `assets/textures/v7/asset-pack.json`.
- Les sorties originales 1254×1254 sont conservées sans remplacement des sources.

## Validation

- **Présence :** 4/4 sources, 4/4 finals et 1/1 atlas.
- **Dimensions :** sources 1254×1254 ; finals 512×512 ; atlas 1024×1024.
- **Formats :** tous les fichiers sont des PNG RGB opaques.
- **Fond additif :** les quatre coins de chaque final et de l’atlas sont noirs ; le canal maximal observé est 2/255 après réduction et 3/255 dans les sources haute définition.
- **Contenu :** harpon/câble, coco/onde circulaire, mine/débris et contre-gîte symétrique sont présents dans les cellules attendues.
- **Atlas :** quadrants et coordonnées UV vérifiés. Le quadrant harpon est pixel-identique à son final ; les trois autres restent visuellement sans perte avec un delta maximal de 2/255 par canal et un delta moyen inférieur ou égal à 0,015/255.
- **Intégrité :** les empreintes SHA-256 et tailles de fichiers du manifeste correspondent aux fichiers présents.
- **JSON :** les deux manifestes se parsèrent sans erreur.

## Aperçu

Planche-contact : `previews/v7_juice_contact.png`.

![Planche-contact du pack V7](../previews/v7_juice_contact.png)
