import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowSquareOut,
  BookmarkSimple,
  Brain,
  FileText,
  FolderOpen,
  MagnifyingGlass,
  Trophy,
} from "@phosphor-icons/react";
import {
  IPHO_TOPICS,
  PHYSICS_RESOURCES,
  PHYSICS_TOOLS,
  filterPhysicsResources,
} from "./physicsData.js";

const RESOURCE_TYPES = ["전체", ...new Set(PHYSICS_RESOURCES.map(({ type }) => type))];

function LevelSelector({ level, onChange }) {
  return (
    <div className="level-selector" aria-label="물리 설명 수준">
      <span>설명 수준</span>
      <div>
        {[1, 2, 3, 4, 5].map((value) => (
          <button type="button" key={value} className={level === value ? "is-selected" : ""}
            onClick={() => onChange(value)} aria-pressed={level === value}>P{value}</button>
        ))}
      </div>
    </div>
  );
}

function PhysicsHeading({ level, onLevelChange, title, description, countLabel }) {
  return (
    <header className="domain-workspace-heading physics-heading">
      <div>
        <p className="system-kicker">PHYSICS WORKSPACE · CONFIGURABLE EXPLANATION LEVEL</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="workspace-heading-actions">
        <LevelSelector level={level} onChange={onLevelChange} />
        <span className="workspace-count">{countLabel}</span>
      </div>
    </header>
  );
}

function LearningHub({ level, onLevelChange, onOpenAi }) {
  const [selectedId, setSelectedId] = useState(PHYSICS_TOOLS[0].id);
  const selected = PHYSICS_TOOLS.find(({ id }) => id === selectedId) ?? PHYSICS_TOOLS[0];

  return (
    <main className="focused-workspace domain-workspace physics-workspace">
      <PhysicsHeading level={level} onLevelChange={onLevelChange} title="물리 학습 허브"
        description="공식 암기보다 개념, 수학 구조, 유도와 검산을 중심으로 작업합니다." countLabel="7 STUDY MODES" />
      <div className="physics-hub-layout">
        <aside className="physics-tool-index" aria-label="물리 학습 도구">
          {PHYSICS_TOOLS.map((tool) => (
            <button type="button" key={tool.id} className={tool.id === selected.id ? "is-selected" : ""}
              onClick={() => setSelectedId(tool.id)} aria-pressed={tool.id === selected.id}>
              <span>{tool.code}</span><strong>{tool.title}</strong><ArrowRight size={14} />
            </button>
          ))}
        </aside>
        <article className="physics-tool-reader">
          <header><span className="physics-tool-code">MODE {selected.code}</span><h3>{selected.title}</h3><p>{selected.summary}</p></header>
          <dl>
            <div><dt>입력</dt><dd>{selected.input}</dd></div>
            <div><dt>결과 구조</dt><dd>{selected.output}</dd></div>
            <div><dt>P{level} 예시</dt><dd>{selected.example}</dd></div>
          </dl>
          <section className="physics-working-area">
            <div><p className="system-kicker">WORKING NOTE</p><h4>분석할 내용을 이 화면에 모읍니다</h4></div>
            <p>AI 분석은 개인 전용 백엔드에서 실행되고 결과와 사용량은 소유자별 기록으로 저장됩니다.</p>
            <button type="button" onClick={() => onOpenAi({
              level: `P${level}`,
              contextKind: "physics-mode",
              contextId: selected.id,
              title: selected.title,
              meta: `물리 학습 모드 ${selected.code} · 설명 수준 P${level}`,
              placeholder: selected.example,
            })}><Brain size={18} /> {selected.title}로 AI 열기</button>
          </section>
        </article>
        <aside className="physics-quick-resources">
          <p className="system-kicker">OPEN RESOURCES</p><h3>바로 볼 자료</h3>
          {PHYSICS_RESOURCES.slice(0, 3).map((resource) => (
            <a key={resource.id} href={resource.href} target="_blank" rel="noreferrer">
              <span>{resource.topic}</span><strong>{resource.title}</strong><small>{resource.provider} · {resource.level}</small>
              <ArrowSquareOut size={14} aria-hidden="true" />
            </a>
          ))}
        </aside>
      </div>
    </main>
  );
}

