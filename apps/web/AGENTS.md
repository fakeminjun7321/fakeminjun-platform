# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Project-specific design decisions

- The selected source of truth is the revised Atlas Canvas concept from 2026-08-21: a full-map situation workspace with a compact three-signal intelligence queue, an anchored event inspector, two-level navigation, and no right-hand briefing rail or bottom timeline.
- Avoid generic AI-dashboard styling: no card grids, neon glow, glassmorphism, decorative metrics, or feature-inventory layouts.
- The visual language should resemble a credible defensive cyber threat-intelligence workstation: deep navy surfaces, restrained cyan/green/amber states, coordinates, source agreement, verification state, and meaningful relationship lines. Avoid Matrix code, fake terminals, cyberpunk glow, hacker role-play copy, and meaningless technical decoration.
- Separate the three domains by their work model. The international-affairs screen is map-led; politics and physics must not be implemented as reskinned copies of this screen.
- Within international affairs, keep `상황지도`, `오늘 브리핑`, and `이슈 추적` as separate workspaces. The situation map may show at most three concise current signals; long briefings, evidence lists, timelines, and ongoing analysis belong in their dedicated workspaces.
- Keep AI closed by default and open it only from an explicit action.
- Any prototype event content must be visibly labeled as non-live demo data.
- Use MapLibre GL JS for real map movement and zoom. The prototype may use OpenFreeMap, while production should move to hash-verified PMTiles hosted behind Cloudflare R2/Worker caching; never depend on OpenStreetMap public tile servers for production traffic.
- Preserve viewport state in the URL, and keep map event categories and relationship lines independently toggleable.
- The current backend recommendation is Cloudflare-first. Do not create Cloudflare/Firebase resources, change DNS, register secrets, or claim persistence without explicit approval and live verification.
