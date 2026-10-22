import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionItem } from "@/entities/action-item/model/action-items";

// 선물 상세 「지금 할 일」 칸의 반송 주소 확인 줄(action-center INV-J1·J4·J13, office-workflow INV-W15). 서버로 가는 호출은 가짜로 둔다.
// 시험 대상은 줄의 글(용어집 return_address·dispose_due 행)과, 버튼이 기존 확인 처리 창을 그 상자로 여는지다.
const sendReturnConfirm = vi.fn();
const refresh = vi.fn();
const replace = vi.fn();
// 결제창·확인 창에서 돌아온 주소의 쿼리(?payment=failed · ?address=confirmed) — 시험마다 바꾼다
let query = "";
vi.mock("@/features/return-address/api/send-return-confirm", () => ({ sendReturnConfirm: (...a: unknown[]) => sendReturnConfirm(...a) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace, push: () => {} }),
  useSearchParams: () => new URLSearchParams(query),
  usePathname: () => "/gifts/FC-7K3M9",
}));
// 「아직 보내지 않음」 — 기존 기록 처리(/api/gifts/not-sent)로 보내는 것만 가짜로 둔다
const sendNotSent = vi.fn();
vi.mock("@/features/gift-not-sent/api/send-not-sent", () => ({ sendNotSent: (...a: unknown[]) => sendNotSent(...a) }));
// 결제 이어 하기 — 준비는 가짜로
const resume = vi.fn();
vi.mock("@/features/checkout/api/post-resume-client", () => ({ postResumePayment: (...a: unknown[]) => resume(...a) }));
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
  replace.mockReset();
  sendNotSent.mockReset();
  resume.mockReset();
  paymentStep.mockReset();
  query = "";
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

  it("C-3: 확인이 끝나면 같은 상세를 ?address=confirmed 로 다시 읽는다(창이 닫히고 줄은 원천 상태로 사라진다)", async () => {
    sendReturnConfirm.mockResolvedValue({ kind: "ok" });
    render([RETURN]);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-kind="return_address"] button')?.click());
    const ok = [...document.querySelectorAll("dialog button")].find((b) => b.textContent === "확인") as HTMLButtonElement | undefined;
    await act(async () => ok?.click());
    expect(replace).toHaveBeenCalledWith("/gifts/FC-7K3M9?address=confirmed", { scroll: false });
  });

});

const MISSING: ActionItem = {
  kind: "missing_box",
  orderNo: "FC-7K3M9",
  boxId: "22222222-2222-4222-8222-222222222222",
  boxLabel: "FC-7K3M9",
  boxSeq: 1,
  creatorName: "하루",
  declaredTier: "small",
  dueAt: "2026-11-21T03:00:00.000Z",
};

