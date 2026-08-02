# V6 menu — six bitmaps débranchés, conservés exprès

Six des huit fichiers de ce dossier **ne sont plus affichés, ni précachés, ni
distribués**. Ils sont exclus par `tools/release.py` (`EXCLUDED_FILES`).

| Fichier | État |
|---|---|
| `menu_hero_backdrop.webp` | débranché |
| `mode_combat_card.webp` | débranché |
| `mode_tour_card.webp` | débranché |
| `mode_versus_card.webp` | débranché |
| `mode_workshop_card.webp` | débranché |
| `versus_lobby_backdrop.webp` | débranché |
| `badge_player_one.webp` | **actif** — Mêlée locale, `index.html` |
| `badge_player_two.webp` | **actif** — Mêlée locale, `index.html` |

## Pourquoi ils restent là

Ils montrent des yoles qui **ne respectent pas**
[`YOLE_VISUAL_REFERENCE.md`](../../../../docs/YOLE_VISUAL_REFERENCE.md). Le menu
et l'atelier affichent désormais `YoleVisual` directement — le même modèle 3D
qu'en course, donc la même coque, les mêmes bwa, le même équipage.

On les garde pour trois raisons : tracer les huit sorties historiques du
manifeste V6, servir de comparaison avant/après, et documenter les erreurs à ne
pas refaire (coque large, gréement générique). Ce sont des **pièces d'audit**,
pas des assets en attente.

⚠️ Ne pas les rebrancher, et surtout **ne pas les ajouter au précache** :
`verify_static.py` fait échouer le build sur un fichier listé mais absent — et
l'inverse est tout aussi indésirable ici.

Toute future image contenant une yole passe d'abord par la validation en six
points de `YOLE_VISUAL_REFERENCE.md`.
