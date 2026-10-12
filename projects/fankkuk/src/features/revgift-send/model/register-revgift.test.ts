import { describe, expect, it } from "vitest";
import { PRICE_CHANGED_MESSAGE, type PriceTable } from "@/entities/payment/model/price-table";
import type { Viewer } from "@/entities/session/model/viewer";
import { MAX_REVGIFT_SHARES, registerRevgift, type RevgiftStore, type RevgiftCreateInput } from "./register-revgift";

// 첫 요금표(시험용 고정값). 운영 값은 DB 요금표에서만 온다.
const PRICES: PriceTable = {
  small: { priceKrw: 6900, carrierCostKrw: 4000, inspectionFeeKrw: 1500 },
  medium: { priceKrw: 8900, carrierCostKrw: 5000, inspectionFeeKrw: 2000 },
  large: { priceKrw: 10900, carrierCostKrw: 6500, inspectionFeeKrw: 2500 },
};
const readPrices = async (): Promise<PriceTable> => PRICES;

const haru: Viewer = { userId: "creator-haru", role: "creator" };
const FAN_A = "11111111-1111-4111-8111-111111111111";
const FAN_B = "22222222-2222-4222-8222-222222222222";

function memoryStore(opts: { refuse?: "not_follower" | "price_changed" } = {}) {
  const created: RevgiftCreateInput[] = [];
  let n = 0;
  const store: RevgiftStore = {
    async create(input) {
      if (opts.refuse === "not_follower") throw Object.assign(new Error("P0021"), { refusal: "not_follower" as const });
      if (opts.refuse === "price_changed") throw Object.assign(new Error("P0031"), { refusal: "price_changed" as const });
      created.push(input);
      n += 1;
      return { sendId: `send-${n}` };
    },
  };
  return { store, created };
}

