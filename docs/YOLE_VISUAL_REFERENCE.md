# Référence visuelle — yole ronde de Martinique

Ce document verrouille la silhouette utilisée par le jeu et par les futurs
assets promotionnels. Le style peut être low-poly et arcade ; l'architecture de
l'embarcation, elle, ne doit pas être réinventée.

## Sources de référence

- UNESCO, dossier 01582 et décision 15.COM 8.c.2 :
  <https://ich.unesco.org/en/Decisions/15.COM/8.c.2>
- Photothèque UNESCO du programme de sauvegarde :
  <https://ich.unesco.org/en/8c-register-01147?call=slideshow&id=01582&include=slideshow_inc.php&mode=scroll&width=620>
- Martinique Tourisme, présentation de la yole ronde :
  <https://www.martinique.org/fr/tout-savoir/culture/tour-de-martinique-des-yoles-rondes>
- Site du Tour, présentation de l'embarcation :
  <https://tourdesyoles.com/40-ans-competition-martinique/>

Les deux photographies fournies par le propriétaire du projet le 30 juillet
2026 servent de références rapprochées pendant cette passe de production. Elles
restent hors du paquet distribué tant que leurs droits de redistribution ne sont
pas établis.

## Invariants de silhouette

- Coque unique en bois, longue d'environ dix mètres, très étroite, légère,
  effilée et de faible tirant d'eau.
- Aucune quille et aucun gouvernail. Le patron gouverne avec une pagaie.
- Aucun flotteur latéral, aucun second corps de coque, aucun cadre d'outrigger.
- Les `bwa dressés` sont de longues perches amovibles. En course, elles portent
  l'équipage principalement du côté au vent et ne forment pas une grille
  symétrique permanente.
- Les équipiers constituent le ballast mobile : accroupis, couchés ou suspendus
  loin à l'extérieur de la coque, serrés sur les bwa, en effort collectif.
- La yole navigue avec une ou deux voiles selon la pratique représentée. Pour le
  Tour moderne montré par les références du projet, privilégier la grande voile
  haute, quadrangulaire/trapézoïdale ; ne pas substituer un gréement bermudien
  de yacht moderne.
- La forte gîte, la flexion des bwa, les corps en rappel et la coque presque au
  ras de l'eau sont les quatre indices visuels prioritaires.

## Interdits pour ImageGen et le rendu 3D

- catamaran, trimaran ou pirogue polynésienne à balancier ;
- cage de bambou identique des deux côtés ;
- équipiers assis en rang comme des rameurs ;
- coque large de canot, cockpit de plaisance ou pont de yacht ;
- barre à roue, gouvernail moderne, quille visible ;
- voile triangulaire générique utilisée par défaut ;
- sponsor ou logo réel inventé, déformé ou reproduit sans autorisation.

## Ordre de validation d'un asset

1. silhouette de coque ;
2. côté au vent et implantation des bwa ;
3. posture et densité de l'équipage ;
4. gréement ;
5. gîte et ligne de flottaison ;
6. seulement ensuite : décor, lumière, combat et effets.

Un asset qui échoue sur l'un des cinq premiers points n'entre pas dans le jeu,
même s'il est spectaculaire.

## État du rendu 3D procédural (distinct des bitmaps en pause)

La passe du 30 juillet 2026 a corrigé par le code la silhouette runtime sans
toucher à la physique. Cette correction n'est pas un asset de menu validé :

- ratio visuel longueur/largeur de coque porté de **5,14 à 6,12** ;
- débord maximal des bwa côté sous le vent limité à **0,85 m** ;
- portée minimale côté au vent portée à **4,47 m** ;
- voile quadrangulaire, forte gîte et équipage bas/en rappel conservés ;
- les métriques de coque et de bwa ci-dessus, ainsi que la pose de l'équipage,
  sont verrouillées par `test/crew-seating.test.mjs` ; le gréement et la lecture
  de la gîte restent soumis à validation visuelle.

Les six bitmaps de menu V6 restent à remplacer. Leur génération est gelée
jusqu'à validation visuelle explicite d'un pilote conforme. Un pilote amélioré
existe hors du paquet, mais il n'est ni validé ni branché ; aucune autre
génération ne doit partir avant accord explicite.
