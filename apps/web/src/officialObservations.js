const REGION_RULES = Object.freeze([
  Object.freeze({
    id: "south-china-sea",
    label: "남중국해",
    coordinates: Object.freeze([115.2, 13.1]),
    keywords: Object.freeze(["남중국해", "south china sea"]),
  }),
  Object.freeze({
    id: "korean-peninsula",
    label: "한반도",
    coordinates: Object.freeze([127.7, 38.1]),
    keywords: Object.freeze(["북한", "남북", "한반도", "평양", "dprk", "north korea", "korean peninsula", "pyongyang"]),
  }),
  Object.freeze({
    id: "south-korea",
    label: "대한민국",
    coordinates: Object.freeze([127.8, 36.4]),
    keywords: Object.freeze(["대한민국", "한국", "서울", "south korea", "republic of korea", "seoul"]),
  }),
  Object.freeze({
    id: "taiwan",
    label: "대만",
    coordinates: Object.freeze([121, 23.7]),
    keywords: Object.freeze(["대만", "타이완", "taiwan", "taipei"]),
  }),
  Object.freeze({
    id: "china",
    label: "중국",
    coordinates: Object.freeze([104.2, 35.8]),
    keywords: Object.freeze(["중국", "베이징", "china", "chinese", "beijing"]),
  }),
  Object.freeze({
    id: "japan",
    label: "일본",
    coordinates: Object.freeze([138.2, 36.2]),
    keywords: Object.freeze(["일본", "도쿄", "japan", "japanese", "tokyo"]),
  }),
  Object.freeze({
    id: "southeast-asia",
    label: "동남아시아",
    coordinates: Object.freeze([106.5, 12.7]),
    keywords: Object.freeze(["동남아", "아세안", "필리핀", "베트남", "미얀마", "asean", "philippines", "vietnam", "myanmar", "southeast asia"]),
  }),
  Object.freeze({
    id: "united-states",
    label: "미국",
    coordinates: Object.freeze([-98.4, 39.5]),
    keywords: Object.freeze(["미국", "워싱턴", "united states", "u.s.", "washington"]),
  }),
  Object.freeze({
    id: "ukraine",
    label: "우크라이나",
    coordinates: Object.freeze([31.2, 48.4]),
    keywords: Object.freeze(["우크라이나", "키이우", "ukraine", "ukrainian", "kyiv"]),
  }),
  Object.freeze({
    id: "russia",
    label: "러시아",
    coordinates: Object.freeze([61, 56]),
    keywords: Object.freeze(["러시아", "모스크바", "russia", "russian", "moscow"]),
  }),
  Object.freeze({
    id: "europe",
    label: "유럽",
    coordinates: Object.freeze([15.3, 50.2]),
    keywords: Object.freeze(["유럽", "유럽연합", "나토", "europe", "european union", "nato"]),
  }),
  Object.freeze({
    id: "middle-east",
    label: "중동",
    coordinates: Object.freeze([43.4, 29.4]),
    keywords: Object.freeze([
      "중동", "가자", "이스라엘", "이란", "이라크", "레바논", "시리아", "예멘", "팔레스타인", "홍해",
      "middle east", "gaza", "israel", "iran", "iraq", "lebanon", "syria", "yemen", "palestin", "red sea",
    ]),
  }),
  Object.freeze({
    id: "africa",
    label: "아프리카",
    coordinates: Object.freeze([20.2, 4.8]),
    keywords: Object.freeze([
      "아프리카", "수단", "소말리아", "콩고", "에티오피아", "리비아", "사헬",
      "africa", "sudan", "somalia", "congo", "ethiopia", "libya", "sahel",
    ]),
  }),
  Object.freeze({
    id: "south-asia",
    label: "남아시아",
    coordinates: Object.freeze([78.8, 22.5]),
    keywords: Object.freeze(["인도", "파키스탄", "방글라데시", "india", "pakistan", "bangladesh", "south asia"]),
  }),
  Object.freeze({
    id: "latin-america",
    label: "중남미",
    coordinates: Object.freeze([-66, -14]),
    keywords: Object.freeze([
      "중남미", "멕시코", "브라질", "베네수엘라", "아이티", "latin america", "mexico", "brazil", "venezuela", "haiti",
    ]),
  }),
]);

function sourceTimestamp(item) {
  const value = item?.publishedAt ?? item?.lastSeenAt ?? item?.collectedAt ?? 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function sourceIdentity(item, index) {
  if (item?.id !== undefined && item?.id !== null) return `id:${item.id}`;
  return `${item?.source?.key ?? "source"}:${item?.providerItemId ?? item?.originalUrl ?? index}`;
}

function titleMatches(title, keywords) {
  const normalized = ` ${String(title ?? "").toLocaleLowerCase()} `;
  return keywords.some((keyword) => normalized.includes(keyword));
}

export function buildOfficialObservations(items, { maxRegions = 15, maxItemsPerRegion = 3 } = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const uniqueItems = new Map();
  items.forEach((item, index) => {
    const identity = sourceIdentity(item, index);
    const current = uniqueItems.get(identity);
    if (!current || sourceTimestamp(item) > sourceTimestamp(current)) uniqueItems.set(identity, item);
  });

  const regions = new Map(REGION_RULES.map((region) => [region.id, { ...region, items: [] }]));
  for (const item of uniqueItems.values()) {
    if (!String(item?.title ?? "").trim()) continue;
    const matches = REGION_RULES.filter(({ keywords }) => titleMatches(item.title, keywords));
    matches.slice(0, 3).forEach(({ id }) => regions.get(id).items.push(item));
  }

  const normalizedMaxRegions = Number.isFinite(maxRegions) ? Math.max(0, Math.trunc(maxRegions)) : 15;
  const normalizedItemLimit = Number.isFinite(maxItemsPerRegion) ? Math.max(0, Math.trunc(maxItemsPerRegion)) : 3;

  return [...regions.values()]
    .filter(({ items: regionItems }) => regionItems.length > 0)
    .map((region) => {
      const sortedItems = [...region.items].sort((left, right) => sourceTimestamp(right) - sourceTimestamp(left));
      const sources = new Set(sortedItems.map((item) => item?.source?.key ?? item?.source?.name).filter(Boolean));
      return {
        id: region.id,
        label: region.label,
        coordinates: [...region.coordinates],
        count: sortedItems.length,
        sourceCount: sources.size,
        latestAt: sortedItems[0]?.publishedAt ?? sortedItems[0]?.lastSeenAt ?? sortedItems[0]?.collectedAt ?? null,
        items: sortedItems.slice(0, normalizedItemLimit),
        basis: "official-title-region-aggregate",
        verificationStatus: "unverified",
      };
    })
    .sort((left, right) => sourceTimestamp(right.items[0]) - sourceTimestamp(left.items[0]) || right.count - left.count)
    .slice(0, normalizedMaxRegions);
}

export function observationsToFeatureCollection(observations) {
  return {
    type: "FeatureCollection",
    features: observations.map((observation) => ({
      type: "Feature",
      id: observation.id,
      geometry: {
        type: "Point",
        coordinates: [...observation.coordinates],
      },
      properties: {
        id: observation.id,
        label: observation.label,
        count: observation.count,
        sourceCount: observation.sourceCount,
        latestAt: observation.latestAt,
        basis: observation.basis,
        verificationStatus: observation.verificationStatus,
      },
    })),
  };
}

export { REGION_RULES };
