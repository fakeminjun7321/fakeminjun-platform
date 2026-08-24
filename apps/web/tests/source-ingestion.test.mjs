import assert from "node:assert/strict";
import test from "node:test";
import {
  IngestionError,
  MAX_RSS_BYTES,
  MAX_RSS_ITEMS,
  MAX_RETAINED_SOURCE_ITEMS_PER_SOURCE,
  canonicalizeSourceUrl,
  fetchTrustedRss,
  parseRssFeed,
  pruneUnreferencedSourceItems,
} from "../worker/ingestion.js";
import { SOURCE_PROVIDERS, sourceProviderByKey } from "../worker/sourceRegistry.js";

function rss(items) {
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items.join("")}</channel></rss>`;
}

function item({ title = "공식 발표", link = "https://www.mofa.go.kr/test", guid = "item-1", date = "Fri, 22 Aug 2026 03:00:00 GMT" } = {}) {
  return `<item><title><![CDATA[${title}]]></title><link>${link}</link><guid>${guid}</guid><pubDate>${date}</pubDate><content:encoded>저장하면 안 되는 본문</content:encoded></item>`;
}

test("source registry contains only fixed HTTPS official endpoints", () => {
  assert.equal(SOURCE_PROVIDERS.length, 4);
  assert.deepEqual(SOURCE_PROVIDERS.map(({ lane }) => lane), [
    "korea-core", "korea-core", "us-impact", "rapid-change",
  ]);
  for (const provider of SOURCE_PROVIDERS) {
    const feed = new URL(provider.feedUrl);
    assert.equal(feed.protocol, "https:");
    assert.equal(feed.username, "");
    assert.equal(feed.password, "");
    assert.ok(provider.articleHosts.length > 0);
    assert.equal(Object.isFrozen(provider), true);
  }
});

test("RSS parser stores bounded metadata and ignores embedded article content", async () => {
  const provider = sourceProviderByKey("mofa-press");
  const parsed = await parseRssFeed(rss([item({
    title: "외교부\u202E 공식 발표",
    link: "http://www.mofa.go.kr:443/www/brd/m_4080/view.do?seq=1&amp;page=1",
  })]), provider, "2026-08-22T04:00:00.000Z");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, "외교부 공식 발표");
  assert.equal(parsed[0].canonicalUrl, "https://www.mofa.go.kr/www/brd/m_4080/view.do?seq=1&page=1");
  assert.equal(parsed[0].collectedAt, "2026-08-22T04:00:00.000Z");
  assert.equal(Object.hasOwn(parsed[0], "content"), false);
  assert.match(parsed[0].providerItemId, /^[0-9a-f]{64}$/);

  const repeated = await parseRssFeed(rss([item()]), provider);
  const repeatedAgain = await parseRssFeed(rss([item()]), provider);
  assert.equal(repeated[0].providerItemId, repeatedAgain[0].providerItemId);
});

test("RSS parser rejects entity declarations and untrusted article URLs", async () => {
  const provider = sourceProviderByKey("mofa-press");
  await assert.rejects(
    () => parseRssFeed(`<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${rss([item()])}`, provider),
    (error) => error instanceof IngestionError && error.code === "feed_xml_declaration_rejected",
  );
  const parsed = await parseRssFeed(rss([
    item({ link: "javascript:alert(1)", guid: "bad-js" }),
    item({ link: "https://attacker.example/news", guid: "bad-host" }),
    item({ link: "https://user:pass@www.mofa.go.kr/news", guid: "bad-credentials" }),
  ]), provider);
  assert.deepEqual(parsed, []);
  assert.equal(canonicalizeSourceUrl("http://www.mofa.go.kr/news", provider), null);
});

test("RSS parser caps feed fan-out", async () => {
  const provider = sourceProviderByKey("mofa-press");
  const items = Array.from({ length: MAX_RSS_ITEMS + 10 }, (_, index) => item({
    title: `발표 ${index}`,
    link: `https://www.mofa.go.kr/news/${index}`,
    guid: `item-${index}`,
  }));
  const parsed = await parseRssFeed(rss(items), provider);
  assert.equal(parsed.length, MAX_RSS_ITEMS);
});

