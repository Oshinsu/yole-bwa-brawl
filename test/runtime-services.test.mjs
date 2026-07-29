import assert from 'node:assert/strict';
import { SettingsStore, DEFAULT_SETTINGS } from '../src/core/settings.js';
import { LocalTelemetry } from '../src/core/telemetry.js';
import { SpatialHash2D } from '../src/core/spatial-hash.js';
import { QualityManager } from '../src/core/quality.js';
import { AssetLibrary, YOLE_PARTS, YOLE_RIGS, CREW_JOINTS } from '../src/render/assets.js';

class MemoryStorage {
  constructor(seed = {}) { this.data = new Map(Object.entries(seed)); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const storage = new MemoryStorage();
const settings = new SettingsStore(storage);
assert.deepEqual(settings.snapshot(), DEFAULT_SETTINGS);
let notification = null;
const unsubscribe = settings.subscribe((key, value, snapshot) => { notification = { key, value, snapshot }; });
assert.equal(settings.toggle('reduceFlash'), true);
assert.equal(settings.get('reduceFlash'), true);
assert.equal(notification.key, 'reduceFlash');
unsubscribe();
const reloaded = new SettingsStore(storage);
assert.equal(reloaded.get('reduceFlash'), true);
assert.equal(reloaded.set('notASetting', 1), false);
reloaded.reset();
assert.deepEqual(reloaded.snapshot(), DEFAULT_SETTINGS);

const broken = new SettingsStore(new MemoryStorage({ 'yole-bwa-brawl-v3-2-settings': '{broken' }));
assert.deepEqual(broken.snapshot(), DEFAULT_SETTINGS);

const telemetry = new LocalTelemetry(50);
for (let index = 0; index < 75; index++) telemetry.track('frame', { finite: index + 0.12349, bad: Infinity, ignored: { nested: true } }, index / 60);
telemetry.track('weapon', { id: 'wave', hit: true }, 2);
const snapshot = telemetry.snapshot();
assert.equal(snapshot.events.length, 50);
assert.equal(snapshot.counters.frame, 75);
assert.equal(snapshot.counters.weapon, 1);
assert.equal(snapshot.events.at(-2).payload.bad, 0);
assert.equal('ignored' in snapshot.events.at(-2).payload, false);
assert.doesNotThrow(() => JSON.parse(telemetry.export()));

const spatial = new SpatialHash2D(10);
const a = { id: 'a' };
const b = { id: 'b' };
spatial.insert(a, 0, 0, 9);
spatial.insert(b, 18, 0, 1);
const broad = spatial.queryCircle(0, 0, 25, []);
assert.equal(broad.filter((item) => item === a).length, 1, 'multi-cell item was duplicated');
assert.ok(broad.includes(b));
spatial.clear();
assert.equal(spatial.queryCircle(0, 0, 25, []).length, 0);

const applied = [];
globalThis.devicePixelRatio = 2;
const quality = new QualityManager((profile, tier) => applied.push({ profile, tier }), 2);
assert.equal(applied.at(-1).profile.label, 'HQ');
for (let frame = 0; frame < 260; frame++) quality.update(25);
assert.equal(quality.tier, 1, 'automatic quality failed to descend under sustained load');
quality.setTier(0, true);
for (let frame = 0; frame < 900; frame++) quality.update(8);
assert.equal(quality.tier, 0, 'manual tier changed automatically');
quality.setAutomatic();
for (let frame = 0; frame < 1500; frame++) quality.update(8);
assert.ok(quality.tier >= 1, 'automatic quality failed to recover');

// Les modeles GLB sont strictement optionnels : absence d'addon, fichier
// introuvable ou GLB corrompu ne doivent jamais lever ni bloquer le demarrage.
const missing = new AssetLibrary({});
const missingResult = await missing.load(YOLE_PARTS, './assets/models/absent-exprès/');
assert.ok(['unavailable', 'fallback'].includes(missingResult.status), `statut inattendu: ${missingResult.status}`);
assert.equal(missing.available, false, 'aucune piece ne doit etre declaree disponible');
assert.equal(missing.get('hull'), null, 'get() doit rendre null, pas undefined');
assert.equal(missing.has('hull'), false);

// Un rig absent se comporte comme une piece absente : jamais de leve, jamais
// d'equipier a moitie anime.
assert.equal(missing.hasRig('crew'), false);
assert.equal(missing.instantiate('crew'), null, 'instantiate() doit rendre null sans rig');
assert.deepEqual(missing.animations('crew'), [], 'animations() doit rendre un tableau vide');

// findJoint tolere les noms assainis par GLTFLoader (les points sont retires).
const fakeRig = { getObjectByName: (name) => (name === 'armL' ? { name } : null) };
assert.equal(AssetLibrary.findJoint(fakeRig, CREW_JOINTS.leftArmPivot)?.name, 'armL',
  'la table d alias doit couvrir les noms assainis par GLTFLoader');
assert.equal(AssetLibrary.findJoint(fakeRig, CREW_JOINTS.head), null);

// Le contrat de pieces reste declaratif et non vide : c'est lui que suit le baker.
assert.ok(Object.keys(YOLE_PARTS).length >= 1, 'YOLE_PARTS vide');
assert.ok(Object.values(YOLE_PARTS).every((file) => file.endsWith('.glb')), 'YOLE_PARTS doit lister des .glb');
assert.ok(Object.values(YOLE_RIGS).every((file) => file.endsWith('.glb')), 'YOLE_RIGS doit lister des .glb');
assert.equal(Object.keys(CREW_JOINTS).length, 7, 'le jeu pilote sept articulations');

console.log(JSON.stringify({
  ok: true,
  settingsPersisted: true,
  telemetryRetained: snapshot.events.length,
  telemetryCount: snapshot.counters.frame,
  broadphaseUnique: broad.length,
  finalQualityTier: quality.tier,
  assetFallbackStatus: missingResult.status,
  assetPartsDeclared: Object.keys(YOLE_PARTS).length,
  assetRigsDeclared: Object.keys(YOLE_RIGS).length,
  crewJoints: Object.keys(CREW_JOINTS).length
}, null, 2));
