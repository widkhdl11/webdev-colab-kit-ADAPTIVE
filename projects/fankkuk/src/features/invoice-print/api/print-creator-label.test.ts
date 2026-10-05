// @vitest-environment node
import { describe, expect, it } from "vitest";
import { creatorAddressPlaintext } from "@/entities/address/model/creator-address-plaintext";
import { buildSigningPayload } from "@/entities/order/model/signing-payload";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { createDevKeyUnwrapper, type KeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { importSealingPublicKey, sealEnvelope } from "@/shared/lib/envelope/envelope";
import { printCreatorLabel, type CreatorLabelDeps } from "./print-creator-label";

// 송장 출력 함수(주소를 여는 유일한 서버 코드)의 순서 — address-protection INV-P4·P5·P7·P8·P10·P14.
// DB 는 가짜로 두고, 판정·서명 재검증·봉투 열기·대조는 진짜 코드를 지난다.

const OWNER = "00000000-0000-4000-a000-000000000021";
const STAFF = "00000000-0000-4000-a000-000000000022";
const HARU_PROFILE = "00000000-0000-4000-a000-000000000011";
const HARU = "00000000-0000-4000-b000-000000000001";
const DALBIT = "00000000-0000-4000-b000-000000000002";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_NO = "FC-AAAAA";
const QR = "Q-000123";
const NEW_WAYBILL = "555566667777";
const OLD_WAYBILL = "111122223333";

const fields = { recipientName: "김하루", phone: "01012345678", zipCode: "06236", address1: "서울시 강남구 테헤란로 123", address2: "101동" };

const payloadFor = (orderNo: string) =>
  buildSigningPayload({ requestId: `apr_${orderNo.slice(3)}`, orderNo, requestedAt: "2026-10-01T09:30:00.000Z", fanNicknameHash: "d".repeat(64) });

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

type Context = Record<string, unknown>;

function goodContext(patch: Context = {}): Context {
  return {
    kind: "gift",
    order_id: ORDER_ID,
    order_no: ORDER_NO,
    order_status: "inspected",
    parcel_state: "inspected",
    creator_id: HARU,
    creator_profile_id: HARU_PROFILE,
    difference_unpaid: false,
    decrypt_count: 0,
    stored_payload: payloadFor(ORDER_NO),
    signed_content: payloadFor(ORDER_NO),
    signer_id: `fake:${HARU_PROFILE}`,
    signer_method: "fake",
    ...patch,
  };
}

type Claim = Record<string, unknown> | null;

async function openedClaim(printNo = 1, sealedFor = HARU): Promise<Claim> {
  const envelope = await sealEnvelope(creatorAddressPlaintext({ creatorId: sealedFor, ...fields }), keys.publicKey);
  return { result: "opened", print_no: printNo, order_id: ORDER_ID, creator_id: HARU, envelope };
}

function fakeDb(context: Context | null, claim: Claim, finish: string = NEW_WAYBILL) {
  const calls: { fn: string; args: unknown }[] = [];
  const logs: Record<string, unknown>[] = [];
  const db = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (fn === "invoice_print_context") return { data: context, error: null };
      if (fn === "invoice_claim_print") return { data: claim, error: null };
      if (fn === "invoice_finish_print") return { data: finish, error: null };
      return { data: null, error: { code: "42883", message: "없는 함수" } };
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        calls.push({ fn: `insert:${table}`, args: row });
        logs.push(row);
        return { error: null };
      },
    }),
  };
  return { db: db as unknown as CreatorLabelDeps["db"], calls, logs };
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

function deps(db: CreatorLabelDeps["db"], over: Partial<CreatorLabelDeps> = {}): CreatorLabelDeps {
  return {
    db,
    verifyRequester: async (token) => (token === "owner-token" ? OWNER : token === "staff-token" ? STAFF : null),
    ownerUserId: OWNER,
    unwrapper: countingUnwrapper().unwrapper,
    signer: chooseApprovalSigner({ NODE_ENV: "development" }),
    newWaybill: () => NEW_WAYBILL,
    ...over,
  };
}

const ask = { qr: QR, accessToken: "owner-token" };
const fnNames = (calls: { fn: string }[]) => calls.map((c) => c.fn);

