# Guide de production des assets V4

Le catalogue exécutable par un humain ou un agent se trouve dans
[`ASSET_PROMPTS.json`](./ASSET_PROMPTS.json). Il remplace les anciennes recettes
éparses. La règle de fond est simple :

> **ImageGen fabrique la matière et la silhouette. Le runtime fabrique le sens.**

Les noms, chiffres, unités, scores, cooldowns, positions, routes, numéros de yole,
états actif/pressé/vide et textes de menus restent en HTML, CSS, JavaScript ou
canvas. Ils ne doivent jamais être cuits dans un fond, un cadre, un bouton, une
voile ou une mini-carte.

## La cible V4

`art-source/ui_hud_direction_v4.png` (1672×941) est la **maquette maître de
composition**. Elle sert à juger :

- le rapport d’échelle entre yole, eau et HUD ;
- la mini-carte en haut à droite ;
- les commandes repoussées aux bords ;
- le rectangle de gameplay central dégagé.

Ce fichier n’est ni une texture, ni un écran à afficher, ni une source de texte.
Tout mot visible dans la maquette est un placeholder. Le JSON lui consacre
l’entrée `ui_hud_master_mockup` et associe quatre rôles de référence : yole réelle,
lagon/gréement, hiérarchie HUD arcade et screenshot actuel.

La DA V4 est « sport nautique martiniquais / crash-racer tropical » :

- madras interdit ;
- djab et chevrons originaux, rares et lisibles ;
- panneaux bleu-noir, cadres fins, laiton patiné, bois en micro-accent ;
- yoles anatomiquement crédibles avant toute décoration ;
- eau, écume, horizon et reliefs traités comme priorités actives.

## Lire et compiler une entrée

Pour un asset :

1. prendre `generation.prompt` ;
2. préfixer les blocs nommés dans `generation.inherits`, lus depuis
   `shared_art_direction` ;
3. conserver l’ordre de `prompt_schema.compile_order` ;
4. omettre les champs `null` ;
5. ajouter les instructions du `transparency_profile` ;
6. lancer **un appel ImageGen par asset distinct**.

Pour une entrée `family`, lancer un appel séparé pour chaque membre en remplaçant
`Subject` par son `subject` et, le cas échéant, son `accent` ou son `stage`.
Assembler l’atlas seulement après validation individuelle. Ne jamais demander au
modèle une grille de 11 icônes ou les 16 frames d’un flipbook en une fois.

Les champs `use_case`, `asset_type`, `primary_request`, `input_images`,
`scene_backdrop`, `subject`, `style_medium`, `composition_framing`,
`lighting_mood`, `color_palette`, `materials_textures`, `text_verbatim`,
`constraints` et `avoid` suivent le schéma partagé ImageGen.

## Références et droits

Chaque image d’entrée a un rôle explicite :

- `ref_yole_action` : coque, bwa, densité et gestes d’équipage ;
- `ref_yole_lagoon` : gréement, lecture aérienne et couleur d’eau ;
- `ref_arcade_hud` : hiérarchie seulement, jamais composition à copier ;
- `ref_current_course` : diagnostic des défauts ;
- `ref_hud_v4` : cible de composition approuvée.

Ne pas recopier de sponsor, logo, numéro, personne identifiable ou livrée réelle.
Ne pas introduire dans un générateur une image dont la licence impose une
redistribution virale. Les références fournies par l’utilisateur restent des
références de travail, pas des assets à livrer.

## Transparence

Le chemin par défaut reste ImageGen intégré, puis détourage local.

### Formes simples sur fond vert

Pour l’UI et les glyphes, utiliser `green_key_simple` : fond uniforme `#00ff00`,
sans ombre, sol, reflet, texture ni variation. Après génération :

```powershell
python "$env:USERPROFILE\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py" `
  --input "art-source\generated\<asset>_source.png" `
  --out "art-source\generated\<asset>_candidate_v01.png" `
  --auto-key border --soft-matte `
  --transparent-threshold 12 --opaque-threshold 220 --despill
```

Vérifier un canal alpha, quatre coins transparents et aucune frange verte. Pour
un anneau, vérifier aussi le trou central : un flood-fill des seuls bords ne
suffit pas.

### Végétation et relief sur fond magenta

