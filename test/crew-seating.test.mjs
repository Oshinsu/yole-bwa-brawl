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
  'weaponSlot','weaponSlotIco','weaponSlotName','weaponSlotCd','bwa','weaponHold2','weaponCrate','zoomIn','zoomOut','zoomValue','revenge','joystick','joyKnob','menu','hud','end',
  'pause','rotate','message','damage','stormVignette','killfeed','damageNumbers','countdown','spectateur','leaderboard','roundLabel',
  'timer','speed','balanceBar','balanceText','flowBar','flowText','crewDots','trimText','waterText',
  'storm','stormDistance','reticle','perf','endIcon',
  'endTitle','endCopy','statTakedowns','statPerfects','statSpeed','replay','downloadReplay','replayStatus','weatherChip','hullBar','hullText','mastBar','sailBar','bwaIntegrityBar'
];
const ui = Object.fromEntries(uiKeys.map((key) => [key, new FakeElement()]));
ui.viewport = new FakeElement('main');

const game = new Game(THREE, ui);
game.audio.muted = true;
game.audio.ensure = () => {};
// Assise de l'equipage sur les bois dresses.
//
// Une yole ronde n'a ni quille ni gouvernail : tout le couple de redressement
// vient du poids des hommes deporte sur les bois. Trois invariants de rendu
// tiennent cette image, et aucun n'est visible dans un test de simulation.
//
// Ces mesures exigent la VRAIE boucle de rendu : YoleVisual.update() part de
// frame(), pas de fixedUpdate(). Piloter fixedUpdate seul ne l'appelle qu'une
// fois, au reset, et toute mesure faite ainsi est nulle.

const CREW_BEAMS = [6, 5, 4, 3, 2, 1];
const BEAM_Z = [-3.05, -2.15, -1.05, 0.0, 1.0, 1.95, 2.85];
const BEAM_LEN = [5.6, 6.2, 6.6, 6.7, 6.4, 6.0, 5.3];
// Hauteur des bois : c'est la cote d'assise attendue du bassin.
const BEAM_Y = 0.25;

game.audio.muted = true;
game.startMatch();
// ⚠️ ON SAUTE LE 3 · 2 · 1 · GO. Depuis qu'il existe, `fixedUpdate` GÈLE tout
// tant que `countdown > 0` : les yoles ne bougent pas, rien ne se simule. Un
// test qui enchaîne startMatch() puis fixedUpdate() ne mesurerait donc que du
// vide. On force le rebours à zéro pour reprendre au premier tick réel.
game.countdown = 0;

let samples = 0, sumAbsX = 0, horsCoque = 0, coteHaut = 0, rollComptes = 0;
let pireEcartAuBois = 0, pireMarge = Infinity, etalementMax = 0;
// Deux seuils DISTINCTS, et c'est volontaire. Le lacet est proportionnel au
// deport (yaw = side x hike x 1,36 avec hike = |x| / 3,0) : exiger un lacet
// franc des 1,6 m demanderait 0,73 rad, pas 0,9. On verifie donc le SENS sur
// tous les sortis, et l'AMPLEUR seulement sur ceux qui sont vraiment au bout.
let sortis = 0, lacetCorrect = 0, pireAssise = 0;
let ticksElimines = 0, ticksTotal = 0;
let bienSortis = 0, lacetFranc = 0;

let now = 0;
for (let frame = 0; frame < 9000 && game.mode === 'playing'; frame++) {
  now += 1000 / 60;
  if (frame % 260 === 0) game.triggerPlayerShift();
  game.frame(now);
  if (frame % 5 !== 0) continue;
  for (const boat of game.boats) {
    ticksTotal++;
    if (boat.eliminated) { ticksElimines++; continue; }
    const roll = boat.dynamics.roll;
    let lo = Infinity, hi = -Infinity;
    // Seuls les equipiers EMBARQUES sont concernes : un homme perdu joue sa
    // chute puis reste ou elle l'a laisse, et un equipage passe par-dessus bord
    // n'est plus sur ses bois — par definition.
    const embarques = Math.min(6, boat.dynamics.activeCrew);
    for (let i = 0; i < embarques; i++) {
      if (!boat.visual.crew[i].visual.root.visible) continue;
      const homme = boat.visual.crew[i].visual;
      const { x, z } = homme.root.position;
      // Un homme SORTI doit être tourné vers le large et assis à hauteur de
      // bois. C'est le défaut relevé sur photo : les équipiers gardaient un
      // lacet nul — donc face à la proue — sur des perches qui courent en
      // travers. Personne ne peut être à califourchon sur un bois placé
      // perpendiculairement à son corps.
      if (Math.abs(x) > 1.6) {
        sortis++;
        // Le lacet doit envoyer la face du BON bord : signe opposé pour un
        // déport négatif, par construction de la rotation autour de Y.
        if (Math.sign(homme.root.rotation.y || 1) === Math.sign(x || 1)) lacetCorrect++;
        if (Math.abs(x) > 2.4) {
          bienSortis++;
          if (Math.abs(homme.root.rotation.y) > 0.9) lacetFranc++;
        }
        const bassinY = homme.root.position.y + 0.38 * homme.root.scale.y;
        const ecartAssise = Math.abs(bassinY - BEAM_Y);
        if (ecartAssise > pireAssise) pireAssise = ecartAssise;
      }
      samples++;
      sumAbsX += Math.abs(x);
      if (Math.abs(x) > 0.90) horsCoque++;
      if (Math.abs(roll) > 0.04) { rollComptes++; if (Math.sign(x) === -Math.sign(roll)) coteHaut++; }
      if (x < lo) lo = x;
      if (x > hi) hi = x;

      const ecart = Math.min(...BEAM_Z.map((b) => Math.abs(b - z)));
      if (ecart > pireEcartAuBois) pireEcartAuBois = ecart;

      const beam = CREW_BEAMS[i];
      const side = Math.sign(x || 1);
      const pointe = boat.visual.beams[beam].root.position.x + side * BEAM_LEN[beam] / 2;
      const marge = (pointe - x) * side;
      if (marge < pireMarge) pireMarge = marge;
    }
    if (hi - lo > etalementMax) etalementMax = hi - lo;
  }
}

