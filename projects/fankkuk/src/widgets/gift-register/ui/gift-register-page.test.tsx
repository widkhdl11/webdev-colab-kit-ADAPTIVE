import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import type { CreatorOption } from "@/features/gift-register/ui/register-form";

// 선물 보내기 맨 위 한 줄(추가분 4-4) — 미리 고른 크리에이터의 채널만 말한다.
// 폼에서 다른 크리에이터를 고르면 줄을 숨긴다(다른 사람의 채널 정보는 이 화면이 읽지 않으니 그 사람 줄로 바꾸지 않는다).
// 서버로 가는 호출(사진 올리기)과 라우터만 가짜로 둔다 — 시험 대상은 폼과 위젯이 함께 그리는 DOM 이다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/features/gift-photo/api/send-gift-photo", () => ({ sendGiftPhoto: vi.fn() }));

import { GiftRegisterPage } from "./gift-register-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  // jsdom 에는 화면 이동이 없다 — 폼이 단계를 바꿀 때 부른다
  Element.prototype.scrollIntoView = () => {};
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const PRICES: PublicPriceTable = {
  small: { priceKrw: 9000, revgiftPriceKrw: 7000, returnShippingKrw: 4000 },
  medium: { priceKrw: 12000, revgiftPriceKrw: 10000, returnShippingKrw: 5000 },
  large: { priceKrw: 15000, revgiftPriceKrw: 13000, returnShippingKrw: 6500 },
};
const HARU: CreatorOption = { id: "11111111-1111-4111-8111-111111111111", name: "하루", platform: "유튜브", approvalMinutes: null };
const DAL: CreatorOption = { id: "22222222-2222-4222-8222-222222222222", name: "달", platform: "치지직", approvalMinutes: null };
const TODAY = { year: 2026, month: 10, day: 14 };
const LINE = "하루님의 유튜브 채널 주인이 확인된 페이지예요";

const render = (initialCreatorId: string) =>
  act(() =>
    root.render(<GiftRegisterPage creators={[HARU, DAL]} prices={PRICES} initialCreatorId={initialCreatorId} clientKey="" today={TODAY} />),
  );
const header = () => host.querySelector("header.page-head");
const radio = (id: string) => host.querySelector<HTMLInputElement>(`input[type="radio"][value="${id}"]`);

describe("GiftRegisterPage — 맨 위 「채널 주인이 확인된 페이지」 한 줄", () => {
  it("미리 고르고 오면 그 크리에이터의 줄이 머리말 안에 보인다", () => {
    render(HARU.id);
    expect(radio(HARU.id)?.checked).toBe(true);
    expect(header()?.textContent).toContain(LINE);
  });

  it("(실패경로) 폼에서 다른 크리에이터를 고르면 줄이 사라지고, 다시 미리 고른 사람을 고르면 돌아온다", () => {
    render(HARU.id);
    act(() => radio(DAL.id)?.click());
    expect(radio(DAL.id)?.checked).toBe(true);
    expect(header()?.textContent).not.toContain("채널 주인이 확인된 페이지예요");
    act(() => radio(HARU.id)?.click());
    expect(header()?.textContent).toContain(LINE);
  });

  it("(실패경로) 미리 고르지 않고 오면 줄이 없고, 폼에서 골라도 생기지 않는다", () => {
    render("");
    expect(header()?.textContent).not.toContain("채널 주인이 확인된 페이지예요");
    act(() => radio(HARU.id)?.click());
    expect(header()?.textContent).not.toContain("채널 주인이 확인된 페이지예요");
  });
});

const TOP_LINE = "팔로우한 크리에이터에게만 선물을 보낼 수 있어요.";
const FAILED = "결제를 마치지 못해 선물이 등록되지 않았어요. 다시 시도해 주세요.";

describe("d113 D-4: 머리 아래 「팔로우한 크리에이터에게만 …」 줄은 팔로우 0명·로그인 전에서만", () => {
  it("D-4: 고를 크리에이터가 있으면 머리 아래 줄이 없다(1단계 설명이 같은 말을 한다)", () => {
    render("");
    expect(header()?.textContent).not.toContain(TOP_LINE);
  });

  it("D-4 (실패경로): 팔로우 0명·로그인 전이면 머리 아래 줄이 있다", () => {
    act(() => root.render(<GiftRegisterPage creators={[]} prices={PRICES} clientKey="" today={TODAY} />));
    expect(header()?.textContent).toContain(TOP_LINE);
    act(() => root.render(<GiftRegisterPage creators={[]} prices={PRICES} clientKey="" today={TODAY} signedIn={false} />));
    expect(header()?.textContent).toContain(TOP_LINE);
  });
});

