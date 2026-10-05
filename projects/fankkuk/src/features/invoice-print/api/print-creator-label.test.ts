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
const BOX_ID = "22222222-2222-4222-8222-222222222222";
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
    box_id: BOX_ID,
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

const LOG_ID = 4242;

/** logId 를 null 로 주면 「연 줄」의 id 를 돌려주지 않는 옛 DB 함수(manual/0010 적용 전)의 응답이다. */
async function openedClaim(printNo = 1, sealedFor = HARU, logId: number | null = LOG_ID): Promise<Claim> {
  const envelope = await sealEnvelope(creatorAddressPlaintext({ creatorId: sealedFor, ...fields }), keys.publicKey);
  const claim: Record<string, unknown> = { result: "opened", print_no: printNo, order_id: ORDER_ID, creator_id: HARU, envelope };
  if (logId !== null) claim.log_id = logId;
  return claim;
}

type Finish = { waybill: string; first: boolean } | string;

type Reply = { data: unknown; error: { code: string; message: string } | null };

function fakeDb(
  context: Context | null,
  claim: Claim,
  finish: Finish | Reply = { waybill: NEW_WAYBILL, first: true },
  release: Reply = { data: { result: "released" }, error: null },
) {
  const calls: { fn: string; args: unknown }[] = [];
  const logs: Record<string, unknown>[] = [];
  const isReply = (v: Finish | Reply): v is Reply => typeof v === "object" && "error" in v;
  const db = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (fn === "invoice_print_context") return { data: context, error: null };
      if (fn === "invoice_claim_print") return { data: claim, error: null };
      if (fn === "invoice_finish_print") return isReply(finish) ? finish : { data: finish, error: null };
      if (fn === "invoice_release_print") return release;
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

  it("INV-P5 (S5d): 2회째 출력은 재출력 표시, 송장번호는 DB 가 돌려준 처음 번호 — 새 번호는 받지 않는다", async () => {
    const { db, calls } = fakeDb(
      goodContext({ decrypt_count: 1, parcel_state: "label_printed", order_status: "label_printed" }),
      await openedClaim(2),
      { waybill: OLD_WAYBILL, first: false },
    );
    let issued = 0;
    const res = await printCreatorLabel(deps(db, { newWaybill: () => (issued++, NEW_WAYBILL) }), ask);
    expect(res).toEqual({ kind: "printed", waybill: OLD_WAYBILL, reprint: true, label: fields });
    expect(issued).toBe(0);
    expect(calls[2]?.args).toEqual({ p_qr: QR, p_waybill: null });
  });

  it("INV-P5: 재출력 표시는 출력 순번이 아니라 이 출력이 상자의 첫 송장인지로 정한다 — 앞선 시도가 송장 없이 끝났으면 2번째 열기도 첫 출력", async () => {
    const { db } = fakeDb(goodContext({ decrypt_count: 1 }), await openedClaim(2), { waybill: NEW_WAYBILL, first: true });
    expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: fields });
  });

  it("INV-P5 (실패경로): 송장 마무리 응답을 읽지 못하면 실패로 끝난다", async () => {
    const { db } = fakeDb(goodContext(), await openedClaim(1), NEW_WAYBILL);
    expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "failed" });
  });

  it("INV-P7 (실패경로): 거부 줄을 남기지 못하면 「거부」로 끝내지 않고 실패한다 — 기록 없는 거부를 만들지 않는다", async () => {
    const { db } = fakeDb(goodContext({ decrypt_count: 3 }), null);
    const failingInsert = { ...db, from: () => ({ insert: async () => ({ error: { code: "42501", message: "거부" } }) }) };
    await expect(printCreatorLabel(deps(failingInsert as unknown as CreatorLabelDeps["db"]), ask)).rejects.toThrow("열람 기록");
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
    expect(logs).toEqual([{ order_id: ORDER_ID, box_id: BOX_ID, requester_id: STAFF, result: "denied", deny_reason: "not_owner" }]);
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
      expect(logs).toEqual([{ order_id: ORDER_ID, box_id: BOX_ID, requester_id: OWNER, result: "denied", deny_reason: reason }]);
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
    expect(logs).toEqual([{ order_id: ORDER_ID, box_id: BOX_ID, requester_id: OWNER, result: "denied", deny_reason: "address_mismatch" }]);
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

describe("송장 출력 — 송장이 안 나온 시도 돌려주기 (INV-P15)", () => {
  const releaseCall = { fn: "invoice_release_print", args: { p_log_id: LOG_ID, p_requester: OWNER } };
  const finishFailed: Reply = { data: null, error: { code: "22023", message: "송장번호는 숫자 10~14자리다" } };

  it("INV-P15 (S15): 주소를 연 뒤 송장 마무리가 실패하면 그 「연 줄」을 돌려주고 실패로 끝난다", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedClaim(1), finishFailed);
    expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "failed" });
    expect(calls.at(-1)).toEqual(releaseCall);
    expect(fnNames(calls)).toEqual(["invoice_print_context", "invoice_claim_print", "invoice_finish_print", "invoice_release_print"]);
  });

  it("INV-P15 (S15): 송장 마무리 응답을 읽지 못해도 돌려준다(상자가 이미 넘어갔으면 DB 가 거부한다)", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedClaim(1), NEW_WAYBILL);
    expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "failed" });
    expect(calls.at(-1)).toEqual(releaseCall);
  });

  it("INV-P15 (S15): 봉투 꼴이 깨져 있으면 돌려주고, 키를 풀지 않는다", async () => {
    const claim = { result: "opened", print_no: 1, creator_id: HARU, envelope: { broken: true }, log_id: LOG_ID };
    const { db, calls } = fakeDb(goodContext(), claim);
    const u = countingUnwrapper();
    expect(await printCreatorLabel(deps(db, { unwrapper: u.unwrapper }), ask)).toEqual({ kind: "failed" });
    expect(u.count()).toBe(0);
    expect(fnNames(calls)).not.toContain("invoice_finish_print");
    expect(calls.at(-1)).toEqual(releaseCall);
  });

  it("INV-P15 (S15): 키를 풀지 못하면 돌려주고 출력 단계를 넘기지 않는다", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedClaim(1));
    const broken: KeyUnwrapper = { unwrap: async () => Promise.reject(new Error("키 서버 응답 없음")) };
    expect(await printCreatorLabel(deps(db, { unwrapper: broken }), ask)).toEqual({ kind: "failed" });
    expect(fnNames(calls)).not.toContain("invoice_finish_print");
    expect(calls.at(-1)).toEqual(releaseCall);
  });

  it("INV-P15 (S15): 봉투를 열지 못하면(다른 키로 봉인됨) 돌려준다", async () => {
    const other = await keyPair();
    const { db, calls } = fakeDb(goodContext(), await openedClaim(1));
    const wrongKey = createDevKeyUnwrapper({ privateKeyPem: other.privatePem, env: { NODE_ENV: "development" } });
    expect(await printCreatorLabel(deps(db, { unwrapper: wrongKey }), ask)).toEqual({ kind: "failed" });
    expect(calls.at(-1)).toEqual(releaseCall);
  });

  it("INV-P15 (실패경로): 봉인 속 크리에이터가 다르면(INV-P14) 실패가 아니라 거부다 — 돌려주지 않는다", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedClaim(1, DALBIT));
    expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "denied", reason: "address_mismatch" });
    expect(fnNames(calls)).not.toContain("invoice_release_print");
  });

  it("INV-P15 (실패경로): 송장이 나오면 돌려주지 않는다", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedClaim(1));
    expect((await printCreatorLabel(deps(db), ask)).kind).toBe("printed");
    expect(fnNames(calls)).not.toContain("invoice_release_print");
  });

  it("INV-P15: DB 가 「연 줄」 id 를 주지 않으면(옛 DB 함수) 돌려주기를 건너뛰고 지금처럼 실패로 끝난다", async () => {
    const { db, calls } = fakeDb(goodContext(), await openedClaim(1, HARU, null), finishFailed);
    expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "failed" });
    expect(fnNames(calls)).not.toContain("invoice_release_print");
  });

  it("INV-P15: 돌려주기가 거부되거나 오류여도 결과는 실패 그대로다 — 던지지 않는다", async () => {
    for (const release of [
      { data: { result: "denied", reason: "not_inspected" }, error: null },
      { data: null, error: { code: "42501", message: "거부" } },
    ] satisfies Reply[]) {
      const { db, calls } = fakeDb(goodContext(), await openedClaim(1), finishFailed, release);
      expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "failed" });
      expect(calls.at(-1)).toEqual(releaseCall);
    }
  });

  it("INV-P15: 「연 줄」 id 가 정수가 아니면 응답을 받지 않는다(돌려주기를 엉뚱한 줄로 부르지 않는다)", async () => {
    const claim = { ...(await openedClaim(1)), log_id: "4242; drop" };
    const { db, calls } = fakeDb(goodContext(), claim);
    expect(await printCreatorLabel(deps(db), ask)).toEqual({ kind: "failed" });
    expect(fnNames(calls)).not.toContain("invoice_release_print");
  });
});
