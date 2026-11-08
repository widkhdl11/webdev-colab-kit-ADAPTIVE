// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fanAddressPlaintext } from "@/entities/address/model/fan-address-plaintext";
import { createDevKeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { importSealingPublicKey, sealEnvelope } from "@/shared/lib/envelope/envelope";
import { printBoxLabel, type BoxLabelDeps } from "./print-box-label";

// 선물함 송장 출력 함수(신청 한 줄의 팬 주소를 여는 서버 코드)의 순서 — revgift-box INV-GB20 · GB17.
// DB 는 가짜로 두고, 대표 판정·봉투 열기·계정 대조·운송장 번호·할증 재판정은 진짜 코드를 지난다.

const OWNER = "00000000-0000-4000-a000-000000000021";
const STAFF = "00000000-0000-4000-a000-000000000022";
const FAN = "00000000-0000-4000-a000-000000000001";
const OTHER_FAN = "00000000-0000-4000-a000-000000000002";
const LABEL = "GB00000012";
const LOG_ID = 99;
const NEW_WAYBILL = "555566667777";
const fields = { recipientName: "별빛", phone: "01012345678", zipCode: "04001", address1: "서울시 마포구 시험로 1", address2: "" };

const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, [
  "encrypt",
  "decrypt",
]);
const pem = (label: string, der: ArrayBuffer) => `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...new Uint8Array(der)))}\n-----END ${label}-----`;
const publicKey = await importSealingPublicKey(pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey)));
const privatePem = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey));

type Reply = { data: unknown; error: { code: string; message: string } | null };
const ok = (data: unknown): Reply => ({ data, error: null });

async function opened(o: { sealedFor?: string; zipCode?: string; printed?: boolean } = {}) {
  const envelope = await sealEnvelope(fanAddressPlaintext({ accountId: o.sealedFor ?? FAN, ...fields, zipCode: o.zipCode ?? fields.zipCode }), publicKey);
  return { result: "opened", print_no: 1, log_id: LOG_ID, label: LABEL, fan_id: FAN, printed: o.printed ?? false, envelope };
}

function fakeDb(claim: unknown, finish: Reply = ok({ waybill: NEW_WAYBILL, first: true })) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "revgift_box_claim_print") return ok(claim);
      if (fn === "revgift_box_finish_print") return finish;
      if (fn === "revgift_box_release_print") return ok({ result: "released" });
      if (fn === "revgift_box_log_denied") return ok(null);
      if (fn === "revgift_box_report_region") return ok(false);
      return { data: null, error: { code: "42883", message: "없는 함수" } };
    },
  };
  return { db: db as unknown as BoxLabelDeps["db"], calls };
}

function deps(db: BoxLabelDeps["db"], over: Partial<BoxLabelDeps> = {}): BoxLabelDeps {
  let waybills = 0;
  return {
    db,
    verifyRequester: async (t) => (t === "owner-token" ? OWNER : t === "staff-token" ? STAFF : null),
    ownerUserId: OWNER,
    unwrapper: createDevKeyUnwrapper({ privateKeyPem: privatePem, env: { NODE_ENV: "development" } }),
    newWaybill: () => (waybills++, NEW_WAYBILL),
    ...over,
  };
}
const ask = { qr: LABEL, accessToken: "owner-token" };
const names = (calls: { fn: string }[]) => calls.map((c) => c.fn);

