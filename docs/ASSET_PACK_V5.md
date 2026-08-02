# Pack d’assets V5

Le pack V5 rassemble **62 assets de production** destinés aux commandes, aux
armes, au HUD et aux effets visuels. Le manifeste consolidé
[asset-pack.json](../assets/textures/v5/asset-pack.json) est la source de vérité
pour les identifiants, les chemins de travail, les fichiers finaux et leur mode
d’intégration runtime.

L’atlas `assets/textures/v5/vfx/spell_vfx_atlas.webp` est un fichier runtime
additionnel construit à partir des 18 VFX. Il n’est donc pas compté comme un
63e asset.

## Inventaire

| Catégorie | Nombre | Fichiers finaux | Intégration |
| --- | ---: | --- | --- |
| Icônes de commandes | 18 | `assets/textures/v5/icons/*.webp` | Images de fond CSS |
| Icônes d’armes | 8 | `assets/textures/v5/icons/icon_weapon_*.webp` | Images de fond CSS |
| HUD et menus | 18 | `assets/textures/v5/hud/*` | Images de fond CSS |
| VFX | 18 | `assets/textures/v5/vfx/*.webp` | Atlas additif Three.js |
| **Total compté** | **62** |  |  |

### Icônes de commandes

- `icon_bwa_shift`
- `icon_bwa_dash`
- `icon_turbo`
- `icon_soute`
- `icon_settings`
- `icon_sound`
- `icon_pause`
- `icon_quality`
- `icon_zoom_in`
- `icon_zoom_out`
- `icon_zoom_reset`
- `icon_replay`
- `icon_download`
- `icon_haptics`
- `icon_stable_camera`
- `icon_reduce_flash`
- `icon_left_handed`
- `icon_performance`

### Icônes d’armes

- `icon_weapon_coco`
- `icon_weapon_harpoon`
- `icon_weapon_mine`
- `icon_weapon_rhum`
- `icon_weapon_barik`
- `icon_weapon_chadron`
- `icon_weapon_lanbi`
- `icon_weapon_pwason`

### HUD et menus

- Boutons : `ui_primary_idle`, `ui_primary_pressed`,
  `ui_secondary_idle`, `ui_secondary_pressed`, `ui_action_idle`,
  `ui_action_pressed` et `ui_utility_button`.
- Contenants : `ui_panel_9slice` et `ui_alert_panel`.
- Navigation et visée : `minimap_frame`, `reticle_harpoon`,
  `reticle_cannon`, `reticle_mine`, `marker_lock_on` et
  `marker_storm_danger`.
- Tactile et menu : `joystick_base`, `joystick_knob` et
  `menu_end_backdrop`.

### VFX et ordre de l’atlas

L’ordre ci-dessous est contractuel : il correspond aux indices de `SPELL_VFX`
dans `src/render/vfx.js`.

| Slot | ID |
| ---: | --- |
| 0 | `coco_impact` |
| 1 | `coco_projectile_trail` |
| 2 | `harpoon_launch_flash` |
| 3 | `harpoon_lock_ping` |
| 4 | `harpoon_tether_energy` |
| 5 | `tsunami_mine_armed` |
| 6 | `tsunami_ring_wave` |
| 7 | `rhum_invulnerability_aura` |
| 8 | `barik_fuse_sparks` |
| 9 | `barik_explosion` |
| 10 | `chadron_spike_burst` |
| 11 | `chadron_poison_splash` |
| 12 | `lanbi_sound_cone` |
| 13 | `lanbi_stun_burst` |
| 14 | `pwason_homing_trail` |
| 15 | `pwason_hit_burst` |
| 16 | `bwa_shift_streak` |
| 17 | `bwa_dash_impact` |

## Direction artistique

La DA associe le sport nautique martiniquais à une énergie de
**tropical crash-racer**. Elle repose sur quelques règles stables :

- base en encre indigo presque noire, accents cyan et ivoire, filets très fins
  en laiton patiné ;
- textures de toile de voile et de métal légèrement vécu, sans surcharge ;
- géométries de djab et chevrons de course seulement en gravure discrète ;
- silhouettes franches et lisibles entre 24 et 48 px ;
- pas de gros cadres en bois, de cordages décoratifs, de texte, de chiffres,
  de logo ni de filigrane dans les rasters ;
- libellés, états, scores, couleurs d’équipe, cooldowns et informations de
  mini-carte restent produits par le runtime.

Les icônes et les éléments HUD sont livrés en WebP avec transparence, à
l’exception du fond de fin de course `menu_end_backdrop.webp`. Les VFX gardent
un fond noir pur : le shader les compose en mode additif.

## Sources, finals et manifests de prompts

Chaque entrée du manifeste consolidé expose quatre informations :

- `source` : image de génération ou de travail conservée sous
  `art-source/generated-v5/` ;
- `final` : fichier nettoyé et optimisé consommable par le jeu ;
- `category` : `command_icon`, `weapon_icon`, `hud` ou `vfx` ;
- `runtime` : profil d’intégration direct CSS ou slot de l’atlas Three.js.

Les prompts et métadonnées de génération restent dans leurs manifests
spécialisés :

- [icônes de commandes](../art-source/generated-v5/icons/manifest.json) ;
- [icônes d’armes](../art-source/generated-v5/icons/weapon_manifest.json) ;
- [HUD et menus](../art-source/generated-v5/hud/manifest.json) ;
- [VFX](../art-source/generated-v5/vfx/manifest.json).

Ces quatre fichiers spécialisés restent la référence créative. Le manifeste
consolidé ne duplique pas les prompts ; il en reprend exactement les IDs et les
chemins `source`/`final`.

## Intégration runtime

### Icônes et HUD

Les 44 assets d’interface sont référencés directement depuis `style.css` via
leur chemin `final`. Les surfaces restent volontairement muettes : le HTML et
le CSS ajoutent le texte, les états interactifs et les valeurs variables.

Lors du remplacement d’un asset :

1. conserver son ID et son chemin final ;
2. préserver une marge transparente propre et supprimer tout halo chroma ;
3. vérifier la lisibilité à la taille réellement affichée ;
4. ne pas cuire un libellé ou une couleur d’équipe dans l’image.

### VFX

Les 18 WebP finaux sont les cellules sources de production de
`assets/textures/v5/vfx/spell_vfx_atlas.webp`. Le runtime ne charge que cet
atlas, une grille **5 × 4**,
dont les slots 0 à 17 sont utilisés. `src/render/assets.js` charge cet atlas et
`src/render/vfx.js` le rend par billboards additifs.

Toute reconstruction de l’atlas doit :

1. garder exactement l’ordre des slots documenté ci-dessus ;
2. conserver le fond noir pur et les effets entièrement contenus ;
3. ne pas occuper les deux dernières cellules de la grille sans mettre à jour
   explicitement le contrat runtime ;
4. contrôler les UV et l’absence de fuite entre cellules.

### Hors ligne

Le service worker ne précache que les finals réellement consommés par
l'interface et l'atlas VFX ; les 18 cellules individuelles restent des artefacts
de production. Une modification de nom ou de chemin implique une mise à jour
coordonnée du manifeste consolidé, du consommateur runtime et du cache hors
ligne.

## Contrôle avant livraison

- `asset-pack.json` doit contenir 62 IDs uniques.
- Les comptes doivent rester 18 / 8 / 18 / 18.
- Chaque chemin `source` et `final` doit exister.
- Les entrées VFX doivent couvrir une seule fois les slots 0 à 17.
- L’atlas runtime existe, mais son champ `counted` reste à `false`.
- Les quatre manifests de prompts doivent rester valides et cohérents avec le
  pack consolidé.
