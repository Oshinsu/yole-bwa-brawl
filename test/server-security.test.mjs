import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  analyserPlage,
  cheminPublic,
  creerServeur,
  resoudre
} from "../tools/server.mjs";

let serveur;
let base;

before(async () => {
  serveur = creerServeur();
  await new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(async () => {
  if (!serveur) return;
  await new Promise((resolve, reject) => serveur.close((error) => error ? reject(error) : resolve()));
});

test("l'allowlist ne publie que la coquille et les arbres runtime", () => {
  assert.equal(cheminPublic("/index.html"), true);
  assert.equal(cheminPublic("/privacy.html"), true);
  assert.equal(cheminPublic("/support.html"), true);
  assert.equal(cheminPublic("/credits.html"), true);
  assert.equal(cheminPublic("/legal.css"), true);
  assert.equal(cheminPublic("/src/main.js"), true);
  assert.equal(cheminPublic("/assets/textures/sail_atlas.webp"), true);
  assert.equal(cheminPublic("/tools/server.mjs"), false);
  assert.equal(cheminPublic("/test/replay.test.mjs"), false);
  assert.equal(cheminPublic("/.git/config"), false);
  assert.equal(cheminPublic("/src/.secret"), false);
  assert.equal(cheminPublic("/src\\..\\.git\\config"), false);
  assert.equal(cheminPublic("/src/main.js:$DATA"), false);
  assert.equal(resoudre("/%2e%2e/package.json"), null);
  assert.equal(resoudre("/src/%2e%2e/tools/server.mjs"), null);
});

test("les plages ouvertes, fermées et suffixes respectent RFC 9110", () => {
  assert.deepEqual(analyserPlage("bytes=10-19", 100), { debut: 10, fin: 19 });
  assert.deepEqual(analyserPlage("bytes=95-", 100), { debut: 95, fin: 99 });
  assert.deepEqual(analyserPlage("bytes=-5", 100), { debut: 95, fin: 99 });
  assert.deepEqual(analyserPlage("bytes=-500", 100), { debut: 0, fin: 99 });
  assert.equal(analyserPlage("bytes=-0", 100), null);
  assert.equal(analyserPlage("bytes=100-", 100), null);
  assert.equal(analyserPlage("bytes=9-2", 100), null);
  assert.equal(analyserPlage("bytes=0-1,4-5", 100), null);
});

test("le serveur bloque les fichiers internes et pose les en-têtes de sécurité", async () => {
  const accueil = await fetch(`${base}/index.html`);
  assert.equal(accueil.status, 200);
  const csp = accueil.headers.get("content-security-policy") || "";
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'self' blob:/);
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.equal(accueil.headers.get("x-frame-options"), "DENY");
  assert.equal(accueil.headers.get("x-content-type-options"), "nosniff");
  assert.equal(accueil.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  await accueil.body?.cancel();

  for (const chemin of ["/privacy.html", "/support.html", "/credits.html", "/legal.css"]) {
    const reponse = await fetch(`${base}${chemin}`);
    assert.equal(reponse.status, 200, chemin);
    await reponse.body?.cancel();
  }

  for (const chemin of ["/.git/config", "/tools/server.mjs", "/package.json"]) {
    const reponse = await fetch(`${base}${chemin}`);
    assert.notEqual(reponse.status, 200, chemin);
    assert.equal(reponse.headers.get("x-frame-options"), "DENY");
    await reponse.body?.cancel();
  }
});

test("le serveur renvoie correctement une plage suffixe et refuse les multi-ranges", async () => {
  const entiere = await fetch(`${base}/style.css`, {
    method: "HEAD",
    headers: { "Accept-Encoding": "identity" }
  });
  const taille = Number(entiere.headers.get("content-length"));
  assert.ok(taille > 32);

  const suffixe = await fetch(`${base}/style.css`, { headers: { Range: "bytes=-16" } });
  assert.equal(suffixe.status, 206);
  assert.equal(suffixe.headers.get("content-range"), `bytes ${taille - 16}-${taille - 1}/${taille}`);
  assert.equal((await suffixe.arrayBuffer()).byteLength, 16);

  const invalide = await fetch(`${base}/style.css`, { headers: { Range: "bytes=0-1,4-5" } });
  assert.equal(invalide.status, 416);
  assert.equal(invalide.headers.get("content-range"), `bytes */${taille}`);
});
