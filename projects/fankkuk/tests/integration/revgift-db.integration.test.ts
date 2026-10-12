import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, psql, signedInClient } from "./helpers";
import {
  backdateSettlement,
  deleteTestRevgifts,
  followHaru,
  HARU_CREATOR_ID,
  payTestRevgift,
  PROFILE,
  registerTestRevgift,
  revgiftArgs,
  shareReply,
  unfollowHaru,
} from "./revgift-helpers";

// 역조공 DB — 개인정보 구역(주소)을 건드리지 않는 부분. 스펙: docs/specs/reverse-gift.md

const ADDED_FOLLOWERS = [PROFILE.gureumppang, PROFILE.somsatang, PROFILE.momo];

beforeAll(() => {
  deleteTestRevgifts();
  followHaru(ADDED_FOLLOWERS);
});

afterAll(() => {
  deleteTestRevgifts();
  unfollowHaru(ADDED_FOLLOWERS);
});

describe("INV-R1: 받는 사람은 등록하는 순간 나를 팔로우하는 팬 계정이다", () => {
  it("INV-R1 S1: 하루를 팔로우한 별빛에게 보내기를 등록하면 몫 하나가 생긴다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect(psql(`select count(*) from public.revgift_shares where send_id = '${send.sendId}'`)).toBe("1");
  });

  it("INV-R1 S1b (실패경로): 팔로우하지 않은 팬은 거부되고 아무것도 남지 않는다", async () => {
    const args = revgiftArgs([{ fanId: PROFILE.daltokki, tier: "small" }]);
    const { error } = await adminClient().rpc("register_revgift", args);
    expect(error?.code).toBe("P0021");
    expect(psql(`select count(*) from public.revgift_sends where toss_order_id = '${args.p_toss_order_id}'`)).toBe("0");
  });

  it("INV-R1 S1c (실패경로): 나를 팔로우한 크리에이터 계정에는 역조공을 보낼 수 없다", async () => {
    const { error } = await adminClient().rpc("register_revgift", revgiftArgs([{ fanId: PROFILE.momo, tier: "small" }]));
    expect(error?.code).toBe("P0021");
  });

  it("INV-R1 S1d (실패경로): 자기 자신에게는 보낼 수 없다", async () => {
    const { error } = await adminClient().rpc("register_revgift", revgiftArgs([{ fanId: PROFILE.haru, tier: "small" }]));
    expect(error?.code).toBe("P0021");
  });

  it("INV-R1 (실패경로): 크리에이터가 아닌 계정은 역조공을 보낼 수 없다", async () => {
    const args = revgiftArgs([{ fanId: PROFILE.gureumppang, tier: "small" }], PROFILE.byeolbit);
    const { error } = await adminClient().rpc("register_revgift", args);
    expect(error?.code).toBe("42501");
  });

  it("INV-R1 S1e: 등록 뒤 팔로우를 끊어도 몫은 그대로고 팬은 받지 않기를 할 수 있다", async () => {
    followHaru([PROFILE.daltokki]);
    const send = await registerTestRevgift([{ fanId: PROFILE.daltokki, tier: "small" }]);
    await payTestRevgift(send);
    unfollowHaru([PROFILE.daltokki]);
    const fan = await signedInClient("daltokki_fan");
    expect((await fan.rpc("decline_revgift", { p_order_no: send.orderNos[0] })).error).toBeNull();
    expect(shareReply(send.orderNos[0]!)).toBe("declined");
  });
});

const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";

type FollowerRow = { fan_id: string; nickname: string };

async function haruFollowers(): Promise<FollowerRow[]> {
  const { data, error } = await (await signedInClient("haru_creator")).rpc("my_revgift_followers");
  expect(error).toBeNull();
  return data as FollowerRow[];
}

