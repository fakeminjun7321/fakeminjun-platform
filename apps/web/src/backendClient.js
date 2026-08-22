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

export function createBackendClient({ baseUrl = "", fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const base = normalizeBaseUrl(baseUrl);

  async function request(path, options = {}) {
    const response = await fetchImpl(`${base}${path}`, {
      credentials: "same-origin",
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...options.headers,
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
    return body.data;
  }

  return Object.freeze({
    health: () => request("/api/v1/health"),
    listEvents: (params) => request(`/api/v1/events${eventQuery(params)}`),
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
  });
}

export const backendClient = createBackendClient();
