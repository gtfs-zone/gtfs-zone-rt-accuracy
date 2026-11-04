# AGENTS.md

Static frontend at accuracy.rt.gtfs.zone that scores GTFS Realtime
predictions. It loads TIDES data packages (uploaded, or listed from
`archive.rt.gtfs.zone`, published by gtfs-zone-rt-archive) and compares each
producer's `stop_time_predictions` and an in-browser baseline against the
actual times in `stop_visits`. Built on gtfs-zone-web-common, laid out like
gtfs-zone-rt-viewer.

The `stop_time_predictions` table is defined on the `gtfs-zone/predictions`
branch of [gtfs-zone/TIDES](https://github.com/gtfs-zone/TIDES).

## Conventions

- **Commits**: Conventional Commits, enforced by the `commit-msg` hook. Never add
  Co-Authored-By trailers. Setup is in [CONTRIBUTING.md](CONTRIBUTING.md).
- **Verification**: no Playwright or other browser automation. Stop at
  `pnpm typecheck` / `pnpm build` and hand off; the user checks in the browser.
- **UI**: conventions live in gtfs-zone-web-common's `AGENTS.md`.
- **Plans**: the central plan is `CURRENT_PLAN.md` in gtfs-zone-rt-archive.
  A local `CURRENT_PLAN.md` here is neither tracked nor gitignored: never
  stage or commit it.
