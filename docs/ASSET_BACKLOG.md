# Inventaire et backlog d'assets

> **Archive d’état, non normative depuis la V4.** Les tableaux ci-dessous
> décrivent plusieurs instantanés désormais dépassés et se contredisent avec le
> runtime actuel (mini-carte canvas, surfaces CSS V4, props et backdrop modal
> V4). Pour toute nouvelle production, utiliser `ASSET_PROMPTS.json`,
> `ASSET_PROMPTS_GUIDE.md` et le verrou V4 de `ART_DIRECTION.md`. Refaire un
> inventaire depuis `src/render/assets.js`, `index.html`, `style.css` et
> `service-worker.js` avant de conclure qu’un asset est absent, actif ou caché.
> `verify_static.py` ne constitue pas à lui seul une vérification inverse de tous
> les nouveaux fichiers livrés.

État à la Passe 18 (voir [CHANGELOG](../CHANGELOG.md) — le journal est numéroté par passes, pas daté). Le contrat d'export est dans `ASSET_CONTRACT.md`, la
direction artistique dans `ART_DIRECTION.md`.

## Ce qui est livré et branché

**Rien ne manque de ce que le code déclare** : 4 assets déclarés, 4 présents. Le
jeu tourne complet, et chaque pièce absente retomberait de toute façon sur son
équivalent procédural.

| Asset | Déclaré dans | Poids | État |
|---|---|---:|---|
| `models/yole_hull.glb` | `YOLE_PARTS` | 120 Ko | branché |
| `models/yole_crew.glb` | `YOLE_RIGS` | 264 Ko | branché — rig stylisé, maillot teinté par équipe |
| `textures/sail_djab.jpg` | `YOLE_TEXTURES` | 236 Ko | branché |
| `textures/explosion_flipbook.jpg` | `YOLE_TEXTURES` | 136 Ko | branché |

**680 Ko** au total. Deux gabarits de référence non chargés vivent dans
`models/reference/`, et les sources haute définition dans `assets/source/` — ni
les uns ni les autres ne sont livrés au joueur.

## Livré depuis (7 août)

| Asset | Poids | État |
|---|---:|---|
| `textures/armes_atlas.png` | 309 Ko | 4 armes détourées, pas encore câblé |
| `models/barik.glb` | 79 Ko | 668 tris, pas encore câblé |
| `textures/ui_joystick_base.png` | 73 Ko | anneau percé au centre, vérifié |
| `textures/ui_joystick_knob.png` | 33 Ko | |
| `textures/ui_bouton_idle.png` | 41 Ko | |
| `textures/ui_bouton_pressed.png` | 42 Ko | |
| `textures/ui_jauge_frame.png` | 35 Ko | |
| `textures/ui_jauge_fill.png` | 31 Ko | |
| `textures/ui_panneau.png` | 53 Ko | 9-slice |

⚠️ **Le générateur rend un fond BLANC même quand on exige `#000000`.** C'est
arrivé sur les 12 derniers assets sans exception. `tools/key_alpha.py` détoure
par remplissage depuis les bords ; pour une forme ANNULAIRE (l'anneau de
joystick) il faut le mode seuil, sinon le trou central reste opaque.

### Rejeté à la génération

