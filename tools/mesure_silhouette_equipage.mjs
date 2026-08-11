// Mesure la silhouette de l'équipage TELLE QU'ELLE ARRIVE À L'ÉCRAN.
//
// ⚠️ POURQUOI CET OUTIL EXISTE, ET CE QU'IL REMPLACE.
//
// `tools/build_crew_asset.py` produisait un rapport tout vert — `authored`,
// `contactValidated`, `productionReady` — sur des poses qui ne bougeaient pas
// d'un degré et qui, une fois composées par le runtime, sortaient un T-pose.
// La raison est simple : ce rapport COMPTE des courbes, des clés et des os. Il
// ne mesure jamais un angle, et il ne compose jamais rien.
//
// Ici on fait l'inverse. On charge le GLB réellement livré, on rebâtit le
// squelette avec le VRAI Three.js (vendor/), on instancie le VRAI `CrewVisual`,
// on appelle son `update()` pour les états de jeu qui comptent, et on lit les
// positions des os. Ce qui est mesuré est donc ce qui est affiché, y compris
// les couches d'assise, de station, de traversée, le procédural et l'IK.
//
//   node tools/mesure_silhouette_equipage.mjs            # rapport lisible
//   node tools/mesure_silhouette_equipage.mjs --json     # rapport machine
//   node tools/mesure_silhouette_equipage.mjs --strict   # sort 1 si un seuil casse
//
// Les seuils sont en bas de fichier, chacun avec la mesure qui l'a motivé.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
// `--glb <chemin>` permet de mesurer un candidat, ou une archive, sans toucher
// à la production : c'est ce qui rend l'avant/après comparable.
const argGlb = process.argv.indexOf("--glb");
const GLB = argGlb > -1 && process.argv[argGlb + 1]
  ? path.resolve(RACINE, process.argv[argGlb + 1])
  : path.join(RACINE, "assets", "models", "yole_crew.glb");

// Sous Windows, l'import dynamique refuse un chemin absolu brut : `c:\…` se lit
// comme un protocole. On passe donc par une URL de fichier.
const module = (...bouts) => import(pathToFileURL(path.join(RACINE, ...bouts)).href);

const THREE = await module("vendor", "three.module.min.js");
const { CrewClipLibrary } = await module("src", "render", "crew-clips.js");
const { CrewVisual, CREW_STAGING_PROFILES, CREW_ROLES, CREW_BEAM_Y, CREW_SEAT_LIFT, crewSeatOffsetForHike } = await module(
  "src", "render", "yole-visual.js"
);

const DEG = 180 / Math.PI;

// ── LECTURE DU GLB ───────────────────────────────────────────────────────────
//
// On n'utilise pas `GLTFLoader` : il voudrait décoder les textures, ce qui
// n'existe pas hors navigateur et ne change rien à une mesure d'angle. On lit
// donc les nœuds et les échantillonneurs à la main, en reproduisant EXACTEMENT
// ce que le loader donne au runtime — tampon de valeurs brut compris, tangentes
// de CUBICSPLINE incluses. C'est important : c'est ce tampon-là qui portait le
// défaut d'échelle d'os, et un harnais qui le « nettoierait » ne le verrait pas.

function lisGlb(chemin) {
  const buf = readFileSync(chemin);
  const longueurJson = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + longueurJson).toString("utf8"));
  const binaire = buf.slice(20 + longueurJson + 8);
  return { json, binaire, octets: buf.length };
}

function accesseur(json, binaire, index) {
  const acces = json.accessors[index];
  const vue = json.bufferViews[acces.bufferView];
  const depart = (vue.byteOffset ?? 0) + (acces.byteOffset ?? 0);
  const composantes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acces.type];
  const sortie = new Float32Array(acces.count * composantes);
  for (let i = 0; i < sortie.length; i++) sortie[i] = binaire.readFloatLE(depart + i * 4);
  return sortie;
}

// `GLTFLoader` assainit les noms de nœuds ; les nôtres sont déjà propres, mais
// on applique la même règle pour que le harnais ne soit pas plus tolérant que
// le jeu.
const assainis = (nom) => String(nom ?? "").replace(/[\s.:]/g, "");

