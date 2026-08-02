// Le serveur local est un atelier, pas une installation PWA.
//
// Un ancien service worker peut conserver des modules ES obsolètes pendant
// qu'un nouveau fichier en importe déjà de nouveaux exports. Le navigateur
// mélange alors deux versions et bloque avant même l'écran titre. Sur un vrai
// domaine on garde le fonctionnement hors-ligne normal ; sur localhost on
// nettoie uniquement les caches de YOLE avant de charger le jeu.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const CACHE_PREFIX = "yole-bwa-brawl-tropical-mayhem-";

async function resetLocalDevelopmentCache() {
  if (!LOCAL_HOSTS.has(location.hostname)) return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in globalThis) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX))
          .map((name) => caches.delete(name))
      );
    }
  } catch (error) {
    console.warn("Cache local non réinitialisé :", error?.message || error);
  }
}

const LOCAL_RESET_KEY = "yole-local-cache-reset";
const localDevelopment = LOCAL_HOSTS.has(location.hostname);
const controlledByOldWorker = localDevelopment
  && "serviceWorker" in navigator
  && Boolean(navigator.serviceWorker.controller);
const resetAlreadyReloaded = sessionStorage.getItem(LOCAL_RESET_KEY) === "1";

if (controlledByOldWorker && !resetAlreadyReloaded) {
  // Un worker désinscrit continue de piloter le document courant jusqu'à sa
  // fermeture. Une seule recharge garantit donc que les imports suivants
  // repartent vraiment du réseau.
  sessionStorage.setItem(LOCAL_RESET_KEY, "1");
  await resetLocalDevelopmentCache();
  location.reload();
  await new Promise(() => {});
} else {
  await resetLocalDevelopmentCache();
  sessionStorage.removeItem(LOCAL_RESET_KEY);
  await import("./main.js");
}
