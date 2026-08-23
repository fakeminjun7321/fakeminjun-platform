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
