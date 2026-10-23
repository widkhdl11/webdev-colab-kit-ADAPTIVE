// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fanAddressPlaintext } from "@/entities/address/model/fan-address-plaintext";
import { sealedAddressPlaintext } from "@/entities/revgift/model/sealed-address";
import { createDevKeyUnwrapper, type KeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { importSealingPublicKey, sealEnvelope } from "@/shared/lib/envelope/envelope";
import { printShareLabel, type ShareLabelDeps } from "./print-share-label";

// 역조공 송장 출력 함수(팬 주소를 여는 유일한 서버 코드)의 순서 — reverse-gift INV-R7·R13.
// DB 는 가짜로 두고, 판정·봉투 열기·주문번호 대조는 진짜 코드를 지난다.

const OWNER = "00000000-0000-4000-a000-000000000021";
const STAFF = "00000000-0000-4000-a000-000000000022";
const SHARE_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_NO = "RG-AAA111";
const QR = "Q-000456";
const NEW_WAYBILL = "555566667777";
const OLD_WAYBILL = "111122223333";
const LOG_ID = 777;
const FAN = "00000000-0000-4000-a000-000000000001";
const OTHER_FAN = "00000000-0000-4000-a000-000000000002";

const fields = { recipientName: "별빛", phone: "01012345678", zipCode: "04001", address1: "서울시 마포구 시험로 1", address2: "" };

async function keyPair(): Promise<{ publicKey: CryptoKey; privatePem: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const pem = (label: string, der: ArrayBuffer) => `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...new Uint8Array(der)))}\n-----END ${label}-----`;
  const spki = pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey));
  return { publicKey: await importSealingPublicKey(spki), privatePem: pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey)) };
}

const keys = await keyPair();
const otherKeys = await keyPair();

type Context = Record<string, unknown>;

function goodContext(patch: Context = {}): Context {
  return {
    kind: "share",
    share_id: SHARE_ID,
    order_no: ORDER_NO,
    parcel_state: "inspected",
    paid: true,
    reply: "accepted",
    inspected: true,
    shipped: false,
    returned: false,
    cancelled: false,
    decrypt_count: 0,
    ...patch,
  };
}

async function openedClaim(sealedOrderNo = ORDER_NO, with_ = keys): Promise<Record<string, unknown>> {
  const envelope = await sealEnvelope(sealedAddressPlaintext({ orderNo: sealedOrderNo, ...fields }), with_.publicKey);
  return { result: "opened", print_no: 1, log_id: LOG_ID, order_no: ORDER_NO, fan_id: FAN, envelope };
}

/** 2026-10-17 부터의 봉인 — 받기 때 팬 등록 주소를 복사한 것이라 계정 식별값이 묶여 있다(reverse-gift INV-R5). */
async function openedAccountClaim(sealedAccount = FAN): Promise<Record<string, unknown>> {
  const envelope = await sealEnvelope(fanAddressPlaintext({ accountId: sealedAccount, ...fields }), keys.publicKey);
  return { result: "opened", print_no: 1, log_id: LOG_ID, order_no: ORDER_NO, fan_id: FAN, envelope };
}

type Reply = { data: unknown; error: { code: string; message: string } | null };
const ok = (data: unknown): Reply => ({ data, error: null });

function fakeDb(context: Context | null, claim: unknown, finish: Reply = ok({ waybill: NEW_WAYBILL, first: true })) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (fn === "revgift_print_context") return ok(context);
      if (fn === "revgift_claim_print") return ok(claim);
      if (fn === "revgift_finish_print") return finish;
      if (fn === "revgift_release_print") return ok({ result: "released" });
      return { data: null, error: { code: "42883", message: "없는 함수" } };
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        calls.push({ fn: `insert:${table}`, args: row });
        return { error: null };
      },
    }),
  };
  return { db: db as unknown as ShareLabelDeps["db"], calls };
}

function countingUnwrapper(): { unwrapper: KeyUnwrapper; count: () => number } {
  const real = createDevKeyUnwrapper({ privateKeyPem: keys.privatePem, env: { NODE_ENV: "development" } });
  let n = 0;
  return {
    unwrapper: {
      unwrap: async (w) => {
        n += 1;
        return real.unwrap(w);
      },
    },
    count: () => n,
  };
}

function deps(db: ShareLabelDeps["db"], over: Partial<ShareLabelDeps> = {}): ShareLabelDeps {
  return {
    db,
    verifyRequester: async (token) => (token === "owner-token" ? OWNER : token === "staff-token" ? STAFF : null),
    ownerUserId: OWNER,
    unwrapper: countingUnwrapper().unwrapper,
    newWaybill: () => NEW_WAYBILL,
    ...over,
  };
}

const ask = { qr: QR, accessToken: "owner-token" };
const fnNames = (calls: { fn: string }[]) => calls.map((c) => c.fn);

