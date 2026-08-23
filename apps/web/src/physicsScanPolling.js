export const PHYSICS_SCAN_POLL_INTERVAL_MS = 3_000;

export function startPhysicsScanPolling(refresh, {
  intervalMs = PHYSICS_SCAN_POLL_INTERVAL_MS,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  const intervalId = setIntervalFn(() => void refresh(), intervalMs);
  return () => clearIntervalFn(intervalId);
}

