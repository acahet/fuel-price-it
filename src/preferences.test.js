import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readString, writeString, readJson, writeJson } from "./preferences.js";

function installStorage(impl) {
  globalThis.localStorage = impl;
}

beforeEach(() => {
  const data = new Map();
  installStorage({
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  });
});

test("string values round-trip and missing keys are null", () => {
  assert.equal(readString("a"), null);
  writeString("a", "x");
  assert.equal(readString("a"), "x");
});

test("json values round-trip; corrupt json reads as null", () => {
  writeJson("v", { tankL: 40 });
  assert.deepEqual(readJson("v"), { tankL: 40 });
  writeString("v", "{not json");
  assert.equal(readJson("v"), null);
});

test("a throwing localStorage never propagates", () => {
  const boom = () => {
    throw new Error("denied");
  };
  installStorage({ getItem: boom, setItem: boom });
  assert.equal(readString("a"), null);
  assert.doesNotThrow(() => writeJson("a", 1));
});
