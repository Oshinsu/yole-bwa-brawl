# Direction artistique — YOLE: BWA BRAWL

> **VERROU V4 — cette règle fait foi sur tout passage historique plus bas.**
> La direction est **sport nautique martiniquais / crash-racer tropical** :
> agressive, contrastée, arcade et lisible sur mobile. Le madras est interdit.
> Les identités passent par des couleurs runtime, des djabs originaux et des
> chevrons subtils. Les cadres restent fins. L’eau, l’écume, l’horizon, les
> reliefs et l’anatomie des yoles sont des priorités actives, pas des sujets clos.

## L'intention en une phrase

**Le Tour des Yoles filmé comme un crash-racer tropical.** Pas un simulateur
nautique, pas un jeu tropical générique : un sport martiniquais rapide, physique,
contrasté et lisible à 30 images par seconde sur un téléphone.

Le référentiel n'est pas « Caraïbes » en général. C'est **yole ronde, bwa, écume,
relief volcanique, djab et chevrons**.

## ~~Le pivot : le madras~~ (archive non normative)

C'est la proposition centrale, et elle règle plusieurs problèmes d'un coup.

Le madras donne un **système** d'identité d'équipe au lieu de quatre couleurs
choisies au hasard. Chaque yole reçoit une **combinaison madras** — une trame à
carreaux sur deux ou trois teintes — déclinée sur :

- les bandes horizontales de la coque (comme les vraies livrées sponsorisées) ;
- un bandeau de voile ;
- le maillot de l'équipage — ce qui **règle la régression actuelle** où les 24
  équipiers portent le même rouge ;
- le liseré du HUD et la pastille de classement.

Avantages concrets : c'est authentiquement martiniquais, non déposable,
immédiatement reconnaissable, et surtout **génératif** — on peut produire huit
équipes cohérentes sans redessiner huit identités.

| Yole | Trame madras | Accent |
|---|---|---|
| BWA FATAL | ocre / rouge brique / noir | `#ff7524` |
| KOLIBRI | turquoise / blanc / jaune | `#1de1e8` |
| CARACOLI | violine / vert / or | `#7658ff` |
| LANMÈ ROUGE | rouge / rose / blanc | `#ef3f75` |

## Palette

| Rôle | Valeur | Note |
|---|---|---|
| Mer profonde | `#0d4f63` | hors soleil |
| Mer claire / haut-fond | `#2fb9c4` | halo autour des îles |
| Écume | `#eefaff` | jamais blanc pur |
| Horizon | `#d1f3f7` | **source unique**, partagée fog + brume océan + ciel |
| Ciel zénith | `#079bd1` | |
| Volcan, roche | `#4d4a46` | sommets à découvert |
| Végétation | `#1c8b4e` → `#0a5c39` | étagement par altitude |
| Sable | `#e8d7a2` | |
| Bois (bwa, mât) | `#c98a45` | chaud, jamais grisé |
| Or carnaval | `#ffc531` | accent d'interface |
| Nuit du Grain | `#160f2f` | le Mur du Grain uniquement |

## Lumière

**Heure dorée permanente**, soleil bas et large. C'est ce qui sépare une mer
tropicale d'une mer de la Manche : les crêtes sont translucides à contre-jour,
les creux sont teal, jamais gris.

- une seule direction de soleil partagée ombres / reflets / disque céleste ;
- le Grain est le **seul** moment sombre du jeu — son contraste fait son effet ;
- pas de nuit, pas de crépuscule : ils diluent l'identité.

## Rendu

- **Facettes assumées.** Le jeu est en flat shading sur les îles et en volumes
  simples : c'est une esthétique, pas un défaut. On l'assume partout plutôt que
  de viser un réalisme qu'un budget mobile ne tiendra pas.
- **Silhouette avant texture.** À la distance de jeu, une yole se lit à sa
  silhouette : mât raqué, voile unique, faisceau de bois. Investir là d'abord.
- **Pas de gris.** Toute désaturation doit venir de la brume atmosphérique, pas
  d'une couleur de base terne.

## Interface

Le HUD V4 est un instrument de course, pas une taverne ni un cockpit de science-
fiction :

- **cadres minces** en encre marine, filet de laiton patiné et coins coupés ;
- bois brûlé et corde limités à de petits points d’ancrage, jamais en cadres
  massifs répétés ;
- djab et chevrons employés comme micro-signatures, jamais sous le texte ;
- les couleurs d’équipe et d’arme restent pilotées au runtime ;
- mini-carte et commandes restent aux bords ; le centre de gameplay demeure libre.

**Lisibilité d'abord** : au soleil, sur un téléphone, à une main.

## Préambule de style pour toute génération

À coller en tête de **chaque** prompt, sans exception :

