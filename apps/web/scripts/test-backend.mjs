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
    "--var", "OPENAI_API_KEY:disabled",
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

async function requestText(pathname, options = {}) {
  const response = await fetch(`${apiOrigin}${pathname}`, options);
  return { response, body: await response.text() };
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

function visualMutation(metadata, image, idempotencyKey, { duplicateMetadata = false } = {}) {
  const body = new FormData();
  body.append("metadata", JSON.stringify(metadata));
  if (duplicateMetadata) body.append("metadata", JSON.stringify(metadata));
  body.append("image", image);
  return {
    method: "POST",
    headers: { origin: frontendOrigin, "idempotency-key": idempotencyKey },
    body,
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
          'laneRecommendation', 'korea-core',
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
        'candidate-race', owner_id, status, 'unreviewed', 1, source_count,
        source_item_ids_json, '${"6".repeat(64)}', model_contract,
        json_set(result_json, '$.title', '동시 승격 무결성 후보'), '${"f".repeat(64)}', model_id,
        usage_json, prompt_version, 'fixture-candidate-race', '${"7".repeat(64)}', completed_at
      FROM event_candidates WHERE id = 'candidate-local';

      INSERT INTO event_candidate_sources (
        candidate_id, source_item_id, evidence_id, position, title_snapshot,
        canonical_url_snapshot, published_at_snapshot, collected_at_snapshot,
        content_hash_snapshot, source_key_snapshot, source_name_snapshot,
        source_role_snapshot, source_lane_snapshot
      )
      SELECT
        'candidate-race', source_item_id, evidence_id, position, title_snapshot,
        canonical_url_snapshot, published_at_snapshot, collected_at_snapshot,
        content_hash_snapshot, source_key_snapshot, source_name_snapshot,
        source_role_snapshot, source_lane_snapshot
      FROM event_candidate_sources WHERE candidate_id = 'candidate-local';

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

      INSERT INTO analysis_runs (
        id, owner_id, domain, mode, prompt, context_json, status, idempotency_key,
        request_hash, requested_mode, routing_reason, orchestration_version, plan_json, created_at
      )
      SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', u.id, 'physics', 'deep',
        'fixture stale analysis', '{}', 'pending', 'fixture-stale-analysis', '${"9".repeat(64)}',
        'auto', 'auto-task-solution-audit', 'bounded-openai-v1',
        '{"taskType":"solution-audit","resolvedMode":"deep"}',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')
      FROM users u WHERE u.external_subject = 'local-development-user';

      INSERT INTO analysis_steps (id, analysis_id, stage, role, position, model_id, status, started_at)
      VALUES
        ('step-fixture-1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'specialist', 'physics-theory', 0, 'gpt-fixture', 'pending', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')),
        ('step-fixture-2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'specialist', 'physics-audit', 1, 'gpt-fixture', 'pending', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')),
        ('step-fixture-3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'synthesis', 'bounded-final-synthesis', 2, 'gpt-fixture', 'pending', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes'));
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
  assert.deepEqual(candidates.body.data.map(({ id }) => id), ["candidate-race", "candidate-local"]);
  const localCandidate = candidates.body.data.find(({ id }) => id === "candidate-local");
  assert.ok(localCandidate);
  assert.equal(localCandidate.title, "공식 발표 메타데이터 후보");
  assert.equal(localCandidate.reviewStatus, "unreviewed");
  assert.equal(localCandidate.evidenceSnapshots.length, 2);
  assert.equal(localCandidate.sourceAssessments.length, 2);
  assert.equal(localCandidate.verificationStatus, "unverified");
  assert.equal(localCandidate.mapReadiness.ready, false);

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

  const promotionBody = { expectedRevision: 2, candidateHash: "a".repeat(64) };
  const lockedPromotion = await request(
    "/api/v1/event-candidates/candidate-local/promote",
    jsonMutation("POST", promotionBody, "candidate-promote-locked"),
  );
  assert.equal(lockedPromotion.response.status, 409);
  assert.equal(lockedPromotion.body.error.code, "candidate_not_map_ready");
  assert.equal(lockedPromotion.body.error.details.eventsWritten, 0);
  const eventsAfterPromotionAttempt = await request("/api/v1/events?limit=100");
  assert.deepEqual(
    eventsAfterPromotionAttempt.body.data.map(({ id }) => id).sort((left, right) => left - right),
    [1, 2, 3, 4, 5, 6],
  );

  const evidenceSnapshots = localCandidate.evidenceSnapshots;
  const supportingEvidence = await request(
    "/api/v1/event-candidates/candidate-local/evidence-reviews",
    jsonMutation("POST", {
      sourceItemId: evidenceSnapshots[0].sourceItemId,
      relationship: "supports",
      locatorType: "paragraph",
      locatorValue: "fixture-paragraph-1",
      excerpt: "사용자가 원문에서 확인한 지지 근거 발췌",
      candidateHash: "a".repeat(64),
    }, "candidate-evidence-1"),
  );
  assert.equal(supportingEvidence.response.status, 201, JSON.stringify(supportingEvidence.body));
  assert.equal(supportingEvidence.body.data.readiness.ready, false);

  const contextEvidence = await request(
    "/api/v1/event-candidates/candidate-local/evidence-reviews",
    jsonMutation("POST", {
      sourceItemId: evidenceSnapshots[1].sourceItemId,
      relationship: "context",
      locatorType: "url",
      locatorValue: evidenceSnapshots[1].originalUrl,
      candidateHash: "a".repeat(64),
    }, "candidate-evidence-2"),
  );
  assert.equal(contextEvidence.response.status, 201, JSON.stringify(contextEvidence.body));
  assert.equal(contextEvidence.body.data.readiness.counts.reviewedEvidence, 2);
  assert.equal(contextEvidence.body.data.readiness.reason, "location-confirmation-required");

  const locatedCandidate = await request(
    "/api/v1/event-candidates/candidate-local/location",
    jsonMutation("PUT", {
      placeName: "서울",
      longitude: 126.978,
      latitude: 37.5665,
      accuracy: "approximate",
      candidateHash: "a".repeat(64),
    }, "candidate-location-1"),
  );
  assert.equal(locatedCandidate.response.status, 201, JSON.stringify(locatedCandidate.body));
  assert.equal(locatedCandidate.body.data.readiness.ready, true);

  const readiness = await request("/api/v1/event-candidates/candidate-local/readiness");
  assert.equal(readiness.response.status, 200);
  assert.equal(readiness.body.data.ready, true);
  assert.deepEqual(readiness.body.data.requirements, {
    candidateReviewed: true,
    evidenceComplete: true,
    supportingEvidence: true,
    locationConfirmed: true,
    laneResolved: true,
  });

  const promoted = await request(
    "/api/v1/event-candidates/candidate-local/promote",
    jsonMutation("POST", promotionBody, "candidate-promote-1"),
  );
  assert.equal(promoted.response.status, 201, `${JSON.stringify(promoted.body)}\n${workerProcess.getCapturedOutput()}`);
  assert.equal(promoted.body.data.verificationStatus, "unverified");
  assert.equal(promoted.body.data.event.status, "unverified");
  assert.equal(promoted.body.data.event.live, true);
  const promotedEventId = promoted.body.data.eventId;

  const replayedPromotion = await request(
    "/api/v1/event-candidates/candidate-local/promote",
    jsonMutation("POST", promotionBody, "candidate-promote-1"),
  );
  assert.equal(replayedPromotion.response.status, 200);
  assert.equal(replayedPromotion.body.data.eventId, promotedEventId);

  const reviewAfterPromotion = await request(
    "/api/v1/event-candidates/candidate-local/reviews",
    jsonMutation("POST", {
      decision: "rejected",
      expectedRevision: 2,
      candidateHash: "a".repeat(64),
      note: "승격 이후 검토는 차단되어야 함",
    }, "candidate-review-after-promotion"),
  );
  assert.equal(reviewAfterPromotion.response.status, 409);
  assert.equal(reviewAfterPromotion.body.error.code, "candidate_already_promoted");

  const raceHash = "f".repeat(64);
  const raceReview = await request(
    "/api/v1/event-candidates/candidate-race/reviews",
    jsonMutation("POST", {
      decision: "reviewed",
      expectedRevision: 1,
      candidateHash: raceHash,
      note: "동시 요청 무결성 검토",
    }, "candidate-race-review-ready"),
  );
  assert.equal(raceReview.response.status, 201, JSON.stringify(raceReview.body));

  for (const [index, snapshot] of evidenceSnapshots.entries()) {
    const evidence = await request(
      "/api/v1/event-candidates/candidate-race/evidence-reviews",
      jsonMutation("POST", {
        sourceItemId: snapshot.sourceItemId,
        relationship: index === 0 ? "supports" : "context",
        locatorType: "url",
        locatorValue: snapshot.originalUrl,
        excerpt: index === 0 ? "동시 승격 무결성 테스트에서 확인한 지지 근거" : undefined,
        candidateHash: raceHash,
      }, `candidate-race-evidence-${index + 1}`),
    );
    assert.equal(evidence.response.status, 201, JSON.stringify(evidence.body));
  }
  const raceLocation = await request(
    "/api/v1/event-candidates/candidate-race/location",
    jsonMutation("PUT", {
      placeName: "서울",
      longitude: 126.978,
      latitude: 37.5665,
      accuracy: "approximate",
      candidateHash: raceHash,
    }, "candidate-race-location"),
  );
  assert.equal(raceLocation.response.status, 201, JSON.stringify(raceLocation.body));
  assert.equal(raceLocation.body.data.readiness.ready, true);

  const [racePromotion, racingReview] = await Promise.all([
    request(
      "/api/v1/event-candidates/candidate-race/promote",
      jsonMutation("POST", { expectedRevision: 2, candidateHash: raceHash }, "candidate-race-promote"),
    ),
    request(
      "/api/v1/event-candidates/candidate-race/reviews",
      jsonMutation("POST", {
        decision: "rejected",
        expectedRevision: 2,
        candidateHash: raceHash,
        note: "승격과 동시에 도착한 재검토",
      }, "candidate-race-review-concurrent"),
    ),
  ]);
  assert.deepEqual(
    [racePromotion.response.status, racingReview.response.status].sort((left, right) => left - right),
    [201, 409],
    JSON.stringify({ promotion: racePromotion.body, review: racingReview.body }),
  );
  const candidatesAfterRace = await request("/api/v1/event-candidates?limit=10");
  const racedCandidate = candidatesAfterRace.body.data.find(({ id }) => id === "candidate-race");
  assert.ok(racedCandidate);
  if (racePromotion.response.status === 201) {
    assert.ok(racedCandidate.promotedEventId);
    assert.equal(racedCandidate.reviewStatus, "reviewed");
    assert.equal(racedCandidate.revision, 2);
  } else {
    assert.equal(racedCandidate.promotedEventId, null);
    assert.equal(racedCandidate.reviewStatus, "rejected");
    assert.equal(racedCandidate.revision, 3);
    const eventsAfterRace = await request("/api/v1/events?limit=100");
    assert.equal(eventsAfterRace.body.data.some(({ title }) => title === "동시 승격 무결성 후보"), false);
  }

  const promotedEvent = await request(`/api/v1/events/${promotedEventId}`);
  assert.equal(promotedEvent.response.status, 200);
  assert.equal(promotedEvent.body.data.status, "unverified");
  assert.equal(promotedEvent.body.data.sourceCount, 2);
  assert.equal(promotedEvent.body.data.sources.length, 2);
  assert.deepEqual(
    promotedEvent.body.data.sources.map(({ relationship }) => relationship).sort(),
    ["context", "supports"],
  );

  const eventsAfterPromotion = await request("/api/v1/events?limit=100");
  assert.equal(eventsAfterPromotion.body.data.some(({ id }) => id === promotedEventId), true);
  assert.equal(eventsAfterPromotion.body.meta.dataStatus, "mixed");

  const event = await request("/api/v1/events/1");
  assert.equal(event.response.status, 200);
  assert.equal(event.body.data.title, "한미 공급망 실무 협의 종료");
  assert.equal(event.body.data.facts.length, 3);

  const physicsSearch = await request("/api/v1/physics/resources?q=MIT&limit=10");
  assert.equal(physicsSearch.response.status, 200, JSON.stringify(physicsSearch.body));
  assert.equal(physicsSearch.body.data.length, 3);
  assert.equal(physicsSearch.body.data.every(({ sourceKind }) => sourceKind === "verified-catalog"), true);

  const savedPhysics = await request(
    "/api/v1/physics/library",
    jsonMutation("POST", { resourceId: "mit-801" }, "physics-save-1"),
  );
  assert.equal(savedPhysics.response.status, 201, JSON.stringify(savedPhysics.body));
  assert.equal(savedPhysics.body.data.saved, true);
  assert.ok(savedPhysics.body.data.libraryId);

  const physicsLibrary = await request("/api/v1/physics/library");
  assert.equal(physicsLibrary.response.status, 200);
  assert.deepEqual(physicsLibrary.body.data.map(({ id }) => id), ["mit-801"]);

  const patchedPhysics = await request(
    "/api/v1/physics/library/mit-801",
    jsonMutation("PATCH", {
      personalNote: "역학 유도 순서를 정리한다.",
      tags: ["역학", "IPhO"],
      expectedRevision: 1,
    }),
  );
  assert.equal(patchedPhysics.response.status, 200, JSON.stringify(patchedPhysics.body));
  assert.equal(patchedPhysics.body.data.revision, 2);

  const physicsExport = await requestText("/api/v1/physics/library/export/obsidian");
  assert.equal(physicsExport.response.status, 200);
  assert.match(physicsExport.response.headers.get("content-type"), /^text\/markdown/);
  assert.match(physicsExport.response.headers.get("content-disposition"), /physics-library\.md/);
  assert.match(physicsExport.body, /MIT 8\.01SC Classical Mechanics/);
  assert.match(physicsExport.body, /역학 유도 순서를 정리한다/);

  const visualMetadata = {
    domain: "physics",
    mode: "auto",
    taskType: "solution-audit",
    prompt: "선택한 풀이의 식과 논리 오류를 점검해줘.",
    level: "P4",
    context: { kind: "physics-capture", refId: "capture-local" },
  };
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const duplicateVisual = await request(
    "/api/v1/visual-analyses",
    visualMutation(visualMetadata, new Blob([pngBytes], { type: "image/png" }), "visual-duplicate", {
      duplicateMetadata: true,
    }),
  );
  assert.equal(duplicateVisual.response.status, 400);
  assert.equal(duplicateVisual.body.error.code, "invalid_capture_fields");

  const webpVisual = await request(
    "/api/v1/visual-analyses",
    visualMutation(visualMetadata, new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }), "visual-webp"),
  );
  assert.equal(webpVisual.response.status, 415);
  assert.equal(webpVisual.body.error.code, "unsupported_capture_type");

  const validVisualWithoutProvider = await request(
    "/api/v1/visual-analyses",
    visualMutation(visualMetadata, new Blob([pngBytes], { type: "image/png" }), "visual-no-provider"),
  );
  assert.equal(validVisualWithoutProvider.response.status, 503);
  assert.equal(validVisualWithoutProvider.body.error.code, "ai_unavailable");

  const recoveredAnalysis = await request("/api/v1/analyses/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assert.equal(recoveredAnalysis.response.status, 200);
  assert.equal(recoveredAnalysis.body.data.requestedMode, "auto");
  assert.equal(recoveredAnalysis.body.data.mode, "deep");
  assert.equal(recoveredAnalysis.body.data.routingReason, "auto-task-solution-audit");
  assert.equal(recoveredAnalysis.body.data.status, "failed");
  assert.equal(recoveredAnalysis.body.data.errorCode, "analysis_stale");
  assert.equal(recoveredAnalysis.body.data.steps.length, 3);
  assert.equal(recoveredAnalysis.body.data.steps.every(({ status, errorCode }) => status === "failed" && errorCode === "analysis_stale"), true);

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
  assert.deepEqual(persistedCandidates.body.data.map(({ id }) => id), ["candidate-race", "candidate-local"]);
  const persistedLocalCandidate = persistedCandidates.body.data.find(({ id }) => id === "candidate-local");
  const persistedRacedCandidate = persistedCandidates.body.data.find(({ id }) => id === "candidate-race");
  assert.equal(persistedLocalCandidate.reviewStatus, "reviewed");
  assert.equal(persistedLocalCandidate.revision, 2);
  assert.equal(persistedLocalCandidate.promotedEventId, promotedEventId);
  assert.equal(persistedLocalCandidate.mapReadiness.reason, "already-promoted");
  assert.equal(Boolean(persistedRacedCandidate.promotedEventId), racePromotion.response.status === 201);
  assert.equal(persistedRacedCandidate.reviewStatus, racePromotion.response.status === 201 ? "reviewed" : "rejected");

  const persistedPhysicsLibrary = await request("/api/v1/physics/library");
  assert.equal(persistedPhysicsLibrary.response.status, 200);
  assert.deepEqual(persistedPhysicsLibrary.body.data.map(({ id }) => id), ["mit-801"]);
  assert.equal(persistedPhysicsLibrary.body.data[0].personalNote, "역학 유도 순서를 정리한다.");
  assert.deepEqual(persistedPhysicsLibrary.body.data[0].tags, ["역학", "IPhO"]);

  const removedPhysics = await request("/api/v1/physics/library/mit-801", {
    method: "DELETE",
    headers: { origin: frontendOrigin },
  });
  assert.equal(removedPhysics.response.status, 204);

  const removed = await request(`/api/v1/notes/${noteId}`, {
    method: "DELETE",
    headers: { origin: frontendOrigin },
  });
  assert.equal(removed.response.status, 204);

  console.log("Backend integration passed: D1 migrations, unverified candidate evidence/location promotion with event-source persistence, physics catalog/library/Markdown export, owner isolation, persistence, optimistic locking, levels, and deletion.");
} finally {
  await stopWorker(workerProcess);
  await rm(stateDirectory, { recursive: true, force: true });
}
