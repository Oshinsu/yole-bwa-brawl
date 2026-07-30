import { clamp, damp } from "../core/math.js";
import {
  HANDLING_MOTION,
  prefersReducedMotion,
  sampleHandlingMotion
} from "./handling-motion.js";
import { AssetLibrary, CREW_JOINTS } from "./assets.js";

// Hauteur de l'équipier procédural, reprise comme cible pour tout rig importé.
const CREW_TARGET_HEIGHT = 1.18;

// Déport latéral au-delà duquel un équipier est considéré totalement sorti sur
// le bois.
// Il suit CREW_RAIL : si le déport de repos augmente sans lui, `hike` sature à
// 1 en permanence et l'équipage ne rentre plus jamais quand la gîte mollit.
const CREW_HIKE_SPAN = 3.0;

// ─── POSE DE RAPPEL — d'après photo de course ────────────────────────────────
//
// ⚠️ Le défaut corrigé ici était GÉOMÉTRIQUE, pas esthétique.
//
// Les bois sont des cylindres tournés de 90° sur Z : leur axe est X, ils
// sortent perpendiculairement à la coque. Les équipiers, eux, gardaient un
// lacet de ZÉRO — ils regardaient vers la proue. Un homme assis face à +Z sur
// un bois qui court de gauche à droite n'est à cheval sur rien : il flottait
// en travers de la perche, et c'est ce qui faisait qu'il ne semblait pas
// attaché au bateau.
//
// Sur les photos du Tour, le corps est ALIGNÉ SUR LE BOIS, tête vers le large,
// jambes repliées vers la coque. Le bassin est le point d'appui, le buste
// bascule au-dessus de l'eau et les jambes remontent de l'autre côté : une
// balance, pas un passager assis.
//
// Le lacet ne va pas jusqu'à 90° : à pleine sortie on garde ~78°, ce qui laisse
// lire l'épaule et le maillot au lieu d'une silhouette de profil pur.
const CREW_HIKE_YAW = 1.36;
// Bascule du buste au-dessus de l'eau. L'ancienne valeur (0,62 rad appliquée à
// la racine) tenait l'homme presque droit ; la photo montre un renversement
// franc, tête plus basse que le bassin sur les hommes du bout.
// ⚠️ Valeur RETENUE APRÈS CAPTURE, pas calculée. À 1,62 (66° mesurés) les
// hommes passaient à l'horizontale et lisaient comme des plongeurs en vol :
// épaules très au large, bras traînant derrière, plus aucune assise lisible.
// 1,30 donne ~50°, ce que montrent les photos de course.
const CREW_HIKE_RECLINE = 1.30;
// Ouverture des cuisses de part et d'autre du bois. C'est ce qui fait lire
// « à califourchon » plutôt que « posé dessus ».
const CREW_STRADDLE = 0.34;
// Repli des jambes vers la coque. Sur une balance, le contrepoids d'un côté
// implique le repli de l'autre — sans ça, le buste part au large et les jambes
// suivent, ce qui n'accroche plus rien.
const CREW_LEG_HOOK = 0.62;
// Les mains vont chercher le bois EN ARRIÈRE du bassin. C'est le seul point de
// contact visible autre que l'assise, et c'est lui qui dit « accroché ».
// ⚠️ Cette valeur est comptée APRÈS annulation du renversement du bassin : il
// faut donc d'abord repayer le `recline` (~1,1 rad à pleine sortie) avant que le
// bras ne parte réellement vers l'arrière. Une valeur de 0,86 laissait les mains
// pendre à la verticale — visuellement, l'homme ne tenait rien.
const CREW_GRIP_REACH = 2.05;
// Variation de posture d'un homme à l'autre. Un équipage n'est pas six copies
// du même geste : ±12 % sur le renversement suffit à casser l'effet clone.
// Gorgée de rhum : retard entre deux hommes, et durée d'une gorgée.
const CREW_DRINK_STAGGER = 0.16;
const CREW_DRINK_SIP = 0.85;
const CREW_POSTURE = [1.0, 0.88, 1.12, 0.94, 1.06, 0.9];

// Position en z des sept bois dressés. L'équipage en DÉRIVE (CREW_BEAMS) au
// lieu de porter sa propre table : sinon les deux dérivent l'une de l'autre, ce
// qui était le cas — aucun équipier n'était aligné sur un bois, l'écart allait
// de 0,15 à 0,50 m.
// Longueurs raccourcies d'environ 28 % : combinées au débord d'un seul bord,
// les anciennes perches portaient à 6,6 m du centre, très au-delà de ce que
// montrent les photos de course.
const BEAM_LAYOUT = [[-3.05, 5.6], [-2.15, 6.2], [-1.05, 6.6], [0.0, 6.7], [1.0, 6.4], [1.95, 6.0], [2.85, 5.3]];

// Quel bois porte quel équipier, de la proue vers la poupe : la simulation fait
// partir l'index 0 en premier (crewDelays[i] = i * 0,045), et c'est le dresseur
// le plus en avant qui sort d'abord. Le bois 0, tout à l'arrière, reste libre —
// c'est le poste du patron.
const CREW_BEAMS = [6, 5, 4, 3, 2, 1];

// Distance de repos de chaque yoleur le long de son bois, en mètres.
//
// Les corps sont ÉTAGÉS. Sur les photos, le groupe dessine une DIAGONALE par
// rapport à la coque, pas une rangée parallèle — et c'est ce trait-là qui
// survit à la réduction : une ligne oblique de six taches se lit à dix pixels,
// une flexion de genou non. Le déport latéral vaut 10,5 à 15,4 px/m à l'écran
// contre 2,7 à 4,5 px/m pour le déport longitudinal, la caméra regardant
// presque le long de l'axe de la coque.
// ⚠️ Sorties VÉRIFIÉES contre la portée réelle de chaque bois : au déport
// maximal, l'homme le plus sorti atteint 89 % de sa perche, aucun ne dépasse la
// pointe. Les valeurs précédentes le laissaient entre 20 et 49 % — l'équipage
// restait collé à la coque alors que la photo montre une grappe portée loin
// au-dessus de l'eau.
const CREW_RAIL = [1.15, 1.85, 2.50, 1.50, 2.20, 2.85];

// Débord des bois du côté au vent. Une yole ne porte pas un peigne symétrique :
// les perches dépassent très loin d'UN bord, celui où l'équipage sort.
const BEAM_OFFSET = 1.6;

// Hauteur des bois dressés, reprise de leur construction (beamRoot.position.y).
// C'est la cote d'assise de l'équipage : les deux DOIVENT rester d'accord.
const CREW_BEAM_Y = 0.25;

// Descente du bassin pour qu'il repose SUR le bois au lieu de flotter au-dessus
// (mesuré : 0,324 m d'écart au repos). Réservé au rig importé — le corps
// procédural a d'autres proportions et garde sa pose.
const CREW_SEAT_Y = -0.055;

// Retard de l'effort d'un équipier au suivant, de la proue vers la poupe. Il
// valait 1,13 rad, soit un déphasage de 65° : chacun battait la mesure dans son
// coin. Un équipage de yole travaille à l'unisson, avec juste ce qu'il faut de
// décalage pour que le geste se lise comme une vague.
const CREW_LAG = 0.17;

// Gabarits d'équipiers. Un équipage n'est pas six clones : ±9 % de taille se
// lit franchement même à 13 px, et ça ne coûte pas un seul asset.
// Teintes de peau de l'équipage — partagées avec les noyés, pour que l'homme
// qui tombe soit le même que celui qui était à bord.
export const CREW_SKINS = [0x5d3328, 0x78442f, 0x955b3e, 0xb87852, 0x6c3a2c, 0x8b4e36];
const CREW_BUILD = [1.0, 0.91, 1.08, 0.95, 1.04, 0.88];

// Trois coiffes partagées par les six équipiers d'une yole. Casquette claire,
// foulard, et locks — la variante sombre et haute qui déborde du crâne.
export function makeHeadKits(THREE) {
  if (!THREE.SphereGeometry || !THREE.MeshStandardMaterial) return null;
  const dome = new THREE.SphereGeometry(0.115, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const mop = new THREE.SphereGeometry(0.125, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.78);
  return [
    { geometry: dome, material: new THREE.MeshStandardMaterial({ color: 0xf2f7f0, roughness: 0.62 }), lift: 0, scale: { x: 1, y: 1, z: 1 } },
    { geometry: dome, material: new THREE.MeshStandardMaterial({ color: 0xffc531, roughness: 0.58 }), lift: -0.01, scale: { x: 1.04, y: 0.72, z: 1.04 } },
    { geometry: mop, material: new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.86 }), lift: -0.03, scale: { x: 1.12, y: 1.25, z: 1.12 } }
  ];
}

