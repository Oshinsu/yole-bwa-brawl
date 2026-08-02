# Registre de provenance audio

Ce registre distingue deux faits qui ne doivent pas être confondus :

1. **l'autorisation de publication donnée par le propriétaire du projet** ;
2. **la présence de pièces documentaires vérifiables dans le dépôt**.

## Statut de publication au 30 juillet 2026

Le propriétaire du projet a explicitement confirmé le 30 juillet 2026 qu'il
autorise la publication et la distribution, y compris commerciale, de la
candidate 3.2.0 avec les 8 musiques et les 15 effets ou lits sonores listés
ci-dessous. Le statut de droits utilisé par la release est donc
**`owner-attested`**.

Cette attestation lève la barrière de publication du projet. Elle ne constitue
pas une vérification juridique indépendante et ne permet pas d'affirmer que des
contrats, factures, reçus, licences individuelles ou identifiants de génération
ont été fournis : **aucune de ces pièces n'est archivée dans ce dépôt**.

| Champ de contrôle | Valeur |
|---|---|
| Statut machine | `owner-attested` |
| Attestation | propriétaire du projet, 30 juillet 2026 |
| Justificatif d'identité de l'attestant fourni au dépôt | non |
| Périmètre | publication et distribution, y compris commerciale, des 23 MP3 avec la candidate 3.2.0 |
| Pièces individuelles fournies au dépôt | non |
| Vérification juridique indépendante | non |
| Publication autorisée par le projet | oui |

Le registre reste volontairement incomplet sur l'auteur, la source et la chaîne
de licence de chaque fichier. Ces lacunes sont une dette documentaire connue,
pas une preuve inventée.

## Musiques

| Fichier | Auteur/source documenté | Licence ou cession archivée | Attestation propriétaire | Statut release |
|---|---|---|---|---|
| `zik/An Nou Ay.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `zik/Canoe Combat.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `zik/Canot de Guerre.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `zik/Carnival Apocalypse.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `zik/Coconut Cannon Rush.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `zik/Midnight Canoe.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `zik/Oops, You Lost!.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `zik/Turquoise Turbo.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |

## Effets et lits sonores

| Fichier | Auteur/source documenté | Licence ou cession archivée | Attestation propriétaire | Statut release |
|---|---|---|---|---|
| `assets/audio/bedStorm.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/bedWater.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/buoy.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/bwaShift.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/cocoBoom.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/cocoFire.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/dash.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/harpoonFire.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/hullSlam.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/mineBlast.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/slamHeavy.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/splash.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/takedown.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/turbo.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |
| `assets/audio/victory.mp3` | Non | Non | Oui · 2026-07-30 | Autorisé sur attestation |

## Complétude documentaire à poursuivre

Pour faire évoluer le statut de `owner-attested` vers `evidence-verified`,
archiver dans un emplacement privé, pour chaque fichier, au minimum :

1. le nom légal de l'auteur ou du fournisseur ;
2. la date et le moyen d'acquisition ;
3. le texte exact de la licence ou le contrat de cession ;
4. la facture, le reçu ou l'identifiant de génération le cas échéant ;
5. les restrictions d'usage, d'attribution, de modification et de revente.

Le dépôt public peut conserver ce registre et un identifiant de preuve sans
exposer les contrats privés. Tant que cette procédure n'est pas terminée, les
métadonnées machine doivent conserver `evidenceArchived: false` et
`rightsVerified: false`.
