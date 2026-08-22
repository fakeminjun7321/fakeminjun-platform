import assert from "node:assert/strict";
import test from "node:test";
import worker, {
  ANALYSIS_REPORT_SCHEMA,
  parseEventsQuery,
  requestStructuredOpenAI,
  validateAnalysisPayload,
  validateNotePayload,
} from "../worker/index.js";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

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

test("analysis validation keeps model and owner controls on the server", () => {
  assert.deepEqual(validateAnalysisPayload({
    domain: "international",
    mode: "deep",
    prompt: "  한국에 미칠 영향을 검토해줘.  ",
    eventId: 1,
    level: "I2",
    context: { title: "선택 사건", meta: "비실시간 데모" },
  }), {
    domain: "international",
    mode: "deep",
    prompt: "한국에 미칠 영향을 검토해줘.",
    eventId: 1,
    level: "I2",
    context: { title: "선택 사건", meta: "비실시간 데모" },
  });

  assert.throws(
    () => validateAnalysisPayload({
      domain: "physics",
      prompt: "유도해줘.",
      model: "attacker-model",
    }),
    (error) => error.code === "unknown_fields",
  );
  assert.throws(
    () => validateAnalysisPayload({ domain: "physics", prompt: "유도해줘.", eventId: 1 }),
    (error) => error.code === "invalid_analysis_event",
  );
});

test("structured OpenAI requests disable storage and tools while enforcing the schema", async () => {
  const calls = [];
  const report = {
    headline: "검토 결과",
    summary: "요약",
    sourceBoundary: "제공 자료만 사용",
    sections: [
      { title: "핵심", content: "내용", confidence: "high", basis: "provided-evidence" },
      { title: "검산", content: "내용", confidence: "medium", basis: "inference" },
    ],
    uncertainties: [],
    nextQuestions: [],
    visual: { type: "none", title: "", items: [] },
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return jsonResponse({
      id: "resp_test",
      status: "completed",
      model: "gpt-test",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(report) }] }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    });
  };

  const result = await requestStructuredOpenAI({
    apiKey: "test-key-not-a-live-secret",
    model: "gpt-test",
    instructions: "고정 지침",
    input: "동적 입력",
    schema: ANALYSIS_REPORT_SCHEMA,
    schemaName: "test_report",
    reasoningEffort: "low",
    maxOutputTokens: 500,
    metadata: { analysis_id: "analysis-1" },
    safetyIdentifier: "safe-user-hash",
    idempotencyKey: "analysis-1-standard",
    fetchImpl,
  });

  assert.equal(result.data.headline, "검토 결과");
  assert.equal(result.usage.totalTokens, 30);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].body.store, false);
  assert.deepEqual(calls[0].body.tools, []);
  assert.equal(calls[0].body.text.format.type, "json_schema");
  assert.equal(calls[0].body.text.format.strict, true);
  assert.equal(calls[0].body.max_output_tokens, 500);
  assert.equal(calls[0].body.safety_identifier, "safe-user-hash");
  assert.equal(calls[0].options.headers["idempotency-key"], "analysis-1-standard");
});

test("structured OpenAI requests reject JSON that violates the local output schema", async () => {
  const invalidReport = {
    headline: "불완전 결과",
    summary: "요약",
    sourceBoundary: "경계",
    sections: [],
    uncertainties: [],
    nextQuestions: [],
    visual: { type: "none", title: "", items: [] },
  };
  await assert.rejects(
    () => requestStructuredOpenAI({
      apiKey: "test-key-not-a-live-secret",
      model: "gpt-test",
      instructions: "고정 지침",
      input: "동적 입력",
      schema: ANALYSIS_REPORT_SCHEMA,
      schemaName: "test_report",
      reasoningEffort: "low",
      maxOutputTokens: 500,
      fetchImpl: async () => jsonResponse({
        id: "resp_invalid",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(invalidReport) }] }],
      }),
    }),
    (error) => error.code === "ai_schema_mismatch" && error.details.path === "result.sections",
  );
});

test("structured OpenAI requests fail closed on provider errors", async () => {
  await assert.rejects(
    () => requestStructuredOpenAI({
      apiKey: "test-key-not-a-live-secret",
      model: "gpt-test",
      instructions: "고정 지침",
      input: "동적 입력",
      schema: { type: "object" },
      schemaName: "test_report",
      reasoningEffort: "low",
      maxOutputTokens: 500,
      fetchImpl: async () => jsonResponse({ error: { message: "provider detail" } }, { status: 429 }),
    }),
    (error) => error.code === "ai_rate_limited" && error.status === 429,
  );
});

test("structured OpenAI requests keep the timeout active while reading the body", async () => {
  await assert.rejects(
    () => requestStructuredOpenAI({
      apiKey: "test-key-not-a-live-secret",
      model: "gpt-test",
      instructions: "고정 지침",
      input: "동적 입력",
      schema: { type: "object" },
      schemaName: "test_report",
      reasoningEffort: "low",
      maxOutputTokens: 500,
      timeoutMs: 20,
      fetchImpl: async (_url, options) => {
        const stream = new ReadableStream({
          start(controller) {
            options.signal.addEventListener("abort", () => {
              controller.error(new DOMException("Aborted", "AbortError"));
            }, { once: true });
          },
        });
        return new Response(stream, { status: 200 });
      },
    }),
    (error) => error.code === "ai_timeout" && error.status === 503,
  );
});

test("structured OpenAI requests reject oversized provider bodies", async () => {
  await assert.rejects(
    () => requestStructuredOpenAI({
      apiKey: "test-key-not-a-live-secret",
      model: "gpt-test",
      instructions: "고정 지침",
      input: "동적 입력",
      schema: { type: "object" },
      schemaName: "test_report",
      reasoningEffort: "low",
      maxOutputTokens: 500,
      maxResponseBytes: 32,
      fetchImpl: async () => jsonResponse({ output_text: "x".repeat(128) }),
    }),
    (error) => error.code === "ai_response_too_large" && error.status === 502,
  );
});

test("structured OpenAI requests cancel a body rejected by Content-Length", async () => {
  let canceled = false;
  const stream = new ReadableStream({
    pull() {},
    cancel() { canceled = true; },
  });
  await assert.rejects(
    () => requestStructuredOpenAI({
      apiKey: "test-key-not-a-live-secret",
      model: "gpt-test",
      instructions: "고정 지침",
      input: "동적 입력",
      schema: { type: "object" },
      schemaName: "test_report",
      reasoningEffort: "low",
      maxOutputTokens: 500,
      maxResponseBytes: 32,
      fetchImpl: async () => new Response(stream, {
        status: 200,
        headers: { "content-length": "33", "content-type": "application/json" },
      }),
    }),
    (error) => error.code === "ai_response_too_large",
  );
  assert.equal(canceled, true);
});
