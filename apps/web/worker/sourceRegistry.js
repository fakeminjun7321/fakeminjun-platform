const providers = [
  {
    sourceKey: "mofa-press",
    streamKey: "mofa-press-rss",
    sourceName: "대한민국 외교부",
    sourceRole: "official-primary",
    lane: "korea-core",
    feedUrl: "https://www.mofa.go.kr/www/brd/rss.do?brdId=235",
    homepageUrl: "https://www.mofa.go.kr/www/wpge/m_20347/contents.do",
    articleHosts: ["www.mofa.go.kr"],
    cadenceMinutes: 30,
    cookieChallenge: "same-url-once",
    selectionReason: "한국 외교정책과 재외국민 안전 관련 공식 발표를 우선 수집",
    rightsNote: "공식 RSS의 제목, 링크, 발행 시각만 저장하며 본문과 이미지는 복제하지 않음",
  },
  {
    sourceKey: "unikorea-press",
    streamKey: "unikorea-press-rss",
    sourceName: "대한민국 통일부",
    sourceRole: "official-primary",
    lane: "korea-core",
    feedUrl: "https://unikorea.go.kr/web/unikorea/rss/bbs_0000000000000004",
    homepageUrl: "https://www.unikorea.go.kr/web/unikorea/contents/Information_rss",
    articleHosts: ["unikorea.go.kr", "www.unikorea.go.kr"],
    cadenceMinutes: 30,
    selectionReason: "남북관계와 한반도 정책 관련 공식 발표를 우선 수집",
    rightsNote: "공식 RSS의 제목, 링크, 발행 시각만 저장하며 본문과 이미지는 복제하지 않음",
  },
  {
    sourceKey: "whitehouse-briefings",
    streamKey: "whitehouse-briefings-rss",
    sourceName: "The White House",
    sourceRole: "official-secondary",
    lane: "us-impact",
    feedUrl: "https://www.whitehouse.gov/briefings-statements/feed/",
    homepageUrl: "https://www.whitehouse.gov/briefings-statements/",
    articleHosts: ["www.whitehouse.gov", "whitehouse.gov"],
    cadenceMinutes: 15,
    selectionReason: "한국 관련성 판단 전 미국 행정부 공식 발표를 수집",
    rightsNote: "공식 RSS의 제목, 링크, 발행 시각만 저장하며 본문과 이미지는 복제하지 않음",
  },
  {
    sourceKey: "un-peace-security",
    streamKey: "un-peace-security-rss",
    sourceName: "UN News · Peace and Security",
    sourceRole: "official-secondary",
    lane: "rapid-change",
    feedUrl: "https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml",
    homepageUrl: "https://news.un.org/en/news/topic/peace-and-security",
    articleHosts: ["news.un.org"],
    cadenceMinutes: 30,
    selectionReason: "급변 여부 판단 전 UN 평화·안보 자료를 관측",
    rightsNote: "공식 RSS의 제목, 링크, 발행 시각만 저장하며 본문과 이미지는 복제하지 않음",
  },
];

function freezeProvider(provider) {
  return Object.freeze({ ...provider, articleHosts: Object.freeze([...provider.articleHosts]) });
}

export const SOURCE_PROVIDERS = Object.freeze(providers.map(freezeProvider));

export function sourceProviderByKey(sourceKey) {
  return SOURCE_PROVIDERS.find((provider) => provider.sourceKey === sourceKey) ?? null;
}
