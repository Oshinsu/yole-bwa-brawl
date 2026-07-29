import { Game } from "./game/game.js";
import { AssetLibrary } from "./render/assets.js";

const byId = (id) => document.getElementById(id);
const ui = {
  viewport: byId("viewport"),
  loading: byId("loading"),
  loadingDetail: byId("loadingDetail"),
  menu: byId("menu"),
  hud: byId("hud"),
  fatal: byId("fatal"),
  fatalText: byId("fatalText"),
  pause: byId("pauseScreen"),
  end: byId("endScreen"),
  play: byId("playBtn"),
  tourBtn: byId("tourBtn"),
  versusBtn: byId("versusBtn"),
  versusScreen: byId("versusScreen"),
  versusClose: byId("versusCloseBtn"),
  versusStart: byId("versusStartBtn"),
  versusHud: byId("versusHud"),
  versusP1Status: byId("versusP1Status"),
  versusP2Status: byId("versusP2Status"),
  customBtn: byId("customBtn"),
  customScreen: byId("customScreen"),
  customClose: byId("customCloseBtn"),
  rigChoices: byId("rigChoices"),
  rigDetail: byId("rigDetail"),
  liveryChoices: byId("liveryChoices"),
  retry: byId("retryBtn"),
  pauseBtn: byId("pauseBtn"),
  resume: byId("resumeBtn"),
  restart: byId("restartBtn"),
  rematch: byId("rematchBtn"),
  replay: byId("replayBtn"),
  downloadReplay: byId("downloadReplayBtn"),
  replayStatus: byId("replayStatus"),
  downloadTelemetry: byId("downloadTelemetryBtn"),
  sound: byId("soundBtn"),
  quality: byId("qualityBtn"),
  settingsBtn: byId("settingsBtn"),
  zoomOut: byId("zoomOutBtn"),
  zoomIn: byId("zoomInBtn"),
  zoomReset: byId("zoomResetBtn"),
  zoomValue: byId("zoomValue"),
  hapticsToggle: byId("hapticsToggle"),
  stableCameraToggle: byId("stableCameraToggle"),
  flashToggle: byId("flashToggle"),
  impactToggle: byId("impactToggle"),
  difficultyToggle: byId("difficultyToggle"),
  impactFlash: byId("impactFlash"),
  leftHandedToggle: byId("leftHandedToggle"),
  perfToggle: byId("perfToggle"),
  autoQualityToggle: byId("autoQualityToggle"),
  leaderboard: byId("leaderboard"),
  roundLabel: byId("roundLabel"),
  roundSub: byId("roundSub"),
  timer: byId("timer"),
  speed: byId("speedValue"),
  balanceBar: byId("balanceBar"),
  balanceText: byId("balanceText"),
  flowBar: byId("flowBar"),
  flowText: byId("flowText"),
  crewDots: byId("crewDots"),
  trimText: byId("trimText"),
  waterText: byId("waterText"),
  hullBar: byId("hullBar"),
  hullText: byId("hullText"),
  mastBar: byId("mastBar"),
  sailBar: byId("sailBar"),
  bwaIntegrityBar: byId("bwaIntegrityBar"),
  storm: byId("stormWarning"),
  stormDistance: byId("stormDistance"),
  message: byId("message"),
  killfeed: byId("killfeed"),
  damageNumbers: byId("damageNumbers"),
  countdown: byId("countdown"),
  spectateur: byId("spectateur"),
  reticle: byId("targetReticle"),
  reticleLabel: byId("targetReticleLabel"),
  aimHelp: byId("aimHelp"),
  damage: byId("damageVignette"),
  stormVignette: byId("stormVignette"),
  joystick: byId("joystick"),
  joyKnob: byId("joyKnob"),
  lookBack: byId("lookBackBtn"),
  install: byId("installBtn"),
  bwa: byId("bwaBtn"),
  weaponHold2: byId("weaponHold2Btn"),
  weaponCrate: byId("weaponCrateBtn"),
  weaponSlot: byId("weaponSlotBtn"),
  weaponSlotIco: byId("weaponSlotIco"),
  weaponSlotName: byId("weaponSlotName"),
  weaponSlotCd: byId("weaponSlotCd"),
  weaponShortcuts: byId("weaponShortcuts"),
  revenge: byId("revengeBtn"),
  rotate: byId("rotateHint"),
  endIcon: byId("endIcon"),
  endTitle: byId("endTitle"),
  endCopy: byId("endCopy"),
  statTakedowns: byId("statTakedowns"),
  statPerfects: byId("statPerfects"),
  statSpeed: byId("statSpeed"),
  perf: byId("perfStats"),
  weatherChip: byId("weatherChip"),
  minimap: byId("minimap"),
  minimapCanvas: byId("minimapCanvas"),
  minimapMode: byId("minimapMode"),
  minimapStatus: byId("minimapStatus")
};

