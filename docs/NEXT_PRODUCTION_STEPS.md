# Suite de production après Tropical Mayhem V3.2

Le moteur, les variantes locales, le Tour persistant, les replays, la PWA et
les surfaces essentielles de navigation sont en place. Les prochains
investissements doivent maintenant valider le jeu sur du matériel réel et
remplacer ce qui reste juridiquement ou artistiquement provisoire.

## P0 — appareils et joueurs réels

- profiler Android milieu de gamme et iPhone ;
- mesurer CPU, GPU, mémoire, chauffe, batterie et frame-time spikes ;
- vérifier LQ/MQ/HQ sur Adreno, Mali et Apple GPU ;
- tester le tutoriel, le garage, le Tour complet et la Mêlée avec de nouveaux
  joueurs ;
- ajuster durée, score, Mur du Grain et ratio physique/armes à partir de ces
  sessions, pas uniquement de harnais automatisés.

## P0 — traçabilité des droits et publication

- l'autorisation audio et visuelle a été confirmée par le propriétaire le
  30 juillet 2026 ; `AUDIO_RIGHTS.md` en conserve l'attestation ;
- ajouter les pièces individuelles au registre interne lorsqu'elles sont
  disponibles, sans présenter l'état `owner-attested` comme une vérification
  juridique indépendante ;
- conserver les photos de référence hors du paquet : elles servent à
  l'authenticité et ne sont pas des assets redistribués par le jeu ;
- garder le garde de publication qui refuse toute candidate dont le manifeste
  redevient bloqué.

## P1 — fidélité et assets

- remplacer les six bitmaps V6 de menu seulement après validation d'un pilote
  conforme à `YOLE_VISUAL_REFERENCE.md` ;
- ne jamais réintroduire coque large, balancier, cage symétrique ou voile de
  yacht générique ;
- affiner ensuite le GLB, ses LOD et le rig d'équipage sur captures d'appareils
  réels ;
- produire une arène martiniquaise identifiable sans utiliser de marques,
  équipes ou sponsors réels sans autorisation.

### ✅ Les trois chantiers ci-dessous sont FAITS (2 août 2026)

Ils sont conservés pour la trace du raisonnement. Résultats :

1. **Pole targets** — résolus **sans toucher au rig**. La mesure Blender a montré
   que la pose de repos encodait déjà le plan de flexion (35° au coude, 15° au
   genou). Aucun asset réexporté.
2. **Divergence des coques** — tranchée : la physique a été recalée sur le
   visuel, `SIMULATION_VERSION` → `4.0.0`, replays antérieurs refusés. Débord
   ramené de 18 cm à 0.
3. **Voile** — enrichie **procéduralement**, pas en GLB. Une voile est une
   surface paramétrique : la modéliser dans Blender aurait ajouté une dépendance
   à l'ordre des sommets d'un export glTF pour un gain de forme que le
   paramétrique donne aussi, et à zéro sommet supplémentaire.

Prochains candidats, par ordre de gain : la **quille** (le mesh est 12 à 33 cm
plus creux que la physique ne le déclare — même famille que le débord latéral,
même type de décision autoritaire), l'**atlas des cinq props** (5 matériaux et
5 textures pour 3 343 triangles), et le passage de la déformation de voile en
**vertex shader**, désormais possible puisque la pose de repos est figée.

### Contexte d'origine — débloqué par Blender MCP

Trois chantiers attendaient de pouvoir **voir** Blender, pas seulement le
scripter. Ils sont désormais faisables — voir `docs/BLENDER_MCP.md`, en
respectant la règle « MCP produit un `.blend`, les scripts produisent le
`.glb` » :

1. **Quatre pole targets sur le rig d'équipage.** Classé priorité haute par
   `CREW_AUTHENTICITY_AUDIT.md` depuis le 1er août. Les limites d'angle du
   solveur CCD empêchent les cassures mais ne garantissent pas le **côté** de
   flexion du coude ou du genou — sur 32 corps à l'écran, ça se voit. Vingt
   minutes dans Blender, impossible à l'aveugle. La suite runtime (alias,
   chaînes IK, tests) reste à faire dans la même passe, sinon le rig porte des
   os que personne ne lit.
2. **La voile en asset.** Plus grande surface de la yole à l'écran, encore une
   grille plate 8×12 déformée par sommet en CPU avec `computeVertexNormals()`
   une frame sur trois. Trois gains d'un coup : forme au repos réelle (creux,
   rond de guindant, ralingue), densité de maillage suivant la variation de
   texels ×2,78 entre pied et têtière, et déformation transposable en vertex
   shader une fois la pose de repos figée.
3. **Trancher la divergence des trois tables de coque.** Mesurée et bornée par
   `npm run test:hull`, documentée dans `ASSET_CONTRACT.md`, non corrigée : les
   points de flottabilité tombent 18 cm hors de la coque visible. Toucher une
   station est **autoritaire** — `SIMULATION_VERSION`, replayothèque, Tour. À
   décider explicitement, pas à corriger en passant.

Ordre recommandé : 1, puis 3, puis 2. Le rig est cerné et testable ; la coque
demande une décision de conception ; la voile est le plus gros morceau et gagne
à partir d'une source de vérité déjà rétablie.

## P2 — accessibilité et contenu

- tester lecteurs d'écran et navigation clavier sur les dialogues
  replayothèque, Tour et informations ;
- décider, avec des locuteurs, d'une vraie stratégie FR/kréyol/anglais ; le
  glossaire actuel explique les usages mais n'invente aucune traduction ;
- envisager un remappage de commandes seulement après observation des besoins
  réels ;
- améliorer les résultats de Mêlée si des métriques propres au joueur 2 sont
  ajoutées à la simulation.

## P3 — réseau optionnel

- signer les replays avant tout classement en ligne ;
- ajouter snapshots de correction et validation anti-triche ;
- reproduire les ghosts côté serveur ;
- seulement ensuite : classements, défis partageables et progression de profil.

## Bibliothèques à benchmarker, pas à empiler

- `three-mesh-bvh` si les décors deviennent des meshes complexes ;
- Rapier ou JoltPhysics.js si les contraintes avancées battent réellement le
  moteur actuel en coût et stabilité ;
- `three.quarks` si un éditeur VFX et le batching justifient son poids ;
- WebGPURenderer/TSL pour un mode premium, sans retirer WebGL2.

Toute dépendance doit battre la solution existante sur un benchmark
reproductible avant adoption.
