# Changelog

## v0.5.0 (2026-11-21)

### Feat

- **search**: map search with stops, routes, vehicles and places
- **load**: pick feeds in the shared load modal, keep the GTFS in the parse cache
- **load**: stream TIDES packages one day at a time
- **load**: show GTFS load progress and skip unused GTFS tables
- **feed**: load the schedule through the web-common v5.22.0 feed store

### Perf

- **worker**: serve map vehicles and timeline bins from the worker
- **dataset**: keep predictions and vehicle fixes as typed-array tables

## v0.4.0 (2026-11-12)

### Feat

- panel timeline, breadcrumbs, archive calendar, gps window help
- coverage timeline, map filters, ghost vehicles, route labels, windowed gps baseline

## v0.3.0 (2026-11-11)

### Feat

- **archive**: read packages from rt-archive.gtfs.zone

## v0.2.0 (2026-11-09)

### Feat

- **i18n**: add German

## v0.1.0 (2026-11-05)

### Feat

- score TIDES stop time predictions against stop visits and baselines