function batisRig(json, binaire) {
  const os = json.nodes.map((noeud) => {
    const bone = new THREE.Bone();
    bone.name = assainis(noeud.name);
    if (noeud.translation) bone.position.fromArray(noeud.translation);
    if (noeud.rotation) bone.quaternion.fromArray(noeud.rotation);
    if (noeud.scale) bone.scale.fromArray(noeud.scale);
    return bone;
  });
  json.nodes.forEach((noeud, index) => {
    for (const enfant of noeud.children ?? []) os[index].add(os[enfant]);
  });

  const racine = new THREE.Group();
  racine.name = "CrewRig";
  json.nodes.forEach((_, index) => {
    if (!os[index].parent) racine.add(os[index]);
  });

  // Le squelette est ce que `measureRigHeight` interroge pour normaliser la
  // taille : sans lui la mesure retomberait sur une Box3 et le rig ne serait
  // pas à l'échelle du jeu.
  const peau = json.skins?.[0];
  if (peau) {
    const geometrie = new THREE.BufferGeometry();
    const maille = new THREE.SkinnedMesh(geometrie, new THREE.MeshBasicMaterial());
    maille.name = "CrewMesh";
    maille.skeleton = new THREE.Skeleton(peau.joints.map((j) => os[j]));
    maille.bind = () => {};
    racine.add(maille);
  }
  return racine;
}

function batisClips(json, binaire) {
  return (json.animations ?? []).map((anim) => {
    let duree = 0;
    const pistes = [];
    for (const canal of anim.channels) {
      if (canal.target.path !== "rotation") continue;
      const echantillonneur = anim.samplers[canal.sampler];
      const temps = accesseur(json, binaire, echantillonneur.input);
      const valeurs = accesseur(json, binaire, echantillonneur.output);
      duree = Math.max(duree, temps[temps.length - 1]);
      pistes.push({
        name: `${assainis(json.nodes[canal.target.node].name)}.quaternion`,
        times: temps,
        values: valeurs,
        interpolation: echantillonneur.interpolation ?? "LINEAR"
      });
    }
    return { name: anim.name, duration: duree, tracks: pistes };
  });
}

// ── MESURES DE SILHOUETTE ────────────────────────────────────────────────────

function positionLocale(visuel, nom) {
  const os = visuel.rigJoints?.find((entree) => entree.boneName === nom)?.joint;
  if (!os) return null;
  visuel.root.updateWorldMatrix(true, true);
  return visuel.root.worldToLocal(os.getWorldPosition(new THREE.Vector3()));
}

// Position MONDE cette fois : le contact bassin ↔ bois ne se mesure pas dans le
// repère de la racine, où la hauteur du bassin est constante par construction.
// C'est `root.position.y` (l'assise calculée) qu'on veut voir aboutir à la cote
// du bwa — le défaut du 2 août (six hommes flottant 7 à 17 cm au-dessus du
// bois) vivait exactement là, et aucune mesure locale ne pouvait l'attraper.
function positionMonde(visuel, nom) {
  const os = visuel.rigJoints?.find((entree) => entree.boneName === nom)?.joint;
  if (!os) return null;
  visuel.root.updateWorldMatrix(true, true);
  return os.getWorldPosition(new THREE.Vector3());
}

