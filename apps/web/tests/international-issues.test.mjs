import assert from "node:assert/strict";
import test from "node:test";
import { buildOfficialIssueTracks } from "../src/internationalIssues.js";

const source = (id, title, lane, publishedAt, sourceKey = `source-${id}`) => ({
  id,
  title,
  lane,
  publishedAt,
  originalUrl: `https://example.com/${id}`,
  source: { key: sourceKey, name: sourceKey },
});

test("official updates are grouped into several issue tracks without inventing events", () => {
  const tracks = buildOfficialIssueTracks([
    source(1, "북한 관련 한반도 정책 발표", "korea-core", "2026-08-24T03:00:00.000Z"),
    source(2, "Statement on tariffs and semiconductor supply chains", "us-impact", "2026-08-24T04:00:00.000Z"),
    source(3, "Gaza ceasefire and humanitarian access update", "rapid-change", "2026-08-24T05:00:00.000Z"),
    source(4, "Ukraine peace and European security briefing", "rapid-change", "2026-08-24T06:00:00.000Z"),
    source(5, "Indo-Pacific maritime cooperation with Japan", "korea-core", "2026-08-24T07:00:00.000Z"),
  ]);

  assert.ok(tracks.length >= 5);
  assert.ok(tracks.some(({ id }) => id === "korean-peninsula"));
  assert.ok(tracks.some(({ id }) => id === "trade-supply-chain"));
  assert.ok(tracks.some(({ id }) => id === "middle-east"));
  assert.ok(tracks.some(({ id }) => id === "europe-ukraine"));
  assert.ok(tracks.some(({ id }) => id === "indo-pacific"));
  assert.ok(tracks.every(({ items }) => items.every((item) => item.verificationStatus !== "verified")));
});

test("unmatched updates use their editorial lane and duplicates are removed", () => {
  const item = source(8, "정례 브리핑 자료", "korea-core", "2026-08-24T01:00:00.000Z", "mofa");
  const tracks = buildOfficialIssueTracks([item, { ...item }]);
  const korea = tracks.find(({ id }) => id === "korean-diplomacy");

  assert.equal(korea.items.length, 1);
  assert.equal(korea.sourceCount, 1);
  assert.equal(korea.latestAt, "2026-08-24T01:00:00.000Z");
});

test("empty and invalid inputs do not create placeholder issues", () => {
  assert.deepEqual(buildOfficialIssueTracks([]), []);
  assert.deepEqual(buildOfficialIssueTracks(null), []);
});
