import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { differenceRow, labeled, measure, paidOrder, prepare } from "./difference-helpers";
import { adminClient, anonClient, deleteTestOrders, holdRowLock, psql, registerTestOrder, signedInClient } from "./helpers";
import { deleteTestRevgifts, PROFILE, registerTestRevgift } from "./revgift-helpers";

// 결과를 모르는 결제 다시 확인 (payment INV-M19, S19~S19g).
// 실제 로컬 DB 에 붙는다. 바꾸는 것은 관리자 키 클라이언트를 만드는 자리(로컬 DB 의 앱 서버 키)와 결제사 API 뿐이다 —
// 전역 fetch 에서 토스 주소만 가로채 시험이 정한 조회 응답을 돌려주고, 나머지(Supabase)는 그대로 보낸다.
// 시험은 자기 주문번호로만 돌린다(「지금 돌리기」 한 줄과 같은 범위) — 시드 주문은 건드리지 않는다.

vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => adminClient() }));

const { runServerReconcile } = await import("@/app/api/cron/payments/reconciler");
const { POST } = await import("@/app/api/cron/payments/route");

const realFetch = globalThis.fetch;
const tossCalls: string[] = [];
type TossReply = { status: number; body: unknown };
const tossReplies = new Map<string, TossReply>();

beforeAll(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  process.env.TOSS_SECRET_KEY = "test_gsk_reconcile";
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.tosspayments.com/")) return realFetch(input, init);
    const m = /\/v1\/payments\/orders\/([^/?]+)$/.exec(url);
    const orderId = m ? decodeURIComponent(m[1]!) : "";
    tossCalls.push(orderId);
    const reply = tossReplies.get(orderId) ?? { status: 500, body: { code: "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING" } };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch);
});
afterEach(() => {
  tossCalls.length = 0;
  tossReplies.clear();
});
afterAll(() => {
  vi.unstubAllGlobals();
  deleteTestOrders();
  deleteTestRevgifts();
});

const tossDone = (orderId: string, amount: number, paymentKey = `pk_lookup_${orderId}`): TossReply => ({
  status: 200,
  body: { status: "DONE", orderId, totalAmount: amount, paymentKey, method: "카드" },
});
const tossStatus = (orderId: string, amount: number, status: string): TossReply => ({
  status: 200,
  body: { status, orderId, totalAmount: amount, paymentKey: `pk_lookup_${orderId}` },
});
const tossNotFound: TossReply = { status: 404, body: { code: "NOT_FOUND_PAYMENT", message: "존재하지 않는 결제 정보 입니다." } };

function readMigration(): string {
  return readFileSync(new URL("../../supabase/migrations/20261008000015_payment_reconcile.sql", import.meta.url), "utf8");
}

/** 「승인 중」이 된 시각을 과거로 옮긴다(승인 호출이 끊긴 채 n 분이 지난 것처럼). */
function backdateConfirming(table: "payments" | "revgift_sends", tossOrderId: string, minutes: number): void {
  psql(`update public.${table} set confirming_at = now() - interval '${minutes} minutes' where toss_order_id = '${tossOrderId}'`);
}

/** 승인 호출이 끊겨 「승인 중」에 남은 팬 선물 결제(소형 1 = 6,900원). */
async function confirmingGift(minutes: number) {
  const o = await registerTestOrder(1);
  const { data } = await adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId });
  expect(data).toBe(true);
  backdateConfirming("payments", o.tossOrderId, minutes);
  return o;
}

function giftState(tossOrderId: string): string {
  return psql(
    `select p.status || '|' || coalesce(p.payment_key, '-') || '|' || o.status || '|' || (select count(*) from public.approval_requests q where q.order_id = o.id) || '|' || (p.review_at is not null)
     from public.payments p join public.orders o on o.id = p.order_id where p.toss_order_id = '${tossOrderId}'`,
  );
}

