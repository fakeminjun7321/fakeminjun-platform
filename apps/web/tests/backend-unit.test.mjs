import assert from "node:assert/strict";
import test from "node:test";
import worker, { parseEventsQuery, validateNotePayload } from "../worker/index.js";

test("event query parsing enforces the map API bounds", () => {
  const parsed = parseEventsQuery(new URL(
    "https://example.test/api/v1/events?bbox=120,30,130,40&layers=korea-core,us-impact&limit=25&from=2026-08-20T00:00:00Z",
  ));
  assert.deepEqual(parsed.bbox, [120, 30, 130, 40]);
  assert.deepEqual(parsed.layers, ["korea-core", "us-impact"]);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.from, "2026-08-20T00:00:00.000Z");

  assert.throws(
    () => parseEventsQuery(new URL("https://example.test/api/v1/events?bbox=130,30,120,40")),
    (error) => error.code === "invalid_bbox" && error.status === 400,
  );
  assert.throws(
    () => parseEventsQuery(new URL("https://example.test/api/v1/events?layers=unknown")),
    (error) => error.code === "invalid_layers" && error.status === 400,
  );
  assert.throws(
    () => parseEventsQuery(new URL("https://example.test/api/v1/events?ownerId=1")),
    (error) => error.code === "unknown_query" && error.status === 400,
  );
});

test("note validation accepts only the server-owned contract", () => {
  assert.deepEqual(validateNotePayload({
    subjectType: "event",
    subjectId: 1,
    body: "  구조적 배경을 더 확인한다.  ",
  }), {
    subjectType: "event",
    subjectId: "1",
    body: "구조적 배경을 더 확인한다.",
  });

  assert.throws(
    () => validateNotePayload({ subjectType: "event", subjectId: 1, body: "ok", ownerId: 99 }),
    (error) => error.code === "unknown_fields",
  );
  assert.throws(
    () => validateNotePayload({ body: "수정", expectedVersion: 0 }, { patch: true }),
    (error) => error.code === "invalid_note_version",
  );
});

test("API paths never fall through to static assets", async () => {
  let assetCalls = 0;
  const response = await worker.fetch(new Request("https://example.test/api/v1/missing"), {
    ASSETS: { fetch: async () => { assetCalls += 1; return new Response("asset"); } },
  }, {});
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(assetCalls, 0);
  assert.equal(body.error.code, "api_route_not_found");
  assert.ok(response.headers.get("x-request-id"));
});

test("health reports a missing D1 binding without claiming readiness", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/v1/health"), {}, {});
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "database_unavailable");
});

test("private routes fail closed without a verified Access identity", async () => {
  const response = await worker.fetch(new Request(
    "https://example.test/api/v1/notes?subjectType=event&subjectId=1",
  ), { DB: {} }, {});
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "access_required");
});

test("mutations reject an untrusted origin before database access", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/v1/notes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example",
    },
    body: JSON.stringify({ subjectType: "event", subjectId: 1, body: "변조" }),
  }), {
    APP_ORIGIN: "https://app.example.test",
    DB: {},
  }, {});
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "origin_forbidden");
});
