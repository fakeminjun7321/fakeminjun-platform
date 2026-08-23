#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:8791";
const DEFAULT_APP_ORIGIN = "https://fakeminjun.vip";
const DEFAULT_SCAN_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

function finitePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assertPdfFixture(bytes) {
  assert.ok(bytes instanceof Uint8Array || Buffer.isBuffer(bytes), "clean fixture must be bytes");
  const head = Buffer.from(bytes).subarray(0, 8).toString("latin1");
  const tail = Buffer.from(bytes).subarray(Math.max(0, bytes.byteLength - 4096)).toString("latin1");
  assert.match(head, /^%PDF-/i, "clean fixture must start with a PDF header");
  assert.match(tail, /%%EOF/, "clean fixture must contain a PDF EOF marker near the end");
}

export function createUniqueCleanPdf(fixture, marker) {
  assertPdfFixture(fixture);
  return Buffer.concat([
    Buffer.from(fixture),
    Buffer.from(`\n% STUDIO-7321 verification ${marker.replace(/[\r\n]/g, " ")}\n`, "utf8"),
  ]);
}

export function createEicarTestPdf(marker = "studio-7321") {
  // Build the standardized, non-executable EICAR test marker at runtime so
  // repository scanners do not mistake this source file for a malware sample.
  const eicar = [
    "X5O!P%@AP[4",
    "\\",
    "PZX54(P^)7CC)7}$",
    "EICAR-STANDARD-",
    "ANTIVIRUS-TEST-FILE!$H+H*",
  ].join("");
  assert.equal(Buffer.byteLength(eicar, "ascii"), 68);
  const comment = marker.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 5 0 R >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
    "<< /Names [(eicar.com) 6 0 R] >>",
    "<< /Type /Filespec /F (eicar.com) /UF (eicar.com) /EF << /F 7 0 R /UF 7 0 R >> >>",
    `<< /Type /EmbeddedFile /Subtype /application#2Foctet-stream /Length 68 >>\nstream\n${eicar}\nendstream`,
  ];
  const chunks = [Buffer.from(`%PDF-1.7\n% Safe EICAR verification fixture: ${comment}\n`, "ascii")];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, "ascii"));
  }
  const xrefOffset = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    "%%EOF",
    "",
  ].join("\n");
  chunks.push(Buffer.from(xref, "ascii"));
  return Buffer.concat(chunks);
}

function physicsFileById(body, fileId) {
  return body?.data?.find?.(({ id }) => id === fileId) ?? null;
}

function assertScanReceipt(file, expectedStatus) {
  assert.equal(file?.antivirusStatus, expectedStatus, JSON.stringify(file));
  assert.ok(file.scan?.engineVersion, "scan receipt must include the ClamAV engine version");
  assert.ok(file.scan?.databaseVersion, "scan receipt must include the signature database version");
  assert.ok(Number.isFinite(Date.parse(file.scan?.databaseUpdatedAt)), "scan receipt must include a valid database update time");
  assert.ok(Number.isFinite(Date.parse(file.scan?.completedAt)), "scan receipt must include a valid completion time");
  if (expectedStatus === "clean") assert.equal(file.scan.errorCode, null);
  if (expectedStatus === "blocked") assert.ok(file.scan.errorCode, "blocked receipt must include the detected test signature");
}

