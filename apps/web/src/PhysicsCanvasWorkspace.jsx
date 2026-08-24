import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  FolderOpen,
  MagnifyingGlass,
  PaperPlaneTilt,
  Plus,
  Stop,
  X,
} from "@phosphor-icons/react";
import {
  BackendApiError,
  backendClient,
  clearAnalysisAttempt,
  getAnalysisAttempt,
  shouldClearAnalysisAttempt,
} from "./backendClient.js";
import {
  AnalysisVisual,
  analysisErrorNotice,
  getAnalysisProfile,
  resolvePendingAnalysis,
} from "./AiDrawer.jsx";
import { PHYSICS_AI_ENGINES, physicsEngineForTask } from "./physicsEngines.js";
import { PHYSICS_ANALYSIS_LEVEL, PHYSICS_PROFILE_SUMMARY } from "./physicsProfile.js";
import { PhysicsMathText } from "./PhysicsMath.jsx";
import {
  buildPhysicsCanvasPrompt,
  extractPhysicsCanvasQuestion,
  groupPhysicsCanvasHistory,
  PHYSICS_CANVAS_QUESTION_LIMIT,
} from "./physicsCanvas.js";

const RUNTIME_LABELS = {
  standard: { label: "Swift", note: "빠름 · 비용 낮음" },
  auto: { label: "Core", note: "균형 · 권장" },
  deep: { label: "Deep", note: "심층 · 비용 높음" },
};

const STARTER_ANALYSIS = {
  id: "starter-canvas",
  status: "completed",
  requestedMode: "auto",
  plan: { taskType: "physics-problem-solving" },
  result: {
    headline: "슈뢰딩거 방정식: 무한 퍼텐셜 우물",
    summary: "1차원 무한 퍼텐셜 우물에서 경계조건이 에너지 고유값과 정상파 형태를 어떻게 양자화하는지 정리한 시작 예시입니다.",
    sections: [
      {
        title: "1. 문제 해석",
        content: "0 < x < L 영역에 갇힌 입자의 시간에 무관한 슈뢰딩거 방정식을 풀어 허용되는 에너지와 정규화된 고유함수를 구합니다.",
        basis: "established-knowledge",
        confidence: "high",
      },
      {
        title: "2. 핵심 가정",
        content: "우물 내부 퍼텐셜은 0이고 외부는 무한대입니다. 따라서 파동함수는 경계 x = 0, L에서 0이며 우물 밖으로 침투하지 않습니다.",
        basis: "established-knowledge",
        confidence: "high",
      },
      {
        title: "3. 수식 전개",
        content: "일반해 ψ(x)=A sin(kx)+B cos(kx)에 ψ(0)=ψ(L)=0을 적용하면 B=0, kL=nπ입니다. 따라서 Eₙ=n²π²ℏ²/(2mL²), ψₙ(x)=√(2/L)sin(nπx/L)입니다.",
        basis: "established-knowledge",
        confidence: "high",
      },
      {
        title: "4. 최종 결론",
        content: "경계조건 때문에 에너지는 연속값이 아니라 n=1,2,3,…에 대응하는 이산값만 허용됩니다. 바닥상태의 에너지도 0이 아닙니다.",
        basis: "established-knowledge",
        confidence: "high",
      },
      {
        title: "5. 한계 및 예외",
        content: "실제 유한 장벽에서는 파동함수가 장벽 밖으로 지수적으로 감쇠하며 에너지 준위가 달라집니다. 새 질문으로 이 가정을 바꾸면 캔버스 전체가 함께 갱신됩니다.",
        basis: "established-knowledge",
        confidence: "high",
      },
    ],
    visual: {
      type: "equation-map",
      title: "경계조건에서 에너지 양자화까지",
      items: [
        { label: "퍼텐셜 정의", detail: "V=0 inside, V=∞ outside" },
        { label: "일반해", detail: "sin과 cos의 선형결합" },
        { label: "경계조건", detail: "ψ(0)=ψ(L)=0" },
        { label: "양자화", detail: "kL=nπ" },
        { label: "고유값", detail: "Eₙ∝n²" },
      ],
    },
    sourceBoundary: "교과서적 무한 퍼텐셜 우물 모형을 사용한 시작 예시이며, 실제 계의 유한 장벽·외부장·다체 상호작용은 포함하지 않았습니다.",
    citations: [],
    uncertainties: [],
    nextQuestions: ["장벽 높이가 유한하면 무엇이 달라지나?", "시간 의존 상태는 어떻게 구성하나?"],
  },
};

