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
import type { GiftBox } from "@/entities/parcel/model/box-rows";
import type { FanBoxReply } from "@/entities/gift-reply/api/gift-reply-reads";
import { GiftStatusPage } from "./gift-status-page";

// 보낸 선물 상세의 배송 단계(delivery-status INV-DS1·DS2·DS3) — 이 파일은 visibility 시험의 준비 코드를 그대로 쓴다.
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
        // DB 판정(order_send_guide_shown)과 같게 — 승인 중이거나 「먼저 보내기」를 눌렀으면 참(승인 이력만 있는 경우는 over 로 직접 준다)
        send_guide_shown: over.send_guide_shown ?? ((over.approved_at === undefined ? true : over.approved_at !== null) || (over.fan_send_ack_at ?? null) !== null),
      },
    ],
    "서울 금천구 가산디지털1로 123 팬꾹 사무실",
  )[0]!;
}

const B1 = "11111111-1111-4111-8111-111111111111";
const box = (over: Partial<GiftBox> = {}): GiftBox => ({
  boxId: B1,
  label: `${ORDER}-1`,
  tier: "small",
  waybillNo: "987654321098",
  state: "received",
  addressCode: null,
  sendAckNeeded: false,
  ...over,
});
const reply = (received: boolean): FanBoxReply => ({
  boxId: B1, orderNo: ORDER, creatorId: "c1", boxSeq: 1, boxCount: 1, received, receivedOn: received ? "2026-11-10" : null,
  creatorName: "하루", creatorPhotoPath: null, reply: null, fanPublic: false, fanShowNickname: false, xTag: null,
});
const PASSED = { approved_at: "2026-11-01T05:00:00+00:00", received_at: "2026-11-03T01:00:00+00:00", inspection_result: "passed", inspected_at: "2026-11-03T02:00:00+00:00" };
// 서울 11월 9일 오후 3시 출고
const SHIPPED = { ...PASSED, status: "shipped", shipped_at: "2026-11-09T06:00:00+00:00" };
/** 서울 11월 (9 + days)일 0시 + 분 */
const seoul = (days: number, minutes = 0) => new Date(Date.parse("2026-11-08T15:00:00Z") + days * 86_400_000 + minutes * 60_000).toISOString();

function render(over: Record<string, unknown>, now: string, replies: FanBoxReply[] = []) {
  act(() => root.render(<GiftStatusPage view={viewOf(over)} boxes={[box()]} memo={null} now={now} replies={replies} />));
}
const stage = () => host.querySelector("[data-delivery-stage]");
const steps = () => [...host.querySelectorAll("ol li")].map((li) => li.className);

describe("delivery-status: 팬 선물 상세의 배송 단계", () => {
  it("INV-DS1: 송장 출력 상태 → 큰 줄 「팬꾹에서 보냈어요」", () => {
    render({ ...PASSED, status: "label_printed" }, seoul(0, 600));
    expect(stage()?.textContent).toBe("팬꾹에서 보냈어요");
  });
  it("INV-DS1 (실패경로): 검수 완료·출고 대기(송장 전)에는 배송 단계가 없다", () => {
    render({ ...PASSED, status: "inspected" }, seoul(0, 600));
    expect(stage()).toBeNull();
    expect(host.querySelector("main")!.textContent).toContain("검수 완료 · 출고 대기");
  });
  it("INV-DS1 (경계): 출고한 날 23시 59분은 「팬꾹에서 보냈어요」, 다음 날 0시 「보통 1~2일 안에 도착해요」, +3일 0시 「도착했어요(예상)」 흐리게", () => {
    render(SHIPPED, seoul(1, -1));
    expect(stage()?.textContent).toBe("팬꾹에서 보냈어요");
    render(SHIPPED, seoul(1));
    expect(stage()?.textContent).toBe("보통 1~2일 안에 도착해요");
    render(SHIPPED, seoul(3, -1));
    expect(stage()?.textContent).toBe("보통 1~2일 안에 도착해요");
    render(SHIPPED, seoul(3));
    expect(stage()?.textContent).toBe("도착했어요(예상)");
    expect(stage()!.className).toMatch(/estimated/);
    // 막대 마지막 칸(수령)도 흐린 칸 — 끝난 칸이 아니다
    expect(steps().at(-1)).toMatch(/estimated/);
    expect(steps().at(-1)).not.toMatch(/done/);
  });
  it("INV-DS2: 크리에이터가 받았어요(답장 스탬프 포함)를 남기면 출고한 날에도 「도착했어요」, 막대 끝까지", () => {
    render(SHIPPED, seoul(0, 900), [reply(true)]);
    expect(stage()?.textContent).toBe("도착했어요");
    expect(stage()!.className).not.toMatch(/estimated/);
    expect(steps().at(-1)).toMatch(/done/);
  });
  it("INV-DS2 (실패경로): 받았어요가 없는 상자 줄만 있으면 확정이 아니다", () => {
    render(SHIPPED, seoul(5), [reply(false)]);
    expect(stage()?.textContent).toBe("도착했어요(예상)");
  });
  it("INV-DS3: 화면 어디에도 크리에이터행 송장번호·택배사 조회 링크가 없다", () => {
    render(SHIPPED, seoul(1));
    const html = host.innerHTML;
    expect(html).not.toMatch(/cjlogistics|deliveryapi|epost\.go\.kr/);
    expect(host.querySelector("a[target=_blank]")).toBeNull();
  });
});
