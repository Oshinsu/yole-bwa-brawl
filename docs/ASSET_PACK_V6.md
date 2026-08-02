# Asset Pack V6 — archive menu et badges versus

Le pack V6 a produit **8 fichiers** consacrés au début du jeu, à la sélection de
mode et au versus local. Ce document trace leur production historique ; il ne
signifie pas que les huit sont encore consommés par le runtime.

Dans la version courante, seuls les **2 badges joueurs** sont actifs. Les
**6 bitmaps opaques contenant des yoles** sont conservés physiquement sur disque
pour héritage, comparaison et audit, mais ils sont **débranchés de l'UI et du
précache**, et exclus du paquet produit par `tools/release.py`. Aucun bitmap de
yole généré n'est actif.

## Inventaire

| ID | Usage historique | Fichier | Dimensions | État courant |
| --- | --- | --- | ---: | --- |
| `menu_hero_backdrop` | Hero du menu principal | `assets/textures/v6/menu/menu_hero_backdrop.webp` | 1536×864 | Héritage sur disque · hors UI/précache |
| `mode_combat_card` | Carte du mode combat | `assets/textures/v6/menu/mode_combat_card.webp` | 960×540 | Héritage sur disque · hors UI/précache |
| `mode_tour_card` | Carte du Tour des Yoles | `assets/textures/v6/menu/mode_tour_card.webp` | 960×540 | Héritage sur disque · hors UI/précache |
| `mode_versus_card` | Carte joueur contre joueur | `assets/textures/v6/menu/mode_versus_card.webp` | 960×540 | Héritage sur disque · hors UI/précache |
| `mode_workshop_card` | Carte atelier/personnalisation | `assets/textures/v6/menu/mode_workshop_card.webp` | 960×540 | Héritage sur disque · hors UI/précache |
| `versus_lobby_backdrop` | Fond du lobby versus local | `assets/textures/v6/menu/versus_lobby_backdrop.webp` | 1536×864 | Héritage sur disque · hors UI/précache |
| `badge_player_one` | Emblème du joueur 1 | `assets/textures/v6/menu/badge_player_one.webp` | 512×512 | Actif · UI et précache |
| `badge_player_two` | Emblème du joueur 2 | `assets/textures/v6/menu/badge_player_two.webp` | 512×512 | Actif · UI et précache |

## Sources et reproductibilité

- Les prompts exacts, structurés ligne par ligne, sont conservés dans `art-source/generated-v6/menu/manifest.json`.
- Les six sorties opaques originales sont conservées en PNG sous `art-source/generated-v6/menu/*_source.png`.
- Chaque badge conserve sa sortie chroma originale (`*_chroma_source.png`) et son détourage haute définition (`*_cutout.png`).
- Les huit fichiers livrés et leurs empreintes SHA-256 sont indexés dans
  `assets/textures/v6/asset-pack.json`. Le manifeste est une trace de pack, pas
  la liste des images actives.
- La génération a utilisé le mode **ImageGen intégré**, avec un appel distinct par asset.
- Les badges ont suivi le flux chroma `#00ff00` du skill ImageGen : suppression locale du fond, soft matte, despill, puis réduction en WebP RGBA 512×512.

## Intentions d’intégration historiques

- Le hero principal devait placer l’action à droite et conserver une zone de contraste stable à gauche pour le titre et les boutons.
- Les quatre cartes devaient partager un ratio 16:9 et donner une identité propre à chaque entrée.
- Le lobby versus devait opposer clairement deux équipes et laisser l’axe central disponible pour les choix des joueurs.
- Les badges sont pensés pour fonctionner sur des panneaux sombres, des halos d’équipe ou directement au-dessus du décor grâce à leur transparence réelle.

Ces intentions expliquent les fichiers, mais ne décrivent plus l'intégration
courante des six bitmaps de yoles.

## Intégration courante

Le menu et l'atelier exposent directement le **modèle 3D runtime**. L'atelier
utilise une caméra showroom orbitable et applique au même `YoleVisual` :

- **6** peintures de coque et **6** accents de bordage ;
- **4** finitions de bois et **6** tenues d'équipage ;
- **4** livrées de voile et **3** profils de gréement ;
- une soute de **2 armes parmi 4**.

Le joueur voit donc la géométrie et les matériaux réellement utilisés en course,
sans image de yole pré-rendue.

## Validation et statut

- **Présence physique :** 8/8 fichiers présents.
- **Actifs dans le runtime :** 2/8, les deux badges.
- **Archives débranchées :** 6/8, tous les bitmaps contenant une yole.
- **Cumul historique :** 62 (V5) + 8 (V6) = **70 fichiers produits**.
- **Dimensions :** 2 fonds en 1536×864, 4 cartes en 960×540, 2 badges en 512×512.
- **Formats :** 6 fichiers WebP RGB opaques et 2 fichiers WebP RGBA.
- **Alpha joueur 1 :** quatre coins entièrement transparents ; 50,89 % de pixels transparents, 2,83 % de pixels semi-transparents.
- **Alpha joueur 2 :** quatre coins entièrement transparents ; 46,90 % de pixels transparents, 2,11 % de pixels semi-transparents.
- **Contrôle visuel historique :** composition, contraste, zones réservées à
  l’UI et détourage vérifiés sur la planche-contact. Ce contrôle ne vaut pas
  validation de l'authenticité des yoles représentées.
- **JSON :** les deux manifestes se parsèrent sans erreur.

## Aperçu

Planche-contact d'audit : `previews/v6_menu_pack_contact.png` (1920×1420).
Elle montre le pack conservé, pas l'interface actuelle.

![Planche-contact du pack V6](../previews/v6_menu_pack_contact.png)
