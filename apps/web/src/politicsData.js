export const POLITICAL_AGENDAS = [
  {
    id: "kr-semiconductor-bill",
    scope: "korea",
    scopeLabel: "대한민국",
    kind: "입법",
    title: "반도체 산업 지원 법안 심사",
    stage: "상임위 심사",
    summary: "국회에서 산업 지원의 범위와 재정 부담을 조정하는 과정을 읽기 위한 샘플 의제입니다.",
    institutions: ["소관 상임위원회", "기획재정부", "산업통상자원부"],
    process: ["법률안 발의", "상임위 심사", "법사위 체계·자구 심사", "본회의 의결", "정부 이송·공포"],
    readingPoints: [
      "지원 대상을 어떤 기준으로 정하는가",
      "세액공제와 직접지원의 재정 효과가 어떻게 다른가",
      "정부안과 의원안의 차이가 무엇인가",
    ],
  },
  {
    id: "kr-budget-review",
    scope: "korea",
    scopeLabel: "대한민국",
    kind: "예산",
    title: "정부 예산안의 국회 심사",
    stage: "예결위 종합심사",
    summary: "정부가 편성한 예산이 상임위와 예결위를 거쳐 확정되는 구조를 보는 샘플 의제입니다.",
    institutions: ["기획재정부", "국회 상임위원회", "예산결산특별위원회"],
    process: ["정부안 제출", "상임위 예비심사", "예결위 종합심사", "본회의 의결", "회계연도 집행"],
    readingPoints: [
      "정부 원안 대비 증액·감액 항목은 무엇인가",
      "법정 처리기한과 실제 협상 일정이 어떻게 다른가",
      "정책 목표와 세부 사업 예산이 일치하는가",
    ],
  },
  {
    id: "kr-election-rules",
    scope: "korea",
    scopeLabel: "대한민국",
    kind: "선거제도",
    title: "국회의원 선거제도 개편 논의",
    stage: "특위 논의",
    summary: "지역구와 비례대표 의석을 어떤 방식으로 배분할지 이해하기 위한 샘플 의제입니다.",
    institutions: ["정치개혁특별위원회", "중앙선거관리위원회", "원내 정당"],
    process: ["개편안 제안", "특위 논의", "정당 간 협상", "법률 개정", "선거구 획정"],
    readingPoints: [
      "대표성과 지역 대표성 중 무엇을 우선하는가",
      "득표율과 의석률의 차이가 어떻게 달라지는가",
      "선거구 획정 시점과 기준은 무엇인가",
    ],
  },
  {
    id: "us-industrial-policy",
    scope: "us",
    scopeLabel: "미국",
    kind: "대외경제",
    title: "미국 산업정책과 한국 기업",
    stage: "행정부 세부지침",
    summary: "미국의 보조금·수출통제 정책이 한국 산업에 전달되는 경로를 읽기 위한 샘플 의제입니다.",
    institutions: ["미 의회", "상무부", "재무부"],
    process: ["법률 제정", "행정부 세부지침", "기업 신청·심사", "의회 감독", "정책 조정"],
    readingPoints: [
      "법률과 행정부 지침의 구속력이 어떻게 다른가",
      "한국 기업에 적용되는 조건은 무엇인가",
      "한국 정부가 협상할 수 있는 지점은 어디인가",
    ],
  },
];

export const POLITICAL_INSTITUTIONS = [
  {
    id: "assembly",
    name: "국회",
    english: "NATIONAL ASSEMBLY",
    role: "법률을 만들고 예산을 확정하며 행정부를 감시합니다.",
    powers: ["법률안 심의·의결", "예산안·결산 심사", "국정감사·조사", "인사청문과 탄핵소추"],
    checks: ["대통령의 법률안 재의요구", "헌법재판소의 위헌 심사", "선거를 통한 유권자 평가"],
    commonMistake: "국회가 정책을 직접 집행하는 기관은 아닙니다. 집행은 행정부가 담당합니다.",
  },
  {
    id: "executive",
    name: "행정부",
    english: "EXECUTIVE BRANCH",
    role: "법률과 예산에 근거해 정책을 설계하고 실제로 집행합니다.",
    powers: ["법률 집행", "정부 예산안 편성", "대통령령·총리령·부령 제정", "외교·국방·행정 수행"],
    checks: ["국회의 입법·예산 통제", "법원의 행정처분 심사", "감사원과 독립기관의 감독"],
    commonMistake: "행정입법은 법률의 위임 범위를 넘어설 수 없습니다.",
  },
  {
    id: "judiciary",
    name: "법원",
    english: "JUDICIARY",
    role: "구체적인 사건에서 법을 해석하고 분쟁을 해결합니다.",
    powers: ["민사·형사·행정 재판", "명령·규칙의 위헌·위법 심사", "선거소송 재판", "사법행정"],
    checks: ["헌법과 법률에 따른 재판", "심급제", "법관 독립과 공개재판 원칙"],
    commonMistake: "법원과 헌법재판소는 별개의 헌법기관이며 담당 사건이 다릅니다.",
  },
  {
    id: "constitutional-court",
    name: "헌법재판소",
    english: "CONSTITUTIONAL COURT",
    role: "국가 작용이 헌법에 맞는지 판단하는 헌법재판을 담당합니다.",
    powers: ["위헌법률심판", "헌법소원", "탄핵심판", "정당해산심판", "권한쟁의심판"],
    checks: ["재판관 9인의 합의", "사건별 가중 정족수", "헌법과 법률에 따른 독립 심판"],
    commonMistake: "일반 재판의 최종심을 담당하는 대법원과 역할이 다릅니다.",
  },
];

export function filterPoliticalAgendas(agendas, scope = "all", query = "") {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  return agendas.filter((agenda) => {
    if (scope !== "all" && agenda.scope !== scope) return false;
    if (!normalized) return true;
    return [agenda.title, agenda.kind, agenda.stage, agenda.scopeLabel, agenda.summary, ...agenda.institutions]
      .join(" ")
      .toLocaleLowerCase("ko-KR")
      .includes(normalized);
  });
}