Utiliser `magenta_key_foliage`, car le sujet contient du vert. Le fond doit être
`#ff00ff` parfaitement plat et le relief doit toucher tout le bord bas lorsqu’il
forme un panorama. Si les feuilles fines restent frangées après une seconde passe
avec `--edge-contract 1`, arrêter : une transparence native demanderait un autre
chemin/modèle et doit être approuvée avant exécution.

### Eau, écume et halos

Les formes molles destinées à un blend Screen/Additive utilisent
`black_additive`, pas un chroma-key. Les quatre coins et séparateurs d’atlas
doivent être noir pur (`RGB <= 2`). Un fond gris crée un rectangle ou des croix
lumineuses.

## Ordre de production

1. `P0` de composition et monde : `ui_hud_master_mockup`,
   `env_water_master_reference_v4`, backdrops, roche de morne, ciel et livrées.
2. `P0` fonctionnel : boutons principaux/secondaires/action, choix, jauges,
   mini-carte et glyphes d’action.
3. `P1` de finition : alertes, joystick, utilitaires, spray, sargasses, storm
   wall, poses d’équipage.
4. `P2` optionnel : végétation billboard, soleil raster et emblème de loading.

Produire d’abord une seule entrée représentative par famille. Une fois la DA et
les contraintes techniques validées, décliner les membres.

## Validation technique

Avant intégration, contrôler systématiquement :

- dimensions, ratio, format, alpha et poids indiqués dans `output` ;
- absence de texte, logo, watermark, faux chiffre ou faux état ;
- lisibilité aux tailles CSS réelles, notamment 31, 42, 50, 72 et 114 px ;
- 9-slice à trois tailles extrêmes sans coin étiré ;
- atlas sans saignement ni gouttière lumineuse ;
- texture tuilable en mosaïque 4×4 ;
- panoramas sur cylindre 360° ;
- neutralité de `hull_paint` et du tissu avant teinte runtime ;
- lisibilité sur mer claire **et** dans le Grain ;
- rectangle central de gameplay libre.

Les concepts `*_concept_v4` et `*_master_reference_v4` sont des cibles de revue,
pas des assets runtime. Les mesures de coque et le squelette viennent toujours
de `ASSET_CONTRACT.md`, jamais d’une image générée.

## Intégration

Générer d’abord vers `art-source/generated/` et conserver des versions. Promouvoir
le candidat choisi vers le chemin `output.path` uniquement après validation.
Ne pas écraser silencieusement un fichier actif.

État réel à connaître :

- les surfaces V4 actuelles sont dessinées par le dernier bloc de `style.css` ;
- `ui_panneau.png`, `ui_bouton_idle.png` et `ui_bouton_pressed.png` sont legacy
  tant qu’aucune règle V4 ne les rebranche ;
- `menu_pause_v4.jpg` est le backdrop modal actif ;
- la mini-carte est le canvas live `#minimapCanvas`, mis à jour dans
  `src/game/hud.js`.

Un skin raster UI est donc un candidat A/B, pas automatiquement un drop-in. Si
la version CSS est plus nette, plus légère ou plus accessible, elle reste la
version de production.

Après promotion d’un asset runtime :

1. ajouter ou mettre à jour son chargement réel ;
2. ajouter son chemin au cache de `service-worker.js` si nécessaire ;
3. vérifier le démarrage offline ;
4. lancer les tests statiques et visuels ;
5. capturer menu, course calme et Grain aux mêmes seed/tick/caméra.

Attention : `verify_static.py` vérifie surtout la cohérence des entrées connues.
Il ne garantit pas qu’un nouveau fichier livré mais oublié du cache soit détecté
par une recherche inverse. La revue du diff `assets/` ↔ `service-worker.js`
reste obligatoire.

## Ce qui ne doit pas passer par ImageGen

- la normal map et le masque de crête `sea_detail` : ils sont produits
  mathématiquement dans `src/render/ocean.js` ;
- la route et les positions de la mini-carte : canvas runtime ;
- les textes et chiffres : DOM/canvas ;
- les états de contrôle : classes CSS ;
- les dimensions et articulations de yole : contrat 3D et simulation.

Une texture peut améliorer la matière de l’eau ; elle ne peut pas, à elle seule,
supprimer une géométrie facettée, corriger une fréquence de vague ou rendre un
shader plus fluide. La référence `env_water_master_reference_v4` sert à régler le
rendu, pas à remplacer sa physique.
