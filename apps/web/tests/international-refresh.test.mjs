import assert from "node:assert/strict";
import test from "node:test";
import {
  INTERNATIONAL_VIEW_REFRESH_MS,
  SOURCE_INGESTION_CADENCE_MINUTES,
  aggregateSourceGroups,
  startVisibleRefresh,
} from "../src/internationalRefresh.js";

test("international refresh intervals keep browser reads lighter than source collection", () => {
  assert.equal(INTERNATIONAL_VIEW_REFRESH_MS, 60_000);
  assert.equal(SOURCE_INGESTION_CADENCE_MINUTES, 10);
});

test("source groups preserve all lanes, remove duplicates, and order newest first", () => {
  const result = aggregateSourceGroups([
    {
      data: [{ id: 1, lane: "korea-core", publishedAt: "2026-08-22T13:00:00.000Z" }],
      meta: {
        collectionStatus: "current",
        generatedAt: "2026-08-22T14:00:00.000Z",
        streams: [{ streamKey: "kr", lastSuccessAt: "2026-08-22T13:58:00.000Z" }],
      },
    },
    {
      data: [
        { id: 2, lane: "us-impact", publishedAt: "2026-08-22T13:30:00.000Z" },
        { id: 1, lane: "korea-core", publishedAt: "2026-08-22T13:00:00.000Z" },
      ],
      meta: {
        collectionStatus: "current",
        generatedAt: "2026-08-22T14:00:01.000Z",
        streams: [{ streamKey: "us", lastSuccessAt: "2026-08-22T13:59:00.000Z" }],
      },
    },
  ], "2026-08-22T14:00:02.000Z");

  assert.deepEqual(result.items.map(({ id }) => id), [2, 1]);
  assert.equal(result.collectionStatus, "current");
  assert.equal(result.checkedAt, "2026-08-22T14:00:01.000Z");
  assert.equal(result.lastCollectedAt, "2026-08-22T13:59:00.000Z");
  assert.equal(result.streams.length, 2);
});

test("source group health fails visibly when any lane is degraded", () => {
  const result = aggregateSourceGroups([
    { data: [], meta: { collectionStatus: "current", streams: [] } },
    { data: [], meta: { collectionStatus: "degraded", streams: [] } },
    { data: [], meta: { collectionStatus: "stale", streams: [] } },
  ], "2026-08-22T14:00:00.000Z");

  assert.equal(result.collectionStatus, "degraded");
  assert.equal(result.checkedAt, "2026-08-22T14:00:00.000Z");
});

test("visible refresh pauses in background, resumes immediately, and cleans up", () => {
  let intervalCallback;
  let visibilityCallback;
  let refreshes = 0;
  const cleared = [];
  const documentObject = {
    visibilityState: "visible",
    addEventListener(type, callback) { if (type === "visibilitychange") visibilityCallback = callback; },
    removeEventListener(type, callback) {
      if (type === "visibilitychange" && visibilityCallback === callback) visibilityCallback = null;
    },
  };
  const windowObject = {
    setInterval(callback, intervalMs) {
      assert.equal(intervalMs, INTERNATIONAL_VIEW_REFRESH_MS);
      intervalCallback = callback;
      return 41;
    },
    clearInterval(id) { cleared.push(id); },
  };
  const stop = startVisibleRefresh({ documentObject, windowObject, onRefresh: () => { refreshes += 1; } });

  intervalCallback();
  assert.equal(refreshes, 1);
  documentObject.visibilityState = "hidden";
  intervalCallback();
  visibilityCallback();
  assert.equal(refreshes, 1);
  documentObject.visibilityState = "visible";
  visibilityCallback();
  assert.equal(refreshes, 2);

  stop();
  assert.deepEqual(cleared, [41]);
  assert.equal(visibilityCallback, null);
});
