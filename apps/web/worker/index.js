const API_PREFIX = "/api/v1";
const EVENT_LAYERS = new Set(["korea-core", "us-impact", "rapid-change"]);
const SUBJECT_TYPES = new Set(["event", "issue"]);
const INTERNATIONAL_LEVELS = new Set(["I1", "I2", "I3", "I4", "I5"]);
const PHYSICS_LEVELS = new Set(["P1", "P2", "P3", "P4", "P5"]);
const MAX_JSON_BYTES = 16 * 1024;

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function apiHeaders(requestId, extra = {}) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
    ...extra,
  };
}

function jsonResponse(body, status = 200, requestId = crypto.randomUUID(), extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: apiHeaders(requestId, extraHeaders),
  });
}

function errorResponse(error, requestId) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, "internal_error", "요청을 처리하지 못했습니다.");

  return jsonResponse({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
      requestId,
    },
  }, apiError.status, requestId);
}

function methodNotAllowed(allowed, requestId) {
  return jsonResponse({
    error: {
      code: "method_not_allowed",
      message: "이 경로에서 지원하지 않는 요청 방식입니다.",
      requestId,
    },
  }, 405, requestId, { allow: allowed.join(", ") });
}

function requireDatabase(env) {
  if (!env.DB) throw new ApiError(503, "database_unavailable", "D1 데이터베이스가 연결되지 않았습니다.");
  return env.DB;
}

function assertOnlyKeys(value, allowedKeys) {
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknown.length) {
    throw new ApiError(400, "unknown_fields", "지원하지 않는 필드가 포함되어 있습니다.", { fields: unknown });
  }
}

async function readJson(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Content-Type은 application/json이어야 합니다.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new ApiError(413, "payload_too_large", "요청 본문은 16KiB를 넘을 수 없습니다.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    throw new ApiError(413, "payload_too_large", "요청 본문은 16KiB를 넘을 수 없습니다.");
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "올바른 JSON 본문이 필요합니다.");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ApiError(400, "invalid_json_object", "JSON 객체가 필요합니다.");
  }
  return value;
}

function requireMutationOrigin(request, env) {
  const allowedOrigin = env.APP_ORIGIN;
  const origin = request.headers.get("origin");
  if (!allowedOrigin) {
    throw new ApiError(503, "origin_policy_unconfigured", "쓰기 요청의 허용 origin이 설정되지 않았습니다.");
  }
  if (origin !== allowedOrigin) {
    throw new ApiError(403, "origin_forbidden", "허용되지 않은 origin의 쓰기 요청입니다.");
  }
}

async function requirePrincipal(ctx) {
  if (!ctx?.access?.getIdentity) {
    throw new ApiError(401, "access_required", "Cloudflare Access 인증이 필요합니다.");
  }
  const identity = await ctx.access.getIdentity();
  if (!identity?.id) {
    throw new ApiError(401, "identity_missing", "검증된 사용자 식별자를 찾을 수 없습니다.");
  }
  return {
    subject: String(identity.id),
    email: typeof identity.email === "string" ? identity.email : null,
  };
}

