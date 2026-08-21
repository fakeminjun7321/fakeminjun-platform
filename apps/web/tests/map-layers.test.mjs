import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS } from "../src/events.js";
import {
  CATEGORY_META,
  STATUS_META,
  getCategoryMeta,
  getEventRelations,
  getStatusMeta,
  getTopSignals,
} from "../src/mapLayers.js";

test("category and status metadata expose Korean labels and hex colors", () => {
  assert.deepEqual(Object.keys(CATEGORY_META).toSorted(), ["korea-core", "rapid-change", "us-impact"]);
  assert.deepEqual(Object.keys(STATUS_META).toSorted(), ["mixed", "unverified", "verified"]);

  for (const metadata of [...Object.values(CATEGORY_META), ...Object.values(STATUS_META)]) {
    assert.equal(typeof metadata.label, "string");
    assert.ok(metadata.label.trim().length > 0);
    assert.match(metadata.color, /^#[0-9a-f]{6}$/i);
  }

  assert.equal(getCategoryMeta("korea-core"), CATEGORY_META["korea-core"]);
  assert.equal(getStatusMeta("verified"), STATUS_META.verified);
  assert.equal(getCategoryMeta("unknown"), null);
  assert.equal(getStatusMeta("unknown"), null);
});

test("getTopSignals orders by unique signal rank without mutating its input", () => {
  const input = [EVENTS[4], EVENTS[1], EVENTS[0], EVENTS[3]];
  const before = [...input];

  assert.deepEqual(getTopSignals(input).map(({ id }) => id), [1, 2, 4]);
  assert.deepEqual(input, before);
  assert.deepEqual(getTopSignals(EVENTS, 2).map(({ id }) => id), [1, 2]);
  assert.deepEqual(getTopSignals(EVENTS, 0), []);
  assert.equal(getTopSignals(EVENTS, Number.NaN).length, 3);
});

test("getEventRelations returns independent projected relation records", () => {
  const event = EVENTS.find(({ id }) => id === 1);
  const relations = getEventRelations(event);

  assert.equal(relations.length, 2);
  assert.deepEqual(relations[0], {
    eventId: 1,
    eventTitle: "한미 공급망 실무 협의 종료",
    label: "한미 공급망 협의",
    relation: "공급망 협의 상대",
    from: {
      label: "대한민국",
      coordinates: [126.98, 37.56],
    },
    to: {
      label: "미국",
      coordinates: [-98, 39],
    },
  });
  assert.deepEqual(relations[1], {
    eventId: 1,
    eventTitle: "한미 공급망 실무 협의 종료",
    label: "한미 공급망 협의",
    relation: "간접 해상 교역로 영향",
    from: {
      label: "대한민국",
      coordinates: [126.98, 37.56],
    },
    to: {
      label: "필리핀",
      coordinates: [120.98, 14.6],
    },
  });

  relations[0].from.coordinates[0] = 0;
  assert.equal(event.coordinates[0], 126.98);
  assert.deepEqual(getEventRelations(null), []);
  assert.deepEqual(getEventRelations({ relatedCoordinates: null }), []);
});
