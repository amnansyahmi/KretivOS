# AI Office diorama implementation

## Current revision: living office and task execution board (2026-09-13)

This section supersedes the static-art implementation and verification notes below.

### Technical approach and behavior

- Keep the warm room as a cached environment texture, but remove all baked-in people. Seven independent, articulated SVG characters now move with a small presentation-only simulation. No Three.js, WebGL, physics engine or new dependency.
- `OfficeCharacters.tsx` owns its animation state in refs. A single requestAnimationFrame scheduler paints transforms at up to 30 updates/second; it does not rerender the dashboard each frame. Character layering follows foot depth. CSS handles limb motion, breathing, typing, reading, coffee and stretching.
- `lib/office-motion.ts` supplies authored aisle waypoints, shortest-path routing, staggered randomized idle choices and destination reservations. A new assignment interrupts idle behavior and returns the agent to its station, finishing the current aisle segment before rerouting rather than teleporting. Queued/blocked/failed agents wait instead of pretending to work. Completed work gets a short reaction, then idle activity resumes.
- Idle movement is cosmetic: no model calls, mission creation, API requests, fabricated outputs or artificial progress. The backend's existing scheduler continues to control actual task execution; travel never delays it.
- Offscreen/background state pauses the scheduler. Motion-off and OS reduced-motion park characters at their stations and disable animations. Focus/hover holds an individual character still for inspection. Permanent station buttons remain a stable alternative to moving targets.
- The fixed camera, readable panorama, zone controls, 44px character targets and existing Radix agent dialog are retained. Extended specialists remain in the roster, not animated on the seven-person floor.

### Mission workflow revision

- The existing SSE protocol already sends `taskId`; the dashboard now retains it in an independent task ledger. Multiple tasks on one agent no longer overwrite each other's status/output, and one task completing cannot hide another active task. No database or API contract changes.
- `MissionWorkboard.tsx` separates specialist task progress, dependency readiness, QA review, final delivery and user approval. Filters expose queued, working, blocked/failed and completed tasks. Instructions and task-specific output are expandable; final output uses the existing rich-text renderer and can be copied.
- Connection paths use actual completed dependencies of active tasks when task-level state is present. Quality corrections return the flow to specialist work even when Chief retains a synthesis status.
- Mission history has title/client search, status filters, wrapping titles and deliverable/quality metadata. Search covers the recent records supplied by the existing overview API, not all historical records.
- `PersistedTaskList.tsx` shows saved task dependencies, instructions, outputs, stale warnings and revision feedback. Failed retry requests retain feedback; failed approvals/ratings surface an error rather than silently claiming success.
- Interrupted streams are reported as needing attention, with active task/agent presentation marked blocked pending inspection of the saved mission. This does not change persisted status or claim the server was cancelled. Completion is never inferred simply because the stream closed or a mission ID exists.

### Asset provenance

`public/office/warm-office-empty-v3.webp`: 1448 × 1086, 182,944 bytes. Created using the built-in image tool from `warm-office-v2.webp`, then encoded as WebP (quality 88) without resizing. Prompt: “Remove ALL SEVEN PEOPLE completely (six at desks and one on sofa). Reconstruct the empty chairs and sofa naturally. Keep EXACT same room layout, camera, 4:3 framing, furniture positions, desks, lamps, plants, pantry, wood floor and lighting. No people, no silhouettes, no characters anywhere. No text, no logos, no watermark. Do not move or redesign any furniture.” Original artwork is retained; no uploaded source was overwritten.

### Verification and limitations

- Movement/task/scene regression checks cover graph connectivity, actual idle travel, continuous interruption/return, queued/blocked behavior, QA/Chief poses, completion reactions, occupied idle destinations, concurrent same-agent tasks, output preservation and dependency-based handoffs.
- Full test suite: 544 passing. TypeScript checks and a clean production build pass. Build reports `/office` at approximately 23.6 kB route JS / 150 kB first load JS; this is not a device performance measurement.
- Token lint remains a repository baseline failure (115 violations, down from 125); the new SVG palette lives in scoped CSS rather than hardcoded component literals.
- Browser QA is blocked: the provided browser returns `net::ERR_BLOCKED_BY_CLIENT` for the local preview. The dev server also encountered this host's `uv_interface_addresses` restriction. No workaround to browser/network restrictions was attempted. Screenshots and interaction checks at 390px, tablet and desktop, real-device performance, Safari and a live paid mission are **not verified**.
- This is a lightweight 2.5D character simulation, not The Sims engine or a fully modeled 3D world. Routes are authored for this exact backdrop; there is no full crowd collision physics, free camera, furniture interaction solver or per-pixel furniture occlusion. Visual route/seat alignment must be checked in an approved browser preview before release.
- Work is isolated to `feature/ai-office-mvp`; do not merge into main.

## Previous revision: static warm miniature studio

The follow-up reference changes the art direction from procedural SVG meshes to a detailed, warm, pre-rendered office illustration. The original architecture notes below describe the first revision, not the current rendering.

- `public/office/warm-office-v2.webp`: 1448 × 1086, 187,422 bytes. Warm walnut flooring, blue-hour city windows, plants, pantry, six staffed desks and Chief working from the sofa lounge. Created with the built-in image-generation tool, then encoded to WebP without resizing or changing the composition.
- The room is **pre-rendered artwork, not a real-time 3D simulation**. People/furniture do not move. Native HTML hotspots, state badges, bounded handoff paths, keyboard interaction, agent details and actual mission state remain interactive.
- Hotspots in `lib/office-scene.ts` are registered to this exact artwork in a 1000 × 750 coordinate plane. The art and hotspot parent share a 4:3 aspect ratio, with no cover-cropping. A replacement artwork requires re-registering positions.
- Seven character labels stay outside the baked image. Queued, Working, Reviewing, Attention and Completed are derived from the existing event stream, never from the seated poses.
- The detail dialog uses portrait windows into the same cached artwork. Extended specialists retain a neutral placeholder because they are not depicted in the seven-person room.
- Mission, Archive and Actions controls now sit in a compact console row above the scene, to avoid covering furniture and people. They retain their existing callbacks. Small screens retain horizontal panorama navigation at readable label sizes.
- The generated image is only requested when the classroom or an agent portrait mounts. There are no new JavaScript dependencies or backend changes.

### Generation brief

Built-in imagegen; attached screenshot used as style reference only. Generate an original standalone 3D-rendered isometric cutaway office: realistic walnut floor, cream walls, warm amber lighting, blue-hour city windows, bookshelves, plants, rear-right pantry, front-left green sofa and TV, miniature adult workers with clear space for native interactive labels. Navy-black exterior background; complete room framing; no dashboard chrome, text, badges, logo or watermark. Final targeted edit: preserve all six desk workers and the entire composition; add a seventh adult leader in charcoal clothing on the green sofa using a laptop. The original generated files are preserved separately; the project consumes the WebP asset above.

### Verification scope

Type checks, the existing test suite and a production build are rerun for this revision. The supplied browser's local-preview access remains blocked; on-screen mobile/desktop hotspot alignment, Safari interaction and device performance still need the release checks listed below. Inspecting the generated artwork is not equivalent to testing the composed application UI.

## First revision (historical audit)

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
