export const PHYSICS_AI_ENGINES = Object.freeze({
  ps: Object.freeze({
    id: "ps",
    navLabel: "P.S.",
    title: "P.S. 문제풀이",
    engineName: "PLSO",
    taskType: "physics-problem-solving",
    contextKind: "physics-problem",
    description: "문제 해석부터 유도, 최종 답, 독립 검산까지 한 흐름으로 풉니다.",
    placeholder: "문제의 조건, 그림 설명, 구해야 하는 값을 그대로 입력하세요.",
    example: "질량 m인 물체가 마찰계수 μ인 경사면을 미끄러진다. 가속도를 구하고 극한을 검산해줘.",
    steps: ["문제 해석", "모델·가정", "수식 전개", "최종 답", "독립 검산"],
    profiles: Object.freeze({
      standard: Object.freeze({ mode: "standard", title: "PLSO", task: "빠른 풀이", trait: "핵심 경로·답 확인" }),
      auto: Object.freeze({ mode: "auto", title: "PLSO", task: "표준 풀이", trait: "유도·SVG·검산" }),
      deep: Object.freeze({ mode: "deep", title: "PLSO", task: "정밀 검산", trait: "독립 풀이·오류 추적" }),
    }),
  }),
  te: Object.freeze({
    id: "te",
    navLabel: "T.E.",
    title: "T.E. 이론설명",
    engineName: "THEx",
    taskType: "physics-theory-explanation",
    contextKind: "physics-theory",
    description: "직관과 정확한 정의를 연결하고 수학 구조, 유도, 적용 한계를 설명합니다.",
    placeholder: "설명받고 싶은 이론, 개념 또는 수식을 입력하세요.",
    example: "노터 정리가 대칭성과 보존법칙을 연결하는 수학적 구조를 작용에서부터 설명해줘.",
    steps: ["핵심 직관", "엄밀한 정의", "수학 구조", "유도 연결", "한계·반례"],
    profiles: Object.freeze({
      standard: Object.freeze({ mode: "standard", title: "THEx", task: "핵심 설명", trait: "직관·정의" }),
      auto: Object.freeze({ mode: "auto", title: "THEx", task: "구조 설명", trait: "수학·연결·SVG" }),
      deep: Object.freeze({ mode: "deep", title: "THEx", task: "심층 이론", trait: "유도·반례·경계" }),
    }),
  }),
});

export function physicsEngineForTask(taskType) {
  return Object.values(PHYSICS_AI_ENGINES).find((engine) => engine.taskType === taskType) ?? null;
}

export function physicsEngineProfile(taskType, mode = "auto") {
  const engine = physicsEngineForTask(taskType);
  return engine?.profiles?.[mode] ?? null;
}
