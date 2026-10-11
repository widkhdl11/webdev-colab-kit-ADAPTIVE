import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { PriceChangedError, SenderRefusedError } from "@/entities/payment/api/payment-store";
import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { computeCharge } from "@/entities/payment/model/charge";
import { createCreatorRelationReader } from "@/features/gift-register/api/creator-relation";
import { adminClient, deleteTestOrders, psql, SEED, signedInClient } from "./helpers";

// session-login INV-L3·INV-L8·INV-L9: 크리에이터도 다른 크리에이터에게 선물을 보낸다.
// INV-L9(2026-10-07 바뀜, 카드 d41): 팬·크리에이터 모두 보내는 사람이 받는 크리에이터를 팔로우하고 있어야 한다.
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

// 달토끼(팬)는 시드에서 아무도 팔로우하지 않는다 — 이 시험이 깐 팔로우만 지운다
function clearCreatorFollows() {
  psql(`delete from public.follows where fan_id in ('${HARU_PROFILE}', '${MOMO_PROFILE}', '${SEED.otherFanId}')`);
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

  it("INV-L9 (S3f, 실패경로): 받는 쪽만 보내는 쪽을 팔로우하면 거부", async () => {
    follow(MOMO_PROFILE, HARU_PAGE);
    const r = await register(HARU_PROFILE, MOMO_PAGE);
    expect(r.error?.code).toBe("P0012");
    expect(ordersFrom(HARU_PROFILE)).toBe(0);
  });

  it("INV-L9 (S3g, 실패경로): 팬도 팔로우하지 않은 크리에이터에게는 거부 — 팔로우한 뒤에는 등록", async () => {
    const refused = await register(SEED.otherFanId, MOMO_PAGE);
    expect(refused.error?.code).toBe("P0012");
    expect(ordersFrom(SEED.otherFanId)).toBe(0);
    follow(SEED.otherFanId, MOMO_PAGE);
    expect((await register(SEED.otherFanId, MOMO_PAGE)).error).toBeNull();
    expect(ordersFrom(SEED.otherFanId)).toBe(1);
  });

  it("INV-L9 (S3h): 등록 뒤 팔로우를 끊어도 이미 만든 주문은 그대로 남는다", async () => {
    follow(SEED.otherFanId, MOMO_PAGE);
    expect((await register(SEED.otherFanId, MOMO_PAGE)).error).toBeNull();
    psql(`delete from public.follows where fan_id = '${SEED.otherFanId}' and creator_id = '${MOMO_PAGE}'`);
    expect(ordersFrom(SEED.otherFanId)).toBe(1);
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
    expect(await read()(HARU_PROFILE, HARU_PAGE)).toEqual({ receiverIsSelf: true, senderFollows: false });
  });

  it("INV-L9: 보내는 쪽 팔로우만 센다 — 받는 쪽이 보내는 쪽을 팔로우한 것은 아니다", async () => {
    expect(await read()(HARU_PROFILE, MOMO_PAGE)).toEqual({ receiverIsSelf: false, senderFollows: false });
    follow(MOMO_PROFILE, HARU_PAGE);
    expect(await read()(HARU_PROFILE, MOMO_PAGE)).toEqual({ receiverIsSelf: false, senderFollows: false });
    follow(HARU_PROFILE, MOMO_PAGE);
    expect(await read()(HARU_PROFILE, MOMO_PAGE)).toEqual({ receiverIsSelf: false, senderFollows: true });
  });

  it("INV-L9: 팬도 같은 판정 — 팔로우 없음 / 있음", async () => {
    expect(await read()(SEED.otherFanId, MOMO_PAGE)).toEqual({ receiverIsSelf: false, senderFollows: false });
    follow(SEED.otherFanId, MOMO_PAGE);
    expect(await read()(SEED.otherFanId, MOMO_PAGE)).toEqual({ receiverIsSelf: false, senderFollows: true });
  });

  it("INV-L9: 다른 크리에이터를 팔로우한 것은 세지 않는다", async () => {
    follow(HARU_PROFILE, NO_ACCOUNT_PAGE);
    follow(MOMO_PROFILE, NO_ACCOUNT_PAGE);
    expect(await read()(HARU_PROFILE, MOMO_PAGE)).toEqual({ receiverIsSelf: false, senderFollows: false });
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
      registration: { fanId: HARU_PROFILE, creatorId, itemCategory: "other", itemOther: "시험 선물", hasElectronicsOrMetal: false, anniversaryName: null, hardNoticeCategory: null, boxes: ["small"] },
    });

  it("admin-console INV-K3: 금액이 등록 순간의 요금표와 다르면 → PriceChangedError", async () => {
    const now = await readTierPrices(adminClient());
    const stale = { ...now, small: { ...now.small, priceKrw: now.small.priceKrw + 500 } };
    await expect(
      createSupabasePaymentStore(adminClient()).create({
        orderId: `pay_test_cg_price_${Date.now().toString(36)}`,
        orderNo: `FC-P${Date.now().toString(36).toUpperCase().slice(-5)}`,
        charge: computeCharge(stale, { boxes: ["small"] }),
        registration: { fanId: HARU_PROFILE, creatorId: MOMO_PAGE, itemCategory: "other", itemOther: "시험 선물", hasElectronicsOrMetal: false, anniversaryName: null, hardNoticeCategory: null, boxes: ["small"] },
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

describe("화면용 읽기 — 내 크리에이터 id 와 최근에 선물한 크리에이터", () => {
  it("하루의 크리에이터 id 는 하루 페이지, 팬은 없음", async () => {
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("my_creator_id")).data).toEqual([{ creator_id: HARU_PAGE }]);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("my_creator_id")).data).toEqual([]);
  });

  it("INV-L9 정리: 한 명씩 「반대쪽 팔로우」를 묻던 함수는 없다", async () => {
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("can_send_gift_to", { p_creator_id: MOMO_PAGE })).error).not.toBeNull();
  });

  it("my_recent_recipients: 로그인한 사람이 보낸 크리에이터만, 마지막으로 보낸 순 — 사람 ID 인자 없음", async () => {
    follow(SEED.otherFanId, MOMO_PAGE);
    follow(SEED.otherFanId, NO_ACCOUNT_PAGE);
    expect((await register(SEED.otherFanId, MOMO_PAGE)).error).toBeNull();
    expect((await register(SEED.otherFanId, NO_ACCOUNT_PAGE)).error).toBeNull();
    // 결제 전 주문(registered_at 없음)도 「보낸 적」으로 센다 — 결제를 마치지 못하고 다시 보내는 사람을 위로
    psql(`update public.orders set created_at = now() - interval '1 day' where fan_id = '${SEED.otherFanId}' and creator_id = '${MOMO_PAGE}' and item_kind = '시험 선물'`);
    const fan = await signedInClient("daltokki_fan");
    const rows = (await fan.rpc("my_recent_recipients")).data as { creator_id: string }[];
    // 달토끼에게는 시드 주문(하루에게)이 이미 있다 — 방금 보낸 둘이 맨 앞에, 마지막으로 보낸 순으로 오고 같은 사람은 한 번만
    const ids = rows.map((r) => r.creator_id);
    expect(ids.slice(0, 2)).toEqual([NO_ACCOUNT_PAGE, MOMO_PAGE]);
    expect(new Set(ids).size).toBe(ids.length);
    const other = await signedInClient("haru_creator");
    expect((await other.rpc("my_recent_recipients")).data).toEqual([]);
  });
});
