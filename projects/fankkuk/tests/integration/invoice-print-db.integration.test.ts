import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createInvoiceDecryptor, type InvoiceDecryptor } from "@/features/invoice-print/api/invoice-decryptor";
import { scanOutbound } from "@/features/office-outbound/model/scan-outbound";
import { adminClient, deleteTestOrders, holdRowLock, psql, psqlError, signedInClient } from "./helpers";
import {
  decryptFileText,
  ADDRESS_CREATOR_ID,
  ADDRESS_CREATOR_LOGIN,
  LABEL,
  logRows,
  MOMO_CREATOR_ID,
  OWNER_ID,
  putTestEnvelope,
  sealTestAddress,
  STAFF_ID,
  testKeyPair,
  type TestKeys,
} from "./invoice-helpers";
import { approve, deleteTestUnmatched, FAN_PASS, fanSetsWaybill, inspect, orderStatus, paidGift, parcelState, receiveAndLabel, waybill, type Unit } from "./office-helpers";
import { createTestCreator, removeTestCreator } from "./test-creator";

// 송장 출력 = 크리에이터 주소 열기 (address-protection INV-P4·P5·P7·P8·P12·P14, approval-signature INV-S11·S12, office-workflow INV-W3).
// 송장 출력 함수를 실제 DB(복호화 전용 역할 토큰)·실제 로그인 검증·실제 봉투로 돌린다. 키 쌍은 시험이 만든다.

let keys: TestKeys;
let decryptor: InvoiceDecryptor;

const env = () => ({ NODE_ENV: "development", SUPABASE_URL: process.env.FK_TEST_API_URL, SUPABASE_ANON_KEY: process.env.FK_TEST_ANON_KEY });

beforeAll(async () => {
  keys = await testKeyPair();
  deleteTestOrders();
  removeTestCreator();
  createTestCreator();
  putTestEnvelope(await sealTestAddress(keys, ADDRESS_CREATOR_ID));
  decryptor = createInvoiceDecryptor(env(), () => decryptFileText(keys), waybill);
});

afterEach(async () => {
  deleteTestOrders();
  deleteTestUnmatched();
  putTestEnvelope(await sealTestAddress(keys, ADDRESS_CREATOR_ID));
});

afterAll(() => {
  deleteTestOrders();
  removeTestCreator();
});

async function tokenOf(loginId: string): Promise<string> {
  const client = await signedInClient(loginId);
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("토큰 없음");
  return token;
}

