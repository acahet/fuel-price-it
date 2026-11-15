import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, computeProvinceStats } from "./priceStats.js";

test("summarize computes median and interpolated percentiles", () => {
  const s = summarize([1, 2, 3, 4, 5]);
  assert.deepEqual(s, { n: 5, median: 3, p10: 1.4, p90: 4.6 });
});

test("summarize handles a single price", () => {
  assert.deepEqual(summarize([1.9]), { n: 1, median: 1.9, p10: 1.9, p90: 1.9 });
});

test("computeProvinceStats groups by province, fuel and price type", () => {
  const st = (provincia, prezzi) => ({ provincia, prezzi });
  const stats = computeProvinceStats([
    st("LE", { benzina: { self: { prezzo: 1.8 }, servito: { prezzo: 2 } } }),
    st("LE", { benzina: { self: { prezzo: 2 } } }),
    st("TA", { gasolio: { self: { prezzo: 1.7 } } }),
    st("", { gasolio: { self: { prezzo: 9 } } }),
  ]);
  assert.equal(stats.LE.benzina.self.n, 2);
  assert.equal(stats.LE.benzina.self.median, 1.9);
  assert.equal(stats.LE.benzina.servito.n, 1);
  assert.equal(stats.TA.gasolio.self.median, 1.7);
  assert.deepEqual(Object.keys(stats).sort(), ["LE", "TA"]);
});
