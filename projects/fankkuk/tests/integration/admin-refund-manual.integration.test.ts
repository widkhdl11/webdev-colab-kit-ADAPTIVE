import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestOrders, holdRowLock, payTestOrder, psql, registerTestOrder, signedInClient } from "./helpers";
import { closeKeptShares, deleteTestRevgifts, followHaru, payTestRevgift, PROFILE, registerTestRevgift, unfollowHaru } from "./revgift-helpers";

// 팬꾹 밖에서 직접 돌려준 환불을 「직접 환불함」으로 완료로 적기 (admin-console INV-K7 S7d·S7e, 카드 d126).
// 결제사를 부르지 않는다 — DB 함수(admin_mark_refund_manual)가 대표·상태·메모·잠금을 모두 본다.

const OWNER = "00000000-0000-4000-a000-000000000021";
const MEMO = "2026-10-24 결제사 관리 화면에서 취소";

beforeAll(() => followHaru([PROFILE.gureumppang]));
afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
});
afterAll(() => unfollowHaru([PROFILE.gureumppang]));

type Kind = "gift" | "gift_box" | "revgift";

async function claim(kind: Kind, unitId: string) {
  const c = await signedInClient("fankkuk_admin");
  const { data, error } = await c.rpc("admin_claim_refund", { p_kind: kind, p_unit_id: unitId });
  return { refundId: ((data ?? []) as { refund_id: string }[])[0]?.refund_id ?? null, code: error?.code ?? null };
}

async function mark(kind: Kind, unitId: string, memo: string, login = "fankkuk_admin") {
  const c = await signedInClient(login);
  const { data, error } = await c.rpc("admin_mark_refund_manual", { p_kind: kind, p_unit_id: unitId, p_memo: memo });
  return { amount: (data as number | null) ?? null, code: error?.code ?? null };
}

const settle = (refundId: string, ok: boolean) => adminClient().rpc("settle_refund", { p_refund_id: refundId, p_ok: ok, p_error: ok ? null : "결제사 오류" });
const row = (refundId: string) =>
  psql(`select status || '/' || attempts || '/' || coalesce(manual_memo, '-') || '/' || coalesce(manual_by::text, '-') || '/' || (manual_at is not null) || '/' || (settled_at is not null) from public.refunds where id = '${refundId}'`);

/** 거절된 팬 선물의 주문 환불을 한 번 눌러 결제사 실패로 남긴다 */
async function failedGift(): Promise<{ paymentId: string; refundId: string }> {
  const o = await registerTestOrder();
  await payTestOrder(o);
  const paymentId = psql(`select id from public.payments where toss_order_id = '${o.tossOrderId}'`);
  psql(`update public.orders set status = 'rejected' where id = '${o.orderId}'`);
  const { refundId } = await claim("gift", paymentId);
  await settle(refundId!, false);
  return { paymentId, refundId: refundId! };
}

