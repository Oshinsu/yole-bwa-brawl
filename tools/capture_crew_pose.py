"""Gros plan sur la pose d'equipage, sous trois angles.

La pose de rappel se juge de PRES et de COTE. Les captures de jeu la montrent a
40 px de haut, vue de l'arriere : c'est precisement l'angle ou l'erreur de lacet
etait invisible. Ici on place la camera au ras de l'eau, par le travers, et on
gele une gite franche pour que l'equipage soit sorti au maximum.

    PORT=8791 python tools/serve.py &
    python tools/capture_crew_pose.py
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

SORTIE = Path(__file__).resolve().parent.parent / "previews" / "equipage"
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"

# Trois points de vue, en coordonnees RELATIVES a la yole du joueur.
# (nom, offset camera, cible, description)
ANGLES = [
    # Par le travers, au niveau des bois : c'est l'angle ou le lacet se lit.
    ("01_travers", (7.2, 1.4, 0.0), (1.6, 0.7, 0.0)),
    # Trois-quarts arriere, hauteur d'epaule.
    ("02_trois_quarts", (5.8, 2.4, -5.2), (1.4, 0.5, 0.0)),
    # Ras de l'eau, sous les hommes sortis : montre l'accroche au bois.
    ("03_ras_eau", (6.4, 0.35, 2.4), (1.8, 0.9, 0.0)),
    # ⚠️ VUE DE DESSUS — l'angle qui manquait, et le plus revelateur.
    #
    # Les trois cadrages precedents sont tous de PROFIL. Ils montrent bien
    # l'orientation d'un homme, et masquent completement trois defauts que les
    # photos de course rendent evidents : la DENSITE de la grappe (sur les
    # photos les epaules se touchent, ici les hommes sont espaces comme des
    # perles), l'INTERPENETRATION des bwa dans les corps, et la monotonie de six
    # poses identiques. Aucune mesure d'angle ne peut les detecter — ce sont des
    # proprietes de l'ENSEMBLE, pas d'un homme.
    ("04_dessus", (1.6, 8.5, 0.2), (1.6, 0.55, 0.0)),
    # Gros plan serre sur un seul equipier : montre si le bois passe DANS le
    # corps ou sous lui, et ou vont reellement les mains.
    ("05_contact", (3.1, 1.05, 1.35), (2.35, 0.72, 0.15)),
    # ⚠️ LA DISTANCE DE JEU — le seul cadrage que le JOUEUR voit reellement.
    #
    # Les cinq precedents sont des gros plans d'atelier. Ils servent a juger une
    # pose, et ils mentent sur ce qui compte : a cette distance-ci, le detail
    # d'articulation est invisible et seule se lit la SILHOUETTE D'ENSEMBLE —
    # la masse de l'equipage, la longueur des perches, l'encombrement du greement.
    #
    # Un defaut majeur (les bwa depassant de 2,5 m au-dela du dernier homme, qui
    # faisait lire la yole comme un rateau) n'etait visible QUE d'ici.
    ("06_vue_de_jeu", (0.0, 9.5, -17.0), (0.0, 1.2, 1.5)),
]

POSE = """({ dx, dy, dz, tx, ty, tz, roll }) => {
  const game = window.__YOLE_DEBUG__.game;
  game.paused = true;
  // ⚠️ Il ne suffit PAS de mettre en pause : frame() continue de tourner et
  // updateCamera() reecrit la pose a chaque image. La capture montrait donc la
  // camera de jeu, pas celle demandee. On coupe la boucle de rendu, et plus
  // rien ne dessine en dehors des appels explicites ci-dessous.
  game.renderer.setAnimationLoop(null);
  const boat = game.boats[0];
  const d = boat.dynamics;
  d.roll = roll;
  d.rollVel = 0;
  d.activeCrew = 6;
  for (let i = 0; i < 6; i++) {
    d.crewPositions[i] = -Math.sign(roll) * (0.62 + i * 0.05);
    d.crewVelocities[i] = 0;
  }
  // ⚠️ `rollSlow` est LISSE (damp a 0,55) et la position laterale de chaque
  // homme aussi (damp a 10,5) : un seul appel a update() laisse l'equipage a sa
  // pose precedente, c'est-a-dire debout au centre. On force la valeur lissee
  // puis on laisse converger deux secondes de temps simule.
  boat.visual.rollSlow = roll;
  for (let i = 0; i < 140; i++) boat.visual.update(d, game.time + i / 60, 1 / 60, game.atmosphere.weather);

  // Le bord au vent, ou l'equipage sort, est -sign(roll). La camera doit donc
  // etre de CE cote-la, sinon on photographie la coque de dos.
  const windward = -Math.sign(roll) || 1;
  const root = boat.visual.root.position;
  game.camera.position.set(root.x + dx * windward, root.y + dy, root.z + dz);
  game.camera.lookAt(root.x + tx * windward, root.y + ty, root.z + tz);
  game.camera.fov = 38;
  game.camera.updateProjectionMatrix();
  game.postFX.render(game.scene, game.camera);
  const homme = boat.visual.crew[3].visual;
  return {
    roll: +d.roll.toFixed(2),
    windward,
    // Lacet et renversement effectivement appliques au 4e equipier.
    lacetDeg: +(homme.root.rotation.y * 180 / Math.PI).toFixed(1),
    renversementDeg: +(homme.hips.rotation.x * 180 / Math.PI).toFixed(1),
    deportX: +homme.root.position.x.toFixed(2)
  };
}"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
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
        page = navigateur.new_page(viewport={"width": 1100, "height": 700})
        page.on("console", lambda m: erreurs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: erreurs.append(f"pageerror: {e}"))

        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate("document.getElementById('playBtn').click()")
        # ⚠️ L'INITIATION EXPRESS S'INTERPOSE, et elle est PLEIN ECRAN.
        # Depuis qu'elle existe, `playBtn` ouvre un tutoriel en quatre etapes au
        # lieu de lancer la manche : les captures montraient le modal, pas la
        # yole. On le passe s'il est la.
        page.evaluate(
            "() => { const b = document.getElementById('onboardingSkipBtn');"
            " if (b && b.offsetParent !== null) b.click(); }"
        )
        page.wait_for_timeout(600)
        # ⚠️ CE HARNAIS N'A PAS BESOIN DE LA BOUCLE DE JEU, et l'attendre le
        # faisait echouer.
        #
        # Deux pieges cumules : le depart 3-2-1-GO GELE `tick` a 0 pendant ~4 s
        # (ce harnais lui est anterieur), et sous swiftshader logiciel la boucle
        # tourne trop lentement pour atteindre 60 images en deux minutes. Or
        # POSE ci-dessous coupe de toute facon `setAnimationLoop`, appelle
        # `visual.update()` a la main et declenche `postFX.render()` lui-meme.
        #
        # On attend donc seulement que la yole EXISTE, et on force le rebours.
        page.wait_for_function(
            "Boolean(window.__YOLE_DEBUG__.game?.boats?.[0]?.visual)", timeout=90000
        )
        page.evaluate("() => { window.__YOLE_DEBUG__.game.countdown = 0; }")
        page.wait_for_timeout(1200)
        page.evaluate("() => window.__YOLE_DEBUG__.game.quality.setTier(2, true)")
        page.wait_for_timeout(900)
        # Le HUD masquerait la moitie du sujet.
        page.evaluate("() => document.getElementById('hud').style.display = 'none'")

        for nom, (dx, dy, dz), (tx, ty, tz) in ANGLES:
            rapport[nom] = page.evaluate(
                POSE, {"dx": dx, "dy": dy, "dz": dz, "tx": tx, "ty": ty, "tz": tz, "roll": 0.52}
            )
            page.locator("#viewport canvas").screenshot(path=str(SORTIE / f"{nom}.png"))

        navigateur.close()

    rapport["erreurs"] = erreurs[:5]
    print(json.dumps(rapport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