/** 결제·(승인)·입고·부착·검수까지 끝난 시험 크리에이터 선물 상자 하나. */
async function inspectedGift(opts: { approved?: boolean } = {}): Promise<Unit & { qr: string }> {
  const g = await paidGift(1, ADDRESS_CREATOR_ID);
  if (opts.approved !== false) await approve(g);
  const no = waybill();
  await fanSetsWaybill(g.boxIds[0]!, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
  return { ...g, qr };
}

const print = async (qr: string, login = "fankkuk_admin") => decryptor({ qr, accessToken: await tokenOf(login) });
// 앱 판정을 건너뛰고 주소를 내주는 DB 함수를 바로 부른다 — 같은 조건이 앱과 DB 두 겹이라 앱 경로만 보면 DB 쪽 조건이 빠져도 통과한다
const claimDirect = (qr: string): unknown => {
  const reply = psql(`set role address_decryptor; select public.invoice_claim_print('${qr}', '${OWNER_ID}')::text;`);
  // psql 은 「SET」 줄 뒤에 결과를 찍는다 — 마지막 줄이 함수 결과다
  return JSON.parse(reply.split(/\r?\n/).pop() ?? "");
};

describe("INV-P4·S12: 조건이 모두 맞으면 대표의 송장 출력이 크리에이터의 주소를 연다", () => {
  it("INV-P4·INV-S12·S12 (S1 흐름): 봉인한 주소가 라벨 칸으로 열리고, 상자는 송장 출력 단계로, 열람 기록 1줄", async () => {
    const g = await inspectedGift();
    const res = await print(g.qr);
    expect(res).toMatchObject({ kind: "printed", reprint: false, label: LABEL });
    if (res.kind !== "printed") throw new Error("열리지 않음");
    expect(parcelState(g.qr)).toBe("label_printed");
    expect(psql(`select outbound_waybill_no from public.office_parcels where qr_code = '${g.qr}'`)).toBe(res.waybill);
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`]);
  });

  it("INV-P10: 열람 기록 줄에는 주소·암호문이 없다", async () => {
    const g = await inspectedGift();
    await print(g.qr);
    const row = psql(`select row_to_json(l)::text from public.decrypt_log l where order_id = '${g.orderId}'`);
    for (const leak of [LABEL.address1, LABEL.recipientName, LABEL.phone, "wrappedKey", "ciphertext"]) expect(row).not.toContain(leak);
  });
});

describe("INV-P4 (a)(b): 승인 서명을 직접 다시 본다", () => {
  it("INV-P4 (S4, 실패경로 a): 승인 없는 주문은 거부 — 거부 줄 1, 상자 그대로", async () => {
    const g = await inspectedGift({ approved: false });
    expect(await print(g.qr)).toEqual({ kind: "denied", reason: "no_valid_approval" });
    expect(logRows(g.orderId)).toEqual([`denied:no_valid_approval:${OWNER_ID}`]);
    expect(parcelState(g.qr)).toBe("inspected");
  });

  it("INV-P4 (실패경로 a)·INV-S12: DB 에 승인 표시가 있어도 저장된 서명이 없으면 열지 않는다", async () => {
    const g = await inspectedGift();
    psql(
      `begin; set local session_replication_role = replica; delete from public.approval_signatures where request_id = '${g.requestId}'; commit;`,
    );
    expect(psql(`select approved_at is not null from public.orders where id = '${g.orderId}'`)).toBe("t");
    expect(await print(g.qr)).toEqual({ kind: "denied", reason: "no_valid_approval" });
    expect(logRows(g.orderId)).toEqual([`denied:no_valid_approval:${OWNER_ID}`]);
  });

  it("INV-P4 (실패경로 a)·INV-S11: 서명자가 그 크리에이터의 가짜 식별값이 아니면 열지 않는다", async () => {
    const g = await inspectedGift();
    psql(
      `begin; set local session_replication_role = replica; update public.approval_signatures set signer_id = 'fake:${STAFF_ID}' where request_id = '${g.requestId}'; commit;`,
    );
    expect(await print(g.qr)).toEqual({ kind: "denied", reason: "no_valid_approval" });
  });

  it("INV-P4 (S4b, 실패경로 b): 주문 A 의 승인 원문·서명을 주문 B 에 옮겨 붙이면 거부", async () => {
    const a = await inspectedGift();
    const b = await inspectedGift();
    const payloadA = psql(`select payload from public.approval_requests where request_id = '${a.requestId}'`);
    const lit = `'${payloadA.replace(/'/g, "''")}'`;
    psql(
      `begin; set local session_replication_role = replica; update public.approval_requests set payload = ${lit} where request_id = '${b.requestId}'; update public.approval_signatures set signed_content = ${lit} where request_id = '${b.requestId}'; commit;`,
    );
    expect(await print(b.qr)).toEqual({ kind: "denied", reason: "order_mismatch" });
    expect(logRows(b.orderId)).toEqual([`denied:order_mismatch:${OWNER_ID}`]);
    expect(parcelState(b.qr)).toBe("inspected");
  });
});

describe("INV-P4 (a)·S12: 서명 재검증 재료는 저장된 서명에서 온다", () => {
  it("INV-P4 (실패경로 a)·INV-S12: 저장된 승인 원문만 다른 주문 것으로 바꾸면(서명은 그대로) 서명 불일치로 거부 — 주문번호 판정까지 가지 않는다", async () => {
    const a = await inspectedGift();
    const b = await inspectedGift();
    const payloadA = psql(`select payload from public.approval_requests where request_id = '${a.requestId}'`);
    psql(
      `begin; set local session_replication_role = replica; update public.approval_requests set payload = '${payloadA.replace(/'/g, "''")}' where request_id = '${b.requestId}'; commit;`,
    );
    expect(await print(b.qr)).toEqual({ kind: "denied", reason: "no_valid_approval" });
    expect(logRows(b.orderId)).toEqual([`denied:no_valid_approval:${OWNER_ID}`]);
  });
});

