import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";

// 승인 요청 화면 (2026-10-14 추가분 3).
// ① 팬이 직접 쓴 값(닉네임·품목 이름)에 스크립트·javascript: 주소·URL 을 넣어도 크리에이터 화면에는 글자 그대로 보이고,
//    실행되거나 눌리는 링크가 되지 않는다.
// ② 승인 확인창 버튼 바로 위에 「크리에이터 주소는 팬에게 공개되지 않습니다. 모든 선물은 팬꾹에서 검수한 뒤 보냅니다.」
// 서버로 가는 호출만 가짜로 둔다 — 시험 대상은 화면에 무엇이 어떤 꼴로 그려지는지다.
vi.mock("../api/send-approve", () => ({ sendApprove: vi.fn() }));
vi.mock("../api/send-decline", () => ({ sendDecline: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { ApprovalRequestList, type ApprovalAddressStep } from "./approval-request-list";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 은 <dialog> 의 모달 열기·닫기가 없다 — open 속성만 바꾸는 최소한으로 채운다
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
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const NOW = "2026-10-14T03:00:00.000Z";
const EVIL_NICK = `<script>window.__pwned=1</script>javascript:alert(1)`;
const EVIL_ITEM = `<img src=x onerror="window.__pwned=1"> https://evil.example/login`;
const req: ApprovalRequestView = {
  requestId: "apr_FC7K3M9",
  orderNo: "FC-7K3M9",
  fanNickname: EVIL_NICK,
  itemKind: EVIL_ITEM,
  boxCount: 1,
  hasElectronicsOrMetal: false,
  registeredAt: "2026-10-13T03:00:00.000Z",
  receivedAt: null,
  priorHistory: { gifts: 0, passed: 0, returned: 0 },
};

const READY: ApprovalAddressStep = { registered: true, ready: true, renderStep: () => <p data-step="">주소 칸</p>, onOpen: () => {}, onMissing: () => {} };

function render(requests: readonly ApprovalRequestView[] = [req], address: ApprovalAddressStep = READY) {
  act(() => root.render(<ApprovalRequestList requests={requests} decided={[]} now={NOW} address={address} />));
}

function openApprove(): HTMLDialogElement {
  const open = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("카카오톡으로 승인"));
  act(() => open?.click());
  const dialog = host.querySelector<HTMLDialogElement>("dialog[open]");
  if (!dialog) throw new Error("승인 창이 열리지 않았다");
  return dialog;
}
const sendButton = (d: Element) => [...d.querySelectorAll("button")].find((b) => b.textContent?.includes("서명 요청 보내기"));

describe("승인 창은 주소 단계부터 (approval-signature INV-S13)", () => {
  it("INV-S13 (실패경로): 주소가 없으면 제목이 「주소를 입력해 주세요」이고 주소 칸만 — 서명 요청 버튼이 없다", () => {
    render([req], { ...READY, registered: false, ready: false });
    const d = openApprove();
    expect(d.textContent).toContain("주소를 입력해 주세요");
    expect(d.querySelector("[data-step]")).not.toBeNull();
    expect(sendButton(d)).toBeUndefined();
  });

  it("INV-S13: 주소가 있으면 제목이 「주소를 확인해 주세요」, 주소 칸 아래에 서명 요청 버튼이 붙는다", () => {
    render();
    const d = openApprove();
    expect(d.textContent).toContain("주소를 확인해 주세요");
    const step = d.querySelector("[data-step]");
    const send = sendButton(d);
    expect(step).not.toBeNull();
    expect(send).toBeDefined();
    expect(step!.compareDocumentPosition(send!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("INV-S13 (실패경로): 주소를 바꾸는 중(registered·준비 안 됨)이면 제목이 「새 주소를 입력해 주세요」이고 서명 요청 버튼이 없다", () => {
    render([req], { ...READY, ready: false });
    const d = openApprove();
    expect(d.textContent).toContain("새 주소를 입력해 주세요");
    expect(sendButton(d)).toBeUndefined();
  });

  it("INV-S13: 승인 창을 열 때마다 주소 단계에 알린다(바꾸던 입력을 접게)", () => {
    const onOpen = vi.fn();
    render([req], { ...READY, onOpen });
    openApprove();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("팬이 쓴 값은 글자로만 보인다 (추가분 3 검사 7)", () => {
  it("닉네임·품목 이름의 태그·javascript:·URL 이 글자 그대로 보이고, 스크립트·이미지·링크 요소가 생기지 않는다", () => {
    render();
    const text = host.textContent ?? "";
    expect(text).toContain(EVIL_NICK);
    expect(text).toContain(EVIL_ITEM);
    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("img[onerror]")).toBeNull();
    expect(host.querySelector('a[href^="javascript"], a[href*="evil.example"]')).toBeNull();
  });
});

describe("승인 확인창 버튼 위 약속 문장 (추가분 3 2-2)", () => {
  it("「카카오톡으로 승인」을 누르면 버튼 바로 위 줄에 약속 2-팬·3 이 그대로 나온다", () => {
    render();
    const open = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("카카오톡으로 승인"));
    expect(open).toBeDefined();
    act(() => open?.click());
    const dialog = host.querySelector("dialog[open]");
    expect(dialog).not.toBeNull();
    const send = [...(dialog?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.includes("서명 요청 보내기"));
    const btns = send?.parentElement;
    let line = btns?.previousElementSibling;
    while (line && line.getAttribute("role") === "alert") line = line.previousElementSibling;
    // 글자까지 고정한다 — 상수에서 읽으면 약속 문장이 바뀌어도 통과한다
    expect(line?.textContent).toBe("크리에이터 주소는 팬에게 공개되지 않습니다. 모든 선물은 팬꾹에서 검수한 뒤 보냅니다.");
  });
});

describe("승인 요청 카드의 지난 검수 내역 (INV-D11)", () => {
  const historyLine = (orderNo: string) =>
    [...host.querySelectorAll("li")].find((li) => li.textContent?.includes(orderNo))?.querySelector("[data-prior-history]")?.textContent;

  it("INV-D11: 카드마다 그 요청의 내역 한 줄 — 처음이면 처음이라고만, 지난 주문이 있으면 수를 사실대로", () => {
    render([
      { ...req, orderNo: "FC-FIRST1", fanNickname: "하늘" },
      { ...req, orderNo: "FC-AGAIN1", fanNickname: "별빛", priorHistory: { gifts: 3, passed: 2, returned: 1 } },
    ]);
    expect(historyLine("FC-FIRST1")).toBe("처음 보내는 팬이에요");
    expect(historyLine("FC-AGAIN1")).toBe("지난 선물 3건 · 검수 통과 2건 · 검수 반송 1건");
  });
});
