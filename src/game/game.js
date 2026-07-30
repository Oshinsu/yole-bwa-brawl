import { clamp, damp, angleDelta, formatTime, TAU } from "../core/math.js";
import { RNG, seedFromString } from "../core/rng.js";
import { QualityManager, palierInitial } from "../core/quality.js";
import { WaveField } from "../sim/waves.js";
import { ReplayRecorder, ReplayPlayer, ReplayVault, downloadReplay, checksumBoats, isReplayCompatible } from "../sim/replay.js";
import { OceanSystem } from "../render/ocean.js";
import { AtmosphereSystem } from "../render/sky.js";
import { ParticlePool, ImpactRingPool, PostFX, ExplosionPool, EffectAtlasPool, JUICE_VFX } from "../render/vfx.js";
import { WorldStreamer, routeCenter } from "../render/world.js";
import { Boat } from "./boat.js";
import { SpatialHash2D } from "../core/spatial-hash.js";
import { capsuleCollision, pointCapsuleDistanceSquared } from "../sim/collision.js";
import { YoleEventMask } from "../sim/yole-physics.js";
import { SettingsStore } from "../core/settings.js";
import { LocalTelemetry } from "../core/telemetry.js";
import { VerletRope } from "../sim/rope.js";
import { DebrisPool, CrewFallPool } from "../render/debris.js";
import { AudioEngine } from "../core/audio.js";
import { MusicDirector } from "../core/music.js";
import { ImpactDirector } from "../render/impact.js";
import { WeaponSystems } from "./weapons.js";
import { MatchDirector } from "./match.js";
import { HudSystems } from "./hud.js";
import { InputSystems, KEYBOARD_TRIM } from "./input.js";
import { CameraSystems } from "./camera.js";
import { VersusSystems, createVersusInput, quantizeVersusInput, versusCameraFrame } from "./versus.js";
import { PickupSystems } from "./pickups.js";
import { ObstacleSystems } from "./obstacles.js";
import { handlingWaterMix } from "./handling-feedback.js";
import {
  ACTION_WAVE, ACTION_HARPOON, ACTION_MINE, ACTION_SHIFT, ACTION_REVENGE,
  ACTION_BOOST_FORWARD, ACTION_BOOST_LATERAL, RIGS, AI_LEVELS,
  CONFIG, BALANCE, ZOOM_MIN, ZOOM_MAX, CREW_DOTS, TOUR_STAGES, TOUR_STAGE_POINTS,
  vibrate, createBuoyVisual, resolveLoadout, COUNTDOWN_SECONDS, COUNTDOWN_GO_SECONDS } from "./balance.js";


// Assombrissement de la couleur de brouillard par rapport à la couleur
// d'horizon du ciel. Balayé et mesuré, pas choisi : voir le bloc de frame() qui
// pose `scene.fog.color`. La brume océanique, elle, garde la valeur pleine —
// elle se raccorde au ciel au ras de l'horizon, où il n'y a rien à effacer.
const FOG_TINT = 0.82;

// Densité de base du FogExp2. C'est le second terme du problème — et le plus
// lourd des deux, à peu près trois fois l'effet de la teinte. La couleur décide
// de VERS QUOI le lointain s'efface, la densité décide de COMBIEN.
//
// Mesuré par `tools/sweep_fog.py`, sur les seuls pixels que le brouillard
// repeint réellement (4,2 % du cadre, masque désigné par le jeu lui-même en
// comparant une capture sans aucun brouillard à la référence) :
//
//   densité    luminance   saturation
//   0,0026       0,3861      0,4918     <- ancienne valeur
//   0,0020       0,3493      0,5325
//   0,0015       0,3346      0,5473     <- retenue
//   0,0011       0,3232      0,5614
//   aucune       0,3183      0,5760
//
// À 0,0026 le brouillard relevait la luminance du lointain de +21 % et lui
// mangeait 15 % de saturation : d'où les cônes gris pâle, insensibles et à leur
// albédo et à l'éclairage. À 0,0015 il reste +5 % / -5 % — une brume, plus un
// badigeon. On ne descend pas plus bas : à 1000 m le brouillard couvre encore
// 89 % du pixel, ce qui masque l'apparition des chunks du streamer ; à 0,0011
// la perspective aérienne devient indiscernable de son absence.
const FOG_DENSITY = 0.0015;

// Web Vibration ne fournit pas d'amplitude. Le mode DOUX réduit donc les
// durées "on" sans altérer les silences qui donnent sa signature à chaque choc.
export const HAPTIC_PATTERNS = Object.freeze({
  pickup: 14,
  turbo: [16, 9, 24],
  dash: [10, 7, 30],
  coconutFire: [12, 8, 18],
  coconutImpact: [18, 10, 30, 14, 56],
  harpoonAnchor: [12, 9, 34, 15, 22],
  mineImpact: [26, 12, 48, 16, 78],
  rhum: [20, 12, 34],
  perfectShift: [9, 7, 16, 7, 30],
  playerHit: [24, 18, 46],
  crewLost: [22, 16, 42],
  hullSlam: [8, 12, 16],
  slamLight: 18,
  slamHeavy: [18, 12, 36, 12, 44],
  checkpoint: [18, 12, 32]
});

export function scaleHapticPattern(pattern, strength = 1) {
  const amount = clamp(Number.isFinite(strength) ? strength : 1, 0, 1);
  if (amount <= 0) return 0;
  const scaleOn = (value) => Math.max(4, Math.round(value * (0.35 + amount * 0.65)));
  if (!Array.isArray(pattern)) return scaleOn(Math.max(0, Number(pattern) || 0));
  return pattern.map((value, index) => index % 2 === 0 ? scaleOn(value) : Math.max(4, Math.round(value)));
}

export class Game {
  constructor(THREE, ui, assets = null) {
    this.assets = assets;
    this.THREE = THREE;
    this.ui = ui;
    this.mode = "menu";
    this.paused = false;
    this.time = 0;
    this.tick = 0;
    this.round = 1;
    this.roundTime = 0;
    this.roundEnding = 0;
    this.stormZ = BALANCE.storm.startZ;
    this.spiritUsed = false;
    this.revengePending = null;
    this.messageTimer = 0;
    this.damageFlash = 0;
    this.shake = 0;
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.uiClock = 0;
    this.particleBudget = 1;
    this.worldRefreshTimer = 0;
    this.stats = { takedowns: 0, perfects: 0, maxSpeed: 0, boosts: 0, slingshots: 0 };
    this.settings = new SettingsStore();
    this.cameraZoom = clamp(this.settings.get("cameraZoom") ?? 1.18, ZOOM_MIN, ZOOM_MAX);
    this.telemetry = new LocalTelemetry();
    this.spatial = new SpatialHash2D(14);
    this.spatialScratch = [];
    this.collisionScratch = {};
    this.collisionPairs = new Set();
    // Scratches partagés : aucune allocation dans les boucles chaudes.
    this.waterScratch = {};
    this.forwardScratch = { x: 0, z: 0 };
    this.aliveScratch = [];
    this.dynamicsScratch = [];
    this.leaderSortScratch = [];
    this.leaderRows = null;
    this.poolCursors = new Map();
    this.gamepadPrev = [];
    this.gamepadSteer = null;
    this.gamepadTrim = null;

    const params = new URLSearchParams(location.search);
    this.seed = params.has("seed") ? seedFromString(params.get("seed")) : 0x0b0a2026;
    this.gameRng = new RNG(this.seed);
    this.weatherRng = new RNG(this.seed ^ 0x09e3779b);
    this.visualRng = new RNG(this.seed ^ 0xa5a5f00d);
    this.audio = new AudioEngine(new RNG(this.seed ^ 0x51f15e));
    // La musique vit à côté du moteur d'effets, sur son propre bus. Elle est
    // entièrement optionnelle : fichiers absents = jeu silencieux, pas d'erreur.
    this.music = new MusicDirector(this.audio);
    this.audio.muted = !this.settings.get("audio");
    this.impact = new ImpactDirector(new RNG(this.seed ^ 0x1d9a7c3), this.settings);
    this.waveField = new WaveField();
    this.replay = new ReplayRecorder(this.seed, 60);
    this.replayVault = new ReplayVault();
    // Une retouche physique change légitimement le checksum. On n'expose donc
    // que le dernier replay de la version courante au bouton REPLAY.
    this.latestReplay = this.replayVault.list()
      .find((item) => isReplayCompatible(item?.replay))?.replay ?? null;
    this.playback = null;
    this.tour = null;
    this.versusLocal = false;
    this.playbackInput = { steer: 0, trim: 0.82, aim: 0, aimActive: false, actions: 0 };
    this.isApplyingReplay = false;
    this.input = {
      steer: 0,
      trim: 0.82,
      left: false,
      right: false,
      joy: false,
      joyId: null,
      joyCenterX: 0,
      joyCenterY: 0,
      aim: 0,
      aimActive: false,
      aimPointerId: null,
      actions: 0
    };
    this.input2 = createVersusInput();

    this.initRenderer();
    this.initWorld();
    this.bindUI();
    this.resize();
    this.renderer.setAnimationLoop((now) => this.frame(now));
    window.addEventListener("resize", () => this.resize(), { passive: true });
    window.addEventListener("error", (event) => console.error("Runtime error", event.error || event.message));
    // Crochets de debug : seulement avec ?debug ou un harnais de test explicite.
    if (new URLSearchParams(location.search).has("debug") || globalThis.__YOLE_DEBUG_ENABLE__) {
      window.__YOLE_DEBUG__ = {
        game: this,
        getState: () => this.debugState(),
        exportReplay: () => this.latestReplay || this.replay.export(),
        playLatestReplay: () => this.latestReplay && this.startReplay(this.latestReplay),
        telemetry: () => this.telemetry.snapshot(),
        downloadTelemetry: () => this.downloadTelemetry(),
        setQuality: (tier) => this.quality.setTier(tier, true),
        togglePerf: () => this.toggleSetting("showPerf"),
        THREE_REVISION: THREE.REVISION
      };
    }
  }