const moyenneAbsX = sumAbsX / samples;
const pctLacetCorrect = lacetCorrect * 100 / Math.max(1, sortis);
const pctLacetFranc = lacetFranc * 100 / Math.max(1, bienSortis);
const pctHorsCoque = horsCoque * 100 / samples;
const pctCoteHaut = coteHaut * 100 / Math.max(1, rollComptes);

// ⚠️ Seuil abaissé de 20 000 à 12 000, et la RAISON compte plus que le chiffre :
// une yole éliminée n'est pas échantillonnée, et le modèle de dégâts a durci
// (coco 20 % de coque, mine 30 %, abordage au dash 18 %). Il y a donc plus de
// morts, donc moins d'échantillons — ce n'est pas la pose d'équipage qui a
// régressé. Le taux d'élimination est reporté ci-dessous pour que la dérive
// reste visible au lieu d'être absorbée en silence.
assert.ok(samples > 12000, `pas assez d'echantillons: ${samples}`);
assert.ok(sortis > 5000, `pas assez d'equipiers sortis sur les bois: ${sortis}`);

// 1. Chaque equipier est assis SUR un bois, pas entre deux.
assert.ok(pireEcartAuBois < 1e-6, `equipier a ${pireEcartAuBois.toFixed(3)} m du bois le plus proche`);

// 2. Personne ne depasse la pointe de sa propre perche.
assert.ok(pireMarge > 0.20, `equipier assis a ${pireMarge.toFixed(2)} m du bout de son bois`);

// 3. L'equipage est dehors, et du bon bord. Sous voile c'est l'etat
//    d'equilibre, pas une manoeuvre : le plat-bord est a |x| = 0,90.
assert.ok(pctHorsCoque > 60, `equipage hors coque seulement ${pctHorsCoque.toFixed(1)} % du temps`);
assert.ok(pctCoteHaut > 75, `equipage du cote haut seulement ${pctCoteHaut.toFixed(1)} % du temps`);

// 4. Sorti sur le bois, le corps est ALIGNE dessus : lacet vers le large, et
//    bassin a hauteur de perche. Sans ces deux-la, l'homme est assis en travers
//    d'un rondin — ce que montrait le modele avant correction.
assert.ok(pctLacetCorrect > 99, `lacet du mauvais bord ${(100 - pctLacetCorrect).toFixed(1)} % du temps`);
assert.ok(bienSortis > 500, `pas assez d'equipiers au bout du bois: ${bienSortis}`);
assert.ok(pctLacetFranc > 95, `lacet trop timide au bout du bois: franc ${pctLacetFranc.toFixed(1)} % du temps`);
assert.ok(pireAssise < 0.10, `bassin a ${pireAssise.toFixed(3)} m du bois — l'homme flotte au-dessus`);

// 5. Les corps sont ETAGES le long des bois : le groupe fait une diagonale,
//    pas une rangee parallele a la coque.
assert.ok(etalementMax > 1.5, `etalement lateral de seulement ${etalementMax.toFixed(2)} m`);

console.log(JSON.stringify({
  crewSeatingOk: true,
  echantillons: samples,
  moyenneAbsX: +moyenneAbsX.toFixed(3),
  pourcentHorsCoque: +pctHorsCoque.toFixed(1),
  pourcentCoteHaut: +pctCoteHaut.toFixed(1),
  etalementLateralMax: +etalementMax.toFixed(2),
  margeMinAuBoutDuBois: +pireMarge.toFixed(2),
  echantillonsSortis: sortis,
  pourcentLacetCorrect: +pctLacetCorrect.toFixed(1),
  echantillonsBienSortis: bienSortis,
  pourcentLacetFranc: +pctLacetFranc.toFixed(1),
  ecartAssiseMax: +pireAssise.toFixed(3),
  pourcentTicksElimines: +(ticksElimines * 100 / Math.max(1, ticksTotal)).toFixed(1)
}, null, 2));
