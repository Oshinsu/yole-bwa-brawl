#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
errors = []

for path in [ROOT / 'main.js', *sorted((ROOT / 'src').rglob('*.js'))]:
    if not path.exists():
        continue
    source = path.read_text(encoding='utf-8')
    for specifier in re.findall(r'import\s+(?:[^"\']+from\s+)?["\']([^"\']+)["\']', source):
        if not specifier.startswith('.'):
            continue
        target = (path.parent / specifier).resolve()
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

single = ROOT / 'YOLE_BWA_BRAWL_TROPICAL_MAYHEM_V3_2_SINGLE_FILE_ONLINE.html'
if not single.exists():
    errors.append('single-file build missing')
else:
    source = single.read_text(encoding='utf-8')
    # Le monofichier doit embarquer tout le graphe runtime. Une syntaxe valide ne
    # suffit pas : oublier un nouveau module laisse ses exports comme variables
    # globales indéfinies et ne casse qu'au démarrage dans le navigateur.
    for source_path in sorted((ROOT / 'src').rglob('*.js')):
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