async function loadThree() {
  if (globalThis.__THREE_MOCK__) return globalThis.__THREE_MOCK__;
  const params = new URLSearchParams(location.search);
  const candidates = [
    ...(params.has("mock") ? ["../test/mock-three.module.js"] : []),
    "../vendor/three.module.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js",
    "https://unpkg.com/three@0.185.1/build/three.module.min.js"
  ];
  let lastError = null;
  for (let index = 0; index < candidates.length; index++) {
    ui.loadingDetail.textContent = index === 0 ? "Recherche du moteur 3D local…" : `Chargement Three.js 0.185.1 · source ${index + 1}/${candidates.length}`;
    try {
      const module = await import(candidates[index]);
      if (module?.WebGLRenderer) return module;
    } catch (error) {
      lastError = error;
      console.warn("Three.js source unavailable:", candidates[index], error?.message || error);
    }
  }
  throw lastError || new Error("Three.js could not be loaded");
}

let THREE;
try {
  THREE = await loadThree();
} catch (error) {
  console.error(error);
  ui.loading.classList.add("hidden");
  ui.fatal.classList.remove("hidden");
  ui.fatalText.textContent = "Three.js 0.185.1 n’a pas pu être chargé. Lance PLAY_WINDOWS.bat ou play.sh avec une connexion afin de télécharger le moteur localement.";
  ui.retry.onclick = () => location.reload();
  throw error;
}

// Les modeles sont optionnels : un echec de chargement laisse le rendu procedural.
ui.loadingDetail.textContent = "Chargement des modeles…";
let assets = null;
try {
  assets = new AssetLibrary(THREE);
  await assets.loadTextures();
  await assets.load();
  if (assets.available) console.info(`[assets] pieces chargees: ${assets.loadedParts.join(", ")}`);
  else console.info(`[assets] rendu procedural (${assets.reason || "aucun modele"})`);
} catch (error) {
  console.warn("[assets] chargement ignore:", error?.message || error);
}

const game = new Game(THREE, ui, assets);
ui.loading.classList.add("hidden");
ui.menu.classList.remove("hidden");

if (new URLSearchParams(location.search).get("autoplay") === "1") setTimeout(() => game.startMatch(), 350);

// ⚠️ BUG CORRIGÉ : LE SERVICE WORKER NE S'ENREGISTRAIT JAMAIS.
//
// Ce bloc attendait l'événement `load`. Or ce module contient une ATTENTE DE
// HAUT NIVEAU (`THREE = await loadThree()`, plus haut) : tout ce qui la suit
// s'exécute dans une micro-tâche ULTÉRIEURE, après que `load` a déjà été émis.
// Poser alors un écouteur `{ once: true }` sur un événement déjà passé ne
// déclenche rien, jamais — et comme le `.catch` n'était pas atteint non plus,
// il n'y avait aucune trace en console.
//
// Conséquence mesurée en navigateur, derrière le serveur de production :
// `navigator.serviceWorker.getRegistration()` renvoyait `undefined`, alors
// qu'un `register()` appelé à la main réussissait immédiatement. Autrement dit
// le hors-ligne, l'installation PWA et les 171 fichiers de précache étaient du
// code mort depuis toujours.
//
// On enregistre donc TOUT DE SUITE si le document est déjà chargé, et sur
// `load` seulement s'il ne l'est pas encore.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const enregistrerServiceWorker = () => {
    // ⚠️ LA PORTÉE DOIT ÊTRE DÉRIVÉE DU WORKER, PAS ÉCRITE EN DUR.
    //
    // `scope: "../"` se résout par rapport au DOCUMENT. À la racine d'un
    // domaine ça donne "/" et tout va bien — mais publié sous un
    // sous-répertoire (GitHub Pages : /yole-bwa-brawl/), ça donne "/" alors que
    // la portée maximale autorisée est "/yole-bwa-brawl/". Le navigateur refuse
    // l'inscription :
    //   « The path of the provided scope ('/') is not under the max scope
    //     allowed ('/yole-bwa-brawl/') »
    // Mesuré en ligne : hors-ligne mort, installation PWA impossible, précache
    // inutile — exactement le défaut corrigé à la passe 49, revenu par un autre
    // chemin.
    //
    // On calcule donc la portée à partir de l'URL du worker lui-même : elle
    // vaut le dossier qui le contient, à la racine comme en sous-répertoire.
    const worker = new URL("../service-worker.js", import.meta.url);
    navigator.serviceWorker
      .register(worker, { scope: new URL("./", worker).href })
      .catch((error) => {
        console.warn("PWA service worker unavailable:", error?.message || error);
      });
  };
  if (document.readyState === "complete") enregistrerServiceWorker();
  else addEventListener("load", enregistrerServiceWorker, { once: true });
}
