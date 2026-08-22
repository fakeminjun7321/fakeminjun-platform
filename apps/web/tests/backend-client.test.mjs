import assert from "node:assert/strict";
import test from "node:test";
import { BackendApiError, createBackendClient } from "../src/backendClient.js";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

test("backend client serializes the bounded event query", async () => {
  const calls = [];
  const client = createBackendClient({
    baseUrl: "https://app.example.test/",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: [{ id: 1 }] });
    },
  });

  const events = await client.listEvents({
    bbox: [120, 30, 130, 40],
    from: "2026-08-20T00:00:00Z",
    layers: ["korea-core", "us-impact"],
    limit: 25,
  });

  assert.deepEqual(events, [{ id: 1 }]);
  assert.equal(calls.length, 1);
  const calledUrl = new URL(calls[0].url);
  assert.equal(calledUrl.pathname, "/api/v1/events");
  assert.equal(calledUrl.searchParams.get("bbox"), "120,30,130,40");
  assert.equal(calledUrl.searchParams.get("layers"), "korea-core,us-impact");
  assert.equal(calls[0].options.credentials, "same-origin");
});

test("backend client sends JSON writes without accepting an owner ID", async () => {
  const calls = [];
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { id: "note-1", version: 1 } }, { status: 201 });
    },
  });

  const note = await client.createNote({ subjectType: "event", subjectId: 1, body: "검토" });
  assert.equal(note.id, "note-1");
  assert.equal(calls[0].url, "/api/v1/notes");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    subjectType: "event",
    subjectId: 1,
    body: "검토",
  });
});

test("backend client preserves structured API errors", async () => {
  const client = createBackendClient({
    fetchImpl: async () => jsonResponse({
      error: {
        code: "note_version_conflict",
        message: "다른 변경이 먼저 저장되었습니다.",
        details: { currentVersion: 2 },
        requestId: "req-1",
      },
    }, { status: 409 }),
  });

  await assert.rejects(
    () => client.updateNote("note-1", { body: "수정", expectedVersion: 1 }),
    (error) => error instanceof BackendApiError
      && error.status === 409
      && error.code === "note_version_conflict"
      && error.details.currentVersion === 2
      && error.requestId === "req-1",
  );
});
