import assert from "node:assert/strict";
import test from "node:test";
import {
  PHYSICS_RESOURCES,
  filterPhysicsResources,
} from "../src/physicsData.js";
import { PHYSICS_AI_ENGINES, physicsEngineForTask, physicsEngineProfile } from "../src/physicsEngines.js";
import {
  buildPhysicsCanvasPrompt,
  compactPhysicsCanvasResult,
  extractPhysicsCanvasQuestion,
  groupPhysicsCanvasHistory,
  PHYSICS_CANVAS_PROMPT_LIMIT,
} from "../src/physicsCanvas.js";
import { PHYSICS_SCAN_POLL_INTERVAL_MS, startPhysicsScanPolling } from "../src/physicsScanPolling.js";

test("physics workspace exposes dedicated P.S. and T.E. AI contracts", () => {
  assert.deepEqual(Object.keys(PHYSICS_AI_ENGINES), ["ps", "te"]);
  assert.equal(PHYSICS_AI_ENGINES.ps.engineName, "PLSO");
  assert.equal(PHYSICS_AI_ENGINES.te.engineName, "THEx");
  assert.equal(PHYSICS_AI_ENGINES.ps.taskType, "physics-problem-solving");
  assert.equal(PHYSICS_AI_ENGINES.te.taskType, "physics-theory-explanation");
  assert.equal(physicsEngineForTask("physics-problem-solving"), PHYSICS_AI_ENGINES.ps);
  assert.equal(physicsEngineProfile("physics-theory-explanation", "deep").title, "THEx");
  assert.ok(Object.values(PHYSICS_AI_ENGINES).every(({ example, placeholder, steps }) => example.trim() && placeholder.trim() && steps.length === 5));
});

test("physics follow-up prompts refine a bounded prior canvas", () => {
  const previousResult = {
    headline: "경사면 운동",
    summary: "마찰이 있는 경사면에서 힘을 분해합니다.",
    sections: [
      { title: "가정", content: "동마찰계수는 일정합니다." },
      { title: "결론", content: "가속도는 g(sinθ-μcosθ)입니다." },
    ],
    sourceBoundary: "고전역학의 점입자 모형입니다.",
  };
  const question = "마찰이 작아지면 최종 가속도와 한계는 어떻게 달라져?";
  const prompt = buildPhysicsCanvasPrompt({ question, previousResult });

  assert.ok(prompt.includes("[현재 캔버스]"));
  assert.ok(prompt.includes("경사면 운동"));
  assert.ok(prompt.includes("[새 질문]"));
  assert.ok(prompt.includes("provided-evidence"));
  assert.equal(extractPhysicsCanvasQuestion(prompt), question);
  assert.ok(prompt.length <= PHYSICS_CANVAS_PROMPT_LIMIT);
  assert.equal(buildPhysicsCanvasPrompt({ question, previousResult: null }), question);
  assert.ok(compactPhysicsCanvasResult(previousResult).includes("결론:"));
});

test("physics canvas prompt keeps the newest question inside the server limit", () => {
  const result = {
    headline: "긴 캔버스",
    summary: "가".repeat(5000),
    sections: [{ title: "전개", content: "나".repeat(5000) }],
  };
  const question = "다".repeat(2000);
  const prompt = buildPhysicsCanvasPrompt({ question, previousResult: result });
  assert.ok(prompt.length <= PHYSICS_CANVAS_PROMPT_LIMIT);
  assert.equal(extractPhysicsCanvasQuestion(prompt).length, 1200);
});

test("physics analysis records reopen as versioned conversation threads", () => {
  const threadId = "123e4567-e89b-42d3-a456-426614174000";
  const records = [
    {
      id: "analysis-2",
      status: "completed",
      createdAt: "2026-08-24T02:00:00.000Z",
      context: { kind: "physics-problem", refId: threadId, meta: `PLSO · canvas:${threadId}` },
      result: { headline: "정지마찰까지 반영", summary: "두 번째 답" },
    },
    {
      id: "analysis-1",
      status: "completed",
      createdAt: "2026-08-24T01:00:00.000Z",
      context: { kind: "physics-problem", refId: threadId, meta: `PLSO · canvas:${threadId}` },
      result: { headline: "경사면 가속도", summary: "첫 번째 답" },
    },
    {
      id: "analysis-3",
      status: "failed",
      createdAt: "2026-08-24T03:00:00.000Z",
      context: { kind: "physics-problem", refId: threadId, meta: `PLSO · canvas:${threadId}` },
      result: null,
    },
  ];
  const [group] = groupPhysicsCanvasHistory(records);
  assert.equal(group.id, threadId);
  assert.equal(group.completedCount, 2);
  assert.equal(group.failedCount, 1);
  assert.equal(group.latest.id, "analysis-3");
  assert.equal(group.latestCompleted.id, "analysis-2");
  assert.deepEqual(group.analyses.map(({ id }) => id), ["analysis-1", "analysis-2", "analysis-3"]);
});

test("physics resources use unique HTTPS links without olympiad navigation seeds", () => {
  assert.equal(new Set(PHYSICS_RESOURCES.map(({ id }) => id)).size, PHYSICS_RESOURCES.length);
  assert.ok(PHYSICS_RESOURCES.every(({ href }) => href.startsWith("https://")));
  assert.ok(PHYSICS_RESOURCES.some(({ provider }) => provider === "MIT OpenCourseWare"));
  assert.ok(!PHYSICS_RESOURCES.some(({ id, title }) => /kpho|ipho/i.test(`${id} ${title}`)));
});

test("physics resource filters combine query, type, and saved state", () => {
  assert.deepEqual(
    filterPhysicsResources(PHYSICS_RESOURCES, { query: "전자기학" }).map(({ id }) => id),
    ["mit-802"],
  );
  assert.deepEqual(filterPhysicsResources(PHYSICS_RESOURCES, { type: "기출문제" }), []);
  assert.ok(filterPhysicsResources(PHYSICS_RESOURCES, { savedOnly: true }).every(({ saved }) => saved));
});

test("pending physics scans keep polling until the component clears the interval", async () => {
  let intervalCallback = null;
  let intervalDelay = null;
  let clearedId = null;
  let refreshes = 0;
  const stop = startPhysicsScanPolling(async () => { refreshes += 1; }, {
    setIntervalFn(callback, delay) {
      intervalCallback = callback;
      intervalDelay = delay;
      return 73;
    },
    clearIntervalFn(id) { clearedId = id; },
  });

  assert.equal(intervalDelay, PHYSICS_SCAN_POLL_INTERVAL_MS);
  await intervalCallback();
  await intervalCallback();
  assert.equal(refreshes, 2);
  stop();
  assert.equal(clearedId, 73);
});
