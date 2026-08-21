# Design QA — International Situation Room / White-hat Intelligence Direction

## Visual truth and tested state

- Source visual: selected revised Atlas Canvas reference, `1487 × 1058`, normalized to `1440 × 1024` as `outputs/frontend-qa/whitehat-source-normalized-1440x1024.png`.
- Implementation capture: `outputs/frontend-qa/whitehat-map-1440x1024-v3.png`.
- Same-input comparison: `outputs/frontend-qa/whitehat-map-comparison-full-v3.png`, `2880 × 1024`.
- Focused comparisons: `whitehat-map-comparison-header-v3.png`, `whitehat-map-comparison-signals-v3.png`, `whitehat-map-comparison-detail-v3.png`, and `whitehat-map-comparison-footer-v3.png`.
- Browser state: Chrome at `1440 × 1024` CSS px, DPR 1; situation map; event 1 selected; all four map layers active; AI drawer closed.
- Intentional difference: the three-signal panel remains `288 × 291px` instead of matching the taller generated reference because the user explicitly asked for a compact current-change area that does not dominate the map.

## Iteration history

1. v1 found P1 drift in the 418px brand column, full-height AI control, small/low-contrast map, clipped relationship route, 340px signal panel, central 320px popover, heavy layer controls, and unreadable 28px status strip.
2. v2 fixed those structural proportions and made the verified United States–Korea route visible. Remaining P2 issues were a high popover and missing indirect relationship density. The compact signal height was reclassified as an approved user-driven difference.
3. v3 moved the popover down and added a typed Korea–Philippines indirect route rendered as an amber dashed connection. Supply-layer on/off behavior controls both relationships.

## Final visual findings

- P0: none.
- P1: none.
- P2: none.
- P3 only: the header utility group sits approximately 20–40px farther right than the generated reference; the status strip is 52px versus approximately 60px; and the real Natural Earth projection necessarily differs from the generated geography.
- No placeholder image, fake terminal, Matrix text, neon glow, right briefing rail, bottom timeline, or bottom event-detail strip remains.
- The visual language uses operational metadata only: coordinates, source count, source agreement, verification state, relationship type, dataset status, and projection status.

## Interaction and responsive evidence

- Map marker selection, signal selection, four layer toggles, zoom in/out/reset, route history, AI drawer focus trap/Escape/submit notice, briefing navigation, and issue navigation were exercised in Chrome.
- `1280 × 720`: zoom controls passed hit testing and produced observable marker-coordinate changes.
- `390 × 844`: a fresh map load starts without the event popover; selecting a marker opens a fully in-viewport popover; no horizontal overflow was found.
- Mobile issue tracking uses one page-level vertical scroller, a horizontal issue index, and a visible cumulative change log.
- Browser console warnings/errors: 0. Vite error overlays: 0.

## Verification boundary

- **Implemented**: the reviewed frontend state and this QA record exist in `apps/web`.
- **Unit-verified**: data, relationship, and static hosting tests pass; visual appearance is not proven by unit tests.
- **Simulator-verified**: Chrome user paths passed at `1440 × 1024`, `1280 × 720`, and `390 × 844`; source-versus-implementation visual comparison passed at `1440 × 1024`.
- **Physical-device-verified**: **Not verified / 미검증** — no real phone or separate physical device was used.
- **Not verified / 미검증**: live AI, live data ingestion, authentication, uploads/capture, persistence, and external integrations are not implemented and were not exercised.

final result: passed
