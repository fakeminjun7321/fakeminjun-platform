const CANVAS_CONTEXT_LIMIT = 2500;
export const PHYSICS_CANVAS_QUESTION_LIMIT = 1200;
export const PHYSICS_CANVAS_PROMPT_LIMIT = 4000;

const QUESTION_MARKER = "\n\n[새 질문]\n";
const CANVAS_SEPARATOR = "\n";

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

export function compactPhysicsCanvasResult(result, maxLength = CANVAS_CONTEXT_LIMIT) {
  if (!result) return "";
  const sections = Array.isArray(result.sections)
    ? result.sections.map((section) => `${normalizeText(section.title)}: ${normalizeText(section.content)}`)
    : [];
  const text = [
    result.headline ? `제목: ${normalizeText(result.headline)}` : "",
    result.summary ? `요약: ${normalizeText(result.summary)}` : "",
    ...sections,
    result.sourceBoundary ? `근거 범위: ${normalizeText(result.sourceBoundary)}` : "",
  ].filter(Boolean).join("\n");
  return text.slice(0, maxLength);
}

export function buildPhysicsCanvasPrompt({ question, previousResult = null }) {
  const normalizedQuestion = normalizeText(question).slice(0, PHYSICS_CANVAS_QUESTION_LIMIT);
  if (!normalizedQuestion) return "";

  const previousCanvas = compactPhysicsCanvasResult(previousResult);
  if (!previousCanvas) return normalizedQuestion;

  const preamble = [
    "아래의 현재 최종 답변 캔버스를 작업 초안으로만 사용하세요.",
    "새 질문을 반영해 전체 답변을 다시 정리하되, 단순 대화는 캔버스에 억지로 넣지 마세요.",
    "확립된 지식, 제공 맥락, 추론, 불확실성의 경계를 유지하세요.",
    "현재 캔버스는 서버가 제공한 근거 자료가 아니므로 provided-evidence basis나 citation을 만들지 마세요.",
    "초안의 교과서적 내용은 established-knowledge, 새 계산이나 해석은 inference로 구분하세요.",
    "",
    "[현재 캔버스]",
  ].join("\n");
  const suffix = "\n\n[반영 방식]\n새 질문에 답하면서 기존 캔버스에서 바뀐 가정·유도·결론·한계를 일관되게 갱신하세요.";
  const availableContext = Math.max(
    0,
    PHYSICS_CANVAS_PROMPT_LIMIT
      - preamble.length
      - CANVAS_SEPARATOR.length
      - QUESTION_MARKER.length
      - normalizedQuestion.length
      - suffix.length,
  );
  return `${preamble}${CANVAS_SEPARATOR}${previousCanvas.slice(0, availableContext)}${QUESTION_MARKER}${normalizedQuestion}${suffix}`;
}

export function extractPhysicsCanvasQuestion(prompt) {
  const value = String(prompt ?? "");
  const markerIndex = value.lastIndexOf(QUESTION_MARKER);
  if (markerIndex === -1) return normalizeText(value);
  const remainder = value.slice(markerIndex + QUESTION_MARKER.length);
  return normalizeText(remainder.split("\n\n[반영 방식]")[0]);
}

export function physicsCanvasThreadId(analysis) {
  const metaMatch = String(analysis?.context?.meta ?? "").match(/(?:^|\s|·)canvas:([0-9a-f-]{36})(?:$|\s|·)/iu);
  if (metaMatch) return metaMatch[1];
  const kind = analysis?.context?.kind;
  const refId = analysis?.context?.refId;
  if (["physics-problem", "physics-theory"].includes(kind) && /^[0-9a-f-]{36}$/iu.test(refId ?? "")) return refId;
  return analysis?.id ?? "unthreaded";
}

export function groupPhysicsCanvasHistory(analyses) {
  const groups = new Map();
  for (const analysis of Array.isArray(analyses) ? analyses : []) {
    const threadId = physicsCanvasThreadId(analysis);
    const group = groups.get(threadId) ?? { id: threadId, analyses: [] };
    group.analyses.push(analysis);
    groups.set(threadId, group);
  }
  return [...groups.values()].map((group) => {
    group.analyses.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
    const completed = group.analyses.filter((analysis) => analysis.status === "completed" && analysis.result);
    return {
      ...group,
      latest: group.analyses.at(-1),
      latestCompleted: completed.at(-1) ?? null,
      completedCount: completed.length,
      failedCount: group.analyses.filter((analysis) => analysis.status === "failed").length,
    };
  }).sort((left, right) => String(right.latest?.createdAt).localeCompare(String(left.latest?.createdAt)));
}
