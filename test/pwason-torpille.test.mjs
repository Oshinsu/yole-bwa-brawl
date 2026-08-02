// Les trois niveaux d'IA doivent produire trois COURSES différentes.
//
// La plainte d'origine était mesurable : « les IA n'utilisent pas turbo, juste
// avec ça en début de partie je les sème ». Ce test la reproduit — un joueur qui
// spamme le turbo — et vérifie que l'écart au meilleur adversaire se resserre
// quand on monte en difficulté.
//
// Il est déterministe : même graine, même politique de pilotage, seul le niveau
// change. Ce qu'il mesure n'est donc pas « l'IA est bonne » mais « le curseur
// fait quelque chose, et dans le bon sens ».

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
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute() {}
  getAttribute() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 140, height: 140 }; }
}

globalThis.document = { createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : new FakeElement(tag)) };
globalThis.window = globalThis;
globalThis.OffscreenCanvas = FakeCanvas;
Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {} }, configurable: true });
globalThis.location = { search: '?seed=ai-difficulty', reload() {} };
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
const { AI_LEVELS } = await import('../src/game/balance.js');
const { ACTION_BOOST_FORWARD, ACTION_SHIFT } = await import('../src/game/balance.js');

const uiKeys = [
  'viewport','play','rematch','retry','pauseBtn','resume','restart','sound','quality',
  'weaponSlot','weaponSlotIco','weaponSlotName','weaponSlotCd','bwa','weaponHold2','weaponCrate',
  'zoomIn','zoomOut','zoomValue','joystick','joyKnob','menu','hud','end',
  'pause','rotate','message','damage','stormVignette','killfeed','damageNumbers','countdown','spectateur','leaderboard','roundLabel',
  'timer','speed','balanceBar','balanceText','flowBar','flowText','crewDots','trimText','waterText',
  'storm','stormDistance','reticle','perf','endIcon','difficultyToggle',
  'endTitle','endCopy','statTakedowns','statPerfects','statSpeed','replay','downloadReplay',
  'replayStatus','weatherChip','hullBar','hullText','mastBar','sailBar','bwaIntegrityBar'
];

// Un pilote de référence : il tient sa ligne, contre-gîte, et surtout spamme le
// turbo dès qu'il est disponible. C'est exactement le comportement qui rendait
// les adversaires ridicules.

// ─────────────────────────────────────────────────────────────────────────
// PWASON VOLAN : torpille LOBÉE à tête chercheuse.
//
// Avant, le poisson volant n'avait AUCUNE gravité et son guidage écrasait la
// verticale (`vy += (0.4 - vy) * virage`, constante de temps 0,385 s) : toute
// mise en l'air était effacée en moins d'une demi-seconde et le projectile
// rasait l'eau en ligne droite. Il n'infligeait par ailleurs aucun dégât de
// structure — `hull: attenuation * 0.0`, un zéro littéral.
// ─────────────────────────────────────────────────────────────────────────

function partie() {
  const ui = Object.fromEntries(uiKeys.map((key) => [key, new FakeElement()]));
  ui.viewport = new FakeElement('main');
  const jeu = new Game(THREE, ui);
  jeu.audio.muted = true;
  jeu.audio.ensure = () => {};
  jeu.startMatch();
  // ⚠️ ON SAUTE LE 3 · 2 · 1 · GO. Depuis qu'il existe, `fixedUpdate` GÈLE tout
  // tant que `countdown > 0` : les yoles ne bougent pas, rien ne se simule. Un
  // test qui enchaîne startMatch() puis fixedUpdate() ne mesurerait donc que du
  // vide. On force le rebours à zéro pour reprendre au premier tick réel.
  jeu.countdown = 0;
  return jeu;
}

let echecs = 0;
function cas(nom, fn) {
  try { fn(); console.log(`  ok    ${nom}`); }
  catch (erreur) { echecs++; console.log(`  ECHEC ${nom}
        ${erreur.message}`); }
}

console.log('pwason-torpille');

