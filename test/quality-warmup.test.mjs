// La période de grâce et le plafond d'échantillon du gestionnaire de qualité.
//
// ⚠️ POURQUOI UN TEST NODE ET PAS UNE MESURE NAVIGATEUR. Le harnais tourne sur
// SwiftShader, qui rend RÉELLEMENT à ~10 images/seconde. Après la grâce, il
// rétrograde donc à juste titre, et les deux bras d'un A/B finissent au même
// palier : impossible d'y distinguer « réagit à un transitoire de compilation »
// de « réagit à une machine lente ». Mesuré, les deux bras donnent palier 0.
// La logique se vérifie donc ici, avec des temps d'image injectés.
import assert from "node:assert/strict";
import { QualityManager } from "../src/core/quality.js";

let echecs = 0;
function cas(nom, fn) {
  try { fn(); console.log(`  ok   ${nom}`); }
  catch (erreur) { echecs++; console.log(`  ECHEC ${nom}\n       ${erreur.message}`); }
}

console.log("quality-warmup");

cas("le démarrage lent ne fait pas chuter le palier pendant la grâce", () => {
  const q = new QualityManager(() => {}, 2);
  // 2,4 s d'images catastrophiques : exactement le transitoire de compilation.
  for (let i = 0; i < 12; i++) q.update(200);
  assert.equal(q.tier, 2, "le palier a chuté pendant la période de grâce");
});

cas("après la grâce, une lenteur SOUTENUE fait bien chuter le palier", () => {
  const q = new QualityManager(() => {}, 2);
  for (let i = 0; i < 200; i++) q.update(60);
  assert.ok(q.tier < 2, "le palier aurait dû chuter sur une lenteur réelle");
});

cas("un pic isolé ne suffit pas à faire chuter le palier", () => {
  const q = new QualityManager(() => {}, 2);
  for (let i = 0; i < 40; i++) q.update(16);       // on sort de la grâce à 60 Hz
  const avant = q.tier;
  q.update(2000);                                   // une secousse de 2 s
  for (let i = 0; i < 60; i++) q.update(16);
  assert.equal(q.tier, avant, "un pic isolé a fait chuter le palier");
});

cas("le plafond empêche un pic d'écraser la moyenne", () => {
  const q = new QualityManager(() => {}, 2);
  for (let i = 0; i < 40; i++) q.update(16);
  const moyenneAvant = q.frameAverage;
  q.update(5000);
  // Sans plafond, (5000 - 16) * 0.035 ajouterait ~174 ms à la moyenne.
  assert.ok(q.frameAverage - moyenneAvant < 4,
    `la moyenne a bondi de ${(q.frameAverage - moyenneAvant).toFixed(1)} ms`);
});

cas("resetWarmup redonne la grâce pour la manche suivante", () => {
  const q = new QualityManager(() => {}, 2);
  for (let i = 0; i < 40; i++) q.update(16);
  q.resetWarmup();
  for (let i = 0; i < 12; i++) q.update(200);
  assert.equal(q.tier, 2, "le palier a chuté après resetWarmup");
});

cas("le mode manuel reste prioritaire", () => {
  const q = new QualityManager(() => {}, 2);
  q.setTier(1, true);
  for (let i = 0; i < 400; i++) q.update(300);
  assert.equal(q.tier, 1, "le mode manuel a été écrasé par l'adaptation");
});

if (echecs) { console.error(`\n${echecs} échec(s)`); process.exit(1); }
console.log("quality-warmup ok");
