import assert from "node:assert/strict";
import test from "node:test";

import {
  createEicarTestPdf,
  createUniqueCleanPdf,
  runLiveBackendVerification,
} from "../scripts/verify-live-backend.mjs";

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function scanReceipt(status) {
  return {
    engineVersion: "1.5.4",
    databaseVersion: "27888",
    databaseUpdatedAt: "2026-08-23T04:00:00.000Z",
    completedAt: "2026-08-23T05:00:00.000Z",
    errorCode: status === "blocked" ? "Win.Test.EICAR_HDB-1" : null,
  };
}

function createLiveBackendMock() {
  const baseline = {
    id: "pre-existing-personal-file",
    filename: "do-not-delete.pdf",
    byteSize: 41,
    antivirusStatus: "clean",
    scan: scanReceipt("clean"),
  };
  const files = new Map([[baseline.id, baseline]]);
  const objectBytes = new Map();
  const listReads = new Map();
  const calls = [];
  let usedFiles = 1;
  let usedBytes = baseline.byteSize;
  let nextFile = 0;
  let analysisExists = false;

  function listBody() {
    for (const file of files.values()) {
      if (file.id === baseline.id || file.antivirusStatus !== "not-scanned") continue;
      const reads = (listReads.get(file.id) ?? 0) + 1;
      listReads.set(file.id, reads);
      if (reads < 2) continue;
      if (file.filename.includes("eicar")) {
        file.antivirusStatus = "blocked";
        file.scan = scanReceipt("blocked");
        // Model the real scanner ordering: the blocked verdict can be visible
        // one read before R2 deletion and quota release have completed.
        file.releaseAfterRead = reads + 1;
      } else {
        file.antivirusStatus = "clean";
        file.scan = scanReceipt("clean");
      }
    }
    for (const file of files.values()) {
      if (file.antivirusStatus === "blocked" && !file.objectDeleted
        && (listReads.get(file.id) ?? 0) >= file.releaseAfterRead) {
        file.objectDeleted = true;
        usedFiles -= 1;
        usedBytes -= file.byteSize;
        objectBytes.delete(file.id);
      }
      if (file.antivirusStatus === "blocked") listReads.set(file.id, (listReads.get(file.id) ?? 0) + 1);
    }
    return {
      data: [...files.values()].map((file) => ({
        id: file.id,
        filename: file.filename,
        byteSize: file.byteSize,
        antivirusStatus: file.antivirusStatus,
        scan: file.scan,
      })),
      meta: {
        storage: "private-r2",
        scanner: "async-clamav",
        quota: { usedFiles, usedBytes, maxFiles: 250, maxBytes: 2_147_483_648 },
      },
    };
  }

  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);

    if (url.pathname === "/api/v1/health") return json({ data: { database: "ready" } });
    if (url.pathname === "/api/v1/physics/files" && method === "GET") return json(listBody());
    if (url.pathname === "/api/v1/physics/files" && method === "POST") {
      const file = options.body.get("file");
      const bytes = Buffer.from(await file.arrayBuffer());
      const id = `verification-file-${++nextFile}`;
      files.set(id, {
        id,
        filename: file.name,
        byteSize: bytes.byteLength,
        antivirusStatus: "not-scanned",
        scan: { engineVersion: null, databaseVersion: null, databaseUpdatedAt: null, completedAt: null, errorCode: null },
      });
      objectBytes.set(id, bytes);
      usedFiles += 1;
      usedBytes += bytes.byteLength;
      return json({ data: { id, antivirusStatus: "not-scanned" } }, 202);
    }

    const download = url.pathname.match(/^\/api\/v1\/physics\/files\/([^/]+)\/download$/);
    if (download) {
      const file = files.get(download[1]);
      if (file?.antivirusStatus === "blocked") {
        return json({ error: { code: "physics_file_blocked" } }, 423);
      }
      return new Response(objectBytes.get(download[1]), {
        status: 200,
        headers: { "content-type": "application/octet-stream", "x-physics-antivirus-status": "clean" },
      });
    }

    const analysis = url.pathname.match(/^\/api\/v1\/physics\/files\/([^/]+)\/analyses$/);
    if (analysis) {
      const file = files.get(analysis[1]);
      if (file?.antivirusStatus === "blocked") {
        return json({ error: { code: "physics_file_blocked" } }, 423);
      }
      analysisExists = true;
      return json({ data: {
        id: "verification-analysis",
        status: "completed",
        models: ["gpt-test"],
        evidence: [{ cited: true }],
        result: { citations: [{ evidenceId: analysis[1] }] },
      } }, 201);
    }

    if (url.pathname === "/api/v1/analyses" && method === "GET") {
      return json({ data: analysisExists ? [{ id: "verification-analysis" }] : [] });
    }
    if (url.pathname === "/api/v1/analyses/verification-analysis" && method === "GET") {
      return json({ data: { id: "verification-analysis", evidence: [{ cited: true }] } });
    }
    if (url.pathname === "/api/v1/analyses/verification-analysis" && method === "DELETE") {
      analysisExists = false;
      return new Response(null, { status: 204 });
    }

    const removeFile = url.pathname.match(/^\/api\/v1\/physics\/files\/([^/]+)$/);
    if (removeFile && method === "DELETE") {
      const file = files.get(removeFile[1]);
      if (file && !file.objectDeleted) {
        usedFiles -= 1;
        usedBytes -= file.byteSize;
      }
      files.delete(removeFile[1]);
      objectBytes.delete(removeFile[1]);
      return new Response(null, { status: 204 });
    }
    return json({ error: { code: "unexpected_mock_route", path: url.pathname, method } }, 500);
  };

  return { fetchImpl, calls, baseline };
}

