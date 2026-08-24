const OFFICIAL_ISSUE_THEMES = [
  {
    id: "korean-peninsula",
    code: "한반도",
    title: "한반도와 남북관계",
    summary: "북한, 북핵, 남북 대화와 한반도 안보 관련 공식 발표를 모아 봅니다.",
    focus: "정책 변화, 대화 재개 조건, 군사적 긴장과 주변국 반응",
    keywords: ["북한", "북핵", "남북", "통일", "한반도", "dprk", "north korea", "korean peninsula", "pyongyang"],
  },
  {
    id: "korean-diplomacy",
    code: "한국 외교",
    title: "한국 외교와 재외국민",
    summary: "한국의 정상·장관 외교, 양자 관계와 재외국민 안전 발표를 한 흐름으로 봅니다.",
    focus: "정상·장관 일정, 양자 협의, 재외국민 안전과 한국에 대한 직접 영향",
    keywords: ["대한민국", "한국", "외교", "재외국민", "장관", "정상회담", "한미", "한일", "한중", "republic of korea", "south korea", "korean"],
  },
  {
    id: "trade-supply-chain",
    code: "경제 안보",
    title: "통상·기술·공급망",
    summary: "관세, 수출통제, 핵심 산업과 공급망 변화가 한국 경제에 닿는 경로를 봅니다.",
    focus: "관세와 제재, 반도체·배터리, 핵심 광물, 수출입과 공급망",
    keywords: ["관세", "무역", "통상", "수출", "수입", "공급망", "제재", "경제", "산업", "반도체", "배터리", "핵심 광물", "tariff", "trade", "export", "import", "supply chain", "sanction", "economic", "industry", "semiconductor", "critical mineral"],
  },
  {
    id: "indo-pacific",
    code: "인도태평양",
    title: "인도태평양과 해양안보",
    summary: "중국·대만·일본·동남아와 주요 해상 교역로의 안보 변화를 모아 봅니다.",
    focus: "중국과 대만, 남중국해, 일본·ASEAN, 동맹과 해상 교역로",
    keywords: ["중국", "대만", "일본", "필리핀", "아세안", "남중국해", "인도태평양", "해양", "china", "taiwan", "japan", "philippines", "asean", "south china sea", "indo-pacific", "maritime"],
  },
  {
    id: "us-policy",
    code: "미국",
    title: "미국 정책과 대외관계",
    summary: "미 행정부의 외교·안보·경제 발표 가운데 한국에 파급될 수 있는 변화를 봅니다.",
    focus: "행정부 결정, 동맹 정책, 대외 경제 조치와 한국에 대한 파급",
    keywords: ["미국", "백악관", "대통령", "행정부", "united states", "u.s.", "america", "white house", "president", "administration", "executive order"],
  },
  {
    id: "middle-east",
    code: "중동",
    title: "중동 분쟁과 해상 물류",
    summary: "중동의 분쟁·휴전·인도주의 상황과 에너지·홍해 물류 파급을 함께 봅니다.",
    focus: "가자와 이스라엘, 이란, 레바논·시리아, 홍해와 에너지 수송",
    keywords: ["중동", "가자", "이스라엘", "이란", "레바논", "시리아", "예멘", "홍해", "팔레스타인", "gaza", "israel", "iran", "lebanon", "syria", "yemen", "red sea", "middle east", "palestin"],
  },
  {
    id: "europe-ukraine",
    code: "유럽",
    title: "우크라이나·러시아와 유럽안보",
    summary: "우크라이나 전쟁, 러시아, NATO와 유럽의 안보·경제 변화를 모아 봅니다.",
    focus: "전황과 협상, 제재, NATO·EU 대응과 에너지 시장",
    keywords: ["우크라이나", "러시아", "유럽", "나토", "ukraine", "russia", "europe", "nato", "european union", " eu "],
  },
  {
    id: "global-security",
    code: "분쟁",
    title: "분쟁·휴전·인도주의",
    summary: "지역 분쟁, 휴전 논의, 민간인 보호와 인도주의 위기를 지역을 넘어 묶어 봅니다.",
    focus: "충돌 확대·완화 신호, 휴전 조건, 구호 접근과 난민·민간인 보호",
    keywords: ["분쟁", "휴전", "평화", "안보", "전쟁", "인도적", "난민", "민간인", "conflict", "ceasefire", "peace", "security", "war", "humanitarian", "refugee", "civilian"],
  },
  {
    id: "multilateral-energy",
    code: "글로벌",
    title: "다자외교·기후·에너지",
    summary: "UN과 주요 다자회의, 기후·에너지 협력이 국제 질서에 미치는 변화를 봅니다.",
    focus: "UN·G7·G20 의제, 기후 대응, 에너지 협력과 국제 규범",
    keywords: ["유엔", "다자", "기후", "에너지", "g7", "g20", "united nations", "general assembly", "multilateral", "climate", "energy", "cop"],
  },
];

const LANE_FALLBACK = {
  "korea-core": "korean-diplomacy",
  "us-impact": "us-policy",
  "rapid-change": "global-security",
};

function searchableSourceText(item) {
  return ` ${[
    item?.title,
    item?.source?.name,
    item?.lane,
  ].filter(Boolean).join(" ").toLocaleLowerCase()} `;
}

function sourceTimestamp(item) {
  const parsed = new Date(item?.publishedAt ?? item?.lastSeenAt ?? item?.collectedAt ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function sourceIdentity(item, index) {
  if (item?.id !== undefined && item?.id !== null) return `id:${item.id}`;
  return `${item?.source?.key ?? "source"}:${item?.providerItemId ?? item?.originalUrl ?? index}`;
}

export function buildOfficialIssueTracks(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const tracks = new Map(OFFICIAL_ISSUE_THEMES.map((theme) => [theme.id, { ...theme, items: [] }]));
  const seen = new Set();

  items.forEach((item, index) => {
    const identity = sourceIdentity(item, index);
    if (seen.has(identity)) return;
    seen.add(identity);

    const haystack = searchableSourceText(item);
    const matchedThemeIds = OFFICIAL_ISSUE_THEMES
      .filter(({ keywords }) => keywords.some((keyword) => haystack.includes(keyword)))
      .map(({ id }) => id);
    const fallbackThemeId = LANE_FALLBACK[item?.lane] ?? "global-security";
    const themeIds = matchedThemeIds.length ? matchedThemeIds : [fallbackThemeId];

    themeIds.slice(0, 2).forEach((themeId) => tracks.get(themeId)?.items.push(item));
  });

  return [...tracks.values()]
    .filter(({ items: trackItems }) => trackItems.length > 0)
    .map((track) => {
      const sortedItems = [...track.items].sort((left, right) => sourceTimestamp(right) - sourceTimestamp(left));
      return {
        ...track,
        items: sortedItems,
        sourceCount: new Set(sortedItems.map((item) => item?.source?.key ?? item?.source?.name).filter(Boolean)).size,
        latestAt: sortedItems[0]?.publishedAt ?? sortedItems[0]?.collectedAt ?? null,
      };
    })
    .sort((left, right) => sourceTimestamp(right.items[0]) - sourceTimestamp(left.items[0]));
}

export { OFFICIAL_ISSUE_THEMES };
