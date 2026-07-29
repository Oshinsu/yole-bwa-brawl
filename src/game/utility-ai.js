import { clamp } from "../core/math.js";
import { resolveAiLevel } from "./balance.js";

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class UtilityBrain {
  constructor(rng, personality = {}, levelKey = "tour") {
    this.rng = rng;
    // ⚠️ L'ORDRE DES TIRAGES EST CONTRACTUEL. `rng` est un flux déterministe
    // partagé : ajouter, retirer ou déplacer un `rng.range` ici décale tout ce
    // qui est tiré ensuite dans la manche. Les bornes changent avec le niveau,
    // le NOMBRE d'appels ne change jamais.
    const level = resolveAiLevel(levelKey);
    this.level = level;
    this.aggression = personality.aggression ?? rng.range(level.aggression[0], level.aggression[1]);
    this.risk = personality.risk ?? rng.range(level.risk[0], level.risk[1]);
    this.precision = personality.precision ?? rng.range(level.precision[0], level.precision[1]);
    this.grudge = null;
    this.grudgeTimer = 0;
  }

  rememberAttacker(boat) {
    if (!boat) return;
    this.grudge = boat;
    this.grudgeTimer = 8;
  }

  update(dt) {
    this.grudgeTimer = Math.max(0, this.grudgeTimer - dt);
    if (this.grudgeTimer <= 0) this.grudge = null;
  }

  scoreTarget(owner, candidate, game) {
    if (!candidate || candidate === owner || candidate.eliminated) return -Infinity;
    const d = distance(owner, candidate);
    if (d > 46) return -Infinity;
    const ahead = clamp((candidate.z - owner.z + 12) / 36, 0, 1);
    const instability = clamp(Math.abs(candidate.roll) / 1.15, 0, 1);
    const wet = clamp(candidate.water / 150, 0, 1);
    const lowCrew = 1 - candidate.activeCrew / 6;
    const revenge = candidate === this.grudge ? 0.42 : 0;
    const leader = Math.max(...game.boats.filter((boat) => !boat.eliminated).map((boat) => boat.z));
    const leaderThreat = clamp((candidate.z - leader + 18) / 18, 0, 1);
    return (1 - d / 46) * 0.45 + ahead * 0.2 + instability * 0.3 + wet * 0.12 + lowCrew * 0.14 + revenge + leaderThreat * 0.18;
  }

  chooseTarget(owner, game) {
    let best = null;
    let score = -Infinity;
    for (const candidate of game.boats) {
      const candidateScore = this.scoreTarget(owner, candidate, game);
      if (candidateScore > score) {
        score = candidateScore;
        best = candidate;
      }
    }
    return { target: best, score };
  }

  chooseAction(owner, game, stormGap) {
    const { target, score } = this.chooseTarget(owner, game);
    const desperation = clamp(1 - stormGap / 110, 0, 1);
    const rollDanger = clamp(Math.abs(owner.roll) / 0.9, 0, 1);
    // Contre-gîte : la fenêtre optimale est à 0,64 rad, soit rollDanger ≈ 0,71.
    // Une IA faible shift TÔT — c'est sûr, mais ça ne rapporte presque pas de
    // Flow ; une IA forte attend le bon moment et encaisse le vrai bonus. Le
    // garde à 0,86 reste commun à tous les niveaux : personne ne doit chavirer
    // par excès de patience.
    const shiftAt = 0.48 + this.level.shiftSkill * 0.25;
    const shiftNow = rollDanger > shiftAt || rollDanger > 0.86;
    if (shiftNow && Math.abs(owner.dynamics.crewTarget + Math.sign(owner.roll || 1)) > 0.25) return { type: "shift" };

    const randomness = this.rng.range(0.86, 1.14);
    const waveScore = target && owner.ammo.wave > 0 && owner.cooldowns.wave <= 0
      ? (score + desperation * 0.34 + this.aggression * 0.22) * randomness
      : -Infinity;
    const harpoonScore = target && owner.ammo.harpoon > 0 && owner.cooldowns.harpoon <= 0
      ? (score * 0.86 + (target.z > owner.z ? 0.25 : 0) + this.aggression * 0.18) * randomness
      : -Infinity;
    const pursuer = game.boats.some((boat) => boat !== owner && !boat.eliminated && boat.z < owner.z && owner.z - boat.z < 15 && Math.abs(boat.x - owner.x) < 9);
    const mineScore = owner.ammo.mine > 0 && owner.cooldowns.mine <= 0 && pursuer
      ? (0.42 + desperation * 0.18 + this.risk * 0.15) * randomness
      : -Infinity;

    // ─── TURBO ───────────────────────────────────────────────────────────────
    //
    // ⚠️ Avant, la seule condition était `stormGap < 46`. Autrement dit : l'IA
    // ne prenait le turbo QUE pour ne pas mourir, jamais pour courir. En début
    // de manche, où le Grain est loin, le joueur turbotait librement contre des
    // adversaires qui ne répondaient pas — il suffisait de ça pour les semer.
    //
    // Désormais elles courent aussi. Trois raisons de mettre les gaz, par ordre
    // de priorité : survivre, reprendre celui qui est devant, se dégager quand
    // on mène. Et un garde qui n'existait pas : le turbo déséquilibre maintenant
    // (YOLE_HANDLING.boostRollKick), donc une IA qui gîte déjà s'abstient — sinon
    // le niveau le plus élevé se saborderait tout seul.
    const boostReady = (owner.dynamics?.boostCooldown ?? 0) <= 0 && (owner.flow ?? owner.dynamics?.flow ?? 0) >= 0.22;
    // ⚠️ Seuil MESURE, pas devine. A 0,30 les IA ne turbotaient que 4 fois en
    // 22 secondes a trois bateaux : la gite de croisiere sous voile tourne
    // autour de 0,2-0,4 rad, donc le garde etait ferme presque en permanence
    // et le joueur les semait toujours. A 0,44 elles courent vraiment, tout en
    // s'abstenant quand elles sont deja proches du chavirage.
    const stable = Math.abs(owner.roll) < 0.44 - (1 - this.level.shiftSkill) * 0.12;
    if (boostReady && stormGap < 62) return { type: "boost_forward" };
    if (boostReady && stable && this.level.boostRace > 0) {
      let ahead = null;
      let aheadGap = Infinity;
      for (const rival of game.boats) {
        if (rival === owner || rival.eliminated) continue;
        const gap = rival.z - owner.z;
        if (gap > 0 && gap < aheadGap) { aheadGap = gap; ahead = rival; }
      }
      // Reprendre : quelqu'un devant, à portée de rattrapage.
      if (ahead && aheadGap < 34 && this.rng.chance(this.level.boostRace * 0.72)) {
        return { type: "boost_forward" };
      }
      // Se dégager : personne devant, on creuse au lieu d'attendre le peloton.
      if (!ahead && this.rng.chance(this.level.boostRace * 0.30)) {
        return { type: "boost_forward" };
      }
    }
    if (boostReady && target && stable) {
      const dx = target.x - owner.x;
      const dz = target.z - owner.z;
      const close = Math.hypot(dx, dz) < 10.5;
      const lateral = Math.sign(dx || this.rng.signed()) || 1;
      if (close && this.aggression > 0.58 && this.rng.chance(this.level.boostAttack + this.aggression * 0.22)) {
        return { type: "boost_lateral", direction: lateral };
      }
    }

    const threshold = 0.57 + (1 - this.aggression) * 0.18;
    if (waveScore >= harpoonScore && waveScore >= mineScore && waveScore > threshold) return { type: "wave", target };
    if (harpoonScore >= mineScore && harpoonScore > threshold) return { type: "harpoon", target };
    if (mineScore > threshold) return { type: "mine" };
    let ahead = null, behind = null, aheadDistance = Infinity, behindDistance = Infinity;
    for (const rival of game.boats) {
      if (rival === owner || rival.eliminated) continue;
      const distance = Math.hypot(rival.x - owner.x, rival.z - owner.z);
      if (rival.z >= owner.z && distance < aheadDistance) { ahead = rival; aheadDistance = distance; }
      if (rival.z < owner.z && distance < behindDistance) { behind = rival; behindDistance = distance; }
    }
    // À sec, l'IA va chercher une caisse plutôt que de tenir sa ligne. Sans ça
    // elle resterait désarmée toute la manche et le joueur n'aurait aucun
    // adversaire.
    // Le rhum ne se garde pas : dès qu'on l'a, on le boit.
    if (owner.ammo.rhum > 0 && owner.cooldowns.rhum <= 0) return { type: "rhum" };
    // Les quatre armes absurdes, chacune dans la situation qui lui va : le
    // barik quand on est colle par-derriere, le chadron quand on poursuit, la
    // konk sur un paquet serre, le poisson sur une cible qui fuit.
    if (owner.ammo.lanbi > 0 && owner.cooldowns.lanbi <= 0 && ahead && aheadDistance < 30) return { type: "lanbi" };
    if (owner.ammo.barik > 0 && owner.cooldowns.barik <= 0 && behind && behindDistance < 26) return { type: "barik" };
    if (owner.ammo.chadron > 0 && owner.cooldowns.chadron <= 0 && ahead && aheadDistance < 46) return { type: "chadron" };
    if (owner.ammo.pwason > 0 && owner.cooldowns.pwason <= 0 && ahead && aheadDistance < 62) return { type: "pwason" };
    const empty = owner.ammo.wave + owner.ammo.harpoon + owner.ammo.mine + owner.ammo.rhum
      + owner.ammo.barik + owner.ammo.chadron + owner.ammo.lanbi + owner.ammo.pwason === 0;
    if (empty) {
      const crate = game.nearestPickup?.(owner, 130);
      if (crate) return { type: "lane", delta: clamp(crate.x - owner.x, -14, 14) };
    }
    if (this.rng.chance(0.22 + this.risk * 0.12)) return { type: "lane", delta: this.rng.signed() * 8.5 };
    return { type: "none" };
  }
}
