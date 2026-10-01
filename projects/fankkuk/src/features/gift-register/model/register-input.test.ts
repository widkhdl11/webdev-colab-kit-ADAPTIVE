import { describe, expect, it } from "vitest";
import { MAX_BOX_COUNT, parseRegisterInput } from "./register-input";

const ok = { creatorId: "c1", itemKind: "인형", boxCount: "2", electronicsOrMetal: "no" };

describe("parseRegisterInput — 선물 등록 입력 경계", () => {
  it("정상 입력은 숫자·참거짓으로 바뀐다", () => {
    expect(parseRegisterInput(ok)).toEqual({
      success: true,
      data: { creatorId: "c1", itemKind: "인형", boxCount: 2, hasElectronicsOrMetal: false },
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

  it(`상자 수는 1~${MAX_BOX_COUNT} 사이 정수`, () => {
    for (const bad of ["0", "-1", "1.5", "", "abc", String(MAX_BOX_COUNT + 1)]) {
      expect(parseRegisterInput({ ...ok, boxCount: bad }).success).toBe(false);
    }
    expect(parseRegisterInput({ ...ok, boxCount: String(MAX_BOX_COUNT) }).success).toBe(true);
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

  it("모르는 칸(금액 등)은 결과에 들어오지 않는다 — 결제 금액은 서버 설정으로만 계산한다", () => {
    const r = parseRegisterInput({ ...ok, totalKrw: "100" });
    expect(r.success && Object.keys(r.data).sort()).toEqual(["boxCount", "creatorId", "hasElectronicsOrMetal", "itemKind"]);
  });
});
