import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 선물 등록 결제창의 돌아올 주소(d113 D-3). 결제 SDK 는 가짜로 두고 결제 요청에 넘긴 주소만 본다 — 금액·승인은 이 시험의 대상이 아니다(INV-M2 는 서버가 지킨다).
const requestPayment = vi.fn();
vi.mock("@tosspayments/tosspayments-sdk", () => ({
  ANONYMOUS: "ANONYMOUS",
  loadTossPayments: async () => ({
    widgets: () => ({
      setAmount: async () => {},
      renderPaymentMethods: async () => ({ destroy: async () => {} }),
      renderAgreement: async () => ({ destroy: async () => {} }),
      requestPayment: (...a: unknown[]) => requestPayment(...a),
    }),
  }),
}));

import { PaymentStep } from "./payment-step";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  requestPayment.mockReset();
  requestPayment.mockResolvedValue(undefined);
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function payWith(route?: { orderName: string; successPath: string; failPath: string }) {
  await act(async () => root.render(<PaymentStep clientKey="test_ck" pending={{ orderId: "pay_1", orderNo: "FC-U8P2K", amountKrw: 6900 }} route={route} />));
  for (let i = 0; i < 5; i += 1) await act(async () => await new Promise((r) => setTimeout(r, 0)));
  await act(async () => host.querySelector<HTMLButtonElement>("button")?.click());
  return requestPayment.mock.calls[0]?.[0] as { failUrl: string; successUrl: string; orderId: string };
}

describe("d113 D-3: 선물 등록 결제창이 실패하면 선물 보내기로 돌아오며 주문번호를 붙인다", () => {
  it("D-3: 기본 실패 주소 = /gifts/new?payment=failed&order={주문번호} — 성공 주소·결제번호는 그대로", async () => {
    const req = await payWith();
    expect(req.failUrl).toBe(`${window.location.origin}/gifts/new?payment=failed&order=FC-U8P2K`);
    expect(req.successUrl).toBe(`${window.location.origin}/api/checkout/success`);
    expect(req.orderId).toBe("pay_1");
  });

  it("D-3 (실패경로): 부르는 쪽이 주소를 넘기면(역조공·이어 하기·차액) 그 주소를 그대로 쓴다 — 주문번호를 덧붙이지 않는다", async () => {
    const req = await payWith({ orderName: "x", successPath: "/api/checkout/success", failPath: "/gifts/FC-U8P2K?payment=failed" });
    expect(req.failUrl).toBe(`${window.location.origin}/gifts/FC-U8P2K?payment=failed`);
  });
});
