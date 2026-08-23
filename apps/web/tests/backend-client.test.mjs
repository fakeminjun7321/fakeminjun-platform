import assert from "node:assert/strict";
import test from "node:test";
import {
  BackendApiError,
  clearAnalysisAttempt,
  clearVisualAnalysisAttempt,
  createBackendClient,
  getAnalysisAttempt,
  getVisualAnalysisAttempt,
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
  assert.equal(calls[0].options.cache, "no-cache");
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

test("visual analysis attempts reuse one key for unchanged metadata and image bytes", async () => {
  const metadata = { domain: "physics", mode: "auto", prompt: "같은 캡처", context: { title: "그래프" } };
  const firstImage = new Blob(["same-image-bytes"], { type: "image/png" });
  const equivalentImage = new Blob(["same-image-bytes"], { type: "image/png" });
  const first = await getVisualAnalysisAttempt({ metadata, image: firstImage }, 1_000);
  const retry = await getVisualAnalysisAttempt({ metadata, image: equivalentImage }, 2_000);

  assert.equal(retry.idempotencyKey, first.idempotencyKey);
  assert.equal(retry.fingerprint, first.fingerprint);
  assert.match(first.fingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(first).sort(), ["fingerprint", "idempotencyKey"]);
  clearVisualAnalysisAttempt(first.fingerprint);
});

test("visual analysis attempts separate different image bytes and clear definite failures", async () => {
  const metadata = { domain: "physics", mode: "auto", prompt: "이미지 비교", context: {} };
  const first = await getVisualAnalysisAttempt({
    metadata,
    image: new Blob(["image-a"], { type: "image/png" }),
  }, 3_000);
  const different = await getVisualAnalysisAttempt({
    metadata,
    image: new Blob(["image-b"], { type: "image/png" }),
  }, 3_100);

  assert.notEqual(different.idempotencyKey, first.idempotencyKey);
  assert.notEqual(different.fingerprint, first.fingerprint);
  assert.equal(shouldClearAnalysisAttempt(new BackendApiError(400, "invalid_capture", "fix")), true);
  clearVisualAnalysisAttempt(first.fingerprint);
  const afterDefiniteFailure = await getVisualAnalysisAttempt({
    metadata,
    image: new Blob(["image-a"], { type: "image/png" }),
  }, 3_200);
  assert.notEqual(afterDefiniteFailure.idempotencyKey, first.idempotencyKey);

  clearVisualAnalysisAttempt(afterDefiniteFailure.fingerprint);
  clearVisualAnalysisAttempt(different.fingerprint);
});

test("visual analysis attempts separate the same bytes sent with a different MIME type", async () => {
  const metadata = { domain: "physics", mode: "auto", prompt: "형식 비교", context: {} };
  const png = await getVisualAnalysisAttempt({
    metadata,
    image: new Blob(["same-image-bytes"], { type: "image/png" }),
  }, 4_000);
  const jpeg = await getVisualAnalysisAttempt({
    metadata,
    image: new Blob(["same-image-bytes"], { type: "image/jpeg" }),
  }, 4_100);

  assert.notEqual(jpeg.idempotencyKey, png.idempotencyKey);
  assert.notEqual(jpeg.fingerprint, png.fingerprint);
  clearVisualAnalysisAttempt(png.fingerprint);
  clearVisualAnalysisAttempt(jpeg.fingerprint);
});

test("visual analysis attempts expire after ten minutes", async () => {
  const input = {
    metadata: { domain: "international", mode: "standard", prompt: "재확인", context: {} },
    image: new Blob(["expiry-image"], { type: "image/jpeg" }),
  };
  const first = await getVisualAnalysisAttempt(input, 10_000);
  const retry = await getVisualAnalysisAttempt(input, 10_000 + (10 * 60 * 1000) - 1);
  const expired = await getVisualAnalysisAttempt(input, 10_000 + (10 * 60 * 1000));

  assert.equal(retry.idempotencyKey, first.idempotencyKey);
  assert.notEqual(expired.idempotencyKey, first.idempotencyKey);
  clearVisualAnalysisAttempt(expired.fingerprint);
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

test("backend client preserves the events envelope and forwards map request cancellation", async () => {
  const calls = [];
  const controller = new AbortController();
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: [{ id: 9 }], meta: { dataStatus: "mixed" } });
    },
  });
  const result = await client.listEventsEnvelope({ limit: 100, signal: controller.signal });
  assert.equal(result.data[0].id, 9);
  assert.equal(result.meta.dataStatus, "mixed");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.cache, "no-cache");
});

