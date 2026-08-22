import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Camera,
  MapTrifold,
  PaperPlaneTilt,
  Selection,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  BackendApiError,
  backendClient,
  clearAnalysisAttempt,
  clearVisualAnalysisAttempt,
  getAnalysisAttempt,
  getVisualAnalysisAttempt,
  shouldClearAnalysisAttempt,
} from "./backendClient.js";

const CaptureComposer = lazy(() => import("./CaptureComposer.jsx"));

const CONFIDENCE_LABELS = { high: "높음", medium: "중간", low: "낮음" };
const BASIS_LABELS = {
  "provided-evidence": "모델 분류 · 제공 맥락",
  "established-knowledge": "모델 분류 · 확립 지식",
  inference: "모델 분류 · 추론",
  uncertain: "모델 분류 · 불확실",
};

const MODE_COPY = {
  auto: { title: "자동 판단", detail: "요청 복잡도에 따라 단일 분석 또는 제한된 교차검토" },
  standard: { title: "일반 분석", detail: "빠르고 경제적인 OpenAI 단일 분석" },
  deep: { title: "정밀 분석", detail: "전문 검토 2개를 병렬 실행한 뒤 최종 통합" },
};

function normalizeReturnedStages(analysis) {
  const stages = analysis?.execution?.stages ?? analysis?.steps ?? analysis?.activity ?? analysis?.stages ?? [];
  if (!Array.isArray(stages)) return [];
  return stages.flatMap((stage, index) => {
    if (!stage || typeof stage !== "object") return [];
    return [{
      id: stage.id ?? `stage-${index + 1}`,
      label: stage.label ?? stage.role ?? stage.name ?? `실행 단계 ${index + 1}`,
      detail: stage.detail ?? ([stage.role, stage.model].filter(Boolean).join(" · ") || "서버가 기록한 실행 단계"),
      status: stage.status ?? "completed",
    }];
  });
}

export function buildAgentActivity({ analysis, requestedMode, requestState }) {
  const returned = normalizeReturnedStages(analysis);
  if (returned.length) return returned;
  if (requestState === "submitting") {
    return [{
      id: "server-execution",
      label: "SERVER EXECUTION",
      detail: "내부 단계별 상태는 서버가 반환한 경우에만 표시합니다.",
      status: "running",
    }];
  }
  if (analysis?.models?.length) {
    return analysis.models.map((model, index) => ({
      id: `model-${index + 1}`,
      label: `MODEL CALL ${String(index + 1).padStart(2, "0")}`,
      detail: model,
      status: analysis.status === "failed" ? "failed" : "completed",
    }));
  }
  const mode = MODE_COPY[requestedMode] ?? MODE_COPY.auto;
  return [{ id: "planned", label: mode.title, detail: mode.detail, status: "planned" }];
}

function AgentRunPanel({ analysis, requestedMode, requestState }) {
  const stages = buildAgentActivity({ analysis, requestedMode, requestState });
  const resolvedMode = analysis?.execution?.resolvedMode ?? analysis?.mode ?? null;
  return (
    <section className="agent-run-panel" aria-label="AI 실행 구성과 실제 기록">
      <header>
        <div><p className="system-kicker">OPENAI EXECUTION TRACE</p><h3>분석 실행</h3></div>
        <span>{resolvedMode ? `ACTUAL · ${resolvedMode.toUpperCase()}` : `REQUESTED · ${requestedMode.toUpperCase()}`}</span>
      </header>
      <ol>
        {stages.map((stage) => (
          <li className={`agent-run-stage is-${stage.status}`} key={stage.id}>
            <i aria-hidden="true" /><div><strong>{stage.label}</strong><span>{stage.detail}</span></div><small>{stage.status.toUpperCase()}</small>
          </li>
        ))}
      </ol>
      <footer>
        <span>{analysis?.models?.length ? `${analysis.models.length} ACTUAL MODEL CALLS` : "실제 반환 정보만 표시"}</span>
        <span>{analysis?.usage?.totalTokens ? `${analysis.usage.totalTokens.toLocaleString("ko-KR")} TOKENS` : "TOKEN USAGE PENDING"}</span>
      </footer>
    </section>
  );
}

