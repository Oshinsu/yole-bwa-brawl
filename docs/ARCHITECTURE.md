# Architecture — Tropical Mayhem V3.2

## 1. Autorité des systèmes

```text
inputs
  ↓
fixed loop 60 Hz
  ↓
sim/ YoleDynamics + WakeGrid + Rope + collisions
  ↓
game/ règles, Utility AI, armes, score, Grain
  ↓
render/ interpolation, océan, équipage, météo, VFX
  ↓
UI + audio + haptique
```

- `YoleDynamics` est l’autorité physique.
- `Boat` adapte la physique aux règles, cooldowns et décisions d’IA.
- `YoleVisual` ne décide jamais d’un dégât ou d’une élimination.
- `ImpactDirector` et `AudioEngine` sont en aval du gameplay : ils lisent des événements, n’en produisent aucun.
- les particules, débris et animations n’entrent pas dans le checksum.
- WebGL2 est la base ; aucune règle ne dépend d’un effet GPU premium.

## 2. Simulation fixe

Le jeu accumule le temps de rendu et exécute des pas fixes de `1/60 s`. Le rendu interpole ensuite l’état. Les forces ne sont pas calculées avec un delta variable. Clavier et manette sont échantillonnés à l’intérieur du pas fixe (le tactile reste événementiel), ce qui aligne latence d’entrée, pause et enregistrement des replays.

La simulation possède des bornes explicites pour :

- vitesse plane ;
- vitesse verticale ;
- vitesse angulaire ;
- impulsions ;
- tension du harpon ;
- hauteur et vitesse de la grille de wake ;
- quantité d’eau ;
- intégrité structurelle.

## 3. Coque à 16 points

Huit stations longitudinales possèdent chacune un point bâbord et tribord. Chaque point échantillonne :

- hauteur de la houle analytique ;
- normale ;
- vitesse locale ;
- perturbation persistante du wake.

Il produit une force de flottabilité, de l’amortissement et un couple autour du centre de masse. Les stations avant renforcent le slam de proue, les stations arrière stabilisent la poupe et les dégâts/compartiments déplacent l’assiette.

## 4. Équipage

Six masses possèdent :

- masse ;
- position latérale courante ;
- cible ;
- vitesse ;
- délai de réaction ;
- état actif/tombé.

Le Bwa Shift ne téléporte jamais l’équipage. Les délais individuels créent une onde humaine et un couple progressif. La présentation anime chaque corps au-dessus de cette donnée.

## 5. Eau embarquée

Six compartiments stockent l’eau. Un impact localisé choisit le compartiment le plus proche. La masse supplémentaire agit sur :

- accélération ;
- hauteur ;
- roulis ;
- tangage ;
- besoin d’écope ;
- risque de chavirement.

## 6. Océan

### Houle principale

`WaveField` expose huit composantes déterministes communes au CPU et au shader.

### Clipmap

Quatre anneaux géométriques suivent le peloton. Le niveau LQ masque l’anneau le plus distant, sans modifier la physique.

### WakeGrid

Grille locale de `192 × 192` cellules (170 m de côté), fixée au démarrage : les tiers de qualité ajustent la cadence de rafraîchissement de la texture, jamais la résolution — la grille est échantillonnée par la physique et participe donc au déterminisme :

- hauteur ;
- vitesse verticale ;
- écume ;
- dépôt de trail, ligne ou burst ;
- diffusion ;
- advection par courant ;
- décroissance ;
- recentrage par cellules entières ;
- échantillonnage bilinéaire CPU ;
- texture RGBA envoyée au shader.

Le sillage est donc visible **et** échantillable par les autres yoles.

## 7. Collisions et câbles

- spatial hash 2D pour le broadphase ;
- capsules orientées pour les yoles ;
- distance point–capsule pour projectiles et mines ;
- SDF elliptiques déterministes pour îles/récifs ;
- corde Verlet à 12 points pour le Harpon Bwa ;
- séparation, impulsion, couple, dégâts et crédit d’agression.

Cette implémentation évite d’ajouter Rapier/Jolt avant un benchmark réel et conserve une source d’autorité unique.

## 8. IA

La Utility AI pondère :

1. survie face au Grain ;
2. stabilité et eau embarquée ;
3. trajectoire ;
4. distance/cône de cible ;
5. vulnérabilité adverse ;
6. disponibilité des armes ;
7. rancune envers un agresseur récent ;
8. risque de l’action.

L’IA utilise les mêmes armes et forces que le joueur.

## 9. Replays

Un replay contient :

- `schemaVersion` ;
- `simulationVersion` ;
- `gameplayVersion` ;
- seed ;
- fréquence fixe ;
- inputs quantifiés ;
- événements ;
- changements de manche ;
- checkpoints ;
- checksum final ;
- métadonnées de résultat.

