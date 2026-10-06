import { afterEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { deleteTestUnmatched, paidGift } from "./office-helpers";

// 운영자 실패 목록 (notifications INV-N10). 운영자는 실패·건너뜀 줄을 종류·주문번호·시도 횟수·오류 코드로만 본다.
// 발송 기록 표 자체는 화면 쪽 키로 못 읽는다 — 운영자만 부를 수 있는 함수 하나가 정해진 칸만 돌려준다.

const OUTBOX = "public.notification_outbox";

afterEach(() => {
  deleteTestOrders();
  deleteTestUnmatched();
  psql(`delete from ${OUTBOX}`);
});

/** 줄 하나를 끝 상태로 만든다 — 일꾼을 다섯 번 돌리는 대신 트리거를 끈 채 바로(로컬 컨테이너에만 붙는다). */
function finishRow(id: string, status: "failed" | "skipped" | "sent", code: string | null, attempts: number): void {
  psql(
    `begin; set local session_replication_role = replica; update ${OUTBOX} set status = '${status}', error_code = ${code ? `'${code}'` : "null"}, attempts = ${attempts}, finished_at = now() where id = '${id}'; commit;`,
  );
}

async function failedAndSkipped(): Promise<{ orderNo: string }> {
  const g = await paidGift();
  const id = psql(`select id from ${OUTBOX} where order_id = '${g.orderId}' and kind = 'approval_request' and channel = 'email'`);
  finishRow(id, "failed", "smtp_error", 5);
  return { orderNo: g.orderNo };
}

describe("운영자 실패 목록 (INV-N10)", () => {
  it("INV-N10: 운영자에게 실패·건너뜀 줄을 종류·주문번호·통로·시도 횟수·오류 코드·시각으로만 보여 준다", async () => {
    const { orderNo } = await failedAndSkipped();
    const ok = await paidGift();
    const okId = psql(`select id from ${OUTBOX} where order_id = '${ok.orderId}' and kind = 'approval_request' and channel = 'email'`);
    finishRow(okId, "sent", null, 0);

    const staff = await signedInClient("fankkuk_staff");
    const r = await staff.rpc("notification_failures");
    expect(r.error).toBeNull();
    const rows = r.data as Record<string, unknown>[];
    const mine = rows.filter((x) => x.order_no === orderNo);
    expect(mine).toHaveLength(1);
    expect(Object.keys(mine[0]!).sort()).toEqual(["attempts", "channel", "error_code", "finished_at", "kind", "order_no", "round", "status"]);
    expect(mine[0]).toMatchObject({ kind: "approval_request", channel: "email", status: "failed", attempts: 5, error_code: "smtp_error" });
    // 보냄은 목록에 없다
    expect(rows.some((x) => x.order_no === ok.orderNo)).toBe(false);
  });

  it("INV-N10 (S10b, 실패경로): 팬·크리에이터·익명은 목록을 못 본다", async () => {
    await failedAndSkipped();
    for (const client of [await signedInClient("byeolbit_fan"), await signedInClient("haru_creator"), anonClient()]) {
      const r = await client.rpc("notification_failures");
      expect(r.data ?? []).toEqual([]);
      expect(r.error?.code).toBe("42501");
    }
  });

  it("INV-N10: 앱 서버 키는 이 함수를 부를 이유가 없다 — 운영자 세션이 아니면 거부", async () => {
    await failedAndSkipped();
    const r = await adminClient().rpc("notification_failures");
    expect(r.error?.code).toBe("42501");
  });
});
