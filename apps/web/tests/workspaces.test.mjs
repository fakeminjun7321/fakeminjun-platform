import assert from "node:assert/strict";
import test from "node:test";
import {
  PHYSICS_RESOURCES,
  filterPhysicsResources,
} from "../src/physicsData.js";
import { PHYSICS_AI_ENGINES, physicsEngineForTask, physicsEngineProfile } from "../src/physicsEngines.js";
import { PHYSICS_SCAN_POLL_INTERVAL_MS, startPhysicsScanPolling } from "../src/physicsScanPolling.js";

test("physics workspace exposes dedicated P.S. and T.E. AI contracts", () => {
  assert.deepEqual(Object.keys(PHYSICS_AI_ENGINES), ["ps", "te"]);
  assert.equal(PHYSICS_AI_ENGINES.ps.engineName, "AXIOM S1");
  assert.equal(PHYSICS_AI_ENGINES.te.engineName, "THEORIA T1");
  assert.equal(PHYSICS_AI_ENGINES.ps.taskType, "physics-problem-solving");
  assert.equal(PHYSICS_AI_ENGINES.te.taskType, "physics-theory-explanation");
  assert.equal(physicsEngineForTask("physics-problem-solving"), PHYSICS_AI_ENGINES.ps);
  assert.equal(physicsEngineProfile("physics-theory-explanation", "deep").title, "THEORIA T1");
  assert.ok(Object.values(PHYSICS_AI_ENGINES).every(({ example, placeholder, steps }) => example.trim() && placeholder.trim() && steps.length === 5));
});

test("physics resources use unique HTTPS links without olympiad navigation seeds", () => {
  assert.equal(new Set(PHYSICS_RESOURCES.map(({ id }) => id)).size, PHYSICS_RESOURCES.length);
  assert.ok(PHYSICS_RESOURCES.every(({ href }) => href.startsWith("https://")));
  assert.ok(PHYSICS_RESOURCES.some(({ provider }) => provider === "MIT OpenCourseWare"));
  assert.ok(!PHYSICS_RESOURCES.some(({ id, title }) => /kpho|ipho/i.test(`${id} ${title}`)));
});

test("physics resource filters combine query, type, and saved state", () => {
  assert.deepEqual(
    filterPhysicsResources(PHYSICS_RESOURCES, { query: "전자기학" }).map(({ id }) => id),
    ["mit-802"],
  );
  assert.deepEqual(filterPhysicsResources(PHYSICS_RESOURCES, { type: "기출문제" }), []);
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
