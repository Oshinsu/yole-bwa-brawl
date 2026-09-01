# Décisions en attente du propriétaire du projet

> Trois arbitrages sont écrits dans le code ou le journal comme « à décider »,
> et bloquent chacun une famille de passes. Ils ne se règlent pas en mesurant
> davantage : ils se règlent en tranchant. Ce mémo les pose côte à côte, avec
> une recommandation par point. Une heure suffit ; ensuite, verrouiller par un
> test et ne plus y revenir.

## 1. La portée minimale des bwa (4,40 m)

**Où.** `crew-seating.test.mjs` verrouille `porteeAuVentMin > 4.40`, hérité de
`docs/YOLE_VISUAL_REFERENCE.md`. Passe 76 du CHANGELOG.

**Le conflit.** Les images vidéo montrent les équipiers assis juste au-delà du
plat-bord ; le jeu les pousse au bout des perches parce que, tant que les bwa
doivent porter à 4,40 m, quelqu'un doit occuper ce bois — sinon il reste nu
(« râteau »). Les deux lectures ne peuvent pas être satisfaites ensemble.

**Recommandation.** Ramener la portée minimale à **3,90 m** et laisser les
hommes revenir vers la coque. À la distance de jeu c'est la densité de la
grappe humaine qui se lit, pas la longueur du bois, et la passe 75 a déjà
montré que la vérité des images est « perches serrées, hommes serrés ». Coût :
une constante, un test, une capture de contrôle avec `06_vue_de_jeu`.

## 2. La quille : 12 à 33 cm plus creuse que la physique

**Où.** `npm run test:hull` mesure l'écart ; `docs/ASSET_CONTRACT.md` le borne ;
`docs/NEXT_PRODUCTION_STEPS.md` le classe « même famille que le débord latéral ».

**Le conflit.** Toucher une station de coque est autoritaire : `SIMULATION_VERSION`
change, la replayothèque et les replays partagés deviennent incompatibles, la
progression du Tour perd sa relecture. C'est donc une décision de version, pas
un réglage.

**Recommandation.** **Ne pas y toucher avant le premier playtest** (voir
`PLAYTEST_PROTOCOL.md`). Si la campagne conclut à un chantier physique de
toute façon, regrouper quille, éventuels réglages de gîte et passage en
`5.0.0` dans une seule rupture de compatibilité — une, pas trois.

## 3. La densité de l'équipage

**Où.** Passe 74 : « combler cet écart demande plus d'équipiers, ou un
groupement plus serré — donc une décision de conception, pas un réglage. »

**Le conflit.** Six masses simulées sont un choix de simulation (couple de
rappel, cohésion, écopage) ; les photos montrent une masse humaine plus
compacte et plus nombreuse. Ajouter des corps visuels non simulés casserait la
règle « le rig est piloté par la simulation ».

**Recommandation.** Garder six masses simulées et **resserrer** plutôt
qu'ajouter : la décision 1 (portée 3,90 m) fait déjà la moitié du chemin. Si le
rendu reste trop clairsemé après capture, ajouter au plus **deux** figurants
non simulés à des postes qui n'en ont pas besoin (patron, écoute déjà là) et
l'écrire noir sur blanc dans `docs/CREW_ANIMATION_ENGINE.md`.

## Ce qui n'est pas une décision à prendre

- L'archivage du dossier `bwa dresse yole/YOLE_BWA_BRAWL_KIMI_V2_TOTAL_PLAN_2026-07-20`
  est fait : un `ARCHIVE.md` y renvoie vers cette version. Rien n'a été
  supprimé.
- Les droits audio restent « owner-attested » sans pièce : ce n'est pas un
  arbitrage, c'est un dossier à compléter (`AUDIO_RIGHTS.md`).
- Le Tour reprend les vraies étapes et les vraies dates de l'événement réel.
  La mention de non-affiliation existe dans le panneau Yole & crédits. Avant
  toute diffusion commerciale, une vérification auprès de l'organisateur reste
  prudente — à faire, pas à décider.
