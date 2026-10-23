import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, psql, signedInClient } from "./helpers";
import { ageShareShipment, dropAddressCopies } from "./office-helpers";
import {
  acceptWithAddress,
  backdateSettlement,
  clearFanAddresses,
  deleteTestRevgifts,
  followHaru,
  payTestRevgift,
  PROFILE,
  registerFanAddress,
  registerTestRevgift,
  sampleEnvelope,
  shareReply,
  unfollowHaru,
} from "./revgift-helpers";

// 역조공 팬 주소 — 개인정보 구역(pii)에 저장되는 부분. supabase/manual/0005·0006·0019 를 적용해야 돈다.
// 스펙: docs/specs/reverse-gift.md (INV-R4·R5·R6·R9). 2026-10-17(manual/0019)부터 받기는 봉투를 받지 않고,
// 팬이 설정에 등록한 받을 주소(address-protection INV-P17)의 암호문을 몫에 복사한다.

const ADDED_FOLLOWERS = [PROFILE.gureumppang];
const TEST_FANS = [PROFILE.byeolbit, PROFILE.daltokki];

function addressCount(orderNo: string): number {
  return Number(
    psql(
      `select count(*) from pii.revgift_addresses a join public.revgift_shares s on s.id = a.share_id where s.order_no = '${orderNo}'`,
    ),
  );
}

function storedEnvelope(orderNo: string): string {
  return psql(
    `select a.envelope::text from pii.revgift_addresses a join public.revgift_shares s on s.id = a.share_id where s.order_no = '${orderNo}'`,
  );
}

async function paidShareFor(fanId: string): Promise<string> {
  const send = await registerTestRevgift([{ fanId, tier: "small" }]);
  await payTestRevgift(send);
  return send.orderNos[0]!;
}

function fanEnvelope(profileId: string): string {
  return psql(`select envelope::text from pii.fan_addresses where account_id = '${profileId}'`);
}

beforeAll(() => {
  deleteTestRevgifts();
  clearFanAddresses(TEST_FANS);
  followHaru(ADDED_FOLLOWERS);
});

afterAll(() => {
  deleteTestRevgifts();
  clearFanAddresses(TEST_FANS);
  unfollowHaru(ADDED_FOLLOWERS);
});

