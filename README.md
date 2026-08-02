# Distributore — Prezzi Carburante

A small React web app that finds the cheapest nearby fuel station in Italy. It geolocates the user (falling back to Manduria, Puglia if geolocation is denied), queries a public API for stations within a chosen radius, and highlights the lowest price for the selected fuel type.

Live demo: deployed via GitHub Pages on every push to `main`.

## Features

- Geolocation with automatic fallback to a default location
- Fuel type selector: Benzina, Gasolio, GPL, Metano
- Adjustable search radius (3–30 km)
- List of nearby stations sorted by price, with the cheapest highlighted
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

- Feature branches (`feature/*`) merge into `dev` for integration testing.
- `dev` merges into `main` as a release, which auto-deploys to GitHub Pages.
- `main` never receives feature branches directly.

## Roadmap

### Next
- [ ] Interactive map view (Leaflet/MapLibre) — color-coded markers, click-to-scroll to list card

### Then
- [ ] Formal release process on top of the `dev` → `main` flow above: versioned/tagged releases and a changelog

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
