# AI Office diorama implementation

Branch: `feature/ai-office-mvp`  
Audited base: `84f703e33ccbba6890ca226eaa51015fb699fb01`

## Architecture

The active classroom was `ClassroomWorld.tsx` → `StrategyClassroom.tsx`, a React/Tailwind layout using icon glyphs and skewed desk rectangles. `OfficeWorld.tsx` contains an older Canvas renderer, but the active classroom does not use it. The dashboard owns agent state and consumes `/api/office/mission` SSE events. The existing Radix dialog primitives provide modal accessibility.

The new implementation uses memoized SVG architectural/furniture/character meshes, a scoped CSS art palette, and native HTML buttons. No Three.js, React Three Fiber, Canvas loop, downloaded models, new dependencies, or API/database changes are required. Native controls retain accessible names and keyboard operation while SVG stays decorative. This adds no expensive external assets requiring an asset loader.

## Files

- `app/office/StrategyClassroom.tsx`: room composition, fixed core roster, mobile zone navigation, command displays, extended specialists, live mission stages and coordinator/review handoffs.
- `app/office/OfficeDioramaArt.tsx`: reusable vector room and distinctive workstation characters, with unique SVG definition IDs.
- `app/office/office-diorama.module.css`: scoped art tokens, depth, lighting, responsive controls, animation and dialog styles.
- `app/office/OfficeDashboard.tsx`: passes existing plan state into the scene; reuses Radix for agent details; supplies output/actions; makes the motion toggle accessible; keeps classroom completion visible.
- `lib/office-scene.ts`: pure presentation mapping from existing agent events to scene states, stages and connections.
- `lib/office-scene.test.ts`: four regression tests for permanent workstations, state mapping, mission phases and truthful handoffs.

## Behaviour

The seven core desks never change places or disappear when another agent works. The remaining eight specialists stay accessible through Extended team. The office uses a fixed architectural view without free rotation. Below its readable canvas width, horizontal scrolling and Command / Strategy / Growth / Quality controls move the camera; labels are not scaled down. Always-visible shortcuts expose Mission board, Archive and Actions without requiring panorama exploration.

Thinking means Chief is actively planning before a plan exists. Reviewing means QA is actively working. Queued remains Queued: it is not represented as active thought. Blocked/failed become Attention required. Completion is driven by the mission result, not by elapsed time or Chief finishing the initial plan. Repeated tasks on the same agent cannot be distinguished reliably from aggregate agent state, so handoffs show coordinator → active specialist and completed specialist → QA, rather than inventing precise task dependency progress. Extended-team work appears in the roster and live working count, but has no permanent floor connection.

Agent dialogs expose role/department, status, current task, latest output, mission navigation and required-action navigation. Radix provides Escape dismissal, focus trapping and background isolation; closing returns focus to the invoking element when it still exists. Chief's final output is shown in its dialog after completion.

Animation is CSS-only. Handoff pulses are bounded to three iterations per mounted path. Character motion is subtle. Motion-off, reduced-motion preference, offscreen state and page visibility suppress animation. There is no timer-driven simulation or React frame loop.

## Verification (2026-09-12)

- `npx tsc --noEmit`: passed.
- `npm test`: **529 passed, 0 failed**, including four new scene tests.
- `npm run build`: passed. The `/office` route reported approximately **19.1 kB route JS / 146 kB first load JS**; these are build reports, not device performance measurements.
- `git diff --check`: passed.
- Token lint was already failing at the audited base (**148 existing colour violations**). The updated source reports **125**; no violations are reported for the new art component or rewritten classroom. The repository-wide token migration was not expanded into this task.
- This environment used Node 24.19.0; the repository declares Node 22.x. Validate on the declared runtime in CI before release.

## Remaining release gates — not yet verified

The supplied browser refused the local preview URL with `net::ERR_BLOCKED_BY_CLIENT`. No attempt was made to bypass that restriction. Therefore **390px, 768px and 1440px screenshot QA, browser interaction regression checks, real-device animation performance, and a live backend mission are not claimed as tested**. A production build is not a substitute for these checks.

Before promoting/deploying, use an approved local or preview environment to:

1. At 390×844, 768×1024 and 1440×900, open Classroom. Check scene labels, command displays, no page-level horizontal overflow, and all zone/pan controls. Panorama overflow is intentional; page overflow is not.
2. Tap each core agent and every extended specialist. Verify correct task/output, Escape, Tab/Shift+Tab focus containment, backdrop dismissal and return focus. Test long mission names and long unbroken output text.
3. Exercise planning, queued/working specialists, QA, final synthesis, completion, blocked and failed events using isolated test data. Confirm no fake progress, no premature completion and no roster displacement.
4. Verify Mission board, Archive, Actions and full-mission navigation still reach their original destinations. Review approvals only in a safe test environment.
5. Turn Motion off, enable OS reduced motion, background the page and scroll the room offscreen. Verify animations stop. Confirm touch scrolling does not activate adjacent desks.
6. Profile on an actual midrange phone and iOS Safari. Check frame pacing, input latency and SVG/label layering; the 60fps goal has not been measured.

Do not merge into `main` as part of this change.
