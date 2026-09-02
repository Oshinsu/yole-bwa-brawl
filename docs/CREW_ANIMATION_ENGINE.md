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

> ⚠️ **Section partiellement dépassée depuis le 4 août 2026.** Le plafond de
> 0,35 décrit ci-dessous ne vaut plus que pour le CLIP de respiration. Les cinq
> poses macro existent désormais et passent par un chemin distinct, à autorité
> bien plus haute — voir [« Trois couches »](#trois-couches-assise--station--traversée)
> plus bas. Le reste de cette section reste exact.

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

Contrat, pipeline et voie sans vidéo dans
[`CREW_CLIP_LIBRARY.md`](CREW_CLIP_LIBRARY.md).

### ⚠️ Une piste glTF n'a pas toujours quatre flottants par clé

Corrigé le 4 août 2026, après avoir été livré. En **CUBICSPLINE**, la spec range
TROIS quaternions par clé — tangente entrante, valeur, tangente sortante — et
`GLTFLoader` laisse ce tampon brut dans `track.values` : il ne remplace que la
fabrique d'interpolant. `CrewClipLibrary.sample()` indexait `values[k * 4]` et
ramenait donc une **tangente**, qui vaut (0, 0, 0, 0) sur une pose Blender.

Ce n'était pas bénin. Aux bornes de la boucle, l'os recevait ce quaternion nul ;
`Quaternion.slerp` le propage **sans renormaliser**, et `Matrix4.compose` lit
une norme *n* comme une **échelle** de *n*². Mesuré sur le GLB alors livré :
jusqu'à **0,66 d'écart à la norme**, soit des corps entre 0,11× et 2,7× de leur
taille, en boucle et à contretemps d'un homme à l'autre.

`crew-clips.js` déduit désormais le pas du tampon. L'export est repassé en
LINEAR par-dessus, mais la lecture reste verrouillée par un test dédié dans
`test/crew-clips.test.mjs` : un futur export en CUBICSPLINE doit faire tomber ce
test, pas la silhouette en jeu.

## Trois couches : assise → station → traversée

Depuis le 4 août 2026, la pose macro ne passe plus par le plafond de clip :

```text
repos --(assise 0,74)--> --(station 0,82 × déploiement)--> --(traversée)--> × procédural --> IK
```

**Pourquoi l'assise a dû exister.** Le poids de station valait
`0,78 × déploiement`, donc **zéro** tant que la yole ne gîtait pas : plus aucune
pose macro, et le rig retombait sur son bind brut. C'est ce bind que montrait
tout le départ, depuis que l'équipage reste à bord tant qu'il n'y a pas de gîte.

Faire simplement basculer l'action vers `pont_interieur` sous un seuil aurait
produit un saut : les poses macro sont distantes de 9 à 25° (mesuré sur le GLB
livré). Il faut donc les deux en même temps et un fondu entre elles — d'où une
couche de plus, l'emplacement de traversée restant pris par la compression
pendant les changements de bord.

Conséquence à connaître : `absoluteAuthority` monte à 0,74 en permanence, donc
`syncRig()` ne laisse plus que **41 %** de son amplitude au procédural. Les
constantes procédurales (`CREW_HIKE_RECLINE`, `CREW_LEG_HOOK`…) ont perdu la
moitié de leur effet ; la posture se règle désormais surtout dans les seeds de
`tools/build_crew_asset.py`.

### La silhouette est un continuum piloté par la gîte

Les deux postures des photos de course ne sont pas deux options : ce sont deux
points de la même courbe. Assis à califourchon buste vers la coque quand ça
tient, renversés tête sous les hanches pour contrer. Mesuré le 4 août 2026 avec
`tools/mesure_silhouette_equipage.mjs` (bascule du buste, 0° = debout,
90° = horizontal) :

| gîte | court ×2 | intermédiaire ×2 | extension ×1 |
|---|---|---|---|
| 0° | 28° | 28° | 29° |
| 6° | 30° | 33° | 29° |
| 8° | 32° | 43° | 34° |
| 12° | 32° | 46° | **61°** |

L'échelonnement n'est pas cosmétique : les ancrages se lèvent les premiers,
l'homme du bout ne s'engage qu'à 10°. C'est ce qui produit la grappe des photos
au lieu de six silhouettes identiques.

### ⚠️ Le yoleur porte le levier PAR LE DOS

Corrigé le 4 août 2026, après **trois lectures successives des mêmes photos dont
deux fausses**. Une passe a conclu au ventral et livré des hommes couchés à plat
ventre sur le bwa, regard mesuré à **−1,00** — plein sur l'eau. Aucun seuil n'a
bronché, parce que toutes les mesures de silhouette étaient **aveugles au roulis
du bassin** : ventre et dos donnent le même tronc, la même tête, le même genou.

Le balayage, dans le repère de la yole :

| `Hips` | corps | tête ↔ hanches | regard | lecture |
|---|---|---|---|---|
| 140° | dehors | −0,40 m | −0,67 | ventre à la mer |
| 110° | dehors | −0,11 m | −0,23 | de profil |
| **70°** | dehors | +0,31 m | **+0,42** | **dos à la mer** |
| 40° | dehors | +0,54 m | +0,80 | dos à la mer, assis |

Aucune valeur ne donne à la fois « dos à la mer » et « tête sous les hanches » :
au-delà de ~110° le bassin ne penche plus, il **roule** l'homme sur le ventre.
L'échelle est donc plafonnée à 70°, près de ses valeurs d'origine.

`regardDorsalMin` verrouille désormais ce critère dans
`tools/mesure_silhouette_equipage.mjs`. Et ce n'est pas une photo qui a tranché,
mais un praticien : aucune vue de trois quarts ne permet de décider — il faut un
profil, ou quelqu'un qui pratique.

## ✅ Défaut fermé le 4 août 2026 — les jambes pendantes

> ⚠️ **Dépassé le 2 septembre 2026.** Cette section a fermé le « L » en
> REPLIANT les genoux (88° puis 120°) et en crochetant les talons sur le
> bois. Les photos de course fournies par le propriétaire montrent l'inverse :
> genoux TENDUS. Voir « Passe 79 — les jambes » en fin de document.

Le « L » décrit ci-dessous est corrigé. Le genou ne pliait que de **19°** au
rappel plein : le seed de station le laissait quasi tendu, et le procédural qui
devait le replier n'arrive plus qu'à 41 % depuis l'ajout de l'assise. Les seeds
`LeftLeg`/`RightLeg` sont passés de −25/−40 à −95/−115, et `Hips` de 80 à 140 en
extension.

Mesuré après correction, dans le jeu, au rappel plein :

| Mesure | Avant | Après | Référence |
|---|---|---|---|
| flexion du genou | 19° | **88°** | franche ✅ |
| bascule du buste (0 = debout) | 19° | **58°** | levier dorsal ✅ |
| orientation du regard | −1,00 | **+0,44** | dos à la mer ✅ |
| bras en croix | 85,4° | **19°** | — ✅ |
| envergure des mains | 1,56 m | **0,81 m** | — ✅ |

Vérification en une commande, sans navigateur ni capture :

```bash
node tools/mesure_silhouette_equipage.mjs
```

L'outil recharge le GLB livré, rebâtit le squelette avec le vrai Three.js,
instancie le vrai `CrewVisual` et lit les os après composition complète. Il est
branché dans `npm run test:crew` en mode `--strict`.

### ⚠️ Trois jauges d'écartement de bras ont été essayées, deux mentaient

1. **Angle depuis la verticale du monde.** Un yoleur au rappel est renversé :
   la jauge dépasse 90° pour des bras collés au corps. Elle annonçait 97° sur
   une silhouette juste, et a failli faire corriger une pose correcte.
2. **Angle depuis l'axe du tronc.** Corrigé pour l'orientation, mais incapable
   de séparer les deux choses qui comptent : sur un corps horizontal, des bras
   qui **pendent** font ~90° par rapport au tronc, exactement comme des bras
   **en croix**.
3. **Projection sur l'axe transverse du corps** (épaule gauche → épaule droite).
   La seule qui tienne : un bras en croix y est aligné, un bras qui pend lui est
   perpendiculaire, et ça reste vrai la tête en bas.

Le seuil est calibré sur le défaut lui-même : **85,4°** mesuré sur le GLB et le
code d'origine, plafond à 45°, **19°** aujourd'hui.

---

## Passe du 6 août 2026 — repos crédible, équipage varié, ordre du patron

> Le journal détaillé — méthode avant/après par worktree, doutes, et pistes
> classées — vit dans [`CREW_ANIMATION_JOURNAL.md`](CREW_ANIMATION_JOURNAL.md).

Référentiel utilisé : photos CC BY-SA 4.0 de Wikimedia Commons (Tour des yoles
2019, GFA Caraïbes, courses de Sainte-Luce — copies de travail dans
`tmp/references/`, hors paquet), plus les fiches déjà citées par l'audit. Ce que
ces photos montrent, et qui manquait :

1. **Sans gîte, on est perché sur le plat-bord, pas à genoux sur le pont.**
   Le seed `pont_interieur` laissait les cuisses à 25° et les jambes à −95° :
   une rangée d'hommes à genoux, lecture « pirogue à rameurs ». Recalé à
   cuisses 62-66° (vers l'horizontale), jambes −100/−104°, avant-bras −56/−62°
   posés sur les cuisses. Mesuré avant/après (harnais silhouette, production) :

   | Mesure au départ | Avant | Après | Seuil |
   |---|---|---|---|
   | bras en croix | 32,5° | 34,3° | < 45° ✅ |
   | envergure des mains | 0,91 m | 0,93 m | < 1,20 m ✅ |
   | buste (0 = debout) | 16° | 16° | — |
   | flexion du genou | 56° | 54° | — |

   ⚠️ Contre-intuition payée : resserrer l'écart Z des bras (25° → 9°) faisait
   MONTER la jauge d'abduction à 43° — avec les avant-bras repliés sur les
   cuisses, un bras étroit projette le coude sur l'axe des épaules. L'écart
   d'origine est revenu, la jauge est retombée à 34°.
2. **Au repos, six hommes ne font pas le même geste.** Chaque dresseur reçoit
   une orientation de racine, une inclinaison de buste, une asymétrie de bras
   et un regard dérivés de `this.phase` — fixe par homme, donc rejouable à
   l'identique, et nul dès que `hike` monte : au rappel, tout le monde
   travaille. Couvre la partie pose de l'angle mort n°6 de l'audit.
3. **Le virement se commande.** Le patron lève le bras gauche au début du
   changement de bord (la droite tient la pagaie) et le rabat pendant que les
   dresseurs traversent. Le geste est calé sur `sideChangeElapsed` — servi au
   patron via `shiftMotion.bordElapsed`, qui valait 99 en permanence pour les
   spécialistes — et non sur la gîte : un coup de tabac ne le fait pas
   gesticuler. Angle mort n°7 de l'audit, refermé.

Ces trois points sont purement visuels : `dynamics`, les checksums de replay et
`SIMULATION_VERSION` ne bougent pas (vérifié : `test:sim`, `test:replay`,
`test:boost`, `test:crew` verts).

**Compléments du soir.** Deux ajouts et une découverte :

- le harnais silhouette verrouille désormais le **contact bassin ↔ bois**
  (`contactBois`, ±2 cm, spécialistes exclus) — le verrou qui manquait depuis
  le bug d'assise flottante du 2 août ;
- chaque dresseur **guette le patron** dans la demi-seconde qui précède son
  tour de traversée (`bordElapsed`/`bordDelai` servis à tous, plus seulement
  au patron), le premier dresseur exempté puisqu'il engage ;
- ⚠️ le verrou a d'abord tiré +21 cm partout : **le harnais mesurait un
  transitoire** — le déport latéral est lissé et les huit instants du balayage
  ne le convergent pas. Un échauffement de 60 frames précède désormais la
  mesure. Les tables antérieures au 6 août au soir (genou 88°, buste 54°…) sont
  donc des états de transition ; convergé, le rappel installé lit buste 64°,
  genou 120°, regard +0,49 — plus couché, plus croché, plus proche des photos.
  Détails dans [`CREW_ANIMATION_JOURNAL.md`](CREW_ANIMATION_JOURNAL.md).

Le harnais historique (`tools/capture_crew_pose.py`) ne couvre que la gîte
franche. `tools/capture_repos_patron.py` le complète : repos vue de jeu,
trois-quarts, profil côté équipage (l'angle des photos de référence) et ordre
du patron à 0,4 s de virement. C'est lui qui produit les `repos_*.png` et
`ordre_patron.png` de `previews/equipage/`.

## Passe du 6 août (soir, bis) — le décrochage au chavirage

Remonté par le propriétaire sur capture de jeu réel : à 67 % de hors course,
bateau presque sur le côté, **l'équipage restait assis en rang sur les bwa
dressés** — une posture que la gravité interdit. Reproduit au harnais
(`tools/capture_chavirage.py`, 49° et 63°) : six hommes posés sur des perches
quasi verticales.

La physique du moment, et ce que le jeu fait maintenant : la plage de travail
d'un rappel s'arrête vers 30-35° de gîte ; au-delà, la perche se dresse et
l'homme **glisse le long du bwa vers la coque**, se recroqueville et s'accroche.
`decrochage = (|rollSlow| − 0,68) / 0,37` pilote deux choses : le déploiement
visuel (× 1 − 0,85·d, donc retour au plat-bord ET effacement de la pose de
station) et le déport final (rabattu vers 0,75 m — la simulation peut encore
demander la contre-gîte pleine, mais à 60° personne ne tient à 2 m du bord).
Le corps se ferme en plus (bassin +0,40, buste +0,32, bras ramenés, tête vers
la coque), la respiration et la variété de repos s'éteignent, et la glisse est
légèrement échelonnée (`index % 3`) pour éviter l'effet ressort. Si le hors
course se conclut, la chute existante (`fall`) prend le relais : la séquence
lit désormais glisse → accrochage → chute.

Présentation seule, une fois de plus : `dynamics.activeCrew` et les checksums
n'en voient rien (`test:crew`, `test:sim`, `test:replay`, `test:boost` verts).

Non traité, à connaître : au plus fort de la gîte forcée, le premier dresseur
peut croiser la bordure de la voile d'un demi-bras — l'état forcé du harnais
est pire que ce que la simulation produit, et à distance de jeu ça ne se lit
pas. Si ça devait se voir en jeu réel, la bonne réponse est côté staging
(la place du premier dresseur), pas côté pose.

## Passe du 6 août (soir, ter) — la flèche permanente des bwa, et l'accroche

Question du propriétaire : « il faut une physique, une accroche — assis sur les
bwa, ou les tenir par la main, ou penché dessus ? » La réponse d'un praticien
serait : **les trois à la fois, et chacun porte quelque chose de différent** —
le bassin porte le POIDS (charge verticale, celle qui ploie la perche), les
mains portent le MOMENT (sans la prise, l'homme bascule en arrière), les jambes
CROCHÈTENT (sans elles, il glisse le long du bois). Le jeu avait l'assise
verrouillée et la prise IK ; il manquait le couplage charge → flexion → suivi.

La flexion n'existait qu'en IMPULSION (0,028 rad pendant la contre-gîte, puis
la perche redevenait raide avec l'homme encore dessus). Désormais chaque bwa
porteur ploie en continu : `beamSag = déploiement × bras de levier × 0,06 rad`
(amorti à 3,2/s), mesuré en jeu de 0,2° à 2,9° selon l'homme — et l'équipier
**suit** sa perche : sa racine descend de `sag × |x| × 0,9` (jusqu'à ~13 cm au
bout), et l'IK vise la perche affaissée, pas sa cote au repos. Quand l'homme
rentre ou décroche, la perche se relève avec lui ; par-dessus bord, elle se
détend. Le verrou `crew-seating` a suivi le contrat : l'assise juste est la
cote de la perche **affaissée**, plus la cote au repos.

Toujours présentation seule — le couple de rappel de la simulation reste
calculé sur les positions, pas sur la flexion. La flexion qui ABSORBE la rafale
(côté `yole-physics`) serait le vrai couplage physique, mais il est autoritaire
(`SIMULATION_VERSION`, replays) : à décider en connaissance, pas à glisser dans
une passe de présentation.

## Passe du 6 août (soir, quater) — l'accroche mesurée au millimètre

Après « toujours pas bon » : arrêt des réglages à l'œil, écriture de
`tools/analyse_accroche_equipage.py` — distances os ↔ axe de perche en
millimètres, en état de jeu forcé et convergé. Ce qu'elle a mesuré au rappel
installé (30°), et ce que ça vaut après correction :

| Mesure | Avant | Après | Lecture |
|---|---|---|---|
| bassin ↔ axe de la perche | **−100 mm** (dessous) | **+93 mm** (dessus) | assis SUR le bois, plus drapé sous |
| main « libre » ↔ perche | 265-588 mm | 82-121 mm | les deux mains tiennent |
| pieds ↔ perche | 10-21 / 415-718 mm | 10-21 mm | pince refermée (sauf jambe libre voulue de l'extension) |
| tête sous la perche (homme du bout) | −120 mm | +73 mm | plus personne de pendu |
| corps ↔ perche (ancrages) | 54-81° en travers | 48-49° | le long pour corde/dresseurs (13-27°) |

Quatre défauts, quatre causes :

1. **Ma flèche de bwa faisait descendre l'homme depuis l'axe du bateau** au lieu
   du pivot de la perche : il finissait 8 cm SOUS son bois. La flèche se mesure
   depuis `windwardOffset`, point final.
2. **L'assise visait l'AXE de la perche** (fix du 2 août) : une perche de 12 cm
   de diamètre traversait le bassin. `CREW_SEAT_LIFT = 0,105` (rayon + tissu
   comprimé) — le verrou `contactBois` et `crew-seating` suivent le nouveau
   contrat.
3. **La main « libre » était un choix** (éviter les menottes symétriques) qui
   la laissait battre dans le vide : elle rejoint maintenant le bois plus loin
   le long de la perche, en prise souple (force ×0,5, cible propre).
4. **Les ancrages restaient en travers** (`yaw 0,78`) : remonté à 0,94.

Au passage, la remontée d'assise a cassé la portée de la main directrice
(échec IK à 0,101 m, pris par `crew-animation-v2`) : la cible est désormais le
DESSUS de la perche (+0,055), pas son axe — plus physique et plus atteignable.

### Archive — l'état au 2 août 2026

Mesures reproductibles de l'époque :

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

## Retrait du manœuvrier d'écoute — 12 août 2026

L'écoute a été retiré de l'équipage : posté debout derrière la chute, bras
tendus sur le brin, il se lisait en jeu comme « un chef d'orchestre qui
gesticule », pas comme un manœuvrier (retour joueur du 12 août). L'équipage
passe à SEPT silhouettes : six dresseurs + patron. Sont partis avec lui : le
brin d'écoute (`sheetRoot`/`sheetLine`), son bloc de gestuelle, l'état
`ecoute` et sa rangée dans la jauge de silhouette. L'action `ecoute` reste
présente dans les GLB (inutilisée, inoffensive).

Le patron, lui, BARRE ASSIS sur le rebord arrière (z −3,30, bassin posé à la
cote de la lisse) : cuisses relevées, genoux pliés dans la coque, les deux
mains au manche de l'aviron de gouverne. Références : photos du Tour où le
patron est assis sur le quartier arrière, jamais debout au milieu de la poupe.

## Passe 79 — les jambes : tendues vers le bas, tendues vers le bateau, ou assises

Retour du propriétaire, quatre photos du Tour à l'appui : « les pieds sont
ridicules ; les jambes doivent être tendues vers le bas (l'eau) ou tendues vers
le bateau, et l'autre position est assise ». Mesuré avant de toucher
(`tools/mesure_jambes_equipage.mjs`, nouveau) :

| Rappel installé, avant | genou | bassin ↔ axe du bois | pied ↔ axe du bois |
|---|---:|---:|---:|
| ancrage | 107-127° | −16 cm (dessous) | +8 à +10 cm (crocheté) |
| levier | 115° / 44° | −21 cm | +7 cm / −62 cm |
| extension | 120° / 27° | −20 cm | +8 cm / −83 cm |

Trois défauts empilés : la « traction » du 11 août pendait le bassin 20 cm
SOUS la perche ; le repli procédural (`CREW_LEG_HOOK`, `tractionCuisses`) et
les seeds de station pliaient les genoux à plus de 100° ; les pieds visaient
le DESSUS du bois côté coque (`APPUI_PIEDS`, `crochetY`). Aucune des quatre
photos ne montre ça.

### La grammaire des photos

1. **Tendues vers le bas** — assis à cheval sur le bwa, tronc en arrière,
   jambes verticales, pieds pendus au-dessus de l'eau (photos 1 et 3).
2. **Tendues vers le bateau** — allongé sur la perche, les jambes la
   prolongent vers la coque (photo 2) ; ou penché dessus, pieds calés au
   plat-bord, genoux fléchis autant que la distance l'impose (photo 4).
3. **Assis** — sur le plat-bord, jambes dans la coque (inchangé).

### Ce que le code fait

- `crewSeatOffsetForHike` rend une remontée d'assise **constante** : le bassin
  est posé SUR le bois à toute sortie (`CREW_TRACTION_DROP = 0`).
- `crewLegPoseFor({ family, hike, x, transferCrouch })` choisit `repos`,
  `pont`, `bas` ou `bateau`. Le poste décide, comme sur les photos : les
  **ancrages** vont vers le bateau, les **leviers** pendent, **l'homme du bout**
  pend puis s'allonge le long du bois à pleine sortie.
- `bas` : `hangLegs()` oriente cuisse et tibia vers le bas **dans le repère
  monde** (une yole gîtée n'entraîne pas les jambes), écartés de part et
  d'autre du bois, genou détendu de 8°, cheville au repos. Une direction, pas
  un contact.
- `bateau` : si le plat-bord du bord de l'homme est à portée de jambe
  (`CREW_RAIL_REACH`), les pieds s'y calent par CCD et les genoux fléchissent ;
  sinon `layLegsAlongPole()` aligne chaque jambe, depuis sa propre hanche, sur
  un point posé sur la perche à un pas de jambe vers la coque. Alignement
  direct : un CCD à deux articulations converge mal près de l'extension
  complète.
- Le repli procédural de sortie s'efface avec `crewLegAuthority(hike)`
  (rampe 0,22 → 0,44 de sortie) ; à bord et en traversée, rien ne change.

Mesuré après, mêmes scénarios :

| Rappel installé, après | pose | genou | cuisse | pied ↔ axe du bois |
|---|---|---:|---|---:|
| ancrage (x 2,10) | bateau | 0° | couchée, 10° de l'axe du bois | +8 cm, posé dessus, 67 cm vers la coque |
| levier (x 2,90) | bas | 8° | 15° de la verticale | −57 cm, pendu |
| extension (x 3,55) | bateau | 0° | couchée, 10° de l'axe | +7 cm, 67 cm vers la coque |
| ancrage demi-sorti (x 1,45) | bateau | 68-77° | 45° vers la coque | −3 cm : **pied au plat-bord** |

### ⚠️ Deux erreurs commises en route, toutes deux mesurées

1. **Le plat-bord était cherché du mauvais bord.** `versCoque * CREW_RAIL_X`
   désigne la coque OPPOSÉE : la distance au plat-bord valait 2,4 m et la
   branche « pieds au plat-bord » ne se déclenchait jamais. Le bord de l'homme
   est au signe de sa position, pas dans le sens du retour.
2. **Le X local de l'homme n'est pas l'axe de la coque.** À mi-lacet il court
   en partie le long de la perche ; l'écart des pieds posé dessus raccourcissait
   une jambe sur deux (chordes 0,55 et 0,63 m pour la même jambe). L'écart se
   pose sur l'axe Z de la yole, côté gauche de l'homme en premier.

Et une leçon de géométrie : à 0,95 de la longueur de jambe, un genou fait
encore 42° (la corde varie au carré près de l'extension). Pour lire « tendu »,
il faut viser 0,985 — ou aligner directement les deux segments.

### Le tronc suit la grammaire des jambes (1er septembre, soir)

Première livraison de la passe 79, retour du propriétaire : « c'est n'importe
quoi ». Les jambes étaient justes ; le tronc, composé des couches assise ×
poste × compression réglées pour l'ancien repli, ne l'était pas. Mesuré en
jeu à 24° de gîte, bassin → épaules depuis la verticale : 75°, 80°, **117°**,
33°, 94°, 61° — l'homme du bout pendait tête en bas sous le bois, les autres
pliés en U sur leur perche.

`reclineTorso(angleDeg, weight, sideSign, alongPole)` s'applique dans
`applyRigContacts` **avant les mains** : une rotation rigide du bassin
(`alignBoneTowards(Hips → Spine02)`), tout le haut du corps suit, les jambes
sont reposées ensuite et les mains re-résolues depuis la bonne épaule.

| pose des jambes | tronc | repère |
|---|---:|---|
| `bas` (assis à cheval) | 42° en arrière | verticale et horizontale du MONDE : la gravité fait l'angle |
| `bateau`, plat-bord à portée | 52° en arrière | monde |
| `bateau`, allongé sur la perche | 10° au-dessus du bois | repère de la YOLE : la gîte est déjà dedans |

⚠️ Troisième erreur attrapée à la mesure — et seulement en jeu : l'axe « vers
le large » pris dans le repère de la yole gîtée, mélangé à la verticale du
monde, donnait 31°/38° au lieu de 42°/52° à 24° de gîte (le facteur ≈ 0,73
est exactement `atan2(sin a · cos 24°, cos a + sin a · sin 24°) / a`). Le
harnais, yole à plat, ne pouvait pas le voir : `tools/mesure_jambes_equipage.mjs`
imprime désormais une table TRONC (bassin → épaules, épaules → tête,
cassure), et la vérité se lit en jeu — captures Playwright, os du GLB lus
dans le monde, axe « vers le large » = signe de la position de l'homme.

Mesuré après, en jeu à 24° de gîte : assis 42°, plat-bord 52°, allongé 56°
(= 90 − 10 − 24), cassure bassin/épaules/tête de 5 à 16°. Harnais : 42/52/80°,
cassure 3-11°, bassin ↔ bois inchangé, silhouette stricte tenue (buste
44-51°, regard toujours vers le bateau).

Le mannequin de `test/crew-animation-v2` a pris les bras du GLB (59 cm épaule
→ main, au repos le long du corps) : avec 42 cm en croix, la main d'appui
d'un homme assis tronc en arrière n'atteignait pas le bois derrière sa
hanche, et la limite anatomique du CCD faisait manquer la cible de 59 cm — le
harnais mesurait le mannequin, pas le moteur.

### Dos à la mer — la cause racine (2 septembre, nuit)

Planche de poses isolées sous les yeux du propriétaire : « pitoyable ». Les
trois passes précédentes avaient empilé des directeurs (jambes, tronc, mains)
validés par des ANGLES ; aucun outil ne mesurait un contact ni la direction de
la poitrine. `tools/mesure_appuis_equipage.mjs` et sa version en jeu ont dit :
poitrine vers le bas sur cinq hommes sur six (`poitrineVersHaut` −0,5 à −1,0).

Depuis le 6 août le lacet tournait l'homme FACE AU LARGE, et le tangage positif
du bassin qui devait « renverser le buste au-dessus de l'eau » le pliait donc en
avant. Le tronc faisait bien 42° de la verticale — dans le mauvais sens.

Le correctif : `yaw = -side * …` (la face vers la coque) et `recline` négatif.
Un yoleur au rappel tourne le dos à la mer et penche en arrière. Conséquences
mesurées et réglées dans la même passe :

- la perche passe derrière l'homme ; les seeds laissent les bras en avant et le
  CCD manquait le bois de 30-55 cm → `preOrientArmsTowards` pointe le bras vers
  sa prise avant le CCD ; assis à cheval, les prises passent derrière les
  hanches (`CREW_GRIP_BEHIND_FAR` 0,32, `CREW_GRIP_BEHIND_NEAR` 0,11) ;
- le regard suit le tronc vers le ciel → `gazeAtSail` redresse la nuque vers la
  verticale et la coque (`CREW_GAZE_INBOARD` 0,95) ;
- `crew-seating` attend désormais un lacet OPPOSÉ au bord.

Règle retenue : **une pose se recette sur la planche isolée et sur ses contacts
(assise, mains, poitrine), jamais sur ses angles seuls.** La planche :
`scratch/capture_live.py` (un homme, sa yole, trois angles), à régénérer à
chaque retouche.

### Contrats

`npm run test:jambes` (dans `test:crew`) verrouille sur le GLB livré : au
rappel, genou ≤ 40° (≤ 80° pied au plat-bord, à 20 cm près), jambe lue
« bas » ou « bateau », jamais de pied crocheté au-dessus du bois côté coque.
`test/crew-legs.test.mjs` verrouille la grammaire (`crewLegPoseFor`,
`crewLegAuthority`, assise constante). Les captures sont dans
`previews/equipage/` (`tools/capture_crew_pose.py`).

Présentation seule : `dynamics`, les checksums de replay et
`SIMULATION_VERSION` ne bougent pas.
