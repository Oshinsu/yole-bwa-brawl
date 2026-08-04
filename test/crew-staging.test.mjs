import assert from "node:assert/strict";
import {
  CREW_CONTACT_LIMITS,
  CREW_PROCEDURAL_REFERENCE_HEIGHT,
  CREW_ROOT_SCALE,
  CREW_STAGING_FAMILIES,
  CREW_STAGING_PROFILES,
  CREW_TARGET_HEIGHT,
  crewDeploymentForRoll,
  crewPresentationScale,
  crewProfileDeployment
} from "../src/render/yole-visual.js";

assert.equal(CREW_STAGING_PROFILES.length, 6, "the six dresseur stations disappeared");
assert.deepEqual(
  [...new Set(CREW_STAGING_PROFILES.map((profile) => profile.family))],
  CREW_STAGING_FAMILIES,
  "the contact-first anchor/lever/extension families drifted"
);

const stationCounts = Object.fromEntries(
  ["interieur", "court", "intermediaire", "extreme"].map((station) => [
    station,
    CREW_STAGING_PROFILES.filter((profile) => profile.station === station).length
  ])
);
assert.deepEqual(
  stationCounts,
  { interieur: 1, court: 2, intermediaire: 2, extreme: 1 },
  "the loaded crew collapsed back into six equivalent outboard posts"
);

const atDegrees = (degrees) => crewDeploymentForRoll(degrees * Math.PI / 180);
assert.equal(atDegrees(0), 0);
assert.equal(atDegrees(1.5), 0, "flat-water noise deploys the crew");
assert.ok(
  atDegrees(6) > 0.20 && atDegrees(6) < 0.55,
  `6 degrees should be a partial deployment, got ${atDegrees(6).toFixed(3)}`
);
assert.ok(atDegrees(12) > 0.999, "a strong heel never reaches full visual authority");

let previous = 0;
for (let degrees = 0; degrees <= 14; degrees += 0.25) {
  const deployment = atDegrees(degrees);
  assert.ok(deployment + 1e-9 >= previous, "crew deployment is not monotonic");
  previous = deployment;
}

const moderate = atDegrees(6);
assert.ok(
  crewProfileDeployment(CREW_STAGING_PROFILES[0], moderate)
    > crewProfileDeployment(CREW_STAGING_PROFILES[1], moderate),
  "the short anchor no longer loads before the intermediate lever"
);
assert.equal(
  crewProfileDeployment(CREW_STAGING_PROFILES[2], moderate),
  0,
  "the extreme yoleur leaves the boat during a moderate heel"
);

const loadedPositions = CREW_STAGING_PROFILES.map((profile, index) =>
  profile.reach * crewProfileDeployment(profile, 1) + (index - 2.5) * 0.07
);
const loadedOutsideHull = loadedPositions.filter((x) => Math.abs(x) > 0.90).length;
assert.equal(
  loadedOutsideHull,
  5,
  "the reference load must keep one dresseur in the hull instead of exporting all six"
);
assert.ok(Math.max(...loadedPositions) > 2.60, "the single extreme silhouette disappeared");
assert.ok(Math.min(...loadedPositions) < 0.75, "no interior anchor remains in the human cluster");

const canonicalPresentedHeight = CREW_TARGET_HEIGHT * CREW_ROOT_SCALE;
assert.ok(
  canonicalPresentedHeight > 1.60 && canonicalPresentedHeight < 1.75,
  `canonical yoleur still reads as a miniature: ${canonicalPresentedHeight.toFixed(2)} m`
);
assert.ok(
  Math.abs(
    CREW_PROCEDURAL_REFERENCE_HEIGHT * crewPresentationScale(false)
      - canonicalPresentedHeight
  ) < 1e-9,
  "the procedural fallback no longer matches the rigged crew height"
);
assert.ok(CREW_CONTACT_LIMITS.firm <= 0.10);
assert.ok(CREW_CONTACT_LIMITS.soft <= 0.18);

console.log(JSON.stringify({
  crewStagingOk: true,
  families: CREW_STAGING_FAMILIES,
  stations: stationCounts,
  deploymentAt6Degrees: +moderate.toFixed(3),
  loadedOutsideHull,
  loadedPositions: loadedPositions.map((value) => +value.toFixed(2)),
  canonicalPresentedHeight: +canonicalPresentedHeight.toFixed(2),
  contactLimits: CREW_CONTACT_LIMITS
}, null, 2));
