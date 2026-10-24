import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyAddressStatus } from "@/entities/address/api/my-address-status";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";

// 처리할 일의 승인 창 (action-center INV-J8 · approval-signature INV-S7·S13 · address-protection INV-P16 · decline-block INV-D1).
// 서버로 가는 호출과 주소 폼(봉인·저장)은 가짜로 둔다 — 시험 대상은 창의 단계(고르기 → 서명·받지 않기 → 완료)와 주소 단계가 저장·취소·다시 열기·
// 「주소 없음」 답에 따라 어떻게 바뀌는지, 그리고 버튼이 기존 승인·받지 않기 처리를 그대로 부르는지다.
const sendApprove = vi.fn();
const sendDecline = vi.fn();
const refresh = vi.fn();
vi.mock("@/features/approval-request/api/send-approve", () => ({ sendApprove: (...a: unknown[]) => sendApprove(...a) }));
vi.mock("@/features/approval-request/api/send-decline", () => ({ sendDecline: (...a: unknown[]) => sendDecline(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));
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

import { ApprovalWindowWithAddress } from "./approval-window-with-address";

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
  sendApprove.mockReset();
  sendDecline.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const req: ApprovalRequestView = {
  requestId: "apr_FC7K3M9",
  orderNo: "FC-7K3M9",
  fanNickname: "하루",
  itemKind: "인형·쿠션",
  boxCount: 2,
  hasElectronicsOrMetal: false,
  registeredAt: "2026-10-15T05:20:00.000Z",
  receivedAt: null,
  priorHistory: { gifts: 2, passed: 2, returned: 0 },
};
const CREATOR_ID = "00000000-0000-4000-b000-000000000001";
const NONE: MyAddressStatus = { creatorId: CREATOR_ID, registered: false, label: null, updatedAt: null };
const HOME: MyAddressStatus = { creatorId: CREATOR_ID, registered: true, label: "home", updatedAt: "2026-10-03T05:00:00Z" };

function Harness({ address, sealingKeyPem }: { address: MyAddressStatus | null; sealingKeyPem: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        승인하기
      </button>
      <ApprovalWindowWithAddress
        request={req}
        dueAt="2026-10-22T05:20:00.000Z"
        daysLeftText="6일 남음"
        open={open}
        onClose={() => setOpen(false)}
        address={address}
        sealingKeyPem={sealingKeyPem}
      />
    </>
  );
}

function render(address: MyAddressStatus | null, sealingKeyPem: string | null = "PEM") {
  act(() => root.render(<Harness address={address} sealingKeyPem={sealingKeyPem} />));
}
const button = (scope: ParentNode, text: string) => [...scope.querySelectorAll("button, a")].find((b) => b.textContent?.includes(text)) as HTMLElement | undefined;
const dialog = () => host.querySelector<HTMLDialogElement>("dialog[open]");
const click = (scope: ParentNode, text: string) => {
  const b = button(scope, text);
  if (!b) throw new Error(`버튼 없음: ${text}`);
  act(() => b.click());
};
function openWindow(): HTMLDialogElement {
  click(host, "승인하기");
  const d = dialog();
  if (!d) throw new Error("승인 창이 열리지 않았다");
  return d;
}
function openApprove(): HTMLDialogElement {
  const d = openWindow();
  click(d, "카카오톡으로 승인");
  return d;
}

describe("승인 창 — 시안 dlg-d 의 칸과 단계 (INV-J8)", () => {
  it("INV-J8: 창 머리는 「승인 요청」·요청 시각, 칸은 보낸 팬·지난 내역·물품·상자·전자기기·기한뿐이고 처음에는 받지 않기·카카오톡으로 승인 두 버튼", () => {
    render(HOME);
    const d = openWindow();
    expect(d.querySelector("h2")?.textContent).toBe("승인 요청");
    expect(d.textContent).toContain("10월 15일 14:20 요청");
    expect(d.textContent).toContain("하루님");
    expect(d.textContent).toContain("지난 선물 2건 · 모두 검수 통과");
    const kv = [...d.querySelectorAll("dt")].map((dt) => `${dt.textContent}=${dt.nextElementSibling?.textContent}`);
    expect(kv).toEqual(["선물 종류=인형·쿠션", "상자=2개", "전자기기·금속=없음", "기한=10월 22일 오후 2시 20분 · 6일 남음"]);
    expect([...d.querySelectorAll("button")].map((b) => b.textContent).filter((t) => t !== "")).toEqual(["받지 않기", "카카오톡으로 승인"]);
  });

  it("추가분 3 2-2: 서명 요청 버튼 바로 위 줄에 약속 2-팬·3 이 글자 그대로 나온다", () => {
    render(HOME);
    const d = openApprove();
    const btns = button(d, "카카오톡으로 승인하기")?.parentElement;
    // 글자까지 고정한다 — 상수에서 읽으면 약속 문장이 바뀌어도 통과한다
    expect(btns?.previousElementSibling?.textContent).toBe("크리에이터 주소는 팬에게 공개하지 않아요. 모든 선물은 팬꾹에서 검수한 뒤 보내요.");
  });

  it("INV-S7: 서명 요청을 보내 서버가 승인을 저장한 뒤에만 「승인 완료」 — 승인 내역으로 가는 링크, 확인을 누르면 목록을 새로 읽는다", async () => {
    sendApprove.mockResolvedValue({ kind: "ok" });
    render(HOME);
    const d = openApprove();
    expect(d.textContent).not.toContain("승인 완료");
    await act(async () => button(d, "카카오톡으로 승인하기")?.click());
    expect(sendApprove).toHaveBeenCalledWith("apr_FC7K3M9");
    expect(d.textContent).toContain("승인 완료");
    expect(button(d, "승인 내역")?.getAttribute("href")).toBe("/creator/requests#done");
    click(d, "확인");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("INV-S7 (실패경로): 서버가 거부하면 완료로 바꾸지 않고 이유를 보인다", async () => {
    sendApprove.mockResolvedValue({ kind: "refused", message: "기한이 지나 승인할 수 없어요.", noAddress: false });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "카카오톡으로 승인하기")?.click());
    expect(d.textContent).not.toContain("승인 완료");
    expect(d.querySelector("[role=alert]")?.textContent).toContain("기한이 지나 승인할 수 없어요.");
  });

  it("INV-D1: 받지 않기 — 확인 단계에서 차단을 고를 수 있고, 저장된 뒤에만 「받지 않기 완료」", async () => {
    sendDecline.mockResolvedValue({ kind: "ok", alsoDeclinedOrderNos: [] });
    render(HOME);
    const d = openWindow();
    click(d, "받지 않기");
    expect(d.textContent).toContain("이 선물을 받지 않을까요?");
    act(() => d.querySelector<HTMLInputElement>("input[type=checkbox]")?.click());
    const confirm = [...d.querySelectorAll("button")].filter((b) => b.textContent === "받지 않기").pop()!;
    await act(async () => confirm.click());
    expect(sendDecline).toHaveBeenCalledWith("apr_FC7K3M9", true);
    expect(d.textContent).toContain("받지 않기 완료");
  });
});

describe("승인 창의 주소 단계 (INV-S13·P16)", () => {
  it("INV-S13: 주소 없이 「카카오톡으로 승인」을 누르면 초점이 「주소를 입력해 주세요」로 간다", () => {
    render(NONE);
    openApprove();
    expect(document.activeElement?.textContent).toBe("주소를 입력해 주세요");
  });

  it("INV-S13 (실패경로): 서버가 「주소 없음」으로 거부하면 초점이 「주소를 입력해 주세요」로 간다", async () => {
    sendApprove.mockResolvedValue({ kind: "refused", message: "팬꾹 주소를 먼저 등록해 주세요.", noAddress: true });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "카카오톡으로 승인하기")?.click());
    expect(document.activeElement?.textContent).toBe("주소를 입력해 주세요");
  });

  it("처리 중에는 Esc(cancel)·닫기 버튼으로 창이 닫히지 않는다 — 끝나면 다시 닫을 수 있다", async () => {
    let finish: (v: unknown) => void = () => {};
    sendApprove.mockReturnValue(new Promise((r) => (finish = r)));
    render(HOME);
    const d = openApprove();
    act(() => button(d, "카카오톡으로 승인하기")?.click());
    const esc = new Event("cancel", { cancelable: true });
    act(() => {
      d.dispatchEvent(esc);
    });
    expect(esc.defaultPrevented).toBe(true);
    expect(d.querySelector<HTMLButtonElement>("button[aria-label=\"닫기\"]")?.disabled).toBe(true);
    await act(async () => finish({ kind: "ok" }));
    const esc2 = new Event("cancel", { cancelable: true });
    act(() => {
      d.dispatchEvent(esc2);
    });
    expect(esc2.defaultPrevented).toBe(false);
  });

  it("INV-S13: 주소가 없으면 「주소를 입력해 주세요」와 입력 폼만 — 저장하면 같은 창에 이름표 한 줄과 서명 버튼이 붙고 서명 머리로 포커스가 간다", () => {
    render(NONE);
    const d = openApprove();
    expect(d.textContent).toContain("주소를 입력해 주세요");
    expect(button(d, "카카오톡으로 승인하기")).toBeUndefined();
    click(d, "가짜 저장");
    expect(d.textContent).toContain("주소를 확인해 주세요");
    expect(d.querySelector("[data-address-on-file]")?.textContent).toMatch(/^작업실 · /);
    expect(d.textContent).toContain("주소를 등록했어요.");
    expect(button(d, "카카오톡으로 승인하기")).toBeDefined();
    expect(document.activeElement?.textContent).toContain("카카오톡으로 승인해 주세요");
  });

  it("INV-S13 (실패경로): 주소가 없을 때 입력을 그만두면 창이 닫힌다", () => {
    render(NONE);
    const d = openApprove();
    click(d, "가짜 돌아가기");
    expect(dialog()).toBeNull();
  });

  it("INV-P16: 주소가 있으면 「주소를 확인해 주세요」·이름표·등록한 날만 보이고 주소 칸은 없다 — 바로 서명할 수 있다", () => {
    render(HOME);
    const d = openApprove();
    expect(d.textContent).toContain("주소를 확인해 주세요");
    expect(d.querySelector("[data-address-on-file]")?.textContent).toBe("집 · 10월 3일 (토)에 등록한 주소");
    expect(d.querySelector("[data-form]")).toBeNull();
    expect(button(d, "카카오톡으로 승인하기")).toBeDefined();
  });

  it("INV-S13: 「주소 바꾸기」를 누르면 「새 주소를 입력해 주세요」·서명 버튼이 사라지고, 돌아가면 다시 붙고 포커스는 「주소 바꾸기」로", () => {
    render(HOME);
    const d = openApprove();
    click(d, "주소 바꾸기");
    expect(d.textContent).toContain("새 주소를 입력해 주세요");
    expect(button(d, "카카오톡으로 승인하기")).toBeUndefined();
    click(d, "가짜 돌아가기");
    expect(dialog()).not.toBeNull();
    expect(button(d, "카카오톡으로 승인하기")).toBeDefined();
    expect(document.activeElement?.textContent).toBe("주소 바꾸기");
  });

  it("INV-S13: 바꾸던 중에 창을 닫았다 다시 열면 확인 화면부터 — 서명 버튼이 있다", () => {
    render(HOME);
    let d = openApprove();
    click(d, "주소 바꾸기");
    act(() => d.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')?.click());
    expect(dialog()).toBeNull();
    d = openApprove();
    expect(d.querySelector("[data-form]")).toBeNull();
    expect(button(d, "카카오톡으로 승인하기")).toBeDefined();
  });

  it("INV-S13 (실패경로): 서버가 「주소 없음」으로 거부하면 창은 열린 채 입력 폼으로 돌아간다", async () => {
    sendApprove.mockResolvedValue({ kind: "refused", message: "팬꾹 주소를 먼저 등록해 주세요.", noAddress: true });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "카카오톡으로 승인하기")?.click());
    expect(dialog()).not.toBeNull();
    expect(d.textContent).toContain("주소를 입력해 주세요");
    expect(d.querySelector("[data-form]")).not.toBeNull();
    expect(button(d, "카카오톡으로 승인하기")).toBeUndefined();
    expect(d.textContent).not.toContain("승인 완료");
  });

  it("INV-S13 (실패경로): 봉인 키가 없으면 입력 폼 대신 안내만, 서명 버튼도 없다", () => {
    render(NONE, null);
    const d = openApprove();
    expect(d.textContent).toContain("주소 보호 설정이 아직 안 돼 있어요");
    expect(d.querySelector("[data-form]")).toBeNull();
    expect(button(d, "카카오톡으로 승인하기")).toBeUndefined();
  });

  it("INV-S13 (실패경로): 주소 상태를 읽지 못했으면 다시 해 달라는 안내만, 서명 버튼은 없다", () => {
    render(null);
    const d = openApprove();
    expect(d.textContent).toContain("주소 정보를 읽지 못했어요");
    expect(button(d, "카카오톡으로 승인하기")).toBeUndefined();
  });
});

describe("팬이 쓴 값은 글자로만 보인다", () => {
  it("닉네임·품목 이름의 태그·javascript: 가 글자 그대로 보이고 스크립트·이미지 요소가 생기지 않는다", () => {
    act(() =>
      root.render(
        <ApprovalWindowWithAddress
          request={{ ...req, fanNickname: "<img src=x onerror=alert(1)>", itemKind: "javascript:alert(1)<script>" }}
          dueAt="2026-10-22T05:20:00.000Z"
          daysLeftText="6일 남음"
          open
          onClose={() => {}}
          address={HOME}
          sealingKeyPem="PEM"
        />,
      ),
    );
    const d = dialog()!;
    expect(d.textContent).toContain("<img src=x onerror=alert(1)>님");
    expect(d.textContent).toContain("javascript:alert(1)<script>");
    expect(d.querySelector("img, script")).toBeNull();
  });
});