async function ensureUser(db, principal) {
  await db.prepare(`
    INSERT INTO users (external_subject, email)
    VALUES (?, ?)
    ON CONFLICT(external_subject) DO UPDATE SET
      email = COALESCE(excluded.email, users.email),
      last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(principal.subject, principal.email).run();

  const user = await db.prepare("SELECT id FROM users WHERE external_subject = ?")
    .bind(principal.subject)
    .first();
  if (!user) throw new ApiError(500, "user_resolution_failed", "사용자 경계를 만들지 못했습니다.");
  return user.id;
}

export function parseEventsQuery(url) {
  const allowed = new Set(["bbox", "from", "layers", "limit"]);
  const unknown = [...url.searchParams.keys()].filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new ApiError(400, "unknown_query", "지원하지 않는 조회 조건입니다.", { fields: [...new Set(unknown)] });
  }

  const result = { bbox: null, from: null, layers: [], limit: 50 };
  const bboxValue = url.searchParams.get("bbox");
  if (bboxValue) {
    const bbox = bboxValue.split(",").map(Number);
    if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
      throw new ApiError(400, "invalid_bbox", "bbox는 west,south,east,north 형식이어야 합니다.");
    }
    const [west, south, east, north] = bbox;
    if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
      throw new ApiError(400, "invalid_bbox", "bbox 좌표 범위가 올바르지 않습니다.");
    }
    result.bbox = bbox;
  }

  const fromValue = url.searchParams.get("from");
  if (fromValue) {
    const parsed = new Date(fromValue);
    if (Number.isNaN(parsed.getTime())) throw new ApiError(400, "invalid_from", "from은 ISO 날짜여야 합니다.");
    result.from = parsed.toISOString();
  }

  const layersValue = url.searchParams.get("layers");
  if (layersValue) {
    const layers = [...new Set(layersValue.split(",").filter(Boolean))];
    if (!layers.length || layers.length > EVENT_LAYERS.size || layers.some((layer) => !EVENT_LAYERS.has(layer))) {
      throw new ApiError(400, "invalid_layers", "지원하지 않는 사건 레이어가 포함되어 있습니다.");
    }
    result.layers = layers;
  }

  const limitValue = url.searchParams.get("limit");
  if (limitValue) {
    if (!/^\d+$/.test(limitValue)) throw new ApiError(400, "invalid_limit", "limit은 정수여야 합니다.");
    const limit = Number(limitValue);
    if (limit < 1 || limit > 100) throw new ApiError(400, "invalid_limit", "limit은 1에서 100 사이여야 합니다.");
    result.limit = limit;
  }

  return result;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function eventFromRow(row, detailed = false) {
  const event = {
    id: row.id,
    title: row.title,
    summary: row.summary,
    region: row.region,
    shortRegion: row.short_region,
    coordinates: [row.longitude, row.latitude],
    locationAccuracy: row.accuracy,
    category: row.layer,
    status: row.verification_status,
    signalRank: row.signal_rank,
    agreement: row.agreement,
    dateTime: row.occurred_at,
    lastVerifiedAt: row.last_verified_at,
    sourceCount: row.source_count,
    live: Boolean(row.is_live),
  };
  if (!detailed) return event;
  return {
    ...event,
    impact: row.impact,
    relationLabel: row.relation_label,
    facts: parseJsonArray(row.facts_json),
    disputed: parseJsonArray(row.disputed_json),
    relevance: parseJsonArray(row.relevance_json),
    relatedLocations: parseJsonArray(row.relations_json),
  };
}

const EVENT_SELECT = `
  SELECT e.*, l.longitude, l.latitude, l.accuracy
  FROM events e
  JOIN event_locations l ON l.event_id = e.id
`;

async function listEvents(request, env, requestId) {
  const db = requireDatabase(env);
  const query = parseEventsQuery(new URL(request.url));
  const clauses = [];
  const bindings = [];

  if (query.bbox) {
    const [west, south, east, north] = query.bbox;
    clauses.push("l.longitude BETWEEN ? AND ?", "l.latitude BETWEEN ? AND ?");
    bindings.push(west, east, south, north);
  }
  if (query.from) {
    clauses.push("e.occurred_at >= ?");
    bindings.push(query.from);
  }
  if (query.layers.length) {
    clauses.push(`e.layer IN (${query.layers.map(() => "?").join(", ")})`);
    bindings.push(...query.layers);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const statement = db.prepare(`${EVENT_SELECT} ${where} ORDER BY e.signal_rank, e.occurred_at DESC LIMIT ?`)
    .bind(...bindings, query.limit);
  const { results = [] } = await statement.all();

  return jsonResponse({
    data: results.map((row) => eventFromRow(row)),
    meta: {
      count: results.length,
      generatedAt: new Date().toISOString(),
      dataStatus: results.some((row) => row.is_live) ? "mixed" : "non-live-demo",
    },
  }, 200, requestId);
}

async function getEvent(eventId, env, requestId) {
  const db = requireDatabase(env);
  if (!/^\d+$/.test(eventId)) throw new ApiError(400, "invalid_event_id", "사건 ID 형식이 올바르지 않습니다.");
  const row = await db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).bind(Number(eventId)).first();
  if (!row) throw new ApiError(404, "event_not_found", "사건을 찾을 수 없습니다.");
  return jsonResponse({ data: eventFromRow(row, true) }, 200, requestId);
}

export function validateNotePayload(payload, { patch = false } = {}) {
  const allowed = patch
    ? new Set(["body", "expectedVersion"])
    : new Set(["subjectType", "subjectId", "body"]);
  assertOnlyKeys(payload, allowed);

  if (!patch) {
    if (!SUBJECT_TYPES.has(payload.subjectType)) {
      throw new ApiError(400, "invalid_subject_type", "노트 대상 유형은 event 또는 issue여야 합니다.");
    }
    if (typeof payload.subjectId !== "string" && typeof payload.subjectId !== "number") {
      throw new ApiError(400, "invalid_subject_id", "노트 대상 ID가 필요합니다.");
    }
  }
  if (typeof payload.body !== "string" || !payload.body.trim() || payload.body.length > 10000) {
    throw new ApiError(400, "invalid_note_body", "노트는 1자 이상 10,000자 이하여야 합니다.");
  }
  if (patch && (!Number.isInteger(payload.expectedVersion) || payload.expectedVersion < 1)) {
    throw new ApiError(400, "invalid_note_version", "수정할 노트 버전이 필요합니다.");
  }
  return {
    ...(patch ? { expectedVersion: payload.expectedVersion } : {
      subjectType: payload.subjectType,
      subjectId: String(payload.subjectId),
    }),
    body: payload.body.trim(),
  };
}

function noteFromRow(row) {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    body: row.body,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listNotes(request, env, ctx, requestId) {
  const db = requireDatabase(env);
  const principal = await requirePrincipal(ctx);
  const ownerId = await ensureUser(db, principal);
  const url = new URL(request.url);
  const unknown = [...url.searchParams.keys()].filter((key) => !["subjectType", "subjectId"].includes(key));
  if (unknown.length) throw new ApiError(400, "unknown_query", "지원하지 않는 조회 조건입니다.", { fields: [...new Set(unknown)] });
  const subjectType = url.searchParams.get("subjectType");
  const subjectId = url.searchParams.get("subjectId");
  if (!SUBJECT_TYPES.has(subjectType) || !subjectId) {
    throw new ApiError(400, "note_subject_required", "subjectType과 subjectId가 필요합니다.");
  }
  const { results = [] } = await db.prepare(`
    SELECT id, subject_type, subject_id, body, version, created_at, updated_at
    FROM notes
    WHERE owner_id = ? AND subject_type = ? AND subject_id = ?
    ORDER BY updated_at DESC
  `).bind(ownerId, subjectType, subjectId).all();
  return jsonResponse({ data: results.map(noteFromRow) }, 200, requestId);
}

async function createNote(request, env, ctx, requestId) {
  requireMutationOrigin(request, env);
  const db = requireDatabase(env);
  const principal = await requirePrincipal(ctx);
  const ownerId = await ensureUser(db, principal);
  const note = validateNotePayload(await readJson(request));

  if (note.subjectType === "event") {
    const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(note.subjectId).first();
    if (!event) throw new ApiError(404, "event_not_found", "노트를 연결할 사건을 찾을 수 없습니다.");
  } else {
    const issue = await db.prepare("SELECT id FROM issues WHERE id = ?").bind(note.subjectId).first();
    if (!issue) throw new ApiError(404, "issue_not_found", "노트를 연결할 이슈를 찾을 수 없습니다.");
  }

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO notes (id, owner_id, subject_type, subject_id, body)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, ownerId, note.subjectType, note.subjectId, note.body).run();
  const row = await db.prepare(`
    SELECT id, subject_type, subject_id, body, version, created_at, updated_at
    FROM notes WHERE id = ? AND owner_id = ?
  `).bind(id, ownerId).first();
  return jsonResponse({ data: noteFromRow(row) }, 201, requestId, { location: `${API_PREFIX}/notes/${id}` });
}

async function updateNote(noteId, request, env, ctx, requestId) {
  requireMutationOrigin(request, env);
  const db = requireDatabase(env);
  const principal = await requirePrincipal(ctx);
  const ownerId = await ensureUser(db, principal);
  const note = validateNotePayload(await readJson(request), { patch: true });

  const result = await db.prepare(`
    UPDATE notes
    SET body = ?, version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND owner_id = ? AND version = ?
  `).bind(note.body, noteId, ownerId, note.expectedVersion).run();

  if (!result.meta?.changes) {
    const existing = await db.prepare("SELECT version FROM notes WHERE id = ? AND owner_id = ?")
      .bind(noteId, ownerId)
      .first();
    if (!existing) throw new ApiError(404, "note_not_found", "노트를 찾을 수 없습니다.");
    throw new ApiError(409, "note_version_conflict", "다른 변경이 먼저 저장되었습니다.", { currentVersion: existing.version });
  }

  const row = await db.prepare(`
    SELECT id, subject_type, subject_id, body, version, created_at, updated_at
    FROM notes WHERE id = ? AND owner_id = ?
  `).bind(noteId, ownerId).first();
  return jsonResponse({ data: noteFromRow(row) }, 200, requestId);
}

async function deleteNote(noteId, request, env, ctx, requestId) {
  requireMutationOrigin(request, env);
  const db = requireDatabase(env);
  const principal = await requirePrincipal(ctx);
  const ownerId = await ensureUser(db, principal);
  const result = await db.prepare("DELETE FROM notes WHERE id = ? AND owner_id = ?")
    .bind(noteId, ownerId)
    .run();
  if (!result.meta?.changes) throw new ApiError(404, "note_not_found", "노트를 찾을 수 없습니다.");
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
    },
  });
}

function validateLevels(payload) {
  assertOnlyKeys(payload, new Set(["international", "physics"]));
  const international = payload.international ?? null;
  const physics = payload.physics ?? null;
  if (international !== null && !INTERNATIONAL_LEVELS.has(international)) {
    throw new ApiError(400, "invalid_international_level", "국제정세 수준은 I1부터 I5까지 사용할 수 있습니다.");
  }
  if (physics !== null && !PHYSICS_LEVELS.has(physics)) {
    throw new ApiError(400, "invalid_physics_level", "물리 수준은 P1부터 P5까지 사용할 수 있습니다.");
  }
  return { international, physics };
}

async function getLevels(env, ctx, requestId) {
  const db = requireDatabase(env);
  const principal = await requirePrincipal(ctx);
  const ownerId = await ensureUser(db, principal);
  const row = await db.prepare(`
    SELECT international_level, physics_level, updated_at
    FROM user_profiles WHERE owner_id = ?
  `).bind(ownerId).first();
  return jsonResponse({
    data: {
      international: row?.international_level ?? null,
      physics: row?.physics_level ?? null,
      updatedAt: row?.updated_at ?? null,
    },
  }, 200, requestId);
}

async function putLevels(request, env, ctx, requestId) {
  requireMutationOrigin(request, env);
  const db = requireDatabase(env);
  const principal = await requirePrincipal(ctx);
  const ownerId = await ensureUser(db, principal);
  const levels = validateLevels(await readJson(request));
  await db.prepare(`
    INSERT INTO user_profiles (owner_id, international_level, physics_level)
    VALUES (?, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET
      international_level = excluded.international_level,
      physics_level = excluded.physics_level,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(ownerId, levels.international, levels.physics).run();
  return getLevels(env, ctx, requestId);
}

async function getSession(env, ctx, requestId) {
  const db = requireDatabase(env);
  const principal = await requirePrincipal(ctx);
  await ensureUser(db, principal);
  return jsonResponse({ data: { authenticated: true } }, 200, requestId);
}

async function handleApiRequest(request, env, ctx) {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    if (pathname === `${API_PREFIX}/health`) {
      if (request.method !== "GET") return methodNotAllowed(["GET"], requestId);
      const db = requireDatabase(env);
      await db.prepare("SELECT 1 AS ok").first();
      return jsonResponse({ data: { status: "ok", database: "ready" } }, 200, requestId);
    }

    if (pathname === `${API_PREFIX}/events`) {
      if (request.method !== "GET") return methodNotAllowed(["GET"], requestId);
      return await listEvents(request, env, requestId);
    }
    const eventMatch = pathname.match(/^\/api\/v1\/events\/([^/]+)$/);
    if (eventMatch) {
      if (request.method !== "GET") return methodNotAllowed(["GET"], requestId);
      return await getEvent(eventMatch[1], env, requestId);
    }

    if (pathname === `${API_PREFIX}/session`) {
      if (request.method !== "GET") return methodNotAllowed(["GET"], requestId);
      return await getSession(env, ctx, requestId);
    }

    if (pathname === `${API_PREFIX}/notes`) {
      if (request.method === "GET") return await listNotes(request, env, ctx, requestId);
      if (request.method === "POST") return await createNote(request, env, ctx, requestId);
      return methodNotAllowed(["GET", "POST"], requestId);
    }
    const noteMatch = pathname.match(/^\/api\/v1\/notes\/([0-9a-f-]+)$/i);
    if (noteMatch) {
      if (request.method === "PATCH") return await updateNote(noteMatch[1], request, env, ctx, requestId);
      if (request.method === "DELETE") return await deleteNote(noteMatch[1], request, env, ctx, requestId);
      return methodNotAllowed(["PATCH", "DELETE"], requestId);
    }

    if (pathname === `${API_PREFIX}/profile/levels`) {
      if (request.method === "GET") return await getLevels(env, ctx, requestId);
      if (request.method === "PUT") return await putLevels(request, env, ctx, requestId);
      return methodNotAllowed(["GET", "PUT"], requestId);
    }

    throw new ApiError(404, "api_route_not_found", "API 경로를 찾을 수 없습니다.");
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("api_request_failed", { requestId, error });
    return errorResponse(error, requestId);
  }
}

async function handleAssets(request, env) {
  if (!env.ASSETS) return new Response("Static assets are unavailable", { status: 503 });
  const response = await env.ASSETS.fetch(request);
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");

  if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
    return response;
  }

  const indexUrl = new URL(request.url);
  indexUrl.pathname = "/index.html";
  indexUrl.search = "";
  return env.ASSETS.fetch(new Request(indexUrl, request));
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/api/")) return handleApiRequest(request, env, ctx);
    return handleAssets(request, env);
  },
};
