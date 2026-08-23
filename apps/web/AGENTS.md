# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Project-specific design decisions

- The selected source of truth is the revised Atlas Canvas concept from 2026-08-21: a full-map situation workspace with a compact three-signal intelligence queue, an anchored event inspector, two-level navigation, and no right-hand briefing rail or bottom timeline.
- The 2026-08-22 visual system combines three purpose-built references rather than forcing one dashboard layout everywhere: BLACK ATLAS for the map workspace, EVIDENCE LEDGER for briefing and evidence review, and OPERATOR'S LAB for physics. Share typography, iconography, color semantics, and interaction quality across them, but preserve their distinct workspace anatomy.
- Typography and icons are first-class design assets. Use reviewed open-source font families with real Korean, condensed-heading, mono-metadata, and math weights as needed, and one coherent maintained open-source icon library. Do not substitute emoji, text glyphs, generic browser defaults, or hand-drawn SVG/CSS icons.
- Avoid generic AI-dashboard styling: no card grids, neon glow, glassmorphism, decorative metrics, or feature-inventory layouts.
- The visual language should resemble a credible defensive cyber threat-intelligence workstation: deep navy surfaces, restrained cyan/green/amber states, coordinates, source agreement, verification state, and meaningful relationship lines. Avoid Matrix code, fake terminals, cyberpunk glow, hacker role-play copy, and meaningless technical decoration.
- Keep the two domains distinct. The international-affairs screen is map-led; physics must use its own learning and resource workflow rather than a reskinned copy of the map screen.
- Physics uses an adjustable demo explanation level. Preserve the seven chosen modes: concept exploration, equation derivation, screenshot/graph analysis, paper discovery, concept networks, thought-experiment comparison, and research records. Keep the mixed resource model, verified public-resource finder, and KPhO-first IPhO track as separate physics workspaces.
- Within international affairs, keep `상황지도`, `오늘 브리핑`, and `이슈 추적` as separate workspaces. The situation map may show at most three concise current signals; long briefings, evidence lists, timelines, and ongoing analysis belong in their dedicated workspaces.
- Keep AI closed by default and open it only from an explicit action.
- Use `Mandos` as the user-facing AI family. Keep the drawer conversation-first: a quiet canvas, a compact bottom composer, icon-sized screen/region attachment controls, and a closed model picker. Map the existing frontend modes to `Mandos 3 Swift` for quick summaries, `Mandos 3 Core` for balanced context analysis, and `Mandos 3 Deep` for bounded deep cross-checking. Treat these as presentation aliases over the existing OpenAI-backed contract; do not expose provider/model names or change the backend provider from frontend work.
- Use one cost-efficient model for ordinary AI work. Invoke multiple models only for complex, high-uncertainty, or explicitly requested cross-checking workflows; do not build a large fixed agent swarm for routine tasks.
- Use OpenAI models and APIs exclusively for AI features. Do not use Anthropic, Claude, Google Gemini, Cloudflare-hosted models, or indirect multi-provider routes. Ordinary analysis uses one cost-efficient OpenAI model; only complex or explicitly requested deep analysis may invoke a bounded OpenAI-only specialist-and-synthesis workflow.
- Any prototype event content must be visibly labeled as non-live demo data.
- Use MapLibre GL JS for real map movement and zoom. The prototype may use OpenFreeMap, while production should move to hash-verified PMTiles hosted behind Cloudflare R2/Worker caching; never depend on OpenStreetMap public tile servers for production traffic.
- Preserve viewport state in the URL, and keep map event categories and relationship lines independently toggleable.
- The current backend recommendation is Cloudflare-first. Do not create Cloudflare/Firebase resources, change DNS, register secrets, or claim persistence without explicit approval and live verification.
- Deploy `/api/*` through a dedicated Cloudflare Worker without a Static Assets binding so Cloudflare Access can provide `ctx.access`. Host the frontend separately and route only `/api/*` to this Worker; do not recombine API code and Workers Static Assets without replacing the identity verification design.
- The first real international-source inbox uses fixed official RSS endpoints from the Republic of Korea Ministry of Foreign Affairs, Ministry of Unification, the White House, and UN News Peace and Security. Persist metadata and original links only; do not mirror article bodies or images.
- A successfully collected source item is live source metadata but remains unverified. Never auto-promote it into an event, map marker, verification status, signal rank, source agreement, or AI evidence claim.
- Event-candidate generation may group only user-selected immutable source-metadata snapshots. Its output is a metadata hypothesis, not a verified event or factual citation; human review states must never be rendered as verification states.
- Keep event-candidate generation on the existing direct OpenAI Responses API with one cost-efficient model, strict structured output, no tools, bounded evidence IDs, and server-side post-validation. Do not add an Agents SDK loop for this bounded transformation.
- Until article-level evidence and a reviewed location contract exist, map promotion must fail closed in the Worker even for an authenticated editor. Candidate review must not write to `events`, `event_locations`, `event_sources`, or map state.
