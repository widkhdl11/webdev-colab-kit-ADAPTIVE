import {
  isOneLine,
  parseKeyPoints,
  parseSummaryTable,
  type SummaryTable,
} from "@/entities/article";

/** 요약 응답에서 읽은 것 — 사용량(usage)은 어댑터가 따로 붙인다. */
export interface ParsedEnrich {
  /** 저장용 `summary`. 새 형식에서는 한 줄 요약과 같다(INV-S8). 실패면 빈 문자열. */
  summary: string;
  oneLine: string | null;
  points: string[];
  table: SummaryTable | null;
  titleKo: string | null;
  officialByContent: boolean;
}

/**
 * 요약 응답(JSON 을 푼 객체)을 칸으로 나눠 받는다 (ingestion-ranking INV-S7·S8).
 *
 * `api/ports.ts` 안에 두지 않는 이유: 그 파일은 `server-only` 라 유닛이 불러오지도 못한다.
 * 거기 있던 동안은 파싱 규칙을 어떻게 바꿔도 유닛이 전부 통과했다(0009 때 실제로 겪었다).
 *
 * - 한 줄 요약·핵심 셋 중 하나라도 형식을 못 맞추면 **요약 칸 전부를 비운다** — 반쪽을 저장하면
 *   그 글은 다시 요약되지 않는다(INV-S3 의 재시도 조건이 `summary is null` 이다).
 * - 표는 틀리면 **표만** 버린다(S30).
 * - 번역 제목은 요약과 무관하게 산다 — 근거가 제목이라 요약 실패와 상관이 없다(INV-S6).
 */
export function parseEnrichJson(parsed: Record<string, unknown>): ParsedEnrich {
  const titleKo = typeof parsed.titleKo === "string" ? parsed.titleKo.trim() || null : null;

  const oneLine = typeof parsed.oneLine === "string" ? parsed.oneLine.trim() : "";
  const points = parseKeyPoints(parsed.points);
  if (!isOneLine(oneLine) || points === null) {
    // 공식 여부도 버린다 — 같은 근거로 요약을 못 만든 응답의 판단은 믿을 이유가 약하고,
    // 요약이 비어 있으면 다음 주기에 다시 물어본다(INV-O2).
    return { summary: "", oneLine: null, points: [], table: null, titleKo, officialByContent: false };
  }

  return {
    summary: oneLine,
    oneLine,
    points,
    table: parseSummaryTable(parsed.table),
    titleKo,
    // `true` 하나만 참이다. 문자열 "true"·1 을 받아 주면 모델이 형식을 흘릴 때 공식 표시가
    // 조용히 늘어난다 — 틀린 쪽으로 기울면 안 되는 값이다(INV-O2).
    officialByContent: parsed.official === true,
  };
}