Les trames sans changement ne sont pas répétées. Le player reconstruit l’entrée courante et n’émet les actions qu’au tick exact.

## 10. Rendu et performance

- VFX en tableaux typés ;
- débris et équipiers tombés poolés ;
- végétation et rochers via `InstancedMesh` ;
- chunks de monde recyclés ;
- post-FX dans une seule passe ;
- résolution, ombres, bloom, particules et fréquence de wake adaptées ;
- monitoring via `renderer.info` et Quality Manager.

## 11. PWA et monofichier

Le build modulaire est la version de travail. Le script
`tools/build_single_file.py` retire les imports et ordonne les modules dans une
page unique, mais cette page conserve les textures, modèles, sons et icônes
comme dépendances voisines : « monofichier » décrit le code HTML/CSS/JS, pas une
archive entièrement autonome. Three.js est la seule dépendance chargée par CDN
dans cette variante, avec une importmap et des empreintes SRI sha384.

La PWA modulaire livre Three.js 0.185.1 dans `vendor/`. Le service worker est
contrôlé statiquement afin que tout module runtime figure dans le cache ; il ne
purge que les caches préfixés par ce jeu et laisse intacts les autres produits
hébergés sur la même origine.

### Icônes : deux jeux, deux rôles

`any` et `maskable` **ne peuvent pas être la même image**. Une icône `maskable`
est recadrée par le lanceur Android dans la forme de son choix — cercle,
squircle, goutte — et seul un cercle de 80 % du côté est garanti visible. Les
deux icônes du jeu déclaraient `"purpose": "any maskable"` alors qu'elles ont
des coins arrondis transparents et 48,6 % de leur dessin hors de cette zone.

`tools/icones_pwa.py` produit donc la variante manquante : le dessin entier
réduit à 78 %, posé sur son propre dégradé prolongé jusqu'aux quatre coins,
bords estompés pour que les vagues se fondent au lieu de s'arrêter au couteau.
Le dessin hors zone garantie tombe à 16,4 %, et ce qui reste est du fond.

Le même script produit `apple-touch-icon.png` : iOS ignore `maskable`, applique
son arrondi et compose l'alpha **sur du noir** — servir l'icône à coins
transparents y donnait quatre coins noirs.

### Ce que `tools/check_pwa.py` vérifie, et pourquoi

Aucun de ces défauts n'apparaît en console : Chrome refuse ou dégrade en
silence. Le harnais contrôle donc contre les fichiers réellement servis — chaque
icône et capture décodée par le navigateur aux dimensions qu'elle déclare,
l'opacité des coins des maskables, le service worker actif — puis **coupe le
réseau et recharge** : la seule preuve du hors-ligne est une partie qui démarre
sans serveur. `--autotest` rejoue l'état d'avant cette passe et exige que le
harnais le refuse ; il tourne dans `npm run verify`.


## Delta Tropical Mayhem V3.2

- action bits replay : Turbo avant `32`, Bwa Dash `64` ;
- boosts simulés dans `YolePhysics`, jamais uniquement dans le renderer ;
- projectile Coco balistique avec explosion de zone ;
- Spider-Harpon réutilisant la corde Verlet et ajoutant traction/swing/slingshot ;
- Mine Tsunami injectant trois anneaux dans la wake grid ;
- Mur du Grain plus distant et progression ralentie ;
- caméra tactique zoomable conservée dans les réglages ;
- traînées et animations de boost purement visuelles, sans autorité gameplay.

## Mode Tour des Yoles 2026

- 8 étapes point-à-point (`TOUR_STAGES`) contre 3 IA, ligne marquée par deux bouées vertes ;
- points à la place (4/3/2/1, zéro pour les non-finisseurs) et classement général cumulé ;
- règles isolées dans `updateTourStage` / `endTourStage` ; la Combat Box conserve `updateRound` ;
- seed déterministe dérivée par étape (`baseSeed + (étape+1)·0x9e3779b9`) : chaque legs a sa météo, rejouable à l'identique ;
- replay sauvegardé par étape ; la relecture reconstruit l'étape, son décor et
  ses règles sans écrire dans la progression ni re-scorer le Tour ;
- une élimination est définitive pendant l'étape, comme pendant une manche de
  Combat Box : la caméra passe en spectateur jusqu'au résultat.

## 12. Directeur d'impact

`src/render/impact.js` hiérarchise les chocs en quatre paliers (`graze`, `slam`,
`blast`, `takedown`). Chaque palier porte son gel, son recul, son roulis, son
flash et son coup de zoom.

Le **hitstop est purement rendu**. `frame()` accumule du temps réel ; le
directeur en retire une part avant de nourrir la boucle fixe :

```text
raw → impact.consume(raw) → accumulator → fixedUpdate(1/60)
```

