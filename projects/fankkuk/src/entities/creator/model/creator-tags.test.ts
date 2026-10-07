import { describe, expect, it } from "vitest";
import { countTagSelection, hasPickedTag, resolveTagSelection, TAG_CUSTOM_MAX, TAG_TOTAL_MAX, tagChips, tagSelectionSchema } from "./creator-tags";

const ID = {
  soop: "11111111-1111-4111-8111-000000000001",
  chzzk: "11111111-1111-4111-8111-000000000002",
  youtube: "11111111-1111-4111-8111-000000000003",
  x: "11111111-1111-4111-8111-000000000004",
  virtual: "11111111-1111-4111-8111-000000000005",
  tiktok: "11111111-1111-4111-8111-000000000006",
};
const OPTIONS = [
  { id: ID.soop, name: "SOOP" },
  { id: ID.chzzk, name: "치지직" },
  { id: ID.youtube, name: "유튜브" },
  { id: ID.x, name: "X" },
  { id: ID.virtual, name: "버추얼" },
  { id: ID.tiktok, name: "틱톡" },
];

describe("INV-T3: 태그 고르기 — 합쳐 1~5개", () => {
  it("INV-T3: 상한은 합쳐 5개, 직접 입력은 20자다", () => {
    expect(TAG_TOTAL_MAX).toBe(5);
    expect(TAG_CUSTOM_MAX).toBe(20);
  });

  it("INV-T3 S3: 선택지 4개 + 직접 입력 「팝콘TV」 → 5개, 직접 입력은 앞뒤 공백을 뺀다", () => {
    const r = resolveTagSelection(OPTIONS, [ID.soop, ID.chzzk, ID.youtube, ID.virtual], "  팝콘TV ");
    expect(r).toEqual({ ok: true, tagIds: [ID.soop, ID.chzzk, ID.youtube, ID.virtual], customTag: "팝콘TV", count: 5 });
  });

  it("INV-T3 S3c: 직접 입력이 선택지 이름과 같으면(공백·영문 대소문자 무시) 그 선택지를 고른 것으로 — 이미 골랐으면 한 번만", () => {
    expect(resolveTagSelection(OPTIONS, [], " 유튜브 ")).toEqual({ ok: true, tagIds: [ID.youtube], customTag: null, count: 1 });
    expect(resolveTagSelection(OPTIONS, [ID.chzzk], "x")).toEqual({ ok: true, tagIds: [ID.chzzk, ID.x], customTag: null, count: 2 });
    expect(resolveTagSelection(OPTIONS, [ID.youtube], "YouTube")).toMatchObject({ ok: true, customTag: "YouTube", count: 2 });
    expect(resolveTagSelection(OPTIONS, [ID.youtube], "유튜브")).toEqual({ ok: true, tagIds: [ID.youtube], customTag: null, count: 1 });
  });

  it("INV-T3 S3b (실패경로): 0개 / 선택지 5 + 직접 1 / 같은 선택지 두 번 / 목록에 없는(숨긴) 선택지 / 직접 입력 21자 / 보이지 않는 글자 → 거부", () => {
    const five = [ID.soop, ID.chzzk, ID.youtube, ID.x, ID.virtual];
    const bad: [string[], string][] = [
      [[], ""],
      [[], "   "],
      [five, "팝콘TV"],
      [[ID.chzzk, ID.chzzk], ""],
      [["99999999-9999-4999-8999-999999999999"], ""],
      [[ID.chzzk], "가".repeat(21)],
      [[ID.chzzk], "팝콘​TV"],
    ];
    for (const [ids, custom] of bad) {
      expect([ids, custom, resolveTagSelection(OPTIONS, ids, custom).ok]).toEqual([ids, custom, false]);
    }
    expect(resolveTagSelection(OPTIONS, [], "가".repeat(20)).ok).toBe(true);
  });

  it("INV-T3: 서버 입력 꼴 — 선택지 id 목록과 직접 입력, 합쳐 1~5개 · 같은 id 두 번 금지 · 직접 입력 1~20자", () => {
    expect(tagSelectionSchema.safeParse({ tagIds: [ID.chzzk], customTag: " 팝콘TV " }).data).toEqual({ tagIds: [ID.chzzk], customTag: "팝콘TV" });
    expect(tagSelectionSchema.safeParse({ tagIds: [], customTag: "팝콘TV" }).success).toBe(true);
    const bad: unknown[] = [
      { tagIds: [], customTag: "" },
      { tagIds: [ID.chzzk, ID.chzzk], customTag: "" },
      { tagIds: [ID.soop, ID.chzzk, ID.youtube, ID.x, ID.virtual, ID.tiktok], customTag: "" },
      { tagIds: ["not-a-uuid"], customTag: "" },
      { tagIds: [ID.chzzk], customTag: "가".repeat(21) },
      { tagIds: [ID.chzzk], customTag: "팝콘​TV" },
      { tagIds: [ID.chzzk] },
      { customTag: "팝콘TV" },
    ];
    for (const b of bad) expect([b, tagSelectionSchema.safeParse(b).success]).toEqual([b, false]);
  });

  it("INV-T3 S3c: 서버 개수 검사는 직접 입력을 고른 선택지와 겹칠 수 있는 것으로 본다 — 선택지 5개 + 직접 입력 「유튜브」(겹침)를 6개로 세어 거부하지 않는다", () => {
    const five = [ID.soop, ID.chzzk, ID.youtube, ID.x, ID.virtual];
    expect(tagSelectionSchema.safeParse({ tagIds: five, customTag: " 유튜브 " }).data).toEqual({ tagIds: five, customTag: "유튜브" });
    expect(tagSelectionSchema.safeParse({ tagIds: five, customTag: "YOUTUBE" }).success).toBe(true);
    // 앱 서버는 선택지 이름을 모른다 — 겹치지 않는 6개(직접 입력 「팝콘TV」)는 DB 가 22023 으로 거부한다(통합 시험)
    expect(tagSelectionSchema.safeParse({ tagIds: five, customTag: "팝콘TV" }).success).toBe(true);
    // 화면은 이름을 알므로 같은 입력을 하나로 합친다
    expect(resolveTagSelection(OPTIONS, five, "유튜브")).toEqual({ ok: true, tagIds: five, customTag: null, count: 5 });
  });

  it("INV-T3 S3c: 화면의 「지금 몇 개」는 저장할 때와 같은 셈 — 겹친 직접 입력·같은 선택지 두 번은 하나로, 꼴이 틀리거나 넘쳐도 센다", () => {
    const five = [ID.soop, ID.chzzk, ID.youtube, ID.x, ID.virtual];
    expect(countTagSelection(OPTIONS, [], "")).toBe(0);
    expect(countTagSelection(OPTIONS, [], "   ")).toBe(0);
    expect(countTagSelection(OPTIONS, [ID.chzzk], " 팝콘TV ")).toBe(2);
    // 고른 선택지와 같은 이름(공백·영문 대소문자 무시)의 직접 입력은 하나 — 5개를 다 골라도 6이 되지 않는다
    expect(countTagSelection(OPTIONS, five, " 유튜브 ")).toBe(5);
    expect(countTagSelection(OPTIONS, [ID.chzzk], "x")).toBe(2);
    // 고르지 않은 선택지 이름의 직접 입력은 그 선택지 하나로 센다
    expect(countTagSelection(OPTIONS, [], "틱톡")).toBe(1);
    expect(countTagSelection(OPTIONS, [ID.chzzk, ID.chzzk], "")).toBe(1);
    // 저장이 거부되는 입력도 개수는 보여 준다(넘친 6개, 21자 직접 입력)
    expect(countTagSelection(OPTIONS, five, "팝콘TV")).toBe(6);
    expect(countTagSelection(OPTIONS, [ID.chzzk], "가".repeat(21))).toBe(2);
    // 저장이 받아들여지는 입력은 resolveTagSelection 의 count 와 같다
    for (const [ids, custom] of [[five, " 유튜브 "], [[ID.youtube], "YouTube"], [[ID.chzzk], "x"], [[], "팝콘TV"]] as [string[], string][]) {
      const r = resolveTagSelection(OPTIONS, ids, custom);
      expect(r.ok && r.count).toBe(countTagSelection(OPTIONS, ids, custom));
    }
  });
});

