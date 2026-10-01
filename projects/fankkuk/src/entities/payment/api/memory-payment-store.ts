import type { PaymentStore, StoredPayment } from "./payment-store";

type EnvLike = { NODE_ENV?: string; VERCEL_ENV?: string };

/**
 * DB 연결 전 시험 결제용 메모리 저장소. 프로세스가 재시작하면 기록이 사라지므로
 * 운영 환경에서는 만들 수 없다.
 */
export function createMemoryPaymentStore(opts: { env: EnvLike }): PaymentStore {
  if (opts.env.NODE_ENV === "production" || opts.env.VERCEL_ENV === "production") {
    throw new Error("메모리 결제 저장소는 운영 환경에서 쓸 수 없다 — DB 저장소를 연결해야 한다");
  }
  const rows = new Map<string, StoredPayment>();

  return {
    async create({ orderId, orderNo, charge }) {
      if (rows.has(orderId)) throw new Error("이미 있는 결제 orderId");
      const row: StoredPayment = { orderId, orderNo, charge, amountKrw: charge.totalKrw, status: "pending", paymentKey: null };
      rows.set(orderId, row);
      return { ...row };
    },
    async find(orderId) {
      const row = rows.get(orderId);
      return row ? { ...row } : null;
    },
    async claim(orderId) {
      // 확인과 전환 사이에 await 가 없다 — 한 프로세스 안에서는 이 둘이 끊기지 않는다.
      const row = rows.get(orderId);
      if (!row || row.status !== "pending") return false;
      row.status = "confirming";
      return true;
    },
    async settle(orderId, outcome) {
      const row = rows.get(orderId);
      if (!row || row.status === "done") return;
      row.status = outcome.status;
      if (outcome.status === "done") row.paymentKey = outcome.paymentKey;
    },
  };
}
