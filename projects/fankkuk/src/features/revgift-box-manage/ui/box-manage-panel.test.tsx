import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyBox } from "@/entities/revgift-box/api/box-reads";

// 신청 관리 모달·읽기 전용 목록 (revgift-box INV-GB5·GB7·GB8·GB9). 서버로 가는 요청은 가짜로 둔다 — 시험 대상은 상태마다 보이는 것과 보내는 값이다.
const sendSetExcluded = vi.fn();
const sendCloseBox = vi.fn();
const sendCancelBox = vi.fn();
const sendRenewInvite = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock("../api/box-requests", () => ({
  sendSetExcluded: (...a: unknown[]) => sendSetExcluded(...a),
  sendCloseBox: (...a: unknown[]) => sendCloseBox(...a),
  sendCancelBox: (...a: unknown[]) => sendCancelBox(...a),
  sendRenewInvite: (...a: unknown[]) => sendRenewInvite(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

import { BoxManageDialog, BoxManagePanel, splitApplications } from "./box-manage-panel";

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

const A = "0d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";
const B = "1d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";
const W1 = "2d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";
const W2 = "3d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";
const BOX: MyBox = {
  id: "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10",
  name: "겨울 선물",
  description: null,
  capacity: 30,
  isPublic: false,
  status: "open",
  inviteToken: "a".repeat(32),
  createdAt: "2026-11-08T01:00:00Z",
  endedAt: null,
  inboundCode: null,
  cartonCount: null,
  cartonsReceived: 0,
  invoice: null,
  applications: [
    { id: A, nickname: "별빛", appliedAt: "2026-11-08T02:00:00Z", status: "applied", chosenTier: null, waitlistNo: null },
    { id: B, nickname: "달토끼", appliedAt: "2026-11-08T03:00:00Z", status: "excluded", chosenTier: null, waitlistNo: null },
  ],
};
const WAIT = [
  { id: W2, nickname: "딸기라떼", appliedAt: "2026-11-09T05:00:00Z", status: "waitlisted" as const, chosenTier: null, waitlistNo: 2 },
  { id: W1, nickname: "수박바", appliedAt: "2026-11-09T04:00:00Z", status: "waitlisted" as const, chosenTier: null, waitlistNo: 1 },
];
const URL_ = `http://localhost:3100/gift-boxes/${BOX.id}?invite=${"a".repeat(32)}`;

let host: HTMLDivElement;
let root: Root;
let mount = 0;
const onClose = vi.fn();
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  for (const f of [sendSetExcluded, sendCloseBox, sendCancelBox, sendRenewInvite, refresh, push, onClose]) f.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function renderDialog(box: Partial<MyBox> = {}) {
  mount += 1;
  act(() => root.render(<BoxManageDialog key={mount} box={{ ...BOX, ...box }} applyUrl={URL_} open onClose={onClose} />));
}
function renderPanel(box: Partial<MyBox> = {}) {
  mount += 1;
  act(() => root.render(<BoxManagePanel key={mount} box={{ ...BOX, ...box }} />));
}
const checks = () => [...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
const chip = (nick: string) => checks().find((c) => c.getAttribute("aria-label")?.startsWith(nick))!;
/** 신청 관리 모달 안 버튼(작은 확인 창 안 버튼은 뺀다) */
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text && !b.closest("[role=alertdialog]"));

describe("신청 관리 모달", () => {
  it("INV-GB7 S7: 신청 칩의 체크 해제가 제외 — 그 자리에서 그 신청 번호로 저장하고, 칩에 「제외됨」, 현황 수가 준다", async () => {
    renderDialog();
    expect(chip("별빛").checked).toBe(true);
    expect(chip("달토끼").checked).toBe(false);
    expect(chip("달토끼").closest("label")!.textContent).toContain("제외됨");
    expect(host.textContent).toContain("신청 1명");
    sendSetExcluded.mockResolvedValue({ kind: "ok", data: "excluded" });
    await act(async () => chip("별빛").click());
    expect(sendSetExcluded).toHaveBeenCalledWith(BOX.id, A, true);
    expect(chip("별빛").checked).toBe(false);
    expect(chip("별빛").closest("label")!.textContent).toContain("제외됨");
    expect(host.textContent).toContain("신청 0명");
    sendSetExcluded.mockResolvedValue({ kind: "ok", data: "applied" });
    await act(async () => chip("달토끼").click());
    expect(sendSetExcluded).toHaveBeenLastCalledWith(BOX.id, B, false);
    expect(chip("달토끼").checked).toBe(true);
  });

  it("INV-GB5 · GB7: 받을 인원이 다 찬 동안 제외된 칩은 다시 넣을 수 없다 — 체크가 막히고 칩에 이유 한 줄, 보내지 않는다", async () => {
    renderDialog({ capacity: 1 });
    expect(chip("달토끼").disabled).toBe(true);
    expect(chip("달토끼").getAttribute("aria-disabled")).toBe("true");
    expect(chip("달토끼").closest("label")!.textContent).toContain("받을 인원이 다 찼습니다");
    await act(async () => chip("달토끼").click());
    expect(sendSetExcluded).not.toHaveBeenCalled();
    // 신청 칩(제외 아님)은 그대로 누를 수 있다 — 빼면 자리가 나서 제외 칩이 다시 풀린다
    expect(chip("별빛").disabled).toBe(false);
    sendSetExcluded.mockResolvedValue({ kind: "ok", data: "excluded" });
    await act(async () => chip("별빛").click());
    expect(chip("달토끼").disabled).toBe(false);
    expect(chip("달토끼").closest("label")!.textContent).not.toContain("받을 인원이 다 찼습니다");
    // 자리가 있으면 처음부터 막지 않는다
    renderDialog();
    expect(chip("달토끼").disabled).toBe(false);
  });

  it("INV-GB5 (실패경로): 다시 넣기가 「다 참」으로 거부되면 그 문구, 칩은 제외 그대로", async () => {
    renderDialog();
    sendSetExcluded.mockResolvedValue({ kind: "refused", message: "받을 인원이 다 찼습니다." });
    await act(async () => chip("달토끼").click());
    expect(host.querySelector("[role=alert]")!.textContent).toBe("받을 인원이 다 찼습니다.");
    expect(chip("달토끼").checked).toBe(false);
  });

  it("INV-GB8: 「마감하기」 한 번이 확정 — 두 번째 확인 창 없이 고른 대기 신청 번호만 싣는다", async () => {
    sendCloseBox.mockResolvedValue({ kind: "ok", data: null });
    renderDialog({ applications: [...BOX.applications, ...WAIT] });
    // 대기 칩은 순번 순, 처음엔 아무도 고르지 않았다
    const waitNames = [...host.querySelectorAll("section")][1].querySelectorAll("label");
    expect([...waitNames].map((l) => l.textContent)).toEqual([expect.stringContaining("수박바"), expect.stringContaining("딸기라떼")]);
    expect(host.textContent).toContain("보낼 팬 1명 + 대기 0명 = 1명");
    await act(async () => chip("수박바").click());
    expect(host.textContent).toContain("보낼 팬 1명 + 대기 1명 = 2명");
    await act(async () => button("마감하기")!.click());
    expect(sendCloseBox.mock.calls).toEqual([[BOX.id, [W1]]]);
    expect(host.querySelector("[role=alertdialog][open]")).toBeNull();
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(`/creator/revgift-boxes/${BOX.id}`);
  });

  it("INV-GB8 (실패경로): 마감이 거부되면 문구를 보이고 창은 닫지 않는다", async () => {
    sendCloseBox.mockResolvedValue({ kind: "refused", message: "이미 마감된 선물함입니다." });
    renderDialog();
    await act(async () => button("마감하기")!.click());
    expect(host.querySelector("[role=alert]")!.textContent).toBe("이미 마감된 선물함입니다.");
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("INV-GB8: 신청 0명 — 안내 한 줄과 함께 마감하기가 눌리고 빈 목록으로 보낸 뒤 목록을 다시 읽는다", async () => {
    sendCloseBox.mockResolvedValue({ kind: "ok", data: null });
    renderDialog({ applications: [] });
    expect(host.textContent).toContain("아직 신청한 팬이 없습니다.");
    expect(host.textContent).toContain("신청한 팬이 없습니다. 마감하면 이 선물함은 끝납니다.");
    expect(button("마감하기")!.hasAttribute("disabled")).toBe(false);
    await act(async () => button("마감하기")!.click());
    expect(sendCloseBox).toHaveBeenCalledWith(BOX.id, []);
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("INV-GB9 S9: 칩에는 닉네임·신청 시각·순번뿐 — 링크 복사는 0명이면 채움, 신청이 있으면 테두리", () => {
    renderDialog({ applications: [...BOX.applications, ...WAIT] });
    const labels = [...host.querySelectorAll("label")].filter((l) => l.querySelector("input[type=checkbox]"));
    for (const l of labels) expect(l.textContent).toMatch(/^\d?(별빛|달토끼|수박바|딸기라떼)(제외됨 · |대기 \d번 · )?\d+월 \d+일 \d{2}:\d{2}$/);
    expect(button("링크 복사")!.className).toContain("btn--line");
    renderDialog({ applications: [] });
    expect(button("링크 복사")!.className).not.toContain("btn--line");
  });

  it("선물함 취소는 작은 확인 창의 「선물함 취소」를 눌러야 보낸다", async () => {
    sendCancelBox.mockResolvedValue({ kind: "ok", data: null });
    renderDialog();
    await act(async () => button("선물함 취소")!.click());
    expect(sendCancelBox).not.toHaveBeenCalled();
    const confirm = [...host.querySelectorAll("[role=alertdialog] button")].find((b) => b.textContent === "선물함 취소") as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(sendCancelBox).toHaveBeenCalledWith(BOX.id);
    expect(refresh).toHaveBeenCalled();
  });

  it("INV-GB5: 대기는 신청 받는 중일 때만 대기로 나뉜다 — 마감 뒤 waitlisted 는 어느 쪽에도 없다", () => {
    const open = splitApplications({ status: "open", applications: [...BOX.applications, ...WAIT] });
    expect(open.applicants.map((a) => a.id)).toEqual([A, B]);
    expect(open.waitlist.map((a) => a.id)).toEqual([W1, W2]);
    const closed = splitApplications({ status: "closed", applications: [...BOX.applications, ...WAIT] });
    expect(closed.waitlist).toEqual([]);
    expect(closed.applicants.map((a) => a.id)).toEqual([A, B]);
  });
});

describe("신청 받는 중이 아닌 선물함 — 읽기 전용", () => {
  it("INV-GB1 · Q21: 0명 마감(closed + 끝난 시각)에는 선물함 취소가 없다 — 끝난 시각이 없는 마감에는 있다", () => {
    renderPanel({ status: "closed", endedAt: "2026-11-10T01:00:00Z", applications: [] });
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "선물함 취소" && !b.closest("dialog"))).toBe(false);
    renderPanel({ status: "closed", endedAt: null });
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "선물함 취소" && !b.closest("dialog"))).toBe(true);
  });

  it("INV-GB7 · INV-GB1: 마감 뒤에는 체크·마감·링크가 없고 선물함 취소만, 결제 요청 뒤에는 취소도 없다", () => {
    renderPanel({ status: "closed", applications: [{ ...BOX.applications[0], status: "selected" }, BOX.applications[1]] });
    expect(checks()).toEqual([]);
    expect(button("마감하기")).toBeUndefined();
    expect(host.textContent).not.toContain(URL_);
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "선물함 취소" && !b.closest("dialog"))).toBe(true);
    expect(host.querySelector(".tag")?.textContent).toBe("제외");
    renderPanel({ status: "invoiced" });
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "선물함 취소" && !b.closest("dialog"))).toBe(false);
  });
});
