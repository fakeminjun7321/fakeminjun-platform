import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CaretDown,
  ClockCounterClockwise,
  MagnifyingGlass,
  PaperPlaneTilt,
  Quotes,
  X,
} from "@phosphor-icons/react";
import {
  BackendApiError,
  backendClient,
  clearAnalysisAttempt,
  getAnalysisAttempt,
  shouldClearAnalysisAttempt,
} from "./backendClient.js";

const CONFIDENCE_LABELS = { high: "높음", medium: "중간", low: "낮음" };
const BASIS_LABELS = {
  "provided-evidence": "분석 근거 · 제공 맥락",
  "established-knowledge": "분석 근거 · 확립 지식",
  inference: "분석 근거 · 추론",
  uncertain: "분석 근거 · 불확실",
};

const MANDOS_PROFILES = [
  { mode: "standard", title: "Mandos 3 Swift", task: "요약·정리", trait: "빠른 응답" },
  { mode: "auto", title: "Mandos 3 Core", task: "상황·맥락", trait: "균형 추론" },
  { mode: "deep", title: "Mandos 3 Deep", task: "복합 쟁점", trait: "깊은 교차검토" },
];

const DOMAIN_LABELS = { international: "국제정세", physics: "물리" };

export function getMandosProfile(mode) {
  return MANDOS_PROFILES.find((profile) => profile.mode === mode) ?? MANDOS_PROFILES[1];
}

