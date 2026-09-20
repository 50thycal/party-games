# Polished intro verification — 2026-09-20

## Rules and source
Reviewed current main rules v29 and DEC-059/060, not historical draft rulebooks.
PR #197 was design-only; no extension or line-count options are taught.
`subway-intro-test.tsx` tests the **same geometry used to render** the before/after,
shared-neighborhood, crossing and Destination diagrams against companyComponents
and destinationMet. Disconnection removes Destination satisfaction; sharing a
neighborhood does not merge components. Setup-mode copy assertions also pass.

## Browser acceptance
Chromium, local Next app, 1180×820 landscape and 390×844 portrait (emulation,
not physical Safari/iPad testing). Inspected connection-slide screenshots.

- Open from local setup: first slide; Next/Back, slide selector and before/after work.
- All 15 slides: no horizontal dialog overflow at phone width; footer stays visible;
  long portrait content scrolls inside the dialog.
- Ready to play closes; reopen starts at slide 1. Escape restores launcher focus.
- Started a fresh local hotseat game, opened Settings → How to play, visited every
  slide and closed/reopened. Saved localStorage bytes were identical before/after;
  zero POST requests during tutorial navigation; no browser page errors.
- Nested Escape closes only the intro, keeps Settings open and restores focus to
  How to play. Closing Settings still returns to the same table.
- Token/flexible setup selections reach the correct slides; all landscape slides
  fit horizontally. Companion entry also opens and closes the introduction.
- No animated artwork; reduced-motion users receive the same static illustrations.

Initial agent-browser daemon failed and the standard browser download timed out.
A temporary Chromium package outside the repository enabled local Playwright tests;
no dependency or package-lock changes were required. Two early suite attempts lost
a compiled module from the shared temporary output; the final clean sequential run
passed, with no gameplay or harness workaround for that transient failure.

## Required checks
- `npm run build`: production build passes (final repeat recorded on PR).
- `npm run lint`: no ESLint warnings/errors.
- `./scripts/test-subway.sh`: complete suite passes, including new intro fixtures,
  2/3/4-company simulations/replays, companion API, UI and audit regressions.

Independent review and final reviewed SHA are recorded on the implementation PR.