describe("INV-K7 (S7d): 직접 돌려준 환불을 완료로 적기", () => {
  it("INV-K7 (S7d): 결제사 취소가 실패한 환불을 대표가 메모와 함께 적으면 완료 — 메모·적은 사람·시각이 남고 다시 누른 횟수는 그대로다. 그 뒤 환불·다시 시도는 「이미 환불했다」", async () => {
    const g = await failedGift();
    expect(await mark("gift", g.paymentId, `  ${MEMO}  `)).toEqual({ amount: 6900, code: null });
    expect(row(g.refundId)).toBe(`done/1/${MEMO}/${OWNER}/true/true`);
    expect((await claim("gift", g.paymentId)).code).toBe("P0023");
    expect((await mark("gift", g.paymentId, MEMO)).code).toBe("P0023");
  });

  it("INV-K7 (S7d): 처음 누른 지 14일이 지나 다시 시도가 막힌 실패 환불도 적을 수 있다", async () => {
    const g = await failedGift();
    psql(`update public.refunds set created_at = now() - interval '15 days' where id = '${g.refundId}'`);
    expect((await claim("gift", g.paymentId)).code).toBe("P0025");
    expect((await mark("gift", g.paymentId, MEMO)).code).toBeNull();
  });

  it("INV-K7 (S7d·S7e): 결과를 모른 채 멈춘 「처리 중」은 누른 지 2분이 지나면 적을 수 있고, 2분 안(119초)이면 거부(P0024)된다", async () => {
    const o = await registerTestOrder();
    await payTestOrder(o);
    const paymentId = psql(`select id from public.payments where toss_order_id = '${o.tossOrderId}'`);
    psql(`update public.orders set status = 'rejected' where id = '${o.orderId}'`);
    const { refundId } = await claim("gift", paymentId);
    psql(`update public.refunds set claimed_at = now() - interval '119 seconds' where id = '${refundId}'`);
    expect((await mark("gift", paymentId, MEMO)).code).toBe("P0024");
    expect(row(refundId!)).toBe("requesting/1/-/-/false/false");
    psql(`update public.refunds set claimed_at = now() - interval '121 seconds' where id = '${refundId}'`);
    expect((await mark("gift", paymentId, MEMO)).code).toBeNull();
  });

  it("INV-K7 (S7d): 역조공 몫과 닫힌 상자의 실패 환불도 같은 방식으로 적는다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.gureumppang, tier: "small" }]);
    await payTestRevgift(send);
    const shareId = psql(`select id from public.revgift_shares where order_no = '${send.orderNos[0]}'`);
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now() where id = '${shareId}'`);
    closeKeptShares(`s.id = '${shareId}'`);
    const s = await claim("revgift", shareId);
    expect(s.code).toBeNull();
    await settle(s.refundId!, false);
    expect((await mark("revgift", shareId, MEMO)).code).toBeNull();
    expect(row(s.refundId!)).toMatch(/^done\//);

    const o = await registerTestOrder(2);
    await payTestOrder(o);
    const boxId = psql(`select id from public.boxes where order_id = '${o.orderId}' order by seq limit 1`);
    psql(`begin; set local session_replication_role = replica; update public.boxes set missing_at = now() where id = '${boxId}'; commit;`);
    const b = await claim("gift_box", boxId);
    expect(b.code).toBeNull();
    await settle(b.refundId!, false);
    expect((await mark("gift_box", boxId, MEMO)).code).toBeNull();
    expect(row(b.refundId!)).toMatch(/^done\//);
  });
});

describe("INV-K7 (S7e, 실패경로): 적을 수 없는 경우", () => {
  it("INV-K7 (S7e): 메모가 없거나(빈칸만) 200자를 넘으면 거부(P0026), 기록은 그대로", async () => {
    const g = await failedGift();
    for (const memo of ["", "   ", "가".repeat(201)]) expect((await mark("gift", g.paymentId, memo)).code).toBe("P0026");
    expect((await mark("gift", g.paymentId, "가".repeat(200))).code).toBeNull();
  });

  it("INV-K7 (S7e): 숫자가 10자리 이상 이어진 메모는 거부(P0027) — 하이픈·빈칸으로 이어도 센다. 날짜·8자리 승인번호는 통과", async () => {
    const g = await failedGift();
    for (const memo of [
      "010-1234-5678 로 연락",
      "계좌 110-123-456789",
      "01012345678",
      "국민 123 456 7890",
      "1234567890",
      // 보안 리뷰: 점·괄호·띄운 하이픈·전각 숫자로도 우회하지 못한다
      "010.1234.5678",
      "(010)1234-5678",
      "110 - 123 - 456789",
      "０１０１２３４５６７８",
      // 재리뷰: 계좌번호 안의 「날짜처럼 생긴」 조각을 날짜로 빼지 않는다
      "카카오뱅크 3333-01-2345678",
      "국민 123456-12-123456",
      "기업 123-456789-01-012",
      "국민 112019-12-123456", // 가운데 2019-12-12 는 진짜 날짜 꼴이지만 앞뒤에 숫자가 붙어 있다
    ]) {
      expect((await mark("gift", g.paymentId, memo)).code, memo).toBe("P0027");
    }
    expect(row(g.refundId)).toBe("failed/1/-/-/false/false");
    // 날짜·시각과 승인번호·금액을 함께 적는 메모는 통과해야 한다 — 날짜·시각은 빼고 세고, 쉼표·빗금은 숫자를 끊는다
    for (const memo of ["승인번호 12345678, 6900원 취소", "12345678 / 30000원"]) {
      const o = await failedGift();
      expect((await mark("gift", o.paymentId, memo)).code, memo).toBeNull();
    }
    expect((await mark("gift", g.paymentId, "2026-10-24 13:05 결제사에서 취소, 승인번호 12345678")).code).toBeNull();
  });

  it("INV-K7 (S7e): 직원·팬·크리에이터·익명은 거부(42501), 기록은 그대로", async () => {
    const g = await failedGift();
    for (const login of ["fankkuk_staff", "byeolbit_fan", "haru_creator"]) expect((await mark("gift", g.paymentId, MEMO, login)).code).toBe("42501");
    const anon = await anonClient().rpc("admin_mark_refund_manual", { p_kind: "gift", p_unit_id: g.paymentId, p_memo: MEMO });
    expect(anon.error).not.toBeNull();
    expect(row(g.refundId)).toBe("failed/1/-/-/false/false");
  });

  it("INV-K7 (S7e): 아직 한 번도 누르지 않은 환불(기록 없음)은 적을 수 없다(P0022) — 결제사 취소부터 해 본다. 없는 단위는 P0002", async () => {
    const o = await registerTestOrder();
    await payTestOrder(o);
    const paymentId = psql(`select id from public.payments where toss_order_id = '${o.tossOrderId}'`);
    psql(`update public.orders set status = 'rejected' where id = '${o.orderId}'`);
    expect((await mark("gift", paymentId, MEMO)).code).toBe("P0022");
    expect(psql(`select count(*) from public.refunds where payment_id = '${paymentId}'`)).toBe("0");
    expect((await mark("gift", "00000000-0000-4000-8000-00000000dead", MEMO)).code).toBe("P0002");
  });

  it("INV-K7 (S7e, 동시): 「다시 시도」가 먼저 줄을 선 채 「직접 환불함」이 오면 하나만 된다 — 다시 시도가 「처리 중」으로 잡은 기록을 완료로 덮어쓰지 않는다(P0024)", async () => {
    const g = await failedGift();
    const waiting = (fn: string) =>
      psql(`select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query like '%${fn}%' and query not like '%pg_stat_activity%'`);
    const until = async (fn: string) => {
      for (let i = 0; i < 100 && waiting(fn) !== "1"; i++) await new Promise((r) => setTimeout(r, 30));
      expect(waiting(fn), `${fn} 가 잠금을 기다리지 않는다`).toBe("1");
    };
    // 환불 기록을 잠가 두고, 다시 시도 → 직접 환불함 순서로 줄을 세운 뒤 풀어 준다
    const hold = await holdRowLock(`select 1 from public.refunds where id = '${g.refundId}' for update`, 4);
    const retry = claim("gift", g.paymentId);
    await until("admin_claim_refund");
    const manual = mark("gift", g.paymentId, MEMO);
    await until("admin_mark_refund_manual");
    const [r, m] = await Promise.all([retry, manual, hold.released]);
    expect([r.code, m.code]).toEqual([null, "P0024"]);
    expect(row(g.refundId)).toBe("requesting/2/-/-/false/false");
  });
});
