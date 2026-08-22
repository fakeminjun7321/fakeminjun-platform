import assert from "node:assert/strict";
import test from "node:test";
import {
  IPHO_TOPICS,
  PHYSICS_RESOURCES,
  PHYSICS_TOOLS,
  filterPhysicsResources,
} from "../src/physicsData.js";

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
