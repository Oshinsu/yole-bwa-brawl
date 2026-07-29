# YOLE: BWA BRAWL — Tropical Mayhem V3.2

Prototype jouable **Three.js 0.185.1**, mobile-first, de combat racer martiniquais tropical, rapide et volontairement WTF.

Cette édition ajoute le cœur arcade demandé : **Turbo avant**, **Bwa Dash latéral**, **Canon Coco**, **Spider-Harpon avec slingshot**, **Mine Tsunami à vagues concentriques**, caméra tactique zoomable, soleil massif, palmiers renforcés, explosions plus généreuses et Mur du Grain plus permissif.

L’état V7 s’appuie sur la simulation/replay **3.6.0** et consolide la maniabilité,
les impacts, l’haptique configurable et les micro-interactions accessibles.

La passe suivante corrige le **pipeline colorimétrique** — les shaders custom
sortaient en linéaire sans jamais être ré-encodés en sRGB, ce qui affichait toute
la mer et tout le ciel ~2,2 gamma trop sombres — et remplace le bloom par une
chaîne séparable. Voir [CHANGELOG](CHANGELOG.md), Passe 35.

## Jouer

### Windows

1. Décompresser le ZIP.
2. Double-cliquer sur `PLAY_WINDOWS.bat`.
3. Le lanceur récupère Three.js si nécessaire puis ouvre `http://127.0.0.1:8765/`.

### macOS / Linux

```bash
chmod +x play.sh
./play.sh
```

### Monofichier

Ouvrir `YOLE_BWA_BRAWL_TROPICAL_MAYHEM_V3_2_SINGLE_FILE_ONLINE.html` avec une connexion Internet.

Three.js 0.185.1 est livré dans `vendor/` : le jeu se lance sans téléchargement préalable et, grâce au service worker, fonctionne hors ligne après la première visite.

## Modes de jeu

