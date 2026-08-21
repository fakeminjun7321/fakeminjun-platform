# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Project-specific design decisions

- The selected source of truth is concept 1 from the 2026-08-21 ideation set: a large operational world map, a single right-hand briefing column, and a bottom 24-hour timeline.
- Avoid generic AI-dashboard styling: no card grids, neon glow, glassmorphism, decorative metrics, or feature-inventory layouts.
- Separate the three domains by their work model. The international-affairs screen is map-led; politics and physics must not be implemented as reskinned copies of this screen.
- Keep AI closed by default and open it only from an explicit action.
- Any prototype event content must be visibly labeled as non-live demo data.
