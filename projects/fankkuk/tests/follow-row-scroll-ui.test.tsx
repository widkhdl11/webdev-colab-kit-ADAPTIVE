import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { CreatorCardsSlot } from "@/widgets/home/ui/front-slots";
import { HomePage } from "@/widgets/home/ui/home-page";

// 팬 홈 ④-2 팔로우한 크리에이터 — 한 줄에 열둘까지 두고 양옆 화살표로 넘긴다(2026-10-19 사용자 「양 옆으로 화살표로 누를 수 있게」).
// 로그인 전 ④ 새로 들어온 크리에이터는 카드 셋 그대로. 화살표는 넘길 곳이 있는 쪽만 보인다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom 에는 크기 관찰기가 없다 — 줄 폭은 시험이 직접 정하고 scroll 이벤트로 다시 재게 한다
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const creator = (i: number): CreatorCard => ({
  id: `00000000-0000-4000-b000-0000000000${String(i).padStart(2, "0")}`,
  name: `크리${i}`,
  platform: "치지직",
  tags: [],
  channelTitle: "채널",
  intro: "소개",
  alias: "",
  approvalMinutes: 60,
  faceTone: "var(--face-1)",
  following: true,
  handle: `c${i}`,
  photoPath: null,
});
const many = Array.from({ length: 14 }, (_, i) => creator(i + 1));
const prices = { small: { priceKrw: 6900, revgiftPriceKrw: 5400, returnShippingKrw: 4000 }, medium: { priceKrw: 8900, revgiftPriceKrw: 6900, returnShippingKrw: 5000 }, large: { priceKrw: 10900, revgiftPriceKrw: 8400, returnShippingKrw: 6500 } };

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const renderHome = (following: readonly CreatorCard[]) =>
  act(() =>
    root.render(
      <HomePage nickname="별빛" gifts={[]} following={following} looks={{}} faceToneByName={{}} notices={[]} prices={prices} actionCount={0} receivedCount={0} />,
    ),
  );
const arrow = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

/** 줄의 폭·내용 폭·스크롤 위치를 정하고 scroll 이벤트를 보낸다 */
function scrollRow(row: HTMLElement, { client, total, left }: { client: number; total: number; left: number }) {
  Object.defineProperty(row, "clientWidth", { configurable: true, value: client });
  Object.defineProperty(row, "scrollWidth", { configurable: true, value: total });
  Object.defineProperty(row, "scrollLeft", { configurable: true, value: left, writable: true });
  act(() => {
    row.dispatchEvent(new Event("scroll"));
  });
}

describe("팔로우한 크리에이터 넘기는 줄", () => {
  it("팔로우가 열넷이면 줄에는 앞의 열둘, 「모두 보기」는 그대로", () => {
    renderHome(many);
    const row = host.querySelector("#follow-row")!;
    expect(row.children).toHaveLength(12);
    expect(row.children[0]!.textContent).toContain("크리1");
    expect(row.children[11]!.textContent).toContain("크리12");
    expect(host.querySelector('a[href="/me/following"]')).not.toBeNull();
    expect(arrow("이전 크리에이터").getAttribute("aria-controls")).toBe("follow-row");
    expect(arrow("다음 크리에이터").getAttribute("aria-controls")).toBe("follow-row");
  });

  it("화살표는 넘길 곳이 있는 쪽만 보인다 — 처음 · 가운데 · 끝", () => {
    renderHome(many);
    const row = host.querySelector<HTMLElement>("#follow-row")!;
    scrollRow(row, { client: 600, total: 2400, left: 0 });
    expect([arrow("이전 크리에이터").hidden, arrow("다음 크리에이터").hidden]).toEqual([true, false]);
    scrollRow(row, { client: 600, total: 2400, left: 900 });
    expect([arrow("이전 크리에이터").hidden, arrow("다음 크리에이터").hidden]).toEqual([false, false]);
    scrollRow(row, { client: 600, total: 2400, left: 1800 });
    expect([arrow("이전 크리에이터").hidden, arrow("다음 크리에이터").hidden]).toEqual([false, true]);
  });

  it("카드가 한 화면에 다 들어가면 화살표 둘 다 숨는다", () => {
    renderHome(many.slice(0, 2));
    const row = host.querySelector<HTMLElement>("#follow-row")!;
    scrollRow(row, { client: 600, total: 600, left: 0 });
    expect([arrow("이전 크리에이터").hidden, arrow("다음 크리에이터").hidden]).toEqual([true, true]);
  });

  it("다음 화살표는 보이는 폭만큼 오른쪽으로 옮긴다", () => {
    renderHome(many);
    const row = host.querySelector<HTMLElement>("#follow-row")!;
    scrollRow(row, { client: 600, total: 2400, left: 0 });
    const scrollBy = vi.fn();
    row.scrollBy = scrollBy as unknown as typeof row.scrollBy;
    act(() => arrow("다음 크리에이터").click());
    expect(scrollBy).toHaveBeenCalledWith({ left: 600, behavior: "smooth" });
  });

  it("이전 화살표는 보이는 폭만큼 왼쪽으로 옮긴다", () => {
    renderHome(many);
    const row = host.querySelector<HTMLElement>("#follow-row")!;
    scrollRow(row, { client: 600, total: 2400, left: 900 });
    const scrollBy = vi.fn();
    row.scrollBy = scrollBy as unknown as typeof row.scrollBy;
    act(() => arrow("이전 크리에이터").click());
    expect(scrollBy).toHaveBeenCalledWith({ left: -600, behavior: "smooth" });
  });

  it("누른 화살표가 끝에 닿아 숨으면 초점이 반대쪽 화살표로 간다 — 끝 · 처음", () => {
    renderHome(many);
    const row = host.querySelector<HTMLElement>("#follow-row")!;
    scrollRow(row, { client: 600, total: 2400, left: 900 });
    act(() => arrow("다음 크리에이터").focus());
    scrollRow(row, { client: 600, total: 2400, left: 1800 });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("이전 크리에이터");
    scrollRow(row, { client: 600, total: 2400, left: 0 });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("다음 크리에이터");
  });

  it("카드가 빠져 한 화면에 다 들어가면(팔로우 취소) 스크롤이 없어도 다음 화살표가 숨는다", () => {
    renderHome(many);
    const row = host.querySelector<HTMLElement>("#follow-row")!;
    scrollRow(row, { client: 600, total: 2400, left: 0 });
    expect(arrow("다음 크리에이터").hidden).toBe(false);
    Object.defineProperty(row, "scrollWidth", { configurable: true, value: 600 });
    renderHome(many.slice(0, 2));
    expect(host.querySelector("#follow-row")).toBe(row);
    expect(arrow("다음 크리에이터").hidden).toBe(true);
  });

  it("넘기지 않는 줄(로그인 전 ④)은 카드 셋, 화살표 없음", () => {
    act(() => root.render(<CreatorCardsSlot id="newest" title="새로 들어온 크리에이터" creators={many} looks={{}} />));
    expect(host.querySelector('ul[aria-label="새로 들어온 크리에이터"]')!.children).toHaveLength(3);
    expect(host.querySelector("button[aria-controls]")).toBeNull();
  });
});
