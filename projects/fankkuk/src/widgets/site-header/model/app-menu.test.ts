import { describe, expect, it } from "vitest";
import { ACCOUNT_MENU, CREATOR_APP_MENU, CREATOR_CUSTOMIZE_HREF, CREATOR_SENT_HREFS, currentMenuItem, FAN_APP_MENU, FAN_PROFILE_EDIT_HREF } from "./app-menu";

// 크리에이터 앱 메뉴 구성 (디자인 기준 11절, 시안 docs/design/mockups/site/v19-sidebar/creator-a.html).

const group = (label: string) => CREATOR_APP_MENU.find((g) => g.label === label)!;
const labels = (label: string) => group(label).items.map((i) => i.label);

describe("크리에이터 메뉴 — 묶음", () => {
  it("기본·받기·보내기·내 팬꾹 순서, 칸은 시안 그대로", () => {
    expect(CREATOR_APP_MENU.map((g) => g.label)).toEqual(["기본", "받기", "보내기", "내 팬꾹"]);
    expect(labels("기본")).toEqual(["홈", "크리에이터 찾기"]);
    expect(labels("받기")).toEqual(["승인 대기", "승인 내역", "받은 선물", "열람 기록"]);
    expect(labels("보내기")).toEqual(["팬에게 보내기", "다른 크리에이터에게 선물", "보낸 내역"]);
    expect(labels("내 팬꾹")).toEqual(["꾸미기", "주소 관리", "설정"]);
  });

  it("꾸미기는 /creator/customize 한 칸뿐", () => {
    const all = CREATOR_APP_MENU.flatMap((g) => g.items).filter((i) => i.href === CREATOR_CUSTOMIZE_HREF);
    expect(all.map((i) => i.label)).toEqual(["꾸미기"]);
  });
});

describe("크리에이터 메뉴 — 팬에게 보내기 하위 줄", () => {
  const parent = group("보내기").items.find((i) => i.label === "팬에게 보내기")!;

  it("몇 명에게는 역조공 보내기 화면으로 가는 링크, 합포장은 링크 없는 준비 중 칸", () => {
    expect(parent.sub).toEqual([{ label: "몇 명에게", href: "/creator/revgifts/new#count" }, { label: "합포장", soon: true }]);
  });

  it("하위 줄이 있는 칸은 이 하나뿐", () => {
    expect(CREATOR_APP_MENU.flatMap((g) => g.items).filter((i) => i.sub).map((i) => i.label)).toEqual(["팬에게 보내기"]);
  });
});

describe("현재 칸 — 보낸 내역은 두 화면에서 켜진다", () => {
  it("팬에게 보낸 역조공 화면과 크리에이터에게 보낸 선물 화면 모두 「보낸 내역」", () => {
    expect(currentMenuItem(CREATOR_APP_MENU, CREATOR_SENT_HREFS.fans)?.label).toBe("보낸 내역");
    expect(currentMenuItem(CREATOR_APP_MENU, CREATOR_SENT_HREFS.creators)?.label).toBe("보낸 내역");
  });

  it("역조공 보내기 화면은 부모 칸 「팬에게 보내기」 — 하위 줄(#count)은 고르지 않는다", () => {
    expect(currentMenuItem(CREATOR_APP_MENU, "/creator/revgifts/new")?.label).toBe("팬에게 보내기");
  });

  it("메뉴에 없는 주소는 아무 칸도 켜지 않는다", () => {
    expect(currentMenuItem(CREATOR_APP_MENU, "/gifts/1234")).toBeNull();
  });
});

describe("이름 메뉴 — 팬은 프로필 수정·계정 설정 (design-rules 12절, 시안 v21-addendum3 fan-*.html)", () => {
  it("팬 이름 메뉴는 프로필 수정(/me/profile) → 계정 설정(/me) 순서", () => {
    expect(FAN_PROFILE_EDIT_HREF).toBe("/me/profile");
    expect(ACCOUNT_MENU.fan).toEqual([
      { label: "프로필 수정", href: "/me/profile" },
      { label: "계정 설정", href: "/me" },
    ]);
  });

  it("크리에이터 이름 메뉴는 계정 설정 하나 — 팬 프로필 수정 화면으로 가는 길이 없다", () => {
    expect(ACCOUNT_MENU.creator).toEqual([{ label: "계정 설정", href: "/creator/settings" }]);
  });

  it("프로필 수정은 사이드바 위 메뉴 칸이 아니다(시안 사이드바에 없음) — 그 화면에서 위 메뉴의 어느 칸도 켜지지 않는다", () => {
    expect(currentMenuItem(FAN_APP_MENU, FAN_PROFILE_EDIT_HREF)).toBeNull();
  });
});
