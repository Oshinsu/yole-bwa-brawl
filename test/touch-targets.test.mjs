// Contrat des cibles tactiles du poste de pilotage.
//
// Mesuré le 12 août 2026 au navigateur, en paysage mobile réel : les deux
// actions du pouce droit (contre-gîte, arme) et le pad du pouce gauche
// doivent rester au-dessus du plancher de 48 px — 48 dp Material, qui couvre
// aussi les 44 pt Apple. Ce test lit la FEUILLE DE STYLE plutôt que le rendu :
// il tourne sans navigateur, donc dans la même passe que le reste de `verify`,
// et il attrape la seule régression qui compte ici — quelqu'un qui rapetisse
// une commande dans une future refonte.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(ROOT, "style.css"), "utf8");
// Les commentaires CITENT les règles supprimées — c'est même leur intérêt.
// Sans ce dépouillement, le test attrape sa propre documentation.
const css = source.replace(/\/\*[\s\S]*?\*\//g, "");

const PLANCHER = 48;

// Le bloc tactile paysage, borné par ses marqueurs de section.
const debut = source.indexOf("=== V18 · POSTE DE PILOTAGE TACTILE");
assert.ok(debut > 0, "le bloc tactile V18 a disparu de la feuille de style");
// Le bloc est lu SANS ses commentaires, pour la même raison.
const bloc = source
  .slice(debut, source.indexOf("=== END V18", debut))
  .replace(/\/\*[\s\S]*?\*\//g, "");

function cote(selecteur, propriete) {
  const regle = new RegExp(`${selecteur}\\s*\\{[^}]*?${propriete}\\s*:\\s*(\\d+)px`, "s");
  const trouve = bloc.match(regle);
  assert.ok(trouve, `${selecteur} ne déclare plus de ${propriete} en paysage court`);
  return Number(trouve[1]);
}

const mesures = {
  padLargeur: cote("\\.joystick", "width"),
  padHauteur: cote("\\.joystick", "height"),
  pommeau: cote("\\.joy-knob", "width"),
  armeLargeur: cote("\\.action\\.slot", "width"),
  armeHauteur: cote("\\.action\\.slot", "height"),
  contreGiteLargeur: cote("#bwaBtn", "width"),
  contreGiteHauteur: cote("#bwaBtn", "height"),
  utilitaire: cote("\\.top-actions \\.icon-btn", "width")
};

for (const [nom, valeur] of Object.entries(mesures)) {
  assert.ok(
    valeur >= PLANCHER,
    `${nom} tombe à ${valeur} px, sous le plancher tactile de ${PLANCHER} px`
  );
}
// Le pad porte un geste continu, pas un appui : il lui faut plus que le
// plancher, sinon la course utile du pouce se réduit à quelques pixels.
assert.ok(mesures.padLargeur >= 112, `le pad tombe à ${mesures.padLargeur} px (minimum 112)`);

// ⚠️ LA RÉGRESSION HISTORIQUE : le contre-gîte en `position:fixed` avec un
// `bottom` calculé se retrouvait AU CENTRE DE L'ÉCRAN sur un téléphone
// (mesuré 53 % de hauteur sur 844×390), posé sur la yole. Il doit rester dans
// le flux de la grappe basse droite.
assert.match(
  bloc,
  /#bwaBtn\s*\{[^}]*position\s*:\s*static/s,
  "le contre-gîte est repassé en position fixe : il retombera sur la yole"
);
// Restreint aux blocs `#bwaBtn` EUX-MÊMES : balayer tout le reste de la
// feuille attrapait le `bottom` en vh d'autres composants, qui eux ont le
// droit d'en avoir un.
const blocsBwa = [...css.matchAll(/#bwaBtn[^{}]*\{([^}]*)\}/g)].map((m) => m[1]);
assert.ok(blocsBwa.length > 0, "plus aucune règle #bwaBtn dans la feuille");
for (const regle of blocsBwa) {
  assert.ok(
    !/bottom\s*:\s*[^;]*vh/.test(regle),
    "un `bottom` en vh est revenu sur le contre-gîte — c'est ce qui le centrait"
  );
}

// Les commandes ne doivent jamais rendre la main au pan/zoom du navigateur.
assert.match(
  css,
  /\.action,\s*\.top-actions \.icon-btn,\s*\.joystick\s*\{\s*touch-action\s*:\s*none/s,
  "les commandes ont perdu leur touch-action:none"
);

console.log(JSON.stringify({ ok: true, plancherPx: PLANCHER, mesures }, null, 2));
