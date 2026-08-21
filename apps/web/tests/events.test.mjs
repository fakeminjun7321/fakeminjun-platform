import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS, filterEvents } from "../src/events.js";

test("demo events satisfy the data contract", () => {
  assert.ok(EVENTS.length > 0);
  assert.equal(new Set(EVENTS.map(({ id }) => id)).size, EVENTS.length);

  for (const event of EVENTS) {
    assert.ok(Number.isInteger(event.id) && event.id > 0);
    assert.match(event.time, /^\d{2}:\d{2}$/);
    assert.ok(Number.isFinite(Date.parse(event.dateTime)));

    assert.equal(event.coordinates.length, 2);
    const [longitude, latitude] = event.coordinates;
    assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
    assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90);

    for (const field of ["region", "shortRegion", "title", "summary", "impact"]) {
      assert.equal(typeof event[field], "string");
      assert.ok(event[field].trim().length > 0);
    }

    assert.ok(Number.isInteger(event.sources) && event.sources > 0);
    for (const field of ["facts", "disputed", "relevance"]) {
      assert.ok(Array.isArray(event[field]) && event[field].length > 0);
      assert.ok(event[field].every((item) => typeof item === "string" && item.trim().length > 0));
    }
  }
});

test("filterEvents searches the indexed fields and ignores surrounding whitespace", () => {
  assert.deepEqual(
    filterEvents(EVENTS, "한미 공급망").map(({ id }) => id),
    [1],
  );
  assert.deepEqual(
    filterEvents(EVENTS, "대한민국").map(({ id }) => id),
    [1],
  );
  assert.deepEqual(
    filterEvents(EVENTS, "  united states  ").map(({ id }) => id),
    [2],
  );
  assert.deepEqual(
    filterEvents(EVENTS, "유럽 국가들이").map(({ id }) => id),
    [4],
  );
});

test("filterEvents returns the original collection for a blank query", () => {
  assert.strictEqual(filterEvents(EVENTS, "   "), EVENTS);
});

test("filterEvents returns an empty collection for no matches without mutating events", () => {
  const before = structuredClone(EVENTS);

  assert.deepEqual(filterEvents(EVENTS, "검색 결과가 없는 표현"), []);
  assert.deepEqual(EVENTS, before);
});
