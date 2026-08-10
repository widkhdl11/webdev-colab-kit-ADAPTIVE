import { ARTICLE_TAGS, type ArticleTag } from "../model/types";

/**
 * 태그 부여 — ingestion-ranking INV-T3.
 *
 * 규칙과 AI 를 **둘 다** 쓴다. 규칙만 쓰면 표현이 다른 글을 놓치고, AI 만 쓰면
 * 요약이 실패한 항목에 태그가 하나도 안 붙는다(요약과 분류를 한 번에 부르기 때문).
 *
 * 태그 목록 자체는 임시다(2026-08-09 사용자). 바뀌어도 이 파일의 규칙은 그대로다 —
 * "정해진 목록 안에서만"이 규칙이고 목록의 내용물은 규칙이 아니다.
 */

/**
 * 태그별 키워드. 소문자로 비교한다.
 *
 * 제목이 대부분 영어라 영어 키워드가 먼저다(2026-08-09 실측: 수집 70건 중 한국어 제목 0건).
 */
const KEYWORDS: Record<ArticleTag, string[]> = {
  모델: ["model", "llm", "gpt", "claude", "gemini", "llama", "sonnet", "opus", "haiku", "모델"],
  에이전트: ["agent", "agentic", "autonomous", "에이전트"],
  MCP: ["mcp", "model context protocol"],
  엔지니어링: [
    "engineering", "architecture", "infrastructure", "deploy", "database",
    "performance", "scaling", "엔지니어링", "아키텍처", "성능",
  ],
  툴: ["tool", "tooling", "cli", "sdk", "ide", "editor", "plugin", "extension", "툴", "도구"],
};

/** 낱말 경계로 찾는다. 안 그러면 'toolbar' 가 '툴' 이 되고 'MCPU' 가 'MCP' 가 된다. */
function hasWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 영어 키워드는 복수형까지 잡는다 — 제목에 'agents'·'tools' 로 나오는 게 더 흔하다.
  // 'toolbar' 는 여전히 안 잡힌다: 뒤가 글자면 낱말 경계에서 걸린다.
  const plural = /^[a-z ]+$/i.test(word) ? "s?" : "";
  // 한글은 낱말 경계(\b)가 안 먹으므로 글자·숫자가 아닌 것으로 둘러싸였는지 직접 본다.
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}${plural}(?![\\p{L}\\p{N}])`,
    "iu",
  ).test(haystack);
}

/** 제목(과 있으면 본문)에서 태그를 고른다. 짚이는 게 없으면 빈 배열. */
export function tagsFromText(title: string, body = ""): ArticleTag[] {
  if (typeof title !== "string") return [];
  const text = `${title} ${typeof body === "string" ? body : ""}`;

  return ARTICLE_TAGS.filter((tag) =>
    KEYWORDS[tag].some((word) => hasWord(text, word)),
  );
}

/**
 * 태그명 정규화 — DB unique(normalized_name) 가 유일성을 판정하는 값이다 (INV-T2).
 *
 * 도메인 규칙이라 여기 둔다. 어댑터에 인라인으로 있으면 `.toLowerCase()` 한 조각을 지워도
 * 아무 테스트가 안 깨지고, 'MCP' 와 'mcp' 가 각각 생겨 필터가 쪼개진다.
 */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 규칙이 고른 것과 AI 가 고른 것을 합친다 (INV-T3).
 *
 * 목록 밖은 버린다 — AI 가 '블록체인' 을 고르면 그 태그가 새로 생겨 필터가 늘어난다.
 * 결과 순서는 태그 목록 순서로 고정한다: 같은 입력에 항상 같은 출력이어야
 * 저장·비교가 흔들리지 않는다.
 */
export function mergeTags(
  fromRules: readonly string[] | null | undefined,
  fromAi: readonly string[] | null | undefined,
): ArticleTag[] {
  const picked = new Set<string>();
  for (const list of [fromRules, fromAi]) {
    if (!Array.isArray(list)) continue;
    for (const t of list) if (typeof t === "string") picked.add(t);
  }
  return ARTICLE_TAGS.filter((tag) => picked.has(tag));
}
