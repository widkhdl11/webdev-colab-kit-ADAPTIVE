import { describe, expect, it } from "vitest";
import { NOTICE_SIZES } from "@/entities/creator/model/link-images";
import { NOTICE_LAYOUT, noticeNameSize, STORY_SAFE_INSET } from "./notice-layout";

// 공지 이미지 세 크기의 자리 (creator-link INV-E10, 디자인 기준 10절).

describe("INV-E10: 공지 이미지 자리", () => {
  it("INV-E10: 세 크기의 그림 크기가 공지 이미지 크기와 같다", () => {
    for (const size of ["square", "story", "wide"] as const) {
      const l = NOTICE_LAYOUT[size];
      expect([size, l.width, l.height]).toEqual([size, NOTICE_SIZES[size].width, NOTICE_SIZES[size].height]);
    }
  });

  it("INV-E10: 스토리 세로판은 위·아래 250px 에 글자를 두지 않는다", () => {
    const l = NOTICE_LAYOUT.story;
    expect(STORY_SAFE_INSET).toBe(250);
    expect(l.textTop).toBeGreaterThanOrEqual(STORY_SAFE_INSET);
    expect(l.height - l.textBottom).toBeGreaterThanOrEqual(STORY_SAFE_INSET);
  });

  it("INV-E10: 세 크기 모두 사진이 배경 아래 가장자리에 걸치고, 글자 칸은 사진 아래·그림 안에 있다", () => {
    for (const size of ["square", "story", "wide"] as const) {
      const l = NOTICE_LAYOUT[size];
      expect([size, l.photoTop < l.bgHeight && l.photoTop + l.photoSize > l.bgHeight]).toEqual([size, true]);
      expect([size, l.textTop >= l.photoTop + l.photoSize && l.textBottom <= l.height && l.textTop < l.textBottom]).toEqual([size, true]);
    }
  });

  it("INV-E10: 긴 공개 이름은 글자를 줄인다", () => {
    const l = NOTICE_LAYOUT.story;
    expect([noticeNameSize(l, "하루"), noticeNameSize(l, "하루하루하루하루하루"), noticeNameSize(l, "하".repeat(20))]).toEqual([88, 64, 48]);
  });
});
