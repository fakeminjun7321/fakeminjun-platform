#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.STUDIO_7321_VERIFY_URL || "http://127.0.0.1:8791";
const appOrigin = process.env.STUDIO_7321_APP_ORIGIN || "https://fakeminjun.vip";
const fixturePath = process.argv[2];

if (!fixturePath) throw new Error("Usage: node scripts/verify-live-physics.mjs <fixture.pdf>");

const fixture = await readFile(path.resolve(fixturePath));
const marker = `STUDIO 7321 production verification ${new Date().toISOString()}`;
let fileId = null;
let analysisId = null;

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    signal: AbortSignal.timeout(120_000),
    ...options,
  });
  const body = response.status === 204
    ? null
    : await response.json().catch(() => null);
  return { response, body };
}

function mutation(method, body, idempotencyKey = null) {
  const headers = { origin: appOrigin };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  if (body != null) headers["content-type"] = "application/json";
  return { method, headers, body: body == null ? undefined : JSON.stringify(body) };
}

try {
  const health = await api("/api/v1/health");
  assert.equal(health.response.status, 200, JSON.stringify(health.body));
  assert.equal(health.body?.data?.database, "ready");

  const before = await api("/api/v1/physics/files");
  assert.equal(before.response.status, 200, JSON.stringify(before.body));
  assert.equal(before.body?.meta?.storage, "private-r2");
  assert.equal(before.body?.data?.length, 0, "verification identity must start with an empty vault");

  const form = new FormData();
  form.append("file", new Blob([fixture], { type: "application/pdf" }), "studio-7321-production-verification.pdf");
  const upload = await api("/api/v1/physics/files", {
    method: "POST",
    headers: { origin: appOrigin, "idempotency-key": crypto.randomUUID() },
    body: form,
  });
  assert.equal(upload.response.status, 201, JSON.stringify(upload.body));
  fileId = upload.body?.data?.id;
  assert.ok(fileId);
  assert.equal(upload.body.data.antivirusStatus, "not-scanned");

  const listed = await api("/api/v1/physics/files");
  assert.equal(listed.response.status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body?.meta?.quota?.usedFiles, 1);
  assert.equal(listed.body?.meta?.quota?.usedBytes, fixture.byteLength);

  const download = await fetch(`${baseUrl}/api/v1/physics/files/${fileId}/download`, {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/octet-stream");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), fixture);

  const analysis = await api(`/api/v1/physics/files/${fileId}/analyses`, mutation("POST", {
    domain: "physics",
    mode: "auto",
    taskType: "full-derivation",
    prompt: `${marker}. 이 자료의 핵심 물리 개념과 식을 페이지 근거와 함께 간결하게 설명해줘.`,
    level: "P4",
    context: {
      kind: "physics-file",
      refId: fileId,
      title: "studio-7321-production-verification.pdf",
    },
  }, crypto.randomUUID()));
  assert.equal(analysis.response.status, 201, JSON.stringify(analysis.body));
  analysisId = analysis.body?.data?.id;
  assert.ok(analysisId);
  assert.equal(analysis.body.data.status, "completed");
  assert.ok(analysis.body.data.models?.length >= 1);
  assert.equal(analysis.body.data.evidence?.length, 1);
  assert.equal(analysis.body.data.evidence[0].cited, true);
  assert.ok(analysis.body.data.result?.citations?.length >= 1);

  const history = await api(`/api/v1/analyses?q=${encodeURIComponent(marker)}&domain=physics&status=completed&limit=10`);
  assert.equal(history.response.status, 200, JSON.stringify(history.body));
  assert.equal(history.body?.data?.some(({ id }) => id === analysisId), true);

  const reopened = await api(`/api/v1/analyses/${analysisId}`);
  assert.equal(reopened.response.status, 200, JSON.stringify(reopened.body));
  assert.equal(reopened.body?.data?.id, analysisId);
  assert.equal(reopened.body?.data?.evidence?.[0]?.cited, true);

  console.log(JSON.stringify({
    status: "passed",
    storage: listed.body.meta.storage,
    byteSize: fixture.byteLength,
    analysisStatus: analysis.body.data.status,
    models: analysis.body.data.models,
    citations: analysis.body.data.result.citations.length,
    evidenceLinks: analysis.body.data.evidence.length,
    historyReopened: true,
  }));
} finally {
  if (analysisId) {
    const removedAnalysis = await api(`/api/v1/analyses/${analysisId}`, mutation("DELETE"));
    assert.equal(removedAnalysis.response.status, 204, JSON.stringify(removedAnalysis.body));
  }
  if (fileId) {
    const removedFile = await api(`/api/v1/physics/files/${fileId}`, mutation("DELETE"));
    assert.equal(removedFile.response.status, 204, JSON.stringify(removedFile.body));
  }
  const after = await api("/api/v1/physics/files");
  assert.equal(after.response.status, 200, JSON.stringify(after.body));
  assert.equal(after.body?.data?.length, 0);
  assert.equal(after.body?.meta?.quota?.usedFiles, 0);
  assert.equal(after.body?.meta?.quota?.usedBytes, 0);
}