test("backend client serializes evidence, location, readiness, and promotion contracts", async () => {
  const calls = [];
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { ready: false } });
    },
  });
  await client.reviewCandidateEvidence("candidate/1", {
    sourceItemId: 3,
    candidateHash: "a".repeat(64),
    relationship: "supports",
    locatorType: "paragraph",
    locatorValue: "4",
    excerpt: "확인한 원문",
  }, { idempotencyKey: "evidence-1" });
  await client.putCandidateLocation("candidate/1", {
    placeName: "서울",
    longitude: 126.98,
    latitude: 37.56,
    accuracy: "approximate",
    candidateHash: "a".repeat(64),
  }, { idempotencyKey: "location-1" });
  await client.getCandidateReadiness("candidate/1");
  await client.promoteEventCandidate("candidate/1", {
    expectedRevision: 2,
    candidateHash: "a".repeat(64),
  }, { idempotencyKey: "promotion-1" });

  assert.equal(calls[0].url, "/api/v1/event-candidates/candidate%2F1/evidence-reviews");
  assert.equal(calls[0].options.headers["idempotency-key"], "evidence-1");
  assert.equal(calls[1].options.method, "PUT");
  assert.equal(calls[1].options.headers["idempotency-key"], "location-1");
  assert.equal(calls[2].url, "/api/v1/event-candidates/candidate%2F1/readiness");
  assert.equal(calls[3].url, "/api/v1/event-candidates/candidate%2F1/promote");
  assert.deepEqual(JSON.parse(calls[3].options.body), { expectedRevision: 2, candidateHash: "a".repeat(64) });
});

test("backend client searches, saves, removes, and exports private physics resources", async () => {
  const calls = [];
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/export/obsidian")) return new Response("# Physics", { headers: { "content-type": "text/markdown" } });
      return jsonResponse({ data: [], meta: { nextCursor: "next" } });
    },
  });
  const controller = new AbortController();
  const search = await client.searchPhysicsResources({
    query: "전자기학",
    type: "강의 영상",
    cursor: "2",
    limit: 20,
    signal: controller.signal,
    idempotencyKey: "physics-search-1",
  });
  await client.listPhysicsLibrary({ signal: controller.signal });
  await client.savePhysicsResource({ resourceId: "mit-802" }, { idempotencyKey: "physics-save-1" });
  await client.removePhysicsResource("mit/802");
  const exported = await client.exportPhysicsLibraryToObsidian();
  await client.searchPhysicsResources({
    query: "역학",
    type: "전체",
    limit: 20,
    idempotencyKey: "physics-search-all",
  });

  assert.equal(calls[0].url, "/api/v1/physics/resources/search");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["idempotency-key"], "physics-search-1");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    query: "전자기학",
    type: "강의 영상",
    cursor: "2",
    limit: 20,
  });
  assert.equal(search.meta.nextCursor, "next");
  assert.equal(calls[2].options.headers["idempotency-key"], "physics-save-1");
  assert.deepEqual(JSON.parse(calls[2].options.body), { resourceId: "mit-802" });
  assert.equal(calls[3].url, "/api/v1/physics/library/mit%2F802");
  assert.equal(await exported.text(), "# Physics");
  assert.deepEqual(JSON.parse(calls[5].options.body), { query: "역학", limit: 20 });
});

