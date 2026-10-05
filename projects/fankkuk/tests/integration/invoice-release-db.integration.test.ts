import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createInvoiceDecryptor } from "@/features/invoice-print/api/invoice-decryptor";
import { adminClient, deleteTestOrders, psql, psqlError, signedInClient } from "./helpers";
import {
  decryptFileText,
  HARU_CREATOR_ID,
  logRows,
  OWNER_ID,
  putHaruEnvelope,
  restoreHaruAddress,
  saveHaruAddress,
  sealTestAddress,
  STAFF_ID,
  testKeyPair,
  type TestKeys,
} from "./invoice-helpers";
import { approve, deleteTestUnmatched, FAN_PASS, fanSetsWaybill, inspect, paidGift, parcelState, receiveAndLabel, waybill, type Unit } from "./office-helpers";

// 송장이 안 나온 출력 시도 돌려주기 (address-protection INV-P15, INV-P5 「횟수 = 연 줄 − 돌려준 줄」, INV-P7).
// 돌려줌은 열람 기록 표가 아니라 따로 둔 「돌려줌」 표에 남고, 그 표에는 돌려주기 함수만 쓴다.
// 「(manual/0010 뒤)」가 붙은 시험은 주소를 내주는 함수(pii 를 읽는다 — 사람이 적용)가 연 줄의 id 를 돌려주고
// 돌려준 줄을 횟수에서 빼야 통과한다. 그 파일이 적용되기 전에는 빨간불이 맞다.

let keys: TestKeys;
let saved: ReturnType<typeof saveHaruAddress>;

const env = () => ({ NODE_ENV: "development", SUPABASE_URL: process.env.FK_TEST_API_URL, SUPABASE_ANON_KEY: process.env.FK_TEST_ANON_KEY });

beforeAll(async () => {
  keys = await testKeyPair();
  saved = saveHaruAddress();
  putHaruEnvelope(await sealTestAddress(keys, HARU_CREATOR_ID));
});

afterEach(() => {
  deleteTestOrders();
  deleteTestUnmatched();
});

afterAll(() => {
  restoreHaruAddress(saved);
});

async function tokenOf(loginId: string): Promise<string> {
  const client = await signedInClient(loginId);
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("토큰 없음");
  return token;
}

