import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readText = (relative) => readFile(resolve(root, relative), "utf8");

const [
  mainSource,
  gameSource,
  assetsSource,
  oceanSource,
  skySource,
  postSource,
  yoleSource,
  cssSource,
  workerSource
] = await Promise.all([
  readText("src/main.js"),
  readText("src/game/game.js"),
  readText("src/render/assets.js"),
  readText("src/render/ocean.js"),
  readText("src/render/sky.js"),
  readText("src/render/vfx.js"),
  readText("src/render/yole-visual.js"),
  readText("style.css"),
  readText("service-worker.js")
]);

// Le slice est opt-in : la route normale ne charge ni le panorama expérimental
// ni les quatre prises d'encrage supplémentaires.
assert.match(mainSource, /pageParams\.get\("da"\)\s*===\s*"gravure"/);
assert.match(mainSource, /if\s*\(graphicStyleTest\)\s*\{[\s\S]*backdropGraphic/);
assert.doesNotMatch(
  assetsSource,
  /backdropGraphic\s*:/,
  "the experimental panorama must not enter the default texture bundle"
);
assert.doesNotMatch(
  workerSource,
  /gravure_alize_backdrop/,
  "the opt-in experiment must not increase the production offline cache"
);

// Le drapeau ne touche que la présentation. Le même paramètre alimente le ciel,
// la mer, la composition et les matériaux de yole.
assert.match(gameSource, /this\.graphicStyle\s*=\s*params\.get\("da"\)\s*===\s*"gravure"/);
assert.match(gameSource, /graphicStyle:\s*this\.graphicStyle/);
for (const [name, source] of [
  ["ocean", oceanSource],
  ["sky", skySource],
  ["post", postSource]
]) {
  assert.match(source, /uGraphicStyle/, `${name} must expose the graphic-style uniform`);
}
assert.match(oceanSource, /windSpace[\s\S]*inkRibbon/);
assert.match(postSource, /posterBand[\s\S]*inkEdge/);
assert.match(skySource, /graphicSunDisc[\s\S]*cloudV/);
assert.match(skySource, /vec3\(0\.19,\s*0\.74,\s*1\.0\)[\s\S]*vec3\(0\.035,\s*0\.43,\s*0\.96\)/);
assert.match(gameSource, /this\.graphicStyle[\s\S]*new THREE\.Vector3\(-0\.10,\s*0\.10,\s*0\.99\)/);
assert.match(yoleSource, /if\s*\(this\.graphicStyle\)[\s\S]*THREE\.BackSide/);
assert.match(cssSource, /html\[data-art-style="gravure"\]/);

const backdropPath = resolve(
  root,
  "assets/textures/experiments/gravure_alize_backdrop.webp"
);
const screenshotPath = resolve(root, "assets/screenshots/gravure-alize-caribbean-sky.jpg");
const [backdrop, screenshot, backdropInfo, screenshotInfo] = await Promise.all([
  readFile(backdropPath),
  readFile(screenshotPath),
  stat(backdropPath),
  stat(screenshotPath)
]);

assert.equal(backdrop.subarray(0, 4).toString("ascii"), "RIFF");
assert.equal(backdrop.subarray(8, 12).toString("ascii"), "WEBP");
assert.ok(backdropInfo.size > 64_000, "the panorama is unexpectedly small");
assert.equal(screenshot.subarray(0, 3).toString("hex"), "ffd8ff");
assert.ok(screenshotInfo.size > 64_000, "the browser proof screenshot is unexpectedly small");

console.log("Gravure Alizé: opt-in assets, shaders, outline and visual proof OK");
