import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROMISE } from "@/shared/config/site-copy";
import { AboutPage } from "./about-page";

// 팬꾹 소개 배치(design-rules 28절 「팬꾹 소개」 · 시안 part7-2026-10-22/about.html).

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
  it("「팬꾹이 하지 않는 것」은 카드가 아니라 줄 목록(ul/li 여섯 줄, 줄마다 × 표시)으로 그린다", () => {
    const sec = sectionOf("not-title");
    const items = sec?.querySelectorAll("ul > li") ?? [];
    expect(items).toHaveLength(6);
    for (const li of items) {
      expect(li.querySelector("[aria-hidden='true'] svg")).not.toBeNull();
      expect(li.querySelector("h3")?.textContent).toBeTruthy();
    }
    expect(sec?.querySelector(".card")).toBeNull();
    expect(items[0]?.querySelector("p")?.textContent).toBe(PROMISE.addressFan);
  });

  it("검수는 네 칸 한 줄 목록이고 넷째 칸이 개봉 검수(약속 상수 문장)다", () => {
    const items = sectionOf("inspect-title")?.querySelectorAll("ol > li") ?? [];
    expect(items).toHaveLength(4);
    expect(items[3]?.querySelector("p")?.textContent).toBe(PROMISE.inspectionOpen);
  });

  it("화면 어디에도 카드 격자가 없고, 마무리 쪽 장식 그림은 없다(첫 화면 장식 둘만)", () => {
    expect(host.querySelector(".card")).toBeNull();
    expect(sectionOf("cta-title")?.querySelector("img")).toBeNull();
    expect(sectionOf("about-title")?.querySelectorAll("img")).toHaveLength(2);
  });
});
