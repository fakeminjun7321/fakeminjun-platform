const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";
const CROSSREF_ENDPOINT = "https://api.crossref.org/works";
const MAX_PROVIDER_BYTES = 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 8_000;

function collapseWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlText(block, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return collapseWhitespace(decodeXml(match?.[1] ?? ""));
}

function xmlTexts(block, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...block.matchAll(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi"))]
    .map((match) => collapseWhitespace(decodeXml(match[1])))
    .filter(Boolean);
}

function xmlAttribute(block, tag, attribute) {
  const tagPattern = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attributePattern = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${tagPattern}\\s[^>]*${attributePattern}=["']([^"']+)["'][^>]*>`, "i"));
  return collapseWhitespace(decodeXml(match?.[1] ?? ""));
}

function safeIsoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function trimText(value, maxLength) {
  const normalized = collapseWhitespace(value);
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function arxivIdFromUrl(value) {
  try {
    const url = new URL(value);
    const id = url.pathname.replace(/^\/abs\//, "").replace(/v\d+$/i, "");
    return /^[A-Za-z0-9./-]{3,80}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function parseArxivFeed(xml) {
  return [...String(xml ?? "").matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].flatMap((match) => {
    const block = match[1];
    const providerItemId = arxivIdFromUrl(xmlText(block, "id"));
    const title = trimText(xmlText(block, "title"), 300);
    if (!providerItemId || !title) return [];
    const authors = [...block.matchAll(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/gi)]
      .map((author) => xmlText(author[1], "name"))
      .filter(Boolean)
      .slice(0, 20);
    const categories = [...block.matchAll(/<category\s[^>]*term=["']([^"']+)["'][^>]*\/?\s*>/gi)]
      .map((category) => collapseWhitespace(decodeXml(category[1])))
      .filter(Boolean);
    const primaryCategory = xmlAttribute(block, "arxiv:primary_category", "term") || categories[0] || "physics";
    return [{
      providerKey: "arxiv",
      providerItemId,
      title,
      canonicalUrl: `https://arxiv.org/abs/${providerItemId}`,
      resourceType: "프리프린트",
      topic: primaryCategory,
      level: "P4–P5",
      language: "영어",
      authors,
      summary: trimText(xmlText(block, "summary"), 2_000),
      publishedAt: safeIsoDate(xmlText(block, "published")),
      rightsNote: "arXiv 메타데이터와 원문 링크만 저장하며 프리프린트임을 표시",
      metadata: {
        categories,
        updatedAt: safeIsoDate(xmlText(block, "updated")),
        doi: xmlText(block, "arxiv:doi") || null,
      },
    }];
  });
}

function crossrefDate(item) {
  const parts = item?.published?.["date-parts"]?.[0]
    ?? item?.published_print?.["date-parts"]?.[0]
    ?? item?.published_online?.["date-parts"]?.[0];
  if (!Array.isArray(parts) || !parts.length) return null;
  const [year, month = 1, day = 1] = parts;
  if (!Number.isInteger(year)) return null;
  return safeIsoDate(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`);
}

export function parseCrossrefResponse(body) {
  const items = Array.isArray(body?.message?.items) ? body.message.items : [];
  return items.flatMap((item) => {
    const doi = collapseWhitespace(item?.DOI).toLowerCase();
    const title = trimText(item?.title?.[0], 300);
    if (!doi || !title || doi.length > 200) return [];
    const authors = (Array.isArray(item.author) ? item.author : []).map((author) => collapseWhitespace(
      [author.given, author.family].filter(Boolean).join(" "),
    )).filter(Boolean).slice(0, 20);
    const container = collapseWhitespace(item?.["container-title"]?.[0]);
    return [{
      providerKey: "crossref",
      providerItemId: doi,
      title,
      canonicalUrl: `https://doi.org/${doi}`,
      resourceType: item.type === "journal-article" ? "동료평가 논문" : "학술 자료",
      topic: container || "물리·학술",
      level: "P4–P5",
      language: collapseWhitespace(item.language) || "언어 미표기",
      authors,
      summary: trimText(item.abstract || `${container || "Crossref"}에 등록된 DOI 메타데이터`, 2_000),
      publishedAt: crossrefDate(item),
      rightsNote: "Crossref 서지 메타데이터와 DOI 링크만 저장하며 원문 제공 여부와 구분",
      metadata: {
        doi,
        containerTitle: container || null,
        publisher: collapseWhitespace(item.publisher) || null,
        referenceCount: Number.isFinite(item["references-count"]) ? item["references-count"]
          : Number.isFinite(item["reference-count"]) ? item["reference-count"] : null,
        citationCount: Number.isFinite(item["is-referenced-by-count"]) ? item["is-referenced-by-count"] : null,
      },
    }];
  });
}