describe("INV-M12·W3: 차액을 내지 않은 상자는 송장이 나오지 않는다", () => {
  const unpaidDifference = (g: Unit) =>
    psql(
      `insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status) values ('${g.orderId}', 'difference', '${g.boxIds[0]}', 'pay_test_diff_${g.orderNo.slice(4).toLowerCase()}', 2000, 0, 500, 0, 1500, 'pending')`,
    );

  it("INV-M12 (실패경로): 출력 함수가 판정 재료에서 미납 차액을 보고 거부한다", async () => {
    const g = await inspectedGift();
    unpaidDifference(g);
    // 판정 재료가 미납을 알려야 한다 — 뒤의 DB 재확인이 같은 거부를 만들어 결과만으로는 이 칸이 비어도 구분되지 않는다
    expect(psql(`set role address_decryptor; select public.invoice_print_context('${g.qr}') ->> 'difference_unpaid';`).split(/\r?\n/).pop()).toBe("true");
    expect(await print(g.qr)).toEqual({ kind: "denied", reason: "difference_unpaid" });
    expect(logRows(g.orderId)).toEqual([`denied:difference_unpaid:${OWNER_ID}`]);
    expect(parcelState(g.qr)).toBe("inspected");
  });

  it("INV-M12 (실패경로): 주소를 내주는 DB 함수도 잠근 자리에서 미납 차액을 다시 보고 거부한다(앱 판정을 건너뛴 호출)", async () => {
    const g = await inspectedGift();
    unpaidDifference(g);
    const reply = psql(`set role address_decryptor; select public.invoice_claim_print('${g.qr}', '${OWNER_ID}')::text;`);
    // psql 은 「SET」 줄 뒤에 결과를 찍는다 — 마지막 줄이 함수 결과다
    expect(JSON.parse(reply.split(/\r?\n/).pop() ?? "")).toEqual({ result: "denied", reason: "difference_unpaid" });
    expect(logRows(g.orderId)).toEqual([`denied:difference_unpaid:${OWNER_ID}`]);
  });
});

describe("INV-P8: 대표만 — 판단은 송장 출력 함수 설정의 대표 ID", () => {
  it("INV-P7 (S7c, 실패경로): 직원이 출고 화면에서 송장 출력을 누르면 403·라벨 없음, 기록 표(운영자 내부 기록)에 「대표 아님」 거부 줄 1줄", async () => {
    const g = await inspectedGift();
    const staff = await signedInClient("fankkuk_staff");
    const token = await tokenOf("fankkuk_staff");
    const reply = await scanOutbound(
      { client: staff, newWaybill: waybill, printLabel: (qr) => decryptor({ qr, accessToken: token }) },
      { kind: "print_label", qr: g.qr },
    );
    expect(reply).toEqual({ status: 403, body: { message: "송장 출력은 대표만 할 수 있어요." } });
    expect(logRows(g.orderId)).toEqual([`denied:not_owner:${STAFF_ID}`]);
    expect(parcelState(g.qr)).toBe("inspected");
  });

  it("INV-P8 (S8, 실패경로)·INV-P7: 직원 계정이면 거부, 기록 줄의 요청자는 그 직원", async () => {
    const g = await inspectedGift();
    expect(await print(g.qr, "fankkuk_staff")).toEqual({ kind: "denied", reason: "not_owner" });
    expect(logRows(g.orderId)).toEqual([`denied:not_owner:${STAFF_ID}`]);
    expect(parcelState(g.qr)).toBe("inspected");
  });

  it("INV-P8 (S8b, 실패경로): DB 의 대표 설정을 직원으로 바꿔 둬도 송장 출력 함수 설정의 대표가 아니면 거부", async () => {
    const g = await inspectedGift();
    psql(`update public.owner_setting set owner_user_id = '${STAFF_ID}'`);
    try {
      expect(await print(g.qr, "fankkuk_staff")).toEqual({ kind: "denied", reason: "not_owner" });
    } finally {
      psql(`update public.owner_setting set owner_user_id = '${OWNER_ID}'`);
    }
    expect(logRows(g.orderId)).toEqual([`denied:not_owner:${STAFF_ID}`]);
  });

  it("INV-P8 (실패경로): 로그인 토큰이 위조면 DB 를 부르지 않는다 — 기록 줄도 없다", async () => {
    const g = await inspectedGift();
    // 내용은 대표 ID 다 — 토큰 내용만 읽고 서명을 확인하지 않는 구현이면 여기서 열린다
    const body = Buffer.from(JSON.stringify({ sub: OWNER_ID, role: "authenticated" })).toString("base64url");
    expect(await decryptor({ qr: g.qr, accessToken: `eyJhbGciOiJIUzI1NiJ9.${body}.forged` })).toEqual({ kind: "unauthenticated" });
    expect(logRows(g.orderId)).toEqual([]);
  });
});