describe("역조공 송장 출력 — 팬 주소 열기 (INV-R7)", () => {
  it("INV-R7 S7: 조건이 모두 맞으면 팬 주소를 열어 라벨 다섯 칸만 돌려주고, 첫 출력이면 새 송장번호로 출력 단계를 넘긴다", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedClaim());
    expect(await printShareLabel(deps(db), ask)).toEqual({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: fields });
    expect(fnNames(calls)).toEqual(["revgift_print_context", "revgift_claim_print", "revgift_finish_print"]);
    expect(calls[2]?.args).toEqual({ p_qr: QR, p_waybill: NEW_WAYBILL });
  });

  it("INV-R7: 이미 송장이 나온 몫은 새 송장번호 없이 마무리를 불러 처음 번호로 재출력한다", async () => {
    const { db, calls } = fakeDb(goodContext({ parcel_state: "label_printed", decrypt_count: 1 }), await openedClaim(), ok({ waybill: OLD_WAYBILL, first: false }));
    expect(await printShareLabel(deps(db), ask)).toEqual({ kind: "printed", waybill: OLD_WAYBILL, reprint: true, label: fields });
    expect(calls[2]?.args).toEqual({ p_qr: QR, p_waybill: null });
  });

  it("INV-R9 S9 (카드 d120): 출고 확정된 몫도 한 번 연 적이 있으면 새 송장번호 없이 마무리를 불러 처음 번호로 재출력한다 — 연 적 없으면 거부", async () => {
    const { db, calls } = fakeDb(goodContext({ parcel_state: "shipped", shipped: true, decrypt_count: 1 }), await openedClaim(), ok({ waybill: OLD_WAYBILL, first: false }));
    expect(await printShareLabel(deps(db), ask)).toEqual({ kind: "printed", waybill: OLD_WAYBILL, reprint: true, label: fields });
    expect(calls[2]?.args).toEqual({ p_qr: QR, p_waybill: null });
    const never = fakeDb(goodContext({ parcel_state: "shipped", shipped: true, decrypt_count: 0 }), await openedClaim());
    expect(await printShareLabel(deps(never.db), ask)).toEqual({ kind: "denied", reason: "order_not_printable" });
    // 몫은 출고 확정인데 상자가 출고 확정이 아니면 거부 — DB(revgift_claim_print)와 같은 조건
    const notShippedParcel = fakeDb(goodContext({ parcel_state: "label_printed", shipped: true, decrypt_count: 1 }), await openedClaim());
    expect(await printShareLabel(deps(notShippedParcel.db), ask)).toEqual({ kind: "denied", reason: "order_not_printable" });
  });

  it("INV-R7 S7e·S7b·S7d (실패경로): 대표 아님·받기 전·검수 전·반송·결제 전·상한이면 DB 봉투를 부르지 않고 거부 줄 하나만 남긴다", async () => {
    const cases: [Context, string, string][] = [
      [goodContext(), "staff-token", "not_owner"],
      [goodContext({ reply: "waiting" }), "owner-token", "no_valid_approval"],
      [goodContext({ inspected: false }), "owner-token", "order_not_printable"],
      [goodContext({ parcel_state: "received" }), "owner-token", "order_not_printable"],
      [goodContext({ paid: false }), "owner-token", "order_not_printable"],
      [goodContext({ returned: true }), "owner-token", "order_not_printable"],
      [goodContext({ decrypt_count: 3 }), "owner-token", "decrypt_limit_reached"],
    ];
    for (const [ctx, token, reason] of cases) {
      const { db, calls } = fakeDb(ctx, await openedClaim());
      const unwrap = countingUnwrapper();
      expect(await printShareLabel(deps(db, { unwrapper: unwrap.unwrapper }), { qr: QR, accessToken: token })).toEqual({ kind: "denied", reason });
      expect(fnNames(calls)).toEqual(["revgift_print_context", "insert:revgift_decrypt_log"]);
      expect(calls[1]?.args).toMatchObject({ share_id: SHARE_ID, result: "denied", deny_reason: reason });
      expect(unwrap.count()).toBe(0);
    }
  });

  it("INV-R7 S7c (실패경로): 봉인 속 주문번호가 다르면 거부로 답하고 거부 줄을 남기되, 송장이 안 나왔으니 그 연 줄은 출력 실패처럼 돌려준다(INV-R13, D12 반영)", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedClaim("RG-OTHER1"));
    expect(await printShareLabel(deps(db), ask)).toEqual({ kind: "denied", reason: "order_mismatch" });
    expect(fnNames(calls)).toEqual(["revgift_print_context", "revgift_claim_print", "revgift_release_print", "insert:revgift_decrypt_log"]);
    expect(calls[2]?.args).toEqual({ p_log_id: LOG_ID, p_requester: OWNER });
  });

  it("INV-R7 S7 (b): 받기 때 복사한 등록 주소(봉인 속 계정 = 몫의 받는 팬)면 열어 라벨 다섯 칸만 돌려준다", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedAccountClaim());
    expect(await printShareLabel(deps(db), ask)).toEqual({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: fields });
    expect(fnNames(calls)).toEqual(["revgift_print_context", "revgift_claim_print", "revgift_finish_print"]);
  });

  it("INV-R7 S7c (b, 실패경로): 봉인 속 계정이 몫의 받는 팬과 다르면(다른 팬의 등록 주소를 옮겨 붙임) 거부하고 연 줄을 돌려준다", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedAccountClaim(OTHER_FAN));
    expect(await printShareLabel(deps(db), ask)).toEqual({ kind: "denied", reason: "order_mismatch" });
    expect(fnNames(calls)).toEqual(["revgift_print_context", "revgift_claim_print", "revgift_release_print", "insert:revgift_decrypt_log"]);
  });

  it("INV-R7 (b, 실패경로): 받는 팬(fan_id)을 내주지 않는 옛 DB 응답이면 계정 봉인은 쓰지 않는다 — 주문번호 봉인은 그대로 열린다", async () => {
    const { fan_id: _a, ...accountWithout } = await openedAccountClaim();
    expect(await printShareLabel(deps(fakeDb(goodContext(), accountWithout).db), ask)).toEqual({ kind: "denied", reason: "order_mismatch" });
    const { fan_id: _b, ...orderWithout } = await openedClaim();
    expect(await printShareLabel(deps(fakeDb(goodContext(), orderWithout).db), ask)).toMatchObject({ kind: "printed" });
  });

  it("INV-R7 (실패경로): DB 가 잠근 자리에서 거부하면 그대로 거부 — 앱은 거부 줄을 또 남기지 않는다", async () => {
    const { db, calls } = fakeDb(goodContext(), { result: "denied", reason: "no_valid_approval" });
    expect(await printShareLabel(deps(db), ask)).toEqual({ kind: "denied", reason: "no_valid_approval" });
    expect(fnNames(calls)).toEqual(["revgift_print_context", "revgift_claim_print"]);
  });

  it("INV-R7 (실패경로): 로그인 토큰을 못 믿으면 DB 를 부르지 않는다 · 팬 선물 상자면 not_share · 없는 상자면 not_found", async () => {
    const none = fakeDb(goodContext(), await openedClaim());
    expect(await printShareLabel(deps(none.db), { qr: QR, accessToken: "" })).toEqual({ kind: "unauthenticated" });
    expect(await printShareLabel(deps(none.db), { qr: QR, accessToken: "bad" })).toEqual({ kind: "unauthenticated" });
    expect(none.calls).toEqual([]);
    expect(await printShareLabel(deps(fakeDb({ kind: "gift" }, null).db), ask)).toEqual({ kind: "not_share" });
    expect(await printShareLabel(deps(fakeDb(null, null).db), ask)).toEqual({ kind: "not_found" });
  });
});