describe("d113 D-3: 결제 실패로 돌아온 화면 — 오류 줄 아래 「결제하기 ›」", () => {
  const renderFailed = (resumeHref: string | null) =>
    act(() =>
      root.render(<GiftRegisterPage creators={[HARU, DAL]} prices={PRICES} clientKey="" today={TODAY} notice={FAILED} resumeHref={resumeHref} />),
    );

  it("D-3: 이어서 결제할 주문이 있으면 오류 줄 바로 아래에 그 선물 상세 칸으로 가는 링크 — 오류 줄은 1단계 위에 있다", () => {
    renderFailed("/gifts/FC-U8P2K#todo");
    const alert = [...host.querySelectorAll('[role="alert"]')].find((el) => el.textContent?.includes(FAILED));
    expect(alert).toBeDefined();
    const link = [...host.querySelectorAll("a")].find((a) => a.textContent === "결제하기 ›");
    expect(link?.getAttribute("href")).toBe("/gifts/FC-U8P2K#todo");
    expect(alert?.nextElementSibling?.contains(link!)).toBe(true);
    // 오류 줄은 크리에이터 검색 칸보다 앞
    expect(alert?.compareDocumentPosition(host.querySelector("#pick-q")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("D-3 (실패경로): 라우트가 주소를 넘기지 않으면(남의 주문·결제가 끝난 주문) 오류 줄만 있고 링크는 없다", () => {
    renderFailed(null);
    expect([...host.querySelectorAll('[role="alert"]')].some((el) => el.textContent?.includes(FAILED))).toBe(true);
    expect([...host.querySelectorAll("a")].some((a) => a.textContent === "결제하기 ›")).toBe(false);
  });
});

// design-rules 33절 · UX 명세 gifts-new: PC 오른쪽 「보낼 선물」 칸(1~4단계), 휴대폰 3단계 아래 합계 줄, 4단계 금액 줄은 넓은 화면에서 칸에만.
// 넓은/좁은 화면 나눔은 CSS(1000 기준)라 여기서는 DOM 구조(어느 칸이 있고 무엇이 표시돼 숨는지)를 보고, 실제 보임은 브라우저에서 본다.
describe("33절: 「보낼 선물」 합계 칸", () => {
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await act(async () => await new Promise((r) => setTimeout(r, 0)));
  };
  const click = async (el: Element | null | undefined) => {
    if (!el) throw new Error("누를 요소가 없다");
    await act(async () => (el as HTMLElement).click());
    await settle();
  };
  const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  const aside = () => host.querySelector<HTMLElement>("aside[data-gift-summary]");
  const kv = (label: string) =>
    [...(aside()?.querySelectorAll("dt") ?? [])].find((dt) => dt.textContent === label)?.nextElementSibling?.textContent;
  const lineTiers = () => [...(aside()?.querySelectorAll("li[data-tier]") ?? [])].map((li) => li.getAttribute("data-tier"));
  const line = (tier: string) => aside()?.querySelector(`li[data-tier="${tier}"]`);
  const asideTotal = () => aside()?.querySelector("[data-gift-total] b")?.textContent;
  const sumbar = () => host.querySelector<HTMLElement>("[data-gift-sumbar]");
  const qty = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  const toStep3 = async () => {
    await act(async () =>
      root.render(<GiftRegisterPage creators={[HARU, DAL]} prices={PRICES} initialCreatorId={HARU.id} clientKey="" today={TODAY} />),
    );
    await settle();
    await click(button("다음"));
    await click(host.querySelector('input[type="radio"][value="doll"]'));
    await click(host.querySelector('input[type="radio"][value="no"]'));
    await click(button("다음"));
  };

  it("1단계: 이름 있는 영역 「보낼 선물」 — 받는 크리에이터만 채워지고, 상자 줄 없이 합계 0원(기본 1개는 고른 값이 아니다)", async () => {
    await act(async () =>
      root.render(<GiftRegisterPage creators={[HARU, DAL]} prices={PRICES} initialCreatorId={HARU.id} clientKey="" today={TODAY} />),
    );
    await settle();
    const a = aside();
    expect(a).not.toBeNull();
    const heading = host.querySelector(`#${a?.getAttribute("aria-labelledby")}`);
    expect(heading?.tagName).toBe("H2");
    expect(heading?.textContent).toBe("보낼 선물");
    expect(a?.contains(heading!)).toBe(true);
    expect(kv("받는 크리에이터")).toBe("하루님");
    expect(kv("선물 종류")).toBe("—");
    expect(lineTiers()).toEqual([]);
    expect(asideTotal()).toBe("0원");
    // 합계 한 줄에만 aria-live
    expect(a?.querySelectorAll("[aria-live]").length).toBe(1);
    expect(a?.querySelector("[aria-live]")?.hasAttribute("data-gift-total")).toBe(true);
    // 1단계에는 휴대폰 아래 합계 줄이 없다
    expect(sumbar()).toBeNull();
  });

  it("3단계: 상자 수를 바꾸면 크기별 줄·합계·아래 합계 줄이 바로 바뀌고, 0개인 크기는 줄이 없다", async () => {
    await toStep3();
    expect(kv("선물 종류")).toBe("인형·쿠션");
    expect(lineTiers()).toEqual(["small"]);
    expect(asideTotal()).toBe("9,000원");

    await click(qty("중형 상자 하나 늘리기"));
    await click(qty("중형 상자 하나 늘리기"));
    expect(lineTiers()).toEqual(["small", "medium"]);
    expect(line("medium")?.querySelector("small")?.textContent).toBe("12,000원 × 2");
    expect(line("medium")?.lastElementChild?.textContent).toBe("24,000원");
    expect(asideTotal()).toBe("33,000원");

    // (실패경로) 소형을 0개로 줄이면 소형 줄이 사라진다
    await click(qty("소형 상자 하나 줄이기"));
    expect(lineTiers()).toEqual(["medium"]);
    expect(asideTotal()).toBe("24,000원");

    // 휴대폰 아래 합계 줄 — 입력 기둥(폼과 같은 칸) 맨 끝, 버튼 없음
    const bar = sumbar();
    expect(bar).not.toBeNull();
    expect(bar?.previousElementSibling?.querySelector("form")).not.toBeNull();
    expect(bar?.parentElement?.nextElementSibling).toBe(aside());
    expect(bar?.querySelector("b")?.textContent).toBe("상자 2개");
    expect(bar?.querySelector("span")?.textContent).toBe("중형 2");
    expect(bar?.querySelector("[aria-live]")?.textContent).toBe("24,000원");
    expect(bar?.querySelector("button")).toBeNull();
  });

  it("4단계: 결제 칸의 금액 줄은 「넓은 화면에서 숨김」 표시를 달고, 표시 없이 보이는 합계는 오른쪽 칸 하나뿐 · 아래 합계 줄 없음", async () => {
    await toStep3();
    await click(qty("중형 상자 하나 늘리기"));
    await click(button("다음"));
    expect(sumbar()).toBeNull();
    const pay = host.querySelector('[aria-label="결제 금액"]');
    const covered = pay?.querySelector("[data-side-covered]");
    expect(covered).not.toBeNull();
    // 결제 칸의 합계 줄은 그 표시 안에 있다
    const payTotal = [...(pay?.querySelectorAll("span") ?? [])].find((el) => el.textContent === "합계");
    expect(covered?.contains(payTotal!)).toBe(true);
    // 표시 밖에 있는 「합계」 글자는 오른쪽 칸의 것 하나
    const uncovered = [...host.querySelectorAll("span")].filter((el) => el.textContent === "합계" && !el.closest("[data-side-covered]"));
    expect(uncovered.length).toBe(1);
    expect(aside()?.contains(uncovered[0]!)).toBe(true);
    expect(asideTotal()).toBe("21,000원");
    expect(button("21,000원 결제하기")).toBeDefined();
  });

  it("(실패경로) 고를 사람이 없으면(상태 카드) 「보낼 선물」 칸이 없다", () => {
    act(() => root.render(<GiftRegisterPage creators={[]} prices={PRICES} clientKey="" today={TODAY} />));
    expect(aside()).toBeNull();
    expect(host.querySelector("[data-side-covered]")).toBeNull();
  });
});