/** 결제·승인·입고·부착·검수까지 끝난 하루 선물 상자 하나. */
async function inspectedGift(): Promise<Unit & { qr: string; boxId: string }> {
  const g = await paidGift();
  await approve(g);
  const no = waybill();
  await fanSetsWaybill(g.boxIds[0]!, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
  return { ...g, qr, boxId: g.boxIds[0]! };
}

/** 복호화 전용 역할로 SQL 한 문장을 돌리고 마지막 줄(결과)을 돌려준다 — psql 은 「SET」 줄을 먼저 찍는다. */
function asDecryptor(sql: string): string {
  return psql(`set role address_decryptor; ${sql}`).split(/\r?\n/).pop() ?? "";
}

/** 주소를 내주는 DB 함수를 직접 부른다(앱 판정을 건너뛴 호출 — 송장 마무리 없이 「연 줄」만 남는다). */
function claim(qr: string, requester = OWNER_ID): Record<string, unknown> {
  return JSON.parse(asDecryptor(`select public.invoice_claim_print('${qr}', '${requester}')::text;`)) as Record<string, unknown>;
}

function release(logId: string, requester = OWNER_ID): Record<string, unknown> {
  return JSON.parse(asDecryptor(`select public.invoice_release_print(${logId}, '${requester}')::text;`)) as Record<string, unknown>;
}

/** 그 상자의 가장 최근 「연 줄」 id. */
function latestOpened(boxId: string): string {
  return psql(`select max(id) from public.decrypt_log where box_id = '${boxId}' and result = 'opened'`);
}

/** 판정 재료가 내주는 그 상자의 횟수(INV-P5). */
function contextCount(qr: string): number {
  return Number(asDecryptor(`select public.invoice_print_context('${qr}') ->> 'decrypt_count';`));
}

function releaseRows(boxId: string): string[] {
  const out = psql(`select opened_log_id || ':' || requester_id from public.decrypt_releases where box_id = '${boxId}' order by id`);
  return out === "" ? [] : out.split("\n");
}

describe("INV-P15 (S15): 송장이 안 나온 시도는 돌려받는다", () => {
  it("INV-P15 (S15): 돌려주면 판정 재료의 횟수가 0 으로 돌아오고, 원래 「연 줄」은 그대로 남는다(INV-P7)", async () => {
    const g = await inspectedGift();
    expect(claim(g.qr)).toMatchObject({ result: "opened", print_no: 1 });
    expect(contextCount(g.qr)).toBe(1);
    const logId = latestOpened(g.boxId);
    expect(release(logId)).toEqual({ result: "released" });
    expect(contextCount(g.qr)).toBe(0);
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`]);
    expect(releaseRows(g.boxId)).toEqual([`${logId}:${OWNER_ID}`]);
    expect(parcelState(g.qr)).toBe("inspected");
  });

  it("INV-P15 (S15): 크리에이터 열람 기록에서 돌려준 줄은 「출력 실패」(released) 로, 나머지 연 줄은 그대로 보인다", async () => {
    const g = await inspectedGift();
    claim(g.qr);
    release(latestOpened(g.boxId));
    claim(g.qr);
    const haru = await signedInClient("haru_creator");
    const { data, error } = await haru.rpc("my_access_log");
    expect(error).toBeNull();
    const mine = (data as { order_no: string; result: string; released: boolean }[]).filter((r) => r.order_no === g.orderNo);
    // 최신 줄부터
    expect(mine.map((r) => [r.result, r.released])).toEqual([
      ["opened", false],
      ["opened", true],
    ]);
  });

  it("INV-P15 (S15): 이번 달 숫자에서 돌려준 줄은 재출력으로 세지 않는다(열림으로는 센다 — 주소는 열렸다)", async () => {
    const g = await inspectedGift();
    const haru = await signedInClient("haru_creator");
    const before = ((await haru.rpc("my_access_month_summary")).data as { opened_count: number; reprint_count: number }[])[0]!;
    // 앞선 시도가 돌려지지 않은 채 남으면 다음 연 줄은 2번째다 — 그 줄이 실패해 돌려지면 재출력이 아니다
    psql(
      `insert into public.decrypt_log (order_id, box_id, requester_id, result, print_no) values ('${g.orderId}', '${g.boxId}', '${OWNER_ID}', 'opened', 1)`,
    );
    claim(g.qr);
    expect(release(latestOpened(g.boxId))).toEqual({ result: "released" });
    const after = ((await haru.rpc("my_access_month_summary")).data as { opened_count: number; reprint_count: number }[])[0]!;
    expect(after.opened_count - before.opened_count).toBe(2);
    expect(after.reprint_count - before.reprint_count).toBe(0);
  });

  it("INV-P15 (S15)·INV-P5 (manual/0010 뒤): 주소를 내주는 함수도 돌려준 줄을 빼고 센다 — 다음 출력은 첫 출력", async () => {
    const g = await inspectedGift();
    const first = claim(g.qr);
    expect(first.log_id).toBe(Number(latestOpened(g.boxId)));
    release(String(first.log_id));
    expect(claim(g.qr)).toMatchObject({ result: "opened", print_no: 1 });
  });

  it("INV-P15 (S15, manual/0010 뒤): 송장 마무리가 실패하면 출력 함수가 돌려주고, 다음 출력은 첫 출력으로 송장이 나온다", async () => {
    const g = await inspectedGift();
    // 송장번호 꼴이 틀려 마무리가 실패한다 — 주소는 이미 열렸다
    const broken = createInvoiceDecryptor(env(), () => decryptFileText(keys), () => "not-a-waybill");
    expect(await broken({ qr: g.qr, accessToken: await tokenOf("fankkuk_admin") })).toEqual({ kind: "failed" });
    expect(parcelState(g.qr)).toBe("inspected");
    expect(releaseRows(g.boxId)).toEqual([`${latestOpened(g.boxId)}:${OWNER_ID}`]);
    expect(contextCount(g.qr)).toBe(0);

    const good = createInvoiceDecryptor(env(), () => decryptFileText(keys), waybill);
    expect(await good({ qr: g.qr, accessToken: await tokenOf("fankkuk_admin") })).toMatchObject({ kind: "printed", reprint: false });
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`, `opened:1:${OWNER_ID}`]);
    expect(releaseRows(g.boxId)).toHaveLength(1);
  });
});

