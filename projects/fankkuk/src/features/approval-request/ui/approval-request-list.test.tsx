import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import { PROMISE } from "@/shared/config/site-copy";

// 승인 요청 화면 (2026-10-14 추가분 3).
// ① 팬이 직접 쓴 값(닉네임·품목 이름)에 스크립트·javascript: 주소·URL 을 넣어도 크리에이터 화면에는 글자 그대로 보이고,
//    실행되거나 눌리는 링크가 되지 않는다.
// ② 승인 확인창 버튼 바로 위에 「크리에이터 주소는 팬에게 공개되지 않습니다. 모든 선물은 팬꾹에서 검수한 뒤 보냅니다.」
// 서버로 가는 호출만 가짜로 둔다 — 시험 대상은 화면에 무엇이 어떤 꼴로 그려지는지다.
vi.mock("../api/send-approve", () => ({ sendApprove: vi.fn() }));
vi.mock("../api/send-decline", () => ({ sendDecline: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { ApprovalRequestList } from "./approval-request-list";

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
};

function render() {
  act(() => root.render(<ApprovalRequestList requests={[req]} decided={[]} now={NOW} />));
}

describe("팬이 쓴 값은 글자로만 보인다 (추가분 3 검사 7)", () => {
  it("닉네임·품목 이름의 태그·javascript:·URL 이 글자 그대로 보이고, 스크립트·이미지·링크 요소가 생기지 않는다", () => {
    render();
    const text = host.textContent ?? "";
    expect(text).toContain(EVIL_NICK);
    expect(text).toContain(EVIL_ITEM);
    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("img[onerror]")).toBeNull();
    expect(host.querySelector('a[href^="javascript"], a[href*="evil.example"]')).toBeNull();
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
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
    expect(line?.textContent).toBe(`${PROMISE.addressFan} ${PROMISE.inspection}`);
  });
});