describe("INV-R4: 몫의 주소는 그 몫의 받는 팬 본인이 받기를 할 때만 들어간다", () => {
  it("INV-R4 S4: 별빛이 받을 주소 「집」을 등록하고 받기 → 몫에 등록 주소의 암호문이 복사되고 「받았어요」", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    const { error } = await acceptWithAddress(fan, no);
    expect(error).toBeNull();
    expect(shareReply(no)).toBe("accepted");
    expect(addressCount(no)).toBe(1);
    expect(storedEnvelope(no)).toBe(fanEnvelope(PROFILE.byeolbit));
  });

  it("INV-R4 S4: 받은 뒤 설정 주소를 바꾸거나 지워도 몫의 암호문은 받은 때 그대로다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await acceptWithAddress(fan, no);
    const copied = storedEnvelope(no);
    await registerFanAddress(fan, sampleEnvelope(), "office");
    expect(fanEnvelope(PROFILE.byeolbit)).not.toBe(copied);
    expect(storedEnvelope(no)).toBe(copied);
    expect((await fan.rpc("delete_my_fan_address")).data).toBe("deleted");
    expect(storedEnvelope(no)).toBe(copied);
  });

  it("INV-R4 S4 (실패경로): 등록 주소가 없으면 받기는 거부되고 아무것도 바뀌지 않는다 — 화면이 먼저 등록시킨다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    clearFanAddresses([PROFILE.byeolbit]);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("accept_revgift", { p_order_no: no })).error?.code).toBe("P0026");
    expect(shareReply(no)).toBe("waiting");
    expect(addressCount(no)).toBe(0);
  });

  it("INV-R4 S4b (실패경로): 다른 팬이 받기를 하면 — 그 팬의 등록 주소가 있어도 — 거부되고 아무것도 저장되지 않는다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const other = await signedInClient("daltokki_fan");
    expect((await acceptWithAddress(other, no)).error?.code).toBe("P0002");
    expect(addressCount(no)).toBe(0);
    expect(shareReply(no)).toBe("waiting");
  });

  it("INV-R4 S4c (실패경로): 보낸 크리에이터가 주소를 넣으려 하면 거부된다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("accept_revgift", { p_order_no: no })).error?.code).toBe("P0002");
    expect(addressCount(no)).toBe(0);
  });

  it("INV-R4 S4d (실패경로): 이미 받은 몫에 다시 받기를 하면 거부되고 처음 주소가 그대로다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await acceptWithAddress(fan, no);
    const first = storedEnvelope(no);
    expect((await acceptWithAddress(fan, no)).error?.code).toBe("P0022");
    expect(storedEnvelope(no)).toBe(first);
  });

  it("INV-R4 S4e (동시): 받기 요청 두 개가 동시에 오면 저장은 하나뿐이다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const [a, b] = await Promise.all([signedInClient("byeolbit_fan"), signedInClient("byeolbit_fan")]);
    await registerFanAddress(a);
    const results = await Promise.all([a.rpc("accept_revgift", { p_order_no: no }), b.rpc("accept_revgift", { p_order_no: no })]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(addressCount(no)).toBe(1);
  });

  it("INV-R4 (실패경로): 결제 전 몫과 받지 않기를 한 몫에는 주소를 넣을 수 없다", async () => {
    const unpaid = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const fan = await signedInClient("byeolbit_fan");
    expect((await acceptWithAddress(fan, unpaid.orderNos[0]!)).error?.code).toBe("P0002");
    const declined = await paidShareFor(PROFILE.byeolbit);
    await fan.rpc("decline_revgift", { p_order_no: declined });
    expect((await fan.rpc("accept_revgift", { p_order_no: declined })).error?.code).toBe("P0022");
    expect(addressCount(declined)).toBe(0);
  });

  it("INV-R4 (실패경로): 앱 서버 키로도 남의 몫에 주소를 넣는 길이 없다 — 받기 함수는 로그인한 팬 본인만 부른다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    await registerFanAddress(await signedInClient("byeolbit_fan"));
    const { error } = await adminClient().rpc("accept_revgift", { p_order_no: no });
    expect(error).not.toBeNull();
    // 옛 두 인자 받기(봉투를 받아 바로 넣던 길)는 없다 — 팬 주소가 저장되는 자리는 등록 주소와 받기 때 복사본뿐(INV-R6)
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() })).error).not.toBeNull();
    expect(addressCount(no)).toBe(0);
  });
});

describe("INV-R5: 서버는 봉인 형식이 아닌 주소를 받지 않는다", () => {
  it("INV-R5 S5b (실패경로): 평문 주소·모자란 봉투는 받을 주소 등록에서 형식 오류로 거부되고, 받기는 등록 주소가 없어 거부된다", async () => {
    clearFanAddresses([PROFILE.byeolbit]);
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    for (const bad of ["서울시 마포구 어딘가 1", { address: "서울시 마포구" }, { ...sampleEnvelope(), wrappedKey: "AAAA" }, { ...sampleEnvelope(), extra: 1 }]) {
      expect((await fan.rpc("set_my_fan_address", { p_envelope: bad, p_label: "home" })).error?.code).toBe("22023");
    }
    expect(fanEnvelope(PROFILE.byeolbit)).toBe("");
    expect((await fan.rpc("accept_revgift", { p_order_no: no })).error?.code).toBe("P0026");
    expect(addressCount(no)).toBe(0);
    expect(shareReply(no)).toBe("waiting");
  });
});

describe("INV-R6: 팬 주소가 저장되는 자리는 등록 주소 하나와 받기 때 복사본뿐이다", () => {
  it("INV-R6 S6: 몫 A 를 받아도 몫 B 에는 복사본이 없고, B 는 다시 입력하지 않고 등록 주소로 받는다", async () => {
    const a = await paidShareFor(PROFILE.byeolbit);
    const b = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await acceptWithAddress(fan, a);
    expect(addressCount(a)).toBe(1);
    expect(addressCount(b)).toBe(0);
    expect((await fan.rpc("accept_revgift", { p_order_no: b })).error).toBeNull();
    expect(storedEnvelope(b)).toBe(fanEnvelope(PROFILE.byeolbit));
  });

  it("INV-R6 S6·R9: 몫 A 가 출고되면 A 의 복사본만 지워지고 등록 주소와 몫 B 의 복사본은 남는다", async () => {
    const a = await paidShareFor(PROFILE.byeolbit);
    const b = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await acceptWithAddress(fan, a);
    await fan.rpc("accept_revgift", { p_order_no: b });
    const registered = fanEnvelope(PROFILE.byeolbit);
    psql(`update public.revgift_shares set received_at = now(), inspected_at = now() where order_no = '${a}'`);
    expect((await adminClient().rpc("close_revgift_share", { p_order_no: a, p_outcome: "cancelled" })).error).toBeNull();
    expect(addressCount(a)).toBe(0);
    expect(addressCount(b)).toBe(1);
    expect(fanEnvelope(PROFILE.byeolbit)).toBe(registered);
  });
});

