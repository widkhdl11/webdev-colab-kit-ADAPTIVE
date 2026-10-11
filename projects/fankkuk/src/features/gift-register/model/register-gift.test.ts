import { describe, expect, it } from "vitest";
import { createMemoryPaymentStore } from "@/entities/payment/api/memory-payment-store";
import { PriceChangedError, SenderRefusedError, type PaymentStore } from "@/entities/payment/api/payment-store";
import { PRICE_CHANGED_MESSAGE, type PriceTable } from "@/entities/payment/model/price-table";
import type { CreatorRelation } from "./sender-rule";
import { registerGift } from "./register-gift";

// 첫 요금표(시험용 고정값). 운영 값은 DB 요금표에서만 온다.
const PRICES: PriceTable = {
  small: { priceKrw: 6900, carrierCostKrw: 4000, inspectionFeeKrw: 1500 },
  medium: { priceKrw: 8900, carrierCostKrw: 5000, inspectionFeeKrw: 2000 },
  large: { priceKrw: 10900, carrierCostKrw: 6500, inspectionFeeKrw: 2500 },
};
const readPrices = async (): Promise<PriceTable> => PRICES;

const FAN = { userId: "fan-byeolbit", role: "fan" } as const;
const form = { creatorId: "00000000-0000-4000-b000-000000000001", itemCategory: "other", itemOther: "손편지", smallCount: "2", mediumCount: "1", largeCount: "0", electronicsOrMetal: "no", quotedTotalKrw: 22700 };

// INV-L9: 팬·크리에이터 모두 관계(받는 크리에이터를 팔로우했는가)를 읽는다. 기본은 팔로우한 상태
const FOLLOWING = async (): Promise<CreatorRelation | null> => ({ receiverIsSelf: false, senderFollows: true });

function setup(relation: (senderId: string, creatorId: string) => Promise<CreatorRelation | null> = FOLLOWING) {
  const store = createMemoryPaymentStore({ env: { NODE_ENV: "test" } });
  return { store, deps: { store, newOrderNo: () => "FC-TEST1", creatorRelation: relation, readPrices } };
}

const CREATOR = { userId: "creator-byeolbit", role: "creator" } as const;
const relationIs = (r: CreatorRelation) => async () => r;

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

  it("INV-L3 (S3c, 실패경로): 운영자 계정이면 403, 아무것도 저장하지 않는다", async () => {
    const { deps, store } = setup();
    expect(await registerGift({ ...deps, viewer: { userId: "x", role: "operator" } }, form)).toMatchObject({ ok: false, status: 403 });
    expect(store.registrations()).toEqual([]);
  });
});

