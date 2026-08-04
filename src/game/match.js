// Règles de match : manches de Combat Box, étapes du Tour des Yoles, Mur du
// Grain, éliminations et fin de partie.
//
// C'est ici que vivent les règles de course — pas la physique, pas le rendu.

import { clamp, damp } from "../core/math.js";
import { routeCenter } from "../render/world.js";
import { checksumBoats, downloadReplay } from "../sim/replay.js";
import {
  BALANCE,
  CONFIG,
  COUNTDOWN_GO_SECONDS,
  COUNTDOWN_SECONDS,
  TOUR_STAGES,
  TOUR_STAGE_POINTS,
  createBuoyVisual
} from "./balance.js";
import { TourProgressStore, rankTourBoats } from "./tour-progress.js";
import { versusPilotLabel } from "./versus.js";

function defeatPresentation(reason = "") {
  const normalized = String(reason).toLocaleUpperCase("fr");
  if (/BRUME|GRAIN|ENSEVELI/.test(normalized)) {
    return {
      title: "LA BRUME T’A RATTRAPÉ",
      tip: "Garde toujours une voie de sortie vers l’avant et surveille sa distance sur la mini-carte."
    };
  }
  if (/CHAVIR/.test(normalized)) {
    return {
      title: "YOLE CHAVIRÉE",
      tip: "Contre-gîte avant la zone rouge : une correction tardive ne rend pas toute l’inertie."
    };
  }
  if (/CHRONO/.test(normalized)) {
    return {
      title: "HORS TEMPS",
      tip: "Choque moins longtemps et utilise le Turbo pour sortir des mêlées."
    };
  }
  return {
    title: "YOLE HORS COURSE",
    tip: "Protège ton équipage et évite de rester entre plusieurs adversaires."
  };
}

export function resolveTourStageClassification(boats, finishOrder = []) {
  const fleet = Array.isArray(boats) ? boats : [];
  const fleetSet = new Set(fleet);
  const seen = new Set();
  const finishers = [];
  for (const boat of finishOrder ?? []) {
    if (!fleetSet.has(boat) || !boat?.tourFinished || seen.has(boat)) continue;
    seen.add(boat);
    finishers.push(boat);
  }
  // Filet de sécurité pour une sauvegarde ou un harnais où un finisher n'aurait
  // pas rejoint finishOrder : son tick restaure un ordre déterministe.
  const missingFinishers = fleet
    .filter((boat) => boat?.tourFinished && !seen.has(boat))
    .sort((a, b) => (a.finishTick ?? 0) - (b.finishTick ?? 0) || a.id - b.id);
  const dnfs = fleet
    .filter((boat) => !boat?.tourFinished)
    .sort((a, b) => b.z - a.z || a.id - b.id);
  const places = [...finishers, ...missingFinishers, ...dnfs];
  const awarded = fleet.map(() => 0);
  const finishTicks = fleet.map(() => 0);
  places.forEach((boat, index) => {
    awarded[boat.id] = boat.tourFinished ? (TOUR_STAGE_POINTS[index] ?? 0) : 0;
    finishTicks[boat.id] = boat.tourFinished ? boat.finishTick : 0;
  });
  return { places, awarded, finishTicks };
}

