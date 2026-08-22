import { SOURCE_PROVIDERS } from "./sourceRegistry.js";

export const MAX_RSS_BYTES = 512 * 1024;
export const MAX_RSS_ITEMS = 50;
export const DEFAULT_RSS_TIMEOUT_MS = 15_000;

const XML_CONTENT_TYPES = new Set([
  "application/rss+xml",
  "application/xml",
  "text/xml",
]);

export class IngestionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IngestionError";
    this.code = code;
  }
}

function assertTrustedFeedUrl(provider, candidate) {
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new IngestionError("feed_redirect_rejected", "피드 이동 주소가 올바르지 않습니다.");
  }
  if (url.href !== provider.feedUrl || url.protocol !== "https:" || url.username || url.password) {
    throw new IngestionError("feed_redirect_rejected", "고정된 피드 주소 밖으로 이동할 수 없습니다.");
  }
  return url;
}

function challengeCookie(response) {
  const header = response.headers.get("set-cookie") ?? "";
  const firstPair = header.split(";", 1)[0]?.trim();
  if (!firstPair || firstPair.length > 512 || !/^[A-Za-z0-9_.-]+=[A-Za-z0-9_.~%+\-/=]+$/.test(firstPair)) {
    throw new IngestionError("feed_cookie_rejected", "피드의 제한적 쿠키 확인에 실패했습니다.");
  }
  return firstPair;
}

async function readBoundedText(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new IngestionError("feed_too_large", "피드 응답 크기 제한을 넘었습니다.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new IngestionError("feed_too_large", "피드 응답 크기 제한을 넘었습니다.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function validateXmlResponse(response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new IngestionError("feed_http_error", `피드가 HTTP ${response.status}로 응답했습니다.`);
  }
  const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!XML_CONTENT_TYPES.has(contentType)) {
    await response.body?.cancel();
    throw new IngestionError("feed_content_type_rejected", "RSS/XML 형식이 아닌 응답을 거부했습니다.");
  }
}

