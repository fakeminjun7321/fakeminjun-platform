export const PHYSICS_TOOLS = [
  {
    id: "concept",
    code: "01",
    title: "개념 탐구",
    summary: "정의만 외우지 않고 개념이 필요한 이유와 적용 한계를 함께 봅니다.",
    input: "개념·현상·교과서 문장",
    output: "직관 → 수학 구조 → 적용 범위",
    example: "왜 각운동량 보존은 중심력 문제에서 강력한가?",
  },
  {
    id: "derivation",
    code: "02",
    title: "수식 유도",
    summary: "출발 가정, 사용한 정리, 생략된 계산을 분리해 유도를 재구성합니다.",
    input: "식·정리·유도 목표",
    output: "가정 → 단계별 전개 → 검산",
    example: "라그랑주 방정식을 데카르트 좌표의 뉴턴 방정식에서 연결하기",
  },
  {
    id: "visual-analysis",
    code: "03",
    title: "그림·그래프 분석",
    summary: "자료 보관소에 추가한 교재 이미지, 그래프, 풀이를 물리적으로 해석합니다.",
    input: "교재 이미지·그래프·필기",
    output: "변수 식별 → 관계 해석 → 오류 점검",
    example: "위상공간 궤적에서 안정점과 에너지 변화를 읽기",
  },
  {
    id: "research",
    code: "04",
    title: "논문 탐색",
    summary: "연구 질문에서 시작해 리뷰, 대표 논문, 선수지식 순으로 자료를 찾습니다.",
    input: "연구 주제·키워드",
    output: "읽기 순서·핵심 주장·필요 배경",
    example: "사회력 모형의 보행자 상호작용 파라미터 연구 찾기",
  },
  {
    id: "network",
    code: "05",
    title: "개념 연결",
    summary: "하나의 개념을 역학·전자기학·파동·현대물리의 다른 구조와 연결합니다.",
    input: "중심 개념",
    output: "선수개념·동치 표현·후속 개념",
    example: "대칭성에서 보존법칙, 생성자, 노터 정리로 이어지는 연결",
  },
  {
    id: "thought-experiment",
    code: "06",
    title: "사고실험·해석 비교",
    summary: "서로 다른 해석이 같은 예측을 내는 지점과 실제 차이를 구분합니다.",
    input: "사고실험·해석 쟁점",
    output: "공통 예측·해석 차이·검증 가능성",
    example: "EPR 사고실험과 벨 부등식이 논쟁을 어떻게 바꿨는가?",
  },
  {
    id: "research-log",
    code: "07",
    title: "연구 기록",
    summary: "가설, 계산, 실패한 접근, 다음 확인 항목을 한 기록으로 남기는 화면입니다.",
    input: "메모·계산·자료 링크",
    output: "연구 로그·미해결 질문·다음 단계",
    example: "실험 데이터와 이론식의 불일치 원인을 추적하는 로그",
  },
];

export const PHYSICS_RESOURCES = [
  {
    id: "mit-801",
    title: "MIT 8.01SC Classical Mechanics",
    provider: "MIT OpenCourseWare",
    type: "강의·문제",
    topic: "역학",
    level: "P3–P4",
    language: "영어",
    saved: true,
    description: "개념 설명, 짧은 강의 영상, 문제 세트를 함께 제공하는 학부 고전역학 과정입니다.",
    href: "https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/",
  },
  {
    id: "mit-802",
    title: "MIT 8.02 Physics II: Electricity and Magnetism",
    provider: "MIT OpenCourseWare",
    type: "강의 영상",
    topic: "전자기학",
    level: "P3–P4",
    language: "영어",
    saved: true,
    description: "정전기학, 자기장, 맥스웰 방정식을 세 모듈로 구성한 공개 과정입니다.",
    href: "https://ocw.mit.edu/courses/8-02-physics-ii-electricity-and-magnetism-spring-2019/",
  },
  {
    id: "mit-803",
    title: "MIT 8.03SC Vibrations and Waves",
    provider: "MIT OpenCourseWare",
    type: "강의·문제",
    topic: "진동·파동",
    level: "P4",
    language: "영어",
    saved: false,
    description: "진동, 푸리에 해석, 파동과 광학을 강의와 문제 세트로 다루는 과정입니다.",
    href: "https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/",
  },
  {
    id: "ipho-problems",
    title: "Past IPhO Problems and Solutions",
    provider: "International Physics Olympiad",
    type: "기출문제",
    topic: "올림피아드",
    level: "P5",
    language: "영어",
    saved: true,
    description: "IPhO 공식 문서 페이지에 정리된 역대 문제와 풀이 자료입니다.",
    href: "https://www.ipho-new.org/documentations/",
  },
  {
    id: "ipho-syllabus",
    title: "IPhO Statutes and Syllabus",
    provider: "International Physics Olympiad",
    type: "공식 문서",
    topic: "올림피아드",
    level: "P4–P5",
    language: "영어",
    saved: false,
    description: "이론·실험 문제의 공식 범위와 대회 원칙을 확인할 수 있습니다.",
    href: "https://www.ipho-new.org/statutes-syllabus/",
  },
  {
    id: "kpho-official",
    title: "한국물리올림피아드 공식 홈페이지",
    provider: "한국물리학회 물리올림피아드",
    type: "공식 문서",
    topic: "KPhO",
    level: "P3–P4",
    language: "한국어",
    saved: true,
    description: "국내 물리올림피아드 일정과 통신교육 공지를 확인하는 공식 출처입니다.",
    href: "https://newkpho.kps.or.kr/main",
  },
];

export const IPHO_TOPICS = [
  { id: "mechanics", label: "역학", detail: "강체·유체·진동 포함" },
  { id: "electromagnetism", label: "전자기학", detail: "회로·전자기 유도 포함" },
  { id: "thermodynamics", label: "열·통계", detail: "열역학 과정과 분자 운동" },
  { id: "waves", label: "파동·광학", detail: "간섭·회절·기하광학" },
  { id: "modern", label: "현대물리", detail: "상대론·양자 기초" },
  { id: "experiment", label: "실험", detail: "측정·불확도·데이터 해석" },
];

export function filterPhysicsResources(resources, { query = "", type = "전체", savedOnly = false } = {}) {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  return resources.filter((resource) => {
    if (savedOnly && !resource.saved) return false;
    if (type !== "전체" && resource.type !== type) return false;
    if (!normalized) return true;
    return [resource.title, resource.provider, resource.type, resource.topic, resource.level, resource.description]
      .join(" ")
      .toLocaleLowerCase("ko-KR")
      .includes(normalized);
  });
}
