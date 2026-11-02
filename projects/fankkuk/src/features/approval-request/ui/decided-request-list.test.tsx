import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalCancelTarget } from "@/entities/order/model/approval-cancel";
import type { DecidedRequestView } from "@/entities/order/model/decided-request";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";

// 승인 내역의 「승인 취소」 (approval-cancel INV-AC1·AC2·AC4 · UX 명세 docs/ux/pages/creator-requests.md · 시안 approval-cancel-20261102).
// 버튼은 서버가 cancelable 로 준 「승인」 줄에만. 확인 창 문구는 도착한 상자 수·승인 기한으로 세 갈래. 송장 출력됨(409 printed)이면 오류 줄과 「닫기」만.
// 성공하면 창을 닫고 보던 화면 그대로 목록만 새로 읽는다(router.refresh).
const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

import { DecidedRequestList } from "./decided-request-list";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

let host: HTMLDivElement;
let root: Root;
const fetchSpy = vi.fn();
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  refresh.mockReset();
  push.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const row = (orderNo: string, fanNickname: string, outcome: DecidedRequestView["outcome"]): DecidedRequestView =>
  ({ orderNo, fanNickname, outcome, itemKind: "인형·쿠션", boxCount: 2, decidedAt: "2026-11-01T03:00:00.000Z" });
const DECIDED = [row("FC-A1", "다온", "approved"), row("FC-B1", "하늘", "approved"), row("FC-C1", "모모", "declined")];

// 라우트가 화면을 그린 서버 시각 — 기한 지남은 이 시각으로 가른다(브라우저 시계가 아니라)
const SERVER_NOW = "2026-11-02T03:00:00.000Z";
const FUTURE = new Date(Date.parse(SERVER_NOW) + 3 * 24 * 3600 * 1000).toISOString();
const PAST = new Date(Date.parse(SERVER_NOW) - 3600 * 1000).toISOString();
const target = (orderNo: string, over: Partial<ApprovalCancelTarget> = {}): ApprovalCancelTarget => ({
  requestId: `apr_${orderNo.replace("-", "")}`,
  orderNo,
  cancelable: true,
  arrivedBoxCount: 0,
  approvalDeadlineAt: FUTURE,
  ...over,
});

function render(targets: ApprovalCancelTarget[]) {
  act(() => root.render(<DecidedRequestList decided={DECIDED} cancelTargets={targets} now={SERVER_NOW} />));
}
const rowOf = (name: string) => [...host.querySelectorAll("li[data-row]")].find((li) => li.querySelector("strong")?.textContent === `${name}님의 선물`)!;
const cancelBtn = (name: string) => rowOf(name).querySelector<HTMLButtonElement>("button[data-cancel-approval]");
const dialog = () => host.querySelector("dialog[open]");
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
function reply(status: number, body: unknown) {
  fetchSpy.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });
}

describe("INV-AC4: 「승인 취소」는 서버가 취소 가능하다고 준 「승인」 줄에만", () => {
  it("INV-AC4: cancelable 인 승인 줄에만 버튼 — 송장이 출력된(cancelable 거짓) 승인 줄·거절 줄·대상에 없는 줄에는 없다", () => {
    render([target("FC-A1"), target("FC-B1", { cancelable: false }), target("FC-C1")]);
    expect(cancelBtn("다온")?.textContent).toBe("승인 취소");
    expect(cancelBtn("다온")?.getAttribute("aria-label")).toBe("다온님 선물 승인 취소");
    expect(cancelBtn("다온")?.className).toContain("btn--text");
    expect(cancelBtn("다온")?.className).toContain("btn--sm");
    expect(cancelBtn("하늘")).toBeNull();
    // 거절 줄은 대상에 같은 주문번호가 있어도 버튼이 없다
    expect(cancelBtn("모모")).toBeNull();
  });

  it("INV-AC4: 버튼은 날짜 오른쪽 칸에 — 버튼 없는 줄에도 같은 칸이 있다(열 맞춤)", () => {
    render([target("FC-A1")]);
    const time = rowOf("다온").querySelector("time")!;
    expect(time.nextElementSibling?.querySelector("button[data-cancel-approval]")).not.toBeNull();
    expect(rowOf("하늘").querySelector("time")!.nextElementSibling?.tagName).toBe("SPAN");
  });
});

