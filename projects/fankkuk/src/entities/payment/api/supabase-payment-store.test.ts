import { describe, expect, it } from "vitest";
import { SenderRefusedError } from "./payment-store";
import { createSupabasePaymentStore } from "./supabase-payment-store";

// 결제 저장소가 DB 등록 함수의 거부 코드를 앱 오류 종류로 바꾸는지 — 가짜 rpc 로 본다(실제 DB 판정은 통합 시험 hard-items-db).

function storeReturning(code: string) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: null, error: { code, message: "거부" } };
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