function AnalysisResult({ analysis, requestedMode }) {
  const result = analysis.result;
  if (!result) return null;
  const profile = getMandosProfile(analysis.requestedMode ?? analysis.mode ?? requestedMode);
  const evidenceById = new Map((analysis.evidence ?? []).map((item) => [item.evidenceId, item]));
  return (
    <article className="analysis-result" aria-labelledby="analysis-result-title">
      <header>
        <p className="analysis-model-label">{profile.title}</p>
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
        <strong>Mandos가 밝힌 근거 범위 · 별도 확인 필요</strong><p>{result.sourceBoundary}</p>
      </section>
      {result.citations?.length ? (
        <section className="analysis-citations" aria-label="분석 근거">
          <strong><Quotes size={16} /> 근거 ID 검증</strong>
          <ol>{result.citations.map((citation, index) => {
            const evidence = evidenceById.get(citation.evidenceId);
            const locator = evidence?.snapshot?.locator;
            const content = <><b>{citation.claim}</b><span>{citation.locator} · {citation.support}</span><small>{citation.evidenceId}</small></>;
            return <li key={`${citation.evidenceId}-${index}`}>{typeof locator === "string" && locator.startsWith("https://")
              ? <a href={locator} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{content}</a>
              : <div>{content}</div>}</li>;
          })}</ol>
          <p>표시된 근거가 이번 분석 자료에 포함됐는지 확인했습니다. 내용의 사실 여부는 별도 검토가 필요합니다.</p>
        </section>
      ) : null}
      {result.uncertainties?.length ? (
        <section className="analysis-list"><strong>불확실성</strong><ul>{result.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul></section>
      ) : null}
      {result.nextQuestions?.length ? (
        <section className="analysis-list"><strong>다음 질문</strong><ul>{result.nextQuestions.map((item) => <li key={item}>{item}</li>)}</ul></section>
      ) : null}
      <footer>
        <span>{profile.title}</span>
        <span>{profile.task} · {profile.trait}</span>
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

export function AiDrawer({ analysisContext, onClose, pinned = false }) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("auto");
  const [requestState, setRequestState] = useState("idle");
  const [analysis, setAnalysis] = useState(null);
  const [notice, setNotice] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyState, setHistoryState] = useState({ status: "loading", items: [], message: "분석 기록을 불러오는 중" });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const drawerRef = useRef(null);
  const requestRef = useRef(null);
  const historyRef = useRef(null);
  const selectedProfile = getMandosProfile(mode);

  useEffect(() => { if (!pinned) drawerRef.current?.focus(); }, [pinned]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => () => historyRef.current?.abort(), []);

  async function loadHistory(query = "") {
    const controller = new AbortController();
    historyRef.current?.abort();
    historyRef.current = controller;
    setHistoryState((current) => ({ ...current, status: "loading", message: "분석 기록을 불러오는 중" }));
    try {
      const response = await backendClient.listAnalyses({ domain: analysisContext.domain, query, limit: 8, signal: controller.signal });
      setHistoryState({ status: "ready", items: response.data ?? [], message: "" });
    } catch (error) {
      if (error?.name !== "AbortError") setHistoryState((current) => ({ ...current, status: "error", message: "이전 분석을 불러오지 못했습니다." }));
    } finally {
      if (historyRef.current === controller) historyRef.current = null;
    }
  }

  useEffect(() => { void loadHistory(); }, [analysisContext.domain]);

  async function openHistoryItem(item) {
    const controller = new AbortController();
    historyRef.current?.abort();
    historyRef.current = controller;
    try {
      const loaded = await backendClient.getAnalysis(item.id, { signal: controller.signal });
      setAnalysis(loaded);
      setMode(loaded.mode ?? "auto");
      setHistoryOpen(false);
      setRequestState(loaded.status === "completed" ? "success" : loaded.status === "failed" ? "error" : "submitting");
      setNotice("저장된 분석 기록을 열었습니다.");
    } catch (error) {
      if (error?.name !== "AbortError") setNotice("분석 기록을 열지 못했습니다. 잠시 후 다시 확인해 주세요.");
    } finally {
      if (historyRef.current === controller) historyRef.current = null;
    }
  }

  function handleKeyDown(eventObject) {
    if (eventObject.key === "Escape") {
      if (modelMenuOpen) {
        eventObject.preventDefault();
        setModelMenuOpen(false);
      } else if (historyOpen) {
        eventObject.preventDefault();
        setHistoryOpen(false);
      } else if (!pinned) {
        eventObject.preventDefault();
        onClose();
      }
      return;
    }
    if (pinned) return;
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

  function updatePrompt(eventObject) {
    const input = eventObject.currentTarget;
    setPrompt(input.value);
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
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
    setNotice(`${selectedProfile.title}가 질문을 분석하고 있습니다.`);
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
      if (analysisContext.contextKind === "physics-file" && analysisContext.contextId) {
        attempt = await getAnalysisAttempt(payload);
        clearAttempt = clearAnalysisAttempt;
        created = await backendClient.createPhysicsFileAnalysis(analysisContext.contextId, payload, {
          signal: controller.signal,
          idempotencyKey: attempt.idempotencyKey,
        });
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
      setNotice("Mandos 분석이 완료되었습니다.");
      void loadHistory(historyQuery.trim());
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (attempt && shouldClearAnalysisAttempt(error, { hasCreatedAnalysis: Boolean(createdAnalysisId) })) {
        clearAttempt?.(attempt.fingerprint);
      }
      setRequestState("error");
      setNotice("분석 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  return (
    <div className={`drawer-layer${pinned ? " is-pinned" : ""}`} role="presentation">
      {!pinned ? <button className="drawer-scrim" type="button" onClick={onClose} tabIndex={-1} aria-hidden="true" /> : null}
      <aside
        className="ai-drawer" id="ai-analysis-drawer" ref={drawerRef} role={pinned ? "complementary" : "dialog"} aria-modal={pinned ? undefined : "true"}
        aria-labelledby="ai-analysis-title" aria-describedby="mandos-context-meta" onKeyDown={handleKeyDown} tabIndex={-1}
      >
        <div className="drawer-heading">
          <h2 id="ai-analysis-title">MANDOS</h2>
          <div>
            <button
              className="icon-button" type="button" onClick={() => { setHistoryOpen((current) => !current); setModelMenuOpen(false); }}
              aria-label="이전 분석 열기" aria-expanded={historyOpen} aria-controls="mandos-history-panel"
            ><ClockCounterClockwise size={21} /></button>
            {!pinned ? <button className="icon-button" type="button" onClick={onClose} aria-label="Mandos 패널 닫기"><X size={22} /></button> : null}
          </div>
        </div>
        <div className="mandos-conversation">
          <section className="selected-context">
            <strong>{analysisContext.title}</strong><small id="mandos-context-meta">{analysisContext.meta}</small>
          </section>
          {historyOpen ? <section className="analysis-history" id="mandos-history-panel" aria-label="이전 분석">
            <header><strong>이전 분석</strong><span>{historyState.items.length}</span></header>
            <form onSubmit={(eventObject) => { eventObject.preventDefault(); void loadHistory(historyQuery.trim()); }}>
              <label><MagnifyingGlass size={15} /><span className="sr-only">이전 분석 검색</span><input value={historyQuery} onChange={(eventObject) => setHistoryQuery(eventObject.target.value)} maxLength={160} placeholder="질문·결과 검색" /></label>
              <button type="submit" disabled={historyState.status === "loading"}>검색</button>
            </form>
            {historyState.message ? <p>{historyState.message}</p> : null}
            <ol>{historyState.items.map((item) => {
              const itemProfile = getMandosProfile(item.requestedMode ?? item.mode);
              return (
                <li key={item.id}><button type="button" onClick={() => void openHistoryItem(item)}>
                  <span>{DOMAIN_LABELS[item.domain] ?? "분석"} · {itemProfile.title}</span><strong>{item.result?.headline ?? item.prompt}</strong><small>{new Date(item.createdAt).toLocaleString("ko-KR")}</small><ArrowRight size={14} />
                </button></li>
              );
            })}</ol>
          </section> : null}
          {notice && <p className={`prototype-notice${requestState === "error" ? " is-error" : ""}`} role="status">{notice}</p>}
          {analysis && <AnalysisResult analysis={analysis} requestedMode={mode} />}
        </div>
        <form className="analysis-form" onSubmit={submit} aria-busy={requestState === "submitting"}>
          <label className="sr-only" htmlFor="analysis-prompt">Mandos에게 질문</label>
          <textarea
            id="analysis-prompt" value={prompt} onChange={updatePrompt} maxLength={4000}
            placeholder={analysisContext.placeholder} rows={2}
          />
          <div className="composer-toolbar">
            <div className="mandos-mode-picker">
              <button
                className="mandos-mode-trigger" type="button" onClick={() => { setModelMenuOpen((current) => !current); setHistoryOpen(false); }}
                aria-expanded={modelMenuOpen} aria-haspopup="menu" disabled={requestState === "submitting"}
              >
                <span><strong>{selectedProfile.title}</strong><small>{selectedProfile.task} · {selectedProfile.trait}</small></span>
                <CaretDown size={14} aria-hidden="true" />
              </button>
              {modelMenuOpen ? <div className="mandos-mode-menu" role="menu" aria-label="Mandos 모델 선택">
                {MANDOS_PROFILES.map((profile) => (
                  <button
                    type="button" role="menuitemradio" aria-checked={mode === profile.mode} key={profile.mode}
                    className={mode === profile.mode ? "is-selected" : ""}
                    onClick={() => { setMode(profile.mode); setModelMenuOpen(false); }}
                  ><strong>{profile.title}</strong><span>{profile.task} · {profile.trait}</span></button>
                ))}
              </div> : null}
            </div>
            <button
              type="submit" className="analysis-submit" disabled={requestState === "submitting" || !prompt.trim()}
              aria-label={requestState === "submitting" ? "Mandos가 분석 중" : "Mandos에게 요청"}
            ><PaperPlaneTilt size={20} /></button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export default AiDrawer;
