import { describe, expect, it } from "vitest";
import { MAX_BOX_COUNT, parseRegisterInput } from "./register-input";

const ok = { creatorId: "00000000-0000-4000-b000-000000000001", itemKind: "인형", smallCount: "2", mediumCount: "1", largeCount: "0", electronicsOrMetal: "no" };

describe("parseRegisterInput — 선물 등록 입력 경계", () => {
  it("정상 입력은 상자 구간 목록·참거짓으로 바뀐다 (소형 먼저)", () => {
    expect(parseRegisterInput(ok)).toEqual({
      success: true,
      data: { creatorId: "00000000-0000-4000-b000-000000000001", itemKind: "인형", boxes: ["small", "small", "medium"], hasElectronicsOrMetal: false, anniversaryName: null },
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

  it(`세 구간을 합쳐 ${MAX_BOX_COUNT}개까지`, () => {
    expect(parseRegisterInput({ ...ok, smallCount: String(MAX_BOX_COUNT), mediumCount: "0" }).success).toBe(true);
    expect(parseRegisterInput({ ...ok, smallCount: String(MAX_BOX_COUNT), mediumCount: "1" }).success).toBe(false);
    expect(parseRegisterInput({ ...ok, smallCount: String(MAX_BOX_COUNT - 1), mediumCount: "0", largeCount: "2" }).success).toBe(false);
  });

  it("대형 상자 수는 구간 목록 끝에 붙는다 (소형·중형·대형 순)", () => {
    const r = parseRegisterInput({ ...ok, largeCount: "2" });
    expect(r.success && r.data.boxes).toEqual(["small", "small", "medium", "large", "large"]);
  });

  it("상자 수는 0 이상 정수", () => {
    for (const bad of ["-1", "1.5", "", "abc"]) {
      expect(parseRegisterInput({ ...ok, smallCount: bad }).success).toBe(false);
      expect(parseRegisterInput({ ...ok, mediumCount: bad }).success).toBe(false);
      expect(parseRegisterInput({ ...ok, largeCount: bad }).success).toBe(false);
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

  it("모르는 칸(금액·대형 초과 상자 수 등)은 결과에 들어오지 않는다 — 결제 금액은 서버 요금표로만 계산한다", () => {
    const r = parseRegisterInput({ ...ok, totalKrw: "100", oversizeCount: "3" });
    expect(r.success && Object.keys(r.data).sort()).toEqual(["anniversaryName", "boxes", "creatorId", "hasElectronicsOrMetal", "itemKind"]);
    expect(r.success && r.data.boxes).toHaveLength(3);
  });
});

describe("크리에이터 칸", () => {
  it("크리에이터 id 꼴(uuid)이 아니면 받지 않는다 — DB 형식 오류가 서버 오류로 번지지 않게", () => {
    const base = { itemKind: "편지", smallCount: "1", mediumCount: "0", largeCount: "0", electronicsOrMetal: "no" };
    expect(parseRegisterInput({ ...base, creatorId: "x" }).success).toBe(false);
    expect(parseRegisterInput({ ...base, creatorId: "00000000-0000-4000-b000-000000000001" }).success).toBe(true);
  });
});

describe("기념일 표시 이름 (creator-receiving INV-B9·B7)", () => {
  const base = { ...ok, creatorId: "00000000-0000-4000-b000-000000000001" };

  it("INV-B9: 이름 길이는 글자 수로 센다 — 이모지 12개(UTF-16 24단위)는 받는다", () => {
    const r = parseRegisterInput({ ...base, anniversaryName: "🎂".repeat(12) });
    expect(r.success && r.data.anniversaryName).toBe("🎂".repeat(12));
  });

  it("INV-B9 (실패경로): 이모지 13개·빈 이름은 받지 않는다", () => {
    expect(parseRegisterInput({ ...base, anniversaryName: "🎂".repeat(13) }).success).toBe(false);
    expect(parseRegisterInput({ ...base, anniversaryName: "  " }).success).toBe(false);
  });
});
