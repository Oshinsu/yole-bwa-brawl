import assert from 'node:assert/strict';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...items) { items.forEach((item) => this.values.add(item)); }
  remove(...items) { items.forEach((item) => this.values.delete(item)); }
  toggle(item, force) {
    if (force === undefined) force = !this.values.has(item);
    if (force) this.values.add(item); else this.values.delete(item);
    return force;
  }
  contains(item) { return this.values.has(item); }
}

class FakeGradient { addColorStop() {} }
class FakeContext2D {
  constructor() { this.fillStyle = '#000'; this.strokeStyle = '#fff'; this.globalCompositeOperation = 'source-over'; this.lineWidth = 1; }
  fillRect() {} save() {} restore() {} translate() {} rotate() {} scale() {}
  beginPath() {} ellipse() {} fill() {} arc() {} stroke() {}
  createRadialGradient() { return new FakeGradient(); }
}
class FakeCanvas {
  constructor(width = 256, height = 256) { this.width = width; this.height = height; this.style = {}; }
  getContext(kind) { return kind === '2d' ? new FakeContext2D() : {}; }
  addEventListener() {}
}
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.classList = new FakeClassList();
    this.style = {};
    this.children = [];
    this.textContent = '';
    this.innerHTML = '';
    this.onclick = null;
    this.className = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }
  remove() { this.removed = true; }
  addEventListener() {}
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 140, height: 140 }; }
}

const document = {
  createElement(tag) { return tag === 'canvas' ? new FakeCanvas() : new FakeElement(tag); }
};
globalThis.document = document;
globalThis.window = globalThis;
globalThis.OffscreenCanvas = FakeCanvas;
Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {} }, configurable: true });
globalThis.location = { search: '?seed=smoke-v2', reload() {} };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.setTimeout = (fn) => { fn?.(); return 0; };
globalThis.performance = { now: () => 0 };

const THREE = await import('./mock-three.module.js');
const { Game } = await import('../src/game/game.js');

const uiKeys = [
  'viewport','play','rematch','retry','pauseBtn','resume','restart','sound','quality',
  'weaponSlot','weaponSlotIco','weaponSlotName','weaponSlotCd','bwa','weaponHold2','weaponCrate','zoomIn','zoomOut','zoomValue','joystick','joyKnob','menu','hud','end',
  'pause','rotate','message','damage','stormVignette','killfeed','damageNumbers','countdown','spectateur','leaderboard','roundLabel',
  'timer','speed','balanceBar','balanceText','flowBar','flowText','crewDots','trimText','waterText',
  'storm','stormDistance','reticle','perf','endIcon',
  'endTitle','endCopy','statTakedowns','statPerfects','statSpeed','replay','downloadReplay','replayStatus','weatherChip','hullBar','hullText','mastBar','sailBar','bwaIntegrityBar'
];
const ui = Object.fromEntries(uiKeys.map((key) => [key, new FakeElement()]));
ui.viewport = new FakeElement('main');

const game = new Game(THREE, ui);
game.audio.muted = true;
// Indépendance à la cadence d'image.
//
// La simulation tourne à pas fixe, mais tout ce qui l'alimente ne le faisait pas
// forcément. La grille de sillage était avancée depuis frame(), avec le delta
// d'image RÉEL et recentrée sur une position de RENDU — et la physique
// l'échantillonne pour composer la hauteur d'eau sous chaque point de
// flottaison (yole-physics.js, sampleDisturbance -> waterHeight -> poussée
// d'Archimède). Le rendu avait donc autorité sur le gameplay, et un replay
// enregistré à 60 Hz ne se rejouait pas à l'identique ailleurs.
//
// Ce test pilote frame() à trois cadences jusqu'au MÊME tick de simulation.
// Comparer à durée égale ne prouverait rien : les cadences ne tombent pas sur
// le même nombre de ticks.

// À 30 Hz une image consomme DEUX ticks : le tick observé saute. On relève donc
// le checksum de chaque tick effectivement atteint, et on compare sur le plus
// grand tick COMMUN aux trois cadences. Imposer un tick fixe rendait le test
// fragile à tout changement de dynamique — il a cassé au premier ajout d'armes.
function joue(msParImage, tickCible) {
  const jeu = new Game(THREE, Object.fromEntries(uiKeys.map((cle) => [cle, new FakeElement()])));
  jeu.audio.muted = true;
  jeu.startMatch();
  // ⚠️ ON SAUTE LE 3 · 2 · 1 · GO. Depuis qu'il existe, `fixedUpdate` GÈLE tout
  // tant que `countdown > 0` : les yoles ne bougent pas, rien ne se simule. Un
  // test qui enchaîne startMatch() puis fixedUpdate() ne mesurerait donc que du
  // vide. On force le rebours à zéro pour reprendre au premier tick réel.
  jeu.countdown = 0;
  const parTick = new Map();
  let horloge = 0;
  let garde = 0;
  let dernier = -1;
  while (dernier < tickCible && garde++ < 200000) {
    horloge += msParImage;
    jeu.frame(horloge);
    const etat = jeu.debugState();
    if (etat.tick !== dernier) {
      dernier = etat.tick;
      parTick.set(etat.tick, etat.checksum);
    }
  }
  return parTick;
}

const CIBLE = 1400;
const a = joue(1000 / 60, CIBLE);
const b = joue(1000 / 60, CIBLE);
const rapide = joue(1000 / 144, CIBLE);
const lent = joue(1000 / 30, CIBLE);

let commun = -1;
for (const tick of a.keys()) {
  if (tick <= CIBLE && b.has(tick) && rapide.has(tick) && lent.has(tick) && tick > commun) commun = tick;
}
assert.ok(commun > 800, `aucun tick commun exploitable aux trois cadences : ${commun}`);
assert.equal(a.get(commun), b.get(commun), `60 Hz n'est pas reproductible au tick ${commun}`);
assert.equal(rapide.get(commun), a.get(commun), `144 Hz diverge de 60 Hz au tick ${commun}`);
assert.equal(lent.get(commun), a.get(commun), `30 Hz diverge de 60 Hz au tick ${commun}`);

console.log(JSON.stringify({
  framerateOk: true,
  tickCommun: commun,
  checksum: a.get(commun),
  cadences: ["30 Hz", "60 Hz", "144 Hz"]
}, null, 2));