// Abduction du BRAS, pas de la main. Un coude plié projette la main loin sur le
// côté sans que l'épaule soit ouverte : mesurer épaule→main confond « bras en
// croix » et « avant-bras replié ». C'est le segment épaule→coude qui décide de
// la lecture en T.
//
// ⚠️ DEUX JAUGES ONT ÉTÉ ESSAYÉES AVANT CELLE-CI, ET LES DEUX MENTAIENT.
//
// 1. Angle depuis la VERTICALE du monde. Un yoleur au rappel plein est
//    renversé, tête plus basse que le bassin : la jauge dépassait 90° pour des
//    bras pourtant collés au corps, et annonçait 97° sur une silhouette juste.
// 2. Angle depuis l'axe du TRONC. Corrigé pour l'orientation, mais incapable de
//    distinguer les deux choses qui comptent : sur un corps horizontal, des bras
//    qui PENDENT sous leur poids font ~90° par rapport au tronc, exactement
//    comme des bras EN CROIX. Or l'un est juste et l'autre est le défaut.
//
// Ce qui fait lire un T-pose n'est ni l'un ni l'autre : c'est l'écartement dans
// l'axe TRANSVERSE du corps — épaule gauche vers épaule droite. Un bras en
// croix est aligné dessus, un bras qui pend lui est perpendiculaire, et ça reste
// vrai la tête en bas. On projette donc le bras sur cet axe.
//
// 0° = bras dans le plan du corps (pend, ou va devant/derrière) ; 90° = en croix.
function ecartementLateral(visuel, epaule, coude) {
  const haut = positionLocale(visuel, epaule);
  const bas = positionLocale(visuel, coude);
  const gauche = positionLocale(visuel, "LeftArm");
  const droite = positionLocale(visuel, "RightArm");
  if (!haut || !bas || !gauche || !droite) return null;
  const bras = [bas.x - haut.x, bas.y - haut.y, bas.z - haut.z];
  const travers = [droite.x - gauche.x, droite.y - gauche.y, droite.z - gauche.z];
  const nb = Math.hypot(...bras);
  const nt = Math.hypot(...travers);
  if (!(nb > 1e-6) || !(nt > 1e-6)) return null;
  const cos = (bras[0] * travers[0] + bras[1] * travers[1] + bras[2] * travers[2]) / (nb * nt);
  return Math.asin(Math.min(1, Math.abs(cos))) * DEG;
}

function echelleOs(visuel) {
  // Un quaternion non unitaire arrive dans `Matrix4.compose` comme une échelle.
  // C'est le symptôme exact du défaut de tangentes : on le surveille pour de bon.
  let pire = 0;
  for (const { joint } of visuel.rigJoints ?? []) {
    const norme = joint.quaternion.length();
    pire = Math.max(pire, Math.abs(norme - 1));
  }
  return pire;
}

// ⚠️ LE QUATRIÈME ANGLE MORT, FERMÉ LE 4 AOÛT 2026.
//
// Toutes les mesures ci-dessus sont AVEUGLES AU ROULIS DU BASSIN. Une pose qui
// couche l'homme sur le VENTRE et une qui le renverse sur le DOS donnent le
// même tronc, la même tête sous les hanches, le même genou — et le même vert.
//
// Un yoleur travaille DOS À LA MER : c'est le dos qui porte le levier, la face
// reste tournée vers le bateau et la voile. Une passe a livré l'inverse, à
// −1,00 de regard, sans qu'aucun seuil ne bronche.
//
// La mesure se fait dans le repère de la YOLE et pas dans celui du corps : le
// runtime applique un lacet de rappel de ~78° à la racine de l'équipier, donc
// un angle lu dans le repère local ne dit rien de ce qu'on voit.
function orientationDorsale(visuel, yole) {
  const os = (nom) => visuel.rigRoot?.getObjectByName(nom) ?? null;
  const tete = os("Head");
  const front = os("headfront");
  if (!tete || !front || !yole) return null;
  yole.updateWorldMatrix(true, true);
  const a = yole.worldToLocal(tete.getWorldPosition(new THREE.Vector3()));
  const b = yole.worldToLocal(front.getWorldPosition(new THREE.Vector3()));
  return b.sub(a).normalize().y;
}

