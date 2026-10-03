import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { PriceChangedError, SenderRefusedError } from "@/entities/payment/api/payment-store";
import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { computeCharge } from "@/entities/payment/model/charge";
import { createCreatorRelationReader } from "@/features/gift-register/api/creator-relation";
import { adminClient, deleteTestOrders, psql, SEED, signedInClient } from "./helpers";

// session-login INV-L3·INV-L8·INV-L9: 크리에이터도 다른 크리에이터에게 선물을 보낸다.
// DB 등록 함수(두 번째 장치)와 앱 서버의 관계 읽기(첫 번째 장치)를 각각 실제 DB 로 본다.
// 하루(계정 …a011, 크리에이터 …b001) → 모모(계정 …a012, 크리에이터 …b002). 팔로우는 시험마다 새로 깔고 지운다.

const HARU_PROFILE = SEED.creatorProfileId;
const HARU_PAGE = SEED.haruCreatorId;
const MOMO_PROFILE = "00000000-0000-4000-a000-000000000012";
const MOMO_PAGE = "00000000-0000-4000-b000-000000000002";
const NO_ACCOUNT_PAGE = "00000000-0000-4000-b000-000000000003"; // 새벽달 — 계정 없는 크리에이터
const OPERATOR = "00000000-0000-4000-a000-000000000021";

let seq = 0;
function register(senderId: string, creatorId: string) {
  seq += 1;
  const tag = `${Date.now().toString(36)}${seq}`.toUpperCase().slice(-6);
  return adminClient().rpc("register_order", {
    p_fan_id: senderId,
    p_creator_id: creatorId,
    p_order_no: `FC-C${tag}`,
    p_item_kind: "시험 선물",
    p_has_electronics_or_metal: false,
    p_tiers: ["small"],
    p_toss_order_id: `pay_test_cg_${tag.toLowerCase()}`,
    p_goods_krw: 0,
    p_service_fee_krw: 1400,
    p_inspection_fee_krw: 1500,
    p_shipping_fee_krw: 4000,
    p_amount_krw: 6900,
  });
}

function follow(fanId: string, creatorId: string) {
  psql(`insert into public.follows (fan_id, creator_id) values ('${fanId}', '${creatorId}') on conflict do nothing`);
}

function clearCreatorFollows() {
  psql(`delete from public.follows where fan_id in ('${HARU_PROFILE}', '${MOMO_PROFILE}')`);
}

function ordersFrom(senderId: string): number {
  return Number(psql(`select count(*) from public.orders where fan_id = '${senderId}' and item_kind = '시험 선물'`));
}

afterEach(() => {
  clearCreatorFollows();
  deleteTestOrders();
});
afterAll(() => {
  clearCreatorFollows();
  deleteTestOrders();
});

