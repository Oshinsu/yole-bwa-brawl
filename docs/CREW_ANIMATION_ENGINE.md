# Crew Animation V2

Le moteur d'équipage est une couche de présentation déterministe spécialisée
pour la yole ronde. Il ne modifie ni la physique, ni les collisions, ni le
checksum des replays. La simulation fournit la gîte, la distance de rappel, la
vitesse latérale et les délais individuels ; le rendu transforme ces données en
poses de squelette.

## Pipeline

```text
YoleDynamics
  -> crewPositions / crewVelocities / crewStartDelays
  -> phases de contre-gîte et transfert de bord
  -> rotations procédurales
  -> composition pose de repos × pose de jeu
  -> IK légère mains/pieds
  -> SkinnedMesh Three.js
```

Le rig de production est `assets/models/yole_crew.glb`. Chaque équipier reçoit
un clone indépendant via `SkeletonUtils.clone`, faute de quoi les 32
personnages partageraient la même pose.

## Contrat du squelette

Sept points sont obligatoires : bassin, buste, tête, bras et cuisses. Onze
points Mixamo sont optionnels : deux segments de colonne, cou, avant-bras,
mains, tibias et pieds. Les alias vivent dans `src/render/assets.js`.

Un rig incomplet sur le contrat minimal repasse entièrement sur le corps
procédural. Un rig sans les points optionnels conserve toutes les fonctions de
jeu, mais sans IK ni articulation secondaire.

## États visuels

- `pont`
- `anticipation`
- `sortie_bwa`
- `rappel`
- `prise_charge`
- `absorption`
- `changement_bord`
- `ecoute`
- `barre`

Le changement de bord est décalé de la proue vers la poupe. Le premier dresseur
engage le mouvement ; le dernier conserve l'ancien rappel jusqu'au dernier
temps. Pendant la traversée, les jambes alternent leurs appuis et une main
cherche le nouveau bord pendant que l'autre retient le corps.

## Couplage physique de la contre-gîte

La simulation sépare maintenant deux temps. L'action du joueur lance le
transfert sans annuler instantanément la chute ; une seconde reprise d'appui
n'agit que lorsque 56 % de la course de masse vers les bwa est atteinte. Son
intensité dépend de la précision. Ce délai garde une sensation lourde tout en
rendant le rattrapage réellement efficace. Cette modification autoritaire
porte `SIMULATION_VERSION` à `3.9.0`.

## Postes représentés

1. premier dresseur ;
2. corde ;
3. dresseur ;
4. écopeur ;
5. dresseur ;
6. dernier dresseur ;
7. manœuvrier d'écoute ;
8. patron à la grande pagaie.

Le premier dresseur surveille davantage le plan d'eau. L'écopeur revient vers
la coque lorsque la masse d'eau augmente. Le dernier dresseur possède une prise
de charge renforcée et le délai de transfert le plus long. Les deux postes
intérieurs utilisent des poses dédiées et ne modifient pas `activeCrew`, afin de
préserver la physique et les replays existants.

## IK légère

Quatre chaînes CCD courtes corrigent la pose après l'animation procédurale :

- main gauche : avant-bras + bras ;
- main droite : avant-bras + bras ;
- pied gauche : tibia + cuisse ;
- pied droit : tibia + cuisse.

En rappel, les mains et les pieds visent le bwa. Pendant la traversée, les pieds
visent deux points séparés du pont. La correction est limitée en vitesse et en
amplitude autour de la pose de la frame.

### Contrainte de pole, dérivée du repos

Un CCD cherche une position, pas une anatomie : rien ne l'empêche de plier un
coude à l'envers pour gagner deux centimètres. Depuis le 2 août 2026, chaque
chaîne porte un **pole target dérivé de la pose de repos du rig** — mesurée à
35° de flexion au coude et 15° au genou, soit 8,8 cm et 4,5 cm d'écart à la
corde racine→extrémité.

`captureRestPoles` enregistre la direction une fois, dans le repère du parent de
la racine de chaîne, si bien qu'elle suit l'épaule et la hanche sans recalcul.
`applyPoleTarget` la réapplique **après** le CCD, par une rotation autour de
l'axe racine→extrémité : l'effecteur étant sur cet axe, il ne bouge pas et le
contact obtenu par le solveur est conservé intact. C'est ce qui permet
d'enchaîner les deux sans que l'un défasse l'autre.

Un membre tendu au repos ne définit aucun plan : sa chaîne reste sans pole et
seul le limiteur d'oscillation agit, comme avant. Aucun rig n'est rejeté pour
autant, et le GLB n'a pas eu à changer.

`maxStep` (0,34 rad au bras) borne la correction par passe ; elle est inférieure
à `maxSwing`, donc une seule frame ne peut pas saturer le budget anatomique.

## Tests

`npm run test:crew` couvre :

- l'alignement équipier/bwa ;
- l'assise du bassin ;
- la portée et le débord des bois ;
- la séquence des rôles ;
- les onze articulations optionnelles ;
- les quatre chaînes IK ;
- les limites anatomiques de l'IK ;
- les états `prise_charge`, `changement_bord`, `ecoute` et `barre` ;
- l'alternance des jambes pendant la traversée.

