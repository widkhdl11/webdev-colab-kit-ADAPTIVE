import { describe, expect, it } from "vitest";
import { hardItemFanMessage, hardItemOverlap, hardItemsNotice, hardItemsRemaining } from "./hard-items";
import { forcesMetalReport, hasFinalConsonant, ITEM_CATEGORIES, ITEM_CATEGORY_LABEL, sortCategories, withObjectParticle, withTopicParticle } from "./item-category";

// docs/specs/hard-items.md — 화면 쪽 문구(INV-H6)·안내 판정(INV-H8)·종류 목록(INV-H1)·전자기기 신고(INV-H2).

describe("INV-H1: 물품 종류 목록", () => {
  it("INV-H1: 여덟 종류가 이 순서이고 냉장·냉동·음식·액체는 없다", () => {
    expect(ITEM_CATEGORIES.map((c) => ITEM_CATEGORY_LABEL[c])).toEqual(["인형·쿠션", "꽃", "의류", "향수·화장품", "대형 물품", "문구", "전자기기", "기타"]);
    expect(Object.values(ITEM_CATEGORY_LABEL).join(" ")).not.toMatch(/냉장|냉동|음식|액체/);
  });
});

describe("INV-H2: 전자기기를 고르면 신고가 켜진다", () => {
  it("INV-H2: 전자기기만 참", () => {
    expect(ITEM_CATEGORIES.filter(forcesMetalReport)).toEqual(["electronics"]);
    expect(forcesMetalReport(null)).toBe(false);
  });
});

describe("INV-H6: 공개 문구는 정해진 틀 하나", () => {
  it("INV-H6 S6: 인형·쿠션, 꽃 + 이미 많이 받았어요", () => {
    expect(hardItemsNotice({ categories: ["doll", "flower"], reason: "many" })).toBe("지금은 인형·쿠션, 꽃을 받기 어려워요 ㅠㅠ 이미 많이 받았어요");
  });

  it("INV-H6 S6b: 의류, 문구 + 표시 안 함이면 「ㅠㅠ」까지만, 받침 없는 마지막 품목은 「를」", () => {
    expect(hardItemsNotice({ categories: ["clothing", "stationery"], reason: "none" })).toBe("지금은 의류, 문구를 받기 어려워요 ㅠㅠ");
  });

  it("INV-H6: 이유 셋의 문구", () => {
    expect(hardItemsNotice({ categories: ["large"], reason: "storage" })).toBe("지금은 대형 물품을 받기 어려워요 ㅠㅠ 보관할 곳이 부족해요");
    expect(hardItemsNotice({ categories: ["beauty"], reason: "away" })).toBe("지금은 향수·화장품을 받기 어려워요 ㅠㅠ 잠시 집을 비워요");
    expect(hardItemsNotice({ categories: ["electronics"], reason: "many" })).toBe("지금은 전자기기를 받기 어려워요 ㅠㅠ 이미 많이 받았어요");
  });

  it("INV-H6: 품목은 목록 순서로 잇는다(고른 순서와 상관없이), 마지막 품목 받침이 조사를 정한다", () => {
    expect(hardItemsNotice({ categories: ["other", "flower", "doll"], reason: "none" })).toBe("지금은 인형·쿠션, 꽃, 기타를 받기 어려워요 ㅠㅠ");
    expect(sortCategories(["electronics", "doll", "doll"])).toEqual(["doll", "electronics"]);
  });

  it("INV-H6 (실패경로): 설정이 없거나 품목이 비면 문구가 없다", () => {
    expect(hardItemsNotice(null)).toBeNull();
    expect(hardItemsNotice(undefined)).toBeNull();
    expect(hardItemsNotice({ categories: [], reason: "many" })).toBeNull();
  });

  it("INV-H6: 받침 판정 — 꽃·쿠션·화장품·물품은 받침, 의류·문구·전자기기·기타는 받침 없음, 한글이 아니면 받침 없음", () => {
    expect(["꽃", "쿠션", "화장품", "물품"].map(hasFinalConsonant)).toEqual([true, true, true, true]);
    expect(["의류", "문구", "전자기기", "기타", "CD", ""].map(hasFinalConsonant)).toEqual([false, false, false, false, false, false]);
    expect(withObjectParticle("꽃")).toBe("꽃을");
    expect(withObjectParticle("의류")).toBe("의류를");
    expect(withTopicParticle("꽃")).toBe("꽃은");
    expect(withTopicParticle("문구")).toBe("문구는");
  });
});

describe("INV-H8: 등록 화면 안내", () => {
  const hard = (action: "notice" | "block") => ({ categories: ["flower", "doll"] as const, reason: "many" as const, action });

  it("INV-H8 S8: 꽃 「안내만」에 꽃을 고르면 안내가 뜨고 막지 않는다", () => {
    expect(hardItemOverlap("하루", hard("notice"), "flower")).toEqual({
      message: "하루님이 현재 받기 어려운 선물입니다: 꽃.",
      blocks: false,
    });
  });

  it("INV-H8 S8b (실패경로): 「등록 막기」면 「다른 종류를 선택해 주세요」로 끝나는 안내에 막는다", () => {
    expect(hardItemOverlap("하루", hard("block"), "doll")).toEqual({
      message: "하루님이 현재 받지 않는 선물입니다: 인형·쿠션. 다른 종류를 선택해 주세요.",
      blocks: true,
    });
  });

  it("INV-H8: 겹치지 않거나 설정이 없거나 아직 안 골랐으면 안내가 없다", () => {
    expect(hardItemOverlap("하루", hard("block"), "stationery")).toBeNull();
    expect(hardItemOverlap("하루", null, "flower")).toBeNull();
    expect(hardItemOverlap("하루", hard("block"), null)).toBeNull();
  });

  it("INV-H8: 안내는 「{이름}님이 현재 받기 어려운 선물입니다: {품목}.」 — 조사 없이 품목 이름 그대로", () => {
    expect(hardItemFanMessage("여름밤", "clothing")).toBe("여름밤님이 현재 받기 어려운 선물입니다: 의류.");
  });

});

describe("INV-H5: 설정 화면의 남은 기간", () => {
  it("INV-H5: 끝나는 날 전날까지 보이고, 남은 날은 오늘을 센다", () => {
    expect(hardItemsRemaining("2026-10-18", { year: 2026, month: 10, day: 11 })).toBe("10월 17일까지 (7일 남음)");
    expect(hardItemsRemaining("2027-01-01", { year: 2026, month: 12, day: 31 })).toBe("12월 31일까지 (1일 남음)");
    expect(hardItemsRemaining(null, { year: 2026, month: 10, day: 11 })).toBe("직접 해제할 때까지");
  });
});
