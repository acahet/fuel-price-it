# Distributore — Prezzi Carburante

A small React web app that finds the cheapest nearby fuel station in Italy. It geolocates the user, queries a public API for stations within a chosen radius, and highlights the lowest price for the selected fuel type. If geolocation is denied or unavailable, it asks the user to retry rather than silently searching from a default location.

Live demo: deployed via GitHub Pages on every push to `main`.

## Features

- Geolocation-based search; no default-location fallback if it's denied
- Fuel type selector: Benzina, Gasolio, GPL, Metano
- Self vs Servito toggle, with automatic fallback to whichever is actually available
- Adjustable search radius (3–30 km)
- List of nearby stations sorted by distance, with the cheapest price in the zone highlighted
- Price freshness indicator, flagging prices unverified after 5 days
- Navigate button per station (Google Maps / Waze / Apple Maps)
- Handles missing/invalid price data and API/geolocation errors gracefully

## Tech stack

- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/)
- [lucide-react](https://lucide.dev/) for icons
- Data source: [prezzi-carburante API](https://prezzi-carburante.onrender.com/api/distributori), built on MIMIT open data (fuel price communications under Art. 51 L.99/2009)

## Getting started

```bash
npm install
npm run dev
```

This starts the Vite dev server (default: http://localhost:5173).

### Build

```bash
npm run build
```

Outputs a production build to `dist/`.

### Preview a production build

```bash
npm run preview
```

## Deployment

Pushing to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the app and publishes `dist/` to GitHub Pages. The Vite base path is set to `/fuel-price-it/` in [`vite.config.js`](vite.config.js) to match the Pages URL.

## Branching & release workflow

- Feature/fix branches (`feature/*`, `fix/*`) merge into `dev` for integration testing.
- `dev` merges into `main` as a release, which auto-deploys to GitHub Pages ([`deploy.yml`](.github/workflows/deploy.yml)).
- `main` never receives feature branches directly.

### Cutting a release

1. Make sure everything intended for the release is merged into `dev` and looks good there.
2. Open a PR from `dev` into `main`.
3. After it's merged, on `main`: bump the `version` in [`package.json`](package.json) (semver), and move the `[Unreleased]` section in [`CHANGELOG.md`](CHANGELOG.md) under a new `## [x.y.z] - YYYY-MM-DD` heading.
4. Commit that as `Release vX.Y.Z`, then tag and push:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
5. The tag push triggers [`release.yml`](.github/workflows/release.yml), which publishes a GitHub Release with auto-generated notes. `deploy.yml` already redeployed GitHub Pages when `main` was updated in step 2.

## Roadmap

### Next
- [ ] Interactive map view (Leaflet/MapLibre) — color-coded markers, click-to-scroll to list card
- [ ] Favorite fuel type: ask once on first visit, remember it as the default (`feature/favorite-fuel-type`)

### Backlog
- [ ] Trivy — dependency vulnerability scanning in CI
- [ ] SonarQube — static analysis / code quality gate in CI
- [ ] E2E tests

### Dropped
- Specialty fuel sub-types (Benzina Speciale / Gasolio Hi-Q) — the prezzi-carburante API doesn't expose these fuel variants, only benzina/gasolio/gpl/metano

## Project structure

```
index.html          Entry HTML (favicon, root div, script tag)
src/main.jsx         React entry point
src/app.jsx           Main app component (UI, geolocation, data fetching)
vite.config.js        Vite/React build config
.github/workflows/    CI/CD (GitHub Pages deploy)
```
