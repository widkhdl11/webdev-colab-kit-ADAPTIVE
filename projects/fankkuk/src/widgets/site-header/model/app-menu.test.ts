import { describe, expect, it } from "vitest";
import { ACCOUNT_MENU, BADGE_SPEECH, CREATOR_APP_MENU, CREATOR_CUSTOMIZE_HREF, CREATOR_SENT_HREFS, currentMenuItem, FAN_APP_MENU, FAN_PROFILE_EDIT_HREF } from "./app-menu";

// 크리에이터 앱 메뉴 구성 (디자인 기준 11절, 시안 docs/design/mockups/site/v19-sidebar/creator-a.html).

const group = (label: string) => CREATOR_APP_MENU.find((g) => g.label === label)!;
const labels = (label: string) => group(label).items.map((i) => i.label);

describe("크리에이터 메뉴 — 묶음", () => {
  it("기본·받기·보내기·내 팬꾹 순서, 칸은 시안 그대로 — 기본은 홈 → 선물 현황 → 지금 할 일 → 크리에이터 찾기, 「승인 대기」 칸은 없다(design-rules 13절, action-center INV-J6)", () => {
    expect(CREATOR_APP_MENU.map((g) => g.label)).toEqual(["기본", "받기", "보내기", "내 팬꾹"]);
    expect(labels("기본")).toEqual(["홈", "선물 현황", "지금 할 일", "크리에이터 찾기"]);
    expect(labels("받기")).toEqual(["승인 내역", "받은 선물", "열람 기록"]);
    expect(labels("보내기")).toEqual(["팬에게 보내기", "다른 크리에이터에게 선물", "팔로우한 크리에이터", "보낸 내역"]);
    expect(labels("내 팬꾹")).toEqual(["꾸미기", "프로필 수정", "상세 설정"]);
  });

  it("내 팬꾹 (design-rules 12절): 꾸미기·프로필 수정·상세 설정 주소 — 주소 관리 줄은 없고 받는 주소는 상세 설정 안", () => {
    expect(group("내 팬꾹").items.map((i) => [i.label, i.href, i.icon])).toEqual([
      ["꾸미기", "/creator/customize", "palette"],
      ["프로필 수정", "/creator/profile", "user-round"],
      ["상세 설정", "/creator/settings", "settings"],
    ]);
    const all = CREATOR_APP_MENU.flatMap((g) => g.items);
    expect(all.some((i) => i.label === "주소 관리" || i.href.includes("#address"))).toBe(false);
  });

  it("선물 현황 칸은 /creator/progress 로 가고 트럭 아이콘, 숫자 뱃지는 없다(design-rules 13절 — 읽기 전용 목록)", () => {
    const it2 = group("기본").items.find((i) => i.label === "선물 현황")!;
    expect([it2.href, it2.icon, it2.badge]).toEqual(["/creator/progress", "truck", undefined]);
    expect(currentMenuItem(CREATOR_APP_MENU, "/creator/progress")?.label).toBe("선물 현황");
  });

  it("INV-J6: 지금 할 일 칸(2026-10-21 이름 — 팬 쪽과 같게)은 크리에이터 처리할 일 화면으로 가고 숫자는 그 뱃지 하나 — 승인 요청만 따로 세는 뱃지가 없다", () => {
    const all = CREATOR_APP_MENU.flatMap((g) => g.items);
    expect(all.filter((i) => i.badge).map((i) => [i.label, i.href, i.badge])).toEqual([["지금 할 일", "/creator/actions", "actions"]]);
    expect(currentMenuItem(CREATOR_APP_MENU, "/creator/actions")?.label).toBe("지금 할 일");
    // 크리에이터도 다른 크리에이터를 팔로우한다(follow-mode — 운영자·자기 자신만 숨김). 팔로우 목록은 팬과 같은 화면
    expect(currentMenuItem(CREATOR_APP_MENU, "/me/following")?.label).toBe("팔로우한 크리에이터");
  });

  it("프로필 수정·상세 설정 화면에서 그 칸이 켜진다", () => {
    expect(currentMenuItem(CREATOR_APP_MENU, "/creator/profile")?.label).toBe("프로필 수정");
    expect(currentMenuItem(CREATOR_APP_MENU, "/creator/settings")?.label).toBe("상세 설정");
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

  it("크리에이터 이름 메뉴는 계정 설정 하나 — 크리에이터 계정 설정 화면으로, 팬 프로필 수정 화면으로 가는 길이 없다", () => {
    expect(ACCOUNT_MENU.creator).toEqual([{ label: "계정 설정", href: "/creator/account" }]);
  });

  it("프로필 수정은 사이드바 위 메뉴 칸이 아니다(시안 사이드바에 없음) — 그 화면에서 위 메뉴의 어느 칸도 켜지지 않는다", () => {
    expect(currentMenuItem(FAN_APP_MENU, FAN_PROFILE_EDIT_HREF)).toBeNull();
  });
});

describe("팬 메뉴 — 묶음 없이 한 줄 (action-center 「팬 메뉴 재구성」 · INV-J2, design-rules 21절)", () => {
  it("팬 메뉴는 묶음 이름 없는 한 묶음이고, 순서는 홈 / 지금 할 일 / 크리에이터 찾기 / 선물 보내기 / 보낸 선물 / 받은 선물 / 팔로우한 크리에이터 / 문의", () => {
    expect(FAN_APP_MENU.map((g) => g.label)).toEqual([""]);
    expect(FAN_APP_MENU[0]!.items.map((i) => i.label)).toEqual(["홈", "지금 할 일", "크리에이터 찾기", "선물 보내기", "보낸 선물", "받은 선물", "팔로우한 크리에이터", "문의"]);
    // 「물품 보관소」는 그 화면을 만들 때 들어간다 — 지금은 칸이 없다
    expect(FAN_APP_MENU[0]!.items.some((i) => i.label === "물품 보관소")).toBe(false);
  });

  it("INV-J2: 지금 할 일 칸은 /me/actions, 숫자 뱃지는 처리할 일 읽기 결과(actions) 하나뿐 — 보낸 선물에는 숫자가 없다(시안 v34-part1)", () => {
    const items = FAN_APP_MENU.flatMap((g) => g.items);
    expect(items.filter((i) => i.badge).map((i) => [i.label, i.href, i.icon, i.badge])).toEqual([["지금 할 일", "/me/actions", "clipboard-list", "actions"]]);
    expect(currentMenuItem(FAN_APP_MENU, "/me/actions")?.label).toBe("지금 할 일");
  });

  it("INV-J2: 뱃지 낭독은 수만 — 칸 이름과 이어 읽으면 「지금 할 일, 3건」(칸 이름을 두 번 읽지 않는다)", () => {
    expect(BADGE_SPEECH.actions(3)).toBe("3건");
    expect(BADGE_SPEECH.actions(3)).not.toContain("할 일");
  });
});
