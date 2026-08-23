import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readConfig = async (name) => JSON.parse(
  await readFile(new URL(`../${name}`, import.meta.url), "utf8"),
);

test("production frontend has only a fail-closed API guard and static SPA assets", async () => {
  const config = await readConfig("wrangler.frontend.production.jsonc");

  assert.equal(config.name, "fakeminjun-platform-web");
  assert.equal(config.main, "worker/frontend.js");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.assets, {
    directory: "./dist/client",
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: ["/api/*"],
  });
  assert.deepEqual(config.routes, [{ pattern: "fakeminjun.vip", custom_domain: true }]);
  assert.equal(config.d1_databases, undefined);
  assert.equal(config.vars, undefined);
});

test("production static assets carry restrictive security headers without blocking OpenFreeMap", async () => {
  const headersFile = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  assert.match(headersFile, /^\/\*/m);
  assert.match(headersFile, /Content-Security-Policy: .*script-src 'self'/);
  assert.match(headersFile, /connect-src 'self' https:\/\/tiles\.openfreemap\.org/);
  assert.match(headersFile, /frame-ancestors 'none'/);
  assert.match(headersFile, /Strict-Transport-Security: max-age=86400/);
  assert.match(headersFile, /X-Frame-Options: DENY/);
  assert.match(headersFile, /X-Robots-Tag: noindex, nofollow/);
});

test("production API is isolated to the API route without static assets", async () => {
  const config = await readConfig("wrangler.api.production.jsonc");

  assert.equal(config.name, "fakeminjun-platform-api");
  assert.equal(config.main, "worker/index.js");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.assets, undefined);
  assert.deepEqual(config.routes, [{ pattern: "fakeminjun.vip/api/*", zone_name: "fakeminjun.vip" }]);
  assert.deepEqual(config.vars, {
    APP_ENV: "production",
    APP_ORIGIN: "https://fakeminjun.vip",
    PHYSICS_SCANNER_ENABLED: "true",
  });
  assert.deepEqual(config.triggers?.crons, ["*/10 * * * *"]);

  const database = config.d1_databases?.find((binding) => binding.binding === "DB");
  assert.equal(database?.database_name, "fakeminjun-platform-prod");
  assert.match(database?.database_id ?? "", /^[0-9a-f-]{36}$/i);
  assert.deepEqual(config.r2_buckets, [{
    binding: "PHYSICS_FILES",
    bucket_name: "fakeminjun-physics-vault",
  }]);
});

test("production scanner has no public route and consumes only the bounded AV queues", async () => {
  const config = await readConfig("wrangler.scan.production.jsonc");
  assert.equal(config.name, "fakeminjun-physics-scan");
  assert.equal(config.main, "worker/scanner.js");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.routes, undefined);
  assert.deepEqual(config.queues.consumers.map(({ queue, max_batch_size, max_concurrency }) => ({ queue, max_batch_size, max_concurrency })), [
    { queue: "fakeminjun-physics-scan", max_batch_size: 1, max_concurrency: 1 },
    { queue: "fakeminjun-physics-scan-dlq", max_batch_size: 1, max_concurrency: 1 },
  ]);
  assert.deepEqual(config.containers, [{
    class_name: "ClamAvContainer",
    image: "./scanner/Dockerfile",
    max_instances: 1,
    instance_type: "standard-2",
  }]);

  const dockerfile = await readFile(new URL("../scanner/Dockerfile", import.meta.url), "utf8");
  const customSignatures = await readFile(new URL("../scanner/studio-7321.ndb", import.meta.url), "utf8");
  const scannerSource = await readFile(new URL("../worker/scanner.js", import.meta.url), "utf8");
  assert.match(dockerfile, /^FROM docker\.io\/clamav\/clamav:1\.5\.4@sha256:[0-9a-f]{64}$/m);
  assert.match(dockerfile, /COPY --chown=clamav:clamav studio-7321\.ndb \/var\/lib\/clamav\/studio-7321\.ndb/);
  assert.match(dockerfile, /^USER clamav$/m);
  assert.match(dockerfile, /ENTRYPOINT \["sleep", "infinity"\]/);
  assert.match(customSignatures, /^Studio7321\.EICAR_Embedded_Test:0:\*:[0-9a-f]+\n$/);
  assert.match(scannerSource, /exec\(\["freshclam", "--stdout"\]\)/);
  assert.match(scannerSource, /clamscan --stdout --infected --no-summary/);
  assert.doesNotMatch(scannerSource, /clamdscan/);
  assert.match(scannerSource, /const SCAN_TIMEOUT_MS = 120_000;/);
  assert.match(scannerSource, /enableInternet = true;\s+allowedHosts = \["database\.clamav\.net"\];/);
  assert.doesNotMatch(scannerSource, /allowedHosts\s*=\s*\[[^\]]*\*/);
});

test("frontend guard never serves the SPA shell for a missing API route", async () => {
  const { default: frontend } = await import(`../worker/frontend.js?test=${Date.now()}`);
  let assetFetches = 0;
  const env = {
    ASSETS: {
      async fetch() {
        assetFetches += 1;
        return new Response("asset");
      },
    },
  };

  const apiResponse = await frontend.fetch(new Request("https://fakeminjun.vip/api/v1/health"), env);
  assert.equal(apiResponse.status, 503);
  assert.equal(apiResponse.headers.get("cache-control"), "no-store");
  assert.equal((await apiResponse.json()).error.code, "api_route_unavailable");
  assert.equal(assetFetches, 0);

  const appResponse = await frontend.fetch(new Request("https://fakeminjun.vip/physics/learn"), env);
  assert.equal(appResponse.status, 200);
  assert.equal(await appResponse.text(), "asset");
  assert.equal(assetFetches, 1);
  assert.match(appResponse.headers.get("content-security-policy") ?? "", /connect-src 'self' https:\/\/tiles\.openfreemap\.org/);
  assert.match(appResponse.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(appResponse.headers.get("strict-transport-security"), "max-age=86400");
  assert.equal(appResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(appResponse.headers.get("x-frame-options"), "DENY");
  assert.equal(appResponse.headers.get("referrer-policy"), "no-referrer");
  assert.match(appResponse.headers.get("permissions-policy") ?? "", /display-capture=\(self\)/);
});