function ResourceTable({ resources, onOpenAi, emptyLabel, level }) {
  return (
    <div className="physics-resource-table">
      <div className="resource-table-head" aria-hidden="true">
        <span>자료</span><span>유형</span><span>분야</span><span>수준</span><span>출처</span>
      </div>
      {resources.length ? resources.map((resource) => (
        <article key={resource.id}>
          <div className="resource-main">
            <span className="resource-save-state"><BookmarkSimple size={14} weight={resource.saved ? "fill" : "regular"} />{resource.saved ? "보관됨" : "외부 자료"}</span>
            <strong>{resource.title}</strong><p>{resource.description}</p>
          </div>
          <span>{resource.type}</span><span>{resource.topic}</span><span>{resource.level}</span>
          <div className="resource-provider"><span>{resource.provider}</span><small>{resource.language}</small></div>
          <div className="resource-actions">
            <a href={resource.href} target="_blank" rel="noreferrer">원문 열기 <ArrowSquareOut size={14} /></a>
            <button type="button" onClick={() => onOpenAi({
              level: `P${level}`,
              contextKind: "physics-resource",
              contextId: resource.id,
              title: resource.title,
              meta: `${resource.provider} · ${resource.topic} · ${resource.level}`,
              placeholder: "이 자료를 어떻게 공부하면 좋을지 선수지식과 학습 순서를 알려줘.",
            })}>AI와 보기</button>
          </div>
        </article>
      )) : <p className="workspace-empty">{emptyLabel}</p>}
    </div>
  );
}

function LibraryPage({ level, onLevelChange, onOpenAi, onNotice }) {
  const [query, setQuery] = useState("");
  const resources = useMemo(
    () => filterPhysicsResources(PHYSICS_RESOURCES, { query, savedOnly: true }),
    [query],
  );
  return (
    <main className="focused-workspace domain-workspace physics-workspace">
      <PhysicsHeading level={level} onLevelChange={onLevelChange} title="물리 자료 보관소"
        description="개인 파일은 직접 저장하고, 공개 강의·문제·논문은 링크와 메타데이터로 관리하는 혼합형 구조입니다."
        countLabel={`${resources.length} SAVED DEMO ITEMS`} />
      <section className="resource-workspace">
        <div className="resource-toolbar">
          <label className="workspace-search"><MagnifyingGlass size={17} /><span className="sr-only">보관 자료 검색</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·분야·출처 검색" /></label>
          <button type="button" className="primary-workspace-action" onClick={() => onNotice("파일 업로드는 백엔드 연결 후 활성화됩니다.")}>
            <FolderOpen size={17} /> 자료 추가
          </button>
        </div>
        <ResourceTable resources={resources} onOpenAi={onOpenAi} emptyLabel="보관 자료에서 검색 결과를 찾지 못했습니다." level={level} />
      </section>
    </main>
  );
}

function FinderPage({ level, onLevelChange, onOpenAi }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("전체");
  const resources = useMemo(
    () => filterPhysicsResources(PHYSICS_RESOURCES, { query, type }),
    [query, type],
  );
  return (
    <main className="focused-workspace domain-workspace physics-workspace">
      <PhysicsHeading level={level} onLevelChange={onLevelChange} title="물리 자료 찾기"
        description="현재는 검증한 공식 공개 강의와 올림피아드 출처만 검색합니다." countLabel={`${resources.length} VERIFIED LINKS`} />
      <section className="resource-workspace finder-workspace">
        <div className="finder-query">
          <MagnifyingGlass size={20} aria-hidden="true" />
          <label><span className="sr-only">물리 자료 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 전자기학 P4 강의, IPhO 기출문제" /></label>
        </div>
        <div className="resource-type-filter" aria-label="자료 유형">
          {RESOURCE_TYPES.map((item) => <button type="button" key={item} className={type === item ? "is-selected" : ""}
            onClick={() => setType(item)} aria-pressed={type === item}>{item}</button>)}
        </div>
        <ResourceTable resources={resources} onOpenAi={onOpenAi} emptyLabel="검색어 또는 자료 유형을 바꿔보세요." level={level} />
      </section>
    </main>
  );
}

