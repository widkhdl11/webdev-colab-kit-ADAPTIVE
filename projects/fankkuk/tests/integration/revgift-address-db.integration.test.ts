import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, psql, signedInClient } from "./helpers";
import {
  backdateSettlement,
  deleteTestRevgifts,
  followHaru,
  payTestRevgift,
  PROFILE,
  registerTestRevgift,
  sampleEnvelope,
  shareReply,
  unfollowHaru,
} from "./revgift-helpers";

// 역조공 팬 주소 — 개인정보 구역(pii)에 저장되는 부분. supabase/manual/0005_revgift_address.sql 을 적용해야 돈다.
// 스펙: docs/specs/reverse-gift.md (INV-R4·R5·R6·R9)

const ADDED_FOLLOWERS = [PROFILE.gureumppang];

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

beforeAll(() => {
  deleteTestRevgifts();
  followHaru(ADDED_FOLLOWERS);
});

afterAll(() => {
  deleteTestRevgifts();
  unfollowHaru(ADDED_FOLLOWERS);
});

describe("INV-R4: 몫의 주소는 그 몫의 받는 팬 본인이 받기를 할 때만 들어간다", () => {
  it("INV-R4 S4: 별빛이 받기 + 봉인 주소 → 주소가 저장되고 「받았어요」", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    const { error } = await fan.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() });
    expect(error).toBeNull();
    expect(shareReply(no)).toBe("accepted");
    expect(addressCount(no)).toBe(1);
  });

  it("INV-R4 S4b (실패경로): 다른 팬이 받기를 하면 거부되고 아무것도 저장되지 않는다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const other = await signedInClient("daltokki_fan");
    expect((await other.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() })).error?.code).toBe("P0002");
    expect(addressCount(no)).toBe(0);
    expect(shareReply(no)).toBe("waiting");
  });

  it("INV-R4 S4c (실패경로): 보낸 크리에이터가 주소를 넣으려 하면 거부된다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() })).error?.code).toBe("P0002");
    expect(addressCount(no)).toBe(0);
  });

  it("INV-R4 S4d (실패경로): 이미 받은 몫에 다시 받기를 하면 거부되고 처음 주소가 그대로다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() });
    const first = storedEnvelope(no);
    expect((await fan.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() })).error?.code).toBe("P0022");
    expect(storedEnvelope(no)).toBe(first);
  });

  it("INV-R4 S4e (동시): 받기 요청 두 개가 동시에 오면 저장은 하나뿐이다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const [a, b] = await Promise.all([signedInClient("byeolbit_fan"), signedInClient("byeolbit_fan")]);
    const results = await Promise.all([
      a.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() }),
      b.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() }),
    ]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(addressCount(no)).toBe(1);
  });

  it("INV-R4 (실패경로): 결제 전 몫과 받지 않기를 한 몫에는 주소를 넣을 수 없다", async () => {
    const unpaid = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("accept_revgift", { p_order_no: unpaid.orderNos[0], p_envelope: sampleEnvelope() })).error?.code).toBe(
      "P0002",
    );
    const declined = await paidShareFor(PROFILE.byeolbit);
    await fan.rpc("decline_revgift", { p_order_no: declined });
    expect((await fan.rpc("accept_revgift", { p_order_no: declined, p_envelope: sampleEnvelope() })).error?.code).toBe("P0022");
    expect(addressCount(declined)).toBe(0);
  });

  it("INV-R4 (실패경로): 앱 서버 키로도 남의 몫에 주소를 넣는 길이 없다 — 받기 함수는 로그인한 팬 본인만 부른다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const { error } = await adminClient().rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() });
    expect(error).not.toBeNull();
    expect(addressCount(no)).toBe(0);
  });
});

describe("INV-R5: 서버는 봉인 형식이 아닌 주소를 받지 않는다", () => {
  it("INV-R5 S5b (실패경로): 평문 주소·모자란 봉투는 형식 오류로 거부되고 아무것도 저장되지 않는다", async () => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    for (const bad of ["서울시 마포구 어딘가 1", { address: "서울시 마포구" }, { ...sampleEnvelope(), wrappedKey: "AAAA" }, { ...sampleEnvelope(), extra: 1 }]) {
      expect((await fan.rpc("accept_revgift", { p_order_no: no, p_envelope: bad })).error?.code).toBe("22023");
    }
    expect(addressCount(no)).toBe(0);
    expect(shareReply(no)).toBe("waiting");
  });
});

describe("INV-R6: 팬 주소는 몫 하나에만 묶인다", () => {
  it("INV-R6 S6: 몫 A 에 주소를 넣어도 다음 몫 B 에는 주소가 없다", async () => {
    const a = await paidShareFor(PROFILE.byeolbit);
    const b = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("accept_revgift", { p_order_no: a, p_envelope: sampleEnvelope() });
    expect(addressCount(a)).toBe(1);
    expect(addressCount(b)).toBe(0);
  });
});

describe("INV-R9: 출고 확정·반송·취소가 되는 순간 주소가 지워진다", () => {
  it.each(["shipped", "returned", "cancelled"] as const)("INV-R9 S9·S9b: %s 가 되면 같은 처리 안에서 주소가 지워진다", async (outcome) => {
    const no = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() });
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
    await fan.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() });
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
    expect((await fan.rpc("accept_revgift", { p_order_no: send.orderNos[0], p_envelope: sampleEnvelope() })).error?.code).toBe("P0022");
    expect(addressCount(send.orderNos[0]!)).toBe(0);
  });

  it("INV-R10 S10c (동시): 기한 직전 받기와 기한 처리가 동시에 오면 둘 중 하나만 — 받지 않음이면 주소가 없다", async () => {
    for (let i = 0; i < 5; i += 1) {
      const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
      await payTestRevgift(send);
      const no = send.orderNos[0]!;
      backdateSettlement(send, 167, 59);
      const fan = await signedInClient("byeolbit_fan");
      // 기한 처리는 1분 뒤 시각을 기준으로 돌린다 — 받기와 같은 순간에 기한이 지난 것으로 본다
      await Promise.all([
        fan.rpc("accept_revgift", { p_order_no: no, p_envelope: sampleEnvelope() }),
        adminClient().rpc("expire_revgifts", { p_now: new Date(Date.now() + 61_000).toISOString() }),
      ]);
      const reply = shareReply(no);
      expect(["accepted", "expired"]).toContain(reply);
      expect(addressCount(no)).toBe(reply === "accepted" ? 1 : 0);
    }
  });
});