test("source retention prunes only overflow rows that are not evidence", async () => {
  let sql = "";
  let bindings = [];
  const db = {
    prepare(statement) {
      sql = statement;
      return {
        bind(...values) {
          bindings = values;
          return { run: async () => ({ meta: { changes: 3 } }) };
        },
      };
    },
  };
  const result = await pruneUnreferencedSourceItems(db, 7, 25);
  assert.equal(result.meta.changes, 3);
  assert.deepEqual(bindings, [7, 7, 25]);
  assert.match(sql, /LIMIT -1 OFFSET \?/);
  assert.match(sql, /event_sources/);
  assert.match(sql, /event_candidate_sources/);
  assert.match(sql, /event_candidate_evidence_reviews/);
  assert.match(sql, /evidence_spans/);
  assert.equal(MAX_RETAINED_SOURCE_ITEMS_PER_SOURCE, 2_000);
  await assert.rejects(() => pruneUnreferencedSourceItems(db, 7, 0), /positive integer/);
});

test("RSS parser neutralizes implausible future dates and oversized GUID prefixes", async () => {
  const provider = sourceProviderByKey("mofa-press");
  const sharedPrefix = "g".repeat(4096);
  const parsed = await parseRssFeed(rss([
    item({ link: "https://www.mofa.go.kr/news/future", guid: `${sharedPrefix}-one`, date: "Fri, 01 Jan 9999 00:00:00 GMT" }),
    item({ link: "https://www.mofa.go.kr/news/normal", guid: `${sharedPrefix}-two`, date: "Fri, 22 Aug 2026 03:00:00 GMT" }),
  ]), provider, "2026-08-22T04:00:00.000Z");
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].publishedAt, null);
  assert.notEqual(parsed[0].providerItemId, parsed[1].providerItemId);
});

test("trusted fetch rejects cross-host redirects without forwarding cookies", async () => {
  const provider = sourceProviderByKey("mofa-press");
  const calls = [];
  await assert.rejects(
    () => fetchTrustedRss(provider, {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return new Response(null, {
          status: 307,
          headers: { location: "https://attacker.example/feed", "set-cookie": "session=secret; Secure" },
        });
      },
    }),
    (error) => error.code === "feed_redirect_rejected",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.cookie, undefined);
  assert.equal(calls[0].options.redirect, "manual");
});

test("MOFA same-URL cookie challenge is allowed once and only once", async () => {
  const provider = sourceProviderByKey("mofa-press");
  const calls = [];
  const body = rss([item()]);
  const result = await fetchTrustedRss(provider, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return new Response(null, {
          status: 307,
          headers: { location: provider.feedUrl, "set-cookie": "TMOSHCooKie=value/123+=; Path=/; Secure" },
        });
      }
      return new Response(body, { headers: { "content-type": "application/rss+xml" } });
    },
  });
  assert.equal(result, body);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.cookie, "TMOSHCooKie=value/123+=");
});

test("trusted fetch rejects wrong content types and oversized chunked bodies", async () => {
  const provider = sourceProviderByKey("un-peace-security");
  await assert.rejects(
    () => fetchTrustedRss(provider, {
      fetchImpl: async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
    }),
    (error) => error.code === "feed_content_type_rejected",
  );

  let cancelled = false;
  const oversized = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(MAX_RSS_BYTES + 1));
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(
    () => fetchTrustedRss(provider, {
      fetchImpl: async () => new Response(oversized, { headers: { "content-type": "application/rss+xml" } }),
    }),
    (error) => error.code === "feed_too_large",
  );
  assert.equal(cancelled, true);
});

test("trusted fetch cancels a body rejected by declared Content-Length", async () => {
  const provider = sourceProviderByKey("un-peace-security");
  let cancelled = false;
  const body = new ReadableStream({
    start() {},
    cancel() { cancelled = true; },
  });
  await assert.rejects(
    () => fetchTrustedRss(provider, {
      fetchImpl: async () => new Response(body, {
        headers: {
          "content-type": "application/rss+xml",
          "content-length": String(MAX_RSS_BYTES + 1),
        },
      }),
    }),
    (error) => error.code === "feed_too_large",
  );
  assert.equal(cancelled, true);
});
