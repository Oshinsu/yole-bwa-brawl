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
const PORT = Number(process.env.PORT) || 8080;
// ⚠️ 0.0.0.0 et pas 127.0.0.1 : voir l'en-tête.
const HOTE = process.env.HOST || "0.0.0.0";

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

/**
 * Résout une URL vers un fichier du projet.
 *
 * ⚠️ Le `normalize` puis le test de préfixe sont la protection contre la
 * traversée de répertoire (`..%2f..%2fetc%2fpasswd`). Sans lui, ce serveur
 * publierait le disque entier.
 */
function resoudre(url) {
  let chemin;
  try {
    chemin = decodeURIComponent(new URL(url, "http://x").pathname);
  } catch {
    return null;                       // URL mal encodée : on refuse.
  }
  if (chemin.endsWith("/")) chemin += "index.html";
  const cible = resolve(join(RACINE, normalize(chemin)));
  if (cible !== RACINE && !cible.startsWith(RACINE + sep)) return null;
  return { cible, chemin };
}

function envoyer(reponse, code, texte) {
  reponse.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  reponse.end(texte);
}

const serveur = createServer(async (requete, reponse) => {
  if (requete.method !== "GET" && requete.method !== "HEAD") {
    return envoyer(reponse, 405, "Méthode non autorisée");
  }
  const resolu = resoudre(requete.url || "/");
  if (!resolu) return envoyer(reponse, 400, "Chemin invalide");

  let infos;
  try {
    infos = await fs.stat(resolu.cible);
    if (infos.isDirectory()) {
      resolu.cible = join(resolu.cible, "index.html");
      infos = await fs.stat(resolu.cible);
    }
  } catch {
    return envoyer(reponse, 404, "Introuvable");
  }

  const type = typeDe(resolu.cible);
  const entetes = {
    "Content-Type": type,
    "Cache-Control": politiqueDeCache(resolu.chemin),
    // Le jeu ne charge que ses propres ressources et three.js depuis un CDN
    // épinglé par empreinte SRI dans le monofichier ; rien ici n'a besoin
    // d'être encadré dans une iframe tierce.
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes"
  };

  // ── REQUÊTES PAR PLAGE ────────────────────────────────────────────────────
  // Indispensable au streaming audio : sans `206 Partial Content`, un
  // `HTMLAudioElement` doit télécharger la piste entière avant de jouer, et se
  // déplacer dedans devient impossible. Les huit MP3 pèsent 12 Mo.
  const plage = requete.headers.range;
  if (plage && /^bytes=/.test(plage)) {
    const [brutDebut, brutFin] = plage.replace("bytes=", "").split("-");
    let debut = brutDebut ? Number(brutDebut) : 0;
    let fin = brutFin ? Number(brutFin) : infos.size - 1;
    if (!Number.isFinite(debut) || !Number.isFinite(fin) || debut > fin || debut >= infos.size) {
      reponse.writeHead(416, { "Content-Range": `bytes */${infos.size}` });
      return reponse.end();
    }
    fin = Math.min(fin, infos.size - 1);
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
});

serveur.listen(PORT, HOTE, () => {
  console.log(`yole: écoute sur http://${HOTE}:${PORT}/`);
});
