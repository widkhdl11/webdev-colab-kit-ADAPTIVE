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
import { RETURN_ON_REJECT_NOTICE } from "@/entities/order/ui/fan-stage-copy";
import type { GiftBox } from "@/entities/parcel/model/box-rows";
import type { GiftPayment } from "@/entities/payment/model/gift-payment";
import { GiftStatusPage } from "./gift-status-page";

// 보낸 선물 상세 — 무엇이 언제 보이는지(UX 정돈 시범 진단 B-1~B-9, docs/ux/diagnosis-2026-10-22-pilot.md 2절 · states.md 1~3절).
// 받는 주소가 보이기 전(먼저 보내기 전)에는 송장번호 칸·찾기 칸이 없고, 이미 승인된 선물에는 거절 반송 안내가 없고,
// 거절·기한 지남 안내는 상자 상태에 맞는 문단만, 주문 정보는 상태 판에 없는 두 줄만, 맨 아래에는 늘 「1:1 문의하기」.

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
  "이 상자를 보낸 택배 송장번호",
  "팬꾹 주소 없이 보냈다면",
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
    expect(summaries()).not.toContain("팬꾹 주소 없이 보냈다면");
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
      summaries().filter((t) => t === "이 상자를 보낸 택배 송장번호"),
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
      "결제가 끝났어요. 먼저 보내려면 아래 「먼저 보내기」를 눌러 주세요.",
    );
  });

  it("B-1: 결제하고 돌아왔고 팬꾹 주소가 보이면 팬꾹 주소를 가리킨다", () => {
    render({ paid: true });
    expect(host.querySelector("main [data-paid-line]")?.textContent).toBe(
      "결제가 끝났어요. 아래 팬꾹 주소로 상자를 보내 주세요.",
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
      "이 선물을 취소할까요?",
    );
    expect(
      [...host.querySelectorAll("main button")].map((b) => b.textContent),
    ).toContain("네, 취소할게요");
  });
});

describe("B-5: 거절 반송 안내는 승인 전에만", () => {
  it("B-5 (실패경로): 이미 승인된 선물에는 둘째 문단이 없다 — 첫 문단은 그대로", () => {
    render();
    const s = sec("보내기 전에 알아 두세요");
    expect(s?.textContent).toContain("상자를 더 보내려면 새로 등록해 주세요.");
    expect(s?.textContent).not.toContain(RETURN_ON_REJECT_NOTICE);
  });

  it("B-5: 승인 전(먼저 보내기를 누름)이면 둘째 문단이 보인다", () => {
    render({
      view: viewOf({
        approved_at: null,
        fan_send_ack_at: "2026-10-22T02:00:00+00:00",
      }),
    });
    expect(sec("보내기 전에 알아 두세요")?.textContent).toContain(
      RETURN_ON_REJECT_NOTICE,
    );
  });
});

describe("B-6: 거절·기한 지남 안내는 상자 상태에 맞는 문단만", () => {
  const ARRIVED = "사무실에 도착한 상자는";
  const NOT_YET = "아직 도착하지 않은 상자는";
  const BEFORE = "팬꾹 주소가 보이기 전에 끝났다면";

  it("B-6: 도착한 상자만 있으면 도착한 상자 문단만(첫 문단은 늘)", () => {
    render({
      view: viewOf({ status: "rejected" }),
      boxes: [box({ state: "return_waiting", addressCode: null })],
    });
    const t = sec("이 선물은 보내지 마세요")?.textContent ?? "";
    expect(t).toContain(BEFORE);
    expect(t).toContain(ARRIVED);
    expect(t).not.toContain(NOT_YET);
  });

  it("B-6: 도착하지 않은 상자만 있으면 그 문단만", () => {
    render({
      view: viewOf({ status: "expired" }),
      boxes: [box({ addressCode: null })],
    });
    const t = sec("이 선물은 보내지 마세요")?.textContent ?? "";
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
    const t = sec("이 선물은 보내지 마세요")?.textContent ?? "";
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

describe("B-9 · 배치: 주문 정보는 두 줄, 결제 위·주문 정보 아래 한 열", () => {
  it("B-9: 주문 정보에는 상태 판에 없는 「등록」·「크리에이터 승인」만", () => {
    render({ payment: PAYMENT });
    const info = host.querySelector("#info-title")?.closest("section");
    expect(
      [...(info?.querySelectorAll("dt") ?? [])].map((d) => d.textContent),
    ).toEqual(["등록", "크리에이터 승인"]);
  });

  it("배치: 상자 칸 옆 한 열에 결제 카드가 위, 주문 정보가 아래", () => {
    render({ payment: PAYMENT });
    const side = host.querySelector("main [data-detail-side]");
    expect(
      [...(side?.children ?? [])].map(
        (c) => c.querySelector("h2")?.textContent,
      ),
    ).toEqual(["결제", "주문 정보"]);
    // 상자 칸은 그 열의 앞(같은 격자 안)
    expect(
      side?.previousElementSibling?.querySelector("#box-status-title"),
    ).not.toBeNull();
  });
});

describe("C-1: 「아직 보내지 않음」을 누른 상자는 상자 줄에 그 날짜", () => {
  // 지금 할 일 줄은 누르면 없어진다(d113) — 누른 사실은 선물 상세 상자 줄에만 남는다(office-workflow INV-W10, 기한은 그대로).
  const boxLine = (label: string) =>
    [...host.querySelectorAll("main h3")].find((h) => h.textContent?.startsWith(label))?.parentElement ?? null;

  it("C-1: 누른 상자는 「아직 도착 전」 대신 「아직 보내지 않음 · 10월 23일」(서울 날짜)", () => {
    render({ boxes: [box({ notSentAt: "2026-10-22T16:30:00+00:00" })] });
    const line = boxLine(`${ORDER}-1`);
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
    expect(boxLine(`${ORDER}-1`)?.textContent).toContain("아직 보내지 않음 · 10월 22일");
    expect(boxLine(`${ORDER}-2`)?.textContent).toContain("아직 도착 전");
    expect(boxLine(`${ORDER}-2`)?.textContent).not.toContain("아직 보내지 않음");
  });
});

describe("C-3: 돌려받을 주소 확인 뒤 안내는 할 일 칸이 없어져도 보인다", () => {
  // 확인하면 그 할 일 줄이 원천 상태로 사라진다 — 그 주문의 마지막 할 일이면 칸이 통째로 없다(ui-reviewer 2026-10-22 지적 1).
  it("C-3: ?address=confirmed 로 열린 상세는 할 일 칸이 없어도 맨 위에 「돌려받을 주소를 확인했어요.」", () => {
    query = "address=confirmed";
    render();
    const line = [...host.querySelectorAll("main [role=status]")].find((p) => p.textContent === "돌려받을 주소를 확인했어요.");
    expect(line).toBeDefined();
    // 상태 판(하늘 판)보다 위
    expect(line!.compareDocumentPosition(host.querySelector("#g-title")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("C-3 (실패경로): 쿼리가 없으면 안내가 없다", () => {
    render();
    expect(host.querySelector("main")?.textContent).not.toContain("돌려받을 주소를 확인했어요.");
  });
});