- `backdrop_near` : les collines n'atteignent pas le bord bas et le ruban n'est
  pas continu (trous jusqu'en bas entre les reliefs). Source conservée dans
  `assets/source/ui/`. À régénérer avec une contrainte plus dure sur la
  continuité de la ligne de crête.
- `menu_pause` : jamais apparu dans le listing des générations.
- `bouee` : concept téléchargé, en attente de conversion 3D ou de sprite.

## Ce qui manque pour atteindre les maquettes

**21 fichiers**, soit **~35 générations** (l'atlas d'icônes se produit glyphe par
glyphe : un modèle d'image ne sort pas 17 pictogrammes cohérents d'un coup).

### Gain visuel énorme — et gain de performance en prime

| # | Asset | Format | Poids | Pourquoi |
|---|---|---|---:|---|
| 1 | `sea_detail` | 512² normale + masque | 0 Ko | **Procédural recommandé**, pas généré. Remplace ~12 hachages par fragment par 2 `texture2D`, sur 65 % de l'écran. Ne jamais demander une normal map à un modèle d'image : il produit un violet plausible et faux. |
| 2 | `sky_clouds.jpg` | 2048×512 tuilable | ~90 Ko | Les nuages sont un fbm 3D à 4 octaves — ~32 hachages par pixel de ciel, pour une couverture invisible dans la bande basse où la caméra regarde. |

Ces deux-là **font gagner des performances** en même temps qu'ils améliorent
l'image. À faire en premier.

### Gain visuel énorme

| # | Asset | Format | Poids | Note |
|---|---|---|---:|---|
| 3 | `backdrop_far.png` | 2048×512 alpha | ~130 Ko | Chaîne volcanique vue de la mer, flancs **concaves** de stratovolcan. Le générateur d'îles actuel fait l'inverse (cône convexe). Déjà désaturée vers l'horizon `#d1f3f7`. |
| 4 | `backdrop_near.png` | 2048×384 alpha | ~90 Ko | Collines vertes contrastées, liseré de plage en pied. |

⚠️ En **espace monde**, surtout pas peintes dans le dôme de ciel : sinon le
relief suivrait la caméra.

### Gain fort

| # | Asset | Format | Poids | Note |
|---|---|---|---:|---|
| 5 | `hull_paint.jpg` | 1024² | ~110 Ko | **Doit être neutre et désaturée.** Les 4 yoles partagent la géométrie et ne diffèrent que par `material.color` : une texture colorée détruirait la distinction des équipages, donc la lisibilité du classement. ✅ Fait — `fit_hull_glb.py` conserve désormais `TEXCOORD_0`. |
| 6 | `wood_bwa.jpg` | 512² tuilable | 48 Ko | ✅ **Livré.** Couvre 28 perches à l'écran. |
| 7 | `sail_atlas.jpg` | 2048² = 4×1024² | ✅ 625 Ko | Personnalisation. La voile fait 3,65 m au pied contre 1,31 m à la têtière : la densité de texels varie d'un facteur 2,78 en hauteur. **Motif centré en bas, tiers supérieur presque vide, aucune trame régulière** — une trame s'étirerait visiblement. |

### Props

| # | Asset | Format | Poids | Note |
|---|---|---|---:|---|
| 8-9 | `buoy.glb`, `crate.glb` | ≤ 600 tris + 512² | ~120 Ko | Les deux props les plus vus après l'eau : aujourd'hui une rondelle orange et une boîte. ⚠️ `extractGeometry` ne garde que la géométrie et **jette le matériau** — il faudra conserver la scène, comme pour le rig d'équipage. |

### Interface — chantier lourd

| # | Assets | Poids | Note |
|---|---|---:|---|
| 10-16 | Plancher : panneau bois, bouton d'action + état pressé, bouton primaire, base et pommeau de joystick, atlas d'icônes | ~300 Ko | PNG-24 alpha générés en @3x, découpes 9-slice. |
| 17-21 | Set complet : cadre et remplissage de jauge, pastille, cartouches | ~150 Ko | |

L'atlas d'icônes (grille 6×3, 64 px par cellule) se produit **glyphe par
glyphe** puis s'assemble.

⚠️ Prérequis : `build_single_file.py` ne sait pas embarquer de binaire — le
monofichier perdrait toute l'UI. À étendre avant de lancer ce chantier.

## Budget

| Poste | Générations | Crédits |
|---|---:|---:|
| Ciel, montagnes, coque, bois, voiles | 6 | ~12 |
| Props 3D (2 concepts + 2 meshes) | 4 | ~44 |
| Interface (dont 17 glyphes) | ~25 | ~50 |
| **Total** | **~35** | **~105** |

Poids livré ajouté : **~1,2 Mo**, soit **~1,9 Mo** au total. Reste raisonnable
pour une PWA hors-ligne, mais c'est le plafond à ne pas dépasser sans passer en
chargement différé.

## Règles qui ont déjà coûté cher

1. **Générer en 2k, livrer en 1k ou moins.** Une texture d'équipage 2048² pesait
   7,29 Mo à elle seule ; en 256² elle en fait 19 Ko et personne ne voit la
   différence à la taille d'affichage réelle.
   ⚠️ **Sauf atlas UV fragmenté.** Un rig généré a des dizaines de petits îlots :
   réduit d'un facteur 8 ils bavent l'un dans l'autre. L'équipage a dû rester en
   512² (dispersion sur le torse : 35 à 256², ≤ 6 à 512²). Le critère n'est pas
   la taille d'affichage, c'est la taille du plus petit îlot d'UV.
6. **Un concept photoréaliste ne donne jamais un asset utilisable ici.** Le
   premier équipage venait d'une photo : correctement rigué, correctement
   dimensionné, et hors-sujet dans un monde en aplats. La DA se décide au
   concept, pas au rattrapage de matériau.
7. **Toute couleur d'équipe doit rester un multiplicateur runtime.** Une couleur
   cuite dans une texture partagée habille les quatre équipages pareil — et
   `SkeletonUtils.clone()` partage les matériaux, donc il faut cloner
   explicitement, une fois par yole.
2. **Fond noir pur** pour tout atlas destiné au blending additif — et le
   vérifier : les séparateurs de grille deviennent des croix lumineuses.
3. **JPEG dès qu'il n'y a pas d'alpha.**
4. **Aucune image sous licence virale** dans un générateur (voir la note CC BY-SA
   dans le CHANGELOG du 28 juillet).
5. **Tout fichier livré doit figurer dans `service-worker.js`**, sinon
   `verify_static.py` fait échouer le build — et à l'inverse un fichier listé
   mais absent le fait échouer aussi.
