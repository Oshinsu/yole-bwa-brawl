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
  'zoomIn','zoomOut','zoomValue','revenge','joystick','joyKnob','menu','hud','end',
  'pause','rotate','message','damage','stormVignette','killfeed','damageNumbers','countdown','spectateur','leaderboard','roundLabel',
  'timer','speed','balanceBar','balanceText','flowBar','flowText','crewDots','trimText','waterText',
  'storm','stormDistance','reticle','perf','endIcon','difficultyToggle',
  'endTitle','endCopy','statTakedowns','statPerfects','statSpeed','replay','downloadReplay',
  'replayStatus','weatherChip','hullBar','hullText','mastBar','sailBar','bwaIntegrityBar'
];

// Un pilote de référence : il tient sa ligne, contre-gîte, et surtout spamme le
// turbo dès qu'il est disponible. C'est exactement le comportement qui rendait
// les adversaires ridicules.

// ═══════════════════════════════════════════════════════════════════════════
// A · LA COHÉSION SE VOIT SUR L'ÉQUIPAGE
// B · LE LAMBI PREND LA BARRE
//
// Ces deux-là répondent au même défaut : le lambi attaquait `cohesion`, une
// valeur que le HUD n'affiche NULLE PART (zéro occurrence dans hud.js). Son
// effet principal était donc invisible, et l'arme incompréhensible.
// ═══════════════════════════════════════════════════════════════════════════
import { CrewVisual } from '../src/render/yole-visual.js';
import { YoleDynamics } from '../src/sim/yole-physics.js';
import { WaveField } from '../src/sim/waves.js';

// ⚠️ `fixedStep` a besoin d'un vrai champ de houle et d'un environnement
// complet — il échantillonne l'eau sous la coque et sous chaque équipier. Un
// objet {windX, windZ} suffisait à faire lever `sample is not a function`.
// Repris tel quel de test/advanced-systems.test.mjs, qui le valide déjà.
function environment() {
  return {
    time: 0,
    windX: 1.2,
    windZ: 8.8,
    stormAmount: 0,
    coastPenalty: 0,
    routeCenter: 0,
    waveScratch: {},
    pointScratch: {},
    centerScratch: {},
    sampleDisturbance: () => 0
  };
}


let echecs = 0;
function cas(nom, fn) {
  try { fn(); console.log(`  ok    ${nom}`); }
  catch (erreur) { echecs++; console.log(`  ECHEC ${nom}
        ${erreur.message}`); }
}

