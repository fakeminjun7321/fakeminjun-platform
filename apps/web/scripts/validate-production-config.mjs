import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const frontend = JSON.parse(await readFile(new URL("../wrangler.frontend.production.jsonc", import.meta.url), "utf8"));
const api = JSON.parse(await readFile(new URL("../wrangler.api.production.jsonc", import.meta.url), "utf8"));

assert.equal(frontend.name, "fakeminjun-platform-web", "Unexpected frontend Worker name");
assert.equal(frontend.main, "worker/frontend.js", "Unexpected frontend guard entrypoint");
assert.equal(frontend.assets?.directory, "./dist/client", "Frontend asset directory is not the Vite client build");
assert.equal(frontend.assets?.not_found_handling, "single-page-application", "Frontend SPA fallback is missing");
assert.deepEqual(frontend.assets?.run_worker_first, ["/api/*"], "Missing API fallback guard");
assert.deepEqual(frontend.routes, [{ pattern: "fakeminjun.vip", custom_domain: true }]);
assert.equal(frontend.d1_databases, undefined, "Frontend must not receive the production D1 binding");

assert.equal(api.name, "fakeminjun-platform-api", "Unexpected API Worker name");
assert.equal(api.main, "worker/index.js", "Unexpected API entrypoint");
assert.equal(api.assets, undefined, "API Worker must not have a Static Assets binding because ctx.access is required");
assert.equal(api.preview_urls, false, "API preview URLs must remain disabled");
assert.deepEqual(api.routes, [{ pattern: "fakeminjun.vip/api/*", zone_name: "fakeminjun.vip" }]);
assert.equal(api.vars?.APP_ENV, "production");
assert.equal(api.vars?.APP_ORIGIN, "https://fakeminjun.vip");

const database = api.d1_databases?.find((binding) => binding.binding === "DB");
assert.ok(database, "Production D1 binding is missing");
assert.equal(database.database_name, "fakeminjun-platform-prod");
assert.match(database.database_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
assert.notEqual(
  database.database_id,
  "00000000-0000-0000-0000-000000000000",
  "Create the production D1 database and replace the placeholder database_id before deployment",
);

console.log("Production deployment config is safe to use.");
