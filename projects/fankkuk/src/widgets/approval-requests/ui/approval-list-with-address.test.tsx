import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyAddressStatus } from "@/entities/address/api/my-address-status";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";

// 승인 창의 주소 단계 조립(approval-signature INV-S13 · address-protection INV-P16).
// 서버로 가는 호출과 주소 폼(봉인·저장)은 가짜로 둔다 — 시험 대상은 저장·취소·다시 열기·「주소 없음」 답에 따라 창이 어떻게 바뀌는지다.
const sendApprove = vi.fn();
vi.mock("@/features/approval-request/api/send-approve", () => ({ sendApprove: (...a: unknown[]) => sendApprove(...a) }));
vi.mock("@/features/approval-request/api/send-decline", () => ({ sendDecline: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/features/creator-address/ui/address-change-form", () => ({
  AddressChangeForm: (p: { onSaved: (label: "studio") => void; onCancel: () => void }) => (
    <div data-form="">
      <button type="button" onClick={() => p.onSaved("studio")}>
        가짜 저장
      </button>
      <button type="button" onClick={p.onCancel}>
        가짜 돌아가기
      </button>
    </div>
  ),
}));

import { ApprovalListWithAddress } from "./approval-list-with-address";

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
  sendApprove.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const NOW = "2026-10-14T03:00:00.000Z";
const req: ApprovalRequestView = {
  requestId: "apr_FC7K3M9",
  orderNo: "FC-7K3M9",
  fanNickname: "별빛",
  itemKind: "인형",
  boxCount: 1,
  hasElectronicsOrMetal: false,
  registeredAt: "2026-10-13T03:00:00.000Z",
  receivedAt: null,
  priorHistory: { gifts: 0, passed: 0, returned: 0 },
};
const CREATOR_ID = "00000000-0000-4000-b000-000000000001";
const NONE: MyAddressStatus = { creatorId: CREATOR_ID, registered: false, label: null, updatedAt: null };
const HOME: MyAddressStatus = { creatorId: CREATOR_ID, registered: true, label: "home", updatedAt: "2026-10-03T05:00:00Z" };

function render(address: MyAddressStatus | null, sealingKeyPem: string | null = "PEM") {
  act(() => root.render(<ApprovalListWithAddress requests={[req]} decided={[]} now={NOW} address={address} sealingKeyPem={sealingKeyPem} />));
}
const button = (scope: ParentNode, text: string) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const dialog = () => host.querySelector<HTMLDialogElement>("dialog[open]");
function openApprove(): HTMLDialogElement {
  act(() => button(host, "카카오톡으로 승인")?.click());
  const d = dialog();
  if (!d) throw new Error("승인 창이 열리지 않았다");
  return d;
}
const click = (scope: ParentNode, text: string) => {
  const b = button(scope, text);
  if (!b) throw new Error(`버튼 없음: ${text}`);
  act(() => b.click());
};

describe("승인 창의 주소 단계 (INV-S13·P16)", () => {
  it("INV-S13: 주소가 없으면 입력 폼만 — 저장하면 같은 창에 이름표 한 줄과 서명 버튼이 붙고 서명 머리로 포커스가 간다", () => {
    render(NONE);
    const d = openApprove();
    expect(d.textContent).toContain("주소를 입력해 주세요");
    expect(button(d, "서명 요청 보내기")).toBeUndefined();
    click(d, "가짜 저장");
    expect(d.textContent).toContain("주소를 확인해 주세요");
    expect(d.querySelector("[data-address-on-file]")?.textContent).toMatch(/^작업실 · /);
    expect(d.textContent).toContain("주소를 등록했어요.");
    expect(button(d, "서명 요청 보내기")).toBeDefined();
    expect(document.activeElement?.textContent).toContain("카카오톡으로 서명해 주세요");
  });

  it("INV-S13 (실패경로): 주소가 없을 때 입력을 그만두면 창이 닫힌다", () => {
    render(NONE);
    const d = openApprove();
    click(d, "가짜 돌아가기");
    expect(dialog()).toBeNull();
  });

  it("INV-P16: 주소가 있으면 이름표·등록한 날만 보이고 주소 칸은 없다 — 바로 서명할 수 있다", () => {
    render(HOME);
    const d = openApprove();
    expect(d.textContent).toContain("주소를 확인해 주세요");
    expect(d.querySelector("[data-address-on-file]")?.textContent).toBe("집 · 10월 3일 (토)에 등록한 주소");
    expect(d.querySelector("[data-form]")).toBeNull();
    expect(button(d, "서명 요청 보내기")).toBeDefined();
  });

  it("INV-S13: 「주소 바꾸기」를 누르면 서명 버튼이 사라지고, 돌아가면 다시 붙고 포커스는 「주소 바꾸기」로", () => {
    render(HOME);
    const d = openApprove();
    click(d, "주소 바꾸기");
    expect(d.textContent).toContain("새 주소를 입력해 주세요");
    expect(button(d, "서명 요청 보내기")).toBeUndefined();
    click(d, "가짜 돌아가기");
    expect(dialog()).not.toBeNull();
    expect(button(d, "서명 요청 보내기")).toBeDefined();
    expect(document.activeElement?.textContent).toBe("주소 바꾸기");
  });

  it("INV-S13: 바꾸던 중에 창을 닫았다 다시 열면 확인 화면부터 — 서명 버튼이 있다", () => {
    render(HOME);
    let d = openApprove();
    click(d, "주소 바꾸기");
    act(() => d.querySelector<HTMLButtonElement>("button[aria-label=\"닫기\"]")?.click());
    expect(dialog()).toBeNull();
    d = openApprove();
    expect(d.querySelector("[data-form]")).toBeNull();
    expect(button(d, "서명 요청 보내기")).toBeDefined();
  });

  it("INV-S13 (실패경로): 서버가 「주소 없음」으로 거부하면 창은 열린 채 입력 폼으로 돌아간다", async () => {
    sendApprove.mockResolvedValue({ kind: "refused", message: "받는 주소를 먼저 등록해 주세요.", noAddress: true });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "서명 요청 보내기")?.click());
    expect(dialog()).not.toBeNull();
    expect(d.textContent).toContain("주소를 입력해 주세요");
    expect(d.querySelector("[data-form]")).not.toBeNull();
    expect(button(d, "서명 요청 보내기")).toBeUndefined();
  });

  it("INV-S13 (실패경로): 봉인 키가 없으면 입력 폼 대신 안내만, 서명 버튼도 없다", () => {
    render(NONE, null);
    const d = openApprove();
    expect(d.textContent).toContain("주소 보호 설정이 아직 안 돼 있어요");
    expect(d.querySelector("[data-form]")).toBeNull();
    expect(button(d, "서명 요청 보내기")).toBeUndefined();
  });

  it("INV-S13 (실패경로): 주소 상태를 읽지 못했으면 다시 해 달라는 안내만, 서명 버튼은 없다", () => {
    render(null);
    const d = openApprove();
    expect(d.textContent).toContain("주소 정보를 읽지 못했어요");
    expect(button(d, "서명 요청 보내기")).toBeUndefined();
  });
});
