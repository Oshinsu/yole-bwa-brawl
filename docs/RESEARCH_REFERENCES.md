# Références techniques étudiées

Aucune bibliothèque ci-dessous n’est imposée dans la build V3.1. Elles ont servi à comparer les directions possibles.

- Three.js r185 — renderer WebGL/WebGPU et exemples officiels.
- `Alchemist0823/three.quarks` — particules batchées.
- `gkjohnson/three-mesh-bvh` — requêtes spatiales statiques.
- `dimforge/rapier.js` — rigid bodies WASM.
- `jrouwe/JoltPhysics.js` — binding Jolt et constraints.
- `pmndrs/postprocessing` — fusion de passes.
- `takram-design-engineering/three-geospatial` — atmosphère et nuages.
- `dgreenheck/three-pinata` — fracture Voronoï.

Décision V3.1 : implémenter directement les systèmes critiques légers, puis benchmarker une dépendance seulement si elle apporte un gain mesuré sur appareil cible.
