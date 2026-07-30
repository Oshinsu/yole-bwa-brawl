const CACHE = "yole-bwa-brawl-tropical-mayhem-v3-9.1.0.0-d46788b70d61";
const CORE = [
  "./", "./index.html", "./style.css", "./manifest.webmanifest",
  // 65 Ko : la typographie fait partie de la coquille, contrairement aux
  // 12 Mo de zik/ qui restent hors precache.
  "./assets/fonts/inter-var.woff2", "./assets/fonts/anton-400.woff2",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  // ⚠️ Les captures du manifeste ne sont PAS precachees : le navigateur ne les
  // demande qu'a l'ouverture de la fiche d'installation, et jamais ensuite.
  // 271 Ko payes a l'installation pour une image vue une fois, non merci.
  "./src/main.js",
  "./src/core/math.js", "./src/core/rng.js", "./src/core/quality.js",
  "./src/core/settings.js", "./src/core/telemetry.js", "./src/core/spatial-hash.js",
  "./src/core/audio.js",
  "./src/core/music.js",
  "./src/sim/replay.js", "./src/sim/waves.js", "./src/sim/wake-grid.js",
  "./src/sim/yole-physics.js", "./src/sim/collision.js", "./src/sim/rope.js",
  "./src/render/ocean.js", "./src/render/sky.js", "./src/render/vfx.js",
  "./src/render/debris.js", "./src/render/world.js", "./src/render/yole-visual.js",
  "./src/render/impact.js", "./src/render/handling-motion.js", "./src/render/assets.js",
  "./assets/models/yole_hull.glb", "./assets/models/yole_crew.glb", "./assets/models/barik.glb", "./assets/models/chadron.glb", "./assets/models/lanbi.glb", "./assets/models/pwason.glb", "./assets/models/bouee.glb",
  "./assets/audio/bedStorm.mp3", "./assets/audio/bedWater.mp3", "./assets/audio/buoy.mp3", "./assets/audio/bwaShift.mp3", "./assets/audio/cocoBoom.mp3", "./assets/audio/cocoFire.mp3", "./assets/audio/dash.mp3", "./assets/audio/harpoonFire.mp3", "./assets/audio/hullSlam.mp3", "./assets/audio/mineBlast.mp3", "./assets/audio/slamHeavy.mp3", "./assets/audio/splash.mp3", "./assets/audio/takedown.mp3", "./assets/audio/turbo.mp3", "./assets/audio/victory.mp3",
  "./assets/textures/sail_djab.webp", "./assets/textures/sky_clouds.webp", "./assets/textures/spray_flipbook.webp", "./assets/textures/sargasse.webp", "./assets/textures/hull_paint.webp", "./assets/textures/wood_bwa.webp", "./assets/textures/crate_wood.webp", "./assets/textures/sail_atlas.webp", "./assets/textures/morne_rock.webp", "./assets/textures/backdrop_far.webp", "./assets/textures/backdrop_near.webp", "./assets/textures/ui_icons.webp", "./assets/textures/explosion_flipbook.webp",
  "./src/game/balance.js", "./src/game/weapons.js", "./src/game/match.js", "./src/game/pickups.js", "./src/game/obstacles.js",
  "./src/game/hud.js", "./src/game/input.js", "./src/game/versus.js", "./src/game/camera.js", "./src/game/handling-feedback.js", "./src/game/utility-ai.js", "./src/game/boat.js", "./src/game/game.js",
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
  "./assets/textures/v5/vfx/coco_impact.webp",
  "./assets/textures/v5/vfx/coco_projectile_trail.webp",
  "./assets/textures/v5/vfx/harpoon_launch_flash.webp",
  "./assets/textures/v5/vfx/harpoon_lock_ping.webp",
  "./assets/textures/v5/vfx/harpoon_tether_energy.webp",
  "./assets/textures/v5/vfx/tsunami_mine_armed.webp",
  "./assets/textures/v5/vfx/tsunami_ring_wave.webp",
  "./assets/textures/v5/vfx/rhum_invulnerability_aura.webp",
  "./assets/textures/v5/vfx/barik_fuse_sparks.webp",
  "./assets/textures/v5/vfx/barik_explosion.webp",
  "./assets/textures/v5/vfx/chadron_spike_burst.webp",
  "./assets/textures/v5/vfx/chadron_poison_splash.webp",
  "./assets/textures/v5/vfx/lanbi_sound_cone.webp",
  "./assets/textures/v5/vfx/lanbi_stun_burst.webp",
  "./assets/textures/v5/vfx/pwason_homing_trail.webp",
  "./assets/textures/v5/vfx/pwason_hit_burst.webp",
  "./assets/textures/v5/vfx/bwa_shift_streak.webp",
  "./assets/textures/v5/vfx/bwa_dash_impact.webp",
  "./assets/textures/v5/vfx/spell_vfx_atlas.webp",
  "./assets/textures/v5/asset-pack.json",
  // Pack V6 — entrée du jeu, cartes de modes et lobby Duel local.
  "./assets/textures/v6/menu/menu_hero_backdrop.webp",
  "./assets/textures/v6/menu/mode_combat_card.webp",
  "./assets/textures/v6/menu/mode_tour_card.webp",
  "./assets/textures/v6/menu/mode_versus_card.webp",
  "./assets/textures/v6/menu/mode_workshop_card.webp",
  "./assets/textures/v6/menu/versus_lobby_backdrop.webp",
  "./assets/textures/v6/menu/badge_player_one.webp",
  "./assets/textures/v6/menu/badge_player_two.webp",
  "./assets/textures/v6/asset-pack.json",
  // Pack V7 — quatre signatures de game-feel et leur atlas 2×2 (un draw call).
  "./assets/textures/v7/juice/harpoon_anchor_tear.webp",
  "./assets/textures/v7/juice/coconut_shockwave.webp",
  "./assets/textures/v7/juice/mine_detonation.webp",
  "./assets/textures/v7/juice/perfect_counterheel.webp",
  "./assets/textures/v7/juice/juice_vfx_atlas.webp",
  "./assets/textures/v7/asset-pack.json",
  "./vendor/addons/GLTFLoader.js", "./vendor/addons/BufferGeometryUtils.js", "./vendor/addons/SkeletonUtils.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const required = CORE.filter((url) =>
      url === "./"
      || url === "./index.html"
      || url === "./style.css"
      || url === "./manifest.webmanifest"
      || url.startsWith("./src/")
      || url.startsWith("./vendor/")
    );
    const optional = CORE.filter((url) => !required.includes(url));
    // Le shell, les modules runtime et les addons GLB sont stricts : annoncer
    // l'installation hors-ligne sans eux laisserait une PWA qui démarre avec
    // l'ancien rendu ou sans les modèles. Audio/textures restent récupérables.
    await Promise.all(required.map((url) => cache.add(url)));
    await Promise.allSettled(optional.map((url) => cache.add(url)));
    // Le cœur Three est livré avec le jeu et reste lui aussi install-critique.
    await Promise.all([
      cache.add("./vendor/three.module.min.js"),
      cache.add("./vendor/three.core.min.js")
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response?.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      if (event.request.mode === "navigate") return (await caches.match("./index.html")) || new Response("Offline", { status: 503 });
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});
