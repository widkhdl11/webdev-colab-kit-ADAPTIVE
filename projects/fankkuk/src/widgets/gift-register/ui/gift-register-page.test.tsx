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
