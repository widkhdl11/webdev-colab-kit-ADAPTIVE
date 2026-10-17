import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, holdRowLock, psql, signedInClient } from "./helpers";
import { creatorSetsWaybill, finishPrint, finishReturnPrint, inspect, markReturnConfirmedForTest, receiveAndLabel, SHARE_PASS, waybill } from "./office-helpers";
import {
  backdateSettlement,
  deleteTestRevgifts,
  keptSince,
  followHaru,
  payTestRevgift,
  PROFILE,
  registerTestRevgift,
  acceptWithAddress,
  registerFanAddress,
  shareReply,
  unfollowHaru,
} from "./revgift-helpers";

// 역조공 기한 처리·몫 닫기를 부르는 곳 (reverse-gift INV-R9·R10·R11, admin-console INV-K1).
// - 몫 닫기: 사무실 작업 흐름의 출고 확정·반송 확정이 같은 처리 안에서 몫을 닫고 팬 주소를 지운다(R9).
// - 기한 처리: 운영자가 관리자 화면(자동 처리 현황·역조공 처리)에서 「지금 돌리기」로 부른다(R10). 운영자만(K1).
// - 기한 처리로 받지 않음이 된 몫만 환불 대상이 되고 금액은 몫마다 따로다(R11).
// 시드 주문·계정은 바꾸지 않는다 — 시험마다 새 보내기(RG-T…)를 만들고 끝나면 지운다.

function addressCount(orderNo: string): number {
  return Number(psql(`select count(*) from pii.revgift_addresses a join public.revgift_shares s on s.id = a.share_id where s.order_no = '${orderNo}'`));
}

function closeEvents(orderNo: string): string {
  return psql(
    `select coalesce(string_agg(e.event || ',' || e.outcome, ';'), '') from public.revgift_address_events e join public.revgift_shares s on s.id = e.share_id where s.order_no = '${orderNo}'`,
  );
}

