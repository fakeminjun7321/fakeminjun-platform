import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Compass,
  MagnifyingGlass,
  MapTrifold,
  PaperPlaneTilt,
  Selection,
  Sparkle,
  Triangle,
  X,
} from "@phosphor-icons/react";
import { EVENTS, filterEvents } from "./events.js";
import { WorldSituationMap } from "./WorldSituationMap.jsx";

const TIMELINE_START = Date.parse("2026-08-21T00:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;

function getTimelinePosition(dateTime) {
  const position = ((Date.parse(dateTime) - TIMELINE_START) / DAY_MS) * 100;
  return Math.min(100, Math.max(0, position));
}

function DomainNavigation({ onUnavailable }) {
  return (
    <nav className="domain-navigation" aria-label="분야 이동">
      <button className="domain-tab is-active" type="button" aria-current="page">
        국제정세
      </button>
      <button className="domain-tab" type="button" onClick={() => onUnavailable("정치")}>
        정치
      </button>
      <button className="domain-tab" type="button" onClick={() => onUnavailable("물리")}>
        물리
      </button>
    </nav>
  );
}

function Header({ query, onQueryChange, onOpenAi, onUnavailable, aiOpen, aiTriggerRef, aiAvailable }) {
  return (
    <header className="app-header">
      <button
        className="project-mark"
        type="button"
        onClick={() => onUnavailable("홈")}
        aria-label="홈 — 프로젝트명 미정"
      >
        <Compass size={24} weight="light" />
      </button>
      <h1 className="sr-only">국제정세 분석 상황실</h1>
      <DomainNavigation onUnavailable={onUnavailable} />
      <label className="search-field">
        <MagnifyingGlass size={18} weight="regular" aria-hidden="true" />
        <span className="sr-only">사건, 지역 또는 주제 검색</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="사건, 지역, 주제 검색"
        />
      </label>
      <button
        className="ai-trigger"
        type="button"
        onClick={onOpenAi}
        ref={aiTriggerRef}
        aria-haspopup="dialog"
        aria-expanded={aiOpen}
        aria-controls="ai-analysis-drawer"
        disabled={!aiAvailable}
      >
        <Sparkle size={19} weight="light" aria-hidden="true" />
        AI 분석
      </button>
    </header>
  );
}

function DetailStrip({ event, onClose }) {
  return (
    <section className="detail-strip" aria-label={`${event.title} 상세 요약`}>
      <button
        className="icon-button detail-close"
        type="button"
        onClick={onClose}
        aria-label="상세 요약 닫기"
      >
        <X size={18} />
      </button>
      <div>
        <p className="eyebrow">VERIFIED FACTS</p>
        <ul>{event.facts.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <div>
        <p className="eyebrow">DISPUTED / UNVERIFIED</p>
        <ul>{event.disputed.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <div>
        <p className="eyebrow">WHY KOREA SHOULD CARE</p>
        <ul>{event.relevance.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </section>
  );
}

function Briefing({ events, selectedId, onSelect, showAll, onToggleAll }) {
  const lead = events.find((event) => event.id === selectedId) ?? events[0];

  if (!lead) {
    return (
      <aside className="briefing-panel empty-briefing">
        <p className="eyebrow">NO MATCHES</p>
        <h2>검색 결과가 없습니다.</h2>
        <p>지역명이나 더 짧은 주제로 다시 검색해 보세요.</p>
      </aside>
    );
  }

  const visibleEvents = showAll ? events : events.slice(0, 4);

  return (
    <aside className="briefing-panel" aria-label="오늘의 핵심 변화">
      <div className="briefing-heading">
        <div>
          <p className="date-label">TODAY / 21 AUG 2026</p>
          <p className="timezone">KST · 최근 갱신 20:04</p>
        </div>
        <span className="demo-stamp">NON-LIVE DEMO</span>
      </div>

      <button className="lead-brief" type="button" onClick={() => onSelect(lead.id)}>
        <span className="event-number is-selected">{lead.id}</span>
        <span>
          <strong>{lead.title}</strong>
          <small>{lead.time} KST · {lead.sources} SOURCES</small>
          <span>{lead.impact}</span>
        </span>
      </button>

      <div className="list-heading">
        <p className="eyebrow">TODAY&apos;S TOP CHANGES</p>
        <span>{events.length} EVENTS</span>
      </div>

      <div className="event-list">
        {visibleEvents.map((event) => (
          <button
            className={`event-row${event.id === selectedId ? " is-selected" : ""}`}
            type="button"
            key={event.id}
            onClick={() => onSelect(event.id)}
            aria-pressed={event.id === selectedId}
          >
            <span className="event-number">{event.id}</span>
            <span className="event-copy">
              <span className="event-meta">
                <time dateTime={event.dateTime}>{event.time}</time>
                <span>{event.shortRegion}</span>
                <span>{event.sources} sources</span>
              </span>
              <strong>{event.title}</strong>
              <small>{event.summary}</small>
            </span>
          </button>
        ))}
      </div>

      {events.length > 4 && (
        <button className="view-all" type="button" onClick={onToggleAll}>
          {showAll ? "핵심 4건만 보기" : "전체 변화 보기"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </aside>
  );
}

function Timeline({ events, selectedId, onSelect }) {
  return (
    <section className="timeline-panel" aria-label="최근 24시간 사건 타임라인">
      <div className="timeline-title-row">
        <p className="eyebrow">Last 24 hours (KST)</p>
      </div>
      <div className="timeline-track-wrap">
        <span className="timeline-boundary is-start">21 AUG<small>00:00</small></span>
        <span className="timeline-zone">(KST)</span>
        <span className="timeline-boundary is-end">22 AUG<small>00:00</small></span>
        <div className="timeline-track" aria-hidden="true" />
        {[0, 4, 8, 12, 16, 20, 24].map((hour) => (
          <span className="timeline-tick" key={hour} style={{ left: `${(hour / 24) * 100}%` }}>
            {hour > 0 && hour < 24 ? `${String(hour).padStart(2, "0")}:00` : ""}
          </span>
        ))}
        {events.map((event) => (
          <button
            type="button"
            className={`timeline-event${event.id === selectedId ? " is-selected" : ""}`}
            style={{ left: `${getTimelinePosition(event.dateTime)}%` }}
            key={event.id}
            onClick={() => onSelect(event.id)}
            aria-label={`${event.time}, ${event.title}`}
            aria-pressed={event.id === selectedId}
          >
            {event.id}
            {event.id === selectedId && (
              <Triangle className="timeline-selection" size={10} weight="fill" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function AiDrawer({ event, onClose }) {
  const [context, setContext] = useState("현재 사건");
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  function handleKeyDown(eventObject) {
    if (eventObject.key === "Escape") {
      eventObject.preventDefault();
      onClose();
      return;
    }

    if (eventObject.key !== "Tab") return;

    const focusable = drawerRef.current?.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (eventObject.shiftKey && document.activeElement === first) {
      eventObject.preventDefault();
      last.focus();
    } else if (!eventObject.shiftKey && document.activeElement === last) {
      eventObject.preventDefault();
      first.focus();
    }
  }

  function submit(eventObject) {
    eventObject.preventDefault();
    setNotice("AI 백엔드는 아직 연결되지 않았습니다. 현재는 입력 흐름만 확인하는 프로토타입입니다.");
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button
        className="drawer-scrim"
        type="button"
        onClick={onClose}
        tabIndex={-1}
        aria-hidden="true"
      />
      <aside
        className="ai-drawer"
        id="ai-analysis-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-analysis-title"
        aria-describedby="ai-connection-status"
        onKeyDown={handleKeyDown}
      >
        <div className="drawer-heading">
          <div>
            <p className="eyebrow">ANALYSIS WORKSPACE</p>
            <h2 id="ai-analysis-title">AI 분석</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="AI 분석 패널 닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="connection-note" id="ai-connection-status">
          <span />
          AI 연결 전 · 상호작용 구조 확인용
        </div>

        <section className="selected-context">
          <p className="eyebrow">SELECTED CONTEXT</p>
          <strong>{event.title}</strong>
          <small>{event.region} · {event.time} KST · 데모 자료</small>
        </section>

        <div className="context-actions" aria-label="분석 컨텍스트 선택">
          {[
            { label: "현재 사건", icon: MapTrifold },
            { label: "영역 선택", icon: Selection },
          ].map(({ label, icon: Icon }) => (
            <button
              className={context === label ? "is-selected" : ""}
              type="button"
              key={label}
              onClick={() => setContext(label)}
              aria-pressed={context === label}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>

        <form className="analysis-form" onSubmit={submit}>
          <label htmlFor="analysis-prompt">무엇을 분석할까요?</label>
          <textarea
            id="analysis-prompt"
            value={prompt}
            onChange={(eventObject) => setPrompt(eventObject.target.value)}
            maxLength={4000}
            placeholder="확인된 사실과 추론을 구분해서, 한국에 미칠 영향을 분석해줘."
          />
          <button type="submit" className="analysis-submit">
            분석 요청
            <PaperPlaneTilt size={17} />
          </button>
        </form>

        {notice && <p className="prototype-notice" role="status">{notice}</p>}
      </aside>
    </div>
  );
}

export function App() {
  const [selectedId, setSelectedId] = useState(1);
  const [query, setQuery] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimerRef = useRef(null);
  const aiTriggerRef = useRef(null);

  const filteredEvents = useMemo(() => filterEvents(EVENTS, query), [query]);
  const selectedEvent = filteredEvents.find((event) => event.id === selectedId) ?? filteredEvents[0] ?? null;
  const effectiveSelectedId = selectedEvent?.id ?? null;

  useEffect(() => {
    if (!selectedEvent) {
      setDetailsOpen(false);
      setAiOpen(false);
    }
  }, [selectedEvent]);

  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);

  function selectEvent(id) {
    setSelectedId(id);
    setDetailsOpen(true);
    if (filteredEvents.findIndex((event) => event.id === id) >= 4) {
      setShowAll(true);
    }
  }

  function showUnavailable(label) {
    window.clearTimeout(noticeTimerRef.current);
    setNotice(`${label} 화면은 다음 설계 단계에서 별도로 구성합니다.`);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2600);
  }

  function closeAi() {
    setAiOpen(false);
    window.requestAnimationFrame(() => aiTriggerRef.current?.focus());
  }

  return (
    <div className="application-shell">
      <Header
        query={query}
        onQueryChange={setQuery}
        onOpenAi={() => setAiOpen(true)}
        onUnavailable={showUnavailable}
        aiOpen={aiOpen}
        aiTriggerRef={aiTriggerRef}
        aiAvailable={Boolean(selectedEvent)}
      />

      <p className="sr-only" role="status" aria-live="polite">
        검색 결과 {filteredEvents.length}건
      </p>

      <main className="workspace">
        <div className={`map-workspace${detailsOpen ? " has-details" : ""}`}>
          <WorldSituationMap events={filteredEvents} selectedId={effectiveSelectedId} onSelect={selectEvent} />
          {detailsOpen && selectedEvent && (
            <DetailStrip event={selectedEvent} onClose={() => setDetailsOpen(false)} />
          )}
        </div>
        <Briefing
          events={filteredEvents}
          selectedId={effectiveSelectedId}
          onSelect={selectEvent}
          showAll={showAll}
          onToggleAll={() => setShowAll((value) => !value)}
        />
      </main>

      <Timeline events={filteredEvents} selectedId={effectiveSelectedId} onSelect={selectEvent} />

      {notice && <div className="domain-notice" role="status">{notice}</div>}
      {aiOpen && selectedEvent && <AiDrawer event={selectedEvent} onClose={closeAi} />}
    </div>
  );
}