describe("INV-R2: 받는 팬은 내 팔로워 목록에서 고르고, 목록에는 닉네임만 나온다", () => {
  it("INV-R2 S2: 하루의 목록에 하루를 팔로우하는 팬(별빛·구름빵·솜사탕)이 나온다", async () => {
    const ids = (await haruFollowers()).map((r) => r.fan_id);
    expect(ids).toEqual(expect.arrayContaining([PROFILE.byeolbit, PROFILE.gureumppang, PROFILE.somsatang]));
    expect((await haruFollowers()).find((r) => r.fan_id === PROFILE.byeolbit)?.nickname).toBe("별빛");
  });

  it("INV-R2 S2b (실패경로): 목록 한 줄에는 계정 ID 와 닉네임만 있다 — 아이디·이메일·연락처·주소 칸이 없다", async () => {
    const rows = await haruFollowers();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["fan_id", "nickname"]);
  });

  it("INV-R2 S2c (실패경로): 하루를 팔로우한 크리에이터 계정(모모)과 팔로우하지 않은 팬(달토끼)은 목록에 없다", async () => {
    const ids = (await haruFollowers()).map((r) => r.fan_id);
    expect(ids).not.toContain(PROFILE.momo);
    expect(ids).not.toContain(PROFILE.daltokki);
    expect(ids).not.toContain(PROFILE.haru);
  });

  it("INV-R2 S2d (실패경로): 다른 크리에이터(모모)의 팔로워는 하루 목록에 없고, 그 ID 로 등록하면 거부된다", async () => {
    psql(`insert into public.follows (fan_id, creator_id) values ('${PROFILE.daltokki}', '${MOMO_CREATOR_ID}') on conflict do nothing`);
    try {
      const momo = await signedInClient("momo_creator");
      const momoIds = ((await momo.rpc("my_revgift_followers")).data as FollowerRow[]).map((r) => r.fan_id);
      expect(momoIds).toContain(PROFILE.daltokki);
      expect((await haruFollowers()).map((r) => r.fan_id)).not.toContain(PROFILE.daltokki);
      const args = revgiftArgs([{ fanId: PROFILE.daltokki, tier: "small" }]);
      const { error } = await adminClient().rpc("register_revgift", args);
      expect(error?.code).toBe("P0021");
      expect(psql(`select count(*) from public.revgift_sends where toss_order_id = '${args.p_toss_order_id}'`)).toBe("0");
    } finally {
      psql(`delete from public.follows where fan_id = '${PROFILE.daltokki}' and creator_id = '${MOMO_CREATOR_ID}'`);
    }
  });

  it("INV-R2 S2e (실패경로): 팔로우를 끊은 팬은 목록에서 빠지고, 그 뒤 등록하면 거부된다", async () => {
    followHaru([PROFILE.daltokki]);
    try {
      expect((await haruFollowers()).map((r) => r.fan_id)).toContain(PROFILE.daltokki);
    } finally {
      unfollowHaru([PROFILE.daltokki]);
    }
    expect((await haruFollowers()).map((r) => r.fan_id)).not.toContain(PROFILE.daltokki);
    const { error } = await adminClient().rpc("register_revgift", revgiftArgs([{ fanId: PROFILE.daltokki, tier: "small" }]));
    expect(error?.code).toBe("P0021");
  });

  it("INV-R2 S2f (실패경로): 크리에이터가 아니면 목록이 늘 비어 있고, 로그인하지 않으면 부를 수 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("my_revgift_followers")).data).toEqual([]);
    expect((await anonClient().rpc("my_revgift_followers")).error).not.toBeNull();
  });

  it("INV-R2 S2g: 차단은 역조공과 상관없다(decline-block) — 하루가 별빛을 차단해도 목록에 남고 보낼 수 있다", async () => {
    psql(`insert into public.creator_blocks (creator_id, sender_id) values ('${HARU_CREATOR_ID}', '${PROFILE.byeolbit}')`);
    try {
      expect((await haruFollowers()).map((r) => r.fan_id)).toContain(PROFILE.byeolbit);
      await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    } finally {
      psql(`delete from public.creator_blocks where creator_id = '${HARU_CREATOR_ID}' and sender_id = '${PROFILE.byeolbit}'`);
    }
  });

  it("INV-R2 S2h (실패경로): 아이디로 팬을 찾는 함수는 없다", async () => {
    const haru = await signedInClient("haru_creator");
    const { data, error } = await haru.rpc("find_revgift_fan", { p_login_id: "byeolbit_fan" });
    expect(data).toBeNull();
    expect(error?.code).toBe("PGRST202");
  });
});

