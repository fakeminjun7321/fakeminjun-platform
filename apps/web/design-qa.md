# Design QA — International Situation Room / Open Situation Map

## Reference boundary

- Visual direction: the previously selected white-hat intelligence workspace reference, normalized to `1440 × 1024` at `outputs/frontend-qa/whitehat-source-normalized-1440x1024.png`.
- Interaction reference: SBH News was used only for map-workspace patterns such as direct pan/zoom, URL-saved viewport, event clustering, and overlaid controls. Its layout, branding, data, and implementation were not copied.
- Current desktop capture: `outputs/frontend-qa/maplibre-final-desktop.png`.
- Current mobile captures: `outputs/frontend-qa/maplibre-final-mobile.png` and `outputs/frontend-qa/maplibre-final-mobile-signal.png`.
- Current side-by-side comparison: `outputs/frontend-qa/maplibre-final-comparison.png`, `2880 × 1024`.
- Intentional difference: the signal panel stays compact so the situation map remains the dominant workspace. This follows the user's explicit direction that “오늘의 변화” must not take over the page.

## Current implementation

- The hand-drawn/static world canvas has been replaced with a MapLibre GL JS map using the OpenFreeMap dark style.
- The map supports mouse drag, wheel zoom, touch pinch, zoom buttons, Korea focus, world overview, cluster expansion, and a `#map=zoom/lat/lon` URL state.
- Map state is restored when navigating between the situation map, briefing, and issue tracking views.
- Korea-first labels are requested from the vector style where available, with multilingual fallback.
- Signal categories and relationship routes can be toggled independently. Hidden categories also hide their marker, selection halo, related routes, and detail popover.
- The mobile world overview deliberately uses a centered square viewport. A full-height portrait Web Mercator view crops too much east-west geography to represent the worldwide signal set honestly.
- The AI workspace remains an explicit on-demand action rather than a permanently open rail.

## Final visual findings

- P0: none.
- P1: none.
- P2: none after the final mobile world-overview pass.
- P3: attribution is necessarily compact on a 390px viewport; remote style layer identifiers may require maintenance if OpenFreeMap changes its schema; the production bundle still emits a size warning and should later be split or optimized.
- No placeholder image, fake terminal, Matrix text, neon glow, large right briefing rail, bottom event-detail strip, or oversized timeline remains.
- The visible metadata is operational: signal count, relationship count, base-map status, coordinates, sources, source agreement, verification state, dataset status, and projection.

## Browser evidence

- Desktop Chrome: world and Korea views rendered with one copy of the United States and Korea; map controls, category filters, relationship filter, marker selection, cluster expansion, and viewport restoration were exercised.
- Desktop Chrome: Korean-first labels and complete OpenFreeMap/OpenMapTiles/OpenStreetMap attribution were visible.
- Mobile Chrome responsive viewport at `390 × 844`: the world overview rendered as a `390 × 388` map, all six demo events were represented through markers or clusters, `MAP READY` and attribution were visible, and no horizontal overflow was found.
- Mobile Chrome responsive viewport: the eastern cluster expanded into separate signals and the first signal selection opened its detail card after zooming to Korea.
- Browser console warnings/errors from the final inspected path: 0.

## Verification boundary

- **Implemented**: the zoomable open-source map, clustering, filters, route overlays, viewport persistence, responsive states, and this QA record exist in `apps/web`.
- **Unit-verified**: 13 focused application tests and 4 static-hosting tests passed. These tests do not prove live data, authentication, uploads, persistence, AI, or external services.
- **Browser-verified**: the user paths above were exercised in desktop Chrome and Chrome's responsive viewport.
- **Simulator-verified**: **Not verified / 미검증** — no browser/device simulator or emulator was used.
- **Physical-device-verified**: **Not verified / 미검증** — no real phone or separate physical device was used.
- **Not verified / 미검증**: live AI, live data ingestion, Cloudflare resources, Firebase, authentication, screenshot uploads, persistence, malware scanning, DNS, and deployment were not connected or exercised.

final result: browser QA passed; live-service and device verification remain open
