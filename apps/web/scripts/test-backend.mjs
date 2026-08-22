#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", ".bin", "wrangler");
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "fakeminjun-backend-test-"));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});
const apiOrigin = `http://127.0.0.1:${port}`;
const frontendOrigin = "http://127.0.0.1:5173";
let workerProcess;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, CI: "1", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with ${code}\n${output}`));
    });
  });
}

async function startWorker() {
  const child = spawn(wrangler, [
    "dev",
    "--local",
    "--ip", "127.0.0.1",
    "--port", String(port),
    "--persist-to", stateDirectory,
  ], {
    cwd: root,
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.on("error", (error) => { output += `\n${error.stack ?? error}`; });
  child.getCapturedOutput = () => output;

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Worker exited before becoming ready.\n${output}`);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/health`);
      if (response.status === 200) return child;
    } catch {
      // The local port is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGTERM");
  throw new Error(`Timed out waiting for the local Worker.\n${output}`);
}

async function stopWorker(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function request(pathname, options = {}) {
  const response = await fetch(`${apiOrigin}${pathname}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

function jsonMutation(method, body) {
  return {
    method,
    headers: {
      "content-type": "application/json",
      origin: frontendOrigin,
    },
    body: JSON.stringify(body),
  };
}

try {
  await run(wrangler, [
    "d1", "migrations", "apply", "fakeminjun-platform-local",
    "--local", "--persist-to", stateDirectory,
  ]);

  await run(wrangler, [
    "d1", "execute", "fakeminjun-platform-local",
    "--local", "--persist-to", stateDirectory,
    "--command",
    "INSERT INTO source_items (source_id, provider_item_id, canonical_url, title, published_at, collected_at, content_hash, observed_at, last_seen_at, metadata_json) SELECT id, 'fixture-1', 'https://www.mofa.go.kr/test/fixture-1', '외교부 공식 수집 자료 테스트', '2026-08-22T02:00:00.000Z', '2026-08-22T02:05:00.000Z', 'fixture-hash', '2026-08-22T02:05:00.000Z', '2026-08-22T02:05:00.000Z', '{\"contentStatus\":\"source-metadata\",\"verificationStatus\":\"unverified\"}' FROM sources WHERE source_key = 'mofa-press'; INSERT INTO source_item_streams (source_item_id, stream_id, first_seen_at, last_seen_at) SELECT si.id, ss.id, '2026-08-22T02:05:00.000Z', '2026-08-22T02:05:00.000Z' FROM source_items si JOIN sources s ON s.id = si.source_id JOIN source_streams ss ON ss.source_id = s.id WHERE si.provider_item_id = 'fixture-1'; UPDATE source_streams SET last_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_success_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error_code = NULL WHERE lane = 'korea-core';",
  ]);

  workerProcess = await startWorker();

  const events = await request("/api/v1/events?bbox=110,0,140,45&layers=korea-core&limit=10");
  assert.equal(events.response.status, 200);
  assert.deepEqual(events.body.data.map(({ id }) => id), [1, 5]);
  assert.equal(events.body.meta.dataStatus, "non-live-demo");

  const sourceItems = await request("/api/v1/source-items?lanes=korea-core&limit=10");
  assert.equal(sourceItems.response.status, 200, `${JSON.stringify(sourceItems.body)}\n${workerProcess.getCapturedOutput()}`);
  assert.equal(sourceItems.response.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
  assert.equal(sourceItems.body.meta.dataStatus, "collected-source-metadata-unverified");
  assert.equal(sourceItems.body.meta.collectionStatus, "current");
  assert.equal(sourceItems.body.data.length, 1);
  assert.equal(sourceItems.body.data[0].title, "외교부 공식 수집 자료 테스트");
  assert.equal(sourceItems.body.data[0].live, true);
  assert.equal(sourceItems.body.data[0].verificationStatus, "unverified");

  const event = await request("/api/v1/events/1");
  assert.equal(event.response.status, 200);
  assert.equal(event.body.data.title, "한미 공급망 실무 협의 종료");
  assert.equal(event.body.data.facts.length, 3);

  const session = await request("/api/v1/session");
  assert.equal(session.response.status, 200);
  assert.equal(session.body.data.authenticated, true);

  const levels = await request("/api/v1/profile/levels", jsonMutation("PUT", {
    international: "I2",
    physics: "P4",
  }));
  assert.equal(levels.response.status, 200);
  assert.deepEqual({
    international: levels.body.data.international,
    physics: levels.body.data.physics,
  }, { international: "I2", physics: "P4" });

  const created = await request("/api/v1/notes", jsonMutation("POST", {
    subjectType: "event",
    subjectId: 1,
    body: "근거와 추론을 분리해서 다시 검토한다.",
  }));
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.version, 1);
  const noteId = created.body.data.id;

  const updated = await request(`/api/v1/notes/${noteId}`, jsonMutation("PATCH", {
    body: "근거와 추론을 분리하고 반대 설명도 확인한다.",
    expectedVersion: 1,
  }));
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.data.version, 2);

  const conflict = await request(`/api/v1/notes/${noteId}`, jsonMutation("PATCH", {
    body: "오래된 버전으로 덮어쓰지 않는다.",
    expectedVersion: 1,
  }));
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.error.code, "note_version_conflict");

  await stopWorker(workerProcess);
  await run(wrangler, [
    "d1", "execute", "fakeminjun-platform-local",
    "--local", "--persist-to", stateDirectory,
    "--command",
    "INSERT INTO users (external_subject, email) VALUES ('other-test-user', 'other@fakeminjun.invalid'); INSERT INTO notes (id, owner_id, subject_type, subject_id, body) SELECT 'other-user-note', id, 'event', '1', '다른 사용자의 비공개 노트' FROM users WHERE external_subject = 'other-test-user';",
  ]);
  workerProcess = await startWorker();

  const persistedNotes = await request("/api/v1/notes?subjectType=event&subjectId=1");
  assert.equal(persistedNotes.response.status, 200);
  assert.equal(persistedNotes.body.data.length, 1);
  assert.notEqual(persistedNotes.body.data[0].id, "other-user-note");
  assert.equal(persistedNotes.body.data[0].body, "근거와 추론을 분리하고 반대 설명도 확인한다.");
  assert.equal(persistedNotes.body.data[0].version, 2);

  const persistedLevels = await request("/api/v1/profile/levels");
  assert.equal(persistedLevels.response.status, 200);
  assert.equal(persistedLevels.body.data.international, "I2");
  assert.equal(persistedLevels.body.data.physics, "P4");

  const persistedSourceItems = await request("/api/v1/source-items?limit=10");
  assert.equal(persistedSourceItems.response.status, 200);
  assert.equal(persistedSourceItems.body.data.some(({ providerItemId }) => providerItemId === "fixture-1"), true);

  const removed = await request(`/api/v1/notes/${noteId}`, {
    method: "DELETE",
    headers: { origin: frontendOrigin },
  });
  assert.equal(removed.response.status, 204);

  console.log("Backend integration passed: D1 migration, non-live events, live-unverified source metadata, Access identity, owner isolation, persistence, optimistic locking, levels, and deletion.");
} finally {
  await stopWorker(workerProcess);
  await rm(stateDirectory, { recursive: true, force: true });
}
