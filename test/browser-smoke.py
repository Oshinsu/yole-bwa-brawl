#!/usr/bin/env python3
"""Browser-level smoke tests for the standalone shader harness and the full UI/game loop.

The game page deliberately uses the deterministic Three.js mock so this test does not
need network access. Custom production shaders are compiled separately in a real WebGL
context on the shader page.
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # Optional outside the validation container.
    sync_playwright = None

ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DIR = ROOT / "previews"
PREVIEW_DIR.mkdir(exist_ok=True)


def chromium_path() -> str:
    for candidate in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
        path = shutil.which(candidate)
        if path:
            return path
    raise RuntimeError("No Chromium executable found")


def main() -> None:
    if sync_playwright is None:
        print(json.dumps({"ok": True, "skipped": "Playwright Python package unavailable"}, indent=2))
        return
    try:
        executable = chromium_path()
    except RuntimeError:
        # Pas de Chromium système dans le PATH : on retombe sur celui embarqué par Playwright.
        executable = None

    report: dict[str, object] = {
        "ok": False,
        "chromium": executable or "playwright-bundled",
        "shader": None,
        "game": None,
        "consoleErrors": [],
        "pageErrors": [],
    }

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                **({"executable_path": executable} if executable else {}),
                args=[
                    "--no-sandbox",
                    "--disable-gpu-sandbox",
                    "--disable-dev-shm-usage",
                    "--ignore-gpu-blocklist",
                    "--enable-webgl",
                    "--use-angle=swiftshader",
                    "--disable-features=UseSkiaRenderer",
                    "--allow-file-access-from-files",
                    "--disable-web-security",
                ],
            )
            context = browser.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=1)

            shader_page = context.new_page()
            shader_page.on("pageerror", lambda exc: report["pageErrors"].append(f"shader: {exc}"))
            shader_page.set_content((ROOT / "test" / "webgl-shader-smoke.html").read_text(encoding="utf-8"), wait_until="load")
            shader_page.wait_for_function("document.title === 'YOLE_SHADER_OK' || document.title === 'YOLE_SHADER_FAIL'", timeout=15000)
            shader_result = json.loads(shader_page.locator("#result").inner_text())
            report["shader"] = shader_result
            if not shader_result.get("ok") and "WebGL context unavailable" in str(shader_result.get("error", "")):
                shader_result["skipped"] = "headless Chromium exposed no WebGL context; EGL/GLES smoke remains authoritative"
            elif not shader_result.get("ok"):
                raise AssertionError(f"Browser WebGL shader smoke failed: {shader_result}")

            game_page = context.new_page()
            game_page.on("pageerror", lambda exc: report["pageErrors"].append(f"game: {exc}"))

            def capture_console(message) -> None:
                if message.type == "error":
                    report["consoleErrors"].append(message.text)

            game_page.on("console", capture_console)
            single_file = (ROOT / "YOLE_BWA_BRAWL_TROPICAL_MAYHEM_V3_2_SINGLE_FILE_ONLINE.html").read_text(encoding="utf-8")
            mock_source = (ROOT / "test" / "mock-three.module.js").read_text(encoding="utf-8")
            bootstrap = (
                "const __mockSource = " + json.dumps(mock_source) + ";\n"
                "const __mockUrl = URL.createObjectURL(new Blob([__mockSource], {type:'text/javascript'}));\n"
                "globalThis.__THREE_MOCK__ = await import(__mockUrl);\n"
                "globalThis.__YOLE_DEBUG_ENABLE__ = true;\n"
            )
            single_file = single_file.replace('<script type="module">', '<script type="module">\n' + bootstrap, 1)
            game_page.set_content(single_file, wait_until="domcontentloaded")
            game_page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=15000)
            game_page.locator("#playBtn").click()
            game_page.wait_for_function("window.__YOLE_DEBUG__.getState().mode === 'playing'", timeout=15000)
            game_page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 20", timeout=15000)

            # Exercise the real DOM/input plumbing rather than calling game methods directly.
            game_page.keyboard.down("ArrowRight")
            game_page.wait_for_timeout(180)
            game_page.keyboard.up("ArrowRight")
            for key in ("Shift", "Space", "KeyE", "KeyQ", "KeyW", "KeyX", "Equal", "Minus"):
                game_page.keyboard.press(key)
                game_page.wait_for_timeout(80)

            # Contrat d'arsenal, relevé AVANT que le test n'écrive ses propres
            # munitions : les quatre armes de base sont en soute en permanence,
            # les quatre armes de caisse démarrent à sec. Placé plus bas, ce
            # contrôle ne mesurait plus que ce que le test venait d'écrire.
            base_ammo = game_page.evaluate(
                """(() => {
                    const player = window.__YOLE_DEBUG__.game.boats[0];
                    const toutes = ["wave", "harpoon", "mine", "rhum",
                                    "barik", "chadron", "lanbi", "pwason"];
                    return {
                        illimitees: toutes.filter((cle) => player.ammo[cle] === Infinity).length,
                        soute: [...player.loadout],
                        // Tout ce qui n'est PAS en soute doit demarrer a sec :
                        // c'est la caisse qui le donne, ou personne.
                        stockDepart: toutes
                            .filter((cle) => Number.isFinite(player.ammo[cle]))
                            .reduce((total, cle) => total + player.ammo[cle], 0)
                    };
                })()"""
            )
            # ⚠️ CONTRAT CHANGE : la yole n'emporte plus QUATRE armes illimitees
            # mais DEUX, choisies au garage. Tout le reste demarre a sec et se
            # ramasse. Voir LOADOUT_POOL dans balance.js.
            if base_ammo["illimitees"] != 2 or base_ammo["stockDepart"] != 0:
                raise AssertionError(f"Contrat d'arsenal rompu: {base_ammo}")
            if len(base_ammo["soute"]) != 2:
                raise AssertionError(f"La soute doit contenir exactement 2 armes: {base_ammo}")

            # Aiming contract: right mouse owns a separate pointer, horizontal
            # travel becomes normalized aim, release fires, and the browser menu
            # never steals the gesture.
            game_page.evaluate(
                """(() => {
                    const game = window.__YOLE_DEBUG__.game;
                    const player = game.boats[0];
                    player.ammo.wave = 1;
                    player.cooldowns.wave = 0;
                    player.activeWeapon = 'wave';
                })()"""
            )
            viewport_box = game_page.locator("#viewport").bounding_box()
            if not viewport_box:
                raise AssertionError("Viewport has no interactive bounding box")
            aim_x = viewport_box["x"] + viewport_box["width"] * 0.5
            aim_y = viewport_box["y"] + viewport_box["height"] * 0.48
            game_page.mouse.move(aim_x, aim_y)
            game_page.mouse.down(button="right")
            game_page.mouse.move(aim_x + 96, aim_y, steps=4)
            # ⚠️ MEME PIEGE QUE LE RELACHEMENT PLUS BAS. `input.aim` et
            # `aimActive` sont bien poses SYNCHRONEMENT par le gestionnaire de
            # pointeur — mais `targetReticle.style.left` et le texte de
            # `#aimHelp` sont ecrits par le RAFRAICHISSEMENT DU HUD, qui tourne
            # sur la boucle de rendu. Or une image peut prendre plus d'une
            # seconde sur SwiftShader : 120 ms ne garantissaient rien, et
            # l'assertion `reticleLeft <= 50` pouvait echouer sur un reticule
            # simplement pas encore repositionne.
            game_page.wait_for_function(
                "parseFloat(document.getElementById('targetReticle')?.style.left || '50') > 50",
                timeout=5000,
            )
            aim_held = game_page.evaluate(
                """(() => {
                    const game = window.__YOLE_DEBUG__.game;
                    return {
                        aim: game.input.aim,
                        aimActive: game.input.aimActive,
                        pointerOwned: game.input.aimPointerId !== null,
                        label: document.getElementById('targetReticleLabel')?.textContent || '',
                        reticleLeft: parseFloat(document.getElementById('targetReticle')?.style.left || '50')
                    };
                })()"""
            )
            game_page.mouse.up(button="right")
            # ⚠️ MEME DEFAUT QUE CELUI DEJA CORRIGE PLUS BAS POUR LE HUD, ET IL
            # A MORDU : `wait_for_timeout(180)` etait un tirage a pile ou face.
            #
            # Relacher la visee ne fait qu'EMPILER un bit d'action ; c'est le
            # pas fixe suivant qui l'execute et decremente la munition. Or ce
            # harnais tourne sur SwiftShader, ou UNE image peut prendre 300 ms :
            # en 180 ms, il arrive qu'aucun pas fixe n'ait tourne. Le test
            # signalait alors une regression inexistante — observe une fois,
            # puis deux passages verts d'affilee sans qu'une ligne ne change.
            #
            # On attend la CONDITION, pas une duree. Si le tir echoue vraiment,
            # l'expiration a 5 s le dit clairement au lieu de le maquiller.
            game_page.wait_for_function(
                "window.__YOLE_DEBUG__.game.boats[0].ammo.wave === 0",
                timeout=5000,
            )
            aim_released = game_page.evaluate(
                """(() => {
                    const game = window.__YOLE_DEBUG__.game;
                    return {
                        aim: game.input.aim,
                        aimActive: game.input.aimActive,
                        pointerOwned: game.input.aimPointerId !== null,
                        waveAmmo: game.boats[0].ammo.wave,
                        contextMenuBlocked: !document.getElementById('viewport').dispatchEvent(
                            new MouseEvent('contextmenu', {bubbles:true, cancelable:true})
                        )
                    };
                })()"""
            )
            game_page.evaluate(
                """(() => {
                    const player = window.__YOLE_DEBUG__.game.boats[0];
                    player.ammo.harpoon = 1;
                })()"""
            )
            game_page.keyboard.press("Digit2")
            # ⚠️ PAS d'attente fixe ici. Le HUD se rafraîchit toutes les 80 ms
            # (uiClock), et attendre exactement 80 ms était un tirage à pile ou
            # face : selon la phase, le DOM avait rafraîchi ou non. Le test a
            # échoué une fois sur quatre environ, en signalant une régression qui
            # n'existait pas. On attend la CONDITION, pas une durée.
            game_page.wait_for_function(
                "document.querySelector('#weaponShortcuts .active')?.dataset.weapon === 'harpoon'",
                timeout=5000,
            )
            shortcut_state = game_page.evaluate(
                """(() => ({
                    activeWeapon: window.__YOLE_DEBUG__.game.boats[0].activeWeapon,
                    activeShortcut: document.querySelector('#weaponShortcuts .active')?.dataset.weapon || '',
                    help: document.getElementById('aimHelp')?.textContent || ''
                }))()"""
            )
            if (
                not aim_held["aimActive"]
                or not aim_held["pointerOwned"]
                or aim_held["aim"] < 0.25
                or "VISÉE" not in aim_held["label"]
                or aim_held["reticleLeft"] <= 50
            ):
                raise AssertionError(f"Desktop aim did not activate or move the reticle: {aim_held}")
            if (
                aim_released["aimActive"]
                or aim_released["pointerOwned"]
                or aim_released["waveAmmo"] != 0
                or not aim_released["contextMenuBlocked"]
            ):
                raise AssertionError(f"Aim release did not fire/clean up correctly: {aim_released}")
            if shortcut_state["activeWeapon"] != "harpoon" or shortcut_state["activeShortcut"] != "harpoon":
                raise AssertionError(f"Digit2 did not select and expose the harpoon slot: {shortcut_state}")

            game_page.locator("#settingsBtn").click()
            game_page.locator("#flashToggle").click()
            game_page.locator("#perfToggle").click()
            game_page.keyboard.press("Escape")
            game_page.wait_for_timeout(750)

            state = game_page.evaluate("window.__YOLE_DEBUG__.getState()")
            telemetry = game_page.evaluate("window.__YOLE_DEBUG__.telemetry()")
            ui_state = game_page.evaluate(
                """(() => {
                    const minimap = document.getElementById('minimapCanvas');
                    const ctx = minimap?.getContext('2d');
                    const pixels = ctx?.getImageData(0, 0, minimap.width, minimap.height).data;
                    let lumaMin = 255;
                    let lumaMax = 0;
                    if (pixels) {
                        const pixelStride = Math.max(1, Math.floor((pixels.length / 4) / 2048));
                        for (let pixel = 0; pixel < pixels.length / 4; pixel += pixelStride) {
                            const offset = pixel * 4;
                            const luma = pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722;
                            lumaMin = Math.min(lumaMin, luma);
                            lumaMax = Math.max(lumaMax, luma);
                        }
                    }
                    const minimapRect = minimap?.getBoundingClientRect();
                    return {
                        hudVisible: !document.getElementById('hud').classList.contains('hidden'),
                        integrityVisible: Boolean(document.querySelector('.integrity-grid')),
                        quality: document.getElementById('qualityBtn').textContent,
                        perfText: document.getElementById('perfStats').textContent,
                        replayControls: Boolean(document.getElementById('downloadReplayBtn')),
                        telemetryControl: Boolean(document.getElementById('downloadTelemetryBtn')),
                        minimapVisible: Boolean(minimapRect && minimapRect.width >= 100 && minimapRect.height >= 100),
                        minimapStatus: document.getElementById('minimapStatus')?.textContent || '',
                        minimapLumaRange: Math.round(lumaMax - lumaMin)
                    };
                })()"""
            )
            game_page.screenshot(path=str(PREVIEW_DIR / "tropical_mayhem_v3_2_browser_mock.png"), full_page=True)

            if state["tick"] <= 20 or state["mode"] != "playing":
                raise AssertionError(f"Game loop did not advance: {state}")
            if not ui_state["hudVisible"] or not ui_state["integrityVisible"]:
                raise AssertionError(f"HUD integrity panel missing: {ui_state}")
            if (
                not ui_state["minimapVisible"]
                or not ui_state["minimapStatus"].startswith("POSITION")
                or ui_state["minimapLumaRange"] < 24
            ):
                raise AssertionError(f"Functional minimap missing or blank: {ui_state}")
            if telemetry["counters"].get("match_start", 0) != 1:
                raise AssertionError(f"Telemetry did not record match start: {telemetry}")

            # Compact landscape is the most constrained HUD layout: keep the map
            # clear of the feed and retain practical touch targets in the top rail.
            game_page.set_viewport_size({"width": 640, "height": 360})
            game_page.wait_for_timeout(150)
            responsive_state = game_page.evaluate(
                """(() => {
                    const map = document.getElementById('minimap').getBoundingClientRect();
                    const feed = document.getElementById('killfeed').getBoundingClientRect();
                    const buttons = [...document.querySelectorAll('.top-actions button')]
                        .filter((button) => {
                            const style = getComputedStyle(button);
                            return style.display !== 'none' && style.visibility !== 'hidden';
                        })
                        .map((button) => button.getBoundingClientRect())
                        .filter((rect) => rect.width > 0 && rect.height > 0);
                    const minTouchTarget = buttons.length
                        ? Math.min(...buttons.flatMap((rect) => [rect.width, rect.height]))
                        : 0;
                    return {
                        minimapBottom: Math.round(map.bottom),
                        killfeedTop: Math.round(feed.top),
                        overlapsKillfeed: map.bottom > feed.top,
                        minTouchTarget: Math.round(minTouchTarget)
                    };
                })()"""
            )
            # ⚠️ 24 px est le plancher WCAG 2.5.8 pour un POINTEUR FIN. Le contrat
            # 44 px, lui, ne vaut que pour un pointeur grossier — et la feuille de
            # style le sert derriere `(pointer:coarse)`. Mesurer 31 px ici et en
            # conclure que le contrat est rompu etait une erreur de lecture : ce
            # contexte-la n'a pas de doigt.
            if responsive_state["overlapsKillfeed"] or responsive_state["minTouchTarget"] < 24:
                raise AssertionError(f"Compact HUD collision or undersized control: {responsive_state}")

            # Le contrat 44 px se verifie donc dans un contexte TACTILE dedie.
            # Sans lui, la promesse du README n'etait couverte par aucun test.
            touch_context = browser.new_context(
                viewport={"width": 640, "height": 360},
                has_touch=True,
                is_mobile=True,
                device_scale_factor=2,
            )
            touch_page = touch_context.new_page()
            touch_errors = []
            touch_page.on("pageerror", lambda error: touch_errors.append(str(error)))
            # Meme source que la page de jeu : le monofichier deja instrumente
            # avec le mock Three. Recharger index.html mesurerait un autre build.
            touch_page.set_content(single_file, wait_until="domcontentloaded")
            touch_page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=15000)
            touch_page.evaluate("document.getElementById('playBtn').click()")
            touch_page.wait_for_timeout(1200)
            touch_state = touch_page.evaluate(
                """(() => {
                    const cibles = [...document.querySelectorAll('.top-actions button, .actions button')]
                        .filter((b) => {
                            const style = getComputedStyle(b);
                            return style.display !== 'none' && style.visibility !== 'hidden';
                        })
                        .map((b) => {
                            const rect = b.getBoundingClientRect();
                            return { id: b.id || b.className, w: Math.round(rect.width), h: Math.round(rect.height) };
                        })
                        .filter((r) => r.w > 0 && r.h > 0);
                    return {
                        pointerCoarse: matchMedia('(pointer:coarse)').matches,
                        controls: cibles.length,
                        minTouchTarget: cibles.length
                            ? Math.min(...cibles.flatMap((r) => [r.w, r.h]))
                            : 0,
                        tooSmall: cibles.filter((r) => Math.min(r.w, r.h) < 44)
                            .map((r) => `${r.id} ${r.w}x${r.h}`)
                    };
                })()"""
            )
            touch_context.close()
            if not touch_state["pointerCoarse"]:
                raise AssertionError(f"Touch context did not report a coarse pointer: {touch_state}")
            # ⚠️ PLANCHER ABAISSE DE 8 A 7. La tuile BWA DASH a ete retiree de
            # la barre : elle etait redondante avec le double-tap A/D au clavier
            # et, depuis, avec le double-coup de barre au doigt. Aucune capacite
            # n'est perdue — le geste tactile est verrouille separement par
            # test/ui-microinteractions.test.mjs, qui exige la presence de
            # JOY_DASH_THRESHOLD dans input.js. Sans ce garde-fou, retirer un
            # bouton tactile sans le remplacer redeviendrait invisible.
            if touch_state["controls"] < 7 or touch_state["tooSmall"]:
                raise AssertionError(f"Touch targets below the 44 px contract: {touch_state}")
            if touch_errors:
                raise AssertionError(f"Touch context page errors: {touch_errors}")

            report["game"] = {
                "tick": state["tick"],
                "mode": state["mode"],
                "quality": state["quality"],
                "three": state["three"],
                "settings": state["settings"],
                "telemetry": telemetry["counters"],
                "aim": {
                    "held": aim_held,
                    "released": aim_released,
                    "shortcut": shortcut_state,
                },
                "ui": ui_state,
                "responsive": responsive_state,
                "touchTargets": touch_state,
                "baseAmmo": base_ammo,
                "screenshot": "previews/tropical_mayhem_v3_2_browser_mock.png",
            }
            browser.close()

        if report["pageErrors"] or report["consoleErrors"]:
            raise AssertionError(
                f"Browser errors detected: page={report['pageErrors']} console={report['consoleErrors']}"
            )
        report["ok"] = True
    finally:
        pass

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
