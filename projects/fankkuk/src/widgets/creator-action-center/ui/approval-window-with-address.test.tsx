import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyAddressStatus } from "@/entities/address/api/my-address-status";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";

// 처리할 일의 승인 창 (action-center INV-J8 · approval-signature INV-S7·S13·S17 · address-protection INV-P16 · decline-block INV-D1 · UX 명세 creator-actions.md).
// 서버로 가는 호출과 주소 폼(봉인·저장)은 가짜로 둔다 — 시험 대상은 창의 단계(고르기 → 주소 → 기다림 → 승인됨/다시 요청, 받지 않기)와 주소 단계가 저장·취소·다시 열기·
// 「주소 없음」 답에 따라 어떻게 바뀌는지, 그리고 버튼이 서명 요청·결과 확인·받지 않기 처리를 그대로 부르는지다.
const startSign = vi.fn();
const checkSign = vi.fn();
const sendDecline = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock("@/features/approval-request/api/approval-sign-client", () => ({
  startSign: (...a: unknown[]) => startSign(...a),
  checkSign: (...a: unknown[]) => checkSign(...a),
}));
vi.mock("@/features/approval-request/api/send-decline", () => ({ sendDecline: (...a: unknown[]) => sendDecline(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: (...a: unknown[]) => push(...a) }) }));
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
  startSign.mockReset();
  checkSign.mockReset();
  // 기본: 창을 열 때 이어 볼 요청이 없다
  checkSign.mockResolvedValue({ kind: "view", view: { state: "none" } });
  sendDecline.mockReset();
  refresh.mockReset();
  push.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
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
const exactButtons = (scope: ParentNode) => [...scope.querySelectorAll("button")].map((b) => b.textContent).filter((t) => t !== "");
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
  click(d, "승인");
  return d;
}

