# Design QA

## Scope

- Routes: `/international/map`, `/international/briefing`, `/physics/learn`
- Browser viewport: 1710 x 804 in Chrome
- Visual sources: the approved map, briefing, and physics workstation concepts generated during this project
- Comparison method: each source was cropped to its 1487 x 699 wide-screen area, each implementation screenshot was normalized to the same size, and the two were stacked into one comparison image before review.

## Evidence

- `design-qa-assets/map-comparison.png`
- `design-qa-assets/briefing-comparison.png`
- `design-qa-assets/physics-comparison.png`
- `design-qa-assets/map-implementation.png`
- `design-qa-assets/briefing-implementation.png`
- `design-qa-assets/physics-implementation.png`

## Review

- Map: matches the approved dark defensive-intelligence atlas language, dense information hierarchy, restrained cyan status accents, and operational map controls.
- Briefing: preserves the source-inbox workflow instead of duplicating every international-affairs function on one screen; typography, table rhythm, borders, and evidence-status treatment match the system.
- Physics: applies the same operator-workstation language to the seven selected study modes, resource search, library, and IPhO workspace without turning it into a generic card dashboard.
- Typography and iconography: Noto Sans KR Variable, IBM Plex Sans Condensed, JetBrains Mono, STIX Two Math, and Phosphor icons are used consistently. Font licenses are OFL-1.1 and Phosphor is MIT licensed.
- Runtime iteration: the first Chrome pass exposed a blank screen caused by classic JSX transform files missing a React default import. The affected components were corrected; the repeated Chrome pass rendered all three routes with zero JavaScript errors.
- No P0, P1, or P2 visual defects remain in the reviewed desktop viewport. The MapLibre production chunk-size warning is a performance follow-up, not a visual acceptance blocker.

## Final result

passed

# Mandos Drawer Design QA

## Result

PASS — the implemented drawer matches the selected Focus Line direction at the tested desktop and mobile states.

## Reference and capture

- Reference: `/Users/minjun/.codex/generated_images/01a02df7-46d6-7ed0-955d-f186702e5741/exec-a79bddc2-0002-4e57-8926-2a789b118350.png`
- Desktop implementation: `/Users/minjun/.codex/visualizations/2026/08/23/01a02df7-46d6-7ed0-955d-f186702e5741/mandos-qa/desktop-final-drawer.png`
- Side-by-side comparison: `/Users/minjun/.codex/visualizations/2026/08/23/01a02df7-46d6-7ed0-955d-f186702e5741/mandos-qa/desktop-final-comparison.png`
- Focused composer comparison: `/Users/minjun/.codex/visualizations/2026/08/23/01a02df7-46d6-7ed0-955d-f186702e5741/mandos-qa/composer-comparison.png`
- Mobile capture: `/Users/minjun/.codex/visualizations/2026/08/23/01a02df7-46d6-7ed0-955d-f186702e5741/mandos-qa/mobile-390.png`

## Visual checks

- Desktop drawer width and height matched the normalized 490 × 803 reference.
- Header, compact context block, quiet empty conversation field, bottom divider, borderless prompt, compact attachment controls, centered model selector, and square send action align with the reference composition.
- The screen and region actions remain icon-only compact controls instead of large cards.
- Mobile at 390 px uses the full viewport width without a visible horizontal overflow or clipped composer control.
- The model menu opens above the composer on desktop and mobile and keeps all three Mandos profiles visible.

## Interaction checks

- Drawer opens from the Mandos entry point and starts on Mandos 3 Core.
- Mandos 3 Swift, Core, and Deep are selectable and expose distinct task and reasoning descriptions.
- The prompt grows from 62 px to its 144 px cap for multi-line input, and the send action enables only when content exists.
- History opens from the header control and shows a concise user-facing failure state when the local API is unavailable.
- No analysis request was submitted during visual QA because live backend verification was outside this frontend-only scope.
