import { afterEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { deleteTestUnmatched, paidGift } from "./office-helpers";

// 운영자 실패 목록 (notifications INV-N10). 운영자는 실패·건너뜀 줄을 종류·주문번호·시도 횟수·오류 코드로만 본다.
// 발송 기록 표 자체는 화면 쪽 키로 못 읽는다 — 운영자만 부를 수 있는 함수 하나가 정해진 칸만 돌려준다.

const OUTBOX = "public.notification_outbox";
const FN = "public.notification_failures(integer)";

afterEach(() => {
  deleteTestOrders();
  deleteTestUnmatched();
  psql(`delete from ${OUTBOX}`);
});

/** 줄 하나를 끝 상태로 만든다 — 일꾼을 다섯 번 돌리는 대신 트리거를 끈 채 바로(로컬 컨테이너에만 붙는다). */
function finishRow(id: string, status: "failed" | "skipped" | "sent", code: string | null, attempts: number, minutesAgo = 0): void {
  psql(
    `begin; set local session_replication_role = replica; update ${OUTBOX} set status = '${status}', error_code = ${code ? `'${code}'` : "null"}, attempts = ${attempts}, finished_at = now() - interval '${minutesAgo} minutes' where id = '${id}'; commit;`,
  );
}

/** 결제까지 끝난 시험 주문 하나와 그 승인 요청 이메일 줄을 주어진 끝 상태로. */
async function finishedOrder(status: "failed" | "skipped" | "sent", code: string | null, attempts: number, minutesAgo = 0): Promise<string> {
  const g = await paidGift();
  const id = psql(`select id from ${OUTBOX} where order_id = '${g.orderId}' and kind = 'approval_request' and channel = 'email'`);
  finishRow(id, status, code, attempts, minutesAgo);
  return g.orderNo;
}

async function listAs(login: string, limit?: number): Promise<Record<string, unknown>[]> {
  const client = await signedInClient(login);
  const r = limit === undefined ? await client.rpc("notification_failures") : await client.rpc("notification_failures", { p_limit: limit });
  if (r.error) throw new Error(`notification_failures 실패: ${r.error.code}`);
  return r.data as Record<string, unknown>[];
}

describe("운영자 실패 목록 (INV-N10)", () => {
  it("INV-N10: 운영자에게 실패·건너뜀 줄을 종류·주문번호·통로·시도 횟수·오류 코드·시각으로만, 최근 것부터 보여 준다", async () => {
    const failed = await finishedOrder("failed", "smtp_error", 5, 10);
    const skipped = await finishedOrder("skipped", "no_contact", 0, 1);
    const sent = await finishedOrder("sent", null, 0);

    const rows = await listAs("fankkuk_staff");
    const mine = rows.filter((x) => x.order_no === failed || x.order_no === skipped);
    // 최근에 끝난 건너뜀이 먼저
    expect(mine.map((x) => x.order_no)).toEqual([skipped, failed]);
    expect(Object.keys(mine[0]!).sort()).toEqual(["attempts", "channel", "error_code", "finished_at", "kind", "order_no", "round", "status"]);
    expect(mine[0]).toMatchObject({ kind: "approval_request", channel: "email", status: "skipped", attempts: 0, error_code: "no_contact" });
    expect(mine[1]).toMatchObject({ kind: "approval_request", channel: "email", status: "failed", attempts: 5, error_code: "smtp_error" });
    // 보냄은 목록에 없다
    expect(rows.some((x) => x.order_no === sent)).toBe(false);
  });

  it("INV-N10: 대표 계정도 운영자라 볼 수 있다", async () => {
    const orderNo = await finishedOrder("failed", "smtp_error", 5);
    expect((await listAs("fankkuk_admin")).some((x) => x.order_no === orderNo)).toBe(true);
  });

  it("INV-N10: 한 번에 보이는 줄 수는 1~500 — 0 이하는 1줄, 넘치는 값은 500 으로", async () => {
    await finishedOrder("failed", "smtp_error", 5);
    await finishedOrder("failed", "smtp_error", 5);
    expect(await listAs("fankkuk_staff", 1)).toHaveLength(1);
    expect(await listAs("fankkuk_staff", 0)).toHaveLength(1);
    expect((await listAs("fankkuk_staff", 100000)).length).toBeGreaterThanOrEqual(2);
    // 상한 자체는 함수 본문에서 확인한다(500 줄을 만들지 않고)
    expect(psql(`select prosrc ~ 'least\\(coalesce\\(p_limit, 100\\), 500\\)' from pg_proc where proname = 'notification_failures'`)).toBe("t");
  });

  it("INV-N10 (S10b, 실패경로): 팬·크리에이터는 함수를 불러도 운영자 확인에서 거부된다", async () => {
    await finishedOrder("failed", "smtp_error", 5);
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      const r = await (await signedInClient(login)).rpc("notification_failures");
      expect(r.data ?? []).toEqual([]);
      expect(r.error?.code).toBe("42501");
    }
  });

  it("INV-N10 (S10b, 실패경로): 익명·앱 서버 키는 실행 권한부터 없다 — 운영자 확인과 따로 막는다", async () => {
    await finishedOrder("failed", "smtp_error", 5);
    // 권한 표를 직접 본다 — 실행해 보면 운영자 확인이 같은 오류로 대신 막아 어느 쪽이 막았는지 가를 수 없다
    expect(psql(`select has_function_privilege('anon', '${FN}', 'execute')`)).toBe("f");
    expect(psql(`select has_function_privilege('service_role', '${FN}', 'execute')`)).toBe("f");
    expect(psql(`select has_function_privilege('authenticated', '${FN}', 'execute')`)).toBe("t");
    for (const client of [anonClient(), adminClient()]) {
      const r = await client.rpc("notification_failures");
      expect(r.error?.code).toBe("42501");
    }
  });
});