const STARTER_MESSAGES = [
  {
    id: "starter-user",
    role: "user",
    label: "시작 예시",
    content: "무한 퍼텐셜 우물에서 에너지 고유값과 정규화된 고유함수를 구해줘.",
  },
  {
    id: "starter-assistant",
    role: "assistant",
    label: "PLSO",
    content: "경계조건에서 kL=nπ가 나오고, 그 결과 에너지와 파동함수가 이산화됩니다. 오른쪽 캔버스에 전체 유도를 정리했어요.",
  },
];

function historyTitle(item) {
  const analysis = item.latestCompleted ?? item.latest ?? item;
  return analysis?.result?.headline ?? extractPhysicsCanvasQuestion(analysis?.prompt) ?? "저장된 물리 분석";
}

function CanvasSections({ analysis, starter }) {
  const result = analysis?.result;
  if (!result) {
    return (
      <div className="physics-canvas-empty">
        <span>빈 캔버스</span>
        <h2>왼쪽에서 첫 질문을 시작하세요.</h2>
        <p>짧은 설명은 대화에 남고, 정리할 가치가 있는 답변만 이 캔버스에 구조화됩니다.</p>
      </div>
    );
  }

  return (
    <article className="physics-final-document" aria-labelledby="physics-canvas-document-title">
      <header>
        {starter ? <span className="physics-starter-badge">시작 예시</span> : null}
        <h2 id="physics-canvas-document-title">{result.headline}</h2>
        <p><PhysicsMathText>{result.summary}</PhysicsMathText></p>
      </header>
      {result.visual?.type !== "none" && result.visual?.items?.length ? (
        <div className="physics-canvas-visual"><AnalysisVisual visual={result.visual} /></div>
      ) : null}
      <div className="physics-canvas-sections">
        {result.sections?.map((section, index) => (
          <section className={index === result.sections.length - 1 ? "is-latest" : ""} key={`${section.title}-${index}`}>
            <div>
              <h3>{section.title}</h3>
              <span>{section.basis === "established-knowledge" ? "확립 지식" : section.basis === "provided-evidence" ? "제공 맥락" : section.basis === "inference" ? "추론" : "불확실"}</span>
            </div>
            <p><PhysicsMathText>{section.content}</PhysicsMathText></p>
          </section>
        ))}
      </div>
      <section className="physics-canvas-boundary">
        <strong>근거 범위 · 별도 확인 필요</strong>
        <p><PhysicsMathText>{result.sourceBoundary}</PhysicsMathText></p>
      </section>
      {result.citations?.length ? (
        <section className="physics-canvas-citations" aria-label="출처">
          <strong>출처와 근거</strong>
          <ol>{result.citations.map((citation, index) => <li key={`${citation.evidenceId}-${index}`}>{citation.claim} · {citation.locator}</li>)}</ol>
        </section>
      ) : null}
      {result.nextQuestions?.length ? (
        <section className="physics-canvas-next">
          <strong>이어갈 질문</strong>
          <ul>{result.nextQuestions.slice(0, 3).map((question) => <li key={question}>{question}</li>)}</ul>
        </section>
      ) : null}
    </article>
  );
}

