import assert from "node:assert/strict";
import test from "node:test";
import {
  parseArxivFeed,
  parseCrossrefResponse,
  searchArxiv,
  searchExternalPhysicsProviders,
} from "../worker/physicsProviders.js";

function textResponse(body, { status = 200, contentType = "text/plain" } = {}) {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

test("arXiv Atom metadata is normalized without storing article bodies", () => {
  const resources = parseArxivFeed(`<?xml version="1.0"?>
    <feed xmlns:arxiv="http://arxiv.org/schemas/atom">
      <entry>
        <id>http://arxiv.org/abs/2608.01234v2</id>
        <updated>2026-08-22T02:00:00Z</updated>
        <published>2026-08-20T01:00:00Z</published>
        <title>  A Hamiltonian &amp; Gauge Test  </title>
        <summary>Metadata summary only.</summary>
        <author><name>Ada Lovelace</name></author>
        <category term="physics.class-ph" />
        <arxiv:primary_category term="physics.class-ph" />
      </entry>
    </feed>`);
  assert.equal(resources.length, 1);
  assert.equal(resources[0].providerItemId, "2608.01234");
  assert.equal(resources[0].title, "A Hamiltonian & Gauge Test");
  assert.equal(resources[0].canonicalUrl, "https://arxiv.org/abs/2608.01234");
  assert.deepEqual(resources[0].authors, ["Ada Lovelace"]);
  assert.equal(resources[0].resourceType, "프리프린트");
});

test("Crossref bibliographic metadata keeps DOI provenance and publication date", () => {
  const resources = parseCrossrefResponse({ message: { items: [{
    DOI: "10.1000/TEST.DOI",
    title: ["Relativistic dynamics"],
    type: "journal-article",
    author: [{ given: "Min", family: "Jun" }],
    published: { "date-parts": [[2026, 8, 3]] },
    "container-title": ["Journal of Tests"],
    publisher: "Test Society",
    "references-count": 12,
    "is-referenced-by-count": 3,
  }] } });
  assert.equal(resources.length, 1);
  assert.equal(resources[0].providerItemId, "10.1000/test.doi");
  assert.equal(resources[0].canonicalUrl, "https://doi.org/10.1000/test.doi");
  assert.equal(resources[0].resourceType, "동료평가 논문");
  assert.equal(resources[0].publishedAt, "2026-08-03T00:00:00.000Z");
  assert.equal(resources[0].metadata.referenceCount, 12);
});

test("provider parsers enforce accepted record counts even when upstream ignores rows", () => {
  const arxivEntries = Array.from({ length: 25 }, (_, index) => (
    `<entry><id>http://arxiv.org/abs/2608.${String(index).padStart(5, "0")}v1</id><title>Result ${index}</title></entry>`
  )).join("");
  assert.equal(parseArxivFeed(`<feed>${arxivEntries}</feed>`, 4).length, 4);

  const crossrefItems = Array.from({ length: 25 }, (_, index) => ({
    DOI: `10.1000/result.${index}`,
    title: [`Result ${index}`],
  }));
  assert.equal(parseCrossrefResponse({ message: { items: crossrefItems } }, 5).length, 5);
});

test("external physics search degrades one provider without losing the other", async () => {
  const calls = [];
  const result = await searchExternalPhysicsProviders("quantum mechanics", {
    limit: 4,
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).startsWith("https://export.arxiv.org/")) {
        return textResponse(`<feed><entry><id>http://arxiv.org/abs/2608.09999v1</id><title>Quantum test</title><summary>Summary</summary><published>2026-08-20T00:00:00Z</published><author><name>Q. Tester</name></author></entry></feed>`);
      }
      return textResponse(JSON.stringify({ error: "temporary" }), { status: 503, contentType: "application/json" });
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(result.resources.length, 1);
  assert.deepEqual(result.status.arxiv, { status: "ok", count: 1 });
  assert.equal(result.status.crossref.status, "error");
});

test("provider fetch rejects redirects and enforces the byte bound while streaming", async () => {
  let redirectPolicy;
  let canceled = false;
  const oversized = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array((1024 * 1024) + 1));
    },
    cancel() {
      canceled = true;
    },
  });
  await assert.rejects(
    () => searchArxiv("oversized", {
      fetchImpl: async (_url, options) => {
        redirectPolicy = options.redirect;
        return new Response(oversized, { status: 200 });
      },
    }),
    /provider_response_too_large/,
  );
  assert.equal(redirectPolicy, "manual");
  assert.equal(canceled, true);

  let redirectBodyCanceled = false;
  await assert.rejects(
    () => searchArxiv("redirect", {
      fetchImpl: async () => new Response(new ReadableStream({
        cancel() {
          redirectBodyCanceled = true;
        },
      }), { status: 302, headers: { location: "https://attacker.invalid/" } }),
    }),
    /provider_redirect_rejected/,
  );
  assert.equal(redirectBodyCanceled, true);
});

test("provider timeout remains active until the response body finishes", async () => {
  let canceled = false;
  const stalled = new ReadableStream({
    pull() {},
    cancel() {
      canceled = true;
    },
  });
  await assert.rejects(
    () => searchArxiv("stalled", {
      timeoutMs: 25,
      fetchImpl: async () => new Response(stalled, { status: 200 }),
    }),
    /provider_timeout/,
  );
  assert.equal(canceled, true);
});