describe("INV-P5: 최대 3번, 출고 확정 뒤에는 열리지 않는다", () => {
  it("INV-P5 (S5·S5d): 재출력 두 번은 같은 송장번호·재출력 표시, 네 번째는 거부", async () => {
    const g = await inspectedGift();
    const first = await print(g.qr);
    const second = await print(g.qr);
    const third = await print(g.qr);
    if (first.kind !== "printed" || second.kind !== "printed" || third.kind !== "printed") throw new Error("열리지 않음");
    expect([first.reprint, second.reprint, third.reprint]).toEqual([false, true, true]);
    expect(new Set([first.waybill, second.waybill, third.waybill]).size).toBe(1);
    expect(await print(g.qr)).toEqual({ kind: "denied", reason: "decrypt_limit_reached" });
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`, `opened:2:${OWNER_ID}`, `opened:3:${OWNER_ID}`, `denied:decrypt_limit_reached:${OWNER_ID}`]);
  });

  it("INV-P5 (S5c·S5h): 1회 출력 후 출고 확정해도 남은 2회는 재출력된다 — 처음 송장번호 그대로, 상자는 출고 확정 그대로, 4번째는 거부", async () => {
    const g = await inspectedGift();
    const first = await print(g.qr);
    if (first.kind !== "printed") throw new Error("열리지 않음");
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("office_confirm_shipment", { p_qr: g.qr, p_waybill: first.waybill })).error).toBeNull();
    expect(orderStatus(g.orderId)).toBe("shipped");
    expect(await print(g.qr)).toMatchObject({ kind: "printed", reprint: true, waybill: first.waybill });
    expect(await print(g.qr)).toMatchObject({ kind: "printed", reprint: true, waybill: first.waybill });
    expect(parcelState(g.qr)).toBe("shipped");
    expect(orderStatus(g.orderId)).toBe("shipped");
    expect(await print(g.qr)).toEqual({ kind: "denied", reason: "decrypt_limit_reached" });
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`, `opened:2:${OWNER_ID}`, `opened:3:${OWNER_ID}`, `denied:decrypt_limit_reached:${OWNER_ID}`]);
  });

  it("INV-P5 (S5b, 동시): 상한 직전에 출력 요청 두 개가 겹쳐도 열리는 것은 하나, 나머지는 잠근 자리에서 거부", async () => {
    const g = await inspectedGift();
    await print(g.qr);
    await print(g.qr);
    const [ownerToken1, ownerToken2] = [await tokenOf("fankkuk_admin"), await tokenOf("fankkuk_admin")];
    const lock = await holdRowLock(`select 1 from public.orders where id = '${g.orderId}' for update`, 2);
    const results = await Promise.all([decryptor({ qr: g.qr, accessToken: ownerToken1 }), decryptor({ qr: g.qr, accessToken: ownerToken2 })]);
    await lock.released;
    expect(results.filter((r) => r.kind === "printed")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "denied" && r.reason === "decrypt_limit_reached")).toHaveLength(1);
    expect(psql(`select count(*) from public.decrypt_log where order_id = '${g.orderId}' and result = 'opened'`)).toBe("3");
  });
});