describe("INV-W10·J4 (C-1): 도착이 늦어요 칸 — 찾기 양식 / 「아직 보내지 않음」 두 갈래 + 「1:1 문의하기」", () => {
  it("C-1: 찾기 양식 아래 「아직 보내지 않음」 버튼과 문의 화면으로 가는 텍스트 링크", () => {
    render([MISSING]);
    const task = host.querySelector('#todo [data-kind="missing_box"]');
    expect(task?.querySelector("form, input")).not.toBeNull();
    const btn = [...(task?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "아직 보내지 않음");
    expect(btn).toBeDefined();
    const link = [...(task?.querySelectorAll("a") ?? [])].find((a) => a.textContent === "1:1 문의하기");
    expect(link?.getAttribute("href")).toBe("/support");
  });

  it("INV-W10: 누르면 기존 기록 처리를 그 주문번호로 부르고, 끝나면 다시 읽는다(줄은 원천 상태로 사라진다)", async () => {
    sendNotSent.mockResolvedValue({ kind: "ok" });
    render([MISSING]);
    const btn = [...host.querySelectorAll<HTMLButtonElement>("#todo button")].find((b) => b.textContent === "아직 보내지 않음");
    await act(async () => btn?.click());
    expect(sendNotSent).toHaveBeenCalledWith({ orderNo: "FC-7K3M9" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("INV-W10 (실패경로): 서버가 거부하면 그 안내를 보이고 다시 읽는다 — 남았다고 말하지 않는다", async () => {
    sendNotSent.mockResolvedValue({ kind: "refused", message: "지금은 남길 수 없는 선물이에요. 새로고침해 주세요." });
    render([MISSING]);
    const btn = [...host.querySelectorAll<HTMLButtonElement>("#todo button")].find((b) => b.textContent === "아직 보내지 않음");
    await act(async () => btn?.click());
    expect(host.querySelector('#todo [role="alert"]')?.textContent).toContain("지금은 남길 수 없는 선물이에요.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

const UNPAID: ActionItem = { kind: "unpaid", orderNo: "FC-7K3M9", creatorName: "하루", amountKrw: 6900, dueAt: "2026-10-18T03:00:00.000Z" };

describe("INV-M22 (C-2): 결제 이어 하기가 실패로 돌아오면", () => {
  it("C-2: 이어 하기 결제창의 실패 주소는 그 선물 상세 + ?payment=failed", async () => {
    resume.mockResolvedValue({ ok: true, checkout: { orderId: "pay_2", orderNo: "FC-7K3M9", amountKrw: 6900 } });
    act(() =>
      root.render(
        <GiftTodoBox items={[UNPAID]} clientKey="test_ck" now="2026-10-17T03:00:00.000Z" address={{ accountId: "a1", status: null, sealingKeyPem: null }} />,
      ),
    );
    await act(async () => host.querySelector<HTMLButtonElement>('#todo [data-kind="unpaid"] button')?.click());
    expect(paymentStep).toHaveBeenCalledWith(expect.objectContaining({ route: expect.objectContaining({ failPath: "/gifts/FC-7K3M9?payment=failed" }) }));
  });

  it("C-2: ?payment=failed 로 열리면 칸 위에 「결제를 마치지 못했어요. 다시 결제해 주세요.」 — 쿼리가 없으면 없다", () => {
    render([UNPAID]);
    expect(host.textContent).not.toContain("결제를 마치지 못했어요.");
    act(() => root.unmount());
    root = createRoot(host);
    query = "payment=failed&code=PAY_PROCESS_CANCELED";
    render([UNPAID]);
    const line = host.querySelector('[role="alert"]');
    expect(line?.textContent).toBe("결제를 마치지 못했어요. 다시 결제해 주세요.");
    // 칸 위 — 칸(#todo)보다 앞에 있다
    expect(line?.compareDocumentPosition(host.querySelector("#todo")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("C-2 (실패경로): 결제 미완료 줄이 없는 칸(다른 일)에는 ?payment=failed 여도 그 줄이 없다", () => {
    query = "payment=failed";
    render([RETURN]);
    expect(host.textContent).not.toContain("결제를 마치지 못했어요.");
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

describe("접근성: 처리가 끝나 칸이 사라지면 포커스는 상자 칸 제목으로(ui-reviewer 2026-10-22 지적 2)", () => {
  // 선물 상세의 상자 칸 제목 — 새로 읽어도 남는 요소(「먼저 보내기」와 같은 자리)
  function boxTitle(): HTMLElement {
    const h = document.createElement("h2");
    h.id = "box-status-title";
    h.tabIndex = -1;
    document.body.appendChild(h);
    return h;
  }

  it("C-1: 「아직 보내지 않음」이 끝나면 포커스가 상자 칸 제목으로 간다", async () => {
    const title = boxTitle();
    sendNotSent.mockResolvedValue({ kind: "ok" });
    render([MISSING]);
    const btn = [...host.querySelectorAll<HTMLButtonElement>("#todo button")].find((b) => b.textContent === "아직 보내지 않음");
    btn?.focus();
    await act(async () => btn?.click());
    expect(document.activeElement).toBe(title);
    title.remove();
  });

  it("C-1 (실패경로): 거부되면 포커스를 옮기지 않는다 — 칸과 안내가 그 자리에 남는다", async () => {
    const title = boxTitle();
    sendNotSent.mockResolvedValue({ kind: "refused", message: "지금은 남길 수 없는 선물이에요. 새로고침해 주세요." });
    render([MISSING]);
    const btn = [...host.querySelectorAll<HTMLButtonElement>("#todo button")].find((b) => b.textContent === "아직 보내지 않음");
    btn?.focus();
    await act(async () => btn?.click());
    expect(document.activeElement).not.toBe(title);
    title.remove();
  });

  it("C-3: 돌려받을 주소 확인이 끝나면 포커스가 상자 칸 제목으로 간다", async () => {
    const title = boxTitle();
    sendReturnConfirm.mockResolvedValue({ kind: "ok" });
    render([RETURN]);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-kind="return_address"] button')?.click());
    const ok = [...document.querySelectorAll("dialog button")].find((b) => b.textContent === "확인") as HTMLButtonElement | undefined;
    await act(async () => ok?.click());
    expect(document.activeElement).toBe(title);
    title.remove();
  });
});