La simulation ne reçoit donc jamais plus de temps qu'avant, seulement moins et
plus tard. La séquence de ticks est identique, donc le checksum et les replays
le sont aussi. Un test unitaire verrouille l'invariant : le directeur ne peut
pas rendre plus de temps qu'il n'en a reçu.

Le gel ne s'additionne pas (maximum, pas somme) et reste plafonné à 160 ms.
Les offsets caméra sont appliqués **par-dessus** une pose lissée tenue à part :
les réinjecter dans le `lerp`/`damp` les ferait s'intégrer au lieu de rester
transitoires.

Le réglage `impact` expose `TOTAL / DOUX / SANS`. `SANS` produit réellement zéro
gel, zéro flash et zéro mouvement de caméra.

## 13. Audio

`src/core/audio.js` expose 29 voix. Quinze disposent d'un échantillon MP3 sous
`assets/audio/`; les quatorze autres, ou tout sample indisponible, utilisent le
générateur `AudioBuffer` de secours. La banque synthétique est rendue par
tranches de 4 ms dans un ordre de priorité (voix de contact et lit d'eau
d'abord) pour ne pas hoqueter au coup d'envoi.

Six lits continus sont pilotés chaque frame par l'état de jeu : eau (vitesse,
embrun), Mur du Grain (distance), câble du harpon (tension réelle), voile
(charge aérodynamique), bois (gîte, chocs et dégâts) et sargasses
(engluement). Chaque lit possède aussi un filtre de tonalité dynamique. Aucun
son n'entre dans le checksum. Les huit musiques de `zik/` sont streamées à la
demande et volontairement absentes du précache ; une session hors ligne reste
jouable mais peut être sans musique.

## 14. Modèles

`src/render/assets.js` charge des pièces GLB optionnelles via un GLTFLoader
vendoré dans `vendor/addons/` (imports réécrits vers le core local : pas
d'importmap, pas de seconde instance de Three).

Le contrat tient en une phrase : **le GLB fournit la géométrie, le jeu fournit
le matériau**. Les quatre yoles partagent donc une seule géométrie et ne
diffèrent que par la couleur d'équipage.

Les pièces **articulées** (`YOLE_RIGS`) conservent la scène entière au lieu d'une
géométrie : chaque équipier en reçoit un clone `SkeletonUtils` — donc son propre
squelette — et le jeu pilote sept articulations résolues par table d'alias. Le
rig est piloté par la simulation ; les clips d'animation embarqués sont ignorés,
c'est ce qui garde l'équipage couplé à la mer.

Tout échec — addon absent, fichier introuvable, GLB corrompu, rig incomplet —
retombe silencieusement sur la géométrie procédurale. Les pièces se remplacent une par
une ; le gabarit d'export est verrouillé dans `docs/ASSET_CONTRACT.md`.

## 15. Caméra

Le roulis s'applique en rotation **locale** (`camera.rotateZ`) après `lookAt()`,
jamais en écrivant `camera.rotation.z`. L'Euler XYZ relu après un `lookAt` est
dégénéré dès que la caméra plonge : forcer sa composante `z` recompose une
caméra retournée de 180°.

Même principe pour la position : la pose lissée est tenue à part (`cameraBase`,
`cameraRollBase`, `cameraFovBase`) et la secousse comme le recul d'impact sont
ajoutés **par-dessus**. Les réinjecter dans le `lerp`/`damp` les ferait
s'intégrer au lieu de rester transitoires.

## 16. Antialiasing et LOD de l'océan

`antialias` du contexte ne s'applique qu'au framebuffer par défaut : dès que le
post-FX est actif, c'est `samples` sur le `WebGLRenderTarget` qui fait le travail
(LQ 0, MQ 2, HQ 4).

L'océan atténue avec la distance **le détail spéculaire** (sinon un pixel couvre
plusieurs longueurs d'onde de micro-relief et le soleil clignote) et **le
déplacement géométrique** (sinon les quads de plusieurs mètres des anneaux
lointains replient la houle en bandes). La brume prend la couleur d'horizon du
ciel, source unique partagée avec le brouillard de scène.

## 17. Découpage de la couche jeu

`game/` est découpé par responsabilité : `balance` (réglages et identités),
`weapons`, `match` (règles de course), `input`, `hud`, `camera`, et `game`
lui-même qui garde l'orchestration, la boucle fixe et l'état partagé.

Les cinq systèmes sont composés par **mixins** (`Object.assign` sur le
prototype) plutôt qu'en classes séparées : l'état de `Game` est trop couplé pour
qu'une frontière stricte se pose sans réécriture, et le découpage devait garantir
un comportement identique au bit près. C'est un rangement assumé, pas une
architecture finale — chaque cluster peut être promu en vraie classe isolément.

Règle qui tient le tout : **un checksum qui bouge après un refactor signale une
régression**, jamais une amélioration.
