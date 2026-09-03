import { clamp, damp, angleDelta, formatTime, TAU } from "../core/math.js";
import { RNG } from "../core/rng.js";
import { QualityManager, palierInitial } from "../core/quality.js";
import { WaveField } from "../sim/waves.js";
import {
  ReplayRecorder, ReplayPlayer, ReplayVault, downloadReplay, checksumBoats, isReplayCompatible,
  SIMULATION_VERSION, GAMEPLAY_VERSION
} from "../sim/replay.js";
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
import { normalizeCustomization } from "./customization.js";
import { GrowthSystems, seedFromUrl } from "./growth.js";
import { GhostSystems } from "./ghost.js";
import {
  FrameSampler, PlaytestJournal, PLAYTEST_DELIVERY_STATUS,
  buildPlaytestReport, deliverPlaytestReport, describeDevice
} from "./playtest-report.js";
import {
  ACTION_WAVE, ACTION_HARPOON, ACTION_MINE, ACTION_SHIFT,
  ACTION_BOOST_FORWARD, ACTION_BOOST_LATERAL, RIGS, AI_LEVELS,
  CONFIG, BALANCE, ZOOM_MIN, ZOOM_MAX, CREW_DOTS, TOUR_STAGES, TOUR_STAGE_POINTS,
  FIRST_RUN_TRAINING, advanceFirstRunTraining, createFirstRunTrainingState,
  vibrate, createBuoyVisual, resolveLoadout, STORM_RANGE, COUNTDOWN_SECONDS, COUNTDOWN_GO_SECONDS,
  ARENA_DISTANCE, ARENA_SCHOOL_SLUG, resolveArena, arenaForSeed, fleetForSeed, YOLE_LIVERIES
} from "./balance.js";


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
    // Journal de session : il survit à telemetry.clear(), appelé à chaque
    // partie, et alimente le rapport de playtest. Hors simulation, hors checksum.
    this.playtestJournal = new PlaytestJournal();
    this.telemetry.subscribe((type, payload, time) => this.playtestJournal.observe(type, payload, time));
    this.frameSampler = new FrameSampler();
    this.initGhost();
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
    this.seed = seedFromUrl(params.get("seed"), 0x0b0a2026);
    // Arène de la Combat Box : `?arena=<slug>` fixe le décor pour la session
    // (liens de défi) ; sinon le réglage, sinon la graine et la rotation.
    this.arenaParam = params.get("arena") || null;
    this.arenaRotation = 0;
    this.matchArena = null;
    // Vertical slice purement visuel. Aucun état de simulation ni replay ne
    // dépend de cette option : elle peut donc être comparée en A/B avec le même
    // seed sans changer la course.
    this.graphicStyle = params.get("da") === "gravure";
    this.initGrowth(params);
    this.gameRng = new RNG(this.seed);
    this.weatherRng = new RNG(this.seed ^ 0x09e3779b);
    this.visualRng = new RNG(this.seed ^ 0xa5a5f00d);
    // Les gerbes de caisse et de sargasses ont leurs propres flux. Elles sont
    // déclenchées dans le pas fixe mais ne doivent ni consommer le RNG gameplay,
    // ni dépendre du nombre d'images rendues entre deux événements.
    this.pickupVfxRng = new RNG(this.seed ^ 0x70c8a7e1);
    this.obstacleVfxRng = new RNG(this.seed ^ 0x5a26b94d);
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
    this.replayValidation = null;
    this.tour = null;
    this.versusLocal = false;
    this.playbackInput = { steer: 0, trim: 0.82, aim: 0, aimPitch: 0, aimActive: false, actions: 0 };
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
      aimPitch: 0,
      aimActive: false,
      aimPointerId: null,
      actions: 0
    };
    this.input2 = createVersusInput();

    this.initRenderer();
    this.initWorld();
    this.bindUI();
    this.resize();
    // Une perte de contexte peut survenir pendant l'initialisation des assets
    // GPU. Son handler a déjà stoppé la boucle : ne la réarme pas avant
    // l'événement webglcontextrestored.
    if (!this.webglContextLost) this.renderer.setAnimationLoop((now) => this.frame(now));
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
        playtestReport: () => this.buildPlaytestReport(),
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
    this.atmosphere.setGraphicStyle?.(this.graphicStyle);
    this.ocean = new OceanSystem(THREE, this.scene, this.waveField, {
      quality: 2,
      graphicStyle: this.graphicStyle
    });
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
    // La caméra de course est inclinée vers l'eau. En mode graphique, un soleil
    // à y=0.40 tombait au-dessus de son cadre et n'existait donc jamais dans la
    // composition. On le descend dans le tiers supérieur, loin du HUD central.
    const sunDirection = this.graphicStyle
      ? new THREE.Vector3(-0.10, 0.10, 0.99).normalize()
      : new THREE.Vector3(-0.30, 0.40, 0.87).normalize();
    this.ocean.uniforms.uSunDir.value.copy(sunDirection);
    this.atmosphere.uniforms.uSunDir.value.copy(sunDirection);
    this.particles = new ParticlePool(THREE, this.scene, 1700);
    this.rings = new ImpactRingPool(THREE, this.scene, 32);
    this.debris = new DebrisPool(THREE, this.scene, 72);
    // Trois yoles éliminées × huit hommes visibles = 24 corps simultanés :
    // « FIN DU CHRONO » peut les coucher dans la même frame, et les nageurs
    // restent 5,2 s. Deux places de marge évitent de recycler le premier.
    this.crewFalls = new CrewFallPool(
      THREE,
      this.scene,
      CONFIG.colors,
      26,
      this.assets
    );
    this.postFX = new PostFX(THREE, this.renderer, innerWidth, innerHeight);
    this.postFX.setGraphicStyle?.(this.graphicStyle);

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
      this.telemetry?.track?.("quality_tier", { tier, label: profile.label, manual: Boolean(this.quality?.manual) }, this.time ?? 0);
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
    this.bindWebGLContextLifecycle();
  }

  bindWebGLContextLifecycle() {
    const canvas = this.renderer?.domElement;
    if (!canvas?.addEventListener) return;

    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault?.();
      if (this.webglContextLost) return;
      this.webglContextLost = true;
      this.pausedBeforeContextLoss = this.paused;
      this.paused = true;
      this.renderer?.setAnimationLoop?.(null);
      this.ui.loading?.classList?.add("hidden");
      this.ui.fatal?.classList?.remove("hidden");
      if (this.ui.fatalText) {
        this.ui.fatalText.textContent = "Le contexte graphique a été perdu. Le jeu reprendra automatiquement s’il revient, sinon recharge la page.";
      }
      if (this.ui.retry) this.ui.retry.onclick = () => location.reload();
    });

    canvas.addEventListener("webglcontextrestored", () => {
      if (!this.webglContextLost) return;
      this.webglContextLost = false;
      this.paused = Boolean(this.pausedBeforeContextLoss);
      this.accumulator = 0;
      this.lastFrame = performance.now();
      this.ui.fatal?.classList?.add("hidden");
      this.resize();
      this.renderer?.setAnimationLoop?.((now) => this.frame(now));
    });
  }


  initWorld() {
    this.world = new WorldStreamer(this.THREE, this.scene, this.seed ^ 0x77ad, this.assets?.texture("morne") ?? null, this.assets ?? null);
    this.world.setQuality(this.quality.tier);
    this.ocean.setIslands(this.world.nearestIslands(0));
    this.boats = CONFIG.names.map((name, index) => new Boat(this, index, {
      name,
      color: CONFIG.colors[index],
      accent: CONFIG.accents[index],
      isPlayer: index === 0
    }));
    this.boats[0]?.visual?.applyCustomization?.(
      normalizeCustomization(this.settings?.snapshot?.() ?? {})
    );
    this.buoys = [];
    // Explosions texturées : uniquement si la texture est là, sinon on garde
    // les particules seules — aucune régression si l'asset manque.
    this.atmosphere.setClouds(this.assets?.texture("clouds"));
    this.atmosphere.setBackdrop(
      this.graphicStyle
        ? (this.assets?.texture("backdropGraphic") ?? this.assets?.texture("backdrop"))
        : this.assets?.texture("backdrop")
    );
    // Le panorama pilote porte déjà trois profondeurs gravées. Superposer le
    // ruban proche réaliste brouillerait précisément l'A/B que ce test mesure.
    if (!this.graphicStyle) {
      this.atmosphere.setNearBackdrop?.(this.assets?.texture("backdropNear"));
    }
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
    // La caisse est conservée, mais son arme reste en réserve jusqu'à la fin
    // des trois verbes. `grantPickup` a déjà écrit la munition : on la retire
    // immédiatement de l'autorité et on la restaurera à la révélation.
    const trainingDeferred = this.deferTrainingPickup(boat, weapon);
    // ⚠️ Deux fois moins de caisses depuis que la mine et le rhum y sont
    // passés : chaque ramassage compte le double, il doit donc s'entendre et se
    // voir. Deux anneaux concentriques, une gerbe de bois et un éclat coloré à
    // la teinte de l'arme.
    const teinte = pickup.color ?? 0xffc531;
    const water = this.waveField.sample(pickup.x, pickup.z, this.time, this.waterScratch);
    const surface = water.height + 0.04;
    this.rings.burst(pickup.x, surface, pickup.z, teinte, 3.2, 0.86);
    this.rings.burst(pickup.x, surface + 0.03, pickup.z, 0xffffff, 1.75, 0.52);
    this.rings.burst(pickup.x, surface + 0.06, pickup.z, 0x5ff4ff, 0.92, 0.38);
    this.particles.emitBurst(this.pickupVfxRng, {
      x: pickup.x,
      y: water.height + 1.0,
      z: pickup.z
    }, teinte, 32, {
      speed: 3.8, upward: 4.8, sizeMin: 0.12, sizeMax: 0.68,
      lifeMin: 0.36, lifeMax: 0.92, gravity: 5.0
    });
    this.particles.emitBurst(this.pickupVfxRng, {
      x: pickup.x,
      y: water.height + 0.82,
      z: pickup.z
    }, 0xffe9a2, 18, {
      speed: 2.4, upward: 3.6, sizeMin: 0.08, sizeMax: 0.36,
      lifeMin: 0.28, lifeMax: 0.68, gravity: 4.2
    });
    // Les planches viennent d'un RNG exclusivement visuel et dédié aux caisses :
    // elles peuvent éclater sans déplacer le flux gameplay ou celui du décor
    // météo entre 60 et 144 Hz.
    this.debris.spawnBurst(this.pickupVfxRng, {
      x: pickup.x,
      y: water.height + 0.72,
      z: pickup.z
    }, 12, {
      speed: 4.6,
      upward: 5.4,
      scale: 0.68,
      typeOffset: 0
    });
    this.explosions?.spawn(pickup.x, water.height + 1.55, pickup.z, 3.6, 0.54);
    if (!boat.isPlayer) return;
    if (trainingDeferred) {
      this.showMessage("📦 CHARGE GARDÉE EN SOUTE", 0.6);
      this.audio.play("buoy", { gain: 0.42, rate: 1.25, gap: 0.05 });
      this.impact.trigger("graze", { dirX: 0, dirZ: 1, intensity: 0.45 });
      this.haptic("pickup");
      return;
    }
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



  /**
   * L'arène d'une partie de Combat Box (Mêlée locale et manche-école
   * comprises). Priorités : relecture (payload) > lien de défi > `?arena=` >
   * réglage > manche-école (le lagon, l'arène-école) > défi du jour (la
   * graine seule : même mer pour tous) > graine + rotation de session, pour
   * que RECOMMENCER change de carte. Une étape du Tour n'a pas d'arène : sa
   * côte vient de TOUR_STAGES.
   */
  resolveMatchArena(options = {}) {
    if (options.tourStage) return null;
    if (options.replay) return resolveArena(options.replay.arena) ?? arenaForSeed(this.seed);
    const fromChallenge = resolveArena(options.arena);
    if (fromChallenge) return fromChallenge;
    const fromUrl = resolveArena(this.arenaParam);
    if (fromUrl) return fromUrl;
    const fromSettings = resolveArena(this.settings?.get?.("arena"));
    if (fromSettings) return fromSettings;
    if (this.trainingMode) return resolveArena(ARENA_SCHOOL_SLUG) ?? arenaForSeed(this.seed);
    if (options.challenge) return arenaForSeed(this.seed);
    const arena = arenaForSeed(this.seed, this.arenaRotation);
    this.arenaRotation += 1;
    return arena;
  }

  startMatch(options = {}) {
    // Tout lancement hors startTourStage quitte le mode Tour.
    if (!options.tourStage) {
      this.tour = null;
      this.stageGameplay = null;
    }
    // La première vraie mise à l'eau est une manche-école : mêmes règles et
    // même physique, mais adversaires PEYI et conseils déclenchés par les
    // actions réelles.
    const trainingReplay = Boolean(options.replay?.metadata?.firstRunTraining);
    this.trainingMode = Boolean(
      (options.training || trainingReplay)
      && !options.tourStage
      && !options.versus
    );
    this.trainingGuide = this.trainingMode
      ? createFirstRunTrainingState()
      : null;
    // Un duel ne survit qu'à une revanche explicitement lancée comme duel.
    // Jouer, Tour et Replay reviennent donc toujours au flux solo.
    this.setVersusMode(Boolean(options.versus) && !options.replay && !options.tourStage);
    this.audio.ensure();
    this.playback = options.replay ? new ReplayPlayer(options.replay) : null;
    if (options.replay) this.seed = options.replay.seed >>> 0;
    // L'ARÈNE EMPRUNTE LA MÊME ROUTE QUE LE GRÉEMENT : la côte freine et
    // repousse les yoles (coastPenalty, resolveBoatCollision) et la houle de
    // l'arène entre dans la physique — donc dans le checksum. Figée ici,
    // enregistrée dans le replay, restaurée depuis le payload en relecture.
    const arena = this.resolveMatchArena(options);
    this.matchArena = arena;
    if (this.replay) this.replay.arena = arena?.slug ?? null;
    if (!options.tourStage) this.stageGameplay = arena?.gameplay ?? null;
    // Le gréement emprunte la MEME route que la graine : enregistre dans le
    // payload, restaure a la relecture. Sans ca, le meme fichier rejoue sur une
    // machine equipee autrement donne un autre checksum — en silence.
    const rigIndex = options.replay
      ? (Number.isInteger(options.replay.rig) && options.replay.rig >= 0 && options.replay.rig < RIGS.length ? options.replay.rig : 1)
      : this.playerRig();
    this.matchRig = rigIndex;
    if (this.replay) this.replay.rig = rigIndex;
    const customization = normalizeCustomization({
      ...(options.replay?.customization ?? this.settings?.snapshot?.() ?? {}),
      rig: rigIndex
    });
    this.matchCustomization = customization;
    // ─── LA FLOTTE ────────────────────────────────────────────────────────
    // Quatre livrées distinctes tirées de la graine (`fleetForSeed`), donc
    // identiques en relecture et stables d'une étape à l'autre d'un Tour. Ici
    // et pas dans `initWorld` : une relecture restaure `this.seed` juste
    // au-dessus, et la flotte doit suivre cette graine-là.
    const fleet = fleetForSeed(this.seed, this.boats?.length ?? 0);
    for (let index = 0; index < (this.boats?.length ?? 0); index++) {
      const livery = YOLE_LIVERIES[fleet[index]] ?? YOLE_LIVERIES[0];
      const boat = this.boats[index];
      boat.visual?.applyLivery?.(livery);
      // Le HUD, le fil des takedowns et le hub du Tour lisent ces trois
      // champs à chaque image : la pastille de couleur doit désigner la yole
      // qu'on voit sur l'eau, et son nom être celui de sa livrée.
      boat.name = livery.name;
      boat.color = livery.hull;
      boat.accent = livery.accent;
    }
    this.matchFleet = fleet;
    this.boats?.[0]?.visual?.applyCustomization?.(customization);
    if (this.replay) this.replay.customization = customization;
    // Le niveau d'IA emprunte exactement la même route que le gréement : figé
    // ici pour toute la partie, restauré depuis le payload en relecture.
    const aiLevel = options.replay
      ? (AI_LEVELS.some((level) => level.key === options.replay.aiLevel) ? options.replay.aiLevel : "tour")
      : this.trainingMode ? "peyi" : this.playerAiLevel();
    this.matchAiLevel = aiLevel;
    if (this.replay) this.replay.aiLevel = aiLevel;
    // ⚠️ MÊME ROUTE QUE LE GRÉEMENT ET LE NIVEAU D'IA. La soute change les
    // munitions de départ, donc les décisions, donc le checksum : la lire
    // depuis les réglages en relecture ferait diverger un replay dès qu'on
    // change d'équipement entre deux parties. Elle est figée ici et restaurée
    // depuis le payload.
    const loadout = resolveLoadout(
      options.replay
        ? options.replay.loadout
        : this.trainingMode
          ? FIRST_RUN_TRAINING.playerLoadout
          : this.settings.get("loadout")
    );
    this.matchLoadout = loadout;
    if (this.replay) this.replay.loadout = loadout;
    this.stats = { takedowns: 0, perfects: 0, maxSpeed: 0, boosts: 0, slingshots: 0 };
    this.telemetry.clear();
    this.telemetry.track("match_start", {
      seed: this.seed,
      arena: arena?.slug ?? null,
      replay: Boolean(options.replay),
      tour: Boolean(options.tourStage),
      versus: Boolean(this.versusLocal),
      training: Boolean(this.trainingMode),
      challenge: Boolean(options.challenge),
      daily: Boolean(options.challenge && (this.activeChallenge?.daily || this.tour?.challengeDaily))
    }, 0);
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
    this.pickupVfxRng = new RNG(this.seed ^ 0x70c8a7e1);
    this.obstacleVfxRng = new RNG(this.seed ^ 0x5a26b94d);
    this.audio.rng = new RNG(this.seed ^ 0x51f15e);
    this.impact.rng = new RNG(this.seed ^ 0x1d9a7c3);
    this.impact.reset();
    this.uiFeedback = null;
    this.lastImpactPresentationSerial = 0;
    this.cameraBase = null;
    this.cameraRollBase = null;
    this.cameraFovBase = null;
    this.atmosphere.resetRng(this.weatherRng, this.visualRng);
    // Étape du Tour : configureTourStageEnvironment pose la côte juste après.
    // Combat Box, Mêlée locale, manche-école : l'arène pose la sienne ici.
    if (arena) {
      this.world.setStage(this.seed ^ 0x77ad, arena.palette, arena.environment, ARENA_DISTANCE);
      this.ocean.setStagePalette(arena.environment?.water);
    } else {
      this.world.setStage(this.seed ^ 0x77ad, null, null);
      this.ocean.setStagePalette();
    }
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
    if (this.trainingMode && !this.playback) {
      this.replay.metadata.firstRunTraining = true;
    }
    this.replayValidation = null;
    this.playbackInput.steer = 0;
    this.playbackInput.trim = 0.82;
    this.playbackInput.aim = 0;
    this.playbackInput.aimPitch = 0;
    this.playbackInput.aimActive = false;
    this.playbackInput.actions = 0;
    // Un seul reset couvre clavier, tactile, visée verticale et états dérivés
    // de manette. La copie manuelle précédente oubliait notamment aimPitch,
    // trimUp/trimDown, lookBack et les drapeaux hadGamepad*.
    this.clearLiveInput();
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
    // Le fantôme se décide ici : graine, mode et étape sont connus, la
    // première manche pas encore lancée.
    this.armGhost({ tourStage: options.tourStage ? (this.tour?.stage ?? null) : null });
    this.resetRound(false);
    if (this.trainingMode) {
      this.enforceTrainingBasics();
      this.setTrainingAdvancedVisibility(false);
    } else {
      this.setTrainingAdvancedVisibility(true);
    }
    if (this.ui.replay) this.ui.replay.disabled = this.versusLocal;
    if (this.ui.downloadReplay) this.ui.downloadReplay.disabled = this.versusLocal;
    if (this.ui.replayStatus && this.versusLocal) {
      this.ui.replayStatus.textContent = "Replay désactivé en Mêlée locale · 2 flux humains à 60 Hz";
    }
    this.showMessage(
      this.playback
        ? "REPLAY · MÊME MER, MÊME SEED"
        : this.versusLocal
          ? "MÊLÉE LOCALE · J1 + J2 CONTRE 2 RIVAUX"
          : "TAKEDOWN +1 · DERNIER DEBOUT +2 · PREMIER À 5",
      this.versusLocal ? 1.35 : 2.15
    );

    // Chaque manche repart sur un 3 · 2 · 1 · GO.
    this.countdown = COUNTDOWN_SECONDS + COUNTDOWN_GO_SECONDS;
    // La simulation est gelée pendant le 3-2-1 : c'est le moment de compiler
    // ce que le coup d'envoi paierait sinon en gel.
    this.warmUpShaders();
    // ⚠️ Le transitoire de compilation des shaders recommence à chaque manche :
    // on redonne au gestionnaire de qualité sa période de grâce, sinon il juge
    // la machine sur des images bloquées par la compilation. Voir
    // `src/core/quality.js` et la passe 45 du CHANGELOG.
    this.quality?.resetWarmup?.();
  }

  setTrainingAdvancedVisibility(visible = true) {
    // La visibilité métier de la caisse, du réticule et des jauges appartient au
    // HUD. Ici on ne pose qu'un état de progression : le CSS peut retirer les
    // commandes avancées sans effacer un `.hidden` légitime, puis le HUD reprend
    // exactement la main au déblocage.
    this.ui?.hud?.classList?.toggle?.("training-advanced-locked", !visible);
    this.ui?.hud?.setAttribute?.("data-training-advanced", visible ? "unlocked" : "locked");
    return visible;
  }

  snapshotTrainingArsenal(boat) {
    return {
      loadout: [...(boat?.loadout ?? [])],
      activeWeapon: boat?.activeWeapon ?? "wave",
      ammo: Object.fromEntries(
        Object.entries(boat?.ammo ?? {}).map(([key, value]) => [key, value])
      )
    };
  }

  enforceTrainingBasics() {
    const guide = this.trainingGuide;
    if (!this.trainingMode || !guide || guide.advancedUnlocked) return false;
    if (guide.lockedRound !== this.round) {
      guide.lockedRound = this.round;
      guide.arsenals = this.boats.map((boat) => this.snapshotTrainingArsenal(boat));
      guide.deferredPickups = this.boats.map(() => null);
    }
    for (const boat of this.boats) {
      boat.loadout = FIRST_RUN_TRAINING.visibleLoadout;
      boat.activeWeapon = "wave";
      for (const key of Object.keys(boat.ammo ?? {})) {
        boat.ammo[key] = key === "wave" ? Infinity : 0;
      }
    }
    return true;
  }

  deferTrainingPickup(boat, weapon) {
    const guide = this.trainingGuide;
    if (
      !this.trainingMode
      || !guide
      || guide.advancedUnlocked
      || !boat
      || weapon === "wave"
    ) return false;
    const amount = Number.isFinite(boat.ammo?.[weapon])
      ? Math.max(1, boat.ammo[weapon])
      : 1;
    guide.deferredPickups[boat.id] = { weapon, amount };
    for (const key of Object.keys(boat.ammo ?? {})) {
      if (key !== "wave" && Number.isFinite(boat.ammo[key])) boat.ammo[key] = 0;
    }
    boat.activeWeapon = "wave";
    return true;
  }

  revealTrainingArsenal(reason = "completed") {
    const guide = this.trainingGuide;
    if (!this.trainingMode || !guide || guide.arsenalRestored) return false;
    guide.advancedUnlocked = true;
    guide.unlockReason ||= reason;
    guide.arsenalRestored = true;
    for (const boat of this.boats) {
      const snapshot = guide.arsenals[boat.id] ?? this.snapshotTrainingArsenal(boat);
      boat.loadout = [...snapshot.loadout];
      for (const key of Object.keys(boat.ammo ?? {})) {
        boat.ammo[key] = snapshot.ammo[key] ?? 0;
      }
      const deferred = guide.deferredPickups[boat.id];
      if (deferred && Number.isFinite(boat.ammo[deferred.weapon])) {
        boat.ammo[deferred.weapon] = Math.max(boat.ammo[deferred.weapon], deferred.amount);
      }
      boat.activeWeapon = (boat.ammo.wave ?? 0) > 0
        ? "wave"
        : snapshot.activeWeapon;
      for (const key of Object.keys(boat.cooldowns ?? {})) {
        if (key === "wave" || (boat.ammo[key] ?? 0) <= 0) continue;
        // Révélation phasée : aucune salve de trois Harpons au tick précis où
        // le joueur termine son Coco. Valeur dérivée de l'id, sans RNG.
        boat.cooldowns[key] = Math.max(boat.cooldowns[key] ?? 0, 0.8 + boat.id * 0.22);
      }
    }
    this.setTrainingAdvancedVisibility(true);
    this.showMessage(
      reason === "completed"
        ? "CAPITAINE PRÊT · HARPON + TURBO OUVERTS · DERNIER DEBOUT +2"
        : "ARSENAL LIBRE · CONTINUE D’APPRENDRE EN JOUANT",
      2.6
    );
    this.telemetry.track(
      "first_run_training_unlock",
      { tick: this.tick, reason, elapsed: guide.elapsed },
      this.time
    );
    if (reason === "completed") {
      this.telemetry.track("first_run_training_complete", { tick: this.tick }, this.time);
    }
    // On ne consomme l'initiation qu'après réussite (ou filet temporel). Si le
    // joueur retourne au port avant, la prochaine mise à l'eau reste guidée.
    this.settings?.set?.("trainingCompleted", true);
    this.settings?.set?.("onboardingSeen", true);
    return true;
  }

  updateTrainingGuide(dt) {
    const guide = this.trainingGuide;
    const player = this.boats?.[0];
    if (!this.trainingMode || !guide || !player || guide.arsenalRestored) return;

    if (!guide.announced) {
      guide.announced = true;
      this.showMessage("1/3 · DIRIGE · CHOISIS TA LIGNE", 1.8);
    }

    const allowedActions = this.allowedTrainingActionMask?.(this.input.actions)
      ?? (this.input.actions & FIRST_RUN_TRAINING.basicActionMask);
    const transition = advanceFirstRunTraining(guide, {
      dt,
      steer: this.input.steer,
      actions: allowedActions,
      roll: player.roll,
      shiftKind: player.dynamics?.shiftKind ?? 0
    });

    if (transition.event === "steer_complete") {
      this.showMessage("2/3 · CONTRE-GÎTE QUAND LA YOLE PENCHE", 2.2);
    } else if (transition.event === "shift_early") {
      this.showMessage("LAISSE-LA PENCHER · PUIS CONTRE-GÎTE", 1.7);
    } else if (transition.event === "shift_complete") {
      this.showMessage("3/3 · COCO BOUM · TIRE POUR DÉSÉQUILIBRER", 2.3);
    } else if (transition.event === "completed" || transition.event === "timeout") {
      this.revealTrainingArsenal(transition.event);
    }
  }

  startReplay(replay) {
    if (!isReplayCompatible(replay)) {
      if (this.ui.replayStatus) this.ui.replayStatus.textContent = "Replay incompatible · simulation ou équilibrage mis à jour";
      return false;
    }
    const tourStage = replay.metadata?.tourStage;
    if (Number.isInteger(tourStage) && tourStage >= 0 && tourStage < TOUR_STAGES.length) {
      const tourPoints = Array.from(
        { length: this.boats.length },
        (_, index) => Math.max(0, Math.trunc(Number(replay.metadata?.tourPoints?.[index]) || 0))
      );
      this.tour = {
        ...this.freshTour(),
        stage: tourStage,
        baseSeed: replay.seed >>> 0,
        points: tourPoints,
        finishOrder: []
      };
      this.stageGameplay = TOUR_STAGES[tourStage]?.gameplay ?? null;
      this.startMatch({ replay, tourStage: true });
      this.configureTourStageEnvironment({ playback: true });
    } else {
      this.startMatch({ replay });
    }
    this.telemetry.track("replay_started", {
      seed: replay.seed >>> 0,
      tourStage: Number.isInteger(tourStage) ? tourStage : -1
    }, 0);
    this.latestReplay = replay;
    return true;
  }

  completeReplayPlayback() {
    const replay = this.playback?.replay;
    if (!replay || this.mode !== "playing") return false;
    this.mode = "ended";
    this.paused = false;
    this.clearLiveInput();
    this.music?.setScene?.(null);
    this.ui.hud?.classList?.add?.("hidden");
    this.ui.end?.classList?.remove?.("hidden");
    if (this.ui.endIcon) {
      this.ui.endIcon.textContent = "";
      if (this.ui.endIcon.dataset) this.ui.endIcon.dataset.result = "verified";
    }
    if (this.ui.endTitle) this.ui.endTitle.textContent = "REPLAY VALIDÉ";
    if (this.ui.endCopy) {
      const stage = replay.metadata?.stage;
      this.ui.endCopy.textContent = stage
        ? `${stage} relue sans divergence · checksum ${replay.finalChecksum}`
        : `Partie relue sans divergence · checksum ${replay.finalChecksum}`;
    }
    if (this.ui.statTakedowns) this.ui.statTakedowns.textContent = replay.finalTick;
    if (this.ui.statPerfects) this.ui.statPerfects.textContent = replay.inputs.length;
    if (this.ui.statSpeed) this.ui.statSpeed.textContent = replay.finalChecksum;
    if (this.ui.statTakedownsLabel) this.ui.statTakedownsLabel.textContent = "TICKS";
    if (this.ui.statPerfectsLabel) this.ui.statPerfectsLabel.textContent = "TRAMES";
    if (this.ui.statSpeedLabel) this.ui.statSpeedLabel.textContent = "CHECKSUM";
    if (this.ui.rematch) this.ui.rematch.textContent = "▶ REVOIR LE REPLAY";
    if (this.ui.replay) this.ui.replay.disabled = true;
    if (this.ui.downloadReplay) this.ui.downloadReplay.disabled = false;
    return true;
  }


  onPerfectShift(boat, precision) {
    if (boat.isPlayer) {
      this.stats.perfects++;
      this.showMessage(precision > 0.65 ? "CONTRE-GÎTE PARFAITE" : "RATTRAPAGE", 0.62);
      // Le bouton donne un petit clic immédiat ; le choc, le grave, la caméra
      // et la gerbe attendent CREW_LOADED, quand les corps ont réellement pris
      // charge sur les bwa. C'est ce retard court qui donne du poids au geste.
      this.postFX.pulse(0.06 + precision * 0.05);
      this.cutGrapplesFor(boat, precision);
      this.audio.play("bwaShift", { gain: 0.11 + precision * 0.07, rate: 1.18 + precision * 0.08, gap: 0.025 });
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
      }, side, {
        color: boat.color,
        accent: boat.accent,
        boatId: boat.id,
        crewIndex: Math.max(0, boat.activeCrew + index)
      });
    }
    const nearby = this.proximity(boat.x, boat.z, 54);
    if (nearby > 0.02) {
      this.audio.play("crewYelp", {
        gain: 0.14 + nearby * 0.24,
        rate: 0.88 + (boat.id % 4) * 0.07,
        pan: this.panFor(boat.x),
        gap: 0.045
      });
      this.audio.play("splash", {
        gain: 0.10 + nearby * 0.19,
        rate: 0.92 + (boat.id % 3) * 0.08,
        pan: this.panFor(boat.x),
        gap: 0.055,
        delay: 0.13
      });
      if (payload.fromWeapon) {
        this.audio.play("sailSnap", {
          gain: 0.08 + nearby * 0.14,
          rate: 0.82 + Math.abs(payload.rollImpulse ?? 0) * 0.12,
          pan: this.panFor(boat.x),
          gap: 0.05,
          delay: 0.025
        });
      }
    }
    this.telemetry.track("crew_lost", { boat: boat.id, count, source: boat.lastAggressor?.id ?? -1 }, this.time);
    if (boat.isPlayer) {
      this.showMessage(
        boat.activeCrew > 0
          ? `🤣 YOLEUR À L’EAU · ${boat.activeCrew} À BORD`
          : "🤣 PLUS PERSONNE SUR LES BWA !",
        0.78
      );
    }
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
    if (event.mask & YoleEventMask.CREW_LOADED) {
      const precision = clamp(event.shiftCatch ?? 0, 0, 1);
      const isCriticalCounterHeel = event.shiftKind === 2;
      const side = Math.sign(event.shiftSide || boat.dynamics.crewTarget || 1);
      const forward = boat.forward(this.counterHeelForwardScratch || (this.counterHeelForwardScratch = { x: 0, z: 0 }));
      const loadX = boat.x + forward.z * side * (1.55 + precision * 0.55);
      const loadZ = boat.z - forward.x * side * (1.55 + precision * 0.55);
      const water = this.waveField.sample(loadX, loadZ, this.time, this.waterScratch);

      // Le bwa se charge au-dessus de l'eau, tandis que la coque répond par une
      // nappe d'écume sur le bord opposé. Deux points d'effet racontent donc la
      // mécanique au lieu d'un flash magique centré sur le bateau.
      this.particles.emitBurst(
        this.visualRng,
        { x: loadX, y: water.height + 0.20, z: loadZ },
        0xe9ffff,
        Math.floor((9 + precision * 9) * this.particleBudget),
        {
          speed: 0.75 + precision * 0.55,
          upward: 0.85 + precision * 0.45,
          lifeMin: 0.18,
          lifeMax: 0.48,
          sizeMin: 0.12,
          sizeMax: 0.38,
          gravity: 5.2
        }
      );
      this.ocean.wake.burst(loadX, loadZ, 1.45 + precision * 0.85, 0.28 + precision * 0.42);
      this.rings.burst(loadX, water.height + 0.03, loadZ, 0xcffcff, 0.42 + precision * 0.30, 0.34);

      if (isCriticalCounterHeel && precision > 0.65) {
        this.juiceVfx?.spawn(
          boat.x,
          water.height + 1.35,
          boat.z,
          JUICE_VFX.PERFECT_COUNTERHEEL,
          4.2 + precision * 1.15,
          0.56,
          { intensity: this.settings.get("reduceFlash") ? 0.28 : 0.72, flipX: side < 0 }
        );
      }

      if (boat.isPlayer) {
        this.shake += 0.07 + precision * 0.10;
        this.postFX.pulse(0.13 + precision * 0.13);
        if (isCriticalCounterHeel) this.haptic("perfectShift");
        this.audio.play("bwaShift", {
          gain: 0.28 + precision * 0.18,
          rate: 0.78 + precision * 0.10,
          gap: 0.08
        });
        this.impact.trigger("graze", {
          dirX: forward.z * side,
          dirZ: -forward.x * side,
          intensity: 0.42 + precision * 0.48
        });
        this.telemetry.track("bwa_loaded", { precision, side, kind: event.shiftKind }, this.time);
      }
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

  validateReplayState() {
    if (!this.playback) return null;
    const result = this.playback.validateState(
      this.tick,
      this.dynamicsList(),
      { ended: this.mode !== "playing" }
    );
    this.replayValidation = result;
    if (!result?.checked) return result;

    if (!result.ok) {
      const error = result.error ?? {};
      const expected = error.expected ?? `tick ${error.expectedTick ?? "?"}`;
      const actual = error.actual ?? `tick ${error.tick ?? this.tick}`;
      const detail = `${error.kind ?? "checksum"} · attendu ${expected} · obtenu ${actual}`;
      console.error(`[replay] divergence au tick ${this.tick}: ${detail}`);
      if (this.mode === "playing") this.paused = true;
      if (this.ui.replayStatus) this.ui.replayStatus.textContent = `Replay divergent · ${detail}`;
      this.showMessage("REPLAY DIVERGENT · LECTURE ARRÊTÉE", 4);
      return result;
    }

    if (result.complete && this.ui.replayStatus) {
      this.ui.replayStatus.textContent = `Replay validé · checksum ${this.playback.replay.finalChecksum}`;
    }
    if (result.complete && this.mode === "playing") this.completeReplayPlayback();
    return result;
  }


  fixedUpdate(dt) {
    if (this.mode !== "playing" || this.paused) return;
    // Autorité AVANT le rebours et AVANT applyPendingPlayerActions : ni une
    // touche maintenue pendant le 3-2-1, ni une action injectée par manette ne
    // peut faire passer Harpon/Turbo avant leur révélation.
    if (this.trainingMode && !this.trainingGuide?.advancedUnlocked) {
      this.enforceTrainingBasics();
    }
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
    this.applyPendingPlayerActions();
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
    this.updateTrainingGuide(dt);
    this.time += dt;
    this.roundTime += dt;
    const player = this.boats[0];
    const playerTwo = this.versusLocal ? this.boats[1] : null;
    const simulationFrame = playerTwo
      ? versusCameraFrame(player, playerTwo, this.versusSimulationFrame || (this.versusSimulationFrame = {}))
      : null;
    let simulationFocusBoat = player;
    if (!playerTwo && player.eliminated) {
      let liveFocus = null;
      for (const candidate of this.boats) {
        if (
          !candidate.eliminated
          && (!liveFocus || candidate.z > liveFocus.z)
        ) {
          liveFocus = candidate;
        }
      }
      simulationFocusBoat = liveFocus || player;
    }
    const playerGap = player.z - this.stormZ;
    this.atmosphere.fixedUpdate(dt, playerGap, this.roundTime);
    // L'amplitude de houle vue par la physique se met à jour sur l'horloge fixe,
    // au même tick que la météo qui la produit.
    this.waveField.setWeather(this.atmosphere.weather.stormAmount, this.stageGameplay);
    // La grille de sillage aussi : la physique l'échantillonne pour composer la
    // hauteur d'eau sous chaque point de flottaison. Recentrée sur la position
    // de SIMULATION du joueur, jamais sur celle de son mesh.
    this.ocean?.fixedUpdateWake?.(
      dt,
      this.time,
      simulationFrame?.x ?? simulationFocusBoat.dynamics.x,
      simulationFrame?.z ?? simulationFocusBoat.dynamics.z,
      this.atmosphere.weather.stormAmount
    );
    const wind = this.atmosphere.weather.windVector(this.windScratch || (this.windScratch = { x: 0, z: 0 }));
    const stage = this.stageGameplay;
    if (stage) {
      const angle = Number(stage.windAngle) || 0;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const originalX = wind.x;
      const originalZ = wind.z;
      const gust = 1 + Math.sin(
        this.time * (Number(stage.gustFrequency) || 0) * TAU
        + (this.seed & 255) * 0.017
      ) * (Number(stage.gustStrength) || 0);
      const scale = (Number(stage.windScale) || 1) * gust;
      wind.x = (originalX * cosine - originalZ * sine) * scale;
      wind.z = (originalX * sine + originalZ * cosine) * scale;
    }
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

    if (!this.playback) this.replay.recordInput(this.tick, this.controlledInputFor(player));
    for (const boat of this.boats) {
      environment.coastPenalty = this.world.coastPenalty(boat.x, boat.z);
      environment.routeCenter = routeCenter(boat.z);
      const controlledInput = boat.localControlled ? this.input2 : this.controlledInputFor(boat);
      boat.fixedUpdate(dt, controlledInput, environment);
      const edge = Math.abs(boat.x - routeCenter(boat.z));
      const trackHalfWidth = this.stageGameplay?.trackHalfWidth ?? CONFIG.trackHalfWidth;
      if (!boat.eliminated && edge > trackHalfWidth) {
        const sign = Math.sign(boat.x - routeCenter(boat.z));
        boat.dynamics.vx -= sign * (edge - trackHalfWidth) * dt * 0.8;
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
    // Signature juste après le dernier système autoritaire du tick. endMatch()
    // fixe finalTick/finalChecksum depuis updateRound ; la relecture les compare
    // donc ici, au même tick et avant tout streamer ou VFX.
    if (this.playback) this.validateReplayState();
    else this.replay.checkpoint(this.tick, this.dynamicsList());
    // Trace fantôme : lecture seule de la pose du joueur, à 20 Hz. Rien n'est
    // écrit dans la simulation, le checksum ne bouge pas.
    if (!this.playback) this.replay.recordGhostSample(this.tick, player.dynamics);
    this.worldRefreshTimer -= dt;
    if (this.worldRefreshTimer <= 0) {
      this.worldRefreshTimer = 0.20;
      const streamZ = simulationFrame?.z ?? simulationFocusBoat.z;
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
      // Les débris sont semés par visualRng : leur trajectoire dépend donc du
      // rendu et ne doit jamais écrire dans la WakeGrid lue par la physique.
      this.rings?.burst?.(position.x, position.y, position.z, 0xd8ffff, 0.42, 0.34);
    });
    this.crewFalls.update(dt, this.waveField, this.time, (position) => {
      // Même frontière d'autorité pour les équipiers projetés : anneau et
      // particules visibles, aucune perturbation du champ de simulation.
      this.rings?.burst?.(position.x, position.y, position.z, 0xd8ffff, 0.68, 0.48);
      this.particles.emitBurst(this.visualRng, position, 0xd8ffff, 8, { speed: 0.85, upward: 1.1, sizeMax: 0.32, lifeMax: 0.45 });
    });

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
    if (this.webglContextLost) return;
    // Menus, atelier, pause et résultats n'ont aucun bénéfice ludique à
    // rasteriser à 60/120 Hz. Les plafonner à 30 FPS réduit immédiatement la
    // chauffe et la batterie sans toucher à la simulation d'une course.
    const outsideLiveRace = this.mode !== "playing" || this.paused;
    const idleFrameInterval = 1000 / 30;
    if (
      outsideLiveRace
      && Number.isFinite(this.lastPresentedFrame)
      && now - this.lastPresentedFrame < idleFrameInterval - 0.75
    ) return;
    this.lastPresentedFrame = now;
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
    if (!outsideLiveRace) {
      this.quality.update(intervalleReel, this.frameWorkMs ?? intervalleReel);
      this.frameSampler?.add(intervalleReel, this.frameWorkMs ?? intervalleReel);
    }
    this.pollGamepad();
    if (this.mode === "menu") this.time += raw * 0.65;
    // Hitstop : le gel mange du temps réel, pas du temps de simulation. La
    // séquence de ticks — donc le checksum et les replays — est inchangée.
    this.impact.update(raw);
    let simTime = this.mode === "playing" ? this.impact.consume(raw) : raw;
    if (
      this.spectatorFastForward
      && this.boats?.[0]?.eliminated
      && !this.playback
      && !this.versusLocal
    ) {
      simTime = Math.min(0.1, simTime * 4);
    }
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
    let renderFocusBoat = player;
    if (!playerTwo && player.eliminated && (this.deathCamTimer ?? 0) <= 0) {
      let liveFocus = null;
      for (const candidate of this.boats) {
        if (!candidate.eliminated && (!liveFocus || candidate.z > liveFocus.z)) liveFocus = candidate;
      }
      renderFocusBoat = liveFocus || player;
    }
    const focus = sharedFrame
      ? (this.sharedRenderFocus || (this.sharedRenderFocus = new this.THREE.Vector3())).set(sharedFrame.x, sharedFrame.y, sharedFrame.z)
      : renderFocusBoat.visual.root.position;
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
    this.ocean.update(
      raw,
      this.time,
      focus.x,
      focus.z,
      weather.stormAmount,
      this.environment?.windX,
      this.environment?.windZ
    );
    if (this.mode === "playing") {
      for (const boat of this.boats) boat.renderUpdate(this.time, raw, weather);
      this.updateGhostRender();
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
    if (this.ui.impactFlash) {
      const overlay = this.ui.impactFlash;
      overlay.style.opacity = String(clamp(this.impact.flash * 0.62, 0, 0.62));
      if (this.lastImpactPresentationSerial !== this.impact.serial) {
        this.lastImpactPresentationSerial = this.impact.serial;
        if (overlay.dataset) overlay.dataset.tier = this.impact.lastTier ?? "graze";
        overlay.style.setProperty?.(
          "--impact-x",
          `${50 + clamp(this.impact.aftershockX, -1, 1) * 18}%`
        );
        overlay.style.setProperty?.(
          "--impact-y",
          `${45 - clamp(this.impact.aftershockZ, -1, 1) * 10}%`
        );
        overlay.style.setProperty?.(
          "--impact-scale",
          String(clamp(0.82 + this.impact.lastIntensity * 0.28, 0.82, 1.25))
        );
        overlay.classList?.remove?.("impact-punch");
        // Un seul reflow par impact, jamais dans le chemin ordinaire : il
        // relance le cartouche graphique même si deux armes identiques frappent.
        void overlay.offsetWidth;
        overlay.classList?.add?.("impact-punch");
      }
    }
    this.ui.hud?.classList?.toggle?.("hud-impact", this.impact.aftershock > 0.035);
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
    // Sept silhouettes par yole (six dresseurs + patron) restent
    // abordables près de l'action, mais 32 squelettes complets n'apportent rien
    // sur un adversaire de quelques pixels. LQ coupe tôt, MQ garde les équipages
    // de combat proches, HQ conserve toute la flotte.
    const porteeEquipage = this.quality.tier === 0
      ? 46
      : this.quality.tier === 1
        ? 92
        : Infinity;
    const camera = this.camera.position;
    for (const boat of this.boats) {
      const root = boat.visual?.root;
      if (!root) continue;
      // J1 est le repère corporel du joueur : sa coque, sa gîte et ses yoleurs
      // ne doivent jamais disparaître à cause d'une imprécision de frustum au
      // bord inférieur du cadre. Une seule yole toujours soumise coûte peu ;
      // le culling reste actif sur les trois adversaires.
      if (boat === this.boats[0]) {
        root.visible = true;
        boat.visual.setCrewDetail?.(2);
      } else {
        // Le rayon couvre la coque, le mât et les équipiers sortis sur le bois.
        this.cullSphere.center.copy(root.position);
        root.visible = this.cullFrustum.intersectsSphere(this.cullSphere);
      }
      if (!root.visible) continue;
      const crewDetail = camera.distanceTo(root.position) > porteeEquipage
        ? 0
        : (this.qualityProfile?.rivalCrewDetail ?? 2);
      if (boat.visual.setCrewDetail) boat.visual.setCrewDetail(crewDetail);
      else boat.visual.setCrewCulled(crewDetail === 0);
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
      this.audio.setBed("sail", 0);
      this.audio.setBed("wood", 0);
      this.audio.setBed("sargasse", 0);
      return;
    }
    const player = this.boats[0];
    const speed = clamp(player.speed / 30, 0, 1);
    const spray = clamp(player.dynamics.spray ?? 0, 0, 1);
    const waterMix = handlingWaterMix(player.dynamics, speed, spray);
    this.audio.setBed("water", waterMix.gain * 0.88, waterMix.rate, 0.45 + speed * 0.75);
    const stormGap = clamp(1 - (player.z - this.stormZ) / STORM_RANGE.secousse, 0, 1);
    this.audio.setBed(
      "storm",
      stormGap * (0.08 + weather.stormAmount * 0.31),
      0.9 + stormGap * 0.25,
      0.35 + weather.stormAmount * 0.55
    );
    let tension = 0;
    for (const grapple of this.grapples) {
      if (!grapple.active) continue;
      if (grapple.owner !== player && grapple.target !== player) continue;
      tension = Math.max(tension, clamp(grapple.tension ?? 0, 0, 1));
    }
    this.audio.setBed("cable", tension * 0.18, 0.72 + tension * 0.9, 0.45 + tension * 0.70);

    // Signature de la yole : la toile répond à la poussée, le bois à la charge
    // latérale et aux dégâts. Ces couches suivent la physique au lieu d'être un
    // simple bruit de bateau joué en permanence.
    const drive = clamp(player.drive ?? 0, 0, 1);
    const flow = clamp(player.flow ?? 0, 0, 1);
    const rollLoad = clamp(
      Math.abs(player.roll) / 0.95
      + Math.abs(player.dynamics.rollVel ?? 0) * 0.18
      + Math.abs(player.dynamics.crewShift ?? 0) * 0.22,
      0,
      1.35
    );
    const damage = clamp(
      (1 - player.dynamics.structure.hull) * 0.72
      + (1 - player.dynamics.structure.mast) * 0.55
      + (1 - player.dynamics.structure.sail) * 0.40,
      0,
      1
    );
    const sailGain = clamp(
      speed * 0.045 + drive * 0.072 + Math.max(0, 0.72 - flow) * speed * 0.065,
      0,
      0.17
    );
    this.audio.setBed(
      "sail",
      sailGain,
      0.72 + speed * 0.42 + drive * 0.20,
      0.45 + drive * 0.72
    );
    this.audio.setBed(
      "wood",
      clamp(rollLoad * 0.090 + damage * 0.080, 0, 0.18),
      0.76 + rollLoad * 0.30,
      0.30 + damage * 0.46 + rollLoad * 0.34
    );

    const weed = clamp(player.inSargasse ?? 0, 0, 1);
    this.audio.setBed(
      "sargasse",
      weed * (0.10 + speed * 0.16),
      0.66 + speed * 0.34,
      0.24 + speed * 0.42
    );
  }


  resize() {
    const width = Math.max(320, innerWidth);
    const height = Math.max(240, innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.postFX.resize(width, height, this.qualityProfile?.pixelRatio ?? 1);
    // Le portrait se joue (passe 78) : le carton « tourne le téléphone » ne
    // s'affiche plus. L'élément reste pour les anciens caches PWA.
    this.ui.rotate?.classList?.add?.("hidden");
  }

  /**
   * Compile les programmes de TOUS les objets de la scène — pools invisibles
   * compris — pendant le 3-2-1, où la simulation est gelée. Mesuré au harnais
   * de démarrage : sans ça, le coup d'envoi et les premiers objets rendus
   * payaient ces compilations en gels de plusieurs centaines de millisecondes.
   * `compileAsync` s'appuie sur KHR_parallel_shader_compile quand le pilote
   * l'offre ; sinon il compile en bloc, une fois, sous le rebours.
   */
  warmUpShaders() {
    const renderer = this.renderer;
    if (!renderer || !this.scene || !this.camera) return false;
    try {
      if (typeof renderer.compileAsync === "function") {
        const pending = renderer.compileAsync(this.scene, this.camera);
        pending?.catch?.(() => {});
      } else if (typeof renderer.compile === "function") {
        renderer.compile(this.scene, this.camera);
      } else {
        return false;
      }
    } catch {
      return false;
    }
    return true;
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

  /**
   * Rapport de playtest : appareil, rendu, portes Go/No-Go de la session et
   * queue d'événements. Aucune donnée personnelle — voir playtest-report.js.
   */
  buildPlaytestReport() {
    const profile = this.qualityProfile ?? null;
    let href = null;
    try {
      href = globalThis.location?.origin ? `${globalThis.location.origin}${globalThis.location.pathname ?? ""}` : null;
    } catch { href = null; }
    return buildPlaytestReport({
      journal: this.playtestJournal,
      frames: this.frameSampler,
      device: describeDevice({ renderer: this.renderer }),
      quality: {
        tier: this.quality?.tier ?? null,
        label: profile?.label ?? null,
        manual: Boolean(this.quality?.manual),
        autoCeiling: this.quality?.autoCeiling ?? null,
        mobileProfile: Boolean(profile?.mobile),
        pixelRatio: profile?.pixelRatio ?? null,
        lastRender: this.lastRenderStats ?? null
      },
      build: {
        simulationVersion: SIMULATION_VERSION,
        gameplayVersion: GAMEPLAY_VERSION,
        threeRevision: this.THREE?.REVISION ?? null,
        href
      },
      settings: this.settings?.snapshot?.() ?? null
    });
  }

  /** Livre le rapport par le meilleur canal disponible, sur geste explicite du joueur. */
  async sharePlaytestReport() {
    const report = this.buildPlaytestReport();
    let outcome = "unavailable";
    try {
      outcome = await deliverPlaytestReport(report);
    } catch {
      outcome = "unavailable";
    }
    const status = PLAYTEST_DELIVERY_STATUS[outcome] ?? PLAYTEST_DELIVERY_STATUS.unavailable;
    if (this.ui?.playtestReportStatus) this.ui.playtestReportStatus.textContent = status;
    for (const button of [this.ui?.playtestReport, this.ui?.pausePlaytestReport]) {
      if (button?.dataset) button.dataset.outcome = outcome;
    }
    const pauseButton = this.ui?.pausePlaytestReport;
    if (pauseButton) {
      const label = pauseButton.dataset?.label || pauseButton.textContent || "ENVOYER MON RAPPORT DE TEST";
      if (pauseButton.dataset) pauseButton.dataset.label = label;
      pauseButton.textContent = {
        shared_file: "RAPPORT ENVOYÉ ✓",
        shared_text: "RAPPORT ENVOYÉ ✓",
        copied: "RAPPORT COPIÉ ✓",
        downloaded: "RAPPORT TÉLÉCHARGÉ ✓",
        cancelled: "PARTAGE ANNULÉ",
        unavailable: "PARTAGE INDISPONIBLE"
      }[outcome] ?? label;
      setTimeout(() => { pauseButton.textContent = label; }, 3200);
    }
    this.telemetry?.track?.(`playtest_report_${outcome}`, {}, this.time ?? 0);
    return outcome;
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
Object.assign(
  Game.prototype,
  WeaponSystems,
  MatchDirector,
  HudSystems,
  InputSystems,
  GrowthSystems,
  CameraSystems,
  VersusSystems,
  PickupSystems,
  ObstacleSystems,
  GhostSystems
);