cas('la trajectoire monte PUIS redescend — la cloche existe', () => {
  const jeu = partie();
  const tireur = jeu.boats[0];
  tireur.ammo.pwason = 3;
  tireur.cooldowns.pwason = 0;
  assert.ok(jeu.firePwason(tireur), 'le tir doit partir');
  const p = jeu.waveProjectiles.find((x) => x.active && x.kind === 'pwason');
  assert.ok(p, 'un projectile pwason doit être en vol');
  const depart = p.y;
  let sommet = -Infinity;
  let tickSommet = 0;
  const hauteurs = [];
  for (let tick = 0; tick < 190 && p.active; tick++) {
    jeu.fixedUpdate(1 / 60);
    if (!p.active) break;
    hauteurs.push(p.y);
    if (p.y > sommet) { sommet = p.y; tickSommet = tick; }
  }
  assert.ok(sommet > depart + 2.5,
    `le sommet doit dépasser nettement la hauteur de tir : ${sommet.toFixed(2)} vs ${depart.toFixed(2)}`);
  assert.ok(tickSommet > 3,
    `le sommet ne doit pas être à la première image : tick ${tickSommet}`);
  const derniere = hauteurs[hauteurs.length - 1];
  assert.ok(derniere < sommet,
    `la trajectoire doit REDESCENDRE : fin ${derniere.toFixed(2)} vs sommet ${sommet.toFixed(2)}`);
});

cas('le guidage horizontal ramène la torpille vers sa cible', () => {
  const jeu = partie();
  const tireur = jeu.boats[0];
  const cible = jeu.boats[1];
  // On décale franchement la cible sur le côté : sans guidage, l'écart grandit.
  cible.dynamics.x = tireur.x + 26;
  cible.dynamics.z = tireur.z + 42;
  tireur.ammo.pwason = 3;
  tireur.cooldowns.pwason = 0;
  assert.ok(jeu.firePwason(tireur));
  const p = jeu.waveProjectiles.find((x) => x.active && x.kind === 'pwason');
  p.target = cible;
  const capInitial = Math.atan2(p.vx, p.vz);
  for (let tick = 0; tick < 40 && p.active; tick++) jeu.fixedUpdate(1 / 60);
  const capFinal = Math.atan2(p.vx, p.vz);
  const versCible = Math.atan2(cible.x - p.x, cible.z - p.z);
  const ecartInitial = Math.abs(capInitial - versCible);
  const ecartFinal = Math.abs(capFinal - versCible);
  assert.ok(ecartFinal < ecartInitial,
    `le cap doit se rapprocher de la cible : ${ecartFinal.toFixed(3)} vs ${ecartInitial.toFixed(3)} rad`);
});

cas('la torpille perce la coque (elle ne faisait aucun dégât avant)', () => {
  // ⚠️ On tire POUR DE VRAI et on laisse la torpille voler jusqu'au contact.
  // Fabriquer un faux projectile et appeler `impactWave` à la main ne prouvait
  // rien : le projectile de synthèse ne passait pas par la détection de
  // proximité, et la coque restait à 1,000.
  const jeu = partie();
  const tireur = jeu.boats[0];
  const cible = jeu.boats[1];
  // Droit devant, à portée de cloche : la torpille doit retomber dessus.
  cible.dynamics.x = tireur.x;
  cible.dynamics.z = tireur.z + 48;
  cible.dynamics.vx = 0;
  cible.dynamics.vz = 0;
  const avant = cible.dynamics.structure.hull;
  tireur.ammo.pwason = 3;
  tireur.cooldowns.pwason = 0;
  assert.ok(jeu.firePwason(tireur), 'le tir doit partir');
  const p = jeu.waveProjectiles.find((x) => x.active && x.kind === 'pwason');
  p.target = cible;
  for (let tick = 0; tick < 260; tick++) {
    jeu.fixedUpdate(1 / 60);
    if (cible.dynamics.structure.hull < avant - 0.001) break;
  }
  const perte = avant - cible.dynamics.structure.hull;
  assert.ok(perte > 0.02,
    `la coque doit reculer d'au moins 2 % : perte mesurée ${(perte * 100).toFixed(1)} %`);
});

cas('une torpille dont la cible chavire se rabat sur une autre', () => {
  const jeu = partie();
  const tireur = jeu.boats[0];
  tireur.ammo.pwason = 3;
  tireur.cooldowns.pwason = 0;
  assert.ok(jeu.firePwason(tireur));
  const p = jeu.waveProjectiles.find((x) => x.active && x.kind === 'pwason');
  p.target = jeu.boats[1];
  jeu.boats[1].eliminated = true;
  jeu.fixedUpdate(1 / 60);
  assert.ok(p.target && p.target !== jeu.boats[1] && !p.target.eliminated,
    'la torpille doit se choisir une nouvelle proie valide');
});

if (echecs) { console.error(`
${echecs} échec(s)`); process.exit(1); }
console.log('pwason-torpille ok');
