export const EVENTS = [
  {
    id: 1,
    time: "09:40",
    dateTime: "2026-08-21T09:40:00+09:00",
    region: "대한민국",
    shortRegion: "KOREA",
    coordinates: [126.98, 37.56],
    category: "korea-core",
    signalRank: 1,
    agreement: 88,
    lastChecked: "2분 전",
    status: "verified",
    relationLabel: "한미 공급망 협의",
    relatedCoordinates: [
      {
        label: "미국",
        coordinates: [-98, 39],
        relation: "공급망 협의 상대",
      },
      {
        label: "필리핀",
        coordinates: [120.98, 14.6],
        relation: "간접 해상 교역로 영향",
      },
    ],
    title: "한미 공급망 실무 협의 종료",
    summary: "핵심 광물과 배터리 공급 안정성을 둘러싼 공동 점검 절차를 협의했습니다.",
    impact: "한국의 산업·외교 의제가 같은 결정선 위에 놓인 사례입니다.",
    sources: 5,
    facts: [
      "09:40 KST, 서울에서 실무 협의 종료",
      "핵심 광물 공급망 점검 절차 논의",
      "다음 기술 협의를 10월로 제안",
    ],
    disputed: [
      "구체적인 공동 비축 규모는 공개되지 않음",
      "참여 기업 범위는 후속 협의 대상",
    ],
    relevance: [
      "배터리·반도체 공급 안정성",
      "대미 산업정책 조율 비용",
      "중국과의 교역 관계에 미칠 간접 영향",
    ],
  },
  {
    id: 2,
    time: "07:15",
    dateTime: "2026-08-21T07:15:00+09:00",
    region: "미국",
    shortRegion: "UNITED STATES",
    coordinates: [-98, 39],
    category: "us-impact",
    signalRank: 2,
    agreement: 72,
    lastChecked: "8분 전",
    status: "mixed",
    relationLabel: "한국 금융시장 영향",
    relatedCoordinates: [
      {
        label: "대한민국",
        coordinates: [126.98, 37.56],
        relation: "환율·수입물가 영향",
      },
    ],
    title: "연준 발언 이후 달러 변동성 확대",
    summary: "금리 경로에 대한 해석이 갈리며 아시아 개장 전 달러 변동폭이 커졌습니다.",
    impact: "원화, 수입물가, 외국인 자금 흐름을 함께 봐야 합니다.",
    sources: 7,
    facts: [
      "연준 인사의 공개 발언 이후 선물 가격 변동",
      "아시아 통화 바스켓의 단기 변동폭 확대",
      "공식 정책 결정은 아직 없음",
    ],
    disputed: [
      "9월 인하 가능성에 대한 시장 해석이 엇갈림",
      "변동이 일시적인지 추세 전환인지 불확실",
    ],
    relevance: [
      "원·달러 환율 변동",
      "에너지·원자재 수입 비용",
      "한국은행의 정책 커뮤니케이션 부담",
    ],
  },
  {
    id: 3,
    time: "05:30",
    dateTime: "2026-08-21T05:30:00+09:00",
    region: "중동",
    shortRegion: "MIDDLE EAST",
    coordinates: [35.22, 31.77],
    category: "rapid-change",
    signalRank: 3,
    agreement: 64,
    lastChecked: "14분 전",
    status: "mixed",
    relationLabel: "에너지·안보 파급",
    relatedCoordinates: [
      {
        label: "대한민국",
        coordinates: [126.98, 37.56],
        relation: "에너지 가격·체류자 안전 영향",
      },
    ],
    title: "휴전 감시단 활동 범위 논의",
    summary: "교전 당사자와 중재국이 감시 방식과 접근 지역을 두고 추가 협의를 진행했습니다.",
    impact: "합의문보다 현장 접근 권한과 위반 판정 절차가 더 중요합니다.",
    sources: 6,
    facts: [
      "중재국 주도로 감시 절차 회의 개최",
      "구호 통로 접근 범위가 핵심 쟁점",
      "최종 합의문은 아직 발표되지 않음",
    ],
    disputed: [
      "감시단의 독립 조사 권한 여부",
      "위반 발생 시 제재 절차의 실효성",
    ],
    relevance: [
      "에너지 가격과 해상 운송 위험",
      "한국인 체류·파견 인력 안전",
      "중동 외교와 인도적 지원 판단",
    ],
  },
  {
    id: 4,
    time: "03:20",
    dateTime: "2026-08-21T03:20:00+09:00",
    region: "유럽",
    shortRegion: "EUROPE",
    coordinates: [14.42, 50.08],
    category: "rapid-change",
    signalRank: 4,
    agreement: 76,
    lastChecked: "19분 전",
    status: "verified",
    relationLabel: "LNG 가격 연계",
    relatedCoordinates: [
      {
        label: "대한민국",
        coordinates: [126.98, 37.56],
        relation: "아시아 LNG 도입 가격 영향",
      },
    ],
    title: "에너지 공동구매 협상 재개",
    summary: "겨울 수요를 앞두고 유럽 국가들이 공동구매 조건과 저장 목표를 다시 조정했습니다.",
    impact: "유럽 가스 수요 변화는 아시아 LNG 가격에도 연결됩니다.",
    sources: 4,
    facts: [
      "공동구매 실무 협상 재개",
      "저장 목표와 비용 분담이 핵심 의제",
      "최종 계약 물량은 미정",
    ],
    disputed: [
      "회원국별 우선순위가 일치하지 않음",
      "가격 안정 효과에 대한 분석 차이",
    ],
    relevance: [
      "한국 LNG 도입 가격",
      "조선·해운 수요 변화",
      "유럽 경기와 한국 수출",
    ],
  },
  {
    id: 5,
    time: "16:10",
    dateTime: "2026-08-21T16:10:00+09:00",
    region: "필리핀",
    shortRegion: "PHILIPPINES",
    coordinates: [120.98, 14.6],
    category: "korea-core",
    signalRank: 5,
    agreement: 81,
    lastChecked: "27분 전",
    status: "verified",
    relationLabel: "한국 교역로 안전",
    relatedCoordinates: [
      {
        label: "대한민국",
        coordinates: [126.98, 37.56],
        relation: "해상 교역로·지역 안보 영향",
      },
    ],
    title: "남중국해 해양 안전 회의",
    summary: "우발 충돌 방지와 통신 채널 운영 기준을 다루는 실무 회의가 열렸습니다.",
    impact: "규범 합의보다 실제 현장 연락 체계가 작동하는지 확인해야 합니다.",
    sources: 5,
    facts: [
      "해양 안전 실무 회의 개최",
      "비상 통신 채널 운영 기준 논의",
      "다음 회의 일정은 미정",
    ],
    disputed: [
      "강제력 있는 합의로 이어질지 불확실",
      "각국의 순찰 활동 해석이 다름",
    ],
    relevance: [
      "한국 교역로의 안전",
      "한미동맹과 지역 다자 협력",
      "해운 보험료와 운항 계획",
    ],
  },
  {
    id: 6,
    time: "20:00",
    dateTime: "2026-08-21T20:00:00+09:00",
    region: "동아프리카",
    shortRegion: "EAST AFRICA",
    coordinates: [39.67, -4.05],
    category: "rapid-change",
    signalRank: 6,
    agreement: 58,
    lastChecked: "35분 전",
    status: "unverified",
    relationLabel: "홍해 물류 파급",
    relatedCoordinates: [
      {
        label: "대한민국",
        coordinates: [126.98, 37.56],
        relation: "수출입 운송 시간·비용 영향",
      },
    ],
    title: "홍해 항로 우회 장기화 신호",
    summary: "주요 선사들이 다음 분기에도 우회 운항을 유지하는 방안을 검토하고 있습니다.",
    impact: "운송 시간과 비용이 한국 수출입 기업의 재고 전략에 영향을 줍니다.",
    sources: 6,
    facts: [
      "복수 선사가 우회 운항 연장 검토",
      "보험·연료 비용이 계속 높은 상태",
      "정상 항로 복귀 시점은 미정",
    ],
    disputed: [
      "분기 내 위험 완화 가능성에 대한 전망 차이",
      "운임 상승분의 소비자 전가 범위 불확실",
    ],
    relevance: [
      "수출입 운송 기간",
      "해운·조선 업종 수익성",
      "기업 재고와 물류비",
    ],
  },
];

export function filterEvents(events, query) {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalized) return events;

  return events.filter((event) =>
    [event.title, event.region, event.shortRegion, event.summary]
      .join(" ")
      .toLocaleLowerCase("ko-KR")
      .includes(normalized),
  );
}
