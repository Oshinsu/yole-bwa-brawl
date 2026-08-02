#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# Empreintes SRI sha384 de three@0.185.1 (octets identiques sur jsDelivr et UNPKG,
# vérifiés par téléchargement croisé des deux CDN).
SRI_MODULE = "sha384-QHQk1LzjJlJYNdthXjKCmffpDRZL3EqJ7LfqBzyKyvGgjAYM2ZVuYtFGg42NcAJ/"
SRI_CORE = "sha384-rx+KIp/9ptjArhnFAcpVoOc/ynktDsRtRJKIbC7YVKylEvFu8sgmzk9RmQ+CIV48"
CDN_JSDELIVR = "https://cdn.jsdelivr.net/npm/three@0.185.1/build"
CDN_UNPKG = "https://unpkg.com/three@0.185.1/build"

# Chargement CDN sécurisé du monofichier : les deux URL candidates sont remappées
# vers l'URL jsDelivr canonique et chaque module (et sa dépendance three.core)
# n'est accepté que si son empreinte sha384 correspond.
IMPORTMAP = f"""{{
  "imports": {{
    "{CDN_JSDELIVR}/three.module.min.js": "{CDN_JSDELIVR}/three.module.min.js",
    "{CDN_UNPKG}/three.module.min.js": "{CDN_JSDELIVR}/three.module.min.js"
  }},
  "integrity": {{
    "{CDN_JSDELIVR}/three.module.min.js": "{SRI_MODULE}",
    "{CDN_JSDELIVR}/three.core.min.js": "{SRI_CORE}",
    "{CDN_UNPKG}/three.module.min.js": "{SRI_MODULE}",
    "{CDN_UNPKG}/three.core.min.js": "{SRI_CORE}"
  }}
}}"""

ORDER = [
    "src/core/math.js",
    "src/core/rng.js",
    "src/core/quality.js",
    "src/core/settings.js",
    "src/core/telemetry.js",
    "src/core/spatial-hash.js",
    "src/core/audio.js",
    "src/core/music.js",
    "src/sim/replay.js",
    "src/sim/waves.js",
    "src/sim/wake-grid.js",
    "src/sim/yole-physics.js",
    "src/sim/collision.js",
    "src/sim/rope.js",
    "src/render/ocean.js",
    "src/render/sky.js",
    "src/render/vfx.js",
    "src/render/debris.js",
    "src/render/world.js",
    "src/render/handling-motion.js",
    "src/render/yole-visual.js",
    "src/render/impact.js",
    "src/render/assets.js",
    "src/render/crew-clips.js",
    "src/game/balance.js",
    "src/game/customization.js",
    "src/game/tour-progress.js",
    "src/game/tour-hub.js",
    "src/game/replay-library.js",
    "src/game/info-hub.js",
    "src/game/growth.js",
    "src/game/versus.js",
    "src/game/weapons.js",
    "src/game/match.js",
    "src/game/pickups.js",
    "src/game/obstacles.js",
    "src/game/handling-feedback.js",
    "src/game/hud.js",
    "src/game/input.js",
    "src/game/camera.js",
    "src/game/utility-ai.js",
    "src/game/boat.js",
    "src/game/game.js",
    "src/main.js",
]


def strip_module_syntax(source: str, *, is_main: bool = False) -> str:
    # Les imports peuvent tenir sur plusieurs lignes : on va jusqu'au premier
    # `from "...";`, sinon un bloc multiligne survivait et redeclarait ses noms.
    source = re.sub(r"^import\s+[\s\S]*?from\s+['\"][^'\"]+['\"];\s*$", "", source, flags=re.MULTILINE)
    source = re.sub(r"^import\s+.+?;\s*$", "", source, flags=re.MULTILINE)
    source = re.sub(r"^export\s+", "", source, flags=re.MULTILINE)
    if is_main:
        source = source.replace(
            '''  const candidates = [\n    ...(params.has("mock") ? ["../test/mock-three.module.js"] : []),\n    "../vendor/three.module.min.js",\n    "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js",\n    "https://unpkg.com/three@0.185.1/build/three.module.min.js"\n  ];''',
            '''  const candidates = [\n    "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js",\n    "https://unpkg.com/three@0.185.1/build/three.module.min.js"\n  ];'''
        )
        # A standalone HTML has no adjacent service worker.
        source = re.sub(
            r'\nif \("serviceWorker" in navigator[\s\S]*?\n}\n?$',
            "\n",
            source,
        )
    return source.strip()


index = (ROOT / "index.html").read_text(encoding="utf-8")
style = (ROOT / "style.css").read_text(encoding="utf-8")


def inline_fonts(sheet: str) -> str:
    """Embarque les woff2 en data: URI.

    Le monofichier a besoin du dossier assets/ voisin pour ses textures, mais
    les polices ne pesent que 65 Ko : les embarquer coute ~87 Ko de base64 et
    garantit que le fichier deplace SEUL garde sa typographie. Sans ca il
    retombe sur la police systeme, c'est-a-dire exactement le defaut qu'on
    vient de corriger.
    """
    import base64

    def remplace(match):
        chemin = ROOT / match.group(1).lstrip("./")
        if not chemin.exists():
            return match.group(0)
        encode = base64.b64encode(chemin.read_bytes()).decode("ascii")
        return f'url("data:font/woff2;base64,{encode}")'

    return re.sub(r'url\("(\./assets/fonts/[^"]+\.woff2)"\)', remplace, sheet)


style = inline_fonts(style)
index = re.sub(r'\s*<link rel="manifest"[^>]*>', "", index)
index = re.sub(r'\s*<link rel="stylesheet"[^>]*>', "", index)
# Les polices sont embarquees en data: URI juste en dessous : garder les
# preload ferait echouer deux requetes vers des fichiers absents.
index = re.sub(r'\s*<link rel="preload"[^>]*assets/fonts[^>]*>', "", index)
index = index.replace(
    "</head>",
    f"\n<style>\n{style}\n</style>\n</head>",
)
# L'importmap doit précéder le <script type="module"> du bundle (placé en fin de body).
index = index.replace(
    "</head>",
    f'\n<script type="importmap">\n{IMPORTMAP}\n</script>\n</head>',
)

pieces = []
for relative in ORDER:
    source = (ROOT / relative).read_text(encoding="utf-8")
    pieces.append(f"// ---- {relative} ----\n{strip_module_syntax(source, is_main=relative == 'src/main.js')}")
bundle = "\n\n".join(pieces)

index = re.sub(
    r'\s*<script type="module" src="\./src/(?:bootstrap|main)\.js(?:\?[^"]*)?"></script>',
    lambda _match: f'\n<script type="module">\n{bundle}\n</script>',
    index,
)
index = index.replace("Tropical Mayhem V3.2", "Tropical Mayhem V3.2 · Single File")

output = ROOT / "YOLE_BWA_BRAWL_TROPICAL_MAYHEM_V3_2_SINGLE_FILE_ONLINE.html"
output.write_text(index, encoding="utf-8")
print(output)
