# Bibliothèque d'actions d'équipage — pipeline et droits

Couche ajoutée le 2 août 2026. Elle répond au point « priorité moyenne n°5 » de
[`CREW_AUTHENTICITY_AUDIT.md`](CREW_AUTHENTICITY_AUDIT.md) :

> « produire cinq actions courtes (`rappel_idle`, `charge`, `traversee`,
> `ecoute`, `barre`) puis les **mélanger faiblement sous** les contacts
> procéduraux. »

Le code est en place et testé. **Les clips, eux, n'existent pas encore** — et
c'est volontaire : leur provenance est une question de droits avant d'être une
question technique.

## Ce que la couche fait, et ce qu'elle ne fera jamais

La règle d'architecture ne bouge pas d'un pouce :

> Le jeu pilote le squelette, il ne joue pas d'animation.

Un clip ne remplace **pas** la pose de jeu. Il déplace la pose de **repos**
au-dessus de laquelle la simulation continue de tout piloter :

```text
repos  --(mélange faible)-->  pose de clip  --(× procédural)-->  IK  -->  os
```

À poids nul, `syncRig()` calcule exactement ce qu'il calculait avant l'existence
de cette couche — vérifié composante par composante par `test/crew-clips.test.mjs`.

**Le plafond est de 0,35**, et il vit dans `setClipBlend()`, pas chez l'appelant :
aucun site d'appel ne peut le contourner. Au-delà, l'équipage se mettrait à
suivre le clip plutôt que la mer, ce qui est précisément le défaut que
l'architecture interdit.

### Pourquoi si peu

Parce que le clip n'apporte pas la pose — il apporte la **texture humaine**. Un
corps réel n'est jamais parfaitement immobile : micro-transferts de poids,
respiration, reprise d'appui. C'est invisible dans une simulation, et ça se voit
immédiatement quand ça manque. La gîte, la distance de rappel et la position sur
le bwa restent, elles, entièrement calculées.

## Contrat des clips

| Règle | Raison |
|---|---|
| **Rotations seulement** | Position et échelle déplaceraient le corps hors du bwa. C'est la simulation qui décide où le corps se trouve. |
| **≥ 2 clés, durée > 0** | Un clip d'une seule frame est une pose, pas une animation. Le GLB actuel en porte un (`Armature\|clip0\|baselayer`) : il est **refusé** explicitement. |
| **Les clips bouclent** | Un rappel n'a pas de fin. |
| **Action partielle acceptée** | Un os que le clip n'anime pas garde son repos, au lieu de figer le reste du corps. |
| **Nom** | `rappel_idle`, `charge`, `traversee`, `ecoute`, `barre`. Un export bavard type `Armature\|rappel_idle\|baselayer` est réduit automatiquement. |

Les noms d'os suivent l'assainissement de `GLTFLoader` — un `arm.L` de Blender
arrive en `armL`. La normalisation est appliquée des deux côtés, donc un Mixamo
standard fonctionne sans renommage.

## ⭐ Voie recommandée : cinq poses, aucune vidéo

**C'est le chemin le plus court, et pour cette architecture c'est aussi le
meilleur.** Aucune captation, aucun droit à l'image, aucun matériel.

Le raisonnement tient en trois points :

1. Les cinq « actions » sont en réalité cinq **états**, et la simulation pilote
   déjà les transitions entre eux.
2. Le plafond de mélange est à **0,35** : le clip n'apporte pas la pose, il
   apporte la **vie**.
3. Donc ce qu'il faut par état, ce n'est pas une captation — c'est **une pose
   juste plus un souffle**.

Or une pose juste, c'est exactement ce qu'une photo donne. Et l'audit dit que le
trou restant est « pas chaque angle de bassin » : une photo, c'est l'angle de
bassin.

### Recette

1. Ouvrir `assets/models/yole_crew.glb` dans Blender, à côté d'une photo de
   référence (celles du propriétaire, aux droits vérifiés).
2. Poser le rig en mode Pose, à la main, jusqu'à ce que la silhouette
   corresponde. Compter ~20 min par pose.
3. Exporter les rotations d'os de la pose.
4. Les passer à `breatheKeyframes()`, puis à `CrewClipLibrary.fromKeyframes()` :

```js
const cles = breatheKeyframes(poseRappel, {
  Spine:   { axis: [1, 0, 0], angle: 0.03 },   // respiration
  LeftArm: { axis: [0, 0, 1], angle: 0.02 }    // report de poids
}, 3.4);
const clip = CrewClipLibrary.fromKeyframes("rappel_idle", cles);
```

