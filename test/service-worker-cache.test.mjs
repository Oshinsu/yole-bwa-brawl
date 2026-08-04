import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

import { PISTES } from "../src/core/music.js";

const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
const bootstrapSource = await readFile(new URL("../src/bootstrap.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const cameraSource = await readFile(new URL("../src/game/camera.js", import.meta.url), "utf8");
const yoleVisualSource = await readFile(new URL("../src/render/yole-visual.js", import.meta.url), "utf8");
const cacheActuel = /const CACHE = "([^"]+)"/.exec(source)?.[1];
const cacheMusique = /const MUSIC_CACHE = "([^"]+)"/.exec(source)?.[1];
const blocCore = /const CORE = \[(.*?)\];/s.exec(source)?.[1] || "";
const core = [...blocCore.matchAll(/"(\.\/[^"]*)"/g)].map((match) => match[1]);
const blocMusiquesRuntime = /const RUNTIME_MUSIC = \[(.*?)\];/s.exec(source)?.[1] || "";
const musiquesRuntime = [...blocMusiquesRuntime.matchAll(/"(\.\/[^"]*)"/g)]
  .map((match) => match[1]);

function chargerWorker(caches, networkFetch = fetch, workerHooks = {}) {
  const handlers = {};
  const self = {
    location: {
      origin: "https://yole.example",
      href: "https://yole.example/service-worker.js"
    },
    clients: { claim: async () => {} },
    skipWaiting: async () => workerHooks.skipWaiting?.(),
    addEventListener(type, handler) {
      handlers[type] = handler;
    }
  };
  vm.runInNewContext(source, {
    self,
    caches,
    URL,
    Response,
    Request,
    Headers,
    fetch: networkFetch,
    Promise
  });
  return handlers;
}

