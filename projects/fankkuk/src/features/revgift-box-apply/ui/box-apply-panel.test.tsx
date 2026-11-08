import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FanBox } from "@/entities/revgift-box/api/box-reads";

// 팬 신청 판 (revgift-box INV-GB4·GB6·GB9, 정할 것 Q5·Q6). 서버로 가는 신청·신청 취소와 주소 입력 칸은 가짜로 둔다 —
// 시험 대상은 상태마다 보이는 것과, 신청 요청이 주소 없이 선물함·토큰만 보내는지다.
const sendApply = vi.fn();
const sendWithdraw = vi.fn();
const refresh = vi.fn();
vi.mock("../api/apply-requests", () => ({
  sendApply: (...a: unknown[]) => sendApply(...a),
  sendWithdraw: (...a: unknown[]) => sendWithdraw(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));

import { BoxApplyPanel, type ApplyAddressStep } from "./box-apply-panel";

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

const BOX: FanBox = {
  id: "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10",
  name: "겨울 선물",
  creator: { id: "00000000-0000-4000-b000-000000000001", slug: "haru", name: "하루" },
  open: true,
  viewer: "follower",
  myState: "none",
};

const ADDRESS: ApplyAddressStep = {
  status: { registered: true, label: "home", updatedAt: "2026-11-01T01:00:00Z" },
  canEnter: true,
  missingKeyText: "열쇠 없음",
  renderForm: () => <form data-address-form="" />,
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  sendApply.mockReset();
  sendWithdraw.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

let mount = 0;
/** 부를 때마다 새로 그린다(앞 상태를 이어받지 않게) */
function render(box: Partial<FanBox>, address: Partial<ApplyAddressStep> = {}, token: string | null = null) {
  mount += 1;
  act(() => root.render(<BoxApplyPanel key={mount} box={{ ...BOX, ...box }} token={token} address={{ ...ADDRESS, ...address }} followSlot={<button type="button">팔로우</button>} />));
}
/** 글자가 있는 버튼(확인 창의 닫기 아이콘 버튼은 뺀다) */
const buttons = () => [...host.querySelectorAll("button")].map((b) => b.textContent).filter((x) => x);

describe("팬 신청 판", () => {
  it("INV-GB6 S6: 등록 주소가 있으면 이름표·날짜만 보이고 「이 주소로 신청」은 선물함·토큰만 보낸다", async () => {
    sendApply.mockResolvedValue({ ok: true });
    render({}, {}, "t".repeat(32));
    expect(host.textContent).toContain("집");
    expect(host.querySelector("[data-address-form]")).toBeNull();
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === "이 주소로 신청")!;
    await act(async () => btn.click());
    expect(sendApply).toHaveBeenCalledWith(BOX.id, "t".repeat(32));
    expect(refresh).toHaveBeenCalled();
  });

  it("INV-GB6: 등록 주소가 없으면 입력 칸이 먼저, 서버가 「주소 없음」으로 돌려보내면 입력 칸으로 돌아간다", async () => {
    render({}, { status: { registered: false, label: null, updatedAt: null } });
    expect(host.querySelector("[data-address-form]")).not.toBeNull();
    expect(buttons()).not.toContain("이 주소로 신청");

    sendApply.mockResolvedValue({ ok: false, status: 422, message: "받을 주소를 먼저 입력해 주세요.", noAddress: true });
    render({});
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === "이 주소로 신청")!;
    await act(async () => btn.click());
    expect(host.querySelector("[data-address-form]")).not.toBeNull();
    expect(host.textContent).toContain("받을 주소를 먼저 입력해 주세요.");
  });

  it("INV-GB4 S4b: 팔로우하지 않은 팬에게는 안내와 팔로우 버튼만 — 신청 폼이 열리지 않는다", () => {
    render({ viewer: "not_follower" });
    expect(host.textContent).toContain("팔로우한 팬만 신청할 수 있습니다.");
    expect(buttons()).toEqual(["팔로우"]);
    expect(host.querySelector("[data-address-form]")).toBeNull();
  });

  it("INV-GB9 S9c · Q6: 신청 뒤에는 「신청했습니다」와 신청 취소뿐, 마감 뒤에는 담긴 팬만 「준비」 — 다른 신청자 수는 없다", () => {
    render({ myState: "applied" });
    expect(host.textContent).toContain("신청했습니다.");
    expect(buttons()).toEqual(["신청 취소", "닫기", "신청 취소"]);
    expect(host.textContent).not.toMatch(/[0-9]+명/);
    render({ myState: "preparing", open: false });
    expect(host.textContent).toBe("선물이 준비되고 있어요.");
    render({ myState: "closed", open: false });
    expect(host.textContent).toBe("이번 선물함은 마감됐어요.");
    render({ myState: "none", open: false });
    expect(host.textContent).toBe("이번 선물함은 마감됐어요.");
  });

  it("Q5: 신청 취소는 확인 창의 「신청 취소」를 눌러야 보낸다", async () => {
    sendWithdraw.mockResolvedValue({ ok: true });
    render({ myState: "applied" });
    const all = [...host.querySelectorAll("button")].filter((b) => b.textContent === "신청 취소");
    const [open, confirm] = all;
    await act(async () => open.click());
    expect(sendWithdraw).not.toHaveBeenCalled();
    await act(async () => confirm.click());
    expect(sendWithdraw).toHaveBeenCalledWith(BOX.id);
  });

  it("로그인 안 함·크리에이터 계정·주인에게는 신청 폼이 없다", () => {
    render({ viewer: "guest" });
    expect(host.querySelector("a")?.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/gift-boxes/${BOX.id}`)}`);
    render({ viewer: "not_fan" });
    expect(host.textContent).toBe("팬 계정만 신청할 수 있습니다.");
    render({ viewer: "owner" });
    expect(host.querySelector("a")?.getAttribute("href")).toBe(`/creator/revgift-boxes/${BOX.id}`);
  });
});
