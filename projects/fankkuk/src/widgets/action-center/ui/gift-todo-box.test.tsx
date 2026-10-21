import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionItem } from "@/entities/action-item/model/action-items";

// 선물 상세 「지금 할 일」 칸의 반송 주소 확인 줄(action-center INV-J1·J4·J13, office-workflow INV-W15). 서버로 가는 호출은 가짜로 둔다.
// 시험 대상은 줄의 글(용어집 return_address·dispose_due 행)과, 버튼이 기존 확인 처리 창을 그 상자로 여는지다.
const sendReturnConfirm = vi.fn();
const refresh = vi.fn();
vi.mock("@/features/return-address/api/send-return-confirm", () => ({ sendReturnConfirm: (...a: unknown[]) => sendReturnConfirm(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));
// 차액 결제 — 결제 준비는 가짜로, 결제창은 받은 값만 기록한다(결제 SDK 를 띄우지 않는다)
const prepare = vi.fn();
vi.mock("@/features/difference-pay/api/post-difference-client", () => ({ postDifferencePrepare: (...a: unknown[]) => prepare(...a) }));
const paymentStep = vi.fn();
vi.mock("@/features/checkout/ui/payment-step", () => ({
  PaymentStep: (p: unknown) => {
    paymentStep(p);
    return <div data-payment-step="" />;
  },
}));

import { GiftTodoBox } from "./gift-todo-box";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  // 브라우저처럼 열려 있던 창을 닫으면 close 이벤트를 낸다(BottomSheet 는 onClose 를 이 이벤트로만 부른다)
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  sendReturnConfirm.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const RETURN: ActionItem = {
  kind: "return_address",
  orderNo: "FC-7K3M9",
  boxId: "11111111-1111-4111-8111-111111111111",
  boxLabel: "FC-7K3M9-2",
  boxSeq: 2,
  creatorName: "하루",
  declaredTier: "small",
  dueAt: "2026-11-15T15:30:00.000Z",
};

function render(items: ActionItem[]) {
  act(() =>
    root.render(
      <GiftTodoBox
        items={items}
        clientKey=""
        now="2026-10-17T03:00:00.000Z"
        address={{ accountId: "a1", status: { registered: true, label: "home", updatedAt: "2026-10-03T05:00:00Z" }, sealingKeyPem: null }}
      />,
    ),
  );
}

describe("INV-J1·J13·W15: 상세 「지금 할 일」 칸 — 반송 주소 확인", () => {
  it("INV-J1·J13: 칸 머리 「지금 할 일」, 제목 「돌려받을 주소 확인」, 몇 번째 상자인지, 처분 예정 날짜 문장", () => {
    render([RETURN]);
    expect(host.querySelector("#todo")?.textContent).toContain("지금 할 일");
    const card = host.querySelector('#todo [data-kind="return_address"]');
    expect(card?.querySelector("h2")?.textContent).toBe("돌려받을 주소 확인");
    expect(card?.textContent).toContain("상자 2");
    expect(card?.textContent).toContain("11월 16일까지 확인하지 않으면 상자를 처분해요");
  });

  it("INV-J13 (실패경로): 이 주문의 줄이 없으면 칸을 그리지 않는다", () => {
    render([]);
    expect(host.querySelector("#todo")).toBeNull();
  });

  it("INV-J4: 버튼은 그 상자의 확인 창을 열고, 창의 「확인」은 주문번호·상자 순번만 보낸다", async () => {
    sendReturnConfirm.mockResolvedValue({ kind: "ok" });
    render([RETURN]);
    const open = host.querySelector<HTMLButtonElement>('[data-kind="return_address"] button');
    await act(async () => open?.click());
    const ok = [...document.querySelectorAll("dialog button")].find((b) => b.textContent === "확인") as HTMLButtonElement | undefined;
    expect(ok).toBeDefined();
    await act(async () => ok?.click());
    expect(sendReturnConfirm).toHaveBeenCalledWith({ orderNo: "FC-7K3M9", boxSeq: 2 });
  });
});

describe("INV-J13·M11: 칸의 차액 결제가 결제창까지 이어진다(아래 구간에는 결제 버튼이 없다)", () => {
  it("INV-J13: 칸의 결제 버튼 → 기존 결제 준비 → 같은 결제창(돌아오는 주소는 차액 승인 경로와 그 선물 상세)", async () => {
    prepare.mockResolvedValue({ ok: true, checkout: { orderId: "diff_1", orderNo: "FC-7K3M9", amountKrw: 3000 } });
    act(() =>
      root.render(
        <GiftTodoBox
          items={[{ kind: "difference", orderNo: "FC-7K3M9", boxId: RETURN.boxId, boxLabel: "FC-7K3M9-2", boxSeq: 2, creatorName: "하루", declaredTier: "small", measuredTier: "medium", amountKrw: 3000, dueAt: null }]}
          clientKey="test_ck"
          now="2026-10-17T03:00:00.000Z"
          address={{ accountId: "a1", status: null, sealingKeyPem: null }}
        />,
      ),
    );
    await act(async () => host.querySelector<HTMLButtonElement>('#todo [data-kind="difference"] button')?.click());
    expect(prepare).toHaveBeenCalledWith({ boxId: RETURN.boxId });
    expect(host.querySelector("#todo [data-payment-step]")).not.toBeNull();
    expect(paymentStep).toHaveBeenCalledWith(
      expect.objectContaining({
        clientKey: "test_ck",
        pending: { orderId: "diff_1", orderNo: "FC-7K3M9", amountKrw: 3000 },
        route: { orderName: "팬꾹 차액 FC-7K3M9", successPath: "/api/checkout/difference/success", failPath: "/gifts/FC-7K3M9?difference=failed" },
      }),
    );
  });
});