> _Sport nautique martiniquais transformé en crash-racer tropical. Palette
> VERROUILLÉE : teal profond et turquoise (#0d4f63–#2fb9c4), écume ivoire
> (#eefaff), horizon cyan pâle (#d1f3f7), bois chaud (#c98a45), laiton/or
> (#d7aa5b–#ffc531), volcan vert-noir (#1c8b4e–#0a5c39). Heure dorée, soleil bas,
> ombres colorées jamais grises. Yoles rondes anatomiquement crédibles,
> silhouettes lisibles en petit, djab et chevrons subtils. Aucun madras, aucun
> texte ou logo cuit, aucun gris neutre dominant, aucune nuit hors du Grain._

## Interdits

- le gris neutre comme couleur de base ;
- le madras, même en liseré ou micro-motif ;
- les cadres bois/corde massifs ou répétés sur chaque widget ;
- les dégradés lisses sur les volumes (contredit le flat shading) ;
- le réalisme photo sur les personnages — ils sont vus à 30 pixels de haut ;
- les logos, marques et noms réels tant que la couche `rights_status` n'est pas
  en place (voir `ASSET_CONTRACT.md`) ;
- toute image sous licence virale passée à un générateur.

## Ce que ça donne, concrètement

1. une géométrie de yole crédible et des équipages réellement en appui ;
2. quatre livrées originales djab/chevrons, sans texte ni madras ;
3. une interface mince en encre marine/laiton, avec centre de jeu dégagé ;
4. une eau plus fluide, une écume fine et un horizon partagé ;
5. des îlots concaves, irréguliers et boisés — jamais des cônes.

Les points 1, 4 et 5 restent des **priorités actives**. La maquette
`art-source/ui_hud_direction_v4.png` est la cible de composition, jamais un écran
à afficher ni une source de texte. Les prompts et règles d’intégration détaillés
vivent dans `ASSET_PROMPTS.json` et `ASSET_PROMPTS_GUIDE.md`.


## Direction retenue — Burnout Takedown

Ce qui a été validé en production plutôt que le madras :

- **emblème de djab** (masque de carnaval martiniquais) et chevrons durs sur la
  voile — la plus grande surface d'une yole à l'écran ;
- noir, blanc cassé et cramoisi en aplats francs, **contours durs, aucun dégradé** ;
- toile vieillie, taches, trame de tissu : la crasse fait la crédibilité ;
- lisible en petit avant tout — un emblème centré bas, des bandes en haut, parce
  que le haut de la voile est compressé horizontalement par le mapping.

L'agressivité vient du **contraste et de l'impact**, pas de la densité d'interface.
Le HUD de Burnout est minimal : vitesse, boost, position.

## Textures — ce qui a débloqué le rendu

Le projet n'avait **aucune texture** (hors canvas de sillage) : tout était en
aplats de couleur unie. C'était la cause principale de l'impression « prototype »,
bien avant la géométrie.

Règles retenues :

- générer en 2k, **livrer en 1k ou moins** — un flipbook 4×4 à 256 px par case
  suffit largement à la taille d'affichage réelle ;
- fond **noir pur** pour tout atlas destiné au blending additif, et vérifier qu'il
  l'est vraiment (les séparateurs de grille deviennent des croix lumineuses) ;
- JPEG dès qu'il n'y a pas d'alpha : 10,5 Mo de sources → 371 Ko livrés.

## V7 — Combat Juice et feedback d’interface

Les quatre signatures V7 sont des accents rares, réservés aux moments qui doivent
se lire en moins d’un dixième de seconde :

- **Harpon** : diagonale cyan très tendue, morsure or-blanc, éclats courts et
  arcs de rappel élastique ;
- **Coco** : couronne d’eau turquoise, cœur chaud, fragments de coque et anneau
  radial large ;
- **Mine** : poussée verticale magenta/rouge, eau cyan et débris métalliques
  détourés ;
- **Contre-gîte parfaite** : symétrie immédiate, centre lime, rubans cyan et
  accents or qui signifient précision plutôt que destruction.

Les finals individuels sont des PNG RGB 512×512 sur noir additif. Ils sont
regroupés dans `assets/textures/v7/juice/juice_vfx_atlas.png`, atlas 2×2 de
1024×1024 prévu pour une texture et un draw call. Le comptage reste explicite :
**74 signatures artistiques**, ou **75 fichiers** si l’atlas d’agrégation est
compté. Les prompts, empreintes et UV sont documentés dans
[ASSET_PACK_V7.md](ASSET_PACK_V7.md).

Le feedback d’interface suit la même règle de rareté :

- un état visuel ne s’active qu’après une action réellement acceptée ;
- le panneau de statut distingue stable, surf, dérive, rattrapage et danger,
  tandis que le lit d’eau accompagne continûment vitesse, gerbe et glisse ;
- cooldown, ressource basse, cible, score ou statut critique utilisent des
  impulsions brèves, jamais des animations infinies ;
- les cibles tactiles restent au moins à 44 px **sur pointeur grossier** (46 px
  mesurés) ; en contexte souris la même rail descend à 31 px, ce qui est voulu —
  le seuil de 44 px vise le doigt, pas le curseur. Le focus clavier demeure visible
  et `prefers-reduced-motion` retire le mouvement non essentiel ;
- l’haptique `TOTAL / DOUX / SANS` complète ces signaux sans remplacer leur
  lecture visuelle ; sa sensation finale doit encore être vérifiée sur matériel
  mobile réel.

Planche de contrôle : [V7 Combat Juice](../previews/v7_juice_contact.png).
