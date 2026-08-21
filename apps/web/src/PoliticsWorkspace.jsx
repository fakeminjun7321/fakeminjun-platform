import { useMemo, useState } from "react";
import {
  ArrowRight,
  Brain,
  Buildings,
  Gavel,
  MagnifyingGlass,
  Scales,
} from "@phosphor-icons/react";
import {
  POLITICAL_AGENDAS,
  POLITICAL_INSTITUTIONS,
  filterPoliticalAgendas,
} from "./politicsData.js";

function LevelSelector({ level, onChange }) {
  return (
    <div className="level-selector" aria-label="정치 설명 수준">
      <span>설명 수준</span>
      <div>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            type="button"
            key={value}
            className={level === value ? "is-selected" : ""}
            onClick={() => onChange(value)}
            aria-pressed={level === value}
          >
            C{value}
          </button>
        ))}
      </div>
    </div>
  );
}

function PoliticsHeading({ level, onLevelChange, title, description, countLabel }) {
  return (
    <header className="domain-workspace-heading">
      <div>
        <p className="system-kicker">POLITICAL DESK · KOREA PRIMARY / UNITED STATES CONTEXT</p>
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

function AgendaDesk({ level, onLevelChange, onOpenAi }) {
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(POLITICAL_AGENDAS[0].id);
  const filtered = useMemo(
    () => filterPoliticalAgendas(POLITICAL_AGENDAS, scope, query),
    [scope, query],
  );
  const selected = filtered.find(({ id }) => id === selectedId) ?? filtered[0] ?? POLITICAL_AGENDAS[0];

  return (
    <main className="focused-workspace domain-workspace politics-workspace">
      <PoliticsHeading
        level={level}
        onLevelChange={onLevelChange}
        title="정치 데스크"
        description="뉴스 제목보다 누가 결정하고, 어느 절차에 있고, 무엇을 확인해야 하는지를 먼저 봅니다."
        countLabel="4 DEMO AGENDAS"
      />

      <div className="politics-desk-layout">
        <section className="agenda-queue" aria-label="샘플 정치 의제">
          <div className="queue-tools">
            <label className="workspace-search">
              <MagnifyingGlass size={17} aria-hidden="true" />
              <span className="sr-only">정치 의제 검색</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="의제·기관 검색" />
            </label>
            <div className="scope-filter" aria-label="국가 범위">
              {[
                ["all", "전체"],
                ["korea", "한국"],
                ["us", "미국"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={scope === value ? "is-selected" : ""}
                  onClick={() => setScope(value)}
                  aria-pressed={scope === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="agenda-list">
            {filtered.length ? filtered.map((agenda, index) => (
              <button
                type="button"
                key={agenda.id}
                className={selected.id === agenda.id ? "is-selected" : ""}
                onClick={() => setSelectedId(agenda.id)}
                aria-pressed={selected.id === agenda.id}
              >
                <span className="agenda-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="agenda-copy">
                  <span><strong>{agenda.scopeLabel}</strong><i>{agenda.kind}</i></span>
                  <b>{agenda.title}</b>
                  <small>{agenda.stage}</small>
                </span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            )) : (
              <p className="workspace-empty">검색 조건에 맞는 샘플 의제가 없습니다.</p>
            )}
          </div>
          <p className="demo-disclosure">실제 정치 현황이 아닌 화면 구조 확인용 샘플 의제입니다.</p>
        </section>

        <article className="political-dossier">
          <header>
            <div className="dossier-eyebrow">
              <span>{selected.scopeLabel}</span><span>{selected.kind}</span><span>DEMO CASE</span>
            </div>
            <h3>{selected.title}</h3>
            <p>{selected.summary}</p>
          </header>

          <section className="decision-stage" aria-labelledby="decision-stage-title">
            <div><p className="system-kicker">CURRENT STAGE</p><h4 id="decision-stage-title">{selected.stage}</h4></div>
            <ol>
              {selected.process.map((step, index) => (
                <li key={step} className={step === selected.stage ? "is-current" : ""}>
                  <span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>
                </li>
              ))}
            </ol>
          </section>

          <div className="political-reading-grid">
            <section>
              <p className="system-kicker">DECISION MAKERS</p>
              <h4>관련 기관</h4>
              <ul>{selected.institutions.map((item) => <li key={item}><Buildings size={15} />{item}</li>)}</ul>
            </section>
            <section>
              <p className="system-kicker">READING CHECK</p>
              <h4>C{level}에서 확인할 것</h4>
              <ul>{selected.readingPoints.slice(0, Math.min(3, Math.max(1, level - 1))).map((item) => <li key={item}><Scales size={15} />{item}</li>)}</ul>
            </section>
          </div>

          <footer className="dossier-action-bar">
            <span><Gavel size={17} /> 법안·예산·제도는 결정 절차를 분리해서 읽습니다.</span>
            <button
              type="button"
              onClick={() => onOpenAi({
                title: selected.title,
                meta: `${selected.scopeLabel} · ${selected.kind} · ${selected.stage} · 데모 의제`,
                placeholder: "이 의제의 결정 주체와 절차를 C2 수준으로 설명해줘.",
              })}
            >
              <Brain size={17} /> 이 의제로 AI 열기
            </button>
          </footer>
        </article>
      </div>
    </main>
  );
}

function InstitutionsDesk({ level, onLevelChange, onOpenAi }) {
  const [selectedId, setSelectedId] = useState(POLITICAL_INSTITUTIONS[0].id);
  const selected = POLITICAL_INSTITUTIONS.find(({ id }) => id === selectedId) ?? POLITICAL_INSTITUTIONS[0];

  return (
    <main className="focused-workspace domain-workspace politics-workspace">
      <PoliticsHeading
        level={level}
        onLevelChange={onLevelChange}
        title="제도 이해"
        description="기관 이름을 외우기보다 권한, 견제 관계, 자주 혼동하는 지점을 연결해서 봅니다."
        countLabel="4 CORE INSTITUTIONS"
      />
      <div className="institution-layout">
        <aside className="institution-index" aria-label="대한민국 주요 헌법기관">
          {POLITICAL_INSTITUTIONS.map((institution, index) => (
            <button
              type="button"
              key={institution.id}
              className={selected.id === institution.id ? "is-selected" : ""}
              onClick={() => setSelectedId(institution.id)}
              aria-pressed={selected.id === institution.id}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{institution.name}</strong>
              <small>{institution.english}</small>
            </button>
          ))}
        </aside>
        <article className="institution-reader">
          <header><p className="system-kicker">{selected.english}</p><h3>{selected.name}</h3><p>{selected.role}</p></header>
          <div>
            <section><p className="system-kicker">POWERS</p><h4>무엇을 결정하는가</h4><ul>{selected.powers.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section><p className="system-kicker">CHECKS</p><h4>무엇이 견제하는가</h4><ul>{selected.checks.map((item) => <li key={item}>{item}</li>)}</ul></section>
          </div>
          <aside><strong>자주 혼동하는 지점</strong><p>{selected.commonMistake}</p></aside>
          <button
            type="button"
            className="reader-ai-action"
            onClick={() => onOpenAi({
              title: `${selected.name}의 권한과 견제 관계`,
              meta: `대한민국 정치 제도 · 설명 수준 C${level}`,
              placeholder: `${selected.name}의 역할을 실제 정치 기사를 읽을 수 있도록 사례 중심으로 설명해줘.`,
            })}
          >
            <Brain size={17} /> 이 기관을 AI와 공부하기
          </button>
        </article>
      </div>
    </main>
  );
}

export function PoliticsWorkspace({ view, onOpenAi }) {
  const [level, setLevel] = useState(2);
  if (view === "institutions") {
    return <InstitutionsDesk level={level} onLevelChange={setLevel} onOpenAi={onOpenAi} />;
  }
  return <AgendaDesk level={level} onLevelChange={setLevel} onOpenAi={onOpenAi} />;
}
