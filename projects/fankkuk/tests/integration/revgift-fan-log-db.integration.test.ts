import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sealedAddressPlaintext } from "@/entities/revgift/model/sealed-address";
import { createInvoiceDecryptor, type InvoiceDecryptor } from "@/features/invoice-print/api/invoice-decryptor";
import { sealEnvelope } from "@/shared/lib/envelope/envelope";
import { anonClient, deleteTestOrders, psql, registerTestOrder, signedInClient } from "./helpers";
import { decryptFileText, LABEL, OWNER_ID, testKeyPair, type TestKeys } from "./invoice-helpers";
import { creatorSetsWaybill, deleteTestUnmatched, inspect, paidShare, receiveAndLabel, SHARE_PASS, waybill } from "./office-helpers";
import { deleteTestRevgifts, followHaru, payTestRevgift, PROFILE, registerTestRevgift, unfollowHaru } from "./revgift-helpers";

// 팬이 자기 몫 주소의 열람 기록을 본다 (reverse-gift INV-R16).
// 읽기 함수(my_revgift_access_log)는 사람 ID 를 받지 않고, 로그인 토큰의 계정이 받는 팬인 몫의 기록만 돌려준다.
// 연 줄은 몫 전용 열람 기록, 지운 줄은 몫 주소 지운 기록에서 온다. 주소·운송장·요청자 계정 칸은 없다.
// 거부 줄과 대표·직원 구분은 팬에게 오지 않고 운영자만 읽는 내부 기록(admin_access_log)에 있다(2026-10-12 문제집 D12).
// 시드 주문·계정은 바꾸지 않는다 — 시험마다 새 보내기(RG-T…)를 만들고 끝나면 지운다.

let keys: TestKeys;
let decryptor: InvoiceDecryptor;

const env = () => ({ NODE_ENV: "development", SUPABASE_URL: process.env.FK_TEST_API_URL, SUPABASE_ANON_KEY: process.env.FK_TEST_ANON_KEY });

beforeAll(async () => {
  keys = await testKeyPair();
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
  unfollowHaru([PROFILE.gureumppang]);
});

async function tokenOf(loginId: string): Promise<string> {
  const client = await signedInClient(loginId);
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("토큰 없음");
  return token;
}

async function print(qr: string, loginId: string) {
  return decryptor({ qr, accessToken: await tokenOf(loginId) });
}

