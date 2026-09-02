import { Game } from "./game/game.js";
import { AssetLibrary } from "./render/assets.js?v=crew-v2";

const byId = (id) => document.getElementById(id);
const pageParams = new URLSearchParams(location.search);
const graphicStyleTest = pageParams.get("da") === "gravure";
if (graphicStyleTest) document.documentElement.dataset.artStyle = "gravure";
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
  playtestReport: byId("playtestReportBtn"),
  playtestReportStatus: byId("playtestReportStatus"),
  pausePlaytestReport: byId("pausePlaytestReportBtn"),
  qualityTierToggle: byId("qualityTierToggle"),
  ghostToggle: byId("ghostToggle"),
  ghostChip: byId("ghostChip"),
  ghostGap: byId("ghostGap"),
  soundToggle: byId("soundToggle"),
  zoomToggle: byId("zoomToggle"),
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
  flowMeter: byId("flowMeter"),
  flowBar: byId("flowBar"),
  flowText: byId("flowText"),
  flowState: byId("flowState"),
  flowHint: byId("flowHint"),
  flowRisk: byId("flowRisk"),
  crewDots: byId("crewDots"),
  trimText: byId("trimText"),
  waterText: byId("waterText"),
  hullBar: byId("hullBar"),
  hullText: byId("hullText"),
  mastBar: byId("mastBar"),
  sailBar: byId("sailBar"),
  bwaIntegrityBar: byId("bwaIntegrityBar"),
  systemIntegrity: byId("systemIntegrity"),
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
  install: byId("installBtn"),
  bwa: byId("bwaBtn"),
  weaponHold2: byId("weaponHold2Btn"),
  weaponCrate: byId("weaponCrateBtn"),
  weaponSlot: byId("weaponSlotBtn"),
  weaponSlotIco: byId("weaponSlotIco"),
  weaponSlotName: byId("weaponSlotName"),
  weaponSlotCd: byId("weaponSlotCd"),
  weaponShortcuts: byId("weaponShortcuts"),
  rotate: byId("rotateHint"),
  endIcon: byId("endIcon"),
  endTitle: byId("endTitle"),
  endCopy: byId("endCopy"),
  statTakedowns: byId("statTakedowns"),
  statTakedownsLabel: byId("statTakedownsLabel"),
  statPerfects: byId("statPerfects"),
  statPerfectsLabel: byId("statPerfectsLabel"),
  statSpeed: byId("statSpeed"),
  statSpeedLabel: byId("statSpeedLabel"),
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

function showFatal(message, error = null) {
  if (error) console.error(error);
  ui.loading?.classList.add("hidden");
  ui.menu?.classList.add("hidden");
  ui.hud?.classList.add("hidden");
  ui.fatal?.classList.remove("hidden");
  if (ui.fatalText) ui.fatalText.textContent = message;
  if (ui.retry) ui.retry.onclick = () => location.reload();
}

let THREE;
try {
  THREE = await loadThree();
} catch (error) {
  showFatal(
    "Le moteur 3D n’a pas pu être chargé. Vérifie la connexion ou le mode hors ligne, puis réessaie.",
    error
  );
  throw error;
}

// Dès que le moteur est là, on montre le vrai port derrière une jauge compacte
// au lieu de garder un écran de chargement plein cadre pendant les modèles.
// Les commandes restent inertes jusqu'à la création de Game.
ui.menu.classList.remove("hidden");
ui.menu.setAttribute("aria-busy", "true");
ui.menu.inert = true;
ui.loading.classList.add("loading-over-menu");

