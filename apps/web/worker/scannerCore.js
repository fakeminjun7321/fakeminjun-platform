export const PHYSICS_SCAN_BUCKET = "fakeminjun-physics-vault";
export const MAX_SCANNED_PHYSICS_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CLAMAV_DATABASE_AGE_MS = 48 * 60 * 60 * 1000;

const QUARANTINE_KEY = /^quarantine\/owners\/(\d+)\/physics\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(pdf|png|jpg)$/i;

export class ScanContractError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.name = "ScanContractError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function shouldRetryScanError(error) {
  return !(error instanceof ScanContractError) || error.retryable;
}

export function requireCommittedScanTransition(fileTransition, jobTransition) {
  if (fileTransition?.meta?.changes === 1 && jobTransition?.meta?.changes === 1) return;
  throw new ScanContractError(
    "scan_lease_lost",
    "The scan verdict could not commit under its scan lease.",
    { retryable: true },
  );
}

export function requireStableClamAvVersion(before, after) {
  if (
    before?.engineVersion === after?.engineVersion
    && before?.databaseVersion === after?.databaseVersion
    && before?.databaseUpdatedAt === after?.databaseUpdatedAt
  ) return;
  throw new ScanContractError(
    "clamav_database_changed_during_scan",
    "ClamAV signatures changed while the file was being scanned.",
    { retryable: true },
  );
}

export function normalizeR2Etag(value) {
  return String(value ?? "").trim().replace(/^"|"$/g, "");
}

export function validateR2CreateEvent(value, { accountId, bucket = PHYSICS_SCAN_BUCKET } = {}) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ScanContractError("invalid_r2_event", "R2 event must be an object.");
  }
  if (!accountId || value.account !== accountId) {
    throw new ScanContractError("unexpected_r2_account", "R2 event account does not match the scanner account.");
  }
  if (value.bucket !== bucket) {
    throw new ScanContractError("unexpected_r2_bucket", "R2 event bucket does not match the quarantine bucket.");
  }
  if (value.action !== "PutObject") {
    throw new ScanContractError("unexpected_r2_action", "Only direct PutObject events are accepted.");
  }
  const key = typeof value.object?.key === "string" ? value.object.key : "";
  const keyMatch = key.match(QUARANTINE_KEY);
  if (!keyMatch) {
    throw new ScanContractError("invalid_quarantine_key", "R2 object key is outside the quarantine namespace.");
  }
  const byteSize = Number(value.object?.size);
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_SCANNED_PHYSICS_FILE_BYTES) {
    throw new ScanContractError("invalid_quarantine_size", "R2 object size is outside the scan limit.");
  }
  const etag = normalizeR2Etag(value.object?.eTag);
  if (!/^[A-Za-z0-9+/=_-]{8,256}$/.test(etag)) {
    throw new ScanContractError("invalid_quarantine_etag", "R2 event eTag is missing or malformed.");
  }
  const eventTime = new Date(value.eventTime);
  if (Number.isNaN(eventTime.getTime())) {
    throw new ScanContractError("invalid_r2_event_time", "R2 event time is malformed.");
  }
  return {
    ownerId: Number(keyMatch[1]),
    fileId: keyMatch[2].toLowerCase(),
    extension: keyMatch[3].toLowerCase(),
    objectKey: key,
    byteSize,
    etag,
    eventTime: eventTime.toISOString(),
  };
}

export function parseClamAvVersion(value, { now = new Date() } = {}) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/ClamAV\s+([^/\s]+)\/(\d+)\/(.+)$/i);
  if (!match) throw new ScanContractError("clamav_version_invalid", "ClamAV version output is malformed.", { retryable: true });
  const databaseUpdatedAt = new Date(`${match[3]} UTC`);
  if (Number.isNaN(databaseUpdatedAt.getTime())) {
    throw new ScanContractError("clamav_database_date_invalid", "ClamAV database date is malformed.", { retryable: true });
  }
  const ageMs = now.getTime() - databaseUpdatedAt.getTime();
  if (ageMs < -5 * 60 * 1000 || ageMs > MAX_CLAMAV_DATABASE_AGE_MS) {
    throw new ScanContractError("clamav_database_stale", "ClamAV signature database is not fresh enough to produce a clean verdict.", { retryable: true });
  }
  return {
    engineVersion: match[1],
    databaseVersion: match[2],
    databaseUpdatedAt: databaseUpdatedAt.toISOString(),
  };
}

export function interpretClamAvResult({ exitCode, stdout, stderr, versionOutput, timedOut = false, now = new Date() }) {
  if (timedOut) throw new ScanContractError("clamav_timeout", "ClamAV scan timed out.", { retryable: true });
  const version = parseClamAvVersion(versionOutput, { now });
  const output = `${String(stdout ?? "")}\n${String(stderr ?? "")}`.trim();
  if (exitCode === 0) return { verdict: "clean", threatName: null, ...version };
  if (exitCode === 1 && /\bFOUND\b/.test(output)) {
    const threatName = output.match(/:\s*([^:\r\n]+?)\s+FOUND\b/i)?.[1]?.trim().slice(0, 160) || "detected-malware";
    return { verdict: "blocked", threatName, ...version };
  }
  throw new ScanContractError("clamav_engine_error", "ClamAV did not return a valid clean or blocked verdict.", { retryable: true });
}