/** 하루 → 별빛 몫 하나를 결제하고 별빛이 받기를 한다. 크리에이터가 원 송장번호를 넣고 사무실이 입고·라벨까지 한다. */
async function acceptedAndLabeled(): Promise<{ orderNo: string; qr: string }> {
  const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
  await payTestRevgift(send);
  const orderNo = send.orderNos[0]!;
  const fan = await signedInClient("byeolbit_fan");
  const accepted = await acceptWithAddress(fan, orderNo);
  if (accepted.error) throw new Error(`accept_revgift 실패: ${accepted.error.message}`);
  const shareId = psql(`select id from public.revgift_shares where order_no = '${orderNo}'`);
  const no = waybill();
  await creatorSetsWaybill(shareId, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  return { orderNo, qr };
}

// 구름빵은 시드에서 하루를 팔로우하지 않는다 — 두 사람 몫 시험 동안만 팔로우를 붙인다
const ADDED_FOLLOWERS = [PROFILE.gureumppang];

beforeAll(() => {
  deleteTestRevgifts();
  followHaru(ADDED_FOLLOWERS);
});
afterAll(() => {
  deleteTestRevgifts();
  unfollowHaru(ADDED_FOLLOWERS);
});

describe("INV-R9: 사무실 흐름의 출고 확정·반송 확정이 몫을 닫고 팬 주소를 지운다", () => {
  it("INV-R9 S9: 출고 확정 스캔 한 번으로 몫이 닫히고 주소가 지워지며, 지운 기록이 한 줄 남는다", async () => {
    const { orderNo, qr } = await acceptedAndLabeled();
    const staff = await signedInClient("fankkuk_staff");
    expect(await inspect(staff, qr, SHARE_PASS)).toBe("inspected");
    const out = waybill();
    expect(finishPrint(qr, out)).toBeNull();
    expect(addressCount(orderNo)).toBe(1);

    expect((await staff.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: out })).error).toBeNull();
    expect(addressCount(orderNo)).toBe(0);
    expect(closeEvents(orderNo)).toBe("deleted,shipped");
    expect(psql(`select shipped_at is not null from public.revgift_shares where order_no = '${orderNo}'`)).toBe("t");
  });

  it("INV-R9 S9b: 검수에서 걸린 몫을 반송 확정하면 같은 처리 안에서 주소가 지워진다", async () => {
    const { orderNo, qr } = await acceptedAndLabeled();
    const staff = await signedInClient("fankkuk_staff");
    expect(await inspect(staff, qr, { surface: "found", prohibited: "clear", outcome: "return" })).toBe("return_waiting");
    const back = waybill();
    // 주문에 이어진 몫 상자의 반송 송장은 보낸 크리에이터가 반송 주소를 확인한 뒤 마무리로 출력 단계로 간다(office-workflow INV-W15) — 여기서는 확인 표시만 채운다
    markReturnConfirmedForTest(qr);
    expect(finishReturnPrint(qr, back)).toBeNull();
    expect(addressCount(orderNo)).toBe(1);

    expect((await staff.rpc("office_confirm_return", { p_qr: qr, p_waybill: back })).error).toBeNull();
    expect(addressCount(orderNo)).toBe(0);
    expect(closeEvents(orderNo)).toBe("deleted,returned");
    expect(psql(`select returned_at is not null from public.revgift_shares where order_no = '${orderNo}'`)).toBe("t");
    // INV-W15 (실패경로): 반송 확정된 몫은 처분이 아니다
    expect(psql(`select disposed_at is null from public.revgift_shares where order_no = '${orderNo}'`)).toBe("t");
  });

  it("INV-R9 · INV-W15: 반송 주소를 30일 확인하지 않아 처분된 몫 상자 — 처분 기록 처리 안에서 몫이 「처분」으로 닫히고 받는 팬 주소가 지워진다", async () => {
    const { orderNo, qr } = await acceptedAndLabeled();
    const staff = await signedInClient("fankkuk_staff");
    expect(await inspect(staff, qr, { surface: "found", prohibited: "clear", outcome: "return" })).toBe("return_waiting");
    psql(`update public.office_parcels set return_waiting_at = now() - interval '721 hours' where qr_code = '${qr}'`);
    const run = await staff.rpc("office_run_expiry", { p_order_no: orderNo });
    expect(run.error).toBeNull();
    expect(psql(`select state from public.office_parcels where qr_code = '${qr}'`)).toBe("dispose_due");
    // 처분 대상이 된 것만으로는 몫이 닫히지 않는다 — 처분을 기록해야 끝난다
    expect(addressCount(orderNo)).toBe(1);
    expect(closeEvents(orderNo)).toBe("");

    expect((await staff.rpc("office_record_disposal", { p_qr: qr })).data).toBe("disposed");
    expect(addressCount(orderNo)).toBe(0);
    // 처분으로 닫힌다(manual/0021) — 지운 기록의 결과 값도 처분. 닫힌 몫을 세 시각으로 보는 읽기들을 위해 반송 시각도 같이 적힌다
    expect(closeEvents(orderNo)).toBe("deleted,disposed");
    expect(
      psql(
        `select (disposed_at is not null) || '/' || (returned_at is not null) || '/' || (shipped_at is null) || '/' || (cancelled_at is null) from public.revgift_shares where order_no = '${orderNo}'`,
      ),
    ).toBe("true/true/true/true");
    // 팬 본인 목록에는 처분으로 보인다 — 반송(돌려보냄)으로 보이지 않게 disposed 칸이 켜진다
    const fan = await signedInClient("byeolbit_fan");
    const mine = ((await fan.rpc("my_received_revgifts")).data ?? []) as { order_no: string; disposed: boolean }[];
    expect(mine.find((r) => r.order_no === orderNo)?.disposed).toBe(true);
    expect(psql(`select count(*) from public.office_disposals d join public.office_parcels p on p.id = d.parcel_id where p.qr_code = '${qr}'`)).toBe("1");
  });

  it("INV-R9 (실패경로): 출고 송장을 출력만 하고 확정하지 않으면 주소는 그대로다 — 닫기는 확정 때만", async () => {
    const { orderNo, qr } = await acceptedAndLabeled();
    const staff = await signedInClient("fankkuk_staff");
    await inspect(staff, qr, SHARE_PASS);
    expect(finishPrint(qr, waybill())).toBeNull();
    expect(psql(`select state from public.office_parcels where qr_code = '${qr}'`)).toBe("label_printed");
    expect(addressCount(orderNo)).toBe(1);
    expect(closeEvents(orderNo)).toBe("");
  });

  it("INV-R9 (실패경로): 출고 확정 뒤에는 송장을 다시 출력할 수 없고 몫·지운 기록도 그대로다", async () => {
    const { orderNo, qr } = await acceptedAndLabeled();
    const staff = await signedInClient("fankkuk_staff");
    await inspect(staff, qr, SHARE_PASS);
    const out = waybill();
    expect(finishPrint(qr, out)).toBeNull();
    expect((await staff.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: out })).error).toBeNull();
    expect(finishPrint(qr, waybill())).toBe("55000");
    expect(psql(`select state from public.office_parcels where qr_code = '${qr}'`)).toBe("shipped");
    expect(closeEvents(orderNo)).toBe("deleted,shipped");
  });

  it("INV-R9: 지운 기록에는 주소가 없다 — 칸은 몫·사건·결과·시각뿐", async () => {
    expect(
      psql(
        "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'revgift_address_events'",
      ),
    ).toBe("id,share_id,event,outcome,at");
  });

  it("INV-R9: 취소로 이미 닫힌 몫의 상자를 반송 확정하면 반송 시각이 적히고 몫 닫기는 다시 돌지 않는다", async () => {
    const { orderNo, qr } = await acceptedAndLabeled();
    expect((await adminClient().rpc("close_revgift_share", { p_order_no: orderNo, p_outcome: "cancelled" })).error).toBeNull();
    expect(closeEvents(orderNo)).toBe("deleted,cancelled");
    const staff = await signedInClient("fankkuk_staff");
    expect(await inspect(staff, qr, SHARE_PASS)).toBe("return_waiting");
    const back = waybill();
    // 주문에 이어진 몫 상자의 반송 송장은 보낸 크리에이터가 반송 주소를 확인한 뒤 마무리로 출력 단계로 간다(office-workflow INV-W15) — 여기서는 확인 표시만 채운다
    markReturnConfirmedForTest(qr);
    expect(finishReturnPrint(qr, back)).toBeNull();
    expect((await staff.rpc("office_confirm_return", { p_qr: qr, p_waybill: back })).error).toBeNull();
    expect(psql(`select (returned_at is not null) || '/' || (cancelled_at is not null) from public.revgift_shares where order_no = '${orderNo}'`)).toBe(
      "true/true",
    );
    expect(closeEvents(orderNo)).toBe("deleted,cancelled");
  });
});

