import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Brain,
  CaretDown,
  CaretUp,
  Database,
  MapTrifold,
  PaperPlaneTilt,
  Selection,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { EVENTS } from "./events.js";
import {
  BackendApiError,
  backendClient,
  clearAnalysisAttempt,
  getAnalysisAttempt,
  shouldClearAnalysisAttempt,
} from "./backendClient.js";
import { CATEGORY_META, STATUS_META, getTopSignals } from "./mapLayers.js";
import { PhysicsWorkspace } from "./PhysicsWorkspace.jsx";
import { WorldSituationMap } from "./WorldSituationMap.jsx";

const ROUTES = {
  map: "/international/map",
  briefing: "/international/briefing",
  issues: "/international/issues",
  physics: "/physics/learn",
  library: "/physics/library",
  finder: "/physics/find",
  ipho: "/physics/ipho",
};

const DOMAIN_ROUTES = {
  international: ["map", "briefing", "issues"],
  physics: ["physics", "library", "finder", "ipho"],
};

const DOMAIN_META = {
  international: { label: "국제정세", title: "국제정세 분석 워크스페이스", entry: "map" },
  physics: { label: "물리", title: "물리 학습 워크스페이스", entry: "physics" },
};

const SUBNAV_ITEMS = {
  international: [
    { id: "map", label: "상황지도" },
    { id: "briefing", label: "오늘 브리핑" },
    { id: "issues", label: "이슈 추적" },
  ],
  physics: [
    { id: "physics", label: "학습 허브" },
    { id: "library", label: "자료 보관소" },
    { id: "finder", label: "자료 찾기" },
    { id: "ipho", label: "KPhO · IPhO" },
  ],
};

const TRACKED_ISSUES = [
  {
    id: "supply-chain",
    code: "ISSUE-KRUS-01",
    title: "한미 핵심 산업·공급망",
    summary: "핵심 광물, 배터리, 해상 교역로를 하나의 장기 산업안보 이슈로 추적합니다.",
    eventIds: [1, 5],
  },
  {
    id: "us-monetary-policy",
    code: "ISSUE-US-02",
    title: "미국 통화정책과 한국 시장",
    summary: "연준 커뮤니케이션이 환율·수입물가·자금 흐름에 전파되는 과정을 추적합니다.",
    eventIds: [2],
  },
  {
    id: "middle-east-security",
    code: "ISSUE-ME-03",
    title: "중동 휴전 체제와 해상안보",
    summary: "휴전 감시와 홍해 운항 위험을 에너지·물류·체류자 안전 관점에서 함께 봅니다.",
    eventIds: [3, 6],
  },
  {
    id: "europe-energy",
    code: "ISSUE-EU-04",
    title: "유럽 에너지와 LNG 시장",
    summary: "유럽 공동구매와 저장 정책이 아시아 LNG 가격에 미치는 파급을 추적합니다.",
    eventIds: [4],
  },
];

function routeFromPath(pathname) {
  return Object.entries(ROUTES).find(([, path]) => pathname === path)?.[0] ?? "map";
}

function domainFromRoute(route) {
  return Object.entries(DOMAIN_ROUTES).find(([, routes]) => routes.includes(route))?.[0] ?? "international";
}

function DomainNavigation({ domain, onNavigate }) {
  return (
    <nav className="domain-navigation" aria-label="분야 이동">
      {Object.entries(DOMAIN_META).map(([id, metadata]) => (
        <button
          className={`domain-tab${domain === id ? " is-active" : ""}`}
          type="button"
          key={id}
          aria-current={domain === id ? "page" : undefined}
          onClick={() => onNavigate(metadata.entry)}
        >
          {metadata.label}
        </button>
      ))}
    </nav>
  );
}

function Header({ domain, onOpenAi, onNavigate, aiOpen, aiTriggerRef }) {
  return (
    <header className="app-header">
      <button
        className="brand-lockup"
        type="button"
        onClick={() => onNavigate("map")}
        aria-label="국제정세 상황지도 홈"
      >
        <span>INTEL WORKSPACE</span>
      </button>
      <h1 className="sr-only">{DOMAIN_META[domain].title}</h1>
      <DomainNavigation domain={domain} onNavigate={onNavigate} />
      <div className="header-utilities">
        <span className="as-of">기준 시각 <strong>20:04 KST</strong></span>
        <span className="demo-stamp">NON-LIVE DEMO</span>
        <button
          className="ai-trigger"
          type="button"
          onClick={onOpenAi}
          ref={aiTriggerRef}
          aria-haspopup="dialog"
          aria-expanded={aiOpen}
          aria-controls="ai-analysis-drawer"
        >
          <Brain size={19} weight="duotone" aria-hidden="true" />
          AI 분석 열기
        </button>
      </div>
    </header>
  );
}