describe("INV-AC1·AC2: 확인 창 세 갈래 — 서버가 준 도착한 상자 수·승인 기한으로", () => {
  const sentence = () => dialog()?.querySelector("[data-sentence]")?.textContent;

  it("INV-AC1 confirm-before: 상자 0개·기한 안 → 승인 대기로 돌아가고 기한까지 다시 승인할 수 있다", () => {
    render([target("FC-A1")]);
    act(() => cancelBtn("다온")!.click());
    expect(dialog()?.textContent).toContain("승인을 취소할까요?");
    expect(sentence()).toBe(`승인 대기로 돌아갑니다. ${formatMonthDayKo(FUTURE)}까지 다시 승인할 수 있습니다.`);
    expect(dialog()?.textContent).toContain("FC-A1");
    expect([...dialog()!.querySelectorAll<HTMLButtonElement>("button.btn")].map((b) => b.textContent)).toEqual(["닫기", "승인 취소"]);
  });

  it("INV-AC2 confirm-expired: 상자 0개·기한 지남 → 다시 승인할 수 없고 기한 만료로 반려된다", () => {
    render([target("FC-A1", { approvalDeadlineAt: PAST })]);
    act(() => cancelBtn("다온")!.click());
    expect(sentence()).toBe("승인 기한이 지나 다시 승인할 수 없습니다. 취소하면 기한 만료로 반려됩니다.");
  });

  it("INV-AC2: 기한 지남은 서버가 그린 시각으로 가른다 — 브라우저 시계가 기한을 지나 있어도 서버 시각으로 기한 안이면 「다시 승인할 수 있습니다」", () => {
    const deadline = new Date(Date.parse(SERVER_NOW) + 3600 * 1000).toISOString();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(SERVER_NOW) + 2 * 3600 * 1000));
    try {
      render([target("FC-A1", { approvalDeadlineAt: deadline })]);
      act(() => cancelBtn("다온")!.click());
      expect(sentence()).toBe(`승인 대기로 돌아갑니다. ${formatMonthDayKo(deadline)}까지 다시 승인할 수 있습니다.`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("INV-AC1 confirm-after: 도착한 상자 1개 이상 → 거절로 끝나고 반송된다", () => {
    render([target("FC-A1", { arrivedBoxCount: 1 })]);
    act(() => cancelBtn("다온")!.click());
    expect(sentence()).toBe("팬꾹에 도착한 상자가 있어 취소하면 거절로 끝나고 상자는 팬에게 반송됩니다. 다시 승인할 수 없습니다.");
  });
});

describe("INV-AC4·화면 결정 2026-11-02: 저장 결과", () => {
  it("성공(done-before) → 승인 요청 ID 하나만 보내고, 창을 닫고 화면을 옮기지 않은 채 목록만 새로 읽는다", async () => {
    render([target("FC-A1")]);
    act(() => cancelBtn("다온")!.click());
    reply(200, { phase: "before_inbound" });
    act(() => [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "승인 취소")!.click());
    await flush();
    expect(fetchSpy).toHaveBeenCalledWith("/api/approval-requests/cancel", expect.objectContaining({ method: "POST", body: JSON.stringify({ requestId: "apr_FCA1" }) }));
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("INV-AC4 (실패경로) cancel-error: 409 printed → 창 아래 오류 줄, 결과 문장·「승인 취소」는 빠지고 「닫기」만. 닫으면 목록을 새로 읽는다", async () => {
    render([target("FC-A1")]);
    act(() => cancelBtn("다온")!.click());
    reply(409, { message: "송장이 이미 출력돼 승인을 취소할 수 없습니다. 1:1 문의로 알려 주세요.", code: "printed" });
    act(() => [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "승인 취소")!.click());
    await flush();
    expect(dialog()?.querySelector("[role=alert]")?.textContent).toBe("!송장이 이미 출력돼 승인을 취소할 수 없습니다. 1:1 문의로 알려 주세요.");
    expect(dialog()?.querySelector("[data-sentence]")).toBeNull();
    expect([...dialog()!.querySelectorAll<HTMLButtonElement>("button.btn")].map((b) => b.textContent)).toEqual(["닫기"]);
    expect(refresh).not.toHaveBeenCalled();
    act(() => [...dialog()!.querySelectorAll<HTMLButtonElement>("button.btn")][0]!.click());
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("(실패경로) 「닫기」로 그냥 닫으면 저장도 새로 읽기도 하지 않는다", () => {
    render([target("FC-A1")]);
    act(() => cancelBtn("다온")!.click());
    act(() => [...dialog()!.querySelectorAll<HTMLButtonElement>("button.btn")].find((b) => b.textContent === "닫기")!.click());
    expect(dialog()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
