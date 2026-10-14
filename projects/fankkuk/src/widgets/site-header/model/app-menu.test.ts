import { describe, expect, it } from "vitest";
import { CREATOR_APP_MENU, CREATOR_CUSTOMIZE_HREF } from "./app-menu";

// 크리에이터 앱 메뉴의 「내 팬꾹 꾸미기」 자리 (디자인 기준 10절, 시안 docs/design/mockups/addendum/customize/customize-b.html).

describe("크리에이터 메뉴 — 내 팬꾹 꾸미기", () => {
  it("「관리」 묶음에서 「주소 관리」 바로 위에 한 칸 — 주소는 /creator/customize", () => {
    const manage = CREATOR_APP_MENU.find((g) => g.label === "관리")!;
    const labels = manage.items.map((i) => i.label);
    const at = labels.indexOf("내 팬꾹 꾸미기");
    expect([at >= 0, labels[at + 1]]).toEqual([true, "주소 관리"]);
    expect(manage.items[at]).toMatchObject({ href: CREATOR_CUSTOMIZE_HREF, icon: "sparkles" });
    expect(CREATOR_CUSTOMIZE_HREF).toBe("/creator/customize");
  });

  it("메뉴 전체에 한 번만 나온다 — 다른 묶음에 같은 칸이 없다", () => {
    const all = CREATOR_APP_MENU.flatMap((g) => g.items).filter((i) => i.href === CREATOR_CUSTOMIZE_HREF || i.label === "내 팬꾹 꾸미기");
    expect(all).toHaveLength(1);
  });
});
