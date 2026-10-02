import { describe, expect, it } from "vitest";
import { createMemoryPaymentStore } from "@/entities/payment/api/memory-payment-store";
import { registerGift } from "./register-gift";

const FAN = { userId: "fan-byeolbit", role: "fan" } as const;
const form = { creatorId: "creator-1", itemKind: "손편지", smallCount: "2", mediumCount: "1", electronicsOrMetal: "no" };

function setup() {
  const store = createMemoryPaymentStore({ env: { NODE_ENV: "test" } });
  return { store, deps: { store, newOrderNo: () => "FC-TEST1" } };
}

describe("선물 등록 = 주문 + 결제 대기", () => {
  it("INV-M1 (S1): 결제 금액은 상자 구간으로 서버가 계산한다 — 소형 2 + 중형 1 = 22,700원", async () => {
    const { deps, store } = setup();
    const r = await registerGift({ ...deps, viewer: FAN }, form);
    expect(r).toMatchObject({ ok: true, orderNo: "FC-TEST1", amountKrw: 22700 });
    if (!r.ok) throw new Error();
    expect((await store.find(r.orderId))?.amountKrw).toBe(22700);
  });

  it("INV-M1 (S1b, 실패경로): 본문에 금액을 넣어도 쓰지 않는다", async () => {
    const { deps, store } = setup();
    const r = await registerGift({ ...deps, viewer: FAN }, { ...form, amountKrw: 100, totalKrw: 100 });
    if (!r.ok) throw new Error();
    expect((await store.find(r.orderId))?.amountKrw).toBe(22700);
  });

  it("입력 경계를 지난다 — 상자 11개면 저장하지 않는다", async () => {
    const { deps, store } = setup();
    const r = await registerGift({ ...deps, viewer: FAN }, { ...form, smallCount: "11", mediumCount: "0" });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(store.registrations()).toEqual([]);
  });
});

describe("INV-L3: 쓰기에 넘기는 사람은 확인한 로그인 사용자다", () => {
  it("INV-L3 (S3, 실패경로): 본문에 다른 팬 ID 를 넣어도 주문의 팬은 로그인한 사람이다", async () => {
    const { deps, store } = setup();
    const r = await registerGift({ ...deps, viewer: FAN }, { ...form, fanId: "fan-daltokki", fan_id: "fan-daltokki", userId: "fan-daltokki" });
    expect(r.ok).toBe(true);
    expect(store.registrations().map((x) => x.fanId)).toEqual(["fan-byeolbit"]);
  });

  it("INV-L3 (S3b, 실패경로): 로그인하지 않았으면 401, 아무것도 저장하지 않는다", async () => {
    const { deps, store } = setup();
    expect(await registerGift({ ...deps, viewer: null }, form)).toMatchObject({ ok: false, status: 401 });
    expect(store.registrations()).toEqual([]);
  });

  it("INV-L3 (S3c, 실패경로): 크리에이터·운영자 계정이면 403, 아무것도 저장하지 않는다", async () => {
    const { deps, store } = setup();
    for (const role of ["creator", "operator"] as const) {
      expect(await registerGift({ ...deps, viewer: { userId: "x", role } }, form)).toMatchObject({ ok: false, status: 403 });
    }
    expect(store.registrations()).toEqual([]);
  });
});
