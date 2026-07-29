# Décisions concernant les repos externes

## Principe

Tropical Mayhem V3.2 reste volontairement léger : **Three.js est la seule dépendance runtime obligatoire**. Les fonctions essentielles ont été écrites dans le projet afin de conserver :

- le déterminisme ;
- une seule source d’autorité physique ;
- un bundle contrôlable ;
- une compatibilité WebGL2 large ;
- des tests sans GPU ;
- une migration possible vers Unreal ou Unity.

## `three.quarks` 0.17.1

Repo : `Alchemist0823/three.quarks`  
Décision : **non embarqué dans cette release**.

Points forts : système de particules généraliste, batching, trails, subemitters et sérialisation. Le système actuel utilise déjà des pools et des tableaux typés ; l’adoption de Quarks devra démontrer un gain sur :

- draw calls ;
- frame-time p95 ;
- allocations ;
- taille gzip ;
- temps de chargement mobile.

## `postprocessing` 6.39.2

Repo : `pmndrs/postprocessing`  
Compatibilité déclarée : Three.js `>=0.168 <0.186`, donc compatible avec r185.  
Décision : **non embarqué**.

Tropical Mayhem réalise actuellement impact, vitesse, gouttes, dommages, vignette et bloom sélectif dans une seule passe. La bibliothèque devient pertinente si plusieurs effets temporels ou un pipeline éditable sont ajoutés.

## `three-mesh-bvh` 0.9.13

Repo : `gkjohnson/three-mesh-bvh`  
Décision : **candidat prioritaire lorsque les décors GLB remplaceront les îles procédurales**.

Le monde actuel repose sur des SDF elliptiques et des chunks instanciés. Un BVH n’apporterait pas encore assez de valeur. Il deviendra utile pour :

- raycasts caméra contre des falaises complexes ;
- collisions statiques de récifs GLB ;
- requêtes de proximité ;
- projectiles contre décor détaillé.

## Rapier et JoltPhysics.js

Décision : **pas de moteur rigid-body comme autorité de la yole**.

La simulation maison conserve :

- flottabilité ;
- voile ;
- masses d’équipiers ;
- eau embarquée ;
- wake ;
- checksum.

Un spike comparatif reste justifié pour les débris, ragdolls et contraintes très avancées. L’adoption exige un benchmark à scénario identique contre les capsules, la corde Verlet et le spatial hash actuels.

## Atmosphère et WebGPU

Les travaux TAKRAM et les exemples WebGPU/TSL Three.js restent des références premium. Ils ne doivent jamais retirer le fallback WebGL2 ni modifier le gameplay. Le prochain mode WebGPU pourra améliorer :

- spray compute ;
- écume persistante plus dense ;
- champs de sillage ;
- nuages volumétriques ;
- culling et particules.

## Condition d’adoption d’une dépendance

Une bibliothèque entre dans le runtime uniquement si elle bat l’implémentation actuelle sur une matrice reproductible :

```text
qualité perçue
+ frame-time p95
+ mémoire
+ taille du bundle
+ stabilité mobile
+ maintenance
+ compatibilité r185
+ déterminisme
```