Les amplitudes sont **minuscules à dessein** : 0,03 rad × 0,35 de mélange arrive
à l'écran comme un demi-degré. C'est l'échelle du vivant, pas du geste. Une pose
immobile se lit instantanément comme un mannequin ; trois clés suffisent à
retirer cette lecture.

⚠️ La boucle doit se **refermer exactement** (repos → inspiration → repos),
sinon un saut apparaît à chaque cycle et c'est pire que l'immobilité. C'est ce
que garantit `breatheKeyframes`, et c'est testé.

### Et le texte, alors ?

**Kimodo** (NVIDIA, mars 2026) fait texte → mouvement, en open source, entraîné
sur 700 h de mocap **sous licence commercialement exploitable** — le volet
droits disparaît. C'est une option réelle pour du mouvement générique.

Mais « un homme en rappel sur une perche au-dessus de l'eau » n'est pas dans
700 heures de mocap standard. Ça donnera de l'humain plausible, pas un yoleur.
À garder pour la texture de fond si les poses manquent, pas comme source
principale.

## Si vous voulez quand même filmer — le volet droits, à traiter EN PREMIER

Un accord de principe avec le **Comité Martiniquais du Tourisme** existe pour le
jeu (août 2026). Il ouvre la porte ; il ne suffit pas à lui seul pour de la
captation vidéo. Trois droits distincts se superposent, et ils n'appartiennent
pas au même titulaire :

| Droit | Titulaire | Ce qu'il faut |
|---|---|---|
| Droit d'auteur sur la vidéo | le réalisateur / producteur | cession écrite, ou vidéo dont la CMT détient les droits pleins |
| **Droit à l'image** des yoleurs filmés | **chaque personne**, individuellement | autorisation signée par personne identifiable |
| Marques, sponsors, noms d'équipes | clubs et sponsors | à écarter au cadrage plutôt qu'à négocier |

⚠️ Le troisième point est déjà un interdit du projet :
[`YOLE_VISUAL_REFERENCE.md`](YOLE_VISUAL_REFERENCE.md) proscrit « sponsor ou logo
réel inventé, déformé ou reproduit sans autorisation ».

### Ce qu'il faut demander à la CMT — et c'est aussi la meilleure option technique

**Une séance de captation organisée**, plutôt que des archives.

Un yoleur qui rejoue les cinq postures — au ponton, ou même à terre sur une
perche posée entre deux tréteaux — filmé par vous, avec une autorisation signée.
Ce n'est pas un pis-aller : c'est **techniquement supérieur**.

La capture de mouvement monoculaire est entraînée sur des sujets debout, seuls,
nets et dans le cadre. Une archive de course donne l'inverse : six corps
enchevêtrés, à l'horizontale au-dessus de l'eau, filmés depuis un bateau qui
bouge, à contre-jour. Les modèles rendent de la bouillie sur ce matériau.

**Le chemin propre est le chemin qui marche.** C'est rare, il faut en profiter.

Bonus décisif : un maître yoleur présent sur la séance ferme le dernier angle
mort de l'audit — « validation par pratiquants : les sources écrites valident
l'ordre et les fonctions, pas chaque angle de bassin ».

### Outils de capture (état au 2 août 2026)

- **MoCapAnything** (CVPR 2026) — SOTA monoculaire pour squelettes arbitraires,
  IK sous contraintes.
- **QuickMagic** — export FBX/BVH, retarget Blender documenté.
- **Cascadeur** — nettoyage (AutoPosing, AutoPhysics) après extraction.
- Plugins Blender temps réel (CYANPUPPETS, DiMocap) — modèle 1 milliard de
  paramètres, 4 à 8 Go de VRAM.

Quel que soit l'outil, la sortie repasse par le **contrat ci-dessus** avant
d'entrer dans `assets/models/yole_crew.glb`.

## Ce qui reste à faire

1. Obtenir le cadre écrit auprès de la CMT (voir tableau des droits).
2. Organiser la séance et les autorisations individuelles.
3. Capturer, nettoyer, retargeter sur le rig existant.
4. Exporter les cinq actions **dans le GLB d'équipage**, en vidant au passage les
   `custom_shape` des os — ils traînent l'`Icosphère` de 2 m dans l'asset livré
   (voir [`CREW_AUTHENTICITY_AUDIT.md`](CREW_AUTHENTICITY_AUDIT.md)).
5. Brancher `setClipBlend()` sur les états visuels existants (`rappel`,
   `prise_charge`, `changement_bord`, `ecoute`, `barre`) — le seul travail de
   code restant, et il est trivial une fois les clips là.
