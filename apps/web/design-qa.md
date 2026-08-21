# Design QA — Politics and Physics Workspace Extension

## Comparison target

- Source visual truth: `outputs/frontend-qa/whitehat-source-normalized-1440x1024.png`, `1440 × 1024`, normalized from the selected Atlas Canvas reference.
- Existing verified implementation reference: `outputs/frontend-qa/maplibre-final-desktop.png`, `1440 × 1024`, desktop situation-room state.
- New implementation routes:
  - `http://127.0.0.1:5173/politics/desk`
  - `http://127.0.0.1:5173/politics/institutions`
  - `http://127.0.0.1:5173/physics/learn`
  - `http://127.0.0.1:5173/physics/library`
  - `http://127.0.0.1:5173/physics/find`
  - `http://127.0.0.1:5173/physics/ipho`
- Intended QA viewports: `1440 × 1024` desktop and `390 × 844` mobile, device scale factor 1.
- Intended states: politics first agenda selected; politics institution reader; physics mode 01; saved-resource library; unfiltered resource finder; KPhO→IPhO path.

## Evidence available

- The existing international-affairs implementation and reference were previously captured and compared at equal `1440 × 1024` pixels.
- The six new routes returned HTTP 200 from the local Vite server.
- Static server-render route-contract tests confirmed the expected political and physics content for all six paths.
- Focused data and interaction-contract tests passed for politics scope/search, political institutions, all seven physics modes, official-resource links, and physics filters.
- Production build and Sites packaging passed.

## Blocker

- The required in-app Browser control transport returned `Transport closed` during setup and remained unavailable after retry.
- Because the new routes could not be captured in a controlled browser viewport, there is no browser-rendered implementation screenshot for politics or physics in this QA run.
- HTTP 200, server-rendered markup, tests, and a production build do not prove visual layout, responsive behavior, pointer interactions, keyboard focus, or console cleanliness.

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
2. Politics/physics extension: implementation and contract tests exist, but first visual comparison is blocked before findings can be classified or fixed.

## Verification boundary

- **Implemented**: politics and physics routes, interactions, responsive CSS, mock data, official resource links, and documentation exist.
- **Unit-verified**: 25 application/contract/worker tests passed.
- **Browser-verified**: **Not verified / 미검증** for the new politics and physics routes because the browser-control transport was unavailable.
- **Simulator-verified**: **Not verified / 미검증**.
- **Physical-device-verified**: **Not verified / 미검증**.
- **Live-service-verified**: **Not verified / 미검증** — backend, authentication, persistence, uploads, and AI remain intentionally disconnected.

final result: blocked