describe("DB 등록 함수 — 보내는 사람 판정", () => {
  it("INV-L3 (S3c): 운영자는 거부, 주문이 생기지 않는다", async () => {
    const r = await register(OPERATOR, MOMO_PAGE);
    expect(r.error?.code).toBe("42501");
    expect(ordersFrom(OPERATOR)).toBe(0);
  });

  it("INV-L8 (S3d): 크리에이터가 자기 자신에게 보내면 거부 — 팔로우가 있어도", async () => {
    // 자기 자신 팔로우는 set_follow 가 막으므로 표에 직접 깐다 — 자기 자신 판정이 팔로우 판정에 가려지지 않는지 보려고
    follow(HARU_PROFILE, HARU_PAGE);
    const r = await register(HARU_PROFILE, HARU_PAGE);
    expect(r.error?.code).toBe("P0011");
    expect(ordersFrom(HARU_PROFILE)).toBe(0);
  });

  it("INV-L9 (S3e): 보내는 쪽이 팔로우하면 등록, 보내는 사람은 하루", async () => {
    follow(HARU_PROFILE, MOMO_PAGE);
    const r = await register(HARU_PROFILE, MOMO_PAGE);
    expect(r.error).toBeNull();
    expect(ordersFrom(HARU_PROFILE)).toBe(1);
  });

  it("INV-L9 (S3f): 받는 쪽만 보내는 쪽을 팔로우해도 등록", async () => {
    follow(MOMO_PROFILE, HARU_PAGE);
    const r = await register(HARU_PROFILE, MOMO_PAGE);
    expect(r.error).toBeNull();
    expect(ordersFrom(HARU_PROFILE)).toBe(1);
  });

  it("INV-L9 (S3g): 팔로우가 양쪽 다 없으면 거부 — 같은 조건에서 팬은 보낸다", async () => {
    const refused = await register(HARU_PROFILE, MOMO_PAGE);
    expect(refused.error?.code).toBe("P0012");
    expect(ordersFrom(HARU_PROFILE)).toBe(0);
    const fan = await register(SEED.otherFanId, MOMO_PAGE);
    expect(fan.error).toBeNull();
  });

  it("INV-L9: 모모가 하루를 팔로우한 것은 하루 → 모모에만 쓰인다 — 하루가 새벽달에게 보내는 조건이 아니다", async () => {
    follow(MOMO_PROFILE, HARU_PAGE);
    expect((await register(HARU_PROFILE, NO_ACCOUNT_PAGE)).error?.code).toBe("P0012");
    expect((await register(HARU_PROFILE, MOMO_PAGE)).error).toBeNull();
  });

  it("INV-L9: 다른 크리에이터를 팔로우한 것은 조건이 되지 않는다 — 둘 사이 팔로우만 센다", async () => {
    follow(HARU_PROFILE, NO_ACCOUNT_PAGE);
    follow(MOMO_PROFILE, NO_ACCOUNT_PAGE);
    expect((await register(HARU_PROFILE, MOMO_PAGE)).error?.code).toBe("P0012");
  });
});

describe("앱 서버의 관계 읽기 — DB 함수를 부르지 않고 표로 판정한다", () => {
  const read = () => createCreatorRelationReader(adminClient());

  it("INV-L8: 자기 자신이면 receiverIsSelf", async () => {
    expect(await read()(HARU_PROFILE, HARU_PAGE)).toEqual({ receiverIsSelf: true, followEitherWay: false });
  });

  it("INV-L9: 보내는 쪽 팔로우 / 받는 쪽 팔로우 / 없음", async () => {
    expect(await read()(HARU_PROFILE, MOMO_PAGE)).toEqual({ receiverIsSelf: false, followEitherWay: false });
    follow(HARU_PROFILE, MOMO_PAGE);
    expect(await read()(HARU_PROFILE, MOMO_PAGE)).toEqual({ receiverIsSelf: false, followEitherWay: true });
    clearCreatorFollows();
    follow(MOMO_PROFILE, HARU_PAGE);
    expect(await read()(HARU_PROFILE, MOMO_PAGE)).toEqual({ receiverIsSelf: false, followEitherWay: true });
  });

  it("INV-L9: 모모가 하루를 팔로우해도 하루 → 새벽달은 아니다", async () => {
    follow(MOMO_PROFILE, HARU_PAGE);
    expect(await read()(HARU_PROFILE, NO_ACCOUNT_PAGE)).toEqual({ receiverIsSelf: false, followEitherWay: false });
  });

  it("INV-L9: 다른 크리에이터를 팔로우한 것은 세지 않는다", async () => {
    follow(HARU_PROFILE, NO_ACCOUNT_PAGE);
    follow(MOMO_PROFILE, NO_ACCOUNT_PAGE);
    expect(await read()(HARU_PROFILE, MOMO_PAGE)).toEqual({ receiverIsSelf: false, followEitherWay: false });
  });

  it("INV-L9: 계정 없는 크리에이터에게는 보내는 쪽 팔로우만 센다", async () => {
    expect(await read()(HARU_PROFILE, NO_ACCOUNT_PAGE)).toEqual({ receiverIsSelf: false, followEitherWay: false });
    follow(HARU_PROFILE, NO_ACCOUNT_PAGE);
    expect(await read()(HARU_PROFILE, NO_ACCOUNT_PAGE)).toEqual({ receiverIsSelf: false, followEitherWay: true });
  });

  it("없는 크리에이터면 null", async () => {
    expect(await read()(HARU_PROFILE, "00000000-0000-4000-b000-0000000000ff")).toBeNull();
  });
});

