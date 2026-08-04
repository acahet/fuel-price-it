// Shared between the build script (scripts/fetch-mimit-data.js) and the client (src/app.jsx) —
// both must agree on how stations are bucketed into geo cells, or a search near a cell edge
// will silently miss stations that are actually within range.

export const GRID_DEG = 0.25; // ~20-28km per cell across Italy's latitude range

export function cellKeyFor(lat, lon) {
  return `${Math.floor(lat / GRID_DEG)}_${Math.floor(lon / GRID_DEG)}`;
}

// Every cell key whose cell could contain a point within radiusKm of (lat, lon). Deliberately
// over-inclusive (bounding box, not a precise circle) — the caller still does an exact Haversine
// check on every station afterward, so over-fetching a cell just means a few extra stations get
// checked and discarded, never a missed one.
export function cellsForQuery(lat, lon, radiusKm) {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const latMinCell = Math.floor((lat - latDelta) / GRID_DEG);
  const latMaxCell = Math.floor((lat + latDelta) / GRID_DEG);
  const lonMinCell = Math.floor((lon - lonDelta) / GRID_DEG);
  const lonMaxCell = Math.floor((lon + lonDelta) / GRID_DEG);
  const cells = [];
  for (let i = latMinCell; i <= latMaxCell; i++) {
    for (let j = lonMinCell; j <= lonMaxCell; j++) {
      cells.push(`${i}_${j}`);
    }
  }
  return cells;
}