describe("INV-R3: 보내기 하나 = 결제 하나, 몫 1~10개, 팬마다 상자 하나·주문번호 하나", () => {
  it("INV-R3 S3: 팬 셋(소형 둘·중형 하나)이면 결제 하나·몫 셋·주문번호 셋·17,700원", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
      { fanId: PROFILE.somsatang, tier: "medium" },
    ]);
    expect(psql(`select amount_krw || ',' || inspection_fee_krw from public.revgift_sends where id = '${send.sendId}'`)).toBe("17700,0");
    expect(psql(`select count(distinct order_no) from public.revgift_shares where send_id = '${send.sendId}'`)).toBe("3");
  });

  it("INV-R3 S3b (실패경로): 몫 0개·11개는 거부된다", async () => {
    const zero = revgiftArgs([]);
    expect((await adminClient().rpc("register_revgift", zero)).error?.code).toBe("22023");
    const eleven = revgiftArgs(Array.from({ length: 11 }, () => ({ fanId: PROFILE.byeolbit, tier: "small" as const })));
    expect((await adminClient().rpc("register_revgift", eleven)).error?.code).toBe("22023");
  });

  it("INV-R3 S3c (실패경로): 같은 팬이 두 번 들어가면 거부되고 아무것도 남지 않는다", async () => {
    const args = revgiftArgs([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.byeolbit, tier: "medium" },
    ]);
    expect((await adminClient().rpc("register_revgift", args)).error?.code).toBe("23505");
    expect(psql(`select count(*) from public.revgift_sends where toss_order_id = '${args.p_toss_order_id}'`)).toBe("0");
  });

  it("INV-R3 (실패경로): 몫 금액의 합이 결제 금액과 다르거나 검수비 칸이 0 이 아니면 거부된다", async () => {
    const mismatch = { ...revgiftArgs([{ fanId: PROFILE.byeolbit, tier: "small" }]), p_amount_krw: 100 };
    expect((await adminClient().rpc("register_revgift", mismatch)).error?.code).toMatch(/^(22023|23514)$/);
    const base = revgiftArgs([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const withInspection = { ...base, p_inspection_fee_krw: 1500, p_service_fee_krw: base.p_service_fee_krw - 1500 };
    // 검수비 칸은 등록 순간의 요금표로 다시 계산한 값(0)과 맞춰 본다(admin-console INV-K3)
    expect((await adminClient().rpc("register_revgift", withInspection)).error?.code).toBe("P0031");
  });

  it("INV-R3 (실패경로): 결제 칸 합은 맞아도 몫 금액의 합이 결제 금액과 다르면 거부된다", async () => {
    const base = revgiftArgs([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const cheapShare = { ...base, p_shares: base.p_shares.map((s) => ({ ...s, amount_krw: 1, shipping_fee_krw: 0 })) };
    expect((await adminClient().rpc("register_revgift", cheapShare)).error?.code).toBe("22023");
    expect(psql(`select count(*) from public.revgift_sends where toss_order_id = '${base.p_toss_order_id}'`)).toBe("0");
  });

  it("INV-R3 (실패경로): 화면 쪽 키로는 보내기를 등록할 수 없다", async () => {
    const haru = await signedInClient("haru_creator");
    const { error } = await haru.rpc("register_revgift", revgiftArgs([{ fanId: PROFILE.byeolbit, tier: "small" }]));
    expect(error).not.toBeNull();
  });
});

describe("INV-R8: 크리에이터에게는 팬 아이디·닉네임·상태 셋만 보인다", () => {
  it("INV-R8 S8·S8b: 보낸 목록의 칸은 정해진 것뿐이고, 거절과 기한 지남은 같은 「받지 않았어요」다", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
      { fanId: PROFILE.somsatang, tier: "small" },
    ]);
    await payTestRevgift(send);
    const [declined, expired, waiting] = send.orderNos as [string, string, string];
    expect((await (await signedInClient("byeolbit_fan")).rpc("decline_revgift", { p_order_no: declined })).error).toBeNull();
    psql(`update public.revgift_shares set reply = 'expired', replied_at = now() where order_no = '${expired}'`);

    const { data, error } = await (await signedInClient("haru_creator")).rpc("my_sent_revgifts");
    expect(error).toBeNull();
    const mine = (data as Record<string, unknown>[]).filter((r) => send.orderNos.includes(r.order_no as string));
    expect(mine).toHaveLength(3);
    for (const row of mine) {
      expect(Object.keys(row).sort()).toEqual(["fan_login_id", "fan_nickname", "order_no", "sent_at", "ship_to_office", "state", "tier"]);
    }
    const stateOf = (no: string) => mine.find((r) => r.order_no === no)?.state;
    expect(stateOf(declined)).toBe("not_received");
    expect(stateOf(expired)).toBe("not_received");
    expect(stateOf(waiting)).toBe("waiting");
  });

  it("INV-R8 (실패경로): 다른 크리에이터의 보낸 목록에는 나오지 않는다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const { data } = await (await signedInClient("momo_creator")).rpc("my_sent_revgifts");
    expect((data as { order_no: string }[]).some((r) => r.order_no === send.orderNos[0])).toBe(false);
  });

  it("INV-R8 S8c (실패경로): 화면 쪽 키로 몫 표를 직접 읽을 수 없다", async () => {
    const haru = await signedInClient("haru_creator");
    const { data } = await haru.from("revgift_shares").select("*");
    expect(data ?? []).toEqual([]);
  });
});