describe("송장 출력 — 주소 열기 (INV-P4·P5·P14)", () => {
  it("INV-P4: 조건이 모두 맞으면 주소를 열어 라벨 칸만 돌려주고, 첫 출력이면 새 송장번호로 출력 단계를 넘긴다", async () => {
    const { db, calls, logs } = fakeDb(goodContext(), await openedClaim(1));
    const res = await printCreatorLabel(deps(db), ask);
    expect(res).toEqual({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: fields });
    expect(fnNames(calls)).toEqual(["invoice_print_context", "invoice_claim_print", "invoice_finish_print"]);
    expect(calls[1]?.args).toEqual({ p_qr: QR, p_requester: OWNER });
    expect(calls[2]?.args).toEqual({ p_qr: QR, p_waybill: NEW_WAYBILL });
    expect(logs).toEqual([]);
  });

  it("INV-P5 (S5d): 2회째 출력은 재출력 표시, 송장번호는 DB 가 돌려준 처음 번호", async () => {
    const { db } = fakeDb(goodContext({ decrypt_count: 1, parcel_state: "label_printed", order_status: "label_printed" }), await openedClaim(2), OLD_WAYBILL);
    expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "printed", waybill: OLD_WAYBILL, reprint: true, label: fields });
  });

  it("INV-P10: 돌려주는 값에 크리에이터 식별값·암호문·데이터 키가 없다", async () => {
    const { db } = fakeDb(goodContext(), await openedClaim(1));
    const text = JSON.stringify(await printCreatorLabel(deps(db), ask));
    for (const leak of [HARU, "wrappedKey", "ciphertext", "envelope", "creatorId"]) expect(text).not.toContain(leak);
  });
});

