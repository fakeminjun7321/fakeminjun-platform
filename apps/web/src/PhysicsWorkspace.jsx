import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowSquareOut,
  BookmarkSimple,
  Brain,
  DownloadSimple,
  FileArrowUp,
  FileText,
  MagnifyingGlass,
  ShieldWarning,
  Trash,
  Trophy,
} from "@phosphor-icons/react";
import { backendClient } from "./backendClient.js";
import { IPHO_TOPICS, PHYSICS_RESOURCES, PHYSICS_TOOLS, filterPhysicsResources } from "./physicsData.js";
import { PHYSICS_ANALYSIS_LEVEL, PHYSICS_PROFILE_SUMMARY } from "./physicsProfile.js";
import { startPhysicsScanPolling } from "./physicsScanPolling.js";

const RESOURCE_TYPES = ["전체", "강의·문제", "강의 영상", "동료평가 논문", "프리프린트", "기출문제", "공식 문서"];

function safeResourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizePhysicsResource(resource) {
  return {
    ...resource,
    id: String(resource.id ?? resource.externalId ?? resource.href ?? resource.url),
    href: resource.href ?? resource.url ?? resource.originalUrl,
    provider: resource.provider ?? resource.source?.name ?? "공개 자료",
    type: resource.type ?? "공개 자료",
    topic: resource.topic ?? "분야 미분류",
    level: resource.level ?? "수준 미분류",
    language: resource.language ?? "언어 미분류",
    description: resource.description ?? resource.summary ?? "설명이 제공되지 않았습니다.",
    saved: Boolean(resource.saved ?? resource.libraryId),
  };
}

function PhysicsHeading({ title, description, countLabel }) {
  return (
    <header className="domain-workspace-heading physics-heading">
      <div><p className="system-kicker">PHYSICS WORKSPACE · PERSONAL OLYMPIAD PROFILE</p><h2>{title}</h2><p>{description}</p><p className="physics-profile-summary">{PHYSICS_PROFILE_SUMMARY}</p></div>
      <div className="workspace-heading-actions"><span className="workspace-count">{countLabel}</span></div>
    </header>
  );
}

