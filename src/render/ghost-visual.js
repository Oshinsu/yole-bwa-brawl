// Fantôme : la silhouette translucide d'une yole, pilotée par une trace de
// replay et non par la simulation.
//
// Volontairement PAUVRE : une coque, une voile en deux triangles, un mât et une
// balise. À la distance de jeu, c'est la silhouette qui se lit, pas le détail —
// et le fantôme ne doit jamais se confondre avec une rivale réelle. Il partage
// la géométrie de coque livrée (GLB ou procédurale) pour rester une yole, et
// rien d'autre : pas d'équipage, pas de sillage, pas d'écume, aucune lecture de
// la mer. Aucun draw call n'est payé tant qu'aucune trace n'est armée.

import { HULL_VISUAL_WIDTH_SCALE, makeHullGeometry } from "./yole-visual.js";

export const GHOST_DEFAULT_COLOR = 0x9df6ff;
export const GHOST_HULL_OPACITY = 0.30;
export const GHOST_SAIL_OPACITY = 0.20;
export const GHOST_BEACON_HEIGHT = 7.1;

function makeGhostSailGeometry(THREE) {
  // Mât à z = 0,5 comme la yole réelle ; pied de 3,65 m vers l'arrière, têtière
  // de 1,31 m — les proportions mesurées de la voile, sans son creux.
  const positions = new Float32Array([
    0, 0.9, 0.5,
    0, 0.9, 0.5 - 3.65,
    0, 6.1, 0.5 - 1.31,
    0, 6.1, 0.5
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals?.();
  return geometry;
}

export class GhostVisual {
  constructor(THREE, assets = null, color = GHOST_DEFAULT_COLOR) {
    this.THREE = THREE;
    this.root = new THREE.Group();
    this.root.name = "ghost-yole";
    this.root.visible = false;
    this.tiltRoot = new THREE.Group();
    this.root.add(this.tiltRoot);

    this.hullFromAsset = Boolean(assets?.has?.("hull"));
    const hullGeometry = (this.hullFromAsset ? assets.get("hull") : null) ?? makeHullGeometry(THREE);
    this.material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: GHOST_HULL_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.sailMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: GHOST_SAIL_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.hull = new THREE.Mesh(hullGeometry, this.material);
    this.hull.scale.x = HULL_VISUAL_WIDTH_SCALE;
    this.hull.castShadow = false;
    this.hull.receiveShadow = false;
    this.sailGeometry = makeGhostSailGeometry(THREE);
    this.sail = new THREE.Mesh(this.sailGeometry, this.sailMaterial);
    this.mastGeometry = new THREE.CylinderGeometry(0.06, 0.08, 6.2, 6);
    this.mast = new THREE.Mesh(this.mastGeometry, this.material);
    this.mast.position.set(0, 3.05, 0.5);
    this.beaconGeometry = new THREE.TorusGeometry(0.42, 0.06, 6, 18);
    this.beaconMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false });
    this.beacon = new THREE.Mesh(this.beaconGeometry, this.beaconMaterial);
    this.beacon.rotation.x = Math.PI / 2;
    this.beacon.position.y = GHOST_BEACON_HEIGHT;
    // Une yole translucide se dessine APRÈS l'eau et les coques opaques, sinon
    // l'océan la recouvre à moitié selon l'ordre de soumission.
    for (const mesh of [this.hull, this.sail, this.mast, this.beacon]) mesh.renderOrder = 8;
    this.tiltRoot.add(this.hull, this.sail, this.mast);
    this.root.add(this.beacon);
  }

  /** Même convention que YoleVisual : cap sur la racine, gîte inversée et tangage sur le groupe incliné. */
  setPose(pose, time = 0) {
    if (!pose) return false;
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.y = pose.heading;
    this.tiltRoot.rotation.z = -pose.roll;
    this.tiltRoot.rotation.x = pose.pitch;
    this.beacon.position.y = GHOST_BEACON_HEIGHT + Math.sin(time * 2.4) * 0.12;
    this.beacon.rotation.z = time * 0.8;
    return true;
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible);
    return this.root.visible;
  }

  setColor(color) {
    this.material.color?.set?.(color);
    this.sailMaterial.color?.set?.(color);
    this.beaconMaterial.color?.set?.(color);
  }

  dispose() {
    this.root.parent?.remove?.(this.root);
    // La coque venue des assets est partagée avec les quatre yoles : on ne la
    // libère pas. Tout le reste appartient au fantôme.
    if (!this.hullFromAsset) this.hull.geometry?.dispose?.();
    this.sailGeometry.dispose?.();
    this.mastGeometry.dispose?.();
    this.beaconGeometry.dispose?.();
    this.material.dispose?.();
    this.sailMaterial.dispose?.();
    this.beaconMaterial.dispose?.();
  }
}
