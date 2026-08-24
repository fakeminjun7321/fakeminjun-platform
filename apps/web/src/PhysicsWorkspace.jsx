import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSquareOut,
  BookmarkSimple,
  DownloadSimple,
  FileArrowUp,
  FileText,
  FolderOpen,
  MagnifyingGlass,
  ShieldWarning,
  Trash,
} from "@phosphor-icons/react";
import { backendClient } from "./backendClient.js";
import { filterPhysicsResources } from "./physicsData.js";
import { PhysicsCanvasWorkspace } from "./PhysicsCanvasWorkspace.jsx";
import { PHYSICS_ANALYSIS_LEVEL, PHYSICS_PROFILE_SUMMARY } from "./physicsProfile.js";
import { startPhysicsScanPolling } from "./physicsScanPolling.js";
import {
  GOOGLE_DRIVE_UPLOAD_MAX_BYTES,
  isGoogleDrivePdfFile,
  uploadFileToGoogleDriveSession,
} from "./googleDriveUpload.js";

const RESOURCE_TYPES = ["전체", "강의·문제", "강의 영상", "동료평가 논문", "프리프린트", "기출문제", "공식 문서"];
const DRIVE_COMPLETION_STORAGE_KEY = "studio7321.drive-upload-completion.v1";
let googleDriveCapturedCallback = null;
let googleDriveCallbackRelay = null;

function readSessionValue(key) {
  try {
    return JSON.parse(window.sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeSessionValue(key, value) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session recovery is best-effort; the server remains the source of truth.
  }
}

function readPendingDriveCompletion() {
  const value = readSessionValue(DRIVE_COMPLETION_STORAGE_KEY);
  return value
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.sessionId ?? "")
    && /^[A-Za-z0-9_-]{10,200}$/u.test(value.driveFileId ?? "")
    && typeof value.name === "string"
    ? value
    : null;
}

function isTerminalDriveCompletion(error) {
  return error?.status === 410 || [
    "google_drive_upload_expired",
    "google_drive_upload_not_ready",
    "google_drive_upload_conflict",
    "google_drive_upload_verification_failed",
  ].includes(error?.code);
}

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
      <div><p className="system-kicker">개인 물리 워크스페이스</p><h2>{title}</h2><p>{description}</p><p className="physics-profile-summary">{PHYSICS_PROFILE_SUMMARY}</p></div>
      <div className="workspace-heading-actions"><span className="workspace-count">{countLabel}</span></div>
    </header>
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

function SavedLibrary({ onOpenAi, onNotice }) {
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
      if (error?.name !== "AbortError") setState((current) => ({ ...current, status: "error", message: "개인 보관소를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." }));
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
      onNotice("보관 자료를 제거하지 못했습니다. 잠시 후 다시 시도해 주세요.");
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
      onNotice("Markdown 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
      <section className="resource-workspace saved-resource-workspace" aria-labelledby="saved-resource-title">
        <header className="drive-section-heading">
          <div><span>LINK INDEX</span><h3 id="saved-resource-title">보관 링크</h3><p>공개 출처에서 저장한 자료를 Drive 작업 화면에서 함께 관리합니다.</p></div>
          <strong>{state.items.length}개</strong>
        </header>
        <div className="resource-toolbar">
          <label className="workspace-search"><MagnifyingGlass size={17} /><span className="sr-only">보관 자료 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·분야·출처 검색" /></label>
          <button type="button" className="primary-workspace-action obsidian-export" onClick={exportObsidian} disabled={state.status !== "ready" || !state.items.length}><DownloadSimple size={17} /> Markdown 내보내기</button>
        </div>
        {state.message ? <p className={`resource-query-status is-${state.status}`} role="status">{state.message}</p> : null}
        <ResourceTable resources={resources} onOpenAi={onOpenAi} onRemove={removeResource} pendingIds={pendingIds} emptyLabel={state.status === "loading" ? "개인 보관소를 불러오는 중입니다." : "저장된 자료가 없거나 검색 결과가 없습니다."} />
      </section>
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
    clean: "안전 확인 완료",
    blocked: "안전 검사 차단",
    error: "안전 검사 오류",
    "not-scanned": "안전 검사 대기",
  })[status] ?? "검사 상태 미상";
}

function safeGoogleAuthorizationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.origin === "https://accounts.google.com"
      && url.pathname === "/o/oauth2/v2/auth"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeGoogleDriveViewUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && ["drive.google.com", "docs.google.com"].includes(url.hostname)
      && !url.username
      && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseGoogleDriveCallbackSearch(search) {
  const params = new URLSearchParams(search ?? "");
  const state = params.get("state")?.trim() ?? "";
  const code = params.get("code")?.trim() ?? "";
  const error = params.get("error")?.trim() ?? "";
  const pickedFileIdsValue = params.get("picked_file_ids")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/u.test(state)) return null;
  if (error && /^[A-Za-z0-9_.-]{1,100}$/u.test(error) && !code && !pickedFileIdsValue) return { state, error };
  if (code && code.length <= 4096 && !error) {
    if (!pickedFileIdsValue) return { state, code };
    const pickedFileIds = pickedFileIdsValue.split(",").map((fileId) => fileId.trim());
    if (pickedFileIds.length < 1 || pickedFileIds.length > 10
      || pickedFileIds.some((fileId) => !/^[A-Za-z0-9_-]{10,200}$/u.test(fileId))
      || new Set(pickedFileIds).size !== pickedFileIds.length) return null;
    return { state, code, pickedFileIds };
  }
  return null;
}

export function googleDriveConnectionErrorMessage(error) {
  return ({
    google_oauth_client_invalid: "서버의 Google 연결 비밀번호가 현재 설정과 맞지 않습니다. 연결 설정을 새 비밀번호로 갱신해야 합니다.",
    google_oauth_grant_invalid: "Google의 일회용 연결 코드가 유효하지 않습니다. 새 연결을 시작해 다시 확인해 주세요.",
    google_oauth_redirect_mismatch: "Google에 등록된 사이트 복귀 주소가 현재 주소와 맞지 않습니다.",
    google_oauth_client_unauthorized: "현재 Google OAuth 클라이언트에서 이 연결 방식을 사용할 수 없습니다.",
    google_oauth_request_invalid: "Google 연결 요청 형식이 올바르지 않습니다. 서버 설정을 확인해야 합니다.",
    google_oauth_scope_mismatch: "Google이 선택 파일 전용 권한과 다른 권한을 반환해 연결을 중단했습니다.",
    google_refresh_token_missing: "Google에서 장기 연결 정보가 반환되지 않았습니다. 새 연결 승인이 필요합니다.",
    google_oauth_timeout: "Google 연결 응답 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.",
  })[error?.code] ?? "Google Drive 연결을 완료하지 못했습니다. 연결 설정을 확인한 뒤 새 연결을 시작해 주세요.";
}

function takeGoogleDriveCallbackOnce() {
  if (googleDriveCapturedCallback) return googleDriveCapturedCallback;
  if (typeof window === "undefined") return null;
  const callback = parseGoogleDriveCallbackSearch(window.location.search);
  if (!callback) return null;
  googleDriveCapturedCallback = callback;
  window.history.replaceState({}, "", "/physics/drive?drive=connecting");
  return callback;
}

function clearGoogleDriveCallback(callback) {
  if (googleDriveCapturedCallback === callback) googleDriveCapturedCallback = null;
}

function relayGoogleDriveCallback(callback) {
  if (googleDriveCallbackRelay?.state === callback.state) return googleDriveCallbackRelay.promise;
  const promise = backendClient.finishGoogleDriveConnection(callback);
  googleDriveCallbackRelay = { state: callback.state, promise };
  void promise.finally(() => {
    if (googleDriveCallbackRelay?.promise === promise) googleDriveCallbackRelay = null;
  }).catch(() => {});
  return promise;
}

