import { describe, expect, it } from "vitest";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS } from "@/entities/payment/model/price-table";
import { parseReceivedRows, parseSentRows } from "@/entities/revgift/model/revgift-rows";

// 구간 목록이 슬라이스마다 따로 적혀 있는 자리가 결제 요금표 구간(PRICED_TIERS)과 같은지 본다 (admin-console INV-K6).
// 역조공 읽기 경계는 다른 슬라이스의 목록을 가져다 쓸 수 없어 따로 적는다 — 한쪽만 바뀌면 여기서 빨개진다.

const sent = (tier: string) => [
  { order_no: "RG-ABC123", sent_at: "2026-10-04T00:00:00Z", fan_login_id: "fan", fan_nickname: "별빛", tier, state: "waiting", ship_to_office: true },
];
const received = (tier: string) => [
  {
    order_no: "RG-ABC123",
    creator_name: "하루",
    tier,
    reply: "waiting",
    deadline: "2026-10-11T00:00:00Z",
    shipped: false,
    returned: false,
    cancelled: false,
  },
];

describe("구간 목록이 한 가지다 (INV-K6)", () => {
  it("INV-K6: 역조공 읽기 경계는 요금표의 구간을 모두 받는다", () => {
    for (const tier of PRICED_TIERS) {
      expect(parseSentRows(sent(tier))[0]?.tier).toBe(tier);
      expect(parseReceivedRows(received(tier))[0]?.tier).toBe(tier);
    }
  });

  it("INV-K6 (실패경로): 요금표에 없는 구간(대형 초과)은 역조공 읽기 경계가 거부한다", () => {
    expect(() => parseSentRows(sent("oversize"))).toThrow();
    expect(() => parseReceivedRows(received("oversize"))).toThrow();
  });

  it("INV-K6: 화면 안내 문구는 요금표의 구간마다 하나씩 있다", () => {
    expect(Object.keys(PARCEL_TIER_GUIDE).sort()).toEqual([...PRICED_TIERS].sort());
  });
});