test("l'installation précache tout CORE en une transaction et attend la prochaine ouverture", async () => {
  let recus = null;
  const caches = {
    open: async () => ({
      addAll: async (urls) => {
        recus = [...urls];
      }
    })
  };
  const handlers = chargerWorker(caches);
  let installation;
  handlers.install({ waitUntil(promise) { installation = promise; } });
  await installation;

  assert.deepEqual(recus, core);
  assert.equal(new Set(core).size, core.length, "CORE ne doit contenir aucun doublon");
  const installationSource = /self\.addEventListener\("install"([\s\S]*?)self\.addEventListener\("activate"/
    .exec(source)?.[1] || "";
  assert.doesNotMatch(
    installationSource,
    /self\.skipWaiting\s*\(/,
    "l'installation ne doit pas prendre un onglet en cours"
  );
  assert.doesNotMatch(source, /Promise\.allSettled/, "aucun asset nécessaire ne doit devenir optionnel");
});

test("SKIP_WAITING ne s'exécute qu'après le message explicite de l'interface", async () => {
  let appels = 0;
  const handlers = chargerWorker({}, fetch, {
    skipWaiting() {
      appels++;
    }
  });

  handlers.message({ data: { type: "AUTRE_MESSAGE" } });
  assert.equal(appels, 0);

  let maintenance;
  handlers.message({
    data: { type: "SKIP_WAITING" },
    waitUntil(promise) { maintenance = promise; }
  });
  await maintenance;
  assert.equal(appels, 1);
});

test("un précache incomplet fait échouer la nouvelle installation sans purger l'ancienne", async () => {
  const supprimes = [];
  const caches = {
    open: async () => ({
      addAll: async () => {
        throw new Error("transfert interrompu");
      }
    }),
    delete: async (nom) => {
      supprimes.push(nom);
      return true;
    }
  };
  const handlers = chargerWorker(caches);
  let installation;
  handlers.install({ waitUntil(promise) { installation = promise; } });

  await assert.rejects(installation, /transfert interrompu/);
  assert.deepEqual(supprimes, [], "l'installation ne doit jamais supprimer le cache actif");
});

test("l'activation ne supprime que les anciens caches de YOLE", async () => {
  const supprimes = [];
  const caches = {
    keys: async () => [
      "autre-application-v7",
      "yole-bwa-brawl-tropical-mayhem-v3-8-ancienne",
      cacheMusique,
      cacheActuel
    ],
    delete: async (nom) => {
      supprimes.push(nom);
      return true;
    }
  };
  const handlers = chargerWorker(caches);
  let activation;
  handlers.activate({ waitUntil(promise) { activation = promise; } });
  await activation;
  assert.deepEqual(supprimes, [
    "yole-bwa-brawl-tropical-mayhem-v3-8-ancienne"
  ]);
});

test("les deux modules Three critiques appartiennent à CORE et donc au fingerprint", () => {
  const blocCore = /const CORE = \[(.*?)\];/s.exec(source)?.[1] || "";
  assert.match(blocCore, /"\.\/vendor\/three\.module\.min\.js"/);
  assert.match(blocCore, /"\.\/vendor\/three\.core\.min\.js"/);
  assert.doesNotMatch(source, /keys\.filter\(\(key\) => key !== CACHE\)/);
});

test("les contrats visuels couplés utilisent la même version dans les imports et le précache", () => {
  assert.match(indexSource, /src\/bootstrap\.js\?v=local-cache-v2/);
  assert.match(source, /\.\/src\/bootstrap\.js\?v=local-cache-v2/);
  assert.match(mainSource, /render\/assets\.js\?v=crew-v2/);
  assert.match(yoleVisualSource, /\.\/assets\.js\?v=crew-v2/);
  assert.match(source, /\.\/src\/render\/assets\.js\?v=crew-v2/);
  assert.match(cameraSource, /handling-motion\.js\?v=swell-v2/);
  assert.match(yoleVisualSource, /handling-motion\.js\?v=swell-v2/);
  assert.match(source, /\.\/src\/render\/handling-motion\.js\?v=swell-v2/);
  assert.match(cameraSource, /\.\/cinematic\.js\?v=director-v1/);
  assert.match(source, /\.\/src\/game\/cinematic\.js\?v=director-v1/);
  assert.match(bootstrapSource, /resetLocalDevelopmentCache/);
  assert.match(mainSource, /!localDevelopmentHost/);
});

test("les huit pistes sont déclarées en runtime, hors du précache atomique et sur disque", async () => {
  const musiques = Object.values(PISTES).map(({ fichier }) => `./zik/${fichier}`);
  assert.equal(musiques.length, 8);
  assert.equal(new Set(musiques).size, 8);
  assert.deepEqual(new Set(musiquesRuntime), new Set(musiques));

  for (const musique of musiques) {
    assert.ok(!core.includes(musique), `${musique} ne doit pas bloquer l'installation`);
    await access(new URL(`../${musique.slice(2)}`, import.meta.url));
  }
});

test("les surfaces secondaires et la progression sont disponibles hors ligne", async () => {
  const ressources = [
    "./src/game/growth.js",
    "./privacy.html",
    "./support.html",
    "./credits.html",
    "./legal.css"
  ];

  for (const ressource of ressources) {
    assert.ok(core.includes(ressource), `${ressource} absente du précache`);
    await access(new URL(`../${ressource.slice(2)}`, import.meta.url));
  }
});

test("une piste mise en cache à l'écoute répond aux requêtes Range hors ligne", async () => {
  const octets = Uint8Array.from({ length: 12 }, (_, index) => index);
  let appelsReseau = 0;
  let misesEnCache = 0;
  const caches = {
    open: async () => ({
      match: async () => new Response(octets, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(octets.length)
        }
      }),
      put: async () => {
        misesEnCache++;
      }
    })
  };
  const handlers = chargerWorker(caches, async () => {
    appelsReseau++;
    throw new Error("réseau coupé");
  });
  const request = new Request(
    "https://yole.example/zik/Oops%2C%20You%20Lost!.mp3",
    { headers: { Range: "bytes=3-7" } }
  );
  let resultat;
  handlers.fetch({ request, respondWith(promise) { resultat = promise; } });
  const response = await resultat;

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 3-7/12");
  assert.equal(response.headers.get("Content-Length"), "5");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [3, 4, 5, 6, 7]);
  assert.equal(appelsReseau, 0);
  assert.equal(misesEnCache, 0, "une plage ne doit jamais remplacer le MP3 complet");
});

