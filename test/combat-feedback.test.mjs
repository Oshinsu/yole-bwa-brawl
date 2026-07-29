import assert from "node:assert/strict";
import { BALANCE } from "../src/game/balance.js";
import { WeaponSystems } from "../src/game/weapons.js";
import { JUICE_VFX, SPELL_VFX } from "../src/render/vfx.js";
import { IMPACT_TIERS } from "../src/render/impact.js";

assert.ok(IMPACT_TIERS.slam.freeze >= 0.07 && IMPACT_TIERS.slam.shake >= 0.5);
assert.ok(IMPACT_TIERS.blast.kick >= 1.3 && IMPACT_TIERS.blast.flash >= 0.5);
assert.ok(IMPACT_TIERS.harpoon.kick > IMPACT_TIERS.slam.kick);
assert.ok(IMPACT_TIERS.mine.aftershock > IMPACT_TIERS.coconut.aftershock);

// Le Coco doit toucher une cible qui aurait été hors de l'ancien rayon de 6,5 m,
// tout en déclenchant la nouvelle hiérarchie visuelle.
{
  const calls = { explosions: [], spells: [], juice: [], rings: [], particles: [], impacts: [], hits: [] };
  const owner = { id: 1, isPlayer: true };
  const target = {
    id: 2,
    x: 8,
    z: 0,
    isPlayer: false,
    eliminated: false,
    dynamics: { heading: 0 },
    applyHit(_source, payload) { calls.hits.push(payload); }
  };
  let queryRadius = 0;
  const game = {
    waveField: { sample: () => ({ height: 0 }) },
    waterScratch: {},
    ocean: { wake: { burst() {} } },
    explosions: { spawn(...args) { calls.explosions.push(args); } },
    spellVfx: { spawn(...args) { calls.spells.push(args); } },
    juiceVfx: { spawn(...args) { calls.juice.push(args); } },
    rings: { burst(...args) { calls.rings.push(args); } },
    particles: { emitBurst(_rng, _position, _color, count) { calls.particles.push(count); } },
    visualRng: {},
    spatial: {
      queryCircle(_x, _z, radius) {
        queryRadius = radius;
        return [target];
      }
    },
    spatialScratch: [],
    proximity: () => 0.5,
    panFor: () => 0,
    audio: { play() {} },
    shake: 0,
    postFX: { pulse() {} },
    impact: { trigger(tier, payload) { calls.impacts.push({ tier, payload }); } },
    boats: [{ x: 0, z: 0 }],
    telemetry: { track() {} },
    time: 0,
    showMessage() {},
    settings: { get: () => false }
  };

  WeaponSystems.impactWave.call(game, { x: 0, y: 1, z: 0, kind: "wave", owner }, target);

  assert.equal(queryRadius, 9.5);
  assert.equal(BALANCE.pwason.triggerRadius, 3.4, "agrandir le Coco ne doit pas gonfler le verrouillage du Pwason");
  assert.equal(BALANCE.pwason.capsuleHit, 2.55, "agrandir le Coco ne doit pas gonfler la collision du Pwason");
  assert.equal(calls.hits.length, 1, "une cible à 8 m doit être dans le nouveau rayon Coco");
  assert.ok(calls.hits[0].waterKg >= 12, "le bord du rayon Coco ne produit aucun dégât utile");
  assert.ok(calls.explosions[0][3] >= 7.4, "le billboard d'explosion Coco reste trop petit");
  assert.equal(calls.spells[0][3], SPELL_VFX.COCO_IMPACT);
  assert.ok(calls.spells[0][4] >= 7.2, "l'impact illustré Coco reste trop petit");
  assert.equal(calls.juice[0][3], JUICE_VFX.COCONUT_SHOCKWAVE);
  assert.ok(calls.juice[0][4] >= 9.5, "la signature V7 Coco reste trop petite");
  assert.equal(calls.rings.length, 3, "le Coco doit produire trois fronts d'onde lisibles");
  assert.ok(calls.particles.reduce((sum, count) => sum + count, 0) >= 110);
  assert.equal(calls.impacts[0].tier, "coconut");
}