describe("INV-GB20: 선물함 송장 출력 순서", () => {
  it("INV-GB20 S20: 대표 — 봉인을 받아 열고, 송장 출력함으로 넘긴 뒤 라벨 다섯 칸만 돌려준다", async () => {
    const f = fakeDb(await opened());
    expect(await printBoxLabel(deps(f.db), ask)).toEqual({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: fields });
    expect(names(f.calls)).toEqual(["revgift_box_claim_print", "revgift_box_finish_print", "revgift_box_report_region"]);
    expect(f.calls[1]!.args).toEqual({ p_label: LABEL, p_waybill: NEW_WAYBILL });
  });

  it("INV-GB20 S20b (실패경로): 직원 — 봉인을 받기 전에 「대표 아님」 거부 줄만 남긴다", async () => {
    const f = fakeDb(await opened());
    expect(await printBoxLabel(deps(f.db), { ...ask, accessToken: "staff-token" })).toEqual({ kind: "denied", reason: "not_owner" });
    expect(f.calls).toEqual([{ fn: "revgift_box_log_denied", args: { p_label: LABEL, p_requester: STAFF, p_reason: "not_owner" } }]);
  });

  it("INV-GB20 (실패경로): 로그인 토큰을 믿지 못하면 DB 를 부르지 않는다 · 신청 번호 꼴이 아니면 없음", async () => {
    const f = fakeDb(await opened());
    expect(await printBoxLabel(deps(f.db), { ...ask, accessToken: "bad" })).toEqual({ kind: "unauthenticated" });
    expect(await printBoxLabel(deps(f.db), { qr: "Q-000001", accessToken: "owner-token" })).toEqual({ kind: "not_found" });
    expect(f.calls).toEqual([]);
  });

  it("INV-GB20 S20b (실패경로): 봉인 속 계정이 신청의 팬과 다르면 쓰지 않는다 — 연 줄을 돌려받고 거부 줄, 송장 출력함으로 넘기지 않는다", async () => {
    const f = fakeDb(await opened({ sealedFor: OTHER_FAN }));
    expect(await printBoxLabel(deps(f.db), ask)).toEqual({ kind: "denied", reason: "order_mismatch" });
    expect(names(f.calls)).toEqual(["revgift_box_claim_print", "revgift_box_release_print", "revgift_box_log_denied"]);
  });

  it("INV-GB20: DB 가 거부하면(결제 전·횟수 다 씀) 그대로 거부, 봉투를 열지 않는다", async () => {
    const f = fakeDb({ result: "denied", reason: "decrypt_limit_reached" });
    expect(await printBoxLabel(deps(f.db), ask)).toEqual({ kind: "denied", reason: "decrypt_limit_reached" });
    expect(names(f.calls)).toEqual(["revgift_box_claim_print"]);
  });

  it("INV-GB20 (실패경로): 열었는데 출력 마무리가 실패하면 연 줄을 돌려받고 실패", async () => {
    const f = fakeDb(await opened(), { data: null, error: { code: "55000", message: "x" } });
    expect(await printBoxLabel(deps(f.db), ask)).toEqual({ kind: "failed" });
    expect(names(f.calls)).toEqual(["revgift_box_claim_print", "revgift_box_finish_print", "revgift_box_release_print"]);
  });

  it("INV-GB20: 다시 출력(이미 송장 출력한 신청)에는 새 운송장 번호를 받지 않는다 — 처음 번호", async () => {
    let asked = 0;
    const f = fakeDb(await opened({ printed: true }), ok({ waybill: "111122223333", first: false }));
    const r = await printBoxLabel(deps(f.db, { newWaybill: () => (asked++, NEW_WAYBILL) }), ask);
    expect(r).toEqual({ kind: "printed", waybill: "111122223333", reprint: true, label: fields });
    expect(asked).toBe(0);
    expect(f.calls[1]!.args).toEqual({ p_label: LABEL, p_waybill: null });
  });

  it("INV-GB17 · INV-P20 ③: 연 우편번호로 다시 정한 구분만 DB 에 넘긴다(제주) — 우편번호·주소는 넘기지 않는다", async () => {
    const f = fakeDb(await opened({ zipCode: "63100" }));
    expect((await printBoxLabel(deps(f.db), ask)).kind).toBe("printed");
    expect(f.calls.find((c) => c.fn === "revgift_box_report_region")!.args).toEqual({ p_label: LABEL, p_opened_region: "jeju" });
  });
});