describe("역조공 보내기 등록 — 앱 서버 쪽 판정 (INV-R1·R3)", () => {
  it("INV-R3 S3: 팬 셋(소형 둘·중형 하나)이면 결제 금액은 서버 요금표로 17,700원, 몫마다 주문번호가 따로다", async () => {
    const { store, created } = memoryStore();
    const FAN_C = "33333333-3333-4333-8333-333333333333";
    const r = await registerRevgift({ store, viewer: haru, readPrices }, {
      shares: [
        { fanId: FAN_A, tier: "small" },
        { fanId: FAN_B, tier: "small" },
        { fanId: FAN_C, tier: "medium" },
      ],
      quotedTotalKrw: 17700,
    });
    expect(r).toMatchObject({ ok: true, amountKrw: 17700 });
    const input = created[0]!;
    expect(input.senderId).toBe("creator-haru");
    expect(input.charge.totalKrw).toBe(17700);
    expect(input.charge.inspectionFeeKrw).toBe(0);
    expect(new Set(input.shares.map((s) => s.orderNo)).size).toBe(3);
    expect(input.shares.map((s) => s.amountKrw)).toEqual([5400, 5400, 6900]);
    // INV-R11: 몫의 배송비 칸 — 입고 뒤 받지 않음 환불이 이 값을 뺀다
    expect(input.shares.map((s) => s.shippingFeeKrw)).toEqual([4000, 4000, 5000]);
  });

  it("INV-R3 S3d (실패경로): 본문의 금액·보내는 사람 칸은 읽지 않는다", async () => {
    const { store, created } = memoryStore();
    const r = await registerRevgift({ store, viewer: haru, readPrices }, {
      senderId: "someone-else",
      amountKrw: 1,
      shares: [{ fanId: FAN_A, tier: "small", amountKrw: 1 }],
      quotedTotalKrw: 5400,
    });
    expect(r).toMatchObject({ ok: true, amountKrw: 5400 });
    expect(created[0]!.senderId).toBe("creator-haru");
  });

  it("INV-R3 S3b·S3c (실패경로): 받는 팬 0명·11명·같은 팬 두 번·대형 초과 상자는 400", async () => {
    const { store, created } = memoryStore();
    const call = (shares: unknown) => registerRevgift({ store, viewer: haru, readPrices }, { shares, quotedTotalKrw: 5400 });
    expect((await call([])).ok).toBe(false);
    // 거부 문구의 인원은 한도 상수에서 온다
    expect(await call([])).toMatchObject({ status: 400, message: expect.stringContaining(`한 번에 ${MAX_REVGIFT_SHARES}명까지`) });
    expect((await call(Array.from({ length: 11 }, (_, i) => ({ fanId: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`, tier: "small" })))).ok).toBe(false);
    expect((await call([{ fanId: FAN_A, tier: "small" }, { fanId: FAN_A, tier: "medium" }])).ok).toBe(false);
    expect((await call([{ fanId: FAN_A, tier: "oversize" }])).ok).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("INV-R1 (실패경로): 크리에이터가 아니면 본문을 읽기 전에 거부된다", async () => {
    const { store, created } = memoryStore();
    for (const viewer of [null, { userId: "fan-1", role: "fan" as const }, { userId: "op-1", role: "operator" as const }]) {
      const r = await registerRevgift({ store, viewer, readPrices }, { shares: [{ fanId: FAN_A, tier: "small" }] });
      expect(r.ok).toBe(false);
    }
    expect(created).toHaveLength(0);
  });

  it("INV-R1 S1b (실패경로): DB 가 「나를 팔로우하는 팬이 아니다」로 거부하면 403 과 한 가지 문구", async () => {
    const { store } = memoryStore({ refuse: "not_follower" });
    const r = await registerRevgift({ store, viewer: haru, readPrices }, { shares: [{ fanId: FAN_A, tier: "small" }], quotedTotalKrw: 5400 });
    expect(r).toEqual({ ok: false, status: 403, message: "나를 팔로우한 팬에게만 보낼 수 있어요." });
  });

  it("INV-R3: 대형도 고를 수 있다 — 대형 요금 − 대형 검수비", async () => {
    const { store, created } = memoryStore();
    const r = await registerRevgift({ store, viewer: haru, readPrices }, { shares: [{ fanId: FAN_A, tier: "large" }], quotedTotalKrw: 8400 });
    expect(r).toMatchObject({ ok: true, amountKrw: 8400 });
    expect(created[0]!.shares[0]).toMatchObject({ tier: "large", amountKrw: 8400, shippingFeeKrw: 6500 });
  });

  it("INV-K3 (실패경로): 읽은 뒤 요금이 바뀌어 DB 가 금액을 거부하면 409 와 다시 확인하라는 문구", async () => {
    const { store } = memoryStore({ refuse: "price_changed" });
    const r = await registerRevgift({ store, viewer: haru, readPrices }, { shares: [{ fanId: FAN_A, tier: "small" }], quotedTotalKrw: 5400 });
    expect(r).toEqual({ ok: false, status: 409, message: PRICE_CHANGED_MESSAGE });
  });

  it("INV-K3 (실패경로): 화면이 보여 준 합계가 등록 순간 요금표의 합계와 다르면 DB 를 부르기 전에 409", async () => {
    const { store, created } = memoryStore();
    // 화면은 소형 5,400 을 보고 있었는데 그 사이 대표가 받는 값을 7,400 으로 올렸다 → 서버 계산은 5,900
    const raised: PriceTable = { ...PRICES, small: { ...PRICES.small, priceKrw: 7400 } };
    const r = await registerRevgift({ store, viewer: haru, readPrices: async () => raised }, { shares: [{ fanId: FAN_A, tier: "small" }], quotedTotalKrw: 5400 });
    expect(r).toEqual({ ok: false, status: 409, message: PRICE_CHANGED_MESSAGE });
    expect(created).toHaveLength(0);
  });

  it("INV-K3 · INV-M1: 화면 합계는 비교에만 쓴다 — 같으면 결제 금액은 서버 계산값이고 다른 칸에 영향이 없다", async () => {
    const { store, created } = memoryStore();
    const r = await registerRevgift({ store, viewer: haru, readPrices }, { shares: [{ fanId: FAN_A, tier: "medium" }], quotedTotalKrw: 6900 });
    expect(r).toMatchObject({ ok: true, amountKrw: 6900 });
    expect(created[0]!.charge).toEqual({ goodsKrw: 0, serviceFeeKrw: 1900, inspectionFeeKrw: 0, shippingFeeKrw: 5000, totalKrw: 6900 });
  });

  it("INV-K3 (실패경로): 화면 합계가 없거나 숫자가 아니면 400, DB 를 부르지 않는다", async () => {
    const { store, created } = memoryStore();
    for (const quotedTotalKrw of [undefined, "5400", 0, 5400.5]) {
      const r = await registerRevgift({ store, viewer: haru, readPrices }, { shares: [{ fanId: FAN_A, tier: "small" }], quotedTotalKrw });
      expect(r).toMatchObject({ ok: false, status: 400 });
    }
    expect(created).toHaveLength(0);
  });
});