// La Mine conserve une hiérarchie encore au-dessus du Coco : trois fronts
// d'onde, une explosion double chiffre et un volume d'embruns vérifiable.
{
  const calls = { wakes: [], explosions: [], spells: [], juice: [], rings: [], particles: [], impacts: [] };
  const mine = {
    x: 0, z: 0, kind: "mine", active: true,
    owner: { id: 1, isPlayer: false },
    mesh: { visible: true }
  };
  const game = {
    waveField: { sample: () => ({ height: 0 }) },
    waterScratch: {},
    ocean: { wake: { burst(...args) { calls.wakes.push(args); } } },
    explosions: { spawn(...args) { calls.explosions.push(args); } },
    spellVfx: { spawn(...args) { calls.spells.push(args); } },
    juiceVfx: { spawn(...args) { calls.juice.push(args); } },
    rings: { burst(...args) { calls.rings.push(args); } },
    particles: { emitBurst(_rng, _position, _color, count) { calls.particles.push(count); } },
    visualRng: {},
    spatial: { queryCircle: () => [] },
    spatialScratch: [],
    proximity: () => 0.5,
    panFor: () => 0,
    audio: { play() {} },
    shake: 0,
    postFX: { pulse() {} },
    impact: { trigger(tier, payload) { calls.impacts.push({ tier, payload }); } },
    boats: [{ x: 0, z: 0 }],
    telemetry: { track() {} },
    time: 0,
    showMessage() {},
    settings: { get: () => false }
  };

  WeaponSystems.explodeMine.call(game, mine);

  assert.equal(calls.wakes.length, 3);
  assert.ok(calls.explosions[0][3] >= 10);
  assert.ok(calls.spells[0][4] >= 10);
  assert.equal(calls.juice[0][3], JUICE_VFX.MINE_DETONATION);
  assert.ok(calls.juice[0][4] >= 11);
  assert.equal(calls.rings.length, 3);
  assert.ok(calls.particles.reduce((sum, count) => sum + count, 0) >= 130);
  assert.equal(calls.impacts[0].tier, "mine");
  assert.equal(mine.active, false);
}

function makeGrapple() {
  return {
    active: true,
    life: 10,
    tension: 0,
    stress: 0,
    swing: 0,
    restLength: 10,
    damageTimer: 0,
    vfxTimer: 0,
    slingshotReady: false,
    start: { x: 0, y: 0, z: 0 },
    end: { x: 0, y: 0, z: 0 },
    line: {
      visible: true,
      material: { opacity: 1, color: { setHex() {} } },
      geometry: { attributes: { position: { array: new Float32Array(36), needsUpdate: false } } }
    },
    rope: { reset() {}, step() {}, writePositions() {} }
  };
}

function makeCableGame(owner, target, grapple, calls) {
  return {
    waveProjectiles: [],
    mines: [],
    grapples: [grapple],
    boats: [owner, target],
    waveField: { sample: () => ({ height: 0 }) },
    waterScratch: {},
    spellVfx: { spawn(...args) { calls.spells.push(args); } },
    atmosphere: { weather: { windVector: () => ({ x: 0, z: 0 }) } },
    qualityProfile: { ropeIterations: 4 },
    telemetry: { track(type, payload) { calls.telemetry.push({ type, payload }); } },
    showMessage() {},
    postFX: { pulse() {} },
    impact: { trigger() {} },
    stats: { slingshots: 0 },
    revengePending: null,
    time: 0,
    cutGrapple: WeaponSystems.cutGrapple,
    vfxScreenRotation: () => 0
  };
}

// Le verrouillage n'est plus seulement un câble dessiné : l'impact initial
// arrache déjà la cible vers le tireur et entame structure/cohésion.
{
  const calls = { hits: [], impacts: [], spells: [], juice: [] };
  const owner = {
    id: 1, x: 0, y: 0, z: 0, eliminated: false, isPlayer: false,
    ammo: { harpoon: 1 }, cooldowns: { harpoon: 0 },
    forward: (out) => Object.assign(out, { x: 0, z: 1 }),
    dynamics: { vx: 0, vz: 12, heading: 0 }
  };
  const target = {
    id: 2, x: 0, y: 0, z: 30, eliminated: false, isPlayer: false,
    dynamics: { vx: 0, vz: 11, heading: 0 },
    applyHit(_source, payload) { calls.hits.push(payload); }
  };
  const grapple = makeGrapple();
  const game = {
    allocate: () => grapple,
    grapples: [grapple],
    boats: [owner, target],
    forwardScratch: {},
    vfxScreenRotation: () => 0,
    spellVfx: { spawn(...args) { calls.spells.push(args); } },
    juiceVfx: { spawn(...args) { calls.juice.push(args); } },
    waveField: { sample: () => ({ height: 0 }) },
    waterScratch: {},
    rings: { burst() {} },
    particles: { emitBurst() {} },
    visualRng: {},
    proximity: () => 0.5,
    impact: { trigger(tier, payload) { calls.impacts.push({ tier, payload }); } },
    postFX: { pulse() {} },
    audio: { play() {} },
    panFor: () => 0,
    telemetry: { track() {} },
    settings: { get: () => false },
    showMessage() {},
    time: 0
  };

  assert.equal(WeaponSystems.fireHarpoon.call(game, owner, target), true);
  assert.equal(calls.hits.length, 1);
  // Les armes visent l'ÉQUILIBRE : le roulis est amplifié par
  // BALANCE.weaponBias.roll et la structure réduite d'autant. Les seuils suivent
  // donc le réglage au lieu d'être recopiés en dur — sinon un playtest qui bouge
  // le curseur casse le test sans rien apprendre.
  const biais = BALANCE.weaponBias;
  assert.ok(
    Math.abs(calls.hits[0].rollImpulse) >= 0.38 * biais.roll - 1e-9,
    `le harpon doit déséquilibrer: ${calls.hits[0].rollImpulse}`
  );
  assert.ok(biais.roll > 1, "le biais de roulis doit amplifier, pas atténuer");
  assert.ok(calls.hits[0].cohesionDamage >= 0.075);
  assert.ok(
    Math.abs(calls.hits[0].structure.hull - BALANCE.grapple.impactHull * biais.hull) < 1e-9,
    `dégât de coque non biaisé: ${calls.hits[0].structure.hull}`
  );
  assert.ok(biais.hull < 1, "la coque doit être moins punie que l'équilibre");
  assert.ok(calls.hits[0].impulseZ < 0, "la cible n'est pas arrachée vers le tireur");
  assert.equal(grapple.restLength, 23.5);
  assert.equal(grapple.line.visible, true);
  assert.equal(calls.impacts[0].tier, "harpoon");
  assert.equal(calls.juice[0][3], JUICE_VFX.HARPOON_TEAR);
}

