import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 돌아온 주소의 쿼리(?address=confirmed 등) — 시험마다 바꾼다
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/gifts/FC-7K3M9",
  useSearchParams: () => new URLSearchParams(query),
}));

import { parseFanGiftRows } from "@/entities/order/api/fan-gift-rows";
/** 승인 전에만 보이는 거절·기한 안내 첫 줄(문구 3 다듬은본) */
const RETURN_ON_REJECT_NOTICE = "크리에이터가 거절하거나 결제 후 7일 이내에 승인하지 않으면 선물 전달이 취소됩니다.";
import type { GiftBox } from "@/entities/parcel/model/box-rows";
import type { GiftPayment } from "@/entities/payment/model/gift-payment";
import { GiftStatusPage } from "./gift-status-page";

// 보낸 선물 상세 — 무엇이 언제 보이는지(UX 정돈 시범 진단 B-1~B-9, docs/ux/diagnosis-2026-10-22-pilot.md 2절 · states.md 1~3절).
// 받는 주소가 보이기 전(먼저 보내기 전)에는 송장번호 칸·찾기 칸이 없고, 이미 승인된 선물에는 거절 반송 안내가 없고,
// 거절·기한 지남 안내는 상자 상태에 맞는 문단만, 맨 아래에는 늘 「1:1 문의하기」.
// v41(2026-10-26 d136, docs/ux/pages/gifts-orderNo.md): 승인 전 표시(배지·「승인 필요」·노란 칸)는 승인 전에만, 주문번호는 선물 정보 카드에만.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  query = "";
  act(() => root.unmount());
  host.remove();
});

const ORDER = "FC-7K3M9";
function viewOf(over: Record<string, unknown> = {}) {
  return parseFanGiftRows(
    [
      {
        order_no: ORDER,
        creator_name: "하루",
        item_kind: "인형·굿즈",
        box_count: 1,
        has_electronics_or_metal: false,
        status: "registered",
        registered_at: "2026-10-22T01:10:00+00:00",
        approved_at: "2026-10-22T05:00:00+00:00",
        received_at: null,
        inspection_result: null,
        inspected_at: null,
        shipped_at: null,
        expected_arrival_date: null,
        delivery: null,
        fan_tracking_no: null,
        fan_send_ack_at: null,
        ...over,
      },
    ],
    "서울 금천구 가산디지털1로 123 팬꾹 사무실",
  )[0]!;
}

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const box = (over: Partial<GiftBox> = {}): GiftBox => ({
  boxId: B1,
  label: `${ORDER}-1`,
  tier: "small",
  waybillNo: null,
  state: "no_waybill",
  addressCode: "K7M3XA",
  sendAckNeeded: false,
  ...over,
});
const PAYMENT: GiftPayment = {
  orderNo: ORDER,
  paidKrw: 5900,
  paidAt: "2026-10-22T01:20:00+00:00",
  boxes: [
    { label: `${ORDER}-1`, tier: "small", amountKrw: 5900, missing: false },
  ],
  refunds: [],
};

type P = Partial<Parameters<typeof GiftStatusPage>[0]>;
function render(p: P = {}) {
  act(() =>
    root.render(
      <GiftStatusPage
        view={p.view ?? viewOf()}
        boxes={p.boxes ?? [box()]}
        memo={null}
        {...p}
      />,
    ),
  );
}

const summaries = () =>
  [...host.querySelectorAll("main summary")].map((s) => s.textContent);
const sec = (title: string) =>
  [...host.querySelectorAll("main h2")]
    .find((h) => h.textContent === title)
    ?.closest("[data-sec]") ?? null;
const ADDRESS_SHOWN_FOLDS = [
  "팬꾹으로 보낸 송장번호 (선택)",
  "주소 끝 6자리 없이 보낸 상자 찾기",
];

