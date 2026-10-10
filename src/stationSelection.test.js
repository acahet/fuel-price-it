import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cheapestStation,
  expandStations,
  haversineKm,
  isStaleStation,
  latestReportedAt,
  listForDisplay,
  parseStationDate,
  pumpLabelText,
  resolvePriceTypes,
  STALE_THRESHOLD_MS,
} from "./stationSelection.js";

const ORIGIN = { lat: 40.0, lon: 17.0 };

function station(id, { lat = ORIGIN.lat, lon = ORIGIN.lon, prezzi = {} } = {}) {
  return { id, gestore: `Gestore ${id}`, indirizzo: `Via ${id}`, lat, lon, prezzi };
}

test("haversineKm is zero for identical points", () => {
  assert.equal(haversineKm(41.9, 12.5, 41.9, 12.5), 0);
});

test("haversineKm matches a known distance (Rome to Milan, ~477 km)", () => {
  const km = haversineKm(41.9028, 12.4964, 45.4642, 9.19);
  assert.ok(Math.abs(km - 477) < 3, `got ${km}`);
});

test("parseStationDate reads the Italian dd/mm/yyyy hh:mm:ss format", () => {
  const d = parseStationDate("05/08/2026 14:30:15");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7); // August, zero-based
  assert.equal(d.getDate(), 5);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
  assert.equal(d.getSeconds(), 15);
});

test("parseStationDate accepts a date without a time", () => {
  const d = parseStationDate("01/01/2026");
  assert.equal(d.getHours(), 0);
});

test("parseStationDate returns null for unusable input", () => {
  assert.equal(parseStationDate(undefined), null);
  assert.equal(parseStationDate(42), null);
  assert.equal(parseStationDate(""), null);
  assert.equal(parseStationDate("not a date"), null);
});

test("expandStations returns one entry per price type within the radius", () => {
  const near = station("near", {
    prezzi: {
      benzina: {
        self: { prezzo: 1.8, data: "01/08/2026 10:00:00" },
        servito: { prezzo: 1.95, data: "01/08/2026 10:00:00" },
      },
    },
  });
  const out = expandStations([[near]], "benzina", ORIGIN, 3);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((s) => s.self).sort(), [false, true]);
  assert.equal(out[0].distanza, 0);
});

test("expandStations skips stations outside the radius and without the fuel", () => {
  const far = station("far", {
    lat: ORIGIN.lat + 1, // ~111 km north
    prezzi: { benzina: { self: { prezzo: 1.8, data: "x" } } },
  });
  const noFuel = station("nofuel", { prezzi: { gpl: { self: { prezzo: 0.8, data: "x" } } } });
  assert.deepEqual(expandStations([[far, noFuel]], "benzina", ORIGIN, 30), []);
});

test("expandStations flattens several cell lists", () => {
  const a = station("a", { prezzi: { diesel: { self: { prezzo: 1.7, data: "x" } } } });
  const b = station("b", { prezzi: { diesel: { self: { prezzo: 1.6, data: "x" } } } });
  const out = expandStations([[a], [b]], "diesel", ORIGIN, 5);
  assert.deepEqual(out.map((s) => s.indirizzo), ["Via a", "Via b"]);
});

test("resolvePriceTypes keeps the preference when it is offered", () => {
  const valid = [{ self: true }, { self: false }];
  const { availability, effectiveType } = resolvePriceTypes("self", valid);
  assert.deepEqual(availability, { self: true, servito: true });
  assert.equal(effectiveType, "self");
});

test("resolvePriceTypes falls back to the other type when the preference is missing", () => {
  const onlyServito = [{ self: false }];
  assert.equal(resolvePriceTypes("self", onlyServito).effectiveType, "servito");
  assert.equal(resolvePriceTypes("servito", [{ self: true }]).effectiveType, "self");
});

test("resolvePriceTypes with no results keeps the preference and reports nothing available", () => {
  const { availability, effectiveType } = resolvePriceTypes("servito", []);
  assert.deepEqual(availability, { self: false, servito: false });
  assert.equal(effectiveType, "servito");
});

test("listForDisplay keeps one price type, sorted by distance, capped at the limit", () => {
  const valid = [
    { self: true, distanza: 4 },
    { self: false, distanza: 1 },
    { self: true, distanza: 2 },
    { self: true, distanza: 9 },
  ];
  const out = listForDisplay(valid, "self", 2);
  assert.deepEqual(out.map((s) => s.distanza), [2, 4]);
  assert.ok(out.every((s) => s.self));
});

test("isStaleStation flags old reports and unreadable dates", () => {
  const now = new Date(2026, 7, 10, 12, 0, 0).getTime();
  const fresh = { data: "09/08/2026 10:00:00" };
  const old = { data: new Date(now - STALE_THRESHOLD_MS - 60_000).toLocaleDateString("it-IT") };
  assert.equal(isStaleStation(fresh, now), false);
  assert.equal(isStaleStation({ data: "garbage" }, now), true);
  assert.equal(isStaleStation(old, now), true);
});

test("cheapestStation prefers a fresh station over a cheaper stale one", () => {
  const now = new Date(2026, 7, 10, 12, 0, 0).getTime();
  const stations = [
    { id: "stale-cheap", prezzo: 1.5, data: "01/01/2020 00:00:00" },
    { id: "fresh", prezzo: 1.9, data: "09/08/2026 10:00:00" },
  ];
  assert.equal(cheapestStation(stations, now).id, "fresh");
});

test("cheapestStation falls back to all stations when none are fresh", () => {
  const now = new Date(2026, 7, 10, 12, 0, 0).getTime();
  const stations = [
    { id: "a", prezzo: 1.9, data: "01/01/2020 00:00:00" },
    { id: "b", prezzo: 1.5, data: "01/01/2020 00:00:00" },
  ];
  assert.equal(cheapestStation(stations, now).id, "b");
});

test("cheapestStation returns null for an empty list", () => {
  assert.equal(cheapestStation([]), null);
});

test("latestReportedAt returns the most recent readable date, or null", () => {
  const stations = [
    { data: "01/08/2026 09:00:00" },
    { data: "03/08/2026 08:00:00" },
    { data: "garbage" },
  ];
  assert.equal(latestReportedAt(stations).getDate(), 3);
  assert.equal(latestReportedAt([{ data: "garbage" }]), null);
});

test("pumpLabelText describes each lookup status", () => {
  assert.equal(pumpLabelText("loading"), "Aggiornamento…");
  assert.equal(pumpLabelText("error"), "Servizio non raggiungibile");
  assert.equal(pumpLabelText("geolocation_denied"), "Posizione non disponibile");
  assert.equal(pumpLabelText("idle"), "In attesa della posizione…");
  assert.equal(pumpLabelText("ok", null, "self"), "Nessun distributore trovato");
  assert.equal(pumpLabelText("ok", { prezzo: 1.8 }, "servito"), "Miglior prezzo · Servito");
  assert.equal(pumpLabelText("ok", { prezzo: 1.8 }, "self"), "Miglior prezzo · Self");
  assert.equal(pumpLabelText("unknown"), "");
});