describe("INV-P15 (a): 돌려줌은 돌려주기 함수로만", () => {
  it("INV-P15 (S15b, 실패경로 a): 복호화 전용 역할은 기록 표에 「연 줄」을 직접 넣을 수 없다 — 넣을 수 있는 것은 거부 줄뿐", async () => {
    const g = await inspectedGift();
    expect(
      psqlError(
        `set role address_decryptor; insert into public.decrypt_log (order_id, box_id, requester_id, result, print_no) values ('${g.orderId}', '${g.boxId}', '${OWNER_ID}', 'opened', 1);`,
      ),
    ).toMatch(/row-level security/);
    // 거부 줄은 그대로 넣는다(출력 함수의 앱 쪽 거부 기록)
    asDecryptor(
      `insert into public.decrypt_log (order_id, box_id, requester_id, result, deny_reason) values ('${g.orderId}', '${g.boxId}', '${OWNER_ID}', 'denied', 'not_owner');`,
    );
    expect(logRows(g.orderId)).toEqual([`denied:not_owner:${OWNER_ID}`]);
  });

  it("INV-P15 (S15b, 실패경로 a): 복호화 전용 역할·앱 서버 키·로그인으로 돌려줌 표에 직접 넣을 수 없다", async () => {
    const g = await inspectedGift();
    claim(g.qr);
    const logId = latestOpened(g.boxId);
    expect(
      psqlError(
        `set role address_decryptor; insert into public.decrypt_releases (opened_log_id, box_id, requester_id) values (${logId}, '${g.boxId}', '${OWNER_ID}');`,
      ),
    ).toMatch(/permission denied/);
    const owner = await signedInClient("fankkuk_admin");
    for (const client of [adminClient(), owner]) {
      expect((await client.from("decrypt_releases").insert({ opened_log_id: Number(logId), box_id: g.boxId, requester_id: OWNER_ID })).error).not.toBeNull();
      expect((await client.rpc("invoice_release_print", { p_log_id: Number(logId), p_requester: OWNER_ID })).error).not.toBeNull();
    }
    expect(releaseRows(g.boxId)).toEqual([]);
    expect(contextCount(g.qr)).toBe(1);
  });

  it("INV-P15 (실패경로 a)·INV-P7: 돌려줌 줄은 고치거나 지울 수 없다 — 표 주인도", async () => {
    const g = await inspectedGift();
    claim(g.qr);
    release(latestOpened(g.boxId));
    expect(psqlError(`update public.decrypt_releases set requester_id = '${STAFF_ID}' where box_id = '${g.boxId}'`)).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError(`delete from public.decrypt_releases where box_id = '${g.boxId}'`)).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError(`truncate public.decrypt_releases cascade`)).toMatch(/고치거나 지울 수 없다/);
    expect(releaseRows(g.boxId)).toHaveLength(1);
  });

  it("INV-P15 (실패경로): 거부 줄이나 없는 줄은 돌려줄 수 없다", async () => {
    const g = await inspectedGift();
    asDecryptor(
      `insert into public.decrypt_log (order_id, box_id, requester_id, result, deny_reason) values ('${g.orderId}', '${g.boxId}', '${OWNER_ID}', 'denied', 'not_owner');`,
    );
    const deniedId = psql(`select max(id) from public.decrypt_log where box_id = '${g.boxId}'`);
    expect(release(deniedId)).toEqual({ result: "denied", reason: "not_opened" });
    expect(release("999999999")).toEqual({ result: "denied", reason: "not_opened" });
    expect(releaseRows(g.boxId)).toEqual([]);
  });
});

describe("INV-P15 (b)~(e): 돌려주기의 조건은 상자를 잠근 자리에서 본다", () => {
  it("INV-P15 (S15c, 실패경로 b): 이미 돌려준 연 줄은 다시 돌려줄 수 없다 — 횟수 그대로", async () => {
    const g = await inspectedGift();
    claim(g.qr);
    const logId = latestOpened(g.boxId);
    expect(release(logId)).toEqual({ result: "released" });
    expect(release(logId)).toEqual({ result: "denied", reason: "already_released" });
    expect(releaseRows(g.boxId)).toHaveLength(1);
    expect(contextCount(g.qr)).toBe(0);
  });

  it("INV-P15 (S15d, 실패경로 c): 가장 최근 연 줄이 아니면 돌려줄 수 없다", async () => {
    const g = await inspectedGift();
    claim(g.qr);
    const older = latestOpened(g.boxId);
    claim(g.qr);
    expect(release(older)).toEqual({ result: "denied", reason: "not_latest" });
    expect(releaseRows(g.boxId)).toEqual([]);
    expect(contextCount(g.qr)).toBe(2);
  });

  it("INV-P15 (S15d, 실패경로 c): 그 줄을 연 요청자가 아니면 돌려줄 수 없다", async () => {
    const g = await inspectedGift();
    claim(g.qr);
    expect(release(latestOpened(g.boxId), STAFF_ID)).toEqual({ result: "denied", reason: "not_requester" });
    expect(releaseRows(g.boxId)).toEqual([]);
    expect(contextCount(g.qr)).toBe(1);
  });

  it("INV-P15 (S15e, 실패경로 d): 송장 출력 단계 상자의 재출력 줄은 돌려줄 수 없다", async () => {
    const g = await inspectedGift();
    const decryptor = createInvoiceDecryptor(env(), () => decryptFileText(keys), waybill);
    expect((await decryptor({ qr: g.qr, accessToken: await tokenOf("fankkuk_admin") })).kind).toBe("printed");
    expect(parcelState(g.qr)).toBe("label_printed");
    claim(g.qr);
    expect(release(latestOpened(g.boxId))).toEqual({ result: "denied", reason: "not_inspected" });
    expect(releaseRows(g.boxId)).toEqual([]);
    expect(contextCount(g.qr)).toBe(2);
  });

  it("INV-P15 (S15f, 실패경로 e): 한 상자에서 두 번 돌려준 뒤 세 번째는 거부 — 그 시도는 횟수에 남는다", async () => {
    const g = await inspectedGift();
    for (let i = 0; i < 2; i++) {
      claim(g.qr);
      expect(release(latestOpened(g.boxId))).toEqual({ result: "released" });
    }
    claim(g.qr);
    expect(release(latestOpened(g.boxId))).toEqual({ result: "denied", reason: "release_limit_reached" });
    expect(releaseRows(g.boxId)).toHaveLength(2);
    expect(contextCount(g.qr)).toBe(1);
  });
});