describe("INV-P5: 횟수는 상자마다 따로 센다 (카드 d30)", () => {
  /** 결제·승인 뒤 상자 boxCount 개를 모두 입고·부착·검수까지. 상자마다 QR 을 돌려준다. */
  async function inspectedBoxes(boxCount: number): Promise<Unit & { qrs: string[] }> {
    const g = await paidGift(boxCount, ADDRESS_CREATOR_ID);
    await approve(g);
    const staff = await signedInClient("fankkuk_staff");
    const qrs: string[] = [];
    for (const boxId of g.boxIds) {
      const no = waybill();
      await fanSetsWaybill(boxId, no);
      const qr = await receiveAndLabel(staff, no);
      expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
      qrs.push(qr);
    }
    return { ...g, qrs };
  }

  /** 기록 줄을 「상자 순번:결과:출력 번호 또는 거부 사유」로. 상자 칸이 빈 줄은 이어 붙지 않아 빠진다 — 빠지면 단언이 깨진다. */
  const boxLogRows = (orderId: string) =>
    psql(
      `select string_agg(b.seq || ':' || l.result || ':' || coalesce(l.print_no::text, l.deny_reason), ',' order by l.id) from public.decrypt_log l join public.boxes b on b.id = l.box_id where l.order_id = '${orderId}'`,
    );

  it("INV-P5 (S5e): 상자 4개 주문은 네 상자 모두 송장이 나온다", async () => {
    const g = await inspectedBoxes(4);
    const results = [];
    for (const qr of g.qrs) results.push(await print(qr));
    expect(results.map((r) => r.kind)).toEqual(["printed", "printed", "printed", "printed"]);
    expect(results.map((r) => (r.kind === "printed" ? r.reprint : null))).toEqual([false, false, false, false]);
    expect(g.qrs.map((qr) => parcelState(qr))).toEqual(["label_printed", "label_printed", "label_printed", "label_printed"]);
    expect(logRows(g.orderId)).toEqual([1, 1, 1, 1].map((n) => `opened:${n}:${OWNER_ID}`));
  });

  it("INV-P5 (S5f, 실패경로): 한 상자가 3번을 다 써도 그 상자만 막히고 옆 상자는 열린다", async () => {
    const g = await inspectedBoxes(2);
    const [a, b] = g.qrs as [string, string];
    for (let i = 0; i < 3; i++) expect((await print(a)).kind).toBe("printed");
    expect(await print(a)).toEqual({ kind: "denied", reason: "decrypt_limit_reached" });
    expect(await print(b)).toMatchObject({ kind: "printed", reprint: false });
    // 기록 줄마다 어느 상자의 몇 번째인지 남는다
    expect(boxLogRows(g.orderId)).toBe("1:opened:1,1:opened:2,1:opened:3,1:denied:decrypt_limit_reached,2:opened:1");
  });

  it("INV-P5 (S5g): 먼저 출고한 상자는 재출력(2번째)이고, 아직 안 나간 옆 상자는 첫 출력으로 열린다", async () => {
    const g = await inspectedBoxes(2);
    const [a, b] = g.qrs as [string, string];
    const first = await print(a);
    if (first.kind !== "printed") throw new Error("열리지 않음");
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("office_confirm_shipment", { p_qr: a, p_waybill: first.waybill })).error).toBeNull();
    expect(await print(a)).toMatchObject({ kind: "printed", reprint: true, waybill: first.waybill });
    expect(await print(b)).toMatchObject({ kind: "printed", reprint: false });
    expect(boxLogRows(g.orderId)).toBe("1:opened:1,1:opened:2,2:opened:1");
  });

  it("INV-P5 (실패경로): 어느 상자인지 없는 「연 줄」은 DB 가 받지 않는다 — 그런 줄은 어느 상자의 횟수에도 안 잡힌다", async () => {
    const g = await paidGift(1, ADDRESS_CREATOR_ID);
    // 복호화 전용 역할은 연 줄을 직접 넣지 못한다(INV-P15 (a)) — 표 주인으로 넣어 조건 자체를 본다
    expect(
      psqlError(
        `insert into public.decrypt_log (order_id, requester_id, result, print_no) values ('${g.orderId}', '${OWNER_ID}', 'opened', 1);`,
      ),
    ).toMatch(/decrypt_log_opened_has_box/);
    expect(logRows(g.orderId)).toEqual([]);
  });
});