describe("승인 창 — 시안 dlg-d 의 칸과 단계 (INV-J8)", () => {
  it("INV-J8·INV-S1: 창 머리는 「승인 요청」·요청 시각, 칸은 보낸 팬·지난 내역·선물 종류·상자·전자기기·주문번호·기한이고 처음에는 「거절」·「승인」 두 버튼", () => {
    render(HOME);
    const d = openWindow();
    expect(d.querySelector("h2")?.textContent).toBe("승인 요청");
    expect(d.textContent).toContain("10월 15일 14:20 요청");
    expect(d.textContent).toContain("하루님");
    expect(d.textContent).toContain("지난 선물 2건 · 모두 검수 통과");
    const kv = [...d.querySelectorAll("dt")].map((dt) => `${dt.textContent}=${dt.nextElementSibling?.textContent}`);
    expect(kv).toEqual(["선물 종류=인형·쿠션", "상자=2개", "전자기기·금속=없음", "주문번호=FC-7K3M9", "기한=10월 22일 오후 2시 20분 · 6일 남음"]);
    expect([...d.querySelectorAll("button")].map((b) => b.textContent).filter((t) => t !== "")).toEqual(["거절", "승인"]);
  });

  it("추가분 3 2-2: 서명 요청 버튼 바로 위 줄에 약속 2-팬·3 이 글자 그대로 나온다", () => {
    render(HOME);
    const d = openApprove();
    const btns = button(d, "승인 요청 보내기")?.parentElement;
    // 글자까지 고정한다 — 상수에서 읽으면 약속 문장이 바뀌어도 통과한다
    expect(btns?.previousElementSibling?.textContent).toBe("크리에이터의 주소는 팬에게 공개되지 않습니다. 팬이 보낸 선물은 팬꾹에서 검수 후 배송합니다.");
  });

  it("INV-S17 S17: 「승인 요청 보내기」 → 「카카오톡에서 인증을 마쳐 주세요」·남은 시간 5:00 → 서버가 승인을 저장했다고 답한 뒤에만 「승인됨」", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-10-29T01:00:00.000Z"));
    startSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: "2026-10-29T01:05:00.000Z" } });
    render(HOME);
    const d = openApprove();
    // 첫 확인은 아직 기다림 — 화면이 스스로 「승인됨」으로 바꾸지 않는다
    checkSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: "2026-10-29T01:05:00.000Z" } });
    await act(async () => button(d, "승인 요청 보내기")?.click());
    expect(startSign).toHaveBeenCalledWith("apr_FC7K3M9");
    expect(d.querySelector("[role=status]")?.textContent).toContain("카카오톡에서 인증을 마쳐 주세요");
    expect(d.textContent).toContain("5:00");
    expect(d.textContent).not.toContain("승인됨");
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(d.textContent).toContain("4:57");
    expect(d.textContent).not.toContain("승인됨");
    checkSign.mockResolvedValue({ kind: "view", view: { state: "approved" } });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(d.textContent).toContain("승인됨");
    expect(button(d, "승인 내역 보기")?.getAttribute("href")).toBe("/creator/requests#done");
    // 명세 creator-actions.md approved: 「내역 보기 · 닫기」
    expect(button(d, "확인")).toBeUndefined();
    click(d, "닫기");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("기다림: 알림 영역(role=status)에는 안내 문구만 — 매초 바뀌는 남은 시간은 알림 밖 timer(aria-live off)", async () => {
    startSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    checkSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    const status = d.querySelector("[role=status]");
    expect(status?.textContent).toBe("카카오톡에서 인증을 마쳐 주세요");
    const timer = d.querySelector("[role=timer]");
    expect(timer?.getAttribute("aria-live")).toBe("off");
    expect(timer?.textContent).toMatch(/^[45]:\d\d$/);
    expect(status?.contains(timer ?? null)).toBe(false);
  });

  it("INV-S17 (실패경로): 서버가 「요청 없음」으로 답하면 시간 지남으로 단정하지 않고 「인증을 완료하지 못했습니다.」·「다시 요청」", async () => {
    startSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    checkSign.mockResolvedValue({ kind: "view", view: { state: "none" } });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    expect(d.textContent).toContain("인증을 완료하지 못했습니다.");
    expect(d.textContent).not.toContain("인증 시간이 지났습니다.");
    expect(button(d, "다시 요청")).toBeDefined();
  });

  it("「돌아가기」로 고르기 단계에 가면 앞 단계의 오류 줄·한도 표시가 지워진다", async () => {
    startSign.mockResolvedValue({ kind: "refused", message: "오늘 이 선물에 보낼 수 있는 인증 요청 횟수를 모두 사용했습니다. 내일 다시 요청해 주세요.", code: "too_many" });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    expect(d.querySelector("[role=alert]")).not.toBeNull();
    click(d, "돌아가기");
    expect(d.querySelector("[role=alert]")).toBeNull();
    click(d, "승인");
    expect((button(d, "승인 요청 보내기") as HTMLButtonElement | undefined)?.disabled).toBe(false);
  });

  it("다시 열 때 서버 답이 오기 전에 「승인」을 누르면, 늦게 온 「기다리는 중」 답이 고른 단계를 덮지 않는다", async () => {
    let answer: (v: unknown) => void = () => {};
    checkSign.mockReturnValueOnce(new Promise((r) => (answer = r)));
    render(HOME);
    const d = openApprove();
    expect(button(d, "승인 요청 보내기")).toBeDefined();
    await act(async () => answer({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } }));
    expect(d.textContent).not.toContain("카카오톡에서 인증을 마쳐 주세요");
    expect(button(d, "승인 요청 보내기")).toBeDefined();
  });

  it("로그인이 풀리면 다시 로그인한 뒤 이 주문의 승인 창으로 돌아오게 ?order= 를 남긴다", async () => {
    startSign.mockResolvedValue({ kind: "login" });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    expect(push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/creator/actions?order=FC-7K3M9")}`);
    sendDecline.mockResolvedValue({ kind: "login" });
    push.mockReset();
    click(d, "돌아가기");
    click(d, "거절");
    await act(async () => button(d, "받지 않기")?.click());
    expect(push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/creator/actions?order=FC-7K3M9")}`);
  });

  it("INV-S17: 결과는 3초마다 묻는다 — 3초 전에는 다시 묻지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    startSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    checkSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    render(HOME);
    const d = openApprove();
    const before = checkSign.mock.calls.length;
    await act(async () => button(d, "승인 요청 보내기")?.click());
    const afterStart = checkSign.mock.calls.length;
    expect(afterStart).toBe(before + 1); // 기다림에 들어가며 한 번
    await act(async () => {
      vi.advanceTimersByTime(2900);
    });
    expect(checkSign.mock.calls.length).toBe(afterStart);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(checkSign.mock.calls.length).toBe(afterStart + 1);
  });

  it("INV-S17 S17c (실패경로): 시간이 지나면 「인증 시간이 지났습니다.」·「다시 요청」, 누르면 새 요청을 보낸다", async () => {
    startSign.mockResolvedValueOnce({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    checkSign.mockResolvedValue({ kind: "view", view: { state: "ended", reason: "expired" } });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    expect(d.textContent).toContain("인증 시간이 지났습니다.");
    expect(d.textContent).not.toContain("승인됨");
    startSign.mockResolvedValueOnce({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    checkSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    await act(async () => button(d, "다시 요청")?.click());
    expect(startSign).toHaveBeenCalledTimes(2);
    expect(d.textContent).toContain("카카오톡에서 인증을 마쳐 주세요");
  });

  it("INV-S17 (실패경로): 서명이 거부·실패하면 「인증을 완료하지 못했습니다.」·「다시 요청」", async () => {
    startSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    checkSign.mockResolvedValue({ kind: "view", view: { state: "ended", reason: "failed" } });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    expect(d.textContent).toContain("인증을 완료하지 못했습니다.");
    expect(button(d, "다시 요청")).toBeDefined();
  });

  it("INV-S17 S17c (실패경로): 하루 다섯 번을 넘으면 빨간 줄에 서버 문구, 「다시 요청」은 없다", async () => {
    startSign.mockResolvedValueOnce({ kind: "view", view: { state: "waiting", expiresAt: new Date(Date.now() + 300_000).toISOString() } });
    checkSign.mockResolvedValue({ kind: "view", view: { state: "ended", reason: "expired" } });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    startSign.mockResolvedValueOnce({ kind: "refused", message: "오늘 이 선물에 보낼 수 있는 인증 요청 횟수를 모두 사용했습니다. 내일 다시 요청해 주세요.", code: "too_many" });
    await act(async () => button(d, "다시 요청")?.click());
    expect(d.querySelector("[role=alert]")?.textContent).toContain("오늘 이 선물에 보낼 수 있는 인증 요청 횟수를 모두 사용했습니다.");
    expect(button(d, "다시 요청")).toBeUndefined();
  });

  it("INV-S17 (실패경로): 요청 만들기가 거부되면(창구 없음 등) 기다림으로 바꾸지 않고 이유를 보인다", async () => {
    startSign.mockResolvedValue({ kind: "refused", message: "현재 승인할 수 없습니다. 잠시 후 다시 시도해 주세요.", code: null });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    expect(d.textContent).not.toContain("카카오톡에서 인증을 마쳐 주세요");
    expect(d.textContent).not.toContain("승인됨");
    expect(d.querySelector("[role=alert]")?.textContent).toContain("현재 승인할 수 없습니다.");
    expect(button(d, "승인 요청 보내기")).toBeDefined();
  });

  it("INV-S17: 기다리는 중에 창을 닫았다 다시 열면 서버가 준 남은 시간부터 기다림으로 이어진다", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-10-29T01:02:00.000Z"));
    checkSign.mockResolvedValue({ kind: "view", view: { state: "waiting", expiresAt: "2026-10-29T01:05:00.000Z" } });
    render(HOME);
    const d = openWindow();
    await act(async () => {}); // 창을 열 때 묻는 결과를 받는다
    expect(checkSign).toHaveBeenCalledWith("apr_FC7K3M9");
    expect(d.textContent).toContain("카카오톡에서 인증을 마쳐 주세요");
    expect(d.textContent).toContain("3:00");
    expect(startSign).not.toHaveBeenCalled();
  });

  it("INV-S17 (실패경로): 창을 열 때 이어 볼 요청이 없거나 끝났으면 고르기 단계 그대로", async () => {
    for (const view of [{ state: "none" }, { state: "ended", reason: "expired" }]) {
      checkSign.mockResolvedValue({ kind: "view", view });
      render(HOME);
      const d = openWindow();
      await act(async () => {});
      expect(exactButtons(d), JSON.stringify(view)).toEqual(["거절", "승인"]);
      act(() => d.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')?.click());
    }
  });

  it("INV-D1: 받지 않기 — 확인 단계에서 차단을 고를 수 있고, 저장된 뒤에만 「거절 완료」", async () => {
    sendDecline.mockResolvedValue({ kind: "ok", alsoDeclinedOrderNos: [] });
    render(HOME);
    const d = openWindow();
    click(d, "거절");
    expect(d.textContent).toContain("이 선물을 거절할까요?");
    act(() => d.querySelector<HTMLInputElement>("input[type=checkbox]")?.click());
    const confirm = [...d.querySelectorAll("button")].filter((b) => b.textContent === "받지 않기").pop()!;
    await act(async () => confirm.click());
    expect(sendDecline).toHaveBeenCalledWith("apr_FC7K3M9", true);
    expect(d.textContent).toContain("거절 완료");
  });
});

describe("승인 창의 주소 단계 (INV-S13·P16)", () => {
  it("INV-S13: 주소 없이 「승인」을 누르면 초점이 「배송지 등록」로 간다", () => {
    render(NONE);
    openApprove();
    expect(document.activeElement?.textContent).toBe("배송지 등록");
  });

  it("INV-S13 (실패경로): 서버가 「주소 없음」으로 거부하면 초점이 「배송지 등록」로 간다", async () => {
    startSign.mockResolvedValue({ kind: "refused", message: "받는 주소를 먼저 등록해 주세요.", code: "no_address" });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    expect(document.activeElement?.textContent).toBe("배송지 등록");
  });

  it("처리 중에는 Esc(cancel)·닫기 버튼으로 창이 닫히지 않는다 — 끝나면 다시 닫을 수 있다", async () => {
    let finish: (v: unknown) => void = () => {};
    startSign.mockReturnValue(new Promise((r) => (finish = r)));
    render(HOME);
    const d = openApprove();
    act(() => button(d, "승인 요청 보내기")?.click());
    const esc = new Event("cancel", { cancelable: true });
    act(() => {
      d.dispatchEvent(esc);
    });
    expect(esc.defaultPrevented).toBe(true);
    expect(d.querySelector<HTMLButtonElement>("button[aria-label=\"닫기\"]")?.disabled).toBe(true);
    await act(async () => finish({ kind: "refused", message: "현재 승인할 수 없습니다.", code: null }));
    const esc2 = new Event("cancel", { cancelable: true });
    act(() => {
      d.dispatchEvent(esc2);
    });
    expect(esc2.defaultPrevented).toBe(false);
  });

  it("INV-S13: 주소가 없으면 「배송지 등록」와 입력 폼만 — 저장하면 같은 창에 이름표 한 줄과 서명 버튼이 붙고 서명 머리로 포커스가 간다", () => {
    render(NONE);
    const d = openApprove();
    expect(d.textContent).toContain("배송지 등록");
    expect(button(d, "승인 요청 보내기")).toBeUndefined();
    click(d, "가짜 저장");
    expect(d.textContent).toContain("등록된 배송지 확인");
    expect(d.querySelector("[data-address-on-file]")?.textContent).toMatch(/^작업실 · /);
    expect(d.textContent).toContain("주소가 등록되었습니다.");
    expect(button(d, "승인 요청 보내기")).toBeDefined();
    expect(document.activeElement?.textContent).toContain("카카오톡으로 선물 승인");
  });

  it("INV-S13 (실패경로): 주소가 없을 때 입력을 그만두면 창이 닫힌다", () => {
    render(NONE);
    const d = openApprove();
    click(d, "가짜 돌아가기");
    expect(dialog()).toBeNull();
  });

  it("INV-P16: 주소가 있으면 「등록된 배송지 확인」·이름표·등록한 날만 보이고 주소 칸은 없다 — 바로 서명할 수 있다", () => {
    render(HOME);
    const d = openApprove();
    expect(d.textContent).toContain("등록된 배송지 확인");
    expect(d.querySelector("[data-address-on-file]")?.textContent).toBe("집 · 10월 3일 (토) 등록");
    expect(d.querySelector("[data-form]")).toBeNull();
    expect(button(d, "승인 요청 보내기")).toBeDefined();
  });

  it("INV-S13: 「주소 변경」를 누르면 「배송지 변경」·서명 버튼이 사라지고, 돌아가면 다시 붙고 포커스는 「주소 변경」로", () => {
    render(HOME);
    const d = openApprove();
    click(d, "주소 변경");
    expect(d.textContent).toContain("배송지 변경");
    expect(button(d, "승인 요청 보내기")).toBeUndefined();
    click(d, "가짜 돌아가기");
    expect(dialog()).not.toBeNull();
    expect(button(d, "승인 요청 보내기")).toBeDefined();
    expect(document.activeElement?.textContent).toBe("주소 변경");
  });

  it("INV-S13: 바꾸던 중에 창을 닫았다 다시 열면 확인 화면부터 — 서명 버튼이 있다", () => {
    render(HOME);
    let d = openApprove();
    click(d, "주소 변경");
    act(() => d.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')?.click());
    expect(dialog()).toBeNull();
    d = openApprove();
    expect(d.querySelector("[data-form]")).toBeNull();
    expect(button(d, "승인 요청 보내기")).toBeDefined();
  });

  it("INV-S13 (실패경로): 서버가 「주소 없음」으로 거부하면 창은 열린 채 입력 폼으로 돌아간다", async () => {
    startSign.mockResolvedValue({ kind: "refused", message: "받는 주소를 먼저 등록해 주세요.", code: "no_address" });
    render(HOME);
    const d = openApprove();
    await act(async () => button(d, "승인 요청 보내기")?.click());
    expect(dialog()).not.toBeNull();
    expect(d.textContent).toContain("배송지 등록");
    expect(d.querySelector("[data-form]")).not.toBeNull();
    expect(button(d, "승인 요청 보내기")).toBeUndefined();
    expect(d.textContent).not.toContain("승인됨");
  });

  it("INV-S13 (실패경로): 봉인 키가 없으면 입력 폼 대신 안내만, 서명 버튼도 없다", () => {
    render(NONE, null);
    const d = openApprove();
    expect(d.textContent).toContain("현재 주소를 등록할 수 없습니다. 고객센터로 문의해 주세요.");
    expect(d.querySelector("[data-form]")).toBeNull();
    expect(button(d, "승인 요청 보내기")).toBeUndefined();
  });

  it("INV-S13 (실패경로): 주소 상태를 읽지 못했으면 다시 해 달라는 안내만, 서명 버튼은 없다", () => {
    render(null);
    const d = openApprove();
    expect(d.textContent).toContain("주소 정보를 불러오지 못했습니다");
    expect(button(d, "승인 요청 보내기")).toBeUndefined();
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
