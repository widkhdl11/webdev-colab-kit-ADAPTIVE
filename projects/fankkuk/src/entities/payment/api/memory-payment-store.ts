import type { ApprovalRequestDraft, GiftRegistration, PaymentStore, StoredPayment } from "./payment-store";

type EnvLike = { NODE_ENV?: string; VERCEL_ENV?: string };

export type MemoryPaymentStore = PaymentStore & {
  /** 저장된 등록 내용 — 시험이 "누구 이름으로 저장됐나"를 본다. */
  registrations(): GiftRegistration[];
  /** 결제 완료와 함께 넘어온 승인 요청. */
  approvalRequests(): ApprovalRequestDraft[];
};

/**
 * 유닛 시험용 메모리 저장소. 프로세스가 재시작하면 기록이 사라지므로 운영 환경에서는 만들 수 없다.
 * nicknames: 팬 ID → 닉네임(없으면 ID 를 닉네임으로 쓴다).
 */
export function createMemoryPaymentStore(opts: { env: EnvLike; nicknames?: Record<string, string> }): MemoryPaymentStore {
  if (opts.env.NODE_ENV === "production" || opts.env.VERCEL_ENV === "production") {
    throw new Error("메모리 결제 저장소는 운영 환경에서 쓸 수 없다 — DB 저장소를 연결해야 한다");
  }
  const rows = new Map<string, StoredPayment>();
  const registrations: GiftRegistration[] = [];
  const requests: ApprovalRequestDraft[] = [];

  return {
    async create({ orderId, orderNo, charge, registration }) {
      if (rows.has(orderId)) throw new Error("이미 있는 결제 orderId");
      const row: StoredPayment = {
        orderId,
        orderNo,
        charge,
        amountKrw: charge.totalKrw,
        status: "pending",
        paymentKey: null,
        fanNickname: opts.nicknames?.[registration.fanId] ?? registration.fanId,
      };
      rows.set(orderId, row);
      registrations.push({ ...registration, boxes: [...registration.boxes] });
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
      if (!row || row.status === "done" || row.status === "failed") return;
      row.status = outcome.status;
      if (outcome.status === "done") {
        row.paymentKey = outcome.paymentKey;
        requests.push({ ...outcome.approvalRequest });
      }
    },
    registrations: () => registrations.map((r) => ({ ...r })),
    approvalRequests: () => requests.map((r) => ({ ...r })),
  };
}
