# AGENTS.md

Static frontend at accuracy.rt.gtfs.zone that scores GTFS Realtime
predictions. It loads TIDES data packages (uploaded, or listed from
`rt-archive.gtfs.zone`, published by gtfs-zone-rt-archive) and compares each
producer's `stop_time_predictions` and an in-browser baseline against the
actual times in `stop_visits`. Built on gtfs-zone-web-common, laid out like
gtfs-zone-rt-viewer.

The `stop_time_predictions` table is defined on the `gtfs-zone/predictions`
branch of [gtfs-zone/TIDES](https://github.com/gtfs-zone/TIDES).

## Commands

```bash
pnpm dev          # dev server on :8090
pnpm check        # typecheck, lint, knip, vitest
pnpm vuln         # osv-scanner vulnerability gate
```

Deployed to GitHub Pages from `v*` tags; DNS is `sites/pages-dns.yaml` in
gtfs-zone-infra.

## Architecture

- `src/metrics/`: pure scoring, unit tested in `tests/`. `dataset.ts` joins
  TIDES tables on service_date + trip_id_scheduled + scheduled_stop_sequence;
  `baselines.ts` holds the `schedule`, `last-stop` and `gps` baselines;
  `score.ts` samples each stop visit once a minute and aggregates by horizon,
  route, service date and local hour (quantiles from 10 s histograms).
- `src/worker/`: fetches, unzips and parses packages and runs the scorer off
  the main thread. `protocol.ts` is the message contract.
- `src/index.ts`: the shell (map + panel, from gtfs-zone-web-common), the load
  dialog, the GTFS snapshot for the map and the gps baseline, and the time
  slider that places `vehicle_locations` on the map.

## Conventions

- **Commits**: Conventional Commits, enforced by the `commit-msg` hook. Never add
  Co-Authored-By trailers. Setup is in [CONTRIBUTING.md](CONTRIBUTING.md).
- **Verification**: no Playwright or other browser automation. Stop at
  `pnpm typecheck` / `pnpm build` and hand off; the user checks in the browser.
- **UI**: conventions live in gtfs-zone-web-common's `AGENTS.md`.
- **Plans**: the central plan is `CURRENT_PLAN.md` in gtfs-zone-rt-archive.
  A local `CURRENT_PLAN.md` here is neither tracked nor gitignored: never
  stage or commit it.