describe("B-2·B-3·B-8: 송장번호 칸과 찾기 칸은 팬꾹 주소가 보인 뒤에만", () => {
  it("B-2·B-3 (실패경로): 승인 전 · 먼저 보내기 전이면 두 칸 모두 없고 「먼저 보내기」 안내만 남는다", () => {
    render({
      view: viewOf({ approved_at: null }),
      boxes: [box({ addressCode: null, sendAckNeeded: true })],
    });
    expect(summaries()).toEqual([]);
    expect(
      [...host.querySelectorAll("main button")].map((b) => b.textContent),
    ).toContain("먼저 보내기");
  });

  it("B-2·B-3: 팬꾹 주소가 보이면(승인됨) 두 칸이 접힌 채 보인다", () => {
    render();
    expect(summaries()).toEqual(ADDRESS_SHOWN_FOLDS);
  });

  it("B-3 (실패경로): 입고 전 상자가 하나도 없으면 찾기 칸을 그리지 않는다 — 고를 상자가 없다", () => {
    render({ boxes: [box({ state: "received", addressCode: null })] });
    expect(summaries()).not.toContain("주소 끝 6자리 없이 보낸 상자 찾기");
  });

  it("B-2: 상자마다 — 팬꾹 주소가 보인 상자만 송장번호 칸이 있다", () => {
    render({
      boxes: [
        box(),
        box({
          boxId: B2,
          label: `${ORDER}-2`,
          state: "received",
          addressCode: null,
        }),
      ],
    });
    expect(
      summaries().filter((t) => t === "팬꾹으로 보낸 송장번호 (선택)"),
    ).toHaveLength(1);
  });
});

describe("B-1: 결제 직후 안내", () => {
  it("B-1: 결제하고 돌아왔고 먼저 보내기 전이면 「먼저 보내기」를 가리킨다", () => {
    render({
      paid: true,
      view: viewOf({ approved_at: null }),
      boxes: [box({ addressCode: null, sendAckNeeded: true })],
    });
    expect(
      host.querySelector('main [data-paid-line]')?.textContent,
    ).toBe(
      "결제가 완료되었습니다. 승인 전에 팬꾹으로 발송하려면 ‘먼저 보내기’를 눌러 주세요.",
    );
  });

  it("B-1: 결제하고 돌아왔고 팬꾹 주소가 보이면 팬꾹 주소를 가리킨다", () => {
    render({ paid: true });
    expect(host.querySelector("main [data-paid-line]")?.textContent).toBe(
      "결제가 완료되었습니다. 아래 팬꾹 주소로 상자를 보내 주세요.",
    );
  });

  it("B-1 (실패경로): 결제 직후가 아니면 안내 줄이 없다", () => {
    render();
    expect(host.querySelector("main [data-paid-line]")).toBeNull();
  });

  it("B-1: 안내 줄은 상태 판 바로 위다", () => {
    render({ paid: true });
    expect(
      host
        .querySelector("main [data-paid-line]")
        ?.nextElementSibling?.querySelector("#g-title"),
    ).not.toBeNull();
  });
});

describe("B-4: 「취소하기」는 글자 링크 모양", () => {
  it("B-4: 결제 카드 끝의 「취소하기」는 줄 버튼이 아니다 — 누르면 확인 단계는 그대로", () => {
    render({ payment: PAYMENT });
    const trigger = [...host.querySelectorAll("main button")].find(
      (b) => b.textContent === "취소하기",
    )!;
    expect(trigger.classList.contains("btn")).toBe(false);
    act(() => (trigger as HTMLButtonElement).click());
    expect(host.querySelector("main")?.textContent).toContain(
      "선물 전달을 취소할까요?",
    );
    expect(
      [...host.querySelectorAll("main button")].map((b) => b.textContent),
    ).toContain("선물 취소");
  });
});

