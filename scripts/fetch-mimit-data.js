// Builds public/data/stazioni/ from MIMIT's official open data (daily 8am extract),
// replacing the third-party prezzi-carburante.onrender.com API as the app's data source —
// that API was found to lag ~2 days behind MIMIT on average, and was missing at least one
// live station entirely (see roadmap memory for the comparison that led here).
//
// Output is sharded into a lat/lon grid (see src/geoGrid.js) rather than one national file,
// so the client only ever downloads the handful of cells near the user instead of all ~21k
// stations in Italy.
//
// Run manually with `npm run fetch-data`, or scheduled via .github/workflows/fetch-prices.yml.
//
// MIMIT has no CORS headers on these files, so this can't run client-side in the browser —
// it has to produce static JSON assets the app fetches same-origin instead.

import { cellKeyFor } from "../src/geoGrid.js";

const PREZZO_URL = "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv";
const ANAGRAFICA_URL = "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv";
const OUTPUT_DIR = new URL("../public/data/stazioni/", import.meta.url);
const MANIFEST_PATH = new URL("../public/data/stazioni/index.json", import.meta.url);

// Matches the fuel set the app has always supported — MIMIT reports several more
// (Blue Super, Gasolio Premium, HVO, ...) that were already ruled out of scope.
const FUEL_MAP = { Benzina: "benzina", Gasolio: "gasolio", GPL: "gpl", Metano: "metano" };

async function fetchCsvRows(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const text = await res.text();
  // Line 1 is "Estrazione del YYYY-MM-DD", line 2 is the header row.
  const lines = text.split("\n");
  const extractionLine = lines[0]?.trim() ?? "";
  const rows = lines.slice(2).map((l) => l.replace(/\r$/, "")).filter(Boolean);
  return { extractionLine, rows };
}

function parsePrezzoRows(rows) {
  // idImpianto -> { benzina: { self: {prezzo, data}, servito: {...} }, ... }
  const byStation = new Map();
  for (const row of rows) {
    const [id, fuelLabel, prezzoStr, isSelfStr, dtComu] = row.split("|");
    const fuel = FUEL_MAP[fuelLabel];
    if (!fuel) continue;
    const prezzo = parseFloat(prezzoStr);
    if (!Number.isFinite(prezzo)) continue;
    const priceType = isSelfStr === "1" ? "self" : "servito";
    if (!byStation.has(id)) byStation.set(id, {});
    const station = byStation.get(id);
    if (!station[fuel]) station[fuel] = {};
    station[fuel][priceType] = { prezzo, data: (dtComu || "").trim() };
  }
  return byStation;
}

function formatIndirizzo(indirizzo, comune, provincia) {
  const addr = (indirizzo || "").trim().replace(/\s+/g, " ");
  const città = (comune || "").trim();
  const prov = (provincia || "").trim();
  if (!città) return addr;
  return `${addr}, ${città}${prov ? ` (${prov})` : ""}`;
}

function buildStations(anagraficaRows, priceByStation) {
  const stations = [];
  for (const row of anagraficaRows) {
    const [id, , bandiera, , , indirizzo, comune, provincia, latStr, lonStr] = row.split("|");
    const prezzi = priceByStation.get(id);
    if (!prezzi) continue; // no prices in any of the 4 supported fuels
    const lat = parseFloat(latStr);
    const lon = parseFloat((lonStr || "").replace(/\r$/, ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    stations.push({
      id,
      gestore: (bandiera || "").trim() || "Distributore",
      indirizzo: formatIndirizzo(indirizzo, comune, provincia),
      lat,
      lon,
      prezzi,
    });
  }
  return stations;
}

function groupByCell(stations) {
  const byCell = new Map();
  for (const s of stations) {
    const key = cellKeyFor(s.lat, s.lon);
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(s);
  }
  return byCell;
}

async function main() {
  const [prezzo, anagrafica] = await Promise.all([fetchCsvRows(PREZZO_URL), fetchCsvRows(ANAGRAFICA_URL)]);
  const priceByStation = parsePrezzoRows(prezzo.rows);
  const stations = buildStations(anagrafica.rows, priceByStation);
  const byCell = groupByCell(stations);

  const fs = await import("node:fs/promises");
  // Clean slate each run so cells that lost their last station (rare, but possible if a
  // station's coordinates get corrected upstream) don't leave a stale orphaned file behind.
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  await Promise.all(
    [...byCell.entries()].map(([key, cellStations]) =>
      fs.writeFile(new URL(`./${key}.json`, OUTPUT_DIR), JSON.stringify(cellStations))
    )
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    extraction: prezzo.extractionLine,
    stationCount: stations.length,
    cellCount: byCell.size,
  };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest));

  console.log(
    `Wrote ${stations.length} stations across ${byCell.size} cells to ${OUTPUT_DIR.pathname} (${prezzo.extractionLine})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
