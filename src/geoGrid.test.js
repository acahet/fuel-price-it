import { test } from "node:test";
import assert from "node:assert/strict";
import { cellKeyFor, cellsForQuery, GRID_DEG } from "./geoGrid.js";

test("cellKeyFor buckets a point into its grid cell", () => {
  assert.equal(cellKeyFor(40.6, 17.9), `${Math.floor(40.6 / GRID_DEG)}_${Math.floor(17.9 / GRID_DEG)}`);
});

test("points on the same cell share a key", () => {
  assert.equal(cellKeyFor(40.51, 17.51), cellKeyFor(40.74, 17.74));
});

test("cellsForQuery always includes the cell that holds the centre point", () => {
  const cells = cellsForQuery(40.6, 17.9, 3);
  assert.ok(cells.includes(cellKeyFor(40.6, 17.9)));
});

test("a larger radius never returns fewer cells", () => {
  const small = cellsForQuery(40.6, 17.9, 3).length;
  const large = cellsForQuery(40.6, 17.9, 30).length;
  assert.ok(large >= small);
});

test("cellsForQuery returns unique keys in the expected block", () => {
  const cells = cellsForQuery(40.6, 17.9, 1);
  assert.equal(new Set(cells).size, cells.length);
  assert.ok(cells.every((k) => /^-?\d+_-?\d+$/.test(k)));
});