function mesure(visuel, yole) {
  const gauche = ecartementLateral(visuel, "LeftArm", "LeftForeArm");
  const droite = ecartementLateral(visuel, "RightArm", "RightForeArm");
  const mainG = positionLocale(visuel, "LeftHand");
  const mainD = positionLocale(visuel, "RightHand");
  const tete = positionLocale(visuel, "Head");
  const hanche = positionLocale(visuel, "Hips");
  const hancheMonde = positionMonde(visuel, "Hips");
  const genou = positionLocale(visuel, "LeftLeg");
  const cheville = positionLocale(visuel, "LeftFoot");

  // ── LE BASCULEMENT DU BUSTE, MESURÉ COMME SUR PHOTO ────────────────────────
  //
  // Sur les images de course, un dresseur au rappel plein n'est pas « penché » :
  // il est en BALANCE, bassin sur le bwa et TÊTE PLUS BASSE QUE LES HANCHES.
  // C'est le critère le plus simple à lire sur une photo et le plus dur à
  // truquer, donc c'est celui qu'on mesure : l'angle du segment hanches→tête
  // par rapport à la verticale montante. 0° = debout, 90° = buste horizontal,
  // au-delà = tête sous le bassin, ce que montrent les photos.
  let inclinaisonBuste = null;
  if (tete && hanche) {
    const dy = tete.y - hanche.y;
    const dh = Math.hypot(tete.x - hanche.x, tete.z - hanche.z);
    inclinaisonBuste = Math.atan2(dh, dy) * DEG;
  }
  // Flexion du genou : sur les photos, les jambes sont repliées franchement et
  // crochètent la coque. Un membre tendu se lit comme un mannequin suspendu.
  let flexionGenou = null;
  if (hanche && genou && cheville) {
    const cuisse = [genou.x - hanche.x, genou.y - hanche.y, genou.z - hanche.z];
    const tibia = [cheville.x - genou.x, cheville.y - genou.y, cheville.z - genou.z];
    const nc = Math.hypot(...cuisse);
    const nt = Math.hypot(...tibia);
    if (nc > 1e-6 && nt > 1e-6) {
      const cos = (cuisse[0] * tibia[0] + cuisse[1] * tibia[1] + cuisse[2] * tibia[2]) / (nc * nt);
      flexionGenou = Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
    }
  }
  return {
    abductionGauche: gauche,
    abductionDroite: droite,
    abduction: Math.max(gauche ?? 0, droite ?? 0),
    envergureMains: mainG && mainD ? Math.abs(mainG.x - mainD.x) : null,
    hauteurTete: tete?.y ?? null,
    hauteurHanche: hanche?.y ?? null,
    // Écart vertical bassin ↔ cote d'assise (axe du bois + remontée d'assise,
    // soit la surface de la perche plus le tissu comprimé). Nul par construction
    // quand l'assise est cohérente : toute dérive signe une hauteur de hanche
    // ou une échelle de rig mal mesurée — le bug du 2 août, verrouillé.
    // ⚠️ LA CIBLE SUIT LA TRACTION. Posé sur le bois à faible sortie, PENDU
    // dessous à pleine sortie : la cote attendue vient de la même formule que
    // le runtime et que le contrat d'assise (`crewSeatOffsetForHike`), pas
    // d'une constante — la jauge a mordu à juste titre quand la suspension est
    // arrivée sans elle.
    contactBois: hancheMonde
      ? hancheMonde.y - (CREW_BEAM_Y + crewSeatOffsetForHike(visuel.hikeAmount ?? 0))
      : null,
    teteSousHanche: tete && hanche ? tete.y - hanche.y : null,
    inclinaisonBuste,
    flexionGenou,
    regard: orientationDorsale(visuel, yole),
    derniveleQuaternion: echelleOs(visuel)
  };
}

// ── SCÉNARIOS ────────────────────────────────────────────────────────────────
//
// Chacun décrit un instant que le joueur voit vraiment. `roll` et `deployment`
// sont donnés séparément parce que le jeu les calcule séparément : la gîte
// pilote le déploiement, mais un homme conserve le sien pendant une traversée.

const SCENARIOS = [
  { nom: "depart, yole a plat", roll: 0, deployment: 0, cadence: 0, station: null },
  { nom: "gite naissante (4 deg)", roll: 0.07, deployment: 0.25, cadence: 1.4, station: null },
  { nom: "rappel installe (12 deg)", roll: 0.21, deployment: 1, cadence: 2.6, station: null },
  { nom: "poste interieur, a plat", roll: 0, deployment: 0, cadence: 0, station: "interieur" },
  { nom: "extension extreme", roll: 0.30, deployment: 1, cadence: 3.1, station: "extreme" },
  { nom: "patron", roll: 0.05, deployment: 0, cadence: 2.0, role: "patron" },
  { nom: "ecoute", roll: 0.05, deployment: 0, cadence: 2.0, role: "ecoute" }
];

