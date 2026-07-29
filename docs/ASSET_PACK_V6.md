# Asset Pack V6 — Menu et versus

Le pack V6 ajoute **8 assets de production** consacrés au début du jeu, à la sélection de mode et au versus local. Le total cumulé passe de **62 assets en V5 à 70 assets en V5 + V6**.

La direction artistique conserve les marqueurs du jeu : yoles rondes martiniquaises, équipages en appui sur les bwa, eau cyan, indigo profond, lumière tropicale, accents or/magenta et lisibilité arcade. Les images ne contiennent ni texte, ni logo, ni interface incrustée afin que le contenu HTML/CSS reste éditable et localisable.

## Inventaire

| ID | Usage | Fichier final | Dimensions | Format |
| --- | --- | --- | ---: | --- |
| `menu_hero_backdrop` | Hero du menu principal avec zone sombre réservée aux commandes | `assets/textures/v6/menu/menu_hero_backdrop.jpg` | 1536×864 | JPEG RGB |
| `mode_combat_card` | Carte du mode combat | `assets/textures/v6/menu/mode_combat_card.jpg` | 960×540 | JPEG RGB |
| `mode_tour_card` | Carte du Tour des Yoles | `assets/textures/v6/menu/mode_tour_card.jpg` | 960×540 | JPEG RGB |
| `mode_versus_card` | Carte joueur contre joueur | `assets/textures/v6/menu/mode_versus_card.jpg` | 960×540 | JPEG RGB |
| `mode_workshop_card` | Carte atelier/personnalisation | `assets/textures/v6/menu/mode_workshop_card.jpg` | 960×540 | JPEG RGB |
| `versus_lobby_backdrop` | Fond symétrique du lobby versus local | `assets/textures/v6/menu/versus_lobby_backdrop.jpg` | 1536×864 | JPEG RGB |
| `badge_player_one` | Emblème du joueur 1 | `assets/textures/v6/menu/badge_player_one.png` | 512×512 | PNG RGBA |
| `badge_player_two` | Emblème du joueur 2 | `assets/textures/v6/menu/badge_player_two.png` | 512×512 | PNG RGBA |

## Sources et reproductibilité

- Les prompts exacts, structurés ligne par ligne, sont conservés dans `art-source/generated-v6/menu/manifest.json`.
- Les six sorties opaques originales sont conservées en PNG sous `art-source/generated-v6/menu/*_source.png`.
- Chaque badge conserve sa sortie chroma originale (`*_chroma_source.png`) et son détourage haute définition (`*_cutout.png`).
- Les finals consommables par le jeu et leurs empreintes SHA-256 sont indexés dans `assets/textures/v6/asset-pack.json`.
- La génération a utilisé le mode **ImageGen intégré**, avec un appel distinct par asset.
- Les badges ont suivi le flux chroma `#00ff00` du skill ImageGen : suppression locale du fond, soft matte, despill, puis réduction en PNG RGBA 512×512.

## Intentions d’intégration

- Le hero principal place l’action à droite et conserve une zone de contraste stable à gauche pour le titre et les boutons.
- Les quatre cartes partagent un ratio 16:9 et des silhouettes lisibles à petite taille, tout en donnant une identité propre à chaque entrée.
- Le lobby versus oppose clairement une équipe cyan/or à une équipe magenta/orange et laisse l’axe central disponible pour les choix des joueurs.
- Les badges sont pensés pour fonctionner sur des panneaux sombres, des halos d’équipe ou directement au-dessus du décor grâce à leur transparence réelle.

## Validation

- **Compte :** 8/8 finals présents.
- **Cumul :** 62 (V5) + 8 (V6) = **70 assets**.
- **Dimensions :** 2 fonds en 1536×864, 4 cartes en 960×540, 2 badges en 512×512.
- **Formats :** 6 fichiers JPEG RGB opaques et 2 fichiers PNG RGBA.
- **Alpha joueur 1 :** quatre coins entièrement transparents ; 50,89 % de pixels transparents, 2,83 % de pixels semi-transparents.
- **Alpha joueur 2 :** quatre coins entièrement transparents ; 46,90 % de pixels transparents, 2,11 % de pixels semi-transparents.
- **Contrôle visuel :** composition, contraste, zones réservées à l’UI, différenciation des modes et détourage vérifiés sur la planche-contact.
- **JSON :** les deux manifestes se parsèrent sans erreur.

## Aperçu

Planche-contact : `previews/v6_menu_pack_contact.png` (1920×1420).

![Planche-contact du pack V6](../previews/v6_menu_pack_contact.png)