describe("INV-R10: 받지 않기와 168시간 기한", () => {
  it("INV-R10 S10d: 팬이 받지 않기를 하면 「받지 않음」이 된다 — 본인 화면에서는 거절로 구분해 보인다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("decline_revgift", { p_order_no: send.orderNos[0] })).error).toBeNull();
    const { data } = await fan.rpc("my_received_revgifts");
    const row = (data as { order_no: string; reply: string }[]).find((r) => r.order_no === send.orderNos[0]);
    expect(row?.reply).toBe("declined");
  });

  it("INV-R10 (실패경로): 다른 팬은 남의 몫을 받지 않기 할 수 없고, 결제 전 몫도 안 된다", async () => {
    const unpaid = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const owner = await signedInClient("byeolbit_fan");
    expect((await owner.rpc("decline_revgift", { p_order_no: unpaid.orderNos[0] })).error?.code).toBe("P0002");
    await payTestRevgift(unpaid);
    const other = await signedInClient("daltokki_fan");
    expect((await other.rpc("decline_revgift", { p_order_no: unpaid.orderNos[0] })).error?.code).toBe("P0002");
    expect(shareReply(unpaid.orderNos[0]!)).toBe("waiting");
  });

  it("INV-R10 S10·S10b: 167시간 59분이면 그대로, 168시간이 지나면 「받지 않음」 — 다른 몫은 그대로", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
    ]);
    await payTestRevgift(send);
    const [first, second] = send.orderNos as [string, string];
    // 둘째 몫은 이미 거절됐다 — 기한 처리가 덮어쓰지 않는다
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now() where order_no = '${second}'`);

    backdateSettlement(send, 167, 59);
    expect((await adminClient().rpc("expire_revgifts")).error).toBeNull();
    expect(shareReply(first)).toBe("waiting");

    backdateSettlement(send, 168, 0);
    expect((await adminClient().rpc("expire_revgifts")).error).toBeNull();
    expect(shareReply(first)).toBe("expired");
    expect(shareReply(second)).toBe("declined");
  });

  it("INV-R10 (실패경로): 기한이 지난 몫은 받지 않기도 더 할 수 없다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    backdateSettlement(send, 168, 1);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("decline_revgift", { p_order_no: send.orderNos[0] })).error?.code).toBe("P0022");
  });
});

// INV-R11 환불 시험은 admin-refund-db.integration.test.ts 로 옮겼다(환불 기록이 팬 선물과 공용 표가 됐다).

describe("역조공 보내기는 크리에이터 페이지와 묶인다", () => {
  it("보내기 기록의 보내는 크리에이터는 하루의 크리에이터 페이지다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect(psql(`select creator_id from public.revgift_sends where id = '${send.sendId}'`)).toBe(HARU_CREATOR_ID);
  });
});

describe("앱 서버 등록 → DB 등록 함수 (INV-R1·R3 두 장치가 이어진다)", () => {
  it("INV-R1 S1b (실패경로): 팔로우 안 한 팬을 넣으면 DB 가 거부하고 앱은 403 과 한 가지 문구를 준다", async () => {
    const { registerRevgift } = await import("@/features/revgift-send/model/register-revgift");
    const { readTierPrices } = await import("@/entities/payment/api/read-tier-prices");
    const { createSupabaseRevgiftStore } = await import("@/features/revgift-send/api/supabase-revgift-store");
    const r = await registerRevgift(
      { store: createSupabaseRevgiftStore(adminClient()), viewer: { userId: PROFILE.haru, role: "creator" }, readPrices: () => readTierPrices(adminClient()) },
      { shares: [{ fanId: PROFILE.daltokki, tier: "small" }], quotedTotalKrw: 5400 },
    );
    expect(r).toEqual({ ok: false, status: 403, message: "나를 팔로우한 팬에게만 보낼 수 있어요." });
  });

  it("INV-R3 S3: 앱 서버가 계산한 금액으로 등록되고, 결제 기록의 검수비 칸은 0 이다", async () => {
    const { registerRevgift } = await import("@/features/revgift-send/model/register-revgift");
    const { readTierPrices } = await import("@/entities/payment/api/read-tier-prices");
    const { createSupabaseRevgiftStore } = await import("@/features/revgift-send/api/supabase-revgift-store");
    const r = await registerRevgift(
      { store: createSupabaseRevgiftStore(adminClient()), viewer: { userId: PROFILE.haru, role: "creator" }, readPrices: () => readTierPrices(adminClient()) },
      { shares: [{ fanId: PROFILE.byeolbit, tier: "medium" }], quotedTotalKrw: 6900 },
    );
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.amountKrw).toBe(6900);
    expect(psql(`select amount_krw || ',' || inspection_fee_krw || ',' || shipping_fee_krw from public.revgift_sends where toss_order_id = '${r.tossOrderId}'`)).toBe("6900,0,5000");
    psql(`delete from public.revgift_sends where toss_order_id = '${r.tossOrderId}'`);
  });
});

describe("리뷰 뒤 보강 (2026-10-03)", () => {
  it("INV-R10 (실패경로): 이미 받은 몫은 받지 않기로 돌릴 수 없다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    psql(`update public.revgift_shares set reply = 'accepted', replied_at = now() where order_no = '${no}'`);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("decline_revgift", { p_order_no: no })).error?.code).toBe("P0022");
    expect(shareReply(no)).toBe("accepted");
  });

  it("INV-R10 (실패경로): 반송·취소된 몫은 받지 않기를 할 수 없다 — 환불 경로가 둘이 되지 않는다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const col of ["returned_at", "cancelled_at"]) {
      const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
      await payTestRevgift(send);
      const no = send.orderNos[0]!;
      psql(`update public.revgift_shares set ${col} = now() where order_no = '${no}'`);
      expect((await fan.rpc("decline_revgift", { p_order_no: no })).error?.code).toBe("P0022");
      expect(shareReply(no)).toBe("waiting");
    }
  });

  it("INV-R1 (실패경로): 팔로워와 비팔로워를 섞어 등록하면 통째로 거부되고 아무것도 남지 않는다", async () => {
    for (const order of [[PROFILE.byeolbit, PROFILE.daltokki], [PROFILE.daltokki, PROFILE.byeolbit]]) {
      const args = revgiftArgs(order.map((fanId) => ({ fanId, tier: "small" as const })));
      expect((await adminClient().rpc("register_revgift", args)).error?.code).toBe("P0021");
      expect(psql(`select count(*) from public.revgift_sends where toss_order_id = '${args.p_toss_order_id}'`)).toBe("0");
    }
  });

  it("INV-R8: 받은 몫은 「accepted」, 기한이 지났는데 기한 처리 전인 몫은 「not_received」로 보인다", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
    ]);
    await payTestRevgift(send);
    const [accepted, overdue] = send.orderNos as [string, string];
    psql(`update public.revgift_shares set reply = 'accepted', replied_at = now() where order_no = '${accepted}'`);
    backdateSettlement(send, 168, 1);
    const { data } = await (await signedInClient("haru_creator")).rpc("my_sent_revgifts");
    const stateOf = (no: string) => (data as { order_no: string; state: string }[]).find((r) => r.order_no === no)?.state;
    expect(stateOf(accepted)).toBe("accepted");
    expect(stateOf(overdue)).toBe("not_received");
    expect(shareReply(overdue)).toBe("waiting");
  });

  it("INV-R10 (실패경로): 기한 처리는 서버 시각보다 미래의 기준 시각을 받아도 그 시각으로 앞당기지 않는다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const future = new Date(Date.now() + 200 * 3_600_000).toISOString();
    expect((await adminClient().rpc("expire_revgifts", { p_now: future })).error).toBeNull();
    expect(shareReply(send.orderNos[0]!)).toBe("waiting");
  });

  it("팬 본인 목록은 반송과 취소를 나눠 보여 준다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    psql(`update public.revgift_shares set cancelled_at = now() where order_no = '${no}'`);
    const { data } = await (await signedInClient("byeolbit_fan")).rpc("my_received_revgifts");
    const row = (data as { order_no: string; returned: boolean; cancelled: boolean }[]).find((r) => r.order_no === no);
    expect(row).toMatchObject({ returned: false, cancelled: true });
  });

  it("팬 받기 화면은 주문번호 하나만 읽는다 — 남의 몫·없는 번호는 빈 결과", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    const mine = await (await signedInClient("byeolbit_fan")).rpc("my_received_revgift", { p_order_no: no });
    expect((mine.data as { order_no: string }[]).map((r) => r.order_no)).toEqual([no]);
    const other = await (await signedInClient("daltokki_fan")).rpc("my_received_revgift", { p_order_no: no });
    expect(other.data).toEqual([]);
  });
});
