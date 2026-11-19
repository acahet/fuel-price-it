// Per-province, per-fuel, per-price-type price statistics. Shared by the build script (which
// writes public/data/stazioni/stats.json) and the client, so anomaly detection and cost
// comparisons agree on how the numbers were derived.

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round3 = (n) => Math.round(n * 1000) / 1000;

export function summarize(prices) {
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: round3(quantile(sorted, 0.5)),
    p10: round3(quantile(sorted, 0.1)),
    p90: round3(quantile(sorted, 0.9)),
  };
}

// stations: [{ provincia, prezzi: { fuel: { self?: {prezzo}, servito?: {prezzo} } } }]
// -> { [provincia]: { [fuel]: { self?: summary, servito?: summary } } }. Stations without a
// province are skipped.
export function computeProvinceStats(stations) {
  const buckets = new Map(); // "prov|fuel|kind" -> number[]
  for (const s of stations) {
    if (!s.provincia) continue;
    for (const [fuel, kinds] of Object.entries(s.prezzi)) {
      for (const [kind, info] of Object.entries(kinds)) {
        const key = `${s.provincia}|${fuel}|${kind}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(info.prezzo);
      }
    }
  }
  const stats = {};
  for (const [key, prices] of buckets) {
    const [prov, fuel, kind] = key.split("|");
    stats[prov] ??= {};
    stats[prov][fuel] ??= {};
    stats[prov][fuel][kind] = summarize(prices);
  }
  return stats;
}
