# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-08-05

### Added
- Interactive map view (Leaflet/OpenStreetMap): user-location marker, gold marker for the cheapest station, teal for standard, click-to-scroll-and-highlight the matching list card.
- Runtime map toggle via a Supabase-backed feature flag — the map can be switched on/off live from a dashboard without a redeploy. Falls back to a build-time env flag when Supabase isn't configured.
- Smart geolocation: shows a fast approximate location (IP-based) while the browser resolves a precise GPS fix, and silently upgrades to GPS the moment it's ready. If GPS is denied but IP succeeds, results still show instead of a dead-end error screen.

### Changed
- Station data is now fetched directly from MIMIT's official daily CSVs instead of a third-party API, closing a ~2-day staleness gap down to ~1 day. Data is geo-sharded and cached client-side (Cache API) so repeat visits and nearby queries pull only small, targeted slices instead of the whole country.

## [1.1.0] - 2026-08-02

### Added
- Self vs Servito toggle, defaulting to Self. Auto-falls back to whichever price type is actually available for the selected fuel/area (GPL is essentially Self-unavailable in Italy) and visibly disables the unavailable option.
- Price freshness indicator: relative time since each station's last price report, with prices older than 5 days flagged "NON VERIFICATO" (stations are legally required to report changes within 8 days, art. 51 L.99/2009).
- Navigation deep links: a Navigate button on each station opens a picker for Google Maps, Waze, or Apple Maps.
- Favorite fuel type: asks once on first visit which fuel the user usually buys, remembers it (localStorage) as the default on future visits.

### Changed
- Station list now sorts by distance instead of price — the true cheapest price in the zone is still surfaced on the pump display (with its distance) and tagged wherever it lands in the distance-sorted list.
- Denied/unavailable geolocation no longer silently falls back to a hardcoded default location; the app now shows a clear message and retry action instead of searching from a location the user didn't grant.

### Fixed
- Self/Servito preference no longer permanently resets to Servito after viewing a GPL/Metano-only area — the user's actual preference and the currently-displayed price type are now tracked separately.

## [1.0.0] - Initial release

- Geolocation-based search for nearby fuel stations in Italy.
- Fuel type selector (Benzina, Gasolio, GPL, Metano) and adjustable search radius.
- List of nearby stations with the cheapest highlighted.
- Crash fix for stations with a missing/invalid price.

[Unreleased]: https://github.com/acahet/fuel-price-it/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/acahet/fuel-price-it/releases/tag/v1.2.0
[1.1.0]: https://github.com/acahet/fuel-price-it/releases/tag/v1.1.0
