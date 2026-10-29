import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatorActionItem } from "@/entities/action-item/model/creator-action-items";

// 크리에이터 처리할 일 화면 (action-center INV-J5~J8, design-rules 13절). 줄은 처리할 일 읽기 결과 그대로 — 판·순서·숫자를 화면이 바꾸지 않는다.
// 서버로 가는 호출은 가짜로 둔다 — 시험 대상은 줄의 글·버튼·창과, 고르기·취소가 정해진 처리(블루투스 고르기 함수)를 부르는지다.
const sendCheckChoice = vi.fn();
const refresh = vi.fn();
vi.mock("@/features/creator-check/api/send-check-choice", () => ({ sendCheckChoice: (...a: unknown[]) => sendCheckChoice(...a) }));
const sendReturnConfirm = vi.fn();
vi.mock("@/features/return-address/api/send-return-confirm", () => ({ sendReturnConfirm: (...a: unknown[]) => sendReturnConfirm(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));
// 승인 창이 열릴 때 이어 볼 서명 요청을 묻는다 — 없음으로 답한다
vi.mock("@/features/approval-request/api/approval-sign-client", () => ({
  checkSign: async () => ({ kind: "view", view: { state: "none" } }),
  startSign: async () => ({ kind: "failed" }),
}));

import { CreatorActionCenterPage } from "./creator-action-center-page";

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
  sendCheckChoice.mockReset();
  sendReturnConfirm.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const NOW = "2026-10-16T03:00:00.000Z";
const prior = { gifts: 3, passed: 3, returned: 0 };
const BT_OPEN: CreatorActionItem = {
  kind: "bluetooth",
  orderNo: "FC-BT1",
  boxSeq: 1,
  boxCount: 2,
  nickname: "별사탕",
  itemKind: "인형·쿠션",
  tier: "medium",
  bluetooth: true,
  rf: false,
  choice: null,
  sentAt: "2026-10-12T01:00:00.000Z",
  receivedAt: "2026-10-13T01:00:00.000Z",
  dueAt: "2026-10-20T14:59:00.000Z",
  priorHistory: prior,
};
const BT_PICKED: CreatorActionItem = { ...BT_OPEN, orderNo: "FC-BT2", nickname: "꿀단지", itemKind: "전자기기", boxCount: 1, choice: "accept" };
const APPROVAL: CreatorActionItem = {
  kind: "approval",
  orderNo: "FC-AP1",
  requestId: "apr_FCAP1",
  boxCount: 1,
  nickname: "다온",
  itemKind: "문구",
  hasElectronicsOrMetal: false,
  sentAt: "2026-10-12T05:20:00.000Z",
  receivedAt: null,
  dueAt: "2026-10-19T05:20:00.000Z",
  priorHistory: { gifts: 0, passed: 0, returned: 0 },
};
const UNCONFIRMED: CreatorActionItem = { kind: "unconfirmed", orderNo: "RG-UN1", shareId: "11111111-1111-4111-8111-111111111111", nickname: "모카", tier: "small", sentAt: "2026-10-02T01:00:00.000Z" };
const ALL = [BT_OPEN, BT_PICKED, APPROVAL, UNCONFIRMED];

const exactButton = (scope: ParentNode, text: string) => [...scope.querySelectorAll("button")].find((b) => b.textContent === text);

function render(items: readonly CreatorActionItem[], openOrderNo: string | null = null) {
  act(() =>
    root.render(
      <CreatorActionCenterPage
        items={items}
        now={NOW}
        candidates={[{ shareId: UNCONFIRMED.kind === "unconfirmed" ? UNCONFIRMED.shareId : "", nickname: "모카", tier: "small" }]}
        address={null}
        sealingKeyPem={null}
        openOrderNo={openOrderNo}
      />,
    ),
  );
}
const rows = () => [...host.querySelectorAll("[data-row]")];
const button = (scope: ParentNode, text: string) => [...scope.querySelectorAll("button")].find((b) => b.textContent === text);

describe("크리에이터 처리할 일 화면 (INV-J5·J6)", () => {
  it("INV-J6: 제목 숫자·구간 숫자는 읽기 결과의 줄 수 — 확인할 상자 2 · 승인 요청 판 1 · 보낸 선물 1, 순서는 받은 그대로", () => {
    render(ALL);
    expect(host.querySelector("h1")?.textContent).toBe("지금 할 일4건");
    // v37 A안: 가장 급한 승인 요청은 하늘 판 하나(그 판이 곧 그 줄), 나머지 구간은 머리에 「N건」
    const panels = [...host.querySelectorAll("section")].map((p) => `${p.querySelector("h2")?.textContent}:${p.hasAttribute("data-row") ? 1 : p.querySelectorAll("[data-row]").length}`);
    expect(panels).toEqual(["받은 선물2건:2", "다온님의 선물 승인 요청:1", "보낸 선물1건:1"]);
    expect(rows().map((r) => r.querySelector("[data-title]")?.textContent)).toEqual([
      "별사탕님 선물 · 블루투스 기기 발견",
      "꿀단지님 선물 · 블루투스 기기 발견",
      "다온님의 선물 승인 요청",
      "모카님께 보낸 상자 미도착",
    ]);
  });

  it("INV-J5: 줄 아래 글은 「종류 · 남은 날 · 물품·상자」 — 블루투스는 상자 몇 번째와 추적기 아님, 승인은 상자 수", () => {
    render(ALL);
    const [bt, , ap] = rows();
    expect(bt!.textContent).toContain("기기 발견");
    expect(bt!.textContent).toContain("4일 남음");
    expect(bt!.textContent).toContain("인형·쿠션 · 상자 2개 중 1번 · 추적 장치 아님");
    expect(ap!.textContent).toContain("승인 요청");
    expect(ap!.textContent).toContain("3일 남음");
    // 하늘 판은 물품·상자·전자기기를 세 칸으로(design-rules 23-3)
    expect([...ap!.querySelectorAll("dt")].map((dt) => `${dt.textContent}=${dt.nextElementSibling?.textContent}`)).toEqual(["선물 종류=문구", "상자=1개", "전자기기·금속=없음"]);
  });

  it("INV-J7 (실패경로): 미확인 상자 줄은 상자가 있다고 말하지 않는다 — 「아직 안 왔어요 · 미도착 상자 찾기」, 도착일·찾기 권유가 없다(카드 d96 ②)", () => {
    render(ALL);
    const un = rows()[3]!;
    expect(un.textContent).toContain("모카님께 보낸 상자 미도착");
    // 카드 d96 ②: 14일 줄은 찾기를 권하지 않는다 — 「미도착 상자 찾기」만, 버튼은 「내 상자 찾기」
    expect(un.textContent).not.toMatch(/팬꾹 주소 없이 보냈다면/);
    expect(button(un, "내 상자 찾기")).toBeDefined();
    expect(un.textContent).toContain("10월 2일 결제 완료");
    expect(un.textContent).not.toMatch(/상자가 있어요|사무실 도착|미확인|코드 없이/);
  });

  it("INV-J8: 고른 블루투스 줄은 「받기 선택」 알약과 「취소」 — 취소는 고르기 함수의 취소를 부르고 목록을 새로 읽는다", async () => {
    sendCheckChoice.mockResolvedValue({ kind: "ok" });
    render(ALL);
    const picked = rows()[1]!;
    expect(picked.textContent).toContain("받기 선택");
    expect(button(picked, "받을지 정하기")).toBeUndefined();
    await act(async () => button(picked, "선택 취소")!.click());
    expect(sendCheckChoice).toHaveBeenCalledWith({ action: "cancel", orderNo: "FC-BT2", boxSeq: 1 });
    expect(refresh).toHaveBeenCalled();
  });

  it("INV-J8 · INV-W13: 「받을지 정하기」 창에서 받기를 고르면 고르기 함수를 부르고 「받기 선택」·취소 단계 — 상자를 움직이는 처리는 부르지 않는다", async () => {
    sendCheckChoice.mockResolvedValue({ kind: "ok" });
    render(ALL);
    act(() => button(rows()[0]!, "받을지 정하기")!.click());
    const d = host.querySelector("dialog[open]")!;
    expect(d.querySelector("h2")?.textContent).toBe("탐지기 반응 물품 확인");
    const kv = [...d.querySelectorAll("dt")].map((dt) => `${dt.textContent}=${dt.nextElementSibling?.textContent}`);
    expect(kv).toEqual(["선물 종류=인형·쿠션", "상자=2개 중 1번 · 중형", "등록일=10월 12일", "팬꾹 도착일=10월 13일", "발견 물품=블루투스 기기", "검수 결과=추적 장치 아님", "기한=10월 20일 오후 11시 59분 · 4일 남음"]);
    await act(async () => button(d, "받기")!.click());
    expect(sendCheckChoice).toHaveBeenCalledWith({ action: "choose", choice: "accept", orderNo: "FC-BT1", boxSeq: 1 });
    expect(d.textContent).toContain("받기 선택");
    expect(d.textContent).toContain("팬꾹이 처리하기 전까지 선택을 취소할 수 있습니다.");
    await act(async () => button(d, "선택 취소")!.click());
    expect(sendCheckChoice).toHaveBeenLastCalledWith({ action: "cancel", orderNo: "FC-BT1", boxSeq: 1 });
    expect(button(d, "받기")).toBeDefined();
  });

  it("INV-W13 (실패경로): 서버가 거부하면(팬꾹이 이미 처리) 단계를 바꾸지 않고 이유를 보인다", async () => {
    sendCheckChoice.mockResolvedValue({ kind: "refused", message: "팬꾹에서 이미 처리한 상자입니다." });
    render(ALL);
    act(() => button(rows()[0]!, "받을지 정하기")!.click());
    const d = host.querySelector("dialog[open]")!;
    await act(async () => button(d, "받지 않기")!.click());
    expect(d.querySelector("[role=alert]")?.textContent).toContain("팬꾹에서 이미 처리한 상자입니다.");
    expect(d.textContent).not.toContain("받지 않기 선택");
  });

  it("INV-J7: 미확인 상자 창 — 그 줄의 팬이 먼저 골라져 있고, 칸은 택배사·송장번호·팬 고르기, 도착일 없음", () => {
    render(ALL);
    act(() => button(rows()[3]!, "내 상자 찾기")!.click());
    const d = host.querySelector("dialog[open]")!;
    expect(d.querySelector("h2")?.textContent).toBe("내 상자 찾기");
    expect(d.textContent).not.toContain("사무실 도착");
    expect(d.querySelector<HTMLInputElement>("input[type=radio]")?.checked).toBe(true);
    expect(d.textContent).toContain("모카님 · 소형");
    expect(button(d, "상자 찾기")).toBeDefined();
  });

  it("INV-J8: 하늘 판의 「받지 않기」는 같은 승인 창을 받지 않기 확인부터 열고, 「승인하기」는 거절·승인 고르기부터 연다", () => {
    render(ALL);
    const hero = rows()[2]!;
    act(() => button(hero, "받지 않기")!.click());
    let d = host.querySelector("dialog[open]")!;
    expect(d.textContent).toContain("이 선물을 거절할까요?");
    expect(button(d, "돌아가기")).toBeDefined();
    act(() => button(d, "돌아가기")!.click());
    expect(exactButton(d, "승인")).toBeDefined();
    act(() => d.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!.click());
    act(() => button(hero, "승인하기")!.click());
    d = host.querySelector("dialog[open]")!;
    expect(d.textContent).not.toContain("이 선물을 거절할까요?");
    expect(exactButton(d, "승인")).toBeDefined();
  });

  it("INV-N9: 알림톡 [승인 화면 열기](?order=주문번호)로 오면 그 주문의 승인 창이 처음부터 열린다", () => {
    render(ALL, "FC-AP1");
    const d = host.querySelector("dialog[open]");
    expect(d?.querySelector("h2")?.textContent).toBe("승인 요청");
    expect(d?.textContent).toContain("다온님");
    expect(exactButton(d!, "거절")).toBeDefined();
    expect(exactButton(d!, "승인")).toBeDefined();
  });

  it("INV-N9 (실패경로): 그 주문이 이 크리에이터의 승인 요청 줄이 아니면(남의 주문·이미 처리·승인 요청 아닌 줄) 창을 열지 않고 목록만", () => {
    for (const orderNo of ["FC-NOPE1", "FC-BT1", null]) {
      render(ALL, orderNo);
      expect(host.querySelector("dialog[open]"), String(orderNo)).toBeNull();
      expect(rows().length).toBeGreaterThan(0);
    }
  });

  it("INV-J6: 줄이 없으면 빈 상태 하나 — 판도 숫자도 없다", () => {
    render([]);
    expect(host.querySelector("h1")?.textContent).toBe("지금 할 일");
    expect(host.textContent).toContain("현재 처리할 일이 없습니다");
    expect(rows()).toHaveLength(0);
  });
});

describe("리뷰 반영 — 판 숫자 낭독·찾기 창 오류", () => {
  it("구간 머리 숫자는 「N건」 글자로 제목 안에 보인다 — 낭독기도 같은 글자를 읽는다(v37: 검은 숫자 동그라미를 없앴다)", () => {
    render(ALL);
    const h2 = [...host.querySelectorAll("section")][0]!.querySelector("h2")!;
    expect(h2.querySelector("small")?.textContent).toBe("2건");
    expect(h2.querySelector("[aria-hidden=true]")).toBeNull();
  });

  it("찾기 창에서 팬을 고르지 않고 보내면 오류가 라디오들에 이어지고(aria-describedby) 초점은 첫 라디오로", async () => {
    act(() =>
      root.render(
        <CreatorActionCenterPage
          items={[UNCONFIRMED]}
          now={NOW}
          candidates={[
            { shareId: "22222222-2222-4222-8222-222222222222", nickname: "라온", tier: "small" },
            { shareId: "33333333-3333-4333-8333-333333333333", nickname: "새벽달", tier: "medium" },
          ]}
          address={null}
          sealingKeyPem={null}
        />,
      ),
    );
    act(() => button(rows()[0]!, "내 상자 찾기")!.click());
    const d = host.querySelector("dialog[open]")!;
    const select = d.querySelector("select")!;
    act(() => {
      select.value = "cj";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const input = d.querySelector<HTMLInputElement>("input[name=waybill]")!;
    input.value = "123456789012";
    await act(async () => d.querySelector("form")!.requestSubmit());
    const radios = [...d.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    const errId = radios[0]!.getAttribute("aria-describedby");
    expect(errId).toBeTruthy();
    expect(radios.every((r) => r.getAttribute("aria-describedby") === errId)).toBe(true);
    expect(d.querySelector(`[id="${errId}"]`)?.textContent).toContain("상자를 받을 팬을 선택해 주세요");
    expect(document.activeElement).toBe(radios[0]);
  });
});

const TRACKER: CreatorActionItem = { ...(BT_OPEN as Extract<CreatorActionItem, { kind: "bluetooth" }>), kind: "tracker", orderNo: "FC-TR1", nickname: "새벽", choice: null };
const TRACKER_PICKED: CreatorActionItem = { ...TRACKER, orderNo: "FC-TR2", nickname: "노을", choice: "report" };
const RETURN_SHARE: CreatorActionItem = {
  kind: "return_address",
  orderNo: "RG-R5",
  shareId: "33333333-3333-4333-8333-333333333333",
  boxId: null,
  boxSeq: null,
  boxLabel: null,
  nickname: "별빛",
  tier: "small",
  dueAt: "2026-11-15T15:30:00.000Z",
  sentAt: "2026-10-01T01:00:00.000Z",
};
const RETURN_BOX: CreatorActionItem = { ...RETURN_SHARE, orderNo: "FC-R6", shareId: null, boxId: "44444444-4444-4444-8444-444444444444", boxSeq: 2, boxLabel: "FC-R6-2", nickname: "하루" };

describe("추적 장치 발견 줄 (action-center INV-J5·J8, office-workflow INV-W14)", () => {
  it("INV-J5: 받은 선물 판 맨 위, 제목·종류는 용어집 표기(추적 장치 발견) — 판 숫자에 들어간다", () => {
    render([TRACKER, BT_OPEN, APPROVAL]);
    const first = rows()[0]!;
    expect(first.textContent).toContain("새벽님 선물 · 추적 장치 발견");
    expect(first.textContent).toContain("추적 장치 발견");
    expect(first.textContent).not.toContain("위치 추적기");
    // 추적 장치 줄은 받은 선물 구간 숫자에 들어간다(승인 요청은 그 아래 하늘 판)
    expect(host.querySelector("section h2 small")?.textContent).toBe("2건");
  });

  it("INV-W14: 창에서 「신고하기」를 고르면 고르기 함수에 report 를 보내고 「신고하기 선택」·취소 단계", async () => {
    sendCheckChoice.mockResolvedValue({ kind: "ok" });
    render([TRACKER]);
    await act(async () => button(rows()[0]!, "신고할지 정하기")!.click());
    const dlg = document.querySelector("dialog[open]")!;
    expect(dlg.textContent).toContain("신고 여부를 선택해 주세요");
    expect(button(dlg, "신고하지 않기")).toBeDefined();
    await act(async () => button(dlg, "신고하기")!.click());
    expect(sendCheckChoice).toHaveBeenCalledWith({ action: "choose", choice: "report", orderNo: "FC-TR1", boxSeq: 1 });
    expect(dlg.textContent).toContain("신고하기 선택");
    expect(button(dlg, "선택 취소")).toBeDefined();
  });

  it("INV-W14: 「신고하지 않기」는 no_report 를 보낸다", async () => {
    sendCheckChoice.mockResolvedValue({ kind: "ok" });
    render([TRACKER]);
    await act(async () => button(rows()[0]!, "신고할지 정하기")!.click());
    const dlg = document.querySelector("dialog[open]")!;
    await act(async () => button(dlg, "신고하지 않기")!.click());
    expect(sendCheckChoice).toHaveBeenCalledWith({ action: "choose", choice: "no_report", orderNo: "FC-TR1", boxSeq: 1 });
  });

  it("INV-J5·J8: 고른 줄은 「신고하기 선택」과 「취소」 — 취소는 고르기 함수의 취소를 부른다", async () => {
    sendCheckChoice.mockResolvedValue({ kind: "ok" });
    render([TRACKER_PICKED]);
    const row = rows()[0]!;
    expect(row.textContent).toContain("신고하기 선택");
    expect(button(row, "신고할지 정하기")).toBeUndefined();
    await act(async () => button(row, "선택 취소")!.click());
    expect(sendCheckChoice).toHaveBeenCalledWith({ action: "cancel", orderNo: "FC-TR2", boxSeq: 1 });
  });
});

describe("보낸 선물의 반송 주소 줄 (action-center INV-J5, office-workflow INV-W15)", () => {
  it("INV-J5: 보낸 역조공·보낸 팬 선물 상자 줄이 보낸 선물 판에 — 종류 「반송 주소 확인」, 처분 예정 날짜 문장", () => {
    render([UNCONFIRMED, RETURN_SHARE, RETURN_BOX]);
    const [, share, box] = rows();
    expect(share!.textContent).toContain("별빛님께 보낸 역조공");
    expect(box!.textContent).toContain("하루님께 보낸 선물 · 상자 2");
    for (const r of [share!, box!]) {
      expect(r.textContent).toContain("반송 주소 확인");
      expect(r.textContent).toContain("11월 16일까지 미확인 시 처분 대상");
    }
    expect(host.querySelector("section h2 small")?.textContent).toBe("3건");
  });

  it("INV-W15·J4: 역조공 줄의 확인은 주문번호만, 팬 선물 상자 줄은 상자 순번까지 보낸다", async () => {
    sendReturnConfirm.mockResolvedValue({ kind: "ok" });
    const registered = { creatorId: "c1", registered: true, label: "home" as const, updatedAt: "2026-10-03T05:00:00Z" };
    act(() => root.render(<CreatorActionCenterPage items={[RETURN_SHARE, RETURN_BOX]} now={NOW} candidates={[]} address={registered} sealingKeyPem={null} />));
    for (const [i, want] of [[0, { orderNo: "RG-R5" }], [1, { orderNo: "FC-R6", boxSeq: 2 }]] as const) {
      await act(async () => button(rows()[i]!, "확인하기")!.click());
      const dlg = document.querySelector("dialog[open]")!;
      await act(async () => button(dlg, "주소 확인")!.click());
      expect(sendReturnConfirm).toHaveBeenLastCalledWith(want);
    }
  });
});
