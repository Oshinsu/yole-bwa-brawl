const CACHE = "yole-bwa-brawl-tropical-mayhem-v3-9.1.0.0-2bd253e3ab13";
const CACHE_PREFIX = "yole-bwa-brawl-tropical-mayhem-";
// Stable entre deux versions du shell : une mise à jour de code ne force pas
// le retéléchargement des pistes déjà écoutées. Incrémenter si les MP3 changent.
const MUSIC_CACHE = "yole-bwa-brawl-tropical-mayhem-runtime-music-v1";
const CORE = [
  "./", "./index.html", "./style.css?v=hud-v17-turbo", "./legal.css", "./manifest.webmanifest",
  "./privacy.html", "./support.html", "./credits.html",
  // CORE est volontairement limité aux ressources requises pour démarrer et
  // jouer hors ligne. Un seul échec reste transactionnel : on n'active jamais
  // un shell partiel. Les médias optionnels sont, eux, chargés à la demande.
  "./assets/fonts/inter-var.woff2", "./assets/fonts/anton-400.woff2",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  // ⚠️ Les captures du manifeste ne sont PAS precachees : le navigateur ne les
  // demande qu'a l'ouverture de la fiche d'installation, et jamais ensuite.
  // 271 Ko payes a l'installation pour une image vue une fois, non merci.
  "./src/bootstrap.js?v=local-cache-v3", "./src/main.js",
  "./src/core/math.js", "./src/core/rng.js", "./src/core/quality.js",
  "./src/core/settings.js", "./src/core/telemetry.js", "./src/core/spatial-hash.js",
  "./src/core/audio.js",
  "./src/core/music.js",
  "./src/sim/replay.js", "./src/sim/waves.js", "./src/sim/wake-grid.js",
  "./src/sim/yole-physics.js", "./src/sim/collision.js", "./src/sim/rope.js",
  "./src/render/ocean.js", "./src/render/sky.js", "./src/render/vfx.js",
  "./src/render/debris.js", "./src/render/world.js",
  "./src/render/yole-visual.js",
  "./src/render/impact.js", "./src/render/handling-motion.js?v=swell-v2", "./src/render/assets.js?v=crew-v2",
  "./src/render/crew-clips.js", "./src/render/ghost-visual.js",
  "./assets/models/yole_hull.glb", "./assets/models/yole_crew.glb", "./assets/models/yole_crew_locks.glb", "./assets/models/yole_crew_casquette.glb", "./assets/models/yole_crew_bakoua.glb", "./assets/models/flottille_catamaran.glb", "./assets/models/flottille_vedette.glb", "./assets/models/barik.glb", "./assets/models/chadron.glb", "./assets/models/lanbi.glb", "./assets/models/pwason.glb", "./assets/models/bouee.glb",
  "./assets/audio/bedStorm.mp3", "./assets/audio/bedWater.mp3", "./assets/audio/buoy.mp3", "./assets/audio/bwaShift.mp3", "./assets/audio/cocoBoom.mp3", "./assets/audio/cocoFire.mp3", "./assets/audio/dash.mp3", "./assets/audio/harpoonFire.mp3", "./assets/audio/hullSlam.mp3", "./assets/audio/mineBlast.mp3", "./assets/audio/slamHeavy.mp3", "./assets/audio/splash.mp3", "./assets/audio/takedown.mp3", "./assets/audio/turbo.mp3", "./assets/audio/victory.mp3",
  "./assets/textures/sail_djab.webp", "./assets/textures/sky_clouds.webp", "./assets/textures/spray_flipbook.webp", "./assets/textures/sargasse.webp", "./assets/textures/hull_paint.webp", "./assets/textures/wood_bwa.webp", "./assets/textures/crate_wood.webp", "./assets/textures/sail_atlas.webp", "./assets/textures/morne_rock.webp", "./assets/textures/backdrop_far.webp", "./assets/textures/backdrop_near.webp", "./assets/textures/ui_icons.webp", "./assets/textures/explosion_flipbook.webp",
  "./src/game/balance.js", "./src/game/customization.js", "./src/game/tour-progress.js", "./src/game/tour-hub.js", "./src/game/replay-library.js", "./src/game/info-hub.js", "./src/game/growth.js", "./src/game/playtest-report.js", "./src/game/ghost.js", "./src/game/weapons.js", "./src/game/match.js", "./src/game/pickups.js", "./src/game/obstacles.js",
  "./src/game/hud.js", "./src/game/input.js", "./src/game/versus.js", "./src/game/camera.js", "./src/game/cinematic.js?v=director-v1", "./src/game/handling-feedback.js", "./src/game/utility-ai.js", "./src/game/boat.js", "./src/game/game.js",
  "./assets/textures/ui_joystick_base.webp", "./assets/textures/ui_joystick_knob.webp",
  "./assets/textures/ui_bouton_idle.webp", "./assets/textures/ui_bouton_pressed.webp",
  "./assets/textures/ui_panneau.webp", "./assets/textures/menu_pause.webp", "./assets/textures/menu_pause_v4.webp", "./assets/textures/armes_atlas.webp", "./assets/textures/ui_jauge_frame.webp", "./assets/textures/ui_jauge_fill.webp",
  // Pack raster V5 — commandes, armes, menus/HUD et sorts. Ces fichiers sont
  // optionnels à l'installation mais disponibles hors ligne dès qu'ils existent.
  "./assets/textures/v5/icons/icon_bwa_shift.webp",
  "./assets/textures/v5/icons/icon_bwa_dash.webp",
  "./assets/textures/v5/icons/icon_turbo.webp",
  "./assets/textures/v5/icons/icon_soute.webp",
  "./assets/textures/v5/icons/icon_settings.webp",
  "./assets/textures/v5/icons/icon_sound.webp",
  "./assets/textures/v5/icons/icon_pause.webp",
  "./assets/textures/v5/icons/icon_quality.webp",
  "./assets/textures/v5/icons/icon_zoom_in.webp",
  "./assets/textures/v5/icons/icon_zoom_out.webp",
  "./assets/textures/v5/icons/icon_zoom_reset.webp",
  "./assets/textures/v5/icons/icon_replay.webp",
  "./assets/textures/v5/icons/icon_download.webp",
  "./assets/textures/v5/icons/icon_haptics.webp",
  "./assets/textures/v5/icons/icon_stable_camera.webp",
  "./assets/textures/v5/icons/icon_reduce_flash.webp",
  "./assets/textures/v5/icons/icon_left_handed.webp",
  "./assets/textures/v5/icons/icon_performance.webp",
  "./assets/textures/v5/icons/icon_weapon_coco.webp",
  "./assets/textures/v5/icons/icon_weapon_harpoon.webp",
  "./assets/textures/v5/icons/icon_weapon_mine.webp",
  "./assets/textures/v5/icons/icon_weapon_rhum.webp",
  "./assets/textures/v5/icons/icon_weapon_barik.webp",
  "./assets/textures/v5/icons/icon_weapon_chadron.webp",
  "./assets/textures/v5/icons/icon_weapon_lanbi.webp",
  "./assets/textures/v5/icons/icon_weapon_pwason.webp",
  "./assets/textures/v5/hud/ui_primary_idle.webp",
  "./assets/textures/v5/hud/ui_primary_pressed.webp",
  "./assets/textures/v5/hud/ui_secondary_idle.webp",
  "./assets/textures/v5/hud/ui_secondary_pressed.webp",
  "./assets/textures/v5/hud/ui_action_idle.webp",
  "./assets/textures/v5/hud/ui_action_pressed.webp",
  "./assets/textures/v5/hud/ui_utility_button.webp",
  "./assets/textures/v5/hud/ui_panel_9slice.webp",
  "./assets/textures/v5/hud/ui_alert_panel.webp",
  "./assets/textures/v5/hud/minimap_frame.webp",
  "./assets/textures/v5/hud/reticle_harpoon.webp",
  "./assets/textures/v5/hud/reticle_cannon.webp",
  "./assets/textures/v5/hud/reticle_mine.webp",
  "./assets/textures/v5/hud/marker_lock_on.webp",
  "./assets/textures/v5/hud/marker_storm_danger.webp",
  "./assets/textures/v5/hud/joystick_base.webp",
  "./assets/textures/v5/hud/joystick_knob.webp",
  "./assets/textures/v5/hud/menu_end_backdrop.webp",
  // Les 18 prises individuelles V5 restent des sources d'audit. Le runtime
  // consomme uniquement cet atlas : une requête et un draw call.
  "./assets/textures/v5/vfx/spell_vfx_atlas.webp",
  "./assets/textures/v5/asset-pack.json",
  // Pack V6 — seuls les badges sans yole restent utiles au duel local. Les six
  // faux rendus de yoles ne sont plus affichés ni payés à l'installation.
  "./assets/textures/v6/menu/badge_player_one.webp",
  "./assets/textures/v6/menu/badge_player_two.webp",
  "./assets/textures/v6/asset-pack.json",
  // Pack V7 — le runtime consomme l'atlas 2×2, pas ses quatre sources.
  "./assets/textures/v7/juice/juice_vfx_atlas.webp",
  "./assets/textures/v7/asset-pack.json",
  // Pack V8 — instruments de course authentiques, détourés et pilotés par le
  // DOM. Les images n'embarquent aucune valeur ni aucun texte dynamique.
  "./assets/textures/v8/hud/status_frame.webp",
  "./assets/textures/v8/hud/balance_track.webp",
  "./assets/textures/v8/hud/hull_silhouette.webp",
  "./assets/textures/v8/hud/flow_sail.webp",
  "./assets/textures/v8/asset-pack.json",
  // Pack V9 — identite du menu : matiere de cale de course, quatre emblemes
  // de modes et une yole ronde authentique detouree.
  "./assets/textures/v9/menu/menu-panel-material.webp",
  "./assets/textures/v9/menu/brand-yole.webp",
  "./assets/textures/v9/menu/mode-combat.webp",
  "./assets/textures/v9/menu/mode-grand-tour.webp",
  "./assets/textures/v9/menu/mode-versus.webp",
  "./assets/textures/v9/menu/mode-workshop.webp",
  "./assets/textures/v9/hud/turbo_elan_atlas.webp",
  "./assets/textures/v9/asset-pack.json",
  "./vendor/three.module.min.js", "./vendor/three.core.min.js",
  "./vendor/addons/GLTFLoader.js", "./vendor/addons/BufferGeometryUtils.js", "./vendor/addons/SkeletonUtils.js",
];

