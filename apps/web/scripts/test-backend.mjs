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
    "--var", "EVENT_EDITOR_SUBJECT:local-development-user",
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

function jsonMutation(method, body, idempotencyKey = null) {
  const headers = {
    "content-type": "application/json",
    origin: frontendOrigin,
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  return {
    method,
    headers,
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

  await run(wrangler, [
    "d1", "execute", "fakeminjun-platform-local",
    "--local", "--persist-to", stateDirectory,
    "--command",
    `
      INSERT INTO source_items (
        source_id, provider_item_id, canonical_url, title, published_at, collected_at,
        content_hash, observed_at, last_seen_at, metadata_json
      )
      SELECT id, 'fixture-2', 'https://www.whitehouse.gov/briefings-statements/fixture-2',
        'White House official metadata fixture', '2026-08-22T02:02:00.000Z',
        '2026-08-22T02:06:00.000Z', 'fixture-hash-2', '2026-08-22T02:06:00.000Z',
        '2026-08-22T02:06:00.000Z', '{"contentStatus":"source-metadata","verificationStatus":"unverified"}'
      FROM sources WHERE source_key = 'whitehouse-briefings';

      INSERT INTO source_item_streams (source_item_id, stream_id, first_seen_at, last_seen_at)
      SELECT si.id, ss.id, '2026-08-22T02:06:00.000Z', '2026-08-22T02:06:00.000Z'
      FROM source_items si
      JOIN sources s ON s.id = si.source_id
      JOIN source_streams ss ON ss.source_id = s.id
      WHERE si.provider_item_id = 'fixture-2';

      INSERT INTO users (external_subject, email)
      VALUES
        ('local-development-user', 'local@fakeminjun.invalid'),
        ('other-candidate-user', 'other-candidate@fakeminjun.invalid');

      INSERT INTO event_candidates (
        id, owner_id, status, review_decision, revision, source_count,
        source_item_ids_json, evidence_digest, model_contract, result_json, candidate_hash, model_id,
        usage_json, prompt_version, idempotency_key, request_hash, completed_at
      )
      SELECT
        'candidate-local', u.id, 'ready', 'unreviewed', 1, 2,
        json_array(
          (SELECT id FROM source_items WHERE provider_item_id = 'fixture-1'),
          (SELECT id FROM source_items WHERE provider_item_id = 'fixture-2')
        ),
        '${"e".repeat(64)}', 'responses:gpt-fixture:strict:event_candidate_metadata_review:v1',
        json_object(
          'title', '공식 발표 메타데이터 후보',
          'summary', '두 공식 제목의 관계를 검토하는 미검증 후보입니다.',
          'whyGrouped', '가까운 시각에 수집된 공식 외교 발표입니다.',
          'regionLabel', '한미',
          'laneRecommendation', 'uncertain',
          'sourceAssessments', json_array(
            json_object(
              'evidenceId', (SELECT id FROM source_items WHERE provider_item_id = 'fixture-1'),
              'relationship', 'context',
              'note', '원문 확인 전에는 같은 전개인지 판단할 수 없습니다.'
            ),
            json_object(
              'evidenceId', (SELECT id FROM source_items WHERE provider_item_id = 'fixture-2'),
              'relationship', 'context',
              'note', '제목 수준의 맥락 자료입니다.'
            )
          ),
          'uncertainties', json_array('원문 본문을 수집하지 않았습니다.'),
          'nextChecks', json_array('두 원문을 직접 열어 발표 대상을 대조합니다.')
        ),
        '${"a".repeat(64)}', 'gpt-fixture', '{}', 'event-candidate-metadata-v1',
        'fixture-candidate-local', '${"b".repeat(64)}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      FROM users u WHERE u.external_subject = 'local-development-user';

      INSERT INTO event_candidate_sources (
        candidate_id, source_item_id, evidence_id, position, title_snapshot,
        canonical_url_snapshot, published_at_snapshot, collected_at_snapshot,
        content_hash_snapshot, source_key_snapshot, source_name_snapshot,
        source_role_snapshot, source_lane_snapshot
      )
      SELECT
        'candidate-local', si.id, si.id,
        CASE si.provider_item_id WHEN 'fixture-1' THEN 0 ELSE 1 END,
        si.title, si.canonical_url, si.published_at, si.collected_at, si.content_hash,
        s.source_key, s.name, s.source_role, ss.lane
      FROM source_items si
      JOIN sources s ON s.id = si.source_id
      JOIN source_item_streams sis ON sis.source_item_id = si.id
      JOIN source_streams ss ON ss.id = sis.stream_id
      WHERE si.provider_item_id IN ('fixture-1', 'fixture-2');

      INSERT INTO event_candidates (
        id, owner_id, status, review_decision, revision, source_count,
        source_item_ids_json, evidence_digest, model_contract, result_json, candidate_hash, model_id,
        usage_json, prompt_version, idempotency_key, request_hash, completed_at
      )
      SELECT
        'candidate-other', u.id, 'ready', 'unreviewed', 1, 2,
        '[]', '${"f".repeat(64)}', 'responses:gpt-fixture:strict:event_candidate_metadata_review:v1',
        '{}', '${"c".repeat(64)}', 'gpt-fixture', '{}',
        'event-candidate-metadata-v1', 'fixture-candidate-other', '${"d".repeat(64)}',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      FROM users u WHERE u.external_subject = 'other-candidate-user';
    `,
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

  const candidates = await request("/api/v1/event-candidates?status=ready&reviewStatus=unreviewed&limit=10");
  assert.equal(candidates.response.status, 200, `${JSON.stringify(candidates.body)}\n${workerProcess.getCapturedOutput()}`);
  assert.equal(candidates.body.meta.dataStatus, "private-source-metadata-candidates-unverified");
  assert.deepEqual(candidates.body.data.map(({ id }) => id), ["candidate-local"]);
  assert.equal(candidates.body.data[0].title, "공식 발표 메타데이터 후보");
  assert.equal(candidates.body.data[0].reviewStatus, "unreviewed");
  assert.equal(candidates.body.data[0].evidenceSnapshots.length, 2);
  assert.equal(candidates.body.data[0].sourceAssessments.length, 2);
  assert.equal(candidates.body.data[0].verificationStatus, "unverified");
  assert.equal(candidates.body.data[0].mapReadiness.ready, false);

  const reviewBody = {
    decision: "reviewed",
    expectedRevision: 1,
    candidateHash: "a".repeat(64),
    note: "원문을 추가로 대조해야 함",
  };
  const reviewedCandidate = await request(
    "/api/v1/event-candidates/candidate-local/reviews",
    jsonMutation("POST", reviewBody, "candidate-review-local-1"),
  );
  assert.equal(reviewedCandidate.response.status, 201, JSON.stringify(reviewedCandidate.body));
  assert.equal(reviewedCandidate.body.data.reviewStatus, "reviewed");
  assert.equal(reviewedCandidate.body.data.revision, 2);
  assert.equal(reviewedCandidate.body.data.verificationStatus, "unverified");
  assert.equal(reviewedCandidate.body.data.reviewReceipt.decision, "reviewed");
  const reviewReceiptId = reviewedCandidate.body.data.reviewReceipt.id;

  const replayedReview = await request(
    "/api/v1/event-candidates/candidate-local/reviews",
    jsonMutation("POST", reviewBody, "candidate-review-local-1"),
  );
  assert.equal(replayedReview.response.status, 200);
  assert.equal(replayedReview.body.data.revision, 2);
  assert.equal(replayedReview.body.data.reviewReceipt.id, reviewReceiptId);

  const conflictedReviewKey = await request(
    "/api/v1/event-candidates/candidate-local/reviews",
    jsonMutation("POST", {
      ...reviewBody,
      decision: "hold",
    }, "candidate-review-local-1"),
  );
  assert.equal(conflictedReviewKey.response.status, 409);
  assert.equal(conflictedReviewKey.body.error.code, "idempotency_conflict");

  const staleReview = await request(
    "/api/v1/event-candidates/candidate-local/reviews",
    jsonMutation("POST", {
      ...reviewBody,
      decision: "hold",
    }, "candidate-review-local-2"),
  );
  assert.equal(staleReview.response.status, 409);
  assert.equal(staleReview.body.error.code, "candidate_revision_conflict");

  const reviewedList = await request("/api/v1/event-candidates?reviewStatus=reviewed&limit=10");
  assert.equal(reviewedList.response.status, 200);
  assert.deepEqual(reviewedList.body.data.map(({ id }) => id), ["candidate-local"]);

  const promoted = await request("/api/v1/event-candidates/candidate-local/promote", {
    method: "POST",
    headers: { origin: frontendOrigin },
  });
  assert.equal(promoted.response.status, 409);
  assert.equal(promoted.body.error.code, "candidate_not_map_ready");
  assert.equal(promoted.body.error.details.eventsWritten, 0);
  const eventsAfterPromotionAttempt = await request("/api/v1/events?limit=100");
  assert.deepEqual(
    eventsAfterPromotionAttempt.body.data.map(({ id }) => id).sort((left, right) => left - right),
    [1, 2, 3, 4, 5, 6],
  );

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

  const persistedCandidates = await request("/api/v1/event-candidates?limit=10");
  assert.equal(persistedCandidates.response.status, 200);
  assert.deepEqual(persistedCandidates.body.data.map(({ id }) => id), ["candidate-local"]);
  assert.equal(persistedCandidates.body.data[0].reviewStatus, "reviewed");
  assert.equal(persistedCandidates.body.data[0].revision, 2);

  const removed = await request(`/api/v1/notes/${noteId}`, {
    method: "DELETE",
    headers: { origin: frontendOrigin },
  });
  assert.equal(removed.response.status, 204);

  console.log("Backend integration passed: D1 migrations, non-live events, live-unverified source metadata, private metadata candidates, idempotent review receipts, owner isolation, promotion lock, persistence, optimistic locking, levels, and deletion.");
} finally {
  await stopWorker(workerProcess);
  await rm(stateDirectory, { recursive: true, force: true });
}
