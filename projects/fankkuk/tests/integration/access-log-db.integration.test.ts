import { describe, expect, it } from "vitest";
import { SEED, adminClient, anonClient, approveRpc, payTestOrder, psql, registerTestOrder, signedInClient } from "./helpers";

// 크리에이터 열람 기록 읽기(my_access_log) — 주소 보호 스펙 INV-P7(크리에이터는 자기 주문의 기록 전부를 본다)·
// INV-P5(2회째부터 「재출력」). 기록 줄은 복호화 전용 역할로 넣는다 — 앱 서버 키로는 쓸 수 없다.
// 시험 주문에 딸린 기록은 끝난 뒤 deleteTestOrders 가 트리거를 끄고 지운다.

const OPERATOR_ID = "00000000-0000-4000-a000-000000000021"; // 팬꾹 운영(대표 계정 자리)
const OTHER_ACCOUNT_ID = "00000000-0000-4000-a000-000000000022"; // 팬꾹 직원

type LogRow = { at: string; order_no: string; result: string; print_no: number | null; deny_reason: string | null; requester: string };

function appendLog(orderId: string, requesterId: string, values: { result: "opened"; printNo: number } | { result: "denied"; reason: string }): void {
  const cols =
    values.result === "opened"
      ? `'opened', ${values.printNo}, null`
      : `'denied', null, '${values.reason}'`;
  psql(
    `set role address_decryptor; insert into public.decrypt_log (order_id, box_id, requester_id, result, print_no, deny_reason) values ('${orderId}', ${firstBoxOf(orderId)}, '${requesterId}', ${cols});`,
  );
}

/** 주소를 연 줄은 어느 상자의 출력인지가 반드시 있어야 한다(INV-P5 — 횟수는 상자마다). 시험 주문의 첫 상자를 쓴다. */
function firstBoxOf(orderId: string): string {
  const id = psql(`select id from public.boxes where order_id = '${orderId}' order by seq limit 1`);
  if (!id) throw new Error("시험 주문에 상자가 없다");
  return `'${id}'`;
}

/** 하루의 시험 주문 하나에 성공 1·2회째 출력 1·거부 1, 대표 아닌 계정의 거부 1 을 남긴다. */
async function loggedOrder() {
  const o = await registerTestOrder();
  appendLog(o.orderId, OPERATOR_ID, { result: "opened", printNo: 1 });
  appendLog(o.orderId, OPERATOR_ID, { result: "opened", printNo: 2 });
  appendLog(o.orderId, OPERATOR_ID, { result: "denied", reason: "order_not_printable" });
  appendLog(o.orderId, OTHER_ACCOUNT_ID, { result: "denied", reason: "not_owner" });
  return o;
}

async function readLog(loginId: string): Promise<LogRow[]> {
  const client = await signedInClient(loginId);
  const { data, error } = await client.rpc("my_access_log");
  expect(error).toBeNull();
  return data as LogRow[];
}

