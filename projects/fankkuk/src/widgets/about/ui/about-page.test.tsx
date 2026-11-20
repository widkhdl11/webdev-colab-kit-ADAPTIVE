import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AboutPage } from "./about-page";

// 팬꾹 소개 배치(design-rules 36절 · 시안 about-20261114, 2026-11-20 사용자 「시안대로 수정」).

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

const SECTION_ORDER = ["receive", "privacy", "send", "channel", "memories"];

describe("AboutPage", () => {
  it("구역 순서는 승인 → 주소 보호 → 팬에게 보내기 → 페이지 꾸미기 → 선물 기록이다", () => {
    const ids = [...host.querySelectorAll("main > section[id]")].map((el) => el.id);
    expect(ids).toEqual(SECTION_ORDER);
  });

  it("구역 바로가기 다섯 개가 같은 순서로 각 구역 id 를 가리키고, 첫 화면 바로 다음에 있다", () => {
    const nav = host.querySelector('nav[aria-label="소개 내용 바로가기"]');
    expect(nav).toBeTruthy();
    expect(nav?.previousElementSibling?.querySelector("h1")).toBeTruthy();
    const hrefs = [...(nav?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(SECTION_ORDER.map((id) => `#${id}`));
    for (const href of hrefs) expect(host.querySelector(href ?? "")).toBeTruthy();
  });

  it("팬에게 보내기 안에 신청 과정 3단계와 배송 과정 3단계가 순서 목록으로 있다", () => {
    const send = host.querySelector("section#send");
    const request = send?.querySelector('ol[aria-label="선물함 신청 과정"]');
    const delivery = send?.querySelector('ol[aria-label="크리에이터에서 팬꾹을 거쳐 각 팬에게 배송하는 과정"]');
    expect([...(request?.querySelectorAll(":scope > li > strong") ?? [])].map((el) => el.textContent)).toEqual([
      "선물함 만들기",
      "팬들이 신청",
      "현황 확인 · 마감",
    ]);
    const steps = [...(delivery?.querySelectorAll(":scope > li") ?? [])];
    expect(steps.map((li) => li.querySelector("strong")?.textContent)).toEqual([
      "한 상자로 모아 보내요",
      "큰 상자가 팬꾹에 도착해요",
      "꺼낸 선물을 각각 배송해요",
    ]);
    // 단계마다 그림 하나와 설명(2-13)
    for (const li of steps) {
      expect(li.querySelectorAll("img")).toHaveLength(1);
      expect(li.querySelector("img")?.getAttribute("alt")).toBeTruthy();
      expect(li.querySelector("p")?.textContent).toBeTruthy();
    }
  });

  it("첫 화면 그림은 하나이고 대체 글이 있다", () => {
    const hero = host.querySelector("main > section:first-child");
    expect(hero?.querySelector("h1")?.textContent).toBe("팬꾹의 소개");
    const imgs = hero?.querySelectorAll("img") ?? [];
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.getAttribute("alt")).toBe("선물을 안고 있는 팬꾹 고양이");
  });

  it("화면 예시 안의 받지 않기·선물 받기는 버튼이 아닌 장식이다", () => {
    const actions = [...host.querySelectorAll("section#receive [aria-hidden='true']")].find((el) =>
      el.textContent?.includes("선물 받기"),
    );
    expect(actions).toBeTruthy();
    expect(host.querySelector("section#receive button")).toBeNull();
  });
});
