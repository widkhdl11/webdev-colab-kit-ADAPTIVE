import { describe, expect, it } from "vitest";
import { canDownloadNotice, creatorPagePath, HANDLE_MAX, HANDLE_MIN, isHandleShape, isSameHandle, linkRouteOf, normalizeHandle, oldPageRouteOf } from "./creator-handle";

// 선물 링크 주소 판정 (creator-link INV-E2·E3·E5). 저장 검사의 정본은 DB 함수이고(통합 시험 creator-link-db),
// 여기서는 화면·서버가 주소를 고르는 갈래를 본다.

describe("INV-E2: 아이디 꼴", () => {
  it("INV-E2 S2: 영문 소문자·숫자·밑줄 3~20자만 — 대문자는 소문자로 바꿔 본다", () => {
    expect(normalizeHandle("  HaRu7 ")).toBe("haru7");
    expect(isHandleShape("ha_ru")).toBe(true);
    expect(isHandleShape(normalizeHandle("HaRu7"))).toBe(true);
    for (const bad of ["ab", "a".repeat(HANDLE_MAX + 1), "ha-ru", "하루", "ha ru", "HaRu7", ""]) {
      expect([bad, isHandleShape(bad)]).toEqual([bad, false]);
    }
    expect(isHandleShape("a".repeat(HANDLE_MIN))).toBe(true);
    expect(isHandleShape("a".repeat(HANDLE_MAX))).toBe(true);
  });
});

describe("INV-E2·E3·E5: 링크 주소로 들어왔을 때", () => {
  it("INV-E2 S2b: /HaRu7 로 열면 /haru7 로 넘긴다(찾기 전에)", () => {
    expect(linkRouteOf("HaRu7", null)).toEqual({ kind: "redirect", to: "/haru7" });
  });

  it("INV-E3 S3b: 묶여 있는 옛 아이디로 열면 지금 아이디 주소로 넘긴다", () => {
    expect(linkRouteOf("haru", { creatorId: "c1", handle: "haru_new" })).toEqual({ kind: "redirect", to: "/haru_new" });
  });

  it("INV-E5 S5b (실패경로): 찾지 못한 아이디(없음·본인 확인 전·풀린 옛 아이디)와 꼴이 틀린 주소는 없는 페이지다", () => {
    expect(linkRouteOf("haru", null)).toEqual({ kind: "not_found" });
    expect(linkRouteOf("ha-ru", null)).toEqual({ kind: "not_found" });
    expect(linkRouteOf("%ED%95%98", null)).toEqual({ kind: "not_found" });
    // 꼴이 틀린 주소는 DB 가 무엇을 돌려주든 없는 페이지 — 넘기기 주소로 쓰지 않는다
    expect(linkRouteOf("ha-ru", { creatorId: "c1", handle: "haru" })).toEqual({ kind: "not_found" });
  });

  it("INV-E5: 지금 아이디로 열면 그 크리에이터 페이지를 보인다", () => {
    expect(linkRouteOf("haru_new", { creatorId: "c1", handle: "haru_new" })).toEqual({ kind: "show", creatorId: "c1" });
  });
});

describe("INV-E5: 옛 페이지 주소와 링크", () => {
  it("INV-E5 S5: 아이디가 있으면 옛 페이지 주소는 링크 주소로 넘기고, 없으면 그대로 보인다", () => {
    expect(oldPageRouteOf({ handle: "haru" })).toEqual({ kind: "redirect", to: "/haru" });
    expect(oldPageRouteOf({ handle: null })).toEqual({ kind: "show" });
  });

  it("INV-E5: 크리에이터 페이지로 가는 링크는 아이디가 있으면 링크 주소, 없으면 옛 페이지 주소", () => {
    expect(creatorPagePath({ id: "c1", handle: "haru" })).toBe("/haru");
    expect(creatorPagePath({ id: "c1", handle: null })).toBe("/creators/c1");
  });
});

describe("INV-E2·E10: 설정 화면이 묻는 판단", () => {
  it("INV-E2: 고쳐 쓴 값은 저장 때와 같이 앞뒤 공백을 빼고 소문자로 바꾼 뒤 지금 아이디와 비교한다", () => {
    expect(isSameHandle("  HaRu ", "haru")).toBe(true);
    expect(isSameHandle("haru2", "haru")).toBe(false);
    expect(isSameHandle("haru", null)).toBe(false);
  });

  it("INV-E10 S10 (실패경로): 공지 이미지는 링크 주소가 있고 본인 확인을 마쳤을 때만 내려받는다", () => {
    expect(canDownloadNotice({ handle: "haru", verified: true })).toBe(true);
    expect(canDownloadNotice({ handle: null, verified: true })).toBe(false);
    expect(canDownloadNotice({ handle: "haru", verified: false })).toBe(false);
  });
});