test("backend client reads Drive status and starts the server-owned OAuth flow", async () => {
  const calls = [];
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/connect")) {
        return jsonResponse({ data: { authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=safe" } }, { status: 201 });
      }
      if (url.endsWith("/items")) return jsonResponse({ data: [], meta: { sourceOfTruth: "google-drive" } });
      return jsonResponse({ data: { configured: true, connected: false, permission: "selected-files-only" } });
    },
  });
  const controller = new AbortController();
  const status = await client.getGoogleDriveStatus({ signal: controller.signal });
  const connection = await client.startGoogleDriveConnection({ signal: controller.signal });
  const items = await client.listPhysicsDriveItems({ signal: controller.signal });

  assert.equal(status.permission, "selected-files-only");
  assert.match(connection.authorizationUrl, /^https:\/\/accounts\.google\.com\//);
  assert.equal(items.meta.sourceOfTruth, "google-drive");
  assert.equal(calls[0].url, "/api/v1/integrations/google-drive");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[1].url, "/api/v1/integrations/google-drive/connect");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), {});
  assert.equal(calls[2].url, "/api/v1/physics/drive/items");
});

test("visual analysis uses browser multipart boundaries instead of forcing JSON content type", async () => {
  const calls = [];
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { id: "analysis-visual", status: "completed" } }, { status: 201 });
    },
  });
  const image = new Blob(["png"], { type: "image/png" });
  const result = await client.createVisualAnalysis({
    metadata: { domain: "physics", mode: "auto", prompt: "그래프를 분석해줘", context: {} },
    image,
  }, { idempotencyKey: "visual-1" });

  assert.equal(result.id, "analysis-visual");
  assert.equal(calls[0].url, "/api/v1/visual-analyses");
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.headers["content-type"], undefined);
  assert.equal(calls[0].options.headers["idempotency-key"], "visual-1");
  assert.equal(JSON.parse(calls[0].options.body.get("metadata")).mode, "auto");
  assert.equal(calls[0].options.body.get("image").type, "image/png");
});

test("backend client uploads private physics files and starts file analysis", async () => {
  const calls = [];
  const client = createBackendClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: { id: calls.length === 1 ? "file-1" : "analysis-file-1" } }, { status: 201 });
    },
  });
  const file = new File(["%PDF-1.7\n%%EOF\n"], "mechanics.pdf", { type: "application/pdf" });
  const uploaded = await client.uploadPhysicsFile(file, { idempotencyKey: "file-upload-1" });
  assert.equal(uploaded.id, "file-1");
  assert.equal(calls[0].url, "/api/v1/physics/files");
  assert.equal(calls[0].options.body instanceof FormData, true);
  assert.equal(calls[0].options.headers["content-type"], undefined);
  assert.equal(calls[0].options.headers["idempotency-key"], "file-upload-1");

  const payload = {
    domain: "physics",
    mode: "auto",
    prompt: "유도 구조를 설명해줘.",
    context: { kind: "physics-file", refId: "file-1" },
  };
  const analysis = await client.createPhysicsFileAnalysis("file-1", payload, { idempotencyKey: "file-analysis-1" });
  assert.equal(analysis.id, "analysis-file-1");
  assert.equal(calls[1].url, "/api/v1/physics/files/file-1/analyses");
  assert.deepEqual(JSON.parse(calls[1].options.body), payload);
});

test("backend client searches private analysis history without owner parameters", async () => {
  const calls = [];
  const client = createBackendClient({
    baseUrl: "https://app.example.test/",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ data: [{ id: "analysis-1" }], meta: { limit: 8 } });
    },
  });
  const result = await client.listAnalyses({ domain: "physics", query: "역학", status: "completed", limit: 8 });
  assert.equal(result.data[0].id, "analysis-1");
  const calledUrl = new URL(calls[0].url);
  assert.equal(calledUrl.pathname, "/api/v1/analyses");
  assert.equal(calledUrl.searchParams.get("q"), "역학");
  assert.equal(calledUrl.searchParams.has("ownerId"), false);
});
