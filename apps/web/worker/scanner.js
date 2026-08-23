import { Container, getContainer } from "@cloudflare/containers";
import {
  ScanContractError,
  interpretClamAvResult,
  normalizeR2Etag,
  parseClamAvVersion,
  requireCommittedScanTransition,
  requireStableClamAvVersion,
  shouldRetryScanError,
  validateR2CreateEvent,
} from "./scannerCore.js";

const SCAN_TIMEOUT_MS = 120_000;
const VERSION_TIMEOUT_MS = 15_000;
const SCAN_LEASE_SECONDS = 600;
const PRIMARY_QUEUE = "fakeminjun-physics-scan";
const DEAD_LETTER_QUEUE = "fakeminjun-physics-scan-dlq";

export class ClamAvContainer extends Container {
  sleepAfter = "10m";
  enableInternet = true;
  allowedHosts = ["database.clamav.net"];

  async captureProcess(process, timeoutMs) {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      process.kill();
    }, timeoutMs);
    try {
      const output = await process.output();
      return { output, timedOut };
    } finally {
      clearTimeout(timer);
    }
  }

  async version() {
    const process = await this.ctx.container.exec(["clamdscan", "--version"]);
    const { output, timedOut } = await this.captureProcess(process, VERSION_TIMEOUT_MS);
    if (timedOut) {
      throw new ScanContractError("clamav_version_timeout", "ClamAV version check timed out.", { retryable: true });
    }
    if (output.exitCode !== 0) {
      throw new ScanContractError("clamav_version_error", "ClamAV version check failed.", { retryable: true });
    }
    const versionOutput = new TextDecoder().decode(output.stdout);
    return { versionOutput, parsed: parseClamAvVersion(versionOutput) };
  }

  async scan(input) {
    this.renewActivityTimeout();
    if (!this.ctx.container.running) await this.start();
    const before = await this.version();
    const process = await this.ctx.container.exec([
      "clamdscan",
      "--wait",
      "--stdout",
      "--infected",
      "--no-summary",
      "--stream",
      "-",
    ], { stdin: input });
    const { output, timedOut } = await this.captureProcess(process, SCAN_TIMEOUT_MS);
    const after = await this.version();
    requireStableClamAvVersion(before.parsed, after.parsed);
    return interpretClamAvResult({
      exitCode: output.exitCode,
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
      versionOutput: after.versionOutput,
      timedOut,
    });
  }
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function requireScannerBindings(env) {
  if (!env.DB || !env.PHYSICS_FILES || !env.CLAMAV) {
    throw new ScanContractError("scanner_bindings_missing", "Scanner bindings are incomplete.", { retryable: true });
  }
}

async function markFileScanError(db, fileId, code) {
  await db.batch([
    db.prepare(`
      UPDATE physics_files
      SET antivirus_status = 'error', scan_error_code = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND antivirus_status NOT IN ('clean', 'blocked')
    `).bind(code, fileId),
    db.prepare(`
      UPDATE physics_file_scan_jobs
      SET state = 'error', last_error_code = ?, lease_id = NULL, lease_expires_at = NULL,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE file_id = ? AND (
        state IN ('pending', 'error')
        OR (state = 'scanning' AND lease_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `).bind(code, fileId),
  ]);
}

async function markLeasedFileScanError(db, fileId, expectedEtag, leaseId, code) {
  await db.batch([
    db.prepare(`
      UPDATE physics_files
      SET antivirus_status = 'error', scan_error_code = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND r2_etag = ? AND antivirus_status NOT IN ('clean', 'blocked')
        AND EXISTS (
          SELECT 1 FROM physics_file_scan_jobs
          WHERE file_id = physics_files.id AND state = 'scanning' AND lease_id = ?
        )
    `).bind(code, fileId, expectedEtag, leaseId),
    db.prepare(`
      UPDATE physics_file_scan_jobs
      SET state = 'error', last_error_code = ?, lease_id = NULL, lease_expires_at = NULL,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE file_id = ? AND expected_r2_etag = ? AND state = 'scanning' AND lease_id = ?
    `).bind(code, fileId, expectedEtag, leaseId),
  ]);
}

async function markRetryableScanFailure(db, fileId, expectedEtag, leaseId, code) {
  await db.batch([
    db.prepare(`
      UPDATE physics_files
      SET antivirus_status = 'not-scanned', scan_error_code = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND r2_etag = ? AND antivirus_status NOT IN ('clean', 'blocked')
        AND EXISTS (
          SELECT 1 FROM physics_file_scan_jobs
          WHERE file_id = physics_files.id AND state = 'scanning' AND lease_id = ?
        )
    `).bind(code, fileId, expectedEtag, leaseId),
    db.prepare(`
      UPDATE physics_file_scan_jobs
      SET state = 'pending', last_error_code = ?, lease_id = NULL, lease_expires_at = NULL,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE file_id = ? AND expected_r2_etag = ? AND state = 'scanning' AND lease_id = ?
    `).bind(code, fileId, expectedEtag, leaseId),
  ]);
}

