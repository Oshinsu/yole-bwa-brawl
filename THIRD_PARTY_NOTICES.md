# Third-party notices

## Three.js

The runtime targets Three.js `0.185.1`, copyright 2010–2026 Three.js Authors, distributed under the MIT License.

The launcher downloads the official build from:

- `https://cdn.jsdelivr.net/npm/three@0.185.1/`
- fallback: `https://unpkg.com/three@0.185.1/`

Three.js is not embedded in the ZIP by default. The game source, procedural art and interface in this package are separate original project assets.

## Test infrastructure

The optional browser smoke test uses a locally installed Playwright Python package and Chromium when available. Neither dependency is redistributed in the game package.
