import { ARTICLE_TAGS } from "@/entities/article";
import {
  DATA_BOUNDARY,
  EVIDENCE_ONLY,
  OFFICIAL_RULE,
  ROLE,
  TITLE_RULE,
  summaryRules,
} from "../model/prompt-text";

export interface EnrichPromptInput {
  title: string;
  /** 이미 상한까지 자른 근거. 자르는 일은 이 함수의 책임이 아니다. */
  evidence: string;
  needSummary: boolean;
  needTitle: boolean;
}

export interface EnrichPrompt {
  system: string;
  user: string;
}

/**
 * 항목마다 필요한 작업의 지시만 싣는다 (INV-P1).
 *
 * 근거 없이 제목 번역만 하는 항목에 요약 규칙까지 실으면 프롬프트가 269 → 1,845 토큰(7배)이
 * 된다(실측, content-selection.md). `needSummary`/`needTitle` 이 false 면 그 규칙 문장 자체를
 * 배열에 넣지 않는다 — 나중에 "안 쓰니 무시해도 된다"는 식으로 걸러내지 않는다.
 */
export function buildEnrichPrompt(input: EnrichPromptInput): EnrichPrompt {
  const { title, evidence, needSummary, needTitle } = input;

  const wanted = [
    needTitle ? '"titleKo": "한국어로 옮긴 제목"' : null,
    needSummary ? '"summary": "요약문"' : null,
    needSummary ? '"points": ["핵심 항목", "..."]' : null,
    needSummary ? '"tags": ["..."]' : null,
    // 공식 여부는 글 내용을 보고 정한다 (INV-O2) — 근거가 실리는 경우에만 묻는다.
    // 제목만 있는 항목에 물으면 모델이 지어낸다(INV-S1 과 같은 이유).
    needSummary ? '"official": true|false' : null,
  ].filter((line): line is string => line !== null);

  const rules = [ROLE, EVIDENCE_ONLY, DATA_BOUNDARY];
  if (needTitle) rules.push(TITLE_RULE);
  if (needSummary) rules.push(...summaryRules(ARTICLE_TAGS), OFFICIAL_RULE);
  rules.push(`출력은 JSON 하나: {${wanted.join(", ")}}. 다른 말은 쓰지 않는다.`);

  // 제목도 근거도 남의 글이라 **둘 다** 자료로 감싼다. 제목만 보내는 항목에서 감싸지 않으면
  // 제목에 심은 지시가 그대로 통한다(번역 결과가 곧 카드에 보이는 글자다).
  const user = needSummary
    ? `<자료 종류="제목">\n${title}\n</자료>\n\n<자료 종류="본문">\n${evidence}\n</자료>`
    : `<자료 종류="제목">\n${title}\n</자료>`;

  return { system: rules.map((r) => `- ${r}`).join("\n"), user };
}