describe("B-5: 거절 반송 안내는 승인 전에만", () => {
  it("B-5 (실패경로): 이미 승인된 선물에는 둘째 문단이 없다 — 첫 문단은 그대로", () => {
    render();
    const s = sec("발송 전 확인 사항");
    expect(s?.textContent).toContain("추가 상자는 새로 등록해 주세요.");
    expect(s?.textContent).not.toContain(RETURN_ON_REJECT_NOTICE);
  });

  it("B-5: 승인 전(먼저 보내기를 누름)이면 둘째 문단이 보인다", () => {
    render({
      view: viewOf({
        approved_at: null,
        fan_send_ack_at: "2026-10-22T02:00:00+00:00",
      }),
    });
    expect(sec("발송 전 확인 사항")?.textContent).toContain(
      RETURN_ON_REJECT_NOTICE,
    );
  });
});

describe("B-6: 거절·기한 지남 안내는 상자 상태에 맞는 문단만", () => {
  const ARRIVED = "도착한 상자는 확인한 반송 주소로";
  const NOT_YET = "미도착 상자는";
  const BEFORE = "팬꾹 주소가 표시되기 전에";

  it("B-6: 도착한 상자만 있으면 도착한 상자 문단만(첫 문단은 늘)", () => {
    render({
      view: viewOf({ status: "rejected" }),
      boxes: [box({ state: "return_waiting", addressCode: null })],
    });
    const t = sec("이 선물은 발송하지 마세요")?.textContent ?? "";
    expect(t).toContain(BEFORE);
    expect(t).toContain(ARRIVED);
    expect(t).not.toContain(NOT_YET);
  });

  it("B-6: 도착하지 않은 상자만 있으면 그 문단만", () => {
    render({
      view: viewOf({ status: "expired" }),
      boxes: [box({ addressCode: null })],
    });
    const t = sec("이 선물은 발송하지 마세요")?.textContent ?? "";
    expect(t).toContain(BEFORE);
    expect(t).toContain(NOT_YET);
    expect(t).not.toContain(ARRIVED);
  });

  it("B-6: 둘 다 있으면 둘 다", () => {
    render({
      view: viewOf({ status: "rejected" }),
      boxes: [
        box({ addressCode: null }),
        box({
          boxId: B2,
          label: `${ORDER}-2`,
          state: "return_waiting",
          addressCode: null,
        }),
      ],
    });
    const t = sec("이 선물은 발송하지 마세요")?.textContent ?? "";
    expect(t).toContain(ARRIVED);
    expect(t).toContain(NOT_YET);
  });
});

describe("B-7: 맨 아래 「1:1 문의하기」", () => {
  it.each([
    ["진행 중", {}],
    ["거절", { status: "rejected" }],
    ["취소", { status: "canceled" }],
  ])(
    "B-7: %s 상태에도 맨 아래에 1:1 문의로 가는 글자 링크가 있다",
    (_name, over) => {
      render({ view: viewOf(over) });
      const links = [...host.querySelectorAll("main a")];
      const last = links[links.length - 1];
      expect(last?.textContent).toBe("1:1 문의하기");
      expect(last?.getAttribute("href")).toBe("/support");
    },
  );
});

