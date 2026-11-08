import { describe, expect, it } from "vitest";
import { InvalidRegistrationError, SenderRefusedError } from "./payment-store";
import { createSupabasePaymentStore } from "./supabase-payment-store";

// 결제 저장소가 DB 등록 함수의 거부 코드를 앱 오류 종류로 바꾸는지 — 가짜 rpc 로 본다(실제 DB 판정은 통합 시험 hard-items-db).

function storeReturning(code: string, message = "거부") {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: null, error: { code, message } };
    },
    from: () => {
      throw new Error("거부된 등록 뒤에 결제 기록을 읽으면 안 된다");
    },
  };
  return { calls, store: createSupabasePaymentStore(admin as never) };
}

const input = {
  orderId: "pay_x",
  orderNo: "FC-ABCDE",
  charge: { goodsKrw: 0, serviceFeeKrw: 1400, inspectionFeeKrw: 1500, shippingFeeKrw: 4000, totalKrw: 6900 },
  registration: {
    fanId: "fan",
    creatorId: "creator",
    itemCategory: "flower",
    itemOther: null,
    hasElectronicsOrMetal: false,
    boxes: ["small" as const],
    anniversaryName: null,
    hardNoticeCategory: null,
  },
};

describe("hard-items INV-H7: DB 의 「등록 막기」 거부를 앱 오류로", () => {
  it("INV-H7 S7 (실패경로): FKR03 이면 SenderRefusedError(hard_item)", async () => {
    const { store } = storeReturning("FKR03");
    const err = await store.create(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SenderRefusedError);
    expect((err as SenderRefusedError).reason).toBe("hard_item");
  });

  it("INV-H1: 종류 코드는 p_item_category, 기타 글은 p_item_kind 로 넘긴다", async () => {
    const { store, calls } = storeReturning("FKR03");
    await store.create(input).catch(() => null);
    expect(calls[0]?.args).toMatchObject({ p_item_category: "flower", p_item_kind: null });
  });

  it("다른 거부 코드(FKR01)는 hard_item 이 아니다", async () => {
    const { store } = storeReturning("FKR01");
    const err = await store.create(input).catch((e: unknown) => e);
    expect((err as SenderRefusedError).reason).toBe("resting");
  });
});

describe("metrics INV-Q5: 안내가 뜬 품목을 등록 함수에 넘긴다", () => {
  it("INV-Q5: p_hard_notice_category 로 넘긴다 — 안내가 없었으면 null", async () => {
    const { store, calls } = storeReturning("FKR03");
    await store.create({ ...input, registration: { ...input.registration, hardNoticeCategory: "flower" } }).catch(() => null);
    await store.create(input).catch(() => null);
    expect(calls.map((c) => c.args.p_hard_notice_category)).toEqual(["flower", null]);
  });
});

describe("together INV-F7: 나만 보는 메모는 등록 함수에 같이 넘긴다(같은 처리에서 저장)", () => {
  it("INV-F7: p_memo_title·p_memo_body 로 넘긴다 — 물품 이름 칸(p_item_kind)에는 섞지 않는다, 메모가 없으면 둘 다 null", async () => {
    const { store, calls } = storeReturning("FKR03");
    await store.create({ ...input, registration: { ...input.registration, memo: { title: "생일 편지와 인형", body: null } } }).catch(() => null);
    await store.create(input).catch(() => null);
    await store.create({ ...input, registration: { ...input.registration, memo: { title: null, body: "내용만" } } }).catch(() => null);
    expect(calls.map((c) => [c.args.p_memo_title, c.args.p_memo_body, c.args.p_item_kind])).toEqual([
      ["생일 편지와 인형", null, null],
      [null, null, null],
      [null, "내용만", null],
    ]);
  });
});

describe("together INV-F7: DB 의 길이 검사(22023)는 입력 오류로 — 서버 고장(500)이 아니다", () => {
  it("INV-F7 S7b (실패경로): 메모·기타 글 길이로 22023 이 오면 InvalidRegistrationError", async () => {
    for (const message of ["선물 이름은 한 줄 20자까지", "메모 내용은 200자까지", "기타 물품은 1~30자로 적는다"]) {
      const err = await storeReturning("22023", message).store.create(input).catch((e: unknown) => e);
      expect(err, message).toBeInstanceOf(InvalidRegistrationError);
    }
  });

  it("INV-F7: 22023 이어도 받을 수 없는 크리에이터는 그대로 SenderRefusedError(unknown_creator)", async () => {
    const err = await storeReturning("22023", "받을 수 없는 크리에이터").store.create(input).catch((e: unknown) => e);
    expect((err as SenderRefusedError).reason).toBe("unknown_creator");
  });
});

describe("payment INV-M24: 제주·도서 할증은 등록 함수가 정하고, 저장소는 저장된 할증을 읽어 돌려준다", () => {
  function storeSaving(row: Record<string, unknown>) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: row, error: null }),
    };
    const admin = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: "order-uuid", error: null };
      },
      from: () => query,
    };
    return { calls, store: createSupabasePaymentStore(admin as never) };
  }
  const saved = (over: Record<string, unknown>) => ({
    toss_order_id: "pay_x",
    amount_krw: 6900,
    goods_krw: 0,
    service_fee_krw: 1400,
    inspection_fee_krw: 1500,
    shipping_fee_krw: 4000,
    surcharge_krw: 0,
    status: "pending",
    payment_key: null,
    orders: { order_no: "FC-ABCDE", fan_id: "fan", profiles: { nickname: "별빛" } },
    ...over,
  });

  it("INV-M24 S24: 등록 함수가 더해 저장한 할증(8,000)과 할증이 들어간 금액을 그대로 돌려준다", async () => {
    const { store } = storeSaving(saved({ amount_krw: 21800, service_fee_krw: 2800, inspection_fee_krw: 3000, shipping_fee_krw: 16000, surcharge_krw: 8000 }));
    const stored = await store.create({ ...input, charge: { goodsKrw: 0, serviceFeeKrw: 2800, inspectionFeeKrw: 3000, shippingFeeKrw: 8000, totalKrw: 13800 } });
    expect(stored.amountKrw).toBe(21800);
    expect(stored.surchargeKrw).toBe(8000);
    expect(stored.charge.shippingFeeKrw).toBe(16000);
  });

  it("INV-M24 S24b: 할증이 없으면 0", async () => {
    const { store } = storeSaving(saved({}));
    expect((await store.create(input)).surchargeKrw).toBe(0);
  });

  it("INV-M24 ⑤: 앱은 크리에이터 구분을 읽거나 넘기지 않는다 — 등록 함수 인자에 지역·할증 칸이 없다", async () => {
    const { store, calls } = storeSaving(saved({}));
    await store.create(input);
    expect(calls.map((c) => c.fn)).toEqual(["register_order"]);
    expect(Object.keys(calls[0]!.args).filter((k) => /region|surcharge/.test(k))).toEqual([]);
  });

  it("INV-M24 (실패경로): 저장된 할증이 배송비 칸보다 크거나 음수면 그 기록으로 결제를 진행하지 않는다", async () => {
    for (const surcharge_krw of [-1, 4001, 1.5]) {
      const { store } = storeSaving(saved({ surcharge_krw }));
      await expect(store.create(input)).rejects.toThrow();
    }
  });
});