// Les modeles sont optionnels : un echec de chargement laisse le rendu procedural.
ui.loadingDetail.textContent = "Chargement des modeles…";
let assets = null;
try {
  assets = new AssetLibrary(THREE);
  await assets.loadTextures();
  // Le vertical slice DA reste volontairement hors du chargement normal :
  // aucune requête ni mémoire supplémentaires pour les joueurs qui n'ouvrent
  // pas explicitement `?da=gravure`.
  if (graphicStyleTest) {
    await assets.loadTextures({
      backdropGraphic: {
        file: "experiments/gravure_alize_backdrop.webp",
        color: true
      }
    });
  }
  await assets.load();
  if (assets.available) console.info(`[assets] pieces chargees: ${assets.loadedParts.join(", ")}`);
  else console.info(`[assets] rendu procedural (${assets.reason || "aucun modele"})`);
} catch (error) {
  console.warn("[assets] chargement ignore:", error?.message || error);
}

let game = null;
try {
  game = new Game(THREE, ui, assets);
  ui.loading.classList.add("hidden");
  ui.loading.classList.remove("loading-over-menu");
  ui.menu.classList.remove("hidden");
  ui.menu.removeAttribute("aria-busy");
  ui.menu.inert = false;
  ui.play?.focus?.();
} catch (error) {
  showFatal(
    "Le rendu 3D n’a pas pu démarrer. Vérifie que WebGL est activé, mets à jour le pilote graphique, puis réessaie.",
    error
  );
}

if (game && pageParams.get("autoplay") === "1") {
  setTimeout(() => game.startMatch(), 350);
}

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
// le hors-ligne, l'installation PWA et tout le précache étaient du
// code mort depuis toujours.
//
// On enregistre donc TOUT DE SUITE si le document est déjà chargé, et sur
// `load` seulement s'il ne l'est pas encore.
const localDevelopmentHost = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
if (
  "serviceWorker" in navigator
  && location.protocol.startsWith("http")
  && !localDevelopmentHost
) {
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) location.reload();
  });

  const showUpdateReady = (registration) => {
    if (!registration?.waiting || document.querySelector(".update-ready")) return;
    // Pas de toast au milieu d'un combat. On le présente au premier écran
    // calme, sans jamais forcer une actualisation qui ferait perdre la manche.
    if (game?.mode === "playing" && !game?.paused) {
      setTimeout(() => showUpdateReady(registration), 1200);
      return;
    }
    const toast = document.createElement("aside");
    toast.className = "update-ready";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    const copy = document.createElement("div");
    copy.className = "update-ready-copy";
    const title = document.createElement("strong");
    title.textContent = "MISE À JOUR PRÊTE";
    const detail = document.createElement("small");
    detail.textContent = "Relance entre deux manches pour charger la nouvelle version.";
    copy.append(title, detail);
    const relaunch = document.createElement("button");
    relaunch.type = "button";
    relaunch.className = "primary";
    relaunch.textContent = "RELANCER";
    relaunch.onclick = () => {
      reloadingForUpdate = true;
      registration.waiting?.postMessage?.({ type: "SKIP_WAITING" });
    };
    const later = document.createElement("button");
    later.type = "button";
    later.className = "secondary";
    later.textContent = "PLUS TARD";
    later.onclick = () => toast.remove();
    const actions = document.createElement("div");
    actions.className = "update-ready-actions";
    actions.append(relaunch, later);
    toast.append(copy, actions);
    document.body.appendChild(toast);
  };

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
    // `updateViaCache: "none"` : sans lui, le script du worker est relu à
    // travers le cache HTTP du navigateur. GitHub Pages sert le dépôt en
    // `cache-control: max-age=600` — la vérification de mise à jour tombait
    // donc dans le vide pendant dix minutes après chaque publication, et le
    // joueur restait sur son ancien shell d'autant plus longtemps. Le worker
    // est le seul fichier qu'on veut toujours relire depuis le réseau.
    const worker = new URL("../service-worker.js", import.meta.url);
    navigator.serviceWorker
      .register(worker, { scope: new URL("./", worker).href, updateViaCache: "none" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateReady(registration);
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateReady(registration);
            }
          });
        });
      })
      .catch((error) => {
        console.warn("PWA service worker unavailable:", error?.message || error);
      });
  };
  if (document.readyState === "complete") enregistrerServiceWorker();
  else addEventListener("load", enregistrerServiceWorker, { once: true });
}
