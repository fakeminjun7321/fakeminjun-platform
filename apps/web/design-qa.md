# Design QA — Physics Workspace Extension

## Comparison target

- Source visual truth: `outputs/frontend-qa/whitehat-source-normalized-1440x1024.png`, `1440 × 1024`, normalized from the selected Atlas Canvas reference.
- Existing verified implementation reference: `outputs/frontend-qa/maplibre-final-desktop.png`, `1440 × 1024`, desktop situation-room state.
- New implementation routes:
  - `http://127.0.0.1:5173/physics/learn`
  - `http://127.0.0.1:5173/physics/library`
  - `http://127.0.0.1:5173/physics/find`
  - `http://127.0.0.1:5173/physics/ipho`
- Intended QA viewports: `1440 × 1024` desktop and `390 × 844` mobile, device scale factor 1.
- Intended states: physics mode 01; saved-resource library; unfiltered resource finder; KPhO→IPhO path.

## Evidence available

- The existing international-affairs implementation and reference were previously captured and compared at equal `1440 × 1024` pixels.
- The four physics routes returned HTTP 200 from the local Vite server.
- Static server-render route-contract tests confirmed the expected physics content for all four paths.
- Focused data and interaction-contract tests passed for all seven physics modes, official-resource links, and physics filters.
- Production build and Sites packaging passed.
- In-app browser verification confirmed that the domain navigation contains only international affairs and physics, a removed legacy path resolves to `/international/map`, `/physics/learn` renders, and no console errors were recorded during that path.

## Remaining visual QA

- Controlled desktop/mobile screenshots have not yet been captured for all four physics routes.
- HTTP 200, server-rendered markup, tests, and a production build do not prove the remaining responsive layouts, pointer interactions, keyboard focus paths, or console cleanliness across every route.

## Required fidelity surfaces

- Fonts and typography: implemented with the existing Noto Sans KR and IBM Plex Mono system, but the rendered new pages are **Not verified / 미검증**.
- Spacing and layout rhythm: existing shell tokens and border rhythm were reused, but the rendered desktop/mobile layouts are **Not verified / 미검증**.
- Colors and visual tokens: existing navy, cyan, cobalt, green, and amber tokens were reused; rendered contrast and hierarchy are **Not verified / 미검증**.
- Image quality and assets: the new workspaces require no raster imagery; icons use the project's existing Phosphor family. Rendered alignment is **Not verified / 미검증**.
- Copy and content: demo/live boundaries and backend-unavailable notices exist in code and server-rendered output; wrapping and truncation are **Not verified / 미검증**.

## Findings

- P0: none established from the available non-visual evidence.
- P1/P2: cannot be cleared without browser captures and side-by-side comparison.
- P3: the production JavaScript bundle remains above Vite's 500 kB chunk warning threshold; code splitting is a later performance task.

## Comparison history

1. International-affairs comparison passed previously after mobile overview and map-control fixes.
2. Physics extension: implementation, contract tests, and the `/physics/learn` browser path exist; full route and viewport comparison remains pending.

## Verification boundary

- **Implemented**: physics routes, interactions, responsive CSS, mock data, official resource links, and documentation exist.
- **Unit-verified**: 20 application/contract/worker tests passed.
- **Browser-verified**: `/physics/learn`, two-domain navigation, removed-route redirection, and console error state verified. The other three physics routes and controlled responsive viewport comparisons are **Not verified / 미검증**.
- **Simulator-verified**: **Not verified / 미검증**.
- **Physical-device-verified**: **Not verified / 미검증**.
- **Live-service-verified**: **Not verified / 미검증** — backend, authentication, persistence, uploads, and AI remain intentionally disconnected.

final result: partial
