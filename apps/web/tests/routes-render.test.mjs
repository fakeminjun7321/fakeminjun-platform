import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
const { PhysicsWorkspace, parseGoogleDriveCallbackSearch } = await vite.ssrLoadModule("/src/PhysicsWorkspace.jsx");
const { PHYSICS_ANALYSIS_LEVEL, PHYSICS_PROFILE_SUMMARY } = await vite.ssrLoadModule("/src/physicsProfile.js");
const { AiDrawer, analysisErrorNotice, getMandosProfile } = await vite.ssrLoadModule("/src/AiDrawer.jsx");
const { CandidatePromotionPanel } = await vite.ssrLoadModule("/src/CandidatePromotionPanel.jsx");
const aiDrawerSource = await readFile(new URL("../src/AiDrawer.jsx", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const physicsWorkspaceSource = await readFile(new URL("../src/PhysicsWorkspace.jsx", import.meta.url), "utf8");

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
        onOpenAi() {},
        onNotice() {},
      }));
      assert.ok(physicsHtml.includes(expectedText));
      assert.ok(physicsHtml.includes(PHYSICS_PROFILE_SUMMARY));
      assert.ok(!physicsHtml.includes("물리 설명 수준"));
      assert.ok(!physicsHtml.includes('class="level-selector"'));
      if (pathname === "/physics/library") {
        assert.ok(physicsHtml.includes("Google Drive 원본 보관소"));
        assert.ok(physicsHtml.includes("Drive 전체 권한을 요청하지 않습니다."));
        assert.ok(physicsHtml.includes("Google Drive 연결"));
        assert.ok(!physicsHtml.includes("Google Drive 연결됨"));
      }
    } else {
      assert.ok(html.includes(expectedText));
    }
    if (pathname === "/international/briefing") {
      assert.ok(html.includes("공식 자료 · 검증 전"));
    } else {
      assert.ok(html.includes("개인 공간"));
    }
    assert.ok(!html.includes("정치"));
    assert.ok(!html.includes("/politics"));
    assert.ok(html.includes('drawer-layer is-pinned'));
    assert.ok(html.includes('role="complementary"') || html.includes("Mandos를 불러오는 중입니다."));
    if (pathname === "/international/briefing") {
      assert.ok(html.includes("자료 묶음 검토"));
      assert.ok(html.includes("자료 묶음 후보"));
      assert.ok(html.includes("검증 전"));
      assert.ok(html.includes("지도 반영 전"));
      assert.ok(html.includes("공식 출처 새로고침"));
      assert.ok(html.includes("사건 후보 만들기"));
      assert.ok(html.includes("60초마다 확인"));
      assert.ok(html.includes("첫 동기화 대기"));
    }
  });
}

test("physics uses one personal olympiad analysis profile without a level selector", () => {
  assert.equal(PHYSICS_ANALYSIS_LEVEL, "P4");
  assert.equal(PHYSICS_PROFILE_SUMMARY, "수학적 구조·이론·유도 중심 · KPhO에서 IPhO까지 준비");
});

test("Drive callback relay keeps only one bounded Google result", () => {
  const state = "s".repeat(43);
  assert.deepEqual(parseGoogleDriveCallbackSearch(`?state=${state}&code=authorization-code`), {
    state, code: "authorization-code",
  });
  assert.deepEqual(parseGoogleDriveCallbackSearch(`?state=${state}&error=access_denied`), {
    state, error: "access_denied",
  });
  assert.equal(parseGoogleDriveCallbackSearch(`?state=${state}&code=code&error=access_denied`), null);
  assert.equal(parseGoogleDriveCallbackSearch("?state=short&code=code"), null);
});

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

  assert.ok(html.includes("검토 완료 · 검증 전"));
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
  assert.ok(html.includes("지도 반영 준비"));
  assert.ok(html.includes("반영 잠금"));
  assert.ok(!html.includes("PROMOTION READY"));
  assert.ok(!html.includes(">VERIFIED<"));
});