describe("INV-P7: 크리에이터는 자기 주문의 열람 기록 전부를 본다", () => {
  it("INV-P7 S7: 하루는 자기 주문의 성공·거부 줄을 모두 본다", async () => {
    const o = await loggedOrder();
    const mine = (await readLog("haru_creator")).filter((r) => r.order_no === o.orderNo);
    expect(mine).toHaveLength(4);
    expect(mine.filter((r) => r.result === "opened")).toHaveLength(2);
    expect(mine.filter((r) => r.result === "denied").map((r) => r.deny_reason).sort()).toEqual(["not_owner", "order_not_printable"]);
  });

  it("INV-P5 S5d: 2회째 출력 줄은 print_no 2 로 나온다", async () => {
    const o = await loggedOrder();
    const opened = (await readLog("haru_creator")).filter((r) => r.order_no === o.orderNo && r.result === "opened");
    expect(opened.map((r) => r.print_no).sort()).toEqual([1, 2]);
  });

  it("INV-P7: 최신 줄부터 나온다", async () => {
    await loggedOrder();
    const rows = await readLog("haru_creator");
    const times = rows.map((r) => new Date(r.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("INV-P7: 요청자는 「대표」인지 아닌지만 나오고 계정 아이디·이메일·닉네임 칸은 없다", async () => {
    const o = await loggedOrder();
    const mine = (await readLog("haru_creator")).filter((r) => r.order_no === o.orderNo);
    expect(new Set(mine.map((r) => r.requester))).toEqual(new Set(["owner", "other"]));
    expect(mine.find((r) => r.deny_reason === "not_owner")?.requester).toBe("other");
    for (const r of mine) {
      expect(Object.keys(r).sort()).toEqual(["at", "deny_reason", "order_no", "print_no", "requester", "result"]);
      const text = JSON.stringify(r);
      for (const leak of [OPERATOR_ID, OTHER_ACCOUNT_ID, "fankkuk_admin", "fankkuk_staff", "@fankkuk.test", "팬꾹 운영", "팬꾹 직원"]) {
        expect(text).not.toContain(leak);
      }
    }
  });
});

describe("INV-P7: 남의 주문 기록은 보이지 않는다", () => {
  it("INV-P7: 다른 크리에이터(모모)는 하루 주문의 줄을 못 본다", async () => {
    const o = await loggedOrder();
    expect((await readLog("momo_creator")).filter((r) => r.order_no === o.orderNo)).toEqual([]);
  });

  it("INV-P7: 그 주문을 보낸 팬도 기록 줄을 못 본다", async () => {
    await loggedOrder();
    expect(await readLog("byeolbit_fan")).toEqual([]);
  });

  it("INV-P7: 대표 계정(운영자)이라도 크리에이터가 아니면 줄이 없다", async () => {
    await loggedOrder();
    expect(await readLog("fankkuk_admin")).toEqual([]);
  });

  it("INV-P7: 로그인하지 않으면 함수를 부를 수 없다", async () => {
    await loggedOrder();
    const { data, error } = await anonClient().rpc("my_access_log");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe("INV-P7 S7b: 로그인한 사용자도 기록 표를 직접 읽거나 고치거나 지울 수 없다", () => {
  it("INV-P7 S7b: authenticated 로 decrypt_log 를 select·update·delete 하면 거부", async () => {
    const o = await loggedOrder();
    const creator = await signedInClient("haru_creator");
    const read = await creator.from("decrypt_log").select("*");
    expect(read.error).not.toBeNull();
    const upd = await creator.from("decrypt_log").update({ deny_reason: "not_owner" }).eq("order_id", o.orderId);
    expect(upd.error).not.toBeNull();
    const del = await creator.from("decrypt_log").delete().eq("order_id", o.orderId);
    expect(del.error).not.toBeNull();
    expect(psql(`select count(*) from public.decrypt_log where order_id = '${o.orderId}';`)).toBe("4");
    expect(psql(`select count(*) from public.decrypt_log where order_id = '${o.orderId}' and deny_reason = 'not_owner';`)).toBe("1");
  });
});

type MonthSummary = { approved_count: number; opened_count: number; reprint_count: number; denied_count: number };

async function readSummary(loginId: string): Promise<MonthSummary> {
  const client = await signedInClient(loginId);
  const { data, error } = await client.rpc("my_access_month_summary");
  expect(error).toBeNull();
  const rows = data as MonthSummary[];
  expect(rows).toHaveLength(1);
  return rows[0] as MonthSummary;
}

/** 서울 기준 이번 달 1일 00:00 에서 offset 만큼 떨어진 시각(SQL 식). */
const seoulMonthStartPlus = (offset: string) =>
  `((date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') + interval '${offset}')`;

function appendLogAt(orderId: string, at: string, cols: string): void {
  psql(
    `set role address_decryptor; insert into public.decrypt_log (at, order_id, box_id, requester_id, result, print_no, deny_reason) values (${at}, '${orderId}', ${firstBoxOf(orderId)}, '${OPERATOR_ID}', ${cols});`,
  );
}

describe("열람 기록 화면의 「이번 달」 숫자 (my_access_month_summary)", () => {
  it("하루가 이번 달에 승인한 주문이 늘면 하루의 승인 숫자만 하나 는다", async () => {
    const before = await readSummary("haru_creator");
    const momoBefore = await readSummary("momo_creator");

    const o = await registerTestOrder();
    const requestId = await payTestOrder(o);
    const approved = await approveRpc(requestId);
    expect(approved.data).toBe("approved");

    expect((await readSummary("haru_creator")).approved_count).toBe(before.approved_count + 1);
    expect(await readSummary("momo_creator")).toEqual(momoBefore);
    const anon = await anonClient().rpc("my_access_month_summary");
    expect(anon.error).not.toBeNull();
  });

  it("INV-P5: 이번 달 줄을 DB 가 센다 — 열림(첫 출력·재출력)·재출력·거부", async () => {
    const before = await readSummary("haru_creator");
    await loggedOrder(); // 지금 시각으로 첫 출력 1·재출력 1·거부 2
    const after = await readSummary("haru_creator");
    expect(after.opened_count - before.opened_count).toBe(2);
    expect(after.reprint_count - before.reprint_count).toBe(1);
    expect(after.denied_count - before.denied_count).toBe(2);
  });

  it("서울 경계: 서울 1일 00:30(UTC 로는 전달 말일 15:30)은 이번 달, 서울 전달 말일 23:30 은 빠진다", async () => {
    const o = await registerTestOrder();
    // 시험 시각이 정말 그 자리인지 먼저 본다 — 서울 1일 00:30 은 UTC 로 전달이다
    expect(psql(`select to_char(${seoulMonthStartPlus("30 minutes")} at time zone 'Asia/Seoul', 'DD HH24:MI');`)).toBe("01 00:30");
    expect(psql(`select to_char(${seoulMonthStartPlus("30 minutes")} at time zone 'UTC', 'HH24:MI');`)).toBe("15:30");
    expect(psql(`select to_char(${seoulMonthStartPlus("-30 minutes")} at time zone 'Asia/Seoul', 'HH24:MI');`)).toBe("23:30");

    const before = await readSummary("haru_creator");
    appendLogAt(o.orderId, seoulMonthStartPlus("30 minutes"), "'opened', 1, null");
    appendLogAt(o.orderId, seoulMonthStartPlus("31 minutes"), "'opened', 2, null");
    appendLogAt(o.orderId, seoulMonthStartPlus("-30 minutes"), "'opened', 3, null");
    appendLogAt(o.orderId, seoulMonthStartPlus("-29 minutes"), "'denied', null, 'decrypt_limit_reached'");
    const after = await readSummary("haru_creator");
    expect(after.opened_count - before.opened_count).toBe(2);
    expect(after.reprint_count - before.reprint_count).toBe(1);
    expect(after.denied_count - before.denied_count).toBe(0);
  });
});

describe("INV-P7: 기록 전부 · 읽을 줄 수(p_limit)", () => {
  it("INV-P7: 301줄이 넘어도 인자 없이 부르면 전부 돌려준다", async () => {
    const o = await registerTestOrder();
    psql(
      `set role address_decryptor; insert into public.decrypt_log (at, order_id, requester_id, result, print_no, deny_reason) select now() - make_interval(secs => g), '${o.orderId}', '${OPERATOR_ID}', 'denied', null, 'order_not_printable' from generate_series(1, 301) g;`,
    );
    const total = Number(
      psql(
        `select count(*) from public.decrypt_log l join public.orders o on o.id = l.order_id where o.creator_id = '${SEED.haruCreatorId}';`,
      ),
    );
    expect(total).toBeGreaterThan(300);
    const rows = await readLog("haru_creator");
    expect(rows).toHaveLength(total);
    expect(rows.filter((r) => r.order_no === o.orderNo)).toHaveLength(301);
  });

  it("p_limit 3 이면 최신 3줄만", async () => {
    await loggedOrder();
    const all = await readLog("haru_creator");
    const client = await signedInClient("haru_creator");
    const { data, error } = await client.rpc("my_access_log", { p_limit: 3 });
    expect(error).toBeNull();
    expect(data).toEqual(all.slice(0, 3));
  });

  it.each([0, -1, 101])("(실패경로): p_limit %i 은 거부", async (limit) => {
    const client = await signedInClient("haru_creator");
    const { data, error } = await client.rpc("my_access_log", { p_limit: limit });
    expect(error?.code).toBe("22023");
    expect(data).toBeNull();
  });
});

// 검사 자체가 도는지: 하루의 시험 주문이 실제로 하루 것인지(SEED 와 어긋나면 위 시험이 전부 빈 배열로 통과할 수 있다)
describe("시험 준비 확인", () => {
  it("시험 주문은 하루의 주문이다", async () => {
    const o = await registerTestOrder();
    expect(psql(`select creator_id from public.orders where id = '${o.orderId}';`)).toBe(SEED.haruCreatorId);
  });
});
