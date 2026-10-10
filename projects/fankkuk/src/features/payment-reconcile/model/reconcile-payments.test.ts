import { describe, expect, it } from "vitest";
import type { TossLookup } from "@/shared/api/toss-payments/client";
import { RECONCILE_RUN_BUDGET_MS, reconcilePayments, type ReconcileDeps, type ReconcileSourceKind, type ReconcileTarget } from "./reconcile-payments";

// 결과를 모르는 결제 다시 확인의 실행 (payment INV-M19). 대상 목록(DB) → 결제사 조회 → 판정 → 반영.
// 반영은 결제 종류마다 기존 확정 흐름의 완료·실패 반영을 그대로 쓴다 — 여기서는 어느 쪽을 몇 번 불렀는지만 본다.

const NOW = new Date("2026-10-08T03:00:00Z");
const target = (source: ReconcileSourceKind, id: string, minutes = 11, amountKrw = 6900): ReconcileTarget => ({
  source,
  tossOrderId: id,
  amountKrw,
  confirmingAt: new Date(NOW.getTime() - minutes * 60_000),
});
const doneLookup = (id: string, amount = 6900): TossLookup => ({
  kind: "found",
  payment: { status: "DONE", orderId: id, totalAmount: amount, balanceAmount: null, paymentKey: `pk_toss_${id}` },
});

function harness(targets: ReconcileTarget[], lookups: Record<string, TossLookup | Error>, settleResult = true, clock: () => Date = () => NOW) {
  const log: string[] = [];
  const touched: string[] = [];
  const listArgs: (string | null)[] = [];
  const settler = (source: ReconcileSourceKind) => ({
    settleDone: async (id: string, key: string) => {
      log.push(`${source}:done:${id}:${key}`);
      return settleResult;
    },
    settleFailed: async (id: string) => {
      log.push(`${source}:failed:${id}`);
      return settleResult;
    },
  });
  const deps: ReconcileDeps = {
    listTargets: async (orderNo) => {
      listArgs.push(orderNo);
      return targets;
    },
    markChecked: async (source, id) => {
      touched.push(`${source}:${id}`);
    },
    markReview: async (source, id, key, balance) => {
      log.push(`${source}:review:${id}:${key}:${String(balance)}`);
      return true;
    },
    lookup: async (id) => {
      log.push(`lookup:${id}`);
      const r = lookups[id];
      if (r instanceof Error) throw r;
      return r ?? { kind: "error" };
    },
    settlers: { initial: settler("initial"), difference: settler("difference"), revgift: settler("revgift") },
    now: clock,
  };
  return { deps, log, listArgs, touched };
}

