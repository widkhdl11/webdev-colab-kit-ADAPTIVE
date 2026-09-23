import { describe, expect, it } from "vitest";
import {
  isCompleteSentence,
  isOneLine,
  KEY_POINT_COUNT,
  ONE_LINE_MAX_CHARS,
  parseKeyPoints,
  parseSummaryTable,
  signalPoints,
} from "./summary-format";

describe("한 줄 요약 (ingestion-ranking INV-S8)", () => {
  it("INV-S8: 한 문장·80자 이내면 한 줄 요약이다", () => {
    expect(isOneLine("OpenAI가 GPT-6의 프롬프트 캐싱을 고쳐 반복 호출 비용을 크게 낮췄다.")).toBe(true);
  });

  it("INV-S8 (S28, 실패경로): 81자면 아니다 — 경계는 80자 포함", () => {
    expect(isOneLine(`${"가".repeat(ONE_LINE_MAX_CHARS - 1)}.`)).toBe(true);
    expect(isOneLine(`${"가".repeat(ONE_LINE_MAX_CHARS)}.`)).toBe(false);
  });

  it("INV-S8 (S28, 실패경로): 두 문장이면 아니다", () => {
    expect(isOneLine("모델이 나왔다. 가격도 내렸다.")).toBe(false);
  });

  it("INV-S8 실패경로: 문장 부호로 안 끝나는 명사 조각은 아니다", () => {
    expect(isOneLine("GPT-6 캐싱 개선 및 할인 적용")).toBe(false);
    expect(isOneLine("  ")).toBe(false);
  });

  it("숫자 안의 마침표(버전·가격)는 문장 끝으로 세지 않는다", () => {
    expect(isOneLine("앤스로픽이 Opus 5.5를 $4.00에 내놓았다.")).toBe(true);
  });
});

describe("핵심 셋 (ingestion-ranking INV-S7)", () => {
  const three = [
    "같은 앞부분을 30분 안에 다시 보내면 캐시 할인이 붙는다.",
    "캐시 적중률을 보는 대시보드가 새로 생겼다.",
    "지시문을 바꿔도 캐시가 유지된다.",
  ];

  it("INV-S7: 완결 문장 셋이면 그대로 받는다(앞뒤 공백은 정리)", () => {
    expect(parseKeyPoints(three.map((s) => ` ${s} `))).toEqual(three);
  });

  it("INV-S7 (S29, 실패경로): 둘이거나 넷이면 받지 않는다", () => {
    expect(KEY_POINT_COUNT).toBe(3);
    expect(parseKeyPoints(three.slice(0, 2))).toBeNull();
    expect(parseKeyPoints([...three, "하나 더 있다."])).toBeNull();
  });

  it("INV-S7 (S29, 실패경로): 명사 조각이 하나라도 섞이면 받지 않는다", () => {
    expect(parseKeyPoints([three[0], three[1], "캐시 유지하며 추론 강도 조정, 프리워밍 기능 지원"])).toBeNull();
  });

  it("INV-S7 실패경로: 배열이 아니거나 문자열이 아닌 원소가 있으면 받지 않는다", () => {
    expect(parseKeyPoints("하나.")).toBeNull();
    expect(parseKeyPoints([three[0], three[1], 3])).toBeNull();
  });

  it("완결 문장 판정 — 문장 부호로 끝나야 한다", () => {
    expect(isCompleteSentence("가격이 내렸다.")).toBe(true);
    expect(isCompleteSentence("가격 인하")).toBe(false);
  });
});

describe("요약 표 칸 (content-safety INV-D7 · ingestion-ranking S30)", () => {
  it("INV-D7 (S14): 머리행·행이 맞으면 표로 받는다", () => {
    expect(
      parseSummaryTable({ head: ["모델", "가격"], rows: [["솔", "$2"], ["루나", "$0.1"]] }),
    ).toEqual({ head: ["모델", "가격"], rows: [["솔", "$2"], ["루나", "$0.1"]] });
  });

  it("INV-D7: 칸 안의 줄바꿈·연속 공백은 한 칸으로 접는다", () => {
    expect(parseSummaryTable({ head: ["a", "b"], rows: [["x\n  y", "z"]] })?.rows[0][0]).toBe("x y");
  });

  it.each([
    ["열 4개", { head: ["a", "b", "c", "d"], rows: [["1", "2", "3", "4"]] }],
    ["열 1개", { head: ["a"], rows: [["1"]] }],
    ["행 9개", { head: ["a", "b"], rows: Array.from({ length: 9 }, () => ["1", "2"]) }],
    ["행 0개", { head: ["a", "b"], rows: [] }],
    ["행마다 열 수가 다름", { head: ["a", "b"], rows: [["1"]] }],
    ["문자열이 아닌 칸", { head: ["a", "b"], rows: [[1, 2]] }],
    ["빈 칸", { head: ["a", ""], rows: [["1", "2"]] }],
    ["모양이 아님", "표"],
    ["null", null],
  ])("INV-D7 (S16, 실패경로): %s 이면 표가 없다", (_label, value) => {
    expect(parseSummaryTable(value)).toBeNull();
  });

  it("본문 행 8개는 경계 안이다", () => {
    const rows = Array.from({ length: 8 }, () => ["1", "2"]);
    expect(parseSummaryTable({ head: ["a", "b"], rows })).not.toBeNull();
  });
});

describe("signal 포인트 — 참인 질문과 근거 (hot-issue INV-G2)", () => {
  it("INV-G2: 참인 질문만, 정해진 순서로, 근거와 함께 돌려준다", () => {
    expect(
      signalPoints({ 기회: true, 방향: false, 변화: true }, { 변화: "비용이 준다.", 기회: "패치 전이 위험하다." }),
    ).toEqual([
      { key: "변화", reason: "비용이 준다." },
      { key: "기회", reason: "패치 전이 위험하다." },
    ]);
  });

  it("INV-G2 (S31d, 실패경로): 근거가 없어도 참인 질문은 남는다", () => {
    expect(signalPoints({ 변화: true }, null)).toEqual([{ key: "변화", reason: null }]);
    expect(signalPoints({ 변화: true }, { 변화: "  " })).toEqual([{ key: "변화", reason: null }]);
  });

  it("INV-G2 실패경로: 판정이 없으면 빈 목록 — 절을 그리지 않는다", () => {
    expect(signalPoints(null, null)).toEqual([]);
    expect(signalPoints({ 변화: false, 방향: false, 기회: false }, null)).toEqual([]);
  });

  it("INV-G2 실패경로: 모르는 질문 키는 버린다 — 화면에 라벨 없는 줄이 서면 안 된다", () => {
    expect(signalPoints({ 새질문: true }, { 새질문: "근거." })).toEqual([]);
  });

  it("실패경로: 모양이 틀린 값은 판정이 없는 것으로 본다", () => {
    expect(signalPoints("참", "근거")).toEqual([]);
    expect(signalPoints({ 변화: "true" }, null)).toEqual([]);
  });
});