async function waitForScanStatus({
  fileId,
  expectedStatus,
  listFiles,
  timeoutMs,
  pollIntervalMs,
  sleep,
}) {
  const deadline = Date.now() + timeoutMs;
  const terminalFailures = expectedStatus === "clean" ? new Set(["blocked", "error"]) : new Set(["clean", "error"]);
  let lastFile = null;
  while (Date.now() <= deadline) {
    const listed = await listFiles();
    lastFile = physicsFileById(listed.body, fileId);
    assert.ok(lastFile, `uploaded verification file ${fileId} disappeared while awaiting its scan`);
    if (lastFile.antivirusStatus === expectedStatus) return { file: lastFile, listed };
    if (terminalFailures.has(lastFile.antivirusStatus)) {
      throw new Error(`scan reached ${lastFile.antivirusStatus}, expected ${expectedStatus}: ${JSON.stringify(lastFile.scan)}`);
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`scan timed out awaiting ${expectedStatus}: ${JSON.stringify(lastFile)}`);
}

export async function runLiveBackendVerification({
  fixture,
  includeEicar = false,
  baseUrl = DEFAULT_BASE_URL,
  appOrigin = DEFAULT_APP_ORIGIN,
  accessToken = null,
  fetchImpl = globalThis.fetch,
  scanTimeoutMs = DEFAULT_SCAN_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  marker = `STUDIO 7321 production verification ${new Date().toISOString()} ${crypto.randomUUID()}`,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const cleanFixture = createUniqueCleanPdf(fixture, marker);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const cleanFilename = `studio-7321-clean-${crypto.randomUUID()}.pdf`;
  const malwareFilename = `studio-7321-eicar-${crypto.randomUUID()}.pdf`;
  const createdFileIds = new Set();
  let cleanFileId = null;
  let malwareFileId = null;
  let analysisId = null;
  let baseline = null;
  let primaryError = null;

  async function api(pathname, options = {}) {
    const response = await fetchImpl(`${normalizedBaseUrl}${pathname}`, {
      signal: AbortSignal.timeout(120_000),
      ...options,
      headers: {
        ...(accessToken ? { "cf-access-token": accessToken } : {}),
        ...options.headers,
        ...(options.headers?.origin ? { origin: appOrigin } : {}),
      },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    return { response, body };
  }

  const listFiles = async () => {
    const listed = await api("/api/v1/physics/files");
    assert.equal(listed.response.status, 200, JSON.stringify(listed.body));
    return listed;
  };

  async function waitForQuota(usedFiles, usedBytes) {
    const deadline = Date.now() + scanTimeoutMs;
    let listed = null;
    while (Date.now() <= deadline) {
      listed = await listFiles();
      if (listed.body.meta.quota.usedFiles === usedFiles && listed.body.meta.quota.usedBytes === usedBytes) return listed;
      await sleep(pollIntervalMs);
    }
    throw new Error(`storage quota did not settle after scan: ${JSON.stringify(listed?.body?.meta?.quota)}`);
  }

  async function uploadPdf(bytes, filename) {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/pdf" }), filename);
    const uploaded = await api("/api/v1/physics/files", {
      method: "POST",
      headers: { origin: appOrigin, "idempotency-key": crypto.randomUUID() },
      body: form,
    });
    assert.equal(uploaded.response.status, 202, `verification upload must create a new quarantined file: ${JSON.stringify(uploaded.body)}`);
    assert.ok(uploaded.body?.data?.id);
    assert.equal(uploaded.body.data.antivirusStatus, "not-scanned");
    createdFileIds.add(uploaded.body.data.id);
    return uploaded.body.data.id;
  }

  const analysisRequest = (fileId, prompt, title, idempotencyKey = crypto.randomUUID()) => api(
    `/api/v1/physics/files/${fileId}/analyses`,
    {
      method: "POST",
      headers: {
        origin: appOrigin,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        domain: "physics",
        mode: "auto",
        taskType: "full-derivation",
        prompt,
        level: "P4",
        context: { kind: "physics-file", refId: fileId, title },
      }),
    },
  );

  try {
    const health = await api("/api/v1/health");
    assert.equal(health.response.status, 200, JSON.stringify(health.body));
    assert.equal(health.body?.data?.database, "ready");

    const before = await listFiles();
    assert.equal(before.body?.meta?.storage, "private-r2");
    assert.equal(before.body?.meta?.scanner, "async-clamav");
    baseline = {
      ids: new Set(before.body.data.map(({ id }) => id)),
      usedFiles: before.body.meta.quota.usedFiles,
      usedBytes: before.body.meta.quota.usedBytes,
    };

    cleanFileId = await uploadPdf(cleanFixture, cleanFilename);
    assert.equal(baseline.ids.has(cleanFileId), false, "verification must never reuse a pre-existing personal file");

    const clean = await waitForScanStatus({
      fileId: cleanFileId,
      expectedStatus: "clean",
      listFiles,
      timeoutMs: scanTimeoutMs,
      pollIntervalMs,
      sleep,
    });
    assertScanReceipt(clean.file, "clean");
    assert.equal(clean.listed.body.meta.quota.usedFiles, baseline.usedFiles + 1);
    assert.equal(clean.listed.body.meta.quota.usedBytes, baseline.usedBytes + cleanFixture.byteLength);

    const download = await fetchImpl(`${normalizedBaseUrl}/api/v1/physics/files/${cleanFileId}/download`, {
      signal: AbortSignal.timeout(30_000),
      headers: accessToken ? { "cf-access-token": accessToken } : undefined,
    });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/octet-stream");
    assert.equal(download.headers.get("x-physics-antivirus-status"), "clean");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), cleanFixture);

    const analysis = await analysisRequest(
      cleanFileId,
      `${marker}. 이 자료의 핵심 물리 개념과 식을 페이지 근거와 함께 간결하게 설명해줘.`,
      cleanFilename,
    );
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

    let malware = { status: "skipped", reason: "run with --eicar to exercise the safe EICAR test marker" };
    if (includeEicar) {
      const eicarFixture = createEicarTestPdf(marker);
      malwareFileId = await uploadPdf(eicarFixture, malwareFilename);
      assert.equal(baseline.ids.has(malwareFileId), false, "EICAR verification must never reuse a pre-existing personal file");
      const blocked = await waitForScanStatus({
        fileId: malwareFileId,
        expectedStatus: "blocked",
        listFiles,
        timeoutMs: scanTimeoutMs,
        pollIntervalMs,
        sleep,
      });
      assertScanReceipt(blocked.file, "blocked");
      await waitForQuota(baseline.usedFiles + 1, baseline.usedBytes + cleanFixture.byteLength);

      const blockedDownload = await api(`/api/v1/physics/files/${malwareFileId}/download`);
      assert.equal(blockedDownload.response.status, 423, JSON.stringify(blockedDownload.body));
      assert.equal(blockedDownload.body?.error?.code, "physics_file_blocked");

      const blockedAnalysis = await analysisRequest(
        malwareFileId,
        "안전한 EICAR 테스트 파일은 AI 공급자에게 전달되지 않아야 한다.",
        malwareFilename,
      );
      assert.equal(blockedAnalysis.response.status, 423, JSON.stringify(blockedAnalysis.body));
      assert.equal(blockedAnalysis.body?.error?.code, "physics_file_blocked");
      malware = {
        status: "blocked",
        testMarker: "EICAR",
        threatName: blocked.file.scan.errorCode,
        download: "blocked-before-object-read",
        analysis: "blocked-before-openai",
      };
    }

    return {
      status: "passed",
      clean: {
        uploadStatus: "quarantined",
        antivirusStatus: clean.file.antivirusStatus,
        byteSize: cleanFixture.byteLength,
        engineVersion: clean.file.scan.engineVersion,
        databaseVersion: clean.file.scan.databaseVersion,
        analysisStatus: analysis.body.data.status,
        citations: analysis.body.data.result.citations.length,
        historyReopened: true,
      },
      malware,
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    if (analysisId) {
      const removedAnalysis = await api(`/api/v1/analyses/${analysisId}`, {
        method: "DELETE",
        headers: { origin: appOrigin },
      }).catch((error) => ({ error }));
      if (removedAnalysis.error || removedAnalysis.response.status !== 204) cleanupErrors.push(removedAnalysis.error ?? new Error(JSON.stringify(removedAnalysis.body)));
    }
    for (const fileId of [malwareFileId, cleanFileId]) {
      if (!fileId) continue;
      const removedFile = await api(`/api/v1/physics/files/${fileId}`, {
        method: "DELETE",
        headers: { origin: appOrigin },
      }).catch((error) => ({ error }));
      if (removedFile.error || removedFile.response.status !== 204) cleanupErrors.push(removedFile.error ?? new Error(JSON.stringify(removedFile.body)));
    }
    if (baseline) {
      const after = await listFiles().catch((error) => ({ error }));
      if (after.error) cleanupErrors.push(after.error);
      else {
        const remainingIds = new Set(after.body.data.map(({ id }) => id));
        for (const fileId of createdFileIds) {
          if (remainingIds.has(fileId)) cleanupErrors.push(new Error(`verification file ${fileId} remained after cleanup`));
        }
        if (after.body.meta.quota.usedFiles !== baseline.usedFiles || after.body.meta.quota.usedBytes !== baseline.usedBytes) {
          cleanupErrors.push(new Error(`verification quota was not restored: ${JSON.stringify(after.body.meta.quota)}`));
        }
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
        primaryError ? "live verification and cleanup failed" : "live verification cleanup failed",
      );
    }
  }
}

export async function runCli(args = process.argv.slice(2)) {
  const fixturePath = args.find((argument) => !argument.startsWith("--"));
  if (!fixturePath) {
    throw new Error("Usage: node scripts/verify-live-backend.mjs <clean-fixture.pdf> [--eicar]");
  }
  const result = await runLiveBackendVerification({
    fixture: await readFile(path.resolve(fixturePath)),
    includeEicar: args.includes("--eicar"),
    baseUrl: process.env.STUDIO_7321_VERIFY_URL || DEFAULT_BASE_URL,
    appOrigin: process.env.STUDIO_7321_APP_ORIGIN || DEFAULT_APP_ORIGIN,
    accessToken: process.env.STUDIO_7321_ACCESS_TOKEN || null,
    scanTimeoutMs: finitePositiveInteger(process.env.STUDIO_7321_SCAN_TIMEOUT_MS, DEFAULT_SCAN_TIMEOUT_MS),
    pollIntervalMs: finitePositiveInteger(process.env.STUDIO_7321_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
  });
  console.log(JSON.stringify(result));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await runCli();
