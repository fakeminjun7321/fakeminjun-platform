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
  clearTimeout,
  requestAnimationFrame(callback) { callback(); },
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
    assert.ok(html.includes(expectedText));
    assert.ok(html.includes("NON-LIVE DEMO"));
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
