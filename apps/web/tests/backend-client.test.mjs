import assert from "node:assert/strict";
import test from "node:test";
import {
  BackendApiError,
  clearAnalysisAttempt,
  createBackendClient,
  getAnalysisAttempt,
  shouldClearAnalysisAttempt,
} from "../src/backendClient.js";

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

test("backend client serializes the source inbox query and forwards abort", async () => {
  const calls = [];
  const controller = new AbortController();
  const client = createBackendClient({
    baseUrl: "https://app.example.test/",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        data: [{ id: 1, verificationStatus: "unverified" }],
        meta: { collectionStatus: "current" },
      });
    },
  });
  const items = await client.listSourceItems({
    lanes: ["korea-core", "us-impact"],
    from: "2026-08-21T00:00:00Z",
    limit: 12,
    signal: controller.signal,
  });
  assert.equal(items.data[0].verificationStatus, "unverified");
  assert.equal(items.meta.collectionStatus, "current");
  const calledUrl = new URL(calls[0].url);
  assert.equal(calledUrl.pathname, "/api/v1/source-items");
  assert.equal(calledUrl.searchParams.get("lanes"), "korea-core,us-impact");
  assert.equal(calls[0].options.signal, controller.signal);
});

test("backend client runs the owner-only official source refresh as a JSON mutation", async () => {
  const calls = [];
  const controller = new AbortController();
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { results: [{ sourceKey: "mofa-press", status: "succeeded" }] } });
    },
  });

  const result = await client.runIngestion({ signal: controller.signal });
  assert.equal(result.results[0].status, "succeeded");
  assert.equal(calls[0].url, "/api/v1/ingestion/runs");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {});
});

test("backend client lists event candidates with review filters and abort support", async () => {
  const calls = [];
  const controller = new AbortController();
  const client = createBackendClient({
    baseUrl: "https://app.example.test/",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: [{ id: "candidate-1", reviewStatus: "hold" }] });
    },
  });

  const candidates = await client.listEventCandidates({
    limit: 20,
    reviewStatus: "hold",
    signal: controller.signal,
  });

  assert.equal(candidates[0].id, "candidate-1");
  const calledUrl = new URL(calls[0].url);
  assert.equal(calledUrl.pathname, "/api/v1/event-candidates");
  assert.equal(calledUrl.searchParams.get("limit"), "20");
  assert.equal(calledUrl.searchParams.get("reviewStatus"), "hold");
  assert.equal(calls[0].options.signal, controller.signal);
});

test("backend client creates an idempotent event candidate from bounded source IDs", async () => {
  const calls = [];
  const controller = new AbortController();
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { id: "candidate-2", reviewStatus: "unreviewed" } }, { status: 201 });
    },
  });

  const candidate = await client.createEventCandidate(
    { sourceItemIds: [4, 7] },
    { signal: controller.signal, idempotencyKey: "candidate-create-1" },
  );

  assert.equal(candidate.id, "candidate-2");
  assert.equal(calls[0].url, "/api/v1/event-candidates");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.headers["idempotency-key"], "candidate-create-1");
  assert.deepEqual(JSON.parse(calls[0].options.body), { sourceItemIds: [4, 7] });
});

test("backend client submits an optimistic and idempotent candidate review", async () => {
  const calls = [];
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { id: "candidate/2", reviewStatus: "reviewed", revision: 3 } });
    },
  });
  const review = {
    decision: "reviewed",
    expectedRevision: 2,
    candidateHash: "hash-2",
    note: "추가 확인 완료",
  };

  const updated = await client.reviewEventCandidate("candidate/2", review, {
    idempotencyKey: "candidate-review-1",
  });

  assert.equal(updated.reviewStatus, "reviewed");
  assert.equal(calls[0].url, "/api/v1/event-candidates/candidate%2F2/reviews");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["idempotency-key"], "candidate-review-1");
  assert.deepEqual(JSON.parse(calls[0].options.body), review);
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

test("backend client creates an idempotent analysis request with abort support", async () => {
  const calls = [];
  const controller = new AbortController();
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { id: "analysis-1", status: "completed" } }, { status: 201 });
    },
  });

  const payload = {
    domain: "physics",
    mode: "standard",
    prompt: "라그랑주 방정식의 구조를 설명해줘.",
    level: "P4",
    context: { title: "수학 구조", meta: "물리 학습 모드 02" },
  };
  const analysis = await client.createAnalysis(payload, {
    signal: controller.signal,
    idempotencyKey: "analysis-request-1",
  });

  assert.equal(analysis.id, "analysis-1");
  assert.equal(calls[0].url, "/api/v1/analyses");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.headers["idempotency-key"], "analysis-request-1");
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
});

test("analysis attempts preserve one key across an ambiguous retry window without retaining raw input", async () => {
  const payload = { domain: "physics", mode: "deep", prompt: "같은 요청", context: {} };
  const first = await getAnalysisAttempt(payload, 1_000);
  const retry = await getAnalysisAttempt(payload, 2_000);
  assert.equal(retry.idempotencyKey, first.idempotencyKey);
  assert.match(first.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(first.fingerprint.includes(payload.prompt), false);

  clearAnalysisAttempt(first.fingerprint);
  const intentionalNewAttempt = await getAnalysisAttempt(payload, 3_000);
  assert.notEqual(intentionalNewAttempt.idempotencyKey, first.idempotencyKey);
  clearAnalysisAttempt(intentionalNewAttempt.fingerprint);
});

test("analysis attempts expire after ten minutes", async () => {
  const payload = { domain: "international", mode: "standard", prompt: "재검토", context: {} };
  const first = await getAnalysisAttempt(payload, 10_000);
  const expired = await getAnalysisAttempt(payload, 10_000 + (10 * 60 * 1000));
  assert.notEqual(expired.idempotencyKey, first.idempotencyKey);
  clearAnalysisAttempt(expired.fingerprint);
});

test("analysis attempts survive ambiguous server and polling failures", () => {
  assert.equal(shouldClearAnalysisAttempt(new BackendApiError(503, "upstream", "retry")), false);
  assert.equal(shouldClearAnalysisAttempt(new BackendApiError(429, "rate_limited", "retry")), false);
  assert.equal(shouldClearAnalysisAttempt(new BackendApiError(400, "invalid", "fix")), true);
  assert.equal(shouldClearAnalysisAttempt(
    new BackendApiError(404, "analysis_not_found", "retry"),
    { hasCreatedAnalysis: true },
  ), false);
});

test("backend client retrieves a private analysis by ID", async () => {
  const calls = [];
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { id: "analysis/1", status: "completed" } });
    },
  });

  await client.getAnalysis("analysis/1");
  assert.equal(calls[0].url, "/api/v1/analyses/analysis%2F1");
  assert.equal(calls[0].options.credentials, "same-origin");
});

test("backend client deletes a private analysis through an origin-checked mutation", async () => {
  const calls = [];
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(null, { status: 204 });
    },
  });

  await client.deleteAnalysis("analysis-1");
  assert.equal(calls[0].url, "/api/v1/analyses/analysis-1");
  assert.equal(calls[0].options.method, "DELETE");
});