test("la première plage est streamée puis déclenche une seule mise en cache complète", async () => {
  const corpsComplet = Uint8Array.from({ length: 12 }, (_, index) => index);
  const appels = [];
  const misesEnCache = [];
  const cache = {
    match: async () => undefined,
    put: async (request, response) => {
      misesEnCache.push({
        url: typeof request === "string" ? request : request.url,
        range: typeof request === "string" ? null : request.headers.get("range"),
        status: response.status,
        octets: (await response.arrayBuffer()).byteLength
      });
    }
  };
  const cachesOuverts = [];
  const caches = {
    open: async (nom) => {
      cachesOuverts.push(nom);
      return cache;
    }
  };
  const handlers = chargerWorker(caches, async (request) => {
    const range = request.headers.get("range");
    appels.push(range);
    if (range) {
      return new Response(corpsComplet.slice(0, 4), {
        status: 206,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Range": "bytes 0-3/12"
        }
      });
    }
    return new Response(corpsComplet, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" }
    });
  });
  const request = new Request(
    "https://yole.example/zik/Oops%2C%20You%20Lost!.mp3",
    { headers: { Range: "bytes=0-3" } }
  );
  let resultat;
  let maintenance;
  handlers.fetch({
    request,
    respondWith(promise) { resultat = promise; },
    waitUntil(promise) { maintenance = promise; }
  });
  const response = await resultat;
  await maintenance;

  assert.equal(response.status, 206, "la lecture ne doit pas attendre le téléchargement complet");
  assert.deepEqual(cachesOuverts, [cacheMusique]);
  assert.deepEqual(appels, ["bytes=0-3", null]);
  assert.deepEqual(misesEnCache, [{
    url: "https://yole.example/zik/Oops%2C%20You%20Lost!.mp3",
    range: null,
    status: 200,
    octets: 12
  }]);
});

test("une musique runtime absente reste optionnelle et renvoie Offline sans casser le worker", async () => {
  const caches = {
    open: async () => ({
      match: async () => undefined,
      put: async () => {
        assert.fail("une erreur réseau ne doit rien écrire en cache");
      }
    })
  };
  const handlers = chargerWorker(caches, async () => {
    throw new Error("réseau coupé");
  });
  const request = new Request(
    "https://yole.example/zik/Turquoise%20Turbo.mp3",
    { headers: { Range: "bytes=0-31" } }
  );
  let resultat;
  let maintenance;
  handlers.fetch({
    request,
    respondWith(promise) { resultat = promise; },
    waitUntil(promise) { maintenance = promise; }
  });
  const response = await resultat;
  await maintenance;

  assert.equal(response.status, 503);
  assert.equal(response.statusText, "Offline");
});

test("une plage impossible renvoie 416 avec la taille complète", async () => {
  const caches = {
    open: async () => ({
      match: async () => new Response(Uint8Array.from([1, 2, 3, 4]), {
        headers: { "Content-Type": "audio/mpeg" }
      })
    })
  };
  const handlers = chargerWorker(caches);
  const request = new Request(
    "https://yole.example/zik/Canoe%20Combat.mp3",
    { headers: { Range: "bytes=99-" } }
  );
  let resultat;
  handlers.fetch({ request, respondWith(promise) { resultat = promise; } });
  const response = await resultat;

  assert.equal(response.status, 416);
  assert.equal(response.headers.get("Content-Range"), "bytes */4");
});

test("une réponse réseau 206 ne remplace jamais la piste complète dans le cache", async () => {
  let misesEnCache = 0;
  const caches = {
    open: async () => ({
      match: async () => undefined,
      put: async () => {
        misesEnCache++;
      }
    })
  };
  const handlers = chargerWorker(caches, async () => new Response(
    Uint8Array.from([5, 6, 7]),
    {
      status: 206,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Range": "bytes 5-7/12"
      }
    }
  ));
  const request = new Request(
    "https://yole.example/zik/Midnight%20Canoe.mp3",
    { headers: { Range: "bytes=5-7" } }
  );
  let resultat;
  handlers.fetch({ request, respondWith(promise) { resultat = promise; } });
  const response = await resultat;

  assert.equal(response.status, 206);
  assert.equal(misesEnCache, 0);
});
