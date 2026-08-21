export const CATEGORY_META = Object.freeze({
  "korea-core": Object.freeze({ label: "한국 핵심", color: "#4386d1" }),
  "us-impact": Object.freeze({ label: "미국 영향", color: "#4c9870" }),
  "rapid-change": Object.freeze({ label: "기타 급변", color: "#c58a35" }),
});

export const STATUS_META = Object.freeze({
  verified: Object.freeze({ label: "확인됨", color: "#4c9870" }),
  mixed: Object.freeze({ label: "일부 확인", color: "#c58a35" }),
  unverified: Object.freeze({ label: "미확인", color: "#8fa5b2" }),
});

export function getCategoryMeta(category) {
  return CATEGORY_META[category] ?? null;
}

export function getStatusMeta(status) {
  return STATUS_META[status] ?? null;
}

export function getTopSignals(events, limit = 3) {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 3;

  return [...events]
    .sort((left, right) => left.signalRank - right.signalRank || left.id - right.id)
    .slice(0, normalizedLimit);
}

export function getEventRelations(event) {
  if (!event || !Array.isArray(event.relatedCoordinates)) return [];

  return event.relatedCoordinates.map((related) => ({
    eventId: event.id,
    eventTitle: event.title,
    label: event.relationLabel,
    relation: related.relation,
    from: {
      label: event.region,
      coordinates: [...event.coordinates],
    },
    to: {
      label: related.label,
      coordinates: [...related.coordinates],
    },
  }));
}

export function eventsToFeatureCollection(events) {
  return {
    type: "FeatureCollection",
    features: events.map((event) => ({
      type: "Feature",
      id: event.id,
      geometry: {
        type: "Point",
        coordinates: [...event.coordinates],
      },
      properties: {
        id: event.id,
        shortId: String(event.id).padStart(2, "0"),
        category: event.category,
        region: event.region,
        title: event.title,
        status: event.status,
      },
    })),
  };
}

export function relationsToFeatureCollection(relations) {
  return {
    type: "FeatureCollection",
    features: relations.map((relation, index) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: (() => {
          const from = [...relation.from.coordinates];
          const to = [...relation.to.coordinates];
          const longitudeDelta = to[0] - from[0];
          if (longitudeDelta > 180) to[0] -= 360;
          else if (longitudeDelta < -180) to[0] += 360;
          return [from, to];
        })(),
      },
      properties: {
        eventId: relation.eventId,
        index,
        label: relation.label,
        relation: relation.relation,
        fromLabel: relation.from.label,
        toLabel: relation.to.label,
      },
    })),
  };
}