describe("송장 출력 — 거부 (INV-P4·P7·P8)", () => {
  it("INV-P8 (S8, 실패경로): 대표가 아닌 계정이면 거부 줄 하나만 남기고 주소 칸을 부르지 않는다", async () => {
    const { db, calls, logs } = fakeDb(goodContext(), await openedClaim(1));
    const u = countingUnwrapper();
    expect(await printCreatorLabel(deps(db, { unwrapper: u.unwrapper }), { qr: QR, accessToken: "staff-token" })).toEqual({ kind: "denied", reason: "not_owner" });
    expect(logs).toEqual([{ order_id: ORDER_ID, requester_id: STAFF, result: "denied", deny_reason: "not_owner" }]);
    expect(fnNames(calls)).toEqual(["invoice_print_context", "insert:decrypt_log"]);
    expect(u.count()).toBe(0);
  });

  it("INV-P8 (실패경로): 로그인 토큰을 검증하지 못하면 DB 를 부르지 않는다", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedClaim(1));
    expect(await printCreatorLabel(deps(db), { qr: QR, accessToken: "forged" })).toEqual({ kind: "unauthenticated" });
    expect(calls).toEqual([]);
  });

  it("INV-P8 (실패경로): 설정의 대표 ID 가 비어 있으면 누구도 열지 못한다", async () => {
    const { db, logs } = fakeDb(goodContext(), await openedClaim(1));
    expect(await printCreatorLabel(deps(db, { ownerUserId: "" }), ask)).toEqual({ kind: "denied", reason: "not_owner" });
    expect(logs).toHaveLength(1);
  });

  const deniedCases: [string, Context, string][] = [
    ["INV-P4 (S4, 실패경로 a): 승인 서명이 없으면", { signed_content: null, signer_id: null, signer_method: null }, "no_valid_approval"],
    ["INV-P4 (실패경로 a): 서명된 원문이 저장한 원문과 다르면", { signed_content: payloadFor("FC-BBBBB") }, "no_valid_approval"],
    ["INV-P4 (실패경로 a): 서명자가 그 크리에이터의 식별값이 아니면", { signer_id: "fake:00000000-0000-4000-a000-000000000099" }, "no_valid_approval"],
    ["INV-P4 (실패경로 a): 서명 방식이 지금 창구와 다르면(카카오 서명인데 창구는 가짜)", { signer_method: "kakao" }, "no_valid_approval"],
    ["INV-P4 (S4b, 실패경로 b): 서명 원문의 주문번호가 출력하는 주문과 다르면", { stored_payload: payloadFor("FC-BBBBB"), signed_content: payloadFor("FC-BBBBB") }, "order_mismatch"],
    ["INV-P4 (S4c, 실패경로 c): 검수 완료 전이면", { order_status: "labeled" }, "order_not_printable"],
    ["INV-P4 (S5c, 실패경로 c): 출고 확정 뒤면", { order_status: "shipped" }, "order_not_printable"],
    ["INV-P4 (S4c, 실패경로 c): 거절된 주문이면", { order_status: "rejected" }, "order_not_printable"],
    ["INV-P4 (실패경로 c): 모르는 상태 값이면", { order_status: "pending_payment" }, "order_not_printable"],
    ["INV-M12 (실패경로): 차액이 덜 냈으면", { difference_unpaid: true }, "difference_unpaid"],
    ["INV-P5 (S5, 실패경로): 이미 3번 열었으면", { decrypt_count: 3 }, "decrypt_limit_reached"],
  ];
  for (const [title, patch, reason] of deniedCases) {
    it(`${title} 거부 줄을 남기고 주소 칸을 부르지 않는다 (${reason})`, async () => {
      const { db, calls, logs } = fakeDb(goodContext(patch), await openedClaim(1));
      const u = countingUnwrapper();
      expect(await printCreatorLabel(deps(db, { unwrapper: u.unwrapper }), ask)).toEqual({ kind: "denied", reason });
      expect(logs).toEqual([{ order_id: ORDER_ID, requester_id: OWNER, result: "denied", deny_reason: reason }]);
      expect(fnNames(calls)).not.toContain("invoice_claim_print");
      expect(u.count()).toBe(0);
    });
  }

  it("INV-S11·P12 (실패경로): 운영 환경이라 서명 창구가 없으면 가짜 서명 승인은 열지 않는다", async () => {
    const { db, logs } = fakeDb(goodContext(), await openedClaim(1));
    expect(await printCreatorLabel(deps(db, { signer: chooseApprovalSigner({ NODE_ENV: "production" }) }), ask)).toEqual({ kind: "denied", reason: "no_valid_approval" });
    expect(logs).toHaveLength(1);
  });

  it("INV-P5 (S5b, 실패경로): 판정 뒤 DB 가 잠근 자리에서 거부하면(동시 요청이 먼저 씀) 봉투를 열지 않고 출력도 넘기지 않는다", async () => {
    const { db, calls, logs } = fakeDb(goodContext({ decrypt_count: 2 }), { result: "denied", reason: "decrypt_limit_reached" });
    const u = countingUnwrapper();
    expect(await printCreatorLabel(deps(db, { unwrapper: u.unwrapper }), ask)).toEqual({ kind: "denied", reason: "decrypt_limit_reached" });
    expect(u.count()).toBe(0);
    expect(fnNames(calls)).not.toContain("invoice_finish_print");
    expect(logs).toEqual([]); // 거부 줄은 잠근 자리에서 DB 가 남겼다
  });

  it("INV-P14 (S14, 실패경로): 봉인 속 크리에이터가 주소 칸의 크리에이터와 다르면 주소를 쓰지 않고, 거부 줄을 남기고, 출력 단계를 넘기지 않는다", async () => {
    const { db, calls, logs } = fakeDb(goodContext(), await openedClaim(1, DALBIT));
    const res = await printCreatorLabel(deps(db), ask);
    expect(res).toEqual({ kind: "denied", reason: "address_mismatch" });
    expect(JSON.stringify(res)).not.toContain(fields.address1);
    expect(logs).toEqual([{ order_id: ORDER_ID, requester_id: OWNER, result: "denied", deny_reason: "address_mismatch" }]);
    expect(fnNames(calls)).not.toContain("invoice_finish_print");
  });

  it("주소가 등록되지 않았으면 열 것이 없다고 답하고 출력하지 않는다", async () => {
    const { db, calls } = fakeDb(goodContext(), { result: "no_address" });
    expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "no_address" });
    expect(fnNames(calls)).not.toContain("invoice_finish_print");
  });

  it("역조공 상자·없는 QR 은 이 함수가 다루지 않는다", async () => {
    const share = fakeDb({ kind: "share" }, null);
    expect(await printCreatorLabel(deps(share.db), ask)).toEqual({ kind: "not_gift" });
    expect(fnNames(share.calls)).toEqual(["invoice_print_context"]);
    const none = fakeDb(null, null);
    expect(await printCreatorLabel(deps(none.db), ask)).toEqual({ kind: "not_found" });
  });
});
