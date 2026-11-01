import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROMISE } from "@/shared/config/site-copy";
import { AboutPage } from "./about-page";

// 팬꾹 소개 배치(design-rules 36절 · 시안 about-20261101 + 03~06 「안 A」 about-features-alts-20261101).

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<AboutPage />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const sectionOf = (titleId: string) => host.querySelector(`section[aria-labelledby="${titleId}"]`);

describe("AboutPage", () => {
  it("「팬꾹이 지키는 기준」은 카드가 아니라 줄 목록(ul/li 여섯 줄, 줄마다 방패 표시)으로 그린다", () => {
    const sec = sectionOf("not-title");
    const items = sec?.querySelectorAll("ul > li") ?? [];
    expect(items).toHaveLength(6);
    for (const li of items) {
      // 방패 아이콘(about-icons 의 shield)인지 경로로 확인한다. 다른 아이콘이 들어가면 실패한다
      const paths = [...li.querySelectorAll("[aria-hidden='true'] svg path")].map((el) => el.getAttribute("d"));
      expect(paths).toEqual(["M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6Z", "m9 12 2 2 4-4"]);
      expect(li.querySelector("h3")?.textContent).toBeTruthy();
    }
    expect(sec?.querySelector("ul.card, ul .card")).toBeNull();
    expect(items[0]?.querySelector("p")?.textContent).toBe(`승인 후에도 ${PROMISE.addressFan}`);
  });

  it("검수는 03 카드 안 네 칸 목록이고 넷째 칸이 개봉 검수(약속 상수 문장), 설명은 약속 상수 그대로다", () => {
    const sec = sectionOf("inspect-title");
    const items = sec?.querySelectorAll("ol > li") ?? [];
    expect(items).toHaveLength(4);
    expect(items[3]?.querySelector("p")?.textContent).toBe(PROMISE.inspectionOpen);
    expect(sec?.querySelector("h2 + p")?.textContent).toBe(PROMISE.inspection);
  });

  it("기능 03~06 은 한 격자 안의 카드 넷이고 순서가 03→06 이다(번호는 낭독기 제외)", () => {
    const ids = ["inspect-title", "manage-title", "memory-title", "profile-title"];
    const cards = ids.map((id) => sectionOf(id));
    const grid = cards[0]?.parentElement;
    expect(grid).toBeTruthy();
    expect([...(grid?.children ?? [])]).toEqual(cards);
    cards.forEach((card, i) => {
      expect(card?.classList.contains("card")).toBe(true);
      const num = card?.querySelector(":scope > [aria-hidden='true']");
      expect(num?.textContent).toBe(`0${i + 3}`);
    });
  });

  it("테마 색 견본은 하나만 눌린 상태이고, 누르면 그 견본만 눌리고 이름 글자가 바뀐다", () => {
    const swatches = [...(sectionOf("profile-title")?.querySelectorAll<HTMLButtonElement>("button[aria-pressed]") ?? [])];
    expect(swatches).toHaveLength(4);
    expect(swatches.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false"]);
    act(() => swatches[2]?.click());
    expect(swatches.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "true", "false"]);
    expect(sectionOf("profile-title")?.querySelector("output")?.textContent).toBe(swatches[2]?.getAttribute("aria-label"));
  });

  it("첫 화면 그림은 하나(장식)이고 마무리 쪽에는 그림이 없다", () => {
    expect(sectionOf("cta-title")?.querySelector("img")).toBeNull();
    const imgs = sectionOf("about-title")?.querySelectorAll("img") ?? [];
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.getAttribute("alt")).toBe("");
  });
});
