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

async function analysisFingerprint(analysis) {
  const canonical = JSON.stringify(analysis);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

export function createBackendClient({ baseUrl = "", fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const base = normalizeBaseUrl(baseUrl);

  async function request(path, options = {}) {
    const { returnEnvelope = false, ...fetchOptions } = options;
    const response = await fetchImpl(`${base}${path}`, {
      credentials: "same-origin",
      ...fetchOptions,
      headers: {
        accept: "application/json",
        ...(fetchOptions.body === undefined ? {} : { "content-type": "application/json" }),
        ...fetchOptions.headers,
      },
    });

    if (response.status === 204) return null;
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
    listSourceItems: ({ signal, ...params } = {}) => request(
      `/api/v1/source-items${sourceItemsQuery(params)}`,
      { signal, returnEnvelope: true },
    ),
    getEvent: (eventId) => request(`/api/v1/events/${encodeURIComponent(eventId)}`),
    session: () => request("/api/v1/session"),
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
    createAnalysis: (analysis, { signal, idempotencyKey = crypto.randomUUID() } = {}) => request(
      "/api/v1/analyses",
      {
        method: "POST",
        body: JSON.stringify(analysis),
        headers: { "idempotency-key": idempotencyKey },
        signal,
      },
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