/** 하루 → 별빛 몫 하나: 결제 → 별빛이 받기(봉인 주소) → 원 송장번호 → 입고·부착 → 검수 완료. */
async function inspectedShare(): Promise<{ orderNo: string; shareId: string; qr: string }> {
  const s = await paidShare();
  const fan = await signedInClient("byeolbit_fan");
  const sealed = await sealEnvelope(sealedAddressPlaintext({ orderNo: s.orderNo, ...LABEL }), keys.publicKey);
  const accepted = await fan.rpc("accept_revgift", { p_order_no: s.orderNo, p_envelope: sealed });
  if (accepted.error) throw new Error(`accept_revgift 실패: ${accepted.error.message}`);
  const no = waybill();
  await creatorSetsWaybill(s.shareId, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  expect(await inspect(staff, qr, SHARE_PASS)).toBe("inspected");
  return { orderNo: s.orderNo, shareId: s.shareId, qr };
}

/** S16 의 Given: 대표가 한 번 열고, 직원 시도가 한 번 거부된 뒤, 출고 확정, 그 뒤 대표 본인의 시도도 한 번 거부. */
async function openedDeniedShipped(): Promise<{ orderNo: string; shareId: string; outbound: string }> {
  const s = await inspectedShare();
  const first = await print(s.qr, "fankkuk_admin");
  expect(first.kind).toBe("printed");
  if (first.kind !== "printed") throw new Error("첫 출력 실패");
  expect(await print(s.qr, "fankkuk_staff")).toEqual({ kind: "denied", reason: "not_owner" });
  const staff = await signedInClient("fankkuk_staff");
  const shipped = await staff.rpc("office_confirm_shipment", { p_qr: s.qr, p_waybill: first.waybill });
  if (shipped.error) throw new Error(`office_confirm_shipment 실패: ${shipped.error.code} ${shipped.error.message}`);
  // 대표 본인의 거부 줄(대표 아님이 아닌 사유) — 이것도 팬에게 가지 않는다(D12)
  const ownerDenied = await print(s.qr, "fankkuk_admin");
  expect(ownerDenied.kind).toBe("denied");
  if (ownerDenied.kind === "denied") expect(ownerDenied.reason).not.toBe("not_owner");
  return { orderNo: s.orderNo, shareId: s.shareId, outbound: first.waybill };
}

/** 복호화 전용 역할로 SQL 한 문장을 돌리고 마지막 줄(결과)을 돌려준다 — psql 은 「SET」 줄을 먼저 찍는다. */
function asDecryptor(sql: string): string {
  return psql(`set role address_decryptor; ${sql}`).split(/\r?\n/).pop() ?? "";
}

const text0 = (rows: unknown) => JSON.stringify(rows);

async function readAs(loginId: string, orderNo: string) {
  const client = await signedInClient(loginId);
  return client.rpc("my_revgift_access_log", { p_order_no: orderNo });
}

describe("INV-R16: 팬은 자기 몫 주소의 열람 기록을 본다", () => {
  it("INV-R16 S16: 연 줄(1번째) · 지운 줄(출고) 두 줄만 시각 역순으로 — 직원 거부 줄·대표 표시·주소·운송장·요청자 계정 없이 온다", async () => {
    const s = await openedDeniedShipped();
    const { data, error } = await readAs("byeolbit_fan", s.orderNo);
    expect(error).toBeNull();
    const rows = data as Record<string, unknown>[];
    expect(rows.map((r) => ({ ...r, at: undefined }))).toEqual([
      { at: undefined, kind: "deleted", print_no: null, outcome: "shipped", released: false },
      { at: undefined, kind: "opened", print_no: 1, outcome: null, released: false },
    ]);
    const times = rows.map((r) => Date.parse(String(r.at)));
    expect(times.every((t) => Number.isFinite(t))).toBe(true);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // 칸은 정해진 다섯 개뿐 — 대표·직원 구분·거부 사유·주소·운송장·요청자 계정 id 가 섞여 오지 않는다(INV-R7·R8, D12)
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["at", "kind", "outcome", "print_no", "released"]);
    expect(text0(rows)).not.toMatch(/not_owner|denied|owner|other/);
    // 기록 표에는 직원 거부 줄이 그대로 있다 — 팬 응답에서만 빠진다
    expect(psql(`select count(*) from public.revgift_decrypt_log where share_id = '${s.shareId}' and deny_reason = 'not_owner'`)).toBe("1");
    expect(psql(`select count(*) from public.revgift_decrypt_log where share_id = '${s.shareId}' and result = 'denied' and deny_reason <> 'not_owner'`)).toBe("1");
    const text = JSON.stringify(rows);
    expect(text).not.toContain(OWNER_ID);
    for (const v of Object.values(LABEL)) expect(text).not.toContain(v);
    expect(text).not.toContain(s.outbound);
  });

  it("INV-R16: 주소가 열린 적 없는 내 몫은 빈 목록이다", async () => {
    const s = await paidShare();
    const { data, error } = await readAs("byeolbit_fan", s.orderNo);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("INV-R16 S16b (실패경로): 다른 팬·보낸 크리에이터·직원·대표 운영자는 0줄, 익명은 거부", async () => {
    const s = await openedDeniedShipped();
    followHaru([PROFILE.gureumppang]);
    for (const login of ["gureumppang_fan", "daltokki_fan", "haru_creator", "fankkuk_staff", "fankkuk_admin"]) {
      const { data, error } = await readAs(login, s.orderNo);
      expect(error, login).toBeNull();
      expect(data, login).toEqual([]);
    }
    const anon = await anonClient().rpc("my_revgift_access_log", { p_order_no: s.orderNo });
    expect(anon.error?.code).toBe("42501");
    expect(anon.data).toBeNull();
  });

  it("INV-R16 S16b (실패경로): 별빛이 남의 몫 번호·없는 번호를 넣으면 0줄", async () => {
    followHaru([PROFILE.gureumppang]);
    const send = await registerTestRevgift([{ fanId: PROFILE.gureumppang, tier: "small" }]);
    await payTestRevgift(send);
    const otherOrderNo = send.orderNos[0];
    const shareId = psql(`select id from public.revgift_shares where order_no = '${otherOrderNo}'`);
    // 연 줄은 복호화 전용 역할도 직접 넣지 못한다(INV-R13 a) — 시험 준비로 표 주인이 넣는다
    psql(
      `insert into public.revgift_decrypt_log (share_id, requester_id, result, print_no) values ('${shareId}', '${OWNER_ID}', 'opened', 1);`,
    );
    // 그 몫의 주인은 자기 기록을 본다 — 줄이 실제로 있다는 확인
    const own = await readAs("gureumppang_fan", otherOrderNo);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([expect.objectContaining({ kind: "opened", print_no: 1, released: false })]);

    for (const no of [otherOrderNo, "RG-TNOPE000", "FC-P4X7N"]) {
      const { data, error } = await readAs("byeolbit_fan", no);
      expect(error, no).toBeNull();
      expect(data, no).toEqual([]);
    }
  });

  it("INV-R16 (INV-R13): 송장이 안 나와 돌려준 연 줄만 released 로 오고, 다시 연 줄은 아니다", async () => {
    const s = await inspectedShare();
    asDecryptor(`select public.revgift_claim_print('${s.qr}', '${OWNER_ID}')::text;`);
    const firstId = psql(`select max(id) from public.revgift_decrypt_log where share_id = '${s.shareId}' and result = 'opened'`);
    expect(JSON.parse(asDecryptor(`select public.revgift_release_print(${firstId}, '${OWNER_ID}')::text;`))).toEqual({ result: "released" });
    asDecryptor(`select public.revgift_claim_print('${s.qr}', '${OWNER_ID}')::text;`);
    const { data, error } = await readAs("byeolbit_fan", s.orderNo);
    expect(error).toBeNull();
    const rows = data as { kind: string; released: boolean }[];
    expect(rows.map((r) => [r.kind, r.released])).toEqual([
      ["opened", false],
      ["opened", true],
    ]);
  });

  it("INV-R16: 같은 시각이면 지운 줄이 위, 연 줄끼리는 나중에 남은 줄이 위", async () => {
    const s = await paidShare();
    const t = "2026-10-09 12:00:00+00";
    psql(
      `insert into public.revgift_decrypt_log (at, share_id, requester_id, result, print_no) values ('${t}', '${s.shareId}', '${OWNER_ID}', 'opened', 1), ('${t}', '${s.shareId}', '${OWNER_ID}', 'opened', 2);`,
    );
    psql(`insert into public.revgift_address_events (share_id, event, outcome, at) values ('${s.shareId}', 'deleted', 'cancelled', '${t}')`);
    const { data, error } = await readAs("byeolbit_fan", s.orderNo);
    expect(error).toBeNull();
    const rows = data as { at: string; kind: string; print_no: number | null }[];
    expect(new Set(rows.map((r) => Date.parse(r.at))).size).toBe(1);
    expect(rows.map((r) => r.print_no ?? r.kind)).toEqual(["deleted", 2, 1]);
  });
});

describe("INV-R16 (D12): 몫의 거부 줄과 대표·직원 구분은 운영자 내부 기록에만 있다", () => {
  it("INV-R16 S16c (D12): 운영자는 그 몫의 연 줄(대표)·직원 거부 줄(대표 아님)·출고 뒤 대표 거부 줄(대표)을 본다 — 계정 id 없이", async () => {
    const s = await openedDeniedShipped();
    for (const login of ["fankkuk_admin", "fankkuk_staff"]) {
      const client = await signedInClient(login);
      const { data, error } = await client.rpc("admin_access_log");
      expect(error, login).toBeNull();
      const rows = (data as { target: string; order_no: string; result: string; deny_reason: string | null; requester: string }[]).filter(
        (r) => r.order_no === s.orderNo,
      );
      expect(rows.map((r) => `${r.target}:${r.result}:${r.deny_reason ?? "-"}:${r.requester}`), login).toEqual([
        "revgift:denied:order_not_printable:owner",
        "revgift:denied:not_owner:other",
        "revgift:opened:-:owner",
      ]);
      expect(JSON.stringify(rows)).not.toContain(OWNER_ID);
      for (const v of Object.values(LABEL)) expect(JSON.stringify(rows)).not.toContain(v);
    }
  });

  it("INV-R16 S16c (D12, 실패경로): 받는 팬·보낸 크리에이터는 내부 기록을 부르면 거부된다", async () => {
    await openedDeniedShipped();
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      const client = await signedInClient(login);
      const { data, error } = await client.rpc("admin_access_log");
      expect(error?.code, login).toBe("42501");
      expect(data, login).toBeNull();
    }
  });
});

type AdminRow = { at: string; target: string; order_no: string };

describe("INV-P7·INV-R16 (D12): 운영자 내부 기록은 팬 선물과 역조공 줄을 섞어 시각 역순으로", () => {
  it("INV-P7 (D12): 팬 선물 줄이 더 나중이면 위, 같은 시각이면 역조공 줄이 위", async () => {
    const gift = await registerTestOrder();
    const share = await paidShare();
    const box = psql(`select id from public.boxes where order_id = '${gift.orderId}' order by seq limit 1`);
    expect(box).not.toBe("");
    // 다른 줄보다 위에 오도록 앞으로 1시간 뒤 시각에 남긴다(시험 준비 — 표 주인이 넣는다)
    const at = (sec: number) => `now() + interval '1 hour' + make_interval(secs => ${sec})`;
    psql(
      `insert into public.decrypt_log (at, order_id, box_id, requester_id, result, print_no) values (${at(1)}, '${gift.orderId}', '${box}', '${OWNER_ID}', 'opened', 1), (${at(2)}, '${gift.orderId}', '${box}', '${OWNER_ID}', 'opened', 2);
       insert into public.revgift_decrypt_log (at, share_id, requester_id, result, print_no) values (${at(1)}, '${share.shareId}', '${OWNER_ID}', 'opened', 1);`,
    );
    const admin = await signedInClient("fankkuk_admin");
    const { data, error } = await admin.rpc("admin_access_log");
    expect(error).toBeNull();
    const mine = (data as AdminRow[]).filter((r) => r.order_no === gift.orderNo || r.order_no === share.orderNo);
    expect(mine.map((r) => r.target)).toEqual(["gift", "revgift", "gift"]);
    expect(Date.parse(mine[1]?.at ?? "")).toBe(Date.parse(mine[2]?.at ?? ""));
    expect(Date.parse(mine[0]?.at ?? "")).toBeGreaterThan(Date.parse(mine[1]?.at ?? ""));
  });
});
