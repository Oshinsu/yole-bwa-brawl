# Third-party notices

## Three.js

The runtime targets Three.js `0.185.1`, copyright 2010–2026 Three.js Authors, distributed under the MIT License.

The launcher can download the official build from:

- `https://cdn.jsdelivr.net/npm/three@0.185.1/`
- fallback: `https://unpkg.com/three@0.185.1/`

Three.js is also vendored in `vendor/` for local and offline execution. Its MIT
license therefore applies to the redistributed files in that directory.

The game source, procedural art and interface in this package are separate
project assets.

## Fonts

The bundled interface fonts are distributed under the SIL Open Font License.
The corresponding license text is stored in `assets/fonts/LICENSE.txt`.

## Audio

The package currently contains 8 music tracks and 15 sampled effects. Their
individual provenance is tracked in `AUDIO_RIGHTS.md`. The project owner
explicitly authorized publication and distribution, including commercial
distribution, of this bank on 2026-07-30; the machine-readable status is
therefore `owner-attested`. No per-file source, licence, assignment, identity
evidence or independent legal verification has been supplied to this
repository, so the status must not be described as `evidence-verified`.

## Test infrastructure

The optional browser smoke test uses a locally installed Playwright Python package and Chromium when available. Neither dependency is redistributed in the game package.
