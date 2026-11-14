import { describe, expect, it } from "vitest";
import { CREATOR_HOME, FAN_HOME, homePathOf } from "./home-path";
import { movedCreatorSectionHref } from "./home-path";

describe("로그인한 사람의 첫 화면", () => {
  it("팬은 팬 메인, 크리에이터는 크리에이터 메인으로 간다", () => {
    expect(homePathOf("fan")).toBe("/home");
    expect(homePathOf("creator")).toBe("/creator");
    expect(FAN_HOME).toBe("/home");
    expect(CREATOR_HOME).toBe("/creator");
  });

  it("크리에이터의 첫 화면은 승인 요청 목록이 아니다", () => {
    expect(homePathOf("creator")).not.toBe("/creator/requests");
  });

  it("운영자·손님은 첫 화면이 없다 — 손님 화면을 그대로 보여 준다", () => {
    expect(homePathOf("operator")).toBeNull();
    expect(homePathOf(null)).toBeNull();
    expect(homePathOf(undefined)).toBeNull();
  });
});

describe("프로필 수정 탭 주소 (2026-11-13 — 「계정」 탭을 없앰)", () => {
  it("탭은 프로필 · 채널 둘, 없거나 모르는 값(옛 ?tab=account 포함)은 프로필", async () => {
    const { CREATOR_PROFILE_TABS, parseCreatorProfileTab, creatorProfileTabHref } = await import("./home-path");
    expect([...CREATOR_PROFILE_TABS]).toEqual(["profile", "channel"]);
    expect(parseCreatorProfileTab("channel")).toBe("channel");
    for (const raw of [undefined, "", "account", ["channel"], "CHANNEL"]) expect(parseCreatorProfileTab(raw)).toBe("profile");
    expect(creatorProfileTabHref("profile")).toBe("/creator/profile");
    expect(creatorProfileTabHref("channel")).toBe("/creator/profile?tab=channel");
  });
});

describe("옮겨진 칸의 옛 주소 — 지금 자리로 (2026-11-13 재분류 · 11-14 생일과 기념일)", () => {
  it("계정 설정의 팬덤·선물 링크는 채널 탭, 생일과 기념일은 프로필 탭으로", () => {
    expect(movedCreatorSectionHref("/creator/settings", "fandom")).toBe("/creator/profile?tab=channel#fandom");
    expect(movedCreatorSectionHref("/creator/settings", "link")).toBe("/creator/profile?tab=channel#link");
    expect(movedCreatorSectionHref("/creator/settings", "gift-link")).toBe("/creator/profile?tab=channel#link");
    expect(movedCreatorSectionHref("/creator/settings", "days")).toBe("/creator/profile#days");
  });
  it("알림 설정(옛 계정 설정)의 채널 소유자 확인은 채널 탭으로", () => {
    expect(movedCreatorSectionHref("/creator/account", "verify")).toBe("/creator/profile?tab=channel#verify");
  });
  it("지금 그 화면에 있는 칸·없앤 칸·빈 값은 그대로(null) — 다른 화면의 같은 이름과 섞이지 않는다", () => {
    for (const id of ["constructor", "toString", "__proto__", "address", "blocked", "recv", "hard", "more", "security", "leave", "thanks", "reply", ""]) {
      expect(movedCreatorSectionHref("/creator/settings", id)).toBeNull();
    }
    expect(movedCreatorSectionHref("/creator/account", "fandom")).toBeNull();
    expect(movedCreatorSectionHref("/creator/settings", "verify")).toBeNull();
  });
});