test("safe EICAR fixture is a bounded valid PDF with the standardized marker in an EmbeddedFile", () => {
  const fixture = createEicarTestPdf("focused-test");
  const marker = [
    "X5O!P%@AP[4", "\\", "PZX54(P^)7CC)7}$", "EICAR-STANDARD-", "ANTIVIRUS-TEST-FILE!$H+H*",
  ].join("");
  assert.match(fixture.subarray(0, 8).toString("latin1"), /^%PDF-/);
  assert.match(fixture.subarray(-64).toString("latin1"), /%%EOF\n$/);
  assert.equal(fixture.includes(Buffer.from(marker, "ascii")), true);
  assert.match(fixture.toString("latin1"), /\/Type \/EmbeddedFile \/Subtype \/application#2Foctet-stream \/Length 68/);
  assert.match(fixture.toString("latin1"), /\/EF << \/F 7 0 R \/UF 7 0 R >>/);
  const startXref = Number(fixture.toString("latin1").match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  assert.equal(fixture.subarray(startXref, startXref + 4).toString("ascii"), "xref");
  assert.ok(fixture.byteLength < 2048);
});

test("clean fixture receives a unique harmless PDF comment without changing the source buffer", () => {
  const original = Buffer.from("%PDF-1.7\n%%EOF\n", "ascii");
  const copy = Buffer.from(original);
  const unique = createUniqueCleanPdf(original, "run-123");
  assert.deepEqual(original, copy);
  assert.notDeepEqual(unique, original);
  assert.match(unique.toString("latin1"), /%%EOF[\s\S]*run-123/);
});

test("live verifier polls quarantine to exact clean, exercises download and AI, and blocks EICAR without deleting existing files", async () => {
  const mock = createLiveBackendMock();
  const result = await runLiveBackendVerification({
    fixture: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "ascii"),
    includeEicar: true,
    baseUrl: "https://verification.invalid",
    appOrigin: "https://fakeminjun.vip",
    fetchImpl: mock.fetchImpl,
    scanTimeoutMs: 2_000,
    pollIntervalMs: 1,
    sleep: async () => {},
    marker: "focused-live-contract",
  });

  assert.equal(result.status, "passed");
  assert.equal(result.clean.antivirusStatus, "clean");
  assert.equal(result.clean.analysisStatus, "completed");
  assert.equal(result.malware.status, "blocked");
  assert.equal(result.malware.testMarker, "EICAR");
  assert.match(result.malware.threatName, /EICAR/);
  assert.equal(mock.calls.includes("GET /api/v1/physics/files/verification-file-1/download"), true);
  assert.equal(mock.calls.includes("POST /api/v1/physics/files/verification-file-1/analyses"), true);
  assert.equal(mock.calls.includes("GET /api/v1/physics/files/verification-file-2/download"), true);
  assert.equal(mock.calls.includes("POST /api/v1/physics/files/verification-file-2/analyses"), true);
  assert.equal(mock.calls.includes("DELETE /api/v1/physics/files/pre-existing-personal-file"), false);
});