// Musique = média optionnel. Les huit pistes (environ 12 Mo) ne doivent ni
// retarder ni faire échouer l'installation. La première écoute reste streamée ;
// le worker conserve ensuite une réponse complète pour les écoutes hors ligne.
const RUNTIME_MUSIC = [
  "./zik/An Nou Ay.mp3",
  "./zik/Canoe Combat.mp3",
  "./zik/Canot de Guerre.mp3",
  "./zik/Carnival Apocalypse.mp3",
  "./zik/Coconut Cannon Rush.mp3",
  "./zik/Midnight Canoe.mp3",
  "./zik/Oops, You Lost!.mp3",
  "./zik/Turquoise Turbo.mp3",
];
const MUSIC_PATHS = new Set(
  RUNTIME_MUSIC.map((path) => cheminDecode(new URL(path, self.location.href)))
);
const musicCacheJobs = new Map();

function cheminDecode(url) {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

// Le « shell » : le document et tout ce qui porte du CODE (styles, modules,
// manifeste). Le test porte sur le chemin seul, jamais sur l'URL complète :
// les entrées de CORE sont versionnées par requête (`./src/main.js`, mais
// aussi `./style.css?v=hud-v17-turbo`), et une extension cherchée dans la
// query attraperait n'importe quoi.
const SHELL_EXTENSIONS = /\.(?:html|css|m?js|webmanifest)$/;

function estShell(requete, url) {
  // Une navigation n'a pas toujours d'extension : « /yole-bwa-brawl/ » doit
  // être reconnu comme le document qu'il sert.
  if (requete.mode === "navigate") return true;
  return SHELL_EXTENSIONS.test(cheminDecode(url));
}

function requeteComplete(requete) {
  const entetes = new Headers(requete.headers);
  entetes.delete("range");
  return new Request(requete.url, {
    method: "GET",
    headers: entetes,
    credentials: requete.credentials
  });
}

function miseEnCacheMusique(requete, cache) {
  const complete = requeteComplete(requete);
  const cle = complete.url;
  if (musicCacheJobs.has(cle)) return musicCacheJobs.get(cle);

  const travail = (async () => {
    try {
      const response = await fetch(complete);
      if (response?.ok && response.status === 200) {
        await cache.put(complete, response.clone());
      }
    } catch {
      // La musique est optionnelle : une coupure réseau ne doit jamais
      // invalider la lecture en cours, le shell ou l'installation.
    }
  })().finally(() => musicCacheJobs.delete(cle));
  musicCacheJobs.set(cle, travail);
  return travail;
}

function analyserPlage(entete, taille) {
  const correspondance = /^bytes=(\d*)-(\d*)$/i.exec(entete?.trim?.() || "");
  if (!correspondance || (!correspondance[1] && !correspondance[2])) return null;

  let debut;
  let fin;
  if (!correspondance[1]) {
    const suffixe = Number(correspondance[2]);
    if (!Number.isSafeInteger(suffixe) || suffixe <= 0) return null;
    debut = Math.max(0, taille - suffixe);
    fin = taille - 1;
  } else {
    debut = Number(correspondance[1]);
    fin = correspondance[2] ? Number(correspondance[2]) : taille - 1;
    if (!Number.isSafeInteger(debut) || !Number.isSafeInteger(fin)) return null;
    if (debut < 0 || fin < 0 || debut > fin || debut >= taille) return null;
    fin = Math.min(fin, taille - 1);
  }
  return { debut, fin };
}

async function reponseParPlage(requete, reponseComplete) {
  const octets = await reponseComplete.arrayBuffer();
  const plage = analyserPlage(requete.headers.get("range"), octets.byteLength);
  if (!plage) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${octets.byteLength}` }
    });
  }

  const entetes = new Headers(reponseComplete.headers);
  entetes.set("Accept-Ranges", "bytes");
  entetes.set("Content-Length", String(plage.fin - plage.debut + 1));
  entetes.set("Content-Range", `bytes ${plage.debut}-${plage.fin}/${octets.byteLength}`);
  return new Response(octets.slice(plage.debut, plage.fin + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: entetes
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache.addAll est transactionnel : un seul 404, quota dépassé ou transfert
    // interrompu fait échouer CETTE installation sans activer un cache partiel.
    // L'ancien worker et son cache restent alors utilisables.
    await cache.addAll(CORE);
    // En production, pas de skipWaiting : une page déjà ouverte garde un seul
    // couple shell/runtime et le toast laisse le joueur relancer entre deux
    // manches. En atelier local, en revanche, un vieux worker peut servir un
    // ancien index avec les nouveaux modules du disque : le bouton JOUER devient
    // alors inerte. Il n'y a ni partie distante ni progression à protéger sur
    // localhost, donc la version complète fraîchement précachée prend la main
    // immédiatement et bootstrap.js désinscrit ensuite le worker.
    const workerHost = new URL(self.location.href).hostname;
    if (["localhost", "127.0.0.1", "::1"].includes(workerHost)) {
      await self.skipWaiting();
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => (
        key.startsWith(CACHE_PREFIX)
        && key !== CACHE
        && key !== MUSIC_CACHE
      ))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
    const workerHost = new URL(self.location.href).hostname;
    if (["localhost", "127.0.0.1", "::1"].includes(workerHost)) {
      // La page actuellement ouverte a été construite par l'ancien worker.
      // La recharger une fois évite de laisser à l'écran son menu inerte alors
      // que le nouveau cache complet vient déjà de prendre le contrôle.
      const windows = await self.clients.matchAll?.({ type: "window" }) || [];
      await Promise.all(windows.map((client) => client.navigate?.(client.url)));
    }
  })());
});

self.addEventListener("message", (event) => {
  // Une mise à jour ne prend la main qu'après le clic explicite sur le toast
  // côté application. Aucun skipWaiting automatique pendant une course.
  if (event.data?.type !== "SKIP_WAITING") return;
  event.waitUntil?.(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  // `Audio` encode le nom avec encodeURIComponent (donc la virgule devient
  // `%2C`), tandis que `new URL("./zik/Oops, ...")` peut garder la virgule.
  // Comparer le pathname décodé évite de rater cette piste légitime.
  const musiqueRuntime = MUSIC_PATHS.has(cheminDecode(requestUrl));
  let travailCache = Promise.resolve();
  const reponsePromise = (async () => {
    const cache = await caches.open(musiqueRuntime ? MUSIC_CACHE : CACHE);
    const plageDemandee = event.request.headers.has("range");
    // Cache API ne doit pas chercher avec l'en-tête Range : la clé persistée
    // représente toujours la réponse 200 complète.
    const cleCache = plageDemandee ? requeteComplete(event.request) : event.request;

    // ⚠️ LE SHELL REPART DU RÉSEAU, JAMAIS DU CACHE EN PREMIER.
    //
    // Jusqu'ici TOUTE requête same-origin était servie depuis le cache dès
    // qu'elle s'y trouvait. Un joueur déjà venu recevait donc son ancien
    // index.html ET ses anciens modules indéfiniment. La seule sortie était le
    // toast « MISE À JOUR PRÊTE »… rendu par src/main.js, c'est-à-dire par le
    // code périmé lui-même : qui avait en cache un main.js antérieur au toast
    // ne voyait jamais la mise à jour. Le mécanisme de sortie était enfermé
    // dans ce dont il devait faire sortir.
    //
    // Mesuré le 14 août 2026 sur la publication GitHub Pages : les 59 fichiers
    // servis étaient identiques octet pour octet au dernier commit, et le
    // navigateur affichait quand même une version vieille de plusieurs jours.
    // Le défaut n'était pas la publication, il était ici.
    //
    // Le shell repart donc du réseau et ne retombe sur le cache que si
    // celui-ci est injoignable : en ligne on joue toujours le dernier code,
    // hors ligne le jeu complet reste disponible. Les médias (modèles,
    // textures, sons, polices) gardent le cache-first : ils sont lourds,
    // immuables, et le nom du cache porte déjà l'empreinte du contenu.
    if (estShell(event.request, requestUrl)) {
      let reseau = null;
      try {
        reseau = await fetch(event.request);
      } catch {
        reseau = null;
      }
      if (reseau?.ok && reseau.status === 200) {
        travailCache = cache.put(cleCache, reseau.clone()).catch(() => {});
        return reseau;
      }
      // Coupure réseau, mais aussi 404 sur un module ou déploiement à moitié
      // en ligne : la version déjà installée reste jouable plutôt que de
      // rendre une page cassée.
      const enCache = await cache.match(cleCache);
      if (enCache) return enCache;
      if (event.request.mode === "navigate") {
        const documentEnCache = await cache.match("./index.html");
        if (documentEnCache) return documentEnCache;
      }
      return reseau || new Response("Offline", { status: 503, statusText: "Offline" });
    }

    const cached = await cache.match(cleCache);
    if (cached) return plageDemandee ? reponseParPlage(event.request, cached) : cached;
    try {
      const response = await fetch(event.request);
      // Une réponse 206 ne doit jamais remplacer la ressource complète : les
      // clés Cache API ne distinguent pas les plages d'un même URL.
      if (response?.ok && !plageDemandee && response.status === 200) {
        travailCache = cache.put(event.request, response.clone()).catch(() => {});
      } else if (
        response?.ok
        && plageDemandee
        && response.status === 206
        && musiqueRuntime
      ) {
        // HTMLAudioElement démarre vite avec sa réponse 206. En parallèle, une
        // seule requête 200 complète rend cette piste disponible hors ligne.
        travailCache = miseEnCacheMusique(event.request, cache);
      } else if (response?.ok && plageDemandee && response.status === 200) {
        // Certains serveurs ignorent Range et renvoient déjà le fichier entier.
        travailCache = cache.put(cleCache, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      if (event.request.mode === "navigate") return (await cache.match("./index.html")) || new Response("Offline", { status: 503 });
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })();
  event.respondWith(reponsePromise);
  // Appelé pendant le dispatch (et non après le fetch réseau), afin que le
  // navigateur garde le worker vivant jusqu'à la fin du cache runtime.
  event.waitUntil?.(reponsePromise.then(
    () => travailCache,
    () => travailCache
  ));
});
