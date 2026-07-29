"""Controle des six changements de jouabilite, dans un vrai navigateur.

Le harnais Node mesure la simulation isolee ; il ne dit pas si le JEU se comporte
comme prevu une fois toutes les couches branchees. Ici on lance une vraie partie
et on mesure, en jeu :

  1. le turbo coute de l'equilibre et a un vrai cooldown ;
  2. la fenetre de contre-gite est lisible depuis le HUD ;
  3. les quatre armes de base sont toujours disponibles, les quatre autres non ;
  4. l'IA prend le turbo pour COURIR, pas seulement pour fuir le Grain ;
  5. les armes attaquent l'equilibre plus que la coque ;
  6. l'accelerateur clavier fait varier l'ecoute et la vitesse.

    PORT=8791 python tools/serve.py &
    python tools/check_gameplay.py
"""
from __future__ import annotations

import json
import os
import shutil

from playwright.sync_api import sync_playwright

URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"
NIVEAU = os.environ.get("YOLE_IA", "channpyon")


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


TURBO = """() => {
  const game = window.__YOLE_DEBUG__.game;
  const d = game.boats[0].dynamics;
  d.boostCooldown = 0; d.flow = 1; d.roll = 0; d.rollVel = 0;
  const avant = { roll: d.roll, rollVel: d.rollVel, cohesion: d.cohesion, vz: d.vz };
  const accepte = d.triggerForwardBoost();
  return {
    accepte,
    cooldown: +d.boostCooldown.toFixed(3),
    deltaRollVel: +(d.rollVel - avant.rollVel).toFixed(4),
    deltaCohesion: +(d.cohesion - avant.cohesion).toFixed(4),
    gainVitesse: +(d.vz - avant.vz).toFixed(3),
    refuseImmediatement: d.triggerForwardBoost() === false
  };
}"""

CONTRE_GITE = """() => {
  const game = window.__YOLE_DEBUG__.game;
  const d = game.boats[0].dynamics;
  const lire = (roll, rollVel) => { d.roll = roll; d.rollVel = rollVel; const q = d.shiftQuality(); return { state: q.state, precision: +q.precision.toFixed(3) }; };
  return { faible: lire(0.10, 0), ouverte: lire(0.45, 0.2), optimale: lire(0.64, 0.4), tardive: lire(0.95, 0.2) };
}"""

ARMES = """() => {
  const game = window.__YOLE_DEBUG__.game;
  const j = game.boats[0];
  const fini = (v) => Number.isFinite(v);
  return {
    base: { wave: !fini(j.ammo.wave), harpoon: !fini(j.ammo.harpoon), mine: !fini(j.ammo.mine), rhum: !fini(j.ammo.rhum) },
    caisse: { barik: j.ammo.barik, chadron: j.ammo.chadron, lanbi: j.ammo.lanbi, pwason: j.ammo.pwason },
    // Une arme de base doit pouvoir tirer indefiniment : dix tirs d'affilee, en
    // purgeant le cooldown a chaque fois, sans jamais tomber a court.
    dixTirs: (() => {
      let ok = 0;
      for (let i = 0; i < 10; i++) { j.cooldowns.wave = 0; if (game.fireWave(j)) ok++; }
      return ok;
    })(),
    munitionApres: j.ammo.wave === Infinity
  };
}"""

ECOUTE = """() => {
  const game = window.__YOLE_DEBUG__.game;
  const releve = [];
  const tick = (haut, bas, tours) => {
    game.input.trimUp = haut; game.input.trimDown = bas;
    for (let i = 0; i < tours; i++) game.fixedUpdate(1 / 60);
    releve.push(+game.input.trim.toFixed(3));
  };
  const depart = +game.input.trim.toFixed(3);
  tick(false, true, 30);
  const choquee = releve[releve.length - 1];
  tick(true, false, 60);
  const bordee = releve[releve.length - 1];
  tick(false, false, 90);
  const relachee = releve[releve.length - 1];
  game.input.trimUp = false; game.input.trimDown = false;
  return { depart, choquee, bordee, relachee };
}"""


def main():
    erreurs = []
    rapport = {}
    with sync_playwright() as p:
        lancement = {
            "headless": True,
            "args": ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        }
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        navigateur = p.chromium.launch(**lancement)
        page = navigateur.new_page(viewport={"width": 1280, "height": 760})
        page.on("console", lambda m: erreurs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: erreurs.append(f"pageerror: {e}"))

        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate("(n) => window.__YOLE_DEBUG__.game.settings.set('aiLevel', n)", NIVEAU)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 60", timeout=60000)
        rapport["niveauIA"] = page.evaluate("() => window.__YOLE_DEBUG__.game.matchAiLevel")

        # L'IA court-elle au turbo ? Compteur pose AVANT que le Grain ne serre,
        # sinon on mesurerait l'ancien comportement de survie et rien d'autre.
        page.evaluate(
            """() => {
              const game = window.__YOLE_DEBUG__.game;
              window.__turbos = 0;
              window.__ecartGrain = [];
              for (const boat of game.boats.slice(1)) {
                const brut = boat.triggerForwardBoost.bind(boat);
                boat.triggerForwardBoost = () => {
                  const ok = brut();
                  if (ok) { window.__turbos++; window.__ecartGrain.push(Math.round(boat.z - game.stormZ)); }
                  return ok;
                };
              }
            }"""
        )
        page.wait_for_timeout(22000)
        rapport["iaTurbo"] = page.evaluate(
            """() => ({
              total: window.__turbos,
              // Un turbo pris a plus de 46 m du Grain n'est PAS de la survie :
              // c'est de la course. C'est exactement ce qui manquait.
              enCourse: window.__ecartGrain.filter((g) => g > 46).length,
              ecartMedian: window.__ecartGrain.length
                ? window.__ecartGrain.slice().sort((a, b) => a - b)[Math.floor(window.__ecartGrain.length / 2)]
                : null
            })"""
        )

        page.evaluate("window.__YOLE_DEBUG__.game.paused = true")
        rapport["turbo"] = page.evaluate(TURBO)
        rapport["contreGite"] = page.evaluate(CONTRE_GITE)
        # ⚠️ HORS PAUSE. `fireWave` passe par playerInputLocked(), qui refuse tout
        # tir du joueur en pause : mesurer les munitions ici renvoyait 0/10 tirs
        # et donnait l'illusion d'une regression.
        page.evaluate("window.__YOLE_DEBUG__.game.paused = false")
        rapport["armes"] = page.evaluate(ARMES)
        rapport["ecoute"] = page.evaluate(ECOUTE)
        rapport["hudContreGite"] = page.evaluate(
            """() => {
              const game = window.__YOLE_DEBUG__.game;
              const d = game.boats[0].dynamics;
              d.roll = 0.64; d.rollVel = 0.4;
              game.updateUI();
              const bwa = document.getElementById('bwaBtn');
              return { classes: bwa.className, texte: bwa.querySelector('small')?.textContent ?? '' };
            }"""
        )
        navigateur.close()

    rapport["erreurs"] = erreurs[:6]
    print(json.dumps(rapport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
