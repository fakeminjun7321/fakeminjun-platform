import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOfficialObservations,
  observationsToFeatureCollection,
} from "../src/officialObservations.js";

const sourceItem = (id, title, publishedAt, sourceKey = `source-${id}`) => ({
  id,
  title,
  publishedAt,
  originalUrl: `https://official.example/${id}`,
  source: { key: sourceKey, name: sourceKey },
});

test("official source titles become separate approximate region observations, never events", () => {
  const observations = buildOfficialObservations([
    sourceItem(1, "북한 관련 한반도 정책 발표", "2026-08-24T01:00:00.000Z", "unikorea"),
    sourceItem(2, "China and Taiwan maritime consultation", "2026-08-24T02:00:00.000Z", "un"),
    sourceItem(3, "Gaza ceasefire and humanitarian access update", "2026-08-24T03:00:00.000Z", "un"),
    sourceItem(4, "정례 정책 브리핑", "2026-08-24T04:00:00.000Z", "mofa"),
  ]);

  assert.ok(observations.some(({ id }) => id === "korean-peninsula"));
  assert.ok(observations.some(({ id }) => id === "china"));
  assert.ok(observations.some(({ id }) => id === "taiwan"));
  assert.ok(observations.some(({ id }) => id === "middle-east"));
  assert.equal(observations.reduce((count, observation) => count + observation.items.filter(({ id }) => id === 4).length, 0), 0);

  for (const observation of observations) {
    assert.equal(observation.basis, "official-title-region-aggregate");
    assert.equal(observation.verificationStatus, "unverified");
    assert.equal("signalRank" in observation, false);
    assert.equal("agreement" in observation, false);
    assert.equal("status" in observation, false);
    assert.equal("summary" in observation, false);
  }
});

test("observations deduplicate source items and keep only recent bounded evidence", () => {
  const duplicate = sourceItem(8, "우크라이나 평화 관련 발표", "2026-08-24T01:00:00.000Z", "un");
  const observations = buildOfficialObservations([
    duplicate,
    { ...duplicate },
    sourceItem(9, "Ukraine security briefing", "2026-08-24T03:00:00.000Z", "whitehouse"),
    sourceItem(10, "Kyiv humanitarian update", "2026-08-24T02:00:00.000Z", "un"),
  ], { maxRegions: 1, maxItemsPerRegion: 2 });

  assert.equal(observations.length, 1);
  assert.equal(observations[0].id, "ukraine");
  assert.equal(observations[0].count, 3);
  assert.equal(observations[0].sourceCount, 2);
  assert.deepEqual(observations[0].items.map(({ id }) => id), [9, 10]);
});

test("observation GeoJSON exposes only aggregate display metadata and copies coordinates", () => {
  const observations = buildOfficialObservations([
    sourceItem(11, "대한민국과 미국 외교 협의", "2026-08-24T05:00:00.000Z", "mofa"),
  ]);
  const collection = observationsToFeatureCollection(observations);

  assert.equal(collection.type, "FeatureCollection");
  assert.equal(collection.features.length, 2);
  assert.deepEqual(Object.keys(collection.features[0].properties).toSorted(), [
    "basis",
    "count",
    "id",
    "label",
    "latestAt",
    "sourceCount",
    "verificationStatus",
  ]);

  const originalLongitude = observations[0].coordinates[0];
  collection.features[0].geometry.coordinates[0] = 0;
  assert.equal(observations[0].coordinates[0], originalLongitude);
});

test("empty and invalid inputs never create placeholder observations", () => {
  assert.deepEqual(buildOfficialObservations([]), []);
  assert.deepEqual(buildOfficialObservations(null), []);
  assert.deepEqual(observationsToFeatureCollection([]), { type: "FeatureCollection", features: [] });
});
