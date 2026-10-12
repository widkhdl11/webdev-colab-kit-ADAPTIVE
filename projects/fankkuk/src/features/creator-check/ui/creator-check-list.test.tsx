import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatorCheckView } from "@/entities/parcel/model/creator-check";

// 확인할 선물 화면 (office-workflow INV-W4·W6, 2026-10-12 (2) 문제집 D3 ②).
// 서버로 가는 호출(sendCheckAnswer)만 가짜로 둔다 — 시험 대상은 어느 버튼이 어떤 확인 창을 열고 무엇을 보내는지, 기한이 지나면 버튼이 없는지다.
const api = vi.hoisted(() => ({ sendCheckAnswer: vi.fn() }));
vi.mock("../api/send-check-answer", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { CreatorCheckList } from "./creator-check-list";

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
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const NOW = "2026-10-12T03:00:00.000Z";
const row = (dueAt: string): CreatorCheckView => ({
  orderNo: "FC-7K3M9",
  boxSeq: 2,
  senderNickname: "별빛",
  itemKind: "인형",
  bluetooth: true,
  rf: false,
  askedAt: "2026-10-12T01:00:00.000Z",
  dueAt,
});
const OPEN = row("2026-10-19T01:00:00.000Z");

const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);
const rowButtons = () => [...host.querySelectorAll("li button")].map((b) => b.textContent);
const sheetTitle = () => host.querySelector("dialog[open] h2")?.textContent ?? null;
const sheetConfirm = () => host.querySelector<HTMLButtonElement>("dialog[open] .btn:not(.btn--soft)");

describe("확인할 선물 화면", () => {
  it("INV-W4: 줄마다 받기·돌려보내기 버튼, 받기는 「이 상자를 받을까요?」 창을 열고 확인하면 accept 를 보낸다", async () => {
    api.sendCheckAnswer.mockResolvedValueOnce({ kind: "ok" });
    act(() => root.render(<CreatorCheckList checks={[OPEN]} now={NOW} />));
    expect(rowButtons()).toEqual(["받기", "돌려보내기"]);
    act(() => button("받기")!.click());
    expect(sheetTitle()).toBe("이 상자를 받을까요?");
    await act(async () => sheetConfirm()!.click());
    expect(api.sendCheckAnswer).toHaveBeenCalledTimes(1);
    expect(api.sendCheckAnswer).toHaveBeenCalledWith("FC-7K3M9", 2, "accept");
    expect(host.querySelector("li")?.textContent).toContain("받기로 했어요");
  });

  it("INV-W4: 돌려보내기는 「이 상자를 돌려보낼까요?」 창을 열고 확인하면 return 을 보낸다", async () => {
    api.sendCheckAnswer.mockResolvedValueOnce({ kind: "ok" });
    act(() => root.render(<CreatorCheckList checks={[OPEN]} now={NOW} />));
    act(() => button("돌려보내기")!.click());
    expect(sheetTitle()).toBe("이 상자를 돌려보낼까요?");
    await act(async () => sheetConfirm()!.click());
    expect(api.sendCheckAnswer).toHaveBeenCalledWith("FC-7K3M9", 2, "return");
    expect(host.querySelector("li")?.textContent).toContain("돌려보내기로 했어요");
  });

  it("INV-W4 (실패경로): 서버가 거부하면 결과 문구로 바꾸지 않고 창에 거부 문구를 보인다", async () => {
    api.sendCheckAnswer.mockResolvedValueOnce({ kind: "refused", message: "이미 답한 상자예요." });
    act(() => root.render(<CreatorCheckList checks={[OPEN]} now={NOW} />));
    act(() => button("받기")!.click());
    await act(async () => sheetConfirm()!.click());
    expect(host.querySelector("dialog[open] [role=alert]")?.textContent).toContain("이미 답한 상자예요.");
    expect(rowButtons()).toEqual(["받기", "돌려보내기"]);
  });

  it("INV-W6 (실패경로): 기한(검수 완료 + 7일)이 지난 줄에는 버튼이 없다 — 정각부터", () => {
    act(() => root.render(<CreatorCheckList checks={[row(NOW)]} now={NOW} />));
    expect(rowButtons()).toEqual([]);
    expect(host.querySelector("li")?.textContent).toContain("답할 기한 지남");
  });
});
