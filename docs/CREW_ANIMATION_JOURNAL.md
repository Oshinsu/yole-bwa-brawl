# Journal de passe — animation d'équipage, 6 août 2026

Ce fichier est un **journal de travail**, pas un contrat. La référence technique
reste [`CREW_ANIMATION_ENGINE.md`](CREW_ANIMATION_ENGINE.md) ; les angles morts
ouverts sont trackés dans [`CREW_AUTHENTICITY_AUDIT.md`](CREW_AUTHENTICITY_AUDIT.md).
Ici : ce qui a été fait, comment c'était avant, ce que j'en pense, et par où
continuer.

## Ce qui a été fait (commits `a15d970` et suivants)

Trois changements, tous **purement visuels** — `dynamics`, checksums de replay
et `SIMULATION_VERSION` n'ont pas bougé (`test:sim`, `test:replay`, `test:boost`
verts avant/après) :

1. **L'assise recalée sur photos.** Le seed `pont_interieur` est passé de
   « à genoux sur le pont » (cuisses 25°, jambes −95°) à « perché sur le
   plat-bord » (cuisses 62-66°, jambes −100/−104°, avant-bras posés sur les
   cuisses). Re-bake Blender headless, texture réduite à 512
   (`shrink_glb_textures.py`, 6,18 Mo → 0,27 Mo), branchement production après
   audit + harnais silhouette.
2. **La variété d'assise.** Au repos, chaque dresseur reçoit orientation,
   inclinaison de buste, asymétrie de bras et regard dérivés de `this.phase`
   — fixe par homme, donc rejouable à l'identique, nul dès la sortie sur les
   bwa. Fini le « six clones à genoux » du départ.
3. **L'ordre du patron.** Bras gauche levé (tendu, haut — la droite tient la
   pagaie) au début du changement de bord, rabattu pendant que les dresseurs
   traversent. Calé sur `sideChangeElapsed` servi au patron via
   `shiftMotion.bordElapsed`, pas sur la gîte : un coup de tabac ne le fait
   pas gesticuler. Angle mort n°7 de l'audit, refermé.

### Références utilisées

Photos **CC BY-SA 4.0** de Wikimedia Commons (Tour des yoles 2019 — Triton ;
courses de Sainte-Luce — Larcher Felix ; GFA Caraïbes et Brasserie Lorraine —
Tour 2014 ; yoles au vent — Stéphane ROMANY). Copies de travail dans
`tmp/references/`, **hors paquet** (`tmp/` est ignoré). Si un jour une de ces
images devait entrer dans un livrable, il faut l'attribution BY-SA — et elle ne
doit jamais servir de source à un générateur d'images (règle `ASSET_BACKLOG.md`).

Ce qu'elles apprennent de vérifiable : sans gîte, l'équipage siège sur le
plat-bord au vent, bustes droits, gestes différents d'un homme à l'autre ; au
portant, les corps pendent dehors jambes vers l'eau ; le patron tient la pagaie
haute, pale en arrière dans l'eau.

## Comment c'était avant, et comment je l'ai prouvé

Le piège classique de ce projet : « je crois me souvenir que c'était mieux
avant ». Pour ne pas y retomber, la comparaison s'est faite par **worktree git
sur HEAD** (`git worktree add tmp/avant HEAD`), avec le même harnais de capture
des deux côtés, au pixel près :

- avant : six hommes à genoux en rang, strictement identiques ;
- après : six hommes perchés sur le plat-bord, orientations et gestes variés.

Captures : `previews/equipage/repos_*.png`, `ordre_patron.png` (harnais
`tools/capture_repos_patron.py`, qui complète `capture_crew_pose.py` — celui-ci
ne couvre que la gîte franche).

Mesures (harnais silhouette, production) : rappel plein inchangé (genou 88°,
regard +0,50, dorsal), départ à 34,3° d'abduction pour un seuil à 45°.

## Mes pensées, y compris les doutes

- **La composition assise × procédural rend tout réglage non-linéaire.**
  Preuve payée : resserrer l'écart Z des bras (25° → 9°) a fait MONTER la jauge
  d'abduction de 32° à 43°. Avec les avant-bras repliés sur les cuisses, un bras
  étroit projette le coude dans l'axe des épaules. On ne devine plus une pose,
  on itère seed → bake → mesure → capture. Chaque cycle coûte ~2 minutes ;
  c'est le prix de la certitude.