// Instants échantillonnés dans le cycle de chaque clip. Les BORNES sont
// délibérément incluses : c'est là que la lecture des tangentes rendait un
// quaternion nul, et un balayage qui les éviterait raterait le défaut.
const INSTANTS = [0, 0.004, 0.35, 1.2, 2.4, 3.03, 3.05, 4.9];

function joue(scenario, rig, bibliotheque) {
  const profil = CREW_STAGING_PROFILES[scenario.station === "interieur" ? 3 : 2];
  const visuel = new CrewVisual(THREE, 0x8b4e36, 0x2f6f8f, 0x0d2531, 0, rig, null, bibliotheque);
  if (!visuel.fromRig) throw new Error("le rig n'a pas ete lie : la mesure ne vaudrait rien");
  // La racine d'équipier vit normalement sous la coque : sans ce parent, le
  // lacet de rappel serait invisible et le regard mesuré ne voudrait rien dire.
  const yole = new THREE.Group();
  yole.add(visuel.root);
  visuel.role = scenario.role ?? CREW_ROLES[2];
  visuel.stagingFamily = profil.family;
  visuel.stagingStation = scenario.station ?? profil.station;
  visuel.stagingDeployment = scenario.deployment;
  visuel.posture = 1;

  let pire = null;
  // ⚠️ ÉCHAUFFEMENT OBLIGATOIRE AVANT TOUTE MESURE. Le déport latéral de
  // l'équipier est LISSÉ (damp) : les huit instants du balayage ne suffisent
  // pas à le converger, et la première version de ce harnais mesurait alors un
  // bassin à +21 cm du bois — un artefact de transitoire, pas un défaut du
  // jeu. Une minute de temps simulé met l'assise à sa place définitive.
  for (let k = 0; k < 60; k++) {
    visuel.update(
      10 + k / 60, 1 / 60, 1.2, 0.5, 6.4, scenario.roll, 0, true,
      0, 0, 0, scenario.cadence, 0, 0, 1,
      { elapsed: 99, duration: 0, precision: 0, kind: 0, delay: 0, sideTransfer: 1, sideChanging: false, anticipation: 0, momentum: 0, loadRecoil: 0, solveContacts: true }
    );
  }
  for (const instant of INSTANTS) {
    visuel.update(
      instant, 1 / 60, 1.2, 0.5, 6.4, scenario.roll, 0, true,
      0, 0, 0, scenario.cadence, 0, 0, 1,
      { elapsed: 99, duration: 0, precision: 0, kind: 0, delay: 0, sideTransfer: 1, sideChanging: false, anticipation: 0, momentum: 0, loadRecoil: 0, solveContacts: true }
    );
    const releve = mesure(visuel, yole);
    // On garde l'instant le PIRE de chaque scénario : une silhouette juste en
    // moyenne mais fausse un dixième de seconde reste fausse à l'écran.
    if (!pire
      || releve.abduction > pire.abduction
      || releve.derniveleQuaternion > pire.derniveleQuaternion) {
      pire = { ...releve, instant };
    }
  }
  return { scenario: scenario.nom, deploye: scenario.deployment > 0.5, specialiste: Boolean(scenario.role), ...pire };
}

// ── AMPLITUDE INTERNE DES ACTIONS ────────────────────────────────────────────
//
// Une action dont toutes les clés sont égales n'est pas une animation, c'est
// une pose. Le rapport d'export ne le voyait pas parce qu'il comptait les clés
// sans jamais les comparer.