// Rake des mâts vers l'avant, en radians (~9°).
const MAST_RAKE = 0.155;

function makeHullGeometry(THREE) {
  const z = [-5.55, -4.7, -3.2, -1.5, 0, 1.7, 3.35, 4.72, 5.55];
  const width = [0.05, 0.48, 0.82, 1.0, 1.08, 1.0, 0.78, 0.42, 0.04];
  const positions = [];
  const indices = [];
  for (let index = 0; index < z.length; index++) {
    const keel = -0.62 + Math.abs(z[index]) * 0.028;
    positions.push(-width[index], 0.04, z[index]);
    positions.push(width[index], 0.04, z[index]);
    positions.push(0, keel, z[index]);
  }
  for (let index = 0; index < z.length - 1; index++) {
    const a = index * 3;
    const b = (index + 1) * 3;
    indices.push(a, b, a + 2, b, b + 2, a + 2);
    indices.push(a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeSailGeometry(THREE, columns = 8, rows = 12) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    const y = 0.48 + v * 5.55;
    const width = 3.65 * (1 - v * 0.64);
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      positions.push(0.055, y, 0.55 - u * width);
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.basePositions = new Float32Array(positions);
  geometry.userData.columns = columns;
  geometry.userData.rows = rows;
  return geometry;
}

function cylinderBetween(THREE, radius, length, material) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, length, 7), material);
}

