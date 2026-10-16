import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";

// 역조공 받기 판 — 등록한 받을 주소 확인 / 없으면 입력 (reverse-gift INV-R4·R6, address-protection INV-P16·P17).
// 서버로 가는 받기·받지 않기와 주소 입력 칸(봉인·저장)은 가짜로 둔다 — 시험 대상은 판의 단계와, 받기 요청이 주소 없이 그 선물 하나만 보내는지다.
const acceptRevgift = vi.fn();
const declineRevgift = vi.fn();
const refresh = vi.fn();
vi.mock("../api/reply-requests", () => ({
  acceptRevgift: (...a: unknown[]) => acceptRevgift(...a),
  declineRevgift: (...a: unknown[]) => declineRevgift(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));

import { ReceiveFlow, type ReceiveAddressStep } from "./receive-flow";

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
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  acceptRevgift.mockReset();
  declineRevgift.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const ORDER_NO = "RG-ABC123";
const NONE: MyFanAddressStatus = { registered: false, label: null, updatedAt: null };
const HOME: MyFanAddressStatus = { registered: true, label: "home", updatedAt: "2026-10-03T05:00:00Z" };

function render(status: MyFanAddressStatus | null, canEnter = true) {
  const address: ReceiveAddressStep = {
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
    root.render(
      <ReceiveFlow
        orderNo={ORDER_NO}
        creatorName="하루"
        tierName="소"
        tierRule="가로·세로·높이 합 80cm 이하"
        stage="waiting"
        daysLeftText="5일 남음"
        deadlineText="10월 22일까지 정해 주세요"
        address={address}
      />,
    ),
  );
}
const button = (text: string) => [...host.querySelectorAll("button, a")].find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;
const click = async (text: string) => {
  const b = button(text);
  if (!b) throw new Error(`버튼 없음: ${text}`);
  await act(async () => b.click());
};
const stepHead = () => host.querySelector("#rv-step-title")?.textContent;

describe("받기 — 등록한 받을 주소 확인 (INV-R4·R6, INV-P16)", () => {
  it("INV-R4 S4: 등록돼 있으면 「주소를 확인해 주세요」 — 이름표와 등록한 날만 보이고, 「이 주소로 받기」는 그 선물 번호만 보낸다", async () => {
    acceptRevgift.mockResolvedValue({ ok: true });
    render(HOME);
    await click("받기");
    expect(stepHead()).toBe("주소를 확인해 주세요");
    expect(host.querySelector("[data-address-on-file]")?.textContent).toContain("집 · ");
    expect(host.querySelector("[data-form]")).toBeNull();
    await click("이 주소로 받기");
    expect(acceptRevgift).toHaveBeenCalledWith(ORDER_NO);
    expect(acceptRevgift.mock.calls[0]).toHaveLength(1);
    expect(host.textContent).toContain("받기가 끝났어요");
  });

  it("INV-R6 S6: 받기 판에서 주소 바꾸기를 누르면 「새 주소를 입력해 주세요」, 저장하면 바꾼 이름표로 다시 확인한다", async () => {
    render(HOME);
    await click("받기");
    await click("주소 바꾸기");
    expect(stepHead()).toBe("새 주소를 입력해 주세요");
    await click("가짜 저장");
    expect(stepHead()).toBe("주소를 확인해 주세요");
    expect(host.querySelector("[data-address-on-file]")?.textContent).toContain("작업실");
    expect(host.textContent).toContain("주소를 바꿨어요.");
    expect(acceptRevgift).not.toHaveBeenCalled();
  });
});

describe("받기 — 등록 전이면 그 자리에서 입력 (INV-R4, INV-P17)", () => {
  it("INV-R4 S4: 등록 전이면 「주소를 입력해 주세요」와 입력 칸 — 저장한 뒤에야 확인 판과 「이 주소로 받기」가 나온다", async () => {
    acceptRevgift.mockResolvedValue({ ok: true });
    render(NONE);
    await click("받기");
    expect(stepHead()).toBe("주소를 입력해 주세요");
    expect(host.querySelector("[data-form]")).not.toBeNull();
    expect(button("이 주소로 받기")).toBeUndefined();
    await click("가짜 저장");
    expect(stepHead()).toBe("주소를 확인해 주세요");
    expect(host.textContent).toContain("주소를 등록했어요.");
    await click("이 주소로 받기");
    expect(acceptRevgift).toHaveBeenCalledWith(ORDER_NO);
  });

  it("INV-R4 (실패경로): 서버가 「등록 주소 없음」으로 돌려보내면 입력부터 다시 — 받기는 끝나지 않는다", async () => {
    acceptRevgift.mockResolvedValue({ ok: false, status: 422, message: "받을 주소를 먼저 입력해 주세요.", noAddress: true });
    render(HOME);
    await click("받기");
    await click("이 주소로 받기");
    expect(stepHead()).toBe("주소를 입력해 주세요");
    expect(host.querySelector("[data-form]")).not.toBeNull();
    expect(host.textContent).toContain("받을 주소를 먼저 입력해 주세요.");
    expect(host.textContent).not.toContain("받기가 끝났어요");
  });

  it("INV-R4 (실패경로): 입력을 그만두면 판이 닫히고 받기·받지 않기로 돌아간다", async () => {
    render(NONE);
    await click("받기");
    await click("가짜 돌아가기");
    expect(stepHead()).toBeUndefined();
    expect(button("받기")).toBeDefined();
  });

  it("INV-R5 (실패경로): 봉인 공개키가 없으면 등록 전 팬은 받기 버튼 대신 안내 — 등록돼 있으면 공개키 없이도 받을 수 있다", async () => {
    render(NONE, false);
    expect(button("받기")).toBeUndefined();
    expect(host.textContent).toContain("주소 보호 설정이 아직 안 돼 있어요.");
    act(() => root.unmount());
    root = createRoot(host);
    render(HOME, false);
    expect(button("받기")).toBeDefined();
  });

  it("INV-P17 (실패경로): 받을 주소를 읽지 못했으면 받기 버튼 대신 안내", () => {
    render(null);
    expect(button("받기")).toBeUndefined();
    expect(host.textContent).toContain("받을 주소를 읽지 못했어요");
  });
});
