import { describe, expect, it } from "vitest";
import { MAX_BOX_COUNT, parseRegisterInput } from "./register-input";

const ok = { creatorId: "00000000-0000-4000-b000-000000000001", itemCategory: "doll", smallCount: "2", mediumCount: "1", largeCount: "0", electronicsOrMetal: "no" };

describe("parseRegisterInput — 선물 등록 입력 경계", () => {
  it("정상 입력은 상자 구간 목록·참거짓으로 바뀐다 (소형 먼저)", () => {
    expect(parseRegisterInput(ok)).toEqual({
      success: true,
      data: { creatorId: "00000000-0000-4000-b000-000000000001", itemCategory: "doll", itemOther: null, boxes: ["small", "small", "medium"], hasElectronicsOrMetal: false, anniversaryName: null },
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

  it("INV-H1: 기타 글은 앞뒤 공백을 지우고 비어 있으면 거부, 30자(글자 수)까지", () => {
    const other = { ...ok, itemCategory: "other" };
    const empty = parseRegisterInput({ ...other, itemOther: "   " });
    expect(empty.success ? null : empty.errors.itemOther).toBe("어떤 선물인지 적어 주세요.");
    expect(parseRegisterInput(other).success).toBe(false);
    const long = parseRegisterInput({ ...other, itemOther: "가".repeat(31) });
    expect(long.success ? null : long.errors.itemOther).toBe("30자 안으로 적어 주세요.");
    expect(parseRegisterInput({ ...other, itemOther: "🎁".repeat(30) }).success).toBe(true);
    const r = parseRegisterInput({ ...other, itemOther: "  편지와 인형 " });
    expect(r.success && [r.data.itemCategory, r.data.itemOther]).toEqual(["other", "편지와 인형"]);
  });

  it("INV-H1: 기타가 아닌 종류면 기타 글을 실어 보내도 버린다(DB 가 종류 이름을 물품 이름으로 적는다)", () => {
    const r = parseRegisterInput({ ...ok, itemCategory: "flower", itemOther: "장미 100송이" });
    expect(r.success && [r.data.itemCategory, r.data.itemOther]).toEqual(["flower", null]);
  });

  it("INV-H1 (실패경로): 목록 밖 종류(냉장·food·빈 값)·옛 자유 입력 칸(itemKind)만 보내면 거부", () => {
    for (const bad of ["food", "냉장", "", "DOLL"]) {
      const r = parseRegisterInput({ ...ok, itemCategory: bad });
      expect([bad, r.success ? null : r.errors.itemCategory]).toEqual([bad, "선물 종류를 골라 주세요."]);
    }
    const { itemCategory: _drop, ...noCategory } = ok;
    void _drop;
    expect(parseRegisterInput({ ...noCategory, itemKind: "인형" }).success).toBe(false);
  });

  it("INV-H2: 전자기기를 고르면 신고 「없어요」를 보내도 신고가 켜진다", () => {
    const r = parseRegisterInput({ ...ok, itemCategory: "electronics", electronicsOrMetal: "no" });
    expect(r.success && r.data.hasElectronicsOrMetal).toBe(true);
    const doll = parseRegisterInput({ ...ok, itemCategory: "doll", electronicsOrMetal: "no" });
    expect(doll.success && doll.data.hasElectronicsOrMetal).toBe(false);
  });

  it("크리에이터를 고르지 않으면 거부", () => {
    expect(parseRegisterInput({ ...ok, creatorId: "" }).success).toBe(false);
  });

  it("모르는 칸(금액·대형 초과 상자 수 등)은 결과에 들어오지 않는다 — 결제 금액은 서버 요금표로만 계산한다", () => {
    const r = parseRegisterInput({ ...ok, totalKrw: "100", oversizeCount: "3" });
    expect(r.success && Object.keys(r.data).sort()).toEqual(["anniversaryName", "boxes", "creatorId", "hasElectronicsOrMetal", "itemCategory", "itemOther"]);
    expect(r.success && r.data.boxes).toHaveLength(3);
  });
});

describe("크리에이터 칸", () => {
  it("크리에이터 id 꼴(uuid)이 아니면 받지 않는다 — DB 형식 오류가 서버 오류로 번지지 않게", () => {
    const base = { itemCategory: "stationery", smallCount: "1", mediumCount: "0", largeCount: "0", electronicsOrMetal: "no" };
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
