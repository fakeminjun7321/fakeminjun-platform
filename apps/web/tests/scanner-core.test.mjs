import assert from "node:assert/strict";
import test from "node:test";
import {
  ScanContractError,
  interpretClamAvResult,
  parseClamAvVersion,
  requireCommittedScanTransition,
  requireStableClamAvVersion,
  shouldRetryScanError,
  validateR2CreateEvent,
} from "../worker/scannerCore.js";

const accountId = "cf03cf471c6eb89a4ababd4f1f023469";
const fileId = "123e4567-e89b-42d3-a456-426614174000";

function event(overrides = {}) {
  return {
    account: accountId,
    action: "PutObject",
    bucket: "fakeminjun-physics-vault",
    object: {
      key: `quarantine/owners/42/physics/${fileId}.pdf`,
      size: 1024,
      eTag: "0123456789abcdef0123456789abcdef",
      ...(overrides.object ?? {}),
    },
    eventTime: "2026-08-23T05:00:00.000Z",
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "object")),
  };
}

test("R2 scan events are restricted to the exact account, bucket, action, key, size, and eTag", () => {
  assert.deepEqual(validateR2CreateEvent(event(), { accountId, bucket: "fakeminjun-physics-vault" }), {
    ownerId: 42,
    fileId,
    extension: "pdf",
    objectKey: `quarantine/owners/42/physics/${fileId}.pdf`,
    byteSize: 1024,
    etag: "0123456789abcdef0123456789abcdef",
    eventTime: "2026-08-23T05:00:00.000Z",
  });
  assert.throws(() => validateR2CreateEvent(event({ account: "attacker" }), { accountId }), /account/);
  assert.throws(() => validateR2CreateEvent(event({ action: "CopyObject" }), { accountId }), /PutObject/);
  assert.throws(() => validateR2CreateEvent(event({ object: { key: `owners/42/${fileId}.pdf` } }), { accountId }), /quarantine/);
  assert.throws(() => validateR2CreateEvent(event({ object: { size: (10 * 1024 * 1024) + 1 } }), { accountId }), /size/);
});

test("ClamAV clean and malware verdicts require a fresh, parseable database version", () => {
  const now = new Date("2026-08-23T06:00:00.000Z");
  assert.deepEqual(parseClamAvVersion("ClamAV 1.5.4/27800/Sun Aug 23 05:00:00 2026", { now }), {
    engineVersion: "1.5.4",
    databaseVersion: "27800",
    databaseUpdatedAt: "2026-08-23T05:00:00.000Z",
  });
  assert.equal(interpretClamAvResult({
    exitCode: 0,
    stdout: "",
    stderr: "",
    versionOutput: "ClamAV 1.5.4/27800/Sun Aug 23 05:00:00 2026",
    now,
  }).verdict, "clean");
  assert.deepEqual(interpretClamAvResult({
    exitCode: 1,
    stdout: "stream: Win.Test.EICAR_HDB-1 FOUND",
    stderr: "",
    versionOutput: "ClamAV 1.5.4/27800/Sun Aug 23 05:00:00 2026",
    now,
  }).threatName, "Win.Test.EICAR_HDB-1");
});

test("stale databases, malformed engine exits, and timeouts never become clean", () => {
  const now = new Date("2026-08-23T06:00:00.000Z");
  for (const operation of [
    () => parseClamAvVersion("ClamAV 1.5.4/27000/Thu Aug 20 00:00:00 2026", { now }),
    () => interpretClamAvResult({ exitCode: 2, versionOutput: "ClamAV 1.5.4/27800/Sun Aug 23 05:00:00 2026", now }),
    () => interpretClamAvResult({ exitCode: 0, versionOutput: "ClamAV 1.5.4/27800/Sun Aug 23 05:00:00 2026", timedOut: true, now }),
  ]) {
    assert.throws(operation, (error) => error instanceof ScanContractError && error.retryable);
  }
});

test("only explicit permanent contract errors are acknowledged without retry", () => {
  assert.equal(shouldRetryScanError(new Error("temporary D1 failure")), true);
  assert.equal(shouldRetryScanError(new ScanContractError("temporary", "retry", { retryable: true })), true);
  assert.equal(shouldRetryScanError(new ScanContractError("invalid_event", "reject")), false);
});

test("a verdict requires both the file row and lease row to transition", () => {
  const changed = { meta: { changes: 1 } };
  assert.doesNotThrow(() => requireCommittedScanTransition(changed, changed));
  assert.throws(
    () => requireCommittedScanTransition({ meta: { changes: 0 } }, changed),
    (error) => error instanceof ScanContractError && error.code === "scan_lease_lost" && error.retryable,
  );
  assert.throws(
    () => requireCommittedScanTransition(changed, { meta: { changes: 0 } }),
    (error) => error instanceof ScanContractError && error.code === "scan_lease_lost" && error.retryable,
  );
});

test("a verdict is rejected if ClamAV signatures change during the scan", () => {
  const before = {
    engineVersion: "1.5.4",
    databaseVersion: "28100",
    databaseUpdatedAt: "2026-08-23T05:00:00.000Z",
  };
  assert.doesNotThrow(() => requireStableClamAvVersion(before, { ...before }));
  assert.throws(
    () => requireStableClamAvVersion(before, { ...before, databaseVersion: "28101" }),
    (error) => error instanceof ScanContractError
      && error.code === "clamav_database_changed_during_scan"
      && error.retryable,
  );
});
