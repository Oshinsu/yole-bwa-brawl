// La période de grâce et le plafond d'échantillon du gestionnaire de qualité.
//
// ⚠️ POURQUOI UN TEST NODE ET PAS UNE MESURE NAVIGATEUR. Le harnais tourne sur
// SwiftShader, qui rend RÉELLEMENT à ~10 images/seconde. Après la grâce, il
// rétrograde donc à juste titre, et les deux bras d'un A/B finissent au même
// palier : impossible d'y distinguer « réagit à un transitoire de compilation »
// de « réagit à une machine lente ». Mesuré, les deux bras donnent palier 0.
// La logique se vérifie donc ici, avec des temps d'image injectés.
import assert from "node:assert/strict";
import { QualityManager, palierInitial } from "../src/core/quality.js";

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

// ── Le sauvetage, et son inversion d'origine ────────────────────────────────

cas("une machine très lente tombe directement en LQ, sans étape intermédiaire", () => {
  const q = new QualityManager(() => {}, 2);
  // 40 ms d'images : lent, mais pas catastrophique — descente d'un cran.
  for (let i = 0; i < 400; i++) q.update(40);
  const unCran = q.tier;
  const r = new QualityManager(() => {}, 2);
  // 120 ms : 8 images/seconde. La machine a répondu, inutile de lui faire
  // refaire la preuve pendant onze secondes de plus.
  for (let i = 0; i < 60; i++) r.update(120);
  assert.equal(r.tier, 0, `deux crans attendus d'un coup, obtenu ${r.tier}`);
  assert.ok(unCran >= 0 && unCran < 2, "la lenteur modérée doit descendre progressivement");
});

cas("le palier remonte quand il reste de la marge SOUS la vsync", () => {
  const q = new QualityManager(() => {}, 0);
  // ⚠️ LE CAS QUI ÉTAIT IMPOSSIBLE. 16,7 ms d'intervalle — la vsync à 60 Hz —
  // mais 4 ms de travail réel. L'ancien seuil regardait l'intervalle et exigeait
  // « moins de 13,2 ms » : derrière une vsync, jamais. Le palier ne remontait
  // sur AUCUNE machine, ce qui restait invisible tant qu'on démarrait en haut.
  for (let i = 0; i < 3000; i++) q.update(16.7, 4);
  assert.ok(q.tier > 0, "une machine avec de la marge doit remonter de palier");
});

cas("un intervalle de vsync SANS marge de travail ne fait pas remonter", () => {
  const q = new QualityManager(() => {}, 0);
  // Même intervalle, mais l'image coûte 15 ms des 16,7 disponibles : monter
  // d'un palier ferait tomber sous les 60 Hz. On ne bouge pas.
  for (let i = 0; i < 3000; i++) q.update(16.7, 15);
  assert.equal(q.tier, 0, "le palier a remonté alors qu'il n'y avait pas de marge");
});

cas("palierInitial : le tactile repart bas même si un ancien auto avait mémorisé HQ", () => {
  const media = globalThis.matchMedia;
  try {
    globalThis.matchMedia = (requete) => ({ matches: requete.includes("coarse") });
    assert.equal(palierInitial(), 0, "un écran tactile doit démarrer en LQ");
    assert.equal(palierInitial(2), 0, "un HQ automatique mémorisé ne doit pas primer sur le tactile");
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(palierInitial(), 2, "une machine à pointeur fin garde HQ");
    assert.equal(palierInitial(1), 1, "le palier mémorisé reste utile sur ordinateur");
    // Une valeur corrompue dans localStorage ne doit pas passer.
    globalThis.matchMedia = (requete) => ({ matches: requete.includes("coarse") });
    assert.equal(palierInitial(7), 0, "un palier hors bornes doit être ignoré");
    assert.equal(palierInitial("2"), 0, "une chaîne n'est pas un palier");
  } finally {
    if (media) globalThis.matchMedia = media; else delete globalThis.matchMedia;
  }
});

cas("les profils mobiles coupent les multiplicateurs GPU dangereux", () => {
  const q = new QualityManager(() => {}, 0, { mobilePerformance: true });
  const [lq, mq, hq] = q.profiles();
  for (const profile of [lq, mq, hq]) {
    assert.equal(profile.shadows, false, `${profile.label} mobile a réactivé les ombres`);
    assert.equal(profile.samples, 0, `${profile.label} mobile a réactivé le MSAA`);
    assert.ok(profile.pixelRatio <= 1, `${profile.label} mobile dépasse le DPR natif`);
  }
  assert.equal(lq.fastComposite, true);
  assert.equal(mq.fastComposite, true);
  assert.ok(lq.pixelRatio < mq.pixelRatio && mq.pixelRatio < hq.pixelRatio);
});

cas("l'auto mobile plafonne en MQ mais le HQ manuel reste disponible", () => {
  const q = new QualityManager(() => {}, 0, { mobilePerformance: true });
  for (let i = 0; i < 5000; i++) q.update(16.7, 3);
  assert.equal(q.tier, 1, "l'auto mobile est monté au-delà de MQ");
  q.setTier(2, true);
  assert.equal(q.tier, 2, "le HQ manuel a été bloqué");
  q.setAutomatic();
  assert.equal(q.tier, 1, "le retour en auto n'a pas quitté le HQ mobile");
});

if (echecs) { console.error(`\n${echecs} échec(s)`); process.exit(1); }
console.log("quality-warmup ok");
