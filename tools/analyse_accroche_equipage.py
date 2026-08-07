"""Mesure d'accroche équipier ↔ bwa, au millimètre, en état de jeu forcé.

Pour chaque dresseur : distance de l'axe du corps à l'axe de la perche (le
corps doit être LE LONG du bois au rappel, pas en travers), hauteur signée de
la tête et du bassin par rapport à la perche (une tête SOUS la perche lit
« drapé », une tête au-dessus lit « il tient »), et distances mains/pieds à la
perche (la prise).

    PORT=8791 python tools/serve.py &
    python tools/analyse_accroche_equipage.py
"""
from __future__ import annotations

import json
import shutil

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8791/index.html?debug=1"

MESURE = """({ roll, frames }) => {
  const game = window.__YOLE_DEBUG__.game;
  game.paused = true;
  game.renderer.setAnimationLoop(null);
  const boat = game.boats[0];
  const d = boat.dynamics;
  d.roll = roll; d.rollVel = 0; d.activeCrew = 6;
  for (let i = 0; i < 6; i++) {
    d.crewPositions[i] = -Math.sign(roll) * (0.62 + i * 0.05);
    d.crewVelocities[i] = 0;
  }
  boat.visual.rollSlow = roll;
  for (let i = 0; i < frames; i++) boat.visual.update(d, game.time + i / 60, 1 / 60, game.atmosphere.weather);
  const v = boat.visual;
  v.root.updateWorldMatrix(true, true);
  const THREE_V = new (Object.getPrototypeOf(v.root.position).constructor)();
  const os = (visuel, nom) => visuel.rigJoints?.find((e) => e.boneName === nom)?.joint ?? null;
  const monde = (o) => o.getWorldPosition(new (Object.getPrototypeOf(v.root.position).constructor)());
  const lignes = [];
  for (let i = 0; i < v.crew.length; i++) {
    const visuel = v.crew[i].visual;
    // La perche de l'homme : celle dont le z est le plus proche du sien.
    let beam = v.beams[0];
    for (const b of v.beams) {
      if (Math.abs(b.baseZ - visuel.root.position.z) < Math.abs(beam.baseZ - visuel.root.position.z)) beam = b;
    }
    const p0 = monde(beam.root);
    const q = beam.root.getWorldQuaternion(new (Object.getPrototypeOf(beam.root.quaternion).constructor)());
    const dir = new (Object.getPrototypeOf(v.root.position).constructor)(1, 0, 0).applyQuaternion(q).normalize();
    const rel = (p) => { const r = monde(p).sub(p0); return r; };
    const distAxe = (p) => { const r = rel(p); const t = r.dot(dir); return Math.hypot(r.x - dir.x * t, r.y - dir.y * t, r.z - dir.z * t); };
    const hanche = os(visuel, "Hips"), buste = os(visuel, "Spine02"), tete = os(visuel, "Head");
    const mainG = os(visuel, "LeftHand"), mainD = os(visuel, "RightHand");
    const piedG = os(visuel, "LeftFoot"), piedD = os(visuel, "RightFoot");
    if (!hanche || !buste || !tete) continue;
    const axe = rel(buste);
    const corpsDir = axe.clone ? null : null;
    const corps = rel(buste);
    const corpsVec = monde(buste).sub(monde(hanche)).normalize();
    const cosAxe = Math.abs(corpsVec.dot(dir));
    const angleCorpsPerchee = Math.round(Math.acos(Math.min(1, cosAxe)) * 180 / Math.PI);
    const hauteurTete = monde(tete).y - (p0.y + dir.y * rel(tete).dot(dir));
    const hauteurBassin = monde(hanche).y - (p0.y + dir.y * rel(hanche).dot(dir));
    lignes.push({
      homme: i,
      role: visuel.role,
      x: +visuel.root.position.x.toFixed(2),
      angleCorpsPercheDeg: angleCorpsPerchee,
      bassinAxePercheMm: Math.round(distAxe(hanche) * 1000),
      teteAuDessusPercheMm: Math.round(hauteurTete * 1000),
      bassinAuDessusPercheMm: Math.round(hauteurBassin * 1000),
      mainGAxeMm: mainG ? Math.round(distAxe(mainG) * 1000) : null,
      mainDAxeMm: mainD ? Math.round(distAxe(mainD) * 1000) : null,
      piedGAxeMm: piedG ? Math.round(distAxe(piedG) * 1000) : null,
      piedDAxeMm: piedD ? Math.round(distAxe(piedD) * 1000) : null,
      sagDeg: +(v.beamSag[v.beams.indexOf(beam)] * 180 / Math.PI).toFixed(2)
    });
  }
  return lignes;
}"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        c = shutil.which(nom)
        if c:
            return c


def main():
    with sync_playwright() as p:
        kw = {"headless": True, "args": ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
        exe = chromium()
        if exe:
            kw["executable_path"] = exe
        nav = p.chromium.launch(**kw)
        page = nav.new_page(viewport={"width": 900, "height": 600})
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate("document.getElementById('playBtn').click()")
        page.evaluate(
            "() => { const b = document.getElementById('onboardingSkipBtn');"
            " if (b && b.offsetParent !== null) b.click(); }"
        )
        page.wait_for_function(
            "Boolean(window.__YOLE_DEBUG__.game?.boats?.[0]?.visual)", timeout=90000
        )
        page.evaluate("() => { window.__YOLE_DEBUG__.game.countdown = 0; }")
        page.wait_for_timeout(1000)
        for nom, roll in (("rappel_20deg", 0.35), ("rappel_30deg", 0.52)):
            lignes = page.evaluate(MESURE, {"roll": roll, "frames": 220})
            print(f"== {nom} (roll={roll}) ==")
            for l in lignes:
                print(json.dumps(l, ensure_ascii=False))
        nav.close()


if __name__ == "__main__":
    main()
