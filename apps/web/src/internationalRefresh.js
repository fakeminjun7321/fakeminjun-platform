export const INTERNATIONAL_VIEW_REFRESH_MS = 60_000;
export const SOURCE_INGESTION_CADENCE_MINUTES = 10;

const COLLECTION_STATUS_PRIORITY = ["degraded", "not-collected", "stale"];

function latestTimestamp(values, fallback = null) {
  let latest = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }
  return latest ?? fallback;
}

function sourceItemTimestamp(item) {
  const parsed = new Date(item?.publishedAt ?? item?.lastSeenAt ?? item?.collectedAt ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function sourceItemIdentity(item, index) {
  if (item?.id !== undefined && item?.id !== null) return `id:${item.id}`;
  const sourceKey = item?.source?.key ?? "unknown-source";
  return `${sourceKey}:${item?.providerItemId ?? item?.originalUrl ?? index}`;
}

export function aggregateSourceGroups(groups, checkedAt = new Date().toISOString()) {
  const statuses = groups.map(({ meta }) => meta?.collectionStatus ?? "unknown");
  const collectionStatus = COLLECTION_STATUS_PRIORITY.find((status) => statuses.includes(status))
    ?? (statuses.length > 0 && statuses.every((status) => status === "current") ? "current" : "unknown");
  const streams = groups.flatMap(({ meta }) => Array.isArray(meta?.streams) ? meta.streams : []);

  const uniqueItems = new Map();
  groups.flatMap(({ data }) => Array.isArray(data) ? data : []).forEach((item, index) => {
    const identity = sourceItemIdentity(item, index);
    const current = uniqueItems.get(identity);
    if (!current || sourceItemTimestamp(item) > sourceItemTimestamp(current)) uniqueItems.set(identity, item);
  });
  const items = [...uniqueItems.values()].sort((left, right) => (
    sourceItemTimestamp(right) - sourceItemTimestamp(left)
  ));

  return {
    items,
    collectionStatus,
    checkedAt: latestTimestamp(groups.map(({ meta }) => meta?.generatedAt), checkedAt),
    lastCollectedAt: latestTimestamp(streams.map(({ lastSuccessAt }) => lastSuccessAt)),
    streams,
  };
}

export function startVisibleRefresh({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  intervalMs = INTERNATIONAL_VIEW_REFRESH_MS,
  onRefresh,
}) {
  if (!documentObject || !windowObject || typeof onRefresh !== "function") {
    throw new TypeError("A browser document, window, and refresh callback are required");
  }
  const refreshIfVisible = () => {
    if (documentObject.visibilityState !== "hidden") onRefresh();
  };
  const handleVisibilityChange = () => {
    if (documentObject.visibilityState === "visible") refreshIfVisible();
  };
  const intervalId = windowObject.setInterval(refreshIfVisible, intervalMs);
  documentObject.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    windowObject.clearInterval(intervalId);
    documentObject.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