export async function fetchTrustedRss(provider, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RSS_TIMEOUT_MS,
  maxBytes = MAX_RSS_BYTES,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  assertTrustedFeedUrl(provider, provider.feedUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
    "user-agent": "fakeminjun-platform/0.1 (+https://fakeminjun.com)",
  };

  try {
    let response = await fetchImpl(provider.feedUrl, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: controller.signal,
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (provider.cookieChallenge !== "same-url-once") {
        throw new IngestionError("feed_redirect_rejected", "피드의 외부 이동을 거부했습니다.");
      }
      const location = response.headers.get("location");
      const redirectUrl = new URL(location ?? provider.feedUrl, provider.feedUrl).href;
      assertTrustedFeedUrl(provider, redirectUrl);
      const cookie = challengeCookie(response);
      response = await fetchImpl(provider.feedUrl, {
        method: "GET",
        headers: { ...headers, cookie },
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        throw new IngestionError("feed_redirect_rejected", "피드가 허용 횟수보다 많이 이동했습니다.");
      }
    }

    await validateXmlResponse(response);
    return await readBoundedText(response, maxBytes);
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    if (error?.name === "AbortError") throw new IngestionError("feed_timeout", "피드 응답 제한 시간을 넘었습니다.");
    throw new IngestionError("feed_unavailable", "피드에 연결하지 못했습니다.");
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapCdata(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")
    ? trimmed.slice(9, -3)
    : trimmed;
}

function stripMarkup(value) {
  let output = "";
  let insideTag = false;
  for (const character of value) {
    if (character === "<") insideTag = true;
    else if (character === ">") insideTag = false;
    else if (!insideTag) output += character;
  }
  return output;
}

function decodeXmlEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
  return value.replace(/&(?:#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity) => {
    const token = entity.slice(1, -1);
    if (token[0] !== "#") return named[token.toLowerCase()] ?? entity;
    const hexadecimal = token[1]?.toLowerCase() === "x";
    const point = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isInteger(point) || point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return "";
    return String.fromCodePoint(point);
  });
}

function sanitizeText(value, maxLength) {
  return decodeXmlEntities(stripMarkup(unwrapCdata(value)))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function extractElement(block, tagNames) {
  const lower = block.toLowerCase();
  for (const tagName of tagNames) {
    const openStart = lower.indexOf(`<${tagName.toLowerCase()}`);
    if (openStart === -1) continue;
    const contentStart = lower.indexOf(">", openStart);
    if (contentStart === -1) continue;
    const closeStart = lower.indexOf(`</${tagName.toLowerCase()}>`, contentStart + 1);
    if (closeStart === -1) continue;
    return block.slice(contentStart + 1, closeStart);
  }
  return "";
}

export function canonicalizeSourceUrl(rawValue, provider) {
  const value = sanitizeText(rawValue, 2048);
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.hash || !provider.articleHosts.includes(url.hostname.toLowerCase())) return null;
  if (url.protocol === "http:" && url.port === "443" && provider.sourceKey === "mofa-press") {
    url.protocol = "https:";
    url.port = "";
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) return null;
  url.hash = "";
  return url.href.slice(0, 2048);
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rssItemBlocks(xml) {
  const lower = xml.toLowerCase();
  const blocks = [];
  let cursor = 0;
  while (blocks.length < MAX_RSS_ITEMS) {
    const start = lower.indexOf("<item", cursor);
    if (start === -1) break;
    const contentStart = lower.indexOf(">", start);
    const end = lower.indexOf("</item>", contentStart + 1);
    if (contentStart === -1 || end === -1) break;
    blocks.push(xml.slice(contentStart + 1, end));
    cursor = end + 7;
  }
  return blocks;
}

export async function parseRssFeed(xml, provider, collectedAt = new Date().toISOString()) {
  if (typeof xml !== "string" || new TextEncoder().encode(xml).byteLength > MAX_RSS_BYTES) {
    throw new IngestionError("feed_too_large", "피드 응답 크기 제한을 넘었습니다.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new IngestionError("feed_xml_declaration_rejected", "외부 엔터티를 포함할 수 있는 XML을 거부했습니다.");
  }
  const normalizedCollectedAt = new Date(collectedAt).toISOString();
  const items = [];
  const seen = new Set();

  for (const block of rssItemBlocks(xml)) {
    const title = sanitizeText(extractElement(block, ["title"]), 500);
    const canonicalUrl = canonicalizeSourceUrl(extractElement(block, ["link"]), provider);
    if (!title || !canonicalUrl) continue;
    const guidCandidate = sanitizeText(extractElement(block, ["guid"]), 4097);
    const guid = guidCandidate && guidCandidate.length <= 4096 ? guidCandidate : canonicalUrl;
    const providerItemId = await sha256Hex(`${provider.sourceKey}\0${guid}`);
    if (seen.has(providerItemId)) continue;
    seen.add(providerItemId);
    const rawPublishedAt = sanitizeText(extractElement(block, ["pubdate", "dc:date"]), 128);
    const parsedDate = rawPublishedAt ? new Date(rawPublishedAt) : null;
    const latestPlausibleTime = new Date(normalizedCollectedAt).getTime() + 24 * 60 * 60 * 1000;
    const publishedAt = parsedDate
      && !Number.isNaN(parsedDate.getTime())
      && parsedDate.getTime() <= latestPlausibleTime
      ? parsedDate.toISOString()
      : null;
    const contentHash = await sha256Hex(`${title}\0${canonicalUrl}\0${publishedAt ?? ""}`);
    items.push({ providerItemId, canonicalUrl, title, publishedAt, collectedAt: normalizedCollectedAt, contentHash });
  }
  return items;
}

function runWindow(now, cadenceMinutes) {
  const windowMs = cadenceMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
}

async function finishRun(db, runId, fields) {
  await db.prepare(`
    UPDATE ingestion_runs
    SET status = ?, finished_at = ?, fetched_count = ?, accepted_count = ?, error_code = ?
    WHERE id = ?
  `).bind(
    fields.status,
    fields.finishedAt,
    fields.fetchedCount,
    fields.acceptedCount,
    fields.errorCode,
    runId,
  ).run();
}

export async function runSourceStream(db, provider, {
  fetchImpl = globalThis.fetch,
  now = new Date(),
  force = false,
} = {}) {
  const source = await db.prepare("SELECT id FROM sources WHERE source_key = ? AND enabled = 1")
    .bind(provider.sourceKey)
    .first();
  const stream = await db.prepare("SELECT id FROM source_streams WHERE stream_key = ? AND enabled = 1")
    .bind(provider.streamKey)
    .first();
  if (!source || !stream) throw new IngestionError("source_not_configured", "수집원 DB 설정이 없습니다.");

  const windowKey = force ? `${now.toISOString()}-${crypto.randomUUID()}` : runWindow(now, provider.cadenceMinutes);
  let runId = crypto.randomUUID();
  const reservation = await db.prepare(`
    INSERT OR IGNORE INTO ingestion_runs (id, stream_id, window_key, status, started_at)
    VALUES (?, ?, ?, 'running', ?)
  `).bind(runId, stream.id, windowKey, now.toISOString()).run();
  if (!force && reservation.meta?.changes === 0) {
    const existing = await db.prepare("SELECT id, status FROM ingestion_runs WHERE stream_id = ? AND window_key = ?")
      .bind(stream.id, windowKey)
      .first();
    if (!existing || existing.status !== "failed") {
      return { sourceKey: provider.sourceKey, status: "skipped", fetchedCount: 0, acceptedCount: 0 };
    }
    const retry = await db.prepare(`
      UPDATE ingestion_runs
      SET status = 'running', started_at = ?, finished_at = NULL,
          fetched_count = 0, accepted_count = 0, error_code = NULL
      WHERE id = ? AND status = 'failed'
    `).bind(now.toISOString(), existing.id).run();
    if (retry.meta?.changes === 0) {
      return { sourceKey: provider.sourceKey, status: "skipped", fetchedCount: 0, acceptedCount: 0 };
    }
    runId = existing.id;
  }

  await db.prepare("UPDATE source_streams SET last_attempt_at = ?, last_error_code = NULL WHERE id = ?")
    .bind(now.toISOString(), stream.id)
    .run();

  try {
    const xml = await fetchTrustedRss(provider, { fetchImpl });
    const items = await parseRssFeed(xml, provider, now.toISOString());
    let acceptedCount = 0;
    for (const item of items) {
      await db.prepare(`
        INSERT INTO source_items (
          source_id, provider_item_id, canonical_url, title, published_at, collected_at,
          content_hash, observed_at, last_seen_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id, provider_item_id) DO UPDATE SET
          canonical_url = excluded.canonical_url,
          title = excluded.title,
          published_at = COALESCE(excluded.published_at, source_items.published_at),
          content_hash = excluded.content_hash,
          last_seen_at = excluded.last_seen_at,
          metadata_json = excluded.metadata_json
      `).bind(
        source.id,
        item.providerItemId,
        item.canonicalUrl,
        item.title,
        item.publishedAt,
        item.collectedAt,
        item.contentHash,
        item.collectedAt,
        item.collectedAt,
        JSON.stringify({ contentStatus: "source-metadata", verificationStatus: "unverified" }),
      ).run();
      const stored = await db.prepare("SELECT id FROM source_items WHERE source_id = ? AND provider_item_id = ?")
        .bind(source.id, item.providerItemId)
        .first();
      if (!stored) throw new IngestionError("source_item_write_failed", "수집 자료 저장을 확인하지 못했습니다.");
      await db.prepare(`
        INSERT INTO source_item_streams (source_item_id, stream_id, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source_item_id, stream_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
      `).bind(stored.id, stream.id, item.collectedAt, item.collectedAt).run();
      acceptedCount += 1;
    }
    await finishRun(db, runId, {
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      fetchedCount: items.length,
      acceptedCount,
      errorCode: null,
    });
    await db.prepare("UPDATE source_streams SET last_success_at = ?, last_error_code = NULL WHERE id = ?")
      .bind(new Date().toISOString(), stream.id)
      .run();
    return { sourceKey: provider.sourceKey, status: "succeeded", fetchedCount: items.length, acceptedCount };
  } catch (error) {
    const code = error instanceof IngestionError ? error.code : "ingestion_failed";
    await finishRun(db, runId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      fetchedCount: 0,
      acceptedCount: 0,
      errorCode: code,
    });
    await db.prepare("UPDATE source_streams SET last_error_code = ? WHERE id = ?").bind(code, stream.id).run();
    return { sourceKey: provider.sourceKey, status: "failed", fetchedCount: 0, acceptedCount: 0, errorCode: code };
  }
}

export async function runAllSourceStreams(db, options = {}) {
  return Promise.all(SOURCE_PROVIDERS.map((provider) => runSourceStream(db, provider, options)));
}