describe("INV-P4 (c): 검수 완료 ~ 출고 전에만", () => {
  it("INV-P4 (S4c, 실패경로 c): 승인됐지만 검수 전인 상자는 거부", async () => {
    const g = await paidGift(1, ADDRESS_CREATOR_ID);
    await approve(g);
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0]!, no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    expect(await print(qr)).toEqual({ kind: "denied", reason: "order_not_printable" });
    expect(logRows(g.orderId)).toEqual([`denied:order_not_printable:${OWNER_ID}`]);
    expect(parcelState(qr)).toBe("labeled");
  });

  it("INV-P4 (c)·INV-P5 (실패경로): 연 줄이 0개인 출고 확정 상자는 첫 출력이 없다 — 거부, 상자는 출고 확정 그대로", async () => {
    const g = await inspectedGift();
    // 출력 없이 출고 확정에 이르는 길은 화면에 없다 — DB 상태를 직접 만들어 함수의 조건만 본다(주문은 출고 단계)
    psql(`update public.office_parcels set state = 'shipped', outbound_waybill_no = '${waybill()}', shipped_at = now() where qr_code = '${g.qr}'`);
    psql(`update public.orders set status = 'shipped' where id = '${g.orderId}'`);
    expect(await print(g.qr)).toEqual({ kind: "denied", reason: "order_not_printable" });
    expect(logRows(g.orderId)).toEqual([`denied:order_not_printable:${OWNER_ID}`]);
    expect(parcelState(g.qr)).toBe("shipped");
    // DB 함수도 스스로 거부한다(앱 판정을 건너뛴 호출)
    expect(claimDirect(g.qr)).toEqual({ result: "denied", reason: "order_not_printable" });
    expect(parcelState(g.qr)).toBe("shipped");
  });

  it("INV-P4 (c) (실패경로): 거절된 주문은 거부 — 검수 완료 상자도, 한 번 열고 출고 확정된 상자의 재출력도", async () => {
    const a = await inspectedGift();
    psql(`update public.orders set status = 'rejected' where id = '${a.orderId}'`);
    expect(await print(a.qr)).toEqual({ kind: "denied", reason: "order_not_printable" });
    expect(logRows(a.orderId)).toEqual([`denied:order_not_printable:${OWNER_ID}`]);
    expect(parcelState(a.qr)).toBe("inspected");

    const b = await inspectedGift();
    const first = await print(b.qr);
    if (first.kind !== "printed") throw new Error("열리지 않음");
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("office_confirm_shipment", { p_qr: b.qr, p_waybill: first.waybill })).error).toBeNull();
    psql(`update public.orders set status = 'rejected' where id = '${b.orderId}'`);
    expect(await print(b.qr)).toEqual({ kind: "denied", reason: "order_not_printable" });
    expect(logRows(b.orderId)).toEqual([`opened:1:${OWNER_ID}`, `denied:order_not_printable:${OWNER_ID}`]);
    expect(parcelState(b.qr)).toBe("shipped");
    // DB 함수도 스스로 거부한다(앱 판정을 건너뛴 호출) — 검수 완료 상자, 출고 확정 상자의 재출력 둘 다
    expect(claimDirect(a.qr)).toEqual({ result: "denied", reason: "order_not_printable" });
    expect(claimDirect(b.qr)).toEqual({ result: "denied", reason: "order_not_printable" });
  });
});

describe("INV-P14: 봉인 속 크리에이터가 주소 칸의 크리에이터와 다르면 쓰지 않는다", () => {
  it("INV-P14 (S14, 실패경로): 모모의 봉인을 시험 크리에이터 칸에 옮겨 붙이면 라벨을 주지 않고, 상자는 그대로, 거부 줄이 남는다", async () => {
    putTestEnvelope(await sealTestAddress(keys, MOMO_CREATOR_ID));
    const g = await inspectedGift();
    const res = await print(g.qr);
    expect(res).toEqual({ kind: "denied", reason: "address_mismatch" });
    expect(parcelState(g.qr)).toBe("inspected");
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`, `denied:address_mismatch:${OWNER_ID}`]);
  });

  it("INV-P14·INV-P15 S15g (D12 반영): 주소 주인이 달라 송장이 안 나온 줄은 「출력 실패」 — 돌려받아 횟수가 되돌고, 다음 송장이 첫 출력, 이번 달 재출력은 늘지 않는다", async () => {
    const creator = await signedInClient(ADDRESS_CREATOR_LOGIN);
    const summary = async () => {
      const { data, error } = await creator.rpc("my_access_month_summary");
      expect(error).toBeNull();
      return (data as { reprint_count: number; opened_count: number }[])[0];
    };
    const before = await summary();
    putTestEnvelope(await sealTestAddress(keys, MOMO_CREATOR_ID));
    const g = await inspectedGift();
    expect(await print(g.qr)).toEqual({ kind: "denied", reason: "address_mismatch" });
    // 기존 출력 실패와 같은 장치 — 그 연 줄에 돌려줌 줄 하나
    expect(psql(`select count(*) from public.decrypt_releases r join public.decrypt_log l on l.id = r.opened_log_id where l.order_id = '${g.orderId}'`)).toBe("1");

    // 시험 준비: 바른 봉인으로 되돌린 뒤 다시 출력
    putTestEnvelope(await sealTestAddress(keys, ADDRESS_CREATOR_ID));
    const r = await print(g.qr);
    expect(r.kind).toBe("printed");
    if (r.kind === "printed") expect(r.reprint).toBe(false);
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`, `denied:address_mismatch:${OWNER_ID}`, `opened:1:${OWNER_ID}`]);

    const { data } = await creator.rpc("my_access_log");
    const mine = (data as { order_no: string; print_no: number; released: boolean }[]).filter((x) => x.order_no === g.orderNo);
    // 최신 줄부터: 실제 첫 송장(첫 출력) · 주소 주인 불일치 줄(출력 실패)
    expect(mine.map((x) => ({ print_no: x.print_no, released: x.released }))).toEqual([
      { print_no: 1, released: false },
      { print_no: 1, released: true },
    ]);
    const after = await summary();
    expect(after?.opened_count).toBe((before?.opened_count ?? 0) + 2);
    expect(after?.reprint_count).toBe(before?.reprint_count);
  });
});

