# Kit Google Play

Fichiers prêts à importer dans la fiche française :

- `app-icon-512.png` : icône haute résolution 512 × 512 ;
- `feature-graphic-1024x500.png` : bannière 1024 × 500 ;
- `screenshot-01-course-2560x1440.png` : capture réelle de course ;
- `screenshot-02-combat-2560x1440.png` : capture réelle de combat ;
- `listing-fr-FR.json` : titre et descriptions dans les limites Play.

Les captures sont des PNG RGB opaques issus du vrai jeu. Le kit ne contient
aucun logo de sponsor. `npm run check:play-assets` contrôle formats et limites.

La publication Android reste volontairement bloquée tant que le domaine final,
l’empreinte Play App Signing et l’adresse de contact du développeur ne sont pas
fournis. `npm run check:play` affiche ces blocages au lieu d’inventer des
valeurs.
