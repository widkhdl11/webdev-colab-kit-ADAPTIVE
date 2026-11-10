import { describe, expect, it } from "vitest";
import { LINK_HOST } from "./creator-handle";
import { giftLinkText, isSameGiftLink } from "./gift-link-match";

// 팬꾹 링크 게시 확인의 판정 (creator-verification INV-V18).

describe("INV-V18: 링크 칸의 주소가 요청 줄의 팬꾹 링크와 같은가", () => {
  it("INV-V18: https·http·www 가 붙거나 빠진 것, 끝의 / 하나, 아이디 대소문자만 다른 것은 같다", () => {
    for (const found of [
      "fankkuk.com/haru",
      "https://fankkuk.com/haru",
      "http://fankkuk.com/haru",
      "https://www.fankkuk.com/haru",
      "www.fankkuk.com/haru/",
      "https://fankkuk.com/HARU",
      " https://FANKKUK.com/Haru ",
      `https://${LINK_HOST}/haru`,
    ]) {
      expect([found, isSameGiftLink(found, "haru")]).toEqual([found, true]);
    }
  });

  it("INV-V18 (실패경로): 도메인만·다른 경로·다른 아이디·옛 아이디·?·#·끝의 / 둘·단축 주소·링크 모음은 반려", () => {
    for (const found of [
      "fankkuk.com",
      "https://fankkuk.com/",
      "https://fankkuk.com/creators/c-12ab34cd56",
      "https://fankkuk.com/gifts/new",
      "https://fankkuk.com/haru/gifts",
      "https://fankkuk.com/haru2",
      "https://fankkuk.com/haru_old",
      "https://fankkuk.com/haru?ref=x",
      "https://fankkuk.com/haru#top",
      "https://fankkuk.com/haru//",
      "https://bit.ly/3abcde",
      "https://linktr.ee/haru",
      "https://evilfankkuk.com/haru",
      "https://fankkuk.com.evil.example/haru",
      "ftp://fankkuk.com/haru",
      // 2026-11-04: 팬꾹 주소는 fankkuk.com 하나 — 예전 화면 표기 fankkuk.kr 은 없는 주소라 그 링크는 열리지 않는다
      "https://fankkuk.kr/haru",
      "fankkuk.kr/haru",
    ]) {
      expect([found, isSameGiftLink(found, "haru")]).toEqual([found, false]);
    }
  });
});

describe("INV-V18: 운영자 화면의 찾을 링크", () => {
  it("INV-V18: 사이트 주소/아이디 꼴", () => {
    expect(giftLinkText("haru")).toBe(`${LINK_HOST}/haru`);
  });
});