describe("INV-M19: 다시 확인 실행", () => {
  it("INV-M19 (S19·S19f): 세 종류 모두 — 승인됨·일치면 그 종류의 완료 반영을 조회 응답의 결제 키로 부른다", async () => {
    const h = harness([target("initial", "g1"), target("difference", "d1", 11, 2000), target("revgift", "r1")], {
      g1: doneLookup("g1"),
      d1: doneLookup("d1", 2000),
      r1: doneLookup("r1"),
    });
    const r = await reconcilePayments(h.deps, null);
    expect(r).toEqual({ ok: true, counts: { checked: 3, done: 3, failed: 0, review: 0, kept: 0, errors: 0, skipped: 0 } });
    expect(h.log).toEqual([
      "lookup:g1",
      "initial:done:g1:pk_toss_g1",
      "lookup:d1",
      "difference:done:d1:pk_toss_d1",
      "lookup:r1",
      "revgift:done:r1:pk_toss_r1",
    ]);
  });

  it("INV-M19 (S19b): 만료는 실패 반영, 진행 중은 아무것도 부르지 않는다", async () => {
    const h = harness([target("initial", "g1"), target("revgift", "r1")], {
      g1: { kind: "found", payment: { status: "EXPIRED", orderId: "g1", totalAmount: 6900, balanceAmount: null, paymentKey: "pk" } },
      r1: { kind: "found", payment: { status: "IN_PROGRESS", orderId: "r1", totalAmount: 6900, balanceAmount: null, paymentKey: "pk" } },
    });
    const r = await reconcilePayments(h.deps, null);
    expect(r.counts).toEqual({ checked: 2, done: 0, failed: 1, review: 0, kept: 1, errors: 0, skipped: 0 });
    expect(h.log).toEqual(["lookup:g1", "initial:failed:g1", "lookup:r1"]);
  });

  it("INV-M19 (S19d, 실패경로) · INV-M20 ①: 금액이 다르면 완료·실패 대신 확인 필요 표시만 — 조회 응답의 결제 키와 취소 가능 금액을 같이 남긴다", async () => {
    const h = harness([target("difference", "d1", 11, 2000)], { d1: doneLookup("d1", 1000) });
    const r = await reconcilePayments(h.deps, null);
    expect(r.counts).toMatchObject({ review: 1, done: 0, failed: 0 });
    expect(h.log).toEqual(["lookup:d1", "difference:review:d1:pk_toss_d1:1000"]);
  });

  it("INV-M19 (S19c): 결제사에 없음 — 30분 전이면 그대로, 지나면 실패", async () => {
    const h = harness([target("initial", "g1", 20), target("initial", "g2", 31)], { g1: { kind: "not_found" }, g2: { kind: "not_found" } });
    const r = await reconcilePayments(h.deps, null);
    expect(r.counts).toMatchObject({ failed: 1, kept: 1 });
    expect(h.log).toEqual(["lookup:g1", "lookup:g2", "initial:failed:g2"]);
  });

  it("INV-M19 (S19b, 실패경로): 조회 오류·조회 예외는 그 줄을 그대로 두고 다음 줄을 계속 본다 — 실행 결과는 실패", async () => {
    const h = harness([target("initial", "g1"), target("initial", "g2"), target("initial", "g3")], {
      g1: { kind: "error" },
      g2: new Error("network"),
      g3: doneLookup("g3"),
    });
    const r = await reconcilePayments(h.deps, null);
    expect(r).toEqual({ ok: false, counts: { checked: 3, done: 1, failed: 0, review: 0, kept: 2, errors: 2, skipped: 0 } });
    expect(h.log).toEqual(["lookup:g1", "lookup:g2", "lookup:g3", "initial:done:g3:pk_toss_g3"]);
  });

  it("INV-M19 (S19e): 반영 함수가 false(다른 처리가 먼저 반영) 면 완료로 세지 않는다", async () => {
    const h = harness([target("initial", "g1")], { g1: doneLookup("g1") }, false);
    const r = await reconcilePayments(h.deps, null);
    expect(r).toEqual({ ok: true, counts: { checked: 1, done: 0, failed: 0, review: 0, kept: 1, errors: 0, skipped: 0 } });
  });

  it("INV-M19: 주문번호를 주면 그 주문의 대상만 묻는다(「지금 돌리기」 한 줄)", async () => {
    const h = harness([], {});
    await reconcilePayments(h.deps, "FC-T12345");
    expect(h.listArgs).toEqual(["FC-T12345"]);
  });

  it("INV-M19: 결제사를 부르기 전에 그 줄에 「확인한 시각」을 남긴다 — 그대로 남는 줄이 다음 회차에 뒤로 가게", async () => {
    const h = harness([target("initial", "g1"), target("revgift", "r1")], { g1: { kind: "error" }, r1: { kind: "not_found" } });
    await reconcilePayments(h.deps, null);
    expect(h.touched).toEqual(["initial:g1", "revgift:r1"]);
  });

  it("INV-M19: 시작 뒤 40초가 지나면 남은 줄은 결제사를 부르지 않고 멈춘다 — 예약 입구 함수 시간(60초) 안에 끝나게", async () => {
    expect(RECONCILE_RUN_BUDGET_MS).toBe(40_000);
    // 한 줄 조회마다 15초가 걸리는 시계
    let t = NOW.getTime();
    const clock = () => new Date(t);
    const targets = ["g1", "g2", "g3", "g4"].map((id) => target("initial", id));
    const h = harness(targets, { g1: doneLookup("g1"), g2: doneLookup("g2"), g3: doneLookup("g3"), g4: doneLookup("g4") }, true, clock);
    const lookup = h.deps.lookup;
    h.deps.lookup = async (id) => {
      t += 15_000;
      return lookup(id);
    };
    const r = await reconcilePayments(h.deps, null);
    // 0초·15초·30초에 시작한 셋은 확인, 45초 시점의 넷째는 건너뜀
    expect(r).toEqual({ ok: true, counts: { checked: 3, done: 3, failed: 0, review: 0, kept: 0, errors: 0, skipped: 1 } });
    expect(h.log.filter((l) => l.startsWith("lookup:"))).toEqual(["lookup:g1", "lookup:g2", "lookup:g3"]);
    expect(h.touched).toEqual(["initial:g1", "initial:g2", "initial:g3"]);
  });

  it("INV-M19: 정확히 40초에 시작하는 줄은 아직 확인한다(40초 초과부터 멈춤)", async () => {
    let t = NOW.getTime();
    const h = harness([target("initial", "g1"), target("initial", "g2")], { g1: doneLookup("g1"), g2: doneLookup("g2") }, true, () => new Date(t));
    const lookup = h.deps.lookup;
    h.deps.lookup = async (id) => {
      t += 40_000;
      return lookup(id);
    };
    expect((await reconcilePayments(h.deps, null)).counts).toMatchObject({ checked: 2, skipped: 0 });
  });
});
