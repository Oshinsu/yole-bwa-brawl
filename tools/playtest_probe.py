"""Une VRAIE partie, pilotee comme un joueur, et tout ce qui se passe dedans.

La suite `npm run verify` mesure des invariants ; elle ne dit pas si le jeu est
JOUABLE. Ce harnais joue 60 secondes avec des entrees plausibles et rapporte ce
qu'un joueur subit : chavirages, eliminations, temps passe hors controle,
vitesse moyenne, et l'etat du HUD a intervalles reguliers.

    PORT=8791 python tools/serve.py &
    python tools/playtest_probe.py
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

SORTIE = Path(__file__).resolve().parent.parent / "previews" / "playtest"
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"
SECONDES = int(os.environ.get("YOLE_SECONDES", "60"))
# ⚠️ Une seule graine ne mesure RIEN sur les abordages : releve de 3,5 a 37,6 par
# minute d'un niveau a l'autre sur des echantillons uniques de 45 s. Le nombre de
# graines est donc un parametre, et la sortie donne mediane et etendue.
GRAINES = [g for g in os.environ.get("YOLE_GRAINES", "").split(",") if g]
NIVEAU = os.environ.get("YOLE_IA", "tour")

# Sonde posee AVANT la partie : elle compte les evenements subis par le joueur
# au fil de l'eau, ce qu'aucune capture ponctuelle ne peut montrer.
INSTRUMENTER = """() => {
  const game = window.__YOLE_DEBUG__.game;
  const joueur = game.boats[0];
  const t = { chavirages: 0, eliminations: 0, turbosAcceptes: 0, turbosRefuses: 0,
              shiftsParfaits: 0, shiftsRates: 0, tirs: 0, echantillons: 0,
              sommeVitesse: 0, sommeRoll: 0, ticksHorsControle: 0, rollMax: 0,
              vitesseMin: Infinity, vitesseMax: 0 };
  window.__t = t;

  const boostBrut = joueur.triggerForwardBoost.bind(joueur);
  joueur.triggerForwardBoost = () => { const ok = boostBrut(); ok ? t.turbosAcceptes++ : t.turbosRefuses++; return ok; };
  const shiftBrut = joueur.triggerShift.bind(joueur);
  joueur.triggerShift = () => { const r = shiftBrut(); if (r.critical) t.shiftsParfaits++; else if (!r.recovery) t.shiftsRates++; return r; };
  const tirBrut = game.fireWave.bind(game);
  game.fireWave = (o) => { const ok = tirBrut(o); if (ok && o === joueur) t.tirs++; return ok; };
  // Ce que le joueur SUBIT : chaque coup encaisse, avec son couple de roulis.
  t.coupsRecus = 0; t.sommeRollRecu = 0; t.coupsIA = 0;
  t.parSource = { arme: [0, 0], abordage: [0, 0] };
  const hitBrut = joueur.applyHit.bind(joueur);
  joueur.applyHit = (src, data) => {
    const roll = Math.abs(data?.rollImpulse ?? 0);
    t.coupsRecus++;
    t.sommeRollRecu += roll;
    if (src && src !== joueur) t.coupsIA++;
    const source = data?.fromWeapon ? 'arme' : 'abordage';
    t.parSource[source][0]++;
    t.parSource[source][1] += roll;
    return hitBrut(src, data);
  };
  // Et ce que les IA tirent, toutes armes confondues.
  t.tirsIA = 0;
  for (const cle of ['fireWave', 'fireHarpoon', 'dropMine', 'drinkRhum']) {
    const brut = game[cle].bind(game);
    game[cle] = (o, ...reste) => { const ok = brut(o, ...reste); if (ok && o !== joueur) t.tirsIA++; return ok; };
  }

  const elimBrut = game.eliminate.bind(game);
  game.eliminate = (b, raison) => {
    if (b === joueur) { t.eliminations++; if (String(raison).includes('CHAVIR')) t.chavirages++; }
    return elimBrut(b, raison);
  };

  const fixeBrut = game.fixedUpdate.bind(game);
  game.fixedUpdate = (dt) => {
    const r = fixeBrut(dt);
    t.echantillons++;
    const v = joueur.speed * 3.6;
    t.sommeVitesse += v;
    if (v < t.vitesseMin) t.vitesseMin = v;
    if (v > t.vitesseMax) t.vitesseMax = v;
    const roll = Math.abs(joueur.roll);
    t.sommeRoll += roll;
    if (roll > t.rollMax) t.rollMax = roll;
    // « Hors controle » : au-dela de 0,34 rad on est dans la fenetre de
    // contre-gite, c'est-a-dire qu'on subit au lieu de piloter.
    if (roll > 0.34 || joueur.eliminated) t.ticksHorsControle++;
    return r;
  };
}"""


AUTOPILOTE = """(mode) => {
  const game = window.__YOLE_DEBUG__.game;
  const j = game.boats[0];
  window.__auto = mode;
  if (window.__autoPose) return;
  window.__autoPose = true;
  const brut = game.fixedUpdate.bind(game);
  game.fixedUpdate = (dt) => {
    if (window.__auto === 'competent' && !j.eliminated) {
      // Barre vers le centre du couloir, comme le fait l'IA : c'est le
      // pilotage de base que tout joueur correct applique.
      // Formule du couloir, reprise de src/render/world.js (routeCenter).
      const zc = j.z + 28;
      const centre = Math.sin(zc * 0.0062) * 21 + Math.sin(zc * 0.014 + 0.9) * 8;
      const cible = Math.atan2(centre - j.x, 28);
      let ecart = cible - j.dynamics.heading;
      while (ecart > Math.PI) ecart -= Math.PI * 2;
      while (ecart < -Math.PI) ecart += Math.PI * 2;
      // ⚠️ SIGNE NEGATIF : la convention de barre a ete retournee (positif =
      // vers la droite de l'ECRAN). Sans ce signe, l'autopilote braquait a
      // l'OPPOSE du couloir et le bateau partait en vrille — 15 km/h, mange par
      // le Grain. Le harnais mesurait alors sa propre erreur, pas le jeu.
      game.input.steer = Math.max(-1, Math.min(1, -ecart * 1.8));
      const gite = Math.abs(j.roll);
      // Choquer quand ca gite fort, border quand c'est plat : le reflexe du
      // marin, et exactement ce que l'accelerateur permet desormais.
      // ⚠️ Seuils relevés avec la gîte de navigation. À 0,22/0,46 le pilote
      // choquait la voile en PERMANENCE dès que la gîte a augmenté : bateau à
      // 18 km/h, mangé par le Grain, et une gîte moyenne de 1,05 rad qui ne
      // mesurait plus que le temps passé chaviré en repêchage. Le harnais
      // mesurait son propre réflexe, pas le jeu.
      game.input.trimUp = gite < 0.34;
      game.input.trimDown = gite > 0.62;
      const q = j.dynamics.shiftQuality(window.__q || (window.__q = {}));
      if (q.state === 'critical' && q.precision > 0.5) game.input.actions |= 8;
      if (gite < 0.20 && j.dynamics.boostCooldown <= 0 && j.flow > 0.5) game.input.actions |= 32;
      if (game.tick % 210 === 0) game.input.actions |= 1;
    }
    return brut(dt);
  };
}"""

BILAN = """() => {
  const t = window.__t;
  const game = window.__YOLE_DEBUG__.game;
  const j = game.boats[0];
  const n = Math.max(1, t.echantillons);
  return {
    secondesSimulees: +(t.echantillons / 60).toFixed(1),
    vitesseMoyenneKmh: +(t.sommeVitesse / n).toFixed(1),
    vitesseMinKmh: +t.vitesseMin.toFixed(1),
    vitesseMaxKmh: +t.vitesseMax.toFixed(1),
    rollMoyenRad: +(t.sommeRoll / n).toFixed(3),
    rollMaxRad: +t.rollMax.toFixed(3),
    pourcentHorsControle: +(t.ticksHorsControle * 100 / n).toFixed(1),
    chavirages: t.chavirages,
    eliminations: t.eliminations,
    turbosAcceptes: t.turbosAcceptes,
    turbosRefuses: t.turbosRefuses,
    shiftsParfaits: t.shiftsParfaits,
    shiftsRates: t.shiftsRates,
    tirs: t.tirs,
    coupsRecus: t.coupsRecus,
    coupsRecusParMinute: +(t.coupsRecus * 3600 / Math.max(1, t.echantillons)).toFixed(1),
    rollRecuMoyen: +(t.sommeRollRecu / Math.max(1, t.coupsRecus)).toFixed(3),
    tirsIA: t.tirsIA,
    tirsIAParMinute: +(t.tirsIA * 3600 / Math.max(1, t.echantillons)).toFixed(1),
    // Roulis subi par minute, VENTILE par origine. C'est la seule mesure qui
    // dise quoi regler.
    rollParMinute: Object.fromEntries(Object.entries(t.parSource).map(
      ([cle, [nb, somme]]) => [cle, {
        coups: nb,
        coupsParMinute: +(nb * 3600 / n).toFixed(1),
        rollParMinute: +(somme * 3600 / n).toFixed(2)
      }]
    )),
    scoreFinal: game.boats.map((b) => b.score),
    positionJoueur: 1 + game.boats.filter((b) => b.z > j.z).length,
    manche: game.round,
    mode: game.mode
  };
}"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def une_partie(graine=""):
    SORTIE.mkdir(parents=True, exist_ok=True)
    erreurs = []
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
        page.on("console", lambda m: erreurs.append(f"{m.type}: {m.text[:200]}") if m.type == "error" else None)
        page.on("pageerror", lambda e: erreurs.append(f"pageerror: {str(e)[:200]}"))

        url = URL if not graine else URL + f"&seed={graine}"
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate("(n) => window.__YOLE_DEBUG__.game.settings.set('aiLevel', n)", NIVEAU)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 30", timeout=60000)
        page.evaluate(INSTRUMENTER)
        MODE = os.environ.get("YOLE_PILOTE", "manuel")
        if MODE == "competent":
            page.evaluate(AUTOPILOTE, MODE)

        if MODE == "competent":
            for seconde in range(SECONDES):
                page.wait_for_timeout(1000)
                if seconde in (5, 20, 40, SECONDES - 1):
                    page.screenshot(path=str(SORTIE / f"auto_t{seconde:03d}.png"))
            bilan = page.evaluate(BILAN)
            navigateur.close()
            # ⚠️ RENVOYER, pas imprimer. Cette branche datait de l'epoque ou la
            # fonction s'appelait main() ; devenue une_partie(), elle rendait
            # None et l'agregation multi-graines plantait sur le premier acces.
            bilan["erreursConsole"] = erreurs[:8]
            bilan["pilote"] = MODE
            bilan["graine"] = graine or "(defaut)"
            return bilan

        # Pilotage plausible : on borde, on barre en alternance, on tire, on
        # contre-gite quand ca penche, et on met le turbo de temps en temps.
        page.keyboard.down("ArrowUp")
        page.wait_for_timeout(900)
        page.keyboard.up("ArrowUp")

        for seconde in range(SECONDES):
            phase = seconde % 10
            if phase in (1, 2):
                page.keyboard.down("KeyD")
            elif phase == 3:
                page.keyboard.up("KeyD")
            elif phase in (6, 7):
                page.keyboard.down("KeyA")
            elif phase == 8:
                page.keyboard.up("KeyA")
            if phase == 0:
                page.keyboard.press("KeyW")
            if phase == 4:
                page.keyboard.press("Space")
            # Contre-gite quand le HUD dit que la fenetre est ouverte : c'est
            # exactement ce que ferait un joueur qui lit le bouton.
            ouverte = page.evaluate(
                "() => document.getElementById('bwaBtn')?.classList.contains('shift-open') ?? false"
            )
            if ouverte:
                page.keyboard.press("ShiftLeft")
            page.wait_for_timeout(1000)
            if seconde in (5, 20, 40, SECONDES - 1):
                page.screenshot(path=str(SORTIE / f"t{seconde:03d}.png"))

        page.keyboard.up("KeyD")
        page.keyboard.up("KeyA")
        bilan = page.evaluate(BILAN)
        navigateur.close()

    bilan["erreursConsole"] = erreurs[:8]
    bilan["graine"] = graine or "(defaut)"
    return bilan