function GoogleDriveVault({ onNotice }) {
  const callback = takeGoogleDriveCallbackOnce();
  const [state, setState] = useState({
    status: "loading",
    configured: false,
    connected: false,
    catalogItemCount: 0,
    items: [],
    progress: 0,
    pendingCompletion: null,
    catalogRefreshNeeded: false,
    message: "Google Drive 연결 상태를 확인하고 있습니다.",
  });
  const requestRef = useRef(null);
  const inputRef = useRef(null);

  async function load(signal, outcome = null) {
    const [status, items] = await Promise.all([
      backendClient.getGoogleDriveStatus({ signal }),
      backendClient.listPhysicsDriveItems({ signal }),
    ]);
    setState((current) => ({
      ...current,
      status: "ready",
      configured: Boolean(status.configured),
      connected: Boolean(status.connected),
      catalogItemCount: Number(status.catalogItemCount ?? items.data.length),
      items: items.data,
      progress: 0,
      pendingCompletion: readPendingDriveCompletion(),
      catalogRefreshNeeded: false,
      message: outcome === "connected"
        ? "Google Drive 연결이 완료되었습니다. 이제 PDF를 전용 폴더에 바로 추가할 수 있습니다."
        : outcome === "selected"
          ? "Drive에서 선택한 PDF를 자료실에 등록했습니다."
        : outcome === "cancelled"
          ? "Google Drive 연결을 취소했습니다. 변경된 파일은 없습니다."
          : readPendingDriveCompletion()
            ? "Drive 업로드는 끝났지만 사이트 목록 등록 확인이 남아 있습니다. 아래에서 이어서 확인할 수 있습니다."
            : "",
    }));
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    requestRef.current = controller;
    const outcome = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("drive");
    void (async () => {
      try {
        if (callback) {
          setState((current) => ({ ...current, status: "connecting", message: "Google Drive 연결을 안전하게 확인하고 있습니다." }));
          const result = await relayGoogleDriveCallback(callback);
          if (!active) return;
          const nextOutcome = result.outcome === "cancelled"
            ? "cancelled"
            : result.outcome === "selected"
              ? "selected"
              : "connected";
          clearGoogleDriveCallback(callback);
          window.history.replaceState({}, "", `/physics/drive?drive=${nextOutcome}`);
          try {
            await load(controller.signal, nextOutcome);
          } catch (error) {
            if (error?.name !== "AbortError" && ["connected", "selected"].includes(nextOutcome)) {
              setState((current) => ({
                ...current,
                status: "ready",
                configured: true,
                connected: true,
                message: "Google Drive 연결은 저장됐지만 최신 자료 목록을 다시 불러오지 못했습니다.",
              }));
            } else if (error?.name !== "AbortError") throw error;
          }
          return;
        }
        await load(controller.signal, outcome);
      } catch (error) {
        if (error?.name !== "AbortError" && active) {
          let latestStatus = null;
          if (callback) {
            for (let attempt = 0; attempt < 4; attempt += 1) {
              try {
                latestStatus = await backendClient.getGoogleDriveStatus();
                if (latestStatus.connected) break;
              } catch {
                // A lost callback response is resolved against the server-owned connection state.
              }
              if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
            }
          }
          if (!active) return;
          if (latestStatus?.connected) {
            clearGoogleDriveCallback(callback);
            window.history.replaceState({}, "", "/physics/drive?drive=connected");
            setState((current) => ({
              ...current,
              status: "ready",
              configured: true,
              connected: true,
              catalogItemCount: Number(latestStatus.catalogItemCount ?? current.catalogItemCount),
              message: "Google Drive 연결이 완료되었습니다. 최신 목록은 잠시 후 다시 확인할 수 있습니다.",
            }));
          } else {
            if (callback) {
              clearGoogleDriveCallback(callback);
              window.history.replaceState({}, "", "/physics/drive?drive=error");
            }
            setState((current) => ({
              ...current,
              status: "error",
              configured: callback ? true : Boolean(latestStatus?.configured ?? current.configured),
              connected: false,
              message: callback
                ? googleDriveConnectionErrorMessage(error)
                : "Google Drive 연결 상태를 불러오지 못했습니다.",
            }));
          }
        }
      }
    })();
    return () => {
      active = false;
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, []);

  async function connect() {
    if (!state.configured || state.status === "connecting") return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setState((current) => ({ ...current, status: "connecting", message: "Google의 선택 파일 전용 권한 화면을 준비하고 있습니다." }));
    try {
      const result = await backendClient.startGoogleDriveConnection({ signal: controller.signal });
      const authorizationUrl = safeGoogleAuthorizationUrl(result.authorizationUrl);
      if (!authorizationUrl) throw new Error("Unexpected Google authorization URL");
      window.location.assign(authorizationUrl);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setState((current) => ({ ...current, status: "error", message: "Google Drive 연결을 시작하지 못했습니다." }));
        onNotice("Google Drive 연결 설정을 다시 확인해 주세요.");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  async function uploadSelectedPdf(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!state.connected) {
      onNotice("먼저 Google Drive를 연결해 주세요.");
      return;
    }
    if (!/\.pdf$/iu.test(file.name) || file.size < 1 || file.size > GOOGLE_DRIVE_UPLOAD_MAX_BYTES
      || !(await isGoogleDrivePdfFile(file))) {
      onNotice("512MiB 이하 PDF 파일만 Drive 원본 보관소에 추가할 수 있습니다.");
      return;
    }
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setState((current) => ({
      ...current,
      status: "uploading",
      progress: 0,
      message: `${file.name}의 안전한 Drive 업로드 통로를 준비하고 있습니다.`,
    }));
    try {
      const session = await backendClient.startPhysicsDriveUpload(
        { name: file.name, byteSize: file.size },
        { signal: controller.signal, idempotencyKey: crypto.randomUUID() },
      );
      if (session.status === "completed") {
        await load(controller.signal);
        return;
      }
      setState((current) => ({ ...current, message: `${file.name}을 Google Drive에 올리는 중입니다.` }));
      const uploaded = await uploadFileToGoogleDriveSession({
        file,
        uploadUrl: session.uploadUrl,
        signal: controller.signal,
        onProgress: (progress) => setState((current) => ({ ...current, progress })),
      });
      const pendingCompletion = { sessionId: session.id, driveFileId: uploaded.driveFileId, name: file.name };
      writeSessionValue(DRIVE_COMPLETION_STORAGE_KEY, pendingCompletion);
      setState((current) => ({
        ...current,
        status: "finalizing",
        progress: 100,
        pendingCompletion,
        message: "Drive 업로드 완료 · 실제 파일 정보와 사이트 목록 등록을 확인하고 있습니다.",
      }));
      await finishDriveCatalogRegistration(pendingCompletion, controller);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setState((current) => ({ ...current, status: "error", message: error?.message || "Google Drive PDF 업로드를 완료하지 못했습니다." }));
        onNotice("Google Drive 업로드를 완료하지 못했습니다.");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  async function selectExistingDrivePdfs() {
    if (!state.connected) {
      onNotice("먼저 Google Drive를 연결해 주세요.");
      return;
    }
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setState((current) => ({
      ...current,
      status: "picking",
      message: "Google Drive에서 접근을 허용할 PDF를 고르는 창을 준비하고 있습니다.",
    }));
    try {
      const result = await backendClient.startPhysicsDrivePicker({ signal: controller.signal });
      const authorizationUrl = safeGoogleAuthorizationUrl(result.authorizationUrl);
      if (!authorizationUrl) throw new Error("Unexpected Google authorization URL");
      window.location.assign(authorizationUrl);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setState((current) => ({
          ...current,
          status: "error",
          message: error?.message || "Google Drive에서 선택한 PDF를 등록하지 못했습니다.",
        }));
        onNotice("Drive 선택 파일 등록을 완료하지 못했습니다.");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  function cancelUpload() {
    requestRef.current?.abort();
    setState((current) => ({ ...current, status: "ready", progress: 0, message: "업로드를 중단했습니다. 다시 추가하면 새 업로드로 안전하게 시작합니다." }));
  }

  async function finishDriveCatalogRegistration(pendingCompletion, existingController = null) {
    const controller = existingController ?? new AbortController();
    if (!existingController) {
      requestRef.current?.abort();
      requestRef.current = controller;
    }
    setState((current) => ({
      ...current,
      status: "finalizing",
      pendingCompletion,
      message: "Drive 업로드는 완료됐습니다. 사이트 목록 등록을 확인하고 있습니다.",
    }));
    try {
      let item;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          item = await backendClient.completePhysicsDriveUpload(
            pendingCompletion.sessionId,
            { driveFileId: pendingCompletion.driveFileId },
            { signal: controller.signal },
          );
          break;
        } catch (error) {
          if (error?.name === "AbortError" || error?.status < 500 || attempt === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
        }
      }
      writeSessionValue(DRIVE_COMPLETION_STORAGE_KEY, null);
      setState((current) => ({
        ...current,
        status: "ready",
        progress: 0,
        pendingCompletion: null,
        catalogItemCount: current.items.some(({ id }) => id === item.id)
          ? current.catalogItemCount : current.catalogItemCount + 1,
        items: [item, ...current.items.filter(({ id }) => id !== item.id)],
        message: `${pendingCompletion.name}을 Drive 전용 폴더와 사이트 목록에 등록했습니다.`,
      }));
      onNotice("Google Drive PDF 등록을 완료했습니다.");
      try {
        await load(controller.signal);
        setState((current) => ({ ...current, message: `${pendingCompletion.name}을 Drive 전용 폴더와 사이트 목록에 등록했습니다.` }));
      } catch (error) {
        if (error?.name !== "AbortError") {
          setState((current) => ({
            ...current,
            status: "ready",
            catalogRefreshNeeded: true,
            message: "PDF 등록은 완료됐지만 최신 목록을 다시 불러오지 못했습니다. 등록된 파일은 Drive에 안전하게 남아 있습니다.",
          }));
        }
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        if (isTerminalDriveCompletion(error)) {
          writeSessionValue(DRIVE_COMPLETION_STORAGE_KEY, null);
          setState((current) => ({
            ...current,
            status: "ready",
            progress: 0,
            pendingCompletion: null,
            message: "Drive에는 PDF가 남아 있지만 사이트 목록 등록 시간이 만료됐거나 파일 확인값이 달라 등록하지 않았습니다. Drive에서 파일을 확인한 뒤 필요하면 다시 추가하세요.",
          }));
          onNotice("Drive 파일은 남아 있고 사이트 목록에는 등록되지 않았습니다.");
          return;
        }
        setState((current) => ({
          ...current,
          status: "finalizing-error",
          pendingCompletion,
          message: "Drive 업로드는 완료됐지만 사이트 목록 등록 확인이 중단됐습니다. PDF를 다시 올리지 말고 아래에서 확인만 다시 시도하세요.",
        }));
        onNotice("Drive 업로드는 끝났습니다. 목록 등록 확인만 다시 시도해 주세요.");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  async function refreshDriveCatalog() {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      await load(controller.signal);
    } catch (error) {
      if (error?.name !== "AbortError") onNotice("Drive 목록을 다시 불러오지 못했습니다.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  const stateLabel = state.connected ? "연결됨" : state.configured ? "연결 필요" : "설정 대기";
  const uploading = state.status === "uploading";
  const finalizing = state.status === "finalizing";
  const picking = state.status === "picking";
  return (
    <section className="google-drive-vault" aria-labelledby="google-drive-vault-title">
      <header>
        <div>
          <span className={`drive-connection-state is-${state.connected ? "connected" : "pending"}`}>{stateLabel}</span>
          <h3 id="google-drive-vault-title">Google Drive 원본 보관소</h3>
          <p>대형 PDF 원본의 기준 저장소 · 선택하거나 STUDIO 7321을 통해 올린 파일만 접근</p>
        </div>
        <div>
          <span>등록 자료 {state.catalogItemCount}개</span>
          {state.connected ? <>
            <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadSelectedPdf(event)} />
            <div className="drive-vault-buttons">
              <button
                type="button"
                className="drive-picker-button"
                onClick={() => void selectExistingDrivePdfs()}
                disabled={picking || uploading || finalizing}
                title="내 Drive에서 접근을 허용할 PDF 선택"
              >
                <FolderOpen size={16} />
                {state.status === "picking"
                  ? "Drive 선택 창 여는 중"
                  : "Drive에서 파일 선택"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (state.pendingCompletion) void finishDriveCatalogRegistration(state.pendingCompletion);
                  else if (state.catalogRefreshNeeded) void refreshDriveCatalog();
                  else if (uploading) cancelUpload();
                  else inputRef.current?.click();
                }}
                disabled={state.status === "connecting" || finalizing || picking}
              >
                <FileArrowUp size={16} />
                {finalizing
                  ? "목록 등록 확인 중"
                  : state.pendingCompletion
                    ? "목록 등록 확인 다시 시도"
                    : state.catalogRefreshNeeded
                      ? "Drive 목록 새로고침"
                      : uploading
                        ? `업로드 중단 · ${state.progress}%`
                        : "새 PDF 업로드"}
              </button>
            </div>
          </> : <button type="button" onClick={() => void connect()} disabled={!state.configured || state.status === "connecting"}>
            <ArrowSquareOut size={16} />
            {state.status === "connecting" ? "연결 중" : "Google Drive 연결"}
          </button>}
        </div>
      </header>
      <div className="drive-access-boundary">
        <ShieldWarning size={17} />
        <p><strong>Drive 전체 권한을 요청하지 않습니다.</strong> PDF 원본은 Drive가 소유하며, STUDIO 7321에는 파일 ID와 목록 정보만 저장합니다. AI 전송은 파일별로 별도 허용합니다.</p>
      </div>
      {uploading ? <div className="drive-upload-progress" role="progressbar" aria-label="Google Drive 업로드 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow={state.progress}>
        <span style={{ width: `${state.progress}%` }} />
      </div> : null}
      {state.message ? <p className={`resource-query-status is-${state.status}`} role="status">{state.message}</p> : null}
      {state.items.length ? <div className="drive-file-list" aria-label="Google Drive 물리 PDF 목록">
        {state.items.map((item) => {
          const viewUrl = safeGoogleDriveViewUrl(item.webViewLink);
          return <article key={item.id}>
            <FileText size={18} aria-hidden="true" />
            <div><strong>{item.name}</strong><span>{formatFileSize(item.byteSize)} · Google Drive 원본</span></div>
            <span className="drive-ai-boundary">AI 사용 안 함</span>
            {viewUrl ? <a href={viewUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Drive에서 열기 <ArrowSquareOut size={14} /></a> : null}
          </article>;
        })}
      </div> : state.connected && state.status === "ready" ? <p className="drive-empty">아직 등록한 Drive PDF가 없습니다. 위 버튼으로 필요한 자료만 추가하세요.</p> : null}
    </section>
  );
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
      if (error?.name !== "AbortError") setState((current) => ({ ...current, status: "error", message: "개인 파일을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." }));
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
          : "비공개 저장이 끝났습니다. 안전 검사가 끝나면 다운로드와 Mandos 분석이 열립니다." }));
        onNotice("개인 물리 파일을 격리 저장하고 백신 검사를 요청했습니다.");
      } else {
        onNotice("파일은 저장됐지만 최신 목록을 다시 불러오지 못했습니다.");
      }
    } catch (error) {
      setState((current) => ({ ...current, status: "error", message: "파일을 저장하지 못했습니다. 파일 형식과 용량을 확인해 주세요." }));
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
        setState((current) => ({ ...current, message: "파일과 관련 기록을 삭제했습니다." }));
        onNotice("개인 물리 파일을 삭제했습니다.");
      } else {
        onNotice("파일은 삭제됐지만 최신 목록을 다시 불러오지 못했습니다.");
      }
    } catch (error) {
      onNotice("파일을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="physics-file-vault" aria-labelledby="physics-file-vault-title">
      <header>
        <div><h3 id="physics-file-vault-title">개인 파일</h3><p>PDF·PNG·JPEG · 최대 10MiB · {state.storage === "private-r2" ? "비공개 저장" : "저장소 연결 확인 필요"}</p></div>
        <div><span>{state.quota
          ? `파일 ${state.quota.usedFiles}/${state.quota.maxFiles}개 · ${formatFileSize(state.quota.usedBytes)} / ${formatFileSize(state.quota.maxBytes)}`
          : `파일 ${state.items.length}개`}</span><button type="button" onClick={() => inputRef.current?.click()} disabled={pendingId === "upload" || state.storage !== "private-r2" || state.scanner !== "async-clamav"}><FileArrowUp size={17} />{pendingId === "upload" ? "업로드 중" : "파일 추가"}</button></div>
        <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={upload} />
      </header>
      <div className="physics-file-security"><ShieldWarning size={17} /><p><strong>{state.storage === "unavailable" ? "비공개 저장소 미연결" : state.scanner === "async-clamav" ? "업로드 파일 안전 검사" : "안전 검사 미연결"}</strong> {state.storage === "unavailable"
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
            <div><strong>{file.filename}</strong><span>{formatFileSize(file.byteSize)} · 개인 파일</span><small>{antivirusLabel(file.antivirusStatus)}</small></div>
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

function ResourceFinder({ onOpenAi, onNotice }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("전체");
  const [state, setState] = useState({ status: "idle", items: [], cursor: null, message: "검색어를 입력하면 등록된 공개 물리 자료 출처를 조회합니다." });
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
          ? `공개 자료 ${items.length}건 · arXiv와 Crossref의 제목·초록 정보이며 원문 내용은 검증 전입니다.`
          : "검색 결과가 없습니다.",
      }));
    } catch (error) {
      if (error?.name !== "AbortError") setState((current) => ({ ...current, status: "error", message: "공개 자료를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요." }));
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
      onNotice("자료를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
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
      onNotice("보관 자료를 제거하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingIds((current) => { const next = new Set(current); next.delete(resource.id); return next; });
    }
  }

  return (
      <section className="resource-workspace finder-workspace" aria-labelledby="resource-finder-title">
        <header className="drive-section-heading">
          <div><span>DISCOVERY</span><h3 id="resource-finder-title">통합 자료 검색</h3><p>승인된 공개 물리 출처를 검색하고 필요한 결과만 보관합니다.</p></div>
          <strong>{state.status === "ready" ? `${state.items.length}건` : "공개 출처"}</strong>
        </header>
        <form className="finder-query" onSubmit={search}><MagnifyingGlass size={20} aria-hidden="true" /><label><span className="sr-only">물리 자료 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 전자기학 심화 강의, 경계조건과 그린함수" /></label><button type="submit" disabled={!query.trim() || state.status === "loading"}>{state.status === "loading" ? "검색 중" : "자료 검색"}</button></form>
        <div className="resource-type-filter" aria-label="자료 유형">{RESOURCE_TYPES.map((item) => <button type="button" key={item} className={type === item ? "is-selected" : ""} onClick={() => setType(item)} aria-pressed={type === item}>{item}</button>)}</div>
        <p className={`resource-query-status is-${state.status}`} role="status">{state.message}</p>
        <ResourceTable resources={state.items} onOpenAi={onOpenAi} onSave={saveResource} onRemove={removeResource} pendingIds={pendingIds} emptyLabel={state.status === "ready" ? "검색어 또는 자료 유형을 바꿔보세요." : "검색을 실행하면 실제 결과가 이곳에 표시됩니다."} />
        {state.cursor ? <button type="button" className="resource-load-more" onClick={(event) => search(event, { append: true })} disabled={state.status === "loading"}>다음 결과 불러오기</button> : null}
      </section>
  );
}

function DrivePage({ onOpenAi, onNotice }) {
  return (
    <main className="focused-workspace domain-workspace physics-workspace drive-workspace">
      <PhysicsHeading title="Drive" description="Google Drive 원본, 공개 자료 검색, 보관 링크와 검사 파일을 한 작업 화면에서 관리합니다." countLabel="통합 자료 워크스페이스" />
      <GoogleDriveVault onNotice={onNotice} />
      <ResourceFinder onOpenAi={onOpenAi} onNotice={onNotice} />
      <SavedLibrary onOpenAi={onOpenAi} onNotice={onNotice} />
      <PhysicsFileVault onOpenAi={onOpenAi} onNotice={onNotice} />
    </main>
  );
}

export function PhysicsWorkspace({ view, onOpenAi, onNotice, onNavigate, analysisContext }) {
  if (view === "workspace") {
    return <PhysicsCanvasWorkspace analysisContext={analysisContext} onNavigate={onNavigate} onNotice={onNotice} />;
  }
  return <DrivePage onOpenAi={onOpenAi} onNotice={onNotice} />;
}

export default PhysicsWorkspace;