describe("INV-R9: 반송·취소가 되는 순간 주소가 지워지고, 출고된 몫은 출고 확정 + 72시간에 지워진다(카드 d120)", () => {
  it("INV-R9 S9: shipped 로 닫으면 주소는 남고(재출력용), 72시간 자동 처리가 지운다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await acceptWithAddress(fan, no);
    psql(`update public.revgift_shares set received_at = now(), inspected_at = now() where order_no = '${no}'`);
    expect((await adminClient().rpc("close_revgift_share", { p_order_no: no, p_outcome: "shipped" })).error).toBeNull();
    expect(addressCount(no)).toBe(1);
    ageShareShipment(no, 73);
    dropAddressCopies();
    expect(addressCount(no)).toBe(0);
  });

  it.each(["returned", "cancelled"] as const)("INV-R9 S9b: %s 가 되면 같은 처리 안에서 주소가 지워진다", async (outcome) => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await acceptWithAddress(fan, no);
    expect(addressCount(no)).toBe(1);
    psql(`update public.revgift_shares set received_at = now(), inspected_at = now() where order_no = '${no}'`);
    const { error } = await adminClient().rpc("close_revgift_share", { p_order_no: no, p_outcome: outcome });
    expect(error).toBeNull();
    expect(addressCount(no)).toBe(0);
  });

  it("INV-R7 (실패경로): 받기 전이거나 검수 전인 몫은 출고 확정할 수 없다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    expect((await adminClient().rpc("close_revgift_share", { p_order_no: no, p_outcome: "shipped" })).error?.code).toBe("P0022");
    const fan = await signedInClient("byeolbit_fan");
    await acceptWithAddress(fan, no);
    expect((await adminClient().rpc("close_revgift_share", { p_order_no: no, p_outcome: "shipped" })).error?.code).toBe("P0022");
    expect(addressCount(no)).toBe(1);
  });

  it("INV-R9 (실패경로): 화면 쪽 키로는 몫을 닫을 수 없다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("close_revgift_share", { p_order_no: no, p_outcome: "shipped" })).error).not.toBeNull();
  });
});

describe("INV-R10: 기한 처리와 받기가 겹쳐도 하나만 반영된다", () => {
  it("INV-R10 (실패경로): 168시간이 지난 몫에는 기한 처리 전이라도 주소를 넣을 수 없다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    backdateSettlement(send, 168, 1);
    const fan = await signedInClient("byeolbit_fan");
    expect((await acceptWithAddress(fan, send.orderNos[0]!)).error?.code).toBe("P0022");
    expect(addressCount(send.orderNos[0]!)).toBe(0);
  });

  it("INV-R10 S10c (동시): 기한 직전 받기와 기한 처리가 동시에 오면 둘 중 하나만 — 받지 않음이면 주소가 없다", async () => {
    for (let i = 0; i < 5; i += 1) {
      const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
      await payTestRevgift(send);
      const no = send.orderNos[0]!;
      backdateSettlement(send, 167, 59);
      const fan = await signedInClient("byeolbit_fan");
      await registerFanAddress(fan);
      // 기한 처리는 1분 뒤 시각을 기준으로 돌린다 — 받기와 같은 순간에 기한이 지난 것으로 본다
      await Promise.all([
        fan.rpc("accept_revgift", { p_order_no: no }),
        adminClient().rpc("expire_revgifts", { p_now: new Date(Date.now() + 61_000).toISOString() }),
      ]);
      const reply = shareReply(no);
      expect(["accepted", "expired"]).toContain(reply);
      expect(addressCount(no)).toBe(reply === "accepted" ? 1 : 0);
    }
  });
});