function LearningHub({ onOpenAi }) {
  const [selectedId, setSelectedId] = useState(PHYSICS_TOOLS[0].id);
  const selected = PHYSICS_TOOLS.find(({ id }) => id === selectedId) ?? PHYSICS_TOOLS[0];
  return (
    <main className="focused-workspace domain-workspace physics-workspace">
      <PhysicsHeading title="물리 학습 허브" description="공식 암기보다 개념, 수학 구조, 유도와 검산을 중심으로 작업합니다." countLabel="7 STUDY MODES" />
      <div className="physics-hub-layout">
        <aside className="physics-tool-index" aria-label="물리 학습 도구">{PHYSICS_TOOLS.map((tool) => (
          <button type="button" key={tool.id} className={tool.id === selected.id ? "is-selected" : ""} onClick={() => setSelectedId(tool.id)} aria-pressed={tool.id === selected.id}>
            <span>{tool.code}</span><strong>{tool.title}</strong><ArrowRight size={14} />
          </button>
        ))}</aside>
        <article className="physics-tool-reader">
          <header><span className="physics-tool-code">MODE {selected.code}</span><h3>{selected.title}</h3><p>{selected.summary}</p></header>
          <dl><div><dt>입력</dt><dd>{selected.input}</dd></div><div><dt>결과 구조</dt><dd>{selected.output}</dd></div><div><dt>학습 예시</dt><dd>{selected.example}</dd></div></dl>
          <section className="physics-working-area">
            <div><p className="system-kicker">WORKING NOTE</p><h4>분석할 내용을 이 화면에 모읍니다</h4></div>
            <p>그림·그래프 분석 모드에서는 Mandos의 내장 영역 캡처를 사용할 수 있습니다. 분석 기록은 소유자별로 보관됩니다.</p>
            <button type="button" onClick={() => onOpenAi({
              level: PHYSICS_ANALYSIS_LEVEL, contextKind: "physics-mode", contextId: selected.id, title: selected.title,
              ...(selected.id === "derivation" ? { taskType: "full-derivation" } : {}),
              meta: `물리 학습 모드 ${selected.code} · ${PHYSICS_PROFILE_SUMMARY}`, placeholder: selected.example,
            })}><Brain size={18} /> {selected.title}로 Mandos 열기</button>
          </section>
        </article>
        <aside className="physics-quick-resources">
          <p className="system-kicker">CURATED OPEN RESOURCES</p><h3>바로 볼 자료</h3>
          {PHYSICS_RESOURCES.slice(0, 3).map((resource) => (
            <a key={resource.id} href={resource.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
              <span>{resource.topic}</span><strong>{resource.title}</strong><small>{resource.provider} · {resource.level}</small><ArrowSquareOut size={14} aria-hidden="true" />
            </a>
          ))}
        </aside>
      </div>
    </main>
  );
}

function ResourceTable({ resources, onOpenAi, emptyLabel, onSave, onRemove, pendingIds = new Set() }) {
  return (
    <div className="physics-resource-table">
      <div className="resource-table-head" aria-hidden="true"><span>자료</span><span>유형</span><span>분야</span><span>수준</span><span>출처</span></div>
      {resources.length ? resources.map((resource) => {
        const resourceUrl = safeResourceUrl(resource.href);
        const pending = pendingIds.has(resource.id);
        return (
          <article key={resource.id}>
            <div className="resource-main">
              <span className="resource-save-state"><BookmarkSimple size={14} weight={resource.saved ? "fill" : "regular"} />{resource.saved ? "내 보관소" : "외부 공개 자료"}</span>
              <strong>{resource.title}</strong><p>{resource.description}</p>
            </div>
            <span>{resource.type}</span><span>{resource.topic}</span><span>{resource.level}</span>
            <div className="resource-provider"><span>{resource.provider}</span><small>{resource.language}</small></div>
            <div className="resource-actions">
              {resourceUrl ? <a href={resourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">원문 열기 <ArrowSquareOut size={14} /></a> : null}
              <button type="button" onClick={() => onOpenAi({
                level: PHYSICS_ANALYSIS_LEVEL, contextKind: "physics-resource", contextId: resource.id, title: resource.title,
                meta: `${resource.provider} · ${resource.topic} · ${resource.level}`, placeholder: "이 자료를 어떻게 공부하면 좋을지 선수지식과 학습 순서를 알려줘.",
              })}>Mandos와 보기</button>
              {resource.saved ? <button type="button" disabled={pending} onClick={() => onRemove?.(resource)}><Trash size={13} /> {pending ? "처리 중" : "보관 해제"}</button>
                : <button type="button" disabled={pending} onClick={() => onSave?.(resource)}><BookmarkSimple size={13} /> {pending ? "저장 중" : "보관"}</button>}
            </div>
          </article>
        );
      }) : <p className="workspace-empty">{emptyLabel}</p>}
    </div>
  );
}

function LibraryPage({ onOpenAi, onNotice }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ status: "loading", items: [], message: "개인 보관소를 불러오는 중입니다." });
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const requestRef = useRef(null);

  async function loadLibrary() {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setState((current) => ({ ...current, status: "loading", message: "개인 보관소를 불러오는 중입니다." }));
    try {
      const result = await backendClient.listPhysicsLibrary({ signal: controller.signal });
      const items = (Array.isArray(result) ? result : result?.items ?? []).map(normalizePhysicsResource).map((item) => ({ ...item, saved: true }));
      setState({ status: "ready", items, message: "" });
    } catch (error) {
      if (error?.name !== "AbortError") setState((current) => ({ ...current, status: "error", message: error?.message ?? "개인 보관소를 불러오지 못했습니다." }));
    }
  }

  useEffect(() => {
    void loadLibrary();
    return () => requestRef.current?.abort();
  }, []);

  const resources = useMemo(() => filterPhysicsResources(state.items, { query }), [query, state.items]);

  async function removeResource(resource) {
    setPendingIds((current) => new Set(current).add(resource.id));
    try {
      await backendClient.removePhysicsResource(resource.libraryId ?? resource.id);
      setState((current) => ({ ...current, items: current.items.filter((item) => item.id !== resource.id) }));
      onNotice("보관소에서 자료를 제거했습니다. 원문에는 영향을 주지 않습니다.");
    } catch (error) {
      onNotice(error?.message ?? "보관 자료를 제거하지 못했습니다.");
    } finally {
      setPendingIds((current) => { const next = new Set(current); next.delete(resource.id); return next; });
    }
  }

  async function exportObsidian() {
    try {
      const blob = await backendClient.exportPhysicsLibraryToObsidian();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "physics-library.md";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onNotice("Obsidian용 Markdown 다운로드를 시작했습니다.");
    } catch (error) {
      onNotice(error?.message ?? "Obsidian 내보내기를 만들지 못했습니다.");
    }
  }

  return (
    <main className="focused-workspace domain-workspace physics-workspace">
      <PhysicsHeading title="물리 자료 보관소" description="공개 자료 링크와 직접 올린 PDF·이미지를 분리해 개인 보관소에서 관리합니다." countLabel={`${state.items.length} SAVED LINKS`} />
      <PhysicsFileVault onOpenAi={onOpenAi} onNotice={onNotice} />
      <section className="resource-workspace">
        <div className="resource-toolbar">
          <label className="workspace-search"><MagnifyingGlass size={17} /><span className="sr-only">보관 자료 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·분야·출처 검색" /></label>
          <button type="button" className="primary-workspace-action obsidian-export" onClick={exportObsidian} disabled={state.status !== "ready" || !state.items.length}><DownloadSimple size={17} /> Obsidian Markdown</button>
        </div>
        {state.message ? <p className={`resource-query-status is-${state.status}`} role="status">{state.message}</p> : null}
        <ResourceTable resources={resources} onOpenAi={onOpenAi} onRemove={removeResource} pendingIds={pendingIds} emptyLabel={state.status === "loading" ? "개인 보관소를 불러오는 중입니다." : "저장된 자료가 없거나 검색 결과가 없습니다."} />
      </section>
    </main>
  );
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "크기 미상";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function antivirusLabel(status) {
  return ({
    clean: "ClamAV CLEAN",
    blocked: "보안 검사 차단",
    error: "백신 검사 오류",
    "not-scanned": "격리 검사 대기",
  })[status] ?? "검사 상태 미상";
}

function PhysicsFileVault({ onOpenAi, onNotice }) {
  const [state, setState] = useState({
    status: "loading",
    items: [],
    quota: null,
    storage: "unknown",
    scanner: "unknown",
    message: "개인 파일 목록을 불러오는 중입니다.",
  });
  const [pendingId, setPendingId] = useState(null);
  const inputRef = useRef(null);
  const requestRef = useRef(null);

  async function loadFiles() {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      const response = await backendClient.listPhysicsFiles({ signal: controller.signal });
      setState({
        status: "ready",
        items: response.data ?? [],
        quota: response.meta?.quota ?? null,
        storage: response.meta?.storage ?? "unavailable",
        scanner: response.meta?.scanner ?? "unavailable",
        message: "",
      });
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") setState((current) => ({ ...current, status: "error", message: error?.message ?? "개인 파일을 불러오지 못했습니다." }));
      return false;
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  useEffect(() => {
    void loadFiles();
    return () => requestRef.current?.abort();
  }, []);

  const pendingScanKey = state.items
    .filter((file) => file.antivirusStatus === "not-scanned")
    .map((file) => file.id)
    .join(",");
  useEffect(() => {
    if (!pendingScanKey) return undefined;
    return startPhysicsScanPolling(loadFiles);
  }, [pendingScanKey]);

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      onNotice("파일은 10MiB 이하여야 합니다.");
      return;
    }
    setPendingId("upload");
    setState((current) => ({ ...current, message: `${file.name}을 비공개 저장소에 올리는 중입니다.` }));
    try {
      const saved = await backendClient.uploadPhysicsFile(file);
      const existed = state.items.some((item) => item.id === saved.id);
      const refreshed = await loadFiles();
      if (refreshed) {
        setState((current) => ({ ...current, message: existed
          ? "이미 보관 중인 동일 파일을 다시 사용합니다. 저장 용량은 늘어나지 않았습니다."
          : "격리 저장이 끝났습니다. ClamAV 검사가 끝나면 다운로드와 AI 분석이 열립니다." }));
        onNotice("개인 물리 파일을 격리 저장하고 백신 검사를 요청했습니다.");
      } else {
        onNotice("파일은 저장됐지만 최신 목록을 다시 불러오지 못했습니다.");
      }
    } catch (error) {
      setState((current) => ({ ...current, status: "error", message: error?.message ?? "파일을 저장하지 못했습니다." }));
    } finally {
      setPendingId(null);
    }
  }

  async function remove(file) {
    setPendingId(file.id);
    try {
      await backendClient.deletePhysicsFile(file.id);
      const refreshed = await loadFiles();
      if (refreshed) {
        setState((current) => ({ ...current, message: "파일 원본과 메타데이터를 삭제했습니다." }));
        onNotice("개인 물리 파일을 삭제했습니다.");
      } else {
        onNotice("파일은 삭제됐지만 최신 목록을 다시 불러오지 못했습니다.");
      }
    } catch (error) {
      onNotice(error?.message ?? "파일을 삭제하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="physics-file-vault" aria-labelledby="physics-file-vault-title">
      <header>
        <div><h3 id="physics-file-vault-title">개인 파일</h3><p>PDF·PNG·JPEG · 최대 10MiB · {state.storage === "private-r2" ? "비공개 R2" : "저장소 연결 확인 필요"}</p></div>
        <div><span>{state.quota
          ? `${state.quota.usedFiles}/${state.quota.maxFiles} FILES · ${formatFileSize(state.quota.usedBytes)} / ${formatFileSize(state.quota.maxBytes)}`
          : `${state.items.length} FILES`}</span><button type="button" onClick={() => inputRef.current?.click()} disabled={pendingId === "upload" || state.storage !== "private-r2" || state.scanner !== "async-clamav"}><FileArrowUp size={17} />{pendingId === "upload" ? "업로드 중" : "파일 추가"}</button></div>
        <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={upload} />
      </header>
      <div className="physics-file-security"><ShieldWarning size={17} /><p><strong>{state.storage === "unavailable" ? "비공개 저장소 미연결" : state.scanner === "async-clamav" ? "격리형 ClamAV 검사" : "백신 검사 미연결"}</strong> {state.storage === "unavailable"
        ? "현재 환경에서는 업로드·다운로드·파일 분석을 사용할 수 없습니다."
        : state.scanner === "async-clamav"
          ? "새 파일은 비공개 격리 구역에서 검사되며 clean 판정과 객체 무결성이 확인되기 전까지 사용할 수 없습니다."
          : "백신 파이프라인이 연결될 때까지 새 파일 업로드와 사용이 차단됩니다."}</p></div>
      {state.message ? <p className={`resource-query-status is-${state.status}`} role="status">{state.message}</p> : null}
      <div className="physics-file-list">
        {state.items.map((file) => {
          const actionsAvailable = state.storage === "private-r2" && file.antivirusStatus === "clean";
          return <article key={file.id}>
            <FileText size={20} />
            <div><strong>{file.filename}</strong><span>{formatFileSize(file.byteSize)} · {file.mimeType}</span><small>SHA-256 {file.sha256.slice(0, 12)}… · {antivirusLabel(file.antivirusStatus)}</small></div>
            <div className="physics-file-actions">
              {actionsAvailable ? <a href={file.downloadUrl}>다운로드</a> : <span>다운로드 차단</span>}
              <button type="button" onClick={() => onOpenAi({
                level: PHYSICS_ANALYSIS_LEVEL,
                contextKind: "physics-file",
                contextId: file.id,
                title: file.filename,
                meta: `${file.mimeType} · ${formatFileSize(file.byteSize)} · ${antivirusLabel(file.antivirusStatus)}`,
                placeholder: "이 자료의 핵심 개념과 수식을 페이지 근거와 함께 분석해줘.",
              })} disabled={!actionsAvailable}>Mandos 분석</button>
              <button type="button" className="is-danger" onClick={() => void remove(file)} disabled={pendingId === file.id}><Trash size={14} />{pendingId === file.id ? "삭제 중" : "삭제"}</button>
            </div>
          </article>;
        })}
        {state.status === "ready" && !state.items.length ? <p>직접 올린 파일이 없습니다.</p> : null}
      </div>
    </section>
  );
}

function FinderPage({ onOpenAi, onNotice }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("전체");
  const [state, setState] = useState({ status: "idle", items: [], cursor: null, message: "검색어를 입력하면 서버가 허용한 공개 물리 자료 출처를 조회합니다." });
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function search(event, { append = false } = {}) {
    event?.preventDefault?.();
    const normalized = query.trim();
    if (!normalized || state.status === "loading") return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setState((current) => ({ ...current, status: "loading", message: "공개 자료 출처를 검색하고 있습니다." }));
    try {
      const result = await backendClient.searchPhysicsResources({
        query: normalized,
        ...(type === "전체" ? {} : { type }),
        cursor: append ? state.cursor : null,
        limit: 20,
        signal: controller.signal,
      });
      const items = (result.data ?? []).map(normalizePhysicsResource);
      setState((current) => ({
        status: "ready",
        items: append ? [...current.items, ...items.filter((item) => !current.items.some((existing) => existing.id === item.id))] : items,
        cursor: result.meta?.nextCursor ?? null,
        message: items.length
          ? `공개 자료 ${items.length}건 · arXiv/Crossref 결과는 메타데이터이며 내용 검증 전입니다.`
          : "검색 결과가 없습니다.",
      }));
    } catch (error) {
      if (error?.name !== "AbortError") setState((current) => ({ ...current, status: "error", message: error?.message ?? "공개 자료 검색에 실패했습니다." }));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  async function saveResource(resource) {
    setPendingIds((current) => new Set(current).add(resource.id));
    try {
      const saved = normalizePhysicsResource(await backendClient.savePhysicsResource({ resourceId: resource.id }));
      setState((current) => ({ ...current, items: current.items.map((item) => item.id === resource.id ? { ...item, ...saved, saved: true } : item) }));
      onNotice("개인 물리 보관소에 저장했습니다.");
    } catch (error) {
      onNotice(error?.message ?? "자료를 저장하지 못했습니다.");
    } finally {
      setPendingIds((current) => { const next = new Set(current); next.delete(resource.id); return next; });
    }
  }

  async function removeResource(resource) {
    setPendingIds((current) => new Set(current).add(resource.id));
    try {
      await backendClient.removePhysicsResource(resource.libraryId ?? resource.id);
      setState((current) => ({ ...current, items: current.items.map((item) => item.id === resource.id ? { ...item, saved: false, libraryId: null } : item) }));
      onNotice("개인 보관소에서 제거했습니다.");
    } catch (error) {
      onNotice(error?.message ?? "보관 자료를 제거하지 못했습니다.");
    } finally {
      setPendingIds((current) => { const next = new Set(current); next.delete(resource.id); return next; });
    }
  }

  return (
    <main className="focused-workspace domain-workspace physics-workspace">
      <PhysicsHeading title="물리 자료 찾기" description="검색할 때만 서버가 허용한 공개 출처를 조회하며, 결과를 개인 보관소에 따로 저장할 수 있습니다." countLabel={state.status === "ready" ? `${state.items.length} LIVE SEARCH RESULTS` : "SERVER SEARCH"} />
      <section className="resource-workspace finder-workspace">
        <form className="finder-query" onSubmit={search}><MagnifyingGlass size={20} aria-hidden="true" /><label><span className="sr-only">물리 자료 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 전자기학 심화 강의, IPhO 기출문제" /></label><button type="submit" disabled={!query.trim() || state.status === "loading"}>{state.status === "loading" ? "검색 중" : "실제 출처 검색"}</button></form>
        <div className="resource-type-filter" aria-label="자료 유형">{RESOURCE_TYPES.map((item) => <button type="button" key={item} className={type === item ? "is-selected" : ""} onClick={() => setType(item)} aria-pressed={type === item}>{item}</button>)}</div>
        <p className={`resource-query-status is-${state.status}`} role="status">{state.message}</p>
        <ResourceTable resources={state.items} onOpenAi={onOpenAi} onSave={saveResource} onRemove={removeResource} pendingIds={pendingIds} emptyLabel={state.status === "ready" ? "검색어 또는 자료 유형을 바꿔보세요." : "검색을 실행하면 실제 결과가 이곳에 표시됩니다."} />
        {state.cursor ? <button type="button" className="resource-load-more" onClick={(event) => search(event, { append: true })} disabled={state.status === "loading"}>다음 결과 불러오기</button> : null}
      </section>
    </main>
  );
}

function IphoPage({ onOpenAi }) {
  return (
    <main className="focused-workspace domain-workspace physics-workspace ipho-workspace">
      <PhysicsHeading title="KPhO · IPhO 준비" description="KPhO를 먼저 준비하는 단계와 장기적인 IPhO 준비 영역을 한 공간에서 분리해 봅니다." countLabel="KPHO → IPHO" />
      <div className="ipho-layout">
        <section className="olympiad-path" aria-labelledby="olympiad-path-title"><header><p className="system-kicker">PREPARATION PATH</p><h3 id="olympiad-path-title">준비 단계</h3></header><ol>
          <li className="is-current"><span>01</span><div><strong>일반물리 기반</strong><p>P3 내용을 완전히 자동화하고 P4 유도를 빈 종이에서 재구성합니다.</p></div></li>
          <li><span>02</span><div><strong>KPhO 준비</strong><p>공식 일정·교육과정을 확인하고 국내 선발 수준 문제에 적응합니다.</p></div></li>
          <li><span>03</span><div><strong>IPhO 이론·실험</strong><p>공식 syllabus 전체와 역대 문제를 이론·실험으로 나누어 훈련합니다.</p></div></li>
          <li><span>04</span><div><strong>국제대회 성과</strong><p>시간 제한, 풀이 서술, 실험 오차 분석까지 실전 수준으로 통합합니다.</p></div></li>
        </ol></section>
        <section className="ipho-topic-matrix" aria-labelledby="ipho-topic-title"><header><p className="system-kicker">OFFICIAL SCOPE INDEX</p><h3 id="ipho-topic-title">준비 영역</h3></header><div>{IPHO_TOPICS.map((topic, index) => <article key={topic.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{topic.label}</strong><p>{topic.detail}</p></article>)}</div></section>
        <aside className="official-olympiad-links"><p className="system-kicker">OFFICIAL SOURCES</p><h3>공식 자료</h3>
          {PHYSICS_RESOURCES.filter(({ id }) => ["kpho-official", "ipho-syllabus", "ipho-problems"].includes(id)).map((resource) => (
            <a key={resource.id} href={resource.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><FileText size={17} /><span><strong>{resource.title}</strong><small>{resource.provider}</small></span><ArrowSquareOut size={14} /></a>
          ))}
          <button type="button" onClick={() => onOpenAi({ level: PHYSICS_ANALYSIS_LEVEL, contextKind: "olympiad-track", contextId: "kpho-ipho", title: "KPhO에서 IPhO까지의 준비 계획", meta: `KPhO → IPhO 준비 트랙 · ${PHYSICS_PROFILE_SUMMARY}`, placeholder: "KPhO를 아직 시작하지 않은 상태에서 역학과 전자기학 중심의 첫 학습 순서를 짜줘." })}><Trophy size={17} /> 준비 계획을 Mandos와 보기</button>
        </aside>
      </div>
    </main>
  );
}

export function PhysicsWorkspace({ view, onOpenAi, onNotice }) {
  if (view === "library") return <LibraryPage onOpenAi={onOpenAi} onNotice={onNotice} />;
  if (view === "finder") return <FinderPage onOpenAi={onOpenAi} onNotice={onNotice} />;
  if (view === "ipho") return <IphoPage onOpenAi={onOpenAi} />;
  return <LearningHub onOpenAi={onOpenAi} />;
}

export default PhysicsWorkspace;
