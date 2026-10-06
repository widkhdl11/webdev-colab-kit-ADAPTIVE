import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { psql, signedInClient } from "./helpers";
import { deleteTestRevgifts, followHaru, payTestRevgift, PROFILE, registerTestRevgift, unfollowHaru, type TestSend } from "./revgift-helpers";

// 보낸 역조공의 사무실 주소 안내 (reverse-gift INV-R14).
// - DB 읽기(my_sent_revgifts)가 보내기마다 「사무실로 보낼 상자가 남았는지」(ship_to_office)를 준다. 주소 값은 앱 서버가 한 곳에서 붙인다.
// - 결제가 끝난 보내기에만, 팬의 받기를 기다리지 않고. 몫이 모두 받지 않음·반송·취소면 거짓.
// - 보낸 크리에이터 본인 것만 읽힌다.
// 시드 주문·계정은 바꾸지 않는다 — 시험마다 새 보내기(RG-T…)를 만들고 끝나면 지운다.

type Row = { order_no: string; ship_to_office: boolean };

async function sentRows(loginId = "haru_creator"): Promise<Row[]> {
  const r = await (await signedInClient(loginId)).rpc("my_sent_revgifts");
  if (r.error) throw new Error(`my_sent_revgifts 실패: ${r.error.message}`);
  return r.data as Row[];
}

async function shipFlags(send: TestSend): Promise<boolean[]> {
  const rows = await sentRows();
  return send.orderNos.map((no) => {
    const row = rows.find((x) => x.order_no === no);
    if (!row) throw new Error(`보낸 역조공에 ${no} 가 없다`);
    return row.ship_to_office;
  });
}

const setShare = (orderNo: string, sql: string) => psql(`update public.revgift_shares set ${sql} where order_no = '${orderNo}'`);

async function paidTwo(): Promise<TestSend> {
  const send = await registerTestRevgift([
    { fanId: PROFILE.byeolbit, tier: "small" },
    { fanId: PROFILE.gureumppang, tier: "small" },
  ]);
  await payTestRevgift(send);
  return send;
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

describe("INV-R14: 결제가 끝난 보내기를 보낸 크리에이터에게 사무실 주소 안내", () => {
  it("INV-R14 S14: 결제 직후(팬이 아직 받기 전)에도 보낼 상자가 있다 — 보내기의 모든 몫에 같은 값", async () => {
    const send = await paidTwo();
    expect(await shipFlags(send)).toEqual([true, true]);
  });

  it("INV-R14: 한 팬은 받지 않아도 다른 팬이 받았거나 기다리는 중이면 그대로 있다", async () => {
    const send = await paidTwo();
    setShare(send.orderNos[0]!, "reply = 'declined', replied_at = now()");
    expect(await shipFlags(send)).toEqual([true, true]);
    setShare(send.orderNos[1]!, "reply = 'accepted', replied_at = now()");
    expect(await shipFlags(send)).toEqual([true, true]);
  });

  it("INV-R14 S14b (실패경로): 몫이 모두 받지 않음(거절·기한 지남)이면 없다", async () => {
    const send = await paidTwo();
    setShare(send.orderNos[0]!, "reply = 'declined', replied_at = now()");
    setShare(send.orderNos[1]!, "reply = 'expired', replied_at = now()");
    expect(await shipFlags(send)).toEqual([false, false]);
  });

  it("INV-R14 (실패경로): 받기 기한이 지났는데 아직 기한 처리 전인 몫도 받지 않음으로 본다", async () => {
    const send = await paidTwo();
    psql(`update public.revgift_sends set settled_at = now() - interval '169 hours' where id = '${send.sendId}'`);
    expect(await shipFlags(send)).toEqual([false, false]);
  });

  it("INV-R14 (실패경로): 남은 몫이 반송됐거나 취소됐으면 없다", async () => {
    const send = await paidTwo();
    setShare(send.orderNos[0]!, "reply = 'declined', replied_at = now()");
    setShare(send.orderNos[1]!, "returned_at = now()");
    expect(await shipFlags(send)).toEqual([false, false]);
    setShare(send.orderNos[1]!, "returned_at = null, cancelled_at = now()");
    expect(await shipFlags(send)).toEqual([false, false]);
  });

  it("INV-R14 S14b (실패경로): 결제 대기 보내기는 목록에 없고, 다른 크리에이터는 하루의 보내기를 읽지 못한다", async () => {
    const pending = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect((await sentRows()).map((r) => r.order_no)).not.toContain(pending.orderNos[0]);
    const paid = await paidTwo();
    const momo = (await sentRows("momo_creator")).map((r) => r.order_no);
    expect(momo).not.toContain(paid.orderNos[0]);
    expect(momo).not.toContain(paid.orderNos[1]);
  });
});