test("Mandos drawer defaults to Core and keeps advanced controls compact", () => {
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
  assert.ok(html.includes("MANDOS"));
  assert.ok(html.includes("Mandos 3 Core"));
  assert.ok(html.includes('aria-label="이전 분석 열기"'));
  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('aria-modal="true"'));
  assert.ok(html.includes("drawer-scrim"));
  assert.ok(html.includes("Mandos 패널 닫기"));
  assert.ok(!html.includes("현재 화면 사용"));
  assert.ok(!html.includes("화면 영역 선택"));
  assert.ok(!html.includes("분석할 화면 첨부"));
  assert.ok(!html.includes("자동 판단"));
  assert.ok(!html.includes("OPENAI EXECUTION TRACE"));
  assert.ok(!html.includes("TOKEN USAGE"));

  assert.deepEqual(getMandosProfile("standard"), {
    mode: "standard", title: "Mandos 3 Swift", task: "빠른 답변", trait: "요약·개념 확인",
  });
  assert.equal(getMandosProfile("auto").title, "Mandos 3 Core");
  assert.equal(getMandosProfile("deep").title, "Mandos 3 Deep");
});

test("Mandos keeps requested profile history and localizes recoverable errors", () => {
  assert.match(aiDrawerSource, /setMode\(loaded\.requestedMode \?\? loaded\.mode \?\? "auto"\)/);
  assert.match(aiDrawerSource, /item\.requestedMode \?\? item\.mode/);
  assert.match(aiDrawerSource, /analysis\.requestedMode \?\? analysis\.mode \?\? requestedMode/);
  assert.match(aiDrawerSource, /profileMode === "deep" \? 330 : 45/);

  const cases = [
    ["ai_incomplete", "답변을 끝까지 만들지 못했습니다. 다시 요청해 주세요."],
    ["ai_timeout", "분석 시간이 초과됐습니다. 다시 요청해 주세요."],
    ["ai_rate_limited", "현재 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요."],
    ["ai_refused", "이 요청은 분석할 수 없습니다. 질문을 바꿔 주세요."],
    ["analysis_evidence_mismatch", "근거 확인을 통과하지 못했습니다. 다시 요청해 주세요."],
  ];
  for (const [code, expected] of cases) {
    const notice = analysisErrorNotice({ code, status: code === "ai_rate_limited" ? 429 : 502 });
    assert.equal(notice, expected);
    assert.doesNotMatch(notice, /OpenAI|provider|schema|incomplete/i);
  }
});

test("international routes and physics modes select explicit task contracts", () => {
  assert.match(appSource, /route === "briefing" \? "evidence-crosscheck" : "causal-synthesis"/);
  const expectedPhysicsTasks = [
    ["concept", "general"],
    ["derivation", "full-derivation"],
    ["visual-analysis", "solution-audit"],
    ["research", "evidence-crosscheck"],
    ["network", "general"],
    ["thought-experiment", "general"],
    ["research-log", "general"],
  ];
  for (const [mode, taskType] of expectedPhysicsTasks) {
    const escapedMode = mode.replaceAll("-", "\\-");
    assert.match(physicsWorkspaceSource, new RegExp(`["']?${escapedMode}["']?\\s*:\\s*["']${taskType}["']`));
  }
  assert.match(physicsWorkspaceSource, /taskType: PHYSICS_TASK_TYPES\[selected\.id\] \?\? "general"/);
  assert.match(physicsWorkspaceSource, /Mandos로 분석하기/);
  assert.doesNotMatch(physicsWorkspaceSource, /selected\.title\}로 Mandos 열기/);
});

test("pinned Mandos is complementary and cannot block or close the workspace", () => {
  const html = renderToStaticMarkup(React.createElement(AiDrawer, {
    analysisContext: {
      domain: "international",
      title: "오늘의 국제정세",
      meta: "데모 자료",
      placeholder: "핵심을 분석해줘.",
    },
    onClose() {},
    pinned: true,
  }));
  assert.ok(html.includes('drawer-layer is-pinned'));
  assert.ok(html.includes('role="complementary"'));
  assert.ok(!html.includes('aria-modal="true"'));
  assert.ok(!html.includes("drawer-scrim"));
  assert.ok(!html.includes("Mandos 패널 닫기"));
});