- **Le patron qui tient sa pagaie haute m'a semblé faux. C'est juste.** La
  capture « homme suspendu à la pagaie » existe à l'identique sur HEAD : le
  harnais force gîte nulle et yawRate nul, et les photos montrent justement le
  patron debout, main haute sur un manche quasi vertical. Avant de « corriger »,
  comparer à HEAD — ça évite de réparer ce qui n'est pas cassé.
- **La caméra de jeu pardonne le détail, pas l'ensemble.** À 13 px de haut,
  l'avant-bras sur la cuisse est invisible ; la monotonie de six silhouettes
  identiques, elle, se lit instantanément. C'est pour ça que la variété de pose
  passe avant toute variété de mesh.
- **Ce qui me gêne encore** : au repos les hommes sont perchés *sur* la lisse
  mais le bassin flotte un chouïa au-dessus — le contact fesse/plat-bord n'est
  pas vérifié par une mesure, seulement par capture. Un seuil
  « distance bassin ↔ lisse » dans `mesure_silhouette_equipage.mjs` serait le
  verrou qui manque.

## Comment améliorer encore — pistes classées

1. **Vent arrière / contrepoids (audit #4, haute priorité).** Un dresseur peut
   faire contrepoids du côté de la voilure au portant. Ce qu'il faut : plomber
   `apparentAngle` (déjà calculé dans `yole-physics.js`) jusqu'au `state` visuel,
   ajouter une pose dédiée, et — point dur — décider si la masse bouge côté
   simulation (autoritaire, `SIMULATION_VERSION`) ou si ça reste une lecture
   visuelle. **Ne pas l'inventer sans retour d'un pratiquant** : c'est le même
   piège que « ventre ou dos à la mer ».
2. **Verrou de contact bassin ↔ plat-bord** (voir doute ci-dessus). Facile :
   une mesure de plus dans le harnais silhouette, un seuil, et c'est verrouillé
   pour toujours. Bon rapport coût/confiance.
3. **Variété de mesh (audit #6, volet restant).** 32 corps, un seul mesh.
   Options : 2-3 meshes variantes dans le même GLB (poids ×2-3 sur le poste
   texture+mesh, attention au précache), ou échelle d'épaules/bassin par membre
   au runtime (attention : l'IK et les pole targets supposent les proportions
   du bind — à mesurer avant). Volontairement non commencé.
4. **Regards vers le patron pendant l'ordre.** Les dresseurs ont déjà
   `sideTransfer` ; un quart de tour de tête vers la poupe au tout début de la
   traversée renforcerait la lecture collective. Subtil, présentation seule,
   mais à vérifier en capture — un regard qui arrive en retard lit comme un bug.
5. **Geste différencié virer / empanner.** Aujourd'hui un seul geste pour tout
   changement de bord. Le `state` sait probablement dire dans quel sens on
   tourne ; deux gestes distincts seraient un vrai plus pédagogique pour le
   joueur. À valider avec un pratiquant (le geste réel est-il différent ?).
6. **Clips animés réels** (`rappel_idle`, `charge`…). Toujours bloqué par les
   droits, pas par la technique — voir [`CREW_CLIP_LIBRARY.md`](CREW_CLIP_LIBRARY.md) :
   séance de captation avec la CMT + autorisations individuelles. Le code de
   branchement (`setClipBlend` sur les états) est écrit et attend les assets.
7. **Prise de pagaie plus basse au repos.** Cosmétique ; les photos ne
   tranchent pas. Ne pas y toucher sans photo de profil au portant.

## Protocole de vérification (rejouable)

```bash
# Mesures + seuils (production)
node tools/mesure_silhouette_equipage.mjs --strict
# Batterie équipage complète
npm run test:crew
# Non-régression simulation / replays
npm run test:sim && npm run test:replay && npm run test:boost
# Captures repos + ordre (nécessite playwright)
PORT=8791 python tools/serve.py &
python tools/capture_repos_patron.py
# Témoin avant/après
git worktree add tmp/avant HEAD~1   # puis même harnais sur le worktree
```

Cycle de réglage d'une pose : seed dans `tools/build_crew_asset.py` →
`--mode upgrade --reauthor-actions` → `--mode export` → mesure sur
`tmp/crew-v2/yole_crew_candidate.glb` → branchement **explicite** vers
`assets/models/yole_crew.glb` → `shrink_glb_textures.py --size 512` →
`npm run test:crew` → `npm run stamp`.
