import { describe, expect, it } from "vitest";
import { enrichStopAccepted, parseEnrichJson } from "./parse-enrich";

const GOOD = {
  oneLine: "OpenAI가 GPT-6의 프롬프트 캐싱을 고쳐 반복 호출 비용을 크게 낮췄다.",
  points: [
    "같은 앞부분을 30분 안에 다시 보내면 캐시 할인이 붙는다.",
    "캐시 적중률을 보는 대시보드가 새로 생겼다.",
    "지시문을 바꿔도 캐시가 유지된다.",
  ],
  table: { head: ["모델", "가격"], rows: [["솔", "$2"]] },
  official: true,
};

describe("요약 응답을 칸으로 나눠 받는다 (ingestion-ranking INV-S8)", () => {
  it("INV-S8 (S27): 세 칸이 따로 나오고 summary 는 한 줄 요약과 같다", () => {
    const out = parseEnrichJson(GOOD);
    expect(out.oneLine).toBe(GOOD.oneLine);
    expect(out.summary).toBe(GOOD.oneLine);
    expect(out.points).toEqual(GOOD.points);
    expect(out.table).toEqual(GOOD.table);
    expect(out.officialByContent).toBe(true);
  });

  it("INV-S8 (S28, 실패경로): 한 줄 요약이 두 문장이면 요약 칸이 전부 빈다", () => {
    const out = parseEnrichJson({ ...GOOD, oneLine: "모델이 나왔다. 가격도 내렸다." });
    expect(out).toMatchObject({ summary: "", oneLine: null, points: [], table: null });
  });

  it("INV-S7 (S29, 실패경로): 핵심이 명사 조각이면 요약 칸이 전부 빈다", () => {
    const out = parseEnrichJson({ ...GOOD, points: [GOOD.points[0], GOOD.points[1], "프리워밍 기능 지원"] });
    expect(out).toMatchObject({ summary: "", oneLine: null, points: [], table: null });
  });

  it("INV-S8 (S30, 실패경로): 표만 틀리면 표만 버리고 나머지는 산다", () => {
    const out = parseEnrichJson({ ...GOOD, table: { head: ["a", "b", "c", "d"], rows: [["1", "2", "3", "4"]] } });
    expect(out.table).toBeNull();
    expect(out.oneLine).toBe(GOOD.oneLine);
    expect(out.points).toHaveLength(3);
  });

  it("INV-O2 실패경로: 요약이 실패한 응답의 공식 판단은 쓰지 않는다", () => {
    expect(parseEnrichJson({ ...GOOD, oneLine: "" }).officialByContent).toBe(false);
  });

  it("공식 여부는 true 하나만 참이다 — 문자열 \"true\" 는 아니다 (INV-O2)", () => {
    expect(parseEnrichJson({ ...GOOD, official: "true" }).officialByContent).toBe(false);
  });

  it("번역 제목은 요약과 따로 산다 — 요약이 실패해도 제목은 남는다", () => {
    const out = parseEnrichJson({ titleKo: "  한국어 제목 ", oneLine: "" });
    expect(out.titleKo).toBe("한국어 제목");
    expect(out.summary).toBe("");
  });
});

/**
 * 요약 응답을 읽어도 되는가 — 멈춘 이유로 가른다 (2026-09-24 보안 리뷰).
 *
 * 전에는 `max_tokens` 만 걸렀다. 거부(`refusal`)된 응답도 파싱까지 가서, 부분 텍스트가
 * 우연히 완결된 객체면 그대로 저장될 수 있었다. **통과시킬 값만 적는다** — 새 멈춤 이유가
 * 생겨도 기본이 거절이다.
 */
describe("enrichStopAccepted — 끝까지 쓴 응답만 읽는다", () => {
  it("end_turn 은 읽는다", () => {
    expect(enrichStopAccepted("end_turn")).toBe(true);
  });

  it.each(["refusal", "max_tokens", "pause_turn", "tool_use", "stop_sequence", null, "처음 보는 값"])(
    "실패경로: %s 는 읽지 않는다",
    (reason) => {
      expect(enrichStopAccepted(reason)).toBe(false);
    },
  );
});
