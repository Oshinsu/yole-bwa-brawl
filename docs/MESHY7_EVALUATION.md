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