describe("v41 배치: 오른쪽 열은 「선물 정보」 카드 하나(design-rules 33절)", () => {
  const info = () => host.querySelector("#info-title")?.closest("section") ?? null;

  it("v41: 선물 정보 카드 첫 표는 받는 크리에이터·선물·상자·주문번호·등록 — 주문번호는 여기에만", () => {
    render({ payment: PAYMENT });
    const firstDl = info()?.querySelector(":scope > dl");
    expect([...(firstDl?.querySelectorAll(":scope > div > dt") ?? [])].map((d) => d.textContent)).toEqual([
      "받는 크리에이터",
      "선물",
      "상자",
      "주문번호",
      "등록",
      "크리에이터 승인",
    ]);
    const orderRow = [...(firstDl?.children ?? [])].find((d) => d.querySelector("dt")?.textContent === "주문번호");
    expect(orderRow?.querySelector("dd")?.textContent).toBe(ORDER);
    expect([...(firstDl?.children ?? [])].find((d) => d.querySelector("dt")?.textContent === "상자")?.querySelector("dd")?.textContent).toBe("소형 1개");
  });

  it("배치: 상자 칸 옆 한 열에 선물 정보 카드 하나 — 결제는 그 안 묶음", () => {
    render({ payment: PAYMENT });
    const side = host.querySelector("main [data-detail-side]");
    expect([...(side?.children ?? [])].map((c) => c.querySelector("h2")?.textContent)).toEqual(["선물 정보"]);
    expect(info()?.querySelector("#pay-title")?.textContent).toBe("결제");
    // 상자 칸은 그 열의 앞(같은 격자 안)
    expect(side?.previousElementSibling?.querySelector("#box-status-title")).not.toBeNull();
  });
});

describe("v41 INV-S9: 승인 전 표시 — 상태 판 배지 · 출고 아래 「승인 필요」 · 선물 정보 노란 칸", () => {
  const badges = () => [...host.querySelectorAll("main [data-badges] > span")].map((b) => b.textContent);
  const shippedStep = () => [...host.querySelectorAll("main ol > li")].find((li) => li.firstChild?.textContent === "출고") ?? null;
  const approvalBox = () => host.querySelector("#info-title")?.closest("section")?.querySelector("[data-approval-box]") ?? null;
  const BEFORE_SEND = { approved_at: null };
  const AFTER_SEND = { approved_at: null, fan_send_ack_at: "2026-10-22T02:00:00+00:00" };

  it("INV-S9: 먼저 보내기 전 — 배지는 「하루님 승인 대기」 하나, 큰 줄은 「하루님이 아직 승인하지 않았어요」", () => {
    render({ view: viewOf(BEFORE_SEND), boxes: [box({ addressCode: null, sendAckNeeded: true })] });
    expect(badges()).toEqual(["하루님 승인 대기"]);
    expect(host.querySelector("#g-title")?.closest("section")?.textContent).toContain("하루님이 아직 승인하지 않았어요");
  });

  it("INV-S9: 먼저 보내기 뒤에도 승인 전이면 「보내 주세요」 옆에 「하루님 승인 대기」가 남는다", () => {
    render({ view: viewOf(AFTER_SEND) });
    expect(badges()).toEqual(["보내 주세요", "하루님 승인 대기"]);
  });

  it("INV-S9 (실패경로): 승인된 선물에는 승인 대기 배지가 없다", () => {
    render();
    expect(badges()).toEqual(["보내 주세요"]);
  });

  it("INV-S9: 검수 뒤 승인 대기는 이름 붙은 배지 하나 — 「승인 대기」가 두 번 나오지 않는다", () => {
    render({
      view: viewOf({ approved_at: null, status: "inspected", received_at: "2026-10-23T01:00:00+00:00", inspection_result: "passed", inspected_at: "2026-10-23T02:00:00+00:00" }),
      boxes: [box({ state: "received", addressCode: null })],
    });
    expect(badges()).toEqual(["하루님 승인 대기"]);
  });

  it.each([
    ["먼저 보내기 전", BEFORE_SEND],
    ["먼저 보내기 뒤", AFTER_SEND],
  ])("INV-S9: 승인 전(%s)이면 진행 줄 「출고」 칸 안에 「승인 필요」 — 다른 단계에는 없다", (_n, over) => {
    render({ view: viewOf(over) });
    expect(shippedStep()?.querySelector("[data-approval-needed]")?.textContent).toBe("승인 필요");
    expect(host.querySelectorAll("main [data-approval-needed]")).toHaveLength(1);
  });

  it("INV-S9 (실패경로): 승인된 선물에는 「승인 필요」가 없다", () => {
    render();
    expect(shippedStep()).not.toBeNull();
    expect(host.querySelector("main [data-approval-needed]")).toBeNull();
  });

  it("INV-S9·S6: 승인 전이면 선물 정보 카드 안 노란 칸 — 지금 승인 대기 · 필요한 때 출고 전 · 기한(결제 완료 + 7일)", () => {
    render({ view: viewOf(AFTER_SEND), payment: PAYMENT });
    const b = approvalBox();
    expect(b?.querySelector("h3")?.textContent).toBe("하루님의 승인 상태");
    expect([...(b?.querySelectorAll("dl > div") ?? [])].map((d) => [d.querySelector("dt")?.textContent, d.querySelector("dd")?.textContent])).toEqual([
      ["지금", "승인 대기"],
      ["필요한 때", "출고 전"],
      ["기한", "10월 29일 (목)까지"],
    ]);
    expect(host.querySelector("main [data-approval-done]")).toBeNull();
    // 노란 칸은 첫 표 다음, 결제 묶음 앞
    expect(b?.nextElementSibling?.querySelector("#pay-title")).not.toBeNull();
  });

  it("INV-S9 (실패경로): 승인되면 노란 칸 대신 「승인됨 · 날짜」 한 줄", () => {
    render({ payment: PAYMENT });
    expect(approvalBox()).toBeNull();
    expect(host.querySelector("main [data-approval-done] dd")?.textContent).toBe("승인됨 · 10월 22일 (목)");
  });

  it.each([
    ["거절", { status: "rejected", approved_at: null }],
    ["기한 지남", { status: "expired", approved_at: null }],
    ["취소", { status: "canceled", approved_at: null }],
  ])("INV-S9 (실패경로): 완료된 선물(%s)에는 승인 칸·「승인 필요」·승인 대기 배지가 없다 — 선물 정보 카드는 그대로", (_n, over) => {
    render({ view: viewOf(over), boxes: [box({ addressCode: null })], payment: PAYMENT });
    expect(approvalBox()).toBeNull();
    expect(host.querySelector("main [data-approval-done]")).toBeNull();
    expect(host.querySelector("main [data-approval-needed]")).toBeNull();
    expect(badges().some((b) => b?.includes("승인 대기"))).toBe(false);
    expect(host.querySelector("#info-title")?.textContent).toBe("선물 정보");
  });
});