describe("크리에이터가 보내는 선물 (INV-L8·INV-L9)", () => {
  it("INV-L8 (S3d, 실패경로): 자기 자신에게 보내면 403, 아무것도 저장하지 않는다", async () => {
    const { deps, store } = setup(relationIs({ receiverIsSelf: true, senderFollows: true }));
    const r = await registerGift({ ...deps, viewer: CREATOR }, form);
    expect(r).toMatchObject({ ok: false, status: 403, message: "자기 자신에게는 선물을 보낼 수 없어요." });
    expect(store.registrations()).toEqual([]);
  });

  it("INV-L8 (S3d, 실패경로): 실제 관계 읽기처럼 자기 자신이면 팔로우가 false 로 와도 「자기 자신」 이유로 거부한다", async () => {
    const { deps, store } = setup(relationIs({ receiverIsSelf: true, senderFollows: false }));
    const r = await registerGift({ ...deps, viewer: CREATOR }, form);
    expect(r).toMatchObject({ ok: false, status: 403, message: "자기 자신에게는 선물을 보낼 수 없어요." });
    expect(store.registrations()).toEqual([]);
  });

  it("INV-L3·INV-L9 (S3e): 팔로우가 있으면 등록되고, 보내는 사람은 로그인한 크리에이터다", async () => {
    const asked: [string, string][] = [];
    const { deps, store } = setup(async (senderId, creatorId) => {
      asked.push([senderId, creatorId]);
      return { receiverIsSelf: false, senderFollows: true };
    });
    const r = await registerGift({ ...deps, viewer: CREATOR }, { ...form, fanId: "fan-daltokki" });
    expect(r.ok).toBe(true);
    expect(store.registrations().map((x) => [x.fanId, x.creatorId])).toEqual([["creator-byeolbit", form.creatorId]]);
    // 관계는 본문이 아니라 로그인한 사람 기준으로 읽는다
    expect(asked).toEqual([["creator-byeolbit", form.creatorId]]);
  });

  it("INV-L9 (S3f, 실패경로): 크리에이터가 받는 크리에이터를 팔로우하지 않았으면 403, 아무것도 저장하지 않는다", async () => {
    const { deps, store } = setup(relationIs({ receiverIsSelf: false, senderFollows: false }));
    const r = await registerGift({ ...deps, viewer: CREATOR }, form);
    expect(r).toMatchObject({ ok: false, status: 403, message: "팔로우한 크리에이터에게만 선물을 보낼 수 있어요." });
    expect(store.registrations()).toEqual([]);
  });

  it("INV-L9 (S3g, 실패경로): 팬도 받는 크리에이터를 팔로우하지 않았으면 403, 아무것도 저장하지 않는다 — 관계는 로그인한 팬 기준", async () => {
    const asked: string[] = [];
    const { deps, store } = setup(async (senderId) => {
      asked.push(senderId);
      return { receiverIsSelf: false, senderFollows: false };
    });
    const r = await registerGift({ ...deps, viewer: FAN }, { ...form, fanId: "fan-daltokki" });
    expect(r).toMatchObject({ ok: false, status: 403, message: "팔로우한 크리에이터에게만 선물을 보낼 수 있어요." });
    expect(store.registrations()).toEqual([]);
    expect(asked).toEqual(["fan-byeolbit"]);
  });

  it("INV-L9 (S3g): 팬이 팔로우했으면 등록된다", async () => {
    const { deps } = setup(FOLLOWING);
    expect((await registerGift({ ...deps, viewer: FAN }, form)).ok).toBe(true);
  });

  it("INV-L9 (실패경로): 팬이 보낼 때도 받는 크리에이터를 못 찾으면 404", async () => {
    const { deps, store } = setup(async () => null);
    expect(await registerGift({ ...deps, viewer: FAN }, form)).toMatchObject({ ok: false, status: 404 });
    expect(store.registrations()).toEqual([]);
  });

  it("INV-L9 (실패경로): 받는 크리에이터를 못 찾으면 404 로 보내지 않는다", async () => {
    const { deps, store } = setup(async () => null);
    expect(await registerGift({ ...deps, viewer: CREATOR }, form)).toMatchObject({ ok: false, status: 404 });
    expect(store.registrations()).toEqual([]);
  });

  it("INV-L8·L9 두 번째 장치: 서버 판정을 지나도 DB 가 거부하면 403 으로 돌려준다", async () => {
    const { deps } = setup(relationIs({ receiverIsSelf: false, senderFollows: true }));
    const refusing: PaymentStore = { ...deps.store, create: async () => { throw new SenderRefusedError("no_follow"); } };
    const r = await registerGift({ ...deps, store: refusing, viewer: CREATOR }, form);
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe("채널 이사 중인 크리에이터 (creator-verification INV-V12)", () => {
  it("INV-V12 (S12, 실패경로): DB 등록 함수가 이사 중으로 거부하면 409 와 서버 문구를 그대로 돌려준다 — 팬·크리에이터 둘 다", async () => {
    for (const viewer of [FAN, CREATOR]) {
      const { deps } = setup(relationIs({ receiverIsSelf: false, senderFollows: true }));
      const refusing: PaymentStore = { ...deps.store, create: async () => { throw new SenderRefusedError("moving"); } };
      const r = await registerGift({ ...deps, store: refusing, viewer }, form);
      expect(r).toEqual({ ok: false, status: 409, message: "채널을 옮기는 중인 크리에이터라 지금은 선물을 받을 수 없어요. 채널 확인이 끝나면 다시 보내 주세요." });
    }
  });
});

describe("요금표 (admin-console INV-K3)", () => {
  it("INV-K3: 금액은 요청마다 읽은 요금표로 계산한다 — 표가 바뀌면 등록 금액도 바뀐다", async () => {
    const { deps, store } = setup();
    const raised: PriceTable = { ...PRICES, small: { ...PRICES.small, priceKrw: 7400 } };
    const r = await registerGift({ ...deps, viewer: FAN, readPrices: async () => raised }, { ...form, quotedTotalKrw: 7400 * 2 + 8900 });
    expect(r).toMatchObject({ ok: true, amountKrw: 7400 * 2 + 8900 });
    if (!r.ok) throw new Error();
    expect((await store.find(r.orderId))?.amountKrw).toBe(7400 * 2 + 8900);
  });

  it("INV-K3 (실패경로): 읽은 뒤 요금이 바뀌어 DB 가 금액을 거부하면 409 와 다시 확인하라는 문구", async () => {
    const { deps } = setup();
    const refusing: PaymentStore = { ...deps.store, create: async () => { throw new PriceChangedError(); } };
    const r = await registerGift({ ...deps, store: refusing, viewer: FAN }, form);
    expect(r).toEqual({ ok: false, status: 409, message: PRICE_CHANGED_MESSAGE });
  });

  it("INV-K3 (실패경로): 화면이 보여 준 합계가 등록 순간 요금표의 합계와 다르면 DB 를 부르기 전에 409", async () => {
    const { deps, store } = setup();
    // 화면은 22,700 을 보고 있었는데 그 사이 소형이 7,400 으로 올랐다 → 서버 계산은 23,700
    const raised: PriceTable = { ...PRICES, small: { ...PRICES.small, priceKrw: 7400 } };
    const r = await registerGift({ ...deps, viewer: FAN, readPrices: async () => raised }, form);
    expect(r).toEqual({ ok: false, status: 409, message: PRICE_CHANGED_MESSAGE });
    expect(store.registrations()).toEqual([]);
  });

  it("INV-K3 · INV-M1: 화면 합계는 비교에만 쓴다 — 결제 기록의 금액은 서버가 계산한 칸 나눔이다", async () => {
    const { deps, store } = setup();
    const r = await registerGift({ ...deps, viewer: FAN }, form);
    if (!r.ok) throw new Error();
    expect((await store.find(r.orderId))?.charge).toEqual({ goodsKrw: 0, serviceFeeKrw: 4700, inspectionFeeKrw: 5000, shippingFeeKrw: 13000, totalKrw: 22700 });
  });

  it("INV-K3 (실패경로): 화면 합계가 없거나 숫자가 아니면 400, 아무것도 저장하지 않는다", async () => {
    const { deps, store } = setup();
    for (const quotedTotalKrw of [undefined, "22700", -1, 22700.5]) {
      expect(await registerGift({ ...deps, viewer: FAN }, { ...form, quotedTotalKrw })).toMatchObject({ ok: false, status: 400 });
    }
    expect(store.registrations()).toEqual([]);
  });
});

describe("주문번호", () => {
  it("만든 주문번호가 이미 있으면 새 번호로 다시 등록한다", async () => {
    const store = createMemoryPaymentStore({ env: { NODE_ENV: "test" } });
    const nos = ["FC-SAME1", "FC-SAME1", "FC-OTHER"];
    const newNo = () => nos.shift()!;
    const first = await registerGift({ store, viewer: FAN, newOrderNo: newNo, creatorRelation: FOLLOWING, readPrices }, form);
    const second = await registerGift({ store, viewer: FAN, newOrderNo: newNo, creatorRelation: FOLLOWING, readPrices }, form);
    expect(first).toMatchObject({ ok: true, orderNo: "FC-SAME1" });
    expect(second).toMatchObject({ ok: true, orderNo: "FC-OTHER" });
    expect(store.registrations()).toHaveLength(2);
  });
});

describe("받는 양 조절 (creator-receiving INV-B2·B4·B6·B9)", () => {
  function refusingStore(reason: "resting" | "limit" | "hard_item"): PaymentStore {
    const base = createMemoryPaymentStore({ env: { NODE_ENV: "test" } });
    return { ...base, create: async () => { throw new SenderRefusedError(reason); } };
  }

  it("INV-B2 S2 (실패경로): DB 가 쉬는 중으로 거부하면 409 와 쉬는 중 안내", async () => {
    const { deps } = setup();
    const r = await registerGift({ ...deps, store: refusingStore("resting"), viewer: FAN }, form);
    expect(r).toEqual({ ok: false, status: 409, message: "지금은 잠시 선물 받기를 쉬고 있는 크리에이터예요." });
  });

  it("INV-B6 S6b (실패경로): DB 가 한도로 거부하면 409 와 문구 하나 — 다음 달 1일, 숫자 없음", async () => {
    const { deps } = setup();
    const r = await registerGift({ ...deps, store: refusingStore("limit"), viewer: FAN, now: () => new Date("2026-10-10T03:00:00Z") }, form);
    expect(r).toEqual({ ok: false, status: 409, message: "이번 달은 이미 마음을 충분히 보내셨어요. 11월 1일부터 다시 보낼 수 있어요" });
  });

  it("INV-B6 S6b: 다음 달 1일은 한국 시간으로 정한다 — UTC 10월 31일 16시(한국 11월 1일 1시)면 「12월 1일」", async () => {
    const { deps } = setup();
    const r = await registerGift({ ...deps, store: refusingStore("limit"), viewer: FAN, now: () => new Date("2026-10-31T16:00:00Z") }, form);
    expect(r).toEqual({ ok: false, status: 409, message: "이번 달은 이미 마음을 충분히 보내셨어요. 12월 1일부터 다시 보낼 수 있어요" });
  });

  it("INV-H7 S7 (실패경로): DB 가 받기 어려운 품목으로 거부하면 409 와 이유(hard_item) — 화면이 요금 변경과 가른다", async () => {
    const { deps } = setup();
    const r = await registerGift({ ...deps, store: refusingStore("hard_item"), viewer: FAN }, { ...form, itemCategory: "flower" });
    expect(r).toEqual({ ok: false, status: 409, message: "지금은 이 품목을 받기 어려운 크리에이터예요. 다른 선물을 골라 주세요.", reason: "hard_item" });
  });

  it("INV-H7: 다른 409(쉬는 중)에는 이유 칸이 없다", async () => {
    const { deps } = setup();
    expect(await registerGift({ ...deps, store: refusingStore("resting"), viewer: FAN }, form)).not.toHaveProperty("reason");
  });

  it("INV-H1: 종류 코드와 기타 글을 등록에 넘긴다 — 기타가 아니면 글은 null", async () => {
    const { deps, store } = setup();
    expect((await registerGift({ ...deps, viewer: FAN }, form)).ok).toBe(true);
    expect((await registerGift({ ...deps, newOrderNo: () => "FC-TEST2", viewer: FAN }, { ...form, itemCategory: "electronics", itemOther: "무시" })).ok).toBe(true);
    expect(store.registrations().map((x) => [x.itemCategory, x.itemOther, x.hasElectronicsOrMetal])).toEqual([
      ["other", "손편지", false],
      ["electronics", null, true],
    ]);
  });

  it("metrics INV-Q5: 화면이 보낸 안내 품목을 등록에 넘긴다 — 목록 밖 값은 버린다", async () => {
    const { deps, store } = setup();
    expect((await registerGift({ ...deps, viewer: FAN }, { ...form, itemCategory: "doll", hardNoticeCategory: "flower" })).ok).toBe(true);
    expect((await registerGift({ ...deps, newOrderNo: () => "FC-TEST2", viewer: FAN }, { ...form, hardNoticeCategory: "<b>" })).ok).toBe(true);
    expect(store.registrations().map((x) => [x.itemCategory, x.hardNoticeCategory])).toEqual([
      ["doll", "flower"],
      ["other", null],
    ]);
  });

  it("INV-B9: 고른 기념일 표시는 이름 그대로 등록에 넘긴다(7일 안인지는 DB 가 그날 다시 본다)", async () => {
    const { deps, store } = setup();
    expect((await registerGift({ ...deps, viewer: FAN }, { ...form, anniversaryName: " 데뷔일 " })).ok).toBe(true);
    expect((await registerGift({ ...deps, newOrderNo: () => "FC-TEST2", viewer: FAN }, form)).ok).toBe(true);
    expect(store.registrations().map((x) => x.anniversaryName)).toEqual(["데뷔일", null]);
  });

  it("INV-B9 (실패경로): 13자 넘는 표시 이름은 400, 저장하지 않는다", async () => {
    const { deps, store } = setup();
    expect(await registerGift({ ...deps, viewer: FAN }, { ...form, anniversaryName: "가".repeat(13) })).toMatchObject({ ok: false, status: 400 });
    expect(store.registrations()).toEqual([]);
  });
});