describe("INV-T4: 찾기·메인 칩 — 숨기지 않은 선택지 중 공개 크리에이터가 1명 이상인 것만, 선택지 순서", () => {
  it("INV-T4 S4b: 아무도 고르지 않은 「틱톡」은 칩에 없고, 순서는 크리에이터 순서가 아니라 선택지 순서다", () => {
    const cards = [{ tags: ["버추얼", "치지직"] }, { tags: ["SOOP"] }, { tags: [] }];
    expect(tagChips(OPTIONS, cards)).toEqual(["SOOP", "치지직", "버추얼"]);
  });

  it("INV-T4 S4 (실패경로): 선택지 목록에 없는 말(직접 입력·숨긴 선택지)은 카드에 붙어 와도 칩이 되지 않는다", () => {
    expect(tagChips(OPTIONS, [{ tags: ["팝콘TV", "치지직"] }])).toEqual(["치지직"]);
    expect(tagChips([], [{ tags: ["치지직"] }])).toEqual([]);
  });

  it("INV-T4: 칩 하나를 고르면 그 태그를 가진 크리에이터만 — 「전체」(null)는 모두, 태그 없는 크리에이터는 칩을 고르면 빠진다", () => {
    const cards = [{ tags: ["버추얼", "치지직"] }, { tags: ["SOOP"] }, { tags: [] }];
    expect(cards.filter((c) => hasPickedTag(c, null))).toHaveLength(3);
    expect(cards.filter((c) => hasPickedTag(c, "치지직"))).toEqual([{ tags: ["버추얼", "치지직"] }]);
    expect(cards.filter((c) => hasPickedTag(c, "틱톡"))).toEqual([]);
    // 이름은 그대로 비교한다 — 칩 이름은 카드 태그와 같은 선택지 이름에서 온다
    expect(hasPickedTag({ tags: ["SOOP"] }, "soop")).toBe(false);
  });
});
