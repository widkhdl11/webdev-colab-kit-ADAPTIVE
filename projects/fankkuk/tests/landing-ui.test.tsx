// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LandingPage } from "@/widgets/home/ui/landing-page";

// 로그인 전 첫 화면 — 시안 4(design-rules 34절, 2026-11-01 사용자 「메인도 시안 4로 가자」). 실제로 그려 DOM 으로 본다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const prices = { small: { priceKrw: 5900, revgiftPriceKrw: 5400, returnShippingKrw: 4000 }, medium: { priceKrw: 7900, revgiftPriceKrw: 6900, returnShippingKrw: 5000 }, large: { priceKrw: 9900, revgiftPriceKrw: 7400, returnShippingKrw: 6500 } };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<LandingPage prices={prices} newest={[]} looks={{}} notices={[]} banner={<div data-banner="">배너</div>} />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("로그인 전 첫 화면(시안 4)", () => {
  it("첫 화면의 행동은 검색 하나 — 같은 일을 하는 「선물 보내기」「크리에이터 찾기」 버튼이 없다", () => {
    const hero = host.querySelector('[aria-labelledby="hero-title"]')!;
    expect(hero.querySelectorAll('form[role="search"]')).toHaveLength(1);
    expect(hero.querySelectorAll("a")).toHaveLength(0);
    const go = hero.querySelector('form[role="search"] button[type="submit"]')!;
    expect(go.textContent).toBe("검색");
  });

  it("검색은 첫 화면과 페이지 끝 두 곳 — 둘 다 크리에이터 찾기로 q 를 보내고 입력칸 id 가 다르다", () => {
    const forms = [...host.querySelectorAll<HTMLFormElement>('form[role="search"]')];
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      expect(form.getAttribute("action")).toBe("/creators");
      const input = form.querySelector("input")!;
      expect(input.name).toBe("q");
      expect(form.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    }
    expect(new Set(forms.map((f) => f.querySelector("input")!.id)).size).toBe(2);
    const end = host.querySelector('[aria-labelledby="end-title"]')!;
    expect(end.contains(forms[1]!)).toBe(true);
    expect(host.querySelector("main")!.lastElementChild).toBe(end);
  });

  it("소개는 네 단계 흐름 — 번호 01~04 는 낭독기에서 빠지고 순서는 목록이 전한다", () => {
    const how = host.querySelector("#how")!;
    const steps = how.querySelector("ol")!.children; // 첫 목록 = 네 단계(둘째 목록은 진행 단계 칩)
    expect(steps).toHaveLength(4);
    expect([...steps].map((li) => li.querySelector("h3")!.textContent)).toEqual(["선물 등록·결제", "크리에이터 승인", "팬꾹 검수", "크리에이터에게 배송"]);
    const nums = [...steps].map((li) => li.querySelector("h3")!.previousElementSibling!);
    expect(nums.map((n) => n.textContent)).toEqual(["01", "02", "03", "04"]);
    expect(nums.every((n) => n.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(how.querySelectorAll('[aria-labelledby="stages-label"] > li')).toHaveLength(6);
  });

  it("칸 순서: 첫 화면 → 바로가기 → 배너 → 소개 → 요금 → 공지 → 끝 검색", () => {
    const order = ['[aria-labelledby="hero-title"]', 'ul[aria-label="바로가기"]', "[data-banner]", "#how", "#price", '[aria-labelledby="notice-title"]', '[aria-labelledby="end-title"]'].map((sel) => host.querySelector(sel)!);
    order.forEach((el) => expect(el).not.toBeNull());
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelectorAll("h1")).toHaveLength(1);
  });
});
