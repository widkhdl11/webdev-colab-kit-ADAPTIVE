import { describe, expect, it } from "vitest";
import { BANNER_STATE_LABEL, bannerLinkKind, bannerTextOk, parseAdminBanners, parsePublicBanners, toBannerViews } from "./banner";

// 광고 배너 규칙 (docs/specs/banners.md INV-Y2·Y3·Y6·Y8). DB 제약과 같은 답인지는 통합 시험(banners-db)이 같은 글을 둘에 넣어 본다.

describe("누르면 가는 곳 (INV-Y3)", () => {
  it("INV-Y3 (S3): /about·/#price 는 팬꾹 안, https://youtube.com/@haru 는 바깥", () => {
    expect(bannerLinkKind("/about")).toBe("internal");
    expect(bannerLinkKind("/#price")).toBe("internal");
    expect(bannerLinkKind("/")).toBe("internal");
    expect(bannerLinkKind("https://youtube.com/@haru")).toBe("external");
  });

  it.each(["javascript:alert(1)", "http://a.com", "//evil.com", "/\\evil.com", "data:text/html,x", "", "/ a", "https://", "https:///x", "HTTPS://a.com", "/a\u3000b", `/${"a".repeat(500)}`])(
    "INV-Y3 (S3b, 실패경로): %j → 저장 불가",
    (link) => {
      expect(bannerLinkKind(link)).toBeNull();
    },
  );
});

describe("글자 수 (INV-Y6)", () => {
  it("INV-Y6 (S6): 제목 30자·설명 40자 → 됨. 글자 수는 DB 와 같은 방식 — 이모지 😀 는 1글자, 합친 가족 이모지 👨‍👩‍👧 는 5글자", () => {
    expect(bannerTextOk("가".repeat(30), "나".repeat(40))).toBe(true);
    expect(bannerTextOk("😀".repeat(30), "")).toBe(true);
    expect(bannerTextOk(`${"가".repeat(25)}👨‍👩‍👧`, "")).toBe(true);
    expect(bannerTextOk(`${"가".repeat(26)}👨‍👩‍👧`, "")).toBe(false);
  });

  it("INV-Y6 (S6b, 실패경로): 제목 빈칸·공백만·31자, 설명 41자, 앞뒤 공백·줄바꿈 → 안 됨", () => {
    expect(bannerTextOk("", "")).toBe(false);
    expect(bannerTextOk("   ", "")).toBe(false);
    expect(bannerTextOk("가".repeat(31), "")).toBe(false);
    expect(bannerTextOk("가", "나".repeat(41))).toBe(false);
    expect(bannerTextOk(" 가", "")).toBe(false);
    expect(bannerTextOk("가\n나", "")).toBe(false);
  });
});

describe("읽기 결과 (INV-Y2·Y8)", () => {
  const row = { id: "11111111-1111-4111-8111-111111111111", title: "가", description: "", link: "/about", is_ad: false, image_path: "b-0123456789abcdef0123456789abcdef.webp" };

  it("INV-Y8: 공개 읽기 줄을 받은 순서 그대로 화면 값으로 — 그림은 공개 저장소 주소", () => {
    const rows = parsePublicBanners([row, { ...row, id: "22222222-2222-4222-8222-222222222222", title: "나", is_ad: true }]);
    expect(rows?.map((b) => b.title)).toEqual(["가", "나"]);
    const views = toBannerViews(rows!, "http://x");
    expect(views[1]).toMatchObject({ isAd: true, imageUrl: "http://x/storage/v1/object/public/banner-images/b-0123456789abcdef0123456789abcdef.webp" });
  });

  it("INV-Y2 (실패경로): 꼴이 다른 줄·규칙 밖 링크·이상한 그림 경로가 섞이면 null", () => {
    expect(parsePublicBanners([{ id: 1 }])).toBeNull();
    expect(parsePublicBanners([{ ...row, link: "javascript:alert(1)" }])).toBeNull();
    expect(parsePublicBanners([{ ...row, image_path: "../gift-photos/x.webp" }])).toBeNull();
    expect(parsePublicBanners(null)).toBeNull();
  });

  it("INV-Y2: 운영자 목록의 상태 이름 — 보이는 중·예정·끝남. 모르는 상태는 null", () => {
    const admin = { ...row, sort_order: 1, starts_on: "2026-10-01", ends_on: null };
    expect(parseAdminBanners([{ ...admin, state: "live" }, { ...admin, state: "scheduled" }, { ...admin, state: "ended" }])?.map((b) => BANNER_STATE_LABEL[b.state])).toEqual([
      "보이는 중",
      "예정",
      "끝남",
    ]);
    expect(parseAdminBanners([{ ...admin, state: "visible" }])).toBeNull();
  });
});
