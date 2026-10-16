import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fanAddressPlaintext } from "@/entities/address/model/fan-address-plaintext";
import { sealedAddressPlaintext } from "@/entities/revgift/model/sealed-address";
import { createInvoiceDecryptor, type InvoiceDecryptor } from "@/features/invoice-print/api/invoice-decryptor";
import { sealEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";
import { adminClient, deleteTestOrders, holdRowLock, psql, psqlError, signedInClient } from "./helpers";
import { decryptFileText, LABEL, OWNER_ID, STAFF_ID, testKeyPair, type TestKeys } from "./invoice-helpers";
import { creatorSetsWaybill, deleteTestUnmatched, fanSetsWaybill, inspect, paidGift, paidShare, parcelState, receiveAndLabel, SHARE_PASS, waybill } from "./office-helpers";
import { acceptWithAddress, deleteTestRevgifts, PROFILE } from "./revgift-helpers";

// 역조공 송장 출력 = 팬 주소 열기 (reverse-gift INV-R7) · 송장이 안 나온 출력 돌려주기 (INV-R13).
// - 송장 출력 함수(앱의 InvoiceDecryptor)가 몫 상자면 역조공 갈래로 간다: 판정 → DB 가 잠근 자리에서 횟수 올리고 봉투 내줌
//   → 봉투 열기 → 봉인 속 주문번호 대조 → 송장 마무리. 송장이 안 나오면 「연 줄」을 돌려받는다.
// - 「연 줄」·거부 줄은 몫 전용 열람 기록(revgift_decrypt_log), 돌려줌은 따로 둔 표(revgift_decrypt_releases)에 남는다.
// 봉투를 내주는 함수(revgift_claim_print)는 pii 를 읽어 사람이 적용한다(manual/0014). 적용 전에는 이 파일 대부분이 빨간불이 맞다.
// 시드 주문·계정은 바꾸지 않는다 — 시험마다 새 보내기(RG-T…)를 만들고 끝나면 지운다.

let keys: TestKeys;
let otherKeys: TestKeys;
let decryptor: InvoiceDecryptor;

const env = () => ({ NODE_ENV: "development", SUPABASE_URL: process.env.FK_TEST_API_URL, SUPABASE_PUBLISHABLE_KEY: process.env.FK_TEST_ANON_KEY });

beforeAll(async () => {
  keys = await testKeyPair();
  otherKeys = await testKeyPair();
  deleteTestRevgifts();
  deleteTestOrders();
  decryptor = createInvoiceDecryptor(env(), () => decryptFileText(keys), waybill);
});

afterEach(() => {
  deleteTestRevgifts();
  deleteTestOrders();
  deleteTestUnmatched();
});

afterAll(() => {
  deleteTestRevgifts();
  deleteTestOrders();
});

async function tokenOf(loginId: string): Promise<string> {
  const client = await signedInClient(loginId);
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("토큰 없음");
  return token;
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** 2026-10-17 부터의 봉인 — 팬 받을 주소. 계정 식별값이 묶인다(reverse-gift INV-R5). */
function sealForAccount(accountId: string = PROFILE.byeolbit, with_: TestKeys = keys): Promise<Envelope> {
  return sealEnvelope(fanAddressPlaintext({ accountId, ...LABEL }), with_.publicKey);
}

/** 2026-10-17 전 봉인 — 받기 때 입력해 주문번호가 묶인 옛 몫. 이 꼴도 계속 열린다(INV-R7 b). */
function sealFor(orderNo: string, with_: TestKeys = keys): Promise<Envelope> {
  return sealEnvelope(sealedAddressPlaintext({ orderNo, ...LABEL }), with_.publicKey);
}

type Share = { orderNo: string; shareId: string; qr: string };

/** 하루 → 별빛 몫 하나: 결제 → 별빛이 받을 주소 등록 + 받기(등록 주소가 몫에 복사됨) → 원 송장번호 → 입고·부착 → 검수 완료. */
async function inspectedShare(envelope?: () => Promise<Envelope>): Promise<Share> {
  const s = await paidShare();
  const fan = await signedInClient("byeolbit_fan");
  const sealed = await (envelope ?? (() => sealForAccount()))();
  const accepted = await acceptWithAddress(fan, s.orderNo, sealed);
  if (accepted.error) throw new Error(`accept_revgift 실패: ${accepted.error.message}`);
  const no = waybill();
  await creatorSetsWaybill(s.shareId, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  expect(await inspect(staff, qr, SHARE_PASS)).toBe("inspected");
  return { orderNo: s.orderNo, shareId: s.shareId, qr };
}

/** 복호화 전용 역할로 SQL 한 문장을 돌리고 마지막 줄(결과)을 돌려준다 — psql 은 「SET」 줄을 먼저 찍는다. */
function asDecryptor(sql: string): string {
  return psql(`set role address_decryptor; ${sql}`).split(/\r?\n/).pop() ?? "";
}

function claim(qr: string, requester = OWNER_ID): Record<string, unknown> {
  return JSON.parse(asDecryptor(`select public.revgift_claim_print('${qr}', '${requester}')::text;`)) as Record<string, unknown>;
}

function release(logId: string, requester = OWNER_ID): Record<string, unknown> {
  return JSON.parse(asDecryptor(`select public.revgift_release_print(${logId}, '${requester}')::text;`)) as Record<string, unknown>;
}

function logRows(shareId: string): string[] {
  const out = psql(
    `select result || ':' || coalesce(print_no::text, deny_reason) || ':' || requester_id from public.revgift_decrypt_log where share_id = '${shareId}' order by id`,
  );
  return out === "" ? [] : out.split("\n");
}

function latestOpened(shareId: string): string {
  return psql(`select max(id) from public.revgift_decrypt_log where share_id = '${shareId}' and result = 'opened'`);
}

/** 판정 재료가 내주는 그 몫의 횟수 = 연 줄 − 돌려준 줄. */
function contextCount(qr: string): number {
  return Number(asDecryptor(`select public.revgift_print_context('${qr}') ->> 'decrypt_count';`));
}

async function print(qr: string, loginId = "fankkuk_admin") {
  return decryptor({ qr, accessToken: await tokenOf(loginId) });
}

describe("INV-R7: 역조공 몫의 주소는 조건이 모두 참일 때만 열린다", () => {
  it("INV-R7 S7: 받기·검수가 끝난 몫을 대표가 출력하면 라벨 다섯 칸과 송장번호만 오고, 「연 줄」 하나가 남는다", async () => {
    const s = await inspectedShare();
    const r = await print(s.qr);
    expect(r.kind).toBe("printed");
    if (r.kind !== "printed") return;
    expect(r.reprint).toBe(false);
    expect(r.label).toEqual(LABEL);
    expect(Object.keys(r).sort()).toEqual(["kind", "label", "reprint", "waybill"]);
    expect(logRows(s.shareId)).toEqual([`opened:1:${OWNER_ID}`]);
    expect(parcelState(s.qr)).toBe("label_printed");
  });

  it("INV-R7: 다시 출력하면 같은 송장번호로 재출력이고, 세 번까지 열린 뒤에는 거부 줄이 남는다", async () => {
    const s = await inspectedShare();
    const first = await print(s.qr);
    const second = await print(s.qr);
    const third = await print(s.qr);
    expect([first.kind, second.kind, third.kind]).toEqual(["printed", "printed", "printed"]);
    if (first.kind !== "printed" || second.kind !== "printed") return;
    expect(second.reprint).toBe(true);
    expect(second.waybill).toBe(first.waybill);
    expect(await print(s.qr)).toEqual({ kind: "denied", reason: "decrypt_limit_reached" });
    expect(logRows(s.shareId)).toEqual([
      `opened:1:${OWNER_ID}`,
      `opened:2:${OWNER_ID}`,
      `opened:3:${OWNER_ID}`,
      `denied:decrypt_limit_reached:${OWNER_ID}`,
    ]);
  });

  it("INV-R7 S7e (실패경로): 직원 계정이면 열지 않고 거부 줄이 남는다", async () => {
    const s = await inspectedShare();
    expect(await print(s.qr, "fankkuk_staff")).toEqual({ kind: "denied", reason: "not_owner" });
    expect(logRows(s.shareId)).toEqual([`denied:not_owner:${STAFF_ID}`]);
    expect(parcelState(s.qr)).toBe("inspected");
  });

  it("INV-R7 S7b (실패경로): 몫에 팬 주소 암호문이 없으면 거부 줄이 남고 열리지 않는다", async () => {
    const s = await inspectedShare();
    psql(`delete from pii.revgift_addresses where share_id = '${s.shareId}'`);
    expect(await print(s.qr)).toEqual({ kind: "denied", reason: "no_valid_approval" });
    expect(logRows(s.shareId)).toEqual([`denied:no_valid_approval:${OWNER_ID}`]);
    expect(parcelState(s.qr)).toBe("inspected");
  });

  it("INV-R7 S7d (실패경로): 반송·취소된 몫은 출력할 수 없다 — 판정이 거부하고 DB 도 다시 거부한다", async () => {
    const s = await inspectedShare();
    psql(`update public.revgift_shares set returned_at = now() where id = '${s.shareId}'`);
    expect(await print(s.qr)).toEqual({ kind: "denied", reason: "order_not_printable" });
    // 앱 판정을 건너뛰고 DB 를 직접 불러도 같은 거부
    expect(claim(s.qr)).toEqual({ result: "denied", reason: "order_not_printable" });
    expect(logRows(s.shareId)).toEqual([`denied:order_not_printable:${OWNER_ID}`, `denied:order_not_printable:${OWNER_ID}`]);
  });

  it("INV-R7 S7c (실패경로): 다른 팬의 계정이 묶인 암호문을 옮겨 붙이면 풀린 계정이 받는 팬과 달라 거부 — 송장이 안 나왔으니 그 연 줄은 출력 실패처럼 돌려받는다(INV-R13, D12 반영)", async () => {
    const b = await inspectedShare();
    psql(`update pii.revgift_addresses set envelope = ${q(JSON.stringify(await sealForAccount(PROFILE.daltokki)))}::jsonb where share_id = '${b.shareId}'`);
    expect(await print(b.qr)).toEqual({ kind: "denied", reason: "order_mismatch" });
    expect(logRows(b.shareId)).toEqual([`opened:1:${OWNER_ID}`, `denied:order_mismatch:${OWNER_ID}`]);
    expect(contextCount(b.qr)).toBe(0);
    expect(parcelState(b.qr)).toBe("inspected");
    // 받는 팬의 열람 기록에 그 줄은 「출력 실패」(돌려받은 줄)
    const fan = await signedInClient("byeolbit_fan");
    const seen = await fan.rpc("my_revgift_access_log", { p_order_no: b.orderNo });
    expect(seen.error).toBeNull();
    expect((seen.data as { kind: string; print_no: number; released: boolean }[]).map((x) => `${x.kind}:${x.print_no}:${x.released}`)).toEqual(["opened:1:true"]);

    // 시험 준비: 받는 팬(별빛)의 봉인으로 바꿔 넣으면 다음 출력은 첫 출력
    psql(`update pii.revgift_addresses set envelope = ${q(JSON.stringify(await sealForAccount()))}::jsonb where share_id = '${b.shareId}'`);
    const r = await print(b.qr);
    expect(r.kind).toBe("printed");
    if (r.kind === "printed") expect(r.reprint).toBe(false);
  });

  it("INV-R7 (b): 2026-10-17 전 받기로 주문번호가 묶인 몫은 계속 열린다 — 다른 몫의 주문번호가 묶였으면 거부", async () => {
    const a = await inspectedShare();
    const b = await inspectedShare();
    psql(`update pii.revgift_addresses set envelope = ${q(JSON.stringify(await sealFor(b.orderNo)))}::jsonb where share_id = '${b.shareId}'`);
    expect((await print(b.qr)).kind).toBe("printed");
    psql(`update pii.revgift_addresses set envelope = ${q(JSON.stringify(await sealFor(b.orderNo)))}::jsonb where share_id = '${a.shareId}'`);
    expect(await print(a.qr)).toEqual({ kind: "denied", reason: "order_mismatch" });
  });

  it("INV-R7 (b): 봉투를 내줄 때 그 몫의 받는 팬을 같이 내준다 — 계정 봉인을 대조할 값", async () => {
    const s = await inspectedShare();
    expect(claim(s.qr)).toMatchObject({ result: "opened", fan_id: PROFILE.byeolbit, order_no: s.orderNo });
  });

  it("INV-R7 S7f (동시): 상한 직전인 몫에 출력 요청 둘이 겹쳐도 열리는 것은 하나다", async () => {
    const s = await inspectedShare();
    claim(s.qr);
    claim(s.qr);
    const lock = await holdRowLock(`select 1 from public.office_parcels where qr_code = '${s.qr}' for update`, 1);
    const both = await Promise.all([print(s.qr), print(s.qr)]);
    await lock.released;
    expect(both.filter((r) => r.kind === "printed")).toHaveLength(1);
    expect(both.filter((r) => r.kind === "denied")).toHaveLength(1);
    expect(logRows(s.shareId).filter((l) => l.startsWith("opened"))).toHaveLength(3);
  });

  it("INV-R7 (실패경로): 봉투를 내주는 함수·돌려주기·판정 재료·송장 마무리는 앱 서버 키·로그인 키로 부를 수 없다", async () => {
    const s = await inspectedShare();
    const fan = await signedInClient("byeolbit_fan");
    for (const client of [adminClient(), fan]) {
      expect((await client.rpc("revgift_claim_print", { p_qr: s.qr, p_requester: OWNER_ID })).error).not.toBeNull();
      expect((await client.rpc("revgift_print_context", { p_qr: s.qr })).error).not.toBeNull();
      expect((await client.rpc("revgift_finish_print", { p_qr: s.qr, p_waybill: waybill() })).error).not.toBeNull();
      expect((await client.rpc("revgift_release_print", { p_log_id: 1, p_requester: OWNER_ID })).error).not.toBeNull();
    }
    expect(logRows(s.shareId)).toEqual([]);
  });
});

describe("INV-R7: 앱 판정을 건너뛰어도 DB 가 잠근 자리에서 다시 본다", () => {
  const cases: [string, (s: Share) => void, string][] = [
    ["팬이 받기를 하지 않음", (s) => psql(`update public.revgift_shares set reply = 'waiting', replied_at = null where id = '${s.shareId}'`), "no_valid_approval"],
    [
      "결제가 끝나지 않음",
      (s) =>
        psql(
          `update public.revgift_sends set status = 'confirming', settled_at = null, payment_key = null where id = (select send_id from public.revgift_shares where id = '${s.shareId}')`,
        ),
      "order_not_printable",
    ],
    ["상자가 검수 완료 전 단계", (s) => psql(`update public.office_parcels set state = 'received' where qr_code = '${s.qr}'`), "order_not_printable"],
    ["몫의 검수 시각이 없음", (s) => psql(`update public.revgift_shares set inspected_at = null where id = '${s.shareId}'`), "order_not_printable"],
    ["이미 출고 확정", (s) => psql(`update public.revgift_shares set shipped_at = now() where id = '${s.shareId}'`), "order_not_printable"],
    ["취소된 몫", (s) => psql(`update public.revgift_shares set cancelled_at = now() where id = '${s.shareId}'`), "order_not_printable"],
  ];
  for (const [what, setUp, reason] of cases) {
    it(`INV-R7 S7d (실패경로): ${what} → 봉투를 내주지 않고 거부 줄`, async () => {
      const s = await inspectedShare();
      setUp(s);
      expect(claim(s.qr)).toEqual({ result: "denied", reason });
      expect(logRows(s.shareId)).toEqual([`denied:${reason}:${OWNER_ID}`]);
    });
  }

  it("INV-R7 (실패경로): 송장 마무리는 팬 선물 상자·검수 전 상자·꼴이 틀린 송장번호·출고 조건이 안 되는 몫을 거부한다", async () => {
    const s = await inspectedShare();
    const finish = (qr: string, no: string) => psqlError(`set role address_decryptor; select public.revgift_finish_print('${qr}', '${no}');`);
    // 팬 선물 상자
    const gift = await paidGift();
    const giftNo = waybill();
    await fanSetsWaybill(gift.boxIds[0]!, giftNo);
    const giftQr = await receiveAndLabel(await signedInClient("fankkuk_staff"), giftNo);
    expect(finish(giftQr, waybill())).toMatch(/역조공 상자가 아니다/);
    // 꼴이 틀린 송장번호
    expect(finish(s.qr, "abc")).not.toBeNull();
    // 출고 조건이 안 되는 몫(취소)
    psql(`update public.revgift_shares set cancelled_at = now() where id = '${s.shareId}'`);
    expect(finish(s.qr, waybill())).toMatch(/출고 조건/);
    // 검수 전 단계
    psql(`update public.revgift_shares set cancelled_at = null where id = '${s.shareId}'`);
    psql(`update public.office_parcels set state = 'received' where qr_code = '${s.qr}'`);
    expect(finish(s.qr, waybill())).toMatch(/지금 단계/);
    expect(psql(`select state from public.office_parcels where qr_code = '${s.qr}'`)).toBe("received");
    expect(parcelState(giftQr)).not.toBe("label_printed");
  });
});

describe("INV-R13: 주소를 연 뒤 송장이 나오기 전에 실패하면 그 「연 줄」을 돌려준다", () => {
  it("INV-R13 S13b (실패경로): 앱 서버 키(RLS 를 건너뛴다)로도 돌려줌 줄·열람 기록 줄을 직접 넣지 못한다", async () => {
    const s = await inspectedShare();
    claim(s.qr);
    const logId = Number(latestOpened(s.shareId));
    const server = adminClient();
    expect((await server.from("revgift_decrypt_releases").insert({ opened_log_id: logId, share_id: s.shareId, requester_id: OWNER_ID })).error).not.toBeNull();
    expect((await server.from("revgift_decrypt_log").insert({ share_id: s.shareId, requester_id: OWNER_ID, result: "denied", deny_reason: "not_owner" })).error).not.toBeNull();
    expect((await server.from("revgift_decrypt_log").select("id")).error).not.toBeNull();
    expect(contextCount(s.qr)).toBe(1);
  });

  it("INV-R13 S13b (실패경로): 거부 줄은 돌려줄 수 없다 — 횟수가 음수가 되지 않는다", async () => {
    const s = await inspectedShare();
    asDecryptor(
      `insert into public.revgift_decrypt_log (share_id, requester_id, result, deny_reason) values ('${s.shareId}', '${OWNER_ID}', 'denied', 'not_owner');`,
    );
    const deniedId = psql(`select max(id) from public.revgift_decrypt_log where share_id = '${s.shareId}'`);
    expect(release(deniedId)).toEqual({ result: "denied", reason: "not_opened" });
    expect(contextCount(s.qr)).toBe(0);
  });

  it("INV-R13 S13b (실패경로): 돌려줌 기록도 고치거나 지우거나 비울 수 없고, 열람 기록도 비울 수 없다", async () => {
    const s = await inspectedShare();
    claim(s.qr);
    release(latestOpened(s.shareId));
    const releaseId = psql(`select max(id) from public.revgift_decrypt_releases where share_id = '${s.shareId}'`);
    expect(psqlError(`update public.revgift_decrypt_releases set requester_id = '${STAFF_ID}' where id = ${releaseId};`)).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError(`delete from public.revgift_decrypt_releases where id = ${releaseId};`)).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError("truncate public.revgift_decrypt_releases;")).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError("truncate public.revgift_decrypt_log cascade;")).toMatch(/고치거나 지울 수 없다/);
    expect(contextCount(s.qr)).toBe(0);
  });

  it("INV-R13 S13: 봉투를 열지 못한 출력은 돌려받아 횟수가 0 이고, 고친 뒤 다음 출력은 첫 출력이다", async () => {
    const s = await inspectedShare(() => sealForAccount(PROFILE.byeolbit, otherKeys));
    expect(await print(s.qr)).toEqual({ kind: "failed" });
    expect(logRows(s.shareId)).toEqual([`opened:1:${OWNER_ID}`]);
    expect(contextCount(s.qr)).toBe(0);
    expect(parcelState(s.qr)).toBe("inspected");

    // 시험 준비: 바른 키로 봉인한 주소로 바꿔 넣는다
    psql(`update pii.revgift_addresses set envelope = ${q(JSON.stringify(await sealForAccount()))}::jsonb where share_id = '${s.shareId}'`);
    const r = await print(s.qr);
    expect(r.kind).toBe("printed");
    if (r.kind === "printed") expect(r.reprint).toBe(false);
  });

  it("INV-R13 S13b (실패경로): 복호화 역할은 「연 줄」·돌려줌 줄을 직접 넣지 못하고, 기록을 고치거나 지우지 못한다", async () => {
    const s = await inspectedShare();
    claim(s.qr);
    const logId = latestOpened(s.shareId);
    expect(
      psqlError(
        `set role address_decryptor; insert into public.revgift_decrypt_log (share_id, requester_id, result, print_no) values ('${s.shareId}', '${OWNER_ID}', 'opened', 2);`,
      ),
    ).not.toBeNull();
    expect(
      psqlError(
        `set role address_decryptor; insert into public.revgift_decrypt_releases (opened_log_id, share_id, requester_id) values (${logId}, '${s.shareId}', '${OWNER_ID}');`,
      ),
    ).not.toBeNull();
    expect(psqlError(`update public.revgift_decrypt_log set requester_id = '${STAFF_ID}' where id = ${logId};`)).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError(`delete from public.revgift_decrypt_log where id = ${logId};`)).toMatch(/고치거나 지울 수 없다/);
    expect(logRows(s.shareId)).toEqual([`opened:1:${OWNER_ID}`]);
    expect(contextCount(s.qr)).toBe(1);
  });

  it("INV-R13 S13b (실패경로): 이미 돌려준 줄·앞 줄·다른 요청자 → 거부", async () => {
    const s = await inspectedShare();
    claim(s.qr);
    const first = latestOpened(s.shareId);
    claim(s.qr);
    const second = latestOpened(s.shareId);
    expect(release(first)).toEqual({ result: "denied", reason: "not_latest" });
    expect(release(second, STAFF_ID)).toEqual({ result: "denied", reason: "not_requester" });
    expect(release(second)).toEqual({ result: "released" });
    expect(release(second)).toEqual({ result: "denied", reason: "already_released" });
    expect(contextCount(s.qr)).toBe(1);
  });

  it("INV-R13 S13b (실패경로): 송장이 이미 나온 몫(재출력)의 실패는 돌려주지 않는다", async () => {
    const s = await inspectedShare();
    expect((await print(s.qr)).kind).toBe("printed");
    claim(s.qr);
    expect(release(latestOpened(s.shareId))).toEqual({ result: "denied", reason: "not_inspected" });
    expect(contextCount(s.qr)).toBe(2);
  });

  it("INV-R13 S13b (실패경로): 한 몫에서 세 번째 돌려주기는 거부되고, 그 시도는 횟수에 남는다", async () => {
    const s = await inspectedShare();
    for (let i = 0; i < 2; i++) {
      claim(s.qr);
      expect(release(latestOpened(s.shareId))).toEqual({ result: "released" });
    }
    claim(s.qr);
    expect(release(latestOpened(s.shareId))).toEqual({ result: "denied", reason: "release_limit_reached" });
    expect(contextCount(s.qr)).toBe(1);
  });

  it("INV-R13 (실패경로): 팬 선물 상자의 줄은 역조공 돌려주기로 돌려받지 못하고, 몫 상자에 팬 선물 함수는 쓰이지 않는다", async () => {
    const s = await inspectedShare();
    expect(release("999999999")).toEqual({ result: "denied", reason: "not_opened" });
    expect(psqlError(`set role address_decryptor; select public.invoice_claim_print('${s.qr}', '${OWNER_ID}');`)).not.toBeNull();
    expect(logRows(s.shareId)).toEqual([]);
  });
});