function AnalysisResult({ analysis }) {
  const result = analysis.result;
  if (!result) return null;
  return (
    <article className="analysis-result" aria-labelledby="analysis-result-title">
      <header>
        <p className="system-kicker">STRUCTURED ANALYSIS · {(analysis.execution?.resolvedMode ?? analysis.mode ?? "standard").toUpperCase()}</p>
        <h3 id="analysis-result-title">{result.headline}</h3>
        <p>{result.summary}</p>
      </header>
      {result.visual?.type !== "none" && result.visual?.items?.length > 0 ? (
        <section className={`analysis-visual is-${result.visual.type}`} aria-label={result.visual.title}>
          <strong>{result.visual.title}</strong>
          <ol>{result.visual.items.map((item, index) => (
            <li key={`${item.label}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.label}</b><small>{item.detail}</small></div></li>
          ))}</ol>
        </section>
      ) : null}
      <div className="analysis-sections">
        {result.sections?.map((section, index) => (
          <section key={`${section.title}-${index}`}>
            <div><h4>{section.title}</h4><span>{BASIS_LABELS[section.basis] ?? section.basis} · 확신 추정 {CONFIDENCE_LABELS[section.confidence] ?? section.confidence}</span></div>
            <p>{section.content}</p>
          </section>
        ))}
      </div>
      <section className="analysis-boundary">
        <strong>모델이 밝힌 근거 범위 · 자동 검증 전</strong><p>{result.sourceBoundary}</p>
      </section>
      {result.uncertainties?.length ? (
        <section className="analysis-list"><strong>불확실성</strong><ul>{result.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul></section>
      ) : null}
      {result.nextQuestions?.length ? (
        <section className="analysis-list"><strong>다음 질문</strong><ul>{result.nextQuestions.map((item) => <li key={item}>{item}</li>)}</ul></section>
      ) : null}
      <footer>
        <span>{analysis.models?.join(" · ")}</span>
        <span>{analysis.usage?.totalTokens ? `${analysis.usage.totalTokens.toLocaleString("ko-KR")} tokens` : "사용량 집계 없음"}</span>
      </footer>
    </article>
  );
}

function waitForPoll(delayMs, signal) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = window.setTimeout(finish, delayMs);
    const abort = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

async function resolvePendingAnalysis(initial, signal, onProgress) {
  let current = initial;
  onProgress?.(current);
  for (let attempt = 0; current?.status === "pending" && attempt < 45; attempt += 1) {
    await waitForPoll(2000, signal);
    current = await backendClient.getAnalysis(current.id, { signal });
    onProgress?.(current);
  }
  return current;
}

export function AiDrawer({ analysisContext, onClose }) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("auto");
  const [requestState, setRequestState] = useState("idle");
  const [analysis, setAnalysis] = useState(null);
  const [notice, setNotice] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capture, setCapture] = useState(null);
  const [captureUrl, setCaptureUrl] = useState("");
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => { closeButtonRef.current?.focus(); }, []);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => () => { if (captureUrl) URL.revokeObjectURL(captureUrl); }, [captureUrl]);

  function handleKeyDown(eventObject) {
    if (eventObject.key === "Escape") {
      eventObject.preventDefault();
      if (captureOpen) setCaptureOpen(false);
      else onClose();
      return;
    }
    if (eventObject.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (eventObject.shiftKey && document.activeElement === first) { eventObject.preventDefault(); last.focus(); }
    else if (!eventObject.shiftKey && document.activeElement === last) { eventObject.preventDefault(); first.focus(); }
  }

  function confirmCapture(result) {
    if (captureUrl) URL.revokeObjectURL(captureUrl);
    setCapture(result);
    setCaptureUrl(URL.createObjectURL(result.file));
    setCaptureOpen(false);
    setNotice("선택 영역이 준비되었습니다. 분석 요청을 누르기 전에는 서버로 전송되지 않습니다.");
  }

  function removeCapture() {
    if (captureUrl) URL.revokeObjectURL(captureUrl);
    setCapture(null);
    setCaptureUrl("");
    setNotice("첨부할 캡처를 제거했습니다.");
  }

  async function submit(eventObject) {
    eventObject.preventDefault();
    const question = prompt.trim();
    if (!question || requestState === "submitting") {
      if (!question) setNotice("분석할 질문을 입력하세요.");
      return;
    }
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setRequestState("submitting");
    setNotice(capture ? "선택 영역과 질문을 개인 분석 백엔드로 전송했습니다." : "분석 요청을 전송했습니다.");
    setAnalysis(null);
    const payload = {
      domain: analysisContext.domain,
      mode,
      ...(analysisContext.taskType ? { taskType: analysisContext.taskType } : {}),
      prompt: question,
      ...(analysisContext.eventId ? { eventId: analysisContext.eventId } : {}),
      ...(analysisContext.level ? { level: analysisContext.level } : {}),
      context: {
        title: analysisContext.title,
        meta: analysisContext.meta,
        ...(analysisContext.contextKind ? { kind: analysisContext.contextKind } : {}),
        ...(analysisContext.contextId ? { refId: analysisContext.contextId } : {}),
      },
    };
    let attempt = null;
    let clearAttempt = null;
    let createdAnalysisId = null;
    try {
      let created;
      if (capture) {
        attempt = await getVisualAnalysisAttempt({ metadata: payload, image: capture.file });
        clearAttempt = clearVisualAnalysisAttempt;
        created = await backendClient.createVisualAnalysis(
          { metadata: payload, image: capture.file },
          { signal: controller.signal, idempotencyKey: attempt.idempotencyKey },
        );
      } else {
        attempt = await getAnalysisAttempt(payload);
        clearAttempt = clearAnalysisAttempt;
        created = await backendClient.createAnalysis(payload, {
          signal: controller.signal,
          idempotencyKey: attempt.idempotencyKey,
        });
      }
      createdAnalysisId = created?.id ?? null;
      setAnalysis(created);
      const completed = await resolvePendingAnalysis(created, controller.signal, setAnalysis);
      if (completed?.status === "pending") throw new Error("분석이 아직 진행 중입니다. 잠시 후 같은 질문으로 다시 확인하세요.");
      if (completed?.status === "failed") {
        if (attempt && clearAttempt) clearAttempt(attempt.fingerprint);
        throw new BackendApiError(502, completed.errorCode ?? "analysis_failed", "이전 분석 요청이 완료되지 않았습니다. 다시 시도하세요.");
      }
      if (attempt && clearAttempt) clearAttempt(attempt.fingerprint);
      setAnalysis(completed);
      setRequestState("success");
      setNotice(capture ? "캡처 기반 분석이 완료되었습니다. 이미지 해석도 자동 검증된 사실은 아닙니다." : "분석이 완료되었습니다.");
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (attempt && shouldClearAnalysisAttempt(error, { hasCreatedAnalysis: Boolean(createdAnalysisId) })) {
        clearAttempt?.(attempt.fingerprint);
      }
      setRequestState("error");
      setNotice(error?.message ?? "분석 요청을 처리하지 못했습니다.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  const activity = useMemo(() => ({ analysis, requestedMode: mode, requestState }), [analysis, mode, requestState]);

  return (
    <div className="drawer-layer" role="presentation">
      <button className="drawer-scrim" type="button" onClick={onClose} tabIndex={-1} aria-hidden="true" />
      <aside
        className="ai-drawer" id="ai-analysis-drawer" ref={drawerRef} role="dialog" aria-modal="true"
        aria-labelledby="ai-analysis-title" aria-describedby="ai-connection-status" onKeyDown={handleKeyDown}
      >
        <div className="drawer-heading">
          <div><p className="system-kicker">ANALYSIS WORKSPACE</p><h2 id="ai-analysis-title">AI 분석</h2></div>
          <button className="icon-button" type="button" onClick={onClose} ref={closeButtonRef} aria-label="AI 분석 패널 닫기"><X size={20} /></button>
        </div>
        <div className="connection-note" id="ai-connection-status"><span />OPENAI BACKEND · 요청 시 연결 확인</div>
        <section className="selected-context">
          <p className="system-kicker">SELECTED CONTEXT</p><strong>{analysisContext.title}</strong><small>{analysisContext.meta}</small>
        </section>
        <div className="context-actions" aria-label="분석 컨텍스트">
          <button className={!capture ? "is-selected" : ""} type="button" aria-pressed={!capture}><MapTrifold size={18} />현재 화면</button>
          <button className={capture ? "is-selected" : ""} type="button" onClick={() => setCaptureOpen(true)} aria-pressed={Boolean(capture)}>
            <Selection size={18} />{capture ? "선택 영역 변경" : "영역 선택"}
          </button>
        </div>
        {captureOpen ? (
          <Suspense fallback={<div className="capture-stage">캡처 도구를 불러오는 중</div>}>
            <CaptureComposer onConfirm={confirmCapture} onCancel={() => setCaptureOpen(false)} />
          </Suspense>
        ) : null}
        {capture && !captureOpen ? (
          <section className="capture-attachment" aria-label="첨부할 화면 캡처">
            <img src={captureUrl} alt="분석에 첨부할 선택 영역" />
            <div><Camera size={16} /><span>{capture.width} × {capture.height}px · 전송 전</span></div>
            <button type="button" onClick={removeCapture}><Trash size={16} /> 제거</button>
          </section>
        ) : null}
        <div className="analysis-mode" aria-label="분석 강도">
          {Object.entries(MODE_COPY).map(([id, copy]) => (
            <button type="button" key={id} className={mode === id ? "is-selected" : ""} onClick={() => setMode(id)} aria-pressed={mode === id} disabled={requestState === "submitting"}>
              <strong>{copy.title}</strong><span>{copy.detail}</span>
            </button>
          ))}
        </div>
        <AgentRunPanel {...activity} />
        <form className="analysis-form" onSubmit={submit} aria-busy={requestState === "submitting"}>
          <label htmlFor="analysis-prompt">무엇을 분석할까요?</label>
          <textarea id="analysis-prompt" value={prompt} onChange={(eventObject) => setPrompt(eventObject.target.value)} maxLength={4000} placeholder={analysisContext.placeholder} />
          <button type="submit" className="analysis-submit" disabled={requestState === "submitting" || !prompt.trim()}>
            {requestState === "submitting" ? "분석 중…" : capture ? "이미지와 질문 분석" : "분석 요청"}<PaperPlaneTilt size={17} />
          </button>
        </form>
        {notice && <p className={`prototype-notice${requestState === "error" ? " is-error" : ""}`} role="status">{notice}</p>}
        {analysis && <AnalysisResult analysis={analysis} />}
      </aside>
    </div>
  );
}

export default AiDrawer;
