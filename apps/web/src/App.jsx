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

function BriefingPage({ events, selectedId, onSelect, onOpenIssues }) {
  return (
    <main className="focused-workspace briefing-workspace">
      <header className="workspace-heading">
        <div>
          <p className="system-kicker">DAILY INTELLIGENCE BRIEF · 21 AUG 2026</p>
          <h2>오늘 브리핑</h2>
          <p>한국을 중심으로 미국의 영향과 급격한 변화를 분리해 읽습니다.</p>
        </div>
        <span className="workspace-count">{events.length} SIGNALS · 33 SOURCES</span>
      </header>
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

function PassiveStatusBar({ domain }) {
  if (domain === "physics") {
    return (
      <footer className="system-status" aria-label="물리 데모 상태">
        <span>LIBRARY <strong>DEMO</strong></span><span>DEFAULT LEVEL <strong>P4</strong></span>
        <span>TRACK <strong>KPHO → IPHO</strong></span><span>OPEN LINKS <strong>6</strong></span>
        <span className="system-health">백엔드 미연결 <i aria-hidden="true" /> 프론트엔드 데모</span>
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

function AiDrawer({ analysisContext, onClose }) {
  const [context, setContext] = useState("현재 화면");
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => { closeButtonRef.current?.focus(); }, []);

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

  function submit(eventObject) {
    eventObject.preventDefault();
    setNotice("AI 백엔드는 아직 연결되지 않았습니다. 현재는 입력 흐름만 확인하는 프로토타입입니다.");
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
        <div className="connection-note" id="ai-connection-status"><span />AI 연결 전 · 상호작용 구조 확인용</div>
        <section className="selected-context">
          <p className="system-kicker">SELECTED CONTEXT</p><strong>{analysisContext.title}</strong>
          <small>{analysisContext.meta}</small>
        </section>
        <div className="context-actions" aria-label="분석 컨텍스트 선택">
          {[{ label: "현재 화면", icon: MapTrifold }, { label: "영역 선택", icon: Selection }].map(({ label, icon: Icon }) => (
            <button className={context === label ? "is-selected" : ""} type="button" key={label}
              onClick={() => setContext(label)} aria-pressed={context === label}><Icon size={18} />{label}</button>
          ))}
        </div>
        <form className="analysis-form" onSubmit={submit}>
          <label htmlFor="analysis-prompt">무엇을 분석할까요?</label>
          <textarea id="analysis-prompt" value={prompt} onChange={(eventObject) => setPrompt(eventObject.target.value)}
            maxLength={4000} placeholder={analysisContext.placeholder} />
          <button type="submit" className="analysis-submit">분석 요청<PaperPlaneTilt size={17} /></button>
        </form>
        {notice && <p className="prototype-notice" role="status">{notice}</p>}
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
  const [notice, setNotice] = useState("");
  const noticeTimerRef = useRef(null);
  const aiTriggerRef = useRef(null);
  const topSignals = useMemo(() => getTopSignals(EVENTS, 3), []);
  const selectedEvent = EVENTS.find((event) => event.id === selectedId) ?? EVENTS[0];
  const domain = domainFromRoute(route);

  const defaultAnalysisContext = useMemo(() => {
    if (domain === "physics") {
      return {
        title: "물리 학습 워크스페이스",
        meta: "물리 워크스페이스 · 데모 설명 수준 P4",
        placeholder: "개념과 수학적 구조를 분리해서 단계적으로 설명해줘.",
      };
    }
    return {
      title: selectedEvent.title,
      meta: `${selectedEvent.region} · ${selectedEvent.time} KST · 데모 자료`,
      placeholder: "확인된 사실과 추론을 구분해서, 한국에 미칠 영향을 분석해줘.",
    };
  }, [domain, selectedEvent]);

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
    setAnalysisContext(context);
    setAiOpen(true);
  }

  function closeAi() {
    setAiOpen(false);
    window.requestAnimationFrame(() => aiTriggerRef.current?.focus());
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
          <BriefingPage events={EVENTS} selectedId={selectedId} onSelect={setSelectedId} onOpenIssues={openIssues} />
        )}

        {route === "issues" && (
          <IssuesPage selectedEvent={selectedEvent} onSelect={setSelectedId} onOpenAi={() => openAi()} />
        )}

        {domain === "physics" && (
          <PhysicsWorkspace
            view={{ library: "library", finder: "finder", ipho: "ipho" }[route] ?? "learn"}
            onOpenAi={openAi}
            onNotice={showNotice}
          />
        )}

        <PassiveStatusBar domain={domain} />
      </div>
      <p className="sr-only" role="status" aria-live="polite">선택 사건: {selectedEvent.title}</p>
      {notice && <div className="domain-notice" role="status">{notice}</div>}
      {aiOpen && <AiDrawer analysisContext={analysisContext ?? defaultAnalysisContext} onClose={closeAi} />}
    </div>
  );
}