function amplitudes(clips) {
  return clips.map((clip) => {
    let pire = 0;
    let osPire = "";
    let figes = 0;
    for (const piste of clip.tracks) {
      const cles = piste.times.length;
      const pas = piste.values.length / cles;
      const decalage = pas === 12 ? 4 : 0;
      const cle = (k) => {
        const b = k * pas + decalage;
        return [piste.values[b], piste.values[b + 1], piste.values[b + 2], piste.values[b + 3]];
      };
      const premiere = cle(0);
      let ecart = 0;
      let identique = true;
      for (let k = 1; k < cles; k++) {
        const autre = cle(k);
        let produit = 0;
        for (let i = 0; i < 4; i++) produit += premiere[i] * autre[i];
        ecart = Math.max(ecart, 2 * Math.acos(Math.min(1, Math.abs(produit))) * DEG);
        if (autre.some((v, i) => v !== premiere[i])) identique = false;
      }
      if (identique) figes++;
      if (ecart > pire) { pire = ecart; osPire = piste.name.replace(".quaternion", ""); }
    }
    return {
      action: clip.name,
      duree: clip.duration,
      interpolation: clip.tracks[0]?.interpolation ?? "?",
      amplitudeMax: pire,
      osLePlusMobile: osPire,
      canauxFiges: figes,
      canaux: clip.tracks.length
    };
  });
}

// ── SEUILS ───────────────────────────────────────────────────────────────────

const SEUILS = {
  // Calibré sur le défaut lui-même. Mesuré le 4 août 2026 sur le GLB et le code
  // d'origine (`--glb tmp/crew-v2/yole_crew_production.avant-v2.glb`, sources
  // remisées) : **85,4°** au rappel installé, c'est-à-dire des bras alignés à
  // quatre degrés près sur l'axe des épaules — une croix. Après correction,
  // 18,9° dans le même état. Le seuil est posé à mi-chemin, assez haut pour
  // qu'un bras qui va chercher le bwa loin en arrière passe, assez bas pour
  // qu'une croix ne repasse jamais.
  abductionMax: 45,
  // Un homme de 1,70 m bras écartés couvre ~1,70 m. On refuse tout ce qui
  // s'en approche : au repos comme au rappel, les mains travaillent devant ou
  // derrière le corps, jamais en croix.
  envergureMainsMax: 1.20,
  // Un quaternion d'os doit rester unitaire. Toute dérive au-delà se traduit
  // par une ÉCHELLE d'os — le corps qui s'effondre puis revient.
  derniveleQuaternionMax: 1e-3,
  // Trois clés identiques sur 3,04 s ne sont pas une animation. Le seuil est
  // volontairement bas : on demande un signe de vie, pas une chorégraphie.
  amplitudeMinDeg: 4,
  // Orientation du regard dans le repère de la yole : positif = face au ciel,
  // donc dos à la mer. Un dresseur sorti au rappel doit rester franchement
  // dorsal ; on n'exige rien de celui qui est encore dans le bateau.
  regardDorsalMin: 0.15,
  // Contact bassin ↔ bois, en mètres. Le calcul d'assise vise la cote exacte
  // (`CREW_BEAM_Y`) ; on tolère deux centimètres pour l'interpolation des
  // poses, pas plus. Les spécialistes (patron, écoute) sont exclus : leurs
  // postes ne sont pas sur le bois, leur assise est volontairement ailleurs.
  contactBoisMax: 0.02
};

// ── RAPPORT ──────────────────────────────────────────────────────────────────

const { json, binaire, octets } = lisGlb(GLB);
const rig = batisRig(json, binaire);
const clips = batisClips(json, binaire);
const bibliotheque = new CrewClipLibrary(clips);

const tableAmplitudes = amplitudes(clips);
// Un rig neuf par scénario : `bindRig` mémorise le repos, donc réutiliser le
// même squelette ferait mesurer la pose laissée par le scénario précédent.
const releves = SCENARIOS.map((scenario) => joue(scenario, batisRig(json, binaire), bibliotheque));

