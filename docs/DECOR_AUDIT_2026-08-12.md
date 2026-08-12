# Audit du décor contre photos réelles — 12 août 2026

Méthode : captures en jeu par famille d'assets (previews/audit_decor/), photos
CC téléchargées d'Openverse en face (tmp/references/decor/, hors dépôt), verdict
par élément au regard du budget arcade mobile, corrections appliquées le jour
même et re-capturées.

Références clés : `tour_yoles_2.jpg` (CC-BY-SA Lechatsylvestre — deux yoles,
flottille de vedettes, côte habitée), `yole_course_1.jpg` (CC-BY-SA Rehcral —
ROSETTE : coque turquoise/jaune, bwa peints en rouge, catamarans spectateurs à
guirlandes de fanions, bateau presse), silhouettes de cocotiers CC-BY.

## Verdicts et actions

| élément | constat vs photo | verdict | action |
|---|---|---|---|
| coque (forme) | double pointe, tonture : juste | garder | — |
| coque (livrée) | vraies yoles multicolores ; MAIS la texture neutre × couleur d'équipe est un choix de LISIBILITÉ (classement lu à la couleur) | garder le principe | — |
| intérieur de coque | boîte NOIRE vs bois clair planchéié | refaire | plancher lattes bois clair (`plankMaterial`, texture perches clonée, repeat 2,5×5) |
| bwa dressés | peints couleur d'équipe (bwa ROUGES de ROSETTE) vs bois nu | refaire | `bwaMaterial` : bois teinté équipe (lerp 0,28 vers blanc), mât/vergue/pagaie naturels, suit le garage |
| patron | debout au-delà du tableau (pieds dans le vide, plancher s'arrête à ±2,95) | corriger | z −4,18 → −3,66, dans la coque |
| pagaie du patron | long manche vers l'avant-haut, pale sous l'eau : CONFORME à la photo | garder | — (le « bâton flottant » du premier contrôle était un raccourci de perspective) |
| îles proches | cônes verts lisses vs mornes bombés à canopée broccoli | refaire le rendu | moutonnement de canopée par sommet (bruit accroché à la POSITION, fréquences à l'échelle des facettes — plus fin, ça se replie en bandes ; jamais le flux RNG partagé, contractuel) |
| cocotiers instanciés | tronc droit + 5 cônes = sucettes vs tronc courbé, palmes tombantes, cocos | refaire le gabarit | `makePalmTrunkGeometry` (sweep courbé + grappe de cocos fusionnée) et `makePalmFrondGeometry` (lame en V retombante, DoubleSide) — mêmes conventions d'instanciation, placement inchangé |
| sargasses | texture radeau brune détourée déjà excellente | garder | — |
| backdrop / mornes lointains | brume + sprites : composition qui tient | garder | (cases créoles sur les îles = piste future) |
| flottille suiveuse | ABSENTE alors que chaque photo montre la course entourée | créer | voir ci-dessous |

## La flottille

Deux GLB Meshy 7 texte→3D (preview → refine → remesh → shrink 256) :
`flottille_catamaran.glb` (262 Ko, pont chargé de spectateurs, fanions) et
`flottille_vedette.glb` (245 Ko, hors-bord, taud, passagers). Semés par
`world.js` dans `configureChunk` — EN DERNIER et sur un RNG dédié
(`flottilleRng`) : aucun élément de décor existant ne bouge, et tout ajout
futur peut s'insérer avant sans déplacer un bateau. Latéral 60-74 m (hors du
couloir de course ±58 max, sous la bande d'îlots), garde de distance aux
plages, cap tourné vers la course, gîte légère aléatoire. Budget par palier :
2/chunk HQ, 1 MQ, 0 LQ — des clones (draw calls), pas des instances.

`test/spectator-assets.test.mjs` verrouille le nouveau contrat : exactement
deux GLB ≤ 300 Ko, semis dans world.js sur RNG dédié, pas de module runtime
séparé, précache service worker — l'ancienne flotte (catamarans + scooters +
danseuses) reste bannie.

## Refusé, et pourquoi

- **Cocotier Meshy en héros** : 1,19 Mo après shrink (le remesh ne décime pas
  bien le feuillage), style « plante d'appartement » — les palmiers
  procéduraux refaits sont plus justes et gratuits. Crédits économisés.
- **Livrée multicolore de coque** : contredirait la lecture du classement par
  couleur d'équipe, qui est un choix de gameplay assumé du dépôt.

Artefacts Meshy de session (scratchpad, non versionnés) : tâches
019ff6f3-c44f/c7cf/cb82 (previews), 019ff6f5-9fea/a28d/a541 (refines),
019ff6f9-dee5/e063/e1e0 (remesh). ~90 crédits consommés, solde 1 095.
