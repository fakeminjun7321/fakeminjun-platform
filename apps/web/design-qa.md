# Physics Conversation Canvas Design QA

## Comparison target

- Source visual truth: `/Users/minjun/.codex/generated_images/01a02ede-131b-7611-a013-fe24eb27022e/exec-5085f40a-8664-4d7a-8435-a46e1ca1129d.png`
- Browser-rendered implementation: `/Users/minjun/.codex/worktrees/physics-conversation-canvas/studio-7321/apps/web/design-qa-assets/physics-canvas-history-qa-final.png`
- Route: `http://127.0.0.1:5173/physics/workspace`
- Browser viewport: 1440 x 1024 CSS px
- Device scale factor: 1, inferred from the 1440 x 1024 CSS viewport producing a 1440 x 1024 PNG
- Source pixels: 1487 x 1058
- Implementation pixels: 1440 x 1024
- Density normalization: source resized to 1440 x 1024 as `physics-canvas-source-normalized.png`; implementation remained at native 1440 x 1024
- State: desktop dark/light split, PLSO selected, Core selected, saved v2 answer open, and history popover open

## Evidence

- Full-view comparison: `design-qa-assets/physics-canvas-comparison-final.png`
- Focused conversation-rail comparison: `design-qa-assets/physics-canvas-comparison-rail-final.png`
- Focused answer-canvas comparison: `design-qa-assets/physics-canvas-comparison-canvas-final.png`
- Responsive implementation capture: `design-qa-assets/physics-canvas-mobile-800.png`
- Final answer without the history popover: `design-qa-assets/physics-canvas-implementation-final.png`

The focused comparisons were required because chat typography, history placement, formula rendering, and the structured canvas diagram were too small to judge reliably in the full-width pair.

## Findings

No actionable P0, P1, or P2 differences remain.

- P3, intentional proportion difference: the source visual gives the dark rail slightly more than one third of the frame, while the implementation uses the user's explicit one-third conversation and two-thirds answer contract. This improves answer-canvas width and is accepted.
- P3, runtime-content difference: the source shows an infinite-well example with six conversational turns; the implementation shows the real locally persisted inclined-plane thread with two successful versions and one visibly unmerged failure. The interaction state and information hierarchy match even though the physics content differs.
- P3, update treatment: the source uses a dashed spatial connector to the updated section. The implementation uses a persistent sync badge, a version count, and a highlighted latest section so it can render safely for variable-length structured responses without a misleading fixed connector.

## Required fidelity surfaces

- Fonts and typography: the existing Noto Sans KR, IBM Plex Sans Condensed, JetBrains Mono, and STIX/KaTeX math stack preserves the source hierarchy. Display headings, dense metadata, chat copy, and equations have distinct optical weights and readable line heights. No clipping or unintended truncation was visible.
- Spacing and layout rhythm: the desktop frame keeps the required 1:2 split, fixed composer, independently scrolling rail and answer canvas, restrained radii, and consistent section dividers. At 800 px the two regions stack without horizontal clipping.
- Colors and visual tokens: near-black blue conversation surfaces, muted cyan state accents, ivory answer paper, subtle warm dividers, and restrained success/error states match the visual direction with sufficient contrast.
- Image quality and asset fidelity: the screen has no fixed photographic or brand image asset. Physics diagrams are runtime data rendered through the existing allowlisted code-native analysis-visual contract, so the diagram subject correctly follows the saved answer instead of copying a static mock illustration. Lines and KaTeX formulas are sharp at native density.
- Copy and content: PLSO, THEx, Swift, Core, Deep, history, question, canvas version, evidence boundary, and failure language are concise and consistent. User-facing OpenAI/GPT names do not appear.

## Primary interactions tested

- Opened and closed the history popover.
- Searched history and reopened a saved canvas thread.
- Confirmed the saved thread restores all three user turns, two successful assistant turns, and one unmerged failure while keeping the latest successful v2 canvas.
- Switched PLSO and THEx and verified their task labels and composer guidance.
- Switched Swift, Core, and Deep controls without submitting an extra paid request.
- Started a new canvas and verified the empty conversation/canvas state.
- Verified an actual local Worker and D1 path for question persistence, short chat response, canvas update, history listing, and reopen.
- Checked the 800 x 1000 responsive breakpoint.
- Browser console errors and warnings checked after the final interaction pass: none.

## Comparison history

1. Initial comparison found a P2 mismatch: history behaved as a centered modal with a full-page dimming backdrop, while the source uses a compact non-blocking popover. The layer was changed to a desktop popover with no backdrop; the modal backdrop remains only at the mobile breakpoint. Post-fix evidence: `design-qa-assets/physics-canvas-comparison-postfix.png`.
2. The first popover revision still obscured the answer-canvas title at the desktop split. The desktop palette was reduced to 280 px and right-aligned inside the one-third rail. Post-fix evidence: `design-qa-assets/physics-canvas-comparison-final.png`, `design-qa-assets/physics-canvas-comparison-rail-final.png`, and `design-qa-assets/physics-canvas-comparison-canvas-final.png`.

## Residual verification gaps

- Physical-device rendering is not verified.
- Production rendering is not verified and no production request was made for this QA pass.

final result: passed
