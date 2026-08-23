import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const frontend = JSON.parse(await readFile(new URL("../wrangler.frontend.production.jsonc", import.meta.url), "utf8"));
const api = JSON.parse(await readFile(new URL("../wrangler.api.production.jsonc", import.meta.url), "utf8"));
const scanner = JSON.parse(await readFile(new URL("../wrangler.scan.production.jsonc", import.meta.url), "utf8"));
const scannerDockerfile = await readFile(new URL("../scanner/Dockerfile", import.meta.url), "utf8");
const scannerSource = await readFile(new URL("../worker/scanner.js", import.meta.url), "utf8");

assert.equal(frontend.name, "fakeminjun-platform-web", "Unexpected frontend Worker name");
assert.equal(frontend.main, "worker/frontend.js", "Unexpected frontend guard entrypoint");
assert.equal(frontend.assets?.directory, "./dist/client", "Frontend asset directory is not the Vite client build");
assert.equal(frontend.assets?.not_found_handling, "single-page-application", "Frontend SPA fallback is missing");
assert.deepEqual(frontend.assets?.run_worker_first, ["/api/*", "/oauth/google-drive/*"], "Missing API or OAuth fallback guard");
assert.deepEqual(frontend.routes, [{ pattern: "fakeminjun.vip", custom_domain: true }]);
assert.equal(frontend.d1_databases, undefined, "Frontend must not receive the production D1 binding");

assert.equal(api.name, "fakeminjun-platform-api", "Unexpected API Worker name");
assert.equal(api.main, "worker/index.js", "Unexpected API entrypoint");
assert.equal(api.assets, undefined, "API Worker must not have a Static Assets binding because ctx.access is required");
assert.equal(api.preview_urls, false, "API preview URLs must remain disabled");
assert.deepEqual(api.routes, [
  { pattern: "fakeminjun.vip/api/*", zone_name: "fakeminjun.vip" },
  { pattern: "fakeminjun.vip/oauth/google-drive/*", zone_name: "fakeminjun.vip" },
]);
assert.equal(api.vars?.APP_ENV, "production");
assert.equal(api.vars?.APP_ORIGIN, "https://fakeminjun.vip");
assert.equal(api.vars?.PHYSICS_SCANNER_ENABLED, "true");

const database = api.d1_databases?.find((binding) => binding.binding === "DB");
assert.ok(database, "Production D1 binding is missing");
assert.equal(database.database_name, "fakeminjun-platform-prod");
assert.match(database.database_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
assert.notEqual(
  database.database_id,
  "00000000-0000-0000-0000-000000000000",
  "Create the production D1 database and replace the placeholder database_id before deployment",
);

const physicsFiles = api.r2_buckets?.find((binding) => binding.binding === "PHYSICS_FILES");
assert.ok(physicsFiles, "Production private physics file R2 binding is missing");
assert.equal(physicsFiles.bucket_name, "fakeminjun-physics-vault");

assert.equal(scanner.name, "fakeminjun-physics-scan");
assert.equal(scanner.main, "worker/scanner.js");
assert.equal(scanner.workers_dev, false);
assert.equal(scanner.preview_urls, false);
assert.equal(scanner.routes, undefined, "Scanner Worker must not expose a public route");
assert.deepEqual(scanner.queues?.consumers?.map(({ queue }) => queue), [
  "fakeminjun-physics-scan",
  "fakeminjun-physics-scan-dlq",
]);
assert.deepEqual(scanner.containers, [{
  class_name: "ClamAvContainer",
  image: "./scanner/Dockerfile",
  max_instances: 1,
  instance_type: "standard-2",
}]);
assert.equal(scanner.vars?.CLOUDFLARE_ACCOUNT_ID, "cf03cf471c6eb89a4ababd4f1f023469");
assert.equal(scanner.vars?.PHYSICS_SCAN_BUCKET, "fakeminjun-physics-vault");
assert.match(scannerDockerfile, /COPY --chown=clamav:clamav studio-7321\.ndb \/var\/lib\/clamav\/studio-7321\.ndb/);
assert.match(scannerDockerfile, /^USER clamav$/m, "Scanner image must run uploaded-file parsers as the non-root clamav user");
assert.match(scannerSource, /const SCAN_TIMEOUT_MS = 120_000;/, "Scanner parse timeout must retain the 120-second policy cap");
assert.match(scannerSource, /enableInternet = true;\s+allowedHosts = \["database\.clamav\.net"\];/, "Scanner egress must remain pinned to the exact FreshClam mirror");
assert.doesNotMatch(scannerSource, /allowedHosts\s*=\s*\[[^\]]*\*/);

console.log("Production deployment config is safe to use.");
