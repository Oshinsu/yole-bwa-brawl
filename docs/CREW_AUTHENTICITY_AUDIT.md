# Audit d'authenticité — équipage de yole ronde

Audit réalisé le 1er août 2026 à partir de sources patrimoniales, de
documentation technique officielle, de retours spécialisés et du GLB chargé
dans Blender 5.2 LTS.

## Sources de navigation

- [Dossier UNESCO de la yole de Martinique](https://ich.unesco.org/fr/BSP/la-yole-de-martinique-de-la-construction-aux-pratiques-de-navigation-un-modele-de-sauvegarde-du-patrimoine-01582)
- [Fiche d'inventaire du ministère de la Culture](https://www.culture.gouv.fr/fr/content/download/210085/file/La%20yole%20ronde%20de%20la%20Martinique.pdf)
- [Description spécialisée des postes de l'équipage](https://yoles-rondes.com/lequipage/)
- [Présentation du Tour par le Comité martiniquais du tourisme](https://www.martinique.org/fr/tout-savoir/culture/tour-de-martinique-des-yoles-rondes)

Les éléments suffisamment solides pour devenir des invariants de jeu sont :

1. les bwa sont des leviers mobiles et les dresseurs règlent continuellement
   leur distance selon la force du vent ;
2. le premier dresseur est placé à l'avant, observe les rafales et engage le
   changement de bord en premier ;
3. le dernier dresseur conserve l'ancien rappel et change en dernier ;
4. la barre, l'écoute, le rappel sur bwa et les cordes sont des fonctions
   distinctes, même si les équipiers restent polyvalents ;
5. une grande yole compte environ huit hommes à une voile et onze en moyenne à
   deux voiles ; six correspond surtout à une voilure ou un vent faibles ;
6. le patron gouverne avec une grande pagaie, puisque la yole n'a pas de
   gouvernail.

## Corrections appliquées

- inversion de la table des bwa : l'index 0 est désormais réellement à la
  proue (`z<0`) ;
- ajout du manœuvrier d'écoute et du patron, portant l'équipage visible à huit ;
- ajout de la grande pagaie et de l'écoute comme signatures lisibles ;
- conservation du déplacement proue → poupe et du dernier rappel ;
- contre-gîte en deux temps : mouvement visible des corps, puis reprise
  physique seulement après leur chargement effectif sur les bwa ;
- les huit personnes visibles tombent avec le même rig et les mêmes couleurs
  que l'équipage embarqué lors d'un chavirage ;
- maintien de six dresseurs dans la simulation pour ne pas casser le modèle de
  masse, les replays et le HUD ; les deux spécialistes sont une couche visuelle.

## Audit Blender du rig livré

Commande : `tools/audit_crew_blender.py`.

| Mesure | Résultat |
|---|---:|
| Blender | 5.2.0 LTS |
| Maillage principal | 2 996 sommets / 2 510 triangles |
| Armature | 24 os, tous déformants |
| Influences | 4 maximum par sommet |
| Sommets mal normalisés | 0 |
| Sommets non pondérés | 0 |
| Contraintes / pole targets | 0 |
| Animations utiles | 0 |
| Texture | 512 × 512 sRGB |

Le fichier est suffisamment propre pour rester le rig de production actuel.
Deux défauts ont été identifiés :

- une `Icosphere` de contrôle non skinnée, visible et indépendante de
  l'armature ; le chargeur la masque désormais.

  **Correction du 2 août 2026, après inspection en direct dans Blender.**
  Elle n'est pas indépendante de l'armature : c'est le **widget d'affichage**
  des os, référencé en `custom_shape` par les **vingt-quatre** os du rig. C'est
  ce qui donne à l'armature une boîte englobante de **15,7 × 15,4 × 15,2 m**
  pour un personnage de 1,67 m — de quoi égarer n'importe quel cadrage
  automatique, et c'est exactement ce qui est arrivé pendant l'inspection.

  Conséquence pratique : ce n'est pas un mesh oublié dans la scène mais un
  artefact d'atelier. Le masquage par nom au chargement reste correct, mais le
  vrai correctif est de vider les `custom_shape` **avant export** — le nœud
  disparaîtra alors du GLB au lieu d'être chargé puis caché ;
- un clip `Armature|clip0|baselayer` réduit à une pose sur une seule frame :
  ce n'est pas une animation exploitable.

## Audit technique temps réel

Références :

- [Three.js — SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html)
- [Three.js — AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)
- [Three.js — AnimationAction et crossfade](https://threejs.org/docs/pages/AnimationAction.html)
- [Exemple officiel Three.js d'IK](https://threejs.org/examples/webgl_animation_skinning_ik.html)
- [Blender — contrainte IK](https://docs.blender.org/manual/en/2.90/animation/constraints/tracking/ik_solver.html)
- [Blender — export d'animations glTF](https://docs.blender.org/manual/en/3.3/addons/import_export/scene_gltf2.html)
- [Retour spécialisé Three.js sur le coût des squelettes](https://discourse.threejs.org/t/optimization-of-large-amounts-100-1000-of-skinned-meshes-cpu-bottlenecks/58196)

Ce qui est bon :

- `SkeletonUtils.clone()` est bien utilisé pour chaque SkinnedMesh ;
- la pose de repos est composée avec la pose du jeu, elle n'est pas écrasée ;
- les chaînes de mains et pieds sont courtes ;
- aucune allocation temporaire n'est faite dans la boucle IK ;
- le rendu reste sans autorité sur la simulation.

Ce qui a été renforcé :

- angle maximal par correction et amplitude maximale autour de la pose courante
  pour éviter les coudes et genoux retournés ;
- culling des équipages adverses à 46 m en LQ et 92 m en MQ, car le coût CPU
  vient surtout des matrices d'os et pas seulement des triangles ;
- tests explicites sur les limites IK et les deux postes intérieurs.

## Angles morts restants

### Priorité haute

1. ~~**Pole targets véritables**~~ — **RÉSOLU le 2 août 2026, sans toucher au
   rig.** L'analyse demandait quatre contrôleurs de direction dans le prochain
   GLB. Mesure faite dans Blender 5.2 (`tools/inspect_crew_bend.py`) : inutile,
   l'information était déjà là. La pose de repos fléchit de **35° au coude et
   15° au genou**, ce qui écarte le milieu de **8,8 cm et 4,5 cm** de la corde
   racine→extrémité — largement de quoi définir un plan de flexion.

   Le pole se **dérive** donc du repos (`captureRestPoles`) et se réapplique
   après le CCD par une rotation autour de l'axe racine→extrémité — laquelle,
   par construction, ne déplace pas l'effecteur : le contact obtenu par le
   solveur est conservé. Trois avantages sur la solution demandée : aucun asset
   à réexporter, aucun os supplémentaire à charger pour 32 corps, et n'importe
   quel Mixamo standard fonctionne sans préparation.

   Garde-fou conservé : un membre **tendu** au repos ne porte aucun plan, la
   chaîne reste alors sans pole et seul le limiteur d'oscillation agit — inventer
   une direction à partir de bruit serait pire que ne rien faire.

   Couvert par `test/crew-pole-target.test.mjs` : capture, refus sur membre
   tendu, retour d'un coude retourné de 2,2 rad, et vérification que
   l'effecteur ne bouge pas de plus de 2 mm pendant la correction.
2. **Contacts prop/main** : la pagaie et l'écoute suivent une animation
   coordonnée, pas encore les matrices exactes des mains.
3. **Validation par pratiquants** : les sources écrites valident l'ordre et les
   fonctions, pas chaque angle de bassin. Une séance vidéo avec un maître
   yoleur reste la meilleure validation.
4. **Vent arrière** : un dresseur peut faire contrepoids du côté de la voilure ;
   ce cas n'est pas encore une pose dédiée.

### Priorité moyenne

5. **Bibliothèque Blender** : produire cinq actions courtes (`rappel_idle`,
   `charge`, `traversee`, `ecoute`, `barre`) puis les mélanger faiblement sous
   les contacts procéduraux.
6. **Variété corporelle** : la taille change, mais les 32 corps partagent le
   même mesh et la même silhouette.
7. **Ordres du patron** : regard et posture existent, mais aucun signal de bras
   ou appel collectif n'annonce le changement de bord.

### À ne pas surproduire maintenant

- doigts individuels ;
- animation faciale ;
- cloth simulation complète des maillots ;
- mocap générique de voile non spécifique aux bwa.

Ces éléments coûtent plus qu'ils ne se lisent avec la caméra actuelle. La
priorité de production reste le transfert de masse, les appuis, la pagaie,
l'écoute et la silhouette collective.