async function readBoundedProviderResponse(response, signal) {
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_PROVIDER_BYTES) throw new Error("provider_response_too_large");
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PROVIDER_BYTES) throw new Error("provider_response_too_large");
    return new TextDecoder().decode(bytes);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  const cancelOnAbort = () => { void reader.cancel("provider_timeout").catch(() => {}); };
  signal?.addEventListener("abort", cancelOnAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("provider_response_invalid");
      total += value.byteLength;
      if (total > MAX_PROVIDER_BYTES) {
        await reader.cancel("provider_response_too_large").catch(() => {});
        throw new Error("provider_response_too_large");
      }
      chunks.push(value);
    }
    if (signal?.aborted) throw new Error("provider_timeout");
  } finally {
    signal?.removeEventListener("abort", cancelOnAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchProviderText(fetchImpl, url, options = {}, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("provider_timeout"), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, redirect: "error", signal: controller.signal });
    if (response.redirected) throw new Error("provider_redirect_rejected");
    if (response.url && new URL(response.url).origin !== url.origin) {
      throw new Error("provider_origin_mismatch");
    }
    return await readBoundedProviderResponse(response, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function arxivQuery(value) {
  const terms = collapseWhitespace(value).split(" ").filter(Boolean).slice(0, 12)
    .map((term) => term.replace(/["()]/g, ""))
    .filter(Boolean);
  return terms.map((term) => `all:${term}`).join(" AND ");
}

export async function searchArxiv(query, { fetchImpl = globalThis.fetch, limit = 6, timeoutMs = PROVIDER_TIMEOUT_MS } = {}) {
  const url = new URL(ARXIV_ENDPOINT);
  url.searchParams.set("search_query", arxivQuery(query));
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(Math.min(Math.max(limit, 1), 10)));
  url.searchParams.set("sortBy", "relevance");
  url.searchParams.set("sortOrder", "descending");
  const body = await fetchProviderText(fetchImpl, url, {
    headers: { accept: "application/atom+xml", "user-agent": "STUDIO-7321/1.0 (+https://fakeminjun.vip)" },
  }, timeoutMs);
  return parseArxivFeed(body);
}

export async function searchCrossref(query, {
  fetchImpl = globalThis.fetch,
  limit = 6,
  mailto = "",
  timeoutMs = PROVIDER_TIMEOUT_MS,
} = {}) {
  const url = new URL(CROSSREF_ENDPOINT);
  url.searchParams.set("query.bibliographic", collapseWhitespace(query));
  url.searchParams.set("rows", String(Math.min(Math.max(limit, 1), 10)));
  url.searchParams.set("select", "DOI,title,author,published,published-print,published-online,container-title,publisher,type,abstract,references-count,is-referenced-by-count");
  if (mailto) url.searchParams.set("mailto", mailto);
  const body = await fetchProviderText(fetchImpl, url, {
    headers: { accept: "application/json", "user-agent": "STUDIO-7321/1.0 (+https://fakeminjun.vip)" },
  }, timeoutMs);
  return parseCrossrefResponse(JSON.parse(body));
}

export async function searchExternalPhysicsProviders(query, options = {}) {
  const providers = [
    ["arxiv", () => searchArxiv(query, options)],
    ["crossref", () => searchCrossref(query, options)],
  ];
  const settled = await Promise.allSettled(providers.map(([, search]) => search()));
  const resources = [];
  const status = {};
  settled.forEach((result, index) => {
    const provider = providers[index][0];
    if (result.status === "fulfilled") {
      resources.push(...result.value);
      status[provider] = { status: "ok", count: result.value.length };
    } else {
      const reason = result.reason?.name === "AbortError" ? "timeout" : String(result.reason?.message ?? "provider_error");
      status[provider] = { status: "error", errorCode: reason.slice(0, 120) };
    }
  });
  return { resources, status };
}