function WorkspaceSubnav({ domain, route, onNavigate }) {
  return (
    <nav className="international-subnav" aria-label={`${DOMAIN_META[domain].label} 작업 화면`}>
      {SUBNAV_ITEMS[domain].map((item) => (
        <a
          className={route === item.id ? "is-active" : ""}
          href={ROUTES[item.id]}
          key={item.id}
          aria-current={route === item.id ? "page" : undefined}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onNavigate(item.id);
          }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function SignalRow({ event, selected, onSelect }) {
  const category = CATEGORY_META[event.category];
  const status = STATUS_META[event.status];

  return (
    <button
      className={`signal-row category-${event.category}${selected ? " is-selected" : ""}`}
      type="button"
      onClick={() => onSelect(event.id)}
      aria-pressed={selected}
    >
      <span className="signal-primary-meta">
        <span className="signal-category"><i aria-hidden="true" />{category.label}</span>
        <time dateTime={event.dateTime}>{event.time}</time>
        <span>{event.region}</span>
      </span>
      <strong>{event.title}</strong>
      <span className="signal-evidence">
        출처 {event.sources}<span aria-hidden="true">·</span>합치도 {event.agreement}%<span aria-hidden="true">·</span>{status.label}
      </span>
      <span className="agreement-track" aria-hidden="true"><span style={{ width: `${event.agreement}%` }} /></span>
    </button>
  );
}

function TodaySignalsPanel({ events, selectedId, onSelect, onOpenBriefing }) {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 600px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const handleChange = (event) => { if (event.matches) setCollapsed(true); };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return (
    <aside className={`signals-panel${collapsed ? " is-collapsed" : ""}`} aria-label="주요 신호">
      <div className="signals-heading">
        <div><p className="system-kicker">INTELLIGENCE QUEUE</p><h2>주요 신호</h2></div>
        <button
          className="panel-toggle"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
        >
          {collapsed ? "펼치기" : "접기"}
          {collapsed ? <CaretDown size={15} /> : <CaretUp size={15} />}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="signal-list">
            {events.map((event) => (
              <SignalRow event={event} key={event.id} selected={event.id === selectedId} onSelect={onSelect} />
            ))}
          </div>
          <button className="panel-link" type="button" onClick={onOpenBriefing}>
            오늘 브리핑 전체 보기 <ArrowRight size={16} aria-hidden="true" />
          </button>
        </>
      )}
    </aside>
  );
}

const SOURCE_LANE_LABELS = {
  "korea-core": "한국 공식",
  "us-impact": "미국 공식",
  "rapid-change": "국제안보 관측",
};

const COLLECTION_STATUS_LABELS = {
  current: "CURRENT",
  stale: "STALE",
  degraded: "DEGRADED",
  "not-collected": "NOT COLLECTED",
  unknown: "UNKNOWN",
};

function briefingDateLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date()).toUpperCase();
}