// Le câble doit accélérer très majoritairement le propriétaire et borner les
// dégâts de tension à la cadence configurée.
{
  const calls = { spells: [], telemetry: [], damage: [] };
  const owner = {
    id: 1, x: 0, y: 0, z: 0, steer: 0, eliminated: false, isPlayer: false,
    forward: (out) => Object.assign(out, { x: 0, z: 1 }),
    dynamics: { vx: 0, vz: 0, heading: 0, rhum: 0, triggerSlingshot() {} }
  };
  const target = {
    id: 2, x: 0, y: 0, z: 30, eliminated: false, isPlayer: false,
    dynamics: { vx: 0, vz: 0, heading: 0, rollVel: 0, rhum: 0 },
    applyHit(_source, payload) { calls.damage.push(payload); }
  };
  const grapple = makeGrapple();
  grapple.owner = owner;
  grapple.target = target;
  const game = makeCableGame(owner, target, grapple, calls);

  for (let tick = 0; tick < 60; tick++) WeaponSystems.updateWeapons.call(game, 1 / 60);

  assert.ok(owner.dynamics.vz > 18, "le propriétaire n'est pas franchement attiré vers l'ancre");
  assert.ok(Math.abs(owner.dynamics.vz) > Math.abs(target.dynamics.vz) * 6, "la cible n'agit pas comme une ancre");
  assert.ok(calls.damage.length >= 1 && calls.damage.length <= 2, `dégâts de tension non bornés: ${calls.damage.length}`);
  assert.ok(calls.spells.length <= 4, `feedback de tension spammé: ${calls.spells.length}`);
  assert.equal(grapple.active, true, "le câble casse avant d'avoir servi");
}

// Après avoir chargé puis dépassé l'ancre sur un cap transversal, le slingshot
// doit lancer vers l'avant. Le test ne peut donc pas passer avec un simple
// comparatif sur l'axe Z du monde.
{
  const calls = { spells: [], telemetry: [], sling: null };
  const owner = {
    id: 1, x: 32, y: 0, z: 1, steer: 0, eliminated: false, isPlayer: false,
    forward: (out) => Object.assign(out, { x: 1, z: 0 }),
    dynamics: {
      vx: 0, vz: 0, heading: 0, rhum: 0,
      triggerSlingshot(x, z, strength) { calls.sling = { x, z, strength }; }
    }
  };
  const target = {
    id: 2, x: 0, y: 0, z: 0, eliminated: false, isPlayer: false,
    dynamics: { vx: 0, vz: 0, heading: 0, rollVel: 0, rhum: 0 },
    applyHit() {}
  };
  const grapple = makeGrapple();
  grapple.owner = owner;
  grapple.target = target;
  grapple.slingshotReady = true;
  const game = makeCableGame(owner, target, grapple, calls);

  WeaponSystems.updateWeapons.call(game, 1 / 60);

  assert.ok(calls.sling, "le câble chargé n'a pas produit de slingshot après dépassement");
  assert.ok(calls.sling.x > 0.8, `le slingshot repart vers l'ancre au lieu d'avancer: ${calls.sling.x}`);
  assert.ok(calls.sling.strength >= 1.1, "le slingshot manque d'impulsion mesurable");
  assert.equal(grapple.active, false, "le câble doit se libérer après le slingshot");
}

console.log(JSON.stringify({
  ok: true,
  coconut: {
    triggerRadius: BALANCE.coconut.triggerRadius,
    capsuleHit: BALANCE.coconut.capsuleHit,
    aoeRadius: BALANCE.coconut.aoeRadius
  },
  grapple: {
    ownerToTargetPullRatio: BALANCE.grapple.pullOwner / BALANCE.grapple.pullTarget,
    life: BALANCE.grapple.life,
    maxDistance: BALANCE.grapple.maxDistance,
    tensionDamageInterval: BALANCE.grapple.tensionDamageInterval
  }
}, null, 2));