describe("INV-R10 · INV-K1: 역조공 받기 기한 처리는 운영자가 관리자 화면에서 부른다", () => {
  it("INV-R10 S10: 운영자가 한 몫만 「지금 돌리기」 하면 그 몫만 받지 않음이 되고 같은 보내기의 다른 몫은 그대로다", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "medium" },
    ]);
    await payTestRevgift(send);
    backdateSettlement(send, 168, 1);
    const staff = await signedInClient("fankkuk_staff");
    const { data, error } = await staff.rpc("office_run_expiry", { p_order_no: send.orderNos[0] });
    expect(error).toBeNull();
    expect((data as { revgifts: number }).revgifts).toBe(1);
    expect(shareReply(send.orderNos[0]!)).toBe("expired");
    expect(shareReply(send.orderNos[1]!)).toBe("waiting");
  });

  it("INV-R10 S10b (실패경로): 167시간 59분 지난 몫은 운영자가 돌려도 그대로다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    backdateSettlement(send, 167, 59);
    const staff = await signedInClient("fankkuk_staff");
    const { data, error } = await staff.rpc("office_run_expiry", { p_order_no: send.orderNos[0] });
    expect(error).toBeNull();
    expect((data as { revgifts: number }).revgifts).toBe(0);
    expect(shareReply(send.orderNos[0]!)).toBe("waiting");
  });

  it("INV-K1 (실패경로): 팬·크리에이터는 기한 처리를 부를 수 없고 몫도 그대로다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    backdateSettlement(send, 168, 1);
    for (const who of ["byeolbit_fan", "haru_creator"]) {
      const client = await signedInClient(who);
      expect((await client.rpc("office_run_expiry", { p_order_no: send.orderNos[0] })).error?.code).toBe("42501");
      expect((await client.rpc("expire_revgifts", {})).error?.code).toBe("42501");
    }
    expect(shareReply(send.orderNos[0]!)).toBe("waiting");
  });

  it("INV-R11 S11·S11e: 기한 처리로 받지 않음이 된 몫은 상자가 안 온 채 168시간이 지나 닫힐 때 환불 대상(그 몫 전액)이 된다 — 그 전에는 아니다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "medium" }]);
    await payTestRevgift(send);
    const other = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(other);
    backdateSettlement(send, 168, 1);
    const due = (no: string) =>
      psql(`select coalesce(public.refund_due_of_share(s.id)::text, 'none') from public.revgift_shares s where s.order_no = '${no}'`);
    expect(due(send.orderNos[0]!)).toBe("none");
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("office_run_expiry", { p_order_no: send.orderNos[0] });
    // 받지 않음이 됐어도 상자가 오는 중일 수 있어 6자리를 살려 두고 환불을 미룬다
    expect(due(send.orderNos[0]!)).toBe("none");
    keptSince(send.orderNos[0]!, 167);
    await staff.rpc("office_run_expiry", { p_order_no: send.orderNos[0] });
    expect(due(send.orderNos[0]!)).toBe("none");
    keptSince(send.orderNos[0]!, 169);
    await staff.rpc("office_run_expiry", { p_order_no: send.orderNos[0] });
    expect(psql(`select state from public.inbound_codes c join public.revgift_shares s on s.id = c.share_id where s.order_no = '${send.orderNos[0]}'`)).toBe("void");
    expect(due(send.orderNos[0]!)).toBe("6900");
    expect(due(other.orderNos[0]!)).toBe("none");
  });

  it("INV-R11 (S11e, 경계): 살려 둔 때부터 168시간 「안에」 안 오면 닫는다 — 167시간 59분 59초면 그대로, 정확히 168시간이면 6자리 무효·몫 전액", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "medium" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    backdateSettlement(send, 168, 1);
    await (await signedInClient("fankkuk_staff")).rpc("office_run_expiry", { p_order_no: no });
    const due = () => psql(`select coalesce(public.refund_due_of_share(s.id)::text, 'none') from public.revgift_shares s where s.order_no = '${no}'`);
    const code = () => psql(`select state from public.inbound_codes c join public.revgift_shares s on s.id = c.share_id where s.order_no = '${no}'`);
    // 살려 둔 시각을 옮기고 같은 처리 안에서 자동 처리를 돌린다 — 한 처리 안의 now() 는 한 값이라 경계를 오차 없이 본다
    const keepThenExpiry = (gap: string) =>
      psql(
        `begin; set local session_replication_role = replica; update public.inbound_codes c set kept_at = now() - interval '${gap}' from public.revgift_shares s where s.id = c.share_id and s.order_no = '${no}' and c.kept_at is not null; set local session_replication_role = origin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); select public.office_run_expiry('${no}') ->> 'kept_closed'; commit;`,
      )
        .split(/\r?\n/)
        .slice(-2)[0]!
        .trim(); // 마지막 줄은 COMMIT
    expect(code()).toBe("valid");
    expect(keepThenExpiry("167 hours 59 minutes 59 seconds")).toBe("0");
    expect(code()).toBe("valid");
    expect(due()).toBe("none");
    expect(keepThenExpiry("168 hours")).toBe("1");
    expect(code()).toBe("void");
    expect(due()).toBe("6900");
  });

  it("INV-R11 S11d: 받지 않음이 된 몫의 상자가 살려 둔 6자리로 오면 그 몫 상자로 입고 → 반송 대기, 환불 = 반송 택배비를 뺀 금액", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    const due = () => psql(`select coalesce(public.refund_due_of_share(s.id)::text, 'none') from public.revgift_shares s where s.order_no = '${no}'`);
    const shareIdOf = () => psql(`select id from public.revgift_shares where order_no = '${no}'`);
    await (await signedInClient("byeolbit_fan")).rpc("decline_revgift", { p_order_no: no });
    expect(due()).toBe("none");
    const staff = await signedInClient("fankkuk_staff");
    const w = waybill();
    await creatorSetsWaybill(shareIdOf(), w);
    await receiveAndLabel(staff, w);
    expect(due()).toBe(String(5400 - 4000));
  });

  it("INV-R10 · INV-W6: 같은 몫을 두 번 돌려도 두 번째는 0건이다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    backdateSettlement(send, 168, 1);
    const staff = await signedInClient("fankkuk_staff");
    const run = async () => ((await staff.rpc("office_run_expiry", { p_order_no: send.orderNos[0] })).data as { revgifts: number }).revgifts;
    expect(await run()).toBe(1);
    expect(await run()).toBe(0);
    expect(shareReply(send.orderNos[0]!)).toBe("expired");
  });

  it("INV-R10 (실패경로): 기한은 몫마다 그 보내기의 결제 시각으로 판정한다 — 지난 몫만 받지 않음이 된다", async () => {
    const past = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(past);
    backdateSettlement(past, 168, 1);
    const fresh = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(fresh);
    backdateSettlement(fresh, 100);
    const staff = await signedInClient("fankkuk_staff");
    for (const no of [past.orderNos[0], fresh.orderNos[0]]) await staff.rpc("office_run_expiry", { p_order_no: no });
    expect(shareReply(past.orderNos[0]!)).toBe("expired");
    expect(shareReply(fresh.orderNos[0]!)).toBe("waiting");
  });

  it("INV-R10 (동시): 기한 직전의 받기와 기한 처리가 겹쳐도 둘 중 하나만 — 받은 몫이 받지 않음으로 덮이지 않는다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const staff = await signedInClient("fankkuk_staff");
    for (let i = 0; i < 4; i += 1) {
      const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
      await payTestRevgift(send);
      const no = send.orderNos[0]!;
      // 기한이 300ms 뒤에 닥친다 — 받기는 바로 보내고, 기한 처리는 기한을 넘겨 보낸다
      psql(`update public.revgift_sends set settled_at = now() - interval '168 hours' + interval '300 milliseconds' where id = '${send.sendId}'`);
      await registerFanAddress(fan);
      const accepting = fan.rpc("accept_revgift", { p_order_no: no });
      await new Promise((r) => setTimeout(r, 300));
      const [accepted] = await Promise.all([accepting, staff.rpc("office_run_expiry", { p_order_no: no })]);
      const reply = shareReply(no);
      if (accepted.error) {
        expect(reply).toBe("expired");
        expect(addressCount(no)).toBe(0);
      } else {
        expect(reply).toBe("accepted");
        expect(addressCount(no)).toBe(1);
      }
    }
  });
});