describe("DB 거부를 앱 오류 종류로 — 서버 판정을 건너뛰고 저장소를 바로 불러도", () => {
  const create = async (creatorId: string) =>
    createSupabasePaymentStore(adminClient()).create({
      orderId: `pay_test_cg_store_${Date.now().toString(36)}`,
      orderNo: `FC-S${Date.now().toString(36).toUpperCase().slice(-5)}`,
      charge: computeCharge(await readTierPrices(adminClient()), { boxes: ["small"] }),
      registration: { fanId: HARU_PROFILE, creatorId, itemKind: "시험 선물", hasElectronicsOrMetal: false, boxes: ["small"] },
    });

  it("admin-console INV-K3: 금액이 등록 순간의 요금표와 다르면 → PriceChangedError", async () => {
    const now = await readTierPrices(adminClient());
    const stale = { ...now, small: { ...now.small, priceKrw: now.small.priceKrw + 500 } };
    await expect(
      createSupabasePaymentStore(adminClient()).create({
        orderId: `pay_test_cg_price_${Date.now().toString(36)}`,
        orderNo: `FC-P${Date.now().toString(36).toUpperCase().slice(-5)}`,
        charge: computeCharge(stale, { boxes: ["small"] }),
        registration: { fanId: HARU_PROFILE, creatorId: MOMO_PAGE, itemKind: "시험 선물", hasElectronicsOrMetal: false, boxes: ["small"] },
      }),
    ).rejects.toBeInstanceOf(PriceChangedError);
  });

  it("자기 자신 → SenderRefusedError(self)", async () => {
    await expect(create(HARU_PAGE)).rejects.toSatisfy((e) => e instanceof SenderRefusedError && e.reason === "self");
  });
  it("팔로우 없음 → SenderRefusedError(no_follow)", async () => {
    await expect(create(MOMO_PAGE)).rejects.toSatisfy((e) => e instanceof SenderRefusedError && e.reason === "no_follow");
  });
  it("없는 크리에이터 → SenderRefusedError(unknown_creator)", async () => {
    await expect(create("00000000-0000-4000-b000-0000000000ff")).rejects.toSatisfy(
      (e) => e instanceof SenderRefusedError && e.reason === "unknown_creator",
    );
  });
});

describe("화면용 읽기 — 내 크리에이터 id 와 한 명씩 「보낼 수 있나」", () => {
  const UNVERIFIED = "00000000-0000-4000-b000-0000000000f2";

  it("하루의 크리에이터 id 는 하루 페이지, 팬은 없음", async () => {
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("my_creator_id")).data).toEqual([{ creator_id: HARU_PAGE }]);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("my_creator_id")).data).toEqual([]);
  });

  it("팔로우가 한쪽이라도 있으면 참, 없으면 거짓, 자기 자신은 팔로우가 있어도 거짓", async () => {
    const haru = await signedInClient("haru_creator");
    const can = async (id: string) => (await haru.rpc("can_send_gift_to", { p_creator_id: id })).data;
    expect(await can(MOMO_PAGE)).toBe(false);
    follow(MOMO_PROFILE, HARU_PAGE);
    expect(await can(MOMO_PAGE)).toBe(true);
    expect(await can(NO_ACCOUNT_PAGE)).toBe(false);
    follow(HARU_PROFILE, HARU_PAGE);
    expect(await can(HARU_PAGE)).toBe(false);
  });

  it("본인 확인 전 크리에이터는 팔로우가 있어도 거짓", async () => {
    psql(
      `insert into public.creators (id, slug, name, channel, identity_verified) values ('${UNVERIFIED}', 'unverified-cg', '미인증', '유튜브', false) on conflict (id) do nothing`,
    );
    try {
      follow(HARU_PROFILE, UNVERIFIED);
      const haru = await signedInClient("haru_creator");
      expect((await haru.rpc("can_send_gift_to", { p_creator_id: UNVERIFIED })).data).toBe(false);
    } finally {
      clearCreatorFollows();
      psql(`delete from public.creators where id = '${UNVERIFIED}'`);
    }
  });

  it("팬에게는 늘 거짓 — 팬은 이 판정을 쓰지 않는다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("can_send_gift_to", { p_creator_id: MOMO_PAGE })).data).toBe(false);
  });
});
