import { test } from "node:test";
import assert from "node:assert/strict";
import { approximateLabel, createLocationRace } from "./locationRace.js";

function recorder() {
  const calls = { fixes: [], failures: 0 };
  const race = createLocationRace({
    onFix: (coords, label) => calls.fixes.push({ coords, label }),
    onFailed: () => {
      calls.failures += 1;
    },
  });
  return { race, calls };
}

const IP_OK = { success: true, latitude: 40.6, longitude: 17.9, city: "Manduria" };

test("approximateLabel includes the city when known", () => {
  assert.equal(approximateLabel("Manduria"), "Posizione approssimativa (Manduria)");
  assert.equal(approximateLabel(""), "Posizione approssimativa");
  assert.equal(approximateLabel(undefined), "Posizione approssimativa");
});

test("a successful IP lookup applies an approximate fix", () => {
  const { race, calls } = recorder();
  race.ipResult(IP_OK);
  assert.deepEqual(calls.fixes, [
    { coords: { lat: 40.6, lon: 17.9 }, label: "Posizione approssimativa (Manduria)" },
  ]);
  assert.equal(calls.failures, 0);
});

test("a GPS fix arriving after IP replaces the approximate location", () => {
  const { race, calls } = recorder();
  race.ipResult(IP_OK);
  race.gpsResult({ latitude: 40.61, longitude: 17.91 });
  assert.equal(calls.fixes.length, 2);
  assert.deepEqual(calls.fixes[1], { coords: { lat: 40.61, lon: 17.91 }, label: "Posizione attuale" });
});

test("IP never overwrites a GPS fix that already won", () => {
  const { race, calls } = recorder();
  race.gpsResult({ latitude: 40.61, longitude: 17.91 });
  race.ipResult(IP_OK);
  assert.equal(calls.fixes.length, 1);
  assert.equal(calls.fixes[0].label, "Posizione attuale");
});

test("a GPS denial does not fail the lookup when IP already provided a fix", () => {
  const { race, calls } = recorder();
  race.ipResult(IP_OK);
  race.gpsFailed();
  assert.equal(calls.failures, 0);
});

test("the lookup fails only once both sources have failed", () => {
  const { race, calls } = recorder();
  race.ipFailed();
  assert.equal(calls.failures, 0, "still waiting on GPS");
  race.gpsFailed();
  assert.equal(calls.failures, 1);
  assert.equal(calls.fixes.length, 0);
});

test("an IP reply that says success is false counts as a failed source", () => {
  const { race, calls } = recorder();
  race.ipResult({ success: false });
  race.gpsFailed();
  assert.equal(calls.failures, 1);
});

test("GPS failing first still lets a later IP answer through", () => {
  const { race, calls } = recorder();
  race.gpsFailed();
  race.ipResult(IP_OK);
  assert.equal(calls.fixes.length, 1);
  assert.equal(calls.failures, 0);
});
