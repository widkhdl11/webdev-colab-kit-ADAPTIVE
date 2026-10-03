import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, psql, psqlError, signedInClient } from "./helpers";
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

describe("INV-R2: 받는 팬은 아이디를 정확히 입력해서만 찾고, 못 찾는 경우는 모두 같은 응답이다", () => {
  it("INV-R2 S2: 하루가 byeolbit_fan 을 입력하면 별빛이 나온다", async () => {
    const haru = await signedInClient("haru_creator");
    const { data, error } = await haru.rpc("find_revgift_fan", { p_login_id: "byeolbit_fan" });
    expect(error).toBeNull();
    expect(data).toEqual([{ fan_id: PROFILE.byeolbit, login_id: "byeolbit_fan", nickname: "별빛" }]);
  });

  it("INV-R2 S2b (실패경로): 없는 아이디·팔로우 안 한 팬·크리에이터 아이디는 응답이 똑같다", async () => {
    const haru = await signedInClient("haru_creator");
    const answers = await Promise.all(
      ["no_such_fan_zz", "daltokki_fan", "momo_creator"].map((id) => haru.rpc("find_revgift_fan", { p_login_id: id })),
    );
    for (const a of answers) {
      expect({ status: a.status, data: a.data, error: a.error }).toEqual({ status: answers[0]!.status, data: [], error: null });
    }
  });

  it("INV-R2 S2c (실패경로): 아이디 앞부분만 넣으면 아무도 나오지 않는다", async () => {
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("find_revgift_fan", { p_login_id: "byeol" })).data).toEqual([]);
    expect((await haru.rpc("find_revgift_fan", { p_login_id: "byeol%" })).data).toEqual([]);
  });

  it("INV-R2 (실패경로): 크리에이터가 아니면 찾기 결과가 늘 비어 있다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("find_revgift_fan", { p_login_id: "gureumppang_fan" })).data).toEqual([]);
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
    expect((await adminClient().rpc("register_revgift", withInspection)).error?.code).toBe("23514");
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
      expect(Object.keys(row).sort()).toEqual(["fan_login_id", "fan_nickname", "order_no", "sent_at", "state", "tier"]);
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

describe("INV-R11: 환불은 몫마다 따로, 한 번만", () => {
  it("INV-R11 S11: 셋 중 중형 몫이 입고 전 받지 않음이면 6,900원만 환불되고 나머지는 그대로", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
      { fanId: PROFILE.somsatang, tier: "medium" },
    ]);
    await payTestRevgift(send);
    const medium = send.orderNos[2]!;
    psql(`update public.revgift_shares set reply = 'expired', replied_at = now() where order_no = '${medium}'`);
    const { data, error } = await adminClient().rpc("record_revgift_refund", { p_order_no: medium });
    expect(error).toBeNull();
    expect(data).toBe(6900);
    expect(shareReply(send.orderNos[0]!)).toBe("waiting");
  });

  it("INV-R11: 입고 뒤 받지 않음은 반송 택배비(그 몫의 배송비 칸)를 뺀 금액", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now(), received_at = now() where order_no = '${no}'`);
    expect((await adminClient().rpc("record_revgift_refund", { p_order_no: no })).data).toBe(5400 - 4000);
  });

  it("INV-R11 S11b (실패경로): 같은 몫의 환불이 동시에 두 번 와도 한 번만 기록된다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    psql(`update public.revgift_shares set reply = 'expired', replied_at = now() where order_no = '${no}'`);
    const results = await Promise.all([1, 2].map(() => adminClient().rpc("record_revgift_refund", { p_order_no: no })));
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(psql(`select count(*) from public.revgift_refunds r join public.revgift_shares s on s.id = r.share_id where s.order_no = '${no}'`)).toBe("1");
  });

  it("INV-R11 S11c (실패경로): 받기를 기다리는 몫·받은 몫은 환불되지 않는다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    expect((await adminClient().rpc("record_revgift_refund", { p_order_no: send.orderNos[0] })).error?.code).toBe("P0022");
  });

  it("INV-R11 (실패경로): 한 보내기의 환불 합계는 결제 금액을 넘지 않는다 — DB 가 막는다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const shareId = psql(`select id from public.revgift_shares where order_no = '${send.orderNos[0]}'`);
    expect(psqlError(`insert into public.revgift_refunds (share_id, amount_krw) values ('${shareId}', 99999)`)).not.toBeNull();
  });

  it("INV-R11 (실패경로): 몫 금액이 잘못 커져 있어도 보내기 전체 환불은 결제 금액을 넘지 못한다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const shareId = psql(`select id from public.revgift_shares where order_no = '${send.orderNos[0]}'`);
    psql(`update public.revgift_shares set amount_krw = 9000 where id = '${shareId}'`);
    expect(psqlError(`insert into public.revgift_refunds (share_id, amount_krw) values ('${shareId}', 9000)`)).not.toBeNull();
    expect(psqlError(`insert into public.revgift_refunds (share_id, amount_krw) values ('${shareId}', 5400)`)).toBeNull();
  });

  it("INV-R11 (실패경로): 결제 금액 안이라도 몫 하나의 환불은 그 몫 금액을 넘지 못한다", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
    ]);
    await payTestRevgift(send);
    const shareId = psql(`select id from public.revgift_shares where order_no = '${send.orderNos[0]}'`);
    expect(psqlError(`insert into public.revgift_refunds (share_id, amount_krw) values ('${shareId}', 6000)`)).not.toBeNull();
  });
});


describe("역조공 보내기는 크리에이터 페이지와 묶인다", () => {
  it("보내기 기록의 보내는 크리에이터는 하루의 크리에이터 페이지다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect(psql(`select creator_id from public.revgift_sends where id = '${send.sendId}'`)).toBe(HARU_CREATOR_ID);
  });
});

describe("앱 서버 등록 → DB 등록 함수 (INV-R1·R3 두 장치가 이어진다)", () => {
  it("INV-R1 S1b (실패경로): 팔로우 안 한 팬을 넣으면 DB 가 거부하고 앱은 403 과 한 가지 문구를 준다", async () => {
    const { registerRevgift } = await import("@/features/revgift-send/model/register-revgift");
    const { createSupabaseRevgiftStore } = await import("@/features/revgift-send/api/supabase-revgift-store");
    const r = await registerRevgift(
      { store: createSupabaseRevgiftStore(adminClient()), viewer: { userId: PROFILE.haru, role: "creator" } },
      { shares: [{ fanId: PROFILE.daltokki, tier: "small" }] },
    );
    expect(r).toEqual({ ok: false, status: 403, message: "나를 팔로우한 팬에게만 보낼 수 있어요." });
  });

  it("INV-R3 S3: 앱 서버가 계산한 금액으로 등록되고, 결제 기록의 검수비 칸은 0 이다", async () => {
    const { registerRevgift } = await import("@/features/revgift-send/model/register-revgift");
    const { createSupabaseRevgiftStore } = await import("@/features/revgift-send/api/supabase-revgift-store");
    const r = await registerRevgift(
      { store: createSupabaseRevgiftStore(adminClient()), viewer: { userId: PROFILE.haru, role: "creator" } },
      { shares: [{ fanId: PROFILE.byeolbit, tier: "medium" }] },
    );
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.amountKrw).toBe(6900);
    expect(psql(`select amount_krw || ',' || inspection_fee_krw || ',' || shipping_fee_krw from public.revgift_sends where toss_order_id = '${r.tossOrderId}'`)).toBe("6900,0,5000");
    psql(`delete from public.revgift_sends where toss_order_id = '${r.tossOrderId}'`);
  });
});