export function PhysicsCanvasWorkspace({ analysisContext, onNavigate, onNotice }) {
  const context = analysisContext ?? {
    domain: "physics",
    level: PHYSICS_ANALYSIS_LEVEL,
    taskType: PHYSICS_AI_ENGINES.ps.taskType,
    contextKind: PHYSICS_AI_ENGINES.ps.contextKind,
    contextId: "physics-canvas",
    title: "새 물리 캔버스",
    meta: PHYSICS_PROFILE_SUMMARY,
  };
  const initialEngine = physicsEngineForTask(context.taskType) ?? PHYSICS_AI_ENGINES.ps;
  const [engineId, setEngineId] = useState(initialEngine.id);
  const [mode, setMode] = useState(context.defaultMode ?? "auto");
  const [prompt, setPrompt] = useState(context.initialPrompt ?? "");
  const [messages, setMessages] = useState(STARTER_MESSAGES);
  const [analysis, setAnalysis] = useState(STARTER_ANALYSIS);
  const [starter, setStarter] = useState(true);
  const [canvasVersion, setCanvasVersion] = useState(1);
  const [requestState, setRequestState] = useState("idle");
  const [notice, setNotice] = useState("시작 예시를 열었습니다. 첫 질문을 보내면 개인 캔버스로 바뀝니다.");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyState, setHistoryState] = useState({ status: "idle", items: [], message: "" });
  const [changeOpen, setChangeOpen] = useState(false);
  const requestRef = useRef(null);
  const historyRef = useRef(null);
  const threadIdRef = useRef(crypto.randomUUID());
  const messageListRef = useRef(null);
  const engine = PHYSICS_AI_ENGINES[engineId];
  const selectedProfile = getAnalysisProfile(mode, engine.taskType);
  const completedTurns = messages.filter((message) => message.role === "assistant" && !message.error).length;

  useEffect(() => () => {
    requestRef.current?.abort();
    historyRef.current?.abort();
  }, []);

  useEffect(() => {
    const nextEngine = physicsEngineForTask(context.taskType);
    if (nextEngine) setEngineId(nextEngine.id);
    if (context.defaultMode) setMode(context.defaultMode);
    if (context.initialPrompt) setPrompt(context.initialPrompt);
  }, [context.contextId, context.initialPrompt, context.taskType]);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, requestState]);

  async function loadHistory(query = historyQuery.trim()) {
    const controller = new AbortController();
    historyRef.current?.abort();
    historyRef.current = controller;
    setHistoryState((current) => ({ ...current, status: "loading", message: "기록을 불러오는 중입니다." }));
    try {
      const response = await backendClient.listAnalyses({ domain: "physics", query, limit: 50, signal: controller.signal });
      setHistoryState({ status: "ready", items: groupPhysicsCanvasHistory(response.data), message: "" });
    } catch (error) {
      if (error?.name !== "AbortError") setHistoryState({ status: "error", items: [], message: "저장된 기록을 불러오지 못했습니다." });
    } finally {
      if (historyRef.current === controller) historyRef.current = null;
    }
  }

  function toggleHistory() {
    setHistoryOpen((current) => {
      const next = !current;
      if (next) void loadHistory();
      return next;
    });
    setChangeOpen(false);
  }

  async function openHistoryItem(group) {
    const controller = new AbortController();
    historyRef.current?.abort();
    historyRef.current = controller;
    try {
      let fullGroup = group;
      if (historyQuery.trim()) {
        const response = await backendClient.listAnalyses({ domain: "physics", limit: 50, signal: controller.signal });
        fullGroup = groupPhysicsCanvasHistory(response.data).find((item) => item.id === group.id) ?? group;
      }
      const selected = fullGroup.latestCompleted ?? fullGroup.latest;
      if (!selected) throw new Error("Missing physics canvas history item");
      const loaded = await backendClient.getAnalysis(selected.id, { signal: controller.signal });
      const itemEngine = physicsEngineForTask(loaded.plan?.taskType);
      if (itemEngine) setEngineId(itemEngine.id);
      setMode(loaded.requestedMode ?? loaded.mode ?? "auto");
      setAnalysis(loaded);
      setStarter(false);
      setMessages(fullGroup.analyses.flatMap((item) => {
        const rowEngine = physicsEngineForTask(item.plan?.taskType);
        const userMessage = { id: `${item.id}-user`, role: "user", label: "나", content: extractPhysicsCanvasQuestion(item.prompt) };
        const assistantMessage = item.status === "completed" && item.result
          ? { id: `${item.id}-assistant`, role: "assistant", label: rowEngine?.engineName ?? "물리 AI", content: item.result.summary }
          : { id: `${item.id}-assistant`, role: "assistant", label: rowEngine?.engineName ?? "물리 AI", content: analysisErrorNotice({ code: item.errorCode, status: 502 }), error: true };
        return [userMessage, assistantMessage];
      }));
      if (/^[0-9a-f-]{36}$/iu.test(fullGroup.id)) threadIdRef.current = fullGroup.id;
      setCanvasVersion(fullGroup.completedCount);
      setNotice(fullGroup.failedCount
        ? `저장된 캔버스를 열었습니다. 반영되지 않은 질문 ${fullGroup.failedCount}개도 대화에 표시합니다.`
        : "저장된 대화와 최종 캔버스를 열었습니다.");
      setHistoryOpen(false);
    } catch (error) {
      if (error?.name !== "AbortError") setHistoryState((current) => ({ ...current, status: "error", message: "선택한 기록을 열지 못했습니다." }));
    } finally {
      if (historyRef.current === controller) historyRef.current = null;
    }
  }

  function startNewCanvas() {
    requestRef.current?.abort();
    threadIdRef.current = crypto.randomUUID();
    setAnalysis(null);
    setStarter(false);
    setMessages([]);
    setPrompt("");
    setCanvasVersion(0);
    setRequestState("idle");
    setNotice("새 캔버스를 시작했습니다.");
    setHistoryOpen(false);
  }

  async function submit(event) {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || requestState === "submitting") return;

    const currentResult = starter ? null : analysis?.result ?? null;
    const apiPrompt = buildPhysicsCanvasPrompt({ question, previousResult: currentResult });
    const userMessage = { id: crypto.randomUUID(), role: "user", label: "나", content: question };
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setMessages((current) => [...(starter ? [] : current), userMessage]);
    setPrompt("");
    setRequestState("submitting");
    setNotice(`${engine.engineName}가 답변하면서 최종 캔버스를 갱신하고 있습니다.`);

    const boundContext = ["physics-file", "physics-resource"].includes(context.contextKind);
    const payload = {
      domain: "physics",
      mode,
      taskType: engine.taskType,
      prompt: apiPrompt,
      level: PHYSICS_ANALYSIS_LEVEL,
      context: {
        title: context.title || question.slice(0, 80),
        meta: `${engine.engineName} · ${selectedProfile.task} · ${currentResult ? "이전 캔버스 반영" : "새 캔버스"} · canvas:${threadIdRef.current}`,
        kind: context.contextKind ?? engine.contextKind,
        refId: boundContext ? context.contextId : threadIdRef.current,
      },
    };
    let attempt = null;
    let createdAnalysisId = null;
    try {
      attempt = await getAnalysisAttempt(payload);
      const created = context.contextKind === "physics-file" && context.contextId
        ? await backendClient.createPhysicsFileAnalysis(context.contextId, payload, { signal: controller.signal, idempotencyKey: attempt.idempotencyKey })
        : await backendClient.createAnalysis(payload, { signal: controller.signal, idempotencyKey: attempt.idempotencyKey });
      createdAnalysisId = created?.id ?? null;
      const completed = await resolvePendingAnalysis(created, controller.signal, undefined, mode);
      if (completed?.status === "pending") throw new BackendApiError(408, "analysis_poll_timeout", "분석이 아직 진행 중입니다.");
      if (completed?.status === "failed") throw new BackendApiError(502, completed.errorCode ?? "analysis_failed", "분석을 완료하지 못했습니다.");
      clearAnalysisAttempt(attempt.fingerprint);
      setAnalysis(completed);
      setStarter(false);
      setCanvasVersion((version) => starter ? 1 : Math.max(1, version + 1));
      setMessages((current) => [...current, {
        id: `${completed.id}-assistant`,
        role: "assistant",
        label: engine.engineName,
        content: completed.result?.summary ?? "최종 답변 캔버스를 갱신했습니다.",
      }]);
      setRequestState("success");
      setNotice("방금 대화를 최종 답변 캔버스에 반영했습니다.");
      void loadHistory();
    } catch (error) {
      if (error?.name === "AbortError") {
        setRequestState("cancelled");
        setNotice("요청을 취소했습니다. 이전 캔버스는 그대로 유지됩니다.");
        return;
      }
      if (attempt && shouldClearAnalysisAttempt(error, { hasCreatedAnalysis: Boolean(createdAnalysisId) })) {
        clearAnalysisAttempt(attempt.fingerprint);
      }
      const message = analysisErrorNotice(error);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", label: engine.engineName, content: message, error: true }]);
      setRequestState("error");
      setNotice(`${message} 이전 캔버스는 보존했습니다.`);
      onNotice?.(message);
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  return (
    <main className="physics-conversation-workspace">
      <aside className="physics-conversation-rail" aria-label="물리 대화">
        <header className="physics-rail-heading">
          <div><span>물리 작업실</span><strong>{engine.engineName}</strong></div>
          <div>
            <button type="button" onClick={() => onNavigate?.("drive")}><FolderOpen size={18} /> 자료</button>
            <button type="button" onClick={toggleHistory} aria-expanded={historyOpen} aria-controls="physics-history-palette"><ClockCounterClockwise size={19} /> 기록</button>
          </div>
        </header>
        <div className="physics-engine-switch" aria-label="물리 AI 방식">
          {Object.values(PHYSICS_AI_ENGINES).map((item) => (
            <button type="button" key={item.id} className={engineId === item.id ? "is-selected" : ""} aria-pressed={engineId === item.id} onClick={() => setEngineId(item.id)}>
              <strong>{item.engineName}</strong><span>{item.id === "ps" ? "문제풀이" : "이론설명"}</span>
            </button>
          ))}
        </div>
        <div className="physics-message-list" ref={messageListRef} aria-live="polite">
          {messages.length ? messages.map((message) => (
            <article className={`physics-message is-${message.role}${message.error ? " is-error" : ""}`} key={message.id}>
              <header><strong>{message.label}</strong><span>{message.role === "user" ? "질문" : "간단한 설명"}</span></header>
              <p><PhysicsMathText>{message.content}</PhysicsMathText></p>
            </article>
          )) : (
            <div className="physics-chat-empty"><strong>대화를 시작하세요.</strong><p>간단한 설명은 이곳에 남고, 정리된 답변은 오른쪽 캔버스에서 발전합니다.</p></div>
          )}
          {requestState === "submitting" ? <div className="physics-thinking"><span /><span /><span /> {engine.engineName}가 캔버스를 갱신하는 중</div> : null}
        </div>
        <form className="physics-chat-composer" onSubmit={submit} aria-busy={requestState === "submitting"}>
          <label htmlFor="physics-canvas-prompt">후속 질문 또는 간단한 설명 요청</label>
          <textarea
            id="physics-canvas-prompt"
            value={prompt}
            maxLength={PHYSICS_CANVAS_QUESTION_LIMIT}
            rows={3}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={engine.placeholder}
          />
          <div className="physics-composer-actions">
            <span>{prompt.length.toLocaleString("ko-KR")} / {PHYSICS_CANVAS_QUESTION_LIMIT.toLocaleString("ko-KR")}</span>
            {requestState === "submitting" ? (
              <button className="physics-stop" type="button" onClick={() => requestRef.current?.abort()}><Stop size={16} weight="fill" /> 취소</button>
            ) : (
              <button className="physics-send" type="submit" disabled={!prompt.trim()} aria-label={`${engine.engineName}에게 질문 보내기`}><PaperPlaneTilt size={19} /></button>
            )}
          </div>
          <fieldset>
            <legend>응답 성능</legend>
            {Object.values(RUNTIME_LABELS).map((runtime, index) => {
              const runtimeMode = ["standard", "auto", "deep"][index];
              return <button type="button" key={runtimeMode} className={mode === runtimeMode ? "is-selected" : ""} aria-pressed={mode === runtimeMode} onClick={() => setMode(runtimeMode)} disabled={requestState === "submitting"}><strong>{runtime.label}</strong><span>{runtime.note}</span></button>;
            })}
          </fieldset>
        </form>
      </aside>

      <section className="physics-canvas-pane" aria-label="최종 답변 캔버스">
        <header className="physics-canvas-toolbar">
          <div><span>최종 답변 캔버스</span><small>v{canvasVersion} · 대화 {completedTurns}개 반영</small></div>
          <div>
            <span className={`physics-canvas-sync is-${requestState}`}><CheckCircle size={16} weight="fill" />{requestState === "submitting" ? "캔버스 갱신 중" : requestState === "error" || requestState === "cancelled" ? "이전 캔버스 유지됨" : starter ? "시작 예시" : canvasVersion ? "방금 대화 반영됨" : "새 캔버스"}</span>
            <button type="button" className="physics-change-trigger" onClick={() => setChangeOpen((current) => !current)} aria-expanded={changeOpen}>변경 내용</button>
            <button type="button" className="physics-new-canvas" onClick={startNewCanvas}><Plus size={17} /> 새 캔버스</button>
          </div>
        </header>
        {changeOpen ? <div className="physics-change-popover"><strong>이번 캔버스 상태</strong><p>{notice}</p><button type="button" onClick={() => setChangeOpen(false)} aria-label="변경 내용 닫기"><X size={15} /></button></div> : null}
        <div className="physics-canvas-scroll">
          <CanvasSections analysis={analysis} starter={starter} />
        </div>
      </section>

      {historyOpen ? (
        <div className="physics-history-layer" role="presentation">
          <button className="physics-history-backdrop" type="button" onClick={() => setHistoryOpen(false)} tabIndex={-1} aria-hidden="true" />
          <section className="physics-history-palette" id="physics-history-palette" role="dialog" aria-label="물리 대화 기록">
            <header><strong>대화 기록</strong><button type="button" onClick={() => setHistoryOpen(false)} aria-label="기록 닫기"><X size={18} /></button></header>
            <form onSubmit={(event) => { event.preventDefault(); void loadHistory(); }}>
              <label><MagnifyingGlass size={17} /><span className="sr-only">대화 기록 검색</span><input autoFocus value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} maxLength={160} placeholder="질문·결과 검색" /></label>
              <button type="submit" disabled={historyState.status === "loading"}>검색</button>
            </form>
            {historyState.message ? <p className="physics-history-status">{historyState.message}</p> : null}
            <ol>{historyState.items.map((item) => {
              const representative = item.latestCompleted ?? item.latest;
              const itemEngine = physicsEngineForTask(representative?.plan?.taskType);
              const itemProfile = getAnalysisProfile(representative?.requestedMode ?? representative?.mode, representative?.plan?.taskType);
              return <li key={item.id}><button type="button" onClick={() => void openHistoryItem(item)}><span>물리 · {itemEngine?.engineName ?? itemProfile.title} · 캔버스 v{item.completedCount || 0}{item.failedCount ? ` · 미반영 ${item.failedCount}` : ""}</span><strong>{historyTitle(item)}</strong><small>{new Date(item.latest?.createdAt).toLocaleString("ko-KR")}</small><ArrowRight size={16} /></button></li>;
            })}</ol>
            {historyState.status === "ready" && !historyState.items.length ? <div className="physics-history-empty"><strong>저장된 기록이 없습니다.</strong><p>질문을 완료하면 분석 기록이 여기에 저장됩니다.</p></div> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default PhysicsCanvasWorkspace;
