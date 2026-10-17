// @vitest-environment node
import { describe, expect, it } from "vitest";
import { creatorAddressPlaintext } from "@/entities/address/model/creator-address-plaintext";
import { fanAddressPlaintext } from "@/entities/address/model/fan-address-plaintext";
import { createDevKeyUnwrapper, type KeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { importSealingPublicKey, sealEnvelope } from "@/shared/lib/envelope/envelope";
import { printReturnLabel, type ReturnLabelDeps } from "./print-return-label";

// 반송 송장 출력 함수 — 보낸 사람이 확인한 등록 주소(상자 복사본)를 여는 서버 코드(address-protection INV-P18, office-workflow INV-W8·W15).
// DB 는 가짜로 두고, 판정·봉투 열기·봉인 속 계정 대조는 진짜 코드를 지난다.

const OWNER = "00000000-0000-4000-a000-000000000021";
const STAFF = "00000000-0000-4000-a000-000000000022";
const FAN = "00000000-0000-4000-a000-000000000001";
const OTHER_FAN = "00000000-0000-4000-a000-000000000002";
const CREATOR_PROFILE = "00000000-0000-4000-a000-000000000011";
const CREATOR_ID = "00000000-0000-4000-b000-000000000001";
const OTHER_CREATOR_ID = "00000000-0000-4000-b000-000000000002";
const PARCEL_ID = "44444444-4444-4444-8444-444444444444";
const ORDER_NO = "FC-7K3M9";
const QR = "Q-000789";
const NEW_WAYBILL = "555566667777";
const OLD_WAYBILL = "111122223333";
const LOG_ID = 901;
// 봉투를 내준 순간 상자에 적혀 있던 확인 시각 — 마무리가 잠근 자리에서 이 값과 비교한다(INV-W15 · P18, 출력 사이 재확인)
const CONFIRMED_AT = "2026-10-17T03:04:05.123456+00:00";

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

type Context = Record<string, unknown>;

function linkedContext(patch: Context = {}): Context {
  return {
    kind: "linked",
    parcel_id: PARCEL_ID,
    order_no: ORDER_NO,
    parcel_state: "return_waiting",
    confirmed: true,
    decrypt_count: 0,
    ...patch,
  };
}

async function fanClaim(sealedAccount = FAN, patch: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const envelope = await sealEnvelope(fanAddressPlaintext({ accountId: sealedAccount, ...fields }), keys.publicKey);
  return { result: "opened", print_no: 1, log_id: LOG_ID, order_no: ORDER_NO, sender_id: FAN, sender_creator_id: null, confirmed_at: CONFIRMED_AT, envelope, ...patch };
}

async function creatorClaim(sealedCreator = CREATOR_ID): Promise<Record<string, unknown>> {
  const envelope = await sealEnvelope(creatorAddressPlaintext({ creatorId: sealedCreator, ...fields }), keys.publicKey);
  return { result: "opened", print_no: 1, log_id: LOG_ID, order_no: "RG-AAA111", sender_id: CREATOR_PROFILE, sender_creator_id: CREATOR_ID, confirmed_at: CONFIRMED_AT, envelope };
}

type Reply = { data: unknown; error: { code: string; message: string } | null };
const ok = (data: unknown): Reply => ({ data, error: null });

function fakeDb(context: Context | null, claim: unknown, finish: Reply = ok({ waybill: NEW_WAYBILL, first: true })) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (fn === "return_print_context") return ok(context);
      if (fn === "return_claim_print") return ok(claim);
      if (fn === "return_finish_print") return finish;
      if (fn === "return_release_print") return ok({ result: "released" });
      return { data: null, error: { code: "42883", message: "없는 함수" } };
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        calls.push({ fn: `insert:${table}`, args: row });
        return { error: null };
      },
    }),
  };
  return { db: db as unknown as ReturnLabelDeps["db"], calls };
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

