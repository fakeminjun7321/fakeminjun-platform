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

PASS — the revised Mandos panel follows the Focus Line direction as a narrow, persistent desktop workspace and an on-demand mobile drawer.

## Reference and capture

- Reference: `/Users/minjun/.codex/generated_images/01a02df7-46d6-7ed0-955d-f186702e5741/exec-a79bddc2-0002-4e57-8926-2a789b118350.png`
- Previous overlay implementation: `/Users/minjun/.codex/visualizations/2026/08/23/01a02df7-46d6-7ed0-955d-f186702e5741/mandos-qa/desktop-final-drawer.png`
- Side-by-side comparison: `/Users/minjun/.codex/visualizations/2026/08/23/01a02df7-46d6-7ed0-955d-f186702e5741/mandos-qa/desktop-final-comparison.png`
- Focused composer comparison: `/Users/minjun/.codex/visualizations/2026/08/23/01a02df7-46d6-7ed0-955d-f186702e5741/mandos-qa/composer-comparison.png`
- Mobile capture: `/Users/minjun/.codex/visualizations/2026/08/23/01a02df7-46d6-7ed0-955d-f186702e5741/mandos-qa/mobile-390.png`

## Visual checks

- Desktop at 1440 px keeps Mandos pinned on the right at 388.8 px and reserves 1051.2 px for the workspace without overlap or horizontal overflow.
- Desktop at 1280 px narrows Mandos to 345.6 px and keeps all visible interactive controls inside the viewport.
- The composer contains only the prompt, closed model selector, and send action. Screen capture, current-screen, and region-selection controls are removed.
- Mobile at 390 px keeps Mandos behind the header action, then uses the full viewport width without horizontal overflow or clipped composer controls.
- The model menu opens above the composer on desktop and mobile and keeps all three Mandos profiles visible.

## Interaction checks

- Mandos is always open as a non-modal complementary panel on desktop and starts on Mandos 3 Core.
- A workspace action updates the pinned context and focuses the prompt; route navigation resets stale custom context to the current workspace.
- At 1279 px and below, Mandos opens as a modal dialog and closes through the close action or Escape with focus returned to the trigger.
- Mandos 3 Swift, Core, and Deep are selectable and expose distinct task and reasoning descriptions.
- The prompt grows from 62 px to its 144 px cap for multi-line input, and the send action enables only when content exists.
- History opens from the header control and shows a concise user-facing failure state when the local API is unavailable.
- No analysis request was submitted during visual QA because live backend verification was outside this frontend-only scope.