  // Bouée : le mesh généré s'il est là, le prisme procédural sinon. La teinte
  // d'équipe reste appliquée par multiplication, comme pour la coque.
  haptic(patternOrName) {
    const configured = this.settings.get("haptics");
    const strength = typeof configured === "number" ? clamp(configured, 0, 1) : configured ? 1 : 0;
    if (strength <= 0) return false;
    const pattern = typeof patternOrName === "string"
      ? HAPTIC_PATTERNS[patternOrName]
      : patternOrName;
    if (pattern == null) return false;
    vibrate(scaleHapticPattern(pattern, strength));
    return true;
  }

  buoyVisual(THREE, color) {
    if (this.assets?.hasRig?.("bouee")) {
      const prop = this.assets.instantiate("bouee");
      if (prop) {
        prop.scale.setScalar(1.35);
        prop.traverse?.((node) => {
          const m = node.material;
          if (!m) return;
          if ("emissiveIntensity" in m) m.emissiveIntensity = 0;
          if ("metalness" in m) m.metalness = 0;
          if ("roughness" in m) m.roughness = 0.68;
        });
        return prop;
      }
    }
    return createBuoyVisual(THREE, color);
  }

  initRenderer() {
    const THREE = this.THREE;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b7690, 0.0026);
    this.camera = new THREE.PerspectiveCamera(63, innerWidth / innerHeight, 0.1, 1850);
    this.renderer = new THREE.WebGLRenderer({
      // Le contexte n'est antialiasé que pour le chemin LQ, qui rend directement
      // dans le framebuffer par défaut. Dès que le post-FX est actif, c'est
      // `samples` sur la cible de rendu qui fait le travail.
      // ⚠️ `false` ET C'EST VOULU. 100 % du rendu passe par une
      // WebGLRenderTarget (PostFX.render) ; le framebuffer par défaut ne reçoit
      // que le quad de composition plein écran, dont les seules arêtes sont les
      // bords de l'écran. Le MSAA du contexte n'a donc RIEN à lisser, alors
      // qu'il fait allouer et résoudre un tampon couleur+profondeur
      // multi-échantillonné pleine résolution à chaque image. L'antialiasing
      // réel reste celui de la cible de rendu, piloté par `PostFX.setSamples`.
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ⚠️ Ces deux lignes ne servent PLUS à aucun palier de qualité.
    //
    // Le commentaire précédent affirmait que « le LQ contourne le post-FX » :
    // c'est faux depuis que les trois profils déclarent `postFX: true`
    // (src/core/quality.js). Les trois paliers passent par une
    // WebGLRenderTarget, et three.js n'applique tone mapping et exposition
    // qu'au rendu vers le framebuffer par DÉFAUT.
    //
    // Le tone mapping ACES et l'encodage sRGB sont maintenant faits
    // explicitement dans la passe de composition (src/render/vfx.js), qui est
    // le seul endroit traversé par tous les pixels. Ces deux lignes ne
    // subsistent que pour le repli de PostFX.render() quand le contexte n'expose
    // pas setRenderTarget — c'est-à-dire les harnais de test.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.20;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // autoReset=false : info accumule tous les passes de la frame (scène + post-FX),
    // remise à zéro manuellement au début de frame() pour des compteurs utiles.
    this.renderer.info.autoReset = false;
    this.ui.viewport.appendChild(this.renderer.domElement);

    // Niveau de base des deux lumieres. Les valeurs passees au constructeur ne
    // survivent pas a la premiere frame : frame() reecrit les deux intensites
    // depuis la meteo a chaque tour. Elles vivent donc ICI, nommees, et frame()
    // les lit — sinon on croit regler l'eclairage en changeant un argument qui
    // est ecrase 16 ms plus tard.
    this.lightBase = { hemisphere: 2.22, sun: 4.35 };
    // Même raison que `lightBase` : posés en champs pour être balayables en
    // jeu, parce que frame() réécrit couleur ET densité à chaque tour.
    this.fogTint = FOG_TINT;
    this.fogBase = FOG_DENSITY;
    this.hemisphere = new THREE.HemisphereLight(0xd8fbff, 0x174a38, this.lightBase.hemisphere);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(0xfff1bd, this.lightBase.sun);
    // Azimut RETOURNÉ vers l'avant du couloir (+Z) : les ombres tombaient vers
    // la caméra alors que le soleil spéculaire est devant. L'ÉLÉVATION ne bouge
    // pas (52°) — c'est elle qui porte l'éclairement des mornes, et la descendre
    // leur coûtait 1,7 à 1,9 EV. Retourner l'azimut à élévation constante laisse
    // l'irradiance d'une surface horizontale inchangée par construction.
    this.sun.position.set(-65, 95, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 250;
    this.scene.add(this.sun, this.sun.target);

    this.atmosphere = new AtmosphereSystem(THREE, this.scene, this.weatherRng, this.visualRng);
    this.ocean = new OceanSystem(THREE, this.scene, this.waveField, { quality: 2 });
    // ⚠️ Il y a DEUX soleils, et ce n'était pas voulu. `sun.position` est
    // réécrite CHAQUE frame par la caméra (camera.js) ; `uSunDir` était copiée
    // ICI une seule fois au boot et n'a jamais resuivi. Les deux ont divergé
    // sans que personne le voie, parce qu'elles étaient presque égales.
    //
    // On assume la séparation au lieu de la subir : la LUMIÈRE garde son
    // élévation de 52° (elle porte l'éclairement des mornes), le SOLEIL SPÉCULAIRE
    // descend à 23° et passe DEVANT le joueur. Avant, `uSunDir.z = -0,34` contre
    // une caméra qui regarde vers +Z : le disque solaire et le chemin de lumière
    // sur l'eau étaient derrière l'objectif 100 % du temps de jeu — le glint,
    // le sun-road et le SSS de crête ne produisaient aucun pixel.
    const sunDirection = new THREE.Vector3(-0.30, 0.40, 0.87).normalize();
    this.ocean.uniforms.uSunDir.value.copy(sunDirection);
    this.atmosphere.uniforms.uSunDir.value.copy(sunDirection);
    this.particles = new ParticlePool(THREE, this.scene, 1700);
    this.rings = new ImpactRingPool(THREE, this.scene, 32);
    this.debris = new DebrisPool(THREE, this.scene, 72);
    // 4 yoles × 6 équipiers : « FIN DU CHRONO » couche trois yoles dans la même
    // frame, et les hommes flottent maintenant 5,2 s au lieu de 0,85 — le
    // curseur circulaire recyclait des nageurs encore à l'écran.
    this.crewFalls = new CrewFallPool(THREE, this.scene, CONFIG.colors, 26);
    this.postFX = new PostFX(THREE, this.renderer, innerWidth, innerHeight);

    this.quality = new QualityManager((profile, tier) => {
      this.qualityProfile = profile;
      this.particleBudget = profile.particles;
      this.renderer.setPixelRatio(profile.pixelRatio);
      this.postFX?.setSamples(profile.samples ?? 4);
      this.renderer.shadowMap.enabled = profile.shadows;
      this.postFX.enabled = profile.postFX;
      this.postFX.setQuality(tier, profile);
      this.ocean.setQuality(tier);
      this.world?.setQuality(tier);
      if (this.ui.quality) this.ui.quality.textContent = profile.label;
      // ⚠️ ON MÉMORISE CE QUE L'ADAPTATION A DÉCOUVERT. `settings.set("quality")`
      // n'était appelé que depuis deux gestionnaires de clic : les descentes
      // automatiques n'écrivaient rien. Chaque lancement rejouait donc la même
      // découverte coûteuse depuis HQ, et le joueur mobile ne voyait JAMAIS le
      // palier adapté — seulement, à chaque fois, la phase qui y mène.
      //
      // Clé distincte de `quality` pour que le choix MANUEL du joueur reste ce
      // qu'il est : un choix, pas une mesure.
      //
      // La garde sur `this.quality` n'est pas cosmétique : `apply()` est appelé
      // depuis le CONSTRUCTEUR du gestionnaire, donc avant que l'affectation
      // ci-dessous ait eu lieu. Sans elle, le boot réécrirait la clé avec la
      // valeur qu'il vient d'en lire.
      if (this.quality && !this.quality.manual) this.settings.set("qualityAuto", tier);
      this.resize();
    }, palierInitial(this.settings.get("qualityAuto")));
    const savedQuality = this.settings.get("quality");
    if (savedQuality === "auto") this.quality.setAutomatic();
    else if (["LQ", "MQ", "HQ"].includes(savedQuality)) this.quality.setTier(["LQ", "MQ", "HQ"].indexOf(savedQuality), true);
    this.applySettingsUI();
  }


  initWorld() {
    this.world = new WorldStreamer(this.THREE, this.scene, this.seed ^ 0x77ad, this.assets?.texture("morne") ?? null);
    this.world.setQuality(this.quality.tier);
    this.ocean.setIslands(this.world.nearestIslands(0));
    this.boats = CONFIG.names.map((name, index) => new Boat(this, index, {
      name,
      color: CONFIG.colors[index],
      accent: CONFIG.accents[index],
      isPlayer: index === 0
    }));
    this.buoys = [];
    // Explosions texturées : uniquement si la texture est là, sinon on garde
    // les particules seules — aucune régression si l'asset manque.
    this.atmosphere.setClouds(this.assets?.texture("clouds"));
    this.atmosphere.setBackdrop(this.assets?.texture("backdrop"));
    this.atmosphere.setNearBackdrop?.(this.assets?.texture("backdropNear"));
    const explosionTexture = this.assets?.texture("explosion");
    if (explosionTexture) this.explosions = new ExplosionPool(this.THREE, this.scene, explosionTexture);
    // Pool distinct pour les gerbes : plus nombreuses, plus courtes, plus petites.
    const sprayTexture = this.assets?.texture("spray");
    if (sprayTexture) this.sprays = new ExplosionPool(this.THREE, this.scene, sprayTexture, { max: 28 });
    const spellVfxTexture = this.assets?.texture("spellVfx");
    if (spellVfxTexture) this.spellVfx = new EffectAtlasPool(this.THREE, this.scene, spellVfxTexture);
    const juiceVfxTexture = this.assets?.texture("juiceVfx");
    if (juiceVfxTexture) {
      this.juiceVfx = new EffectAtlasPool(this.THREE, this.scene, juiceVfxTexture, {
        max: 12,
        columns: 2,
        rows: 2
      });
    }
    this.createPickupPool();
    this.createObstaclePool();
    this.createBuoys();
    this.waveProjectiles = this.createWavePool(18);
    this.mines = this.createMinePool(18);
    this.slicks = this.createSlickPool(6);
    this.grapples = this.createGrapplePool(10);
    this.harpoonMisses = this.createHarpoonMissPool(6);
    this.camera.position.set(0, 11, -22);
    this.resetRound(false);
  }


  allocate(pool) {
    // Round-robin : un pool saturé recycle le plus ancien slot au lieu de toujours
    // sacrifier le slot 0 (qui pouvait couper un câble de harpon en cours).
    const start = this.poolCursors.get(pool) ?? 0;
    for (let offset = 0; offset < pool.length; offset++) {
      const index = (start + offset) % pool.length;
      if (!pool[index].active) {
        this.poolCursors.set(pool, index + 1);
        return pool[index];
      }
    }
    const fallback = pool[start % pool.length];
    this.poolCursors.set(pool, start + 1);
    return fallback;
  }

  createBuoys() {
    for (const buoy of this.buoys) this.scene.remove(buoy.mesh);
    this.buoys.length = 0;
    let index = 0;
    const buoyLimit = this.tour ? this.tourCourseLength() + 120 : 1650;
    for (let z = 72; z < buoyLimit; z += 82 + ((index * 37) % 48), index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const x = routeCenter(z) + side * (22 + (index % 3) * 5);
      const mesh = this.buoyVisual(this.THREE, index % 2 ? 0xff9d2c : 0xff4d55);
      this.scene.add(mesh);
      this.buoys.push({ x, z, mesh, phase: index * 0.7 });
    }
  }

  // Retour visuel du ramassage : message, son et petit impact.
  onPickupTaken(boat, pickup, weapon) {
    // ⚠️ Deux fois moins de caisses depuis que la mine et le rhum y sont
    // passés : chaque ramassage compte le double, il doit donc s'entendre et se
    // voir. Deux anneaux concentriques, une gerbe de bois et un éclat coloré à
    // la teinte de l'arme.
    const teinte = pickup.color ?? 0xffc531;
    this.rings.burst(pickup.x, 0.6, pickup.z, teinte, 2.6, 0.78);
    this.rings.burst(pickup.x, 0.66, pickup.z, 0xffffff, 1.4, 0.46);
    this.particles.emitBurst(this.visualRng, { x: pickup.x, y: 0.9, z: pickup.z }, 0xffd76a, 46, {
      speed: 3.4, upward: 4.1, sizeMax: 0.62, gravity: 5.4
    });
    // ⚠️ PAS DE `debris.spawnBurst` ICI, ET CE N'EST PAS UN CHOIX ESTHÉTIQUE.
    //
    // `onPickupTaken` est appelée depuis le PAS FIXE (`updatePickups`), et
    // `spawnBurst` puise dans `visualRng` — le même flux que la boucle de
    // rendu, dont la cadence varie. Mesuré : avec ces éclats, la simulation à
    // 144 Hz divergeait de celle à 60 Hz au tick 1400. Sans eux, les deux
    // cadences restent identiques.
    //
    // `explosions.spawn` ne prend aucun générateur : elle est sûre ici.
    this.explosions?.spawn(pickup.x, 1.5, pickup.z, 2.9, 0.46);
    if (!boat.isPlayer) return;
    const label = {
      wave: "🥥 COCO", harpoon: "🕸 HARPON", mine: "🌋 MINE", rhum: "🥃 RHUM",
      barik: "🛢 BARIK", chadron: "🦔 CHADRON", lanbi: "🐚 LANBI", pwason: "🐟 PWASON"
    }[weapon] ?? weapon;
    this.showMessage(`📦 ${label} RAMASSÉ`, 0.6);
    this.audio.play("buoy", { gain: 0.42, rate: 1.25, gap: 0.05 });
    this.impact.trigger("graze", { dirX: 0, dirZ: 1, intensity: 0.45 });
    this.haptic("pickup");
  }

  resetPools() {
    for (const projectile of this.waveProjectiles) {
      projectile.active = false;
      projectile.mesh.visible = false;
    }
    for (const mine of this.mines) {
      mine.active = false;
      mine.mesh.visible = false;
    }
    // ⚠️ Les nappes aussi : sans ça, une flaque de la manche précédente
    // continuerait de mordre au départ de la suivante, à un endroit où plus
    // rien ne brûle à l'écran.
    for (const nappe of this.slicks ?? []) { nappe.active = false; nappe.life = 0; }
    for (const grapple of this.grapples) {
      grapple.active = false;
      grapple.life = 0;
      grapple.tension = 0;
      grapple.stress = 0;
      grapple.line.visible = false;
    }
    this.resetPickups();
    this.resetObstacles();
  }



  startMatch(options = {}) {
    // Tout lancement hors startTourStage quitte le mode Tour.
    if (!options.tourStage) this.tour = null;
    // Un duel ne survit qu'à une revanche explicitement lancée comme duel.
    // Jouer, Tour et Replay reviennent donc toujours au flux solo.
    this.setVersusMode(Boolean(options.versus) && !options.replay && !options.tourStage);
    this.audio.ensure();
    this.playback = options.replay ? new ReplayPlayer(options.replay) : null;
    if (options.replay) this.seed = options.replay.seed >>> 0;
    // Le gréement emprunte la MEME route que la graine : enregistre dans le
    // payload, restaure a la relecture. Sans ca, le meme fichier rejoue sur une
    // machine equipee autrement donne un autre checksum — en silence.
    const rigIndex = options.replay
      ? (Number.isInteger(options.replay.rig) && options.replay.rig >= 0 && options.replay.rig < RIGS.length ? options.replay.rig : 1)
      : this.playerRig();
    this.matchRig = rigIndex;
    if (this.replay) this.replay.rig = rigIndex;
    // Le niveau d'IA emprunte exactement la même route que le gréement : figé
    // ici pour toute la partie, restauré depuis le payload en relecture.
    const aiLevel = options.replay
      ? (AI_LEVELS.some((level) => level.key === options.replay.aiLevel) ? options.replay.aiLevel : "tour")
      : this.playerAiLevel();
    this.matchAiLevel = aiLevel;
    if (this.replay) this.replay.aiLevel = aiLevel;
    // ⚠️ MÊME ROUTE QUE LE GRÉEMENT ET LE NIVEAU D'IA. La soute change les
    // munitions de départ, donc les décisions, donc le checksum : la lire
    // depuis les réglages en relecture ferait diverger un replay dès qu'on
    // change d'équipement entre deux parties. Elle est figée ici et restaurée
    // depuis le payload.
    const loadout = resolveLoadout(options.replay
      ? options.replay.loadout
      : this.settings.get("loadout"));
    this.matchLoadout = loadout;
    if (this.replay) this.replay.loadout = loadout;
    this.stats = { takedowns: 0, perfects: 0, maxSpeed: 0, boosts: 0, slingshots: 0 };
    this.telemetry.clear();
    this.telemetry.track("match_start", { seed: this.seed, replay: Boolean(options.replay) }, 0);
    this.spatial.clear();
    this.spatialScratch.length = 0;
    this.collisionPairs.clear();
    this.poolCursors.clear();
    this.round = 1;
    this.tick = 0;
    this.time = 0;
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.gameRng = new RNG(this.seed);
    this.weatherRng = new RNG(this.seed ^ 0x09e3779b);
    this.visualRng = new RNG(this.seed ^ 0xa5a5f00d);
    this.audio.rng = new RNG(this.seed ^ 0x51f15e);
    this.impact.rng = new RNG(this.seed ^ 0x1d9a7c3);
    this.impact.reset();
    this.cameraBase = null;
    this.cameraRollBase = null;
    this.cameraFovBase = null;
    this.atmosphere.resetRng(this.weatherRng, this.visualRng);
    this.world.reset();
    this.ocean.setIslands(this.world.nearestIslands(0));
    this.ocean.wake.grid.clear();
    this.particles.clear();
    this.rings.clear();
    this.explosions?.clear();
    this.sprays?.clear();
    this.spellVfx?.clear();
    this.juiceVfx?.clear();
    this.debris.clear();
    this.crewFalls.clear();
    this.replay.enabled = !this.playback && !this.versusLocal;
    this.replay.reset(this.seed);
    this.playbackInput.steer = 0;
    this.playbackInput.trim = 0.82;
    this.playbackInput.aim = 0;
    this.playbackInput.aimActive = false;
    this.playbackInput.actions = 0;
    this.input.steer = 0;
    this.input.trim = 0.82;
    this.input.left = false;
    this.input.right = false;
    this.input.joy = false;
    this.input.joyId = null;
    this.input.aim = 0;
    this.input.aimActive = false;
    this.input.aimPointerId = null;
    this.input.actions = 0;
    this.clearVersusInput();
    this.ui.killfeed.innerHTML = "";
    this.boats.forEach((boat) => {
      boat.score = 0;
      boat.stats.takedowns = 0;
    });
    this.mode = "playing";
    // Sting de départ, puis la boucle de la phase. `An Nou Ay` veut dire
    // « allons-y » : c'est littéralement le coup d'envoi.
    this.music?.jouerSting?.("depart");
    this.music?.setScene?.(this.versusLocal ? "duel" : this.tour ? "tour" : "course");
    this.paused = false;
    this.ui.menu.classList.add("hidden");
    this.ui.end.classList.add("hidden");
    this.ui.pause.classList.add("hidden");
    this.ui.hud.classList.remove("hidden");
    this.ui.versusScreen?.classList.add("hidden");
    this.ui.versusHud?.classList.toggle("hidden", !this.versusLocal);
    this.resetRound(false);
    if (this.ui.replay) this.ui.replay.disabled = this.versusLocal;
    if (this.ui.downloadReplay) this.ui.downloadReplay.disabled = this.versusLocal;
    if (this.ui.replayStatus && this.versusLocal) {
      this.ui.replayStatus.textContent = "Replay désactivé en Duel local · 2 flux humains à 60 Hz";
    }
    this.showMessage(
      this.playback
        ? "REPLAY · MÊME MER, MÊME SEED"
        : this.versusLocal
          ? "DUEL LOCAL · J1 + J2 CONTRE 2 RIVAUX"
          : "PRÉPARE LA CONTRE-GÎTE",
      1.35
    );

    // Chaque manche repart sur un 3 · 2 · 1 · GO.
    this.countdown = COUNTDOWN_SECONDS + COUNTDOWN_GO_SECONDS;
    // ⚠️ Le transitoire de compilation des shaders recommence à chaque manche :
    // on redonne au gestionnaire de qualité sa période de grâce, sinon il juge
    // la machine sur des images bloquées par la compilation. Voir
    // `src/core/quality.js` et la passe 45 du CHANGELOG.
    this.quality?.resetWarmup?.();
  }

  startReplay(replay) {
    if (!isReplayCompatible(replay)) {
      if (this.ui.replayStatus) this.ui.replayStatus.textContent = "Replay ancien incompatible · nouvelle physique 3.6";
      return false;
    }
    this.startMatch({ replay });
    return true;
  }


  executeRevenge(target) {
    if (!target || target.eliminated) return;
    const water = this.waveField.sample(target.x, target.z, this.time, this.waterScratch);
    this.ocean.wake.burst(target.x, target.z, 7.5, 2.2);
    this.rings.burst(target.x, water.height, target.z, 0xc36cff, 2.0, 0.9);
    this.particles.emitBurst(this.visualRng, { x: target.x, y: water.height + 0.4, z: target.z }, 0xeab8ff, 52, { speed: 2.3, upward: 2.8, sizeMax: 0.8 });
    target.applyHit(this.boats[0], {
      rollImpulse: (this.gameRng.chance(0.5) ? 1 : -1) * 1.05,
      yawImpulse: 0.28,
      waterKg: 38,
      cohesionDamage: 0.18,
      hitLateral: this.gameRng.signed(),
      hitLongitudinal: -0.2,
      crewImpulse: 0.75
    });
    this.postFX.pulse(1.0);
    this.audio.playImpact?.("mine", { intensity: 1.1, pan: this.panFor(target.x) });
    this.impact.trigger("blast", { dirX: target.x - this.boats[0].x, dirZ: target.z - this.boats[0].z, intensity: 1.1 });
  }

  onPerfectShift(boat, precision) {
    if (boat.isPlayer) {
      this.stats.perfects++;
      this.showMessage(precision > 0.65 ? "CONTRE-GÎTE PARFAITE" : "RATTRAPAGE", 0.62);
      this.shake += 0.12;
      this.postFX.pulse(0.22 + precision * 0.16);
      if (precision > 0.65) {
        const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
        this.juiceVfx?.spawn(
          boat.x,
          water.height + 1.45,
          boat.z,
          JUICE_VFX.PERFECT_COUNTERHEEL,
          5.4 + precision * 1.4,
          0.72,
          { intensity: this.settings.get("reduceFlash") ? 0.34 : 0.86 }
        );
      }
      this.haptic("perfectShift");
      this.cutGrapplesFor(boat, precision);
      this.audio.play("bwaShift", { gain: 0.30 + precision * 0.20, rate: 1 + precision * 0.18, gap: 0.03 });
      this.impact.trigger("graze", { dirX: -Math.sin(boat.dynamics.heading), dirZ: -Math.cos(boat.dynamics.heading), intensity: 0.5 + precision * 0.5 });
    } else if (this.visualRng.chance(0.15)) {
      this.particles.emitBurst(this.visualRng, { x: boat.x, y: boat.y, z: boat.z }, boat.color, 7, { speed: 0.5, upward: 0.6, gravity: 1.8 });
    }
  }

  cutGrapplesFor(boat, precision = 0) {
    if (precision < 0.42) return 0;
    let cut = 0;
    for (const grapple of this.grapples) {
      if (!grapple.active || grapple.target !== boat) continue;
      if (this.cutGrapple(grapple, "perfect_shift")) cut++;
      this.telemetry.track("harpoon_cut", { boat: boat.id, precision }, this.time);
    }
    if (cut && boat.isPlayer) this.showMessage("⚡ HARPON COUPÉ AU SHIFT", 0.72);
    return cut;
  }

  onCrewLost(boat, count = 1, payload = {}) {
    const forward = boat.forward(this.crewForwardScratch || (this.crewForwardScratch = { x: 0, z: 0 }));
    const side = Math.sign(payload.hitLateral ?? payload.rollImpulse ?? boat.roll ?? 1) || 1;
    for (let index = 0; index < count; index++) {
      this.crewFalls.spawn(this.visualRng, {
        x: boat.x - forward.z * side * (1.6 + index * 0.3),
        y: boat.y + 1.15,
        z: boat.z + forward.x * side * (1.6 + index * 0.3)
      }, {
        x: boat.dynamics.vx * 0.24,
        z: boat.dynamics.vz * 0.24
      }, side);
    }
    this.telemetry.track("crew_lost", { boat: boat.id, count, source: boat.lastAggressor?.id ?? -1 }, this.time);
    if (boat.isPlayer) this.showMessage("⚠️ ÉQUIPIER À L’EAU", 0.72);
  }

  onPlayerHit(payload) {
    this.shake += 0.45 + Math.abs(payload.rollImpulse ?? 0) * 0.45;
    this.damageFlash = 1;
    this.postFX.pulse(0.55 + Math.abs(payload.rollImpulse ?? 0) * 0.22);
    this.haptic("playerHit");
    this.telemetry.track("player_hit", { roll: payload.rollImpulse ?? 0, water: payload.waterKg ?? 0 }, this.time);
  }

  onBoatDynamicsEvent(boat, event) {
    if (event.mask & YoleEventMask.SLAM) {
      const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
      const count = Math.floor(clamp(5 + event.spray * 7, 5, 24));
      this.particles.emitBurst(this.visualRng, { x: boat.x, y: water.height + 0.15, z: boat.z }, 0xdffeff, count, {
        speed: 0.8 + event.slam * 0.28,
        upward: 1.1 + event.slam * 0.22,
        lifeMin: 0.22,
        lifeMax: 0.62,
        sizeMax: 0.46,
        gravity: 5.8
      });
      this.ocean.wake.burst(boat.x, boat.z, 1.8 + event.slam * 0.42, clamp(event.slam * 0.28, 0.2, 1.15));
      // Gerbe texturée devant l'étrave, dimensionnée par la violence du slam.
      if (event.slam > 0.55) {
        const spray = boat.forward(this.sprayForwardScratch || (this.sprayForwardScratch = { x: 0, z: 0 }));
        this.sprays?.spawn(
          boat.x + spray.x * 4.6, water.height + 0.9, boat.z + spray.z * 4.6,
          1.5 + clamp(event.slam, 0, 3) * 1.5, 0.42 + clamp(event.slam, 0, 2) * 0.12
        );
      }
      if (boat.isPlayer && event.slam > 0.9) {
        this.audio.play("hullSlam", {
          gain: clamp(0.10 + event.slam * 0.13, 0.08, 0.42),
          rate: clamp(1.25 - event.slam * 0.12, 0.7, 1.3),
          gap: 0.11
        });
      }
      if (boat.isPlayer && event.slam > 1.25) {
        this.shake += clamp(event.slam * 0.055, 0.04, 0.22);
        this.impact.trigger("graze", {
          dirX: -Math.sin(boat.dynamics.heading),
          dirZ: -Math.cos(boat.dynamics.heading),
          intensity: clamp(event.slam * 0.35, 0.2, 1)
        });
        this.telemetry.track("hull_slam", { strength: event.slam }, this.time);
      }
    }
    if ((event.mask & YoleEventMask.CRITICAL_FLOOD) && boat.isPlayer && (boat.lastFloodWarningAt ?? -99) + 3 < this.time) {
      boat.lastFloodWarningAt = this.time;
      this.showMessage("⚠️ YOLE GORGÉE D’EAU", 0.7);
      this.telemetry.track("critical_flood", { waterKg: boat.water }, this.time);
    }
    if ((event.mask & YoleEventMask.CREW_CROSSED) && boat.isPlayer) {
      this.telemetry.track("crew_crossed", { speed: event.shiftCrossing }, this.time);
    }
  }

  // Panoramique approximatif : position latérale de la source vs joueur.
  panFor(x) {
    const player = this.boats[0];
    if (!player) return 0;
    return clamp((x - player.x) / 26, -0.85, 0.85);
  }

  // 1 au contact du joueur, 0 au-delà du rayon : sert de gain et d'intensité.
  proximity(x, z, radius) {
    const player = this.boats[0];
    if (!player || radius <= 0) return 0;
    return clamp(1 - Math.hypot(player.x - x, player.z - z) / radius, 0, 1);
  }

  rebuildSpatialIndex() {
    this.spatial.clear();
    for (const boat of this.boats) {
      if (!boat.eliminated) this.spatial.insert(boat, boat.x, boat.z, 6.2);
    }
  }

  onHullSlam(boat, intensity) {
    const forward = boat.forward();
    const x = boat.x + forward.x * 4.7;
    const z = boat.z + forward.z * 4.7;
    const water = this.waveField.sample(x, z, this.time, this.waterScratch);
    this.ocean.wake.burst(x, z, 2.6 + intensity * 2.2, 0.5 + intensity);
    this.rings.burst(x, water.height, z, 0xbffcff, 0.55 + intensity * 0.55, 0.42);
    if (boat.isPlayer) {
      this.shake += intensity * 0.24;
      this.postFX.pulse(intensity * 0.16);
      if (intensity > 0.75) this.haptic("hullSlam");
    }
  }


  resolveCollisions(dt) {
    this.collisionPairs.clear();
    for (const boat of this.boats) boat.collisionCd = Math.max(0, (boat.collisionCd ?? 0) - dt);

    for (const a of this.boats) {
      if (a.eliminated) continue;
      const candidates = this.spatial.queryCircle(a.x, a.z, 12.5, this.spatialScratch);
      for (const b of candidates) {
        if (b === a || b.eliminated) continue;
        const low = Math.min(a.id, b.id);
        const high = Math.max(a.id, b.id);
        const pairKey = low * 32 + high;
        if (this.collisionPairs.has(pairKey)) continue;
        this.collisionPairs.add(pairKey);

        const contact = capsuleCollision(a, b, this.collisionScratch);
        if (!contact.hit) continue;
        const nx = contact.nx;
        const nz = contact.nz;
        const separation = contact.overlap * 0.52;
        a.dynamics.x -= nx * separation;
        a.dynamics.z -= nz * separation;
        b.dynamics.x += nx * separation;
        b.dynamics.z += nz * separation;

        const relativeVx = b.dynamics.vx - a.dynamics.vx;
        const relativeVz = b.dynamics.vz - a.dynamics.vz;
        const relativeNormal = relativeVx * nx + relativeVz * nz;
        const tangential = Math.abs(relativeVx * -nz + relativeVz * nx);
        const closing = Math.abs(relativeNormal);
        const dashEnergy = Math.max(a.dynamics.arcadeBoostLateral ?? 0, b.dynamics.arcadeBoostLateral ?? 0);
        const impact = BALANCE.collision;
        const severity = clamp((closing + tangential * impact.tangentialFactor + Math.max(a.speed, b.speed) * impact.speedFactor + dashEnergy * impact.dashFactor) / impact.severityScale, impact.severityMin, impact.severityMax);

        // Always resolve velocity to prevent interpenetrating capsules. Damage is cooldown-gated.
        const impulse = Math.max(0.15, closing * 0.42 + contact.overlap * 1.4);
        a.dynamics.vx -= nx * impulse * 0.50;
        a.dynamics.vz -= nz * impulse * 0.50;
        b.dynamics.vx += nx * impulse * 0.50;
        b.dynamics.vz += nz * impulse * 0.50;

        if ((a.collisionCd ?? 0) > 0 || (b.collisionCd ?? 0) > 0) continue;

        const aMomentum = Math.max(0, a.dynamics.vx * nx + a.dynamics.vz * nz);
        const bMomentum = Math.max(0, -(b.dynamics.vx * nx + b.dynamics.vz * nz));
        const attacker = aMomentum >= bMomentum ? a : b;
        const victim = attacker === a ? b : a;
        const victimContactX = contact.contactX - victim.x;
        const victimContactZ = contact.contactZ - victim.z;
        const cos = Math.cos(victim.dynamics.heading);
        const sin = Math.sin(victim.dynamics.heading);
        const localX = victimContactX * cos - victimContactZ * sin;
        const localZ = victimContactX * sin + victimContactZ * cos;
        const side = Math.sign(localX || 1);
        const endHit = clamp(Math.abs(localZ) / 4.7, 0, 1);
        const dash = clamp(attacker.dynamics.arcadeBoostLateral ?? 0, 0, 1);

        victim.applyHit(attacker, {
          // Un abordage doit COUCHER, pas bousculer. Le terme de dash est ce qui
          // permet au Bwa Dash de faire chavirer une yole prise de flanc.
          rollImpulse: side * severity * (0.86 + endHit * 0.46 + dash * 1.45),
          pitchImpulse: Math.sign(localZ || 1) * severity * 0.10,
          yawImpulse: side * severity * (0.10 + endHit * 0.12),
          impulseX: nx * severity * (0.22 + dash * 0.48),
          impulseZ: nz * severity * (0.22 + dash * 0.48),
          slow: severity * (0.075 + dash * 0.055),
          cohesionDamage: severity * 0.075,
          waterKg: severity > 0.65 ? severity * 4.5 : 0,
          hitLocalX: localX,
          hitLocalZ: localZ,
          structure: {
            // ⚠️ L'ABORDAGE AU DASH DOIT PERCER. Le terme `dash` domine
            // maintenant les deux autres : un contact de croisière reste une
            // bousculade (~2 %), un Bwa Dash lancé dans le flanc arrache
            // jusqu'à 18 % de coque. C'est ce qui fait du dash une arme de
            // contact et plus une esquive — et il n'est pas biaisé par
            // `weaponBias`, les abordages ne passent pas par `weaponHit`.
            hull: severity * (0.009 + endHit * 0.007 + dash * 0.075),
            bwaIndex: this.gameRng.int(0, 3),
            bwa: severity * (0.023 + dash * 0.055)
          }
        });
        attacker.dynamics.applyHit({
          rollImpulse: -side * severity * 0.13,
          cohesionDamage: severity * 0.012,
          structure: { hull: severity * 0.0025 }
        });

        if (dash > 0.12) {
          attacker.dynamics.flow = clamp(attacker.dynamics.flow + 0.10, 0, 1);
          attacker.dynamics.arcadeBoostLateral *= 0.32;
        }
        a.collisionCd = b.collisionCd = BALANCE.collision.damageCooldown;
        const water = this.waveField.sample(contact.contactX, contact.contactZ, this.time, this.waterScratch);
        this.ocean.wake.burst(contact.contactX, contact.contactZ, 2.8 + severity * 1.3, severity * 0.9);
        this.particles.emitBurst(this.visualRng, { x: contact.contactX, y: water.height + 0.35, z: contact.contactZ }, 0xd8ffff, Math.floor(10 + severity * 20), {
          speed: 1.1 + severity * 1.2,
          upward: 1.5 + severity * 0.7,
          sizeMax: 0.55
        });
        this.telemetry.track("bwa_slam", { attacker: attacker.id, victim: victim.id, severity }, this.time);
        const heavy = severity > 0.78 || dash > 0.12;
        if (heavy) {
          this.audio.playImpact?.("slam", {
            intensity: 0.56 + severity * 0.58,
            pan: this.panFor(contact.contactX)
          });
        } else {
          this.audio.play("slamLight", {
            gain: 0.30 + severity * 0.42,
            rate: 1.12 - severity * 0.24,
            pan: this.panFor(contact.contactX),
            gap: 0.05
          });
          this.audio.play("hullSlam", { gain: 0.10 + severity * 0.20, rate: 1 + severity * 0.2, gap: 0.06 });
        }
        if (attacker.isPlayer || victim.isPlayer) {
          this.showMessage(dash > 0.12 ? "💥💨 BWA DASH SLAM !" : severity > 0.78 ? "💥 BWA SLAM LOURD" : "BWA SLAM", 0.52);
          this.postFX.pulse(0.35 + severity * 0.32);
          // Le joueur encaisse : recul dans l'axe du choc, le tireur garde un tier léger.
          const toward = victim.isPlayer ? 1 : -1;
          this.impact.trigger(severity > 0.62 || dash > 0.12 ? "slam" : "graze", {
            dirX: nx * toward,
            dirZ: nz * toward,
            intensity: clamp(severity / 1.2, 0.25, 1.35),
            side: victim.isPlayer ? side : -side
          });
          this.haptic(severity > 0.75 ? "slamHeavy" : "slamLight");
        }
      }
    }
  }

  collectAlive() {
    const alive = this.aliveScratch;
    alive.length = 0;
    for (const boat of this.boats) if (!boat.eliminated) alive.push(boat);
    return alive;
  }

  dynamicsList() {
    const list = this.dynamicsScratch;
    list.length = 0;
    for (const boat of this.boats) list.push(boat.dynamics);
    return list;
  }


  fixedUpdate(dt) {
    if (this.mode !== "playing" || this.paused) return;
    // ── 3 · 2 · 1 · GO ────────────────────────────────────────────────────
    //
    // ⚠️ TOUT EST GELÉ, ET `tick` N'AVANCE PAS. Le rebours tourne avant le
    // premier pas de simulation : les yoles ne bougent pas, la brume n'avance
    // pas, le chrono ne tourne pas. Le replay est donc intact — il commence au
    // tick 1 comme avant, et la durée du rebours étant fixe, une relecture le
    // rejoue à l'identique sans qu'il ait besoin d'entrer dans le payload.
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - dt);
      return;
    }
    this.tick++;
    if (this.playback) {
      const frame = this.playback.inputAt(this.tick, this.playbackInput);
      this.input.steer = frame.steer;
      this.input.trim = frame.trim;
      this.input.aim = frame.aim;
      this.input.aimPitch = frame.aimPitch ?? 0;
      this.input.aimActive = frame.aimActive;
      this.input.aimPointerId = null;
      this.input.actions = frame.actions;
    }
    // La visée est un offset normalisé, jamais une mutation persistante du cap.
    // Elle est quantifiée AVANT le tir : le direct et le replay utilisent ainsi
    // exactement la même valeur lorsque l'arme calcule sa direction.
    this.input.aim = Math.round(clamp(Number.isFinite(this.input.aim) ? this.input.aim : 0, -1, 1) * 1000) / 1000;
    this.input.aimPitch = Math.round(clamp(Number.isFinite(this.input.aimPitch) ? this.input.aimPitch : 0, -1, 1) * 1000) / 1000;
    this.input.aimActive = Boolean(this.input.aimActive);
    // UN SEUL point d'exécution des actions du joueur, en direct comme en
    // relecture. Elles étaient exécutées au moment de l'événement DOM — donc
    // AVANT `this.tick++` — alors que la relecture les rejoue ICI, après. Le
    // projectile n'appartenait pas au même tick des deux côtés.
    //
    // Mesuré sur le code d'origine : il suffisait que le joueur ait une
    // munition de coco au bon moment pour que le replay diverge au tick 455.
    // Sans munition l'appel était un no-op et le défaut restait invisible.
    this.applyActionMask(this.input.actions);
    if (this.versusLocal) {
      // J2 emprunte la même barrière de tick : touches tenues, quantification,
      // changement de soute puis actions. Aucun handler DOM ne touche une yole.
      this.input2.steer = (this.input2.right ? 1 : 0) - (this.input2.left ? 1 : 0);
      quantizeVersusInput(this.input2);
      if (this.input2.cycleQueued) this.cycleVersusWeapon();
      this.applyVersusActionMask(this.input2.actions);
    }
    // Clavier et manette sont échantillonnés dans la boucle fixe (l'ancien
    // setInterval ajoutait jusqu'à ~16 ms de latence et tournait même en pause).
    // Une source locale n'écrit que lorsqu'elle est active ou vient de se
    // relâcher : un pilote externe qui écrit input.steer/trim directement
    // (tests, harnais) n'est jamais écrasé.
    if (!this.playback && !this.input.joy) {
      const keyboardSteer = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
      const localSteer = this.gamepadSteer ?? (keyboardSteer !== 0 ? keyboardSteer : null);
      if (localSteer != null) {
        this.input.steer = localSteer;
        this.hadLocalSteer = true;
      } else if (this.hadLocalSteer) {
        this.input.steer = 0;
        this.hadLocalSteer = false;
      }
      if (this.gamepadTrim != null) {
        this.input.trim = this.gamepadTrim;
        this.hadGamepadTrim = true;
      } else if (this.hadGamepadTrim) {
        this.input.trim = KEYBOARD_TRIM.cruise;
        this.hadGamepadTrim = false;
      } else if (this.input.trimUp || this.input.trimDown) {
        // ÉCOUTE DE VOILE — l'accélérateur du clavier, sur ↑ / ↓.
        //
        // La rampe est comptée en unités PAR SECONDE DE TEMPS FIXE : elle vit
        // ici, dans fixedUpdate, et pas dans le gestionnaire de touche. C'est ce
        // qui la rend rejouable — la valeur enregistrée dans le replay est la
        // même quel que soit le frame pacing — et identique à 30, 60 et 144 Hz.
        //
        // Border est plus lent que choquer : une voile se reprend à la main,
        // elle se relâche toute seule. C'est aussi ce qui donne son intérêt au
        // freinage : choquer est instantané, se relancer coûte du temps.
        const rate = this.input.trimUp ? KEYBOARD_TRIM.borderRate : -KEYBOARD_TRIM.easeRate;
        this.input.trim = clamp(this.input.trim + rate * dt, KEYBOARD_TRIM.min, KEYBOARD_TRIM.max);
      } else if (this.input.trim !== KEYBOARD_TRIM.cruise) {
        // Touches relâchées : retour lent à l'allure de croisière. Sans ce
        // rappel, un choquage resterait acquis et le joueur qui ne touche plus à
        // rien finirait à l'arrêt sans comprendre pourquoi.
        const delta = KEYBOARD_TRIM.cruise - this.input.trim;
        const step = KEYBOARD_TRIM.returnRate * dt;
        this.input.trim = Math.abs(delta) <= step ? KEYBOARD_TRIM.cruise : this.input.trim + Math.sign(delta) * step;
      }
    }
    // Live simulation uses the same quantized inputs stored by replays.
    this.input.steer = Math.round(clamp(this.input.steer, -1, 1) * 1000) / 1000;
    this.input.trim = Math.round(clamp(this.input.trim, 0, 1) * 1000) / 1000;
    this.time += dt;
    this.roundTime += dt;
    const player = this.boats[0];
    const playerTwo = this.versusLocal ? this.boats[1] : null;
    const simulationFrame = playerTwo
      ? versusCameraFrame(player, playerTwo, this.versusSimulationFrame || (this.versusSimulationFrame = {}))
      : null;
    const playerGap = player.z - this.stormZ;
    this.atmosphere.fixedUpdate(dt, playerGap, this.roundTime);
    // L'amplitude de houle vue par la physique se met à jour sur l'horloge fixe,
    // au même tick que la météo qui la produit.
    this.waveField.setWeather(this.atmosphere.weather.stormAmount);
    // La grille de sillage aussi : la physique l'échantillonne pour composer la
    // hauteur d'eau sous chaque point de flottaison. Recentrée sur la position
    // de SIMULATION du joueur, jamais sur celle de son mesh.
    this.ocean?.fixedUpdateWake?.(
      dt,
      this.time,
      simulationFrame?.x ?? player.dynamics.x,
      simulationFrame?.z ?? player.dynamics.z,
      this.atmosphere.weather.stormAmount
    );
    const wind = this.atmosphere.weather.windVector(this.windScratch || (this.windScratch = { x: 0, z: 0 }));
    const environment = this.environment || (this.environment = {
      time: 0,
      windX: 0,
      windZ: 0,
      stormAmount: 0,
      coastPenalty: 0,
      routeCenter: 0,
      waveScratch: {},
      pointScratch: {},
      sampleDisturbance: (x, z) => this.ocean.sampleDisturbance(x, z)
    });
    environment.time = this.time;
    environment.windX = wind.x;
    environment.windZ = wind.z;
    environment.stormAmount = this.atmosphere.weather.stormAmount;

    if (!this.playback) this.replay.recordInput(this.tick, this.input);
    for (const boat of this.boats) {
      environment.coastPenalty = this.world.coastPenalty(boat.x, boat.z);
      environment.routeCenter = routeCenter(boat.z);
      const controlledInput = boat.localControlled ? this.input2 : this.input;
      boat.fixedUpdate(dt, controlledInput, environment);
      const edge = Math.abs(boat.x - routeCenter(boat.z));
      if (!boat.eliminated && edge > CONFIG.trackHalfWidth) {
        const sign = Math.sign(boat.x - routeCenter(boat.z));
        boat.dynamics.vx -= sign * (edge - CONFIG.trackHalfWidth) * dt * 0.8;
      }
      boat.coastCollisionCd = Math.max(0, (boat.coastCollisionCd ?? 0) - dt);
      if (!boat.eliminated) {
        const coastHit = this.world.resolveBoatCollision(boat, 1.48, boat.coastScratch || (boat.coastScratch = {}));
        if (coastHit.hit && boat.coastCollisionCd <= 0) {
          boat.coastCollisionCd = 0.38;
          const side = Math.sign(coastHit.nx * Math.cos(boat.dynamics.heading) - coastHit.nz * Math.sin(boat.dynamics.heading)) || 1;
          boat.applyHit(null, {
            rollImpulse: -side * coastHit.severity * 0.62,
            yawImpulse: side * coastHit.severity * 0.16,
            slow: clamp(0.08 + coastHit.severity * 0.16, 0, 0.38),
            waterKg: coastHit.severity * 5.5,
            cohesionDamage: coastHit.severity * 0.06,
            hitLateral: -side,
            hitLongitudinal: 0.25,
            crewImpulse: coastHit.severity * 0.35,
            structure: { hull: coastHit.severity * 0.018, bwaIndex: this.gameRng.int(0, 3), bwa: coastHit.severity * 0.02 }
          });
          const surface = this.waveField.sample(coastHit.x, coastHit.z, this.time, this.waterScratch);
          this.ocean.wake.burst(coastHit.x, coastHit.z, 2.4 + coastHit.severity, 0.4 + coastHit.severity * 0.7);
          this.rings.burst(coastHit.x, surface.height, coastHit.z, 0xffcf7a, 0.7 + coastHit.severity * 0.5, 0.45);
          // ⚠️ PLUS DE `debris.spawnBurst` ICI. On est dans le PAS FIXE, et
          // `spawnBurst` puise dans `visualRng` — le même flux que la boucle de
          // rendu, dont la cadence varie. Les débris produits sont ensuite
          // intégrés par `debris.update`, donc leur position revient dans la
          // simulation : c'est exactement le mécanisme qui faisait diverger
          // 144 Hz de 60 Hz au ramassage d'une caisse. Même règle, même
          // correction. `explosions.spawn` ne prend aucun générateur.
          this.explosions?.spawn(coastHit.x, surface.height + 0.8, coastHit.z,
                                 1.8 + coastHit.severity * 1.6, 0.38);
          this.telemetry.track("reef_hit", { boat: boat.id, severity: coastHit.severity }, this.time);
          if (boat.isPlayer) this.showMessage("🪨 RÉCIF !", 0.55);
        }
      }
      if (!boat.eliminated && (boat.dynamics.capsizeTimer > 0.72 || boat.dynamics.structure.hull <= 0)) this.eliminate(boat, "CHAVIRAGE");
    }

    this.rebuildSpatialIndex();
    this.resolveCollisions(dt);
    this.rebuildSpatialIndex();
    this.updatePickups(dt);
    this.updateObstacles(dt);
    this.updateWeapons(dt);
    this.updateSlicks(dt);
    this.updateStorm(dt);
    this.updateRound(dt);
    this.worldRefreshTimer -= dt;
    if (this.worldRefreshTimer <= 0) {
      this.worldRefreshTimer = 0.20;
      const streamZ = simulationFrame?.z ?? player.z;
      this.world.update(streamZ);
      this.ocean.setIslands(this.world.nearestIslands(streamZ));
    }
    this.particles.update(dt, this.particleBudget);
    this.rings.update(dt);
    this.explosions?.update(dt);
    this.sprays?.update(dt);
    this.spellVfx?.update(dt);
    this.juiceVfx?.update(dt);
    this.debris.update(dt, this.waveField, this.time, (position) => {
      this.ocean.wake.burst(position.x, position.z, 0.85, 0.16);
    });
    this.crewFalls.update(dt, this.waveField, this.time, (position) => {
      this.ocean.wake.burst(position.x, position.z, 1.45, 0.34);
      this.particles.emitBurst(this.visualRng, position, 0xd8ffff, 8, { speed: 0.85, upward: 1.1, sizeMax: 0.32, lifeMax: 0.45 });
    });
    this.replay.checkpoint(this.tick, this.dynamicsList());

    this.stats.maxSpeed = Math.max(
      this.stats.maxSpeed,
      player.speed * 3.6,
      playerTwo ? playerTwo.speed * 3.6 : 0
    );
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.3);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.messageTimer <= 0) this.ui.message.classList.add("hidden");

    for (const buoy of this.buoys) {
      const water = this.waveField.sample(buoy.x, buoy.z, this.time, this.waterScratch);
      buoy.mesh.position.set(buoy.x, water.height, buoy.z);
      buoy.mesh.rotation.z = Math.sin(this.time * 1.7 + buoy.phase) * 0.04;
    }
    this.input.actions = 0;
    this.input2.actions = 0;
    this.input2.cycleQueued = 0;
  }


  frame(now) {
    const debutTravail = performance.now();
    this.renderer.info.reset?.();
    const raw = Math.min(0.1, (now - this.lastFrame) / 1000 || 0);
    // ⚠️ DEUX HORLOGES, ET C'EST VOULU. `raw` est plafonné à 100 ms parce que la
    // SIMULATION ne doit jamais rattraper plus de six sous-pas d'un coup. Le
    // gestionnaire de qualité, lui, recevait ce même dt plafonné : sur un
    // appareil à 200 ms/image ses minuteurs avançaient donc deux fois moins vite
    // que l'horloge, et il mettait deux fois plus longtemps à baisser la
    // qualité. Plus la machine souffrait, plus les secours tardaient. On lui
    // passe désormais l'intervalle RÉEL.
    //
    // Et le second argument est le temps de TRAVAIL de l'image précédente, pas
    // l'intervalle : derrière une vsync à 60 Hz l'intervalle vaut 16,7 ms même
    // sur une machine qui n'en utilise que trois, si bien que l'ancien seuil de
    // remontée (`< 13,2 ms`) était inatteignable et que le palier ne remontait
    // jamais. Sans cette mesure-là, démarrer bas enfermerait les bons appareils
    // en qualité basse pour toujours.
    const intervalleReel = Math.max(0, now - this.lastFrame) || 0;
    this.lastFrame = now;
    this.quality.update(intervalleReel, this.frameWorkMs ?? intervalleReel);
    this.pollGamepad();
    if (this.mode === "menu") this.time += raw * 0.65;
    // Hitstop : le gel mange du temps réel, pas du temps de simulation. La
    // séquence de ticks — donc le checksum et les replays — est inchangée.
    this.impact.update(raw);
    const simTime = this.mode === "playing" ? this.impact.consume(raw) : raw;
    if (!this.paused) {
      this.accumulator += simTime;
      while (this.accumulator >= CONFIG.fixed) {
        this.fixedUpdate(CONFIG.fixed);
        this.accumulator -= CONFIG.fixed;
      }
    }

    const player = this.boats[0];
    const playerTwo = this.versusLocal ? this.boats[1] : null;
    const sharedFrame = playerTwo
      ? versusCameraFrame(player, playerTwo, this.versusRenderFrame || (this.versusRenderFrame = {}))
      : null;
    const focus = sharedFrame
      ? (this.sharedRenderFocus || (this.sharedRenderFocus = new this.THREE.Vector3())).set(sharedFrame.x, sharedFrame.y, sharedFrame.z)
      : player.visual.root.position;
    const weather = this.atmosphere.update(raw, this.time, focus, this.stormZ);
    this.scene.fog.density = this.fogBase + weather.stormAmount * 0.0042;
    // Brouillard et brume océanique suivent la couleur d'horizon du ciel.
    //
    // ⚠️ Mais PAS à pleine valeur. C'est le brouillard, et rien d'autre, qui
    // peignait les mornes en gris pâle : éteindre TOTALEMENT les deux lumières
    // de scène ne déplace la bande d'horizon que de 1,7 % (0,4402 → 0,4329,
    // mesuré en alternance serrée, allumé/éteint/allumé/éteint). Ni les
    // couleurs de sommet ni l'éclairage n'y pouvaient quoi que ce soit — à
    // 180 m le FogExp2 remplace déjà 20 % du pixel, à 400 m les deux tiers.
    //
    // Et la couleur employée était PLUS CLAIRE QUE LE CIEL : `uHorizon`
    // (0xd8fbff) pèse 0,956 de luminance quand le ciel réellement rendu au
    // ras de l'horizon en pèse 0,784. Le lointain ne s'effaçait donc pas dans
    // le ciel, il virait au fantôme PLUS LUMINEUX que son fond — la
    // perspective aérienne à l'envers que tu voyais.
    this.scene.fog.color.copy(this.atmosphere.horizonColor).multiplyScalar(this.fogTint);
    this.ocean.uniforms.uHaze.value.copy(this.atmosphere.horizonColor);
    this.hemisphere.intensity = this.lightBase.hemisphere - weather.stormAmount * 0.86 + weather.lightning * 2.35;
    this.sun.intensity = this.lightBase.sun - weather.stormAmount * 2.75 + weather.lightning * 5.8;
    this.ocean.update(raw, this.time, focus.x, focus.z, weather.stormAmount);

    if (this.mode === "playing") {
      for (const boat of this.boats) boat.renderUpdate(this.time, raw, weather);
    } else this.updateAttract(raw);

    this.updateCamera(raw);
    this.updateDamageNumbers(raw);
    this.updateHarpoonMisses(raw);
    const postDamage = clamp((1 - player.dynamics.structure.hull) * 1.1 + player.water / 260, 0, 1);
    this.postFX.update(raw, weather.stormAmount, this.time, {
      speed: clamp(player.speed / 31, 0, 1),
      wetness: clamp(weather.rainAmount * 0.7 + player.dynamics.spray * 0.35, 0, 1),
      capsize: player.dynamics.nearCapsize * (this.settings.get("reduceFlash") ? 0.28 : 1),
      damage: postDamage * (this.settings.get("reduceFlash") ? 0.35 : 1)
    });
    this.uiClock -= raw;
    if (this.uiClock <= 0) {
      this.uiClock = 0.08;
      this.updateUI();
    }
    this.ui.damage.style.opacity = String(clamp(this.damageFlash * (this.settings.get("reduceFlash") ? 0.22 : 0.72), 0, 0.8));
    this.ui.stormVignette.style.opacity = String(clamp(weather.stormAmount * 0.62, 0, 0.74));
    this.updateSoundscape(weather);
    if (this.ui.impactFlash) this.ui.impactFlash.style.opacity = String(clamp(this.impact.flash * 0.62, 0, 0.62));
    this.cullYoles();
    this.postFX.render(this.scene, this.camera);
    const renderInfo = this.renderer.info.render;
    this.lastRenderStats = { calls: renderInfo.calls, triangles: renderInfo.triangles };
    // Ce que cette image a réellement coûté en travail, à distinguer de
    // l'intervalle qui la sépare de la suivante : c'est la marge disponible, et
    // donc la seule grandeur qui autorise à REMONTER d'un palier.
    this.frameWorkMs = performance.now() - debutTravail;
  }

  // Une yole hors champ ne se voit pas : elle n'a pas à être soumise.
  //
  // ⚠️ POURQUOI THREE.JS NE LE FAIT PAS LUI-MÊME. `yole-visual.js` pose
  // `frustumCulled = false` sur tout le rig d'équipage, et pour une bonne
  // raison : la sphère englobante d'un SkinnedMesh est calculée en espace de
  // bind, si bien qu'un équipier animé sur une coque qui bouge disparaissait
  // par intermittence. Mais la conséquence est que les quatre yoles et leurs
  // vingt-quatre équipiers partent au GPU à CHAQUE image, y compris quand ils
  // sont derrière la caméra. Mesuré : les yoles pèsent 141 des 210 draw calls,
  // et le palier LQ n'avait aucun levier dessus — 112 draw calls et 77 000
  // triangles identiques en LQ et en HQ.
  //
  // On teste donc au niveau de la COQUE, dont la sphère est juste, et on éteint
  // le groupe entier. Aucun contact avec la simulation : `visible` ne fait pas
  // avancer un bateau.
  cullYoles() {
    const THREE = this.THREE;
    // Les harnais de simulation tournent avec un THREE minimal, sans classes
    // géométriques : le culling n'y a de toute façon aucun sens puisque rien
    // n'est rasterisé. Même garde que `makeHeadKits` dans yole-visual.js.
    if (!THREE.Frustum || !THREE.Sphere) return;
    if (!this.cullFrustum) {
      this.cullFrustum = new THREE.Frustum();
      this.cullMatrix = new THREE.Matrix4();
      this.cullSphere = new THREE.Sphere(new THREE.Vector3(), 9.5);
    }
    this.camera.updateMatrixWorld();
    this.cullFrustum.setFromProjectionMatrix(
      this.cullMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    // Au-delà de cette distance un équipier mesure moins d'une vingtaine de
    // pixels : la silhouette de la coque et de la voile suffit à situer
    // l'adversaire. Seul le palier bas y renonce — c'est précisément le levier
    // qui manquait à LQ.
    const porteeEquipage = this.quality.tier === 0 ? 46 : Infinity;
    const camera = this.camera.position;
    for (const boat of this.boats) {
      const root = boat.visual?.root;
      if (!root) continue;
      // Le rayon couvre la coque, le mât et les équipiers sortis sur le bois.
      this.cullSphere.center.copy(root.position);
      root.visible = this.cullFrustum.intersectsSphere(this.cullSphere);
      if (!root.visible) continue;
      boat.visual.setCrewCulled(
        camera.distanceTo(root.position) > porteeEquipage);
    }
  }

  // Lits continus : eau selon la vitesse, Grain selon la distance, câble selon
  // la tension réelle du harpon. Aucune autorité gameplay, purement audible.
  updateSoundscape(weather) {
    if (this.audio.muted) return;
    if (this.mode !== "playing") {
      this.audio.setBed("water", 0);
      this.audio.setBed("storm", 0);
      this.audio.setBed("cable", 0);
      return;
    }
    const player = this.boats[0];
    const speed = clamp(player.speed / 30, 0, 1);
    const spray = clamp(player.dynamics.spray ?? 0, 0, 1);
    const waterMix = handlingWaterMix(player.dynamics, speed, spray);
    this.audio.setBed("water", waterMix.gain, waterMix.rate);
    const stormGap = clamp(1 - (player.z - this.stormZ) / 120, 0, 1);
    this.audio.setBed("storm", stormGap * (0.10 + weather.stormAmount * 0.34), 0.9 + stormGap * 0.25);
    let tension = 0;
    for (const grapple of this.grapples) {
      if (!grapple.active) continue;
      if (grapple.owner !== player && grapple.target !== player) continue;
      tension = Math.max(tension, clamp(grapple.tension ?? 0, 0, 1));
    }
    this.audio.setBed("cable", tension * 0.20, 0.72 + tension * 0.9);
  }


  resize() {
    const width = Math.max(320, innerWidth);
    const height = Math.max(240, innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.postFX.resize(width, height, this.qualityProfile?.pixelRatio ?? 1);
    this.ui.rotate.classList.toggle("hidden", !(height > width * 1.15 && this.mode !== "menu"));
  }

  debugState() {
    return {
      mode: this.mode,
      versusLocal: this.versusLocal,
      seed: this.seed,
      tick: this.tick,
      round: this.round,
      roundTime: this.roundTime,
      stormZ: this.stormZ,
      checksum: checksumBoats(this.dynamicsList()),
      quality: this.qualityProfile?.label,
      frameMs: this.quality.frameAverage,
      telemetry: this.telemetry.summary(),
      settings: this.settings.snapshot(),
      cameraZoom: this.cameraZoom,
      input: {
        steer: this.input.steer,
        trim: this.input.trim,
        aim: this.input.aim,
        aimPitch: this.input.aimPitch,
        aimActive: this.input.aimActive,
        aimPointerId: this.input.aimPointerId
      },
      input2: {
        steer: this.input2.steer,
        trim: this.input2.trim,
        actions: this.input2.actions
      },
      boats: this.boats.map((boat) => ({
        name: boat.name,
        x: boat.x,
        y: boat.y,
        z: boat.z,
        speed: boat.speed,
        roll: boat.roll,
        pitch: boat.pitch,
        drive: boat.drive,
        slip: boat.slip,
        grip: boat.grip,
        surf: boat.surf,
        surfing: Boolean(boat.dynamics.surfing),
        counterSteer: boat.dynamics.counterSteer,
        score: boat.score,
        eliminated: boat.eliminated,
        water: boat.water,
        crew: boat.activeCrew,
        structure: boat.dynamics.structure
      })),
      projectiles: this.waveProjectiles.filter((item) => item.active).length,
      mines: this.mines.filter((item) => item.active).length,
      grapples: this.grapples.filter((item) => item.active).length,
      juiceVfx: this.juiceVfx?.active?.reduce?.((sum, active) => sum + active, 0) ?? 0,
      wakeEnergy: this.ocean.wake.energy(),
      debris: this.debris.items.filter((item) => item.active).length,
      crewFalls: this.crewFalls.items.filter((item) => item.active).length,
      drawCalls: this.renderer.info?.render?.calls ?? 0,
      three: this.THREE.REVISION
    };
  }

  downloadTelemetry() {
    if (typeof Blob === "undefined" || !globalThis.URL?.createObjectURL) return false;
    const blob = new Blob([JSON.stringify(this.telemetry.snapshot(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `yole-bwa-brawl-telemetry-${(this.seed >>> 0).toString(16)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
}

// Composition des systèmes. L'état de Game reste partagé : ces mixins sont un
// rangement, pas une frontière — chacun pourra devenir une vraie classe.
Object.assign(Game.prototype, WeaponSystems, MatchDirector, HudSystems, InputSystems, CameraSystems, VersusSystems, PickupSystems, ObstacleSystems);
