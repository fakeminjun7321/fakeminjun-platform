export class BackendApiError extends Error {
  constructor(status, code, message, details, requestId) {
    super(message);
    this.name = "BackendApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

const ANALYSIS_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const MAX_RETAINED_ANALYSIS_ATTEMPTS = 24;
const analysisAttempts = new Map();

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function analysisFingerprint(analysis) {
  return sha256Hex(JSON.stringify(analysis));
}

function sweepExpiredAnalysisAttempts(now) {
  for (const [fingerprint, attempt] of analysisAttempts) {
    if (now - attempt.createdAt >= ANALYSIS_ATTEMPT_TTL_MS) analysisAttempts.delete(fingerprint);
  }
}

export async function getAnalysisAttempt(analysis, now = Date.now()) {
  const fingerprint = await analysisFingerprint(analysis);
  sweepExpiredAnalysisAttempts(now);
  const existing = analysisAttempts.get(fingerprint);
  if (existing) {
    return { fingerprint, idempotencyKey: existing.idempotencyKey };
  }
  while (analysisAttempts.size >= MAX_RETAINED_ANALYSIS_ATTEMPTS) {
    analysisAttempts.delete(analysisAttempts.keys().next().value);
  }
  const attempt = { idempotencyKey: crypto.randomUUID(), createdAt: now };
  analysisAttempts.set(fingerprint, attempt);
  return { fingerprint, idempotencyKey: attempt.idempotencyKey };
}

export function clearAnalysisAttempt(fingerprint) {
  analysisAttempts.delete(fingerprint);
}

export function shouldClearAnalysisAttempt(error, { hasCreatedAnalysis = false } = {}) {
  if (hasCreatedAnalysis || !(error instanceof BackendApiError)) return false;
  return error.status >= 400
    && error.status < 500
    && ![408, 425, 429].includes(error.status);
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function eventQuery(params = {}) {
  const query = new URLSearchParams();
  if (params.bbox) query.set("bbox", params.bbox.join(","));
  if (params.from) query.set("from", params.from);
  if (params.layers?.length) query.set("layers", params.layers.join(","));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

function sourceItemsQuery(params = {}) {
  const query = new URLSearchParams();
  if (params.lanes?.length) query.set("lanes", params.lanes.join(","));
  if (params.from) query.set("from", params.from);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

function eventCandidatesQuery(params = {}) {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.reviewStatus) query.set("reviewStatus", params.reviewStatus);
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

function analysesQuery(params = {}) {
  const query = new URLSearchParams();
  if (params.query?.trim()) query.set("q", params.query.trim());
  if (params.domain) query.set("domain", params.domain);
  if (params.status) query.set("status", params.status);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export function createBackendClient({ baseUrl = "", fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const base = normalizeBaseUrl(baseUrl);

  async function request(path, options = {}) {
    const { returnEnvelope = false, responseType = "json", ...fetchOptions } = options;
    const isFormData = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
    const response = await fetchImpl(`${base}${path}`, {
      credentials: "same-origin",
      ...fetchOptions,
      headers: {
        accept: responseType === "blob" ? "text/markdown, application/zip, application/octet-stream" : "application/json",
        ...(fetchOptions.body === undefined || isFormData ? {} : { "content-type": "application/json" }),
        ...fetchOptions.headers,
      },
    });

    if (response.status === 204) return null;
    if (response.ok && responseType === "blob") return response.blob();
    const body = await response.json();
    if (!response.ok) {
      const error = body?.error ?? {};
      throw new BackendApiError(
        response.status,
        error.code ?? "unknown_error",
        error.message ?? "백엔드 요청이 실패했습니다.",
        error.details,
        error.requestId ?? response.headers.get("x-request-id"),
      );
    }
    return returnEnvelope ? { data: body.data, meta: body.meta ?? {} } : body.data;
  }

  return Object.freeze({
    health: () => request("/api/v1/health"),
    listEvents: (params) => request(`/api/v1/events${eventQuery(params)}`),
    listEventsEnvelope: ({ signal, ...params } = {}) => request(
      `/api/v1/events${eventQuery(params)}`,
      { signal, cache: "no-cache", returnEnvelope: true },
    ),
    listSourceItems: ({ signal, ...params } = {}) => request(
      `/api/v1/source-items${sourceItemsQuery(params)}`,
      { signal, cache: "no-cache", returnEnvelope: true },
    ),
    listEventCandidates: ({ signal, ...params } = {}) => request(
      `/api/v1/event-candidates${eventCandidatesQuery(params)}`,
      { signal },
    ),
    createEventCandidate: ({ sourceItemIds }, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      "/api/v1/event-candidates",
      {
        method: "POST",
        body: JSON.stringify({ sourceItemIds }),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
    ),
    reviewEventCandidate: (candidateId, review, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      `/api/v1/event-candidates/${encodeURIComponent(candidateId)}/reviews`,
      {
        method: "POST",
        body: JSON.stringify(review),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
    ),
    reviewCandidateEvidence: (candidateId, evidence, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      `/api/v1/event-candidates/${encodeURIComponent(candidateId)}/evidence-reviews`,
      {
        method: "POST",
        body: JSON.stringify(evidence),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
    ),
    putCandidateLocation: (candidateId, location, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      `/api/v1/event-candidates/${encodeURIComponent(candidateId)}/location`,
      {
        method: "PUT",
        body: JSON.stringify(location),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
    ),
    getCandidateReadiness: (candidateId, { signal } = {}) => request(
      `/api/v1/event-candidates/${encodeURIComponent(candidateId)}/readiness`,
      { signal },
    ),
    promoteEventCandidate: (candidateId, promotion, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      `/api/v1/event-candidates/${encodeURIComponent(candidateId)}/promote`,
      {
        method: "POST",
        body: JSON.stringify(promotion),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
    ),
    getEvent: (eventId) => request(`/api/v1/events/${encodeURIComponent(eventId)}`),
    runIngestion: ({ signal } = {}) => request("/api/v1/ingestion/runs", {
      method: "POST",
      body: JSON.stringify({}),
      signal,
    }),
    session: () => request("/api/v1/session"),
    getGoogleDriveStatus: ({ signal } = {}) => request(
      "/api/v1/integrations/google-drive",
      { signal },
    ),
    startGoogleDriveConnection: ({ signal } = {}) => request(
      "/api/v1/integrations/google-drive/connect",
      { method: "POST", body: JSON.stringify({}), signal },
    ),
    finishGoogleDriveConnection: ({ state, code, error }, { signal } = {}) => request(
      "/api/v1/integrations/google-drive/callback",
      {
        method: "POST",
        body: JSON.stringify({ state, ...(code ? { code } : {}), ...(error ? { error } : {}) }),
        keepalive: true,
        signal,
      },
    ),
    listPhysicsDriveItems: ({ signal } = {}) => request(
      "/api/v1/physics/drive/items",
      { signal, returnEnvelope: true },
    ),
    startPhysicsDriveUpload: ({ name, byteSize }, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      "/api/v1/physics/drive/uploads",
      {
        method: "POST",
        body: JSON.stringify({ name, byteSize }),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
    ),
    completePhysicsDriveUpload: (sessionId, { driveFileId }, { signal } = {}) => request(
      `/api/v1/physics/drive/uploads/${encodeURIComponent(sessionId)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ driveFileId }),
        signal,
      },
    ),
    listNotes: ({ subjectType, subjectId }) => request(
      `/api/v1/notes?${new URLSearchParams({ subjectType, subjectId: String(subjectId) })}`,
    ),
    createNote: (note) => request("/api/v1/notes", { method: "POST", body: JSON.stringify(note) }),
    updateNote: (noteId, note) => request(`/api/v1/notes/${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify(note),
    }),
    deleteNote: (noteId) => request(`/api/v1/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" }),
    getLevels: () => request("/api/v1/profile/levels"),
    putLevels: (levels) => request("/api/v1/profile/levels", {
      method: "PUT",
      body: JSON.stringify(levels),
    }),
    searchPhysicsResources: ({ signal, idempotencyKey = crypto.randomUUID(), type, ...params } = {}) => request(
      "/api/v1/physics/resources/search",
      {
        method: "POST",
        body: JSON.stringify({ ...params, ...(type && type !== "전체" ? { type } : {}) }),
        headers: { "idempotency-key": idempotencyKey },
        signal,
        returnEnvelope: true,
      },
    ),
    listPhysicsLibrary: ({ signal } = {}) => request("/api/v1/physics/library", { signal }),
    savePhysicsResource: (resource, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      "/api/v1/physics/library",
      {
        method: "POST",
        body: JSON.stringify(resource),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
    ),
    removePhysicsResource: (resourceId, { signal } = {}) => request(
      `/api/v1/physics/library/${encodeURIComponent(resourceId)}`,
      { method: "DELETE", signal },
    ),
    exportPhysicsLibraryToObsidian: ({ signal } = {}) => request(
      "/api/v1/physics/library/export/obsidian",
      { signal, responseType: "blob" },
    ),
    listPhysicsFiles: ({ signal } = {}) => request("/api/v1/physics/files", { signal, returnEnvelope: true }),
    uploadPhysicsFile: (file, { signal, idempotencyKey = crypto.randomUUID() } = {}) => {
      const body = new FormData();
      body.append("file", file);
      return request("/api/v1/physics/files", {
        method: "POST",
        body,
        headers: { "idempotency-key": idempotencyKey },
        signal,
      });
    },
    deletePhysicsFile: (fileId, { signal } = {}) => request(
      `/api/v1/physics/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE", signal },
    ),
    createAnalysis: (analysis, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      "/api/v1/analyses",
      {
        method: "POST",
        body: JSON.stringify(analysis),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
    ),
    createPhysicsFileAnalysis: (fileId, analysis, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      `/api/v1/physics/files/${encodeURIComponent(fileId)}/analyses`,
      {
        method: "POST",
        body: JSON.stringify(analysis),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
    ),
    listAnalyses: ({ signal, ...params } = {}) => request(
      `/api/v1/analyses${analysesQuery(params)}`,
      { signal, returnEnvelope: true },
    ),
    getAnalysis: (analysisId, { signal } = {}) => request(
      `/api/v1/analyses/${encodeURIComponent(analysisId)}`,
      { signal },
    ),
    deleteAnalysis: (analysisId) => request(`/api/v1/analyses/${encodeURIComponent(analysisId)}`, {
      method: "DELETE",
    }),
  });
}

export const backendClient = createBackendClient();
