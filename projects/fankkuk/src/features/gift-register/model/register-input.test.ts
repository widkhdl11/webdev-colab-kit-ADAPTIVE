import { describe, expect, it } from "vitest";
import { MAX_BOX_COUNT, parseRegisterInput } from "./register-input";

const ok = { creatorId: "c1", itemKind: "인형", smallCount: "2", mediumCount: "1", electronicsOrMetal: "no" };

describe("parseRegisterInput — 선물 등록 입력 경계", () => {
  it("정상 입력은 상자 구간 목록·참거짓으로 바뀐다 (소형 먼저)", () => {
    expect(parseRegisterInput(ok)).toEqual({
      success: true,
      data: { creatorId: "c1", itemKind: "인형", boxes: ["small", "small", "medium"], hasElectronicsOrMetal: false },
    });
  });

  it("전자기기·금속 신고는 꼭 답해야 한다 — 비워 두면 '없음'으로 치지 않는다", () => {
    const r = parseRegisterInput({ ...ok, electronicsOrMetal: "" });
    expect(r.success).toBe(false);
    expect(r.success ? null : r.errors.electronicsOrMetal).toBeTruthy();
  });

  it("'있어요'는 true", () => {
    const r = parseRegisterInput({ ...ok, electronicsOrMetal: "yes" });
    expect(r.success && r.data.hasElectronicsOrMetal).toBe(true);
  });

  it("상자가 하나도 없으면 거부한다", () => {
    const r = parseRegisterInput({ ...ok, smallCount: "0", mediumCount: "0" });
    expect(r.success).toBe(false);
    expect(r.success ? null : r.errors.smallCount).toBeTruthy();
  });

  it(`두 구간을 합쳐 ${MAX_BOX_COUNT}개까지`, () => {
    expect(parseRegisterInput({ ...ok, smallCount: String(MAX_BOX_COUNT), mediumCount: "0" }).success).toBe(true);
    expect(parseRegisterInput({ ...ok, smallCount: String(MAX_BOX_COUNT), mediumCount: "1" }).success).toBe(false);
  });

  it("상자 수는 0 이상 정수", () => {
    for (const bad of ["-1", "1.5", "", "abc"]) {
      expect(parseRegisterInput({ ...ok, smallCount: bad }).success).toBe(false);
      expect(parseRegisterInput({ ...ok, mediumCount: bad }).success).toBe(false);
    }
  });

  it("물품 종류는 앞뒤 공백을 지우고 비어 있으면 거부, 30자까지", () => {
    expect(parseRegisterInput({ ...ok, itemKind: "   " }).success).toBe(false);
    expect(parseRegisterInput({ ...ok, itemKind: "가".repeat(31) }).success).toBe(false);
    const r = parseRegisterInput({ ...ok, itemKind: "  편지와 인형 " });
    expect(r.success && r.data.itemKind).toBe("편지와 인형");
  });

  it("크리에이터를 고르지 않으면 거부", () => {
    expect(parseRegisterInput({ ...ok, creatorId: "" }).success).toBe(false);
  });

  it("모르는 칸(금액·대형 상자 수 등)은 결과에 들어오지 않는다 — 결제 금액은 서버 요금표로만 계산한다", () => {
    const r = parseRegisterInput({ ...ok, totalKrw: "100", largeCount: "3" });
    expect(r.success && Object.keys(r.data).sort()).toEqual(["boxes", "creatorId", "hasElectronicsOrMetal", "itemKind"]);
    expect(r.success && r.data.boxes).toHaveLength(3);
  });
});
