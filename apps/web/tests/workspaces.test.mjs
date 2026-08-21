import assert from "node:assert/strict";
import test from "node:test";
import {
  POLITICAL_AGENDAS,
  POLITICAL_INSTITUTIONS,
  filterPoliticalAgendas,
} from "../src/politicsData.js";
import {
  IPHO_TOPICS,
  PHYSICS_RESOURCES,
  PHYSICS_TOOLS,
  filterPhysicsResources,
} from "../src/physicsData.js";

test("politics demo agendas keep Korea primary and the United States secondary", () => {
  assert.ok(POLITICAL_AGENDAS.filter(({ scope }) => scope === "korea").length > POLITICAL_AGENDAS.filter(({ scope }) => scope === "us").length);
  assert.equal(new Set(POLITICAL_AGENDAS.map(({ id }) => id)).size, POLITICAL_AGENDAS.length);

  for (const agenda of POLITICAL_AGENDAS) {
    assert.ok(["korea", "us"].includes(agenda.scope));
    assert.ok(agenda.title.trim());
    assert.ok(agenda.stage.trim());
    assert.ok(agenda.process.length >= 4);
    assert.ok(agenda.readingPoints.length >= 3);
    assert.ok(agenda.institutions.length >= 2);
  }
});

test("politics filters combine scope and indexed text", () => {
  assert.deepEqual(filterPoliticalAgendas(POLITICAL_AGENDAS, "us").map(({ id }) => id), ["us-industrial-policy"]);
  assert.deepEqual(filterPoliticalAgendas(POLITICAL_AGENDAS, "korea", "예산").map(({ id }) => id), ["kr-budget-review"]);
  assert.deepEqual(filterPoliticalAgendas(POLITICAL_AGENDAS, "all", "중앙선거관리위원회").map(({ id }) => id), ["kr-election-rules"]);
});

test("political institution readers expose powers, checks, and misconceptions", () => {
  assert.equal(new Set(POLITICAL_INSTITUTIONS.map(({ id }) => id)).size, POLITICAL_INSTITUTIONS.length);
  for (const institution of POLITICAL_INSTITUTIONS) {
    assert.ok(institution.powers.length >= 3);
    assert.ok(institution.checks.length >= 3);
    assert.ok(institution.commonMistake.trim());
  }
});

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
