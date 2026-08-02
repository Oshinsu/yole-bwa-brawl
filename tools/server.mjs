// Serveur statique de PRODUCTION. Zéro dépendance.
//
// ⚠️ POURQUOI PAS `tools/serve.py`. Celui-là est un serveur de DÉVELOPPEMENT et
// il est inutilisable en ligne pour trois raisons mesurables :
//
//   1. Il écoute sur 127.0.0.1. Un hébergeur conteneurisé (Railway, Fly, Render)
//      route le trafic vers le conteneur : une socket bornée à la boucle locale
//      ne reçoit RIEN et le contrôle de santé échoue en boucle.
//   2. Il envoie `Cache-Control: no-store` sur TOUT. C'est voulu en
//      développement — une correction doit se voir au rechargement — mais en
//      ligne cela refait télécharger l'intégralité des assets à chaque visite.
//   3. `socketserver.TCPServer` est mono-thread : une requête lente bloque tout
//      le monde. Un seul MP3 de 3 Mo sur une connexion mobile suffit.
//
// Ce serveur ajoute aussi deux choses dont le jeu a réellement besoin :
//   - les REQUÊTES PAR PLAGE (`Range`), sans lesquelles un `HTMLAudioElement`
//     ne peut pas streamer ni se déplacer dans une piste ;
//   - les types MIME de `.glb` et `.woff2`, que la table par défaut de Node ne
//     connaît pas et qui arriveraient en `application/octet-stream`.

import { createReadStream, promises as fs } from "node:fs";
import { createServer } from "node:http";
import { createGzip } from "node:zlib";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const RACINE_REELLE = await fs.realpath(RACINE);
const PORT = Number(process.env.PORT) || 8080;
// ⚠️ 0.0.0.0 et pas 127.0.0.1 : voir l'en-tête.
const HOTE = process.env.HOST || "0.0.0.0";

const FICHIERS_PUBLICS = new Set([
  "index.html",
  "style.css",
  "legal.css",
  "privacy.html",
  "support.html",
  "credits.html",
  "manifest.webmanifest",
  "service-worker.js"
]);
const DOSSIERS_PUBLICS = ["/src/", "/vendor/", "/assets/", "/icons/", "/zik/"];

const ENTETES_SECURITE = Object.freeze({
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com",
    // GLTFLoader transforme les images embarquées dans les .glb en URL blob,
    // puis les récupère avec fetch/ImageBitmapLoader. Sans blob: ici, le
    // modèle charge mais ses textures échouent silencieusement sous CSP.
    "connect-src 'self' blob: https://cdn.jsdelivr.net https://unpkg.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'"
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  // Ces deux-là manquent à la table de Node et arriveraient en octet-stream.
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8"
};

// Seuls les formats déjà compressés au niveau du conteneur n'ont rien à gagner
// à passer par gzip — les recompresser coûte du CPU pour zéro octet.
const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json)|image\/svg)/;

/**
 * Politique de cache.
 *
 * ⚠️ Les noms de fichiers ne portent PAS d'empreinte de contenu. On ne peut
 * donc pas servir `immutable` sur un an : une texture corrigée ne parviendrait
 * jamais aux joueurs déjà venus. Une semaine sur les assets lourds, et
 * revalidation sur tout ce qui pilote la mise à jour.
 */
function politiqueDeCache(chemin) {
  // Ces trois-là commandent la mise à jour de l'application : ils doivent être
  // revalidés à chaque visite, sinon un déploiement n'atteint personne.
  if (/(^|\/)(index\.html|service-worker\.js|manifest\.webmanifest)$/.test(chemin)) {
    return "no-cache";
  }
  if (chemin.startsWith("/src/")) return "no-cache";   // le code change à chaque passe
  if (/^\/(assets|vendor|zik|icons)\//.test(chemin)) return "public, max-age=604800";
  return "public, max-age=3600";
}

function typeDe(chemin) {
  return TYPES[extname(chemin).toLowerCase()] || "application/octet-stream";
}

export function cheminPublic(chemin) {
  if (typeof chemin !== "string" || !chemin.startsWith("/")) return false;
  if (chemin.includes("\\") || chemin.includes("\0") || chemin.includes(":")) return false;
  const segments = chemin.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) return false;
  if (FICHIERS_PUBLICS.has(chemin.slice(1))) return true;
  return DOSSIERS_PUBLICS.some((prefixe) => chemin.startsWith(prefixe));
}

/**
 * Résout une URL vers un fichier du projet.
 *
 * ⚠️ Le `normalize` puis le test de préfixe sont la protection contre la
 * traversée de répertoire (`..%2f..%2fetc%2fpasswd`). Sans lui, ce serveur
 * publierait le disque entier.
 */