describe("역조공 송장 출력 — 송장이 안 나오면 돌려받기 (INV-R13)", () => {
  it("INV-R13 S13: 봉투를 열지 못하면(다른 키·깨진 봉투) 그 연 줄을 돌려받고 실패로 끝난다", async () => {
    for (const claim of [await openedClaim(ORDER_NO, otherKeys), { ...(await openedClaim()), envelope: { v: 1 } }]) {
      const { db, calls } = fakeDb(goodContext(), claim);
      expect(await printShareLabel(deps(db), ask)).toEqual({ kind: "failed" });
      expect(fnNames(calls)).toEqual(["revgift_print_context", "revgift_claim_print", "revgift_release_print"]);
      expect(calls[2]?.args).toEqual({ p_log_id: LOG_ID, p_requester: OWNER });
    }
  });

  it("INV-R13 S13: 송장 마무리가 실패하거나 응답이 깨지면 돌려받는다", async () => {
    for (const finish of [{ data: null, error: { code: "P0041", message: "x" } }, ok({ nope: true })]) {
      const { db, calls } = fakeDb(goodContext(), await openedClaim(), finish);
      expect(await printShareLabel(deps(db), ask)).toEqual({ kind: "failed" });
      expect(fnNames(calls).at(-1)).toBe("revgift_release_print");
    }
  });

  it("INV-R13 (실패경로): 연 줄 id 가 없는 응답은 쓰지 않는다 — 돌려받을 수 없는 열기를 하지 않는다", async () => {
    const { log_id: _dropped, ...withoutLog } = await openedClaim();
    const unwrap = countingUnwrapper();
    const { db, calls } = fakeDb(goodContext(), withoutLog);
    expect(await printShareLabel(deps(db, { unwrapper: unwrap.unwrapper }), ask)).toEqual({ kind: "failed" });
    expect(unwrap.count()).toBe(0);
    expect(fnNames(calls)).toEqual(["revgift_print_context", "revgift_claim_print"]);
  });
});
