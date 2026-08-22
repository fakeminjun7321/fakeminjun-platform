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
  });
  assert.deepEqual(config.triggers?.crons, ["*/30 * * * *"]);

  const database = config.d1_databases?.find((binding) => binding.binding === "DB");
  assert.equal(database?.database_name, "fakeminjun-platform-prod");
  assert.match(database?.database_id ?? "", /^[0-9a-f-]{36}$/i);
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
});