function deps(db: ReturnLabelDeps["db"], over: Partial<ReturnLabelDeps> = {}): ReturnLabelDeps {
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

describe("반송 송장 출력 — 확인한 등록 주소 열기 (address-protection INV-P18)", () => {
  it("INV-P18 (S18): 확인한 반송 대기 상자면 복사본을 열어 라벨 다섯 칸만 돌려주고, 새 송장번호로 반송 송장 출력 단계를 넘긴다", async () => {
    const { db, calls } = fakeDb(linkedContext(), await fanClaim());
    expect(await printReturnLabel(deps(db), ask)).toEqual({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: fields });
    expect(fnNames(calls)).toEqual(["return_print_context", "return_claim_print", "return_finish_print"]);
    expect(calls[1]?.args).toEqual({ p_qr: QR, p_requester: OWNER });
    expect(calls[2]?.args).toEqual({ p_qr: QR, p_waybill: NEW_WAYBILL, p_confirmed_at: CONFIRMED_AT });
  });

  it("INV-P18: 역조공 몫 상자는 보낸 크리에이터의 등록 주소 — 봉인 속 크리에이터가 보낸 크리에이터와 같으면 연다", async () => {
    const { db } = fakeDb(linkedContext({ order_no: "RG-AAA111" }), await creatorClaim());
    expect(await printReturnLabel(deps(db), ask)).toEqual({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: fields });
  });

  it("INV-P18: 이미 반송 송장이 나온 상자는 새 송장번호 없이 마무리를 불러 처음 번호로 재출력한다", async () => {
    const { db, calls } = fakeDb(linkedContext({ parcel_state: "return_printed", decrypt_count: 1 }), await fanClaim(), ok({ waybill: OLD_WAYBILL, first: false }));
    expect(await printReturnLabel(deps(db), ask)).toEqual({ kind: "printed", waybill: OLD_WAYBILL, reprint: true, label: fields });
    expect(calls[2]?.args).toEqual({ p_qr: QR, p_waybill: null, p_confirmed_at: CONFIRMED_AT });
  });

  it("INV-P18 (S18b, 실패경로): 대표 아님·확인 전·반송 대기 아님·상한이면 봉투를 부르지 않고 거부 줄 하나만 남긴다 — 갈래마다", async () => {
    const cases: [Context, string, string][] = [
      [linkedContext(), "staff-token", "not_owner"],
      [linkedContext({ confirmed: false }), "owner-token", "no_valid_approval"],
      [linkedContext({ parcel_state: "returned" }), "owner-token", "order_not_printable"],
      [linkedContext({ parcel_state: "dispose_due" }), "owner-token", "order_not_printable"],
      [linkedContext({ parcel_state: "inspected" }), "owner-token", "order_not_printable"],
      [linkedContext({ decrypt_count: 3 }), "owner-token", "decrypt_limit_reached"],
    ];
    for (const [ctx, token, reason] of cases) {
      const { db, calls } = fakeDb(ctx, await fanClaim());
      const counter = countingUnwrapper();
      expect([reason, await printReturnLabel(deps(db, { unwrapper: counter.unwrapper }), { qr: QR, accessToken: token })]).toEqual([reason, { kind: "denied", reason }]);
      expect(fnNames(calls)).toEqual(["return_print_context", "insert:return_decrypt_log"]);
      expect(calls[1]?.args).toMatchObject({ parcel_id: PARCEL_ID, result: "denied", deny_reason: reason });
      expect(counter.count()).toBe(0);
    }
  });

  it("INV-P18 (S18c, 실패경로): 봉인 속 계정이 상자 주문을 보낸 계정과 다르면 쓰지 않는다 — 연 줄을 돌려받고 거부 줄, 출력 단계로 넘기지 않는다", async () => {
    const { db, calls } = fakeDb(linkedContext(), await fanClaim(OTHER_FAN));
    expect(await printReturnLabel(deps(db), ask)).toEqual({ kind: "denied", reason: "address_mismatch" });
    expect(fnNames(calls)).toEqual(["return_print_context", "return_claim_print", "return_release_print", "insert:return_decrypt_log"]);
    expect(calls[2]?.args).toEqual({ p_log_id: LOG_ID, p_requester: OWNER });
  });

  it("INV-P18 (S18c, 실패경로): 크리에이터 봉인인데 봉인 속 크리에이터가 다르거나 보낸 사람이 크리에이터가 아니면 쓰지 않는다", async () => {
    const other = fakeDb(linkedContext(), await creatorClaim(OTHER_CREATOR_ID));
    expect(await printReturnLabel(deps(other.db), ask)).toEqual({ kind: "denied", reason: "address_mismatch" });
    const notCreator = await creatorClaim();
    const fan = fakeDb(linkedContext(), { ...notCreator, sender_id: FAN, sender_creator_id: null });
    expect(await printReturnLabel(deps(fan.db), ask)).toEqual({ kind: "denied", reason: "address_mismatch" });
    // 팬 봉인인데 보낸 사람이 크리에이터면(계정 칸은 크리에이터 프로필) 그 계정과 대조한다 — 같은 계정이 아니면 거부
    const fanSealForCreator = fakeDb(linkedContext(), await fanClaim(FAN, { sender_id: CREATOR_PROFILE, sender_creator_id: CREATOR_ID }));
    expect(await printReturnLabel(deps(fanSealForCreator.db), ask)).toEqual({ kind: "denied", reason: "address_mismatch" });
  });

  it("INV-W15 · P18 (실패경로): 봉투를 연 뒤 보낸 사람이 다른 주소로 다시 확인해 마무리가 거부하면 연 줄을 돌려받고 실패 — 먼저 연 주소로 출력하지 않는다", async () => {
    const { db, calls } = fakeDb(linkedContext(), await fanClaim(), { data: null, error: { code: "P0041", message: "확인이 바뀜" } });
    expect(await printReturnLabel(deps(db), ask)).toEqual({ kind: "failed" });
    expect(fnNames(calls)).toEqual(["return_print_context", "return_claim_print", "return_finish_print", "return_release_print"]);
    expect(calls[2]?.args).toEqual({ p_qr: QR, p_waybill: NEW_WAYBILL, p_confirmed_at: CONFIRMED_AT });
    expect(calls[3]?.args).toEqual({ p_log_id: LOG_ID, p_requester: OWNER });
  });

  it("INV-W15 · P18 (실패경로): 봉투를 내준 답에 확인 시각이 없으면(DB 가 옛 함수) 출력 단계로 넘기지 않고 연 줄을 돌려받는다", async () => {
    const claim = await fanClaim();
    delete claim.confirmed_at;
    const { db, calls } = fakeDb(linkedContext(), claim);
    expect(await printReturnLabel(deps(db), ask)).toEqual({ kind: "failed" });
    expect(fnNames(calls)).toEqual(["return_print_context", "return_claim_print", "return_release_print"]);
  });

  it("INV-W15 (S15f): 어느 주문에도 이어지지 않은 상자는 이 함수가 열지 않는다 — not_linked 로 돌려보내 봉투 번호 길로 간다", async () => {
    const { db, calls } = fakeDb({ kind: "unlinked" }, null);
    expect(await printReturnLabel(deps(db), ask)).toEqual({ kind: "not_linked" });
    expect(fnNames(calls)).toEqual(["return_print_context"]);
  });

  it("INV-P18 (실패경로): DB 가 잠근 자리에서 거부하면 그대로 거부, 봉투를 열지 않는다", async () => {
    const { db, calls } = fakeDb(linkedContext(), { result: "denied", reason: "decrypt_limit_reached" });
    expect(await printReturnLabel(deps(db), ask)).toEqual({ kind: "denied", reason: "decrypt_limit_reached" });
    expect(fnNames(calls)).toEqual(["return_print_context", "return_claim_print"]);
  });

  it("INV-P18 (실패경로): 로그인 토큰을 못 믿으면 DB 도 부르지 않는다 · 없는 QR 은 not_found · 마무리가 실패하면 연 줄을 돌려받고 실패", async () => {
    const a = fakeDb(linkedContext(), await fanClaim());
    expect(await printReturnLabel(deps(a.db), { qr: QR, accessToken: "" })).toEqual({ kind: "unauthenticated" });
    expect(await printReturnLabel(deps(a.db), { qr: QR, accessToken: "bad" })).toEqual({ kind: "unauthenticated" });
    expect(a.calls).toEqual([]);
    const b = fakeDb(null, null);
    expect(await printReturnLabel(deps(b.db), ask)).toEqual({ kind: "not_found" });
    const c = fakeDb(linkedContext(), await fanClaim(), { data: null, error: { code: "P0041", message: "확인 전" } });
    expect(await printReturnLabel(deps(c.db), ask)).toEqual({ kind: "failed" });
    expect(fnNames(c.calls)).toEqual(["return_print_context", "return_claim_print", "return_finish_print", "return_release_print"]);
  });
});