async function resetInconsistentFinalState(db, row, job, code) {
  await db.batch([
    db.prepare(`
      UPDATE physics_files
      SET antivirus_status = 'not-scanned', scanned_r2_etag = NULL, scan_error_code = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND r2_etag = ? AND antivirus_status != 'blocked' AND object_deleted_at IS NULL
    `).bind(code, row.id, row.r2_etag),
    db.prepare(`
      UPDATE physics_file_scan_jobs
      SET state = 'pending', lease_id = NULL, lease_expires_at = NULL, last_error_code = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE file_id = ? AND expected_r2_etag = ? AND state = ?
    `).bind(code, row.id, job.expected_r2_etag, job.state),
  ]);
}

async function releaseDeletedObjectStorage(db, fileId) {
  await db.prepare(`
    UPDATE physics_files
    SET object_deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND object_deleted_at IS NULL
  `).bind(fileId).run();
}

async function removeBlockedObject(env, row) {
  if (row.object_deleted_at) return;
  await env.PHYSICS_FILES.delete(row.object_key);
  await releaseDeletedObjectStorage(env.DB, row.id);
}

async function processScanEvent(event, env) {
  requireScannerBindings(env);
  const parsed = validateR2CreateEvent(event, {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    bucket: env.PHYSICS_SCAN_BUCKET,
  });
  let row = await env.DB.prepare("SELECT * FROM physics_files WHERE id = ? AND owner_id = ?")
    .bind(parsed.fileId, parsed.ownerId).first();
  if (!row) {
    throw new ScanContractError("physics_file_row_pending", "The R2 event arrived before its D1 row.", { retryable: true });
  }
  if (row.object_key !== parsed.objectKey || row.byte_size !== parsed.byteSize || normalizeR2Etag(row.r2_etag) !== parsed.etag) {
    await markFileScanError(env.DB, row.id, "r2_event_metadata_mismatch");
    return;
  }
  await env.DB.prepare(`
    INSERT INTO physics_file_scan_jobs (
      file_id, expected_r2_etag, expected_sha256, expected_byte_size, state, last_event_at
    ) VALUES (?, ?, ?, ?, 'pending', ?)
    ON CONFLICT(file_id) DO UPDATE SET
      last_event_at = excluded.last_event_at,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(row.id, parsed.etag, row.sha256, row.byte_size, parsed.eventTime).run();
  const job = await env.DB.prepare("SELECT * FROM physics_file_scan_jobs WHERE file_id = ?").bind(row.id).first();
  if (job.expected_r2_etag !== parsed.etag || job.expected_sha256 !== row.sha256 || job.expected_byte_size !== row.byte_size) {
    await markFileScanError(env.DB, row.id, "scan_job_metadata_mismatch");
    return;
  }
  if (row.antivirus_status === "blocked") {
    await removeBlockedObject(env, row);
    return;
  }
  if (job.state === "clean") {
    if (
      row.antivirus_status === "clean"
      && normalizeR2Etag(row.scanned_r2_etag) === parsed.etag
      && !row.object_deleted_at
    ) return;
    await resetInconsistentFinalState(env.DB, row, job, "scan_clean_state_inconsistent");
    throw new ScanContractError("scan_clean_state_inconsistent", "Stored clean state is inconsistent and must be rescanned.", { retryable: true });
  }
  if (job.state === "blocked") {
    await resetInconsistentFinalState(env.DB, row, job, "scan_blocked_state_inconsistent");
    throw new ScanContractError("scan_blocked_state_inconsistent", "Stored blocked state is inconsistent and must be rescanned.", { retryable: true });
  }
  const leaseId = crypto.randomUUID();
  const claimed = await env.DB.prepare(`
    UPDATE physics_file_scan_jobs
    SET state = 'scanning', attempts = attempts + 1, lease_id = ?,
        lease_expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE file_id = ? AND expected_r2_etag = ?
      AND (state IN ('pending', 'error') OR (state = 'scanning' AND lease_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
    RETURNING file_id
  `).bind(leaseId, `+${SCAN_LEASE_SECONDS} seconds`, row.id, parsed.etag).first();
  if (!claimed) throw new ScanContractError("scan_job_busy", "A scan lease is already active.", { retryable: true });

  const object = await env.PHYSICS_FILES.get(row.object_key, { onlyIf: { etagMatches: parsed.etag } });
  if (!object || !("body" in object) || !object.body) {
    await markLeasedFileScanError(env.DB, row.id, parsed.etag, leaseId, "quarantine_object_changed");
    return;
  }
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== row.byte_size || await sha256Hex(bytes) !== row.sha256) {
    await markLeasedFileScanError(env.DB, row.id, parsed.etag, leaseId, "quarantine_integrity_mismatch");
    return;
  }
  const scanner = getContainer(env.CLAMAV, "clamav-primary");
  let result;
  try {
    result = await scanner.scan(new Blob([bytes]).stream());
  } catch (error) {
    const code = error instanceof ScanContractError ? error.code : "clamav_unavailable";
    await markRetryableScanFailure(env.DB, row.id, parsed.etag, leaseId, code);
    throw new ScanContractError(code, "ClamAV scan failed and must be retried.", { retryable: true });
  }
  const completedAt = new Date().toISOString();
  if (result.verdict === "clean") {
    const [fileTransition, jobTransition] = await env.DB.batch([
      env.DB.prepare(`
        UPDATE physics_files
        SET antivirus_status = 'clean', scanned_r2_etag = ?, scan_engine_version = ?,
            scan_database_version = ?, scan_database_updated_at = ?, scan_completed_at = ?,
            scan_error_code = NULL, updated_at = ?
        WHERE id = ? AND r2_etag = ? AND object_deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM physics_file_scan_jobs
            WHERE file_id = physics_files.id AND state = 'scanning' AND lease_id = ?
          )
      `).bind(parsed.etag, result.engineVersion, result.databaseVersion, result.databaseUpdatedAt, completedAt, completedAt, row.id, parsed.etag, leaseId),
      env.DB.prepare(`
        UPDATE physics_file_scan_jobs
        SET state = 'clean', lease_id = NULL, lease_expires_at = NULL, last_error_code = NULL, updated_at = ?
        WHERE file_id = ? AND lease_id = ?
      `).bind(completedAt, row.id, leaseId),
    ]);
    requireCommittedScanTransition(fileTransition, jobTransition);
    return;
  }
  const [fileTransition, jobTransition] = await env.DB.batch([
    env.DB.prepare(`
      UPDATE physics_files
      SET antivirus_status = 'blocked', scanned_r2_etag = NULL, scan_engine_version = ?,
          scan_database_version = ?, scan_database_updated_at = ?, scan_completed_at = ?,
          scan_error_code = ?, updated_at = ?
      WHERE id = ? AND r2_etag = ?
        AND EXISTS (
          SELECT 1 FROM physics_file_scan_jobs
          WHERE file_id = physics_files.id AND state = 'scanning' AND lease_id = ?
        )
    `).bind(result.engineVersion, result.databaseVersion, result.databaseUpdatedAt, completedAt, result.threatName, completedAt, row.id, parsed.etag, leaseId),
    env.DB.prepare(`
      UPDATE physics_file_scan_jobs
      SET state = 'blocked', lease_id = NULL, lease_expires_at = NULL, last_error_code = ?, updated_at = ?
      WHERE file_id = ? AND lease_id = ?
    `).bind(result.threatName, completedAt, row.id, leaseId),
  ]);
  requireCommittedScanTransition(fileTransition, jobTransition);
  row = await env.DB.prepare("SELECT * FROM physics_files WHERE id = ?").bind(row.id).first();
  if (row) await removeBlockedObject(env, row);
}

async function processDeadLetter(event, env) {
  let parsed;
  try {
    parsed = validateR2CreateEvent(event, {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      bucket: env.PHYSICS_SCAN_BUCKET,
    });
  } catch {
    return;
  }
  const row = await env.DB.prepare("SELECT id FROM physics_files WHERE id = ? AND owner_id = ?")
    .bind(parsed.fileId, parsed.ownerId).first();
  if (row) await markFileScanError(env.DB, row.id, "scan_retries_exhausted");
}

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        if (batch.queue === DEAD_LETTER_QUEUE) {
          await processDeadLetter(message.body, env);
          message.ack();
          continue;
        }
        if (batch.queue !== PRIMARY_QUEUE) {
          message.ack();
          continue;
        }
        await processScanEvent(message.body, env);
        message.ack();
      } catch (error) {
        if (shouldRetryScanError(error)) {
          message.retry({ delaySeconds: Math.min(60, 5 * message.attempts) });
        } else {
          console.error("physics_scan_event_rejected", { messageId: message.id, code: error?.code ?? "scan_event_failed" });
          message.ack();
        }
      }
    }
  },
};
