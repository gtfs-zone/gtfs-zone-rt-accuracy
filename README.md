# gtfs-zone-rt-accuracy

Static frontend at https://accuracy.rt.gtfs.zone that measures how accurate
GTFS Realtime stop time predictions are.

Load a [TIDES](https://github.com/TIDES-transit/TIDES) data package (upload,
or pick one published by
[gtfs-zone-rt-archive](https://github.com/gtfs-zone/gtfs-zone-rt-archive)).
Each producer's `stop_time_predictions` are compared with the actual times in
`stop_visits`, next to a simple baseline prediction computed in the browser.

## License

AGPL-3.0-or-later. See [LICENSE.txt](LICENSE.txt).