function IphoPage({ level, onLevelChange, onOpenAi }) {
  return (
    <main className="focused-workspace domain-workspace physics-workspace ipho-workspace">
      <PhysicsHeading level={level} onLevelChange={onLevelChange} title="KPhO · IPhO 준비"
        description="KPhO를 먼저 준비하는 단계와 장기적인 IPhO 준비 영역을 한 공간에서 분리해 봅니다."
        countLabel="KPHO → IPHO" />
      <div className="ipho-layout">
        <section className="olympiad-path" aria-labelledby="olympiad-path-title">
          <header><p className="system-kicker">PREPARATION PATH</p><h3 id="olympiad-path-title">준비 단계</h3></header>
          <ol>
            <li className="is-current"><span>01</span><div><strong>일반물리 기반</strong><p>P3 내용을 완전히 자동화하고 P4 유도를 빈 종이에서 재구성합니다.</p></div></li>
            <li><span>02</span><div><strong>KPhO 준비</strong><p>공식 일정·교육과정을 확인하고 국내 선발 수준 문제에 적응합니다.</p></div></li>
            <li><span>03</span><div><strong>IPhO 이론·실험</strong><p>공식 syllabus 전체와 역대 문제를 이론·실험으로 나누어 훈련합니다.</p></div></li>
            <li><span>04</span><div><strong>국제대회 성과</strong><p>시간 제한, 풀이 서술, 실험 오차 분석까지 실전 수준으로 통합합니다.</p></div></li>
          </ol>
        </section>
        <section className="ipho-topic-matrix" aria-labelledby="ipho-topic-title">
          <header><p className="system-kicker">OFFICIAL SCOPE INDEX</p><h3 id="ipho-topic-title">준비 영역</h3></header>
          <div>{IPHO_TOPICS.map((topic, index) => <article key={topic.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{topic.label}</strong><p>{topic.detail}</p></article>)}</div>
        </section>
        <aside className="official-olympiad-links">
          <p className="system-kicker">OFFICIAL SOURCES</p><h3>공식 자료</h3>
          {PHYSICS_RESOURCES.filter(({ id }) => ["kpho-official", "ipho-syllabus", "ipho-problems"].includes(id)).map((resource) => (
            <a key={resource.id} href={resource.href} target="_blank" rel="noreferrer"><FileText size={17} />
              <span><strong>{resource.title}</strong><small>{resource.provider}</small></span><ArrowSquareOut size={14} /></a>
          ))}
          <button type="button" onClick={() => onOpenAi({
            level: `P${level}`,
            contextKind: "olympiad-track",
            contextId: "kpho-ipho",
            title: "KPhO에서 IPhO까지의 준비 계획",
            meta: `KPhO → IPhO 준비 트랙 · 데모 설명 수준 P${level}`,
            placeholder: "KPhO를 아직 시작하지 않은 상태에서 역학과 전자기학 중심의 첫 학습 순서를 짜줘.",
          })}><Trophy size={17} /> 준비 계획을 AI와 보기</button>
        </aside>
      </div>
    </main>
  );
}

export function PhysicsWorkspace({ view, onOpenAi, onNotice, level, onLevelChange }) {
  if (view === "library") return <LibraryPage level={level} onLevelChange={onLevelChange} onOpenAi={onOpenAi} onNotice={onNotice} />;
  if (view === "finder") return <FinderPage level={level} onLevelChange={onLevelChange} onOpenAi={onOpenAi} />;
  if (view === "ipho") return <IphoPage level={level} onLevelChange={onLevelChange} onOpenAi={onOpenAi} />;
  return <LearningHub level={level} onLevelChange={onLevelChange} onOpenAi={onOpenAi} />;
}