describe("리뷰 뒤 보강 (2026-10-03)", () => {
  it("INV-R4 (실패경로): 반송·취소된 몫에는 주소를 넣을 수 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const col of ["returned_at", "cancelled_at"]) {
      const no = await paidShareFor(PROFILE.byeolbit);
      psql(`update public.revgift_shares set ${col} = now() where order_no = '${no}'`);
      expect((await acceptWithAddress(fan, no)).error?.code).toBe("P0022");
      expect(addressCount(no)).toBe(0);
    }
  });

  it("INV-R5 S5b (실패경로): 봉투의 판 번호·알고리즘·IV 길이·암호문 길이가 하나라도 틀리면 받을 주소 등록이 거부된다", async () => {
    clearFanAddresses([PROFILE.byeolbit]);
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    const b64 = (n: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("base64");
    const bad = [
      { ...sampleEnvelope(), v: 2 },
      { ...sampleEnvelope(), alg: "RSA-OAEP+A128GCM" },
      { ...sampleEnvelope(), iv: b64(16) },
      { ...sampleEnvelope(), ciphertext: b64(8) },
    ];
    for (const env of bad) {
      expect((await fan.rpc("set_my_fan_address", { p_envelope: env, p_label: "home" })).error?.code).toBe("22023");
    }
    expect(fanEnvelope(PROFILE.byeolbit)).toBe("");
    expect(addressCount(no)).toBe(0);
  });

  it("INV-R6 S6: 받기는 개인정보 구역에 그 몫의 복사본 한 줄만 더한다 — 내 정보(연락처)·등록 주소는 그대로다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await registerFanAddress(fan);
    const contacts = () => psql(`select coalesce(md5(row(c.*)::text), '') from pii.account_contacts c where c.account_id = '${PROFILE.byeolbit}'`);
    const countAll = () =>
      psql(`select string_agg(c, ',' order by c) from (
        select 'account_contacts=' || count(*) as c from pii.account_contacts
        union all select 'fan_addresses=' || count(*) from pii.fan_addresses
        union all select 'revgift_addresses=' || count(*) from pii.revgift_addresses) x`);
    const beforeContacts = contacts();
    const before = countAll();
    expect((await fan.rpc("accept_revgift", { p_order_no: no })).error).toBeNull();
    expect(contacts()).toBe(beforeContacts);
    const after = countAll();
    const n = (s: string, k: string) => Number(s.split(",").find((x) => x.startsWith(k))!.split("=")[1]);
    expect(n(after, "account_contacts")).toBe(n(before, "account_contacts"));
    expect(n(after, "fan_addresses")).toBe(n(before, "fan_addresses"));
    expect(n(after, "revgift_addresses")).toBe(n(before, "revgift_addresses") + 1);
  });

  it("INV-R10 S10c (동시): 기한 처리가 바꿨다고 돌려준 건수와 최종 상태가 맞다", async () => {
    for (let i = 0; i < 5; i += 1) {
      const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
      await payTestRevgift(send);
      const no = send.orderNos[0]!;
      // 기한을 정확히 지금으로 맞춘다 — 받기는 기한 전이라 통과할 수 있고 기한 처리도 바꿀 수 있는 경계
      psql(`update public.revgift_sends set settled_at = now() - interval '168 hours' + interval '300 milliseconds' where id = '${send.sendId}'`);
      const fan = await signedInClient("byeolbit_fan");
      await registerFanAddress(fan);
      await new Promise((r) => setTimeout(r, 250));
      const [, expired] = await Promise.all([
        fan.rpc("accept_revgift", { p_order_no: no }),
        adminClient().rpc("expire_revgifts"),
      ]);
      const reply = shareReply(no);
      const changedByExpire = psql(`select count(*) from public.revgift_shares where order_no = '${no}' and reply = 'expired'`);
      if (expired.data === 0) expect(changedByExpire).toBe("0");
      expect(["accepted", "expired", "waiting"]).toContain(reply);
      expect(addressCount(no)).toBe(reply === "accepted" ? 1 : 0);
    }
  });

  it("INV-R9: 주소를 지운 사실은 남고 주소 값은 남지 않는다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await acceptWithAddress(fan, no);
    psql(`update public.revgift_shares set received_at = now(), inspected_at = now() where order_no = '${no}'`);
    await adminClient().rpc("close_revgift_share", { p_order_no: no, p_outcome: "shipped" });
    ageShareShipment(no, 73);
    dropAddressCopies();
    expect(
      psql(`select e.event || ',' || e.outcome from public.revgift_address_events e join public.revgift_shares s on s.id = e.share_id where s.order_no = '${no}'`),
    ).toBe("deleted,shipped");
    const cols = psql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'revgift_address_events'`);
    expect(cols).toBe("at,event,id,outcome,share_id");
  });
});
