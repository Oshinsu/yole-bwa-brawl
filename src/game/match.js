// Règles de match : manches de Combat Box, étapes du Tour des Yoles, Mur du
// Grain, éliminations et fin de partie.
//
// C'est ici que vivent les règles de course — pas la physique, pas le rendu.

import { clamp, damp } from "../core/math.js";
import { routeCenter } from "../render/world.js";
import { checksumBoats, downloadReplay } from "../sim/replay.js";
import { BALANCE, CONFIG, TOUR_STAGES, TOUR_STAGE_POINTS, createBuoyVisual } from "./balance.js";
import { versusPilotLabel } from "./versus.js";

export const MatchDirector = {
  resetRound(announce = true) {
    this.roundTime = 0;
    this.roundEnding = 0;
    this.stormZ = BALANCE.storm.startZ;
    this.spiritUsed = false;
    this.revengePending = null;
    this.resetPools();
    this.boats.forEach((boat, index) => {
      boat.reset(index);
      boat.tourFinished = false;
      boat.finishTick = 0;
    });
    this.replay.markRound(this.tick, this.round, this.seed ^ this.round);
    if (announce) this.showMessage(`MANCHE ${this.round}`, 1.1);
    this.ui.revenge.classList.add("hidden");
    this.updateLeaderboard();
  },

  startTour() {
    this.tour = {
      stage: 0,
      baseSeed: this.seed >>> 0,
      points: this.boats.map(() => 0),
      results: [],
      finishOrder: [],
      champion: null
    };
    this.startTourStage(0);
  },

  tourCourseLength() {
    return TOUR_STAGES[this.tour?.stage ?? 0].distance;
  },

  startTourStage(index) {
    const tour = this.tour;
    if (!tour) return;
    tour.stage = index;
    tour.finishOrder = [];
    // Seed déterministe par étape : chaque legs a sa propre météo, rejouable à l'identique.
    this.seed = (tour.baseSeed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
    this.startMatch({ tourStage: true });
    this.boats.forEach((boat, boatIndex) => { boat.score = tour.points[boatIndex]; });
    this.createBuoys();
    // Deux bouées vertes marquent la ligne d'arrivée de l'étape.
    const finishZ = this.tourCourseLength();
    const center = routeCenter(finishZ);
    for (const side of [-1, 1]) {
      const mesh = this.buoyVisual(this.THREE, 0x35f27a);
      this.scene.add(mesh);
      this.buoys.push({ x: center + side * 14, z: finishZ, mesh, phase: side * 1.3 });
    }
    this.updateLeaderboard();
    this.showMessage(`ÉTAPE ${index + 1}/8 · ${TOUR_STAGES[index].name}`, 2.2);
    this.telemetry.track("tour_stage_start", { stage: index }, 0);
  },

  updateTourStage(dt) {
    if (this.playback) return;
    const tour = this.tour;
    const course = this.tourCourseLength();
    for (const boat of this.boats) {
      if (boat.eliminated || boat.tourFinished) continue;
      if (boat.z >= course) {
        boat.tourFinished = true;
        boat.finishTick = this.tick;
        tour.finishOrder.push(boat);
        const place = tour.finishOrder.length;
        if (boat.isPlayer) {
          this.showMessage(place === 1 ? "🚩 LIGNE ! 1RE DE L'ÉTAPE" : `🚩 LIGNE ! ${place}E DE L'ÉTAPE`, 1.4);
          this.postFX.pulse(0.5);
          this.haptic?.("checkpoint");
        }
        this.telemetry.track("tour_stage_finish", { boat: boat.id, place }, this.time);
      }
    }
    const decided = this.boats.every((boat) => boat.tourFinished || boat.eliminated);
    const timedOut = this.roundTime > course / 8 + 45;
    if ((decided || timedOut) && !this.roundEnding) this.roundEnding = 2.2;
    if (this.roundEnding > 0) {
      this.roundEnding -= dt;
      if (this.roundEnding <= 0) this.endTourStage();
    }
  },

  endTourStage() {
    const tour = this.tour;
    if (!tour) return;
    const stage = TOUR_STAGES[tour.stage];
    // Classement de l'étape : arrivés dans l'ordre, puis non-finisseurs par z décroissant.
    const dnfs = this.boats.filter((boat) => !boat.tourFinished);
    dnfs.sort((a, b) => b.z - a.z);
    const places = [...tour.finishOrder, ...dnfs];
    const lines = [];
    places.forEach((boat, index) => {
      const points = boat.tourFinished ? (TOUR_STAGE_POINTS[index] ?? 0) : 0;
      tour.points[boat.id] += points;
      boat.score = tour.points[boat.id];
      lines.push(`${index + 1}. ${boat.name} +${points}`);
    });
    tour.results.push({ stage: tour.stage, places: places.map((boat) => boat.id) });
    this.telemetry.track("tour_stage_end", { stage: tour.stage, places: places.map((boat) => boat.id) }, this.time);
    this.replay.finish(this.dynamicsList(), { tick: this.tick, tourStage: tour.stage, stage: stage.name });
    this.latestReplay = this.replay.export();
    this.replayVault.save(this.latestReplay, this.latestReplay.metadata);
    this.mode = "ended";
    this.ui.hud.classList.add("hidden");
    this.ui.end.classList.remove("hidden");
    const last = tour.stage >= TOUR_STAGES.length - 1;
    const playerPlace = places.findIndex((boat) => boat.isPlayer) + 1;
    const general = this.boats.slice().sort((a, b) => b.score - a.score || b.z - a.z)
      .map((boat) => `${boat.name} ${boat.score}`).join(" · ");
    this.ui.endIcon.textContent = last ? "🏆" : "🚩";
    this.ui.endTitle.textContent = last ? "PODIUM DU TOUR" : `ÉTAPE ${tour.stage + 1}/8 · ${playerPlace === 1 ? "1RE" : `${playerPlace}E`} À L'ÉTAPE`;
    this.ui.endCopy.textContent = `${stage.name} — ${lines.join(" · ")} — GÉNÉRAL : ${general}`;
    if (last) {
      const champion = this.boats.slice().sort((a, b) => b.score - a.score || b.z - a.z)[0];
      tour.champion = champion;
      this.ui.endTitle.textContent = champion.isPlayer ? "ROI DU TOUR 🏆" : `🏆 ${champion.name} CHAMPION`;
      this.telemetry.track("tour_end", { champion: champion.id, playerWon: champion.isPlayer }, this.time);
    }
    this.ui.statTakedowns.textContent = this.stats.takedowns;
    this.ui.statPerfects.textContent = this.stats.perfects;
    this.ui.statSpeed.textContent = Math.round(this.stats.maxSpeed);
    if (this.ui.rematch) this.ui.rematch.textContent = last ? "⛵ REJOUER LE TOUR" : "⛵ ÉTAPE SUIVANTE";
    // Rejouer une étape dans la session du Tour risquerait de re-scorer : on désactive.
    if (this.ui.replay) this.ui.replay.disabled = true;
    if (this.ui.downloadReplay) this.ui.downloadReplay.disabled = !this.latestReplay;
    if (this.ui.replayStatus) this.ui.replayStatus.textContent = `Replay d'étape sauvegardé · checksum ${this.latestReplay?.finalChecksum ?? "—"}`;
    this.audio.play(playerPlace === 1 ? "victory" : "buoy", { gain: playerPlace === 1 ? 0.5 : 0.34, gap: 0.3 });
  },

  updateStorm(dt) {
    const alive = this.collectAlive();
    if (!alive.length) return;
    let leader = alive[0];
    for (const boat of alive) if (boat.z > leader.z) leader = boat;
    const storm = BALANCE.storm;
    const desiredGap = clamp(storm.gapStart - this.roundTime * storm.gapShrinkPerSecond, storm.gapEnd, storm.gapStart);
    const targetStormZ = leader.z - desiredGap;
    const baseAdvance = storm.baseAdvance + this.roundTime * storm.advancePerSecond;
    this.stormZ += baseAdvance * dt;
    if (this.stormZ < targetStormZ) this.stormZ = damp(this.stormZ, targetStormZ, 0.32, dt);

    for (const boat of alive) {
      const gap = boat.z - this.stormZ;
      if (gap < storm.cohesionGap) boat.dynamics.cohesion = Math.max(0.18, boat.dynamics.cohesion - dt * 0.12);
      if (gap < storm.soakGap) {
        boat.stormTimer = (boat.stormTimer ?? 0) + dt;
        boat.dynamics.rollVel += Math.sin(this.time * 8 + boat.id) * dt * 0.64;
        boat.dynamics.addWater(dt * 5.4, Math.sin(this.time * 6 + boat.id) * 0.7, -1.5);
      } else boat.stormTimer = Math.max(0, (boat.stormTimer ?? 0) - dt * 2.2);
      if (gap < storm.eliminateBehind || (boat.stormTimer ?? 0) > storm.soakTimeLimit) this.eliminate(boat, "ENSEVELI PAR LA BRUME");
    }
  },

  /**
   * Détonation d'une yole détruite : trois foyers étagés, une onde, une pluie
   * de bois. Purement visuel.
   *
   * Les foyers sont décalés le long de la coque plutôt que superposés : trois
   * boules au même point ne lisent que comme une boule plus lumineuse, alors
   * qu'étalées elles donnent la longueur du bateau.
   */
  explodeYole(boat, hauteurEau) {
    const avant = boat.forward(this.explosionForwardScratch
      || (this.explosionForwardScratch = { x: 0, z: 0 }));
    const rng = this.visualRng;
    for (let foyer = 0; foyer < 3; foyer++) {
      // -1, 0, +1 fois 2,4 m : la yole fait environ 7 m de long.
      const along = (foyer - 1) * 2.4;
      const x = boat.x + avant.x * along;
      const z = boat.z + avant.z * along;
      const y = hauteurEau + 0.8 + foyer * 0.35;
      this.explosions?.spawn(x, y, z, 7.4 - foyer * 1.1, 1.05 - foyer * 0.12);
      this.particles.emitBurst(rng, { x, y, z }, foyer === 1 ? 0xffd27a : 0xff8a3c, 30,
        { speed: 5.2, upward: 4.4, sizeMax: 1.15, lifeMax: 1.25 });
    }
    // Fumée : lente, sombre, montante — c'est elle qui fait durer l'image
    // après que le feu s'est éteint.
    this.particles.emitBurst(rng, { x: boat.x, y: hauteurEau + 1.6, z: boat.z },
      0x2b2b30, 34, { speed: 1.5, upward: 3.4, sizeMax: 2.2, lifeMax: 2.6 });
    // Onde de choc au ras de l'eau, à la couleur de la yole : on doit
    // reconnaître QUI vient de sauter.
    this.rings.burst(boat.x, hauteurEau, boat.z, boat.color, 3.4, 1.35);
    this.ocean.wake.burst(boat.x, boat.z, 11.0, 3.2);
    this.audio.playImpact?.("mine", { intensity: boat.isPlayer ? 1.15 : 0.9,
                                      pan: this.panFor(boat.x) });
  },

  eliminate(boat, reason) {
    if (boat.eliminated) return;
    boat.eliminated = true;
    boat.eliminatedReason = reason;
    boat.finishOrder = this.boats.filter((candidate) => candidate.eliminated).length;
    boat.dynamics.vx *= 0.24;
    boat.dynamics.vz *= 0.24;
    boat.dynamics.rollVel += Math.sign(boat.roll || this.gameRng.signed()) * 0.75;
    const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
    this.ocean.wake.burst(boat.x, boat.z, 7.5, 2.1);
    this.rings.burst(boat.x, water.height, boat.z, boat.color, 1.7, 0.9);
    this.particles.emitBurst(this.visualRng, { x: boat.x, y: water.height + 0.5, z: boat.z }, 0xffffff, 44, { speed: 2.0, upward: 2.6, sizeMax: 0.8 });
    this.debris.spawnBurst(this.visualRng, { x: boat.x, y: water.height + 0.5, z: boat.z }, 26, { speed: 6.4, upward: 7.2, scale: 1.25 });
    // ── LA YOLE EXPLOSE ──────────────────────────────────────────────────
    // Une élimination ne faisait qu'une gerbe et douze planches. C'est le
    // moment le plus fort d'une manche : il mérite une vraie détonation.
    //
    // ⚠️ TOUT ICI EST VISUEL. On tire sur `visualRng`, jamais sur `gameRng` :
    // ajouter un tirage au générateur de jeu décalerait tout le flux et ferait
    // diverger les checksums de replay. Aucune ligne ne touche `boat.dynamics`.
    this.explodeYole(boat, water.height);
    const forward = boat.forward(this.eliminationForwardScratch || (this.eliminationForwardScratch = { x: 0, z: 0 }));
    // Une yole qui chavire vide son équipage. On ne jetait que 3 mannequins à
    // l'eau alors qu'activeCrew restait à 6 : les trois hommes qui barbotaient
    // étaient des DOUBLONS de trois hommes toujours à bord, lesquels
    // continuaient à jouer leur animation de rappel — buste renversé, sortis sur
    // les bois — sur une coque couchée à 90° en train de couler.
    //
    // `overboard` est purement visuel : il vide l'équipage affiché sans toucher
    // à dynamics.activeCrew, qui entre dans le checksum de replay.
    const overboard = boat.activeCrew;
    boat.visual.setOverboard?.(true);
    for (let index = 0; index < overboard; index++) {
      // Tout le monde part du bord au vent, comme quand la yole se couche, et
      // s'étale le long de la coque plutôt que de sortir au même point.
      const side = index % 2 === 0 ? -1 : 1;
      const along = (index - (overboard - 1) / 2) * 1.35;
      this.crewFalls.spawn(
        this.visualRng,
        {
          x: boat.x - forward.z * side * 1.7 + forward.x * along,
          y: boat.y + 1.0 + (index % 3) * 0.25,
          z: boat.z + forward.x * side * 1.7 + forward.z * along
        },
        { x: boat.dynamics.vx * 0.18, z: boat.dynamics.vz * 0.18 },
        side
      );
    }
    this.addKill(`${boat.name} — ${reason}`);
    this.telemetry.track("elimination", { boat: boat.id, reason }, this.time);

    const attacker = boat.lastAggressor && this.time - boat.lastAggressionAt < 6 ? boat.lastAggressor : null;
    if (attacker && attacker !== boat) {
      attacker.stats.takedowns++;
      attacker.score += 1;
      if (attacker.isPlayer) this.stats.takedowns++;
      this.addKill(`💥 ${attacker.name} TAKEDOWN ${boat.name}`);
      this.telemetry.track("takedown", { attacker: attacker.id, victim: boat.id }, this.time);
    }

    if (boat.isPlayer && !this.spiritUsed && !this.tour && !this.versusLocal) this.ui.revenge.classList.remove("hidden");
    this.postFX.pulse(1.0);
    this.audio.playImpact?.("takedown", {
      intensity: boat.isPlayer ? 1.12 : 0.84,
      pan: this.panFor(boat.x)
    });
    // Palier maximal : réservé à l'élimination, sinon le final n'existe plus.
    const player = this.boats[0];
    const involved = boat.isPlayer || attacker?.isPlayer;
    if (involved) {
      this.impact.trigger("takedown", {
        dirX: boat.isPlayer ? -Math.sin(boat.dynamics.heading) : boat.x - player.x,
        dirZ: boat.isPlayer ? -Math.cos(boat.dynamics.heading) : boat.z - player.z,
        intensity: boat.isPlayer ? 1.2 : 0.85
      });
    }
  },

  // Repêchage. Une yole chavirée est remise à flot au bout de quelques
  // secondes, à sa position, avarie comprise — au lieu de laisser le joueur
  // spectateur jusqu'à la fin de la manche.
  //
  // Combat UNIQUEMENT : en Tour, une élimination est un abandon d'étape et le
  // classement général en dépend.
  updateRespawns(dt) {
    if (this.tour || this.roundEnding > 0) return;
    for (const boat of this.boats) {
      if (!boat.eliminated) { boat.respawnTimer = 0; continue; }
      boat.respawnTimer = (boat.respawnTimer ?? 0) + dt;
      if (boat.respawnTimer < BALANCE.respawn.delay) continue;
      boat.respawnTimer = 0;
      this.respawn(boat);
    }
  },

  respawn(boat) {
    const dynamics = boat.dynamics;
    const settings = BALANCE.respawn;
    boat.eliminated = false;
    boat.eliminatedReason = "";
    boat.finishOrder = 0;
    dynamics.sink = 0;
    dynamics.y = 0.48;
    dynamics.vy = 0;
    dynamics.roll = 0;
    dynamics.rollVel = 0;
    dynamics.pitch = 0;
    dynamics.pitchVel = 0;
    dynamics.capsizeTimer = 0;
    // On vide la yole : elle vient d'être retournée et écopée.
    dynamics.flooding.fill(0);
    dynamics.updateWaterMass();
    // La coque garde ses avaries, seulement relevée à un plancher jouable : le
    // repêchage n'est pas une remise à neuf, sinon chavirer devient rentable.
    dynamics.structure.hull = Math.max(dynamics.structure.hull, settings.hull);
    dynamics.flow = settings.flow;
    dynamics.boostCooldown = 0;
    dynamics.cohesion = Math.max(dynamics.cohesion, 0.5);
    // Quelques secondes d'immunité, sinon on rechavire dans le paquet qu'on
    // vient de quitter. Le rhum est déjà exactement ce verrou dans applyHit.
    dynamics.rhum = Math.max(dynamics.rhum, settings.invulnerable);
    // ⚠️ BOUCLE DE MORT CORRIGÉE. `respawn` ne touchait JAMAIS à `dynamics.z`.
    // Or `fixedStep` gèle la position d'une yole éliminée pendant que le mur du
    // Grain, lui, continue d'avancer : on était donc repêché DERRIÈRE lui, à la
    // même seconde absorbé, éliminé, repêché derrière, absorbé — jusqu'à la fin
    // de la manche, sans aucune action possible.
    //
    // On replace la yole devant le mur avec une marge. Déterministe : aucun
    // tirage, valeur dérivée de `stormZ`, identique en relecture.
    const margeGrain = this.stormZ + BALANCE.storm.cohesionGap + settings.aheadOfStorm;
    if (dynamics.z < margeGrain) dynamics.z = margeGrain;
    boat.visual.setOverboard?.(false);
    boat.visual.root.visible = true;
    this.addKill(`${boat.name} — REPÊCHÉ`);
    if (boat.isPlayer) this.showMessage("REPÊCHÉ — REPARS !", 1.1);
    this.telemetry.track("respawn", { boat: boat.id }, this.time);
  },

  updateRound(dt) {
    if (this.tour) {
      this.updateTourStage(dt);
      return;
    }
    this.updateRespawns(dt);
    const alive = this.collectAlive();
    if (alive.length <= 1 && !this.roundEnding) {
      if (alive[0]) {
        alive[0].score += 2;
        this.showMessage(`${alive[0].name} SURVIT`, 1.0);
      }
      this.roundEnding = 2.7;
    }

    if (this.roundEnding > 0) {
      this.roundEnding -= dt;
      if (this.roundEnding <= 0) {
        const champion = this.boats.find((boat) => boat.score >= CONFIG.targetScore);
        if (champion) this.endMatch(champion);
        else {
          this.round++;
          this.resetRound(true);
        }
      }
      return;
    }

    if (this.roundTime > CONFIG.roundLimit) {
      const ordered = alive.sort((a, b) => b.z - a.z);
      for (let index = 1; index < ordered.length; index++) this.eliminate(ordered[index], "FIN DU CHRONO");
      if (ordered[0] && !this.roundEnding) {
        ordered[0].score += 2;
        this.roundEnding = 2.7;
      }
    }
  },

  endMatch(champion) {
    this.mode = "ended";
    const versus = Boolean(this.versusLocal);
    const winnerLabel = versus ? versusPilotLabel(champion) : null;
    this.telemetry.track("match_end", {
      champion: champion.id,
      playerWon: champion.isPlayer,
      versus,
      winner: winnerLabel,
      tick: this.tick
    }, this.time);
    this.ui.hud.classList.add("hidden");
    this.ui.versusHud?.classList.add("hidden");
    this.ui.end.classList.remove("hidden");
    const win = champion.isPlayer;
    // La boucle s'arrête, le sting prend toute la place : c'est la ponctuation
    // de la manche, elle ne doit pas se battre avec un fond.
    this.music?.setScene?.(null);
    this.music?.jouerSting?.(win ? "victoire" : "defaite");
    if (versus) {
      const label = champion.id === 0 ? "J1" : champion.id === 1 ? "J2" : `IA · ${champion.name}`;
      const humanWinner = champion.id <= 1;
      this.ui.endIcon.textContent = humanWinner ? "🏆" : "🤖";
      this.ui.endTitle.textContent = `${label} REMPORTE LE DUEL`;
      this.ui.endCopy.textContent = `Score final · J1 ${this.boats[0].score} · J2 ${this.boats[1].score} · ${this.boats[2].name} ${this.boats[2].score} · ${this.boats[3].name} ${this.boats[3].score}`;
      this.ui.statTakedowns.textContent = `${this.boats[0].stats.takedowns}/${this.boats[1].stats.takedowns}`;
    } else {
      this.ui.endIcon.textContent = win ? "🏆" : "🌊";
      this.ui.endTitle.textContent = win ? "ROI DE LA LANMÈ" : "LA BRUME T’A EU";
      this.ui.endCopy.textContent = win ? "La dernière yole debout porte tes couleurs." : `${champion.name} règne sur la Combat Box.`;
      this.ui.statTakedowns.textContent = this.stats.takedowns;
    }
    this.ui.statPerfects.textContent = this.stats.perfects;
    this.ui.statSpeed.textContent = Math.round(this.stats.maxSpeed);
    if (!this.playback && !versus) {
      this.replay.finish(this.dynamicsList(), {
        tick: this.tick,
        champion: champion.name,
        playerWon: win,
        takedowns: this.stats.takedowns,
        perfects: this.stats.perfects,
        maxSpeed: this.stats.maxSpeed
      });
      this.latestReplay = this.replay.export();
      this.replayVault.save(this.latestReplay, this.latestReplay.metadata);
    }
    if (this.ui.rematch) this.ui.rematch.textContent = versus ? "⚔ REVANCHE DUEL LOCAL" : "🔥 REVANCHE IMMÉDIATE";
    if (this.ui.replay) this.ui.replay.disabled = versus || !this.latestReplay;
    if (this.ui.downloadReplay) this.ui.downloadReplay.disabled = versus || !this.latestReplay;
    if (this.ui.replayStatus) {
      this.ui.replayStatus.textContent = versus
        ? "Replay désactivé en Duel local · les deux flux humains restent indépendants"
        : this.playback
          ? `Replay terminé · checksum ${checksumBoats(this.dynamicsList())}`
          : `Replay sauvegardé · ${this.latestReplay?.inputs?.length ?? 0} trames compressées · checksum ${this.latestReplay?.finalChecksum ?? "—"}`;
    }
    const versusHumanWin = versus && champion.id <= 1;
    this.audio.play(versus ? (versusHumanWin ? "victory" : "defeat") : (win ? "victory" : "defeat"), { gain: 0.55, gap: 0.4 });
  }
};
