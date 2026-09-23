import { fenceData } from "./data-fence";
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
    // 한 문장 요약은 요약 문단과 **따로 받는다** — 저장할 때 첫 문단으로 붙인다(tableToMarkup 과 같은 방식).
    needSummary ? '"lead": "무슨 일인지 한 문장"' : null,
    needSummary ? '"summary": "요약문"' : null,
    needSummary ? '"points": ["핵심 항목", "..."]' : null,
    // 표는 요약 문자열이 아니라 **따로 받는다** (INV-D7). 요약 안에 파이프 표를 쓰라고 했을 때
    // 실측 3건 중 한 번도 안 나왔다 — 자세한 이유는 entities 의 tableToMarkup 주석.
    needSummary ? '"table": {"head": ["대상", "기준"], "rows": [["...", "..."]]} 또는 null' : null,
    // `"tags"` 를 여기서 뺐다 (2026-08-30) — 고정 5개 목록에서 고르게 하던 자리다.
    // 뱃지 키워드가 그 자리를 물려받았고, 그쪽은 별도 단계로 돈다(run-keywords).
    // 공식 여부는 글 내용을 보고 정한다 (INV-O2) — 근거가 실리는 경우에만 묻는다.
    // 제목만 있는 항목에 물으면 모델이 지어낸다(INV-S1 과 같은 이유).
    needSummary ? '"official": true|false' : null,
  ].filter((line): line is string => line !== null);

  const rules = [ROLE, EVIDENCE_ONLY, DATA_BOUNDARY];
  if (needTitle) rules.push(TITLE_RULE);
  if (needSummary) rules.push(...summaryRules(), OFFICIAL_RULE);
  rules.push(`출력은 JSON 하나: {${wanted.join(", ")}}. 다른 말은 쓰지 않는다.`);

  // 제목도 근거도 남의 글이라 **둘 다** 자료로 감싼다. 제목만 보내는 항목에서 감싸지 않으면
  // 제목에 심은 지시가 그대로 통한다(번역 결과가 곧 카드에 보이는 글자다).
  // `fenceData` 가 안쪽의 `</자료` 를 무해화한다 — 감싸기만 하면 자료가 자기 경계를 닫는다.
  const user = needSummary
    ? `${fenceData("제목", title)}\n\n${fenceData("본문", evidence)}`
    : fenceData("제목", title);

  return { system: rules.map((r) => `- ${r}`).join("\n"), user };
}