export function resoudre(url) {
  let chemin;
  try {
    chemin = decodeURIComponent(new URL(url, "http://x").pathname);
  } catch {
    return null;                       // URL mal encodée : on refuse.
  }
  if (chemin.endsWith("/")) chemin += "index.html";
  if (!cheminPublic(chemin)) return null;
  const cible = resolve(join(RACINE, normalize(chemin)));
  if (cible !== RACINE && !cible.startsWith(RACINE + sep)) return null;
  return { cible, chemin };
}

function envoyer(reponse, code, texte) {
  reponse.writeHead(code, {
    ...ENTETES_SECURITE,
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  reponse.end(texte);
}

export function analyserPlage(entete, taille) {
  if (typeof entete !== "string" || !Number.isSafeInteger(taille) || taille <= 0) return null;
  const correspondance = /^bytes=(\d*)-(\d*)$/i.exec(entete.trim());
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

async function gererRequete(requete, reponse) {
  if (requete.method !== "GET" && requete.method !== "HEAD") {
    return envoyer(reponse, 405, "Méthode non autorisée");
  }
  const resolu = resoudre(requete.url || "/");
  if (!resolu) return envoyer(reponse, 404, "Introuvable");

  let infos;
  try {
    infos = await fs.stat(resolu.cible);
    if (infos.isDirectory()) {
      resolu.cible = join(resolu.cible, "index.html");
      infos = await fs.stat(resolu.cible);
    }
    const cibleReelle = await fs.realpath(resolu.cible);
    if (cibleReelle !== RACINE_REELLE && !cibleReelle.startsWith(RACINE_REELLE + sep)) {
      return envoyer(reponse, 404, "Introuvable");
    }
    resolu.cible = cibleReelle;
  } catch {
    return envoyer(reponse, 404, "Introuvable");
  }
  if (!infos.isFile()) return envoyer(reponse, 404, "Introuvable");

  const type = typeDe(resolu.cible);
  const entetes = {
    ...ENTETES_SECURITE,
    "Content-Type": type,
    "Cache-Control": politiqueDeCache(resolu.chemin),
    // La CSP limite les fallbacks de modules aux deux CDN explicitement prévus
    // par main.js ; aucune page du jeu ne doit être encadrée par un tiers.
    "Accept-Ranges": "bytes"
  };

  // ── REQUÊTES PAR PLAGE ────────────────────────────────────────────────────
  // Indispensable au streaming audio : sans `206 Partial Content`, un
  // `HTMLAudioElement` doit télécharger la piste entière avant de jouer, et se
  // déplacer dedans devient impossible. Les huit MP3 pèsent 12 Mo.
  const plage = requete.headers.range;
  if (plage && /^bytes=/i.test(plage)) {
    const intervalle = analyserPlage(plage, infos.size);
    if (!intervalle) {
      reponse.writeHead(416, {
        ...entetes,
        "Content-Range": `bytes */${infos.size}`,
        "Content-Length": "0"
      });
      return reponse.end();
    }
    const { debut, fin } = intervalle;
    reponse.writeHead(206, {
      ...entetes,
      "Content-Range": `bytes ${debut}-${fin}/${infos.size}`,
      "Content-Length": fin - debut + 1
    });
    if (requete.method === "HEAD") return reponse.end();
    return createReadStream(resolu.cible, { start: debut, end: fin }).pipe(reponse);
  }

  // ── GZIP ──────────────────────────────────────────────────────────────────
  // ⚠️ On ne peut PAS annoncer `Content-Length` en même temps que `gzip` : la
  // longueur connue est celle du fichier en clair, pas du flux compressé.
  const accepteGzip = /\bgzip\b/.test(requete.headers["accept-encoding"] || "");
  if (accepteGzip && COMPRESSIBLE.test(type) && infos.size > 1024) {
    reponse.writeHead(200, { ...entetes, "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
    if (requete.method === "HEAD") return reponse.end();
    return createReadStream(resolu.cible).pipe(createGzip()).pipe(reponse);
  }

  reponse.writeHead(200, { ...entetes, "Content-Length": infos.size });
  if (requete.method === "HEAD") return reponse.end();
  createReadStream(resolu.cible).pipe(reponse);
}

export function creerServeur() {
  return createServer(gererRequete);
}

const lanceDirectement = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (lanceDirectement) {
  const serveur = creerServeur();
  serveur.listen(PORT, HOTE, () => {
    console.log(`yole: écoute sur http://${HOTE}:${PORT}/`);
  });
}