/** 차액 요청까지 만든 주문(소형 → 중형 측정, 차액 2,000원)의 차액을 「승인 중」으로. */
async function confirmingDifference(minutes: number) {
  const g = await paidOrder(["small"]);
  const qr = await labeled(g.boxIds[0]!);
  await measure(qr, "medium");
  const row = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string; amount_krw: number }[])[0]!;
  expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: row.toss_order_id })).data).toBe(true);
  backdateConfirming("payments", row.toss_order_id, minutes);
  return { g, row };
}

/** 하루 → 별빛 역조공(소형 1 = 5,400원)을 「승인 중」으로. */
async function confirmingRevgift(minutes: number) {
  const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
  expect((await adminClient().rpc("claim_revgift_payment", { p_toss_order_id: send.tossOrderId })).data).toBe(true);
  backdateConfirming("revgift_sends", send.tossOrderId, minutes);
  return send;
}

function revgiftState(tossOrderId: string): string {
  return psql(
    `select d.status || '|' || coalesce(d.payment_key, '-') || '|' || (d.settled_at is not null) || '|' || (d.review_at is not null) from public.revgift_sends d where d.toss_order_id = '${tossOrderId}'`,
  );
}

describe("INV-M19: 「승인 중」이 된 시각", () => {
  it("INV-M19: 세 종류의 결제 확정 시작이 「승인 중」이 된 시각을 적는다", async () => {
    const o = await registerTestOrder(1);
    await adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId });
    expect(psql(`select confirming_at > now() - interval '1 minute' from public.payments where toss_order_id = '${o.tossOrderId}'`)).toBe("t");

    const d = await confirmingDifference(0);
    psql(`update public.payments set confirming_at = null where toss_order_id = '${d.row.toss_order_id}'`);
    psql(`update public.payments set status = 'pending' where toss_order_id = '${d.row.toss_order_id}'`);
    await adminClient().rpc("claim_difference_payment", { p_toss_order_id: d.row.toss_order_id });
    expect(psql(`select confirming_at > now() - interval '1 minute' from public.payments where toss_order_id = '${d.row.toss_order_id}'`)).toBe("t");

    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await adminClient().rpc("claim_revgift_payment", { p_toss_order_id: send.tossOrderId });
    expect(psql(`select confirming_at > now() - interval '1 minute' from public.revgift_sends where toss_order_id = '${send.tossOrderId}'`)).toBe("t");
  });
});