const echecs = [];
for (const ligne of tableAmplitudes) {
  if (ligne.amplitudeMax < SEUILS.amplitudeMinDeg) {
    echecs.push(`action « ${ligne.action} » figée : ${ligne.amplitudeMax.toFixed(2)}° d'amplitude interne, minimum ${SEUILS.amplitudeMinDeg}° (${ligne.canauxFiges}/${ligne.canaux} canaux strictement identiques)`);
  }
}
for (const ligne of releves) {
  if (ligne.abduction > SEUILS.abductionMax) {
    echecs.push(`« ${ligne.scenario} » : bras écartés en croix à ${ligne.abduction.toFixed(1)}°, maximum ${SEUILS.abductionMax}°`);
  }
  if (ligne.envergureMains > SEUILS.envergureMainsMax) {
    echecs.push(`« ${ligne.scenario} » : envergure des mains ${ligne.envergureMains.toFixed(2)} m, maximum ${SEUILS.envergureMainsMax} m`);
  }
  if (ligne.deploye && ligne.regard !== null && ligne.regard < SEUILS.regardDorsalMin) {
    echecs.push(`« ${ligne.scenario} » : regard à ${ligne.regard.toFixed(2)} — l'homme travaille VENTRE à la mer, il doit porter par le DOS`);
  }
  if (ligne.derniveleQuaternion > SEUILS.derniveleQuaternionMax) {
    echecs.push(`« ${ligne.scenario} » : quaternion d'os non unitaire (écart ${ligne.derniveleQuaternion.toExponential(2)}) — l'os arrive à l'écran avec une ÉCHELLE`);
  }
  if (!ligne.specialiste && ligne.contactBois !== null && Math.abs(ligne.contactBois) > SEUILS.contactBoisMax) {
    echecs.push(`« ${ligne.scenario} » : bassin à ${(ligne.contactBois >= 0 ? "+" : "") + (ligne.contactBois * 100).toFixed(1)} cm de la cote du bois — l'assise ne pose plus l'homme SUR le bwa`);
  }
}

const rapport = {
  glb: path.relative(RACINE, GLB),
  octets,
  seuils: SEUILS,
  actions: tableAmplitudes,
  silhouette: releves,
  echecs,
  ok: echecs.length === 0
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rapport, null, 2));
} else {
  console.log(`GLB : ${rapport.glb} (${(octets / 1024).toFixed(0)} Ko)\n`);
  console.log("AMPLITUDE INTERNE DES ACTIONS");
  console.log("  action                    interp        duree   amplitude   os le plus mobile   canaux figes");
  for (const l of tableAmplitudes) {
    console.log(`  ${l.action.padEnd(24)}  ${l.interpolation.padEnd(12)} ${l.duree.toFixed(2)}s ${(l.amplitudeMax.toFixed(2) + "°").padStart(10)}   ${(l.osLePlusMobile || "-").padEnd(18)}  ${l.canauxFiges}/${l.canaux}`);
  }
  console.log("\nSILHOUETTE COMPOSEE (assise + station + traversee + procedural + IK)");
  console.log("  scenario                    bras en croix   envergure   buste   tete-hanches   genou   regard   bassin-bois");
  for (const l of releves) {
    const buste = l.inclinaisonBuste === null ? "?" : l.inclinaisonBuste.toFixed(0) + "°";
    const delta = l.teteSousHanche === null ? "?" : (l.teteSousHanche >= 0 ? "+" : "") + l.teteSousHanche.toFixed(2) + " m";
    const genou = l.flexionGenou === null ? "?" : l.flexionGenou.toFixed(0) + "°";
    const regard = l.regard === null ? "?" : (l.regard >= 0 ? "+" : "") + l.regard.toFixed(2);
    const contact = l.contactBois === null ? "?" : (l.contactBois >= 0 ? "+" : "") + (l.contactBois * 100).toFixed(1) + " cm";
    console.log(`  ${l.scenario.padEnd(26)} ${(l.abduction.toFixed(1) + "°").padStart(12)}   ${(l.envergureMains?.toFixed(2) ?? "?") + " m"}    ${buste.padStart(5)}   ${delta.padStart(9)}   ${genou.padStart(5)}   ${regard.padStart(6)}   ${contact.padStart(9)}`);
  }
  console.log("");
  console.log("  Repere : le yoleur porte le levier PAR LE DOS — regard > 0, face tournee");
  console.log("  vers le bateau et la voile. Jambes repliees franchement, bassin en pivot.");
  console.log("");
  if (echecs.length) {
    console.log(`ECHECS (${echecs.length}) :`);
    for (const e of echecs) console.log(`  - ${e}`);
  } else {
    console.log("Tous les seuils sont tenus.");
  }
}

if (process.argv.includes("--strict") && echecs.length) process.exit(1);
