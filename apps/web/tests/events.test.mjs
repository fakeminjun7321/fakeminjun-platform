import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS, filterEvents } from "../src/events.js";

const CATEGORIES = new Set(["korea-core", "us-impact", "rapid-change"]);
const STATUSES = new Set(["verified", "mixed", "unverified"]);

test("demo events satisfy the data contract", () => {
  assert.ok(EVENTS.length > 0);
  assert.equal(new Set(EVENTS.map(({ id }) => id)).size, EVENTS.length);
  assert.equal(new Set(EVENTS.map(({ signalRank }) => signalRank)).size, EVENTS.length);
  assert.deepEqual(
    EVENTS.map(({ signalRank }) => signalRank).toSorted((left, right) => left - right),
    Array.from({ length: EVENTS.length }, (_, index) => index + 1),
  );

  for (const event of EVENTS) {
    assert.ok(Number.isInteger(event.id) && event.id > 0);
    assert.match(event.time, /^\d{2}:\d{2}$/);
    assert.ok(Number.isFinite(Date.parse(event.dateTime)));

    assert.equal(event.coordinates.length, 2);
    const [longitude, latitude] = event.coordinates;
    assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
    assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90);

    assert.ok(CATEGORIES.has(event.category));
    assert.ok(Number.isInteger(event.signalRank));
    assert.ok(event.signalRank >= 1 && event.signalRank <= EVENTS.length);
    assert.ok(Number.isInteger(event.agreement));
    assert.ok(event.agreement >= 0 && event.agreement <= 100);
    assert.ok(STATUSES.has(event.status));

    for (const field of [
      "region",
      "shortRegion",
      "title",
      "summary",
      "impact",
      "lastChecked",
      "relationLabel",
    ]) {
      assert.equal(typeof event[field], "string");
      assert.ok(event[field].trim().length > 0);
    }

    assert.ok(Array.isArray(event.relatedCoordinates));
    for (const related of event.relatedCoordinates) {
      for (const field of ["label", "relation"]) {
        assert.equal(typeof related[field], "string");
        assert.ok(related[field].trim().length > 0);
      }

      assert.equal(related.coordinates.length, 2);
      const [relatedLongitude, relatedLatitude] = related.coordinates;
      assert.ok(Number.isFinite(relatedLongitude) && relatedLongitude >= -180 && relatedLongitude <= 180);
      assert.ok(Number.isFinite(relatedLatitude) && relatedLatitude >= -90 && relatedLatitude <= 90);
    }

    assert.ok(Number.isInteger(event.sources) && event.sources > 0);
    for (const field of ["facts", "disputed", "relevance"]) {
      assert.ok(Array.isArray(event[field]) && event[field].length > 0);
      assert.ok(event[field].every((item) => typeof item === "string" && item.trim().length > 0));
    }
  }
});

test("event 1 declares the United States as its supply-chain counterpart", () => {
  const event = EVENTS.find(({ id }) => id === 1);

  assert.ok(event);
  assert.ok(
    event.relatedCoordinates.some(
      ({ label, coordinates, relation }) =>
        label === "미국"
        && coordinates[0] === -98
        && coordinates[1] === 39
        && relation === "공급망 협의 상대",
    ),
  );
  assert.ok(
    event.relatedCoordinates.some(
      ({ label, coordinates, relation }) =>
        label === "필리핀"
        && coordinates[0] === 120.98
        && coordinates[1] === 14.6
        && relation === "간접 해상 교역로 영향",
    ),
  );
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