describe("INV-P7: 기록은 송장 출력 함수만 쓴다 — 성공·거부 한 줄씩", () => {
  it("INV-P7 (S7): 거부 1번(직원)·성공 1번(대표) → 두 줄, 크리에이터 열람 기록에는 연 줄만, 운영자 내부 기록에는 둘 다(D12)", async () => {
    const g = await inspectedGift();
    await print(g.qr, "fankkuk_staff");
    await print(g.qr);
    expect(logRows(g.orderId)).toEqual([`denied:not_owner:${STAFF_ID}`, `opened:1:${OWNER_ID}`]);
    const creator = await signedInClient(ADDRESS_CREATOR_LOGIN);
    const { data } = await creator.rpc("my_access_log");
    const mine = (data as { order_no: string; print_no: number }[]).filter((r) => r.order_no === g.orderNo);
    expect(mine.map((r) => r.print_no)).toEqual([1]);
    const owner = await signedInClient("fankkuk_admin");
    const internal = await owner.rpc("admin_access_log");
    expect(internal.error).toBeNull();
    const rows = (internal.data as { order_no: string; result: string; deny_reason: string | null; requester: string }[]).filter((r) => r.order_no === g.orderNo);
    expect(rows.map((r) => `${r.result}:${r.deny_reason ?? "-"}:${r.requester}`)).toEqual(["opened:-:owner", "denied:not_owner:other"]);
  });

  it("INV-P7 (S7b, 실패경로): 앱 서버 키·대표 로그인으로는 출력 함수를 부를 수도, 기록을 넣을 수도 없다", async () => {
    const g = await inspectedGift();
    const owner = await signedInClient("fankkuk_admin");
    for (const client of [adminClient(), owner]) {
      expect((await client.rpc("invoice_print_context", { p_qr: g.qr })).error).not.toBeNull();
      expect((await client.rpc("invoice_claim_print", { p_qr: g.qr, p_requester: OWNER_ID })).error).not.toBeNull();
      expect((await client.rpc("invoice_finish_print", { p_qr: g.qr, p_waybill: waybill() })).error).not.toBeNull();
      expect((await client.from("decrypt_log").insert({ order_id: g.orderId, requester_id: OWNER_ID, result: "denied", deny_reason: "not_owner" })).error).not.toBeNull();
    }
    expect(logRows(g.orderId)).toEqual([]);
    expect(parcelState(g.qr)).toBe("inspected");
  });
});

describe("INV-P12: 개발용 키는 운영에서 만드는 순간 실패한다", () => {
  it("INV-P12 (S12b, 실패경로): 운영 표시가 있으면 송장 출력 함수를 만들지 못하고 키 파일을 읽지 않는다", () => {
    const read = vi.fn(() => decryptFileText(keys));
    expect(() => createInvoiceDecryptor({ ...env(), NODE_ENV: "production" }, read, waybill)).toThrow(/운영/);
    expect(() => createInvoiceDecryptor({ ...env(), VERCEL_ENV: "production" }, read, waybill)).toThrow(/운영/);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("주소가 없는 크리에이터", () => {
  it("주소 칸이 비어 있으면 열 것이 없다고 답하고, 횟수를 쓰지 않고, 상자는 그대로", async () => {
    psql(`delete from pii.creator_addresses where creator_id = '${ADDRESS_CREATOR_ID}'`);
    const g = await inspectedGift();
    expect(await print(g.qr)).toEqual({ kind: "no_address" });
    expect(logRows(g.orderId)).toEqual([]);
    expect(parcelState(g.qr)).toBe("inspected");
  });
});
