import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 돌려받을 주소 확인 창 (office-workflow INV-W15, action-center INV-J4, address-protection INV-P16·P17).
// 서버로 가는 확인 요청과 주소 입력 칸(봉인·저장)은 가짜로 둔다 — 시험 대상은 창의 단계(확인 / 바꾸기 / 등록 전 입력)와,
// 확인 요청이 주소 없이 그 상자 하나(주문번호 + 상자 순번)만 보내는지다.
const sendReturnConfirm = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock("../api/send-return-confirm", () => ({ sendReturnConfirm: (...a: unknown[]) => sendReturnConfirm(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

import { ReturnAddressWindow, type ReturnAddressStep } from "./return-address-window";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  sendReturnConfirm.mockReset();
  refresh.mockReset();
  push.mockReset();
  onClose.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

type Status = ReturnAddressStep["status"];
const NONE: Status = { registered: false, label: null, updatedAt: null };
const HOME: Status = { registered: true, label: "home", updatedAt: "2026-10-03T05:00:00Z" };

function render(status: Status, boxSeq: number | null = 2, canEnter = true) {
  const address: ReturnAddressStep = {
    status,
    canEnter,
    missingKeyText: "주소 보호 설정이 아직 안 돼 있어요.",
    renderForm: (p) => (
      <div data-form="">
        <button type="button" onClick={() => p.onSaved("studio")}>
          가짜 저장
        </button>
        <button type="button" onClick={p.onCancel}>
          가짜 돌아가기
        </button>
      </div>
    ),
  };
  act(() =>
    root.render(<ReturnAddressWindow target={{ orderNo: "FC-7K3M9", boxSeq }} meta="하루님께 보낸 선물 · 상자 2" address={address} open onClose={onClose} />),
  );
}

const text = () => host.ownerDocument.body.textContent ?? "";
const button = (name: string) => [...host.ownerDocument.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
async function click(name: string) {
  const b = button(name);
  if (!b) throw new Error(`버튼 없음: ${name}`);
  await act(async () => {
    b.click();
  });
}

describe("INV-W15: 등록 주소가 있으면 이름표·바꾼 날과 「확인」「바꾸기」", () => {
  it("INV-W15·P16: 창 제목은 「돌려받을 주소 확인」, 이름표와 등록한 날만 보이고 주소 입력 칸은 없다", () => {
    render(HOME);
    expect(text()).toContain("돌려받을 주소 확인");
    expect(text()).toContain("집 · ");
    expect(button("확인")).toBeDefined();
    expect(button("바꾸기")).toBeDefined();
    expect(host.ownerDocument.querySelector("[data-form]")).toBeNull();
  });

  it("INV-W15·J4: 「확인」은 주문번호와 상자 순번만 보내고(주소 없음), 끝나면 창을 닫고 다시 읽는다", async () => {
    sendReturnConfirm.mockResolvedValue({ kind: "ok" });
    render(HOME);
    await click("확인");
    expect(sendReturnConfirm).toHaveBeenCalledWith({ orderNo: "FC-7K3M9", boxSeq: 2 });
    expect(refresh).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("INV-W15: 역조공 몫(상자 순번 없음)은 주문번호만 보낸다", async () => {
    sendReturnConfirm.mockResolvedValue({ kind: "ok" });
    render(HOME, null);
    await click("확인");
    expect(sendReturnConfirm).toHaveBeenCalledWith({ orderNo: "FC-7K3M9" });
  });

  it("INV-W15: 「바꾸기」는 입력 칸을 열고, 돌아가면 다시 확인 단계다", async () => {
    render(HOME);
    await click("바꾸기");
    expect(host.ownerDocument.querySelector("[data-form]")).not.toBeNull();
    expect(button("확인")).toBeUndefined();
    await click("가짜 돌아가기");
    expect(button("확인")).toBeDefined();
  });

  it("INV-W15 (실패경로): 기한이 지나 거부되면 그 문장을 보이고 다시 읽는다 — 창은 닫지 않는다", async () => {
    sendReturnConfirm.mockResolvedValue({ kind: "refused", reason: "expired" });
    render(HOME);
    await click("확인");
    expect(host.ownerDocument.querySelector("[role=alert]")?.textContent).not.toBe("");
    expect(refresh).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("INV-W15 (실패경로): 서버가 「등록 주소 없음」으로 거부하면 입력 단계로 바뀐다", async () => {
    sendReturnConfirm.mockResolvedValue({ kind: "refused", reason: "no_address" });
    render(HOME);
    await click("확인");
    expect(text()).toContain("주소를 입력해 주세요");
    expect(host.ownerDocument.querySelector("[data-form]")).not.toBeNull();
  });
});

describe("INV-W15·P17: 등록 전이면 그 자리에서 입력한 뒤 확인", () => {
  it("INV-P17: 「주소를 입력해 주세요」와 입력 칸 — 「확인」은 없다", () => {
    render(NONE);
    expect(text()).toContain("주소를 입력해 주세요");
    expect(host.ownerDocument.querySelector("[data-form]")).not.toBeNull();
    expect(button("확인")).toBeUndefined();
  });

  it("INV-P17: 저장되면 확인 단계로 넘어가 「확인」을 누를 수 있다", async () => {
    render(NONE);
    await click("가짜 저장");
    expect(text()).toContain("작업실 · ");
    expect(button("확인")).toBeDefined();
  });

  it("INV-P17 (실패경로): 봉인 공개키가 없으면 입력 칸 대신 안내만", () => {
    render(NONE, 2, false);
    expect(text()).toContain("주소 보호 설정이 아직 안 돼 있어요.");
    expect(host.ownerDocument.querySelector("[data-form]")).toBeNull();
  });
});