describe("v41: 두 코드 가르기 — 상자 이름에 주문번호가 없다", () => {
  it("v41: 상자 이름은 「상자 N · 크기」, 상태 판 위 줄에도 주문번호가 없다", () => {
    render({ boxes: [box(), box({ boxId: B2, label: `${ORDER}-2`, tier: "medium" })] });
    const names = [...host.querySelectorAll("main h3")].filter((h) => h.textContent?.startsWith("상자")).map((h) => h.textContent);
    expect(names).toEqual(["상자 1 · 소형", "상자 2 · 중형"]);
    expect(names.some((n) => n?.includes(ORDER))).toBe(false);
    expect(host.querySelector("#g-title")?.previousElementSibling?.textContent).toBe("등록 10월 22일 (목)");
  });

  it("INV-C2: 팬꾹 주소 6자리는 이름표 + 한 글자씩 칸, 처음엔 가려 두고 「6자리 보기」를 눌러야 보인다", () => {
    render();
    const addr = host.querySelector("main [data-box-address]");
    expect(addr?.textContent).toContain("팬꾹 주소 6자리");
    const cells = () => [...(addr?.querySelectorAll("[data-code6] > span[aria-hidden]") ?? [])].map((c) => c.textContent).join("");
    expect(cells()).toBe("••••••");
    expect(addr?.textContent).not.toContain("K7M3XA");
    const toggle = [...(addr?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "6자리 보기") as HTMLButtonElement;
    act(() => toggle.click());
    expect(cells()).toBe("K7M3XA");
    expect([...(addr?.querySelectorAll("ul > li") ?? [])].map((l) => l.textContent)).toEqual([
      "주소 끝 6자리는 상자를 확인하는 데 필요합니다. 빠짐없이 입력하고 다른 사람에게 공유하지 마세요.",
      "송장의 ‘보내는 분’에는 팬꾹 닉네임을 입력해 주세요.",
    ]);
  });
});

describe("INV-S6 S6c: 승인 기한(결제 완료 + 168시간)이 지났는데 자동 처리 전인 주문은 「기한 지남」", () => {
  // 등록 2026-10-22T01:10Z → 기한 2026-10-29T01:10Z
  const JUST_BEFORE = "2026-10-29T01:09:00.000Z";
  const JUST_AFTER = "2026-10-29T01:11:00.000Z";
  const badges = () => [...host.querySelectorAll("main [data-badges] > span")].map((b) => b.textContent);
  const buttons = () => [...host.querySelectorAll("main button")].map((b) => b.textContent);

  it("INV-S6 S6c: 기한 직전에는 아직 승인 대기 — 배지·노란 칸·「먼저 보내기」가 그대로", () => {
    render({ now: JUST_BEFORE, view: viewOf({ approved_at: null }), boxes: [box({ addressCode: null, sendAckNeeded: true })], payment: PAYMENT });
    expect(badges()).toEqual(["하루님 승인 대기"]);
    expect(host.querySelector("main [data-approval-box]")).not.toBeNull();
    expect(buttons()).toContain("먼저 보내기");
  });

  it("INV-S6 S6c (실패경로): 기한 직후에는 「기한 지남」 — 승인 대기 배지·노란 칸·「승인 필요」·「먼저 보내기」·팬꾹 주소가 없다", () => {
    render({ now: JUST_AFTER, view: viewOf({ approved_at: null, fan_send_ack_at: "2026-10-22T02:00:00+00:00" }), payment: PAYMENT });
    expect(badges()).toEqual(["기한 지남"]);
    expect(host.querySelector("#g-title")?.closest("section")?.textContent).toContain("기간이 지나 반려됐어요");
    expect(host.querySelector("main [data-approval-box]")).toBeNull();
    expect(host.querySelector("main [data-approval-needed]")).toBeNull();
    expect(host.querySelector("main [data-box-address]")).toBeNull();
    expect(buttons()).not.toContain("먼저 보내기");
    expect(sec("이 선물은 발송하지 마세요")).not.toBeNull();
  });

  it("INV-S6 S6c (실패경로): 승인된 주문은 기한이 지나도 그대로 진행 중", () => {
    render({ now: JUST_AFTER });
    expect(badges()).toEqual(["보내 주세요"]);
    expect(host.querySelector("main [data-box-address]")).not.toBeNull();
  });
});

describe("v41: 「주소 끝 6자리 없이 보낸 상자 찾기」 고르는 칸도 「상자 N · 크기」", () => {
  it("v41: 상자 고르기 목록에 주문번호가 없고 상세 상자 줄과 같은 번호", () => {
    render({ boxes: [box({ state: "received", addressCode: null }), box({ boxId: B2, label: `${ORDER}-2`, tier: "medium" })] });
    const options = [...(host.querySelector("main [data-finder] select")?.querySelectorAll("option") ?? [])].map((o) => o.textContent);
    expect(options).toEqual(["상자 2 · 중형"]);
  });
});

describe("결제 안내 문장 — 차액 안내는 진행 중에만", () => {
  const note = () => host.querySelector("#pay-title")?.closest("[role=group]")?.textContent ?? "";
  it("진행 중이면 결제한 날 + 차액 안내", () => {
    render({ payment: PAYMENT });
    expect(note()).toContain("결제일: 10월 22일 (목)");
    expect(note()).toContain("차액이 청구됩니다");
  });
  it("(실패경로) 완료된 선물에는 결제한 날만 — 차액 안내가 없다", () => {
    render({ view: viewOf({ status: "rejected" }), boxes: [box({ addressCode: null })], payment: PAYMENT });
    expect(note()).toContain("결제일: 10월 22일 (목)");
    expect(note()).not.toContain("차액이 청구됩니다");
  });
});

describe("INV-S9: 먼저 보내기 전 안내는 짧은 줄 셋", () => {
  it("INV-S9: 「하루님의 승인 대기 중입니다.」 + 줄 셋 + 「먼저 보내기」", () => {
    render({ view: viewOf({ approved_at: null }), boxes: [box({ addressCode: null, sendAckNeeded: true })] });
    const gate = host.querySelector('main [role="group"][aria-labelledby]');
    expect(gate?.querySelector("strong")?.textContent).toBe("하루님의 승인 대기 중입니다.");
    expect([...(gate?.querySelectorAll("ul > li") ?? [])].map((l) => l.textContent)).toEqual([
      "승인 전에도 팬꾹으로 선물을 발송할 수 있습니다. 크리에이터가 거절하면 반송됩니다.",
      "반송 시 반송 배송비를 차감해 환불합니다.",
      "승인을 기다린 뒤 발송해도 됩니다. 승인되면 팬꾹 주소가 표시됩니다.",
    ]);
    expect(gate?.querySelector("button")?.textContent).toBe("먼저 보내기");
  });
});

describe("C-1: 「아직 보내지 않음」을 누른 상자는 상자 줄에 그 날짜", () => {
  // 지금 할 일 줄은 누르면 없어진다(d113) — 누른 사실은 선물 상세 상자 줄에만 남는다(office-workflow INV-W10, 기한은 그대로).
  const boxLine = (label: string) =>
    [...host.querySelectorAll("main h3")].find((h) => h.textContent?.startsWith(label))?.parentElement ?? null;

  it("C-1: 누른 상자는 「아직 도착 전」 대신 「아직 보내지 않음 · 10월 23일」(서울 날짜)", () => {
    render({ boxes: [box({ notSentAt: "2026-10-22T16:30:00+00:00" })] });
    const line = boxLine("상자 1");
    expect(line?.textContent).toContain("아직 보내지 않음 · 10월 23일");
    expect(line?.textContent).not.toContain("아직 도착 전");
  });

  it("C-1 (실패경로): 누르지 않은 상자는 「아직 도착 전」 그대로 — 상자마다 따로", () => {
    render({
      boxes: [
        box({ notSentAt: "2026-10-22T03:00:00+00:00" }),
        box({ boxId: B2, label: `${ORDER}-2`, notSentAt: null }),
      ],
    });
    expect(boxLine("상자 1")?.textContent).toContain("아직 보내지 않음 · 10월 22일");
    expect(boxLine("상자 2")?.textContent).toContain("아직 도착 전");
    expect(boxLine("상자 2")?.textContent).not.toContain("아직 보내지 않음");
  });
});

describe("C-3: 반송 주소 확인 뒤 안내는 할 일 칸이 없어져도 보인다", () => {
  // 확인하면 그 할 일 줄이 원천 상태로 사라진다 — 그 주문의 마지막 할 일이면 칸이 통째로 없다(ui-reviewer 2026-10-22 지적 1).
  it("C-3: ?address=confirmed 로 열린 상세는 할 일 칸이 없어도 맨 위에 「반송 주소가 확인되었습니다.」", () => {
    query = "address=confirmed";
    render();
    const line = [...host.querySelectorAll("main [role=status]")].find((p) => p.textContent === "반송 주소가 확인되었습니다.");
    expect(line).toBeDefined();
    // 상태 판(하늘 판)보다 위
    expect(line!.compareDocumentPosition(host.querySelector("#g-title")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("C-3 (실패경로): 쿼리가 없으면 안내가 없다", () => {
    render();
    expect(host.querySelector("main")?.textContent).not.toContain("반송 주소가 확인되었습니다.");
  });
});
