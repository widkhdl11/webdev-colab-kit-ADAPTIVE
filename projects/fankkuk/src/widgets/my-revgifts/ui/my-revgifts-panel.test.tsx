import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { giftDetailHref } from "@/entities/action-item/model/action-items";
import type { ReceivedRevgift } from "@/entities/revgift/model/revgift-rows";
import { daysLeft } from "@/entities/revgift/model/received-stage";

// 받은 선물 ④ 작은 타일(2026-11-18 사용자 선택) — 타일마다 상태가 먼저, 받을지 정하는 타일만 남은 날·「확인하기」, 그 타일이 맨 앞.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { MyRevgiftsPanel } from "./my-revgifts-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.parse("2026-11-18T03:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const base = { tier: "small" as const, shipped: false, returned: false, disposed: false, cancelled: false };
const ITEMS: ReceivedRevgift[] = [
  { ...base, orderNo: "FC-SHIP1", creatorName: "윤슬", reply: "accepted", deadline: new Date(NOW - DAY).toISOString(), shipped: true },
  { ...base, orderNo: "FC-WAIT1", creatorName: "달빛정원", reply: "waiting", deadline: new Date(NOW + 2.5 * DAY).toISOString() },
  { ...base, orderNo: "FC-DECL1", creatorName: "모카", reply: "declined", deadline: new Date(NOW - DAY).toISOString() },
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MyRevgiftsPanel items={ITEMS} nowMs={NOW} />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const tiles = (panel: string) => [...host.querySelectorAll(`#rv-panel-${panel} li[data-revgift-row]`)] as HTMLLIElement[];

describe("받은 선물 — 작은 타일", () => {
  it("받는 중: 받을지 정하는 타일이 맨 앞, 첫 칸이 상태 뱃지이고 그다음 남은 날", () => {
    const [first, second] = tiles("ongoing");
    expect(first.hasAttribute("data-waiting")).toBe(true);
    expect(first.firstElementChild?.textContent).toBe("수락 대기");
    expect(first.firstElementChild?.nextElementSibling?.textContent).toContain(`${daysLeft(ITEMS[1].deadline, NOW)}일남음`);
    expect(second.hasAttribute("data-waiting")).toBe(false);
    expect(second.firstElementChild?.textContent).toBe("출고 완료");
  });

  it("받을지 정하는 타일만 「확인하기」 → 그 선물 상세의 할 일 칸, 나머지 타일은 상세 링크(주문번호는 링크 이름에)", () => {
    const [wait, shipped] = tiles("ongoing");
    const go = [...wait.querySelectorAll("a")].find((a) => a.textContent === "확인하기");
    expect(go?.getAttribute("href")).toBe(giftDetailHref("FC-WAIT1", true));
    expect(go?.getAttribute("aria-label")).toContain("주문번호 FC-WAIT1");
    // 화면에서 뺀 기한 날짜는 낭독기 글자로 남는다(명세 me-revgifts 「바뀌는 것」)
    expect(wait.querySelector(".sr-only")?.textContent).toContain("까지");
    expect([...shipped.querySelectorAll("a")].some((a) => a.textContent === "확인하기")).toBe(false);
    const link = shipped.querySelector("a.stretch");
    expect(link?.getAttribute("href")).toBe(giftDetailHref("FC-SHIP1"));
    expect(link?.getAttribute("aria-label")).toContain("주문번호 FC-SHIP1");
  });

  it("완료 탭: 거절한 선물은 「받지 않음」 타일, 남은 날 없음", () => {
    const [declined] = tiles("past");
    expect(declined.firstElementChild?.textContent).toBe("받지 않음");
    expect(declined.textContent).not.toContain("남음");
  });

  it("한쪽 탭이 비면 그 탭의 빈 문구(tab_empty)", () => {
    act(() => root.render(<MyRevgiftsPanel items={[ITEMS[2]]} nowMs={NOW} />));
    expect(tiles("ongoing")).toHaveLength(0);
    expect(host.querySelector("#rv-panel-ongoing")?.textContent).toBe("받는 중인 선물이 없습니다.");
    expect(tiles("past")).toHaveLength(1);
  });

  it("받은 선물이 없으면 탭 없이 빈 상태 판(empty)", () => {
    act(() => root.render(<MyRevgiftsPanel items={[]} nowMs={NOW} />));
    expect(host.querySelector("[role=tablist]")).toBeNull();
    expect(host.querySelector("#rv-empty")?.textContent).toBe("받은 선물이 없습니다");
    // 다음 행동 하나(design-prompt 9-2)
    expect(host.querySelector('a[href="/creators"]')?.textContent).toBe("크리에이터 찾기");
  });
});
