import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

globalThis.window = {
  location: { pathname: "/physics/learn" },
  history: {},
  addEventListener() {},
  removeEventListener() {},
  setTimeout,
  clearTimeout,
  requestAnimationFrame(callback) { callback(); },
  cancelAnimationFrame() {},
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
const { App, CandidateReviewDesk } = await vite.ssrLoadModule("/src/App.jsx");
const { PhysicsWorkspace } = await vite.ssrLoadModule("/src/PhysicsWorkspace.jsx");
const { AiDrawer, buildAgentActivity } = await vite.ssrLoadModule("/src/AiDrawer.jsx");
const { CandidatePromotionPanel } = await vite.ssrLoadModule("/src/CandidatePromotionPanel.jsx");
const {
  claimCaptureStream,
  createTrackedObjectUrl,
  waitForVideo,
  waitForVideoFrame,
} = await vite.ssrLoadModule("/src/CaptureComposer.jsx");

after(async () => {
  await vite.close();
  delete globalThis.window;
});

const ROUTE_EXPECTATIONS = [
  ["/international/briefing", "사건 후보 검토대"],
  ["/physics/learn", "물리 학습 허브"],
  ["/physics/library", "물리 자료 보관소"],
  ["/physics/find", "물리 자료 찾기"],
  ["/physics/ipho", "KPhO · IPhO 준비"],
];

for (const [pathname, expectedText] of ROUTE_EXPECTATIONS) {
  test(`renders the frontend contract for ${pathname}`, () => {
    window.location.pathname = pathname;
    const html = renderToStaticMarkup(React.createElement(App));
    if (pathname.startsWith("/physics/")) {
      assert.ok(html.includes("물리 작업공간을 불러오는 중입니다.") || html.includes(expectedText));
      const view = { "/physics/library": "library", "/physics/find": "finder", "/physics/ipho": "ipho" }[pathname] ?? "learn";
      const physicsHtml = renderToStaticMarkup(React.createElement(PhysicsWorkspace, {
        view,
        level: 4,
        onLevelChange() {},
        onOpenAi() {},
        onNotice() {},
      }));
      assert.ok(physicsHtml.includes(expectedText));
    } else {
      assert.ok(html.includes(expectedText));
    }
    if (pathname === "/international/briefing") {
      assert.ok(html.includes("LIVE SOURCE · UNVERIFIED"));
    } else {
      assert.ok(html.includes("PRIVATE WORKSPACE"));
    }
    assert.ok(!html.includes("정치"));
    assert.ok(!html.includes("/politics"));
    assert.ok(!html.includes('id="ai-analysis-drawer"'));
    if (pathname === "/international/briefing") {
      assert.ok(html.includes("CANDIDATE REVIEW DESK"));
      assert.ok(html.includes("METADATA HYPOTHESIS"));
      assert.ok(html.includes("UNVERIFIED"));
      assert.ok(html.includes("MAP PROMOTION LOCKED"));
      assert.ok(html.includes("공식 출처 새로고침"));
      assert.ok(html.includes("사건 후보 만들기"));
      assert.ok(html.includes("AUTO SYNC · 60 SEC"));
      assert.ok(html.includes("첫 동기화 대기"));
    }
  });
}

test("renders candidate evidence and review controls without claiming verification", () => {
  const candidate = {
    id: "candidate-1",
    revision: 2,
    candidateHash: "hash-1",
    reviewStatus: "reviewed",
    title: "공식 발표 연계 가능성",
    summary: "두 공식 발표가 같은 외교 일정과 관련됐을 가능성을 검토합니다.",
    whyGrouped: "발행 시각과 제목의 핵심 명사가 가깝습니다.",
    regionLabel: "대한민국 · 미국",
    laneRecommendation: "korea-core",
    sourceAssessments: [{ sourceItemId: 1, sourceName: "외교부", assessment: "공식 발표 메타데이터" }],
    uncertainties: ["본문 맥락은 아직 확인하지 않았습니다."],
    nextChecks: ["원문 발표의 대상과 일정을 대조합니다."],
    evidenceSnapshots: [{
      sourceItemId: 1,
      sourceName: "외교부",
      title: "공식 발표 원문",
      originalUrl: "https://www.mofa.go.kr/example",
      publishedAt: "2026-08-22T02:00:00.000Z",
    }],
  };
  const html = renderToStaticMarkup(React.createElement(CandidateReviewDesk, {
    state: { status: "ready", items: [candidate] },
    noteDrafts: {},
    reviewState: { status: "idle", candidateId: null, message: "" },
    onNoteChange() {},
    onReview() {},
  }));

  assert.ok(html.includes("REVIEWED · NOT VERIFIED"));
  assert.ok(html.includes("검토 완료 · 검증 아님"));
  assert.ok(html.includes("근거 스냅샷"));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(!html.includes(">VERIFIED<"));
});

test("renders promotion readiness without claiming a candidate is verified", () => {
  const html = renderToStaticMarkup(React.createElement(CandidatePromotionPanel, {
    candidate: {
      id: "candidate-2",
      revision: 1,
      candidateHash: "a".repeat(64),
      sourceCount: 2,
      evidenceSnapshots: [{ sourceItemId: 1, sourceName: "외교부", title: "공식 발표" }],
      mapReadiness: { ready: false, reason: "원문 근거와 위치가 필요합니다." },
    },
    onPromoted() {},
  }));
  assert.ok(html.includes("지도 승격 준비"));
  assert.ok(html.includes("FAIL-CLOSED"));
  assert.ok(!html.includes("PROMOTION READY"));
  assert.ok(!html.includes(">VERIFIED<"));
});

test("AI drawer defaults to auto and exposes built-in capture without faking stage progress", () => {
  const html = renderToStaticMarkup(React.createElement(AiDrawer, {
    analysisContext: {
      domain: "physics",
      level: "P4",
      title: "그래프 분석",
      meta: "물리 학습",
      placeholder: "이 그래프를 분석해줘.",
    },
    onClose() {},
  }));
  assert.ok(html.includes("자동 판단"));
  assert.ok(html.includes("영역 선택"));
  assert.ok(html.includes("REQUESTED · AUTO"));
  assert.ok(!html.includes("내장 영역 캡처 구현 후"));

  assert.deepEqual(buildAgentActivity({ analysis: null, requestedMode: "deep", requestState: "submitting" }), [{
    id: "server-execution",
    label: "SERVER EXECUTION",
    detail: "내부 단계별 상태는 서버가 반환한 경우에만 표시합니다.",
    status: "running",
  }]);

  assert.deepEqual(buildAgentActivity({
    requestedMode: "auto",
    requestState: "success",
    analysis: {
      mode: "deep",
      steps: [{ stage: "synthesis", role: "final-synthesizer", model: "gpt-test", status: "completed" }],
    },
  }), [{
    id: "stage-1",
    label: "final-synthesizer",
    detail: "final-synthesizer · gpt-test",
    status: "completed",
  }]);
});

test("capture lifecycle stops a stream that resolves after cleanup and revokes a late URL", () => {
  const track = { stopCalls: 0, stop() { this.stopCalls += 1; } };
  const stream = { getTracks: () => [track] };
  const mountedRef = { current: false };
  const operationRef = { current: 2 };
  const streamRef = { current: null };

  assert.equal(claimCaptureStream(stream, {
    operationId: 1,
    operationRef,
    mountedRef,
    streamRef,
  }), false);
  assert.equal(track.stopCalls, 1);
  assert.equal(streamRef.current, null);

  const trackedUrls = new Set();
  const revoked = [];
  let currentChecks = 0;
  const url = createTrackedObjectUrl(new Blob(["pixels"]), {
    isCurrent: () => { currentChecks += 1; return currentChecks === 1; },
    objectUrls: trackedUrls,
    createObjectURL: () => "blob:late-capture",
    revokeObjectURL: (value) => revoked.push(value),
  });
  assert.equal(url, null);
  assert.deepEqual(revoked, ["blob:late-capture"]);
  assert.equal(trackedUrls.size, 0);
});

test("capture frame wait is bounded and releases ended listeners and callbacks", async () => {
  function frameFixture() {
    let frameCallback;
    let endedHandler;
    const cancelled = [];
    return {
      video: {
        requestVideoFrameCallback(callback) { frameCallback = callback; return 19; },
        cancelVideoFrameCallback(id) { cancelled.push(id); },
      },
      track: {
        readyState: "live",
        addEventListener(type, callback) { if (type === "ended") endedHandler = callback; },
        removeEventListener(type, callback) { if (type === "ended" && endedHandler === callback) endedHandler = null; },
      },
      cancelled,
      frame: () => frameCallback?.(),
      end: () => endedHandler?.(),
      listener: () => endedHandler,
    };
  }

  const ended = frameFixture();
  const endedWait = waitForVideoFrame(ended.video, { track: ended.track, timeoutMs: 100 });
  ended.end();
  await assert.rejects(endedWait, /종료/);
  assert.deepEqual(ended.cancelled, [19]);
  assert.equal(ended.listener(), null);

  const timedOut = frameFixture();
  await assert.rejects(
    waitForVideoFrame(timedOut.video, { track: timedOut.track, timeoutMs: 5 }),
    /시간이 초과/,
  );
  assert.deepEqual(timedOut.cancelled, [19]);
  assert.equal(timedOut.listener(), null);

  const completed = frameFixture();
  const completedWait = waitForVideoFrame(completed.video, { track: completed.track, timeoutMs: 100 });
  completed.frame();
  await completedWait;
  assert.deepEqual(completed.cancelled, [19]);
  assert.equal(completed.listener(), null);
});

test("capture metadata wait is bounded and removes video and track handlers", async () => {
  let endedHandler;
  const track = {
    readyState: "live",
    addEventListener(type, callback) { if (type === "ended") endedHandler = callback; },
    removeEventListener(type, callback) { if (type === "ended" && endedHandler === callback) endedHandler = null; },
  };
  const video = { onloadedmetadata: null, onerror: null, play: () => Promise.resolve() };
  const endedWait = waitForVideo(video, { track, timeoutMs: 100 });
  endedHandler();
  await assert.rejects(endedWait, /종료/);
  assert.equal(endedHandler, null);
  assert.equal(video.onloadedmetadata, null);
  assert.equal(video.onerror, null);

  const timedOutVideo = { onloadedmetadata: null, onerror: null, play: () => Promise.resolve() };
  await assert.rejects(waitForVideo(timedOutVideo, { timeoutMs: 5 }), /시간이 초과/);
  assert.equal(timedOutVideo.onloadedmetadata, null);
  assert.equal(timedOutVideo.onerror, null);

  let completedEndedHandler;
  const completedTrack = {
    readyState: "live",
    addEventListener(type, callback) { if (type === "ended") completedEndedHandler = callback; },
    removeEventListener(type, callback) {
      if (type === "ended" && completedEndedHandler === callback) completedEndedHandler = null;
    },
  };
  const completedVideo = { onloadedmetadata: null, onerror: null, play: () => Promise.resolve() };
  const completedWait = waitForVideo(completedVideo, { track: completedTrack, timeoutMs: 100 });
  completedVideo.onloadedmetadata();
  await completedWait;
  assert.equal(completedEndedHandler, null);
  assert.equal(completedVideo.onloadedmetadata, null);
  assert.equal(completedVideo.onerror, null);
});
