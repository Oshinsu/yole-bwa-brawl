# Vertical slice DA — Gravure Alizé

Ce prototype est volontairement isolé du parcours normal.

- Version témoin : `/?autoplay=1`
- Prototype : `/?autoplay=1&da=gravure`

Le paramètre ne modifie ni la simulation, ni la physique, ni les collisions, ni
les replays. Il active seulement :

1. des veines d'eau orientées par le vent et une écume découpée ;
2. cinq bandes de valeurs après tone mapping ;
3. un encrage sélectif des grandes silhouettes ;
4. des matériaux plus mats sur la yole ;
5. un contour de coque stable, sans post-processer chaque vague ;
6. un panorama original de mornes martiniquais ;
7. un ciel caraïbe bleu clair, avec soleil lisible et cumulus blancs ;
8. une peau HUD temporaire signalée comme prototype.

## Asset pilote

`assets/textures/experiments/gravure_alize_backdrop.webp`

Le bitmap a été généré avec l'outil ImageGen intégré, puis détouré localement
depuis un fond chroma `#ff00ff`, recadré et livré en WebP RGBA 2048 × 512.

### Prompt final

> Create an original distant Martinique volcanic coastline seen from the sea,
> designed for the visual direction “Gravure Alizé”. Contemporary Caribbean
> sports-poster print, linocut and sun-faded screenprint qualities, large
> deliberate shapes, selective carved hatching only inside shadow planes,
> crisp authored silhouette. Extremely wide panorama; one continuous opaque
> mountain band connected to the bottom edge; irregular concave ridgelines,
> offset volcanic shoulders and very small palm silhouettes. Deep indigo,
> volcanic green, muted turquoise, warm basalt and small ivory sunlit planes,
> maximum six subject colors. Perfectly flat `#ff00ff` chroma background outside
> the subject. No boats, yoles, people, buildings, sponsors, logos, text,
> watermark, madras, tiki, pirate imagery, photorealism, futuristic elements,
> generic conical islands or uniform comic-book outlines.

La capture de validation WebGL mise à jour est
`assets/screenshots/gravure-alize-caribbean-sky.jpg`.

## Critères de décision

Le test est concluant si la mer paraît dessinée par le vent, si les yoles restent
plus lisibles que l'eau et si la silhouette martiniquaise demeure identifiable
sur mobile. Une validation ne signifie pas que les textures V5/V8 actuelles sont
déjà finales : elle autorise seulement la production des 18 assets maîtres
définis dans l'audit.