describe("INV-M19: 시각 칸이 생기기 전에 「승인 중」이 된 줄", () => {
  it("INV-M19: 마이그레이션을 다시 적용하면 시각이 빈 「승인 중」 줄(선물·역조공)에 지금 시각이 채워지고, 채워진 줄은 그대로다", async () => {
    const empty = await confirmingGift(0);
    psql(`update public.payments set confirming_at = null where toss_order_id = '${empty.tossOrderId}'`);
    const kept = await confirmingGift(45);
    const send = await confirmingRevgift(0);
    psql(`update public.revgift_sends set confirming_at = null where toss_order_id = '${send.tossOrderId}'`);
    const sql = readMigration();
    execFileSync("docker", ["exec", "-i", "supabase_db_fankkuk", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
    expect(psql(`select confirming_at > now() - interval '1 minute' from public.payments where toss_order_id = '${empty.tossOrderId}'`)).toBe("t");
    expect(psql(`select confirming_at > now() - interval '1 minute' from public.revgift_sends where toss_order_id = '${send.tossOrderId}'`)).toBe("t");
    expect(psql(`select confirming_at < now() - interval '44 minutes' from public.payments where toss_order_id = '${kept.tossOrderId}'`)).toBe("t");
    // 채워진 줄은 10분 뒤 다시 확인 대상이 된다
    backdateConfirming("payments", empty.tossOrderId, 11);
    tossReplies.set(empty.tossOrderId, tossDone(empty.tossOrderId, 6900));
    expect((await runServerReconcile(empty.orderNo)).counts.done).toBe(1);
  });
});

describe("INV-M19: 팬 선물 결제 다시 확인", () => {
  it("INV-M19 (S19): 11분 · 조회 = 승인됨·금액 일치 → 결제 완료, 주문 등록, 승인 요청 1개, 결제 키는 조회 응답의 값", async () => {
    const o = await confirmingGift(11);
    tossReplies.set(o.tossOrderId, tossDone(o.tossOrderId, 6900));
    const r = await runServerReconcile(o.orderNo);
    expect(r).toEqual({ ok: true, counts: { checked: 1, done: 1, failed: 0, review: 0, kept: 0, errors: 0, skipped: 0 } });
    expect(tossCalls).toEqual([o.tossOrderId]);
    expect(giftState(o.tossOrderId)).toBe(`done|pk_lookup_${o.tossOrderId}|registered|1|false`);
    // 승인 요청 원문은 정상 확정과 같은 꼴(INV-S1)
    expect(psql(`select payload from public.approval_requests q join public.orders o on o.id = q.order_id where o.order_no = '${o.orderNo}'`)).toMatch(
      new RegExp(`^fankkuk-approval:v1\\|req=apr_[0-9A-Za-z]+\\|order=${o.orderNo}\\|at=[^|]+\\|fan=[0-9a-f]{64}$`),
    );
    // 다시 돌려도 바뀌는 것이 없다
    await runServerReconcile(o.orderNo);
    expect(giftState(o.tossOrderId)).toBe(`done|pk_lookup_${o.tossOrderId}|registered|1|false`);
  });

  it("INV-M19 (S19b): 11분 · 조회 = 만료·승인 실패·취소 → 실패로 닫힌다", async () => {
    for (const status of ["EXPIRED", "ABORTED", "CANCELED"]) {
      const o = await confirmingGift(11);
      tossReplies.set(o.tossOrderId, tossStatus(o.tossOrderId, 6900, status));
      expect((await runServerReconcile(o.orderNo)).counts.failed).toBe(1);
      expect(giftState(o.tossOrderId)).toBe("failed|-|pending_payment|0|false");
    }
  });

  it("INV-M19 (S19b, 실패경로): 조회 = 진행 중이면 그대로, 조회 오류면 그대로이고 실행 결과는 실패", async () => {
    const inProgress = await confirmingGift(11);
    tossReplies.set(inProgress.tossOrderId, tossStatus(inProgress.tossOrderId, 6900, "IN_PROGRESS"));
    expect(await runServerReconcile(inProgress.orderNo)).toMatchObject({ ok: true, counts: { kept: 1 } });
    expect(giftState(inProgress.tossOrderId)).toBe("confirming|-|pending_payment|0|false");

    const broken = await confirmingGift(11);
    tossReplies.set(broken.tossOrderId, { status: 500, body: { code: "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING" } });
    expect(await runServerReconcile(broken.orderNo)).toMatchObject({ ok: false, counts: { kept: 1, errors: 1 } });
    expect(giftState(broken.tossOrderId)).toBe("confirming|-|pending_payment|0|false");
  });

  it("INV-M19 (S19c, 실패경로): 9분이면 결제사를 부르지 않고 그대로", async () => {
    const o = await confirmingGift(9);
    tossReplies.set(o.tossOrderId, tossDone(o.tossOrderId, 6900));
    expect((await runServerReconcile(o.orderNo)).counts.checked).toBe(0);
    expect(tossCalls).toEqual([]);
    expect(giftState(o.tossOrderId)).toBe("confirming|-|pending_payment|0|false");
  });

  it("INV-M19 (S19c, 실패경로): 결제사에 없음 — 20분이면 그대로, 31분이면 실패", async () => {
    const young = await confirmingGift(20);
    tossReplies.set(young.tossOrderId, tossNotFound);
    await runServerReconcile(young.orderNo);
    expect(tossCalls).toEqual([young.tossOrderId]);
    expect(giftState(young.tossOrderId)).toBe("confirming|-|pending_payment|0|false");

    const old = await confirmingGift(31);
    tossReplies.set(old.tossOrderId, tossNotFound);
    await runServerReconcile(old.orderNo);
    expect(giftState(old.tossOrderId)).toBe("failed|-|pending_payment|0|false");
  });

  it("INV-M19 (S19d, 실패경로): 조회 = 승인됨인데 금액이 다르면 「확인 필요」 — 대표 결제 화면에 그 줄이 보이고, 다시 돌려도 같다", async () => {
    const o = await confirmingGift(11);
    tossReplies.set(o.tossOrderId, tossDone(o.tossOrderId, 100));
    expect((await runServerReconcile(o.orderNo)).counts.review).toBe(1);
    expect(giftState(o.tossOrderId)).toBe("confirming|-|pending_payment|0|true");

    const boss = await signedInClient("fankkuk_admin");
    const rows = (await boss.rpc("admin_payment_rows")).data as { order_no: string; needs_review: boolean; refund_status: string; amount_krw: number }[];
    expect(rows.filter((r) => r.order_no === o.orderNo)).toEqual([
      expect.objectContaining({ order_no: o.orderNo, needs_review: true, refund_status: "none", amount_krw: 6900 }),
    ]);

    // 다시 돌려도 결제사를 다시 부르지 않고 상태도 그대로
    tossCalls.length = 0;
    expect((await runServerReconcile(o.orderNo)).counts.checked).toBe(0);
    expect(tossCalls).toEqual([]);
    expect(giftState(o.tossOrderId)).toBe("confirming|-|pending_payment|0|true");
  });

  it("INV-M19 (S19d, 실패경로): 조회 = 부분 취소면 금액이 같아도 「확인 필요」 — 완료·실패 둘 다 아니다", async () => {
    const o = await confirmingGift(11);
    tossReplies.set(o.tossOrderId, tossStatus(o.tossOrderId, 6900, "PARTIAL_CANCELED"));
    expect((await runServerReconcile(o.orderNo)).counts.review).toBe(1);
    expect(giftState(o.tossOrderId)).toBe("confirming|-|pending_payment|0|true");
  });

  it("INV-M19 (S19d): 주문번호가 다른 승인 응답도 「확인 필요」", async () => {
    const o = await confirmingGift(11);
    tossReplies.set(o.tossOrderId, { status: 200, body: { status: "DONE", orderId: "pay_someone_else", totalAmount: 6900, paymentKey: "pk_x" } });
    await runServerReconcile(o.orderNo);
    expect(giftState(o.tossOrderId)).toBe("confirming|-|pending_payment|0|true");
  });

  it("INV-M19 (S19e, 동시): 다시 확인의 완료 반영과 늦게 돌아온 원래 승인의 반영이 겹쳐도 결제 완료 1번, 승인 요청 1개", async () => {
    const o = await confirmingGift(11);
    tossReplies.set(o.tossOrderId, tossDone(o.tossOrderId, 6900));
    const at = new Date().toISOString();
    const lateRequestId = `apr_late${o.orderNo.replaceAll("-", "")}`;
    // 결제 줄을 잡아 두고 두 반영을 그 뒤에 줄 세운다 — 운 좋게 앞뒤로 와서 통과하지 않게
    const lock = await holdRowLock(`select 1 from public.payments where toss_order_id = '${o.tossOrderId}' for update`, 2);
    const [reconciled, late] = await Promise.all([
      runServerReconcile(o.orderNo),
      adminClient().rpc("settle_payment", {
        p_toss_order_id: o.tossOrderId,
        p_status: "done",
        p_payment_key: `pk_late_${o.tossOrderId}`,
        p_request_id: lateRequestId,
        p_payload: `fankkuk-approval:v1|req=${lateRequestId}|order=${o.orderNo}|at=${at}|fan=${"0".repeat(64)}`,
        p_requested_at: at,
      }),
    ]);
    await lock.released;
    expect(reconciled.counts.checked).toBe(1);
    expect(tossCalls).toEqual([o.tossOrderId]);
    expect(Number(reconciled.counts.done) + (late.data === true ? 1 : 0)).toBe(1);
    expect(giftState(o.tossOrderId)).toMatch(/^done\|pk_(lookup|late)_[^|]+\|registered\|1\|false$/);
  });

  it("INV-M19 (S19d): 확인 필요로 표시된 뒤 늦게 완료되면(승인 중이 아니면) 대표 결제 화면에서 확인 필요가 아니다", async () => {
    const o = await confirmingGift(11);
    tossReplies.set(o.tossOrderId, tossDone(o.tossOrderId, 100));
    await runServerReconcile(o.orderNo);
    expect(giftState(o.tossOrderId)).toBe("confirming|-|pending_payment|0|true");
    const at = new Date().toISOString();
    const rid = `apr_rv${o.orderNo.replaceAll("-", "")}`;
    const late = await adminClient().rpc("settle_payment", {
      p_toss_order_id: o.tossOrderId,
      p_status: "done",
      p_payment_key: `pk_late_${o.tossOrderId}`,
      p_request_id: rid,
      p_payload: `fankkuk-approval:v1|req=${rid}|order=${o.orderNo}|at=${at}|fan=${"0".repeat(64)}`,
      p_requested_at: at,
    });
    expect(late.data).toBe(true);
    const boss = await signedInClient("fankkuk_admin");
    const rows = (await boss.rpc("admin_payment_rows")).data as { order_no: string; needs_review: boolean }[];
    expect(rows.filter((r) => r.order_no === o.orderNo)).toEqual([expect.objectContaining({ needs_review: false })]);
  });
});

describe("INV-M19: 한 회차의 줄 수와 순서", () => {
  it("INV-M19: 그대로 남는 줄이 한 회차 한도(6줄)보다 많아도 새로 확인 대상이 된 줄은 다음 회차에 확인된다", async () => {
    // 전부를 보는 회차라 이전 시험이 남긴 「승인 중」 줄을 먼저 지운다(시드에는 승인 중 줄이 없다)
    deleteTestOrders();
    deleteTestRevgifts();
    for (let i = 0; i < 7; i++) {
      const o = await confirmingGift(60 + i);
      tossReplies.set(o.tossOrderId, tossStatus(o.tossOrderId, 6900, "IN_PROGRESS"));
    }
    const fresh = await confirmingGift(11);
    tossReplies.set(fresh.tossOrderId, tossDone(fresh.tossOrderId, 6900));

    const first = await runServerReconcile(null);
    expect(first.counts.checked).toBe(6);
    expect(giftState(fresh.tossOrderId)).toBe("confirming|-|pending_payment|0|false");
    const second = await runServerReconcile(null);
    expect(second.counts.done).toBe(1);
    expect(giftState(fresh.tossOrderId)).toBe(`done|pk_lookup_${fresh.tossOrderId}|registered|1|false`);
    deleteTestOrders();
  });
});

describe("INV-M19 (S19f): 차액 결제·역조공 결제도 같다", () => {
  it("INV-M19 (S19f): 차액 — 승인됨·일치면 그 주문의 차액 요청이 결제됨, 만료면 실패", async () => {
    const ok = await confirmingDifference(11);
    tossReplies.set(ok.row.toss_order_id, tossDone(ok.row.toss_order_id, ok.row.amount_krw));
    expect((await runServerReconcile(ok.g.orderNo)).counts.done).toBe(1);
    expect(differenceRow(ok.g.orderId)).toBe("2000/0/500/500/1000/done");
    expect(psql(`select payment_key from public.payments where toss_order_id = '${ok.row.toss_order_id}'`)).toBe(`pk_lookup_${ok.row.toss_order_id}`);

    const bad = await confirmingDifference(11);
    tossReplies.set(bad.row.toss_order_id, tossStatus(bad.row.toss_order_id, bad.row.amount_krw, "EXPIRED"));
    expect((await runServerReconcile(bad.g.orderNo)).counts.failed).toBe(1);
    expect(differenceRow(bad.g.orderId)).toBe("2000/0/500/500/1000/failed");
  });

  it("INV-M19 (S19f, 실패경로): 차액 — 금액이 다르면 확인 필요, 진행 중이면 그대로", async () => {
    const d = await confirmingDifference(11);
    tossReplies.set(d.row.toss_order_id, tossDone(d.row.toss_order_id, 1000));
    await runServerReconcile(d.g.orderNo);
    expect(differenceRow(d.g.orderId)).toBe("2000/0/500/500/1000/confirming");
    expect(psql(`select review_at is not null from public.payments where toss_order_id = '${d.row.toss_order_id}'`)).toBe("t");
    const boss = await signedInClient("fankkuk_admin");
    const rows = (await boss.rpc("admin_payment_rows")).data as { order_no: string; payment_kind: string; needs_review: boolean }[];
    expect(rows.filter((r) => r.order_no === d.g.orderNo && r.needs_review)).toEqual([expect.objectContaining({ payment_kind: "difference" })]);
    // 다시 돌려도 결제사를 부르지 않고 그대로
    tossCalls.length = 0;
    expect((await runServerReconcile(d.g.orderNo)).counts.checked).toBe(0);
    expect(tossCalls).toEqual([]);
    expect(differenceRow(d.g.orderId)).toBe("2000/0/500/500/1000/confirming");
  });

  it("INV-M19 (S19e·S19f, 동시): 차액 — 다시 확인의 완료와 늦게 돌아온 원래 승인이 겹쳐도 완료 1번", async () => {
    const d = await confirmingDifference(11);
    tossReplies.set(d.row.toss_order_id, tossDone(d.row.toss_order_id, d.row.amount_krw));
    const lock = await holdRowLock(`select 1 from public.payments where toss_order_id = '${d.row.toss_order_id}' for update`, 2);
    const [reconciled, late] = await Promise.all([
      runServerReconcile(d.g.orderNo),
      adminClient().rpc("settle_difference_payment", { p_toss_order_id: d.row.toss_order_id, p_status: "done", p_payment_key: `pk_late_${d.row.toss_order_id}` }),
    ]);
    await lock.released;
    expect(reconciled.counts.checked).toBe(1);
    expect(tossCalls).toEqual([d.row.toss_order_id]);
    expect(reconciled.counts.done + (late.data === true ? 1 : 0)).toBe(1);
    expect(differenceRow(d.g.orderId)).toBe("2000/0/500/500/1000/done");
  });

  it("INV-M19 (S19f): 역조공 — 승인됨·일치면 보낸 역조공이 생기고, 만료면 실패, 진행 중이면 그대로", async () => {
    const ok = await confirmingRevgift(11);
    tossReplies.set(ok.tossOrderId, tossDone(ok.tossOrderId, 5400));
    expect((await runServerReconcile(ok.orderNos[0]!)).counts.done).toBe(1);
    expect(revgiftState(ok.tossOrderId)).toBe(`done|pk_lookup_${ok.tossOrderId}|true|false`);
    // 결제 완료와 같은 처리에서 몫마다 받는 주소 6자리가 생긴다(정상 확정과 같은 반영)
    expect(psql(`select count(*) from public.inbound_codes c join public.revgift_shares s on s.id = c.share_id where s.send_id = '${ok.sendId}'`)).toBe("1");

    const bad = await confirmingRevgift(11);
    tossReplies.set(bad.tossOrderId, tossStatus(bad.tossOrderId, 5400, "ABORTED"));
    await runServerReconcile(bad.orderNos[0]!);
    expect(revgiftState(bad.tossOrderId)).toBe("failed|-|false|false");

    const waiting = await confirmingRevgift(11);
    tossReplies.set(waiting.tossOrderId, tossStatus(waiting.tossOrderId, 5400, "IN_PROGRESS"));
    await runServerReconcile(waiting.orderNos[0]!);
    expect(revgiftState(waiting.tossOrderId)).toBe("confirming|-|false|false");
  });

  it("INV-M19 (S19c·S19f, 실패경로): 역조공·차액도 9분이면 결제사를 부르지 않고 그대로", async () => {
    const send = await confirmingRevgift(9);
    tossReplies.set(send.tossOrderId, tossDone(send.tossOrderId, 5400));
    expect((await runServerReconcile(send.orderNos[0]!)).counts.checked).toBe(0);
    const d = await confirmingDifference(9);
    tossReplies.set(d.row.toss_order_id, tossDone(d.row.toss_order_id, d.row.amount_krw));
    expect((await runServerReconcile(d.g.orderNo)).counts.checked).toBe(0);
    expect(tossCalls).toEqual([]);
    expect(revgiftState(send.tossOrderId)).toBe("confirming|-|false|false");
    expect(differenceRow(d.g.orderId)).toBe("2000/0/500/500/1000/confirming");
  });

  it("INV-M19 (S19f, 실패경로): 역조공 — 금액이 다르면 확인 필요, 대표 결제 화면에 보인다", async () => {
    const send = await confirmingRevgift(11);
    tossReplies.set(send.tossOrderId, tossDone(send.tossOrderId, 4000));
    await runServerReconcile(send.orderNos[0]!);
    expect(revgiftState(send.tossOrderId)).toBe("confirming|-|false|true");
    const boss = await signedInClient("fankkuk_admin");
    const rows = (await boss.rpc("admin_payment_rows")).data as { order_no: string; needs_review: boolean }[];
    expect(rows.filter((r) => r.order_no === send.orderNos[0])).toEqual([expect.objectContaining({ needs_review: true })]);
    tossCalls.length = 0;
    expect((await runServerReconcile(send.orderNos[0]!)).counts.checked).toBe(0);
    expect(tossCalls).toEqual([]);
    expect(revgiftState(send.tossOrderId)).toBe("confirming|-|false|true");
  });

  it("INV-M19 (S19e·S19f, 동시): 역조공 — 다시 확인의 완료와 늦게 돌아온 원래 승인이 겹쳐도 완료 1번, 받는 주소도 한 벌", async () => {
    const send = await confirmingRevgift(11);
    tossReplies.set(send.tossOrderId, tossDone(send.tossOrderId, 5400));
    const lock = await holdRowLock(`select 1 from public.revgift_sends where toss_order_id = '${send.tossOrderId}' for update`, 2);
    const [reconciled, late] = await Promise.all([
      runServerReconcile(send.orderNos[0]!),
      adminClient().rpc("settle_revgift_payment", { p_toss_order_id: send.tossOrderId, p_status: "done", p_payment_key: `pk_late_${send.tossOrderId}` }),
    ]);
    await lock.released;
    expect(reconciled.counts.checked).toBe(1);
    expect(tossCalls).toEqual([send.tossOrderId]);
    expect(reconciled.counts.done + (late.data === true ? 1 : 0)).toBe(1);
    expect(revgiftState(send.tossOrderId)).toMatch(/^done\|pk_(lookup|late)_[^|]+\|true\|false$/);
    expect(psql(`select count(*) from public.inbound_codes c join public.revgift_shares s on s.id = c.share_id where s.send_id = '${send.sendId}'`)).toBe("1");
  });
});

describe("INV-M19 (S19g): 예약 입구와 권한", () => {
  const SECRET = "r".repeat(40);
  const call = (headers: Record<string, string>) =>
    POST(new NextRequest("http://127.0.0.1:3311/api/cron/payments", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" }));

  it("INV-M19 (S19g, 실패경로): 비밀 값이 없는 서버·다른 값·머리 없는 요청은 거부되고 결제사 조회가 없다", async () => {
    const o = await confirmingGift(11);
    tossReplies.set(o.tossOrderId, tossDone(o.tossOrderId, 6900));
    const before = process.env.FANKKUK_SCHEDULE_SECRET;
    try {
      delete process.env.FANKKUK_SCHEDULE_SECRET;
      expect((await call({ authorization: `Bearer ${SECRET}` })).status).toBe(404);
      process.env.FANKKUK_SCHEDULE_SECRET = SECRET;
      expect((await call({ authorization: "Bearer wrong" })).status).toBe(401);
      expect((await call({})).status).toBe(401);
    } finally {
      if (before === undefined) delete process.env.FANKKUK_SCHEDULE_SECRET;
      else process.env.FANKKUK_SCHEDULE_SECRET = before;
    }
    expect(tossCalls).toEqual([]);
    expect(giftState(o.tossOrderId)).toBe("confirming|-|pending_payment|0|false");
  });

  it("INV-M19 (S19g, 실패경로): 거부할 요청은 본문을 읽지 않는다 — 비밀 값 판정이 본문 읽기보다 먼저", async () => {
    const before = process.env.FANKKUK_SCHEDULE_SECRET;
    try {
      for (const [secret, authorization, status] of [
        [undefined, `Bearer ${SECRET}`, 404],
        [SECRET, "Bearer wrong", 401],
      ] as const) {
        if (secret === undefined) delete process.env.FANKKUK_SCHEDULE_SECRET;
        else process.env.FANKKUK_SCHEDULE_SECRET = secret;
        let reads = 0;
        const req = {
          headers: new Headers({ authorization }),
          text: async () => {
            reads += 1;
            return "{}";
          },
        } as unknown as NextRequest;
        expect((await POST(req)).status).toBe(status);
        expect(reads).toBe(0);
      }
    } finally {
      if (before === undefined) delete process.env.FANKKUK_SCHEDULE_SECRET;
      else process.env.FANKKUK_SCHEDULE_SECRET = before;
    }
  });

  it("INV-M19 (S19g, 실패경로): 직원·팬·크리에이터·익명은 확인 대상 목록·확인 필요 표시·예약 함수를 부를 수 없다", async () => {
    const o = await confirmingGift(11);
    const clients = [await signedInClient("fankkuk_staff"), await signedInClient("fankkuk_admin"), await signedInClient("byeolbit_fan"), await signedInClient("haru_creator"), anonClient()];
    for (const c of clients) {
      const list = await c.rpc("payment_reconcile_targets", { p_order_no: o.orderNo });
      expect(list.error).not.toBeNull();
      expect(list.data).toBeNull();
      expect((await c.rpc("payment_mark_review", { p_source: "initial", p_toss_order_id: o.tossOrderId })).error).not.toBeNull();
      expect((await c.rpc("payment_mark_checked", { p_source: "initial", p_toss_order_id: o.tossOrderId })).error).not.toBeNull();
      expect((await c.rpc("schedule_reconcile_payments")).error).not.toBeNull();
      // 완료·실패 반영 함수도 앱 서버 키만
      expect((await c.rpc("settle_payment", { p_toss_order_id: o.tossOrderId, p_status: "failed", p_payment_key: null, p_request_id: null, p_payload: null, p_requested_at: null })).error).not.toBeNull();
      expect((await c.rpc("settle_difference_payment", { p_toss_order_id: o.tossOrderId, p_status: "failed", p_payment_key: null })).error).not.toBeNull();
      expect((await c.rpc("settle_revgift_payment", { p_toss_order_id: o.tossOrderId, p_status: "failed", p_payment_key: null })).error).not.toBeNull();
    }
    expect(psql(`select last_checked_at is null from public.payments where toss_order_id = '${o.tossOrderId}'`)).toBe("t");
    expect(giftState(o.tossOrderId)).toBe("confirming|-|pending_payment|0|false");
    // 앱 서버 키는 부를 수 있다(같은 함수가 열려 있다는 대조)
    const listed = await adminClient().rpc("payment_reconcile_targets", { p_order_no: o.orderNo });
    expect(listed.error).toBeNull();
    expect((listed.data as { toss_order_id: string }[]).map((r) => r.toss_order_id)).toEqual([o.tossOrderId]);
  });

  it("INV-M19: 예약 작업 fankkuk-reconcile 이 5분 간격으로 하나 있고, 명령에 비밀 값이 없다", () => {
    expect(psql(`select count(*) from cron.job where jobname = 'fankkuk-reconcile'`)).toBe("1");
    expect(psql(`select schedule || '|' || command from cron.job where jobname = 'fankkuk-reconcile'`)).toBe("*/5 * * * *|select public.schedule_reconcile_payments()");
  });
});