def mediane(valeurs):
    tri = sorted(valeurs)
    n = len(tri)
    return tri[n // 2] if n % 2 else (tri[n // 2 - 1] + tri[n // 2]) / 2


def main():
    if not GRAINES:
        print(json.dumps(une_partie(), ensure_ascii=False, indent=1))
        return

    parties = [une_partie(g) for g in GRAINES]
    agrege = {"graines": len(parties), "secondesParPartie": SECONDES, "parGraine": []}
    for cle in ("rollMoyenRad", "pourcentHorsControle", "vitesseMoyenneKmh",
                "chavirages", "eliminations", "tirsIAParMinute"):
        valeurs = [p[cle] for p in parties]
        agrege[cle] = {"mediane": round(mediane(valeurs), 3),
                       "min": round(min(valeurs), 3), "max": round(max(valeurs), 3)}
    for source in ("arme", "abordage"):
        valeurs = [p["rollParMinute"][source]["coupsParMinute"] for p in parties]
        rolls = [p["rollParMinute"][source]["rollParMinute"] for p in parties]
        agrege[source] = {
            "coupsParMinute": {"mediane": round(mediane(valeurs), 2),
                               "min": round(min(valeurs), 2), "max": round(max(valeurs), 2)},
            "rollParMinute": {"mediane": round(mediane(rolls), 2),
                              "min": round(min(rolls), 2), "max": round(max(rolls), 2)}
        }
    agrege["parGraine"] = [
        {"graine": p["graine"], "abordages": p["rollParMinute"]["abordage"]["coupsParMinute"],
         "armes": p["rollParMinute"]["arme"]["coupsParMinute"], "roll": p["rollMoyenRad"]}
        for p in parties
    ]
    agrege["erreursConsole"] = [e for p in parties for e in p["erreursConsole"]][:8]
    print(json.dumps(agrege, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