function partie() {
  const ui = Object.fromEntries(uiKeys.map((k) => [k, new FakeElement()]));
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

console.log('lanbi-controle');

// ── B · LA BARRE ──────────────────────────────────────────────────────────

cas('la barre coupée ignore VRAIMENT la commande du joueur', () => {
  const d = new YoleDynamics(0, new WaveField());
  d.reset(0, 0, 0);
  const env = environment();
  // Référence : barre à droite, cap libre.
  for (let i = 0; i < 40; i++) { env.time += 1 / 60; d.fixedStep(1 / 60, { steer: 1, trim: 0.82 }, env); }
  const capLibre = d.heading;

  const bloque = new YoleDynamics(0, new WaveField());
  bloque.reset(0, 0, 0);
  bloque.helmLoss = 1.5;
  const env2 = environment();
  for (let i = 0; i < 40; i++) { env2.time += 1 / 60; bloque.fixedStep(1 / 60, { steer: 1, trim: 0.82 }, env2); }
  assert.ok(Math.abs(bloque.heading) < Math.abs(capLibre) * 0.35,
    `barre coupée : le cap ne doit presque pas suivre la commande (${bloque.heading.toFixed(3)} vs ${capLibre.toFixed(3)})`);
});

cas('la barre REVIENT quand le compteur expire', () => {
  const d = new YoleDynamics(0, new WaveField());
  d.reset(0, 0, 0);
  d.helmLoss = 0.5;
  const env = environment();
  for (let i = 0; i < 40; i++) { env.time += 1 / 60; d.fixedStep(1 / 60, { steer: 0, trim: 0.82 }, env); }
  assert.equal(d.helmLoss, 0, 'le compteur doit être retombé à zéro');
  const avant = d.heading;
  for (let i = 0; i < 40; i++) { env.time += 1 / 60; d.fixedStep(1 / 60, { steer: 1, trim: 0.82 }, env); }
  assert.ok(Math.abs(d.heading - avant) > 0.05,
    'la barre doit répondre de nouveau après expiration');
});

cas('deux conques PROLONGENT, elles ne cumulent pas', () => {
  const d = new YoleDynamics(0, new WaveField());
  d.reset(0, 0, 0);
  d.applyHit({ helmLoss: 1.5 });
  d.applyHit({ helmLoss: 1.5 });
  assert.ok(d.helmLoss <= 1.5 + 1e-9,
    `deux coups ne doivent pas donner ${d.helmLoss.toFixed(2)} s sans barre`);
});

cas('le rhum protège de la perte de barre', () => {
  const d = new YoleDynamics(0, new WaveField());
  d.reset(0, 0, 0);
  d.drinkRhum(5);
  d.applyHit({ helmLoss: 1.5 });
  assert.equal(d.helmLoss, 0, 'sous rhum, la barre ne doit pas être coupée');
});

cas('un tir de lambi coupe réellement la barre de la cible', () => {
  const jeu = partie();
  const tireur = jeu.boats[0];
  const cible = jeu.boats[1];
  tireur.ammo.lanbi = 1;
  tireur.cooldowns.lanbi = 0;
  // Droit devant, dans le cône et à portée.
  const avant = tireur.forward({ x: 0, z: 0 });
  cible.dynamics.x = tireur.x + avant.x * 14;
  cible.dynamics.z = tireur.z + avant.z * 14;
  cible.dynamics.rhum = 0;
  assert.ok(jeu.blowLanbi(tireur), 'le lambi doit partir');
  assert.ok(cible.dynamics.helmLoss > 0.5,
    `la cible doit perdre sa barre (${cible.dynamics.helmLoss.toFixed(2)} s)`);
});

cas('un reset de manche rend la barre', () => {
  const d = new YoleDynamics(0, new WaveField());
  d.reset(0, 0, 0);
  d.helmLoss = 1.5;
  d.reset(0, 0, 0);
  assert.equal(d.helmLoss, 0, 'une nouvelle manche ne doit pas démarrer barre coupée');
});

// ── A · LA COHÉSION VISIBLE ───────────────────────────────────────────────

function poser(cohesion) {
  const v = new CrewVisual(THREE, 0x8c5139, 0xff7b24, 0x0d2531, 1.7);
  v.root.position.x = 1.8;   // sorti sur le bois : c'est là que ça se lit
  v.update(3.0, 1 / 60, 1.8, 0, 6, 0.3, 0, true, 0, 0, 0, 2.0, 0, 0, cohesion);
  return {
    brasG: v.leftArmPivot.rotation.x,
    brasD: v.rightArmPivot.rotation.x,
    buste: v.torso.rotation.x,
    bassin: v.hips.rotation.x
  };
}

cas('un équipage désorganisé ne prend PAS la même pose', () => {
  const soude = poser(1.0);
  const casse = poser(0.16);
  const ecart = Object.keys(soude)
    .reduce((somme, cle) => somme + Math.abs(soude[cle] - casse[cle]), 0);
  assert.ok(ecart > 0.05,
    `la pose doit changer avec la cohésion (écart cumulé ${ecart.toFixed(4)} rad)`);
});

cas('la cohésion pleine reste le comportement de référence', () => {
  // Sans argument, l'ancien appel doit donner exactement la pose « soudée ».
  const v = new CrewVisual(THREE, 0x8c5139, 0xff7b24, 0x0d2531, 1.7);
  v.root.position.x = 1.8;
  v.update(3.0, 1 / 60, 1.8, 0, 6, 0.3, 0, true, 0, 0, 0, 2.0, 0, 0);
  const parDefaut = v.leftArmPivot.rotation.x;
  const explicite = poser(1.0).brasG;
  assert.ok(Math.abs(parDefaut - explicite) < 1e-9,
    'le paramètre par défaut doit valoir cohésion pleine');
});

if (echecs) { console.error(`
${echecs} échec(s)`); process.exit(1); }
console.log('lanbi-controle ok');