describe("INV-R11: 기한 처리로 받지 않음이 된 몫의 환불은 그 몫 요금만, 한 번만", () => {
  const due = (no: string) => psql(`select coalesce(public.refund_due_of_share(s.id)::text, 'none') from public.revgift_shares s where s.order_no = '${no}'`);
  const shareIdOf = (no: string) => psql(`select id from public.revgift_shares where order_no = '${no}'`);
  async function claim(id: string) {
    const owner = await signedInClient("fankkuk_admin");
    const { data, error } = await owner.rpc("admin_claim_refund", { p_kind: "revgift", p_unit_id: id });
    return { amount: ((data ?? []) as { amount_krw: number }[])[0]?.amount_krw ?? null, code: error?.code ?? null };
  }
  // 솜사탕은 시드에서 하루를 팔로우하지 않는다 — 몫 셋 시험 동안만 붙인다
  beforeAll(() => followHaru([PROFILE.somsatang]));
  afterAll(() => unfollowHaru([PROFILE.somsatang]));

  it("INV-R11: 몫 셋(소형 둘·중형 하나) 중 중형 몫만 기한 처리하면 그 몫 요금(6,900원)만 환불 대상이고 나머지는 대상이 아니다", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
      { fanId: PROFILE.somsatang, tier: "medium" },
    ]);
    await payTestRevgift(send);
    backdateSettlement(send, 168, 1);
    await (await signedInClient("fankkuk_staff")).rpc("office_run_expiry", { p_order_no: send.orderNos[2] });
    keptSince(send.orderNos[2]!, 169);
    await (await signedInClient("fankkuk_staff")).rpc("office_run_expiry", { p_order_no: send.orderNos[2] });
    expect(send.orderNos.map((no) => due(no))).toEqual(["none", "none", "6900"]);
    expect(await claim(shareIdOf(send.orderNos[2]!))).toEqual({ amount: 6900, code: null });
  });

  it("INV-R11: 사무실에 입고된 뒤 기한이 지나 받지 않음이 되면 그 몫의 반송 택배비(배송비 칸)를 뺀다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    const w = waybill();
    await creatorSetsWaybill(shareIdOf(no), w);
    const staff = await signedInClient("fankkuk_staff");
    await receiveAndLabel(staff, w);
    backdateSettlement(send, 168, 1);
    await staff.rpc("office_run_expiry", { p_order_no: no });
    expect(shareReply(no)).toBe("expired");
    expect(due(no)).toBe(String(5400 - 4000));
  });

  it("INV-R11 (실패경로): 같은 몫의 환불을 두 번 누르면 두 번째는 거부되고, 동시에 두 번 눌러도 기록은 하나", async () => {
    const one = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const two = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const staff = await signedInClient("fankkuk_staff");
    for (const send of [one, two]) {
      await payTestRevgift(send);
      backdateSettlement(send, 168, 1);
      await staff.rpc("office_run_expiry", { p_order_no: send.orderNos[0] });
      keptSince(send.orderNos[0]!, 169);
      await staff.rpc("office_run_expiry", { p_order_no: send.orderNos[0] });
    }
    const first = shareIdOf(one.orderNos[0]!);
    expect((await claim(first)).code).toBeNull();
    expect((await claim(first)).code).toBe("P0024");
    const second = shareIdOf(two.orderNos[0]!);
    // 두 요청을 확실히 겹치게: 로그인을 미리 해 두고, 환불 표 쓰기를 잠깐 막아 둔 사이에 둘을 보낸다
    const owner = await signedInClient("fankkuk_admin");
    const hold = await holdRowLock("lock table public.refunds in share mode", 2);
    const both = (
      await Promise.all([
        owner.rpc("admin_claim_refund", { p_kind: "revgift", p_unit_id: second }),
        owner.rpc("admin_claim_refund", { p_kind: "revgift", p_unit_id: second }),
        hold.released,
      ])
    )
      .slice(0, 2)
      .map((r) => ({ code: (r as { error: { code?: string } | null }).error?.code ?? null }));
    expect(both.filter((r) => r.code === null)).toHaveLength(1);
    expect(both.filter((r) => r.code === "P0024")).toHaveLength(1);
    expect(psql(`select count(*) from public.refunds where share_id in ('${first}', '${second}')`)).toBe("2");
  });
});
