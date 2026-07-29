# Suite de production après Tropical Mayhem V3.2

Tropical Mayhem V3.2 valide le moteur de jeu et la Combat Box. Les prochains investissements doivent porter sur la qualité perçue et la validation marché, pas sur l’ajout aveugle de bibliothèques.

## P0 — appareils réels

- profiler Android milieu de gamme et iPhone ;
- mesurer temps CPU/GPU, mémoire, chauffe et batterie ;
- construire une matrice LQ/MQ/HQ ;
- vérifier les shaders sur Adreno, Mali et Apple GPU ;
- mesurer le coût du wake 192² et des 16 points × 4 yoles ;
- enregistrer les frame-time spikes, pas seulement le FPS moyen.

## P1 — contenu produit

- remplacer les yoles procédurales par GLB corrigés ;
- créer LOD, collision proxies, atlases KTX2 et compression meshopt ;
- utiliser un vrai rig partagé pour les équipiers ;
- produire huit animations prioritaires ;
- intégrer une voile à bones ou vertex deformation plus raffinée ;
- créer une arène martiniquaise identifiable ;
- produire sound design, musique et voix.

## P2 — polish gameplay

- essais avec joueurs à quatre ;
- ajuster durée, score et Mur du Grain ;
- tester le ratio 70 % physique / 30 % armes ;
- améliorer les contres du Harpon ;
- rendre l’eau embarquée encore plus lisible ;
- comparer Bwa Brawl à une course sans armes ;
- détecter automatiquement le meilleur clip de chaque match.

## P3 — réseau asynchrone

- signer les replays ;
- ajouter snapshots de correction ;
- reproduire les ghosts côté serveur ;
- classements ;
- défis partageables ;
- validation anti-triche par checksum et enveloppe de simulation.

## P4 — mobile natif

- encapsulation Capacitor ou port moteur natif selon les profils ;
- haptique native ;
- partage vidéo ;
- deep links ;
- crash reporting ;
- stores internes.

## Bibliothèques à benchmarker, pas à empiler

- `three-mesh-bvh` si les décors deviennent des meshes complexes ;
- Rapier pour collisions/ragdolls si le custom devient insuffisant ;
- JoltPhysics.js si les contraintes avancées justifient son coût mémoire ;
- `three.quarks` si l’éditeur VFX et le batching compensent son bundle ;
- WebGPURenderer/TSL pour un mode premium, sans retirer WebGL2.

Le build actuel possède déjà des solutions légères pour ces fonctions. Toute dépendance devra battre le système existant sur un benchmark reproductible avant adoption.
