#!/usr/bin/env python3
from pathlib import Path
import json
import re
import subprocess
import tempfile
from release import audio_rights_errors

ROOT = Path(__file__).resolve().parents[1]
errors = []

for path in [ROOT / 'main.js', *sorted((ROOT / 'src').rglob('*.js'))]:
    if not path.exists():
        continue
    source = path.read_text(encoding='utf-8')
    for specifier in re.findall(r'import\s+(?:[^"\']+from\s+)?["\']([^"\']+)["\']', source):
        if not specifier.startswith('.'):
            continue
        # Les modules runtime portent parfois un suffixe de version pour forcer
        # l'abandon d'un ancien cache PWA. Ce suffixe appartient à l'URL, pas au
        # nom du fichier présent sur disque.
        file_specifier = re.split(r'[?#]', specifier, maxsplit=1)[0]
        target = (path.parent / file_specifier).resolve()
        if not target.exists():
            errors.append(f'missing import: {path.relative_to(ROOT)} -> {specifier}')

html = (ROOT / 'index.html').read_text(encoding='utf-8')
main = (ROOT / 'src/main.js').read_text(encoding='utf-8')
html_ids = set(re.findall(r'id="([^"]+)"', html))
referenced_ids = set(re.findall(r'byId\("([^"]+)"\)', main))
for missing in sorted(referenced_ids - html_ids):
    errors.append(f'missing DOM id: {missing}')

service_worker = (ROOT / 'service-worker.js').read_text(encoding='utf-8')
cached_assets = set(re.findall(r'"(\./[^"?]+)', service_worker))
for relative in sorted(cached_assets):
    if relative == './' or relative.startswith('./vendor/'):
        continue
    target = ROOT / relative[2:]
    if not target.exists():
        errors.append(f'missing service-worker asset: {relative}')

# Deterministic gameplay code must not call the ambient RNG.
for source_path in sorted((ROOT / 'src').rglob('*.js')):
    if 'Math.random' in source_path.read_text(encoding='utf-8'):
        errors.append(f'non-deterministic Math.random in: {source_path.relative_to(ROOT)}')

# The installed PWA must cache every runtime module, not only the entry point.
for source_path in sorted((ROOT / 'src').rglob('*.js')):
    relative = './' + source_path.relative_to(ROOT).as_posix()
    if relative not in cached_assets:
        errors.append(f'runtime module absent from service-worker cache: {relative}')


manifest = (ROOT / 'manifest.webmanifest').read_text(encoding='utf-8')
for relative in re.findall(r'"src"\s*:\s*"(\./[^"]+)"', manifest):
    target = ROOT / relative[2:]
    if not target.exists():
        errors.append(f'missing manifest asset: {relative}')

# Le statut de livraison doit rester honnête dans les métadonnées et le README.
build_info = json.loads((ROOT / 'BUILD_INFO.json').read_text(encoding='utf-8'))
release_manifest = json.loads((ROOT / 'release-manifest.json').read_text(encoding='utf-8'))
release_status = release_manifest.get('releaseStatus')
release_blockers_raw = release_manifest.get('blockers')
release_blockers = release_blockers_raw if isinstance(release_blockers_raw, list) else []
audio_rights = build_info.get('audioRights') or {}
asset_status = build_info.get('assetStatus') or {}
authorization = release_manifest.get('releaseAuthorization') or {}
audio_blocked = bool(audio_rights_errors(
    audio_rights,
    authorization,
    build_info.get('version'),
))
active_blockers = (
    audio_blocked
    or int(asset_status.get('menuYoleReplacementsPending') or 0) > 0
)
if not isinstance(release_blockers_raw, list):
    errors.append('release blockers must be a JSON list')
if release_status not in {'candidate-blocked', 'ready'}:
    errors.append(f'invalid release status: {release_status!r}')
elif release_status == 'candidate-blocked':
    if not release_blockers:
        errors.append('candidate-blocked release has no declared blocker')
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    if 'candidate-blocked' not in readme:
        errors.append('README does not disclose candidate-blocked status')
elif release_blockers or active_blockers:
    errors.append('release declared ready while blockers remain')

for entrypoint in release_manifest.get('entrypoints') or []:
    if not (ROOT / entrypoint).is_file():
        errors.append(f'missing release entrypoint: {entrypoint}')

single = ROOT / 'YOLE_BWA_BRAWL_TROPICAL_MAYHEM_V3_2_SINGLE_FILE_ONLINE.html'
if not single.exists():
    errors.append('single-file build missing')
else:
    source = single.read_text(encoding='utf-8')
    # Le monofichier doit embarquer tout le graphe runtime. Une syntaxe valide ne
    # suffit pas : oublier un nouveau module laisse ses exports comme variables
    # globales indéfinies et ne casse qu'au démarrage dans le navigateur.
    for source_path in sorted((ROOT / 'src').rglob('*.js')):
        # bootstrap.js purge les anciens caches en développement puis importe
        # main.js. Le monofichier remplace volontairement cette balise par le
        # bundle runtime et ne doit donc pas embarquer ce bootstrap local.
        if source_path == ROOT / 'src' / 'bootstrap.js':
            continue
        marker = f'// ---- {source_path.relative_to(ROOT).as_posix()} ----'
        if marker not in source:
            errors.append(f'runtime module absent from single-file bundle: {source_path.relative_to(ROOT)}')
    modules = re.findall(r'<script type="module">(.*?)</script>', source, re.S)
    if not modules:
        errors.append('single-file module missing')
    else:
        with tempfile.NamedTemporaryFile('w', suffix='.mjs', delete=False, encoding='utf-8') as file:
            file.write(modules[-1])
            temp_name = file.name
        result = subprocess.run(['node', '--check', temp_name], capture_output=True, text=True)
        if result.returncode != 0:
            errors.append('single-file syntax invalid: ' + result.stderr.strip())
    # Le monofichier doit sécuriser son chargement CDN via importmap + empreintes SRI.
    if 'type="importmap"' not in source or 'sha384-' not in source:
        errors.append('single-file importmap SRI missing')

if errors:
    raise SystemExit('\n'.join(errors))
print('static verification: OK')
