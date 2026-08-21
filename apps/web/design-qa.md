# Design QA — International Situation Room

## Visual truth and tested state

- Source visual truth: selected concept 1 reference (local design artifact, not committed)
- Browser screenshot: `outputs/frontend-qa/1440x1024-final-v4.png` (local QA artifact, not committed)
- Normalized side-by-side comparison: `outputs/frontend-qa/final-comparison-v4.png` (local QA artifact, not committed)
- Viewport: 1440 × 1024 CSS px at DPR 1
- Source pixels: 1487 × 1058, normalized to 1440 × 1024 for comparison
- Implementation pixels: 1440 × 1024
- State: initial international-affairs situation-room view; event 1 selected; detail strip open; AI panel closed; first four change rows visible; no search query
- Approved intentional differences: Korean demo copy in place of source copy and the temporary Compass icon in place of the source placeholder logo

## Evidence

- Full-view evidence: `final-comparison-v4.png` contains the normalized source on the left and the browser-rendered implementation on the right in one 2880 × 1024 image.
- Focused-region evidence: no separate crop was needed because the map, selected-event detail strip, briefing column, and 24-hour timeline are all legible at 1:1 in the combined comparison.
- Browser geometry: briefing panel `clientHeight` and `scrollHeight` were both 778 px; the “전체 변화 보기” CTA was fully visible at y=794–823; timeline title was at y=862–882; timeline track was at y=943–944.
- Browser console: no warnings or errors were observed for the captured state.

## Iteration history

1. Initial audit found P1 mismatches in map framing/projection, information-strip proportions, briefing density, and timeline placement. The map projection/framing, panel proportions, and timeline structure were revised.
2. v2 comparison found the map too small and the briefing CTA below the visible fold. The map received measured affine enlargement and event rows were tightened.
3. v3 comparison found two P2 residuals: a clipped western-Pacific label and an undersized/over-wide timeline treatment. The ocean-label offset and timeline title/track metrics were corrected.
4. v4 comparison shows no remaining P0, P1, or P2 visual mismatches at 1440 × 1024. Remaining differences are P3 polish: exact sketch texture, minor geographic-label placement, and approved demo assets/copy.

## Verification boundary

- Implemented: the reviewed initial frontend state and this QA record exist in `apps/web`.
- Simulator-verified: the initial state was rendered in Chrome at 1440 × 1024 and compared pixel-dimensionally with the normalized source.
- Unit-verified: not evaluated by this design QA pass.
- Not verified / 미검증: responsive breakpoints, interactive state transitions, backend/API calls, authentication, uploads, persistence, AI analysis, and external integrations were outside this visual QA pass.

final result: passed
