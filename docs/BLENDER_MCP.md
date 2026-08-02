# Blender MCP — pilotage de Blender depuis l'assistant

Installé le 2 août 2026. Ce document décrit **ce qui est branché**, **pourquoi ce
serveur-là**, et surtout **ce que MCP n'a pas le droit de faire dans ce dépôt**.

## Avertissement de sécurité (celui de Blender, pas le nôtre)

> Le serveur MCP exécute du code généré par le LLM dans Blender **sans aucun
> garde-fou** contre la suppression de vos données ou leur envoi vers un
> emplacement distant. Blender recommande une VM ou une machine sans données
> sensibles.

Concrètement : `execute_blender_code` a les droits de la session Windows. Ce
n'est pas un bac à sable. Le serveur ne démarre que si l'add-on est actif dans
Blender ; laisser « Auto Start » décoché est un cran de sûreté gratuit.

## Ce qui est installé

| Pièce | Version | Emplacement |
|---|---|---|
| Add-on Blender (socket TCP) | `mcp` 1.0.0 | `%APPDATA%\Blender Foundation\Blender\5.2\extensions\user_default\mcp` |
| Pont MCP (stdio ↔ socket) | `blender-mcp` 1.27.0 | `%LOCALAPPDATA%\blender-mcp` |
| Gestionnaire Python | `uv` 0.11.32 | installé par winget, sur le PATH |
| Blender | 5.2.0 LTS | `C:\Program Files\Blender Foundation\Blender 5.2` |

La configuration client est dans [`.mcp.json`](../.mcp.json) à la racine.

⚠️ Le chemin `--directory` y est **absolu et propre à cette machine**. Sur une
autre installation, remplacer par le chemin réel de dépaquetage du `.mcpb`.

### Pourquoi le serveur officiel et pas `ahujasid/blender-mcp`

Les deux existent et fonctionnent. Le choix tient à trois points :

1. **Blender 5.2 est installé ici**, et l'add-on officiel demande 5.1+. La
   version communautaire vise 3.0+ « best effort » — donc rien ne garantit
   qu'elle suive les ruptures d'API 5.x.
2. **`search_api_docs` et `search_manual_docs`** embarquent la référence Python
   et le manuel. Nos scripts tapent déjà dans des API qui ont bougé
   (`bpy.types.Action.slots`, `surface_render_method` dans
   `tools/audit_crew_blender.py`) : un serveur qui sait lire la doc de la
   version installée vaut mieux qu'un serveur qui devine.
3. La version communautaire ajoute Poly Haven, Sketchfab et des générateurs 3D.
   Ce dépôt n'en veut pas : `ASSET_BACKLOG.md` interdit déjà toute image sous
   licence virale dans un générateur, et la provenance de chaque pièce est
   tracée. Moins de portes d'entrée, moins d'audit.

### Comment ça a été installé (reproductible)

L'add-on n'est pas sur `extensions.blender.org` — il vit sur le dépôt Blender
Lab. Le glisser-déposer de la page officielle marche, mais la ligne de commande
est rejouable :

```bash
BL="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
curl -sSL -o mcp-1.0.0.zip \
  https://projects.blender.org/lab/blender_mcp/releases/download/v1.0.0/mcp-1.0.0.zip
"$BL" --command extension install-file --repo user_default --enable mcp-1.0.0.zip
```

Le pont MCP est un `.mcpb` (une archive zip) à dépaqueter puis `uv sync` :

```bash
curl -sSL -o blender.zip \
  https://projects.blender.org/lab/blender_mcp/releases/download/v1.0.0/blender-1.0.0.mcpb
# dépaqueter dans %LOCALAPPDATA%\blender-mcp, puis :
uv sync --directory "$LOCALAPPDATA/blender-mcp"
```

L'add-on ayant été posé par fichier et non par dépôt, **il ne remontera pas ses
mises à jour tout seul**. Pour les recevoir, ajouter le dépôt
`https://lab.blender.org/` dans `Edit → Preferences → Extensions → Repositories`.

## Vérifier que la chaîne est vivante

Trois étages, chacun peut tomber seul :

1. **Blender ouvert**, add-on actif (`Edit → Preferences`, chercher « MCP »).
   Le panneau doit afficher *Server is running* sur `localhost:9876`.
2. **Le pont** répond même sans Blender — il démarre, mais tout outil de scène
   échouera.
3. **Le client** liste 26 outils.

Si les outils `_for_cli` marchent et que les autres échouent, c'est l'étage 1 :
Blender n'est pas ouvert ou le serveur du panneau n'est pas démarré.

## Partage des rôles — la règle qui protège le dépôt

> **MCP produit un `.blend`. Les scripts produisent le `.glb`.**

Ce dépôt tient parce que ses assets sont **régénérables** : `npm run assets:bake`
réécrit la coque de référence à l'octet près, `audit_crew_blender.py` relit
`CREW_JOINTS` depuis la source et pas depuis une copie, et `verify_static.py`
fait échouer le build sur un précache incohérent.

MCP est l'inverse : il pilote une instance Blender **avec état**, et une
conversation ne se rejoue pas. Laisser MCP écrire directement dans
`assets/models/` détruirait la seule propriété qui rend le reste vérifiable.

| MCP a le droit de… | …et surtout pas de |
|---|---|
| ouvrir un GLB, mesurer, comparer aux sections du contrat | écrire dans `assets/models/` |
| sculpter et itérer dans un `.blend` | remplacer un asset livré |
| poser des pole targets et **voir** le coude plier | modifier `src/` |
| répondre « quelle API bpy pour ça en 5.2 » | contourner `fit_hull_glb.py` |
| rendre une vignette pour comparer à une photo | ajouter une entrée de précache |

Les `.blend` de travail restent **hors du paquet** : `.gitignore` et
`.railwayignore` les excluent, comme `art-source/` et `previews/`.

## Ce à quoi ça sert ici, concrètement

Par ordre d'utilité réelle sur ce projet :

1. **Diagnostiquer la coque livrée.** `yole_hull.glb` s'écarte du contrat
   (médiane 207 mm sur la ligne de quille, 381 mm à l'étrave). Le test
   `test/hull-contract.test.mjs` le mesure désormais, mais il ne dit pas
   *pourquoi*. Ouvrir le GLB et superposer les neuf sections de référence, si.
2. **Les quatre pole targets du rig d'équipage.** `CREW_AUTHENTICITY_AUDIT.md`
   les classe en priorité haute depuis le 1er août. C'est vingt minutes dans
   Blender et c'est impossible à l'aveugle : il faut voir le coude plier.
3. **La voile, le mât et les bwa**, encore procéduraux. `ASSET_CONTRACT.md` les
   liste en « pièces à venir ».
4. **Auditer un rig avant intégration**, en complément de
   `tools/audit_crew_blender.py` qui, lui, reste le verrou automatisable.

## Limites constatées

- `execute_blender_code` demande une session Blender ouverte ; les variantes
  `*_for_cli` ouvrent un Blender de fond et fonctionnent sans GUI.
- Le serveur n'exporte pas de glTF tout seul : passer par
  `bpy.ops.export_scene.gltf` dans le code exécuté, puis **repasser par
  `fit_hull_glb.py`** avant tout branchement.
- Le socket est en clair sur `localhost:9876`. Ne pas l'exposer.
