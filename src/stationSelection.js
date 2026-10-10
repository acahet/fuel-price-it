// Pure helpers behind the station list: turning the cell files into one entry per price type,
// deciding which Self/Servito type to show, and picking the list that is displayed. Kept out of
// the React component so they can be unit tested without rendering anything.

const EARTH_RADIUS_KM = 6371;

// Straight-line distance, not driving distance — matches what the old third-party API returned
// (its `distanza` field), close enough at the 3-30km radii this app searches.
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// MIMIT dates look like "dd/mm/yyyy hh:mm:ss" (the time part is optional).
export function parseStationDate(str) {
  if (typeof str !== "string") return null;
  const [datePart, timePart] = str.split(" ");
  const [day, month, year] = (datePart || "").split("/").map(Number);
  const [hour, minute, second] = (timePart || "").split(":").map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
}

// Each station can offer both self and servito for a fuel — expand to one entry per price type
// within `radius` km of `origin`, mirroring the shape the old per-query API used to return.
export function expandStations(cellStationLists, fuel, origin, radius) {
  return cellStationLists.flat().flatMap((s) => {
    const fuelPrices = s.prezzi[fuel];
    if (!fuelPrices) return [];
    const distanza = haversineKm(origin.lat, origin.lon, s.lat, s.lon);
    if (distanza > radius) return [];
    return Object.entries(fuelPrices).map(([priceKind, info]) => ({
      gestore: s.gestore,
      indirizzo: s.indirizzo,
      latitudine: s.lat,
      longitudine: s.lon,
      prezzo: info.prezzo,
      self: priceKind === "self",
      data: info.data,
      distanza,
    }));
  });
}

// Which price types exist in the results, and which type to show. GPL is essentially never
// self-service in Italy, and some fuels only report one type in an area — so when the user's
// preferred type isn't offered, fall back to the other one. The fallback only changes what is
// displayed; the user's preference itself is kept by the caller.
export function resolvePriceTypes(priceType, valid) {
  const hasSelf = valid.some((s) => s.self === true);
  const hasServito = valid.some((s) => s.self === false);
  const availability = { self: hasSelf, servito: hasServito };
  if (valid.length === 0) return { availability, effectiveType: priceType };

  const currentAvailable = priceType === "self" ? hasSelf : hasServito;
  const otherAvailable = priceType === "self" ? hasServito : hasSelf;
  const fallback = priceType === "self" ? "servito" : "self";
  const effectiveType = !currentAvailable && otherAvailable ? fallback : priceType;
  return { availability, effectiveType };
}

// Sorted by distance, not price: a station saving a couple cents but 20km out of the way isn't
// actually worth it — the list should reflect what's practical to drive to.
export function listForDisplay(valid, effectiveType, limit = 15) {
  return valid
    .filter((s) => s.self === (effectiveType === "self"))
    .sort((a, b) => a.distanza - b.distanza)
    .slice(0, limit);
}

// Text on the pump display for each lookup status (the headline above the best price).
const PUMP_LABEL_BY_STATUS = {
  loading: () => "Aggiornamento…",
  error: () => "Servizio non raggiungibile",
  geolocation_denied: () => "Posizione non disponibile",
  idle: () => "In attesa della posizione…",
  ok: (cheapest, effectiveType) => {
    if (!cheapest) return "Nessun distributore trovato";
    const typeLabel = effectiveType === "self" ? "Self" : "Servito";
    return `Miglior prezzo · ${typeLabel}`;
  },
};

export function pumpLabelText(status, cheapest, effectiveType) {
  const label = PUMP_LABEL_BY_STATUS[status];
  return label ? label(cheapest, effectiveType) : "";
}

// Prices reported more than this long ago are shown as "NON VERIFICATO".
export const STALE_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000;

// A station with an unreadable report date counts as stale.
export function isStaleStation(station, now = Date.now()) {
  const reportedAt = parseStationDate(station.data);
  return !reportedAt || now - reportedAt.getTime() > STALE_THRESHOLD_MS;
}

// The list is ordered by distance, so the cheapest station isn't necessarily first. Prefer
// recently-verified prices for the headline number: an unverified price that "wins" on paper
// isn't worth sending someone to if it's stale. Falls back to all stations if none are fresh.
export function cheapestStation(stations, now = Date.now()) {
  const fresh = stations.filter((s) => !isStaleStation(s, now));
  const pool = fresh.length ? fresh : stations;
  return pool.reduce((min, s) => (!min || s.prezzo < min.prezzo ? s : min), null);
}

// Most recent report date across the stations, or null.
export function latestReportedAt(stations) {
  return stations.reduce((latest, station) => {
    const reportedAt = parseStationDate(station.data);
    return reportedAt && (!latest || reportedAt > latest) ? reportedAt : latest;
  }, null);
}