function sourceTimestamp(value) {
  if (!value) return "발행 시각 없음";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "발행 시각 없음";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.month}.${values.day} · ${values.hour}:${values.minute}`;
}

function SourceInbox({ state }) {
  return (
    <section className="source-inbox" aria-labelledby="source-inbox-title">
      <header>
        <div>
          <p className="system-kicker">OFFICIAL SOURCE INBOX</p>
          <h3 id="source-inbox-title">공식 출처 수집함</h3>
        </div>
        <div className="source-boundary" aria-label="자료 상태">
          <span>실제 수집</span><span>미검증 자료</span><span>사건·지도 미반영</span>
        </div>
      </header>
      {state.status === "loading" && <p className="source-empty">공식 피드 수집 자료를 확인 중입니다.</p>}
      {state.status === "error" && (
        <p className="source-empty is-error">
          수집 자료 API에 연결하지 못했습니다. {state.items.length ? "이전 성공 자료를 표시하며 최신성은 확인되지 않았습니다." : "데모 신호로 대체하지 않고 빈 상태로 둡니다."}
        </p>
      )}
      {state.status === "ready" && state.items.length === 0 && (
        <p className="source-empty">아직 저장된 공식 출처 자료가 없습니다. 수집 실행 후 이곳에 표시됩니다.</p>
      )}
      {state.items.length > 0 && (
        <ol className="source-item-list">
          {state.items.map((item) => (
            <li key={`${item.source.key}-${item.providerItemId}`}>
              <div className="source-item-meta">
                <span className={`source-lane lane-${item.lane}`}>{SOURCE_LANE_LABELS[item.lane] ?? item.lane}</span>
                <span>{item.source.name}</span>
                <time dateTime={item.publishedAt ?? item.collectedAt}>{sourceTimestamp(item.publishedAt)}</time>
              </div>
              <a href={item.originalUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                {item.title}<ArrowRight size={14} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BriefingPage({ events, selectedId, onSelect, onOpenIssues, sourceState }) {
  return (
    <main className="focused-workspace briefing-workspace">
      <header className="workspace-heading">
        <div>
          <p className="system-kicker">DAILY INTELLIGENCE BRIEF · {briefingDateLabel()}</p>
          <h2>오늘 브리핑</h2>
          <p>한국을 중심으로 미국의 영향과 급격한 변화를 분리해 읽습니다.</p>
        </div>
        <span className="workspace-count">{events.length} DEMO SIGNALS</span>
      </header>
      <SourceInbox state={sourceState} />
      <div className="briefing-section-label">
        <div><p className="system-kicker">ANALYSIS PROTOTYPE</p><h3>분석용 데모 신호</h3></div>
        <span>NON-LIVE DEMO</span>
      </div>
      <div className="briefing-feed">
        {events.map((event) => {
          const category = CATEGORY_META[event.category];
          const status = STATUS_META[event.status];
          return (
            <article className={`briefing-item${event.id === selectedId ? " is-selected" : ""}`} key={event.id}>
              <button type="button" onClick={() => onSelect(event.id)} aria-pressed={event.id === selectedId}>
                <span className="briefing-rank">{String(event.signalRank).padStart(2, "0")}</span>
                <span className="briefing-copy">
                  <span className="briefing-meta">
                    <strong>{category.label}</strong><time dateTime={event.dateTime}>{event.time} KST</time>
                    <span>{event.region}</span><span>출처 {event.sources}</span><span>{status.label}</span>
                  </span>
                  <strong>{event.title}</strong><span>{event.summary}</span>
                </span>
              </button>
              <button className="text-action" type="button" onClick={() => onOpenIssues(event.id)}>
                이슈 추적에서 보기 <ArrowRight size={14} />
              </button>
            </article>
          );
        })}
      </div>
    </main>
  );
}

function IssuesPage({ selectedEvent, onSelect, onOpenAi }) {
  const activeIssue = TRACKED_ISSUES.find((issue) => issue.eventIds.includes(selectedEvent.id)) ?? TRACKED_ISSUES[0];
  const issueEvents = activeIssue.eventIds
    .map((eventId) => EVENTS.find((event) => event.id === eventId))
    .filter(Boolean);

  return (
    <main className="focused-workspace issues-workspace">
      <aside className="issue-index" aria-label="추적 중인 이슈">
        <p className="system-kicker">TRACKED ISSUES</p><h2>이슈 추적</h2>
        <span className="issue-scroll-hint">좌우로 탐색 · {TRACKED_ISSUES.length}개</span>
        <div>
          {TRACKED_ISSUES.map((issue) => (
            <button
              type="button"
              key={issue.id}
              className={issue.id === activeIssue.id ? "is-selected" : ""}
              onClick={() => onSelect(issue.eventIds[0])}
              aria-pressed={issue.id === activeIssue.id}
            >
              <span>{issue.code.slice(-2)}</span><strong>{issue.title}</strong>
              <small>{issue.eventIds.length}개 변화 · 최근 {EVENTS.find((event) => event.id === issue.eventIds[0]).time} KST</small>
            </button>
          ))}
        </div>
      </aside>
      <article className="issue-dossier">
        <header>
          <p className="system-kicker">{activeIssue.code} · 장기 추적</p>
          <h2>{activeIssue.title}</h2><p>{activeIssue.summary}</p>
          <div className="dossier-meta">
            <span><Database size={15} /> 출처 {selectedEvent.sources}</span>
            <span><ShieldCheck size={15} /> 합치도 {selectedEvent.agreement}%</span>
            <span>{STATUS_META[selectedEvent.status].label}</span>
          </div>
        </header>
        <section className="issue-history" aria-labelledby="issue-history-title">
          <div>
            <p className="system-kicker">CHANGE LOG</p>
            <h3 id="issue-history-title">누적 변화</h3>
            <span>{issueEvents.length}개 기록</span>
          </div>
          <ol>
            {issueEvents.map((event) => (
              <li key={event.id}>
                <button type="button" onClick={() => onSelect(event.id)} aria-pressed={event.id === selectedEvent.id}>
                  <time dateTime={event.dateTime}>{event.time} KST</time>
                  <strong>{event.title}</strong>
                  <span>{event.summary}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <div className="evidence-grid">
          <section><p className="system-kicker">확인된 사실</p><ul>{selectedEvent.facts.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><p className="system-kicker">불확실한 부분</p><ul>{selectedEvent.disputed.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><p className="system-kicker">한국 영향</p><ul>{selectedEvent.relevance.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </div>
        <footer className="watch-condition">
          <span>다음 관찰 조건</span><strong>{selectedEvent.disputed[0]}</strong>
          <button type="button" onClick={onOpenAi}><Brain size={17} /> AI로 추가 분석</button>
        </footer>
      </article>
    </main>
  );
}

function PassiveStatusBar({ domain, route, sourceState }) {
  if (domain === "physics") {
    return (
      <footer className="system-status" aria-label="물리 데모 상태">
        <span>LIBRARY <strong>DEMO</strong></span><span>DEFAULT LEVEL <strong>P4</strong></span>
        <span>TRACK <strong>KPHO → IPHO</strong></span><span>OPEN LINKS <strong>6</strong></span>
        <span className="system-health">OpenAI 분석 API <i aria-hidden="true" /> 개발 환경</span>
      </footer>
    );
  }
  if (route === "briefing") {
    return (
      <footer className="system-status" aria-label="수집 자료 상태">
        <span>SOURCE INBOX <strong>{sourceState.status === "ready" ? COLLECTION_STATUS_LABELS[sourceState.collectionStatus] : sourceState.status.toUpperCase()}</strong></span>
        <span>VISIBLE ITEMS <strong>{sourceState.items.length}</strong></span>
        <span>VERIFICATION <strong>UNVERIFIED</strong></span><span>EVENT PROMOTION <strong>OFF</strong></span>
        <span className="system-health"><i aria-hidden="true" /> 공식 출처 메타데이터</span>
      </footer>
    );
  }
  return (
    <footer className="system-status" aria-label="데이터 상태">
      <span>DATASET <strong>DEMO</strong></span><span>VISIBLE SIGNALS <strong>6</strong></span>
      <span>SOURCES <strong>33</strong></span><span>PROJECTION <strong>WEB MERCATOR</strong></span>
      <span className="system-health">마지막 확인 20:04 KST <i aria-hidden="true" /> 시스템 정상</span>
    </footer>
  );
}

const CONFIDENCE_LABELS = { high: "높음", medium: "중간", low: "낮음" };
const BASIS_LABELS = {
  "provided-evidence": "모델 분류 · 제공 맥락",
  "established-knowledge": "모델 분류 · 확립 지식",
  inference: "모델 분류 · 추론",
  uncertain: "모델 분류 · 불확실",
};

function AnalysisResult({ analysis }) {
  const result = analysis.result;
  if (!result) return null;
  return (
    <article className="analysis-result" aria-labelledby="analysis-result-title">
      <header>
        <p className="system-kicker">STRUCTURED ANALYSIS · {analysis.mode === "deep" ? "DEEP" : "STANDARD"}</p>
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

async function resolvePendingAnalysis(initial, signal) {
  let current = initial;
  for (let attempt = 0; current?.status === "pending" && attempt < 45; attempt += 1) {
    await waitForPoll(2000, signal);
    current = await backendClient.getAnalysis(current.id, { signal });
  }
  return current;
}

function AiDrawer({ analysisContext, onClose }) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("standard");
  const [requestState, setRequestState] = useState("idle");
  const [analysis, setAnalysis] = useState(null);
  const [notice, setNotice] = useState("");
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => { closeButtonRef.current?.focus(); }, []);
  useEffect(() => () => requestRef.current?.abort(), []);

  function handleKeyDown(eventObject) {
    if (eventObject.key === "Escape") { eventObject.preventDefault(); onClose(); return; }
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
    setNotice("");
    setAnalysis(null);
    const payload = {
      domain: analysisContext.domain,
      mode,
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
    let createdAnalysisId = null;
    try {
      attempt = await getAnalysisAttempt(payload);
      const created = await backendClient.createAnalysis(payload, {
        signal: controller.signal,
        idempotencyKey: attempt.idempotencyKey,
      });
      createdAnalysisId = created?.id ?? null;
      const completed = await resolvePendingAnalysis(created, controller.signal);
      if (completed?.status === "pending") {
        throw new Error("분석이 아직 진행 중입니다. 잠시 후 같은 질문으로 다시 확인하세요.");
      }
      if (completed?.status === "failed") {
        clearAnalysisAttempt(attempt.fingerprint);
        throw new BackendApiError(502, completed.errorCode ?? "analysis_failed", "이전 분석 요청이 완료되지 않았습니다. 다시 시도하세요.");
      }
      clearAnalysisAttempt(attempt.fingerprint);
      setAnalysis(completed);
      setRequestState("success");
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (attempt && shouldClearAnalysisAttempt(error, { hasCreatedAnalysis: Boolean(createdAnalysisId) })) {
        clearAnalysisAttempt(attempt.fingerprint);
      }
      setRequestState("error");
      setNotice(error?.message ?? "분석 요청을 처리하지 못했습니다.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

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
          <p className="system-kicker">SELECTED CONTEXT</p><strong>{analysisContext.title}</strong>
          <small>{analysisContext.meta}</small>
        </section>
        <div className="context-actions" aria-label="분석 컨텍스트">
          <button className="is-selected" type="button" aria-pressed="true"><MapTrifold size={18} />현재 화면</button>
          <button type="button" disabled title="내장 영역 캡처 구현 후 활성화됩니다."><Selection size={18} />영역 선택 · 준비 중</button>
        </div>
        <div className="analysis-mode" aria-label="분석 강도">
          <button type="button" className={mode === "standard" ? "is-selected" : ""} onClick={() => setMode("standard")} aria-pressed={mode === "standard"} disabled={requestState === "submitting"}>
            <strong>일반 분석</strong><span>Luna · 빠르고 저렴한 단일 분석</span>
          </button>
          <button type="button" className={mode === "deep" ? "is-selected" : ""} onClick={() => setMode("deep")} aria-pressed={mode === "deep"} disabled={requestState === "submitting"}>
            <strong>정밀 분석</strong><span>전문 검토 2회 + Sol 최종 통합</span>
          </button>
        </div>
        <form className="analysis-form" onSubmit={submit} aria-busy={requestState === "submitting"}>
          <label htmlFor="analysis-prompt">무엇을 분석할까요?</label>
          <textarea id="analysis-prompt" value={prompt} onChange={(eventObject) => setPrompt(eventObject.target.value)}
            maxLength={4000} placeholder={analysisContext.placeholder} />
          <button type="submit" className="analysis-submit" disabled={requestState === "submitting" || !prompt.trim()}>
            {requestState === "submitting" ? "분석 중…" : "분석 요청"}<PaperPlaneTilt size={17} />
          </button>
        </form>
        {notice && <p className={`prototype-notice${requestState === "error" ? " is-error" : ""}`} role="status">{notice}</p>}
        {analysis && <AnalysisResult analysis={analysis} />}
      </aside>
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));
  const [selectedId, setSelectedId] = useState(() => (
    routeFromPath(window.location.pathname) === "map" && !window.matchMedia("(max-width: 600px)").matches ? 1 : null
  ));
  const [aiOpen, setAiOpen] = useState(false);
  const [analysisContext, setAnalysisContext] = useState(null);
  const [physicsLevel, setPhysicsLevel] = useState(4);
  const [notice, setNotice] = useState("");
  const [sourceState, setSourceState] = useState({ status: "idle", items: [], collectionStatus: "unknown" });
  const noticeTimerRef = useRef(null);
  const aiTriggerRef = useRef(null);
  const aiOpenerRef = useRef(null);
  const topSignals = useMemo(() => getTopSignals(EVENTS, 3), []);
  const selectedEvent = EVENTS.find((event) => event.id === selectedId) ?? EVENTS[0];
  const domain = domainFromRoute(route);

  const defaultAnalysisContext = useMemo(() => {
    if (domain === "physics") {
      return {
        domain: "physics",
        level: `P${physicsLevel}`,
        contextKind: "physics-workspace",
        contextId: "current",
        title: "물리 학습 워크스페이스",
        meta: `물리 워크스페이스 · 설명 수준 P${physicsLevel}`,
        placeholder: "개념과 수학적 구조를 분리해서 단계적으로 설명해줘.",
      };
    }
    return {
      domain: "international",
      level: "I2",
      eventId: selectedEvent.id,
      contextKind: "event",
      contextId: String(selectedEvent.id),
      title: selectedEvent.title,
      meta: `${selectedEvent.region} · ${selectedEvent.time} KST · 데모 자료`,
      placeholder: "확인된 사실과 추론을 구분해서, 한국에 미칠 영향을 분석해줘.",
    };
  }, [domain, physicsLevel, selectedEvent]);

  useEffect(() => {
    const syncRouteToPath = () => {
      const nextRoute = routeFromPath(window.location.pathname);
      const canonicalPath = ROUTES[nextRoute];
      if (window.location.pathname !== canonicalPath) window.history.replaceState({}, "", canonicalPath);
      setRoute(nextRoute);
    };
    syncRouteToPath();
    const handlePopState = () => syncRouteToPath();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);
  useEffect(() => {
    if (route !== "briefing") return undefined;
    const controller = new AbortController();
    setSourceState((current) => ({ ...current, status: "loading" }));
    Promise.all([
      backendClient.listSourceItems({ lanes: ["korea-core"], limit: 4, signal: controller.signal }),
      backendClient.listSourceItems({ lanes: ["us-impact"], limit: 4, signal: controller.signal }),
      backendClient.listSourceItems({ lanes: ["rapid-change"], limit: 4, signal: controller.signal }),
    ])
      .then((groups) => {
        const statuses = groups.map(({ meta }) => meta.collectionStatus ?? "unknown");
        const collectionStatus = statuses.includes("degraded") ? "degraded"
          : statuses.includes("not-collected") ? "not-collected"
            : statuses.includes("stale") ? "stale"
              : statuses.every((status) => status === "current") ? "current" : "unknown";
        setSourceState({ status: "ready", items: groups.flatMap(({ data }) => data), collectionStatus });
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setSourceState((current) => ({ ...current, status: "error", collectionStatus: "unknown" }));
      });
    return () => controller.abort();
  }, [route]);

  function navigate(nextRoute) {
    const path = ROUTES[nextRoute];
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setRoute(nextRoute);
  }

  function openIssues(id = selectedId) { setSelectedId(id); navigate("issues"); }

  function showNotice(message) {
    window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2800);
  }

  function openAi(context = defaultAnalysisContext) {
    aiOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : aiTriggerRef.current;
    setAnalysisContext({ domain, ...context });
    setAiOpen(true);
  }

  function closeAi() {
    setAiOpen(false);
    window.requestAnimationFrame(() => (aiOpenerRef.current ?? aiTriggerRef.current)?.focus());
  }

  return (
    <div className="application-shell">
      <div className="app-surface" inert={aiOpen ? true : undefined}>
        <Header domain={domain} onOpenAi={() => openAi()} onNavigate={navigate} aiOpen={aiOpen} aiTriggerRef={aiTriggerRef} />
        <WorkspaceSubnav domain={domain} route={route} onNavigate={navigate} />

        {route === "map" && (
          <main className="situation-map-page">
            <WorldSituationMap events={EVENTS} selectedEvent={selectedEvent} selectionActive={selectedId !== null} onSelect={setSelectedId}
              onOpenIssues={() => openIssues(selectedEvent.id)} onOpenAi={() => openAi()} />
            <TodaySignalsPanel events={topSignals} selectedId={selectedId} onSelect={setSelectedId}
              onOpenBriefing={() => navigate("briefing")} />
          </main>
        )}

        {route === "briefing" && (
          <BriefingPage
            events={EVENTS}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpenIssues={openIssues}
            sourceState={sourceState}
          />
        )}

        {route === "issues" && (
          <IssuesPage selectedEvent={selectedEvent} onSelect={setSelectedId} onOpenAi={() => openAi()} />
        )}

        {domain === "physics" && (
          <PhysicsWorkspace
            view={{ library: "library", finder: "finder", ipho: "ipho" }[route] ?? "learn"}
            onOpenAi={openAi}
            onNotice={showNotice}
            level={physicsLevel}
            onLevelChange={setPhysicsLevel}
          />
        )}

        <PassiveStatusBar domain={domain} route={route} sourceState={sourceState} />
      </div>
      <p className="sr-only" role="status" aria-live="polite">선택 사건: {selectedEvent.title}</p>
      {notice && <div className="domain-notice" role="status">{notice}</div>}
      {aiOpen && <AiDrawer analysisContext={analysisContext ?? defaultAnalysisContext} onClose={closeAi} />}
    </div>
  );
}