// Le rig d'équipage sort du générateur avec UNE seule texture couvrant peau ET
// tissu : teinter `material.color` repeindrait aussi la peau. Mesuré sur la
// texture livrée, les deux populations sont franchement bimodales — le tissu
// occupe 39 % des texels à chroma 0,0-0,1 (moyenne 228,223,216), la peau 60 % à
// chroma 0,7-0,8 (moyenne 111,48,36). On masque donc par chroma et luminance et
// on ne multiplie la couleur d'équipe que sur le tissu.
//
// Un matériau par yole, partagé par ses six équipiers : SkeletonUtils.clone()
// duplique la hiérarchie mais PARTAGE les matériaux, donc teinter sans cloner
// habillerait les 24 équipiers de la même couleur — c'est exactement le défaut
// qu'on corrige ici.
function makeCrewMaterial(THREE, rig, color) {
  let source = null;
  rig.traverse((node) => { if (!source && node.material) source = node.material; });
  if (!source?.clone) return null;
  const material = source.clone();
  material.emissiveIntensity = 0;
  const teamTint = { value: new THREE.Color(color) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTeam = teamTint;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform vec3 uTeam;`)
      // Après map_fragment, diffuseColor porte la texture décodée en espace
      // LINÉAIRE : les seuils ci-dessous sont les valeurs mesurées converties,
      // pas celles lues dans le fichier sRGB.
      .replace("#include <map_fragment>", `#include <map_fragment>
        {
          float mx = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
          float mn = min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b);
          float chroma = (mx - mn) / max(mx, 1e-4);
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          // smoothstep est indéfini quand edge0 >= edge1 : on inverse au lieu
          // de passer les bornes à l'envers.
          float cloth = (1.0 - smoothstep(0.14, 0.30, chroma)) * smoothstep(0.28, 0.50, lum);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTeam, cloth);
        }`);
  };
  material.needsUpdate = true;
  return material;
}

// ⚠️ EXPORTÉ POUR LES NOYÉS. `CrewFallPool` construisait son propre mannequin
// (`createCrewDummy`) : torse et tête aux mauvaises proportions, quatre membres
// figés sans articulation, et aucune coiffe. Les hommes à l'eau n'étaient donc
// PAS les yoleurs du bateau — c'était visible et ça cassait l'illusion.
// Sans rig, ce constructeur bâtit exactement le corps procédural de bord.
export class CrewVisual {
  constructor(THREE, skinColor, jerseyColor, accentColor, phase, rig = null, crewMaterial = null) {
    this.phase = phase;
    // Variation de posture, posée par le constructeur de YoleVisual. Défaut
    // neutre pour que la classe reste utilisable seule (tests, harnais).
    this.posture = 1;
    this.root = new THREE.Group();
    this.root.userData.phase = phase;
    this.wasActive = true;
    this.fall = 0;
    this.fallSpin = phase * 0.37;
    this.fromRig = false;

    // Un rig GLB fournit la même hiérarchie sous d'autres noms : on lie les sept
    // articulations pilotées et update() ne change pas d'une ligne. Rig absent
    // ou incomplet => corps procédural, jamais un équipier à moitié animé.
    if (rig && this.bindRig(THREE, rig)) {
      if (crewMaterial) rig.traverse((node) => { if (node.material) node.material = crewMaterial; });
      this.root.add(rig);
      this.fromRig = true;
      return;
    }

    const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.82 });
    const jersey = new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: 0.66 });
    const shorts = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.78 });

    this.hips = new THREE.Group();
    this.hips.position.y = 0.38;
    this.root.add(this.hips);

    this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.46, 8), jersey);
    this.torso.position.y = 0.26;
    this.hips.add(this.torso);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), skin);
    this.head.position.y = 0.66;
    this.hips.add(this.head);

    this.leftArmPivot = new THREE.Group();
    this.rightArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.16, 0.48, 0);
    this.rightArmPivot.position.set(0.16, 0.48, 0);
    this.leftArm = cylinderBetween(THREE, 0.045, 0.38, skin);
    this.rightArm = cylinderBetween(THREE, 0.045, 0.38, skin);
    this.leftArm.position.y = -0.18;
    this.rightArm.position.y = -0.18;
    this.leftArmPivot.add(this.leftArm);
    this.rightArmPivot.add(this.rightArm);
    this.hips.add(this.leftArmPivot, this.rightArmPivot);

    this.leftLegPivot = new THREE.Group();
    this.rightLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.075, 0.05, 0);
    this.rightLegPivot.position.set(0.075, 0.05, 0);
    this.leftLeg = cylinderBetween(THREE, 0.052, 0.44, shorts);
    this.rightLeg = cylinderBetween(THREE, 0.052, 0.44, shorts);
    this.leftLeg.position.y = -0.2;
    this.rightLeg.position.y = -0.2;
    this.leftLegPivot.add(this.leftLeg);
    this.rightLegPivot.add(this.rightLeg);
    this.hips.add(this.leftLegPivot, this.rightLegPivot);
  }

  // Toutes les articulations doivent répondre : un rig partiel serait pire que
  // pas de rig du tout (membres figés au milieu d'un corps animé).
  bindRig(THREE, rig) {
    const bound = {};
    for (const [logical, aliases] of Object.entries(CREW_JOINTS)) {
      const joint = AssetLibrary.findJoint(rig, aliases);
      if (!joint) return false;
      bound[logical] = joint;
    }
    // Le jeu ne pilote que des ROTATIONS : les proportions du rig source sont
    // donc libres. On normalise seulement la taille et on repose les pieds sur
    // le pont, ce qui rend acceptable un squelette Meshy ou Mixamo à 1,70 m.
    //
    const measured = this.measureRigHeight(THREE, rig);
    if (measured && measured.height > 1e-3) {
      const scale = CREW_TARGET_HEIGHT / measured.height;
      rig.scale.setScalar(scale);
      rig.position.y = -measured.min * scale;
    }

    // Un SkinnedMesh est culé sur une sphère englobante calculée en espace de
    // bind : posé sur une yole qui bouge et anime son squelette, il disparaît
    // par intermittence. Les équipiers sont minuscules et toujours collés à une
    // coque déjà visible — le culling individuel ne rapporte rien ici.
    rig.traverse((node) => {
      if (node.isSkinnedMesh || node.isMesh) node.frustumCulled = false;
    });
    // update() écrit des rotations ABSOLUES : c'est l'héritage du corps
    // procédural, dont chaque pivot a l'identité pour repos. Un squelette réel
    // (Meshy, Mixamo) a des rotations de repos non identitaires — les écraser
    // détruit la pose de bind et le maillage s'effondre, invisible.
    //
    // On expose donc des proxys à update(), et syncRig() compose leur rotation
    // AVEC le repos de l'os. update() reste inchangé.
    // L'os réel de la tête, AVANT que la boucle suivante ne le remplace par son
    // proxy : c'est lui qui portera la calotte, un proxy n'étant pas dans le
    // graphe de scène.
    this.headBone = bound.head;
    this.rigJoints = [];
    for (const logical of Object.keys(bound)) {
      const joint = bound[logical];
      const proxy = new THREE.Object3D();
      this.rigJoints.push({ proxy, joint, rest: joint.quaternion.clone() });
      bound[logical] = proxy;
    }

    Object.assign(this, bound);
    return true;
  }

  // Une calotte claire sur chaque tête. À 13 px de haut sur téléphone,
  // l'équipage est un liseré brun sur un fond de coque presque noir : ces 2 px
  // clairs sont ce qui permet de COMPTER les hommes. Coût mesuré à l'écran, et
  // c'est le seul détail de personnage qui survive à cette réduction.
  // Trois coiffes, UNE SEULE maille par équipier dans tous les cas : à 13 px de
  // haut c'est la silhouette qui distingue les hommes, pas la géométrie fine.
  // Casquette, foulard, et locks — qui se lisent comme une masse sombre plus
  // haute et plus large que le crâne, ce qui suffit et coûte zéro triangle de
  // plus qu'une casquette.
  addHeadgear(THREE, headJoint, kit) {
    if (!headJoint || !kit) return;
    const gear = new THREE.Mesh(kit.geometry, kit.material);
    gear.position.y = (this.fromRig ? 0.09 : 0.045) + kit.lift;
    gear.scale.set(kit.scale.x, kit.scale.y, kit.scale.z);
    gear.frustumCulled = false;
    headJoint.add(gear);
    this.headgear = gear;
  }

  // Sur un rig skinné, Box3 ment : un GLB Meshy porte une Armature à l'échelle
  // 0,01 (convention centimètres) et une géométrie déjà exprimée en mètres, donc
  // la boîte renvoie 0,017 pour un personnage de 1,70 m — d'où un facteur ×69 et
  // des équipiers hauts comme des mâts.
  //
  // Les positions monde des OS, elles, sont exactes : elles décrivent ce qui est
  // réellement rendu. On mesure là, et on retombe sur Box3 seulement pour les
  // rigs sans squelette (hiérarchie de nœuds simples, comme le gabarit).
  measureRigHeight(THREE, rig) {
    if (!THREE?.Box3 || !rig.updateWorldMatrix) return null;
    rig.updateWorldMatrix(true, true);
    let skeleton = null;
    rig.traverse((node) => {
      if (!skeleton && node.isSkinnedMesh && node.skeleton?.bones?.length) skeleton = node.skeleton;
    });
    if (skeleton) {
      const position = new THREE.Vector3();
      let min = Infinity;
      let max = -Infinity;
      for (const bone of skeleton.bones) {
        position.setFromMatrixPosition(bone.matrixWorld);
        min = Math.min(min, position.y);
        max = Math.max(max, position.y);
      }
      if (Number.isFinite(min) && max > min) return { height: max - min, min };
    }
    const box = new THREE.Box3().setFromObject(rig, true);
    const height = box.max.y - box.min.y;
    return Number.isFinite(height) ? { height, min: box.min.y } : null;
  }

  // Rotation de repos × rotation de jeu, une fois par frame et par articulation.
  syncRig() {
    for (let index = 0; index < this.rigJoints.length; index++) {
      const { proxy, joint, rest } = this.rigJoints[index];
      joint.quaternion.copy(rest).multiply(proxy.quaternion);
    }
  }

  update(time, dt, x, z, velocity, roll, impact, active, stumble = 0, boostForward = 0, boostSide = 0, cadence = 0, bail = 0, drink = 0, cohesion = 1) {
    if (!active && this.wasActive) {
      this.fall = 1.25;
      this.fallSpin = Math.sign(x || 1) * (1.3 + this.phase * 0.08);
    }
    this.wasActive = active;

    if (!active && this.fall <= 0) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    if (!active) {
      this.fall -= dt;
      const progress = 1 - clamp(this.fall / 1.25, 0, 1);
      this.root.position.x += Math.sign(x || 1) * dt * (1.8 + progress * 2.5);
      this.root.position.y = 0.2 - progress * progress * 2.2;
      this.root.position.z = z - progress * 0.7;
      this.root.rotation.x += dt * 3.2;
      this.root.rotation.z += dt * this.fallSpin * 3.6;
      return;
    }

    this.root.rotation.set(0, 0, 0);
    this.root.position.x = damp(this.root.position.x, x, 10.5, dt);
    this.root.position.z = z;
    const run = clamp(Math.abs(velocity) * 0.52, 0, 1);
    // ── LA COHÉSION SE VOIT SUR LES HOMMES, PAS SUR UNE JAUGE ────────────
    //
    // `cohesion` pilote déjà trois choses dans la simulation : la vitesse à
    // laquelle un équipier gagne le bout du bois, la cadence d'écopage, et le
    // couple de rappel que son poids produit. À 0,16 — le plancher — ils
    // rampent six fois plus lentement et ne rendent que 0,68× du rappel.
    //
    // ⚠️ RIEN N'AFFICHAIT CETTE VALEUR. Le HUD compte huit lecteurs et pas un
    // seul pour la cohésion, alors qu'elle est dépensée par le turbo, par
    // chaque coup encaissé, et qu'elle était l'effet PRINCIPAL du lambi. Le
    // joueur subissait un équipage devenu mou sans jamais savoir pourquoi.
    //
    // Un neuvième chiffre à l'écran aurait empiré le HUD. On la lit donc sur le
    // bateau : plus l'équipage est désorganisé, plus il S'AVACHIT — buste
    // affaissé, prise molle sur le bois.
    //
    // ⚠️ UNE DÉSYNCHRONISATION AVAIT ÉTÉ TENTÉE, PUIS RETIRÉE. L'idée était de
    // déphaser les six hommes à mesure que la cohésion tombe. Mesuré : à
    // cohésion PLEINE, les instants de pic des six bras valent déjà
    // [67, 67, 66, 41, 40, 39] — l'équipage n'est PAS synchrone au départ.
    // `CREW_LAG` le décale volontairement : c'est la vague qui parcourt le
    // bateau, le geste d'une bordée qui travaille. Désynchroniser davantage ne
    // se lit donc pas comme « désorganisé », seulement comme un autre motif.
    //
    // Le retard réel des équipiers désorganisés est d'ailleurs DÉJÀ simulé :
    // `individualSpeed` est multiplié par `cohesion`, donc ils gagnent le bout
    // du bois six fois plus lentement au plancher. Ce qui manquait n'était pas
    // le décalage, c'était la POSTURE.
    const desordre = clamp(1 - cohesion, 0, 1);
    // Le déphasage est proportionnel à l'index de l'homme : à cohésion pleine
    // ils sont sur la même mesure, à cohésion basse chacun bat la sienne.
    const cycle = time * (8 + run * 7) + this.phase;
    const stride = Math.sin(cycle) * 0.58 * run;
    const boostLean = clamp(boostForward, 0, 1) * 0.36;
    const dashLean = clamp(boostSide, -1, 1) * 0.34;

    // Un yoleur ne se tient pas debout. Une yole ronde n'a ni quille ni
    // gouvernail : TOUT le couple de redressement vient du poids des hommes
    // assis à califourchon sur les bois dressés. Ils sortent sur la perche
    // quand ça gîte, ils rentrent quand ça mollit — et c'est exactement ce que
    // la simulation calcule déjà dans crewPositions[i].
    //
    // On mélange donc deux poses selon le déport : à bord (accroupi, en appui)
    // et au bout du bois (assis, buste renversé vers l'extérieur).
    // ⚠️ La pose se calcule sur la position RÉELLEMENT DESSINÉE, pas sur la
    // position visée. `root.position.x` est amortie (damp à 10,5) : pendant un
    // rappel, la consigne peut déjà être à 0,5 m alors que le corps est encore
    // à 1,6 m. Prendre `x` mettait donc un homme assis loin sur la perche dans
    // la pose de quelqu'un resté à bord — bassin 0,36 m au-dessus du bois,
    // relevé par test/crew-seating.
    const drawnX = this.root.position.x;
    const side = Math.sign(drawnX || x || 1);
    const hike = clamp(Math.abs(drawnX) / CREW_HIKE_SPAN, 0, 1);
    const settle = 1 - hike;

    // Un équipage de yole travaille À L'UNISSON. La seule animation existante
    // était une foulée pilotée par `velocity`, la vitesse de déplacement LATÉRAL
    // de l'équipier : sorti sur son bois il ne se déplace plus, donc `run` tombe
    // à zéro et l'homme se fige. Il l'était 87 % du temps — six statues.
    //
    // `cadence` est partagée par les six équipiers d'une même yole ; `this.phase`
    // ne vaut plus qu'un léger retard de proue en poupe, pour que l'effort se
    // propage en vague au lieu que chacun batte la mesure dans son coin.
    const pump = Math.sin(cadence + this.phase);
    // Sorti sur la perche on ne tient pas immobile : on relance le rappel à
    // chaque houle, buste et bras en opposition. L'amplitude suit le déport,
    // parce que c'est là que l'effort est réel.
    // ⚠️ NE PAS RÉDUIRE `effort` AVEC LA COHÉSION. Mesuré deux fois : c'est ce
    // terme qui porte la variation PROPRE À CHAQUE HOMME (`pump` vaut
    // `sin(cadence + this.phase)`, donc il diffère d'un équipier à l'autre). Le
    // rabattre uniformisait les six et faisait TOMBER la dispersion — 0,195 rad
    // à cohésion pleine contre 0,091 à cohésion cassée, soit un équipage
    // désorganisé qui paraissait plus soudé qu'un équipage à plein régime.
    //
    // L'avachissement doit passer par ce qui est COMMUN aux six (la tenue, le
    // buste), jamais par ce qui les distingue.
    const effort = (0.35 + hike * 0.65) * (0.6 + run * 0.4);
    // Écopage : poste PERMANENT en course, pas une réparation d'après-chavirage.
    // Seul l'homme resté à bord écope, et plus vite que la houle.
    const scoop = bail * settle * Math.max(0, Math.sin(cadence * 2.1 + this.phase * 1.7));

    // LACET — on se tourne vers le large à mesure qu'on sort sur le bois.
    //
    // C'est la correction de fond : le corps s'aligne sur l'axe de la perche au
    // lieu de rester en travers. Une rotation POSITIVE sur Y amène la face de
    // +Z vers +X, donc `side` suffit à envoyer l'homme du bon bord. À bord
    // (hike = 0) le lacet retombe à zéro et l'équipier regarde la proue, comme
    // avant.
    const yaw = side * hike * CREW_HIKE_YAW;
    this.root.rotation.y = yaw;
    // ⚠️ La bascule N'EST PLUS à la racine. Elle y faisait pivoter l'homme
    // autour de ses pieds, ce qui décollait le bassin du bois. Elle passe au
    // bassin, seul point réellement en appui.
    this.root.rotation.z = 0;

    // Dans ce repère tourné, +Z local pointe vers le large : renverser le buste
    // au-dessus de l'eau est donc un TANGAGE positif du bassin. Et comme les
    // jambes sont filles du bassin, elles remontent du même geste vers la
    // coque — la balance se fait toute seule, avec le bois pour pivot.
    const recline = hike * CREW_HIKE_RECLINE * this.posture;

    // Jambes : à califourchon de part et d'autre du bois, repliées vers la
    // coque.
    //
    // ⚠️ Le `-recline` n'est pas un réglage, il ANNULE la rotation héritée du
    // bassin. Sans lui, les cuisses suivaient le buste vers le large et les
    // hommes finissaient DEBOUT sur la perche, en équilibre comme sur un fil.
    // On repart donc de la verticale, puis on replie vers la coque.
    this.leftLegPivot.rotation.x = stride * settle - recline - hike * CREW_LEG_HOOK;
    this.rightLegPivot.rotation.x = -stride * settle - recline - hike * CREW_LEG_HOOK;
    this.leftLegPivot.rotation.z = CREW_STRADDLE * hike;
    this.rightLegPivot.rotation.z = -CREW_STRADDLE * hike;

    // Bras : ils vont chercher le bois EN ARRIÈRE du bassin, et se resserrent
    // au lieu de s'écarter. C'est le point de contact qui manquait — sans lui
    // l'homme paraît posé sur la perche, pas accroché à elle.
    // Même correction que pour les jambes : on annule l'héritage du bassin pour
    // que les mains visent le bois, et pas le ciel.
    // Et il tient mal le bois : les mains lâchent du terrain quand ça se
    // désorganise, ce qui donne cette silhouette avachie qu'on reconnaît de loin.
    const grip = hike * CREW_GRIP_REACH * (1 - desordre * 0.30) - recline;
    this.leftArmPivot.rotation.x = (-stride * 0.9 - 0.25) * settle + grip + pump * effort * 0.30;
    this.rightArmPivot.rotation.x = (stride * 0.9 - 0.25) * settle + grip + pump * effort * 0.30 - scoop * 1.15;
    // L'écart latéral se REFERME avec la sortie : les deux mains convergent
    // vers la perche au lieu de rester en croix.
    const splay = 0.62 * settle + 0.16 * hike;
    this.leftArmPivot.rotation.z = -splay - impact * 0.8 - stumble * 0.45 - dashLean * 0.55;
    this.rightArmPivot.rotation.z = splay + impact * 0.8 + stumble * 0.45 - dashLean * 0.55;

    // Bassin : point d'appui sur le bois, buste renversé au-dessus de l'eau.
    this.hips.rotation.x = -0.12 + run * 0.16 * settle + recline
      + impact * Math.sin(cycle * 0.7) * 0.3 + stumble * 0.15 - boostLean
      + pump * effort * 0.17 + scoop * 0.42;
    this.hips.rotation.z = -roll * 0.28 * settle + velocity * 0.04
      + Math.sin(cycle * 0.4) * stumble * 0.18 - dashLean;
    // L'avachissement, lui, est COMMUN aux six : le buste s'affaisse et le
    // bassin s'écrase. C'est ce qu'on lit sur la silhouette de la bordée
    // entière, sans toucher à ce qui différencie les hommes entre eux.
    this.torso.rotation.x = -boostLean * 0.55 + hike * 0.14 - pump * effort * 0.22 + scoop * 0.55
      + desordre * 0.34;

    // ── LA GORGÉE DE RHUM ───────────────────────────────────────────────────
    //
    // Appliquée APRÈS la pose de course, en MÉLANGE et non en remplacement :
    // l'homme continue de tenir son bois et de suivre la houle, il porte juste
    // le goulot à la bouche. Écraser la pose ferait un mannequin figé au milieu
    // d'un bateau qui vit.
    //
    // ⚠️ Purement visuel — même règle que `setOverboard` : rien ici ne touche
    // `dynamics`, donc rien n'entre dans le checksum de replay.
    if (drink > 0.001) {
      // Bras droit levé, coude rentré : le geste du goulot, pas un salut.
      this.rightArmPivot.rotation.x += (-2.25 - this.rightArmPivot.rotation.x) * drink;
      this.rightArmPivot.rotation.z += (0.12 - this.rightArmPivot.rotation.z) * drink;
      // Tête et buste renversés en arrière — c'est ce mouvement-là qui se lit
      // de loin, bien plus que le bras.
      if (this.head) this.head.rotation.x += (0.62 - this.head.rotation.x) * drink;
      this.torso.rotation.x += (-0.34 - this.torso.rotation.x) * drink * 0.85;
      this.hips.rotation.x += (-0.20 - this.hips.rotation.x) * drink * 0.45;
    }
    this.torso.rotation.z = 0;
    // La tête garde le plan d'eau dans le regard : elle compense l'essentiel du
    // renversement du buste, sinon l'homme fixe le ciel.
    this.head.rotation.x = boostLean * 0.32 - recline * 0.62 + pump * effort * 0.10 - scoop * 0.30;
    this.head.rotation.z = 0;

    // ASSISE. À bord on est debout sur le pont (0,28) ; sorti sur le bois on
    // s'assoit DESSUS, donc le bassin descend au niveau de la perche.
    //
    // ⚠️ Mesuré : le groupe `hips` est à 0,38 au-dessus de la racine et les bois
    // à 0,25. Une racine laissée à 0,28 plaçait donc le bassin à 0,66, soit
    // 0,41 m AU-DESSUS de la perche — l'homme ne s'asseyait sur rien. C'est ça,
    // et pas la pose des membres, qui le faisait paraître détaché du bateau.
    //
    // ⚠️ L'assise ne suit PAS `hike`, qui mesure seulement à quelle distance on
    // est sorti. Être assis ou debout ne dépend pas de la distance mais du fait
    // d'avoir franchi le plat-bord (|x| = 0,90) : dès qu'on est dessus, on est
    // sur le bois. Lier les deux laissait un homme à 1,6 m — donc largement
    // au-dessus de l'eau — encore à moitié debout, bassin à 0,19 m de la perche.
    const seated = clamp((Math.abs(drawnX) - 0.75) / 0.75, 0, 1);
    const seat = CREW_BEAM_Y - 0.38;
    this.root.position.y = 0.28 * (1 - seated) + seat * seated
      + Math.abs(Math.sin(cycle)) * (0.035 + boostForward * 0.018) * run * (1 - seated);
    if (this.rigJoints) this.syncRig();
  }
}

export class YoleVisual {
  constructor(THREE, color, accent, index, assets = null) {
    this.THREE = THREE;
    this.assets = assets;
    this.color = color;
    this.accent = accent;
    this.index = index;
    this.root = new THREE.Group();
    this.tiltRoot = new THREE.Group();
    this.root.add(this.tiltRoot);
    this.handlingReducedMotion = prefersReducedMotion();

    // La texture de coque est NEUTRE et désaturée : elle est multipliée par la
    // couleur d'équipe. Une texture déjà colorée écraserait cette teinte et
    // ferait perdre au joueur la lecture du classement — les quatre yoles
    // partagent la même géométrie et ne se distinguent QUE par la couleur.
    const hullTexture = assets?.texture?.("hull") ?? null;
    this.hullMaterial = new THREE.MeshStandardMaterial({
      map: hullTexture,
      color,
      roughness: 0.4,
      metalness: 0.06,
      emissive: new THREE.Color(color).multiplyScalar(0.035)
    });
    // Ligne de flottaison : sans elle une coque est POSEE sur l'eau, jamais
    // dedans. On assombrit et on lustre la partie immergee, et on pose une
    // collerette d'ecume a la surface. Le niveau d'eau arrive en uniforme
    // depuis la simulation, donc la collerette suit la houle et la gite.
    this.waterLevelUniform = { value: 0 };
    this.hullMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterLevel = this.waterLevelUniform;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
varying vec3 vHullWorld;`)
        .replace("#include <project_vertex>", `vHullWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#include <project_vertex>`)
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
uniform float uWaterLevel;
varying vec3 vHullWorld;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          float belowWater = uWaterLevel - vHullWorld.y;
          float wet = smoothstep(-0.04, 0.30, belowWater);
          diffuseColor.rgb *= mix(1.0, 0.46, wet);
          float foam = smoothstep(0.16, 0.0, abs(belowWater));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.99, 1.0), foam * 0.8);
        `)
        // roughnessFactor n'est déclaré qu'ici : l'assigner depuis
        // <color_fragment> ne compile pas (identifiant inconnu).
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
          roughnessFactor *= mix(1.0, 0.42, smoothstep(-0.04, 0.30, uWaterLevel - vHullWorld.y));
        `);
    };

    this.accentMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.52 });
    this.darkMaterial = new THREE.MeshStandardMaterial({ color: 0x102531, roughness: 0.78 });
    // Le bois est partagé par les 7 bois dressés, le mât et la vergue : une
    // seule texture couvre 28 perches à l'écran.
    const woodTexture = assets?.texture?.("wood") ?? null;
    if (woodTexture && THREE.RepeatWrapping) {
      woodTexture.wrapS = THREE.RepeatWrapping;
      woodTexture.wrapT = THREE.RepeatWrapping;
    }
    this.woodMaterial = new THREE.MeshStandardMaterial({
      map: woodTexture,
      color: woodTexture ? 0xffffff : 0xd69542,
      roughness: 0.74
    });

    // La coque peut venir d'un GLB partage ; le materiau reste celui de l'equipage,
    // sinon les quatre yoles perdraient leur couleur. Aucun asset => procedural.
    const hullGeometry = assets?.get("hull") ?? makeHullGeometry(THREE);
    this.hullFromAsset = Boolean(assets?.has("hull"));
    this.hull = new THREE.Mesh(hullGeometry, this.hullMaterial);
    this.hull.castShadow = true;
    this.hull.receiveShadow = true;
    this.tiltRoot.add(this.hull);

    const gunwaleLeft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 8.8), this.accentMaterial);
    const gunwaleRight = gunwaleLeft.clone();
    gunwaleLeft.position.set(-0.88, 0.16, 0);
    gunwaleRight.position.set(0.88, 0.16, 0);
    this.tiltRoot.add(gunwaleLeft, gunwaleRight);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.11, 5.9), this.darkMaterial);
    deck.position.y = 0.10;
    this.tiltRoot.add(deck);

    this.internalWaterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1cc9e0,
      emissive: 0x075f78,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.0,
      roughness: 0.18,
      depthWrite: false
    });
    this.internalWater = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.035, 5.25), this.internalWaterMaterial);
    this.internalWater.position.y = 0.14;
    this.tiltRoot.add(this.internalWater);

    // Les mâts d'une yole sont nettement raqués VERS L'AVANT : c'est une part
    // majeure de sa silhouette, et elle manquait. Un groupe porte tout le
    // gréement arrière pour que voile, marque et déchirures suivent le rake.
    this.rigMain = new THREE.Group();
    this.rigMain.rotation.x = MAST_RAKE;
    this.tiltRoot.add(this.rigMain);

    this.mastGroup = new THREE.Group();
    this.mast = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.095, 6.35, 9), this.woodMaterial);
    this.mast.position.set(0, 3.08, 0.5);
    this.mast.castShadow = true;
    this.mastGroup.add(this.mast);
    this.rigMain.add(this.mastGroup);

    this.brokenMast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 3.1, 8), this.woodMaterial);
    this.brokenMast.position.set(0.15, 2.8, 0.2);
    this.brokenMast.visible = false;
    this.rigMain.add(this.brokenMast);

    this.sailGeometry = makeSailGeometry(THREE);
    // La voile est la plus grande surface d'une yole à l'écran, et elle a déjà
    // ses UV : c'est le meilleur rapport gain/effort de tout le rendu.
    // Atlas de voiles 2x2 : chaque yole prend sa case. C'est la personnalisation,
    // pour le prix d'un décalage d'UV — la voile est déjà UV-mappée.
    let sailTexture = assets?.texture?.("sail") ?? null;
    const atlas = assets?.texture?.("sailAtlas") ?? null;
    if (atlas) {
      sailTexture = atlas.clone();
      sailTexture.needsUpdate = true;
      sailTexture.repeat.set(0.5, 0.5);
      sailTexture.offset.set((index % 2) * 0.5, index < 2 ? 0.5 : 0);
    }
    this.sailMaterial = new THREE.MeshStandardMaterial({
      map: sailTexture,
      color: sailTexture ? 0xffffff : accent,
      side: THREE.DoubleSide,
      roughness: 0.52,
      transparent: false,
      opacity: 1,
      emissive: new THREE.Color(color).multiplyScalar(0.07)
    });
    this.sail = new THREE.Mesh(this.sailGeometry, this.sailMaterial);
    this.sail.castShadow = true;
    this.rigMain.add(this.sail);

    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.43, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    mark.position.set(0.075, 3.15, -0.58);
    mark.rotation.y = Math.PI / 2;
    this.rigMain.add(mark);

    this.sailTears = [];
    const tearGeometry = new THREE.CircleGeometry(0.18, 10);
    const tearMaterial = new THREE.MeshBasicMaterial({ color: 0x07141b, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
    for (const [y, z, scale] of [[2.1, -1.45, 1], [3.5, -0.7, 0.8], [4.55, -0.22, 0.65]]) {
      const tear = new THREE.Mesh(tearGeometry, tearMaterial);
      tear.position.set(0.068, y, z);
      tear.rotation.y = Math.PI / 2;
      tear.scale.set(scale, scale * 0.55, 1);
      tear.visible = false;
      this.sailTears.push(tear);
      this.rigMain.add(tear);
    }

    // Sur l'eau, les bois dressés forment un FAISCEAU serré sur lequel
    // l'équipage se déporte, pas quatre perches espacées. On densifie et on
    // fait varier les longueurs — c'est la signature visuelle du sport.
    this.beams = [];
    for (const [z, length] of BEAM_LAYOUT) {
      const beamRoot = new THREE.Group();
      beamRoot.position.set(0, 0.25, z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.068, length, 6), this.woodMaterial);
      beam.rotation.z = Math.PI / 2;
      beam.castShadow = true;
      beamRoot.add(beam);
      this.beams.push({ root: beamRoot, beam, baseZ: z });
      this.tiltRoot.add(beamRoot);
    }

    this.cracks = [];
    const crackMaterial = new THREE.MeshBasicMaterial({ color: 0x190e0b, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.2 + i * 0.15), crackMaterial.clone());
      crack.position.set((i % 2 ? 1 : -1) * 0.91, -0.15, -2.8 + i * 1.8);
      crack.rotation.y = i % 2 ? -Math.PI / 2 : Math.PI / 2;
      crack.rotation.z = 0.45 + i * 0.18;
      crack.visible = false;
      this.cracks.push(crack);
      this.tiltRoot.add(crack);
    }

    this.crew = [];
    this.crewMaterial = null;
    this.overboard = false;
    this.crewCulled = false;
    const skins = CREW_SKINS;
    const zPositions = CREW_BEAMS.map((beam) => BEAM_LAYOUT[beam][0]);
    for (let crewIndex = 0; crewIndex < 6; crewIndex++) {
      // Un squelette par équipier : instantiate() clone la hiérarchie ET sa
      // liaison d'os, sinon les 24 équipiers partageraient la même pose.
      const crewRig = assets?.hasRig("crew") ? assets.instantiate("crew") : null;
      if (crewRig && !this.crewMaterial) this.crewMaterial = makeCrewMaterial(THREE, crewRig, color);
      const visual = new CrewVisual(THREE, skins[(crewIndex + index) % skins.length], color, 0x0d2531, crewIndex * CREW_LAG, crewRig, this.crewMaterial);
      // Géométries et matériaux de coiffe créés UNE FOIS par yole et partagés
      // par ses six équipiers : trois variantes, aucun coût de draw call
      // supplémentaire par rapport à la casquette unique.
      if (!this.headKits) this.headKits = makeHeadKits(THREE);
      // Répartition déterministe : le décalage par `index` évite que les quatre
      // yoles portent la même séquence de coiffes.
      const kit = this.headKits[(crewIndex * 2 + index) % this.headKits.length];
      visual.addHeadgear(THREE, visual.fromRig ? visual.headBone : visual.head, kit);
      // Tous les yoleurs n'ont pas le même gabarit. Motif déterministe, pas de
      // tirage : un équipage doit être identique d'une relecture à l'autre.
      visual.root.scale.setScalar(0.88 * CREW_BUILD[(crewIndex + index * 3) % CREW_BUILD.length]);
      // Motif déterministe, pas de tirage : un équipage doit être identique
      // d'une relecture à l'autre, y compris dans ses postures.
      visual.posture = CREW_POSTURE[(crewIndex + index) % CREW_POSTURE.length];
      visual.root.position.z = zPositions[crewIndex];
      // Seul le rig importé s'assoit : la table de descente est dérivée de SES
      // proportions. Le corps procédural garde la sienne (voir CREW_SEAT_Y).
      if (visual.fromRig) visual.root.position.y = CREW_SEAT_Y;
      this.crew.push({ visual, z: zPositions[crewIndex] });
      this.tiltRoot.add(visual.root);
    }

    this.weaponPod = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.34, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x0c2634, metalness: 0.48, roughness: 0.34 })
    );
    this.weaponPod.position.set(0, 0.38, 3.55);
    this.tiltRoot.add(this.weaponPod);
    this.cannonGlow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 9), new THREE.MeshBasicMaterial({ color: 0x67f7ff }));
    this.cannonGlow.position.set(0, 0.48, 4.05);
    this.tiltRoot.add(this.cannonGlow);

    const turboMaterial = new THREE.MeshBasicMaterial({ color: 0xffdc4f, transparent: true, opacity: 0.0, depthWrite: false });
    this.turboFlame = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.4, 10), turboMaterial);
    this.turboFlame.rotation.x = Math.PI / 2;
    this.turboFlame.position.set(0, 0.18, 5.55);
    this.tiltRoot.add(this.turboFlame);
    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xff4ec4, transparent: true, opacity: 0.0, depthWrite: false });
    this.dashFlare = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.10, 6, 26), dashMaterial);
    this.dashFlare.rotation.x = Math.PI / 2;
    this.dashFlare.position.y = -0.05;
    this.tiltRoot.add(this.dashFlare);

    // Deux rails de mousse en un seul mesh : la direction du V montre l'angle
    // de glisse, sa largeur la derive et sa longueur le surf. Contrairement a
    // une gerbe de particules, ce repere reste lisible sans flash et ne cree
    // aucune allocation dans update(). Il est enfant de root (pas tiltRoot)
    // afin de rester plaque a l'eau quand la coque gite.
    const handlingWakeGeometry = new THREE.BufferGeometry();
    handlingWakeGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.28, 0, 0, -0.06, 0, 0, -1.48, 0, -6.8, -0.92, 0, -6.8,
       0.06, 0, 0,  0.28, 0, 0,  0.92, 0, -6.8,  1.48, 0, -6.8
    ], 3));
    handlingWakeGeometry.setIndex([
      0, 2, 1, 1, 2, 3,
      4, 6, 5, 5, 6, 7
    ]);
    const handlingWakeMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9fbff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.handlingWakeRoot = new THREE.Group();
    this.handlingWakeRoot.position.z = -3.65;
    this.handlingWake = new THREE.Mesh(handlingWakeGeometry, handlingWakeMaterial);
    this.handlingWake.renderOrder = 3;
    this.handlingWakeRoot.add(this.handlingWake);
    this.root.add(this.handlingWakeRoot);

    this.impact = 0;
    this.normalFrame = -1;
    this.handlingSample = {};
    this.handlingSlip = 0;
    this.handlingSlipAngle = 0;
    this.handlingSurf = 0;
    this.handlingRecovery = 0;
    this.handlingWakeStrength = 0;
  }

  resetHandlingFeedback() {
    this.handlingSlip = 0;
    this.handlingSlipAngle = 0;
    this.handlingSurf = 0;
    this.handlingRecovery = 0;
    this.handlingWakeStrength = 0;
    this.tiltRoot.position.x = 0;
    this.tiltRoot.position.y = 0;
    this.handlingWakeRoot.rotation.y = 0;
    this.handlingWakeRoot.scale.x = 0.72;
    this.handlingWakeRoot.scale.z = 0.72;
    this.handlingWake.material.opacity = 0;
    this.handlingWake.visible = false;
  }

  flashImpact(amount = 1) {
    this.impact = Math.max(this.impact, amount);
  }

  updateSail(time, windPower, storm, integrity) {
    const position = this.sailGeometry.attributes.position;
    const array = position.array;
    const base = this.sailGeometry.userData.basePositions;
    const columns = this.sailGeometry.userData.columns;
    const rows = this.sailGeometry.userData.rows;
    const damageFlutter = 1 - clamp(integrity, 0, 1);
    const billow = 0.14 + windPower * 0.28 + storm * 0.08;

    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      for (let column = 0; column <= columns; column++) {
        const u = column / columns;
        const vertex = row * (columns + 1) + column;
        const offset = vertex * 3;
        const envelope = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        const flutter = Math.sin(time * (6.5 + storm * 4) + u * 8.0 + v * 11.0) * (0.018 + damageFlutter * 0.12);
        array[offset] = base[offset] + envelope * billow + flutter * u;
        array[offset + 1] = base[offset + 1];
        array[offset + 2] = base[offset + 2] + flutter * 0.15;
      }
    }
    position.needsUpdate = true;
    const normalFrame = Math.floor(time * 10);
    if (this.sailGeometry.computeVertexNormals && normalFrame !== this.normalFrame && normalFrame % 3 === 0) {
      this.sailGeometry.computeVertexNormals();
      this.normalFrame = normalFrame;
    }
    const sailOpacity = 0.55 + integrity * 0.45;
    this.sailMaterial.opacity = sailOpacity;
    const wantsTransparency = sailOpacity < 0.985;
    if (this.sailMaterial.transparent !== wantsTransparency) {
      this.sailMaterial.transparent = wantsTransparency;
      this.sailMaterial.depthWrite = !wantsTransparency;
      this.sailMaterial.needsUpdate = true;
    }
    for (let i = 0; i < this.sailTears.length; i++) this.sailTears[i].visible = integrity < 0.76 - i * 0.18;
  }

  /**
   * Toute la bordée boit au goulot pendant `secondes`.
   *
   * ⚠️ PUREMENT VISUEL, comme `setOverboard`. L'effet de jeu du rhum est déjà
   * appliqué par `YoleDynamics.drinkRhum` ; ceci n'en est que la lecture, et
   * rien ici ne touche `dynamics` — donc rien n'entre dans le checksum.
   */
  setDrinking(secondes = 1.6) {
    this.drinkTimer = Math.max(this.drinkTimer ?? 0, secondes);
    this.drinkTotal = Math.max(0.35, this.drinkTimer);
  }

  // Chavirage : l'équipage passe par-dessus bord. PUREMENT VISUEL — on ne
  // touche pas à dynamics.activeCrew, qui entre dans le checksum de replay et
  // dont dépendent la pompe et le couple de rappel.
  // Équipage retiré parce qu'il est trop loin pour se lire — décision de RENDU,
  // prise chaque image par le jeu. Distincte de `overboard`, qui est un état de
  // partie : les deux se composent dans `applyCrewVisibility`, sinon le dernier
  // appelé écrasait l'autre et un équipage repêché au loin restait invisible.
  setCrewCulled(value) {
    const culled = Boolean(value);
    if (culled === this.crewCulled) return;
    this.crewCulled = culled;
    this.applyCrewVisibility();
  }

  applyCrewVisibility() {
    const visible = !this.overboard && !this.crewCulled;
    for (const entry of this.crew) entry.visual.root.visible = visible;
  }

  setOverboard(value) {
    this.overboard = Boolean(value);
    this.applyCrewVisibility();
    for (const entry of this.crew) {
      if (this.overboard) continue;
      // Remise à quai : l'animation de chute déplace root.position, et tant
      // qu'on est par-dessus bord update() ne repasse pas dessus. Sans ce
      // rappel, un équipier repêché reprend la course à côté de son bois.
      const visual = entry.visual;
      visual.fall = 0;
      visual.wasActive = true;
      visual.root.position.set(0, visual.fromRig ? CREW_SEAT_Y : 0, entry.z);
      visual.root.rotation.set(0, 0, 0);
    }
  }

  update(state, time, dt, weather) {
    this.root.position.set(state.x, state.y, state.z);
    this.root.rotation.y = state.heading;
    // YoleDynamics.reset() remet ces champs a zero AVANT l'unique update()
    // force par Boat.reset(). C'est un signal de frontiere de manche plus fiable
    // que le temps de rendu, et il evite de modifier Boat/Game pour un etat
    // exclusivement visuel.
    if (
      state.driveForce === 0
      && state.drive === 0
      && state.surf === 0
      && state.slip === 0
      && state.counterSteer === 0
      && state.arcadeBoostForward === 0
      && state.arcadeBoostLateral === 0
    ) {
      this.resetHandlingFeedback();
    }
    sampleHandlingMotion(state, this.handlingSample);
    const handlingActive = state.eliminated ? 0 : 1;
    const handlingSlipTarget = this.handlingSample.signedSlip * handlingActive;
    const handlingSurfTarget = this.handlingSample.surf * handlingActive;
    const handlingRecoveryTarget = this.handlingSample.recovery * handlingActive;
    this.handlingSlip = damp(
      this.handlingSlip,
      handlingSlipTarget,
      5.5 + handlingRecoveryTarget * 8.0,
      dt
    );
    this.handlingSlipAngle = damp(
      this.handlingSlipAngle,
      this.handlingSample.slipAngle * handlingActive,
      6.0 + handlingRecoveryTarget * 6.0,
      dt
    );
    this.handlingSurf = damp(
      this.handlingSurf,
      handlingSurfTarget,
      handlingSurfTarget > this.handlingSurf ? 4.2 : 2.8,
      dt
    );
    this.handlingRecovery = damp(
      this.handlingRecovery,
      handlingRecoveryTarget,
      handlingRecoveryTarget > this.handlingRecovery ? 9.5 : 5.2,
      dt
    );
    const wakeTarget = handlingActive
      * clamp(this.handlingSample.slipEnergy * 0.88 + this.handlingSample.surf * 0.62, 0, 1);
    this.handlingWakeStrength = damp(
      this.handlingWakeStrength,
      wakeTarget,
      wakeTarget > this.handlingWakeStrength ? 6.8 : 2.4,
      dt
    );

    // reduce-motion garde le V de mousse (information spatiale statique), mais
    // supprime les micro-deplacements de coque qui pourraient ajouter du mal
    // des transports. Aucun clignotement n'est introduit : reduceFlash n'a donc
    // rien a compenser sur la yole elle-meme.
    const hullMotion = this.handlingReducedMotion ? 0 : 1;
    const catchRoll = -this.handlingSlip
      * this.handlingRecovery
      * HANDLING_MOTION.hullCounterRoll
      * hullMotion;
    this.tiltRoot.position.x = this.handlingSlip * HANDLING_MOTION.hullSlipOffset * hullMotion;
    this.tiltRoot.position.y = this.handlingSurf * HANDLING_MOTION.hullSurfLift * hullMotion;
    this.tiltRoot.rotation.z = -state.roll + catchRoll;
    this.tiltRoot.rotation.x = state.pitch
      - this.handlingSurf * HANDLING_MOTION.hullSurfPitch * hullMotion;

    const waterHeight = state.centerWaterHeight ?? state.y - 0.15;
    this.handlingWakeRoot.position.y = waterHeight - state.y + 0.025;
    this.handlingWakeRoot.rotation.y = this.handlingSlipAngle * 0.82;
    this.handlingWakeRoot.scale.x = 0.72 + this.handlingWakeStrength * 0.82;
    this.handlingWakeRoot.scale.z = 0.72 + this.handlingSurf * 0.52;
    this.handlingWake.material.opacity = clamp(
      0.035 + this.handlingWakeStrength * 0.27,
      0,
      0.31
    );
    this.handlingWake.visible = this.handlingWakeStrength > 0.025;
    this.impact = Math.max(0, this.impact - dt * 2.8);

    // Un équipage de yole n'est PAS au repos sur l'axe de la coque. Sous voile
    // il est dehors EN PERMANENCE : une yole ronde n'a ni quille ni gouvernail,
    // tout le couple de redressement vient du poids des hommes déporté sur les
    // bois. C'est l'état d'équilibre, pas une manœuvre.
    //
    // La simulation, elle, définit crewPositions[i] comme un ÉCART normalisé
    // autour de zéro, et cet écart est un transitoire de 0,94 s remis à plat dès
    // que la gîte retombe. Mesuré sur 60 000 ticks : l'équipier franchit le
    // plat-bord 4 à 8 % du temps, et atteint le bout du bois 0,1 à 0,7 % du
    // temps. Rendre l'écart tel quel donnait donc six hommes alignés sur la
    // coque 96 % du temps — l'inverse exact des photos de course.
    //
    // Le RENDU décide donc où se trouve le repos, et la simulation continue de
    // fournir l'écart par-dessus. Aucune ligne de src/sim, aucun champ nouveau,
    // checksum de replay intact par construction.
    //
    // Le signal, c'est la GÎTE LISSÉE, pas le vent apparent. Mesuré : dériver le
    // bord de la composante latérale du vent fait changer l'équipage de côté dès
    // que la yole braque de 0,22 rad (12°), parce que la latérale s'annule là —
    // et l'équipage n'était alors du côté haut que 63 % du temps.
    //
    // La gîte est exactement ce que les hommes contrent. On la passe dans un
    // damp lent (~1,7 s) pour effacer le clapot sans perdre la gîte installée,
    // et dans un tanh serré pour que le rappel sature dès une gîte modérée.
    // tiltRoot.rotation.z = -roll, donc une gîte positive enfonce le bord +x :
    // le bord au vent est -sign(roll).
    // L'ordre compte : on lisse la GÎTE, puis on sature. Saturer d'abord ferait
    // s'annuler les oscillations du clapot (chaque crête partant à ±1) et le
    // rappel moyen retomberait à zéro — mesuré à 0,22 m de déport moyen contre
    // 1,55 m dans le bon ordre.
    const roll = state.roll ?? 0;
    this.rollSlow = damp(this.rollSlow ?? roll, roll, 0.55, dt);
    const windward = -Math.tanh(this.rollSlow / 0.05);

    const active = this.overboard ? 0 : state.activeCrew;

    // Cadence COMMUNE aux six équipiers d'une yole : c'est elle qui les met à
    // l'unisson. Elle accélère avec la vitesse et sous turbo, et le décalage par
    // `this.index` évite que les quatre yoles battent la même mesure.
    const pace = 2.15 + clamp((state.speed ?? 0) / 26, 0, 1) * 1.5 + clamp(state.arcadeBoostForward ?? 0, 0, 1) * 1.2;
    this.cadence = (this.cadence ?? this.index * 1.9) + dt * pace;
    const cadence = this.cadence;
    // L'écopeur est le dernier équipier resté à bord, et il n'écope que s'il y a
    // de l'eau. C'est un poste permanent en course, pas une réparation.
    const bailer = Math.max(0, active - 1);
    const bailStrength = clamp((state.waterMassKg ?? 0) / 45, 0, 1);

    if (this.drinkTimer > 0) this.drinkTimer = Math.max(0, this.drinkTimer - dt);

    for (let index = 0; index < this.crew.length; index++) {
      if (this.overboard) break;
      const crew = this.crew[index];
      const normalized = state.crewPositions?.[index] ?? state.crewShift ?? 0;
      const velocity = state.crewVelocities?.[index] ?? 0;
      // L'écart de la simulation s'ajoute désormais à un repos DÉJÀ déporté :
      // garder l'ancien facteur 2,55 empilait les deux et sortait les hommes à
      // 5,2 m, très au-delà de la portée réelle d'un bois. Réduit pour que le
      // BWA SHIFT reste franchement lisible sans quitter la perche.
      const spread = 1.15 + index * 0.05;
      const x = windward * CREW_RAIL[index] + normalized * spread + (index - 2.5) * 0.07;
      // ── GORGÉE DE RHUM, ÉCHELONNÉE ─────────────────────────────────────
      // Chaque homme boit avec un léger retard sur le précédent. Six gorgées
      // parfaitement simultanées lisent comme un bug d'animation ; échelonnées,
      // elles lisent comme une bordée qui se passe la bouteille.
      // Le décalage vient de l'INDEX, pas d'un tirage : deux relectures d'un
      // même replay doivent montrer exactement la même chose.
      let gorgee = 0;
      if ((this.drinkTimer ?? 0) > 0) {
        const total = this.drinkTotal || 1;
        const ecoule = total - this.drinkTimer;
        const debut = index * CREW_DRINK_STAGGER;
        const local = (ecoule - debut) / CREW_DRINK_SIP;
        // Montée franche, tenue, redescente : une gorgée, pas une oscillation.
        if (local > 0 && local < 1) gorgee = Math.sin(local * Math.PI) ** 0.6;
      }
      crew.visual.update(time, dt, x, crew.z, velocity, state.roll, this.impact, index < active, state.crewStumble ?? 0, state.arcadeBoostForward ?? 0, (state.arcadeBoostLateral ?? 0) * (state.lateralBoostDirection ?? 0), cadence, index === bailer ? bailStrength : 0, gorgee, state.cohesion ?? 1);
    }

    const windPower = clamp(state.sailPower ?? 0.7, 0, 1.5);
    this.updateSail(time, windPower + (state.arcadeBoostForward ?? 0) * 0.35, weather.stormAmount, state.structure.sail);
    this.cannonGlow.scale.setScalar(0.85 + Math.sin(time * 7 + this.index) * 0.12 + state.flow * 0.28);
    const turbo = clamp(state.arcadeBoostForward ?? 0, 0, 1);
    const dash = clamp(state.arcadeBoostLateral ?? 0, 0, 1);
    this.turboFlame.visible = turbo > 0.01;
    this.turboFlame.material.opacity = turbo * 0.82;
    this.turboFlame.scale.set(0.75 + turbo * 0.45, 0.75 + turbo * 0.45, 0.7 + turbo * 1.4);
    this.turboFlame.rotation.z = Math.sin(time * 22 + this.index) * 0.16;
    this.dashFlare.visible = dash > 0.01;
    this.dashFlare.material.opacity = dash * 0.72;
    this.dashFlare.material.color.setHex((state.lateralBoostDirection ?? 1) > 0 ? 0xff4ec4 : 0x55f5ff);
    this.dashFlare.scale.setScalar(0.8 + dash * 0.9);
    this.dashFlare.rotation.z += dt * 5.5;

    this.hullMaterial.emissive.setHex(this.color);
    this.hullMaterial.emissive.multiplyScalar(0.025 + this.impact * 0.12);
    this.hullMaterial.roughness = 0.4 + (1 - state.structure.hull) * 0.3;
    this.waterLevelUniform.value = state.centerWaterHeight ?? state.y - 0.15;
    this.mastGroup.rotation.z = (1 - state.structure.mast) * 0.28 * Math.sin(time * 2.2 + this.index);
    this.mast.visible = state.structure.mast > 0.36;
    this.brokenMast.visible = state.structure.mast <= 0.36 && state.structure.mast > 0.01;
    if (this.brokenMast.visible) {
      this.brokenMast.rotation.z = 0.65 + Math.sin(time * 1.8 + this.index) * 0.18;
      this.brokenMast.rotation.x = 0.22;
    }
    const rigUp = state.structure.sail > 0.02 && state.structure.mast > 0.02;
    this.sail.visible = rigUp;
    // Sept bois dressés pour quatre valeurs d'intégrité côté simulation :
    // on répartit proportionnellement plutôt que d'indexer au-delà du tableau.
    const bwa = state.structure.bwa;
    const bwaCount = bwa?.length || 1;
    this.beams.forEach((entry, index) => {
      const integrity = bwa?.[Math.min(bwaCount - 1, Math.floor(index * bwaCount / this.beams.length))] ?? 1;
      entry.beam.visible = integrity > 0.04;
      // Les bois débordent d'UN SEUL bord, celui au vent — un peigne symétrique
      // se lit à l'écran comme une arête de poisson, jamais comme une yole. Même
      // signal continu que l'équipage, donc ils sortent ensemble.
      entry.root.position.x = windward * BEAM_OFFSET;
      // Un bois qui porte un homme ne doit ni raccourcir ni pivoter sous les
      // dégâts : il l'emmènerait dans le vide. Seul le bois 0, inoccupé, encaisse
      // visuellement la casse.
      const carriesCrew = CREW_BEAMS.includes(index);
      entry.beam.scale.y = carriesCrew ? 1 : clamp(integrity, 0.18, 1);
      entry.root.rotation.y = carriesCrew ? 0 : (1 - integrity) * 0.22;
      entry.root.rotation.z = carriesCrew ? 0 : (1 - integrity) * 0.16 * (index % 2 ? 1 : -1);
    });

    const hullDamage = 1 - state.structure.hull;
    for (let i = 0; i < this.cracks.length; i++) {
      const opacity = clamp(hullDamage * 1.8 - i * 0.16, 0, 0.8);
      // Un mesh transparent à opacité nulle coûte quand même son draw call : les
      // 16 fissures des 4 yoles étaient dessinées en permanence alors qu'elles
      // ne se voient que sur une coque abîmée.
      this.cracks[i].visible = opacity > 0.004;
      this.cracks[i].material.opacity = opacity;
    }

    const water = clamp((state.waterMassKg ?? 0) / 180, 0, 1);
    this.internalWaterMaterial.opacity = water * 0.68;
    this.internalWater.visible = water > 0.01;
    this.internalWater.position.y = 0.105 + water * 0.12;
    const flood = state.flooding;
    if (flood) {
      // La simulation tient SIX compartiments (yole-physics.js:23-24) :
      //   0,1,2 = bâbord arrière/milieu/avant   3,4,5 = tribord arrière/milieu/avant
      // Ce bloc n'en lisait que quatre : flood[4] et flood[5] n'étaient jamais lus,
      // et « tribord » additionnait du bâbord-milieu avec du tribord-arrière — la
      // nappe s'inclinait donc du mauvais côté et sur le mauvais axe.
      const port = flood[0] + flood[1] + flood[2];
      const starboard = flood[3] + flood[4] + flood[5];
      const stern = flood[0] + flood[3];
      const bow = flood[2] + flood[5];
      // Coefficients ramenés de deux à trois compartiments par somme.
      this.internalWater.rotation.z = clamp((starboard - port) * 0.00187, -0.18, 0.18);
      this.internalWater.rotation.x = clamp((stern - bow) * 0.00147, -0.14, 0.14);
    }

    if (state.eliminated) {
      this.tiltRoot.rotation.z = -state.roll;
      this.root.position.y -= Math.min(2.2, state.sink * 0.58);
    }
  }
}