`npm run test:boost` vérifie en plus que la contre-gîte n'apporte aucun gain
immédiat, puis réduit suffisamment la gîte après la prise de charge.

Le pool d'hommes à la mer instancie lui aussi `yole_crew.glb`. Une élimination
projette les six dresseurs, le manœuvrier d'écoute et le patron avec leurs
couleurs d'équipe ; le test refuse tout retour silencieux au mannequin
procédural lorsque le rig est disponible.

L'audit du fichier source se lance dans Blender 5.2 sans modifier le GLB :

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  --background --factory-startup `
  --python tools/audit_crew_blender.py -- assets/models/yole_crew.glb
```

## Actions courtes mélangées sous le procédural

Depuis le 2 août 2026, une bibliothèque d'actions peut tirer **faiblement** la
pose de repos vers un clip, sans jamais toucher à la pose de jeu :

```text
repos --(mélange ≤ 0,35)--> pose de clip --(× procédural)--> IK
```

La règle « le jeu pilote le squelette, il ne joue pas d'animation » n'est donc
pas levée : le clip n'apporte pas la pose, il apporte la **texture humaine**
(micro-transferts de poids, respiration, reprise d'appui). Gîte, distance de
rappel et position sur le bwa restent entièrement calculées.

Le plafond de 0,35 vit dans `setClipBlend()` et non chez l'appelant, pour
qu'aucun site d'appel ne puisse le contourner. À poids nul, `syncRig()` calcule
exactement ce qu'il calculait avant — vérifié composante par composante.

### Respiration par défaut, active depuis le 2 août 2026

Aucune des cinq actions n'existe encore, mais la couche n'est plus dormante :
`makeDefaultIdleClip()` fabrique une respiration **en code**, sans asset ni
droits. Elle est appliquée à **0,16** de poids, déphasée par équipier via
`this.phase`, et s'efface sous impact, trébuchement et traversée. Mesurée dans
le jeu : **0,016° à 0,272°** d'amplitude. Elle disparaît d'elle-même dès qu'un
GLB apporte une action du même nom.

### ⚠️ Deux sémantiques de clip, à ne pas confondre

| Origine | Sémantique | Composition |
|---|---|---|
| clip glTF (GLB) | rotation **absolue** du nœud (spec) | remplace le repos |
| clip fabriqué en code | **offset** | composé avec le repos |

Le drapeau `relative` porte la distinction, et le consommateur **doit** le lire.
Les confondre faisait slerper le repos vers l'identité : l'os `LeftArm` ayant un
repos à 81° de l'identité, un offset de 0,9° mélangé à 0,16 déplaçait l'os de
**~13° au lieu de 0,15°**.

**Les cinq vraies actions n'existent toujours pas** : leur production est
conditionnée au volet droits. Contrat, pipeline, voie sans vidéo et démarche
auprès de la CMT dans [`CREW_CLIP_LIBRARY.md`](CREW_CLIP_LIBRARY.md).

## ⚠️ Défaut ouvert — les jambes pendantes et la grappe étalée

État au 2 août 2026, après deux correctifs géométriques (assise, repère de
prise). Mesures reproductibles :

```bash
PORT=8791 python tools/serve.py &
python tools/capture_crew_pose.py     # previews/equipage/*.png
```

| Mesure | Rendu | Photos |
|---|---|---|
| buste ↔ horizontale | **17,5° à 25,8°** | 10-20° ✅ |
| **jambes ↔ horizontale** | **77,5° à 82,9°** | ~20° ❌ |
| main ↔ axe du bwa | **0,113 m** (moy.) | ~0,058 (contact) |
| étalement des six hommes | ~1,9 m, régulier | grappe compacte |

L'homme forme un **« L »** : buste correctement couché, jambes pendantes à la
verticale. Et les six sont espacés régulièrement là où les photos montrent des
épaules qui se touchent.

### ⚠️ Deux pièges de mesure, tous deux payés

1. **Ne pas mesurer l'axe du corps par `Hips → Head`.** `head.rotation.x`
   contre-tourne de `0,62 × recline` : le segment sous-estime le renversement
   des deux tiers. C'est ce qui avait fait conclure à tort « corps penché à
   35° » et fait chercher au mauvais endroit. Mesurer `Hips → Spine02`.
2. **Une vue de dessus n'est pas une preuve d'interpénétration.** Un bwa situé
   40 cm plus bas *paraît* traverser un corps. Vérifier par une distance
   segment-à-segment avant de conclure.

### L'ordre compte

Redresser les jambes AVANT d'établir le contact empire le rendu — c'est ce
qu'a montré la passe 69, annulée. Une planche **flottante** lit comme un noyé ;
un « L » flottant lit comme un accroupi. Terminer les mains et les pieds sur le
bois d'abord, les jambes ensuite.

## Limites assumées

Le moteur n'utilise toujours pas `AnimationMixer` : le mélange se fait par
échantillonnage direct des pistes de rotation, sans état par équipier ni
allocation par frame.
Il ne simule pas les doigts, les collisions entre corps ou les ordres vocaux du
patron. Le cordage d'écoute et la grande pagaie sont aujourd'hui des props
procéduraux : leurs contacts main/objet restent à finir avec des bones ou
marqueurs dédiés dans un futur rig de production.
