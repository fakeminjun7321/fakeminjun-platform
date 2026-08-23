import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Brain,
  CaretDown,
  CaretUp,
  Database,
  ShieldCheck,
} from "@phosphor-icons/react";
import { EVENTS } from "./events.js";
import {
  BackendApiError,
  backendClient,
} from "./backendClient.js";
import {
  INTERNATIONAL_VIEW_REFRESH_MS,
  aggregateSourceGroups,
  startVisibleRefresh,
} from "./internationalRefresh.js";
import { CATEGORY_META, STATUS_META, getTopSignals } from "./mapLayers.js";
import { PHYSICS_ANALYSIS_LEVEL, PHYSICS_PROFILE_SUMMARY } from "./physicsProfile.js";

const AiDrawer = lazy(() => import("./AiDrawer.jsx"));
const CandidatePromotionPanel = lazy(() => import("./CandidatePromotionPanel.jsx"));
const PhysicsWorkspace = lazy(() => import("./PhysicsWorkspace.jsx"));
const WorldSituationMap = lazy(() => import("./WorldSituationMap.jsx").then((module) => ({ default: module.WorldSituationMap })));

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

function Header({ domain, route, sourceState, mapEventState, onOpenAi, onNavigate, aiOpen, aiTriggerRef }) {
  const sourceWorkspace = domain === "international" && route === "briefing";
  const headerTimestamp = sourceWorkspace
    ? sourceState.checkedAt
    : domain === "international" ? mapEventState.generatedAt : null;
  const statusLabel = sourceWorkspace
    ? "공식 자료 · 검증 전"
    : domain === "physics"
      ? "개인 공간 · 비공개"
      : mapEventState.dataStatus === "mixed" ? "실제·데모 혼합" : "데모 자료";

  return (
    <header className="app-header">
      <button
        className="brand-lockup"
        type="button"
        onClick={() => onNavigate("map")}
        aria-label="국제정세 상황지도 홈"
      >
        <span>STUDIO 7321</span>
      </button>
      <h1 className="sr-only">{DOMAIN_META[domain].title}</h1>
      <DomainNavigation domain={domain} onNavigate={onNavigate} />
      <div className="header-utilities">
        {domain !== "physics" ? (
          <span className="as-of">{sourceWorkspace ? "마지막 확인" : "기준 시각"} <strong>{headerTimestamp ? `${eventTimeLabel(headerTimestamp)} KST` : "--:--"}</strong></span>
        ) : null}
        <span className={`demo-stamp${sourceWorkspace ? " is-live-source" : ""}`}>{statusLabel}</span>
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
          Mandos 열기
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
        <div><p className="system-kicker">오늘의 우선순위</p><h2>주요 신호</h2></div>
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

function briefingDateLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
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

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function SourceInbox({
  state,
  selectedIds,
  createState,
  ingestionState,
  onToggle,
  onCreate,
  onCancelCreate,
  onRunIngestion,
}) {
  const selectedCount = selectedIds.size;
  const selectionReady = selectedCount >= 2 && selectedCount <= 8;
  const resolved = ["ready", "refreshing"].includes(state.status);
  const syncLabel = state.status === "refreshing"
    ? "최신 자료 확인 중"
    : state.checkedAt ? `마지막 확인 ${eventTimeLabel(state.checkedAt)} KST` : "첫 동기화 대기";

  return (
    <section className="source-inbox" aria-labelledby="source-inbox-title">
      <header>
        <div>
          <p className="system-kicker">공식 출처</p>
          <h3 id="source-inbox-title">공식 출처 수집함</h3>
        </div>
        <div className="source-header-actions">
          <div className={`source-sync-state is-${state.status}`} role="status" aria-live="polite">
            <i aria-hidden="true" />
            <span>{INTERNATIONAL_VIEW_REFRESH_MS / 1_000}초마다 확인</span>
            <strong>{syncLabel}</strong>
          </div>
          <div className="source-boundary" aria-label="자료 상태">
            <span>실제 수집</span><span>미검증 자료</span><span>사건·지도 미반영</span>
          </div>
          <button className="source-refresh" type="button" disabled={ingestionState.status === "submitting"} onClick={onRunIngestion}>
            {ingestionState.status === "submitting" ? "수집 중…" : "공식 출처 새로고침"}
          </button>
        </div>
      </header>
      {ingestionState.message ? (
        <p className={`candidate-request-notice${ingestionState.status === "error" ? " is-error" : ""}`} role={ingestionState.status === "error" ? "alert" : "status"}>
          {ingestionState.message}
        </p>
      ) : null}
      {state.status === "loading" && <p className="source-empty">공식 피드 수집 자료를 확인 중입니다.</p>}
      {state.status === "error" && (
        <p className="source-empty is-error">
          수집 자료를 불러오지 못했습니다. {state.items.length ? "이전에 받은 자료를 표시하며 최신성은 확인되지 않았습니다." : "데모 신호로 바꾸지 않고 빈 상태로 둡니다."}
        </p>
      )}
      {resolved && state.items.length === 0 && (
        <p className="source-empty">아직 저장된 공식 출처 자료가 없습니다. 수집 실행 후 이곳에 표시됩니다.</p>
      )}
      {state.items.length > 0 && (
        <ol className="source-item-list">
          {state.items.map((item) => {
            const selected = selectedIds.has(item.id);
            const sourceUrl = safeExternalUrl(item.originalUrl);
            return (
              <li className={selected ? "is-selected" : ""} key={item.id ?? `${item.source.key}-${item.providerItemId}`}>
                <label className="source-item-selector">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={createState.status === "submitting" || (!selected && selectedCount >= 8)}
                    onChange={() => onToggle(item.id)}
                    aria-label={`${item.title} 후보 자료로 선택`}
                  />
                  <span aria-hidden="true" />
                </label>
                <div className="source-item-copy">
                  <div className="source-item-meta">
                    <span className={`source-lane lane-${item.lane}`}>{SOURCE_LANE_LABELS[item.lane] ?? item.lane}</span>
                    <span>{item.source.name}</span>
                    <time dateTime={item.publishedAt ?? item.collectedAt}>{sourceTimestamp(item.publishedAt)}</time>
                  </div>
                  {sourceUrl ? (
                    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                      {item.title}<ArrowRight size={14} aria-hidden="true" />
                    </a>
                  ) : <strong className="source-title-without-link">{item.title}</strong>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <footer className="source-selection-command" aria-busy={createState.status === "submitting"}>
        <div>
          <span><strong>{selectedCount}</strong> / 8개 선택</span>
          <p>{selectionReady ? "선택한 자료를 하나의 사건 가설로 묶을 수 있습니다." : "서로 관련 있어 보이는 자료를 2개 이상 선택하세요."}</p>
        </div>
        <div className="source-selection-actions">
          {createState.status === "submitting" ? (
            <button className="candidate-cancel" type="button" onClick={onCancelCreate}>요청 취소</button>
          ) : null}
          <button className="candidate-create" type="button" disabled={!selectionReady || createState.status === "submitting"} onClick={onCreate}>
            {createState.status === "submitting" ? "후보 생성 중…" : "사건 후보 만들기"}
          </button>
        </div>
      </footer>
      {createState.message ? (
        <p className={`candidate-request-notice${createState.status === "error" ? " is-error" : ""}`} role={createState.status === "error" ? "alert" : "status"}>
          {createState.message}
        </p>
      ) : null}
    </section>
  );
}

const CANDIDATE_REVIEW_LABELS = {
  pending: "검토 전",
  unreviewed: "검토 전",
  hold: "보류",
  reviewed: "검토 완료 · 검증 전",
  rejected: "기각",
};

function textItems(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return item.trim() ? [item] : [];
    const text = item?.detail ?? item?.summary ?? item?.assessment ?? item?.label;
    return typeof text === "string" && text.trim() ? [text] : [];
  });
}

function CandidateTextList({ title, items, emptyText }) {
  const visibleItems = textItems(items);
  return (
    <section>
      <h5>{title}</h5>
      {visibleItems.length ? <ul>{visibleItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>{emptyText}</p>}
    </section>
  );
}

function CandidateEvidence({ candidate }) {
  const snapshots = Array.isArray(candidate.evidenceSnapshots) ? candidate.evidenceSnapshots : [];
  const assessments = Array.isArray(candidate.sourceAssessments) ? candidate.sourceAssessments : [];
  const snapshotsByEvidence = new Map(snapshots.map((snapshot) => [snapshot.evidenceId ?? snapshot.sourceItemId, snapshot]));
  const relationshipLabels = {
    "same-development": "동일 전개 가능성",
    context: "배경 맥락",
    "possibly-unrelated": "관련성 낮을 수 있음",
  };

  return (
    <section className="candidate-evidence" aria-label="근거 스냅샷과 출처 평가">
      <div className="candidate-subheading"><h4>근거 스냅샷</h4><span>{snapshots.length}개 자료</span></div>
      {snapshots.length ? (
        <ol>
          {snapshots.map((snapshot, index) => {
            const sourceUrl = safeExternalUrl(snapshot.originalUrl ?? snapshot.url);
            return (
              <li key={snapshot.sourceItemId ?? `${snapshot.title}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>{snapshot.sourceName ?? snapshot.source?.name ?? "공식 출처"} · {sourceTimestamp(snapshot.publishedAt)}</small>
                  {sourceUrl ? (
                    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                      {snapshot.title ?? "제목 없는 자료"}<ArrowRight size={13} aria-hidden="true" />
                    </a>
                  ) : <strong>{snapshot.title ?? "제목 없는 자료"}</strong>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : <p className="candidate-empty-detail">저장된 근거 스냅샷이 없습니다.</p>}
      {assessments.length ? (
        <dl className="candidate-assessments">
          {assessments.map((assessment, index) => (
            <div key={assessment.sourceItemId ?? `${assessment.sourceName}-${index}`}>
              <dt>{assessment.sourceName ?? assessment.source?.name ?? snapshotsByEvidence.get(assessment.evidenceId)?.sourceName ?? `출처 ${index + 1}`}</dt>
              <dd>
                {relationshipLabels[assessment.relationship] ?? assessment.relationship ?? assessment.assessment ?? assessment.summary ?? assessment.role ?? "메타데이터 관계 평가 없음"}
                {assessment.note ? ` · ${assessment.note}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export function CandidateReviewDesk({ state, noteDrafts, reviewState, onNoteChange, onReview, onPromoted }) {
  return (
    <section className="candidate-review-desk" aria-labelledby="candidate-review-title">
      <header>
        <div><p className="system-kicker">자료 묶음 검토</p><h3 id="candidate-review-title">사건 후보 검토대</h3></div>
        <div className="candidate-boundary" aria-label="후보 자료 상태">
          <span>자료 묶음 후보</span><span>검증 전</span><span>지도 반영 전</span>
        </div>
      </header>
      <p className="candidate-desk-explainer">
        제목과 발행 시각이 가까운 공식 자료를 하나의 사건 후보로 묶었습니다. 검토 상태를 바꿔도 사실 검증이나 지도 반영은 이루어지지 않습니다.
      </p>
      {reviewState.message ? (
        <p className={`candidate-request-notice${reviewState.status === "error" ? " is-error" : ""}`} role={reviewState.status === "error" ? "alert" : "status"}>
          {reviewState.message}
        </p>
      ) : null}
      {state.status === "loading" ? <p className="candidate-empty">저장된 사건 후보를 불러오는 중입니다.</p> : null}
      {state.status === "error" ? (
        <p className="candidate-empty is-error" role="alert">후보 목록을 불러오지 못했습니다. 공식 출처 수집함의 자료에는 영향을 주지 않습니다.</p>
      ) : null}
      {state.status === "ready" && state.items.length === 0 ? (
        <p className="candidate-empty">아직 생성된 후보가 없습니다. 위 수집함에서 관련 있어 보이는 공식 자료 2~8개를 선택해 첫 가설을 만드세요.</p>
      ) : null}
      {state.items.length ? (
        <div className="candidate-records">
          {state.items.map((candidate) => {
            const candidateId = String(candidate.id);
            const displayCandidate = { ...candidate, ...(candidate.result ?? {}) };
            const reviewStatus = candidate.reviewStatus ?? candidate.reviewDecision ?? "unreviewed";
            const reviewPending = reviewState.status === "submitting" && reviewState.candidateId === candidateId;
            const reviewProtected = candidate.revision !== undefined && Boolean(candidate.candidateHash);
            return (
              <article className={`candidate-record status-${reviewStatus}`} key={candidateId}>
                <header>
                  <div className="candidate-record-code">
                    <span>후보 {candidateId}</span>
                    <strong>{CANDIDATE_REVIEW_LABELS[reviewStatus] ?? reviewStatus.toUpperCase()}</strong>
                  </div>
                  <div className="candidate-record-location">
                    <span>{displayCandidate.regionLabel ?? "지역 미분류"}</span>
                    <span>{SOURCE_LANE_LABELS[displayCandidate.laneRecommendation] ?? displayCandidate.laneRecommendation ?? "분류 없음"}</span>
                  </div>
                </header>
                <div className="candidate-record-lead">
                  <h4>{displayCandidate.title ?? "제목 없는 사건 후보"}</h4>
                  <p>{displayCandidate.summary ?? "요약이 생성되지 않았습니다."}</p>
                  <dl><div><dt>묶은 이유</dt><dd>{displayCandidate.whyGrouped ?? "자료 간 관계 설명이 없습니다."}</dd></div></dl>
                </div>
                <CandidateEvidence candidate={displayCandidate} />
                <div className="candidate-check-grid">
                  <CandidateTextList title="불확실성" items={displayCandidate.uncertainties} emptyText="기록된 불확실성이 없습니다." />
                  <CandidateTextList title="다음 확인" items={displayCandidate.nextChecks} emptyText="제안된 다음 확인 절차가 없습니다." />
                </div>
                <Suspense fallback={<p className="candidate-empty-detail">지도 반영 도구를 불러오는 중입니다.</p>}>
                  <CandidatePromotionPanel candidate={displayCandidate} onPromoted={onPromoted} />
                </Suspense>
                <footer className="candidate-review-command" aria-busy={reviewPending}>
                  <label htmlFor={`candidate-note-${candidateId}`}>검토 메모 <span>선택</span></label>
                  <input
                    id={`candidate-note-${candidateId}`}
                    type="text"
                    maxLength={500}
                    value={noteDrafts[candidateId] ?? ""}
                    onChange={(eventObject) => onNoteChange(candidateId, eventObject.target.value)}
                    placeholder="보류·기각 이유 또는 다음 확인 조건"
                    disabled={reviewPending}
                  />
                  <div>
                    <button type="button" disabled={reviewPending || !reviewProtected} onClick={() => onReview(candidate, "hold")}>보류</button>
                    <button type="button" disabled={reviewPending || !reviewProtected} onClick={() => onReview(candidate, "reviewed")}>검토 완료 · 검증 아님</button>
                    <button type="button" disabled={reviewPending || !reviewProtected} onClick={() => onReview(candidate, "rejected")}>기각</button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function BriefingPage({
  events,
  selectedId,
  onSelect,
  onOpenIssues,
  sourceState,
  selectedSourceIds,
  createState,
  candidateState,
  noteDrafts,
  reviewState,
  ingestionState,
  onToggleSource,
  onCreateCandidate,
  onCancelCandidate,
  onNoteChange,
  onReviewCandidate,
  onRunIngestion,
  onPromoted,
}) {
  return (
    <main className="focused-workspace briefing-workspace">
      <header className="workspace-heading">
        <div>
          <p className="system-kicker">{briefingDateLabel()}</p>
          <h2>오늘 브리핑</h2>
          <p>한국을 중심으로 미국의 영향과 급격한 변화를 분리해 읽습니다.</p>
        </div>
        <span className="workspace-count">데모 신호 {events.length}개</span>
      </header>
      <SourceInbox
        state={sourceState}
        selectedIds={selectedSourceIds}
        createState={createState}
        ingestionState={ingestionState}
        onToggle={onToggleSource}
        onCreate={onCreateCandidate}
        onCancelCreate={onCancelCandidate}
        onRunIngestion={onRunIngestion}
      />
      <CandidateReviewDesk
        state={candidateState}
        noteDrafts={noteDrafts}
        reviewState={reviewState}
        onNoteChange={onNoteChange}
        onReview={onReviewCandidate}
        onPromoted={onPromoted}
      />
      <div className="briefing-section-label">
        <div><p className="system-kicker">분석 연습</p><h3>분석용 데모 신호</h3></div>
        <span>실시간 자료 아님</span>
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
        <p className="system-kicker">추적 중인 이슈</p><h2>이슈 추적</h2>
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
          <p className="system-kicker">장기 추적</p>
          <h2>{activeIssue.title}</h2><p>{activeIssue.summary}</p>
          <div className="dossier-meta">
            <span><Database size={15} /> 출처 {selectedEvent.sources}</span>
            <span><ShieldCheck size={15} /> 합치도 {selectedEvent.agreement}%</span>
            <span>{STATUS_META[selectedEvent.status].label}</span>
          </div>
        </header>
        <section className="issue-history" aria-labelledby="issue-history-title">
          <div>
            <p className="system-kicker">변화 기록</p>
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
          <button type="button" onClick={onOpenAi}><Brain size={17} /> Mandos로 추가 분석</button>
        </footer>
      </article>
    </main>
  );
}

function eventTimeLabel(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--:--";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(parsed);
}

export function normalizeApiMapEvent(event) {
  const fixture = EVENTS.find(({ id }) => String(id) === String(event.id));
  return {
    ...(fixture ?? {}),
    ...event,
    id: event.id,
    time: event.time ?? eventTimeLabel(event.dateTime),
    sources: event.sources ?? event.sourceCount ?? fixture?.sources ?? 0,
    relatedCoordinates: event.relatedCoordinates ?? event.relatedLocations ?? fixture?.relatedCoordinates ?? [],
    relationLabel: event.relationLabel ?? fixture?.relationLabel ?? "관계 정보 없음",
    facts: event.facts ?? fixture?.facts ?? [],
    disputed: event.disputed ?? fixture?.disputed ?? [],
    relevance: event.relevance ?? fixture?.relevance ?? [],
    impact: event.impact ?? fixture?.impact ?? "추가 영향 분석이 필요합니다.",
    lastChecked: event.lastChecked ?? event.lastVerifiedAt ?? fixture?.lastChecked ?? "검증 시각 없음",
  };
}

export function App() {
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));
  const [selectedId, setSelectedId] = useState(() => (
    routeFromPath(window.location.pathname) === "map" && !window.matchMedia("(max-width: 600px)").matches ? 1 : null
  ));
  const [aiOpen, setAiOpen] = useState(false);
  const [analysisContext, setAnalysisContext] = useState(null);
  const [notice, setNotice] = useState("");
  const [sourceState, setSourceState] = useState({
    status: "idle",
    items: [],
    collectionStatus: "unknown",
    checkedAt: null,
    lastCollectedAt: null,
    streams: [],
  });
  const [selectedSourceIds, setSelectedSourceIds] = useState(() => new Set());
  const [candidateState, setCandidateState] = useState({ status: "idle", items: [] });
  const [createState, setCreateState] = useState({ status: "idle", message: "" });
  const [reviewState, setReviewState] = useState({ status: "idle", candidateId: null, message: "" });
  const [ingestionState, setIngestionState] = useState({ status: "idle", message: "" });
  const [sourceRefreshVersion, setSourceRefreshVersion] = useState(0);
  const [candidateNoteDrafts, setCandidateNoteDrafts] = useState({});
  const [mapEventState, setMapEventState] = useState({
    status: "idle",
    items: EVENTS,
    dataStatus: "non-live-demo",
    generatedAt: null,
  });
  const [mapRefreshVersion, setMapRefreshVersion] = useState(0);
  const noticeTimerRef = useRef(null);
  const aiTriggerRef = useRef(null);
  const aiOpenerRef = useRef(null);
  const candidateCreateRef = useRef(null);
  const candidateCreateAttemptRef = useRef(null);
  const candidateReviewRef = useRef(null);
  const candidateReviewAttemptRef = useRef(null);
  const topSignals = useMemo(() => getTopSignals(mapEventState.items, 3), [mapEventState.items]);
  const selectedEvent = mapEventState.items.find((event) => String(event.id) === String(selectedId))
    ?? EVENTS.find((event) => String(event.id) === String(selectedId))
    ?? mapEventState.items[0]
    ?? EVENTS[0];
  const domain = domainFromRoute(route);

  useEffect(() => {
    document.title = domain === "physics"
      ? "물리 학습 워크스페이스 · 데모"
      : "국제정세 분석 워크스페이스 · 데모";
  }, [domain]);

  const defaultAnalysisContext = useMemo(() => {
    if (domain === "physics") {
      return {
        domain: "physics",
        level: PHYSICS_ANALYSIS_LEVEL,
        contextKind: "physics-workspace",
        contextId: "current",
        title: "물리 학습 워크스페이스",
        meta: `물리 워크스페이스 · ${PHYSICS_PROFILE_SUMMARY}`,
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
        meta: `${selectedEvent.region} · ${selectedEvent.time} KST · ${selectedEvent.live ? "지도에 반영된 실제 사건" : "명시된 데모 자료"}`,
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
  useEffect(() => {
    if (domain !== "international") return undefined;
    const controller = new AbortController();
    setMapEventState((current) => ({ ...current, status: current.status === "idle" ? "loading" : "refreshing" }));
    void backendClient.listEventsEnvelope({ limit: 100, signal: controller.signal })
      .then(({ data, meta }) => {
        const items = (Array.isArray(data) ? data : []).map(normalizeApiMapEvent);
        setMapEventState({
          status: "ready",
          items: items.length ? items : EVENTS,
          dataStatus: meta?.dataStatus ?? "unknown",
          generatedAt: meta?.generatedAt ?? new Date().toISOString(),
        });
        if (items.length && selectedId !== null && !items.some(({ id }) => String(id) === String(selectedId))) {
          setSelectedId(items[0].id);
        }
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setMapEventState((current) => ({
            ...current,
            status: "error",
            dataStatus: current.generatedAt ? current.dataStatus : "fallback-demo",
          }));
        }
      });
    return () => controller.abort();
  }, [domain, mapRefreshVersion]);
  useEffect(() => {
    if (route !== "briefing") return undefined;
    const controller = new AbortController();
    setSourceState((current) => ({
      ...current,
      status: current.status === "idle" ? "loading" : "refreshing",
    }));
    const sourceRequest = Promise.all([
      backendClient.listSourceItems({ lanes: ["korea-core"], limit: 4, signal: controller.signal }),
      backendClient.listSourceItems({ lanes: ["us-impact"], limit: 4, signal: controller.signal }),
      backendClient.listSourceItems({ lanes: ["rapid-change"], limit: 4, signal: controller.signal }),
    ]);

    void sourceRequest
      .then((groups) => {
        const aggregated = aggregateSourceGroups(groups);
        const { items } = aggregated;
        setSourceState({ status: "ready", ...aggregated });
        const visibleIds = new Set(items.map(({ id }) => id));
        setSelectedSourceIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setSourceState((current) => ({ ...current, status: "error", collectionStatus: "unknown" }));
      });

    return () => controller.abort();
  }, [route, sourceRefreshVersion]);
  useEffect(() => {
    if (route !== "briefing") return undefined;
    const controller = new AbortController();
    setCandidateState((current) => ({ ...current, status: "loading" }));
    void backendClient.listEventCandidates({ limit: 20, signal: controller.signal })
      .then((items) => setCandidateState({ status: "ready", items }))
      .catch((error) => {
        if (error?.name !== "AbortError") setCandidateState((current) => ({ ...current, status: "error" }));
      });
    return () => controller.abort();
  }, [route]);
  useEffect(() => {
    if (domain !== "international") return undefined;
    return startVisibleRefresh({
      onRefresh: () => {
        setMapRefreshVersion((version) => version + 1);
        if (route === "briefing") setSourceRefreshVersion((version) => version + 1);
      },
    });
  }, [domain, route]);
  useEffect(() => () => {
    candidateCreateRef.current?.abort();
    candidateReviewRef.current?.abort();
  }, []);

  async function runOfficialSourceIngestion() {
    if (ingestionState.status === "submitting") return;
    setIngestionState({ status: "submitting", message: "허용된 공식 출처의 최신 메타데이터를 수집하고 있습니다." });
    try {
      const result = await backendClient.runIngestion();
      const runs = Array.isArray(result?.results) ? result.results : [];
      const succeeded = runs.filter(({ status }) => status === "succeeded").length;
      const skipped = runs.filter(({ status }) => status === "skipped").length;
      const failed = runs.filter(({ status }) => status === "failed").length;
      const status = failed > 0 ? "warning" : "success";
      setIngestionState({
        status,
        message: `수집 실행 완료 · 성공 ${succeeded} · 중복 생략 ${skipped} · 실패 ${failed}. 저장 자료는 아직 미검증이며 지도에 반영되지 않습니다.`,
      });
      setSourceRefreshVersion((version) => version + 1);
    } catch (error) {
      setIngestionState({ status: "error", message: "공식 출처를 새로고침하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
  }

  function toggleSourceSelection(sourceItemId) {
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(sourceItemId)) next.delete(sourceItemId);
      else if (next.size < 8) next.add(sourceItemId);
      return next;
    });
  }

  async function createCandidate() {
    const sourceItemIds = [...selectedSourceIds];
    if (sourceItemIds.length < 2 || sourceItemIds.length > 8 || createState.status === "submitting") return;
    const requestSignature = JSON.stringify([...sourceItemIds].sort((left, right) => left - right));
    if (candidateCreateAttemptRef.current?.signature !== requestSignature) {
      candidateCreateAttemptRef.current = { signature: requestSignature, idempotencyKey: crypto.randomUUID() };
    }
    const controller = new AbortController();
    candidateCreateRef.current?.abort();
    candidateCreateRef.current = controller;
    setCreateState({ status: "submitting", message: "선택 자료의 사건 후보 가설을 생성하고 있습니다." });
    try {
      const created = await backendClient.createEventCandidate(
        { sourceItemIds },
        { signal: controller.signal, idempotencyKey: candidateCreateAttemptRef.current.idempotencyKey },
      );
      setCandidateState((current) => ({
        status: "ready",
        items: [created, ...current.items.filter(({ id }) => String(id) !== String(created.id))],
      }));
      setSelectedSourceIds(new Set());
      candidateCreateAttemptRef.current = null;
      setCreateState({ status: "success", message: "사건 후보를 저장했습니다. 메타데이터 가설이며 아직 검증되지 않았습니다." });
    } catch (error) {
      if (error?.name === "AbortError") {
        setCreateState({ status: "cancelled", message: "사건 후보 생성 요청을 취소했습니다." });
      } else {
        if (error instanceof BackendApiError && error.status >= 400 && error.status < 500 && ![408, 425, 429].includes(error.status)) {
          candidateCreateAttemptRef.current = null;
        }
        setCreateState({ status: "error", message: "사건 후보를 만들지 못했습니다. 선택한 자료를 확인해 주세요." });
      }
    } finally {
      if (candidateCreateRef.current === controller) candidateCreateRef.current = null;
    }
  }

  function cancelCandidateCreation() {
    candidateCreateRef.current?.abort();
  }

  function changeCandidateNote(candidateId, value) {
    setCandidateNoteDrafts((current) => ({ ...current, [candidateId]: value }));
  }

  async function reviewCandidate(candidate, decision) {
    const candidateId = String(candidate.id);
    if (reviewState.status === "submitting" || candidate.revision === undefined || !candidate.candidateHash) return;
    const note = candidateNoteDrafts[candidateId]?.trim();
    const reviewPayload = {
      decision,
      expectedRevision: candidate.revision,
      candidateHash: candidate.candidateHash,
      ...(note ? { note } : {}),
    };
    const requestSignature = JSON.stringify({ candidateId, ...reviewPayload });
    if (candidateReviewAttemptRef.current?.signature !== requestSignature) {
      candidateReviewAttemptRef.current = { signature: requestSignature, idempotencyKey: crypto.randomUUID() };
    }
    const controller = new AbortController();
    candidateReviewRef.current?.abort();
    candidateReviewRef.current = controller;
    setReviewState({ status: "submitting", candidateId, message: "검토 상태를 저장하고 있습니다." });
    try {
      const updated = await backendClient.reviewEventCandidate(
        candidate.id,
        reviewPayload,
        { signal: controller.signal, idempotencyKey: candidateReviewAttemptRef.current.idempotencyKey },
      );
      setCandidateState((current) => ({
        status: "ready",
        items: current.items.map((item) => (String(item.id) === candidateId ? updated : item)),
      }));
      setCandidateNoteDrafts((current) => ({ ...current, [candidateId]: "" }));
      candidateReviewAttemptRef.current = null;
      setReviewState({
        status: "success",
        candidateId,
        message: "검토 상태를 저장했습니다. 사실 검증 완료나 지도 반영을 의미하지 않습니다.",
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        setReviewState({ status: "cancelled", candidateId, message: "검토 요청을 취소했습니다." });
      } else {
        if (error instanceof BackendApiError && error.status >= 400 && error.status < 500 && ![408, 425, 429].includes(error.status)) {
          candidateReviewAttemptRef.current = null;
        }
        setReviewState({ status: "error", candidateId, message: "검토 상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
      }
    } finally {
      if (candidateReviewRef.current === controller) candidateReviewRef.current = null;
    }
  }

  function navigate(nextRoute) {
    if (nextRoute === "issues" && !TRACKED_ISSUES.some((issue) => issue.eventIds.some((eventId) => String(eventId) === String(selectedId)))) {
      setSelectedId(TRACKED_ISSUES[0].eventIds[0]);
    }
    const path = ROUTES[nextRoute];
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setRoute(nextRoute);
  }

  function openIssues(id = selectedId) {
    const tracked = TRACKED_ISSUES.some((issue) => issue.eventIds.some((eventId) => String(eventId) === String(id)));
    setSelectedId(id);
    if (!tracked) {
      showNotice("이 사건은 아직 장기 이슈 추적 묶음에 연결되지 않았습니다.");
      return;
    }
    navigate("issues");
  }

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
        <Header
          domain={domain}
          route={route}
          sourceState={sourceState}
          mapEventState={mapEventState}
          onOpenAi={() => openAi()}
          onNavigate={navigate}
          aiOpen={aiOpen}
          aiTriggerRef={aiTriggerRef}
        />
        <WorkspaceSubnav domain={domain} route={route} onNavigate={navigate} />

        {route === "map" && (
          <main className="situation-map-page">
            <Suspense fallback={<div className="workspace-loading" role="status">상황지도를 불러오는 중입니다.</div>}>
              <WorldSituationMap events={mapEventState.items} selectedEvent={selectedEvent} selectionActive={selectedId !== null} dataStatus={mapEventState.dataStatus} onSelect={setSelectedId}
                onOpenIssues={() => openIssues(selectedEvent.id)} onOpenAi={() => openAi()} />
            </Suspense>
            <TodaySignalsPanel events={topSignals} selectedId={selectedId} onSelect={setSelectedId}
              onOpenBriefing={() => navigate("briefing")} />
            {mapEventState.status === "error" ? <p className="map-data-notice" role="status">사건 자료를 불러오지 못해 명시된 데모 자료를 표시합니다.</p> : null}
          </main>
        )}

        {route === "briefing" && (
          <BriefingPage
            events={EVENTS}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpenIssues={openIssues}
            sourceState={sourceState}
            selectedSourceIds={selectedSourceIds}
            createState={createState}
            candidateState={candidateState}
            noteDrafts={candidateNoteDrafts}
            reviewState={reviewState}
            ingestionState={ingestionState}
            onToggleSource={toggleSourceSelection}
            onCreateCandidate={createCandidate}
            onCancelCandidate={cancelCandidateCreation}
            onNoteChange={changeCandidateNote}
            onReviewCandidate={reviewCandidate}
            onRunIngestion={runOfficialSourceIngestion}
            onPromoted={() => setMapRefreshVersion((version) => version + 1)}
          />
        )}

        {route === "issues" && (
          <IssuesPage selectedEvent={selectedEvent} onSelect={setSelectedId} onOpenAi={() => openAi()} />
        )}

        {domain === "physics" && (
          <Suspense fallback={<main className="focused-workspace workspace-loading" role="status">물리 작업공간을 불러오는 중입니다.</main>}>
            <PhysicsWorkspace
              view={{ library: "library", finder: "finder", ipho: "ipho" }[route] ?? "learn"}
              onOpenAi={openAi}
              onNotice={showNotice}
            />
          </Suspense>
        )}

      </div>
      <p className="sr-only" role="status" aria-live="polite">선택 사건: {selectedEvent.title}</p>
      {notice && <div className="domain-notice" role="status">{notice}</div>}
      {aiOpen && (
        <Suspense fallback={<div className="drawer-layer"><aside className="ai-drawer" role="status">Mandos를 불러오는 중입니다.</aside></div>}>
          <AiDrawer analysisContext={analysisContext ?? defaultAnalysisContext} onClose={closeAi} />
        </Suspense>
      )}
    </div>
  );
}