export const MatchDirector = {
  resetRound(announce = true) {
    this.roundTime = 0;
    this.roundEnding = 0;
    this.stormZ = BALANCE.storm.startZ;
    this.resetPools();
    this.boats.forEach((boat, index) => {
      boat.reset(index);
      boat.tourFinished = false;
      boat.finishTick = 0;
    });
    this.replay.markRound(this.tick, this.round, this.seed ^ this.round);
    if (announce) {
      this.showMessage(`MANCHE ${this.round}`, 1.1);
      // Le premier départ était le seul à armer réellement le 3-2-1 malgré le
      // commentaire de startMatch. Chaque manche peut maintenant rejouer ses
      // trois plans de grille sans laisser la simulation ou le replay avancer.
      if (this.mode === "playing") {
        this.countdown = COUNTDOWN_SECONDS + COUNTDOWN_GO_SECONDS;
      }
    }
    this.updateLeaderboard();
  },

  tourStore() {
    if (!this._tourProgressStore) {
      this._tourProgressStore = new TourProgressStore(undefined, {
        stageCount: TOUR_STAGES.length,
        boatCount: this.boats.length
      });
    }
    return this._tourProgressStore;
  },

  freshTour() {
    const now = new Date().toISOString();
    return {
      stage: 0,
      baseSeed: this.seed >>> 0,
      points: this.boats.map(() => 0),
      results: [],
      finishOrder: [],
      champion: null,
      cumulativeStats: { takedowns: 0, perfects: 0, maxSpeed: 0, boosts: 0, slingshots: 0 },
      startedAt: now,
      updatedAt: now,
      completedAt: ""
    };
  },

  startTour(options = {}) {
    const saved = options.resume ? this.tourStore().load() : null;
    if (saved?.status === "active") {
      this.tourPersistenceAvailable = true;
      this.tour = {
        ...saved,
        finishOrder: [],
        champion: null
      };
    } else {
      this.tour = this.freshTour();
    }
    this.startTourStage(this.tour.stage);
  },

  resumeTour() {
    this.startTour({ resume: true });
  },

  hasTourToResume() {
    return this.tourStore().hasActive();
  },

  saveTourProgress(status = "active") {
    if (!this.tour) return null;
    // Un défi reçu rejoue une étape isolée. Il ne doit jamais écraser le vrai
    // Grand Tour local du joueur qui a simplement ouvert un lien partagé.
    if (this.tour.challenge) return { challenge: true, status };
    const saved = this.tourStore().save({
      ...this.tour,
      status,
      champion: undefined,
      finishOrder: undefined
    });
    this.tourPersistenceAvailable = Boolean(saved);
    return saved;
  },

  clearTourProgress() {
    const cleared = this.tourStore().clear();
    this.tourPersistenceAvailable = Boolean(cleared);
    return cleared;
  },

  tourRanking() {
    if (!this.tour) return [];
    return rankTourBoats(this.tour.points, this.tour.results, this.boats.length);
  },

  skipTourSpectating() {
    if (!this.tour || this.mode !== "playing") return false;
    const player = this.boats[0];
    if (!player?.eliminated && !player?.tourFinished) return false;
    // Avant `roundEnding`, des rivaux courent encore : attribuer les points
    // maintenant les transformerait artificiellement en DNF. Le bouton ne
    // saute donc que le délai final, une fois l'ordre décidé ou le timeout acté.
    if (!(this.roundEnding > 0)) return false;
    this.roundEnding = 0;
    this.endTourStage();
    return true;
  },

  startNewTour() {
    this.clearTourProgress();
    this.startTour();
  },

  tourCourseLength() {
    return TOUR_STAGES[this.tour?.stage ?? 0].distance;
  },

  configureTourStageEnvironment({ playback = false } = {}) {
    const tour = this.tour;
    if (!tour) return false;
    const stage = TOUR_STAGES[tour.stage];
    if (!stage) return false;
    this.boats.forEach((boat, boatIndex) => { boat.score = tour.points[boatIndex] ?? 0; });
    // Même ordre qu'en direct : startMatch a d'abord remis le streamer à zéro,
    // puis la côte de l'étape remplace cette mer générique.
    this.world?.setStage?.(this.seed ^ 0x77ad, stage.palette, stage.environment, stage.distance);
    this.ocean?.setStagePalette?.(stage.environment?.water);
    this.ocean?.setIslands?.(this.world?.nearestIslands?.(0) ?? []);
    this.createBuoys();
    const finishZ = this.tourCourseLength();
    const center = routeCenter(finishZ);
    for (const side of [-1, 1]) {
      const mesh = this.buoyVisual(this.THREE, 0x35f27a);
      this.scene.add(mesh);
      this.buoys.push({ x: center + side * 14, z: finishZ, mesh, phase: side * 1.3 });
    }
    this.updateLeaderboard();
    const root = globalThis.document?.documentElement;
    if (root) {
      root.dataset.tourStage = stage.slug;
      root.style.setProperty("--tour-accent", stage.accent);
    }
    if (playback) return true;
    // Métadonnées nécessaires pour reconstruire exactement cette côte depuis
    // la replayothèque, sans toucher à la progression réellement sauvegardée.
    this.replay.metadata = {
      ...this.replay.metadata,
      tourStage: tour.stage,
      stage: stage.name,
      tourPoints: [...tour.points]
    };
    const progressSaved = this.saveTourProgress("active");
    this.showMessage(
      progressSaved
        ? `ÉTAPE ${tour.stage + 1}/8 · ${stage.gameplay?.signature ?? stage.short}`
        : `ÉTAPE ${tour.stage + 1}/8 · ${stage.short} · ⚠ TOUR EN SESSION SEULEMENT`,
      progressSaved ? 2.2 : 3.2
    );
    this.telemetry.track("tour_stage_start", {
      stage: tour.stage,
      slug: stage.slug,
      landmark: stage.landmark,
      weather: stage.weatherLabel
    }, 0);
    return true;
  },

  startTourStage(index) {
    const tour = this.tour;
    if (!tour) return;
    tour.stage = Math.max(0, Math.min(TOUR_STAGES.length - 1, index | 0));
    tour.finishOrder = [];
    // Posé avant startMatch : les caisses, sargasses, vagues et IA repartent
    // directement avec la grammaire propre à l'étape.
    this.stageGameplay = TOUR_STAGES[tour.stage]?.gameplay ?? null;
    // Seed déterministe par étape : chaque legs a sa propre météo, rejouable à l'identique.
    this.seed = (tour.baseSeed + Math.imul(tour.stage + 1, 0x9e3779b9)) >>> 0;
    this.startMatch({ tourStage: true });
    this.configureTourStageEnvironment();
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
          this.clearLiveInput?.();
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
    if (tour.results.some((result) => result.stage === tour.stage)) return;
    const stage = TOUR_STAGES[tour.stage];
    // Classement de l'étape : arrivés dans l'ordre, puis non-finisseurs par z décroissant.
    const { places, awarded, finishTicks } = resolveTourStageClassification(this.boats, tour.finishOrder);
    const lines = [];
    places.forEach((boat, index) => {
      const points = awarded[boat.id];
      tour.points[boat.id] += points;
      boat.score = tour.points[boat.id];
      lines.push(`${index + 1}. ${boat.name} +${points}`);
    });
    tour.cumulativeStats ??= { takedowns: 0, perfects: 0, maxSpeed: 0, boosts: 0, slingshots: 0 };
    tour.cumulativeStats.takedowns += this.stats.takedowns;
    tour.cumulativeStats.perfects += this.stats.perfects;
    tour.cumulativeStats.maxSpeed = Math.max(tour.cumulativeStats.maxSpeed, this.stats.maxSpeed);
    tour.cumulativeStats.boosts += this.stats.boosts;
    tour.cumulativeStats.slingshots += this.stats.slingshots;
    tour.results.push({
      stage: tour.stage,
      places: places.map((boat) => boat.id),
      points: awarded,
      finishTicks,
      completedAt: new Date().toISOString()
    });
    this.telemetry.track("tour_stage_end", { stage: tour.stage, places: places.map((boat) => boat.id) }, this.time);
    this.replay.finish(this.dynamicsList(), { tick: this.tick, tourStage: tour.stage, stage: stage.name });
    this.latestReplay = this.replay.export();
    const replayStored = Boolean(this.replayVault.save(this.latestReplay, this.latestReplay.metadata));
    this.mode = "ended";
    this.ui.hud.classList.add("hidden");
    this.ui.end.classList.remove("hidden");
    const challengeStage = Boolean(tour.challenge);
    const last = challengeStage || tour.stage >= TOUR_STAGES.length - 1;
    const playerPlace = places.findIndex((boat) => boat.isPlayer) + 1;
    const ranking = this.tourRanking();
    const general = ranking
      .map((entry) => `${this.boats[entry.id].name} ${entry.points}`).join(" · ");
    this.ui.endIcon.textContent = "";
    if (this.ui.endIcon.dataset) this.ui.endIcon.dataset.result = last ? "champion" : "stage";
    this.ui.endTitle.textContent = last ? "PODIUM DU TOUR" : `ÉTAPE ${tour.stage + 1}/8 · ${playerPlace === 1 ? "1RE" : `${playerPlace}E`} À L'ÉTAPE`;
    this.ui.endCopy.textContent = `${stage.name} — ${lines.join(" · ")} — GÉNÉRAL : ${general}`;
    let progressStored = false;
    if (last) {
      const champion = this.boats[ranking[0].id];
      tour.champion = champion;
      tour.completedAt = new Date().toISOString();
      this.ui.endTitle.textContent = challengeStage
        ? (playerPlace === 1 ? "DÉFI DOMPTÉ" : "DÉFI TERMINÉ")
        : champion.isPlayer ? "ROI DU TOUR" : `${champion.name} CHAMPION`;
      this.telemetry.track("tour_end", { champion: champion.id, playerWon: champion.isPlayer }, this.time);
      progressStored = Boolean(this.saveTourProgress("completed"));
    } else {
      tour.stage += 1;
      progressStored = Boolean(this.saveTourProgress("active"));
      // L'écran de fin montre l'étape qui vient d'être courue, même si la
      // sauvegarde pointe déjà vers la prochaine.
      tour.stage -= 1;
    }
    if (!progressStored) {
      this.ui.endCopy.textContent += " — ⚠ STOCKAGE LOCAL INDISPONIBLE : TOUR CONSERVÉ POUR CETTE SESSION SEULEMENT";
    }
    this.ui.statTakedowns.textContent = tour.cumulativeStats.takedowns;
    this.ui.statPerfects.textContent = tour.cumulativeStats.perfects;
    this.ui.statSpeed.textContent = Math.round(tour.cumulativeStats.maxSpeed);
    if (this.ui.statTakedownsLabel) this.ui.statTakedownsLabel.textContent = "TAKEDOWNS · TOUR";
    if (this.ui.statPerfectsLabel) this.ui.statPerfectsLabel.textContent = "SHIFTS · TOUR";
    if (this.ui.statSpeedLabel) this.ui.statSpeedLabel.textContent = "KM/H MAX · TOUR";
    if (this.ui.rematch) {
      this.ui.rematch.textContent = challengeStage
        ? "⚡ REJOUER LE DÉFI"
        : last ? "⛵ REJOUER LE TOUR" : "⛵ ÉTAPE SUIVANTE";
    }
    // Rejouer une étape dans la session du Tour risquerait de re-scorer : on désactive.
    if (this.ui.replay) this.ui.replay.disabled = true;
    if (this.ui.downloadReplay) this.ui.downloadReplay.disabled = !this.latestReplay;
    if (this.ui.replayStatus) {
      this.ui.replayStatus.textContent = replayStored
        ? `Replay d'étape sauvegardé · checksum ${this.latestReplay?.finalChecksum ?? "—"}`
        : `Replay d'étape prêt à télécharger · stockage local indisponible · checksum ${this.latestReplay?.finalChecksum ?? "—"}`;
    }
    this.noteRunCompleted?.({
      shareable: !this.playback,
      mode: "tour",
      stage: tour.stage,
      won: playerPlace === 1
    });
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
    const stormSpeed = this.stageGameplay?.stormSpeed ?? 1;
    const baseAdvance = (storm.baseAdvance + this.roundTime * storm.advancePerSecond) * stormSpeed;
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
    // Les six dresseurs simulés ne sont pas seuls à bord : l'homme d'écoute et
    // le patron visible doivent eux aussi partir à l'eau lors d'un chavirage.
    const overboard = Math.min(6, boat.activeCrew) + 2;
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
        side,
        {
          color: boat.color,
          accent: boat.accent,
          boatId: boat.id,
          crewIndex: index
        }
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
      if (attacker.isPlayer) {
        this.showMessage(`+1 TAKEDOWN · ${attacker.score}/${CONFIG.targetScore}`, 1.25);
      }
      this.telemetry.track("takedown", { attacker: attacker.id, victim: boat.id }, this.time);
    }

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

  updateRound(dt) {
    if (this.tour) {
      this.updateTourStage(dt);
      return;
    }
    const alive = this.collectAlive();
    if (alive.length <= 1 && !this.roundEnding) {
      if (alive[0]) {
        alive[0].score += 2;
        this.showMessage(
          alive[0].isPlayer
            ? `+2 DERNIER DEBOUT · ${alive[0].score}/${CONFIG.targetScore}`
            : `${alive[0].name} SURVIT · +2`,
          1.2
        );
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
        this.showMessage(
          ordered[0].isPlayer
            ? `+2 LEADER AU CHRONO · ${ordered[0].score}/${CONFIG.targetScore}`
            : `${ordered[0].name} SURVIT AU CHRONO · +2`,
          1.2
        );
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
      this.ui.endIcon.textContent = "";
      if (this.ui.endIcon.dataset) this.ui.endIcon.dataset.result = humanWinner ? "champion" : "rival";
      this.ui.endTitle.textContent = `${label} REMPORTE LE DUEL`;
      this.ui.endCopy.textContent = `Score final · J1 ${this.boats[0].score} · J2 ${this.boats[1].score} · ${this.boats[2].name} ${this.boats[2].score} · ${this.boats[3].name} ${this.boats[3].score}`;
      this.ui.statTakedowns.textContent = `${this.boats[0].stats.takedowns}/${this.boats[1].stats.takedowns}`;
      this.ui.statPerfects.textContent = `${this.boats[0].score}/${this.boats[1].score}`;
      this.ui.statSpeed.textContent = label;
      if (this.ui.statTakedownsLabel) this.ui.statTakedownsLabel.textContent = "TAKEDOWNS J1/J2";
      if (this.ui.statPerfectsLabel) this.ui.statPerfectsLabel.textContent = "SCORE J1/J2";
      if (this.ui.statSpeedLabel) this.ui.statSpeedLabel.textContent = "VAINQUEUR";
    } else {
      const player = this.boats[0];
      const defeat = defeatPresentation(player?.eliminatedReason);
      this.ui.endIcon.textContent = "";
      if (this.ui.endIcon.dataset) this.ui.endIcon.dataset.result = win ? "champion" : "defeat";
      this.ui.endTitle.textContent = win ? "ROI DE LA LANMÈ" : defeat.title;
      this.ui.endCopy.textContent = win
        ? `La dernière yole debout porte tes couleurs · ${player.score}/${CONFIG.targetScore} points · takedown +1, survie +2.`
        : `${player?.eliminatedReason || "HORS COURSE"} · ${champion.name} gagne ${champion.score} à ${player?.score ?? 0}. Conseil : ${defeat.tip}`;
      this.ui.statTakedowns.textContent = this.stats.takedowns;
      this.ui.statPerfects.textContent = this.stats.perfects;
      this.ui.statSpeed.textContent = Math.round(this.stats.maxSpeed);
      if (this.ui.statTakedownsLabel) this.ui.statTakedownsLabel.textContent = "TAKEDOWNS";
      if (this.ui.statPerfectsLabel) this.ui.statPerfectsLabel.textContent = "SHIFT PARFAITS";
      if (this.ui.statSpeedLabel) this.ui.statSpeedLabel.textContent = "KM/H MAX";
    }
    let replayStored = false;
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
      replayStored = Boolean(this.replayVault.save(this.latestReplay, this.latestReplay.metadata));
    }
    if (this.ui.rematch) this.ui.rematch.textContent = versus ? "⚔ REVANCHE MÊLÉE LOCALE" : "🔥 REVANCHE IMMÉDIATE";
    if (this.ui.replay) this.ui.replay.disabled = versus || !this.latestReplay;
    if (this.ui.downloadReplay) this.ui.downloadReplay.disabled = versus || !this.latestReplay;
    if (this.ui.replayStatus) {
      this.ui.replayStatus.textContent = versus
        ? "Replay désactivé en Mêlée locale · les deux flux humains restent indépendants"
        : this.playback
          ? `Replay terminé · checksum ${checksumBoats(this.dynamicsList())}`
          : replayStored
            ? `Replay sauvegardé · ${this.latestReplay?.inputs?.length ?? 0} trames compressées · checksum ${this.latestReplay?.finalChecksum ?? "—"}`
            : `Replay prêt à télécharger · stockage local indisponible · checksum ${this.latestReplay?.finalChecksum ?? "—"}`;
    }
    this.noteRunCompleted?.({
      shareable: !versus && !this.playback,
      mode: "combat",
      stage: 0,
      won: win
    });
    const versusHumanWin = versus && champion.id <= 1;
    this.audio.play(versus ? (versusHumanWin ? "victory" : "defeat") : (win ? "victory" : "defeat"), { gain: 0.55, gap: 0.4 });
  }
};