- **Combat Box** — l'arène élimination historique : Mur du Grain, Takedowns, premier à 5 points.
- **Tour des Yoles 2026** — les 8 étapes du 40e Tour (Sainte-Anne → Vauclin → Robert → Trinité → Saint-Pierre → Fort-de-France → Anses d'Arlet → Rivière-Pilote → Sainte-Anne) : 4/3/2/1 points à la place de chaque étape, classement général cumulé, étape « montagne » Trinité → Saint-Pierre de 2 400 m, bouées vertes de ligne, seed déterministe par étape et replay d'étape sauvegardé.
- **Duel local** — deux pilotes humains sur le même clavier, deux rivaux IA, entrées à 60 Hz, caméra partagée dynamique et revanche locale. Les replays sont volontairement désactivés pour ce mode à deux flux.

## Contrôles

| Action | Clavier | Mobile | Manette |
|---|---|---|---|
| Diriger | `A/D` ou `←/→` | premier doigt / joystick | stick gauche / croix |
| **Border la voile (accélérer)** | `↑` | joystick vers le haut | stick gauche vers le haut |
| **Choquer la voile (freiner)** | `↓` | joystick vers le bas | stick gauche vers le bas |
| Viser et tirer | clic droit, glisser, relâcher | second doigt, glisser, relâcher | stick droit + A / ✕ |
| *(la visée suit l'écran : droite = droite, **haut = cloche, bas = tendu**)* | | | |
| Utiliser l'arme active | `Espace` | bouton de soute | A / ✕ |
| Sélectionner Coco / Harpon / Mine / Rhum | `&` `é` `"` `'` (`Digit1…4`) | soute | — |
| Changer d'arme | `E` | ramassage / soute | X / □ |
| Contre-gîte (Bwa Shift) | `Shift` | CONTRE-GÎTE | B / ○ |
| Turbo avant | `W` ou `F` | TURBO | RB / R1 |
| **Regarder derrière** (maintenu) | `C` | — | — |
| **Bwa Dash** (double-tap) | `A A` ou `D D` (aussi `X`) | BWA DASH | LB / L1 |
| Zoom | `+` / `-` ou molette | boutons `−` / `+` | croix ↑ / ↓ |
| Vengeance | `R` | FRAPPE DU GRAIN | Back / Select |
| Pause/réglages | `P` ou `Échap` | boutons en haut | Start |

### Duel local

| Action | Joueur 1 | Joueur 2 |
|---|---|---|
| Barre | `Q/D` (`KeyA/KeyD`) | `J/L` |
| Arme / changer de soute | `Espace` / `E` | `I` / `O` |
| Turbo / dash | `Z` (`KeyW`) / `X` | `U` / `M` |
| Contre-gîte | `Shift` | `K` |

## Nouveautés Tropical Mayhem

### L'équilibre est le vrai jeu

Tout tourne autour de la gîte, et plus autour d'une barre de vie.

- **Les armes visent l'équilibre** : impulsion de roulis ×1,35, dégâts de
  structure ×0,72 en compensation. On chavire plus qu'on ne coule, et il faut
  contre-gîter en permanence. ⚠️ Le facteur était d'abord à ×2,0 : combiné à la
  munition illimitée, il faisait encaisser 10,4 rad de roulis par minute — une
  yole couchée en permanence. Voir [CHANGELOG](CHANGELOG.md), Passe 38 ;
- **les IA tirent moins vite que le joueur** (`BALANCE.aiFireRate`, ×3,4 / ×2,6 /
  ×2,0 selon le niveau) : sans ce frein, trois IA en munition illimitée tiraient
  63 coups par minute ;
- **le Turbo coûte de l'équilibre** : il envoie un couple de roulis à l'allumage,
  et ce couple s'aggrave si on gîte déjà. Ce n'est plus un bouton gratuit ;
- **cooldown de 10 s** (2,35 s pour le Bwa Dash, qui partage le même compteur).
  Le turbo est une **ressource** qu'on garde pour un dépassement ou une fuite
  devant le Grain, plus un bouton de croisière. Mesuré : −23 % de vitesse
  moyenne, de 76,2 à 58,9 km/h. Sans turbo permanent, on navigue à la voile.

### Contre-gîte (Bwa Shift) — comment ça marche

L'équipage se jette au vent. Le résultat dépend de **quand** on appuie :

| Gîte au moment de l'appui | Résultat |
|---|---|
| **> 0,34 rad (19,5°)** | La vraie contre-gîte. Fenêtre optimale à **0,64 rad (36,7°)**, tolérance ±0,36, bonus si la yole tombe encore vers l'extérieur. Rend du Flow, de la cohésion, et casse l'élan de gîte. |
| ≤ 0,34 rad, juste après un Bwa Dash, en dérive | Rattrapage technique : coupe la glisse latérale sans toucher à la vitesse avant. |
| tout le reste | **Pénalité : −0,05 de Flow.** |

Le bouton CONTRE-GÎTE **le dit maintenant à l'écran** : `ATTENDS LA GÎTE`, puis
`PRESQUE — LAISSE GÎTER`, puis `MAINTENANT !` en vert dans le cœur de la fenêtre,
puis `VITE, TU PARS TROP LOIN`. Jusqu'ici la règle existait dans la simulation et
n'était écrite nulle part : on perdait du Flow sans savoir pourquoi.

### Ce qui abîme quoi

La coque n'est pas indestructible — mais l'arme la plus courante ne la touche
pas. Chaque arme a un rôle distinct :

| Source | Coque | Ce qu'elle fait aussi |
|---|---:|---|
| **Mine Tsunami** | **30 %** | l'arme qui coule |
| **Barik Rhum** | **22 %** | le feu ravage, sans embarquer d'eau |
| **Abordage au Bwa Dash** | **18,2 %** | couche l'adversaire — l'arme de contact |
| **Coco Boum** | **20 %** | 31 kg d'eau, −21 % de cohésion, déchire la voile |
| **Konk Lanbi** | **10 %** | désorganise l'équipage, fait dériver |
| **Spider-Harpon** | **10 %** | traction élastique, dégâts de tension |
| **Sargasses** | **10 % / s** | freinent, gîtent, embarquent de l'eau |
| Chadron | 4 % | perce, embarque de l'eau, casse du bois |
| Abordage de croisière | 0,5 % | une bousculade |
| Pwason Volan | 0 % | décroche les yoleurs |

### Balistique — deux axes

La visée a une **hausse** : glisser vers le haut lobe, vers le bas tend le tir.
Le coco part entre 20 % et 180 % de sa cloche nominale, le pwason volan entre
−2,9 et +5,7 m/s de mise en l'air. Les angles physiquement absurdes sont assumés.

### Le harpon se vise

Il ne verrouille plus. C'est un **rayon** : la première coque traversée par l'axe
de visée, dans un couloir de 3,2 m. Mesuré : accroche à 0, 2 et 3 m d'écart
latéral, rate à 4,5 et 9 m. Rater coûte 55 % du cooldown.

Il n'a toujours pas de phase de vol — l'accroche est instantanée — donc sa
trajectoire ne se courbe pas.

### Les IA visent

Elles appelaient `fireWave` directement, qui lit le cap de la coque : elles
tiraient **droit devant**, quelle que soit la position de leur cible. Un solveur
de tir (`solveLeadAngle`) calcule maintenant le devancement, en tenant compte de
la vitesse de la cible et de celle héritée du tireur. L'erreur résiduelle suit la
précision du niveau.

Mesuré, CHANNPYON sur 40 s : 5 tirs, 9 impacts.

```bash
npm run check:aim
```

### Les explosions déforment l'eau

Mesuré impulsion directe neutralisée (`npm run check:blast`), donc **l'eau
seule** : une mine à 9 m produit 0,419 rad de roulis et 1,26 m de soulèvement,
un coco à 4 m produit 0,540 rad. Les deux dépassent le seuil de contre-gîte
(0,34 rad) sans aucun contact.

Une explosion pile dessous soulève la coque à plat ; décalée, elle ne lève qu'un
bord et c'est là que le couple est maximal. **Où tu es touché compte autant que
la distance.**

### Retours de combat

Les **dégâts s'affichent en clair** au point d'impact — la perte RÉELLE de
coque, pas celle demandée : le rhum annule tout et la coque est bornée à 0.
Trois couleurs selon qu'on encaisse, qu'on inflige, ou que ça se passe entre
deux IA.

Le **harpon part même mal visé** : on voit le fer filer puis retomber à l'eau,
donc on sait où on a visé et on peut corriger. Le réticule interroge désormais
exactement la même fonction que le tir — il annonçait « verrouillé » sur des
cibles que le harpon manquait.

Le **pwason volan est une torpille lobée à tête chercheuse** : elle monte,
retombe sur sa proie par-dessus une yole intercalée, et se rabat sur une autre
cible si la sienne chavire. Elle perce à 15 % — elle n'infligeait aucun dégât
de structure auparavant.

Une yole détruite **explose** : trois foyers étagés le long de la coque, fumée,
onde de choc à sa couleur. Et la caméra reste **3,6 s** sur l'épave au lieu de
sauter aussitôt sur le bateau de tête.

Au **rhum**, toute la bordée boit au goulot, gorgées échelonnées de 0,16 s.

Les touches `& é " ' ( - è _` **tirent** l'arme de leur emplacement — elles ne
faisaient que la sélectionner, et les quatre armes de caisse n'avaient aucune
touche.

⚠️ Le **dash et le turbo restent distincts** : ils partagent déjà le même
cooldown, donc ils sont déjà exclusifs. Le turbo sert la course, le dash sert le
combat — c'est la décision « vitesse ou impact » qui les rend intéressants.

### Poids et qualité

Les textures sont en **WebP** : 20,26 → 6,13 Mo sur disque, et le premier
chargement passe de 12,81 à **6,76 Mo**. Les atlas de VFX sont encodés plus haut
(94 contre 88) parce qu'ils sont rendus en fusion additive, où un artefact se
lit comme un halo.

Le palier de qualité pilote enfin le décor — 716 instances en HQ, 572 en MQ,
377 en LQ. `WorldStreamer.setQuality` ignorait son paramètre : la végétation
restait au maximum même en LQ.

```bash
npm run verify                     # tout, y compris l'estampille du service worker
python tools/capture_ab_webp.py avant   # captures comparables avant/après
```

### Raccourcis clavier

Tous listés en jeu : **Pause → RACCOURCIS CLAVIER**. 37 touches, quatre
sections. Le panneau est un `<details>` sans aucun `id` — il ne coûte ni entrée
dans `main.js`, ni ligne dans les quatre listes de mock des tests.

L'essentiel : `Q`/`D` la barre, `↑`/`↓` la voile, `Shift` le contre-gîte, `Z`
le turbo, `X` ou **double-tap `Q`/`D`** le Bwa Dash, `C` le rétro, et les huit
chiffres `& é " ' ( - è _` qui **tirent** directement les huit armes.

### Le lambi : la seule arme qui prend le contrôle

Les sept autres armes attaquent la coque ou l'équilibre. Le lambi prend la
**barre** : 1,5 s sans gouvernail. Mesuré, variation de cap sur 80 ticks à barre
pleine à droite — libre : −0,809 rad, coupée : **−0,119 rad**. L'entrée est
annulée, pas la physique : la yole continue de subir la houle et sa dérive,
c'est ce qui rend la perte de contrôle lisible plutôt que raide.

Le rhum protège. Deux conques prolongent au lieu de cumuler.

### La cohésion, et pourquoi elle ne s'affiche pas

`cohesion` multiplie trois choses : la vitesse à laquelle un homme gagne le bout
du bois, la cadence d'écopage, et le couple de rappel que son poids produit. Au
plancher, les équipiers rampent **six fois plus lentement**.

Rien ne l'affichait — c'était l'effet principal du lambi, invisible. Elle se lit
maintenant **sur les hommes** : buste affaissé, prise molle sur le bois, de
+0,127 à +0,379 rad de bascule entre cohésion pleine et cohésion cassée. Pas de
neuvième jauge : le HUD en compte déjà huit.

### La brume de sable

Le mur qui poursuit la flotte n'est plus un grain d'orage mais une **brume de
sable** — le panache saharien qui traverse l'Atlantique et voile les Antilles
chaque été. Ce n'est pas qu'un renommage : la palette entière a suivi, du violet
nocturne à l'ocre, et ce qui tombait du ciel n'est plus de la pluie bleue mais
de la poussière en suspension.

Les identifiants internes (`storm`, `stormZ`) restent inchangés — plus de cent
occurrences pour zéro bénéfice joueur.

### Lanceur

Un raccourci **`▶ JOUER — YOLE BWA BRAWL`** est à la racine du dossier. Son
icône est un `.ico` à sept tailles avec **deux cadrages** : l'artwork complet en
grand, un recadrage serré sur la yole en 16–48 px, où le bandeau de texte
deviendrait illisible.

⚠️ Le raccourci stocke un chemin absolu : déplacer le dossier le casse.

### Mettre en ligne

```bash
npm run stamp        # estampille le cache du service worker (OBLIGATOIRE)
npm run verify       # tout doit être vert
railway up           # ou : npm run deploy:railway, qui enchaîne les trois
```

⚠️ **`npm run stamp` n'est pas optionnel.** Le service worker ouvre son cache
sous un nom constant et l'activation ne purge que les caches dont le nom
diffère. Déployer sans ré-estampiller laisse chaque joueur déjà venu sur
l'ancienne version, définitivement, sans que rien ne le signale. `npm run
verify` l'exécute automatiquement.

`tools/server.mjs` est le serveur de production : il écoute sur `0.0.0.0:$PORT`,
sert les bons types MIME pour `.glb` et `.woff2`, gère les **requêtes par
plage** (sans lesquelles la musique ne peut pas streamer) et applique une
politique de cache saine — revalidation sur `index.html`, le service worker et
`src/`, sept jours sur les assets.

`.railwayignore` exclut `art-source/` et `previews/`, soit **356 Mo** qui
n'auraient rien à faire en ligne.

### Caisses

**12 caisses vivantes**, pas 24 : on en croisait tant qu'aucune ne valait le
détour. Chacune porte un **fût lumineux de 7,5 m à la couleur de son butin** —
on identifie l'arme de loin et on décide d'y aller. Un **écart latéral minimal
de 8,5 m** au centre de route est garanti : aucune caisse ne tombe plus sur la
ligne idéale, donc aucune n'est gratuite.

⚠️ Faire passer la mine et le rhum en caisse — pour que chaque boîte compte
davantage encore — a été essayé, mesuré, et **retiré** : ce seul changement
faisait diverger la relecture d'un replay. Voir la passe 48.

### Barre d'actions et gestes

Trois tuiles : **contre-gîte, turbo, arme**. La tuile Bwa Dash a été retirée —
mais seulement après avoir créé son remplaçant tactile, sans quoi le dash
n'aurait plus été jouable au doigt (ses autres déclencheurs sont tous au
clavier).

| Action | Clavier | Doigt |
|---|---|---|
| Tirer l'arme 1-8 | `& é " ' ( - è _` | tuile arme |
| Contre-gîte | `Shift` | tuile |
| Turbo | `Z` / `F` | tuile |
| **Bwa Dash** | `X`, `Ctrl`, double-tap `A`/`D` | **double-coup de barre** |
| Rétro | `C` | bouton 👁 |

Le double-coup de barre se détecte au **front montant** : le manche doit
repasser sous 0,55 de course entre deux poussées, donc tenir la barre à fond ne
déclenche rien.

La caméra **tremble** à mesure que la gîte approche du chavirage — entre
0,62 rad, où le rappel ne suffit plus, et 1,16 rad, le seuil exact de bascule.
Coupé sous `prefers-reduced-motion`.

### Typographie

Deux polices embarquées, sous **SIL Open Font License 1.1** — **Inter** en
variable (47 Ko, toute la plage 100→900) pour le corps et le HUD, **Anton**
(18 Ko) pour les titres, les annonces et les chiffres héros.

⚠️ Avant, la pile était `Inter, ui-rounded, "SF Pro Display", system-ui` **sans
aucun `@font-face`** : aucune de ces polices n'étant installée sous Windows, le
jeu s'affichait en Segoe UI.

Elles sont préchargées, précachées par le service worker, et embarquées en
base64 dans la build monofichier pour qu'elle garde sa typo une fois déplacée.

```bash
npm run check:polices
```

Le harnais ne se contente pas de vérifier que le `@font-face` existe : il
compare la **largeur rendue** à celle du repli, parce qu'une police absente
retombe silencieusement sur la police système sans lever d'erreur.

### Musique

Huit pistes dans `zik/`, placées d'après une **analyse du signal** et non d'après
leurs titres (`npm run zik:analyse` les décode et mesure énergie, brillance et
tempo) :

| Phase | Piste | Durée |
|---|---|---:|
| Menu | Coconut Cannon Rush | 2:11 |
| Départ *(sting)* | An Nou Ay | 0:13 |
| Course | Canoe Combat | 1:06 |
| Tour des Yoles | Canot de Guerre | 1:34 |
| Duel local | Turquoise Turbo | 0:55 |
| Mur du Grain | Carnival Apocalypse | 1:48 |
| Victoire *(sting)* | Midnight Canoe | 0:15 |
| Défaite *(sting)* | Oops, You Lost! | 0:13 |

La mesure a contredit deux titres : *Coconut Cannon Rush* est la piste la plus
sombre et la plus lente du lot (centroïde 1134 Hz, 80 BPM), *Midnight Canoe* la
plus vive après les deux plus intenses (139 BPM).

Tout est **streamé**, jamais décodé en mémoire : 12 Mo de MP3 feraient 130 Mo de
PCM. Rien n'est chargé avant la phase qui le réclame, et une piste manquante
laisse simplement le silence.

⚠️ Les MP3 ne sont pas dans le précache du service worker — le mode hors ligne ne
couvre pas la musique.

```bash
npm run zik:analyse
npm run check:zik
```

### Armes : quatre en soute, quatre en caisse

- **Toujours disponibles**, munition illimitée, cadencées par leur seul cooldown :
  **Coco Boum** (5,4 s), **Spider-Harpon** (7,6 s), **Mine Tsunami** (7,0 s) et
  **Rhum** (16 s) ;
- **uniquement en caisse** : Barik Rhum, Chadron, Konk Lanbi, Pwason Volan.

Une manche ne peut donc plus se jouer sans qu'un seul coup soit tiré. Les caisses
ne décident plus *si* on se bat, mais avec quoi on surprend.

### Adversaires — trois niveaux

Réglage `ADVERSAIRES` dans l'écran de pause, appliqué au **lancement** de la
partie et enregistré dans le replay. Les IA ne trichent pas sur la physique : ce
sont les mêmes yoles, avec les mêmes constantes. Ce qui change est la qualité du
pilotage.

| Niveau | Comportement |
|---|---|
| **PEYI** | Elles courent, sans plus. Turbo de survie uniquement — l'ancien comportement. |
| **TOUR** *(défaut)* | Elles courent pour gagner : turbo pour reprendre et pour se dégager. |
| **CHANNPYON** | Elles ne te laissent rien : turbo agressif, dash d'engagement, contre-gîte au bon moment. |

Mesuré sur 100 s à trois adversaires : **6 turbos en PEYI contre ~50 boosts** aux
deux niveaux supérieurs. Avant cette passe, les IA ne prenaient le turbo que
lorsque le Grain était à moins de 46 m — jamais pour courir.

### Équipage — pose de rappel

D'après photo de course. Les six yoleurs sortent **à califourchon sur les bois**,
corps aligné sur la perche, tête vers le large, jambes repliées vers la coque et
mains sur le bois en arrière du bassin.

Le modèle précédent gardait un lacet nul — les hommes regardaient la proue,
assis en travers de perches qui courent d'un bord à l'autre — et leur bassin
flottait 41 cm au-dessus du bois. Voir [CHANGELOG](CHANGELOG.md), Passe 37.

```bash
npm run test:crew
python tools/capture_crew_pose.py
```

### Mesurer la jouabilité

```bash
npm run playtest
YOLE_PILOTE=competent YOLE_GRAINES=a,b,c,d,e npm run playtest
npm run playtest:ab
```

`YOLE_PILOTE` choisit un pilotage grossier ou compétent — **l'écart entre les
deux est l'information utile**. `YOLE_GRAINES` agrège plusieurs parties et rend
médiane et étendue : sur une seule graine, le taux d'abordage varie de 0 à 30 par
minute et ne mesure rien.

### Maniabilité 3.6

- réponse de propulsion progressive et relâchement de voile utilisé comme frein ;
- barre efficace à basse vitesse, lacet amorti au relâchement et drift borné ;
- contre-braquage qui reprend du grip et transforme la glisse maîtrisée en Flow ;
- Bwa Dash correctif distinct du dash d’engagement ;
- contre-gîte parfaite qui réduit la dérive sans créer de Turbo caché ;
- statut HUD `STABLE / SURF / DÉRIVE / RATTRAPAGE / CRITIQUE / CHAVIRAGE` et
  lit d’eau dont le gain et la vitesse suivent la glisse, le surf et la reprise.

### Canon Coco

- projectile balistique en noix de coco ;
- rayon d'explosion de **9,5 m**, gerbe agrandie, pulpe, éclats et eau ;
- ralentissement, couple de roulis, eau embarquée et choc de cohésion ;
- dégâts centraux nettement renforcés et Coco Combos multi-cibles.

### Spider-Harpon

- câble Verlet visible, coloré par tension, avec rupture ;
- impact immédiat sur la coque et la cohésion, puis dégâts cadencés sous forte tension ;
- transforme la cible en point d'ancrage : le tireur est tracté comme par un élastique tandis que la cible subit une forte traînée ;
- déclenche un **slingshot** directionnel lorsque le joueur dépasse l'ancre sous tension.

### Interface et assets

- pack V5 : 62 icônes, boutons, contenants HUD, viseurs et VFX ;
- pack V6 : 8 images de production pour le hero, les quatre cartes de modes, le lobby et les badges joueurs ;
- pack V7 : 4 signatures Combat Juice — arrachement du harpon, onde Coco, détonation de mine et contre-gîte parfaite — regroupées dans un atlas additif 2×2 de 1024×1024 prévu pour un draw call ;
- inventaire : **74 signatures artistiques** ; **75 fichiers de texture** lorsque l’atlas d’agrégation est compté ;
- prompts et sources conservés dans `art-source/generated-v5/`, `art-source/generated-v6/` et `art-source/generated-v7/` ;
- détails et mapping UV : [Asset Pack V7](docs/ASSET_PACK_V7.md), aperçu dans [la planche-contact V7](previews/v7_juice_contact.png).

### Mine Tsunami

- grosse colonne d'eau ;
- trois vagues concentriques persistantes dans l'océan ;
- impact radial sur plusieurs yoles ;
- eau embarquée, roulis et perte de vitesse.

### Course et caméra

- vitesse de base et plafond augmentés ;
- Grain placé plus loin derrière le peloton ;
- fenêtre de comeback élargie ;
- caméra plus haute et plus reculée ;
- zoom proche, standard ou tactique.

### Impact et son

- quatre paliers d'impact — frôlement, Bwa Slam, explosion, Takedown — avec gel, recul directionnel et flash propres à chacun ;
- hitstop purement visuel : il ne touche ni la simulation, ni le checksum, ni les replays ;
- 22 voix synthétisées (aucun fichier audio) : coques, gerbes, cocos, câble, tanbou de victoire ;
- lits continus pilotés par le jeu : eau selon la vitesse, Grain selon la distance, câble selon sa tension ;
- réglage IMPACT `TOTAL / DOUX / SANS`, où SANS ne bouge vraiment plus la caméra.

### Haptique et micro-interactions

- réglage HAPTIQUE `TOTAL / DOUX / SANS` qui adapte les motifs de tir, impact, boost, dash, ramassage et contre-gîte lorsque `navigator.vibrate` est disponible ;
- confirmation visuelle uniquement après une action acceptée, sans faux retour lorsque le jeu est en pause ;
- états brefs pour cooldown, ressource basse, cible acquise, score, statut critique et avantage en duel ;
- cibles tactiles de **46 px** sur pointeur grossier — la règle est servie derrière
  `(pointer:coarse)`, et vérifiée par un contexte tactile dédié dans le smoke ;
  en contexte souris les mêmes boutons font 31 px, au-dessus du plancher WCAG 2.5.8
  de 24 px qui s’applique alors ;
- focus clavier visible, focus piégé puis restitué dans le lobby et prise en charge
  de `prefers-reduced-motion` ;
- aucune nouvelle animation de micro-feedback ne boucle indéfiniment.

### Rendu et couleur

- **tone mapping ACES et encodage sRGB explicites** dans la passe de composition,
  seul endroit traversé par tous les pixels : `THREE.ColorManagement` convertit
  les couleurs authorées en linéaire, et three.js n’ajoute le chunk de conversion
  de sortie qu’aux matériaux intégrés — un `ShaderMaterial` qui écrit
  `gl_FragColor` à la main sortait tel quel (mesuré : 128 au lieu de 188) ;
- **exposition 0,90**, choisie par balayage mesuré et non à l’œil : luma médiane
  0,334, aucun pixel écrêté ;
- MQ et HQ désormais **colorimétriquement identiques** ; LQ ne s’en écarte plus
  que par l’absence d’ombres portées ;
- **bloom séparable** : seuil à genou doux et moyenne de Karis en demi-résolution,
  gaussienne en quart de résolution, rayon exprimé en fraction d’écran — donc
  identique à toutes les résolutions — plus une traînée anamorphique de soleil ;
- chaîne de bloom **entièrement sautée** au palier LQ, prises de la passe de
  composition comprises ;
- **tramage** d’un demi-LSB après encodage, contre les bandes du dégradé de ciel.

Outils de contrôle du rendu, sur une frame gelée :

```bash
npm run render:tiers
npm run render:exposure
npm run render:bloom-ab
```

### Juice tropical

- soleil plus large et plus brillant ;
- mer plus turquoise ;
- davantage de palmiers près de la route ;
- traînées Turbo et Bwa Dash ;
- équipiers plus animés pendant les boosts et les impacts ;
- messages et Takedowns plus comiques.

## Systèmes conservés

- 16 points de flottabilité ;
- six compartiments d'eau ;
- six masses d'équipiers ;
- huit composantes de vagues ;
- grille de sillage persistante ;
- dégâts coque/mât/voile/bois ;
- IA tactique ;
- replays déterministes ;
- PWA ;
- LQ/MQ/HQ et qualité dynamique.

## Architecture

```text
src/
├── core/       math, RNG, qualité, réglages, télémétrie, spatial hash, audio
├── sim/        vagues, wake grid, coque, collisions, corde, replay
├── render/     océan, ciel, VFX, débris, monde, yoles, directeur d'impact
└── game/       équilibrage, armes, manches, entrées, HUD, caméra, versus, Utility AI
```

Les modèles GLB sont optionnels : `src/render/assets.js` charge les pièces
déclarées et retombe sur la géométrie procédurale en cas d'absence. Le gabarit
d'export est verrouillé dans `docs/ASSET_CONTRACT.md`.

```text
```

La simulation ne dépend pas de Three.js. Le renderer consomme un état déterministe et ne décide jamais d'un Takedown.

## Vérification

```bash
npm run verify
```

La suite contrôle syntaxe, imports, PWA, déterminisme, physique, wake, IA, replay,
Duel local, Combat Box, shaders EGL/GLES, DOM/inputs Chromium et benchmark CPU.
Elle appelle notamment les cibles spécialisées suivantes :

```bash
npm run test:handling
npm run test:handling-feedback
npm run test:handling-render
npm run test:combat
npm run test:juice
npm run test:ui
```

Voir le [rapport de validation](TEST_REPORT.md).

## Licence

Le code et les assets originaux sont réservés au projet YOLE: BWA BRAWL. Three.js est distribué sous licence MIT ; voir `THIRD_PARTY_NOTICES.md`.
