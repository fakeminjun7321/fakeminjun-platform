import assert from "node:assert/strict";
import test from "node:test";
import {
  IPHO_TOPICS,
  PHYSICS_RESOURCES,
  PHYSICS_TOOLS,
  filterPhysicsResources,
} from "../src/physicsData.js";
import { fitWithin, normalizeCropRect, scaleCropRect } from "../src/captureGeometry.js";
import { PHYSICS_SCAN_POLL_INTERVAL_MS, startPhysicsScanPolling } from "../src/physicsScanPolling.js";

test("physics workspace exposes all seven selected exploration modes", () => {
  assert.equal(PHYSICS_TOOLS.length, 7);
  assert.deepEqual(PHYSICS_TOOLS.map(({ code }) => code), ["01", "02", "03", "04", "05", "06", "07"]);
  assert.equal(new Set(PHYSICS_TOOLS.map(({ id }) => id)).size, PHYSICS_TOOLS.length);
  assert.ok(PHYSICS_TOOLS.every(({ input, output, example }) => input.trim() && output.trim() && example.trim()));
});

test("physics resources use unique HTTPS links and include official KPhO and IPhO sources", () => {
  assert.equal(new Set(PHYSICS_RESOURCES.map(({ id }) => id)).size, PHYSICS_RESOURCES.length);
  assert.ok(PHYSICS_RESOURCES.every(({ href }) => href.startsWith("https://")));
  assert.ok(PHYSICS_RESOURCES.some(({ id }) => id === "kpho-official"));
  assert.ok(PHYSICS_RESOURCES.some(({ id }) => id === "ipho-problems"));
  assert.ok(PHYSICS_RESOURCES.some(({ provider }) => provider === "MIT OpenCourseWare"));
  assert.equal(IPHO_TOPICS.length, 6);
});

test("physics resource filters combine query, type, and saved state", () => {
  assert.deepEqual(
    filterPhysicsResources(PHYSICS_RESOURCES, { query: "전자기학" }).map(({ id }) => id),
    ["mit-802"],
  );
  assert.deepEqual(
    filterPhysicsResources(PHYSICS_RESOURCES, { type: "기출문제" }).map(({ id }) => id),
    ["ipho-problems"],
  );
  assert.ok(filterPhysicsResources(PHYSICS_RESOURCES, { savedOnly: true }).every(({ saved }) => saved));
});

test("pending physics scans keep polling until the component clears the interval", async () => {
  let intervalCallback = null;
  let intervalDelay = null;
  let clearedId = null;
  let refreshes = 0;
  const stop = startPhysicsScanPolling(async () => { refreshes += 1; }, {
    setIntervalFn(callback, delay) {
      intervalCallback = callback;
      intervalDelay = delay;
      return 73;
    },
    clearIntervalFn(id) { clearedId = id; },
  });

  assert.equal(intervalDelay, PHYSICS_SCAN_POLL_INTERVAL_MS);
  await intervalCallback();
  await intervalCallback();
  assert.equal(refreshes, 2);
  stop();
  assert.equal(clearedId, 73);
});

test("capture crop geometry clamps reverse drags and scales to source pixels", () => {
  assert.deepEqual(
    normalizeCropRect({ x: 90, y: 70 }, { x: -10, y: 20 }, { width: 100, height: 80 }),
    { x: 0, y: 20, width: 90, height: 50 },
  );
  assert.deepEqual(
    scaleCropRect(
      { x: 25, y: 10, width: 50, height: 40 },
      { width: 100, height: 50 },
      { width: 1000, height: 500 },
    ),
    { x: 250, y: 100, width: 500, height: 400 },
  );
  assert.deepEqual(fitWithin(4800, 2400), { width: 2400, height: 1200 });
  assert.deepEqual(fitWithin(1200, 800), { width: 1200, height: 800 });
});

test("capture output sizing stays inside the visual analysis pixel budget", () => {
  const fitted = fitWithin(5000, 5000);
  assert.ok(fitted.width <= 2400);
  assert.ok(fitted.height <= 2400);
  assert.ok(fitted.width * fitted.height <= 4_000_000);
});

test("capture crop geometry rejects missing preview dimensions", () => {
  assert.throws(
    () => scaleCropRect({ x: 0, y: 0, width: 20, height: 20 }, { width: 0, height: 20 }, { width: 100, height: 100 }),
    /크기를 계산할 수 없습니다/,
  );
});
